import { CalendarClock, Play } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Sheet } from '../components/ui';
import { toast } from '../components/toast';
import { nextNumber } from '../lib/actions';
import { go } from '../lib/router';
import { saveInspection, useStore } from '../lib/store';
import { buildRooms, TEMPLATES } from '../lib/templates';
import type { Inspection, TemplateId } from '../lib/types';
import { shortDate, uid } from '../lib/util';

const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function NewInspection({ propertyId, onClose }: { propertyId?: string; onClose: () => void }) {
  const properties = useStore((s) => s.properties);
  const inspections = useStore((s) => s.inspections);
  const settings = useStore((s) => s.settings);
  const list = Object.values(properties).sort((a, b) => a.name.localeCompare(b.name));
  const [pid, setPid] = useState(propertyId ?? list[0]?.id ?? '');
  const [template, setTemplate] = useState<TemplateId>(() => {
    const p = properties[propertyId ?? ''];
    return p?.kind === 'luxury-rental' || p?.kind === 'cabin' ? 'str-review' : 'move-in';
  });
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return d.getTime();
  });
  const p = properties[pid];
  const [people, setPeople] = useState<number[]>(() => (p ? p.contacts.map((_, i) => i).slice(0, 1) : []));

  const moveIns = useMemo(
    () =>
      Object.values(inspections)
        .filter((x) => x.propertyId === pid && x.template === 'move-in' && x.status === 'complete')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [inspections, pid],
  );
  const [compareTo, setCompareTo] = useState<string>('');
  const compare = compareTo || moveIns[0]?.id || '';

  if (!list.length) {
    return (
      <Sheet title="New inspection" onClose={onClose}>
        <p className="muted">Add a property first.</p>
        <a className="btn primary" href="#/properties" onClick={onClose}>
          Go to properties
        </a>
      </Sheet>
    );
  }

  const create = (startNow: boolean) => {
    if (!p) return;
    const x: Inspection = {
      id: uid(),
      number: nextNumber(Object.values(inspections), when),
      propertyId: p.id,
      template,
      status: startNow ? 'in-progress' : 'scheduled',
      scheduledAt: startNow ? Date.now() : when,
      startedAt: startNow ? Date.now() : undefined,
      inspector: settings.inspector,
      attendees: people.map((i) => p.contacts[i]).filter(Boolean),
      rooms: buildRooms(template, p),
      summary: '',
      signatures: [],
      compareTo: template === 'move-out' && compare ? compare : undefined,
      updatedAt: Date.now(),
    };
    saveInspection(x);
    onClose();
    toast(startNow ? 'Inspection started' : 'Inspection scheduled');
    go(startNow ? `/inspect/${x.id}` : `/property/${p.id}`);
  };

  return (
    <Sheet title="New inspection" onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <label className="field">
          <span>Property</span>
          <select
            className="select"
            value={pid}
            onChange={(e) => {
              setPid(e.target.value);
              setPeople(properties[e.target.value]?.contacts.length ? [0] : []);
              setCompareTo('');
            }}
          >
            {list.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.city}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span>Type</span>
          <div className="templates">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="tpl" aria-pressed={template === t.id} onClick={() => setTemplate(t.id)}>
                <span className="dot" />
                <span>
                  <b>{t.name}</b>
                  <span>{t.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {template === 'move-out' ? (
          <label className="field">
            <span>Compare with</span>
            <select className="select" value={compare} onChange={(e) => setCompareTo(e.target.value)}>
              <option value="">No move-in to compare</option>
              {moveIns.map((m) => (
                <option key={m.id} value={m.id}>
                  Move-in on {shortDate(m.completedAt ?? m.scheduledAt)} · {m.number}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {p?.contacts.length ? (
          <div className="field">
            <span>Attending</span>
            <div className="opts">
              {p.contacts.map((c, i) => (
                <button key={i} aria-pressed={people.includes(i)} onClick={() => setPeople((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>
                  {c.name} · {c.role}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="field">
          <span>Date and time (for scheduling)</span>
          <input className="input" type="datetime-local" value={localInput(when)} onChange={(e) => e.target.value && setWhen(new Date(e.target.value).getTime())} />
        </label>

        <div className="row">
          <button className="btn grow" onClick={() => create(false)}>
            <CalendarClock /> Schedule
          </button>
          <button className="btn primary grow" onClick={() => create(true)}>
            <Play /> Start now
          </button>
        </div>
      </div>
    </Sheet>
  );
}
