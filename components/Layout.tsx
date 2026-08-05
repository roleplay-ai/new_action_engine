"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEngine } from "@/lib/store";
import { Home, Sparkles, ListChecks, PiggyBank, ShieldCheck, Flame } from "lucide-react";
import { LogoutButton } from "@/app/(app)/logout-button";
import PageLoader from "@/components/PageLoader";
import { usePageLoadingControls } from "@/components/PageLoadingProvider";
import { selectMyCohort } from "@/app/actions/cohorts";

interface LayoutProps {
  children: React.ReactNode;
  role: string;
}

const Layout: React.FC<LayoutProps> = ({ children, role }) => {
  const { profile, isLoading, cohort, cohorts, refetch } = useEngine();
  const pathname = usePathname();
  const router = useRouter();
  const [switchingCohort, setSwitchingCohort] = useState(false);
  const { contentLoading, pendingHref, beginNavigation } = usePageLoadingControls();

  const navItems = useMemo(() => {
    const items = [
      { href: "/journey", label: "Workspace", icon: Home },
      { href: "/plan", label: "My Plan", icon: Sparkles },
      { href: "/actions", label: "My Actions", icon: ListChecks },
      { href: "/wallet", label: "Wallet", icon: PiggyBank },
    ];
    if (role !== "user") items.push({ href: "/admin", label: "Admin", icon: ShieldCheck });
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
    <div className="participant-shell participant-shell--sidebar">
      <aside className="participant-sidebar">
        <div>
          <Link href="/journey" className="participant-brand" onClick={() => beginNavigation("/journey")}>
            {cohort?.companyLogoUrl ? (
              <img src={cohort.companyLogoUrl} alt={`${cohort.companyName || "Company"} logo`} />
            ) : (
              <span className="participant-brand-fallback">
                {(cohort?.companyName || "Company").split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
              </span>
            )}
            <span><strong>{cohort?.companyName || "Your company"}</strong></span>
          </Link>

          <div className="participant-progress-card">
            <small>Your learning journey</small>
            <strong>Keep turning insight into action.</strong>
            <div className="participant-progress-track"><span style={{ width: `${Math.min(100, Math.max(8, profile.weeklyGoal * 10))}%` }} /></div>
            <p>{profile.streak > 0 ? `${profile.streak} day streak` : "Your progress appears here"}</p>
          </div>

          <nav className="participant-nav" aria-label="Participant navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""} onClick={() => beginNavigation(item.href)}>
                <span className="participant-nav-icon"><item.icon size={17} strokeWidth={2.3} /></span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="participant-sidebar-user">
          <div className="participant-avatar">{profile.name.substring(0, 2).toUpperCase()}</div>
          <div><strong>{profile.name}</strong><small>Participant</small></div>
          <div className="participant-logout"><LogoutButton variant="icon" /></div>
        </div>
      </aside>

      <section className="participant-main">
        {showLoader && <PageLoader variant="main" />}
        <header className="participant-topbar" style={showLoader ? { visibility: "hidden" } : undefined} aria-hidden={showLoader}>
          <Link href="/journey" className="participant-mobile-brand" onClick={() => beginNavigation("/journey")}>
            {cohort?.companyLogoUrl ? (
              <img src={cohort.companyLogoUrl} alt="" />
            ) : (
              <span className="participant-brand-fallback participant-brand-fallback--sm">
                {(cohort?.companyName || "C").split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
              </span>
            )}
            <strong>{cohort?.companyName || "Your company"}</strong>
          </Link>
          <div className="participant-topbar-actions">
            {cohorts.length > 0 && <label className="participant-cohort-switcher">
              <select aria-label="View cohort" value={cohort?.id ?? ""} disabled={switchingCohort} onChange={(event) => void switchCohort(event.target.value)}>
                {cohorts.map((option) => <option key={option.id} value={option.id}>{option.name}{option.isCurrent ? " · Current" : " · Earlier"}</option>)}
              </select>
            </label>}
            <span className="participant-points-pill" title="Action points">{profile.totalPoints}<small>AP</small></span>
            <span className="participant-streak-pill" title="Current streak"><Flame size={15} fill="currentColor" />{profile.streak}</span>
            <img className="participant-topbar-favicon" src="/icon.png" alt="Nudgeable" title="Nudgeable" />
          </div>
        </header>

        <main className="page-content" style={showLoader ? { visibility: "hidden" } : undefined} aria-hidden={showLoader}>
          {children}
        </main>
      </section>

      <nav className="participant-bottom-nav" aria-label="Mobile participant navigation">
        {navItems.slice(0, 4).map((item) => (
          <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""} onClick={() => beginNavigation(item.href)}>
            <item.icon size={20} /><span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
