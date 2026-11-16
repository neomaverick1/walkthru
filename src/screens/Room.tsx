import { AlertTriangle, ArrowLeft, Camera, Check, ChevronLeft, ChevronRight, CopyPlus, Gauge, ImagePlus, Map as MapIcon, MoreHorizontal, Pencil, Plus, Trash2, Wifi } from 'lucide-react';
import { useState } from 'react';

import { Img, PhotoViewer } from '../components/Photo';
import { Sheet } from '../components/ui';
import { toast } from '../components/toast';
import { findEarlier } from '../lib/compare';
import { addPhoto, pickImages } from '../lib/photos';
import { back, go } from '../lib/router';
import { ACTION_LABEL, effectiveRating, itemDone, RATINGS, ratingInfo, RESPONSIBILITY_LABEL, roomProgress, scoreColor, SEVERITY_LABEL } from '../lib/score';
import { speedTest } from '../lib/speedtest';
import { deletePhoto, updateInspection, useStore } from '../lib/store';
import { suggestions, templateInfo } from '../lib/templates';
import type { Inspection, Issue, Item, Rating, Room } from '../lib/types';
import { shortDate, uid } from '../lib/util';

type Target = { kind: 'shot'; id: string } | { kind: 'item'; id: string };

export function RoomScreen({ id, roomId }: { id: string; roomId: string }) {
  const x = useStore((s) => s.inspections[id]);
  const before = useStore((s) => (x?.compareTo ? s.inspections[x.compareTo] : undefined));
  const currency = useStore((s) => s.settings.currency);
  const [open, setOpen] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ photo: string; target: Target; review?: boolean; title: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);

  const room = x?.rooms.find((r) => r.id === roomId);
  if (!x || !room) {
    return (
      <div className="card empty">
        This space was removed.
        <a className="btn" href={x ? `#/inspect/${x.id}` : '#/'}>
          Back
        </a>
      </div>
    );
  }
  const idx = x.rooms.indexOf(room);
  const prev = x.rooms[idx - 1];
  const next = x.rooms[idx + 1];
  const rp = roomProgress(room);
  const responsibility = templateInfo(x.template).responsibility;

  const edit = (change: (r: Room, d: Inspection) => void) =>
    updateInspection(x.id, (d) => {
      const r = d.rooms.find((y) => y.id === room.id);
      if (r) change(r, d);
      if (d.status === 'scheduled') {
        d.status = 'in-progress';
        d.startedAt = Date.now();
      }
    });
  const editItem = (itemId: string, change: (it: Item) => void) =>
    edit((r) => {
      const it = r.items.find((i) => i.id === itemId);
      if (it) change(it);
    });

  const attach = (target: Target, photoId: string) =>
    edit((r) => {
      if (target.kind === 'shot') {
        const s = r.shots.find((y) => y.id === target.id);
        if (s) s.photo = photoId;
      } else {
        const it = r.items.find((i) => i.id === target.id);
        if (it) it.photos.push(photoId);
      }
    });
  const detach = (target: Target, photoId: string) => {
    edit((r) => {
      if (target.kind === 'shot') {
        const s = r.shots.find((y) => y.id === target.id);
        if (s && s.photo === photoId) s.photo = undefined;
      } else {
        const it = r.items.find((i) => i.id === target.id);
        if (it) it.photos = it.photos.filter((p) => p !== photoId);
      }
    });
    deletePhoto(photoId);
  };

  const capture = async (target: Target, title: string, source: 'camera' | 'library' = 'camera') => {
    try {
      const blobs = await pickImages(source, source === 'library' && target.kind === 'item');
      if (!blobs.length) return;
      let first = '';
      for (const b of blobs) {
        const ph = await addPhoto(b);
        attach(target, ph.id);
        first ||= ph.id;
        if (target.kind === 'shot') break;
      }
      setViewer({ photo: first, target, review: true, title });
    } catch (e) {
      if (!/cancel/i.test(String(e))) toast('The camera could not be opened');
    }
  };

  const rate = (it: Item, r: Rating) =>
    editItem(it.id, (d) => {
      d.rating = d.rating === r ? undefined : r;
      if (d.rating === 'poor' && !d.issue) d.issue = { severity: 'moderate', responsibility: responsibility ? 'tenant' : 'owner', action: 'repair', cost: 0 };
      if (d.rating === 'excellent' || d.rating === 'good' || d.rating === 'na') {
        if (d.issue && !d.issue.cost && !d.note) d.issue = undefined;
      }
    });

  const restGood = () => {
    let n = 0;
    edit((r) =>
      r.items.forEach((i) => {
        if (i.type === 'rate' && !i.rating) {
          i.rating = 'good';
          n++;
        }
      }),
    );
    toast(`${n} check${n === 1 ? '' : 's'} marked Good`);
  };

  return (
    <>
      <div className="sticky-head">
        <div className="row">
          <button className="icon-btn" aria-label="Back to the plan" onClick={() => back(`/inspect/${x.id}`)}>
            <ArrowLeft />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{room.name}</h2>
            <div className="small muted">
              {rp.done}/{rp.total} checks{rp.shotsTotal ? ` · ${rp.shots}/${rp.shotsTotal} photos` : ''}
              {rp.score !== null ? (
                <>
                  {' · '}
                  <span style={{ color: scoreColor(rp.score), fontWeight: 700 }}>score {rp.score}</span>
                </>
              ) : null}
            </div>
          </div>
          <button className="icon-btn" aria-label="Previous space" disabled={!prev} onClick={() => prev && go(`/inspect/${x.id}/room/${prev.id}`, { replace: true })}>
            <ChevronLeft />
          </button>
          <button className="icon-btn" aria-label="Next space" disabled={!next} onClick={() => next && go(`/inspect/${x.id}/room/${next.id}`, { replace: true })}>
            <ChevronRight />
          </button>
          <button className="icon-btn" aria-label="Space options" onClick={() => setMenu(true)}>
            <MoreHorizontal />
          </button>
        </div>
        <div className="progress" style={{ marginTop: 10 }}>
          <i style={{ width: `${rp.total ? (rp.done / rp.total) * 100 : 0}%` }} />
        </div>
      </div>

      {room.shots.length ? (
        <section style={{ marginBottom: 18 }}>
          <div className="section-head">
            <h3>Required photos</h3>
            <span className="small muted end">
              {rp.shots} of {rp.shotsTotal}
            </span>
          </div>
          <div className="shots">
            {room.shots.map((s) =>
              s.photo ? (
                <ShotThumb key={s.id} photoId={s.photo} label={s.label} onOpen={() => setViewer({ photo: s.photo!, target: { kind: 'shot', id: s.id }, title: `${room.name}: ${s.label}` })} />
              ) : (
                <button key={s.id} className="shot" onClick={() => void capture({ kind: 'shot', id: s.id }, `${room.name}: ${s.label}`)}>
                  <Camera />
                  {s.label}
                </button>
              ),
            )}
          </div>
        </section>
      ) : null}

      <div className="items">
        {room.items.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            room={room}
            open={open === it.id}
            onToggle={() => setOpen(open === it.id ? null : it.id)}
            onRate={(r) => {
              rate(it, r);
              if (r === 'poor' || r === 'fair') setOpen(it.id);
            }}
            edit={(change) => editItem(it.id, change)}
            onCapture={(source) => void capture({ kind: 'item', id: it.id }, `${room.name}: ${it.name}`, source)}
            onOpenPhoto={(pid) => setViewer({ photo: pid, target: { kind: 'item', id: it.id }, title: `${room.name}: ${it.name}` })}
            earlier={findEarlier(before, room.name, it.name)}
            earlierDate={before ? shortDate(before.completedAt ?? before.scheduledAt) : ''}
            responsibility={responsibility}
            currency={currency}
          />
        ))}
        <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setAdding(true)}>
          <Plus /> Add a check
        </button>
        <label className="field" style={{ marginTop: 6 }}>
          <span>Notes for this space</span>
          <textarea className="textarea" placeholder="Anything that doesn’t fit a check" value={room.note} onChange={(e) => edit((r) => (r.note = e.target.value))} />
        </label>
      </div>

      <div className="bottom-bar">
        {rp.done < rp.total && room.items.some((i) => i.type === 'rate' && !i.rating) ? (
          <button className="btn grow" onClick={restGood}>
            <Check /> Rest are Good
          </button>
        ) : null}
        {next ? (
          <button className="btn primary grow" onClick={() => go(`/inspect/${x.id}/room/${next.id}`, { replace: true })}>
            {next.name} <ChevronRight />
          </button>
        ) : (
          <a className="btn primary grow" href={`#/inspect/${x.id}/finish`}>
            Review & sign <ChevronRight />
          </a>
        )}
      </div>

      {viewer ? (
        <PhotoViewer
          id={viewer.photo}
          title={viewer.title}
          review={viewer.review}
          onClose={() => setViewer(null)}
          onRetake={() => {
            const t = viewer.target;
            detach(t, viewer.photo);
            setViewer(null);
            void capture(t, viewer.title);
          }}
          onDelete={() => {
            detach(viewer.target, viewer.photo);
            setViewer(null);
            toast('Photo deleted');
          }}
        />
      ) : null}

      {menu ? (
        <Sheet title={room.name} onClose={() => setMenu(false)}>
          <div className="list">
            <button className="rowlink" onClick={() => (setMenu(false), setRenaming(true))}>
              <Pencil className="chev" style={{ color: 'var(--brand)' }} />
              <div className="text">
                <b>Rename</b>
              </div>
            </button>
            <button
              className="rowlink"
              onClick={() => {
                const copy: Room = { ...structuredClone(room), id: uid(), name: `${room.name} (copy)` };
                copy.items = copy.items.map((i) => ({ ...i, id: uid(), rating: undefined, value: undefined, note: '', photos: [], issue: undefined }));
                copy.shots = copy.shots.map((s) => ({ ...s, id: uid(), photo: undefined }));
                updateInspection(x.id, (d) => d.rooms.splice(idx + 1, 0, copy));
                setMenu(false);
                toast('Space duplicated');
              }}
            >
              <CopyPlus className="chev" style={{ color: 'var(--brand)' }} />
              <div className="text">
                <b>Duplicate as a new space</b>
                <span>Same checks, nothing filled in</span>
              </div>
            </button>
            <a className="rowlink" href={`#/inspect/${x.id}`} onClick={() => setMenu(false)}>
              <MapIcon className="chev" style={{ color: 'var(--brand)' }} />
              <div className="text">
                <b>Back to the plan</b>
              </div>
            </a>
            <button
              className="rowlink"
              onClick={() => {
                updateInspection(x.id, (d) => (d.rooms = d.rooms.filter((r) => r.id !== room.id)));
                setMenu(false);
                toast(`${room.name} removed`);
                go(`/inspect/${x.id}`, { replace: true });
              }}
            >
              <Trash2 className="chev" style={{ color: 'var(--poor)' }} />
              <div className="text">
                <b style={{ color: 'var(--poor)' }}>Remove this space</b>
              </div>
            </button>
          </div>
        </Sheet>
      ) : null}

      {renaming ? <Rename name={room.name} onClose={() => setRenaming(false)} onSave={(n) => (edit((r) => (r.name = n)), setRenaming(false))} /> : null}
      {adding ? (
        <AddCheck
          room={room}
          onClose={() => setAdding(false)}
          onAdd={(name) => {
            const item: Item = { id: uid(), name, type: 'rate', note: '', photos: [] };
            edit((r) => r.items.push(item));
            setAdding(false);
            setOpen(item.id);
          }}
        />
      ) : null}
    </>
  );
}

