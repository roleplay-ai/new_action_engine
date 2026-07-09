
import React, { useState } from 'react';
import { ActionCard as ActionCardType } from '../lib/types';
import { useEngine } from '../lib/store';
import { Lightbulb, Clock, ChevronDown, X } from 'lucide-react';
import CommitmentIcon from './CommitmentIcon';
import { getCurrentISTDate } from '@/lib/timezone-utils';

interface Props {
  action: ActionCardType;
  onActionComplete?: () => void;
  planButtonLabel?: string;
  statusBadge?: { label: string; className: string };
}

const ActionCard: React.FC<Props> = ({
  action,
  onActionComplete,
  planButtonLabel = 'Plan Actions',
  statusBadge,
}) => {
  const { acceptAction, acceptActionWithoutSchedule, declineAction } = useEngine();
  const [isScheduling, setIsScheduling] = useState(false);
  const [showFullDetail, setShowFullDetail] = useState(false);
  const [scheduleData, setScheduleData] = useState({ date: getCurrentISTDate(), time: '09:00', sync: true });
  const [showCommitmentAnim, setShowCommitmentAnim] = useState(false);
  const [commitmentAnimKey, setCommitmentAnimKey] = useState(0);

  const showCommitmentUntilUnmount = () => {
    setCommitmentAnimKey((k) => k + 1);
    setShowCommitmentAnim(true);
  };

  const confirmAccept = async () => {
    showCommitmentUntilUnmount();
    const { error } = await acceptAction(action.id, scheduleData.date, scheduleData.time, scheduleData.sync);
    if (error) { setShowCommitmentAnim(false); return; }
    setIsScheduling(false);
    onActionComplete?.();
  };

  return (
    <div
      className="challenge-card challenge-card--featured"
      style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      {/* ── Card body ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Tags row */}
        <div className="challenge-card__meta">
          {statusBadge && (
            <span className="tag tag--featured">{statusBadge.label}</span>
          )}
          <span className="tag tag--orange">{action.theme}</span>
        </div>

        {/* Title */}
        <p
          className="challenge-card__title"
          title={action.title}
          style={{
            flex: 1,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {action.title}
        </p>

        {/* Meta row */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          paddingTop: '10px',
          borderTop: '1px solid var(--color-border)',
        }}>
          <button
            onClick={() => setShowFullDetail(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
            }}
          >
            <Lightbulb size={14} style={{ color: 'var(--bright-amber)', flexShrink: 0 }} strokeWidth={2.5} />
            HOW &amp; WHY?
          </button>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-text-muted)',
          }}>
            <Clock size={14} style={{ color: 'var(--bright-amber)', flexShrink: 0 }} strokeWidth={2.5} />
            {action.timeEstimate}
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="challenge-card__actions" style={{ paddingTop: '10px' }}>
        <button
          onClick={() => {
            setIsScheduling(true);
          }}
          className="btn btn--accept btn--sm"
        >
          {planButtonLabel !== 'Plan Actions' ? planButtonLabel : 'Accept'}
        </button>
        <button onClick={() => declineAction(action.id)} className="btn btn--decline btn--sm">
          Decline <ChevronDown size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── Schedule overlay ── */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 30,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          background: 'rgba(34,29,35,0.35)',
          borderRadius: 'var(--radius-xl)',
          pointerEvents: isScheduling ? 'auto' : 'none',
          opacity: isScheduling ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
        aria-hidden={!isScheduling}
      >
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
            padding: '20px',
            transform: isScheduling ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.28s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-muted)' }}>
              Schedule
            </span>
            <button
              className="btn btn--icon"
              onClick={async () => {
                showCommitmentUntilUnmount();
                setIsScheduling(false);
                const { error } = await acceptActionWithoutSchedule(action.id);
                if (error) { setShowCommitmentAnim(false); return; }
                onActionComplete?.();
              }}
              aria-label="Accept without scheduling"
              title="Accept without scheduling"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Date</label>
              <input
                type="date"
                className="form-input"
                value={scheduleData.date}
                min={getCurrentISTDate()}
                onChange={e => setScheduleData(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Time</label>
              <input
                type="time"
                className="form-input"
                value={scheduleData.time}
                onChange={e => setScheduleData(p => ({ ...p, time: e.target.value }))}
              />
            </div>
          </div>

          <button onClick={confirmAccept} className="btn btn--accept btn--full btn--sm">
            Commit Plan
          </button>
        </div>
      </div>

      {/* ── Commitment animation (stays within card; non-blocking) ── */}
      {showCommitmentAnim && (
        <CommitmentIcon
          key={commitmentAnimKey}
          actionTitle={action.title}
          variant="card"
        />
      )}

      {/* ── HOW & WHY overlay ── */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(34,29,35,0.35)',
          borderRadius: 'var(--radius-xl)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          opacity: showFullDetail ? 1 : 0,
          pointerEvents: showFullDetail ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
            padding: '20px',
            maxHeight: '75%',
            overflowY: 'auto',
            transform: showFullDetail ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)' }}>
              Action Strategy
            </h4>
            <button className="btn btn--icon" onClick={() => setShowFullDetail(false)} aria-label="Close">
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="detail-panel__body" style={{ marginBottom: '14px' }}>
            <h5 className="detail-panel__section-title" style={{ marginTop: 0 }}>How to do it</h5>
            <p style={{ fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)' }}>{action.how}</p>

            <h5 className="detail-panel__section-title">Why it matters</h5>
            <p style={{ fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)' }}>{action.why}</p>
          </div>

          <button
            onClick={() => {
              setShowFullDetail(false);
              setIsScheduling(true);
            }}
            className="btn btn--primary btn--full btn--sm"
          >
            Plan this action
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionCard;
