import { ArrowLeft, ChevronRight, GitCompareArrows, Mail, MessageSquare, Navigation, Pencil, Phone, Play, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Img } from '../components/Photo';
import { ScoreBadge, Sheet } from '../components/ui';
import { toast } from '../components/toast';
import { PROPERTY_KIND } from '../lib/labels';
import { back, go } from '../lib/router';
import { inspectionStats } from '../lib/score';
import { mapsLink } from '../lib/share';
import { deleteProperty, useStore } from '../lib/store';
import { templateInfo } from '../lib/templates';
import { address, dayLabel, money, shortDate, timeLabel } from '../lib/util';
import { PropertyEditor } from './PropertyEditor';

export function PropertyScreen({ id, onNew }: { id: string; onNew: (propertyId: string) => void }) {
  const p = useStore((s) => s.properties[id]);
  const inspections = useStore((s) => s.inspections);
  const currency = useStore((s) => s.settings.currency);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const history = useMemo(
    () =>
      Object.values(inspections)
        .filter((x) => x.propertyId === id)
        .sort((a, b) => (b.completedAt ?? b.scheduledAt) - (a.completedAt ?? a.scheduledAt)),
    [inspections, id],
  );
  if (!p) {
    return (
      <div className="card empty">
        This property was removed.
        <a className="btn" href="#/properties">
          Back to properties
        </a>
      </div>
    );
  }
  const latest = history.find((x) => x.status === 'complete');
  const st = latest ? inspectionStats(latest) : null;
  const moveOut = history.find((x) => x.template === 'move-out' && x.compareTo && inspections[x.compareTo]);

  return (
    <>
      <div className="hero">
        <Img id={p.cover} alt={p.name} />
        <div className="hero-top">
          <button className="icon-btn" aria-label="Back" onClick={() => back('/properties')}>
            <ArrowLeft />
          </button>
          <div className="row" style={{ gap: 6 }}>
            <button className="icon-btn" aria-label="Edit property" onClick={() => setEditing(true)}>
              <Pencil />
            </button>
            <button className="icon-btn" aria-label="Delete property" onClick={() => setConfirm(true)}>
              <Trash2 />
            </button>
          </div>
        </div>
        <div className="hero-text">
          <h1>{p.name}</h1>
          <p>{address(p)}</p>
        </div>
      </div>

      <div className="row" style={{ margin: '14px 0 6px', flexWrap: 'wrap', gap: 6 }}>
        <span className="chip">{PROPERTY_KIND[p.kind]}</span>
        <span className="chip">{p.beds} bedrooms</span>
        <span className="chip">{p.baths} baths</span>
        {p.sqft ? <span className="chip">{p.sqft.toLocaleString('en-US')} sq ft</span> : null}
      </div>

      <div className="row" style={{ margin: '12px 0 4px' }}>
        <button className="btn primary grow" onClick={() => onNew(p.id)}>
          <Play /> New inspection
        </button>
        <a className="btn" href={mapsLink(address(p))} target="_blank" rel="noreferrer">
          <Navigation /> Directions
        </a>
      </div>

      <div className="two-col" style={{ marginTop: 18 }}>
        <div className="stack" style={{ gap: 22 }}>
          {latest && st ? (
            <section className="card pad">
              <div className="row">
                <ScoreBadge score={st.score} />
                <div className="grow">
                  <b>Latest condition</b>
                  <div className="small muted">
                    {templateInfo(latest.template).short} on {shortDate(latest.completedAt ?? latest.scheduledAt)} · {st.issues.length} open issue{st.issues.length === 1 ? '' : 's'}
                    {st.cost ? ` · ${money(st.cost, currency)} estimated` : ''}
                  </div>
                </div>
                <a className="btn sm" href={`#/report/${latest.id}`}>
                  Report
                </a>
              </div>
            </section>
          ) : null}

          <section>
            <div className="section-head">
              <h2>Inspections</h2>
              {moveOut ? (
                <a className="btn sm ghost end" href={`#/compare/${moveOut.id}`}>
                  <GitCompareArrows /> Move-in vs move-out
                </a>
              ) : null}
            </div>
            {history.length ? (
              <div className="list">
                {history.map((x) => {
                  const s = inspectionStats(x);
                  const done = x.status === 'complete';
                  return (
                    <a className="rowlink" key={x.id} href={done ? `#/report/${x.id}` : `#/inspect/${x.id}`}>
                      <div className="text">
                        <b>{templateInfo(x.template).name}</b>
                        <span>
                          {done
                            ? `${shortDate(x.completedAt ?? x.scheduledAt)} · ${s.issues.length} issue${s.issues.length === 1 ? '' : 's'} · ${s.photos} photos`
                            : x.status === 'in-progress'
                              ? `In progress · ${Math.round(s.pct * 100)}% done`
                              : `${dayLabel(x.scheduledAt)} at ${timeLabel(x.scheduledAt)}`}
                        </span>
                      </div>
                      {done ? <ScoreBadge score={s.score} /> : <span className={`chip ${x.status === 'in-progress' ? 'brand' : ''}`}>{x.status === 'in-progress' ? 'In progress' : 'Scheduled'}</span>}
                      <ChevronRight className="chev" />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="card empty">No inspections yet.</div>
            )}
          </section>
        </div>

        <div className="stack" style={{ gap: 22 }}>
          {p.contacts.length ? (
            <section>
              <div className="section-head">
                <h2>People</h2>
              </div>
              <div className="list">
                {p.contacts.map((c, i) => (
                  <div className="contact" key={i}>
                    <span className="avatar">
                      {c.name
                        .split(' ')
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b style={{ display: 'block' }}>{c.name}</b>
                      <span className="small muted">{c.role}</span>
                    </div>
                    {c.phone ? (
                      <>
                        <a className="icon-btn boxed" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${c.name}`}>
                          <Phone />
                        </a>
                        <a className="icon-btn boxed" href={`sms:${c.phone.replace(/[^\d+]/g, '')}`} aria-label={`Text ${c.name}`}>
                          <MessageSquare />
                        </a>
                      </>
                    ) : null}
                    {c.email ? (
                      <a className="icon-btn boxed" href={`mailto:${c.email}`} aria-label={`Email ${c.name}`}>
                        <Mail />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {p.notes ? (
            <section>
              <div className="section-head">
                <h2>Notes</h2>
              </div>
              <div className="card pad muted">{p.notes}</div>
            </section>
          ) : null}
        </div>
      </div>

      {editing ? <PropertyEditor property={p} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} /> : null}
      {confirm ? (
        <Sheet title="Delete this property?" onClose={() => setConfirm(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {p.name} and its {history.length} inspection{history.length === 1 ? '' : 's'} will be removed from this device. This can’t be undone.
          </p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(false)}>
              Keep it
            </button>
            <button
              className="btn grow danger"
              onClick={() => {
                deleteProperty(p.id);
                toast('Property deleted');
                go('/properties', { replace: true });
              }}
            >
              <Trash2 /> Delete
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
