"use client";

import React, { useEffect, useState } from "react";
import { useEngine } from "@/lib/store";
import { getLeague } from "@/lib/constants";
import { getLeaderboard } from "@/app/actions/leaderboard";
import { Trophy, Star, ChevronRight } from "lucide-react";

interface YourNudgeboardCardProps {
  onSeeProgress: () => void;
}

export default function YourNudgeboardCard({ onSeeProgress }: YourNudgeboardCardProps) {
  const { profile } = useEngine();
  const [rank, setRank] = useState<number>(1);
  const [total, setTotal] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLeaderboard()
      .then(({ entries }) => {
        if (cancelled) return;
        const idx = entries.findIndex((e) => e.isCurrentUser);
        setRank(idx >= 0 ? idx + 1 : 1);
        setTotal(entries.length || 1);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profile.totalPoints]);

  const league = getLeague(profile.totalPoints);
  const statusText = total <= 1 ? "Above avg" : rank === 1 ? "#1 🎉" : "Above avg";

  return (
    <aside style={{ position: 'sticky', top: '80px' }}>
      <div className="card" style={{ padding: '28px', maxWidth: 'none', margin: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <div style={{
            width: 48, height: 48,
            borderRadius: '50%',
            background: 'var(--color-primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Trophy size={22} style={{ color: 'var(--bright-amber)' }} strokeWidth={2} />
          </div>
          <h3 style={{
            fontSize: 'var(--text-md)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--color-text-primary)',
            lineHeight: 1.2,
          }}>
            Your Nudgeboard
          </h3>
        </div>

        {/* Stats */}
        {loading ? (
          <div style={{
            padding: '24px',
            textAlign: 'center',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-muted)',
            background: 'var(--color-bg-muted)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '18px',
          }}>
            Loading…
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
            {[
              { emoji: '🥇', label: 'Rank',    value: `${rank} of ${total}` },
              { emoji: '📊', label: 'Status',  value: statusText },
              { emoji: '⭐', label: 'League',  value: `${league}` },
              { emoji: '🎯', label: 'Score',   value: `+${profile.totalPoints}` },
            ].map(({ emoji, label, value }) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '12px 16px',
                  background: 'rgba(255,253,245,0.90)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-text-muted)',
                  minWidth: 0,
                  flexShrink: 1,
                }}>
                  <span aria-hidden style={{ flexShrink: 0, fontSize: '16px' }}>{emoji}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </span>
                <span style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 'var(--weight-bold)',
                  color: 'var(--color-text-primary)',
                  flexShrink: 0,
                  maxWidth: '55%',
                  textAlign: 'right',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={onSeeProgress}
          className="btn btn--primary-dark btn--full"
        >
          See Progress <ChevronRight size={15} strokeWidth={2.5} />
        </button>

        <p style={{
          marginTop: '14px',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          lineHeight: 'var(--leading-snug)',
        }}>
          Choose your next action to improve your score.
        </p>
      </div>
    </aside>
  );
}
