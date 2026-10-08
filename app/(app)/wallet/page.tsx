import Link from "next/link";
import {
  ArrowRight,
  Check,
  Minus,
} from "lucide-react";
import {
  getMyCommitmentWallet,
  type CommitmentWalletSummary,
} from "@/app/actions/commitment-wallet";
import { getMyCohort } from "@/app/actions/cohorts";
import { cohortLockInfo } from "@/lib/cohort-lock";
import { CohortLockedNotice } from "@/components/CohortLockedNotice";
import { getMySurpriseShelf } from "@/app/actions/surprise-boxes";
import SurpriseBoxes from "@/components/SurpriseBoxes";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Displays as a whole number; the underlying values keep decimal precision in calculations. */
function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function PersonalWallet({ summary }: { summary: CommitmentWalletSummary }) {
  const score = summary.hasFinalisedPlan ? clamp(summary.commitmentScore, 0, 100) : 0;
  const lossPercent = summary.plannedActions
    ? (summary.missedActions * 100) / summary.plannedActions
    : 0;

  return (
    <article className="wallet-card wallet-personal-card">
      <div className="wallet-label">Your consistency</div>
      <h2>Your Commitment Score</h2>

      <div className="wallet-gauge-wrap">
        <div
          className={`wallet-gauge ${summary.hasFinalisedPlan ? "" : "is-empty"}`}
          style={{
            background: summary.hasFinalisedPlan
              ? `conic-gradient(#ffce00 ${score}%, rgba(237,69,81,.2) 0)`
              : "conic-gradient(#ebe7df 100%, #ebe7df 0)",
          }}
          role="img"
          aria-label={
            summary.hasFinalisedPlan
              ? `${formatPercent(score)} commitment score`
              : "Commitment score available after plan finalisation"
          }
        >
          <div className="wallet-gauge-value">
            <strong>{summary.hasFinalisedPlan ? formatPercent(score) : "—"}</strong>
            <span>{summary.hasFinalisedPlan ? "Commitment kept" : "Finalise your plan"}</span>
          </div>
        </div>
      </div>

      {summary.hasFinalisedPlan ? (
        summary.missedActions > 0 ? (
          <div className="wallet-loss-chip">
            {summary.missedActions} missed action{summary.missedActions === 1 ? "" : "s"} · −{formatPercent(lossPercent)} commitment
          </div>
        ) : null
      ) : (
        <div className="wallet-plan-note">
          Your score starts at 100% when you finalise your action plan.
        </div>
      )}

      <div className="wallet-personal-stats">
        <div><strong>{summary.plannedActions}</strong><span>Actions committed</span></div>
        <div><strong>{summary.completedOnTimeActions}</strong><span>Actions completed</span></div>
        <div><strong>{summary.missedActions}</strong><span>Actions missed</span></div>
      </div>

      {!summary.hasFinalisedPlan && (
        <Link href="/plan" className="wallet-inline-link">
          Go to my plan <ArrowRight size={14} />
        </Link>
      )}
    </article>
  );
}

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { cohort } = await getMyCohort({ includeRoster: false });
  const lock = cohortLockInfo(cohort);
  if (lock.locked) {
    return (
      <CohortLockedNotice
        title="Your Commitment Wallet isn't open yet"
        body="Your trainer or admin hasn't opened up the Commitment Wallet for you yet."
        daysToGo={lock.daysToGo}
      />
    );
  }

  const [{ summary, error }, { shelf }, params] = await Promise.all([
    getMyCommitmentWallet(cohort?.id),
    getMySurpriseShelf(cohort?.id),
    searchParams,
  ]);
  // /wallet?reveal=<unlockId,…> — set after completing an action — opens those boxes.
  const revealUnlockIds = (Array.isArray(params.reveal) ? params.reveal.join(",") : params.reveal ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  return (
    <div className="commitment-wallet-page animate-in fade-in duration-700">
      <header className="wallet-page-heading">
        <h1>Keep your promise.<br />Unlock your surprises.</h1>
        <p>Stay consistent. Every action you complete opens a Surprise Box with a video or resource picked for that action.</p>
      </header>

      {error && <div className="wallet-error" role="alert">The Wallet could not be loaded: {error}</div>}

      <section className="wallet-banner-row" aria-label="How the Commitment Wallet works">
        <div className="wallet-banner miss">
          <span className="wallet-banner-icon"><Minus size={22} /></span>
          <div>
            <small>Miss an action</small>
            <strong>Commitment Score ↓</strong>
          </div>
        </div>
        <div className="wallet-banner complete">
          <span className="wallet-banner-icon"><Check size={22} /></span>
          <div>
            <small>Complete an action</small>
            <strong>{shelf.enabled ? "A Surprise Box opens" : "Commitment Score stays strong"}</strong>
          </div>
        </div>
      </section>

      <section className={`wallet-main-grid ${shelf.boxes.length ? "wallet-main-grid--boxes" : "wallet-main-grid--single"}`}>
        <PersonalWallet summary={summary} />
        <SurpriseBoxes shelf={shelf} revealUnlockIds={revealUnlockIds} />
      </section>

      <section className="wallet-footer-action">
        <div>
          <strong>
            {!summary.hasFinalisedPlan
              ? "Finalise your plan to start your Commitment Score."
              : shelf.enabled
                ? "Your next completed action opens your next Surprise Box."
                : "Your next on-time action keeps your Commitment Score strong."}
          </strong>
        </div>
        <Link href={summary.hasFinalisedPlan ? "/actions" : "/plan"}>
          {summary.hasFinalisedPlan ? "View my next action" : "Go to my plan"} <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}
