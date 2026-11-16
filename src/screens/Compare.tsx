import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import { useState } from 'react';

import { Img } from '../components/Photo';
import { Seg } from '../components/ui';
import { compareInspections } from '../lib/compare';
import { back } from '../lib/router';
import { effectiveRating, inspectionStats, RATINGS, RESPONSIBILITY_LABEL } from '../lib/score';
import { useStore } from '../lib/store';
import type { Rating } from '../lib/types';
import { money, shortDate } from '../lib/util';

const Pill = ({ r }: { r?: Rating }) =>
  r ? (
    <span className="chip" style={{ background: `color-mix(in srgb, var(--${r}) 14%, white)`, color: `var(--${r})` }}>
      {RATINGS.find((x) => x.id === r)!.label}
    </span>
  ) : (
    <span className="chip">Not rated</span>
  );

export function CompareScreen({ id }: { id: string }) {
  const after = useStore((s) => s.inspections[id]);
  const before = useStore((s) => (after?.compareTo ? s.inspections[after.compareTo] : undefined));
  const p = useStore((s) => (after ? s.properties[after.propertyId] : undefined));
  const currency = useStore((s) => s.settings.currency);
  const [show, setShow] = useState<'worse' | 'better'>('worse');

  if (!after || !before || !p) {
    return (
      <div className="card empty">
        There’s no move-in to compare with.
        <a className="btn" href="#/">
          Back to today
        </a>
      </div>
    );
  }
  const { changes, matched } = compareInspections(before, after);
  const worse = changes.filter((c) => c.kind === 'worse');
  const better = changes.filter((c) => c.kind === 'better');
  const st = inspectionStats(after);
  const wear = st.issues.filter((i) => i.issue.responsibility === 'wear').length;
  const list = show === 'worse' ? worse : better;

  return (
    <>
      <div className="sticky-head">
        <div className="row">
          <button className="icon-btn" aria-label="Back" onClick={() => back(`/property/${p.id}`)}>
            <ArrowLeft />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2>Move-in vs move-out</h2>
            <div className="small muted">
              {p.name} · {shortDate(before.completedAt ?? before.scheduledAt)} → {after.status === 'complete' ? shortDate(after.completedAt ?? after.scheduledAt) : 'today'}
            </div>
          </div>
        </div>
      </div>

      <div className="figures" style={{ marginBottom: 18 }}>
        <div className="figure">
          <span className="num" style={{ color: worse.length ? 'var(--poor)' : undefined }}>
            {worse.length}
          </span>
          <span>Worse than at move-in</span>
        </div>
        <div className="figure">
          <span className="num">{money(st.tenantCost, currency)}</span>
          <span>Tenant charges</span>
        </div>
        <div className="figure">
          <span className="num">{wear}</span>
          <span>Normal wear (not charged)</span>
        </div>
        <div className="figure">
          <span className="num">{matched}</span>
          <span>Checks compared</span>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <Seg
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { id: 'worse', label: `Worse (${worse.length})` },
            { id: 'better', label: `Better (${better.length})` },
          ]}
        />
        <span className="grow" />
        {after.status === 'complete' ? (
          <a className="btn sm" href={`#/report/${after.id}`}>
            <FileText /> Report
          </a>
        ) : (
          <a className="btn sm" href={`#/inspect/${after.id}`}>
            Continue inspection
          </a>
        )}
      </div>

      {list.length ? (
        <div className="stack">
          {list.map((c) => (
            <article className="card pad stack" key={c.after.id} style={{ gap: 10 }}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <b>{c.after.name}</b>
                  <div className="small muted">{c.room.name}</div>
                </div>
                {c.after.issue?.cost ? (
                  <div style={{ textAlign: 'right' }}>
                    <div className="num" style={{ fontSize: 17 }}>
                      {money(c.after.issue.cost, currency)}
                    </div>
                    <div className="tiny muted">{RESPONSIBILITY_LABEL[c.after.issue.responsibility]}</div>
                  </div>
                ) : null}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Pill r={effectiveRating(c.before)} />
                <ArrowRight style={{ width: 16, height: 16, color: 'var(--ink-3)' }} />
                <Pill r={effectiveRating(c.after)} />
              </div>
              {c.after.note ? <div className="small">{c.after.note}</div> : null}
              {c.before.photos[0] || c.after.photos[0] ? (
                <div className="pair">
                  <figure>
                    {c.before.photos[0] ? <Img id={c.before.photos[0]} focusFrom={c.after.photos[0]} /> : <div style={{ aspectRatio: '4 / 3', borderRadius: 10, background: 'var(--line-2)' }} />}
                    <figcaption>Move-in</figcaption>
                  </figure>
                  <figure>
                    {c.after.photos[0] ? <Img id={c.after.photos[0]} /> : <div style={{ aspectRatio: '4 / 3', borderRadius: 10, background: 'var(--line-2)' }} />}
                    <figcaption>Move-out</figcaption>
                  </figure>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="card empty">{show === 'worse' ? 'Nothing is in worse condition than at move-in.' : 'Nothing improved since move-in.'}</div>
      )}
    </>
  );
}
