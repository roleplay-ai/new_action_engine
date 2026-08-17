/**
 * Concurrency cap and rate-limit retry handling for calls to the Gemini API.
 *
 * Plan generation can have many background batches in flight at once — one
 * per active user's generation job (see app/api/generate-actions-batch/route.ts),
 * plus ad-hoc single-action calls from generateOneMorePersonalAction. Without
 * a cap, a burst of concurrent jobs can exceed Gemini's per-project rate
 * limit and start failing with 429s. This module bounds how many Gemini
 * requests are in flight at once (process-wide) and retries 429s with
 * exponential backoff instead of failing the batch outright.
 */

/** Max Gemini requests allowed in flight at once across the process. Overridable via GEMINI_MAX_CONCURRENCY. */
export const GEMINI_MAX_CONCURRENCY = Math.max(1, Number(process.env.GEMINI_MAX_CONCURRENCY) || 3);

/** Max retry attempts for a rate-limited Gemini call before giving up. Overridable via GEMINI_MAX_RETRIES. */
export const GEMINI_MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES) || 3);

/** Base delay for exponential backoff between retries, in ms. Overridable via GEMINI_RETRY_BASE_MS. */
export const GEMINI_RETRY_BASE_MS = Math.max(1, Number(process.env.GEMINI_RETRY_BASE_MS) || 500);

/** True if `error` looks like a Gemini/HTTP 429 rate-limit response (the @google/genai SDK raises ApiError with a numeric `status`). */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  if (e.status === 429 || e.code === 429) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /\b429\b/.test(message) || /RESOURCE_EXHAUSTED/i.test(message) || /rate.?limit/i.test(message);
}

/** A small counting semaphore used to cap concurrent Gemini calls. */
export class GeminiSemaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    this.available = capacity;
  }

  /** Wait for a free slot, then return a release function. Always call the release function, even on error. */
  async acquire(): Promise<() => void> {
    if (this.available <= 0) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.available -= 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.available += 1;
      const next = this.waiters.shift();
      if (next) next();
    };
  }

  /** Calls currently running (holding a slot). Useful for asserting the cap in tests. */
  get inFlight(): number {
    return this.capacity - this.available;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type GeminiCallOptions = {
  /** Max retries after the first attempt. Defaults to GEMINI_MAX_RETRIES. */
  maxRetries?: number;
  /** Base backoff delay in ms. Defaults to GEMINI_RETRY_BASE_MS. */
  baseDelayMs?: number;
};

/**
 * Bind a Gemini caller to a given semaphore: running `fn` under its
 * concurrency cap, retrying with exponential backoff (plus jitter) on
 * rate-limit errors. The slot is released while waiting out a backoff so a
 * throttled call doesn't block other queued work from making progress.
 * Non-rate-limit errors are rethrown immediately, without retrying.
 */
export function createLimitedGeminiCaller(semaphore: GeminiSemaphore) {
  return async function callGeminiWithLimit<T>(fn: () => Promise<T>, options?: GeminiCallOptions): Promise<T> {
    const maxRetries = options?.maxRetries ?? GEMINI_MAX_RETRIES;
    const baseDelayMs = options?.baseDelayMs ?? GEMINI_RETRY_BASE_MS;

    for (let attempt = 0; ; attempt += 1) {
      const release = await semaphore.acquire();
      let outcome: { ok: true; value: T } | { ok: false; error: unknown };
      try {
        outcome = { ok: true, value: await fn() };
      } catch (error) {
        outcome = { ok: false, error };
      } finally {
        release();
      }

      if (outcome.ok) return outcome.value;
      if (!isRateLimitError(outcome.error) || attempt >= maxRetries) throw outcome.error;

      const backoff = baseDelayMs * 2 ** attempt + Math.random() * baseDelayMs;
      await sleep(backoff);
    }
  };
}

const defaultSemaphore = new GeminiSemaphore(GEMINI_MAX_CONCURRENCY);

/** Process-wide limited Gemini caller, capped at GEMINI_MAX_CONCURRENCY concurrent calls. */
export const callGeminiWithLimit = createLimitedGeminiCaller(defaultSemaphore);
