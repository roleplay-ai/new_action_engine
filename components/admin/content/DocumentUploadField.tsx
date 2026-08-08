"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { createSignedDocumentUploadUrl } from "@/app/actions/prepare-content";
import { createClient } from "@/lib/supabase/client";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export function DocumentUploadField({
  onUploaded,
  disabled,
}: {
  onUploaded: (documentUrl: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError("PDF must be 20 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const signed = await createSignedDocumentUploadUrl();
      if (signed.error || !signed.path || !signed.token || !signed.publicUrl) {
        throw new Error(signed.error || "Failed to prepare PDF upload");
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("content-documents")
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);
      onUploaded(signed.publicUrl);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "PDF upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="flex items-center gap-2 justify-center px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer text-sm font-semibold" style={{ borderColor: "var(--color-border, #d1d5db)", opacity: disabled || uploading ? 0.6 : 1 }}>
        <FileUp size={16} strokeWidth={2.5} />
        {uploading ? "Uploading PDF…" : fileName || "Upload a PDF"}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} disabled={disabled || uploading} className="hidden" />
      </label>
      {error && <p className="text-xs font-bold mt-1" style={{ color: "#ED4551" }}>{error}</p>}
    </div>
  );
}
