import { resend, isResendConfigured } from "@/lib/resend";

const ADMIN_NOTIFY_EMAIL = "hitanshu@nudgeable.ai";

/** Fire-and-forget notification email to the platform admin. Never throws —
 * a failure here must not break the action (notice post, chat send, ...)
 * that triggered it. */
export async function notifyAdmin(subject: string, bodyLines: string[]): Promise<void> {
  try {
    if (!isResendConfigured()) return;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) return;

    const html = bodyLines
      .map((line) => `<p style="margin:0 0 8px;font-family:sans-serif;font-size:14px;color:#111;">${escapeHtml(line)}</p>`)
      .join("");

    await resend.emails.send({
      from: fromEmail,
      to: ADMIN_NOTIFY_EMAIL,
      subject,
      html,
    });
  } catch (error) {
    console.error("notifyAdmin failed:", error);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
