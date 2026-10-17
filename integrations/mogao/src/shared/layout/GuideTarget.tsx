import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOnboarding } from '@/shared/contexts/OnboardingContext';

interface GuideTargetProps {
  targetStep: number;
  message: string;
  detail?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

export function GuideTarget({ targetStep, message, detail, side = 'bottom', children }: GuideTargetProps) {
  const { step, advance, skip } = useOnboarding();
  const isActive = step === targetStep;
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!isActive) { setRect(null); return; }
    const el = ref.current;
    if (!el) return;
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isActive]);

  return (
    <div ref={ref}>
      {children}
      {isActive && rect && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 9000, background: 'rgba(0,0,0,0.55)' }}
            onClick={skip}
          />
          {/* Highlight ring */}
          <div
            className="fixed pointer-events-none rounded-lg"
            style={{
              zIndex: 9001,
              top: rect.top - 4,
              left: rect.left - 4,
              width: rect.width + 8,
              height: rect.height + 8,
              boxShadow: '0 0 0 3px #c09a6b, 0 0 24px rgba(192,154,107,0.6)',
            }}
          />
          {/* Callout */}
          <div
            className="fixed bg-zinc-900 rounded-xl shadow-2xl p-4 w-64"
            style={{ zIndex: 9002, ...calloutPos(rect, side) }}
          >
            <p className="text-sm font-semibold text-white mb-1">{message}</p>
            {detail && (
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">{detail}</p>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={skip}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                跳过引导
              </button>
              <button
                onClick={advance}
                className="text-xs bg-amber-700 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
              >
                知道了 →
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function calloutPos(rect: DOMRect, side: string): React.CSSProperties {
  const GAP = 12;
  const W = 256;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeLeft = (x: number) => Math.max(8, Math.min(x, vw - W - 8));

  switch (side) {
    case 'bottom':
      return { top: rect.bottom + GAP, left: safeLeft(rect.left) };
    case 'top':
      return { bottom: vh - rect.top + GAP, left: safeLeft(rect.left) };
    case 'right':
      return { top: Math.min(rect.top, vh - 160), left: rect.right + GAP };
    case 'left':
      return { top: Math.min(rect.top, vh - 160), right: vw - rect.left + GAP };
    default:
      return { top: rect.bottom + GAP, left: safeLeft(rect.left) };
  }
}
