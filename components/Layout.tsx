"use client";

import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEngine } from "@/lib/store";
import { Check, ChevronDown, Home, Sparkles, ListChecks, PiggyBank, ArrowLeft } from "lucide-react";
import { LogoutButton } from "@/app/(app)/logout-button";
import PageLoader from "@/components/PageLoader";
import { usePageLoadingControls } from "@/components/PageLoadingProvider";
import { selectMyCohort } from "@/app/actions/cohorts";
import { getMyCommitmentWallet } from "@/app/actions/commitment-wallet";
import { remainingEmailSequenceMs } from "@/lib/email-link-sequence";

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
  const { profile, isLoading, cohort, cohorts, refetch, personalPlanState, userActions, allActions } = useEngine();
  const pathname = usePathname();
  const router = useRouter();
  const [switchingCohort, setSwitchingCohort] = useState(false);
  const [commitmentScore, setCommitmentScore] = useState<{
    hasFinalisedPlan: boolean;
    score: number;
  } | null>(null);
  const { contentLoading, pendingHref, loaderTheme, beginNavigation } = usePageLoadingControls();

  const navItems = useMemo(
    () => [
      { href: "/journey", label: "Home", shortLabel: "Home", icon: Home },
      { href: "/plan", label: "My Plan", shortLabel: "Plan", icon: Sparkles },
      { href: "/actions", label: "My Actions", shortLabel: "Actions", icon: ListChecks },
      { href: "/wallet", label: "Commitment Points", shortLabel: "Points", icon: PiggyBank },
    ],
    []
  );

  // Actions retired unresolved when the next batch arrived — awaiting the
  // participant's "did you do this?" confirmation on the My Actions page.
  const pendingValidationCount = useMemo(() => {
    const actionIds = new Set(allActions.map((action) => action.id));
    return userActions.filter((item) => item.status === "failed" && item.autoExpired && actionIds.has(item.actionId)).length;
  }, [userActions, allActions]);

  const activePath = pendingHref || pathname || "";
  const isActive = (href: string) => activePath.startsWith(href);
  // Arrived from a reminder email's "Mark done" / "Confirm all" link
  // (?completeAction(s)=… on /actions): show Nudgie walking through the door
  // (step 2 of the email-link sequence) until the page is ready AND the door
  // animation has played once, then the actions page's notebook overlay takes
  // over. Cleared once this loader hides, since the actions page strips the
  // query string itself.
  const [fromEmailLink, setFromEmailLink] = useState(false);
  const [holdingDoor, setHoldingDoor] = useState(false);
  useLayoutEffect(() => {
    if (!/[?&]completeActions?=/.test(window.location.search)) return;
    setFromEmailLink(true);
    const remaining = remainingEmailSequenceMs("door");
    if (remaining <= 0) return;
    setHoldingDoor(true);
    const timer = window.setTimeout(() => setHoldingDoor(false), remaining);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  const showLoader = isLoading || contentLoading || holdingDoor;
  useEffect(() => {
    if (!showLoader) setFromEmailLink(false);
  }, [showLoader]);
  const viewingEarlierBatch = Boolean(cohort && cohorts.find((option) => option.id === cohort.id)?.isCurrent === false);
  async function switchCohort(cohortId: string) {
    if (!cohortId || cohortId === cohort?.id || switchingCohort) return;
    setSwitchingCohort(true);
    const result = await selectMyCohort(cohortId);
    if (!result.error) {
      await refetch({ syncPoints: false });
      router.refresh();
      // Land at the top of the page (top bar + company logo) on the new batch.
      window.scrollTo(0, 0);
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
    <div className={`participant-shell participant-shell--sidebar participant-shell--rcpl${viewingEarlierBatch ? " participant-shell--earlier-batch" : ""}`}>
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

          {cohorts.length > 0 && (() => {
            const currentOption = cohorts.find((option) => option.id === cohort?.id) ?? cohorts[0];
            // Nothing to switch to with a single batch, so the picker becomes a static label.
            const canSwitch = cohorts.length > 1;
            return (
              <details className={`rcpl-sidebar-batch-picker${canSwitch ? "" : " rcpl-sidebar-batch-picker--static"}`}>
                <summary
                  onClick={canSwitch ? undefined : (event) => event.preventDefault()}
                  tabIndex={canSwitch ? undefined : -1}
                >
                  <span>
                    <small>{switchingCohort ? "Switching…" : "Current view"}</small>
                    <strong title={`${currentOption.batchName}${currentOption.moduleName ? ` — ${currentOption.moduleName}` : ""}`}>
                      {currentOption.batchName}
                      {currentOption.moduleName ? ` — ${currentOption.moduleName}` : ""}
                    </strong>
                    {viewingEarlierBatch && <em className="rcpl-batch-picker-tag">Old module</em>}
                  </span>
                  {canSwitch && <ChevronDown size={16} />}
                </summary>
                {canSwitch && <div>
                  {cohorts.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      disabled={switchingCohort}
                      className={option.id === cohort?.id ? "active" : undefined}
                      onClick={(event) => {
                        void switchCohort(option.id);
                        event.currentTarget.closest("details")?.removeAttribute("open");
                      }}
                    >
                      <span>
                        <strong>
                          {option.batchName}
                          {option.moduleName ? ` — ${option.moduleName}` : ""}
                        </strong>
                        <small className={option.isCurrent ? "is-current" : undefined}>{option.isCurrent ? "Current module" : "Old module"}</small>
                      </span>
                      {option.id === cohort?.id && <Check size={14} strokeWidth={2.6} aria-label="Viewing" />}
                    </button>
                  ))}
                </div>}
              </details>
            );
          })()}

          <nav className="participant-nav" aria-label="Participant navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""} onClick={() => beginNavigation(item.href)}>
                <span className="participant-nav-icon"><item.icon size={17} strokeWidth={2.3} /></span>
                {item.label}
                {item.href === "/actions" && pendingValidationCount > 0 && (
                  <span className="participant-nav-badge" aria-label={`${pendingValidationCount} actions pending validation`}>{pendingValidationCount}</span>
                )}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          {role !== "user" && (
            <Link
              href="/admin"
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 mb-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: "rgba(255,206,0,0.12)",
                color: "var(--bright-amber)",
                border: "1px solid rgba(255,206,0,0.55)",
              }}
              onClick={() => beginNavigation("/admin")}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,206,0,0.22)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--bright-amber)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,206,0,0.12)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,206,0,0.55)";
              }}
            >
              <ArrowLeft size={14} strokeWidth={2} />
              Admin View
            </Link>
          )}

          <div className="participant-sidebar-user">
            <div className="participant-avatar">{profile.name.substring(0, 2).toUpperCase()}</div>
            <div><strong>{profile.name}</strong><small>Participant</small></div>
            {role === "user" && <div className="participant-logout"><LogoutButton variant="icon" /></div>}
          </div>
          {role !== "user" && <LogoutButton variant="sidebar-full" />}
        </div>
      </aside>

      <section className="participant-main">
        {showLoader && (fromEmailLink ? (
          <PageLoader variant="main" theme="email-door" label="Signing you in…" sublabel="Securely opening your account, no password needed" />
        ) : (
          <PageLoader variant="main" theme={loaderTheme} />
        ))}
        <header className="participant-topbar" style={showLoader ? { visibility: "hidden" } : undefined} aria-hidden={showLoader}>
          <div className="participant-topbar-row">
            <div className="participant-topbar-side">
              <span className="rcpl-topbar-title">Workspace</span>
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
            </div>

            {cohort?.batchName && (
              <div className="participant-topbar-center">
                <span className="participant-module-badge" title="Current view">{cohort.batchName}</span>
              </div>
            )}

            <div className="participant-topbar-actions">
              <Link href="/wallet" className="participant-points-pill" title="Commitment score" onClick={() => beginNavigation("/wallet")}>
                {commitmentLabel}
                <small>Commitment Score</small>
              </Link>
            </div>
          </div>
        </header>

        <main className="page-content" style={showLoader ? { visibility: "hidden" } : undefined} aria-hidden={showLoader}>
          {children}
        </main>
      </section>

      <nav className="participant-bottom-nav" aria-label="Mobile participant navigation">
        {navItems.slice(0, 4).map((item) => (
          <Link key={item.href} href={item.href} className={isActive(item.href) ? "active" : ""} onClick={() => beginNavigation(item.href)}>
            <span className="participant-bottom-nav-icon">
              <item.icon size={20} />
              {item.href === "/actions" && pendingValidationCount > 0 && (
                <span className="participant-nav-badge participant-nav-badge--dot" aria-label={`${pendingValidationCount} actions pending validation`}>{pendingValidationCount}</span>
              )}
            </span>
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
