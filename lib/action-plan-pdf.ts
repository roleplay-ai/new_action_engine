/**
 * Renders a finalised personal action plan (ordered actions + their
 * projected dates) as a PDF, for attaching to the "plan activated" summary
 * email. Kept deliberately simple — one numbered row per action, wrapped and
 * paginated with pdf-lib — since the email body itself carries the branded
 * design; this is the reference document for the participant to keep or print.
 */
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

export type ActionPlanPdfAction = {
  title: string;
  /** Pre-formatted display date (e.g. "Sat, Aug 22"), already resolved by the caller. */
  date?: string;
};

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const TOP_MARGIN = 70;
const BOTTOM_MARGIN = 56;

const INK = rgb(0.133, 0.114, 0.137); // #221D23
const INK_SOFT = rgb(0.435, 0.408, 0.443); // #6F6871
const INK_FAINT = rgb(0.541, 0.506, 0.545); // #8A818B
const ACCENT = rgb(1, 0.808, 0); // #FFCE00
const ROW_BORDER = rgb(0.902, 0.867, 0.78); // #E6DDC7
const ROW_FILL = rgb(1, 0.992, 0.973); // #FFFDF8

/** Greedy word-wrap for a single font/size against a max pixel width. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/**
 * Fetches the company logo and normalises it to PNG bytes pdf-lib can embed.
 * Company logos can be PNG, JPEG, WEBP, or SVG (see lib/company-logo-upload.ts)
 * but pdf-lib only embeds PNG/JPEG — sharp rasterises whatever comes back into
 * a bounded PNG so every format works the same way. Never throws: a missing
 * or unreadable logo just means the PDF renders without one.
 */
async function fetchLogoAsPng(url: string, maxDimension = 600): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    return await sharp(input, { limitInputPixels: 268402689 })
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (e) {
    console.error("[action-plan-pdf] failed to fetch/convert company logo", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Draws the logo as a low-opacity watermark in the page's bottom-right corner — sits below the last content row on every page, so it's never covered by the opaque row/panel cards above it. */
function drawWatermark(page: PDFPage, logo: PDFImage): void {
  const maxWidth = 120;
  const maxHeight = 32;
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = logo.width * scale;
  const height = logo.height * scale;
  page.drawImage(logo, {
    x: PAGE_WIDTH - MARGIN_X - width,
    y: (BOTTOM_MARGIN - height) / 2,
    width,
    height,
    opacity: 0.22,
  });
}

/** Draws the logo at the top-right corner of the page, scaled to fit within a fixed box. */
function drawCornerLogo(page: PDFPage, logo: PDFImage): void {
  const maxWidth = 130;
  const maxHeight = 34;
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  const width = logo.width * scale;
  const height = logo.height * scale;
  page.drawImage(logo, {
    x: PAGE_WIDTH - MARGIN_X - width,
    y: PAGE_HEIGHT - 22 - height,
    width,
    height,
  });
}

function drawPageChrome(page: PDFPage, fontBold: PDFFont, heading: string): number {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: ACCENT });
  page.drawText(heading, { x: MARGIN_X, y: PAGE_HEIGHT - TOP_MARGIN, size: 18, font: fontBold, color: INK });
  return PAGE_HEIGHT - TOP_MARGIN - 30;
}

/** Wrapped line count + box height for a "Your plan" text block, computed before drawing so the caller can decide whether it needs a fresh page first. */
function measurePlanTextBox(
  font: PDFFont,
  width: number,
  text: string
): { lines: string[]; boxHeight: number } {
  const paddingX = 14;
  const paddingY = 10;
  const lineHeight = 14;
  const valueSize = 10.5;
  const maxTextWidth = width - paddingX * 2;
  const lines = text
    .split(/\n+/)
    .flatMap((paragraph) => (paragraph.trim() ? wrapText(paragraph.trim(), font, valueSize, maxTextWidth) : [""]));
  return { lines, boxHeight: paddingY * 2 + lines.length * lineHeight };
}

/** Draws the "Your plan" heading + bordered paragraph box, given lines already measured by measurePlanTextBox. */
function drawPlanTextBox(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  x: number,
  topY: number,
  width: number,
  lines: string[],
  boxHeight: number
): number {
  const paddingX = 14;
  const paddingY = 10;
  const lineHeight = 14;
  const valueSize = 10.5;

  page.drawText("Your plan", { x, y: topY, size: 13, font: fontBold, color: INK });
  const boxTop = topY - 20;

  page.drawRectangle({
    x,
    y: boxTop - boxHeight,
    width,
    height: boxHeight,
    color: ROW_FILL,
    borderColor: ROW_BORDER,
    borderWidth: 1,
  });

  let lineY = boxTop - paddingY - 9;
  for (const line of lines) {
    if (line) page.drawText(line, { x: x + paddingX, y: lineY, size: valueSize, font, color: INK });
    lineY -= lineHeight;
  }

  return boxTop - boxHeight;
}

