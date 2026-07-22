"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEngine } from "@/lib/store";
import { Map, NotebookPen, Sparkles, ListChecks, Bell, ShieldCheck } from "lucide-react";
import { LogoutButton } from "@/app/(app)/logout-button";
import GenerationStatus from "@/components/GenerationStatus";
import PageLoader from "@/components/PageLoader";
import { usePageLoadingControls } from "@/components/PageLoadingProvider";
import { selectMyCohort } from "@/app/actions/cohorts";

interface LayoutProps {
  children: React.ReactNode;
  role: string;
}

const Layout: React.FC<LayoutProps> = ({ children, role }) => {
  const { profile, generationJob, isLoading, cohort, cohorts, refetch } = useEngine();
  const pathname = usePathname();
  const router = useRouter();
  const [switchingCohort, setSwitchingCohort] = useState(false);
  const { contentLoading, pendingHref, beginNavigation } = usePageLoadingControls();

  const navItems = useMemo(() => {
    const items = [
      { href: "/journey", label: "Journey", icon: Map },
      { href: "/notes", label: "Notes", icon: NotebookPen },
      { href: "/plan", label: "Plan", icon: Sparkles },
      { href: "/actions", label: "Actions", icon: ListChecks },
    ];
    if (role !== "user") {
      items.push({ href: "/admin", label: "Admin", icon: ShieldCheck });
    }
    return items;
  }, [role]);

  const activePath = pendingHref || pathname || "";
  const isActive = (href: string) => activePath.startsWith(href);
  const showLoader = isLoading || contentLoading;

  async function switchCohort(cohortId: string) {
    if (!cohortId || cohortId === cohort?.id || switchingCohort) return;
    setSwitchingCohort(true);
    const result = await selectMyCohort(cohortId);
    if (!result.error) {
      await refetch({ syncPoints: false });
      router.refresh();
    }
    setSwitchingCohort(false);
  }

  return (
    <div className="participant-shell">
      <aside className="participant-sidebar">
        <div>
          <Link href="/journey" className="participant-brand" onClick={() => beginNavigation("/journey")}>
            <img src="/icon.png" alt="Nudgeable logo" style={{ height: 36, width: "auto", display: "block" }} />
            <span>
              <strong>Nudgeable</strong>
              <small>Action Engine</small>
            </span>
          </Link>
          <div className="participant-progress-card">
            <small>Your learning journey</small>
            <strong>Keep turning insight into action.</strong>
            <div className="participant-progress-track">
              <span style={{ width: `${Math.min(100, Math.max(8, profile.weeklyGoal * 10))}%` }} />
            </div>
            <p>{profile.streak > 0 ? `${profile.streak} day streak` : "Your progress appears here"}</p>
          </div>
          <nav className="participant-nav" aria-label="Participant navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? "active" : ""}
                onClick={() => beginNavigation(item.href)}
              >
                <span className="participant-nav-icon">
                  <item.icon size={17} strokeWidth={2.3} />
                </span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="participant-sidebar-user">
          <div className="participant-avatar">{profile.name.substring(0, 2).toUpperCase()}</div>
          <div>
            <strong>{profile.name}</strong>
            <small>Participant</small>
          </div>
          <div className="participant-logout">
            <LogoutButton variant="icon" />
          </div>
        </div>
      </aside>

      <section className="participant-main">
        {showLoader && <PageLoader variant="main" />}
        <header
          className="participant-topbar"
          style={showLoader ? { visibility: "hidden" } : undefined}
          aria-hidden={showLoader}
        >
          <Link href="/journey" className="participant-mobile-brand" onClick={() => beginNavigation("/journey")}>
            <img src="/icon.png" alt="" /> <strong>Nudgeable</strong>
          </Link>
          <div className="participant-topbar-actions">
            {cohorts.length > 0 && <label className="participant-cohort-switcher">
              <span>Cohort</span>
              <select
                aria-label="View cohort"
                value={cohort?.id ?? ""}
                disabled={switchingCohort}
                onChange={(event) => void switchCohort(event.target.value)}
              >
                {cohorts.map((option) => <option key={option.id} value={option.id}>
                  {option.name}{option.isCurrent ? " · Current" : " · Earlier"}
                </option>)}
              </select>
            </label>}
            <span className="tag tag--featured">🔥 {profile.streak}</span>
            <div style={{ position: "relative" }}>
              <button className="btn btn--icon" aria-label="Notifications">
                <Bell size={16} />
                {generationJob && <span className="bell-badge" />}
              </button>
              {generationJob && (
                <div className="bell-status-popover">
                  <GenerationStatus job={generationJob} />
                </div>
              )}
            </div>
            <div className="participant-avatar">{profile.name.substring(0, 2).toUpperCase()}</div>
          </div>
        </header>
        <main
          className="page-content"
          style={showLoader ? { visibility: "hidden" } : undefined}
          aria-hidden={showLoader}
        >
          {children}
        </main>
      </section>

      <nav className="participant-bottom-nav" aria-label="Mobile participant navigation">
        {navItems.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? "active" : ""}
            onClick={() => beginNavigation(item.href)}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
