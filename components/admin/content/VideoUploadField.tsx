"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createSignedVideoUploadUrl } from "@/app/actions/prepare-content";

/** Reads a video file's duration client-side without ever uploading it first. */
function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : undefined);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    video.src = url;
  });
}

export function VideoUploadField({
  onUploaded,
  disabled,
}: {
  onUploaded: (result: { videoUrl: string; videoDurationSeconds?: number }) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setUploading(true);

    try {
      setStatus("Reading video…");
      const durationSeconds = await readVideoDuration(file);

      setStatus("Preparing upload…");
      const ext = file.name.split(".").pop() || "mp4";
      const { error: signError, path, token, publicUrl } = await createSignedVideoUploadUrl(ext);
      if (signError || !path || !token || !publicUrl) {
        setError(signError ?? "Failed to prepare upload");
        setUploading(false);
        return;
      }

      setStatus("Uploading…");
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("content-videos")
        .uploadToSignedUrl(path, token, file);
      if (uploadError) {
        setError(uploadError.message);
        setUploading(false);
        return;
      }

      setStatus(null);
      setUploading(false);
      onUploaded({ videoUrl: publicUrl, videoDurationSeconds: durationSeconds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label
        className="flex items-center gap-2 justify-center px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer text-sm font-semibold"
        style={{ borderColor: "var(--color-border, #d1d5db)", opacity: disabled || uploading ? 0.6 : 1 }}
      >
        <UploadCloud size={16} strokeWidth={2.5} />
        {uploading ? status ?? "Uploading…" : fileName ?? "Upload a video file"}
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs font-bold mt-1" style={{ color: "#ED4551" }}>{error}</p>}
    </div>
  );
}
