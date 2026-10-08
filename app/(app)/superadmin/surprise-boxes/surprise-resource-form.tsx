"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageIcon, Link2, Loader2, PlayCircle, UploadCloud, X } from "lucide-react";
import { createSurpriseResource, updateSurpriseResource } from "@/app/actions/surprise-box-resources";
import { uploadSurpriseFile } from "@/lib/surprise-resource-upload";
import {
  SURPRISE_DESCRIPTION_MAX,
  SURPRISE_DESCRIPTION_MIN,
  SURPRISE_UPLOAD_TYPES,
  type SurpriseResource,
  type SurpriseResourceKind,
  type SurpriseResourceSource,
} from "@/lib/surprise-boxes";

export default function SurpriseResourceForm({
  resource,
  onClose,
}: {
  /** Omit to create a new resource. */
  resource?: SurpriseResource;
  onClose: () => void;
}) {
  const router = useRouter();
  const formId = resource ? `surprise-edit-${resource.id}` : "surprise-new";
  const [title, setTitle] = useState(resource?.title ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [kind, setKind] = useState<SurpriseResourceKind>(resource?.kind ?? "video");
  const [source, setSource] = useState<SurpriseResourceSource>(resource?.source ?? "upload");
  const [storagePath, setStoragePath] = useState<string | null>(resource?.storagePath ?? null);
  const [fileName, setFileName] = useState<string | null>(resource?.storagePath ? "Current file" : null);
  const [externalUrl, setExternalUrl] = useState(resource?.externalUrl ?? "");
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(resource?.thumbnailPath ?? null);
  const [thumbnailName, setThumbnailName] = useState<string | null>(resource?.thumbnailPath ? "Current image" : null);
  const [durationLabel, setDurationLabel] = useState(resource?.durationLabel ?? "");
  const [uploading, setUploading] = useState<"file" | "thumbnail" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionLength = description.trim().length;
  const busy = saving || uploading !== null;

  function changeKind(next: SurpriseResourceKind) {
    if (next === kind) return;
    setKind(next);
    // A video file can't stand in for a PDF (and vice versa), so drop it.
    if (source === "upload") {
      setStoragePath(null);
      setFileName(null);
    }
  }

  async function handleUpload(file: File | undefined, target: "file" | "thumbnail") {
    if (!file) return;
    setError(null);
    setUploading(target);
    try {
      if (target === "file") {
        const path = await uploadSurpriseFile(file, kind);
        setStoragePath(path);
        setFileName(file.name);
      } else {
        const path = await uploadSurpriseFile(file, "thumbnail");
        setThumbnailPath(path);
        setThumbnailName(file.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const input = {
        title,
        description,
        kind,
        source,
        storagePath: source === "upload" ? storagePath : null,
        externalUrl: source === "link" ? externalUrl : null,
        thumbnailPath,
        durationLabel,
      };
      const result = resource ? await updateSurpriseResource(resource.id, input) : await createSurpriseResource(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="superadmin-creation-form surprise-resource-form">
      <div className="superadmin-creation-form-head">
        <div>
          <h3>{resource ? "Edit resource" : "New resource"}</h3>
          <p>Participants get this in a Surprise Box when they complete an action it's matched to.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" disabled={saving}>
          <X size={15} />
        </button>
      </div>

      <div className="surprise-resource-segment" role="group" aria-label="Type">
        <button type="button" aria-pressed={kind === "video"} onClick={() => changeKind("video")}>
          <PlayCircle size={14} /> Video
        </button>
        <button type="button" aria-pressed={kind === "resource"} onClick={() => changeKind("resource")}>
          <FileText size={14} /> Resource
        </button>
      </div>

      <label htmlFor={`${formId}-title`}>TITLE</label>
      <input
        id={`${formId}-title`}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="e.g. How to give feedback that sticks"
        required
      />

      <label htmlFor={`${formId}-description`}>WHAT IS THIS RESOURCE ABOUT?</label>
      <textarea
        id={`${formId}-description`}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="e.g. A 5-minute walkthrough of giving specific, behaviour-based praise to a teammate, with two short examples."
        rows={3}
        maxLength={SURPRISE_DESCRIPTION_MAX}
        required
      />
      <p className="surprise-resource-hint">
        Used to match this resource to participants&apos; actions — name the skill or situation it helps with.{" "}
        <span className={descriptionLength < SURPRISE_DESCRIPTION_MIN ? "is-short" : ""}>
          {descriptionLength}/{SURPRISE_DESCRIPTION_MAX}
        </span>
      </p>

      <div className="surprise-resource-segment" role="group" aria-label="Source">
        <button type="button" aria-pressed={source === "upload"} onClick={() => setSource("upload")}>
          <UploadCloud size={14} /> Upload file
        </button>
        <button type="button" aria-pressed={source === "link"} onClick={() => setSource("link")}>
          <Link2 size={14} /> Paste link
        </button>
      </div>

      {source === "upload" ? (
        <div className="surprise-resource-upload">
          <label htmlFor={`${formId}-file`}>{kind === "video" ? "VIDEO FILE (MP4, WEBM, MOV)" : "PDF"}</label>
          <input
            id={`${formId}-file`}
            type="file"
            accept={SURPRISE_UPLOAD_TYPES[kind].join(",")}
            onChange={(event) => {
              void handleUpload(event.target.files?.[0], "file");
              event.target.value = "";
            }}
            disabled={busy}
          />
          {uploading === "file" ? (
            <p className="surprise-resource-status"><Loader2 size={13} className="spin" /> Uploading…</p>
          ) : storagePath ? (
            <p className="surprise-resource-status is-done">Uploaded ✓ {fileName}</p>
          ) : null}
        </div>
      ) : (
        <>
          <label htmlFor={`${formId}-url`}>LINK</label>
          <input
            id={`${formId}-url`}
            type="url"
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder={kind === "video" ? "https://www.youtube.com/watch?v=…" : "https://…"}
          />
        </>
      )}

      <div className="surprise-resource-row">
        <div>
          <label htmlFor={`${formId}-duration`}>LENGTH (OPTIONAL)</label>
          <input
            id={`${formId}-duration`}
            value={durationLabel}
            onChange={(event) => setDurationLabel(event.target.value)}
            placeholder={kind === "video" ? "4 min" : "PDF · 2 pages"}
          />
        </div>
        <div className="surprise-resource-upload">
          <label htmlFor={`${formId}-thumbnail`}>COVER IMAGE (OPTIONAL)</label>
          <input
            id={`${formId}-thumbnail`}
            type="file"
            accept={SURPRISE_UPLOAD_TYPES.thumbnail.join(",")}
            onChange={(event) => {
              void handleUpload(event.target.files?.[0], "thumbnail");
              event.target.value = "";
            }}
            disabled={busy}
          />
          {uploading === "thumbnail" ? (
            <p className="surprise-resource-status"><Loader2 size={13} className="spin" /> Uploading…</p>
          ) : thumbnailPath ? (
            <p className="surprise-resource-status is-done">
              <ImageIcon size={13} /> {thumbnailName}
              <button type="button" onClick={() => { setThumbnailPath(null); setThumbnailName(null); }}>
                Remove
              </button>
            </p>
          ) : null}
        </div>
      </div>

      {error && <p className="surprise-resource-error" role="alert">{error}</p>}

      <div className="surprise-resource-actions">
        <button type="submit" className="superadmin-primary-action" disabled={busy}>
          {saving ? "Saving…" : resource ? "Save changes" : "Add to library"}
        </button>
        <button type="button" className="surprise-resource-cancel" onClick={onClose} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
