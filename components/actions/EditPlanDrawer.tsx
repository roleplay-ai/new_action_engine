"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bell, ChevronRight, FileText, Mail, MessageCircle, Pencil, Plus, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import type { MyPlanSettings } from "@/app/actions/ai-actions";
import WhatsAppRemindersCard from "@/components/WhatsAppRemindersCard";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(value: string) {
  if (!value) return "11:30 AM";
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

type CardProps = {
  color: string;
  icon: ReactNode;
  title: string;
  text: string;
  status: ReactNode;
  onClick?: () => void;
};

/** One option, styled like the admin control-panel cards. No onClick means "coming soon". */
function OptionCard({ color, icon, title, text, status, onClick }: CardProps) {
  return (
    <button type="button" className="edit-plan-card" style={{ "--edit-c": color } as React.CSSProperties} onClick={onClick} disabled={!onClick}>
      <span className="edit-plan-card-icon">{icon}</span>
      <span className="edit-plan-card-body">
        <strong>{title}</strong>
        <small>{text}</small>
        {onClick ? status : <span className="cp-pill cp-pill--ghost">Coming soon</span>}
      </span>
      {onClick && <ChevronRight size={18} aria-hidden="true" />}
    </button>
  );
}

/**
 * "Edit my plan" side drawer on My Actions. Change pace, Generate more and
 * Rewrite my plan need server support for active plans (Phase 4 of
 * docs/PARTICIPANT_JOURNEY_REDESIGN_PLAN.md) and show "Coming soon" until then.
 */
export default function EditPlanDrawer({
  open,
  onClose,
  settings,
  cohortId,
  upcomingCount,
  onEditActions,
  onPreview,
}: {
  open: boolean;
  onClose: () => void;
  settings: MyPlanSettings | null;
  cohortId: string | null;
  upcomingCount: number;
  onEditActions: () => void;
  onPreview: (channel: "email" | "whatsapp") => void;
}) {
  const [showReminders, setShowReminders] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowReminders(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const pace = settings
    ? `${settings.track === "weekly" ? `${settings.actionCount} / week` : "1 / weekday"} · ${settings.durationWeeks} weeks`
    : "—";
  const reminderDay = settings
    ? settings.track === "weekly" ? DAYS[settings.daysOfWeek[0] ?? 1] : "Weekdays"
    : "—";

  return createPortal(
    <div className="edit-plan-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="edit-plan-drawer" role="dialog" aria-modal="true" aria-labelledby="edit-plan-title">
        <header className="edit-plan-head">
          <div>
            <h2 id="edit-plan-title">Edit my plan</h2>
            <p>Change anything, anytime. Actions you&apos;ve completed are never affected.</p>
          </div>
          <button type="button" className="edit-plan-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {showReminders ? (
          <section className="edit-plan-reminders">
            <button type="button" className="edit-plan-back" onClick={() => setShowReminders(false)}>← All options</button>
            <h3>Reminders</h3>
            {settings && (
              <div className="actions-settings-grid">
                <div><span>Reminder</span><strong>{reminderDay}, {formatTime(settings.reminderTime)}</strong></div>
                <div><span>Email reminders</span><strong className="actions-notification-status"><Mail size={15} />Always on · team@nudgeable.ai</strong></div>
                <div><span>Total plan</span><strong>{settings.totalActionsPlanned} actions</strong></div>
              </div>
            )}
            {cohortId && <WhatsAppRemindersCard cohortId={cohortId} />}
            <div className="edit-plan-preview-buttons">
              <span>See your reminders</span>
              <button type="button" onClick={() => onPreview("email")}><Mail size={16} /> Email reminder</button>
              <button type="button" onClick={() => onPreview("whatsapp")}><MessageCircle size={16} /> WhatsApp reminder</button>
            </div>
          </section>
        ) : (
          <div className="edit-plan-cards">
            <OptionCard
              color="#2563EB"
              icon={<Pencil size={20} />}
              title="Edit an action"
              text="Reword any upcoming action so it fits your real week."
              status={<span className="cp-pill cp-pill--ok">{upcomingCount} upcoming</span>}
              onClick={upcomingCount ? onEditActions : undefined}
            />
            <OptionCard color="#16A34A" icon={<SlidersHorizontal size={20} />} title="Change pace" text={`Now: ${pace}. Change how many actions you get and for how long.`} status={null} />
            <OptionCard color="#7E22CE" icon={<Plus size={20} />} title="Generate more actions" text="Add another week of actions to the end of your plan." status={null} />
            <OptionCard color="#C2410C" icon={<FileText size={20} />} title="Rewrite my plan" text="Update your goal. Upcoming actions refresh to match." status={null} />
            <OptionCard
              color="#0E7490"
              icon={<Bell size={20} />}
              title="Reminders"
              text="Your reminder day, email and WhatsApp. Preview a reminder."
              status={<span className="cp-pill">{reminderDay}{settings ? `, ${formatTime(settings.reminderTime)}` : ""}</span>}
              onClick={() => setShowReminders(true)}
            />
          </div>
        )}

        <p className="edit-plan-foot"><ShieldCheck size={16} aria-hidden="true" /> Changes apply to upcoming actions only. Your progress and Commitment Score are kept.</p>
      </aside>
    </div>,
    document.body
  );
}