export async function buildActionPlanPdf(params: {
  firstName: string;
  companyName?: string;
  companyLogo?: string;
  batchName?: string;
  moduleName?: string;
  trainerName?: string;
  buddyName?: string;
  buddyEmail?: string;
  /** The participant's own written plan (My Plan notes) — shown as-is, already trimmed/truncated by the caller. */
  planText?: string;
  reminderFrequency: "daily" | "weekly";
  actions: ActionPlanPdfAction[];
}): Promise<Buffer> {
  // batchName/moduleName/trainerName/buddyName/buddyEmail stay in the params
  // type for API stability (callers already pass them) but are intentionally
  // not rendered — the PDF sticks to two sections, "Your plan" and "Your
  // actions", without the extra roster/context details.
  const { firstName, companyName, companyLogo, planText, reminderFrequency, actions } = params;

  const doc = await PDFDocument.create();
  doc.setTitle("Your Action Plan");
  doc.setAuthor(companyName?.trim() || "Nudgeable");
  doc.setSubject(`${reminderFrequency} action plan for ${firstName}`);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  if (companyLogo?.trim()) {
    const pngBytes = await fetchLogoAsPng(companyLogo.trim());
    if (pngBytes) logo = await doc.embedPng(pngBytes);
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  if (logo) drawWatermark(page, logo);
  let y = drawPageChrome(page, fontBold, "Your Action Plan");
  if (logo) drawCornerLogo(page, logo);

  page.drawText(`Prepared for ${firstName}`, { x: MARGIN_X, y, size: 10.5, font, color: INK_SOFT });
  y -= 20;

  const contentWidth = PAGE_WIDTH - MARGIN_X * 2;

  const trimmedPlanText = planText?.trim();
  if (trimmedPlanText) {
    const { lines: planLines, boxHeight: planBoxHeight } = measurePlanTextBox(font, contentWidth, trimmedPlanText);
    const neededHeight = 20 + planBoxHeight;
    if (y - neededHeight < BOTTOM_MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      if (logo) drawWatermark(page, logo);
      y = drawPageChrome(page, fontBold, "Your Action Plan (continued)");
    }
    y = drawPlanTextBox(page, font, fontBold, MARGIN_X, y, contentWidth, planLines, planBoxHeight);
    y -= 22;
  }

  const numberColWidth = 28;
  const dateColWidth = 78;
  const titleColWidth = contentWidth - numberColWidth - dateColWidth - 12;
  const rowPaddingY = 8;
  const lineHeight = 13;
  const rowGap = 8;

  const headingHeight = 20;
  if (y - headingHeight < BOTTOM_MARGIN) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    if (logo) drawWatermark(page, logo);
    y = drawPageChrome(page, fontBold, "Your Action Plan (continued)");
  }
  page.drawText("Your actions", { x: MARGIN_X, y, size: 13, font: fontBold, color: INK });
  y -= headingHeight;

  if (!actions.length) {
    page.drawText("No actions were found on this plan.", { x: MARGIN_X, y, size: 11, font, color: INK_SOFT });
  }

  actions.forEach((action, index) => {
    const titleLines = wrapText(action.title, font, 10.5, titleColWidth);
    const rowHeight = rowPaddingY * 2 + titleLines.length * lineHeight;

    if (y - rowHeight < BOTTOM_MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      if (logo) drawWatermark(page, logo);
      y = drawPageChrome(page, fontBold, "Your Action Plan (continued)");
    }

    const rowTop = y;
    const rowBottom = y - rowHeight;
    page.drawRectangle({
      x: MARGIN_X,
      y: rowBottom,
      width: contentWidth,
      height: rowHeight,
      color: ROW_FILL,
      borderColor: ROW_BORDER,
      borderWidth: 1,
    });

    let textY = rowTop - rowPaddingY - 9;
    page.drawText(`${index + 1}.`, {
      x: MARGIN_X + 10,
      y: textY,
      size: 10.5,
      font: fontBold,
      color: INK,
    });
    for (const line of titleLines) {
      page.drawText(line, {
        x: MARGIN_X + numberColWidth + 6,
        y: textY,
        size: 10.5,
        font,
        color: INK,
      });
      textY -= lineHeight;
    }
    if (action.date) {
      page.drawText(action.date, {
        x: MARGIN_X + contentWidth - dateColWidth,
        y: rowTop - rowPaddingY - 9,
        size: 9.5,
        font,
        color: INK_FAINT,
      });
    }

    y = rowBottom - rowGap;
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
