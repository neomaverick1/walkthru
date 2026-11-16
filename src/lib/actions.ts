// Actions shared by several screens.
import { toast } from '../components/toast';
import { icsFile, shareFile } from './share';
import { templateInfo } from './templates';
import type { Inspection, Property } from './types';
import { address } from './util';

export async function addToCalendar(x: Inspection, p: Property) {
  const bytes = icsFile({
    title: `${templateInfo(x.template).short}: ${p.name}`,
    start: x.scheduledAt,
    minutes: 120,
    location: address(p),
    description: `${templateInfo(x.template).name} · ${x.number}`,
    uid: x.id,
  });
  const how = await shareFile(bytes, `${x.number}.ics`, 'text/calendar', 'Add to calendar');
  if (how === 'downloaded') toast('Calendar file downloaded');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The next report number, like WT-2611-0056. */
export function nextNumber(all: Inspection[], when: number): string {
  const d = new Date(when);
  const seq = all.reduce((m, x) => Math.max(m, +(x.number.split('-')[2] ?? 0)), 0) + 1;
  return `WT-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}-${String(seq).padStart(4, '0')}`;
}

