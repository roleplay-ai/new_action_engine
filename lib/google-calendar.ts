/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let initPromise: Promise<void> | null = null;
let tokenClient: any | null = null;

export async function initGoogleCalendarClient(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    if (!clientId || !apiKey) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID or NEXT_PUBLIC_GOOGLE_API_KEY");
    }

    await Promise.all([
      loadScript("https://apis.google.com/js/api.js"),
      loadScript("https://accounts.google.com/gsi/client"),
    ]);

    await new Promise<void>((resolve) => window.gapi.load("client", resolve));
    await window.gapi.client.init({ apiKey, discoveryDocs: [DISCOVERY_DOC] });

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: () => {},
    });
  })();
  return initPromise;
}

export async function ensureGoogleCalendarAccess(): Promise<void> {
  await initGoogleCalendarClient();

  await new Promise<void>((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Token client not initialized"));
    tokenClient.callback = (resp: any) => {
      if (resp?.error) return reject(new Error(resp.error));
      resolve();
    };
    // Always prompt consent in this simplified/testing flow.
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

export async function insertPrimaryCalendarEvent(params: {
  startUtcIso: string;
  endUtcIso: string;
  summary: string;
  description: string;
}): Promise<{ id: string; htmlLink?: string }> {
  await ensureGoogleCalendarAccess();

  const resource = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: params.startUtcIso, timeZone: "UTC" },
    end: { dateTime: params.endUtcIso, timeZone: "UTC" },
  };

  const res = await window.gapi.client.calendar.events.insert({
    calendarId: "primary",
    resource,
  });

  const id = res?.result?.id;
  if (!id) throw new Error("Google Calendar insert failed (missing event id)");
  return { id, htmlLink: res?.result?.htmlLink };
}

