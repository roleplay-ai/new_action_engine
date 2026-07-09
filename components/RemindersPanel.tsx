"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useEngine } from "@/lib/store";
import { BellRing, Check, Trash2 } from "lucide-react";
import {
  getMyActionReminders,
  markReminderWeekDone,
  deleteActionReminder,
} from "@/app/actions/action-reminders";
import type { ActionReminder } from "@/lib/types";

export default function RemindersPanel() {
  const { allActions, refetch } = useEngine();
  const [reminders, setReminders] = useState<ActionReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { reminders: data } = await getMyActionReminders();
    setReminders((data ?? []).filter((r) => r.isActive));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading || reminders.length === 0) return null;

  const handleMarkDone = async (id: string) => {
    setBusyId(id);
    await markReminderWeekDone(id);
    await load();
    await refetch();
    setBusyId(null);
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    await deleteActionReminder(id);
    await load();
    setBusyId(null);
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: "var(--color-primary-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <BellRing size={18} style={{ color: "var(--bright-amber)" }} strokeWidth={2.5} />
        </div>
        <div>
          <h2
            style={{
              fontSize: "var(--text-xl)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-text-primary)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              marginBottom: "2px",
            }}
          >
            This Week&apos;s Reminders
          </h2>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)" }}>
            A summary email goes out every Monday — check off what you did
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: "none" }}>
        <div className="space-y-3">
          {reminders.map((reminder) => {
            const action = allActions.find((a) => a.id === reminder.actionId);
            return (
              <div
                key={reminder.id}
                className="card__inset flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`tag ${reminder.doneThisWeek ? "tag--green" : "tag--yellow"}`}>
                      {reminder.doneThisWeek ? "Done this week" : `${reminder.timesPerWeek}x / week`}
                    </span>
                    {action?.theme && <span className="tag tag--orange">{action.theme}</span>}
                  </div>
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                    {action?.title ?? "Action"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    Aiming for around {reminder.timeOfDayIST} IST
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleMarkDone(reminder.id)}
                    disabled={busyId === reminder.id || reminder.doneThisWeek}
                    className="btn btn--primary btn--sm"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    {reminder.doneThisWeek ? "Done" : "Mark done"}
                  </button>
                  <button
                    onClick={() => handleDelete(reminder.id)}
                    disabled={busyId === reminder.id}
                    className="btn btn--icon"
                    aria-label="Delete reminder"
                  >
                    <Trash2 size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
