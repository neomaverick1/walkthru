import { ArrowUpRight, Check, Circle, PenLine, RotateCcw, Trash2, Type, Undo2, X, AlertTriangle, Camera } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';

import { CHECK_TEXT, MARK_COLORS, usePhotoUrl } from '../lib/photos';
import { savePhoto, useStore } from '../lib/store';
import type { Mark } from '../lib/types';
import { stamp, uid } from '../lib/util';

/**
 * A stored photo. Markup is drawn on top with the same cover-crop as the image
 * (preserveAspectRatio "slice" matches object-fit: cover), so circles stay on the damage in any thumbnail.
 * The crop leans toward the marks, so damage near an edge isn't cut off.
 */
export function Img({ id, className, alt = '', focusFrom }: { id?: string; className?: string; alt?: string; /** Crop like this other photo, so a before and after line up */ focusFrom?: string }) {
  const p = useStore((s) => (id ? s.photos[id] : undefined));
  const other = useStore((s) => (focusFrom ? s.photos[focusFrom] : undefined));
  const url = usePhotoUrl(p);
  if (!url || !p) return <span className={className} style={{ display: 'block', background: 'var(--line-2)' }} />;
  if (!p.marks.length) {
    const position = other?.marks.length ? focusOf(other.marks).position : undefined;
    return <img src={url} className={className} alt={alt} loading="lazy" decoding="async" draggable={false} style={position ? { objectPosition: position } : undefined} />;
  }
  const f = focusOf(p.marks);
  return (
    <span className={className} style={{ position: 'relative', display: 'block', overflow: 'hidden' }}>
      <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: f.position, display: 'block' }} />
      <MarksLayer marks={p.marks} w={p.width} h={p.height} slice={f.align} />
    </span>
  );
}

/** Which side of a cropped thumbnail to keep so the marks stay in view */
function focusOf(marks: Mark[]) {
  const pts = marks.flatMap((m) => m.points);
  const avg = (i: 0 | 1) => pts.reduce((s, q) => s + q[i], 0) / Math.max(1, pts.length);
  const pick = <T,>(v: number, lo: T, mid: T, hi: T) => (v < 0.34 ? lo : v > 0.66 ? hi : mid);
  const x = avg(0);
  const y = avg(1);
  return {
    position: `${pick(x, 'left', 'center', 'right')} ${pick(y, 'top', 'center', 'bottom')}`,
    align: `${pick(x, 'xMin', 'xMid', 'xMax')}${pick(y, 'YMin', 'YMid', 'YMax')}`,
  };
}

