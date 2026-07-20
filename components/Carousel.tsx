
import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselProps {
  children: React.ReactNode;
  title?: string;
  narrowSlides?: boolean;
  wideSlides?: boolean;
}

const Carousel: React.FC<CarouselProps> = ({ children, title, narrowSlides, wideSlides }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const childrenArray = React.Children.toArray(children);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const firstSlide = el.firstElementChild as HTMLElement | null;
      const gap = parseInt(getComputedStyle(el).gap, 10) || 20;
      const slideWidth = firstSlide ? firstSlide.offsetWidth + gap : el.clientWidth;
      el.scrollBy({ left: direction === 'left' ? -slideWidth : slideWidth, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative w-full">
      {title && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2 style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--weight-bold)',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
            }}>
              {title}
              <span style={{ color: 'var(--bright-amber)', marginLeft: '4px' }}>!</span>
            </h2>
            <div style={{
              height: '3px',
              width: '36px',
              borderRadius: '9999px',
              background: 'var(--bright-amber)',
              marginTop: '6px',
            }} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn--icon" onClick={() => scroll('left')} aria-label="Previous">
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <button className="btn btn--icon" onClick={() => scroll('right')} aria-label="Next">
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {childrenArray.length > 0 ? (
        <div
          ref={scrollRef}
          className={`no-scrollbar${wideSlides ? ' carousel-track--wide' : ''}`}
          style={{
            display: 'flex',
            gap: wideSlides ? '16px' : '20px',
            overflowX: 'auto',
            /* Extra padding on all sides so card box-shadow isn't clipped by the overflow container */
            padding: '6px 4px 18px 4px',
            margin: '-6px -4px -18px -4px',
            scrollSnapType: 'x mandatory',
            scrollBehavior: 'smooth',
          }}
        >
          {childrenArray.map((child, idx) => (
            <div
              key={idx}
              className={wideSlides ? 'carousel-slide--wide' : undefined}
              style={
                wideSlides
                  ? undefined
                  : {
                      flexShrink: 0,
                      scrollSnapAlign: 'start',
                      width: narrowSlides ? 'min(300px, 82vw)' : 'min(360px, 82vw)',
                      height: '260px',
                    }
              }
            >
              {child}
            </div>
          ))}
        </div>
      ) : (
        <div className="card card--flat" style={{ textAlign: 'center', padding: '48px 32px' }}>
          <div className="icon-badge">⚡</div>
          <h3 className="card__title">All caught up!</h3>
          <p className="card__subtitle" style={{ marginBottom: 0 }}>
            Check the library or wait for your next sprint batch.
          </p>
        </div>
      )}
    </div>
  );
};

export default Carousel;
