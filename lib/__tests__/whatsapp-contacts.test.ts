import { describe, expect, it } from "vitest";
import { formatWhatsAppNumber, normalizeWhatsAppNumber, parseOptKeyword } from "../whatsapp-contacts";

describe("normalizeWhatsAppNumber", () => {
  it("accepts the common ways people type an Indian mobile number", () => {
    expect(normalizeWhatsAppNumber("+91 98000 00421")).toBe("919800000421");
    expect(normalizeWhatsAppNumber("91-98000-00421")).toBe("919800000421");
    expect(normalizeWhatsAppNumber("9800000421")).toBe("919800000421");
    expect(normalizeWhatsAppNumber("09800000421")).toBe("919800000421");
    expect(normalizeWhatsAppNumber("0091 9800000421")).toBe("919800000421");
  });

  it("keeps other country codes", () => {
    expect(normalizeWhatsAppNumber("+1 (415) 555-0100")).toBe("14155550100");
    expect(normalizeWhatsAppNumber("+44 7700 900123")).toBe("447700900123");
  });

  it("rejects values that can't be a phone number", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
    expect(normalizeWhatsAppNumber("+91 98000 00421 00421 00")).toBeNull();
  });
});

describe("formatWhatsAppNumber", () => {
  it("formats Indian numbers for display and leaves others as +digits", () => {
    expect(formatWhatsAppNumber("919800000421")).toBe("+91 98000 00421");
    expect(formatWhatsAppNumber("14155550100")).toBe("+14155550100");
  });

  it("round-trips through normalize", () => {
    expect(normalizeWhatsAppNumber(formatWhatsAppNumber("919800000421"))).toBe("919800000421");
  });
});

describe("parseOptKeyword", () => {
  it("recognises whole-message STOP and START keywords", () => {
    expect(parseOptKeyword("STOP")).toBe("stop");
    expect(parseOptKeyword("  stop. ")).toBe("stop");
    expect(parseOptKeyword("Unsubscribe")).toBe("stop");
    expect(parseOptKeyword("opt  out")).toBe("stop");
    expect(parseOptKeyword("start!")).toBe("start");
    expect(parseOptKeyword("Subscribe")).toBe("start");
  });

  it("ignores keywords inside a longer message", () => {
    expect(parseOptKeyword("please don't stop the reminders")).toBeNull();
    expect(parseOptKeyword("start my plan")).toBeNull();
    expect(parseOptKeyword("")).toBeNull();
    expect(parseOptKeyword(null)).toBeNull();
  });
});
