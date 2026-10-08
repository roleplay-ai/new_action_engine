import { describe, expect, it } from "vitest";
import {
  fillWithLeastUsed,
  isSurpriseStoragePath,
  parseResourceMatches,
  surpriseUploadExtension,
  validateSurpriseResourceInput,
  type SurpriseResourceInput,
} from "../surprise-boxes";

const uuid = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";
const description = "A short walkthrough of giving specific, behaviour-based praise.";

const link: SurpriseResourceInput = {
  title: "Feedback that sticks",
  description,
  kind: "video",
  source: "link",
  externalUrl: "https://www.youtube.com/watch?v=abc",
};

describe("validateSurpriseResourceInput", () => {
  it("accepts a link resource and trims fields", () => {
    const result = validateSurpriseResourceInput({ ...link, title: "  Feedback that sticks  ", durationLabel: " 4 min " });
    expect(result).toEqual({
      value: {
        title: "Feedback that sticks",
        description,
        kind: "video",
        source: "link",
        storagePath: null,
        externalUrl: "https://www.youtube.com/watch?v=abc",
        thumbnailPath: null,
        durationLabel: "4 min",
      },
    });
  });

  it("accepts an uploaded file and drops any stray link", () => {
    const result = validateSurpriseResourceInput({
      ...link,
      kind: "resource",
      source: "upload",
      storagePath: `resources/${uuid}.pdf`,
      thumbnailPath: `thumbnails/${uuid}.png`,
    });
    expect("value" in result && result.value).toMatchObject({
      source: "upload",
      storagePath: `resources/${uuid}.pdf`,
      externalUrl: null,
      thumbnailPath: `thumbnails/${uuid}.png`,
    });
  });

  it("requires a description long enough to match on", () => {
    expect(validateSurpriseResourceInput({ ...link, description: "Feedback video" })).toHaveProperty("error");
  });

  it("requires a title", () => {
    expect(validateSurpriseResourceInput({ ...link, title: "   " })).toEqual({ error: "Add a title." });
  });

  it("rejects non-http links", () => {
    expect(validateSurpriseResourceInput({ ...link, externalUrl: "javascript:alert(1)" })).toHaveProperty("error");
    expect(validateSurpriseResourceInput({ ...link, externalUrl: "youtube.com/watch" })).toHaveProperty("error");
  });

  it("requires a file for uploads and rejects paths it didn't generate", () => {
    expect(validateSurpriseResourceInput({ ...link, source: "upload" })).toHaveProperty("error");
    expect(validateSurpriseResourceInput({ ...link, source: "upload", storagePath: "../other-bucket/x.pdf" })).toHaveProperty("error");
    expect(validateSurpriseResourceInput({ ...link, source: "upload", storagePath: `thumbnails/${uuid}.png` })).toHaveProperty("error");
  });
});

describe("isSurpriseStoragePath", () => {
  it("matches only generated paths in the expected folder", () => {
    expect(isSurpriseStoragePath(`resources/${uuid}.mp4`, "resources")).toBe(true);
    expect(isSurpriseStoragePath(`resources/${uuid}.mp4`, "thumbnails")).toBe(false);
    expect(isSurpriseStoragePath(`resources/${uuid}/x.mp4`, "resources")).toBe(false);
  });
});

describe("surpriseUploadExtension", () => {
  it("maps allowed types per purpose and rejects the rest", () => {
    expect(surpriseUploadExtension("video", "video/quicktime")).toBe("mov");
    expect(surpriseUploadExtension("resource", "application/pdf")).toBe("pdf");
    expect(surpriseUploadExtension("thumbnail", "image/jpeg")).toBe("jpg");
    expect(surpriseUploadExtension("video", "application/pdf")).toBeNull();
    expect(surpriseUploadExtension("thumbnail", "image/svg+xml")).toBeNull();
  });
});

describe("parseResourceMatches", () => {
  it("converts 1-based indexes and keeps the first answer per action", () => {
    const text = JSON.stringify({
      matches: [
        { actionIndex: 1, resourceIndex: 3 },
        { actionIndex: 2, resourceIndex: 1 },
        { actionIndex: 1, resourceIndex: 2 },
      ],
    });
    expect([...parseResourceMatches(text, 2, 3)]).toEqual([[0, 2], [1, 0]]);
  });

  it("drops out-of-range, non-integer and malformed entries", () => {
    const text = JSON.stringify({
      matches: [
        { actionIndex: 0, resourceIndex: 1 },
        { actionIndex: 3, resourceIndex: 1 },
        { actionIndex: 1, resourceIndex: 9 },
        { actionIndex: 1.5, resourceIndex: 1 },
        { actionIndex: "2", resourceIndex: 1 },
        null,
        { actionIndex: 2, resourceIndex: 2 },
      ],
    });
    expect([...parseResourceMatches(text, 2, 2)]).toEqual([[1, 1]]);
    expect(parseResourceMatches("not json", 2, 2).size).toBe(0);
    expect(parseResourceMatches(JSON.stringify({ matches: "x" }), 2, 2).size).toBe(0);
  });
});

describe("fillWithLeastUsed", () => {
  it("spreads 12 actions across 30 resources without repeats", () => {
    const actions = Array.from({ length: 12 }, (_, i) => `a${i}`);
    const resources = Array.from({ length: 30 }, (_, i) => `r${i}`);
    const result = fillWithLeastUsed(actions, new Map(), resources, new Map());
    expect(new Set(result.values()).size).toBe(12);
  });

  it("repeats evenly when there are more actions than resources", () => {
    const actions = Array.from({ length: 40 }, (_, i) => `a${i}`);
    const resources = Array.from({ length: 30 }, (_, i) => `r${i}`);
    const usage = new Map<string, number>();
    fillWithLeastUsed(actions, new Map(), resources, usage);
    expect(Math.max(...usage.values())).toBe(2);
    expect(Math.min(...resources.map((id) => usage.get(id) ?? 0))).toBe(1);
  });

  it("keeps existing assignments and avoids resources already used", () => {
    const usage = new Map([["r0", 1]]);
    const result = fillWithLeastUsed(["a0", "a1"], new Map([["a0", "r0"]]), ["r0", "r1"], usage);
    expect(result.get("a0")).toBe("r0");
    expect(result.get("a1")).toBe("r1");
  });

  it("leaves actions unassigned when the library is empty", () => {
    expect(fillWithLeastUsed(["a0"], new Map(), [], new Map()).size).toBe(0);
  });
});
