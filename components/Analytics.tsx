
import React, { useEffect } from 'react';
import { useEngine } from '../lib/store';
import {
  BookOpen, ThumbsUp, XCircle, CheckCircle2,
  Flag, AlertCircle,
  Shield, Medal, Star, Crown, Gem, Mail,
} from 'lucide-react';
import Leaderboard from './Leaderboard';
import { getLeague } from '@/lib/constants';
import { syncMyLeagueIndexFromPoints } from '@/app/actions/points';

const Analytics: React.FC = () => {
  const { profile, userActions, actionIdsInAssignedPackages } = useEngine();

  useEffect(() => {
    syncMyLeagueIndexFromPoints().catch(() => {});
  }, [profile.totalPoints]);

  const received = actionIdsInAssignedPackages.size;
  const read = userActions.filter((ua) => actionIdsInAssignedPackages.has(ua.actionId)).length;
  const accepted = userActions.filter((ua) => ['success', 'scheduled'].includes(ua.status)).length;
  const skipped = userActions.filter((ua) => ua.status === 'skipped').length;
  const validatedSuccess = userActions.filter((ua) => ua.status === 'success').length;
  const attemptFailure = userActions.filter((ua) => ua.status === 'failed').length;
  const ongoingQuest = userActions.filter((ua) => ua.status === 'scheduled').length;

  const stats = { received, read, accepted, skipped, validatedSuccess, attemptFailure, ongoingQuest, streak: profile.streak };

  const knowledgePct = stats.received > 0 ? Math.round((stats.read / stats.received) * 100) : 0;
  const intentionPct = stats.received > 0 ? Math.round((stats.accepted / stats.received) * 100) : 0;
  const actionPct = stats.accepted > 0 ? Math.round((validatedSuccess / stats.accepted) * 100) : 0;

  const currentLeague = getLeague(profile.totalPoints);
  const leagueThresholds = [
    { key: 'Starter', min: 0, max: 24 },
    { key: 'Bronze', min: 25, max: 49 },
    { key: 'Silver', min: 50, max: 99 },
    { key: 'Gold', min: 100, max: 199 },
    { key: 'Diamond', min: 200, max: Infinity },
  ] as const;
  const currentIndex = leagueThresholds.findIndex((l) => l.key === currentLeague);
  const nextLeague = currentIndex >= 0 && currentIndex < leagueThresholds.length - 1 ? leagueThresholds[currentIndex + 1] : null;
  const pointsToNext = nextLeague ? Math.max(0, nextLeague.min - profile.totalPoints) : 0;

  const leagueCards = [
    { key: 'Starter', label: 'Starter', range: '< 25 pts', Icon: Shield, tagVariant: 'tag--yellow' },
    { key: 'Bronze', label: 'Bronze', range: '25–50 pts', Icon: Medal, tagVariant: 'tag--orange' },
    { key: 'Silver', label: 'Silver', range: '50–100 pts', Icon: Star, tagVariant: 'tag--blue' },
    { key: 'Gold', label: 'Gold', range: '100–200 pts', Icon: Crown, tagVariant: 'tag--featured' },
    { key: 'Diamond', label: 'Diamond', range: '200+ pts', Icon: Gem, tagVariant: 'tag--purple' },
  ] as const;

  /* ── Reusable sub-components ── */
  const FunnelRow = ({
    label, percentage, color,
  }: { label: string; percentage: number; color: string }) => (
    <div className="flex items-center gap-4">
      <span
        className="w-20 text-xs font-semibold shrink-0"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-3 rounded-full overflow-hidden"
        style={{ background: 'var(--color-bg-muted)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
      <span
        className="w-10 text-sm font-bold text-right shrink-0"
        style={{ color: 'var(--color-text-primary)' }}
      >
        {percentage}%
      </span>
    </div>
  );

  const StatItem = ({
    icon: Icon,
    label,
    value,
    iconColor,
  }: { icon: React.ElementType; label: string; value: number; iconColor: string }) => (
    <div
      className="card__inset"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '10px 12px',
      }}
    >
      {/* Icon + label — truncates if too long */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1 }}>
        <span style={{ color: iconColor, flexShrink: 0 }}>
          <Icon size={13} strokeWidth={2} />
        </span>
        <span style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>
      {/* Number — right side, medium-bold */}
      <span style={{
        fontSize: 'var(--text-base)',
        fontWeight: 'var(--weight-bold)',
        color: 'var(--color-text-primary)',
        flexShrink: 0,
      }}>
        {value}
      </span>
    </div>
  );

  const PhaseCard = ({
    title, percentage, tagVariant, children,
  }: { title: string; percentage: number; tagVariant: string; children: React.ReactNode }) => (
    <div className="card" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h4 style={{
          fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)',
          color: 'var(--color-text-primary)', minWidth: 0, marginRight: '8px',
        }}>
          {title}
        </h4>
        <span className={`tag ${tagVariant}`} style={{ flexShrink: 0 }}>{percentage}%</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>
    </div>
  );

  return (
    <div className="space-y-14 pb-20 animate-in fade-in duration-700">

      {/* ── Header ── */}
      <section className="flex flex-col md:flex-row gap-6 items-start justify-between">
        <div>
          <h1 className="detail-panel__title mb-1">Evolution Metrics</h1>
          <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Monitoring the transition from information to ingrained behavior.
          </p>
        </div>
        <button className="btn btn--decline">
          <Mail size={16} strokeWidth={2} /> Export Insights
        </button>
      </section>

      {/* ── Behavioral Funnel + Level ── */}
      <section className="grid grid-cols-12 gap-6">
        {/* Funnel */}
        <div className="col-span-12 xl:col-span-8 card">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>
              Behavioral Transition Funnel
            </h3>
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: 'var(--emerald)' }}
              />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                Live Pulse
              </span>
            </div>
          </div>
          <div className="space-y-8">
            <FunnelRow label="Knowledge" percentage={knowledgePct} color="var(--color-text-muted)" />
            <FunnelRow label="Intention" percentage={intentionPct} color="var(--dodger-blue)" />
            <FunnelRow label="Action" percentage={actionPct} color="var(--bright-amber)" />
          </div>
        </div>

        {/* Level card */}
        <div className="col-span-12 xl:col-span-4 card flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold mb-4" style={{ color: 'var(--color-text-muted)' }}>
              Current Level
            </h3>
            <div className="card__inset mb-4">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
                Current League
              </p>
              <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {currentLeague} League
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {profile.totalPoints} total points
              </p>
            </div>
          </div>
          <div className="card__inset" style={{ background: 'var(--color-primary-light)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
              Next Level
            </p>
            {nextLeague ? (
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {pointsToNext} points away from {nextLeague.key} League
              </p>
            ) : (
              <p className="text-sm font-bold" style={{ color: 'var(--emerald)' }}>
                Top tier reached: Diamond League 💎
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Achievement Wall ── */}
      <section className="card" style={{ maxWidth: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          paddingBottom: '20px', marginBottom: '20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <h3 style={{
            fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-text-muted)', letterSpacing: '0.04em',
          }}>
            Your Achievement Wall
          </h3>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
        }}>
          {leagueCards.map(({ key, label, range, Icon, tagVariant }) => {
            const isCurrent = currentLeague === key;
            return (
              <div
                key={key}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  textAlign: 'center', padding: '16px 12px',
                  background: isCurrent ? 'rgba(255,215,0,0.08)' : 'var(--color-bg-muted)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                  outline: isCurrent ? '2px solid var(--bright-amber)' : 'none',
                  outlineOffset: '-1px',
                  transition: 'all 0.2s ease',
                  opacity: isCurrent ? 1 : 0.65,
                }}
              >
                <div
                  className="icon-badge icon-badge--sm"
                  style={{
                    marginBottom: '10px',
                    background: isCurrent ? 'var(--color-primary-light)' : 'rgba(255,255,255,0.6)',
                  }}
                >
                  <Icon size={20} />
                </div>
                <p style={{
                  fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)',
                  color: 'var(--color-text-primary)', marginBottom: '4px',
                }}>
                  {label}
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {range}
                </p>
                {isCurrent && (
                  <span className={`tag ${tagVariant}`} style={{ marginTop: '10px' }}>Current</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Phase breakdown ── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <PhaseCard title="Phase 1: Knowledge" percentage={knowledgePct} tagVariant="tag--yellow">
          <StatItem icon={Mail} label="Received Actions" value={stats.received} iconColor="var(--color-text-muted)" />
          <StatItem icon={BookOpen} label="Read Actions" value={stats.read} iconColor="var(--dodger-blue)" />
        </PhaseCard>

        <PhaseCard title="Phase 2: Intention" percentage={intentionPct} tagVariant="tag--blue">
          <StatItem icon={ThumbsUp} label="Accepted Actions" value={stats.accepted} iconColor="var(--dodger-blue)" />
          <StatItem icon={XCircle} label="Skipped Actions" value={stats.skipped} iconColor="var(--hot-fuchsia)" />
        </PhaseCard>

        <PhaseCard title="Phase 3: Action" percentage={actionPct} tagVariant="tag--orange">
          <StatItem icon={CheckCircle2} label="Validated Success" value={stats.validatedSuccess} iconColor="var(--emerald)" />
          <StatItem icon={AlertCircle} label="Attempt Failure" value={stats.attemptFailure} iconColor="var(--hot-fuchsia)" />
          <StatItem icon={Flag} label="Ongoing Quest" value={stats.ongoingQuest} iconColor="var(--dodger-blue)" />
        </PhaseCard>
      </section>

      {/* ── Leaderboard ── */}
      <section>
        <Leaderboard />
      </section>
    </div>
  );
};

export default Analytics;
