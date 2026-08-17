import { describe, expect, it, vi } from "vitest";
import { GeminiSemaphore, createLimitedGeminiCaller, isRateLimitError } from "@/lib/gemini-limiter";

/** A Gemini-shaped rate-limit error, matching what @google/genai's ApiError looks like. */
function rateLimitError(message = "429 Too Many Requests") {
  return Object.assign(new Error(message), { name: "ApiError", status: 429 });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("isRateLimitError", () => {
  it("recognizes a numeric 429 status", () => {
    expect(isRateLimitError({ status: 429, message: "boom" })).toBe(true);
  });

  it("recognizes RESOURCE_EXHAUSTED in the message", () => {
    expect(isRateLimitError(new Error("8 RESOURCE_EXHAUSTED: quota exceeded"))).toBe(true);
  });

  it("recognizes 'rate limit' phrasing in the message", () => {
    expect(isRateLimitError(new Error("You have hit the rate limit for this model"))).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isRateLimitError(new Error("Invalid API key"))).toBe(false);
    expect(isRateLimitError({ status: 500, message: "internal error" })).toBe(false);
  });

  it("rejects non-object / nullish values", () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError("429")).toBe(false);
  });
});

describe("GeminiSemaphore + createLimitedGeminiCaller: concurrency cap", () => {
  it("never runs more than `capacity` calls at once", async () => {
    const capacity = 2;
    const semaphore = new GeminiSemaphore(capacity);
    const call = createLimitedGeminiCaller(semaphore);

    let concurrent = 0;
    let peak = 0;
    const task = () =>
      call(async () => {
        concurrent += 1;
        peak = Math.max(peak, concurrent);
        await sleep(20);
        concurrent -= 1;
        return "ok";
      });

    const results = await Promise.all(Array.from({ length: 6 }, task));

    expect(results).toEqual(Array(6).fill("ok"));
    expect(peak).toBeLessThanOrEqual(capacity);
    expect(peak).toBe(capacity); // with 6 queued tasks and capacity 2, it should actually saturate
  });

  it("runs calls fully serially when capacity is 1", async () => {
    const semaphore = new GeminiSemaphore(1);
    const call = createLimitedGeminiCaller(semaphore);
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3].map((n) =>
        call(async () => {
          order.push(n);
          await sleep(5);
        })
      )
    );

    // Started in submission order, one at a time.
    expect(order).toEqual([1, 2, 3]);
  });

  it("exposes inFlight for observability", async () => {
    const semaphore = new GeminiSemaphore(3);
    expect(semaphore.inFlight).toBe(0);
    const release = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(1);
    release();
    expect(semaphore.inFlight).toBe(0);
  });

  it("releases the slot even when the wrapped call throws a non-retryable error", async () => {
    const semaphore = new GeminiSemaphore(1);
    const call = createLimitedGeminiCaller(semaphore);

    await expect(call(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(semaphore.inFlight).toBe(0);

    // A slot should be immediately available for the next call.
    const result = await call(async () => "recovered");
    expect(result).toBe("recovered");
  });
});

describe("createLimitedGeminiCaller: rate-limit retry with backoff", () => {
  it("retries a 429 and succeeds once the caller stops failing", async () => {
    const semaphore = new GeminiSemaphore(5);
    const call = createLimitedGeminiCaller(semaphore);

    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw rateLimitError();
      return "success";
    });

    const result = await call(fn, { maxRetries: 5, baseDelayMs: 1 });

    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("gives up and throws once maxRetries is exhausted", async () => {
    const semaphore = new GeminiSemaphore(5);
    const call = createLimitedGeminiCaller(semaphore);

    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts += 1;
      throw rateLimitError();
    });

    await expect(call(fn, { maxRetries: 2, baseDelayMs: 1 })).rejects.toMatchObject({ status: 429 });
    expect(attempts).toBe(3); // initial attempt + 2 retries
  });

  it("does not retry a non-rate-limit error, even once", async () => {
    const semaphore = new GeminiSemaphore(5);
    const call = createLimitedGeminiCaller(semaphore);

    const fn = vi.fn(async () => {
      throw new Error("Invalid API key");
    });

    await expect(call(fn, { maxRetries: 5, baseDelayMs: 1 })).rejects.toThrow("Invalid API key");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backs off for longer on later attempts (exponential growth)", async () => {
    const semaphore = new GeminiSemaphore(5);
    const call = createLimitedGeminiCaller(semaphore);
    const timestamps: number[] = [];

    let attempts = 0;
    const fn = vi.fn(async () => {
      timestamps.push(Date.now());
      attempts += 1;
      if (attempts < 3) throw rateLimitError();
      return "ok";
    });

    await call(fn, { maxRetries: 5, baseDelayMs: 20 });

    const firstGap = timestamps[1] - timestamps[0];
    const secondGap = timestamps[2] - timestamps[1];
    // baseDelayMs * 2^attempt (+ jitter up to baseDelayMs), so the second
    // gap's floor (40ms) should exceed the first gap's ceiling (40ms) is too
    // tight with jitter; assert the general growth trend instead.
    expect(firstGap).toBeGreaterThanOrEqual(20);
    expect(secondGap).toBeGreaterThanOrEqual(40);
  });
});

describe("GeminiSemaphore + retry interaction", () => {
  it("frees its slot while backing off, so other queued calls can run in the meantime", async () => {
    const semaphore = new GeminiSemaphore(1);
    const call = createLimitedGeminiCaller(semaphore);
    const finishOrder: string[] = [];

    let flakyAttempts = 0;
    const flaky = call(
      async () => {
        flakyAttempts += 1;
        if (flakyAttempts === 1) throw rateLimitError();
        return "flaky-done";
      },
      { maxRetries: 3, baseDelayMs: 100 }
    ).then((v) => { finishOrder.push("flaky"); return v; });

    // Give the flaky call time to fail once and enter its (~100-200ms)
    // backoff sleep, then queue a second call behind the single-slot
    // semaphore. If the slot were held during backoff, this call could not
    // even start, let alone finish, before the flaky call.
    await sleep(5);
    const other = call(async () => "other-done").then((v) => { finishOrder.push("other"); return v; });

    const [flakyResult, otherResult] = await Promise.all([flaky, other]);

    expect(flakyResult).toBe("flaky-done");
    expect(otherResult).toBe("other-done");
    // Proves the slot was released during the flaky call's backoff wait,
    // instead of being held for its whole retry lifetime.
    expect(finishOrder).toEqual(["other", "flaky"]);
  });
});
