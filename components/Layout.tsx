"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEngine } from "@/lib/store";
import { ChevronDown, Home, Sparkles, ListChecks, PiggyBank, ShieldCheck } from "lucide-react";
import { LogoutButton } from "@/app/(app)/logout-button";
import PageLoader from "@/components/PageLoader";
import { usePageLoadingControls } from "@/components/PageLoadingProvider";
import { selectMyCohort } from "@/app/actions/cohorts";
import { getMyCommitmentWallet } from "@/app/actions/commitment-wallet";

interface LayoutProps {
  children: React.ReactNode;
  role: string;
}

/** Displays as a whole number; the underlying score keeps decimal precision in calculations. */
function formatCommitmentScore(value: number) {
  const clamped = Math.min(100, Math.max(0, value));
  return String(Math.round(clamped));
}

const Layout: React.FC<LayoutProps> = ({ children, role }) => {
  const { profile, isLoading, cohort, cohorts, refetch, personalPlanState, userActions } = useEngine();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [switchingCohort, setSwitchingCohort] = useState(false);
  const [commitmentScore, setCommitmentScore] = useState<{
    hasFinalisedPlan: boolean;
    score: number;
  } | null>(null);
  const { contentLoading, pendingHref, beginNavigation } = usePageLoadingControls();

  const navItems = useMemo(() => {
    const items = [
      { href: "/journey", label: "Home", shortLabel: "Home", icon: Home },
      { href: "/plan", label: "My Plan", shortLabel: "Plan", icon: Sparkles },
      { href: "/actions", label: "My Actions", shortLabel: "Actions", icon: ListChecks },
      { href: "/wallet", label: "Commitment Bank", shortLabel: "Bank", icon: PiggyBank },
    ];
    if (role !== "user") items.push({ href: "/admin", label: "Admin", shortLabel: "Admin", icon: ShieldCheck });
    return items;
  }, [role]);

  const activePath = pendingHref || pathname || "";
  const isActive = (href: string) => activePath.startsWith(href);
  const showLoader = isLoading || contentLoading;
  const isRcpl = cohort?.companyName?.trim().toLowerCase() === "rcpl university";
  const rcplPhase = ["1", "2", "3"].includes(searchParams.get("phase") ?? "") ? searchParams.get("phase")! : "1";
  const rcplPhases = [
    { id: "1", label: "Phase 1", title: "Leading Business & Future", window: "Month 1" },
    { id: "2", label: "Phase 2", title: "Leading Self", window: "Month 3" },
    { id: "3", label: "Phase 3", title: "Leading Others", window: "Month 5" },
  ];
  const currentRcplPhase = rcplPhases.find((phase) => phase.id === rcplPhase) ?? rcplPhases[0];

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

  const actionProgressKey = useMemo(
    () =>
      userActions
        .map((action) => `${action.id}:${action.status}:${action.completedLate ? 1 : 0}`)
        .join("|"),
    [userActions]
  );

  useEffect(() => {
    let cancelled = false;
    void getMyCommitmentWallet().then((result) => {
      if (cancelled) return;
      setCommitmentScore({
        hasFinalisedPlan: result.summary.hasFinalisedPlan,
        score: result.summary.commitmentScore,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [cohort?.id, personalPlanState, actionProgressKey]);

  const commitmentLabel = commitmentScore?.hasFinalisedPlan
    ? `${formatCommitmentScore(commitmentScore.score)}%`
    : "—";

  return (
    <div className={`participant-shell participant-shell--sidebar${isRcpl ? " participant-shell--rcpl" : ""}`}>
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

          {isRcpl && pathname.startsWith("/journey") && (
            <details className="rcpl-sidebar-phase-picker">
              <summary>
                <span><small>Current phase</small><strong>{currentRcplPhase.label} · {currentRcplPhase.title}</strong></span>
                <ChevronDown size={15} />
              </summary>
              <div>
                {rcplPhases.map((phase) => (
                  <Link key={phase.id} href={`/journey?phase=${phase.id}`} className={phase.id === rcplPhase ? "active" : ""}>
                    <strong>{phase.label} · {phase.title}</strong><small>{phase.window}</small>
                  </Link>
                ))}
              </div>
            </details>
          )}

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
          {isRcpl && <span className="rcpl-topbar-title">Workspace</span>}
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
            <Link href="/wallet" className="participant-points-pill" title="Commitment score" onClick={() => beginNavigation("/wallet")}>
              {commitmentLabel}
              <small>CS</small>
            </Link>
          </div>
        </header>

        <main className="page-content" style={showLoader ? { visibility: "hidden" } : undefined} aria-hidden={showLoader}>
          {children}
        </main>
      </section>

      <nav className="participant-bottom-nav" aria-label="Mobile participant navigation">
        {navItems.slice(0, 4).map((item) => (
          <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""} onClick={() => beginNavigation(item.href)}>
            <item.icon size={20} />
            <span className="participant-nav-label">
              <span className="participant-nav-label-full">{item.label}</span>
              <span className="participant-nav-label-short">{item.shortLabel}</span>
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
