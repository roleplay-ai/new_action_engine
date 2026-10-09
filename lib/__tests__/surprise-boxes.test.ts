import { describe, expect, it } from "vitest";
import {
  assignRandomResources,
  isSurpriseStoragePath,
  surpriseUploadExtension,
  validateSurpriseResourceInput,
  youtubeThumbnailUrl,
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

describe("assignRandomResources", () => {
  const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

  it("gives 12 actions 12 different resources out of 33", () => {
    const result = assignRandomResources(ids("a", 12), ids("r", 33));
    expect(result.size).toBe(12);
    expect(new Set(result.values()).size).toBe(12);
  });

  it("uses every resource once before repeating any", () => {
    const usage = new Map<string, number>();
    assignRandomResources(ids("a", 40), ids("r", 30), usage);
    expect(Math.max(...usage.values())).toBe(2);
    expect(Math.min(...ids("r", 30).map((id) => usage.get(id) ?? 0))).toBe(1);
  });

  it("skips resources already given in the plan", () => {
    const usage = new Map([["r0", 1], ["r1", 1]]);
    expect(assignRandomResources(["a0"], ["r0", "r1", "r2"], usage).get("a0")).toBe("r2");
  });

  it("picks at random among the least-used resources", () => {
    const resources = ids("r", 4);
    expect(assignRandomResources(["a0"], resources, new Map(), () => 0).get("a0")).toBe("r0");
    expect(assignRandomResources(["a0"], resources, new Map(), () => 0.99).get("a0")).toBe("r3");
  });

  it("leaves actions unassigned when the library is empty", () => {
    expect(assignRandomResources(["a0"], []).size).toBe(0);
  });
});

describe("youtubeThumbnailUrl", () => {
  const thumb = "https://i.ytimg.com/vi/wtl5UrrgU8c/hqdefault.jpg";

  it("reads the video id from watch, short, shorts and embed links", () => {
    expect(youtubeThumbnailUrl("https://www.youtube.com/watch?v=wtl5UrrgU8c")).toBe(thumb);
    expect(youtubeThumbnailUrl("https://m.youtube.com/watch?v=wtl5UrrgU8c&t=30s")).toBe(thumb);
    expect(youtubeThumbnailUrl("https://youtu.be/wtl5UrrgU8c")).toBe(thumb);
    expect(youtubeThumbnailUrl("https://youtube.com/shorts/wtl5UrrgU8c")).toBe(thumb);
    expect(youtubeThumbnailUrl("https://www.youtube.com/embed/wtl5UrrgU8c")).toBe(thumb);
  });

  it("returns null for playlists, other sites and bad input", () => {
    expect(youtubeThumbnailUrl("https://www.youtube.com/playlist?list=PLYfF89-7GhtGF2y6L0roakq7xHAwDrh5q")).toBeNull();
    expect(youtubeThumbnailUrl("https://www.ted.com/speakers/julian_treasure")).toBeNull();
    expect(youtubeThumbnailUrl("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeThumbnailUrl("not a url")).toBeNull();
    expect(youtubeThumbnailUrl(null)).toBeNull();
  });
});
