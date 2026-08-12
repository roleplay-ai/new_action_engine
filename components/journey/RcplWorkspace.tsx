"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays, Check, FileText, Play, X } from "lucide-react";
import CohortChat from "@/components/journey/CohortChat";
import NoticeBoardCard from "@/components/journey/NoticeBoardCard";
import FacilitatorsCard from "@/components/journey/FacilitatorsCard";
import FlipCountdown from "@/components/journey/FlipCountdown";
import type { Cohort, CohortMember, CohortNotice, Facilitator, PrepareContentItem, UserPrepareProgress } from "@/lib/types";
import { resolveVideoEmbed, resolveVideoThumbnail } from "@/lib/video-embed";
import { browserNeedsExternalPdfViewer } from "@/lib/pdf-embed";
import { daysUntil, nextUpcomingCohortDate } from "@/lib/cohort-dates";

type PhaseBlock = { time: string; name: string; description: string };
type PhaseDay = { name: string; date: string; takeaway: string; blocks: PhaseBlock[] };
type RcplPhase = {
  id: string;
  label: string;
  window: string;
  title: string;
  subtitle: string;
  focus: string;
  summary: string;
  days: PhaseDay[];
};

const RCPL_PHASES: RcplPhase[] = [
  {
    id: "1",
    label: "Phase 1",
    window: "Month 1 · 20 to 21 Aug",
    title: "Module 1 · Leading Business & Leading Future",
    subtitle: "",
    focus: "Leading Business & Leading Future",
    summary: "Build strategic perspective, business acumen, and confidence for the future. Followed by two days of application and teachbacks.",
    days: [
      {
        name: "Day 1 · Leading Future",
        date: "Thu 20 Aug",
        takeaway: "Leave with a clear view of where the business is heading and one AI workflow you can run in your own week.",
        blocks: [
          { time: "9.30–10.00", name: "Program Overview", description: "How SURGE runs, what is expected between phases, and how this workspace fits in." },
          { time: "10.00–11.30", name: "RCPL Strategy & Future Outlook", description: "Where the business is placing its bets and what that means for your function." },
          { time: "11.45–4.30", name: "AI in Workplace", description: "A working session, lunch included. Build and test something on your own work." },
          { time: "4.45–6.00", name: "Leadership Fireside Chat", description: "Open conversation with a senior leader. Bring questions." },
          { time: "7.00–8.30", name: "Welcome Dinner", description: "Meet the people you will work with over the next six months." },
        ],
      },
      {
        name: "Day 2 · Business Acumen",
        date: "Fri 21 Aug",
        takeaway: "Run a business for three years in a day and see where your decisions create or cost value.",
        blocks: [
          { time: "9.30–11.15", name: "Foundation & Introduction to Simulation", description: "The commercial levers you will pull and the rules of the simulation." },
          { time: "11.30–1.15", name: "Play Year 1 and Debrief", description: "Make the first decisions, review the results, and identify what you missed." },
          { time: "2.00–3.30", name: "Play Year 2 and Debrief", description: "Adjust your strategy with what you learned and run it again." },
          { time: "3.45–6.00", name: "Play Year 3, Debrief + Final Winners", description: "Run the last round, review the results, and connect the learning to your P&L." },
        ],
      },
    ],
  },
  {
    id: "2",
    label: "Phase 2",
    window: "Month 3 · 20 to 21 Oct",
    title: "Module 2 · Leading Self",
    subtitle: "",
    focus: "Leading Self",
    summary: "Work on the internal drivers: awareness, regulation, curiosity, and resilience. Followed by two months of application and teachbacks.",
    days: [
      {
        name: "Day 3 · Curiosity & Agile Thinking",
        date: "Mon 20 Oct",
        takeaway: "Leave with three tools for opening up a problem before you rush to solve it.",
        blocks: [
          { time: "9.30–11.00", name: "Developing Curiosity & Agile Thinking", description: "Why experienced leaders stop asking questions, and how to rebuild the habit." },
          { time: "11.15–1.00", name: "Creative Problem Solving through Six Thinking Hats", description: "A structured method for arguing well without making it personal." },
          { time: "1.45–4.30", name: "Biomimicry for Innovation", description: "Borrow solutions from nature and apply them to retail problems." },
          { time: "4.45–6.00", name: "Leadership Fireside Chat", description: "Open conversation with a senior leader." },
        ],
      },
      {
        name: "Day 4 · Emotional Intelligence",
        date: "Tue 21 Oct",
        takeaway: "Get language for what happens under pressure and a practical way to steady yourself in the moment.",
        blocks: [
          { time: "9.30–11.00", name: "Developing Self Awareness", description: "See what your default reactions cost through feedback and your own data." },
          { time: "11.15–1.00", name: "Emotional Regulation", description: "Practical ways to hold your response when the stakes and noise are high." },
          { time: "1.45–3.30", name: "Leading with Empathy", description: "Read the room and respond to what people are actually saying." },
          { time: "3.45–6.00", name: "Building Resilience Under Pressure", description: "Recover quickly and keep your team steady while you do it." },
        ],
      },
    ],
  },
  {
    id: "3",
    label: "Phase 3",
    window: "Month 5 · 15 to 16 Dec",
    title: "Module 3 · Leading Others",
    subtitle: "",
    focus: "Leading Others",
    summary: "Build interpersonal excellence through influence, stakeholder work, and cross-functional collaboration.",
    days: [
      {
        name: "Day 5 · Influencing without Authority",
        date: "Mon 15 Dec",
        takeaway: "Leave with a stakeholder map for one real situation and a plan for the person blocking it.",
        blocks: [
          { time: "9.30–11.00", name: "Building Trust and Credibility", description: "What earns you a hearing with people who do not report to you." },
          { time: "11.15–1.00", name: "Sources of Influence", description: "The levers available beyond your title, and when each one works." },
          { time: "1.45–3.15", name: "Stakeholder Management", description: "Map a live situation and plan the conversations that will move it." },
          { time: "3.30–4.30", name: "Managing Resistance", description: "Work with the person who says no, instead of around them." },
          { time: "4.45–6.00", name: "Fireside Chat", description: "Open conversation with a senior leader." },
        ],
      },
      {
        name: "Day 6 · Cross Functional Collaboration",
        date: "Tue 16 Dec",
        takeaway: "End with a shared commitment across functions and your SURGE graduation.",
        blocks: [
          { time: "9.30–11.00", name: "Collaborative Mindset", description: "What gets in the way when two functions both think they are right." },
          { time: "11.15–1.00", name: "Breaking Silos", description: "Where handoffs break in this business and what you can fix from your seat." },
          { time: "1.45–3.30", name: "Managing Interdependencies", description: "Run work that depends on teams you do not control." },
          { time: "3.45–5.15", name: "Creating One Team Culture", description: "Agree the behaviours this batch will hold each other to." },
          { time: "5.30–6.00", name: "SURGE Graduation", description: "Close, recognition, and your action-point totals." },
        ],
      },
    ],
  },
];

