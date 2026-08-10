"use client";

import { createSignedFacilitatorPdfUploadUrl } from "@/app/actions/facilitators";
import { createClient } from "@/lib/supabase/client";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function uploadFacilitatorPdf(cohortId: string, file: File): Promise<{ pdfUrl: string; pdfName: string }> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Use a PDF file.");
  }
  if (file.size > MAX_PDF_BYTES) throw new Error("PDF must be 20 MB or smaller.");

  const signed = await createSignedFacilitatorPdfUploadUrl(cohortId, file.name);
  if (signed.error || !signed.path || !signed.token || !signed.publicUrl) {
    throw new Error(signed.error || "Failed to prepare the PDF upload");
  }

  const supabase = createClient();
  const { error } = await supabase.storage
    .from("facilitator-documents")
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: "application/pdf" });
  if (error) throw new Error(error.message);
  return { pdfUrl: signed.publicUrl, pdfName: file.name };
}
