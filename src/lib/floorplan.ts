// Turns an inspection's rooms into a believable single-storey floor plan, measured in feet.
//
//        back yard and deck
//   +--------+--------+---------+--------+--------+--------+--------+---------+
//   |Storage |Laundry | Kitchen : Dining | Bath   | Bed 2  | Closet | P. bath |
//   +--------+--------+.........:........+--------+--------+--------+---------+
//   |                 |                  |  Hall           |                  |
//   |     Garage      |  Living room :Entry+--------+--------+  Primary bedroom |
//   |                 |              :     | ½ bath | Bed 3  |                  |
//   +-----------------+--------------+-----+--------+--------+------------------+
//        driveway                      porch                       street side
//
// The garage wing comes first, then the open-plan rooms, then bedrooms and baths on both sides of a hall with
// the primary suite across its end. Rooms keep believable sizes: the two sides of the hall are balanced by
// choosing which rooms go where, nudging sizes within their normal range, and adding a closet where a real
// house would have one.
import type { Room, RoomKind } from './types';

export type BoxKind = RoomKind | 'hall' | 'closet' | 'storage';
export type Wall = 'top' | 'bottom' | 'left' | 'right';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PlanBox extends Rect {
  key: string;
  room?: Room;
  label: string;
  kind: BoxKind;
  /** The wall the furniture backs onto. Standing in the room facing it, the door is at the far left behind you. */
  anchor: Wall;
  primary?: boolean;
  half?: boolean;
  /** Has a walk-in closet next door, so no reach-in closet is drawn. */
  walkIn?: boolean;
  /** Kitchens: where the sink sits along the back counter, under the window */
  sink?: number;
}
export interface PlanDoor {
  /** The hinge. The opening runs `w` feet along the wall from here (negative runs the other way). */
  x: number;
  y: number;
  w: number;
  wall: 'h' | 'v';
  /** Which way the leaf swings */
  into: 'up' | 'down' | 'left' | 'right';
  exterior?: boolean;
  slider?: boolean;
}
export interface PlanSegment {
  x: number;
  y: number;
  len: number;
  wall: 'h' | 'v';
}
export interface Deck extends Rect {
  room: Room;
  hotTub: boolean;
  grill: boolean;
}
export interface Plan {
  boxes: PlanBox[];
  doors: PlanDoor[];
  windows: PlanSegment[];
  openings: PlanSegment[];
  /** Outside walls, traced around whatever shape the rooms make, with doors and windows cut out */
  shell: PlanSegment[];
  /** Inside walls, each drawn once, with doors and openings cut out */
  partitions: PlanSegment[];
  garageDoor?: PlanSegment;
  deck?: Deck;
  firePit?: { x: number; y: number; r: number };
  porch?: Rect;
  /** Driveway: x range in front of the garage door */
  drive?: { x: number; w: number };
  /** Front walk, from the porch toward the street */
  walk?: { x: number; y: number; w: number; toDrive?: number };
  /** Back wall to front wall of the house */
  depth: number;
  /** House only */
  house: Rect;
  /** House with its deck, porch and fire pit */
  bounds: Rect;
  exterior?: Room;
  aside: Room[];
}

export const EXT_WALL = 0.75;
export const INT_WALL = 0.4;

const BACK = 13; // rooms behind the hall, and the kitchen and dining room
const HALL = 4;
const FRONT = 14; // rooms in front of the hall
const D = BACK + HALL + FRONT;
const GARAGE_W = 22;
const GARAGE_D = 23;
const SUITE_CLOSET = 6;
const SUITE_BATH = 9;
const eps = 0.01;

const isHalf = (r: Room) => /half|powder|\bwc\b|½/i.test(r.name);
const isPrimary = (r: Room) => /primary|master|owner|suite/i.test(r.name);
const half2 = (v: number) => Math.round(v * 2) / 2;

// --- Sizing ----------------------------------------------------------------------------------------------------

interface Sized {
  min: number;
  ideal: number;
  max: number;
  w: number;
}
interface Spec extends Sized {
  room?: Room;
  kind: BoxKind;
  order: number;
}
const make = (room: Room | undefined, kind: BoxKind, min: number, ideal: number, max: number, order: number): Spec => ({ room, kind, min, ideal, max, w: ideal, order });

