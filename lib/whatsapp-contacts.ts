/**
 * Pure helpers for WhatsApp numbers and opt-out keywords — shared by the
 * webhook, the participant/admin server actions and the plan setup form.
 * See supabase/migrations/083_whatsapp_contacts.sql.
 */

/** Country code assumed for a bare 10-digit number (participants are India-based). */
const DEFAULT_COUNTRY_CODE = "91";

/**
 * Normalises what an admin or participant typed into WhatsApp's format:
 * digits only, country code first ("+91 98000 00000" → "919800000000").
 * A 10-digit number gets the default country code; a leading "00" or a
 * single trunk "0" is dropped. Returns null if it can't be a valid number.
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** "919800000000" → "+91 98000 00000" (other country codes: "+<digits>"). */
export function formatWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

/**
 * The 10-digit Indian mobile number inside a stored or typed number
 * ("919800000000", "+91 98000 00000" → "9800000000"), or "" for anything else.
 * The plan form shows a fixed +91 and asks for these 10 digits.
 */
export function indianMobileDigits(phone: string | null | undefined): string {
  const normalized = normalizeWhatsAppNumber(phone);
  return normalized && normalized.length === 12 && normalized.startsWith(DEFAULT_COUNTRY_CODE) ? normalized.slice(2) : "";
}

/** Indian mobile numbers are 10 digits starting with 6–9. */
export function isIndianMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

export type OptKeyword = "stop" | "start";

const STOP_WORDS = new Set(["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT"]);
const START_WORDS = new Set(["START", "SUBSCRIBE", "UNSTOP"]);

/** Whole-message keywords only, so "don't stop reminding me" is not an opt-out. */
export function parseOptKeyword(text: string | null | undefined): OptKeyword | null {
  if (!text) return null;
  const normalized = text.trim().toUpperCase().replace(/[.!\s]+$/g, "").replace(/\s+/g, " ");
  if (STOP_WORDS.has(normalized)) return "stop";
  if (START_WORDS.has(normalized)) return "start";
  return null;
}
