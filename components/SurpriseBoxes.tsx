"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Lock, Play, X } from "lucide-react";
import { markSurpriseBoxOpened } from "@/app/actions/surprise-boxes";
import type { SurpriseShelf, SurpriseShelfBox } from "@/lib/surprise-boxes";

/** Boxes shown before the shelf scrolls (3 rows of 4 on desktop, 4 rows of 3 on phones). */
const SHELF_VISIBLE_BOXES = 12;

/** Gift colourways, cycled by slot; bonus boxes are always gold. */
const GIFT_VARIANTS = ["", "v2", "v3", "v4"];

function giftVariant(box: SurpriseShelfBox) {
  return box.bonus ? "gold" : GIFT_VARIANTS[(box.slot - 1) % GIFT_VARIANTS.length];
}

function Gift({ variant, locked }: { variant: string; locked?: boolean }) {
  return (
    <div className={`surprise-gift ${variant}`} aria-hidden="true">
      <div className="surprise-gift-lid"><div className="surprise-gift-bow"><i /></div></div>
      <div className="surprise-gift-body" />
      <div className="surprise-gift-q">?</div>
      {locked && <span className="surprise-gift-lock"><Lock size={10} strokeWidth={3} /></span>}
    </div>
  );
}

const IDLE_LINES = [
  { line: "Psst! I wrapped this one just for you 👀", sub: "Go on, tap the box!" },
  { line: "You did it again! Another box for you 🎁", sub: "Tap it, I can't wait!" },
  { line: "Ooh, this one's my favourite 🤫", sub: "Tap to open it!" },
];

function openLine(box: SurpriseShelfBox) {
  if (box.bonus === "finale") return { line: "You finished them all! 🏆", sub: "I'm so proud of you!" };
  if (box.bonus === "halfway") return { line: "HALFWAY THERE!! ⭐", sub: "Keep this momentum going!" };
  if (box.prize?.kind === "resource") return { line: "Woohoo! Look what you got! 🎉", sub: "This one's a keeper 📌" };
  return { line: "Yesss! You earned this! 🎉", sub: "Grab a coffee and press play ☕" };
}

