// One-time (and re-runnable) seed for the action-image library: uploads every
// image in a source folder to the public `action-images` Supabase Storage
// bucket and upserts one `action_images` row per file, keyed by a label
// derived from the filename (e.g. "Ask for clarification when something is
// unclear.png" -> label "Ask for clarification when something is unclear").
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node scripts/seed-action-images.mjs "D:/path/to/Nudge images"
//
// Safe to re-run: re-uploads (upsert) and re-upserts the DB row for every
// file found, so replacing an image or adding new ones later is just running
// this again against the same (or an updated) folder.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const sourceDir = process.argv[2];
if (!sourceDir) {
  throw new Error("Usage: node scripts/seed-action-images.mjs <path-to-image-folder>");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const CONTENT_TYPE_BY_EXTENSION = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function labelFromFilename(filename) {
  return filename.slice(0, filename.lastIndexOf(".")).trim();
}

function slugify(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const entries = await readdir(sourceDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort();

if (!files.length) {
  throw new Error(`No supported images (${[...SUPPORTED_EXTENSIONS].join(", ")}) found in ${sourceDir}`);
}

console.log(`Found ${files.length} image(s) in ${sourceDir}. Uploading to bucket "action-images"...`);

let uploaded = 0;
let failed = 0;

for (const filename of files) {
  const label = labelFromFilename(filename);
  const extension = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
  const storagePath = `library/${slugify(label)}${extension}`;

  try {
    const buffer = await readFile(path.join(sourceDir, filename));

    const { error: uploadError } = await admin.storage
      .from("action-images")
      .upload(storagePath, buffer, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = admin.storage.from("action-images").getPublicUrl(storagePath);
    const url = publicUrlData.publicUrl;

    const { error: upsertError } = await admin
      .from("action_images")
      .upsert({ label, storage_path: storagePath, url }, { onConflict: "label" });
    if (upsertError) throw upsertError;

    uploaded += 1;
    console.log(`  ✓ ${filename}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${filename}:`, error instanceof Error ? error.message : error);
  }
}

console.log(`\nDone. Uploaded ${uploaded}/${files.length} image(s)${failed ? `, ${failed} failed` : ""}.`);
if (failed) process.exitCode = 1;
