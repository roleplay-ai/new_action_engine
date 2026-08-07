"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { uploadTrainerImage } from "@/lib/trainer-image-upload";

export function TrainerImageUploadField({
  onUploaded,
  disabled,
  label = "Upload a photo",
}: {
  onUploaded: (imageUrl: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setUploading(true);
    try {
      const imageUrl = await uploadTrainerImage(file);
      onUploaded(imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
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
        {uploading ? "Uploading…" : fileName ?? label}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={disabled || uploading}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs font-bold mt-1" style={{ color: "#ED4551" }}>{error}</p>}
    </div>
  );
}
