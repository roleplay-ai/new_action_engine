import { getMyCohorts } from "@/app/actions/cohorts";
import { getCohortWalletSummary } from "@/app/actions/leaderboard";

function CohortPiggyBank() {
  return (
    <svg className="wallet-pig-svg" viewBox="0 0 430 330" role="img" aria-label="Cohort points piggy bank">
      <defs>
        <linearGradient id="walletPigBody" x1="85" y1="72" x2="320" y2="276" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0A6" />
          <stop offset=".48" stopColor="#FFD22E" />
          <stop offset="1" stopColor="#F0A500" />
        </linearGradient>
        <linearGradient id="walletPigSnout" x1="307" y1="146" x2="374" y2="211" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE875" />
          <stop offset="1" stopColor="#E9A900" />
        </linearGradient>
        <linearGradient id="walletCoin" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FFF7B8" />
          <stop offset=".44" stopColor="#FFCE00" />
          <stop offset="1" stopColor="#E69B00" />
        </linearGradient>
        <radialGradient id="walletGlow">
          <stop stopColor="#FFCE00" stopOpacity=".34" />
          <stop offset="1" stopColor="#FFCE00" stopOpacity="0" />
        </radialGradient>
        <filter id="walletPigShadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#000000" floodOpacity=".34" />
        </filter>
      </defs>

      <circle className="wallet-pig-glow" cx="222" cy="171" r="150" fill="url(#walletGlow)" />
      <path className="wallet-pig-orbit" d="M53 193C84 71 254 24 373 112" />
      <path className="wallet-pig-orbit wallet-pig-orbit--short" d="M92 269c93 47 222 19 278-68" />

      <g className="wallet-pig-sparkles" aria-hidden="true">
        <path d="M79 91v24M67 103h24" />
        <path d="M360 75v19M350.5 84.5h19" />
        <path d="M380 237v14M373 244h14" />
        <circle cx="111" cy="55" r="4" />
        <circle cx="390" cy="132" r="3" />
      </g>

      <ellipse className="wallet-pig-ground" cx="231" cy="285" rx="154" ry="20" />

      <g className="wallet-pig-coins wallet-pig-coins--left" filter="url(#walletPigShadow)">
        <ellipse cx="74" cy="273" rx="31" ry="10" />
        <path d="M43 256v17c0 5.5 14 10 31 10s31-4.5 31-10v-17" />
        <ellipse cx="74" cy="256" rx="31" ry="10" />
        <path d="M49 240v15c0 5 11.2 9 25 9s25-4 25-9v-15" />
        <ellipse cx="74" cy="240" rx="25" ry="9" />
      </g>

      <g className="wallet-pig-character" filter="url(#walletPigShadow)">
        <path className="wallet-pig-tail" d="M111 158c-36-24-50 21-22 22 20 1 21-27 1-31" />
        <path className="wallet-pig-ear wallet-pig-ear--back" d="M257 93c-5-32 5-54 31-69 15 27 13 53-6 76Z" />
        <path className="wallet-pig-leg" d="M146 235v39c0 7 6 12 13 12h15c7 0 13-5 13-12v-30" />
        <path className="wallet-pig-leg" d="M266 242v32c0 7 6 12 13 12h15c7 0 13-5 13-12v-48" />
        <path className="wallet-pig-body" d="M102 184c0-65 53-110 127-110 70 0 121 38 129 96 6 47-16 85-62 101-33 12-106 10-146-4-31-11-48-39-48-83Z" />
        <ellipse className="wallet-pig-belly-glow" cx="225" cy="178" rx="91" ry="70" />
        <path className="wallet-pig-highlight" d="M143 116c28-34 79-46 126-27" />
        <path className="wallet-pig-ear" d="M279 102c4-35 22-55 53-62 6 31-3 58-29 79Z" />
        <path className="wallet-pig-ear-inner" d="M299 94c5-18 13-29 25-35 1 17-5 32-18 44Z" />
        <ellipse className="wallet-pig-snout" cx="348" cy="182" rx="48" ry="34" />
        <ellipse className="wallet-pig-snout-shine" cx="337" cy="168" rx="20" ry="10" />
        <g className="wallet-pig-eye-group">
          <circle className="wallet-pig-eye" cx="313" cy="143" r="7" />
          <circle className="wallet-pig-eye-shine" cx="315.5" cy="140.5" r="2" />
        </g>
        <circle className="wallet-pig-blush" cx="310" cy="166" r="9" />
        <circle className="wallet-pig-nostril" cx="337" cy="181" r="4.5" />
        <circle className="wallet-pig-nostril" cx="362" cy="184" r="4.5" />
        <path className="wallet-pig-smile" d="M338 205c9 7 20 7 29-1" />
        <path className="wallet-pig-hoof" d="M159 276h28M279 276h28" />
        <rect className="wallet-pig-slot" x="192" y="75" width="70" height="11" rx="5.5" />
      </g>

      <g className="wallet-pig-coin-drop" filter="url(#walletPigShadow)">
        <circle cx="225" cy="38" r="28" fill="url(#walletCoin)" />
        <circle cx="225" cy="38" r="20" />
        <path d="M230 27h-8a6 6 0 0 0 0 12h6a6 6 0 0 1 0 12h-9M225 21v34" />
        <path className="wallet-pig-coin-glint" d="M208 28l8-8M205 39h-10" />
      </g>

      <g className="wallet-pig-impact" aria-hidden="true">
        <path d="M178 69l-16-12M272 69l16-12M180 86l-20 4M270 86l20 4" />
        <circle cx="174" cy="48" r="3" />
        <circle cx="279" cy="48" r="3" />
      </g>

      <g className="wallet-pig-coins wallet-pig-coins--right" filter="url(#walletPigShadow)">
        <ellipse cx="368" cy="278" rx="34" ry="11" />
        <path d="M334 260v18c0 6 15.2 11 34 11s34-5 34-11v-18" />
        <ellipse cx="368" cy="260" rx="34" ry="11" />
      </g>
    </svg>
  );
}

