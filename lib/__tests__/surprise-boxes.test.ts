import { describe, expect, it } from "vitest";
import {
  isSurpriseStoragePath,
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
