/**
 * WhatsApp Cloud API webhook helpers — signature check and payload parsing,
 * kept free of Next/Supabase so they can be unit tested. The route that uses
 * them is app/api/webhooks/whatsapp/route.ts.
 *
 * Payload shape (Graph API):
 *   { object: "whatsapp_business_account",
 *     entry: [{ id: <WABA id>, changes: [{ field, value }] }] }
 * For field "messages", value carries `metadata`, and either `statuses`
 * (updates on messages we sent) or `messages` + `contacts` (messages users
 * sent us). Any other field is passed through untouched.
 */
import crypto from "crypto";

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

const DELIVERY_STATUSES: readonly string[] = ["sent", "delivered", "read", "failed"];

export type WhatsAppStatusEvent = {
  wamid: string;
  status: WhatsAppDeliveryStatus;
  statusAt: string;
  recipient: string | null;
  errorCode: number | null;
  errorTitle: string | null;
  errorDetails: string | null;
  pricingCategory: string | null;
  conversationId: string | null;
};

export type WhatsAppInboundMessage = {
  wamid: string;
  phoneNumberId: string | null;
  fromPhone: string;
  profileName: string | null;
  messageType: string;
  textBody: string | null;
  replyPayload: string | null;
  contextWamid: string | null;
  receivedAt: string;
  raw: Record<string, unknown>;
};

export type WhatsAppOtherChange = {
  field: string;
  value: unknown;
};

export type ParsedWhatsAppWebhook = {
  statuses: WhatsAppStatusEvent[];
  inbound: WhatsAppInboundMessage[];
  other: WhatsAppOtherChange[];
};

/**
 * Meta signs each POST with `X-Hub-Signature-256: sha256=<hex>`, an
 * HMAC-SHA256 of the raw request body keyed by the Meta app secret.
 */
export function verifyWhatsAppSignature(rawBody: Buffer, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest();
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/** Webhook timestamps are Unix seconds as strings. */
function unixSecondsToIso(value: unknown): string {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseStatus(value: unknown): WhatsAppStatusEvent | null {
  const status = asRecord(value);
  const wamid = asString(status?.id);
  const state = asString(status?.status);
  if (!status || !wamid || !state || !DELIVERY_STATUSES.includes(state)) return null;

  const firstError = asRecord(asArray(status.errors)[0]);
  const errorData = asRecord(firstError?.error_data);
  const code = Number(firstError?.code);

  return {
    wamid,
    status: state as WhatsAppDeliveryStatus,
    statusAt: unixSecondsToIso(status.timestamp),
    recipient: asString(status.recipient_id),
    errorCode: firstError && Number.isFinite(code) ? code : null,
    errorTitle: asString(firstError?.title) ?? asString(firstError?.message),
    errorDetails: asString(errorData?.details),
    pricingCategory: asString(asRecord(status.pricing)?.category),
    conversationId: asString(asRecord(status.conversation)?.id),
  };
}

/** Pulls the human-readable text and, for button replies, the payload id. */
function messageContent(message: Record<string, unknown>, type: string): { text: string | null; payload: string | null } {
  switch (type) {
    case "text":
      return { text: asString(asRecord(message.text)?.body), payload: null };
    case "button": {
      const button = asRecord(message.button);
      return { text: asString(button?.text), payload: asString(button?.payload) };
    }
    case "interactive": {
      const interactive = asRecord(message.interactive);
      const reply = asRecord(interactive?.button_reply) ?? asRecord(interactive?.list_reply);
      return { text: asString(reply?.title), payload: asString(reply?.id) };
    }
    default: {
      // Media messages (image, document, video, ...) may carry a caption.
      return { text: asString(asRecord(message[type])?.caption), payload: null };
    }
  }
}

function parseInbound(
  value: unknown,
  phoneNumberId: string | null,
  profileNames: Map<string, string>
): WhatsAppInboundMessage | null {
  const message = asRecord(value);
  const wamid = asString(message?.id);
  const fromPhone = asString(message?.from);
  if (!message || !wamid || !fromPhone) return null;

  const messageType = asString(message.type) ?? "unknown";
  const { text, payload } = messageContent(message, messageType);

  return {
    wamid,
    phoneNumberId,
    fromPhone,
    profileName: profileNames.get(fromPhone) ?? null,
    messageType,
    textBody: text,
    replyPayload: payload,
    contextWamid: asString(asRecord(message.context)?.id),
    receivedAt: unixSecondsToIso(message.timestamp),
    raw: message,
  };
}

export function parseWhatsAppWebhook(payload: unknown): ParsedWhatsAppWebhook {
  const parsed: ParsedWhatsAppWebhook = { statuses: [], inbound: [], other: [] };
  const body = asRecord(payload);
  if (body?.object !== "whatsapp_business_account") return parsed;

  for (const entry of asArray(body.entry)) {
    for (const rawChange of asArray(asRecord(entry)?.changes)) {
      const change = asRecord(rawChange);
      const field = asString(change?.field);
      if (!change || !field) continue;

      if (field !== "messages") {
        parsed.other.push({ field, value: change.value ?? null });
        continue;
      }

      const value = asRecord(change.value);
      if (!value) continue;
      const phoneNumberId = asString(asRecord(value.metadata)?.phone_number_id);

      for (const status of asArray(value.statuses)) {
        const event = parseStatus(status);
        if (event) parsed.statuses.push(event);
      }

      const profileNames = new Map<string, string>();
      for (const contact of asArray(value.contacts)) {
        const record = asRecord(contact);
        const waId = asString(record?.wa_id);
        const name = asString(asRecord(record?.profile)?.name);
        if (waId && name) profileNames.set(waId, name);
      }
      for (const message of asArray(value.messages)) {
        const inbound = parseInbound(message, phoneNumberId, profileNames);
        if (inbound) parsed.inbound.push(inbound);
      }
    }
  }

  return parsed;
}
