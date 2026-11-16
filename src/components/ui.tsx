import { X } from 'lucide-react';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { scoreColor } from '../lib/score';
import { getToasts, subscribeToasts } from './toast';

/** The logo: a wall with a door swinging open, as drawn on a floor plan. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
      <path d="M7.5 19H4.5V4.5H19.5V19H13.5" strokeWidth="2.3" strokeLinejoin="round" />
      <path d="M7.5 19V13" strokeWidth="1.7" />
      <path d="M7.5 13A6 6 0 0 1 13.5 19" strokeWidth="1.3" />
    </svg>
  );
}

export function Sheet({ title, onClose, children, wide, actions }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; actions?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    box.current?.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <div className="grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A progress or score ring. */
export function Ring({ value, size = 64, stroke = 6, color = 'var(--brand)', track = 'var(--line-2)', children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, Math.min(1, value)) * c} ${c}`}
          style={{ transition: 'stroke-dasharray 0.4s' }}
        />
      </svg>
      {children !== undefined ? <div className="val">{children}</div> : null}
    </div>
  );
}

export function ScoreBadge({ score, title }: { score: number | null; title?: string }) {
  return (
    <span className="score" style={{ background: scoreColor(score) }} title={title}>
      {score === null ? '–' : score}
    </span>
  );
}

export function Toaster() {
  const list = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div className="toast" key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
