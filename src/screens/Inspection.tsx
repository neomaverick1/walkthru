import { ArrowLeft, CalendarPlus, ChevronRight, FileCheck2, GitCompareArrows, MoreHorizontal, Navigation, Play, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { PlanView } from '../components/PlanView';
import { Ring, Seg, Sheet } from '../components/ui';
import { toast } from '../components/toast';
import { addToCalendar } from '../lib/actions';
import { back, go } from '../lib/router';
import { inspectionStats, roomProgress, scoreColor, scoreWord } from '../lib/score';
import { mapsLink } from '../lib/share';
import { deleteInspection, updateInspection, useStore } from '../lib/store';
import { newRoom, ROOM_KINDS, templateInfo } from '../lib/templates';
import type { RoomKind } from '../lib/types';
import { address, dayLabel, money, shortDate, timeLabel } from '../lib/util';

const VIEW_KEY = 'walkthru-overview';
const savedView = (): 'plan' | 'list' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'plan';
  } catch {
    return 'plan';
  }
};

export function InspectionScreen({ id }: { id: string }) {
  const x = useStore((s) => s.inspections[id]);
  const p = useStore((s) => (x ? s.properties[x.propertyId] : undefined));
  const before = useStore((s) => (x?.compareTo ? s.inspections[x.compareTo] : undefined));
  const currency = useStore((s) => s.settings.currency);
  const [view, setView] = useState(savedView);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (!x || !p) {
    return (
      <div className="card empty">
        This inspection was removed.
        <a className="btn" href="#/">
          Back to today
        </a>
      </div>
    );
  }
  const st = inspectionStats(x);
  const t = templateInfo(x.template);
  const next = x.rooms.find((r) => roomProgress(r).done < r.items.length);
  const setV = (v: 'plan' | 'list') => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage off */
    }
  };
  const start = () =>
    updateInspection(x.id, (d) => {
      d.status = 'in-progress';
      d.startedAt = Date.now();
    });
  const openRoom = (roomId: string) => {
    if (x.status === 'scheduled') start();
    go(`/inspect/${x.id}/room/${roomId}`);
  };

  return (
    <>
      <div className="sticky-head insp-head">
        <div className="row">
          <button className="icon-btn" aria-label="Back" onClick={() => back(`/property/${p.id}`)}>
            <ArrowLeft />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h2>
            <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.name} · {x.number}
            </div>
          </div>
          <button className="icon-btn" aria-label="More" onClick={() => setMenu(true)}>
            <MoreHorizontal />
          </button>
        </div>
      </div>

      {x.status === 'scheduled' ? (
        <section className="card pad stack" style={{ marginBottom: 16 }}>
          <div>
            <h3>
              {dayLabel(x.scheduledAt)} at {timeLabel(x.scheduledAt)}
            </h3>
            <div className="small muted" style={{ marginTop: 4 }}>
              {address(p)}
              {x.attendees.length ? ` · with ${x.attendees.map((a) => a.name).join(', ')}` : ''}
            </div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t.description} {x.rooms.length} spaces and {st.total} checks are ready.
          </p>
          <div className="row">
            <button className="btn primary grow" onClick={start}>
              <Play /> Start inspection
            </button>
            <a className="btn" href={mapsLink(address(p))} target="_blank" rel="noreferrer">
              <Navigation /> Directions
            </a>
          </div>
        </section>
      ) : null}

      <section className="card insp-stats">
        <Ring value={st.score !== null && st.pct === 1 ? st.score / 100 : st.pct} color={st.pct === 1 ? scoreColor(st.score) : 'var(--brand)'}>
          {st.pct === 1 ? (st.score ?? '–') : `${Math.round(st.pct * 100)}%`}
        </Ring>
        <div style={{ minWidth: 0 }}>
          <b style={{ display: 'block' }}>{st.pct === 1 ? scoreWord(st.score) : `${st.done} of ${st.total} checks done`}</b>
          <div className="small muted">
            {st.score !== null && st.pct < 1 ? `Score so far ${st.score} · ` : ''}
            {st.photos} photos · {st.issues.length} issue{st.issues.length === 1 ? '' : 's'}
            {st.cost ? ` · ${money(st.cost, currency)}` : ''}
          </div>
          {before ? (
            <a className="chip brand" style={{ marginTop: 8, textDecoration: 'none' }} href={`#/compare/${x.id}`}>
              <GitCompareArrows /> Compared with move-in on {shortDate(before.completedAt ?? before.scheduledAt)}
            </a>
          ) : null}
        </div>
      </section>

      <div className="row" style={{ margin: '18px 0 10px' }}>
        <h2 className="grow">{view === 'plan' ? 'Plan' : 'Spaces'}</h2>
        <Seg
          label="View"
          value={view}
          onChange={setV}
          options={[
            { id: 'plan', label: 'Plan' },
            { id: 'list', label: 'List' },
          ]}
        />
      </div>

      {view === 'plan' ? (
        <section className="plan-card" style={{ background: '#fff' }}>
          <PlanView rooms={x.rooms} current={next?.id} onPick={(r) => openRoom(r.id)} />
          <div className="plan-legend">
            <span>
              <i style={{ background: '#fff' }} />
              Not started
            </span>
            <span>
              <i style={{ background: 'rgba(30,70,200,0.14)' }} />
              In progress
            </span>
            <span>
              <i style={{ background: 'rgba(63,164,91,0.3)' }} />
              Done, tinted by score
            </span>
            <span>Tap a room to inspect it</span>
          </div>
        </section>
      ) : (
        <div className="list">
          {x.rooms.map((r) => {
            const rp = roomProgress(r);
            const done = rp.total > 0 && rp.done === rp.total;
            return (
              <button className="room-row" key={r.id} onClick={() => openRoom(r.id)}>
                <div className="mini">
                  <Ring value={done ? (rp.score ?? 0) / 100 : rp.total ? rp.done / rp.total : 0} size={36} stroke={4} color={done ? scoreColor(rp.score) : 'var(--brand)'} />
                </div>
                <div className="t">
                  <b>{r.name}</b>
                  <span>
                    {rp.done}/{rp.total} checks
                    {rp.shotsTotal ? ` · ${rp.shots}/${rp.shotsTotal} photos` : ''}
                    {rp.issues ? ` · ${rp.issues} issue${rp.issues === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
                {done && rp.score !== null ? (
                  <span className="num" style={{ color: scoreColor(rp.score), fontSize: 17 }}>
                    {rp.score}
                  </span>
                ) : null}
                <ChevronRight className="chev" />
              </button>
            );
          })}
        </div>
      )}

      <div className="bottom-bar">
        {x.status === 'complete' ? (
          <a className="btn primary grow" href={`#/report/${x.id}`}>
            <FileCheck2 /> View report
          </a>
        ) : (
          <>
            {next ? (
              <button className="btn grow" onClick={() => openRoom(next.id)}>
                <Play /> {st.done ? 'Continue' : 'Start'}: {next.name}
              </button>
            ) : null}
            <a className="btn primary grow" href={`#/inspect/${x.id}/finish`}>
              <FileCheck2 /> Review & sign
            </a>
          </>
        )}
      </div>

      {menu ? (
        <Sheet title="Inspection" onClose={() => setMenu(false)}>
          <div className="list">
            <button
              className="rowlink"
              onClick={() => {
                setMenu(false);
                setAdding(true);
              }}
            >
              <Plus className="chev" style={{ color: 'var(--brand)' }} />
              <div className="text">
                <b>Add a space</b>
                <span>Another bedroom, a bonus room, a shed…</span>
              </div>
            </button>
            {x.status === 'scheduled' ? (
              <button className="rowlink" onClick={() => void addToCalendar(x, p).then(() => setMenu(false))}>
                <CalendarPlus className="chev" style={{ color: 'var(--brand)' }} />
                <div className="text">
                  <b>Add to calendar</b>
                  <span>
                    {dayLabel(x.scheduledAt)} at {timeLabel(x.scheduledAt)}
                  </span>
                </div>
              </button>
            ) : null}
            <a className="rowlink" href={mapsLink(address(p))} target="_blank" rel="noreferrer">
              <Navigation className="chev" style={{ color: 'var(--brand)' }} />
              <div className="text">
                <b>Directions</b>
                <span>{address(p)}</span>
              </div>
            </a>
            <button
              className="rowlink"
              onClick={() => {
                setMenu(false);
                setConfirm(true);
              }}
            >
              <Trash2 className="chev" style={{ color: 'var(--poor)' }} />
              <div className="text">
                <b style={{ color: 'var(--poor)' }}>Delete inspection</b>
                <span>Removes its checks, notes and photos</span>
              </div>
            </button>
          </div>
        </Sheet>
      ) : null}

      {adding ? <AddRoom onClose={() => setAdding(false)} onAdd={(kind, name) => {
        const room = newRoom(kind, name);
        updateInspection(x.id, (d) => {
          d.rooms.push(room);
        });
        setAdding(false);
        toast(`${name} added`);
      }} /> : null}

      {confirm ? (
        <Sheet title="Delete this inspection?" onClose={() => setConfirm(false)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {t.name} at {p.name} will be removed from this device. This can’t be undone.
          </p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(false)}>
              Keep it
            </button>
            <button
              className="btn grow danger"
              onClick={() => {
                deleteInspection(x.id);
                toast('Inspection deleted');
                go(`/property/${p.id}`, { replace: true });
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

function AddRoom({ onClose, onAdd }: { onClose: () => void; onAdd: (kind: RoomKind, name: string) => void }) {
  const [kind, setKind] = useState<RoomKind>('bedroom');
  const [name, setName] = useState('');
  return (
    <Sheet title="Add a space" onClose={onClose}>
      <div className="stack">
        <div className="opts">
          {ROOM_KINDS.map((k) => (
            <button key={k.kind} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
              {k.name}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Name</span>
          <input className="input" placeholder={ROOM_KINDS.find((k) => k.kind === kind)?.name} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary block" onClick={() => onAdd(kind, name.trim() || ROOM_KINDS.find((k) => k.kind === kind)!.name)}>
          <Plus /> Add with standard checks
        </button>
      </div>
    </Sheet>
  );
}
