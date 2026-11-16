// The live floor plan, drawn like an architect's plan: walls, doors and their swings, windows, fixtures and
// furniture, room sizes, the lot, driveway and deck. Rooms tint as they're inspected: blue while in progress,
// the score's color once done. On a phone the plan turns sideways so every room is big enough to read and tap.
import { useCallback, useMemo, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';

import { EXT_WALL, floorPlan, INT_WALL, type PlanBox, type PlanDoor, type Rect } from '../lib/floorplan';
import { roomProgress } from '../lib/score';
import type { Room } from '../lib/types';
import { Ring } from './ui';

const SCORE_FILL = (s: number | null) => (s === null ? '#98a2b3' : s >= 93 ? '#0f8b5f' : s >= 78 ? '#3fa45b' : s >= 55 ? '#d58a12' : '#d2372e');

interface Theme {
  ink: string;
  floor: string;
  garage: string;
  lot: string;
  paving: string;
  deck: string;
  fixture: string;
  label: string;
  sub: string;
  accent: string;
  doneAlpha: number;
  activeAlpha: number;
  fixtureOpacity: number;
}
const LIGHT: Theme = {
  ink: '#10203b',
  floor: '#ffffff',
  garage: '#f1f3f7',
  lot: '#edf2ea',
  paving: '#e0e5ec',
  deck: '#eee0c8',
  fixture: '#4f5e7a',
  label: '#10203b',
  sub: '#56647e',
  accent: '#1e46c8',
  doneAlpha: 0.16,
  activeAlpha: 0.08,
  fixtureOpacity: 0.62,
};
const DARK: Theme = {
  ink: '#ffffff',
  floor: '#173b90',
  garage: '#14357f',
  lot: '#12307a',
  paving: '#1e428f',
  deck: '#21479a',
  fixture: '#d5ddf3',
  label: '#ffffff',
  sub: '#d5ddf3',
  accent: '#ffffff',
  doneAlpha: 0.34,
  activeAlpha: 0.14,
  fixtureOpacity: 0.42,
};

function mix(a: string, b: string, t: number) {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, q] = [rgb(a), rgb(b)];
  return `#${p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

// --- Phone layout --------------------------------------------------------------------------------------------------

const NARROW = '(max-width: 640px)';
const subscribeNarrow = (cb: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(NARROW);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isNarrow = () => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches;

// --- Lettering -----------------------------------------------------------------------------------------------------

/** Approximate advance width of a string, in the same units as `size`. */
function textW(s: string, size: number, display = true) {
  let u = 0;
  for (const ch of s) {
    u += " iIl1.,:;!|'’()[]".includes(ch) ? 0.29 : 'fjrt'.includes(ch) ? 0.38 : 'mwMW'.includes(ch) ? 0.86 : ch >= 'A' && ch <= 'Z' ? 0.67 : ch >= '0' && ch <= '9' ? 0.6 : 0.56;
  }
  return u * size * (display ? 1.07 : 1);
}

/** The room's name, then shorter ways of saying it. */
function nameOptions(name: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const s = v.trim();
    if (s && !out.includes(s)) out.push(s);
  };
  push(name);
  const base = name.replace(/\s*&.*$/, '');
  push(base);
  const short = base.replace(/\b([Bb])athroom\b/, '$1ath').replace(/\b([Bb])edroom\b/, '$1ed');
  push(short);
  push(short.replace(/\s+(room|area|areas|space)$/i, ''));
  if (/^half bath/i.test(name)) push('½ bath');
  if (/^primary bed/i.test(name)) push('Primary');
  if (/^primary bath/i.test(name)) push('Bath');
  return out;
}

const DISPLAY = 'Archivo Variable, Archivo, system-ui, sans-serif';
const TEXT = 'Public Sans Variable, Public Sans, system-ui, sans-serif';

// --- Fixtures, drawn in each room's own frame: the anchor wall along the top, the door at the bottom left -----------

function frame(b: PlanBox) {
  switch (b.anchor) {
    case 'bottom':
      return { t: `translate(${b.x} ${b.y + b.h}) scale(1 -1)`, lw: b.w, lh: b.h };
    case 'right':
      return { t: `translate(${b.x + b.w} ${b.y}) rotate(90)`, lw: b.h, lh: b.w };
    case 'left':
      return { t: `translate(${b.x} ${b.y + b.h}) rotate(-90)`, lw: b.h, lh: b.w };
    default:
      return { t: `translate(${b.x} ${b.y})`, lw: b.w, lh: b.h };
  }
}

interface Pens {
  line: Record<string, string | number>;
  solid: Record<string, string | number>;
}

function toilet(x: number, p: Pens) {
  return (
    <g>
      <rect x={x} y={0.15} width={1.9} height={0.75} rx={0.15} {...p.solid} />
      <ellipse cx={x + 0.95} cy={1.85} rx={0.75} ry={0.95} {...p.solid} />
    </g>
  );
}

function localFixtures(b: PlanBox, lw: number, lh: number, p: Pens): ReactNode {
  switch (b.kind) {
    case 'bedroom': {
      const king = b.primary || lw >= 14;
      const bw = king ? 6.4 : 5;
      const bl = 6.8;
      const bx = lw / 2 - bw / 2;
      const closet = !b.walkIn && lw - 4.2 >= 4 && lh >= 11;
      return (
        <g>
          <rect x={bx} y={0.3} width={bw} height={bl} rx={0.3} {...p.solid} />
          <rect x={bx + 0.35} y={0.65} width={bw / 2 - 0.55} height={1.25} rx={0.35} {...p.line} />
          <rect x={bx + bw / 2 + 0.2} y={0.65} width={bw / 2 - 0.55} height={1.25} rx={0.35} {...p.line} />
          <path d={`M ${bx} 2.7 H ${bx + bw} M ${bx + bw} 2.7 L ${bx + bw - 1.5} 4.2`} {...p.line} />
          {lw - bw >= 4.4 ? (
            <>
              <rect x={bx - 1.9} y={0.35} width={1.6} height={1.6} {...p.line} />
              <rect x={bx + bw + 0.3} y={0.35} width={1.6} height={1.6} {...p.line} />
            </>
          ) : null}
          {closet ? (
            <g>
              <rect x={4.2} y={lh - 2.2} width={lw - 4.4} height={2.05} {...p.line} />
              <path d={`M 4.4 ${lh - 1.1} H ${lw - 0.4}`} {...p.line} strokeDasharray="0.45 0.3" />
            </g>
          ) : null}
        </g>
      );
    }
    case 'bathroom': {
      if (b.half) {
        return (
          <g>
            {toilet(0.5, p)}
            {lw >= 4.8 ? (
              <g>
                <rect x={lw - 2.1} y={0.15} width={1.95} height={1.7} {...p.solid} />
                <ellipse cx={lw - 1.12} cy={0.95} rx={0.6} ry={0.45} {...p.line} />
              </g>
            ) : (
              <rect x={lw - 1.8} y={2.6} width={1.65} height={2.2} {...p.solid} />
            )}
          </g>
        );
      }
      if (b.primary) {
        const tub = Math.min(5.2, lw - 4.1);
        return (
          <g>
            <rect x={0.15} y={0.15} width={3.5} height={3.5} {...p.solid} />
            <path d="M 0.15 0.15 L 3.65 3.65 M 3.65 0.15 L 0.15 3.65" {...p.line} opacity={0.6} />
            <rect x={lw - tub - 0.15} y={0.15} width={tub} height={2.8} rx={0.2} {...p.solid} />
            <rect x={lw - tub + 0.25} y={0.55} width={tub - 0.8} height={2} rx={0.9} {...p.line} />
            <g transform={`translate(0 ${4.3 + 1.9}) rotate(-90)`}>{toilet(0, p)}</g>
            {lh >= 9 ? (
              <g>
                <rect x={lw - 2.1} y={3.5} width={1.95} height={5.4} {...p.solid} />
                <ellipse cx={lw - 1.12} cy={4.9} rx={0.48} ry={0.6} {...p.line} />
                <ellipse cx={lw - 1.12} cy={7.5} rx={0.48} ry={0.6} {...p.line} />
              </g>
            ) : null}
          </g>
        );
      }
      const tubFits = lw >= 8;
      return (
        <g>
          {toilet(0.5, p)}
          {tubFits ? (
            <g>
              <rect x={lw - 5.35} y={0.15} width={5.2} height={2.7} rx={0.2} {...p.solid} />
              <rect x={lw - 4.95} y={0.5} width={4.4} height={2} rx={0.9} {...p.line} />
            </g>
          ) : (
            <g>
              <rect x={lw - 3.15} y={0.15} width={3} height={3} {...p.solid} />
              <path d={`M ${lw - 3.15} 0.15 L ${lw - 0.15} 3.15 M ${lw - 0.15} 0.15 L ${lw - 3.15} 3.15`} {...p.line} opacity={0.6} />
            </g>
          )}
          {lh >= 8 ? (
            <g>
              <rect x={lw - 2.1} y={(tubFits ? 2.85 : 3.15) + 0.4} width={1.95} height={3.4} {...p.solid} />
              <ellipse cx={lw - 1.12} cy={(tubFits ? 2.85 : 3.15) + 2.1} rx={0.48} ry={0.62} {...p.line} />
            </g>
          ) : null}
        </g>
      );
    }
    case 'office':
      return (
        <g>
          <rect x={lw / 2 - 2.7} y={0.15} width={5.4} height={2.3} {...p.solid} />
          <circle cx={lw / 2} cy={3.5} r={0.85} {...p.line} />
          {lh >= 9 ? <rect x={lw - 1.3} y={3.6} width={1.15} height={4} {...p.line} /> : null}
        </g>
      );
    case 'laundry':
      return (
        <g>
          {[0, 1].map((i) => (
            <g key={i}>
              <rect x={0.3 + i * 2.6} y={0.15} width={2.4} height={2.4} rx={0.2} {...p.solid} />
              <circle cx={1.5 + i * 2.6} cy={1.35} r={0.78} {...p.line} />
            </g>
          ))}
          {lw >= 8 ? (
            <g>
              <rect x={lw - 2.3} y={0.15} width={2.15} height={1.9} {...p.solid} />
              <rect x={lw - 1.95} y={0.45} width={1.45} height={1.2} rx={0.3} {...p.line} />
            </g>
          ) : null}
        </g>
      );
    case 'closet': {
      if (b.label === 'Linen' || lw < 4.2) {
        return <path d={`M 0.4 1.3 H ${lw - 0.4} M 0.4 ${Math.min(lh - 1, 2.6)} H ${lw - 0.4}`} {...p.line} />;
      }
      const end = lh - (b.label === 'Closet' && lh > 7 ? 1.2 : 2.8);
      return (
        <g>
          <path d={`M 1.8 0.2 V ${end} M ${lw - 1.8} 0.2 V ${end}`} {...p.line} />
          <path d={`M 0.95 0.5 V ${end - 0.3} M ${lw - 0.95} 0.5 V ${end - 0.3}`} {...p.line} strokeDasharray="0.4 0.28" />
        </g>
      );
    }
    case 'storage':
      return <path d={`M 0.3 1.6 H ${lw - 0.3} M 1.6 1.6 V ${lh - 0.4}`} {...p.line} opacity={0.8} />;
    default:
      return null;
  }
}

/** Rooms in the open-plan part of the house, drawn where they sit. */
function placedFixtures(b: PlanBox, p: Pens, ctx: { slider?: PlanDoor; eatIn: boolean; doorOnLiving: boolean }): ReactNode {
  const { x, y, w, h } = b;
  switch (b.kind) {
    case 'kitchen': {
      const sink = b.sink ?? x + w / 2;
      const counterEnd = ctx.slider && ctx.slider.x < x + w && ctx.slider.x + ctx.slider.w > x ? ctx.slider.x - 0.4 : x + w - 0.15;
      const cook = sink + (counterEnd - sink) / 2 + 0.3;
      const islandW = Math.min(7, w * 0.42);
      const islandX = ctx.eatIn ? x + 3 + (counterEnd - x - 3) / 2 - islandW / 2 : x + w / 2 - islandW / 2;
      const islandY = y + h * 0.5 - 1;
      return (
        <g>
          <rect x={x + 0.15} y={y + 0.15} width={2.9} height={2.6} {...p.solid} />
          <path d={`M ${x + 0.5} ${y + 2.3} H ${x + 2.7}`} {...p.line} />
          <path d={`M ${x + 3.05} ${y + 2.1} H ${counterEnd}${counterEnd < x + w - 0.5 ? ` V ${y + 0.15}` : ''}`} {...p.line} />
          <rect x={sink - 1.35} y={y + 0.4} width={1.2} height={1.3} rx={0.25} {...p.line} />
          <rect x={sink + 0.15} y={y + 0.4} width={1.2} height={1.3} rx={0.25} {...p.line} />
          {[0, 1].map((i) => [0, 1].map((j) => <circle key={`${i}${j}`} cx={cook - 0.5 + i * 1} cy={y + 0.62 + j * 0.9} r={0.3} {...p.line} />))}
          {w >= 12 && h >= 12 ? (
            <g>
              <rect x={islandX} y={islandY} width={islandW} height={2.8} rx={0.15} {...p.solid} />
              {[...Array(Math.max(2, Math.floor(islandW / 2.1))).keys()].map((i, _, a) => (
                <circle key={i} cx={islandX + ((i + 0.5) * islandW) / a.length} cy={islandY + 3.65} r={0.6} {...p.line} />
              ))}
            </g>
          ) : null}
          {ctx.eatIn && w >= 16 ? (
            <g>
              <circle cx={x + w - 4.2} cy={y + h * 0.58} r={1.7} {...p.solid} />
              {[0, 90, 180, 270].map((a) => (
                <rect key={a} x={-0.6} y={-0.55} width={1.2} height={1.1} rx={0.25} {...p.line} transform={`translate(${x + w - 4.2} ${y + h * 0.58}) rotate(${a}) translate(0 -2.45)`} />
              ))}
            </g>
          ) : null}
        </g>
      );
    }
    case 'dining': {
      const tw = Math.min(7, w - 5);
      const th = 3.4;
      const tx = x + w / 2 - tw / 2;
      const ty = y + h * (ctx.slider ? 0.56 : 0.5) - th / 2;
      const per = Math.max(2, Math.floor(tw / 2.1));
      return (
        <g>
          <rect x={tx} y={ty} width={tw} height={th} rx={0.3} {...p.solid} />
          {Array.from({ length: per }, (_, i) => {
            const cx = tx + ((i + 0.5) * tw) / per - 0.65;
            return (
              <g key={i}>
                <rect x={cx} y={ty - 1.5} width={1.3} height={1.2} rx={0.25} {...p.line} />
                <rect x={cx} y={ty + th + 0.3} width={1.3} height={1.2} rx={0.25} {...p.line} />
              </g>
            );
          })}
          {w - tw >= 6 ? (
            <>
              <rect x={tx - 1.5} y={ty + th / 2 - 0.65} width={1.2} height={1.3} rx={0.25} {...p.line} />
              <rect x={tx + tw + 0.3} y={ty + th / 2 - 0.65} width={1.2} height={1.3} rx={0.25} {...p.line} />
            </>
          ) : null}
        </g>
      );
    }
    case 'living': {
      const groupW = Math.min(16, w - (ctx.doorOnLiving ? 6.5 : 1));
      const cx = x + 0.6 + groupW / 2;
      const cy = y + h * 0.55;
      return (
        <g>
          <rect x={x + 0.15} y={cy - 2.7} width={1.35} height={5.4} {...p.solid} />
          <path d={`M ${x + 0.85} ${cy - 2.2} V ${cy + 2.2}`} {...p.line} strokeWidth={0.22} />
          <rect x={cx - 4.6} y={cy - 3.7} width={9.2} height={7.4} rx={0.3} {...p.line} strokeDasharray="0.5 0.35" opacity={0.75} />
          <rect x={cx - 1.6} y={cy - 1.15} width={3.2} height={2.3} rx={0.3} {...p.solid} />
          <g>
            <rect x={cx + 3.2} y={cy - 3.5} width={2.9} height={7} rx={0.4} {...p.solid} />
            <path d={`M ${cx + 5.2} ${cy - 2.8} V ${cy + 2.8} M ${cx + 3.2} ${cy - 2.8} H ${cx + 6.1} M ${cx + 3.2} ${cy + 2.8} H ${cx + 6.1}`} {...p.line} />
          </g>
          {cy + 6.4 <= y + h ? (
            <g>
              <rect x={cx - 2.7} y={cy + 3.7} width={5.4} height={2.6} rx={0.4} {...p.solid} />
              <path d={`M ${cx - 2.1} ${cy + 5.6} H ${cx + 2.1}`} {...p.line} />
            </g>
          ) : null}
        </g>
      );
    }
    case 'entry':
      return (
        <g>
          {h >= 12 ? (
            <g>
              <rect x={x + w - 2.25} y={y + 6} width={2.1} height={4.6} {...p.line} />
              <path d={`M ${x + w - 1.2} ${y + 6.3} V ${y + 10.3}`} {...p.line} strokeDasharray="0.4 0.28" />
            </g>
          ) : null}
          <rect x={x + w / 2 - 1.7} y={y + h - 3.6} width={3.4} height={2.2} rx={0.2} {...p.line} strokeDasharray="0.3 0.22" />
        </g>
      );
    case 'garage': {
      const cars = w >= 19 ? 2 : 1;
      return (
        <g>
          {Array.from({ length: cars }, (_, i) => {
            const cx = x + (w / (cars * 2)) * (i * 2 + 1) - 3;
            const cy = y + h - 17.4;
            return (
              <g key={i}>
                <rect x={cx} y={cy} width={6} height={15.6} rx={1.6} {...p.line} />
                <path d={`M ${cx + 0.7} ${cy + 4.6} Q ${cx + 3} ${cy + 3.6} ${cx + 5.3} ${cy + 4.6} M ${cx + 0.8} ${cy + 11.2} Q ${cx + 3} ${cy + 12} ${cx + 5.2} ${cy + 11.2}`} {...p.line} />
                <rect x={cx + 0.9} y={cy + 5.2} width={4.2} height={5.6} rx={0.5} {...p.line} opacity={0.6} />
              </g>
            );
          })}
          <rect x={x + 1} y={y + 0.15} width={w - 2} height={1.8} {...p.line} opacity={0.7} />
        </g>
      );
    }
    default:
      return null;
  }
}

function doorPath(d: PlanDoor) {
  const dir = Math.sign(d.w) || 1;
  const L = Math.abs(d.w);
  const along = d.wall === 'h' ? [dir, 0] : [0, dir];
  const inward = d.into === 'up' ? [0, -1] : d.into === 'down' ? [0, 1] : d.into === 'left' ? [-1, 0] : [1, 0];
  const tip = [d.x + inward[0] * L, d.y + inward[1] * L];
  const end = [d.x + along[0] * L, d.y + along[1] * L];
  const sweep = inward[0] * along[1] - inward[1] * along[0] > 0 ? 1 : 0;
  return { leaf: `M ${d.x} ${d.y} L ${tip[0]} ${tip[1]}`, arc: `M ${tip[0]} ${tip[1]} A ${L} ${L} 0 0 ${sweep} ${end[0]} ${end[1]}` };
}

/** Span of a door, window or opening across the wall thickness */
const gapRect = (x: number, y: number, len: number, wall: 'h' | 'v', thick: number): Rect =>
  wall === 'h' ? { x: Math.min(x, x + len), y: y - thick / 2, w: Math.abs(len), h: thick } : { x: x - thick / 2, y: Math.min(y, y + len), w: thick, h: Math.abs(len) };

// --- The plan ------------------------------------------------------------------------------------------------------

interface Props {
  rooms: Room[];
  onPick?: (room: Room) => void;
  current?: string;
  dark?: boolean;
  compact?: boolean;
}

export function PlanView({ rooms, onPick, current, dark, compact }: Props) {
  const plan = useMemo(() => floorPlan(rooms), [rooms]);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const portrait = !compact && narrow;
  const [width, setWidth] = useState(0);
  const measure = useCallback((el: SVGSVGElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const t = dark ? DARK : LIGHT;
  const D = plan.depth;
  const R = (r: Rect): Rect => (portrait ? { x: -(r.y + r.h), y: r.x, w: r.h, h: r.w } : r);

  // The lot, with room in the yard for the labels
  const m = portrait ? { side: 6.5, rear: 5, street: 8.5 } : { side: 4.5, rear: 5.5, street: 8.5 };
  const b0 = plan.bounds;
  const lotTop = Math.min(b0.y - (plan.deck ? 2.5 : 0), -m.rear);
  const lot: Rect = { x: b0.x - m.side, y: lotTop, w: b0.w + m.side * 2, h: D + m.street - lotTop };
  const view = compact ? { x: b0.x - 1.2, y: b0.y - 1.2, w: b0.w + 2.4, h: b0.h + 2.4 } : lot;
  const vb = R(view);
  const pad = 0.3;
  const vbW = vb.w + pad * 2;
  const k = (width || (compact ? 300 : portrait ? 350 : 720)) / vbW; // screen pixels per foot
  const px = (v: number) => v / k;

  const status = (room: Room) => {
    const p = roomProgress(room);
    return { p, complete: p.total > 0 && p.done === p.total, started: p.done > 0 };
  };
  const tintOf = (room?: Room): { color: string; alpha: number } | null => {
    if (!room) return null;
    const { p, complete, started } = status(room);
    if (complete) return { color: SCORE_FILL(p.score), alpha: t.doneAlpha };
    if (started) return { color: t.accent, alpha: t.activeAlpha };
    return null;
  };
  const tap = (room?: Room) =>
    room && onPick
      ? {
          className: 'room',
          role: 'button',
          tabIndex: 0,
          'aria-label': `${room.name}: ${status(room).p.done} of ${status(room).p.total} checks`,
          onClick: () => onPick(room),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick(room);
            }
          },
        }
      : {};

  const pens: Pens = {
    line: { fill: 'none', stroke: t.fixture, strokeWidth: 0.08, strokeLinecap: 'round', strokeLinejoin: 'round' },
    solid: { fill: t.floor, stroke: t.fixture, strokeWidth: 0.08 },
  };
  const slider = plan.doors.find((d) => d.slider);
  const eatIn = !plan.boxes.some((b) => b.kind === 'dining');
  const living = plan.boxes.find((b) => b.kind === 'living');
  const doorOnLiving = !!living && !plan.boxes.some((b) => b.kind === 'entry');

  // --- Lettering in screen space ----------------------------------------------------------------------------------
  const nameMax = compact ? 10.5 : 12.5;
  const nameMin = compact ? 8 : 9.5;
  const sizes: number[] = [];
  for (let s = nameMax; s >= nameMin - 0.01; s -= 0.5) sizes.push(px(s));
  const fitName = (name: string, avail: number) => {
    const opts = nameOptions(name);
    const near = sizes.filter((s) => s >= sizes[0] * 0.86);
    for (const o of opts) for (const s of near) if (textW(o, s) <= avail) return { text: o, size: s };
    for (const o of opts) for (const s of sizes) if (textW(o, s) <= avail) return { text: o, size: s };
    return null;
  };
  const feet = (v: number) => `${Math.round(v)}′`;
  type Line = { text: string; size: number; weight: number; color: string; display?: boolean };
  const textBlock = (sb: Rect, name: string, opts: { dims?: string; status?: string[]; statusColor?: string; halo: string; key?: string; color?: string; nameScale?: number }) => {
    const avail = sb.w - px(8);
    const nm = fitName(name, avail * (opts.nameScale ? 1 / opts.nameScale : 1));
    if (!nm) return null;
    const nameLine: Line = { text: nm.text, size: nm.size * (opts.nameScale ?? 1), weight: 700, color: opts.color ?? t.label, display: true };
    const dimLine: Line | null = opts.dims && !compact && textW(opts.dims, px(9.5), false) <= avail ? { text: opts.dims, size: px(9.5), weight: 500, color: t.sub } : null;
    const stText = opts.status?.find((s) => textW(s, px(10), false) <= avail);
    const stLine: Line | null = stText && !compact ? { text: stText, size: px(10), weight: 650, color: opts.statusColor ?? t.sub } : null;
    const height = (ls: Line[]) => ls.reduce((s, l) => s + l.size * 1.22, 0);
    const room = sb.h - px(6);
    let lines = [nameLine, ...(dimLine ? [dimLine] : []), ...(stLine ? [stLine] : [])];
    if (height(lines) > room) lines = [nameLine, ...(stLine ? [stLine] : [])];
    if (height(lines) > room) lines = [nameLine];
    if (height(lines) > room) return null;
    let ly = sb.y + sb.h / 2 - height(lines) / 2;
    return {
      height: height(lines),
      width: Math.max(...lines.map((l) => textW(l.text, l.size, !!l.display))),
      node: (
        <g key={opts.key} pointerEvents="none">
          {lines.map((l, i) => {
            ly += l.size * 1.22;
            return (
              <text
                key={i}
                x={sb.x + sb.w / 2}
                y={ly - l.size * 0.3}
                textAnchor="middle"
                fontSize={l.size}
                fontWeight={l.weight}
                fill={l.color}
                stroke={opts.halo}
                strokeWidth={l.size * 0.28}
                paintOrder="stroke"
                strokeLinejoin="round"
                fontFamily={l.display ? DISPLAY : TEXT}
                style={l.display ? { fontStretch: '108%' } : undefined}
              >
                {l.text}
              </text>
            );
          })}
        </g>
      ),
    };
  };
  const statusText = (room: Room) => {
    const { p, complete, started } = status(room);
    if (complete) return [`Score ${p.score ?? '–'}`];
    const issues = p.issues ? ` · ${p.issues} issue${p.issues === 1 ? '' : 's'}` : '';
    return started ? [`${p.done} of ${p.total}${issues}`, `${p.done} of ${p.total}`, `${p.done}/${p.total}`] : [`${p.total} checks`, `0/${p.total}`];
  };
  const statusColor = (room: Room) => {
    const { p, complete, started } = status(room);
    return complete ? (dark ? '#ffffff' : mix(SCORE_FILL(p.score), '#000000', 0.18)) : started ? t.accent : t.sub;
  };
  const haloFor = (base: string, room?: Room) => {
    const tint = tintOf(room);
    return tint ? mix(base, tint.color, tint.alpha) : base;
  };

  // --- Free corners of the yard for the exterior label, scale bar and north arrow ----------------------------------
  const lotS = R(lot);
  const taken: Rect[] = [plan.house, plan.deck, plan.porch, plan.firePit && { x: plan.firePit.x - 3.5, y: plan.firePit.y - 3.5, w: 7, h: 7 }]
    .filter((r): r is Rect => !!r)
    .map(R);
  if (plan.drive) taken.push(R({ x: plan.drive.x, y: D, w: plan.drive.w, h: m.street }));
  if (plan.walk) taken.push(R({ x: plan.walk.toDrive ?? plan.walk.x, y: plan.walk.y, w: plan.walk.toDrive ? plan.walk.x + plan.walk.w - plan.walk.toDrive : plan.walk.w, h: D + m.street - plan.walk.y }));
  const corner = (w: number, h: number, prefs: string[]) => {
    const inset = px(7);
    for (const c of prefs) {
      const r = { x: c[1] === 'l' ? lotS.x + inset : lotS.x + lotS.w - inset - w, y: c[0] === 't' ? lotS.y + inset : lotS.y + lotS.h - inset - h, w, h };
      if (!taken.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)) {
        taken.push(r);
        return r;
      }
    }
    return null;
  };

  const ext = plan.exterior;
  let extLabel: ReactNode = null;
  if (ext && !compact) {
    const name = ext.name;
    const sts = statusText(ext);
    const w = Math.max(textW(name, px(12.5)), textW(sts[0], px(10), false)) + px(12);
    const h = px(12.5 + 10) * 1.22 + px(10);
    const spot = corner(w, h, ['tl', 'bl', 'tr', 'br']);
    if (spot) extLabel = textBlock(spot, name, { status: sts, statusColor: statusColor(ext), halo: haloFor(t.lot, ext), key: 'ext' })?.node ?? null;
  }
  const scaleSpot = compact ? null : corner(10, px(16), portrait ? ['bl', 'br', 'tr', 'tl'] : ['br', 'bl', 'tr', 'tl']);
  const northSpot = compact ? null : corner(px(16), px(26), ['tr', 'br', 'tl', 'bl']);

  const deck = plan.deck;
  // Room names, sizes and progress, with where each block of text sits so the done badge can keep clear of it
  const roomLabels = new Map<string, { node: ReactNode; rect: Rect }>();
  for (const b of [...plan.boxes.filter((x) => x.room), ...(deck ? [{ ...deck, key: 'deck', label: deck.room.name, kind: 'outdoor' as const }] : [])]) {
    const room = b.room!;
    const sb = R(b);
    const blk = textBlock(sb, b.label, {
      dims: b.kind === 'outdoor' ? undefined : `${feet(b.w)} × ${feet(b.h)}`,
      status: statusText(room),
      statusColor: statusColor(room),
      halo: haloFor(b.kind === 'garage' ? t.garage : b.kind === 'outdoor' ? t.deck : t.floor, room),
      key: `l-${b.key}`,
    });
    if (blk) roomLabels.set(b.key, { node: blk.node, rect: { x: sb.x + sb.w / 2 - blk.width / 2, y: sb.y + sb.h / 2 - blk.height / 2, w: blk.width, h: blk.height } });
  }
  const vbox = `${vb.x - pad} ${vb.y - pad} ${vbW} ${vb.h + pad * 2}`;
  const roomBoxes = plan.boxes.filter((b) => b.room);

  return (
    <div className={`plan${portrait ? ' portrait' : ''}${compact ? ' compact' : ''}`}>
      <svg ref={measure} viewBox={vbox} role={onPick ? 'group' : 'img'} aria-label="Floor plan of the home">
        {/* The yard: tap it for the exterior checks */}
        {!compact ? (
          <g {...tap(ext)}>
            <rect className="fill" x={lotS.x} y={lotS.y} width={lotS.w} height={lotS.h} fill={t.lot} />
            {(() => {
              const tint = tintOf(ext);
              return tint ? <rect x={lotS.x} y={lotS.y} width={lotS.w} height={lotS.h} fill={tint.color} opacity={tint.alpha * 0.8} pointerEvents="none" /> : null;
            })()}
            <rect x={lotS.x + 0.35} y={lotS.y + 0.35} width={lotS.w - 0.7} height={lotS.h - 0.7} fill="none" stroke={t.ink} strokeWidth={0.1} strokeDasharray="1.6 0.5 0.3 0.5" opacity={0.45} pointerEvents="none" />
          </g>
        ) : null}

        <g transform={portrait ? 'rotate(90)' : undefined}>
          {/* Driveway, front walk, porch */}
          {!compact && plan.drive ? <rect x={plan.drive.x} y={D} width={plan.drive.w} height={lot.y + lot.h - D} fill={t.paving} pointerEvents="none" /> : null}
          {!compact && plan.walk ? (
            <path
              d={
                plan.walk.toDrive !== undefined
                  ? `M ${plan.walk.x + plan.walk.w / 2} ${plan.walk.y - 0.2} V ${plan.walk.y + 1.75} H ${plan.walk.toDrive - 0.1}`
                  : `M ${plan.walk.x + plan.walk.w / 2} ${plan.walk.y - 0.2} V ${lot.y + lot.h}`
              }
              fill="none"
              stroke={t.paving}
              strokeWidth={plan.walk.w * 0.9}
              strokeLinejoin="round"
              pointerEvents="none"
            />
          ) : null}
          {plan.porch ? (
            <g pointerEvents="none">
              <rect x={plan.porch.x} y={plan.porch.y} width={plan.porch.w} height={plan.porch.h} fill={t.paving} stroke={t.ink} strokeWidth={0.1} />
              <rect x={plan.porch.x + 0.25} y={plan.porch.y + plan.porch.h - 0.85} width={0.6} height={0.6} fill={t.ink} />
              <rect x={plan.porch.x + plan.porch.w - 0.85} y={plan.porch.y + plan.porch.h - 0.85} width={0.6} height={0.6} fill={t.ink} />
            </g>
          ) : null}

          {/* Deck and fire pit */}
          {deck ? (
            <g {...tap(deck.room)}>
              <rect className="fill" x={deck.x} y={deck.y} width={deck.w} height={deck.h} fill={t.deck} />
              {(() => {
                const tint = tintOf(deck.room);
                return tint ? <rect x={deck.x} y={deck.y} width={deck.w} height={deck.h} fill={tint.color} opacity={tint.alpha} pointerEvents="none" /> : null;
              })()}
              <g pointerEvents="none" opacity={t.fixtureOpacity}>
                {Array.from({ length: Math.floor(deck.w / 0.6) }, (_, i) => (
                  <line key={i} x1={deck.x + (i + 1) * 0.6} x2={deck.x + (i + 1) * 0.6} y1={deck.y} y2={deck.y + deck.h} stroke={t.fixture} strokeWidth={0.03} opacity={0.55} />
                ))}
                {deck.hotTub ? (
                  <g>
                    <rect x={deck.x + deck.w - 7.5} y={deck.y + 0.5} width={7} height={7} rx={1.2} {...pens.solid} />
                    <rect x={deck.x + deck.w - 6.8} y={deck.y + 1.2} width={5.6} height={5.6} rx={1.6} {...pens.line} />
                  </g>
                ) : null}
                <circle cx={deck.x + 3.6} cy={deck.y + 4.4} r={1.6} {...pens.solid} />
                {[0, 90, 180, 270].map((a) => (
                  <rect key={a} x={-0.6} y={-0.55} width={1.2} height={1.1} rx={0.25} {...pens.line} transform={`translate(${deck.x + 3.6} ${deck.y + 4.4}) rotate(${a}) translate(0 -2.35)`} />
                ))}
                {deck.grill ? (
                  <g>
                    <rect x={deck.x + 0.5} y={deck.y + deck.h - 2.5} width={2.8} height={1.9} rx={0.3} {...pens.solid} />
                    <circle cx={deck.x + 1.9} cy={deck.y + deck.h - 1.55} r={0.6} {...pens.line} />
                  </g>
                ) : null}
              </g>
              <rect x={deck.x} y={deck.y} width={deck.w} height={deck.h} fill="none" stroke={t.ink} strokeWidth={0.16} pointerEvents="none" />
            </g>
          ) : null}
          {!compact && plan.firePit ? (
            <g pointerEvents="none" opacity={t.fixtureOpacity + 0.15}>
              <circle cx={plan.firePit.x} cy={plan.firePit.y} r={plan.firePit.r} fill={t.paving} stroke={t.fixture} strokeWidth={0.1} />
              <circle cx={plan.firePit.x} cy={plan.firePit.y} r={plan.firePit.r - 0.6} fill="none" stroke={t.fixture} strokeWidth={0.08} />
              {[20, 140, 260].map((a) => (
                <rect key={a} x={-0.8} y={-0.7} width={1.6} height={1.4} rx={0.35} {...pens.line} transform={`translate(${plan.firePit!.x} ${plan.firePit!.y}) rotate(${a}) translate(0 ${-(plan.firePit!.r + 1.5)})`} />
              ))}
            </g>
          ) : null}

          {/* Floors, inspection tint and fixtures */}
          {plan.boxes.map((b) => {
            const tint = tintOf(b.room);
            const f = frame(b);
            const isPlaced = ['kitchen', 'dining', 'living', 'entry', 'garage'].includes(b.kind);
            return (
              <g key={b.key} {...tap(b.room)}>
                <rect className="fill" x={b.x} y={b.y} width={b.w} height={b.h} fill={b.kind === 'garage' ? t.garage : t.floor} />
                {tint ? <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={tint.color} opacity={tint.alpha} pointerEvents="none" /> : null}
                <g opacity={t.fixtureOpacity} pointerEvents="none">
                  {isPlaced ? placedFixtures(b, pens, { slider: b.kind === 'dining' || b.kind === 'kitchen' ? slider : undefined, eatIn, doorOnLiving }) : <g transform={f.t}>{localFixtures(b, f.lw, f.lh, pens)}</g>}
                </g>
              </g>
            );
          })}

          {/* Walls */}
          <g pointerEvents="none" stroke={t.ink}>
            {plan.partitions.map((s, i) => (
              <line key={`p${i}`} x1={s.x} y1={s.y} x2={s.wall === 'h' ? s.x + s.len : s.x} y2={s.wall === 'v' ? s.y + s.len : s.y} strokeWidth={INT_WALL} />
            ))}
            {plan.shell.map((s, i) => (
              <line key={`s${i}`} x1={s.x} y1={s.y} x2={s.wall === 'h' ? s.x + s.len : s.x} y2={s.wall === 'v' ? s.y + s.len : s.y} strokeWidth={EXT_WALL} />
            ))}
          </g>

          {/* Openings, windows, doors */}
          <g pointerEvents="none">
            {plan.openings.map((o, i) => (
              <line key={`o${i}`} x1={o.x} y1={o.y} x2={o.wall === 'h' ? o.x + o.len : o.x} y2={o.wall === 'v' ? o.y + o.len : o.y} stroke={t.ink} strokeWidth={0.06} strokeDasharray="0.5 0.35" opacity={0.45} />
            ))}
            {plan.windows.map((w, i) => {
              const r = gapRect(w.x, w.y, w.len, w.wall, EXT_WALL);
              const o = EXT_WALL / 2 - 0.06;
              const d =
                w.wall === 'h'
                  ? `M ${w.x} ${w.y - o} H ${w.x + w.len} M ${w.x} ${w.y} H ${w.x + w.len} M ${w.x} ${w.y + o} H ${w.x + w.len}`
                  : `M ${w.x - o} ${w.y} V ${w.y + w.len} M ${w.x} ${w.y} V ${w.y + w.len} M ${w.x + o} ${w.y} V ${w.y + w.len}`;
              return (
                <g key={`w${i}`}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={t.floor} />
                  <path d={d} stroke={t.ink} strokeWidth={0.06} fill="none" />
                </g>
              );
            })}
            {plan.garageDoor ? (
              <g>
                <line x1={plan.garageDoor.x} x2={plan.garageDoor.x + plan.garageDoor.len} y1={plan.garageDoor.y} y2={plan.garageDoor.y} stroke={t.ink} strokeWidth={0.12} />
                <line x1={plan.garageDoor.x} x2={plan.garageDoor.x + plan.garageDoor.len} y1={plan.garageDoor.y - 1} y2={plan.garageDoor.y - 1} stroke={t.ink} strokeWidth={0.07} strokeDasharray="0.6 0.4" opacity={0.7} />
              </g>
            ) : null}
            {plan.doors.map((d, i) => {
              if (d.slider) {
                const r = gapRect(d.x, d.y, d.w, d.wall, EXT_WALL);
                const half = Math.abs(d.w) / 2 + 0.2;
                return (
                  <g key={`d${i}`}>
                    <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={t.floor} />
                    <rect x={d.x} y={d.y - 0.2} width={half} height={0.14} fill={t.floor} stroke={t.ink} strokeWidth={0.05} />
                    <rect x={d.x + Math.abs(d.w) - half} y={d.y + 0.06} width={half} height={0.14} fill={t.floor} stroke={t.ink} strokeWidth={0.05} />
                  </g>
                );
              }
              const p = doorPath(d);
              const r = d.exterior ? gapRect(d.x, d.y, d.w, d.wall, EXT_WALL) : null;
              return (
                <g key={`d${i}`}>
                  {r ? <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={t.floor} /> : null}
                  <path d={p.leaf} stroke={t.ink} strokeWidth={d.exterior ? 0.15 : 0.1} fill="none" />
                  <path d={p.arc} stroke={t.ink} strokeWidth={0.05} fill="none" opacity={0.85} />
                </g>
              );
            })}
          </g>
        </g>

        {/* Lettering, progress and the room you're in, upright whichever way the plan faces */}
        {plan.boxes.map((b) => {
          const sb = R(b);
          if (!b.room) {
            if (compact || b.kind === 'hall' || textW(b.label, px(9), false) > sb.w - px(6) || sb.h < px(14)) return null;
            return (
              <text key={`n-${b.key}`} x={sb.x + sb.w / 2} y={sb.y + sb.h / 2 + px(3.2)} textAnchor="middle" fontSize={px(9)} fontWeight={600} fill={t.sub} fontFamily={TEXT} pointerEvents="none">
                {b.label}
              </text>
            );
          }
          return roomLabels.get(b.key)?.node ?? null;
        })}
        {roomLabels.get('deck')?.node}
        {extLabel}
        {[...roomBoxes, ...(deck ? [{ ...deck, key: 'deck', label: deck.room.name, kind: 'outdoor' as const, anchor: 'top' as const }] : [])].map((b) => {
          const room = b.room!;
          const sb = R(b);
          const { p, complete, started } = status(room);
          const nodes: ReactNode[] = [];
          const r = px(compact ? 5 : 5.5);
          const cx = sb.x + sb.w - px(compact ? 7 : 8);
          const cy = sb.y + px(compact ? 7 : 8);
          const words = roomLabels.get(b.key)?.rect;
          const clear = !words || cx - r - px(1) > words.x + words.w || cy + r + px(1) < words.y;
          if (complete && clear && sb.w > px(26) && sb.h > px(26)) {
            nodes.push(
              <g key="ok" transform={`translate(${cx} ${cy}) scale(${r})`}>
                <circle r={1} fill={SCORE_FILL(p.score)} stroke={dark ? t.floor : '#fff'} strokeWidth={0.2} />
                <path d="M -0.45 0.02 L -0.12 0.34 L 0.48 -0.32" fill="none" stroke="#fff" strokeWidth={0.22} strokeLinecap="round" strokeLinejoin="round" />
              </g>,
            );
          }
          if (started && !complete && !compact && sb.w > px(30)) {
            const bw = sb.w - px(14);
            nodes.push(
              <g key="bar">
                <rect x={sb.x + px(7)} y={sb.y + sb.h - px(8)} width={bw} height={px(3)} rx={px(1.5)} fill={dark ? 'rgba(255,255,255,0.22)' : '#dfe5f1'} />
                <rect x={sb.x + px(7)} y={sb.y + sb.h - px(8)} width={(bw * p.done) / p.total} height={px(3)} rx={px(1.5)} fill={t.accent} />
              </g>,
            );
          }
          if (current === room.id) {
            nodes.push(
              <rect key="cur" x={sb.x + px(3)} y={sb.y + px(3)} width={sb.w - px(6)} height={sb.h - px(6)} fill="none" stroke={t.accent} strokeWidth={px(2)} strokeDasharray={compact ? undefined : `${px(6)} ${px(4)}`} rx={px(2)} />,
            );
          }
          return nodes.length ? (
            <g key={`s-${b.key}`} pointerEvents="none">
              {nodes}
            </g>
          ) : null;
        })}

        {/* Scale bar and north arrow, as on a drawing sheet */}
        {scaleSpot ? (
          <g pointerEvents="none" fill={t.ink} opacity={0.8} fontFamily={TEXT} fontSize={px(9)}>
            <rect x={scaleSpot.x} y={scaleSpot.y + scaleSpot.h - px(4)} width={5} height={px(3.5)} />
            <rect x={scaleSpot.x + 5} y={scaleSpot.y + scaleSpot.h - px(4)} width={5} height={px(3.5)} fill="none" stroke={t.ink} strokeWidth={px(1)} />
            <text x={scaleSpot.x} y={scaleSpot.y + scaleSpot.h - px(6.5)}>
              0
            </text>
            <text x={scaleSpot.x + 10} y={scaleSpot.y + scaleSpot.h - px(6.5)} textAnchor="end">
              10 ft
            </text>
          </g>
        ) : null}
        {northSpot ? (
          <g pointerEvents="none" transform={`translate(${northSpot.x + northSpot.w / 2} ${northSpot.y + northSpot.h / 2 + px(3)})`} opacity={0.8}>
            <g transform={`rotate(${portrait ? 90 : 0}) scale(${px(1)})`}>
              <path d="M 0 -9 L 5 6 L 0 2.5 L -5 6 Z" fill={t.ink} />
            </g>
            <text y={portrait ? px(3.5) : px(-11)} x={portrait ? px(-10) : 0} textAnchor="middle" fontSize={px(9)} fontWeight={700} fill={t.ink} fontFamily={DISPLAY}>
              N
            </text>
          </g>
        ) : null}
      </svg>
      {!compact && plan.aside.length ? (
        <div className="aside-rooms">
          {plan.aside.map((r) => {
            const { p, complete } = status(r);
            return (
              <button key={r.id} className="aside-room" onClick={() => onPick?.(r)}>
                <Ring value={complete ? (p.score ?? 0) / 100 : p.total ? p.done / p.total : 0} size={28} stroke={3.5} color={complete ? SCORE_FILL(p.score) : 'var(--brand)'} />
                <span>
                  <b>{r.name}</b>
                  <span>{complete ? `Score ${p.score ?? '–'}` : `${p.done} of ${p.total} checks`}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
