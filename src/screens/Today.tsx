import { CalendarPlus, ChevronRight, ClipboardList, Navigation, Phone, Play, Plus } from 'lucide-react';
import { useMemo } from 'react';

import { GetApp } from '../components/GetApp';
import { Img } from '../components/Photo';
import { PlanView } from '../components/PlanView';
import { ScoreBadge } from '../components/ui';
import { go } from '../lib/router';
import { inspectionStats } from '../lib/score';
import { addToCalendar } from '../lib/actions';
import { mapsLink } from '../lib/share';
import { useStore } from '../lib/store';
import { templateInfo } from '../lib/templates';
import type { Inspection } from '../lib/types';
import { address, dayLabel, daysAgo, greeting, money, shortDate, timeLabel, todayLong } from '../lib/util';

export function TodayScreen({ onNew }: { onNew: (propertyId?: string) => void }) {
  const inspections = useStore((s) => s.inspections);
  const properties = useStore((s) => s.properties);
  const settings = useStore((s) => s.settings);
  const list = useMemo(() => Object.values(inspections), [inspections]);

  const active = list.filter((x) => x.status === 'in-progress').sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  const upcoming = list.filter((x) => x.status === 'scheduled').sort((a, b) => a.scheduledAt - b.scheduledAt);
  const done = list.filter((x) => x.status === 'complete').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const figures = useMemo(() => {
    const month = daysAgo(30);
    const recent = done.filter((x) => (x.completedAt ?? 0) > month);
    const scores = done.slice(0, 8).map((x) => inspectionStats(x).score).filter((s): s is number => s !== null);
    // Open issues: the latest finished inspection of each property
    const latest = new Map<string, Inspection>();
    for (const x of done) if (!latest.has(x.propertyId)) latest.set(x.propertyId, x);
    let issues = 0;
    let cost = 0;
    for (const x of latest.values()) {
      const st = inspectionStats(x);
      issues += st.issues.length;
      cost += st.cost;
    }
    return { month: recent.length, avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, issues, cost };
  }, [done]);

  const greet = greeting();
  const first = settings.inspector.split(' ')[0];

  return (
    <>
      <GetApp />
      <header className="hello">
        <h1>
          {greet}, {first}
        </h1>
        <div className="date">
          {todayLong()} · {upcoming.filter((x) => dayLabel(x.scheduledAt) === 'Today').length + active.length || 'No'} inspection
          {upcoming.filter((x) => dayLabel(x.scheduledAt) === 'Today').length + active.length === 1 ? '' : 's'} today
        </div>
      </header>

      <div className="two-col">
        <div className="stack" style={{ gap: 22 }}>
          {active.map((x) => {
            const p = properties[x.propertyId];
            const st = inspectionStats(x);
            return (
              <section className="now blueprint" key={x.id}>
                <div className="now-body">
                  <span className="label">
                    <i /> In progress · started {timeLabel(x.startedAt ?? x.scheduledAt)}
                  </span>
                  <div>
                    <h2>{p?.name}</h2>
                    <div className="addr">
                      {templateInfo(x.template).name} · {p ? `${p.city}, ${p.state}` : ''}
                    </div>
                  </div>
                  <button className="plan-wrap" style={{ border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', textAlign: 'left' }} onClick={() => go(`/inspect/${x.id}`)} aria-label="Open the floor plan">
                    <PlanView rooms={x.rooms} dark compact />
                  </button>
                  <div className="row">
                    <div className="grow">
                      <div className="progress">
                        <i style={{ width: `${Math.round(st.pct * 100)}%` }} />
                      </div>
                      <div className="tiny" style={{ marginTop: 6, color: 'rgba(255,255,255,0.8)' }}>
                        {st.done} of {st.total} checks · {st.issues.length} issue{st.issues.length === 1 ? '' : 's'} · {st.photos} photos
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn light grow" onClick={() => go(`/inspect/${x.id}`)}>
                      <Play /> Continue
                    </button>
                    {p ? (
                      <a className="btn outline" href={mapsLink(address(p))} target="_blank" rel="noreferrer">
                        <Navigation /> Directions
                      </a>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}

          <section>
            <div className="section-head">
              <h2>Up next</h2>
              <button className="btn sm ghost end" onClick={() => onNew()}>
                <Plus /> Schedule
              </button>
            </div>
            {upcoming.length ? (
              <div className="list agenda">
                {upcoming.slice(0, 6).map((x) => {
                  const p = properties[x.propertyId];
                  if (!p) return null;
                  const phone = p.contacts.find((c) => c.phone)?.phone;
                  return (
                    <div className="slot" key={x.id}>
                      <div className="when">
                        <b>{timeLabel(x.scheduledAt)}</b>
                        <span>{dayLabel(x.scheduledAt)}</span>
                      </div>
                      <div>
                        <a className="what" href={`#/inspect/${x.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <Img id={p.cover} alt="" />
                          <div className="t">
                            <b>{p.name}</b>
                            <span>{templateInfo(x.template).name}</span>
                            <span>
                              {p.city}, {p.state}
                              {x.attendees[0] ? ` · with ${x.attendees[0].name}` : ''}
                            </span>
                          </div>
                        </a>
                        <div className="actions">
                          <a className="btn sm" href={mapsLink(address(p))} target="_blank" rel="noreferrer" aria-label="Directions">
                            <Navigation /> <span className="lbl">Directions</span>
                          </a>
                          {phone ? (
                            <a className="btn sm" href={`tel:${phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${p.contacts.find((c) => c.phone)?.name ?? ''}`}>
                              <Phone /> <span className="lbl">Call</span>
                            </a>
                          ) : null}
                          <button className="btn sm" onClick={() => void addToCalendar(x, p)} aria-label="Add to calendar">
                            <CalendarPlus /> <span className="lbl">Calendar</span>
                          </button>
                          <a className="btn sm primary" href={`#/inspect/${x.id}`} style={{ width: 'auto', padding: '0 12px' }}>
                            Open
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card empty">
                <ClipboardList />
                <div>Nothing scheduled. Plan your next walkthrough.</div>
                <button className="btn primary" onClick={() => onNew()}>
                  <Plus /> New inspection
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="stack" style={{ gap: 22 }}>
          <section>
            <div className="section-head">
              <h2>Your numbers</h2>
            </div>
            <div className="figures">
              <div className="figure">
                <span className="num">{figures.month}</span>
                <span>Reports in 30 days</span>
              </div>
              <div className="figure">
                <span className="num">{figures.avg ?? '–'}</span>
                <span>Average score</span>
              </div>
              <div className="figure">
                <span className="num">{figures.issues}</span>
                <span>Open issues</span>
              </div>
              <div className="figure">
                <span className="num">{money(figures.cost, settings.currency)}</span>
                <span>Estimated work</span>
              </div>
            </div>
          </section>

          <section>
            <div className="section-head">
              <h2>Recent reports</h2>
              <a className="btn sm ghost end" href="#/reports">
                All
              </a>
            </div>
            {done.length ? (
              <div className="list">
                {done.slice(0, 5).map((x) => {
                  const p = properties[x.propertyId];
                  const st = inspectionStats(x);
                  return (
                    <a className="rowlink" key={x.id} href={`#/report/${x.id}`}>
                      <Img id={p?.cover} className="thumb" />
                      <div className="text">
                        <b>{p?.name}</b>
                        <span>
                          {templateInfo(x.template).short} · {shortDate(x.completedAt ?? x.scheduledAt)}
                          {st.issues.length ? ` · ${st.issues.length} issue${st.issues.length === 1 ? '' : 's'}` : ''}
                        </span>
                      </div>
                      <ScoreBadge score={st.score} />
                      <ChevronRight className="chev" />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="card empty">No reports yet.</div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
