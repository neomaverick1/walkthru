import { describe, expect, it } from 'vitest';

import { demoState } from './demo';
import { floorPlan, type Plan, type PlanBox } from './floorplan';
import type { Room, RoomKind } from './types';

const overlap = (a: PlanBox, b: PlanBox) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;

/** Doors and openings on a box's outline */
function waysIn(plan: Plan, b: PlanBox) {
  const on = (x: number, y: number, len: number, wall: 'h' | 'v') => {
    const a = wall === 'h' ? Math.min(x, x + len) : Math.min(y, y + len);
    const z = a + Math.abs(len);
    return wall === 'h'
      ? (Math.abs(y - b.y) < 0.01 || Math.abs(y - b.y - b.h) < 0.01) && a < b.x + b.w - 0.5 && z > b.x + 0.5
      : (Math.abs(x - b.x) < 0.01 || Math.abs(x - b.x - b.w) < 0.01) && a < b.y + b.h - 0.5 && z > b.y + 0.5;
  };
  return plan.doors.filter((d) => on(d.x, d.y, d.w, d.wall)).length + plan.openings.filter((o) => on(o.x, o.y, o.len, o.wall)).length;
}

function check(rooms: Room[]) {
  const plan = floorPlan(rooms);
  const drawn = [...plan.boxes.map((b) => b.room), plan.deck?.room, plan.exterior, ...plan.aside].filter(Boolean);
  for (const r of rooms) expect(drawn.filter((d) => d === r), `${r.name} is drawn once`).toHaveLength(1);
  plan.boxes.forEach((a, i) => plan.boxes.slice(i + 1).forEach((b) => expect(overlap(a, b), `${a.label} overlaps ${b.label}`).toBe(false)));
  for (const b of plan.boxes) expect(waysIn(plan, b), `a way into ${b.label}`).toBeGreaterThan(0);
  for (const b of plan.boxes) {
    expect(b.w, `${b.label} width`).toBeGreaterThanOrEqual(b.kind === 'closet' || b.kind === 'hall' ? 3 : 5);
    expect(b.h, `${b.label} depth`).toBeGreaterThanOrEqual(3);
  }
  expect(plan.shell.length).toBeGreaterThan(3);
  return plan;
}

const room = (name: string, kind: RoomKind): Room => ({ id: name, name, kind, items: [{ id: `${name}-i`, name: 'Walls', type: 'rate', note: '', photos: [] }], shots: [], note: '' });

describe('floor plan', () => {
  it('lays out every demo home as a real house', () => {
    const { inspections } = demoState();
    for (const x of Object.values(inspections)) check(x.rooms);
  });

  it('puts the primary bath and closet inside the primary suite', () => {
    const rooms = [room('Living room', 'living'), room('Kitchen', 'kitchen'), room('Primary bedroom', 'bedroom'), room('Bedroom 2', 'bedroom'), room('Primary bathroom', 'bathroom'), room('Bathroom 2', 'bathroom')];
    const plan = check(rooms);
    const bed = plan.boxes.find((b) => b.label === 'Primary bedroom')!;
    const bath = plan.boxes.find((b) => b.label === 'Primary bathroom')!;
    const shared = bath.y + bath.h === bed.y && bath.x >= bed.x && bath.x + bath.w <= bed.x + bed.w;
    expect(shared, 'bath opens off the bedroom').toBe(true);
    expect(plan.doors.some((d) => d.wall === 'h' && d.y === bed.y && d.x > bath.x && d.x < bath.x + bath.w)).toBe(true);
  });

  it('handles any mix of rooms', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let n = 0; n < 300; n++) {
      const rooms: Room[] = [room('Exterior', 'exterior')];
      const add = (p: number, name: string, kind: RoomKind) => rnd() < p && rooms.push(room(name, kind));
      add(0.7, 'Entry', 'entry');
      add(0.9, 'Living room', 'living');
      add(0.9, 'Kitchen', 'kitchen');
      add(0.6, 'Dining room', 'dining');
      const beds = Math.floor(rnd() * 5);
      for (let b = 1; b <= beds; b++) rooms.push(room(b === 1 ? 'Primary bedroom' : `Bedroom ${b}`, 'bedroom'));
      const baths = Math.floor(rnd() * 4);
      for (let b = 1; b <= baths; b++) rooms.push(room(b === 1 && rnd() < 0.6 ? 'Primary bathroom' : `Bathroom ${b}`, 'bathroom'));
      add(0.4, 'Half bath', 'bathroom');
      add(0.4, 'Office', 'office');
      add(0.6, 'Laundry', 'laundry');
      add(0.5, 'Garage', 'garage');
      add(0.4, 'Deck', 'outdoor');
      add(0.5, 'Systems & safety', 'systems');
      add(0.15, 'Bonus room', 'living');
      check(rooms);
    }
  });
});