/** Normal widths along the hall, in feet, and the order rooms sit in from the living area outward. */
function spec(r: Room): Spec {
  switch (r.kind) {
    case 'bedroom':
      return isPrimary(r) ? make(r, r.kind, 13, 15, 18, 4) : make(r, r.kind, 10, 12, 15, 3);
    case 'bathroom':
      return isHalf(r) ? make(r, r.kind, 5, 6, 7.5, 1) : make(r, r.kind, 7.5, 9, 11, 0);
    case 'laundry':
      return make(r, r.kind, 6, 8, 10, 2);
    case 'office':
      return make(r, r.kind, 9, 11, 14, 2);
    default:
      return make(r, r.kind, 10, 13, 17, 2);
  }
}
const closetSpec = () => make(undefined, 'closet', 3.5, 4.5, 6.5, 5);

/** Spreads a row to exactly `width` feet, taking from or giving to each room in proportion to its leeway. */
function fit(row: Sized[], width: number) {
  if (!row.length) return;
  const ideal = row.reduce((s, r) => s + r.ideal, 0);
  const d = width - ideal;
  const leeway = (r: Sized) => (d > 0 ? r.max - r.ideal : r.ideal - r.min);
  const slack = row.reduce((s, r) => s + leeway(r), 0);
  for (const r of row) r.w = r.ideal + (slack > eps ? (d * leeway(r)) / slack : d / row.length);
  let used = 0;
  row.forEach((r, i) => {
    if (i < row.length - 1) {
      r.w = half2(r.w);
      used += r.w;
    } else r.w = width - used;
  });
}

/** Chooses which side of the hall each room goes on so both sides come out the same length with sensible rooms. */
function arrange(items: Spec[], tail?: Spec): { back: Spec[]; front: Spec[]; width: number } {
  const list = items.slice(0, 12);
  const n = list.length;
  const totals = (row: Spec[]) => row.reduce((a, s) => ({ min: a.min + s.min, ideal: a.ideal + s.ideal, max: a.max + s.max }), { min: 0, ideal: 0, max: 0 });
  let best: { back: Spec[]; front: Spec[]; width: number; cost: number } | undefined;
  for (let filler = 0; filler < 3; filler++) {
    for (let mask = 0; mask < 1 << n; mask++) {
      const back: Spec[] = [];
      const front: Spec[] = [];
      list.forEach((s, i) => (mask & (1 << i) ? front : back).push(s));
      if (tail) front.push(tail);
      if (filler === 1) back.push(closetSpec());
      if (filler === 2) front.push(closetSpec());
      if (!back.length || !front.length) continue;
      const b = totals(back);
      const f = totals(front);
      const lo = Math.max(b.min, f.min);
      const hi = Math.min(b.max, f.max);
      const width = half2(lo <= hi ? Math.min(hi, Math.max(lo, (b.ideal + f.ideal) / 2)) : (lo + hi) / 2);
      let cost = Math.abs(width - b.ideal) + Math.abs(width - f.ideal) + (lo > hi ? 50 + (lo - hi) * 4 : 0);
      if (filler) cost += 2 + ((filler === 1 ? back : front).some((s) => s.kind === 'bedroom' || s.kind === 'office') ? 0 : 1.5);
      cost += front.filter((s) => s.kind === 'bathroom' && s.ideal > 7).length * 0.75;
      if (!best || cost < best.cost - eps) best = { back, front, width, cost };
    }
  }
  return best ?? { back: list, front: tail ? [tail] : [], width: 0 };
}

/** Baths nearest the living area, then offices, then bedrooms. A spare closet goes beside the biggest bedroom. */
function order(row: Spec[], tail?: Spec): Spec[] {
  const closet = row.find((s) => s.kind === 'closet' && !s.room);
  const body = row.filter((s) => s !== tail && s !== closet).sort((a, b) => a.order - b.order);
  const all = tail && row.includes(tail) ? [...body, tail] : body;
  if (closet) {
    let at = -1;
    all.forEach((s, i) => {
      if ((s.kind === 'bedroom' || s.kind === 'office') && (at < 0 || s.ideal >= all[at].ideal)) at = i;
    });
    if (at < 0) all.push(closet);
    else all.splice(at === all.length - 1 ? at : at + 1, 0, closet);
  }
  return all;
}