type BuddyState = "idle" | "opening" | "open" | "replay";

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#ffce00", "#f3ae45", "#ed4551", "#23ce6b", "#7b5cff", "#221d23"];
    return Array.from({ length: 90 }, (_, i) => ({
      left: Math.random() * 100,
      size: 6 + Math.random() * 8,
      flat: Math.random() > 0.5,
      round: Math.random() > 0.7,
      color: colors[i % colors.length],
      dx: Math.random() * 160 - 80,
      rotate: Math.random() * 720 - 360,
      duration: 1.8 + Math.random() * 1.6,
      delay: Math.random() * 0.35,
    }));
  }, []);
  return (
    <div className="surprise-confetti" aria-hidden="true">
      {pieces.map((piece, i) => (
        <i
          key={i}
          style={{
            left: `${piece.left}vw`,
            width: piece.size,
            height: piece.flat ? piece.size * 0.45 : piece.size,
            background: piece.color,
            borderRadius: piece.round ? "50%" : 2,
            animationDuration: `${piece.duration}s`,
            animationDelay: `${piece.delay}s`,
            ["--dx" as string]: `${piece.dx}px`,
            ["--r" as string]: `${piece.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}

function SurpriseReveal({
  box,
  total,
  completedCount,
  remainingAfter,
  onOpened,
  onClose,
}: {
  box: SurpriseShelfBox;
  total: number;
  /** Plan actions completed so far (one unlocked box each), for the "N of M" badge. */
  completedCount: number;
  remainingAfter: number;
  onOpened: (box: SurpriseShelfBox) => void;
  onClose: () => void;
}) {
  // Fixed when the popup opens: opening the box flips box.state to "opened",
  // which must not turn a first reveal into a "view again".
  const [alreadyOpen] = useState(box.state === "opened");
  const [stage, setStage] = useState<"idle" | "opening" | "open">(alreadyOpen ? "open" : "idle");
  const [buddy, setBuddy] = useState<BuddyState>(alreadyOpen ? "replay" : "idle");
  const [confetti, setConfetti] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const idle = IDLE_LINES[(box.slot - 1) % IDLE_LINES.length];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function open() {
    if (stage !== "idle") return;
    setStage("opening");
    setBuddy("opening");
    window.setTimeout(() => {
      setStage("open");
      setBuddy("open");
      setConfetti(true);
      onOpened(box);
    }, 420);
  }

  const speech =
    buddy === "replay"
      ? { line: "Back for another look? Love that! 💛", sub: "Good habits stick on repeat." }
      : buddy === "opening"
        ? { line: "Ooooh… here it comes! 🤩", sub: "" }
        : buddy === "open"
          ? openLine(box)
          : idle;
  const prize = box.prize;

  return (
    <div className="surprise-modal" role="dialog" aria-modal="true" aria-labelledby="surprise-reveal-title" onClick={(event) => event.target === event.currentTarget && stage === "open" && onClose()}>
      {confetti && <Confetti />}
      <div className="surprise-reveal-wrap">
        <div className={`surprise-reveal ${stage === "open" ? "is-revealed" : ""}`}>
          <button ref={closeRef} type="button" className="surprise-reveal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
          {!alreadyOpen && (
            <div className="surprise-reveal-eyebrow">
              ✓ {completedCount} of {total} action{total === 1 ? "" : "s"} completed
            </div>
          )}
          <h3 id="surprise-reveal-title">{stage === "open" ? "Surprise box revealed!" : "Surprise box unlocked!"}</h3>
          <p className="surprise-reveal-sub">
            {stage === "open" ? "Here’s what was inside." : "Your action unlocked something special."}
          </p>

          <div className={`surprise-stage ${stage}`}>
            <div className="surprise-rays" />
            <button type="button" className="surprise-stage-gift" onClick={open} aria-label="Open surprise box" disabled={stage !== "idle"}>
              <Gift variant={giftVariant(box)} />
            </button>
            <div className="surprise-prize">
              <div className="surprise-prize-card">
                <div className={`surprise-thumb ${prize?.kind ?? "resource"}`}>
                  {prize?.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={prize.thumbnailUrl} alt="" />
                  ) : prize?.kind === "video" ? (
                    <span className="surprise-thumb-play"><Play size={20} fill="currentColor" /></span>
                  ) : (
                    <FileText size={40} />
                  )}
                  {prize?.durationLabel && <span className="surprise-thumb-duration">{prize.durationLabel}</span>}
                </div>
                {prize ? (
                  <>
                    <span className={`surprise-kind ${prize.kind}`}>{prize.kind === "video" ? "Video" : "Resource"}</span>
                    <strong>{prize.title}</strong>
                    <p>{prize.description}</p>
                  </>
                ) : (
                  <>
                    <strong>Your trainer is preparing this one</strong>
                    <p>Check back soon — it&apos;ll appear here in your Commitment Wallet.</p>
                  </>
                )}
              </div>
            </div>
          </div>
          {stage === "idle" && <div className="surprise-tap-hint">👆 <b>Tap</b> to open</div>}

          <div className="surprise-reveal-actions">
            {prize && (
              <a className="surprise-primary" href={prize.url} target="_blank" rel="noopener noreferrer">
                {prize.kind === "video" ? "▶ Watch now" : "Open resource"}
              </a>
            )}
            <button type="button" className="surprise-ghost" onClick={onClose}>
              {alreadyOpen ? "Close" : remainingAfter > 0 ? "Next box" : "Save to my wallet"}
            </button>
          </div>
        </div>

        <aside className="surprise-buddy" data-state={buddy} aria-live="polite">
          <div className="surprise-bubble" key={`${buddy}-${box.slot}`}>
            {speech.line}
            {speech.sub && <small>{speech.sub}</small>}
          </div>
          <div className="surprise-buddy-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/loader/nudgie-joy.webp" alt="Nudgie celebrating" width={388} height={332} />
            <span className="surprise-spark s1">✦</span>
            <span className="surprise-spark s2">✦</span>
            <span className="surprise-spark s3">✦</span>
            <span className="surprise-spark s4">✦</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ShelfTile({ box, onSelect }: { box: SurpriseShelfBox; onSelect: (box: SurpriseShelfBox) => void }) {
  const selectable = box.state === "opened" || box.state === "ready";
  const content = (
    <>
      {box.bonus && <span className="surprise-tile-ribbon">{box.bonus === "finale" ? "Grand finale" : "Halfway bonus"}</span>}
      <div className="surprise-tile-art">
        {box.state === "opened" ? (
          <span className={`surprise-tile-icon ${box.bonus ? "bonus" : box.prize?.kind ?? "resource"}`}>
            {box.bonus === "finale" ? "🏆" : box.bonus === "halfway" ? "⭐" : box.prize?.kind === "video" ? <Play size={20} fill="currentColor" /> : <FileText size={20} />}
          </span>
        ) : (
          <Gift variant={giftVariant(box)} locked={box.state === "locked" || box.state === "missed"} />
        )}
      </div>
      {box.state === "opened" ? (
        <>
          <span className={`surprise-kind ${box.prize?.kind ?? "resource"}`}>{box.prize?.kind === "video" ? "Video" : "Resource"}</span>
          <strong className="surprise-tile-title">{box.prize?.title ?? "Coming soon"}</strong>
          <span className="surprise-tile-link">{box.prize?.kind === "video" ? "Watch" : "Open"} →</span>
        </>
      ) : (
        <>
          <span className="surprise-tile-tag">
            {box.state === "ready" ? "Ready to open" : box.state === "next" ? "Next up" : box.state === "missed" ? "Missed" : "Locked"}
          </span>
          <strong className="surprise-tile-title">Box {box.slot}</strong>
          <span className="surprise-tile-hint">
            {box.state === "ready"
              ? "Tap to open"
              : box.state === "next"
                ? "Mark your next action done to open"
                : box.state === "missed"
                  ? "Mark it done late to open"
                  : "Unlocks with its action"}
          </span>
        </>
      )}
    </>
  );

  return selectable ? (
    <button type="button" className={`surprise-tile ${box.state} ${box.bonus ? "bonus" : ""}`} onClick={() => onSelect(box)} aria-label={box.state === "ready" ? `Open box ${box.slot}` : `View ${box.prize?.title ?? `box ${box.slot}`}`}>
      {content}
    </button>
  ) : (
    <div className={`surprise-tile ${box.state} ${box.bonus ? "bonus" : ""}`}>{content}</div>
  );
}

/**
 * Commitment Wallet Surprise Box shelf plus the reveal popup. `revealUnlockIds`
 * (from `/wallet?reveal=<id,…>`) opens those boxes one after another on load.
 */
export default function SurpriseBoxes({ shelf, revealUnlockIds }: { shelf: SurpriseShelf; revealUnlockIds: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  // Boxes opened in this session. Layered over the server shelf so a refresh
  // that lands before markSurpriseBoxOpened is saved can't show them as unopened.
  const [openedHere, setOpenedHere] = useState<ReadonlySet<string>>(() => new Set());
  const boxes = useMemo(
    () => shelf.boxes.map((box) => (box.unlockId && openedHere.has(box.unlockId) ? { ...box, state: "opened" as const } : box)),
    [shelf.boxes, openedHere]
  );
  const [queue, setQueue] = useState<string[]>(() =>
    revealUnlockIds.filter((id) => shelf.boxes.some((box) => box.unlockId === id))
  );
  const [mounted, setMounted] = useState(false);
  const [justOpened, setJustOpened] = useState<string | null>(null);
  const revealParamPresent = useRef(revealUnlockIds.length > 0);

  useEffect(() => setMounted(true), []);

  const current = queue.length ? boxes.find((box) => box.unlockId === queue[0]) : undefined;

  const handleOpened = useCallback((opened: SurpriseShelfBox) => {
    if (!opened.unlockId) return;
    const unlockId = opened.unlockId;
    setOpenedHere((ids) => new Set(ids).add(unlockId));
    setJustOpened(unlockId);
    void markSurpriseBoxOpened(unlockId);
  }, []);

  const handleClose = useCallback(() => {
    setQueue((ids) => {
      const rest = ids.slice(1);
      if (!rest.length && revealParamPresent.current) {
        // Strip ?reveal= so a refresh or back-navigation doesn't replay it.
        revealParamPresent.current = false;
        router.replace(pathname, { scroll: false });
      }
      return rest;
    });
  }, [pathname, router]);

  // Plans with more than 12 actions scroll inside the shelf instead of
  // growing the page. Start scrolled to the box that matters now.
  const scrollable = boxes.length > SHELF_VISIBLE_BOXES;
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!scrollable || !grid) return;
    const focus = grid.querySelector<HTMLElement>(".surprise-tile.ready, .surprise-tile.next");
    if (focus) grid.scrollTop = Math.max(0, focus.offsetTop - grid.offsetTop - 16);
    // Only on first render: later opens shouldn't yank the scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollable]);

  if (!boxes.length) return null;

  const openedCount = boxes.filter((box) => box.state === "opened").length;
  const progress = (boxes.filter((box) => box.unlockId).length / boxes.length) * 100;
  const markers = boxes.filter((box) => box.bonus);

  return (
    <section className={`surprise-shelf ${shelf.enabled ? "" : "is-disabled"}`} aria-labelledby="surprise-shelf-title">
      <div className="surprise-shelf-head">
        <div>
          <span className="wallet-label">Your rewards</span>
          <h3 id="surprise-shelf-title">Surprise Boxes</h3>
          <p>
            {shelf.enabled
              ? "Every action you mark done opens a box with a video or resource picked for that action. Opened boxes stay here."
              : "Surprise Boxes start with your next programme."}
          </p>
        </div>
        {shelf.enabled && (
          <div className="surprise-shelf-count">
            <strong>{openedCount}/{boxes.length}</strong>
            <span>boxes opened</span>
          </div>
        )}
      </div>

      {shelf.enabled && (
        <>
          <div className="surprise-progress" role="img" aria-label={`${Math.round(progress)}% of boxes unlocked`}>
            <span style={{ width: `${progress}%` }} />
            {markers.map((box) => (
              <i key={box.slot} className={box.unlockId ? "hit" : ""} style={{ left: `${(box.slot / boxes.length) * 100}%` }}>
                {box.bonus === "finale" ? "🏆" : "⭐"}
              </i>
            ))}
          </div>
          <div className="surprise-legend">
            {markers.map((box) => (
              <span key={box.slot}>{box.bonus === "finale" ? "🏆" : "⭐"} <b>Box {box.slot}</b> · {box.bonus === "finale" ? "Grand finale" : "Halfway bonus"}</span>
            ))}
          </div>
        </>
      )}

      <div
        ref={gridRef}
        className={`surprise-grid${scrollable ? " is-scrollable" : ""}`}
        {...(scrollable ? { tabIndex: 0, role: "region", "aria-label": `All ${boxes.length} Surprise Boxes, scrollable` } : {})}
      >
        {boxes.map((box) => (
          <div key={box.actionId} className={box.unlockId && box.unlockId === justOpened ? "surprise-tile-wrap is-new" : "surprise-tile-wrap"}>
            <ShelfTile box={box} onSelect={(selected) => selected.unlockId && setQueue([selected.unlockId])} />
          </div>
        ))}
      </div>

      {mounted && current && createPortal(
        <SurpriseReveal
          key={current.unlockId}
          box={current}
          total={boxes.length}
          completedCount={boxes.filter((box) => box.unlockId).length}
          remainingAfter={queue.length - 1}
          onOpened={handleOpened}
          onClose={handleClose}
        />,
        document.body
      )}
    </section>
  );
}
