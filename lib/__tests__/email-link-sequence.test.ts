import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_SEQUENCE_MS,
  clearEmailSequence,
  remainingEmailSequenceMs,
  startEmailSequencePhase,
} from "../email-link-sequence";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

describe("email link sequence timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
    vi.stubGlobal("window", { sessionStorage: memoryStorage(), setTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("counts down from when the phase started, across reads", () => {
    startEmailSequencePhase("door");
    vi.advanceTimersByTime(2000);
    expect(remainingEmailSequenceMs("door")).toBe(EMAIL_SEQUENCE_MS.door - 2000);
    vi.advanceTimersByTime(10_000);
    expect(remainingEmailSequenceMs("door")).toBe(0);
  });

  it("starts a phase now when a different one is recorded", () => {
    startEmailSequencePhase("dance");
    vi.advanceTimersByTime(5000);
    expect(remainingEmailSequenceMs("notebook")).toBe(EMAIL_SEQUENCE_MS.notebook);
    vi.advanceTimersByTime(1000);
    expect(remainingEmailSequenceMs("notebook")).toBe(EMAIL_SEQUENCE_MS.notebook - 1000);
  });

  it("starts a phase now when nothing is recorded or it was cleared", () => {
    startEmailSequencePhase("door");
    clearEmailSequence();
    expect(remainingEmailSequenceMs("door")).toBe(EMAIL_SEQUENCE_MS.door);
  });

  it("still gives a full minimum when storage is unavailable", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
        removeItem: () => { throw new Error("blocked"); },
      },
      setTimeout,
    });
    startEmailSequencePhase("dance");
    expect(remainingEmailSequenceMs("dance")).toBe(EMAIL_SEQUENCE_MS.dance);
    expect(() => clearEmailSequence()).not.toThrow();
  });
});