// --- Walls -----------------------------------------------------------------------------------------------------

interface Line {
  wall: 'h' | 'v';
  at: number;
  a: number;
  b: number;
}
const lineOf = (s: PlanSegment): Line => (s.wall === 'h' ? { wall: 'h', at: s.y, a: s.x, b: s.x + s.len } : { wall: 'v', at: s.x, a: s.y, b: s.y + s.len });
const segOf = (l: Line): PlanSegment => (l.wall === 'h' ? { wall: 'h', x: l.a, y: l.at, len: l.b - l.a } : { wall: 'v', x: l.at, y: l.a, len: l.b - l.a });
const lineKey = (l: Line) => `${l.wall}${Math.round(l.at * 100)}`;

function groups(lines: Line[]) {
  const m = new Map<string, Line[]>();
  for (const l of lines) {
    const k = lineKey(l);
    const g = m.get(k);
    if (g) g.push(l);
    else m.set(k, [l]);
  }
  return m;
}
function union(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (const g of groups(lines).values()) {
    g.sort((p, q) => p.a - q.a);
    let cur = { ...g[0] };
    for (const l of g.slice(1)) {
      if (l.a <= cur.b + eps) cur.b = Math.max(cur.b, l.b);
      else {
        out.push(cur);
        cur = { ...l };
      }
    }
    out.push(cur);
  }
  return out;
}
function subtract(lines: Line[], cuts: Line[]): Line[] {
  const byKey = groups(cuts);
  const out: Line[] = [];
  for (const l of lines) {
    let parts: [number, number][] = [[l.a, l.b]];
    for (const c of byKey.get(lineKey(l)) ?? []) {
      parts = parts.flatMap(([a, b]): [number, number][] => {
        if (c.b <= a + eps || c.a >= b - eps) return [[a, b]];
        const keep: [number, number][] = [];
        if (c.a > a + eps) keep.push([a, c.a]);
        if (c.b < b - eps) keep.push([c.b, b]);
        return keep;
      });
    }
    for (const [a, b] of parts) if (b - a > eps) out.push({ ...l, a, b });
  }
  return out;
}

// --- The plan --------------------------------------------------------------------------------------------------

