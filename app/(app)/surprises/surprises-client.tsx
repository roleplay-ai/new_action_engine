"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Gift, ShelfTile, giftVariant, useSurpriseReveal } from "@/components/SurpriseBoxes";
import { groupSurpriseShelf, type SurpriseShelf } from "@/lib/surprise-boxes";

/**
 * Surprise Boxes page, opened from the gift icon in the top bar: boxes ready
 * to open, every box already opened, and only the next two locked boxes.
 * Box sections sit on the Wallet's navy shelf so the shared tiles look the same.
 */
export default function SurprisesClient({ shelf, revealUnlockIds }: { shelf: SurpriseShelf; revealUnlockIds: string[] }) {
  const router = useRouter();
  const { boxes, justOpened, select, portal } = useSurpriseReveal(shelf, revealUnlockIds);
  const { ready, opened, upcoming, moreLockedCount, missed } = groupSurpriseShelf(boxes);
  const unlocked = boxes.filter((box) => box.unlockId).length;
  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/journey"));
  const openBox = (unlockId: string | null) => unlockId && select(unlockId);

  return (
    <div className="surprises-page animate-in fade-in duration-700">
      <header className="surprises-head">
        <div>
          <h1>Your surprise boxes</h1>
          <p>Every action you complete unlocks a box with a short video, a resource or an experiment to try.</p>
        </div>
        <button type="button" className="surprises-back" onClick={goBack}><ArrowLeft size={16} /> Back</button>
      </header>

      {!boxes.length || !shelf.enabled ? (
        <section className="surprises-empty">
          <Gift variant="" />
          <h2>{boxes.length ? "Surprise Boxes start with your next programme" : "Your boxes start with your plan"}</h2>
          <p>{boxes.length
            ? "This plan was finalised before Surprise Boxes launched."
            : "Activate your action plan and each action you complete will unlock a surprise box."}</p>
          {!boxes.length && <Link href="/actions" className="journey-primary-button">Go to My Actions <ArrowRight size={14} /></Link>}
        </section>
      ) : (
        <section className="surprise-shelf surprises-panel" aria-label="Your surprise boxes">
          <div className="surprise-shelf-head">
            <div>
              <span className="wallet-label">This plan</span>
              <h3>{unlocked} of {boxes.length} boxes unlocked</h3>
            </div>
          </div>
          <div className="surprise-progress" role="img" aria-label={`${unlocked} of ${boxes.length} boxes unlocked`}>
            <span style={{ width: `${(unlocked / boxes.length) * 100}%` }} />
          </div>

          {ready.length > 0 && (
            <div className="surprises-ready">
              <button type="button" className="surprises-ready-gift" onClick={() => openBox(ready[0].unlockId)} aria-label="Open your surprise box">
                <Gift variant={giftVariant(ready[0])} />
              </button>
              <div>
                <small>Ready to open</small>
                <h2>{ready.length === 1 ? "You have a surprise box waiting" : `You have ${ready.length} surprise boxes waiting`}</h2>
                <p>Unlocked by: {ready[0].actionTitle}</p>
              </div>
              <button type="button" className="journey-primary-button" onClick={() => openBox(ready[0].unlockId)}>
                Open box <ArrowRight size={14} />
              </button>
            </div>
          )}

          <div className="surprises-section">
            <div className="surprises-section-head"><h4>Unlocked</h4><span>{opened.length} opened</span></div>
            {opened.length ? (
              <div className="surprise-grid">
                {opened.map((box) => (
                  <div key={box.actionId} className={box.unlockId === justOpened ? "surprise-tile-wrap is-new" : "surprise-tile-wrap"}>
                    <ShelfTile box={box} onSelect={(selected) => openBox(selected.unlockId)} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="surprises-note">Boxes you open will appear here so you can watch or read them again.</p>
            )}
          </div>

          {upcoming.length > 0 && (
            <div className="surprises-section">
              <div className="surprises-section-head"><h4>Coming up</h4><span>Complete the action to unlock its box</span></div>
              <div className="surprises-upcoming">
                {upcoming.map((box) => (
                  <div key={box.actionId} className="surprises-locked">
                    <Gift variant={giftVariant(box)} locked />
                    <div>
                      <strong>Box {box.slot}</strong>
                      <small>Unlocks when you complete: {box.actionTitle}</small>
                    </div>
                  </div>
                ))}
                {moreLockedCount > 0 && (
                  <div className="surprises-locked surprises-locked--more">
                    <strong>+{moreLockedCount}</strong>
                    <small>more boxes along your plan</small>
                  </div>
                )}
              </div>
            </div>
          )}

          {missed.length > 0 && (
            <p className="surprises-note">
              {missed.length} box{missed.length === 1 ? " is" : "es are"} waiting on a missed action. Complete it late from{" "}
              <Link href="/actions">My Actions</Link> to unlock it.
            </p>
          )}
        </section>
      )}

      {portal}
    </div>
  );
}