/** Marks drawn as SVG over a photo, sharing coordinates with the canvas renderer. */
export function MarksLayer({ marks, w, h, draft, slice }: { marks: Mark[]; w: number; h: number; draft?: Mark | null; slice?: boolean | string }) {
  const lw = Math.max(3, Math.round(Math.max(w, h) * 0.0065));
  const all = draft ? [...marks, draft] : marks;
  return (
    <svg
      className="marks"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={slice ? `${typeof slice === 'string' ? slice : 'xMidYMid'} slice` : 'none'}
      aria-hidden="true"
      style={slice ? { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' } : undefined}
    >
      <defs>
        <filter id="mk-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation={lw * 0.7} floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>
      {all.map((m) => {
        const pts = m.points.map(([x, y]) => [x * w, y * h]);
        const common = { stroke: m.color, strokeWidth: lw, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, filter: 'url(#mk-shadow)' };
        if (m.kind === 'pen' && pts.length > 1) return <polyline key={m.id} points={pts.map((p) => p.join(',')).join(' ')} {...common} />;
        if (m.kind === 'circle' && pts.length > 1) {
          const [[x0, y0], [x1, y1]] = pts;
          return <ellipse key={m.id} cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} rx={Math.max(4, Math.abs(x1 - x0) / 2)} ry={Math.max(4, Math.abs(y1 - y0) / 2)} {...common} />;
        }
        if (m.kind === 'arrow' && pts.length > 1) {
          const [[x0, y0], [x1, y1]] = pts;
          const a = Math.atan2(y1 - y0, x1 - x0);
          const head = lw * 4.2;
          const p1 = [x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45)];
          const p2 = [x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45)];
          return (
            <g key={m.id} filter="url(#mk-shadow)">
              <line x1={x0} y1={y0} x2={x1 - Math.cos(a) * head * 0.6} y2={y1 - Math.sin(a) * head * 0.6} stroke={m.color} strokeWidth={lw} strokeLinecap="round" />
              <polygon points={`${x1},${y1} ${p1.join(',')} ${p2.join(',')}`} fill={m.color} />
            </g>
          );
        }
        if (m.kind === 'text' && m.text) {
          const size = Math.round(Math.max(w, h) * 0.032);
          const [x, y] = pts[0];
          const tw = m.text.length * size * 0.56;
          const pad = size * 0.4;
          return (
            <g key={m.id}>
              <rect x={x} y={y - size - pad} width={tw + pad * 2} height={size + pad * 2} rx={size * 0.35} fill="rgba(12,20,38,0.82)" />
              <text x={x + pad} y={y - pad * 0.25} fontSize={size} fontWeight={600} fill={m.color} fontFamily="Public Sans Variable, Public Sans, sans-serif">
                {m.text}
              </text>
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}

type Tool = 'arrow' | 'circle' | 'pen' | 'text';

interface ViewerProps {
  id: string;
  title?: string;
  /** Just taken: show the quality check with Retake and Use. */
  review?: boolean;
  onClose: () => void;
  onRetake?: () => void;
  onDelete?: () => void;
}

/** Full-screen photo: quality check, markup with arrows, circles, pen and labels. */
export function PhotoViewer({ id, title, review, onClose, onRetake, onDelete }: ViewerProps) {
  const photo = useStore((s) => s.photos[id]);
  const url = usePhotoUrl(photo);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>('circle');
  const [color, setColor] = useState(MARK_COLORS[0]);
  const [marks, setMarks] = useState<Mark[]>(photo?.marks ?? []);
  const [draft, setDraft] = useState<Mark | null>(null);
  const [text, setText] = useState('');
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);

  if (!photo) return null;

  const pos = (e: RPointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))] as [number, number];
  };
  const down = (e: RPointerEvent) => {
    if (!editing) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pos(e);
    if (tool === 'text') {
      if (!text.trim()) return;
      setMarks((m) => [...m, { id: uid(), kind: 'text', color, points: [p], text: text.trim() }]);
      setText('');
      return;
    }
    setDraft({ id: uid(), kind: tool, color, points: [p, p] });
  };
  const move = (e: RPointerEvent) => {
    if (!draft) return;
    const p = pos(e);
    setDraft({ ...draft, points: draft.kind === 'pen' ? [...draft.points, p] : [draft.points[0], p] });
  };
  const up = () => {
    if (!draft) return;
    const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]];
    if (draft.kind === 'pen' || Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.015) setMarks((m) => [...m, draft]);
    setDraft(null);
  };
  const save = () => {
    savePhoto({ ...photo, marks });
    setEditing(false);
  };

  const verdict = photo.check?.verdict ?? 'ok';
  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={title ?? 'Photo'}>
      <div className="vbar">
        <button className="icon-btn" aria-label="Close" onClick={editing ? () => (setMarks(photo.marks), setEditing(false)) : onClose}>
          <X />
        </button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editing ? 'Mark up' : (title ?? 'Photo')}</div>
          <div className="tiny" style={{ opacity: 0.7 }}>
            {stamp(photo.takenAt)} · {photo.width}×{photo.height}
          </div>
        </div>
        {editing ? (
          <>
            <button className="icon-btn" aria-label="Undo" onClick={() => setMarks((m) => m.slice(0, -1))} disabled={!marks.length}>
              <Undo2 />
            </button>
            <button className="btn sm primary" onClick={save}>
              <Check /> Done
            </button>
          </>
        ) : onDelete ? (
          <button className="icon-btn" aria-label="Delete photo" onClick={onDelete}>
            <Trash2 />
          </button>
        ) : null}
      </div>
      <div className="stage">
        <div className="frame" ref={frame} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ cursor: editing ? 'crosshair' : 'default' }}>
          {url ? <img src={url} alt={title ?? ''} draggable={false} /> : null}
          <MarksLayer marks={marks} w={photo.width} h={photo.height} draft={draft} />
        </div>
      </div>
      <div className="tools">
        {editing ? (
          <>
            <div className="row" style={{ gap: 8 }}>
              {(
                [
                  ['circle', 'Circle', Circle],
                  ['arrow', 'Arrow', ArrowUpRight],
                  ['pen', 'Draw', PenLine],
                  ['text', 'Label', Type],
                ] as const
              ).map(([id, lbl, Icon]) => (
                <button key={id} className="tool" aria-pressed={tool === id} onClick={() => setTool(id)}>
                  <Icon />
                  {lbl}
                </button>
              ))}
            </div>
            {tool === 'text' ? (
              <div className="row" style={{ maxWidth: 420, margin: '0 auto', width: '100%' }}>
                <input className="input" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} placeholder="Type a label, then tap the photo" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
            ) : null}
            <div className="row" style={{ gap: 10 }}>
              {MARK_COLORS.map((c) => (
                <button key={c} className="swatch" style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
              ))}
            </div>
          </>
        ) : (
          <>
            {review ? (
              <div className={`verdict${verdict === 'ok' ? '' : ' bad'}`}>
                {verdict === 'ok' ? <Check /> : <AlertTriangle />}
                {CHECK_TEXT[verdict]}
              </div>
            ) : null}
            <div className="row" style={{ gap: 8 }}>
              {review && onRetake ? (
                <button className="btn" style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'transparent', color: '#fff' }} onClick={onRetake}>
                  <Camera /> Retake
                </button>
              ) : null}
              <button className="btn" style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'transparent', color: '#fff' }} onClick={() => setEditing(true)}>
                <PenLine /> Mark up
              </button>
              {marks.length ? (
                <button className="btn" style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'transparent', color: '#fff' }} onClick={() => (setMarks([]), savePhoto({ ...photo, marks: [] }))}>
                  <RotateCcw /> Clear marks
                </button>
              ) : null}
              <button className="btn primary" onClick={onClose}>
                <Check /> {review ? 'Use photo' : 'Done'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

