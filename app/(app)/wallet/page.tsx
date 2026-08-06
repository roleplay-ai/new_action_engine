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

const MILESTONES = [
  { percent: 5, label: "Plant a tree", icon: "🌱" },
  { percent: 10, label: "Sponsor a nutritious meal for a child", icon: "🍲" },
  { percent: 25, label: "Donate books to a school", icon: "📚" },
  { percent: 50, label: "Fund learning kits for children", icon: "🎒" },
  { percent: 75, label: "Support a day of community meals", icon: "❤" },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString("en-IN");
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function milestonePoints(maximum: number, percent: number) {
  if (maximum <= 0) return 0;
  return Math.min(maximum, Math.ceil((maximum * percent) / 100 / 50) * 50);
}

function PersonalWallet({ summary }: { summary: CommitmentWalletSummary }) {
  const score = summary.hasFinalisedPlan ? clamp(summary.commitmentScore, 0, 100) : 0;
  const lossPercent = summary.plannedActions
    ? (summary.missedActions * 100) / summary.plannedActions
    : 0;

  return (
    <article className="wallet-card wallet-personal-card">
      <div className="wallet-label">Your commitment</div>
      <h2>Commitment Score</h2>

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
            <span>{summary.hasFinalisedPlan ? "COMMITMENT KEPT" : "FINALISE YOUR PLAN"}</span>
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

function TeamBucket({ summary }: { summary: CommitmentWalletSummary }) {
  const progress = summary.teamMaximumPoints
    ? clamp((summary.teamPoints / summary.teamMaximumPoints) * 100, 0, 100)
    : 0;
  const planFillHeight = summary.teamMaximumPoints
    ? (171 * clamp(summary.teamPlanPoints, 0, summary.teamMaximumPoints)) / summary.teamMaximumPoints
    : 0;
  const actionFillHeight = summary.teamMaximumPoints
    ? (171 * clamp(summary.teamActionPoints, 0, summary.teamMaximumPoints - summary.teamPlanPoints)) / summary.teamMaximumPoints
    : 0;
  const planFillTop = 249 - planFillHeight;
  const totalFillTop = planFillTop - actionFillHeight;
  const markerData = MILESTONES.map((milestone) => ({
    percent: milestone.percent,
    value: milestonePoints(summary.teamMaximumPoints, milestone.percent),
    y: 249 - (171 * milestone.percent) / 100,
    x: 225 - milestone.percent * 0.24,
  }));
  const nextMarkerValue = markerData.find((marker) => marker.value > summary.teamPoints)?.value;

  return (
    <div className="wallet-bucket-wrap">
      <div className="wallet-bucket-kicker">just added to the team</div>
      <svg
        className="wallet-team-bucket"
        viewBox="0 0 280 300"
        role="img"
        aria-label={`${formatNumber(summary.teamPoints)} of ${formatNumber(summary.teamMaximumPoints)} possible cohort points: ${formatNumber(summary.teamPlanPoints)} from finalised plans and ${formatNumber(summary.teamActionPoints)} from on-time actions`}
      >
        <defs>
          <clipPath id="commitmentWalletBucketClip">
            <path d="M50 78 L230 78 L207 249 Q140 273 73 249 Z" />
          </clipPath>
        </defs>

        <path d="M72 80 Q140 5 208 80" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".95" />
        <path d="M50 78 L230 78 L207 249 Q140 273 73 249 Z" fill="#332d34" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />

        {planFillHeight > 0 && (
          <g clipPath="url(#commitmentWalletBucketClip)">
            <rect x="45" y={planFillTop} width="190" height={planFillHeight + 18} fill="#f3ae45" />
          </g>
        )}

        {actionFillHeight > 0 && (
          <g clipPath="url(#commitmentWalletBucketClip)">
            <rect x="45" y={totalFillTop} width="190" height={actionFillHeight + 2} fill="#ffce00" />
          </g>
        )}

        {planFillHeight + actionFillHeight > 0 && (
          <g clipPath="url(#commitmentWalletBucketClip)">
            <path
              d={`M45 ${totalFillTop + 3} Q76 ${totalFillTop - 7} 107 ${totalFillTop + 3} T169 ${totalFillTop + 3} T235 ${totalFillTop + 3} L235 ${totalFillTop + 15} L45 ${totalFillTop + 15} Z`}
              fill={actionFillHeight > 0 ? "#ffda33" : "#f7bd63"}
            />
          </g>
        )}

        {markerData.map((marker) => {
          const active = marker.value > 0 && marker.value <= summary.teamPoints;
          const next = marker.value > 0 && marker.value === nextMarkerValue;
          return (
            <g key={marker.percent}>
              <line x1={marker.x} y1={marker.y} x2="243" y2={marker.y} stroke={active || next ? "#ffce00" : "#716a72"} strokeWidth={next ? "3" : "2"} />
              <text x="248" y={marker.y + 4} fill={active || next ? "#ffce00" : "#afa7b1"} fontSize="8" fontWeight={active || next ? "800" : "700"}>
                {formatNumber(marker.value)}
              </text>
            </g>
          );
        })}

        <text x="140" y="237" textAnchor="middle" fill={progress >= 8 ? "#221d23" : "#fff"} fontSize="22" fontWeight="800">
          {formatNumber(summary.teamPoints)}
        </text>
        <text x="140" y="252" textAnchor="middle" fill={progress >= 8 ? "#5b4700" : "#c7c0c8"} fontSize="8" fontWeight="800" letterSpacing="1.2">
          ACTION POINTS
        </text>
      </svg>
    </div>
  );
}

function TeamWallet({ summary }: { summary: CommitmentWalletSummary }) {
  const teamActionCapacity = Math.max(0, summary.teamMaximumPoints / 50 - summary.teamMemberCount);
  const nextMilestone = MILESTONES.find(
    (milestone) => summary.teamPoints < milestonePoints(summary.teamMaximumPoints, milestone.percent)
  );
  const nextPoints = nextMilestone
    ? milestonePoints(summary.teamMaximumPoints, nextMilestone.percent)
    : summary.teamMaximumPoints;
  const pointsToGo = Math.max(0, nextPoints - summary.teamPoints);

  return (
    <article className="wallet-card wallet-team-card">
      <div className="wallet-team-top">
        <div>
          <div className="wallet-label">Our shared progress</div>
          <h2>Team Action Bank</h2>
        </div>
        <div className="wallet-team-total">
          <strong>{formatNumber(summary.teamPoints)}</strong>
          <span>Team Action Points</span>
          <small>
            {formatNumber(summary.teamMaximumPoints)} possible · {formatNumber(teamActionCapacity)} actions + {formatNumber(summary.teamMemberCount)} finalised plans · 50 points each
          </small>
        </div>
      </div>

      <div className="wallet-bank-area">
        <div className="wallet-bank-copy">
          <div className="wallet-next-reward">
            <div aria-hidden="true">🎁</div>
            <span>
              <small>
                {summary.teamMaximumPoints === 0
                  ? "Waiting for finalised plans"
                  : nextMilestone
                    ? `Next · ${formatNumber(nextPoints)} points`
                    : "All milestones unlocked"}
              </small>
              <strong>
                {summary.teamMaximumPoints === 0
                  ? "The cohort maximum appears after a plan is finalised"
                  : nextMilestone
                    ? `${formatNumber(pointsToGo)} points to unlock`
                    : "The cohort reached every current reward"}
              </strong>
            </span>
          </div>

          <div className="wallet-impact-grid">
            <div><strong>{formatNumber(summary.personalPoints)}</strong><span>Your Action Points</span></div>
            <div>
              <strong>{summary.contributionRank ? `#${summary.contributionRank} of ${summary.teamMemberCount}` : "—"}</strong>
              <span>Contribution rank</span>
            </div>
          </div>
        </div>

        <TeamBucket summary={summary} />
      </div>
    </article>
  );
}

function WalletMilestones({ summary }: { summary: CommitmentWalletSummary }) {
  const progress = summary.teamMaximumPoints
    ? clamp((summary.teamPoints / summary.teamMaximumPoints) * 100, 0, 100)
    : 0;

  return (
    <section className="wallet-milestone-section">
      <div className="wallet-milestone-head">
        <div><span className="wallet-label">Team impact rewards</span><h3>Every milestone creates a little more good</h3></div>
      </div>

      <div className="wallet-rewards">
        <div className="wallet-rewards-track"><span style={{ width: `${progress}%` }} /></div>
        {MILESTONES.map((milestone) => {
          const threshold = milestonePoints(summary.teamMaximumPoints, milestone.percent);
          const done = threshold > 0 && summary.teamPoints >= threshold;
          const next = threshold > 0 && !done && MILESTONES.every((candidate) => {
            const candidateThreshold = milestonePoints(summary.teamMaximumPoints, candidate.percent);
            return candidate.percent >= milestone.percent || summary.teamPoints >= candidateThreshold;
          });
          return (
            <div className={`wallet-reward-step ${done ? "done" : ""} ${next ? "next" : ""}`} key={milestone.percent}>
              <div className="wallet-reward-dot" aria-hidden="true">{milestone.icon}</div>
              <strong>{formatNumber(threshold)} · {milestone.percent}%</strong>
              <span>{milestone.label}</span>
              {next && <em>NEXT · {formatNumber(Math.max(0, threshold - summary.teamPoints))} TO GO</em>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function WalletPage() {
  const { summary, error } = await getMyCommitmentWallet();

  return (
    <div className="commitment-wallet-page animate-in fade-in duration-700">
      <header className="wallet-page-heading">
        <span>Nudgeable · Commitment Wallet</span>
        <h1>Keep your commitment.<br />Move the team forward.</h1>
      </header>

      {error && <div className="wallet-error" role="alert">The Wallet could not be loaded: {error}</div>}

      <section className="wallet-rule-strip" aria-label="How the Commitment Wallet works">
        <div><span className="good"><Check size={18} /></span><p>Complete <strong>+50 Action Points</strong></p></div>
        <i />
        <div><span className="miss"><Minus size={18} /></span><p>Miss <strong>Commitment Score ↓</strong></p></div>
      </section>

      <section className="wallet-main-grid">
        <PersonalWallet summary={summary} />
        <TeamWallet summary={summary} />
      </section>

      <WalletMilestones summary={summary} />

      <section className="wallet-footer-action">
        <div>
          <strong>{summary.hasFinalisedPlan ? "Your next on-time action can move the team 50 points closer." : "Finalise your plan to establish your commitment and cohort maximum."}</strong>
        </div>
        <Link href={summary.hasFinalisedPlan ? "/actions" : "/plan"}>
          {summary.hasFinalisedPlan ? "View my next action" : "Go to my plan"} <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}
