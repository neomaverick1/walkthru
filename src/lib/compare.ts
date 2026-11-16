// Matches a move-out against its move-in, room by room and item by item.
import { effectiveRating, ratingInfo } from './score';
import type { Inspection, Item, Room } from './types';

export interface Change {
  room: Room; // the later room
  before: Item;
  after: Item;
  from: number | null;
  to: number | null;
  kind: 'worse' | 'better';
}

const key = (s: string) => s.trim().toLowerCase();
const val = (i: Item) => {
  const r = effectiveRating(i);
  return r ? ratingInfo(r).value : null;
};

export function compareInspections(before: Inspection, after: Inspection): { changes: Change[]; matched: number } {
  const changes: Change[] = [];
  let matched = 0;
  for (const room of after.rooms) {
    const old = before.rooms.find((r) => key(r.name) === key(room.name));
    if (!old) continue;
    for (const item of room.items) {
      const prev = old.items.find((i) => key(i.name) === key(item.name));
      if (!prev) continue;
      matched++;
      const from = val(prev);
      const to = val(item);
      if (from === null || to === null || from === to) continue;
      changes.push({ room, before: prev, after: item, from, to, kind: to < from ? 'worse' : 'better' });
    }
  }
  changes.sort((a, b) => (a.kind === b.kind ? (a.to! - a.from!) - (b.to! - b.from!) : a.kind === 'worse' ? -1 : 1));
  return { changes, matched };
}

/** The same room and item in another inspection, for "at move-in" hints during a walkthrough. */
export function findEarlier(before: Inspection | undefined, roomName: string, itemName: string): Item | undefined {
  const r = before?.rooms.find((x) => key(x.name) === key(roomName));
  return r?.items.find((i) => key(i.name) === key(itemName));
}
