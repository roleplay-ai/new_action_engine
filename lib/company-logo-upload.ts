"use client";

import { createSignedCompanyLogoUploadUrl } from "@/app/actions/companies";
import { createClient } from "@/lib/supabase/client";

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export async function uploadCompanyLogo(companyId: string | null, file: File): Promise<string> {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error("Use a PNG, JPG, WebP, or SVG logo.");
  if (file.size > MAX_LOGO_BYTES) throw new Error("Logo must be 10 MB or smaller.");

  const extension = file.name.split(".").pop() || (file.type === "image/svg+xml" ? "svg" : "png");
  const signed = await createSignedCompanyLogoUploadUrl(companyId, extension);
  if (signed.error || !signed.path || !signed.token || !signed.publicUrl) {
    throw new Error(signed.error || "Failed to prepare logo upload");
  }

  const supabase = createClient();
  const { error } = await supabase.storage
    .from("company-logos")
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return signed.publicUrl;
}
