// Shared compression for action-library images. The originals are 1254px
// flat illustrations (~400-630 KB) but are only ever displayed at <=96px
// (email) / 88px (app), so they're downscaled to 800px and palette-quantized,
// which lands each file at ~110-200 KB with no visible quality loss.
//
// Output stays PNG on purpose: actions.image_url stores the full public URL
// (including the .png extension), so the format must not change or every
// already-assigned image and already-sent email would break.

import sharp from "sharp";

export const ACTION_IMAGE_MAX_SIZE_PX = 800;

export async function compressActionImage(buffer) {
  return sharp(buffer)
    .resize(ACTION_IMAGE_MAX_SIZE_PX, ACTION_IMAGE_MAX_SIZE_PX, { fit: "inside", withoutEnlargement: true })
    .png({ palette: true, quality: 90, compressionLevel: 9, effort: 10 })
    .toBuffer();
}
