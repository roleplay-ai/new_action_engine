import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "../whatsapp-webhook";

const SECRET = "test-app-secret";

function sign(body: Buffer, secret = SECRET) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

function webhook(field: string, value: unknown) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA_ID", changes: [{ field, value }] }],
  };
}

describe("verifyWhatsAppSignature", () => {
  const body = Buffer.from(JSON.stringify(webhook("messages", { statuses: [] })));

  it("accepts a body signed with the app secret", () => {
    expect(verifyWhatsAppSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body, and a missing or malformed header", () => {
    expect(verifyWhatsAppSignature(body, sign(body, "other-secret"), SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(Buffer.from(body.toString() + " "), sign(body), SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, null, SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, sign(body).replace("sha256=", ""), SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha256=abc", SECRET)).toBe(false);
  });
});

describe("parseWhatsAppWebhook", () => {
  it("parses delivery statuses, including failures and pricing", () => {
    const parsed = parseWhatsAppWebhook(
      webhook("messages", {
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
        statuses: [
          {
            id: "wamid.delivered",
            status: "delivered",
            timestamp: "1760000000",
            recipient_id: "919800000000",
            conversation: { id: "CONV_ID" },
            pricing: { billable: true, category: "utility" },
          },
          {
            id: "wamid.failed",
            status: "failed",
            timestamp: "1760000060",
            recipient_id: "919800000001",
            errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "Not on WhatsApp" } }],
          },
          { id: "wamid.unknown", status: "played", timestamp: "1760000000" },
        ],
      })
    );

    expect(parsed.inbound).toEqual([]);
    expect(parsed.statuses).toEqual([
      {
        wamid: "wamid.delivered",
        status: "delivered",
        statusAt: new Date(1760000000 * 1000).toISOString(),
        recipient: "919800000000",
        errorCode: null,
        errorTitle: null,
        errorDetails: null,
        pricingCategory: "utility",
        conversationId: "CONV_ID",
      },
      {
        wamid: "wamid.failed",
        status: "failed",
        statusAt: new Date(1760000060 * 1000).toISOString(),
        recipient: "919800000001",
        errorCode: 131026,
        errorTitle: "Message undeliverable",
        errorDetails: "Not on WhatsApp",
        pricingCategory: null,
        conversationId: null,
      },
    ]);
  });

  it("parses inbound text, button and interactive replies with the sender's profile name", () => {
    const parsed = parseWhatsAppWebhook(
      webhook("messages", {
        metadata: { phone_number_id: "PHONE_ID" },
        contacts: [{ wa_id: "919800000000", profile: { name: "Asha" } }],
        messages: [
          { id: "wamid.text", from: "919800000000", timestamp: "1760000000", type: "text", text: { body: "STOP" } },
          {
            id: "wamid.button",
            from: "919800000000",
            timestamp: "1760000001",
            type: "button",
            context: { id: "wamid.reminder" },
            button: { text: "Done", payload: "done:action-1" },
          },
          {
            id: "wamid.interactive",
            from: "919800000002",
            timestamp: "1760000002",
            type: "interactive",
            interactive: { type: "button_reply", button_reply: { id: "skip", title: "Skip" } },
          },
        ],
      })
    );

    expect(parsed.statuses).toEqual([]);
    expect(
      parsed.inbound.map(({ wamid, phoneNumberId, fromPhone, profileName, messageType, textBody, replyPayload, contextWamid }) => ({
        wamid,
        phoneNumberId,
        fromPhone,
        profileName,
        messageType,
        textBody,
        replyPayload,
        contextWamid,
      }))
    ).toEqual([
      {
        wamid: "wamid.text",
        phoneNumberId: "PHONE_ID",
        fromPhone: "919800000000",
        profileName: "Asha",
        messageType: "text",
        textBody: "STOP",
        replyPayload: null,
        contextWamid: null,
      },
      {
        wamid: "wamid.button",
        phoneNumberId: "PHONE_ID",
        fromPhone: "919800000000",
        profileName: "Asha",
        messageType: "button",
        textBody: "Done",
        replyPayload: "done:action-1",
        contextWamid: "wamid.reminder",
      },
      {
        wamid: "wamid.interactive",
        phoneNumberId: "PHONE_ID",
        fromPhone: "919800000002",
        profileName: null,
        messageType: "interactive",
        textBody: "Skip",
        replyPayload: "skip",
        contextWamid: null,
      },
    ]);
  });

  it("passes other fields through and ignores non-WhatsApp payloads", () => {
    const templateUpdate = { event: "APPROVED", message_template_name: "action_reminder" };
    expect(parseWhatsAppWebhook(webhook("message_template_status_update", templateUpdate)).other).toEqual([
      { field: "message_template_status_update", value: templateUpdate },
    ]);

    expect(parseWhatsAppWebhook({ object: "page", entry: [] })).toEqual({ statuses: [], inbound: [], other: [] });
    expect(parseWhatsAppWebhook(null)).toEqual({ statuses: [], inbound: [], other: [] });
  });
});
