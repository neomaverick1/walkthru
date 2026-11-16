// Progress, condition scores and issue totals for an inspection.
import type { Inspection, Issue, Item, Rating, Room } from './types';

export const RATINGS: { id: Rating; label: string; short: string; value: number | null }[] = [
  { id: 'excellent', label: 'Excellent', short: 'Exc', value: 100 },
  { id: 'good', label: 'Good', short: 'Good', value: 85 },
  { id: 'fair', label: 'Fair', short: 'Fair', value: 60 },
  { id: 'poor', label: 'Poor', short: 'Poor', value: 25 },
  { id: 'na', label: 'Not applicable', short: 'N/A', value: null },
];
export const ratingInfo = (r: Rating) => RATINGS.find((x) => x.id === r)!;

/** Reading items rate themselves where there's a standard (Wi-Fi speed); otherwise a value just counts as done. */
export function effectiveRating(i: Item): Rating | undefined {
  if (i.type === 'rate') return i.rating;
  if (i.value === undefined || Number.isNaN(i.value)) return undefined;
  if (i.tool === 'speedtest') return i.value >= 100 ? 'excellent' : i.value >= 50 ? 'good' : i.value >= 20 ? 'fair' : 'poor';
  return i.rating;
}

export const itemDone = (i: Item) => (i.type === 'rate' ? !!i.rating : i.value !== undefined && !Number.isNaN(i.value));

export interface RoomProgress {
  done: number;
  total: number;
  shots: number;
  shotsTotal: number;
  score: number | null;
  issues: number;
}

export function roomProgress(r: Room): RoomProgress {
  const vals: number[] = [];
  for (const i of r.items) {
    const v = ratingValue(effectiveRating(i));
    if (v !== null) vals.push(v);
  }
  return {
    done: r.items.filter(itemDone).length,
    total: r.items.length,
    shots: r.shots.filter((s) => s.photo).length,
    shotsTotal: r.shots.length,
    score: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
    issues: r.items.filter((i) => i.issue).length,
  };
}

const ratingValue = (r?: Rating) => (r ? ratingInfo(r).value : null);

export interface InspectionStats {
  done: number;
  total: number;
  pct: number;
  score: number | null;
  photos: number;
  shotsMissing: number;
  issues: { room: Room; item: Item; issue: Issue }[];
  cost: number;
  tenantCost: number;
  ownerCost: number;
  safety: number;
}

export function inspectionStats(x: Inspection): InspectionStats {
  let done = 0;
  let total = 0;
  let photos = 0;
  let shotsMissing = 0;
  let weighted = 0;
  let weight = 0;
  const issues: InspectionStats['issues'] = [];
  for (const r of x.rooms) {
    const p = roomProgress(r);
    done += p.done;
    total += p.total;
    shotsMissing += p.shotsTotal - p.shots;
    photos += r.shots.filter((s) => s.photo).length + r.items.reduce((n, i) => n + i.photos.length, 0);
    if (p.score !== null) {
      const w = r.items.filter((i) => effectiveRating(i) && effectiveRating(i) !== 'na').length;
      weighted += p.score * w;
      weight += w;
    }
    for (const i of r.items) if (i.issue) issues.push({ room: r, item: i, issue: i.issue });
  }
  const order = { safety: 0, major: 1, moderate: 2, minor: 3 };
  issues.sort((a, b) => order[a.issue.severity] - order[b.issue.severity] || b.issue.cost - a.issue.cost);
  const sum = (f: (i: Issue) => boolean) => issues.filter((x) => f(x.issue)).reduce((n, x) => n + (x.issue.cost || 0), 0);
  return {
    done,
    total,
    pct: total ? done / total : 0,
    score: weight ? Math.round(weighted / weight) : null,
    photos,
    shotsMissing,
    issues,
    cost: sum(() => true),
    tenantCost: sum((i) => i.responsibility === 'tenant'),
    ownerCost: sum((i) => i.responsibility === 'owner'),
    safety: issues.filter((x) => x.issue.severity === 'safety').length,
  };
}

export function scoreWord(score: number | null): string {
  if (score === null) return 'Not rated yet';
  if (score >= 93) return 'Exceptional';
  if (score >= 82) return 'Good condition';
  if (score >= 68) return 'Fair condition';
  if (score >= 50) return 'Needs work';
  return 'Poor condition';
}

/** The color that goes with a score, from the condition palette. */
export function scoreColor(score: number | null): string {
  if (score === null) return 'var(--na)';
  if (score >= 93) return 'var(--excellent)';
  if (score >= 78) return 'var(--good)';
  if (score >= 55) return 'var(--fair)';
  return 'var(--poor)';
}

export const SEVERITY_LABEL = { minor: 'Minor', moderate: 'Moderate', major: 'Major', safety: 'Safety' } as const;
export const RESPONSIBILITY_LABEL = { tenant: 'Tenant', owner: 'Owner', wear: 'Normal wear' } as const;
export const ACTION_LABEL = { clean: 'Clean', repair: 'Repair', replace: 'Replace', monitor: 'Monitor' } as const;