function formatSessionDate(value?: string | null, compact = false) {
  if (!value) return "Date to be announced";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", compact
    ? { weekday: "short", day: "numeric", month: "short" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function initials(name: string | null) {
  if (!name) return "P";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function isPdfResource(item: PrepareContentItem) {
  return item.type === "preread" && !!item.prereadUrl && /\.pdf(?:$|[?#])/i.test(item.prereadUrl);
}

function resourceKind(item: PrepareContentItem) {
  if (item.type === "video") return "Video";
  if (item.type === "quiz") return "Quiz";
  return isPdfResource(item) ? "PDF" : "Resource";
}

function PdfCardPreview({ url, title }: { url: string; title: string }) {
  const [useNativeIframe, setUseNativeIframe] = useState(false);

  useEffect(() => {
    setUseNativeIframe(!browserNeedsExternalPdfViewer());
  }, []);

  if (!useNativeIframe) return <FileText size={28} />;
  return <iframe src={`${url}#page=1&view=FitH&toolbar=0&navpanes=0`} title={`${title} preview`} tabIndex={-1} loading="lazy" />;
}

function ResourcePreview({ item }: { item: PrepareContentItem }) {
  if (item.type === "video" && item.videoUrl) {
    const thumbnail = resolveVideoThumbnail(item.videoUrl);
    if (thumbnail) return <><img src={thumbnail} alt="" loading="lazy" /><span className="rcpl-resource-play"><Play size={17} fill="currentColor" /></span></>;
    const embed = resolveVideoEmbed(item.videoUrl);
    if (embed.kind === "file") return <><video src={embed.src} muted playsInline preload="metadata" /><span className="rcpl-resource-play"><Play size={17} fill="currentColor" /></span></>;
  }

  if (isPdfResource(item) && item.prereadUrl) {
    return <PdfCardPreview url={item.prereadUrl} title={item.title} />;
  }

  return item.type === "video" ? <Play size={30} fill="currentColor" /> : <FileText size={28} />;
}

type RcplWorkspaceProps = {
  cohort: Cohort;
  roster: CohortMember[];
  items: PrepareContentItem[];
  progress: Record<string, UserPrepareProgress>;
  completedCount: number;
  preparationComplete: boolean;
  nextTitle: string;
  nextCopy: string;
  nextHref: string | null;
  nextIncompleteItem: PrepareContentItem | null;
  onOpenResource: (item: PrepareContentItem) => void;
  notices: CohortNotice[];
  facilitators: Facilitator[];
};

export default function RcplWorkspace({
  cohort,
  roster,
  items,
  progress,
  completedCount,
  preparationComplete,
  nextTitle,
  nextCopy,
  nextHref,
  nextIncompleteItem,
  onOpenResource,
  notices,
  facilitators,
}: RcplWorkspaceProps) {
  const searchParams = useSearchParams();
  const phaseId = searchParams.get("phase") ?? "1";
  const phase = RCPL_PHASES.find((item) => item.id === phaseId) ?? RCPL_PHASES[0];
  const [buddyInfoOpen, setBuddyInfoOpen] = useState(false);

  const sessionDates = useMemo(
    () => [...(cohort.dates ?? [])].filter(Boolean).sort(),
    [cohort.dates],
  );
  const nextSessionDate = useMemo(() => nextUpcomingCohortDate(sessionDates), [sessionDates]);
  const daysToNextSession = nextSessionDate !== null ? daysUntil(nextSessionDate) : null;
  const daysToGoLabel =
    daysToNextSession === null
      ? ""
      : daysToNextSession <= 0
        ? "starts today"
        : daysToNextSession === 1
          ? "day to go"
          : "days to go";

  const rosterRows = useMemo(() => {
    const sorted = [...roster].sort((a, b) => {
      const tagA = a.tag?.name ?? "";
      const tagB = b.tag?.name ?? "";
      if (tagA !== tagB) {
        if (!tagA) return 1; // untagged participants sort last
        if (!tagB) return -1;
        return tagA.localeCompare(tagB);
      }
      return (a.fullName || "").localeCompare(b.fullName || "");
    });
    const distinctTagCount = new Set(sorted.map((member) => member.tag?.name ?? "")).size;
    const rows: ({ kind: "header"; key: string; label: string } | { kind: "member"; key: string; member: CohortMember; colorIndex: number })[] = [];
    let lastTag: string | null | undefined;
    sorted.forEach((member, index) => {
      const tagName = member.tag?.name ?? null;
      if (distinctTagCount > 1 && tagName !== lastTag) {
        rows.push({ kind: "header", key: `header:${tagName ?? "none"}`, label: tagName ?? "Unassigned" });
        lastTag = tagName;
      }
      rows.push({ kind: "member", key: member.id, member, colorIndex: index });
    });
    return rows;
  }, [roster]);

  useEffect(() => {
    if (!buddyInfoOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setBuddyInfoOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [buddyInfoOpen]);

  return (
    <div className="rcpl-workspace animate-in fade-in duration-700">
      <header className="rcpl-page-heading">
        <span>{cohort.companyLogoUrl ? <img src={cohort.companyLogoUrl} alt="RCPL University logo" /> : initials(cohort.companyName ?? null)}</span>
        {/* <div><h1 className="text-2xl font-bold">SURGE</h1></div> */}
      </header>

      <section className="rcpl-program-hero">
        <div className="rcpl-program-copy">
          <small>RCPL Accelerated Leadership Program</small>
          <h2>Your 6-month SURGE leadership journey</h2>
          <p>Build the capability to lead the future, lead yourself, and lead others through immersive learning, practical application, teachbacks, and continued action at work.</p>
          <div className="rcpl-hero-meta">
            {sessionDates.length === 0 ? (
              <span><CalendarDays size={14} />Date to be announced</span>
            ) : (
              sessionDates.map((date) => (
                <span key={date} className={date === nextSessionDate ? "upcoming" : undefined}>
                  <CalendarDays size={14} />{formatSessionDate(date, true)}
                </span>
              ))
            )}
            {daysToNextSession !== null && daysToNextSession >= 0 && (
              <FlipCountdown days={daysToNextSession} label={daysToGoLabel} />
            )}
          </div>
          <nav className="rcpl-phase-chips" aria-label="SURGE programme phases">
            {RCPL_PHASES.map((item) => <Link key={item.id} href={`/journey?phase=${item.id}`} className={item.id === phase.id ? "active" : ""}>{item.focus}</Link>)}
          </nav>
        </div>
        <div className="rcpl-program-journey" aria-label="The SURGE journey rises through three phases across six months">
          {cohort.logoUrl && <img className="rcpl-program-mark" src={cohort.logoUrl} alt={`${cohort.name} logo`} />}
          <svg viewBox="0 0 440 262" role="img" aria-hidden="true">
            <defs>
              <filter id="rcpl-white-dot-glow" x="-200%" y="-200%" width="500%" height="500%">
                <feGaussianBlur stdDeviation="4.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <path className="rcpl-arrow-track" d="M22 228 C 100 228, 100 172, 178 172 S 256 116, 334 116 L 390 78" />
            <path className="rcpl-arrow-live" d="M22 228 C 100 228, 100 172, 178 172 S 256 116, 334 116 L 390 78" />
            <path d="M386 66 L 416 62 L 401 92 Z" fill="#D03A2C" />
            <circle className="rcpl-journey-spark" r="4.5" fill="#fff" filter="url(#rcpl-white-dot-glow)">
              <animateMotion dur="5.5s" begin="1.9s" repeatCount="indefinite" path="M22 228 C 100 228, 100 172, 178 172 S 256 116, 334 116 L 390 78" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur="5.5s" begin="1.9s" repeatCount="indefinite" />
            </circle>
            <g><circle cx="22" cy="228" r="9" /><text x="4" y="202">Leading Business</text><text x="4" y="216">&amp;   Leading Future</text><text className="month" x="4" y="252">MONTH 1</text></g>
            <g><circle cx="178" cy="172" r="9" /><text x="152" y="148">Leading Self</text><text className="month" x="152" y="161">MONTH 3</text></g>
            <g><circle cx="334" cy="116" r="9" /><text x="300" y="146">Leading Others</text><text className="month" x="300" y="133">MONTH 5</text></g>
          </svg>
        </div>
      </section>

      <div className="rcpl-content-shell">
        <main>
          {/* <section className={`rcpl-preparation-strip${preparationComplete ? " complete" : ""}`}>
            <span className="rcpl-preparation-icon">{preparationComplete ? <Check size={17} /> : <ArrowRight size={17} />}</span>
            <div><strong>{nextTitle}</strong><p>{nextCopy}</p></div>
            {nextHref ? <Link href={nextHref}>Continue</Link> : <button type="button" disabled={!nextIncompleteItem} onClick={() => nextIncompleteItem && onOpenResource(nextIncompleteItem)}>Open</button>}
          </section> */}

          <section className="rcpl-card rcpl-agenda" id="rcpl-agenda">
            <header>
              <div><h3>{phase.title}</h3><p>{phase.subtitle}</p></div>
            </header>
            <div className="rcpl-agenda-focus"><div><strong>{phase.focus}</strong><p>{phase.summary}</p></div></div>
            <div className="rcpl-agenda-days">
              {phase.days.map((day) => (
                <div className="rcpl-agenda-day" key={day.name}>
                  <small>{day.date}</small><h4>{day.name}</h4>
                  <ol>{day.blocks.map((block) => <li key={`${day.name}-${block.time}`}><span>{block.time}</span><strong>{block.name}</strong></li>)}</ol>
                </div>
              ))}
            </div>
          </section>



          <section className="rcpl-card rcpl-library" id="preparation">
            <header>
              <div><h3>Pre-reads, videos and session resources</h3></div>
              <strong>{completedCount}/{items.length} complete</strong>
            </header>
            <div className="rcpl-resource-row">
              {items.length === 0 && <div className="journey-inline-empty">No preparation has been assigned yet.</div>}
              {items.map((item) => {
                const done = progress[item.id]?.status === "completed";
                return (
                  <button type="button" className={`rcpl-resource-card${done ? " done" : ""}`} key={item.id} onClick={() => onOpenResource(item)}>
                    <span className={`rcpl-resource-preview ${item.type}`}>
                      <b>{resourceKind(item)}</b>
                      <ResourcePreview item={item} />
                      {done && <em><Check size={12} /> Done</em>}
                    </span>
                    <span className="rcpl-resource-copy">
                      <strong>{item.title}</strong>
                      <span className="rcpl-resource-view">View<ArrowRight size={13} /></span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
          <NoticeBoardCard notices={notices} trainer={cohort.trainer ?? null} variant="rcpl" />
        </main>

        <aside className="rcpl-side-rail">
          <section className="rcpl-card rcpl-participants">
            <header><h3>Your batch</h3></header>
            <div>
              {rosterRows.map((row) =>
                row.kind === "header" ? (
                  <div className="rcpl-tag-group-label" key={row.key}>{row.label}</div>
                ) : (
                  <div className="rcpl-participant" key={row.key}>
                    <b style={{ background: ["#1D3C66", "#B8862B", "#D03A2C", "#2E9E63", "#7A5CC9"][row.colorIndex % 5] }}>{initials(row.member.fullName)}</b>
                    <span><strong>{row.member.fullName || "Participant"}</strong><small>{row.member.email || "—"}</small></span>
                    {row.member.tag && <span className="rcpl-participant-tag">{row.member.tag.name}</span>}
                  </div>
                )
              )}
              {roster.length === 0 && <p className="rcpl-no-results">No participants found.</p>}
            </div>
          </section>



          <section className="rcpl-card rcpl-buddy-card">
            <header>
              <h3>Your commitment buddy</h3>
              <button type="button" onClick={() => setBuddyInfoOpen(true)}>How this works</button>
            </header>
            <p>Buddies are revealed on My Actions after your personal action plan goes live.</p>
          </section>

          <FacilitatorsCard facilitators={facilitators} variant="rcpl" />
          <CohortChat cohortId={cohort.id} variant="rcpl" />

        </aside>
      </div>

      {typeof document !== "undefined" && buddyInfoOpen && createPortal(
        <div className="rcpl-agenda-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setBuddyInfoOpen(false); }}>
          <section className="rcpl-buddy-modal" role="dialog" aria-modal="true" aria-labelledby="rcpl-buddy-modal-title">
            <header>
              <div>
                <small>Accountability</small>
                <h3 id="rcpl-buddy-modal-title">How commitment buddies work</h3>
                <p>Everyone in the batch is paired with one other person, with one group of three when needed.</p>
              </div>
              <button type="button" onClick={() => setBuddyInfoOpen(false)} aria-label="Close commitment buddy explanation"><X size={17} /></button>
            </header>
            <ol className="rcpl-buddy-modal-body">
              <li>
                <b aria-hidden="true">1</b>
                <span>
                  <strong>Assigned at random</strong>
                  <p>Your buddy or group is created within your batch and revealed after your personal action plan goes live.</p>
                </span>
              </li>
              <li>
                <b aria-hidden="true">2</b>
                <span>
                  <strong>See overall progress</strong>
                  <p>You can see each other&apos;s done, skipped and missed totals, plus points earned and lost. Actions, plans, schedules and reflections stay private.</p>
                </span>
              </li>
              <li>
                <b aria-hidden="true">3</b>
                <span>
                  <strong>Nudge, do not audit</strong>
                  <p>Use the progress view to notice when encouragement or a quick check-in could help — not to police the detail of their work.</p>
                </span>
              </li>
            </ol>
            <footer>
              <button type="button" onClick={() => setBuddyInfoOpen(false)}>Got it</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
