"use client";

import { createSignedSurpriseUploadUrl } from "@/app/actions/surprise-box-resources";
import { createClient } from "@/lib/supabase/client";
import { SURPRISE_BOX_BUCKET, type SurpriseUploadPurpose } from "@/lib/surprise-boxes";

/**
 * Uploads a Surprise Box file straight from the browser to the
 * surprise-box-resources bucket and returns its storage path. Throws a
 * message suitable for showing in the form.
 */
export async function uploadSurpriseFile(file: File, purpose: SurpriseUploadPurpose): Promise<string> {
  const signed = await createSignedSurpriseUploadUrl(purpose, file.type);
  if (signed.error || !signed.path || !signed.token) {
    throw new Error(signed.error || "Failed to prepare upload");
  }

  const { error } = await createClient()
    .storage.from(SURPRISE_BOX_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
  if (error) {
    // Oversized files are rejected by the project's Storage upload limit.
    if (/exceeded|too large|payload/i.test(error.message)) {
      throw new Error("This file is over the storage upload limit. Use a smaller file or paste a link instead.");
    }
    throw new Error(error.message);
  }
  return signed.path;
}
