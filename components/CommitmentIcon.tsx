// CommitmentIcon - Nudgeable.ai Component
// Usage: import CommitmentIcon from './CommitmentIcon'; <CommitmentIcon />
import { useEffect, useRef, useState } from 'react';

interface CommitmentIconProps {
  actionTitle?: string;
  variant?: 'screen' | 'card';
}

export default function CommitmentIcon({ actionTitle, variant = 'screen' }: CommitmentIconProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(true), 20);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const isCard = variant === 'card';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        borderRadius: 'var(--radius-xl)',
        background: isCard ? '#221D23' : '#221D23',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        padding: isCard ? '18px 16px' : '28px 24px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(8px)',
        transition: 'opacity 0.32s cubic-bezier(0.16,1,0.3,1), transform 0.32s cubic-bezier(0.16,1,0.3,1)',
        pointerEvents: 'none',
      }}
      role="status"
      aria-label="Commitment confirmed"
    >
      {/* Pulsing ring + check circle */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Outer pulse ring */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'rgba(35, 206, 107, 0.14)',
            animation: visible ? 'commitPulse 1.8s ease-out infinite' : 'none',
          }}
        />
        {/* Mid ring */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: 66,
            height: 66,
            borderRadius: '50%',
            background: 'rgba(35, 206, 107, 0.10)',
            animation: visible ? 'commitPulse 1.8s ease-out 0.3s infinite' : 'none',
          }}
        />
        {/* Core circle */}
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #23CE6B 0%, #1aad58 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 28px rgba(35, 206, 107, 0.45)',
            flexShrink: 0,
            fontSize: 28,
            lineHeight: 1,
          }}
          role="img"
          aria-label="Handshake"
        >
          🤝
        </div>
      </div>

      {/* Text block */}
      <div style={{ textAlign: 'center', maxWidth: '100%' }}>
        <p
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Commitment Made
        </p>
        {actionTitle && (
          <p
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              color: 'rgba(255,255,255,0.88)',
              lineHeight: 'var(--leading-snug)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {actionTitle}
          </p>
        )}
      </div>

      {/* Brand yellow loading dots */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        aria-hidden="true"
      >
        {[0, 0.18, 0.36].map((delay, i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#FFCE00',
              display: 'inline-block',
              animation: visible
                ? `commitDot 1.1s ease-in-out ${delay}s infinite`
                : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
