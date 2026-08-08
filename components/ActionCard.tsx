
import React, { useState } from 'react';
import { ActionCard as ActionCardType } from '../lib/types';
import { useEngine } from '../lib/store';
import { Lightbulb, Clock, ChevronDown, X, CheckCircle2, Pencil, Trash2 } from 'lucide-react';

interface Props {
  action: ActionCardType;
  onMarkComplete?: (actionId: string) => void;
  statusBadge?: { label: string; className: string };
  onEdit?: (actionId: string) => void;
  onDelete?: (actionId: string) => void;
}

const ActionCard: React.FC<Props> = ({
  action,
  onMarkComplete,
  statusBadge,
  onEdit,
  onDelete,
}) => {
  const { declineAction } = useEngine();
  const [showFullDetail, setShowFullDetail] = useState(false);

  return (
    <div
      className="challenge-card challenge-card--featured"
      style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>

        <div className="challenge-card__meta" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            {statusBadge && (
              <span className="tag tag--featured">{statusBadge.label}</span>
            )}
          </div>
          {(onEdit || onDelete) && (
            <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
              {onEdit && (
                <button
                  onClick={() => onEdit(action.id)}
                  className="btn btn--icon"
                  aria-label="Edit action"
                  title="Edit"
                  style={{ width: 26, height: 26 }}
                >
                  <Pencil size={12} strokeWidth={2.5} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(action.id)}
                  className="btn btn--icon"
                  aria-label="Delete action"
                  title="Delete"
                  style={{ width: 26, height: 26 }}
                >
                  <Trash2 size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}
        </div>

        <p
          className="challenge-card__title"
          title={action.title}
          style={{
            flex: 1,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {action.title}
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          paddingTop: '8px',
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

      {onMarkComplete && (
        <div className="challenge-card__actions" style={{ paddingTop: '8px' }}>
          <button
            onClick={() => onMarkComplete(action.id)}
            className="btn btn--accept btn--sm"
          >
            <CheckCircle2 size={14} strokeWidth={2.5} style={{ marginRight: 4 }} />
            Mark as complete
          </button>
          <button onClick={() => declineAction(action.id)} className="btn btn--decline btn--sm">
            Decline <ChevronDown size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}

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
              onMarkComplete?.(action.id);
            }}
            className="btn btn--primary btn--full btn--sm"
          >
            Mark as complete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionCard;
