import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises generateDraftActions' concurrency cap and rate-limit retry
 * end-to-end, with the actual Gemini SDK client mocked out (no network
 * calls, no API key required).
 */

const generateContent = vi.fn();

vi.mock("@/lib/gemini", () => ({
  isGeminiConfigured: () => true,
  getGeminiClient: () => ({ models: { generateContent } }),
  GEMINI_MODEL: "gemini-2.5-flash-test",
}));

function rateLimitError(message = "429 Too Many Requests") {
  return Object.assign(new Error(message), { name: "ApiError", status: 429 });
}

function draftResponse(count: number) {
  return {
    text: JSON.stringify({
      actions: Array.from({ length: count }, (_, i) => ({
        title: `Title ${i}`,
        how: `How ${i}`,
        why: `Why ${i}`,
        timeEstimate: "5 mins",
      })),
    }),
  };
}

describe("generateDraftActions: Gemini concurrency + rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContent.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("caps concurrent Gemini calls at GEMINI_MAX_CONCURRENCY", async () => {
    vi.stubEnv("GEMINI_MAX_CONCURRENCY", "2");
    const { generateDraftActions } = await import("@/lib/personal-action-generation");

    let concurrent = 0;
    let peak = 0;
    generateContent.mockImplementation(async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 20));
      concurrent -= 1;
      return draftResponse(1);
    });

    const calls = Array.from({ length: 5 }, () =>
      generateDraftActions({
        trainingContent: "",
        userNotes: "",
        businessContext: "",
        focusThemes: [],
        count: 1,
      })
    );
    const results = await Promise.all(calls);

    expect(results.every((r) => !r.error && r.drafts?.length === 1)).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    expect(generateContent).toHaveBeenCalledTimes(5);
  });

  it("transparently retries a 429 and still returns drafts", async () => {
    vi.stubEnv("GEMINI_MAX_RETRIES", "3");
    vi.stubEnv("GEMINI_RETRY_BASE_MS", "1");
    const { generateDraftActions } = await import("@/lib/personal-action-generation");

    let attempts = 0;
    generateContent.mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) throw rateLimitError();
      return draftResponse(2);
    });

    const result = await generateDraftActions({
      trainingContent: "",
      userNotes: "",
      businessContext: "",
      focusThemes: [],
      count: 2,
    });

    expect(result.error).toBeUndefined();
    expect(result.drafts).toHaveLength(2);
    expect(attempts).toBe(3);
  });

  it("surfaces a clear error once retries are exhausted on a persistent 429", async () => {
    vi.stubEnv("GEMINI_MAX_RETRIES", "1");
    vi.stubEnv("GEMINI_RETRY_BASE_MS", "1");
    const { generateDraftActions } = await import("@/lib/personal-action-generation");

    generateContent.mockImplementation(async () => {
      throw rateLimitError();
    });

    const result = await generateDraftActions({
      trainingContent: "",
      userNotes: "",
      businessContext: "",
      focusThemes: [],
      count: 2,
    });

    expect(result.drafts).toBeUndefined();
    expect(result.error).toMatch(/rate-limited/i);
    expect(generateContent).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("does not retry a non-rate-limit failure", async () => {
    const { generateDraftActions } = await import("@/lib/personal-action-generation");

    generateContent.mockImplementation(async () => {
      throw new Error("Invalid API key");
    });

    const result = await generateDraftActions({
      trainingContent: "",
      userNotes: "",
      businessContext: "",
      focusThemes: [],
      count: 2,
    });

    expect(result.error).toBe("Invalid API key");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
