import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppUrl, PRODUCTION_APP_URL } from "../app-url";

describe("getAppUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("defaults to the production app", () => {
    vi.stubEnv("NUDGEABLE_APP_URL", "");
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
  });

  it("uses the override's origin for local or preview testing", () => {
    vi.stubEnv("NUDGEABLE_APP_URL", "http://localhost:3000/");
    expect(getAppUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NUDGEABLE_APP_URL", "https://preview-abc.vercel.app/some/path");
    expect(getAppUrl()).toBe("https://preview-abc.vercel.app");
  });

  it("ignores invalid overrides", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NUDGEABLE_APP_URL", "localhost:3000");
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
    vi.stubEnv("NUDGEABLE_APP_URL", "javascript:alert(1)");
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
    expect(warn).toHaveBeenCalled();
  });
});
