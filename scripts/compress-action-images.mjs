// One-time (and re-runnable) shrink of the images already in the public
// `action-images` bucket. Downloads every file listed in `action_images`,
// saves the original to a local backup folder, compresses it (see
// action-image-compression.mjs) and re-uploads it to the SAME storage path.
//
// Because the path, filename and format are unchanged, every public URL stays
// identical — actions.image_url and already-sent emails keep working with no
// DB changes; they just load the smaller file.
//
// Usage:
//   node --env-file=.env.local scripts/compress-action-images.mjs <backup-folder> [--dry-run]
//
// Restore: re-upload the backed-up originals with
//   node --env-file=.env.local scripts/compress-action-images.mjs <backup-folder> --restore
//
// Safe to re-run: files already at or below the target size are skipped.

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { compressActionImage } from "./action-image-compression.mjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const backupDir = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const restore = process.argv.includes("--restore");
if (!backupDir || backupDir.startsWith("--")) {
  throw new Error("Usage: node scripts/compress-action-images.mjs <backup-folder> [--dry-run | --restore]");
}

// Already-compressed files are well under this; originals are all above it.
const SKIP_BELOW_BYTES = 250 * 1024;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: library, error: libraryError } = await admin.from("action_images").select("label, storage_path");
if (libraryError) throw libraryError;

await mkdir(backupDir, { recursive: true });
console.log(`${restore ? "Restoring" : dryRun ? "Dry run for" : "Compressing"} ${library.length} image(s) in bucket "action-images"...`);

let changed = 0;
let skipped = 0;
let failed = 0;
let bytesBefore = 0;
let bytesAfter = 0;

for (const { label, storage_path: storagePath } of library) {
  const backupPath = path.join(backupDir, path.basename(storagePath));

  try {
    let output;

    if (restore) {
      output = await readFile(backupPath);
    } else {
      const { data, error } = await admin.storage.from("action-images").download(storagePath);
      if (error) throw error;
      const original = Buffer.from(await data.arrayBuffer());
      bytesBefore += original.length;

      if (original.length <= SKIP_BELOW_BYTES) {
        bytesAfter += original.length;
        skipped += 1;
        console.log(`  - ${label}: already ${Math.round(original.length / 1024)} KB, skipped`);
        continue;
      }

      // Never overwrite an existing backup — a re-run must not replace the
      // true original with an already-compressed copy.
      const hasBackup = await access(backupPath).then(() => true, () => false);
      if (!hasBackup) await writeFile(backupPath, original);

      output = await compressActionImage(original);
      bytesAfter += output.length;
      console.log(`  ✓ ${label}: ${Math.round(original.length / 1024)} KB -> ${Math.round(output.length / 1024)} KB`);
    }

    if (!dryRun) {
      const { error: uploadError } = await admin.storage
        .from("action-images")
        .upload(storagePath, output, { contentType: "image/png", upsert: true });
      if (uploadError) throw uploadError;
    }
    changed += 1;
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${label}:`, error instanceof Error ? error.message : error);
  }
}

const summary = restore
  ? `Restored ${changed}/${library.length}`
  : `${dryRun ? "Would compress" : "Compressed"} ${changed}, skipped ${skipped} — ${Math.round(bytesBefore / 1024)} KB -> ${Math.round(bytesAfter / 1024)} KB total`;
console.log(`\nDone. ${summary}${failed ? `, ${failed} failed` : ""}.`);
if (failed) process.exitCode = 1;
