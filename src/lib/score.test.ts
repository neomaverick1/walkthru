import { describe, expect, it } from 'vitest';

import { inspectionStats, roomProgress } from './score';
import type { Inspection, Item, Rating, Room } from './types';

const item = (rating?: Rating, extra: Partial<Item> = {}): Item => ({ id: Math.random().toString(36), name: 'Check', type: 'rate', rating, note: '', photos: [], ...extra });
const room = (items: Item[]): Room => ({ id: 'r', name: 'Kitchen', kind: 'kitchen', items, shots: [{ id: 's', label: 'Wide shot' }], note: '' });

describe('scores', () => {
  it('averages ratings and leaves out not-applicable', () => {
    const p = roomProgress(room([item('excellent'), item('good'), item('fair'), item('na'), item(undefined)]));
    expect(p.done).toBe(4);
    expect(p.total).toBe(5);
    expect(p.score).toBe(Math.round((100 + 85 + 60) / 3));
  });

  it('rates Wi-Fi from the measured speed', () => {
    const fast = item(undefined, { type: 'reading', tool: 'speedtest', value: 182 });
    const slow = item(undefined, { type: 'reading', tool: 'speedtest', value: 12 });
    expect(roomProgress(room([fast])).score).toBe(100);
    expect(roomProgress(room([slow])).score).toBe(25);
  });

  it('totals issues by who pays', () => {
    const x = {
      rooms: [
        room([
          item('fair', { issue: { severity: 'minor', responsibility: 'tenant', action: 'repair', cost: 150 } }),
          item('poor', { issue: { severity: 'moderate', responsibility: 'owner', action: 'replace', cost: 400 } }),
          item('good'),
        ]),
      ],
    } as Inspection;
    const st = inspectionStats(x);
    expect(st.issues).toHaveLength(2);
    expect(st.cost).toBe(550);
    expect(st.tenantCost).toBe(150);
    expect(st.ownerCost).toBe(400);
    expect(st.shotsMissing).toBe(1);
  });
});
