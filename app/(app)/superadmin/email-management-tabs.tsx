"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarClock,
  Clock3,
  History,
  MailPlus,
} from "lucide-react";

type EmailTab = "reminders" | "welcome" | "campaigns" | "history";

const TABS = [
  {
    id: "reminders" as const,
    label: "Reminders",
    description: "Upcoming participant emails",
    icon: Clock3,
  },
  {
    id: "welcome" as const,
    label: "Welcome emails",
    description: "Account access delivery",
    icon: MailPlus,
  },
  {
    id: "campaigns" as const,
    label: "Campaigns",
    description: "Reusable schedules",
    icon: CalendarClock,
  },
  {
    id: "history" as const,
    label: "Delivery history",
    description: "Reminder send activity",
    icon: History,
  },
];

export default function EmailManagementTabs({
  reminders,
  welcome,
  campaigns,
  history,
}: {
  reminders: ReactNode;
  welcome: ReactNode;
  campaigns: ReactNode;
  history: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<EmailTab>("reminders");
  const [visitedTabs, setVisitedTabs] = useState<Set<EmailTab>>(
    new Set(["reminders"])
  );
  const panels: Record<EmailTab, ReactNode> = {
    reminders,
    welcome,
    campaigns,
    history,
  };

  function activateTab(tabId: EmailTab) {
    setActiveTab(tabId);
    setVisitedTabs((previous) => {
      if (previous.has(tabId)) return previous;
      const next = new Set(previous);
      next.add(tabId);
      return next;
    });
  }

  function moveTabFocus(
    currentTab: EmailTab,
    direction: "previous" | "next" | "first" | "last"
  ) {
    const currentIndex = TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex = currentIndex;
    if (direction === "previous") {
      nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    } else if (direction === "next") {
      nextIndex = (currentIndex + 1) % TABS.length;
    } else if (direction === "first") {
      nextIndex = 0;
    } else {
      nextIndex = TABS.length - 1;
    }
    const nextTab = TABS[nextIndex].id;
    activateTab(nextTab);
    requestAnimationFrame(() =>
      document.getElementById(`email-tab-${nextTab}`)?.focus()
    );
  }

  return (
    <div className="grid gap-4">
      <div className="sticky top-[74px] z-40 rounded-2xl border border-[#dfdcdf] bg-white/95 p-1.5 shadow-[0_10px_28px_rgba(34,29,35,.08)] backdrop-blur-xl">
        <div
          className="grid grid-cols-4 gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Email management sections"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                id={`email-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`email-panel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => activateTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveTabFocus(tab.id, "previous");
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveTabFocus(tab.id, "next");
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    moveTabFocus(tab.id, "first");
                  } else if (event.key === "End") {
                    event.preventDefault();
                    moveTabFocus(tab.id, "last");
                  }
                }}
                className={`min-w-[150px] rounded-xl px-3 py-2.5 text-left transition-all ${
                  active
                    ? "bg-[#221d23] text-white shadow-sm"
                    : "text-[#69626a] hover:bg-[#f7f4ed] hover:text-[#29252b]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`grid h-8 w-8 flex-none place-items-center rounded-lg ${
                      active
                        ? "bg-[#ffce00] text-[#221d23]"
                        : "bg-[#f3f1f3] text-[#777078]"
                    }`}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-[10px]">
                      {tab.label}
                    </strong>
                    <small
                      className={`mt-0.5 block truncate text-[8px] ${
                        active ? "text-white/55" : "text-[#9a939b]"
                      }`}
                    >
                      {tab.description}
                    </small>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {TABS.map((tab) => (
        <div
          key={tab.id}
          id={`email-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`email-tab-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          {visitedTabs.has(tab.id) ? panels[tab.id] : null}
        </div>
      ))}
    </div>
  );
}
