import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises matchActionsToResources with the Gemini SDK client mocked out
 * (no network calls, no API key required).
 */

const generateContent = vi.fn();

vi.mock("@/lib/gemini", () => ({
  isGeminiConfigured: () => true,
  getGeminiClient: () => ({ models: { generateContent } }),
  GEMINI_SURPRISE_MATCH_MODEL: "gemini-surprise-test",
}));

const actions = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, title: `Action ${i}`, how: `How ${i}` }));
const resources = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, title: `Resource ${i}`, description: `About skill ${i}` }));
const reply = (matches: { actionIndex: number; resourceIndex: number }[]) => ({ text: JSON.stringify({ matches }) });

describe("matchActionsToResources", () => {
  beforeEach(() => {
    vi.resetModules();
    generateContent.mockReset();
  });

  it("uses the model's picks", async () => {
    generateContent.mockResolvedValueOnce(reply([{ actionIndex: 1, resourceIndex: 3 }, { actionIndex: 2, resourceIndex: 1 }]));
    const { matchActionsToResources } = await import("../surprise-resource-matching");

    const result = await matchActionsToResources(actions(2), resources(3));

    expect(Object.fromEntries(result)).toEqual({ a0: "r2", a1: "r0" });
    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-surprise-test" }));
  });

  it("fills actions the model skipped with the least-used resource", async () => {
    generateContent.mockResolvedValueOnce(reply([{ actionIndex: 1, resourceIndex: 1 }]));
    const { matchActionsToResources } = await import("../surprise-resource-matching");

    const result = await matchActionsToResources(actions(2), resources(3));

    expect(result.get("a0")).toBe("r0");
    expect(result.get("a1")).toBe("r1");
  });

  it("still assigns every action when Gemini fails", async () => {
    generateContent.mockRejectedValue(new Error("boom"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { matchActionsToResources } = await import("../surprise-resource-matching");

    const result = await matchActionsToResources(actions(12), resources(30));

    expect(result.size).toBe(12);
    expect(new Set(result.values()).size).toBe(12);
    errors.mockRestore();
  });

  it("splits large plans and tells later calls what is already used", async () => {
    generateContent.mockImplementation(async () => reply([]));
    const { matchActionsToResources } = await import("../surprise-resource-matching");

    const result = await matchActionsToResources(actions(30), resources(40));

    expect(generateContent).toHaveBeenCalledTimes(2);
    const secondPrompt = generateContent.mock.calls[1][0].contents as string;
    expect(secondPrompt).toContain("[already given 1× in this plan]");
    expect(new Set(result.values()).size).toBe(30);
  });

  it("returns nothing without resources and makes no call", async () => {
    const { matchActionsToResources } = await import("../surprise-resource-matching");
    expect((await matchActionsToResources(actions(3), [])).size).toBe(0);
    expect(generateContent).not.toHaveBeenCalled();
  });
});
