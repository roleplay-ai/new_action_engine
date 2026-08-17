import Link from "next/link";
import { CalendarDays, MessageSquareText, Megaphone, UserRound, Users } from "lucide-react";
import { getMyCohorts } from "@/app/actions/cohorts";
import { TrainerCohortSwitcher } from "@/components/trainer/TrainerCohortSwitcher";

function formatDate(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function TrainerOverviewPage() {
  const { cohorts, error } = await getMyCohorts();
  const selected = (cohorts ?? []).find((cohort) => cohort.isSelected);

  return (
    <div className="trainer-page">
      <header className="trainer-page-head">
        <div><h1>Overview</h1><p>Everything for the batch you're running, in one place.</p></div>
        {cohorts && cohorts.length > 0 && <TrainerCohortSwitcher cohorts={cohorts} />}
      </header>

      {error && <div className="trainer-alert">{error}</div>}

      {!selected ? (
        <div className="trainer-empty">
          <UserRound size={26} />
          <strong>No batch assigned yet</strong>
          <p>Ask a superadmin to assign you as the trainer for a batch in Batch Management.</p>
        </div>
      ) : (
        <>
          <section className="trainer-summary-card">
            <div className="trainer-summary-head">
              {selected.logoUrl ? <img src={selected.logoUrl} alt="" className="trainer-summary-logo" /> : <span className="trainer-summary-logo trainer-summary-logo--fallback">{selected.name.slice(0, 2).toUpperCase()}</span>}
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.companyName || "Company not set"}</p>
              </div>
            </div>
            <div className="trainer-summary-stats">
              <div><Users size={16} /><strong>{selected.memberCount}</strong><span>Participants</span></div>
              <div><CalendarDays size={16} /><strong>{selected.dates[0] ? formatDate(selected.dates[0]) : "TBD"}</strong><span>Next session</span></div>
            </div>
          </section>

          <div className="trainer-quick-links">
            <Link href="/trainer/conversation" className="trainer-quick-link">
              <MessageSquareText size={20} /><div><strong>Conversation</strong><span>Read and reply to your batch</span></div>
            </Link>
            <Link href="/trainer/notices" className="trainer-quick-link">
              <Megaphone size={20} /><div><strong>Notice board</strong><span>Post a dated update to everyone</span></div>
            </Link>
            <Link href="/trainer/facilitators" className="trainer-quick-link">
              <UserRound size={20} /><div><strong>Facilitators</strong><span>Manage who's running this batch</span></div>
            </Link>
            <Link href="/trainer/members" className="trainer-quick-link">
              <Users size={20} /><div><strong>Members & tags</strong><span>See your roster, assign tags</span></div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