function ShotThumb({ photoId, label, onOpen }: { photoId: string; label: string; onOpen: () => void }) {
  const verdict = useStore((s) => s.photos[photoId]?.check?.verdict ?? 'ok');
  return (
    <button className="shot done" onClick={onOpen} aria-label={`${label} photo`}>
      <Img id={photoId} />
      <span className={`badge${verdict === 'ok' ? '' : ' warn'}`}>{verdict === 'ok' ? <Check /> : <AlertTriangle />}</span>
      <span className="cap">{label}</span>
    </button>
  );
}

interface ItemProps {
  item: Item;
  room: Room;
  open: boolean;
  onToggle: () => void;
  onRate: (r: Rating) => void;
  edit: (change: (it: Item) => void) => void;
  onCapture: (source: 'camera' | 'library') => void;
  onOpenPhoto: (id: string) => void;
  earlier?: Item;
  earlierDate: string;
  responsibility: boolean;
  currency: string;
}

function ItemCard({ item, open, onToggle, onRate, edit, onCapture, onOpenPhoto, earlier, earlierDate, responsibility, currency }: ItemProps) {
  const [testing, setTesting] = useState<number | null>(null);
  const eff = effectiveRating(item);
  const changed = earlier && effectiveRating(earlier) && eff && ratingInfo(effectiveRating(earlier)!).value !== null && ratingInfo(eff).value !== null && ratingInfo(eff).value! < ratingInfo(effectiveRating(earlier)!).value!;
  const setIssue = (i: Partial<Issue>) => edit((d) => d.issue && Object.assign(d.issue, i));

  const runTest = async () => {
    setTesting(0);
    try {
      const v = await speedTest((m) => setTesting(m));
      edit((d) => (d.value = v));
      toast(`Wi-Fi: ${Math.round(v)} Mbps`);
    } catch {
      toast('Speed test needs an internet connection');
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className={`item${open ? ' open' : ''}`}>
      <div className="head">
        <button className="name" onClick={onToggle} aria-expanded={open}>
          <b>{item.name}</b>
          {item.hint ? <span>{item.hint}</span> : null}
        </button>
        <div className="badges">
          {item.photos.length ? (
            <span className="chip">
              <Camera /> {item.photos.length}
            </span>
          ) : null}
          {item.issue ? (
            <span className={`chip ${item.issue.severity === 'minor' ? 'warn' : 'bad'}`}>
              <AlertTriangle /> {SEVERITY_LABEL[item.issue.severity]}
            </span>
          ) : null}
          {changed ? <span className="chip bad">Worse</span> : null}
          {!open && itemDone(item) && !item.issue ? <Check style={{ width: 18, height: 18, color: 'var(--excellent)' }} /> : null}
        </div>
      </div>

      {item.type === 'rate' ? (
        <div className="rates" role="group" aria-label={`Condition of ${item.name}`}>
          {RATINGS.map((r) => (
            <button key={r.id} data-r={r.id} aria-pressed={item.rating === r.id} onClick={() => onRate(r.id)}>
              {r.short}
            </button>
          ))}
        </div>
      ) : item.type === 'reading' ? (
        <div className="reading">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            placeholder={item.tool === 'speedtest' ? 'Mbps' : 'Reading'}
            value={item.value ?? ''}
            onChange={(e) => edit((d) => (d.value = e.target.value === '' ? undefined : +e.target.value))}
            aria-label={`${item.name} reading`}
          />
          <span className="muted small">{item.unit}</span>
          {item.tool === 'speedtest' ? (
            <button className="btn sm" onClick={() => void runTest()} disabled={testing !== null}>
              {testing !== null ? <Gauge /> : <Wifi />}
              {testing !== null ? `${Math.round(testing)} Mbps…` : 'Test now'}
            </button>
          ) : null}
          {eff && item.tool ? <span className="chip" style={{ background: `color-mix(in srgb, var(--${eff}) 14%, white)`, color: `var(--${eff})` }}>{ratingInfo(eff).label}</span> : null}
        </div>
      ) : (
        <div className="reading">
          <div className="stepper">
            <button aria-label="Fewer" onClick={() => edit((d) => (d.value = Math.max(0, (d.value ?? 0) - 1)))}>
              −
            </button>
            <span>{item.value ?? 0}</span>
            <button aria-label="More" onClick={() => edit((d) => (d.value = (d.value ?? 0) + 1))}>
              +
            </button>
          </div>
          <span className="muted small">{item.unit}</span>
        </div>
      )}

      {open ? (
        <div className="more">
          {earlier ? (
            <div className="earlier">
              {earlier.photos[0] ? <Img id={earlier.photos[0]} /> : null}
              <span>
                At move-in ({earlierDate}): <b>{effectiveRating(earlier) ? ratingInfo(effectiveRating(earlier)!).label : 'not rated'}</b>
                {earlier.note ? ` · ${earlier.note}` : ''}
              </span>
            </div>
          ) : null}
          <label className="field">
            <span>Notes</span>
            <textarea className="textarea" placeholder="What you see, where, how big" value={item.note} onChange={(e) => edit((d) => (d.note = e.target.value))} />
          </label>
          <div className="thumbs">
            {item.photos.map((pid) => (
              <button key={pid} className="t" onClick={() => onOpenPhoto(pid)} aria-label="Open photo">
                <Img id={pid} />
                <PhotoMarksDot id={pid} />
              </button>
            ))}
            <button className="t add" onClick={() => onCapture('camera')}>
              <Camera />
              Photo
            </button>
            <button className="t add" onClick={() => onCapture('library')}>
              <ImagePlus />
              Library
            </button>
          </div>
          <div className="row">
            <span className="grow" style={{ fontWeight: 650 }}>
              Flag as an issue
            </span>
            <button
              className="toggle"
              role="switch"
              aria-checked={!!item.issue}
              aria-label="Flag as an issue"
              onClick={() => edit((d) => (d.issue = d.issue ? undefined : { severity: d.rating === 'poor' ? 'moderate' : 'minor', responsibility: responsibility ? 'tenant' : 'owner', action: 'repair', cost: 0 }))}
            />
          </div>
          {item.issue ? (
            <div className="issue-box">
              <div className="field">
                <span>Severity</span>
                <div className="opts">
                  {(Object.keys(SEVERITY_LABEL) as Issue['severity'][]).map((s) => (
                    <button key={s} aria-pressed={item.issue!.severity === s} onClick={() => setIssue({ severity: s })}>
                      {SEVERITY_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
              {responsibility ? (
                <div className="field">
                  <span>Who pays</span>
                  <div className="opts">
                    {(Object.keys(RESPONSIBILITY_LABEL) as Issue['responsibility'][]).map((s) => (
                      <button key={s} aria-pressed={item.issue!.responsibility === s} onClick={() => setIssue({ responsibility: s })}>
                        {RESPONSIBILITY_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="field">
                <span>Action</span>
                <div className="opts">
                  {(Object.keys(ACTION_LABEL) as Issue['action'][]).map((s) => (
                    <button key={s} aria-pressed={item.issue!.action === s} onClick={() => setIssue({ action: s })}>
                      {ACTION_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Estimated cost ({currency})</span>
                <input className="input" type="number" inputMode="decimal" min={0} value={item.issue.cost || ''} placeholder="0" onChange={(e) => setIssue({ cost: Math.max(0, +e.target.value || 0) })} />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PhotoMarksDot({ id }: { id: string }) {
  const n = useStore((s) => s.photos[id]?.marks.length ?? 0);
  return n ? <span className="chip" style={{ position: 'absolute', left: 4, bottom: 4, height: 18, padding: '0 5px', fontSize: 10.5, background: 'rgba(255,59,48,0.92)', color: '#fff' }}>{n}</span> : null;
}

function Rename({ name, onClose, onSave }: { name: string; onClose: () => void; onSave: (n: string) => void }) {
  const [v, setV] = useState(name);
  return (
    <Sheet title="Rename space" onClose={onClose}>
      <div className="stack">
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && onSave(v.trim())} />
        <button className="btn primary block" disabled={!v.trim()} onClick={() => onSave(v.trim())}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

function AddCheck({ room, onClose, onAdd }: { room: Room; onClose: () => void; onAdd: (name: string) => void }) {
  const [v, setV] = useState('');
  const have = new Set(room.items.map((i) => i.name.toLowerCase()));
  const ideas = suggestions(room.kind).filter((s) => !have.has(s.toLowerCase())).slice(0, 10);
  return (
    <Sheet title={`Add a check to ${room.name}`} onClose={onClose}>
      <div className="stack">
        <input className="input" placeholder="Ceiling fan, wine fridge, sauna…" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && onAdd(v.trim())} />
        {ideas.length ? (
          <div className="opts">
            {ideas.map((s) => (
              <button key={s} onClick={() => onAdd(s)}>
                <Plus style={{ width: 14, height: 14, verticalAlign: -2 }} /> {s}
              </button>
            ))}
          </div>
        ) : null}
        <button className="btn primary block" disabled={!v.trim()} onClick={() => onAdd(v.trim())}>
          Add check
        </button>
      </div>
    </Sheet>
  );
}