export default async function WalletPage() {
  const context = await getMyCohorts();
  const selectedCohort = context.cohorts.find((cohort) => cohort.isSelected) ?? null;
  const walletResult = selectedCohort
    ? await getCohortWalletSummary(selectedCohort.id)
    : { summary: null, error: context.error };

  return (
    <section className="wallet-page">
      <header className="wallet-page-heading">
        <span className="participant-eyebrow">Cohort wallet</span>
        <h1>Our points, together</h1>
        <p>See the cohort&apos;s combined progress and the points you contribute to it.</p>
      </header>

      {!selectedCohort || !walletResult.summary ? (
        <div className="wallet-empty-state">
          <strong>{walletResult.error ? "Wallet unavailable" : "No cohort selected"}</strong>
          <p>{walletResult.error ?? "Join or select a cohort to see its shared points."}</p>
        </div>
      ) : (
        <>
          <article className="wallet-bank-card">
            <div className="wallet-bank-copy">
              <span className="wallet-cohort-name">{selectedCohort.name}</span>
              <span className="wallet-bank-kicker">Shared momentum</span>
              <h2>Cohort piggy bank</h2>
              <p>Every completed action strengthens the progress you are building together.</p>
            </div>

            <div className="wallet-pig-stage">
              <CohortPiggyBank />
            </div>
          </article>

          <div className="wallet-summary-grid">
            <article className="wallet-summary-card wallet-summary-card--total">
              <div className="wallet-summary-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 10.5a3 3 0 0 0 0-6M17 14a4 4 0 0 1 4 4v2" /></svg>
              </div>
              <div>
                <span>Total cohort points</span>
                <strong>{walletResult.summary.totalPoints.toLocaleString("en-IN")}</strong>
                <small>Points from everyone in this cohort</small>
              </div>
            </article>
            <article className="wallet-summary-card">
              <div className="wallet-summary-icon wallet-summary-icon--personal" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /><path d="M15.5 8.5h-4a2 2 0 1 0 0 4h1a2 2 0 1 1 0 4h-4M12 6.5v11" /></svg>
              </div>
              <div>
                <span>My contribution</span>
                <strong>{walletResult.summary.myContribution.toLocaleString("en-IN")}</strong>
                <small>Your points included in the cohort total</small>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
