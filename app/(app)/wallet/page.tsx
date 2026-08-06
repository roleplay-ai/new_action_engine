import Link from "next/link";
import {
  ArrowRight,
  Backpack,
  BookOpen,
  Check,
  Gift,
  HeartHandshake,
  Minus,
  Soup,
  Sprout,
} from "lucide-react";
import {
  getMyCommitmentWallet,
  type CommitmentWalletSummary,
} from "@/app/actions/commitment-wallet";

const MILESTONES = [
  { percent: 5, label: "Plant a tree", Icon: Sprout },
  { percent: 10, label: "Sponsor a nutritious meal for a child", Icon: Soup },
  { percent: 25, label: "Donate books to a school", Icon: BookOpen },
  { percent: 50, label: "Fund learning kits for children", Icon: Backpack },
  { percent: 75, label: "Support a day of community meals", Icon: HeartHandshake },
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
        ) : (
          <div className="wallet-kept-chip"><Check size={12} /> No missed actions</div>
        )
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
  const fillHeight = (171 * progress) / 100;
  const fillTop = 249 - fillHeight;
  const markerData = [
    { percent: 100, y: 91 },
    { percent: 75, y: 132 },
    { percent: 50, y: 174 },
    { percent: 25, y: 216 },
  ];

  return (
    <div className="wallet-bucket-wrap">
      <div className="wallet-bucket-kicker"><strong>+50</strong> per on-time action</div>
      <svg
        className="wallet-team-bucket"
        viewBox="0 0 280 300"
        role="img"
        aria-label={`${formatNumber(summary.teamPoints)} of ${formatNumber(summary.teamMaximumPoints)} possible cohort Action Points`}
      >
        <defs>
          <clipPath id="commitmentWalletBucketClip">
            <path d="M50 78 L230 78 L207 249 Q140 273 73 249 Z" />
          </clipPath>
        </defs>

        <path d="M72 80 Q140 5 208 80" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".95" />
        <path d="M50 78 L230 78 L207 249 Q140 273 73 249 Z" fill="#332d34" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />

        {fillHeight > 0 && (
          <g clipPath="url(#commitmentWalletBucketClip)">
            <rect x="45" y={fillTop} width="190" height={fillHeight + 18} fill="#ffce00" />
            <path
              d={`M45 ${fillTop + 3} Q76 ${fillTop - 7} 107 ${fillTop + 3} T169 ${fillTop + 3} T235 ${fillTop + 3} L235 ${fillTop + 15} L45 ${fillTop + 15} Z`}
              fill="#ffda33"
            />
          </g>
        )}

        {markerData.map((marker) => {
          const value = Math.round((summary.teamMaximumPoints * marker.percent) / 100);
          return (
            <g key={marker.percent}>
              <line x1="218" y1={marker.y} x2="243" y2={marker.y} stroke={progress >= marker.percent ? "#ffce00" : "#716a72"} strokeWidth="2" />
              <text x="248" y={marker.y + 4} fill={progress >= marker.percent ? "#ffce00" : "#afa7b1"} fontSize="8" fontWeight="700">
                {formatNumber(value)}
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
      <div className="wallet-rank-pill">
        <strong>{summary.contributionRank ? `#${summary.contributionRank}` : "—"}</strong>
        <span>of {summary.teamMemberCount || 0} contributors</span>
      </div>
    </div>
  );
}

function TeamWallet({ summary }: { summary: CommitmentWalletSummary }) {
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
          <p>Every on-time action moves the whole cohort forward.</p>
        </div>
        <div className="wallet-team-total">
          <strong>{formatNumber(summary.teamPoints)}</strong>
          <span>Team Action Points</span>
          <small>
            {formatNumber(summary.teamMaximumPoints)} possible · {formatNumber(summary.teamMaximumPoints / 50)} actions × 50
          </small>
        </div>
      </div>

      <div className="wallet-bank-area">
        <div className="wallet-bank-copy">
          <div className="wallet-next-reward">
            <div><Gift size={21} /></div>
            <span>
              <small>
                {summary.teamMaximumPoints === 0
                  ? "Waiting for finalised plans"
                  : nextMilestone
                    ? `Next · ${nextMilestone.percent}% · ${formatNumber(nextPoints)} points`
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
            <div><strong>{formatNumber(summary.personalMaximumPoints)}</strong><span>Your maximum contribution</span></div>
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
        <p>Milestones scale with this cohort&apos;s finalised maximum.</p>
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
              <div className="wallet-reward-dot"><milestone.Icon size={19} /></div>
              <strong>{milestone.percent}% · {formatNumber(threshold)} points</strong>
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
  const { summary, cohortName, error } = await getMyCommitmentWallet();

  return (
    <div className="commitment-wallet-page animate-in fade-in duration-700">
      <header className="wallet-page-heading">
        <span>Nudgeable · Commitment Wallet</span>
        <h1>Keep your commitment.<br />Move the team forward.</h1>
        <p>{cohortName ? `${cohortName} · ` : ""}Your score protects the promise. Your on-time actions fill the shared bank.</p>
      </header>

      {error && <div className="wallet-error" role="alert">The Wallet could not be loaded: {error}</div>}

      <section className="wallet-rule-strip" aria-label="How the Commitment Wallet works">
        <div><span className="good"><Check size={18} /></span><p>Complete on the assigned date <strong>+50 team points</strong></p></div>
        <i />
        <div><span className="miss"><Minus size={18} /></span><p>Miss the date <strong>Commitment Score ↓</strong></p></div>
      </section>

      <section className="wallet-main-grid">
        <PersonalWallet summary={summary} />
        <TeamWallet summary={summary} />
      </section>

      <WalletMilestones summary={summary} />

      <section className="wallet-footer-action">
        <div>
          <strong>{summary.hasFinalisedPlan ? "Your next on-time action can move the team 50 points closer." : "Finalise your plan to establish your commitment and cohort maximum."}</strong>
          <span>Late completions remain part of your history, but do not restore the score or add points.</span>
        </div>
        <Link href={summary.hasFinalisedPlan ? "/actions" : "/plan"}>
          {summary.hasFinalisedPlan ? "View my next action" : "Go to my plan"} <ArrowRight size={14} />
        </Link>
      </section>
    </div>
  );
}
