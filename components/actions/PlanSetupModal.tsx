"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";
import { PLAN_REMINDER_DAYS, availableDurations, totalPlanActions, type PlanSetupChoice } from "@/lib/plan-setup";
import { isIndianMobile } from "@/lib/whatsapp-contacts";

export type PlanSetupValues = { setup: PlanSetupChoice; whatsappOn: boolean; phoneDigits: string };

/**
 * "Change" popup for the plan setup: pace, duration, reminder day and
 * WhatsApp. Email reminders are always on and can't be turned off here.
 */
export default function PlanSetupModal({
  open,
  initial,
  maxWeeks,
  whatsappAvailable,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: PlanSetupValues;
  maxWeeks?: number | null;
  whatsappAvailable: boolean;
  onClose: () => void;
  onSave: (values: PlanSetupValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const durations = availableDurations(maxWeeks);

  useEffect(() => {
    if (!open) return;
    setValues(initial);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const { setup } = values;
  const setSetup = (patch: Partial<PlanSetupChoice>) => setValues((current) => ({ ...current, setup: { ...current.setup, ...patch } }));
  const phoneValid = !whatsappAvailable || !values.whatsappOn || isIndianMobile(values.phoneDigits);
  const total = totalPlanActions(setup);

  return createPortal(
    <div className="actions-history-overlay plan-form-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form
        className="actions-history-modal plan-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-setup-title"
        onSubmit={(event) => { event.preventDefault(); if (phoneValid) onSave(values); }}
      >
        <header className="actions-history-head">
          <div>
            <h2 id="plan-setup-title">How often do you want actions?</h2>
            <p>The recommended setup works for most people. Change it only if you need to.</p>
          </div>
          <button type="button" className="actions-history-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="plan-form-body">
          <div className="plan-setup-tracks" role="radiogroup" aria-label="Frequency">
            {([["weekly", "Weekly", "A few actions each week"], ["daily", "Daily", "1 action every weekday"]] as const).map(([track, label, hint]) => (
              <button type="button" key={track} role="radio" aria-checked={setup.track === track} className={setup.track === track ? "active" : ""} onClick={() => setSetup({ track })}>
                <strong>{label}</strong><small>{hint}</small>
              </button>
            ))}
          </div>

          <div className="plan-form-row">
            <label className="plan-form-field" htmlFor="plan-setup-duration">
              <span>Duration</span>
              <select id="plan-setup-duration" value={setup.durationWeeks} onChange={(event) => setSetup({ durationWeeks: Number(event.target.value) })}>
                {durations.map((weeks) => <option key={weeks} value={weeks}>{weeks} weeks</option>)}
              </select>
            </label>
            {setup.track === "weekly" ? (
              <label className="plan-form-field" htmlFor="plan-setup-count">
                <span>Actions per week</span>
                <select id="plan-setup-count" value={setup.actionCount} onChange={(event) => setSetup({ actionCount: Number(event.target.value) as 1 | 2 | 3 })}>
                  {[1, 2, 3].map((count) => <option key={count} value={count}>{count} action{count === 1 ? "" : "s"}</option>)}
                </select>
              </label>
            ) : (
              <div className="plan-form-field"><span>Actions per day</span><div className="plan-form-static">1 action, Monday to Friday</div></div>
            )}
          </div>

          <div className="plan-setup-total"><strong>{total}</strong> actions in total</div>

          <p className="plan-setup-section-label">Reminders</p>
          {setup.track === "weekly" && (
            <label className="plan-form-field" htmlFor="plan-setup-day">
              <span>Reminder day <em>Sent at 11:30 AM IST</em></span>
              <select id="plan-setup-day" value={setup.dayOfWeek} onChange={(event) => setSetup({ dayOfWeek: Number(event.target.value) })}>
                {PLAN_REMINDER_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            </label>
          )}
          <div className="plan-setup-row is-locked">
            <Lock size={15} aria-hidden="true" />
            <span><strong>Email reminders · always on</strong><small>Sent from team@nudgeable.ai. Email reminders can&apos;t be turned off.</small></span>
          </div>
          {whatsappAvailable && <>
            <label className="plan-setup-row" htmlFor="plan-setup-whatsapp">
              <input id="plan-setup-whatsapp" type="checkbox" checked={values.whatsappOn} onChange={(event) => setValues((current) => ({ ...current, whatsappOn: event.target.checked }))} />
              <span><strong>WhatsApp reminders</strong><small>Mark actions done straight from WhatsApp. Untick to opt out.</small></span>
            </label>
            {values.whatsappOn && (
              <label className="plan-form-field" htmlFor="plan-setup-phone">
                <span>WhatsApp number</span>
                <span className="plan-form-phone">
                  <b>+91</b>
                  <input
                    id="plan-setup-phone"
                    type="tel"
                    inputMode="numeric"
                    value={values.phoneDigits}
                    onChange={(event) => setValues((current) => ({ ...current, phoneDigits: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    placeholder="10-digit mobile number"
                  />
                </span>
              </label>
            )}
            {!phoneValid && <p className="plan-form-error" role="alert">Enter a 10-digit Indian mobile number, or untick WhatsApp reminders.</p>}
          </>}
        </div>

        <footer className="plan-form-actions">
          <button type="button" className="plan-form-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="journey-primary-button" disabled={!phoneValid}>Use this setup</button>
        </footer>
      </form>
    </div>,
    document.body
  );
}
