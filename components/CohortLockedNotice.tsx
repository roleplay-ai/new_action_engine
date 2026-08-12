import { Lock } from "lucide-react";

/** Shown in place of My Plan / Actions / the Commitment Wallet while a
 * superadmin has the participant's cohort locked (see setCohortLock in
 * app/actions/cohorts.ts and cohortLockInfo in lib/cohort-lock.ts). */
export function CohortLockedNotice({
  title,
  body,
  daysToGo,
}: {
  title: string;
  body: string;
  daysToGo: number | null;
}) {
  return (
    <div className="cohort-lock-notice">
      <span className="cohort-lock-notice-icon" aria-hidden="true">
        <Lock size={22} />
      </span>
      <h1>{title}</h1>
      {/* <p>{body}</p> */}
      {daysToGo !== null && (
        <div className="cohort-lock-notice-countdown">
          <strong>{daysToGo > 0 ? daysToGo : "0"}</strong>
          <span>{daysToGo === 1 ? "day to go" : "days to go"}</span>
        </div>
      )}
      {/* <p className="cohort-lock-notice-hint">
        {daysToGo !== null
          ? "Please wait a few days and check back — this will open up automatically."
          : "Please wait for your facilitator or admin to open this up, then check back."}
      </p> */}
    </div>
  );
}
