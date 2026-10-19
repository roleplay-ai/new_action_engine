"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  getMyWhatsAppSettings,
  updateMyWhatsAppReminders,
  type MyWhatsAppSettings,
} from "@/app/actions/whatsapp";

/**
 * WhatsApp reminders for the selected plan, on My Actions → Plan overview.
 * Plan settings are read-only after finalising, but this stays editable so a
 * participant can always turn WhatsApp off/on or fix their number. Hidden
 * until WhatsApp is configured on the server.
 */
export default function WhatsAppRemindersCard({ cohortId }: { cohortId: string }) {
  const [settings, setSettings] = useState<MyWhatsAppSettings | null>(null);
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyWhatsAppSettings(cohortId).then(({ settings: next }) => {
      if (cancelled || !next) return;
      setSettings(next);
      setNumber(next.phone ?? "");
    });
    return () => { cancelled = true; };
  }, [cohortId]);

  if (!settings?.available || settings.planEnabled === null) return null;

  const isOn = settings.planEnabled && !settings.optedOut && !!settings.phone;

  const save = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    const result = await updateMyWhatsAppReminders({ cohortId, enabled, phone: number });
    setBusy(false);
    if (result.error || !result.settings) {
      setError(result.error ?? "Something went wrong, please try again");
      return;
    }
    setSettings(result.settings);
    setNumber(result.settings.phone ?? "");
    setEditing(false);
  };

  const statusText = isOn
    ? `On · reminders also go to ${settings.phone}`
    : settings.optedOut && settings.planEnabled
      ? "Paused · you replied STOP on WhatsApp"
      : "Off · reminders come by email only";

  return (
    <div className="actions-whatsapp-card">
      <div className="actions-whatsapp-heading">
        <MessageCircle size={18} />
        <div>
          <strong>WhatsApp reminders</strong>
          <p>{statusText}</p>
        </div>
      </div>

      {(editing || (!isOn && !settings.phone)) && (
        <label className="actions-whatsapp-number">
          <span>WhatsApp number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98000 00000"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        </label>
      )}

      <div className="actions-whatsapp-buttons">
        {isOn ? (
          <>
            {editing ? (
              <button type="button" className="journey-primary-button" disabled={busy} onClick={() => save(true)}>
                Save number
              </button>
            ) : (
              <button type="button" className="journey-secondary-button" disabled={busy} onClick={() => setEditing(true)}>
                Change number
              </button>
            )}
            <button type="button" className="journey-secondary-button" disabled={busy} onClick={() => save(false)}>
              Turn off
            </button>
          </>
        ) : (
          <button type="button" className="journey-primary-button" disabled={busy} onClick={() => save(true)}>
            Turn on WhatsApp reminders
          </button>
        )}
      </div>

      {error && <p className="actions-whatsapp-error">{error}</p>}
    </div>
  );
}