export function floorPlan(rooms: Room[]): Plan {
  const of = (k: RoomKind) => rooms.filter((r) => r.kind === k);
  const exterior = of('exterior')[0];
  const outdoor = of('outdoor')[0];
  const garage = of('garage')[0];
  const aside = rooms.filter(
    (r) => ['systems', 'meters', 'safety', 'hospitality'].includes(r.kind) || (r.kind === 'exterior' && r !== exterior) || (r.kind === 'outdoor' && r !== outdoor) || (r.kind === 'garage' && r !== garage),
  );
  const laundry = of('laundry')[0];
  const entry = of('entry')[0];
  const living = of('living')[0];
  const kitchen = of('kitchen')[0];
  const dining = of('dining')[0];
  const bedrooms = of('bedroom');
  const primaryBed = bedrooms.find(isPrimary) ?? bedrooms[0];
  const primaryBath = of('bathroom').find((r) => isPrimary(r) && !isHalf(r));
  // The primary suite sits across the end of the hall. With exactly one other private room there'd be nothing to
  // put across the hall from it, so the primary bath joins the hall instead.
  const others = rooms.filter((r) => ['bedroom', 'bathroom', 'office', 'laundry'].includes(r.kind) && r !== primaryBed && r !== primaryBath && !(r.kind === 'laundry' && garage && r === laundry)).length;
  const suite = !!(primaryBed && primaryBath) && others !== 1;

  const boxes: PlanBox[] = [];
  const doors: PlanDoor[] = [];
  const windows: PlanSegment[] = [];
  const openings: PlanSegment[] = [];
  const placed = new Set<Room>([...aside, ...(exterior ? [exterior] : []), ...(outdoor ? [outdoor] : [])]);
  const add = (b: Omit<PlanBox, 'key' | 'label'> & { label?: string }): PlanBox => {
    const v: PlanBox = { ...b, key: b.room?.id ?? `${b.kind}-${boxes.length}`, label: b.label ?? b.room?.name ?? '' };
    if (b.room) placed.add(b.room);
    boxes.push(v);
    return v;
  };
  const win = (x: number, y: number, len: number, wall: 'h' | 'v') => windows.push({ x, y, len, wall });

  // Garage wing, with the laundry as the mudroom between the garage and the kitchen ------------------------------
  let x = 0;
  let garageDoor: PlanSegment | undefined;
  let drive: Plan['drive'];
  if (garage) {
    const back = D - GARAGE_D;
    if (laundry) {
      add({ kind: 'storage', label: 'Storage', x: 0, y: 0, w: GARAGE_W / 2, h: back, anchor: 'top' });
      add({ room: laundry, kind: 'laundry', x: GARAGE_W / 2, y: 0, w: GARAGE_W / 2, h: back, anchor: 'top' });
      doors.push({ x: GARAGE_W / 2 + 1, y: back, w: 2.8, wall: 'h', into: 'up' }); // garage to laundry
      doors.push({ x: GARAGE_W, y: back - 3.3, w: 2.8, wall: 'v', into: 'left' }); // laundry to the house
      win(GARAGE_W / 2 + 6.5, 0, 3, 'h');
    } else {
      add({ kind: 'storage', label: 'Storage', x: 0, y: 0, w: GARAGE_W, h: back, anchor: 'top' });
      doors.push({ x: GARAGE_W, y: back + 1.5, w: 2.8, wall: 'v', into: 'right' }); // garage to the house
    }
    doors.push({ x: 1, y: back, w: 2.6, wall: 'h', into: 'up' }); // garage to storage
    add({ room: garage, kind: 'garage', x: 0, y: back, w: GARAGE_W, h: GARAGE_D, anchor: 'bottom' });
    garageDoor = { x: 3, y: D, len: 16, wall: 'h' };
    drive = { x: 2, w: 18 };
    win(0, back + 9, 3, 'v');
    x = GARAGE_W;
  }

  // Open-plan rooms: kitchen and dining at the back, living room and entry at the front --------------------------
  const xPub = x;
  const slot = (room: Room, min: number, ideal: number, max: number) => ({ room, min, ideal, max, w: ideal });
  const backPub = [...(kitchen ? [slot(kitchen, 11, 14, 22)] : []), ...(dining ? [slot(dining, 10, 12, 16)] : [])];
  const frontPub = [...(living ? [slot(living, 13, 18, 30)] : []), ...(entry ? [slot(entry, 6, 8, 10)] : [])];
  const sumIdeal = (row: { ideal: number }[]) => row.reduce((s, r) => s + r.ideal, 0);
  const pubW = backPub.length || frontPub.length ? Math.max(sumIdeal(backPub), sumIdeal(frontPub), 16) : 0;
  fit(backPub, pubW);
  fit(frontPub, pubW);
  const frontY = backPub.length ? BACK : 0;
  const backH = frontPub.length ? BACK : D;
  let px = xPub;
  const pubBack = backPub.map((s) => {
    const b = add({ room: s.room, kind: s.room.kind, x: px, y: 0, w: s.w, h: backH, anchor: 'top' });
    px += s.w;
    return b;
  });
  px = xPub;
  const pubFront = frontPub.map((s) => {
    const b = add({ room: s.room, kind: s.room.kind, x: px, y: frontY, w: s.w, h: D - frontY, anchor: 'bottom' });
    px += s.w;
    return b;
  });
  const find = (r?: Room) => (r ? boxes.find((b) => b.room === r) : undefined);
  const kBox = find(kitchen);
  const dBox = find(dining);
  const lBox = find(living);
  const eBox = find(entry);
  if (pubBack.length === 2) openings.push({ x: pubBack[1].x, y: 2.5, len: BACK - 5, wall: 'v' }); // kitchen open to dining
  if (pubBack.length && lBox) openings.push({ x: lBox.x + 1.5, y: BACK, len: lBox.w - 3, wall: 'h' }); // living open to the kitchen
  else if (pubBack.length && eBox) openings.push({ x: eBox.x + 1, y: BACK, len: eBox.w - 2, wall: 'h' }); // no living room: the entry opens to the kitchen
  if (lBox && eBox) openings.push({ x: eBox.x, y: frontY + 1.5, len: D - frontY - 6.5, wall: 'v' }); // entry open to the living room
  // The deck, reached through a slider from the dining room or the kitchen's eating area
  let deck: Deck | undefined;
  let firePit: Plan['firePit'];
  const host = dBox ?? kBox ?? (lBox && lBox.y === 0 ? lBox : undefined);
  if (outdoor && host) {
    const names = outdoor.items.map((i) => i.name).join(' ');
    const cx = host === kBox ? host.x + host.w - 3.8 : host.x + host.w / 2;
    if (host === kBox) kBox.sink = kBox.x + Math.max(4, (kBox.w - 7.6) / 2);
    const dw = half2(Math.min(22, Math.max(14, pubW * 0.75)));
    const dx = half2(Math.min(Math.max(cx - dw / 2, xPub - 2), xPub + pubW + 4 - dw));
    deck = { x: dx, y: -12, w: dw, h: 12, room: outdoor, hotTub: /hot tub|spa\b|jacuzzi/i.test(names), grill: /grill|bbq/i.test(names) };
    doors.push({ x: cx - 3, y: 0, w: 6, wall: 'h', into: 'up', exterior: true, slider: true });
    if (/fire ?pit/i.test(names)) firePit = { x: dx + dw + 5.5, y: -6.5, r: 2.2 };
  }
  if (outdoor && !deck) aside.push(outdoor); // nowhere to attach a deck: list it beside the plan
  if (kBox) {
    kBox.sink ??= kBox.x + kBox.w / 2;
    win(kBox.sink - 2.5, 0, 5, 'h');
  }
  if (dBox && dBox !== host) win(dBox.x + dBox.w / 2 - 3, 0, 6, 'h');

  // Front door and porch
  let frontDoor: PlanDoor | undefined;
  if (eBox) frontDoor = { x: eBox.x + eBox.w / 2 - 1.5, y: D, w: 3, wall: 'h', into: 'up', exterior: true };
  else if (lBox) frontDoor = { x: lBox.x + lBox.w - 5, y: D, w: 3, wall: 'h', into: 'up', exterior: true };
  else if (pubFront.length || pubBack.length) {
    const b = (pubFront[0] ?? pubBack[0])!;
    frontDoor = { x: b.x + b.w / 2 - 1.5, y: D, w: 3, wall: 'h', into: 'up', exterior: true };
  }
  if (frontDoor) doors.push(frontDoor);
  if (lBox) {
    if (frontDoor && !eBox) win(lBox.x + Math.max(2, (lBox.w - 7) / 2 - 4), D, Math.min(8, lBox.w - 11), 'h');
    else win(lBox.x + lBox.w / 2 - 4, D, 8, 'h');
  }
  if (!garage && xPub === 0) {
    if (kBox && kBox.x === 0) win(0, 4, 5, 'v');
    if (lBox && lBox.x === 0) win(0, frontY + 5, 6, 'v');
  }
  const porch = frontDoor ? { x: frontDoor.x - 2.5, y: D, w: 8, h: 5 } : undefined;

  // Bedrooms, baths and the rest along the hall --------------------------------------------------------------------
  const xPriv = xPub + pubW;
  const rest = rooms.filter((r) => !placed.has(r) && r !== primaryBed && !(suite && r === primaryBath)).map(spec);
  const tail = !suite && primaryBed ? spec(primaryBed) : undefined;
  let hallLen = 0;
  let wingEnd = xPriv;
  const count = rest.length + (tail ? 1 : 0);
  if (count === 1 && !suite) {
    // One room: it sits at the front, entered from the living area, and the house steps back behind it.
    const s = (rest[0] ?? tail)!;
    const w = Math.max(s.ideal, 11);
    const b = add({ room: s.room, kind: s.kind, x: xPriv, y: BACK, w, h: HALL + FRONT, anchor: 'right' });
    doors.push({ x: xPriv, y: BACK + 0.5, w: 2.8, wall: 'v', into: 'right' });
    if (b.kind === 'bedroom' || b.kind === 'office') win(b.x + b.w / 2 - 2.5, D, 5, 'h');
    wingEnd = xPriv + w;
  } else if (count > 0) {
    const rows = arrange(rest, tail);
    hallLen = rows.width;
    const back = order(rows.back, tail);
    const front = order(rows.front, tail);
    fit(back, hallLen);
    fit(front, hallLen);
    const place = (row: Spec[], y: number, h: number, anchor: Wall) => {
      let rx = xPriv;
      return row.map((s) => {
        const b = add({ room: s.room, kind: s.kind, label: s.room ? undefined : 'Closet', x: rx, y, w: s.w, h, anchor, half: s.kind === 'bathroom' && !!s.room && isHalf(s.room) });
        rx += s.w;
        return b;
      });
    };
    const backRow = place(back, 0, BACK, 'top');
    const frontRow = place(front, BACK + HALL, FRONT, 'bottom');
    add({ kind: 'hall', label: 'Hall', x: xPriv, y: BACK, w: hallLen, h: HALL, anchor: 'top' });
    // The hall opens off the living area. With no living area or garage to open off, its end is the front door.
    if (pubW || garage) openings.push({ x: xPriv, y: BACK + 0.4, len: HALL - 0.8, wall: 'v' });
    else doors.push({ x: xPriv, y: BACK + 0.5, w: 3, wall: 'v', into: 'right', exterior: true });

    const fromHall = (b: PlanBox, isBack: boolean) => {
      const w = Math.min(b.kind === 'bathroom' ? 2.4 : b.kind === 'closet' ? 2.2 : 2.8, b.w - 1.4);
      doors.push({ x: b.x + Math.min(1, b.w * 0.12), y: isBack ? BACK : BACK + HALL, w, wall: 'h', into: isBack ? 'up' : 'down' });
    };
    const ownerOf = (row: PlanBox[], i: number) => [row[i + 1], row[i - 1]].find((n) => n && (n.kind === 'bedroom' || n.kind === 'office'));
    /** A door in the wall shared with the owning room, into the closet */
    const closetDoor = (cl: Rect, owner: PlanBox) => {
      const right = owner.x > cl.x;
      doors.push({ x: right ? cl.x + cl.w : cl.x, y: cl.y + cl.h / 2 - 1.2, w: 2.4, wall: 'v', into: right ? 'left' : 'right' });
      owner.walkIn = true;
    };
    for (const [row, isBack] of [
      [backRow, true],
      [frontRow, false],
    ] as const) {
      row.forEach((b, i) => {
        const owner = ownerOf(row, i);
        if (b.kind === 'closet') {
          if (owner) closetDoor(b, owner);
          else {
            b.label = isBack ? 'Linen' : 'Storage';
            fromHall(b, isBack);
          }
          return;
        }
        fromHall(b, isBack);
        // A half bath doesn't need the whole depth: the far end becomes a walk-in closet for the room beside it.
        if (b.half && owner && b.h > 8.5) {
          const bathD = 7;
          const cl = add({ kind: 'closet', label: 'Closet', x: b.x, y: isBack ? b.y : b.y + bathD, w: b.w, h: b.h - bathD, anchor: isBack ? 'top' : 'bottom' });
          if (isBack) b.y = b.y + b.h - bathD;
          b.h = bathD;
          closetDoor(cl, owner);
        }
      });
      for (const b of row) {
        const wallY = isBack ? 0 : D;
        if ((isBack ? b.y : b.y + b.h) !== wallY) continue;
        if (b.kind === 'bedroom' || b.kind === 'office') {
          if (b.w >= 14) {
            win(b.x + b.w * 0.27 - 1.5, wallY, 3, 'h');
            win(b.x + b.w * 0.73 - 1.5, wallY, 3, 'h');
          } else win(b.x + b.w / 2 - 2.5, wallY, 5, 'h');
        } else if (b.kind === 'bathroom') win(b.x + b.w / 2 - (b.half ? 1 : 1.5), wallY, b.half ? 2 : 3, 'h');
        else if (b.kind === 'laundry') win(b.x + b.w / 2 - 1.5, wallY, 3, 'h');
      }
    }
    wingEnd = xPriv + hallLen;
    if (!suite) {
      for (const b of [backRow[backRow.length - 1], frontRow[frontRow.length - 1]]) {
        if (b && (b.kind === 'bedroom' || b.kind === 'office')) win(wingEnd, b.y + b.h / 2 - 2, 4, 'v');
      }
    }
  }

  // The primary suite across the end of the hall: bedroom in front, walk-in closet and bath behind ---------------
  if (suite && primaryBed && primaryBath) {
    const xs = wingEnd;
    const sw = SUITE_CLOSET + SUITE_BATH;
    add({ kind: 'closet', label: 'Closet', x: xs, y: 0, w: SUITE_CLOSET, h: BACK, anchor: 'top' });
    const bath = add({ room: primaryBath, kind: 'bathroom', x: xs + SUITE_CLOSET, y: 0, w: SUITE_BATH, h: BACK, anchor: 'top', primary: true });
    const bed = add({ room: primaryBed, kind: 'bedroom', x: xs, y: BACK, w: sw, h: HALL + FRONT, anchor: 'right', primary: true, walkIn: true });
    doors.push({ x: xs, y: BACK + 0.5, w: 2.8, wall: 'v', into: 'right' }); // from the hall
    doors.push({ x: xs + SUITE_CLOSET - 0.4, y: BACK, w: -2.4, wall: 'h', into: 'up' }); // closet
    doors.push({ x: bath.x + 0.8, y: BACK, w: 2.4, wall: 'h', into: 'up' }); // bath
    win(bath.x + bath.w / 2 - 1.5, 0, 3, 'h');
    win(bed.x + bed.w / 2 - 3, D, 6, 'h');
    win(xs + sw, BACK + 2, 3, 'v');
    wingEnd = xs + sw;
  }

  // Walls: trace the outline, merge the inside walls, then cut out every door, window and opening -----------------
  const edges = (pick: (b: PlanBox) => Line) => union(boxes.map(pick));
  const tops = edges((b) => ({ wall: 'h', at: b.y, a: b.x, b: b.x + b.w }));
  const bottoms = edges((b) => ({ wall: 'h', at: b.y + b.h, a: b.x, b: b.x + b.w }));
  const lefts = edges((b) => ({ wall: 'v', at: b.x, a: b.y, b: b.y + b.h }));
  const rights = edges((b) => ({ wall: 'v', at: b.x + b.w, a: b.y, b: b.y + b.h }));
  const outline = [...subtract(tops, bottoms), ...subtract(bottoms, tops), ...subtract(lefts, rights), ...subtract(rights, lefts)];
  const inside = subtract(union([...tops, ...bottoms, ...lefts, ...rights]), outline);
  const grow = (lines: Line[], by: number) => lines.map((l) => ({ ...l, a: l.a - by, b: l.b + by }));
  const gaps: Line[] = [
    ...doors.map((d) => lineOf({ x: d.wall === 'h' ? Math.min(d.x, d.x + d.w) : d.x, y: d.wall === 'v' ? Math.min(d.y, d.y + d.w) : d.y, len: Math.abs(d.w), wall: d.wall })),
    ...openings.map(lineOf),
    ...windows.map(lineOf),
    ...(garageDoor ? [lineOf(garageDoor)] : []),
  ];
  const shell = subtract(grow(union(outline), EXT_WALL / 2), gaps).map(segOf);
  const partitions = subtract(grow(inside, INT_WALL / 2), gaps).map(segOf);

  const bbox = (rs: Rect[]): Rect => {
    const x0 = Math.min(...rs.map((r) => r.x));
    const y0 = Math.min(...rs.map((r) => r.y));
    const x1 = Math.max(...rs.map((r) => r.x + r.w));
    const y1 = Math.max(...rs.map((r) => r.y + r.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const house = boxes.length ? bbox(boxes) : { x: 0, y: 0, w: 20, h: D };
  const extras: Rect[] = [house, ...(deck ? [deck] : []), ...(porch ? [porch] : []), ...(firePit ? [{ x: firePit.x - firePit.r, y: firePit.y - firePit.r, w: firePit.r * 2, h: firePit.r * 2 }] : [])];
  const walk = frontDoor && porch ? { x: frontDoor.x + frontDoor.w / 2 - 2, y: porch.y + porch.h, w: 4, toDrive: drive ? drive.x + drive.w : undefined } : undefined;

  return {
    boxes,
    doors,
    windows,
    openings,
    shell,
    partitions,
    garageDoor,
    deck,
    firePit,
    porch,
    drive,
    walk,
    depth: D,
    house,
    bounds: bbox(extras),
    exterior,
    aside,
  };
}
