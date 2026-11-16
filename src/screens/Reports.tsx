import { ChevronRight, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Img } from '../components/Photo';
import { ScoreBadge } from '../components/ui';
import { inspectionStats } from '../lib/score';
import { useStore } from '../lib/store';
import { TEMPLATES, templateInfo } from '../lib/templates';
import type { TemplateId } from '../lib/types';
import { money, shortDate } from '../lib/util';

export function ReportsScreen() {
  const inspections = useStore((s) => s.inspections);
  const properties = useStore((s) => s.properties);
  const currency = useStore((s) => s.settings.currency);
  const [kind, setKind] = useState<TemplateId | 'all'>('all');
  const done = useMemo(
    () =>
      Object.values(inspections)
        .filter((x) => x.status === 'complete' && (kind === 'all' || x.template === kind))
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [inspections, kind],
  );
  return (
    <>
      <div className="topbar">
        <div className="title">
          <h1>Reports</h1>
          <div className="sub">Every finished inspection, ready to share as a PDF</div>
        </div>
      </div>
      <div className="opts" style={{ marginBottom: 14 }}>
        <button aria-pressed={kind === 'all'} onClick={() => setKind('all')}>
          All
        </button>
        {TEMPLATES.map((t) => (
          <button key={t.id} aria-pressed={kind === t.id} onClick={() => setKind(t.id)}>
            {t.short}
          </button>
        ))}
      </div>
      {done.length ? (
        <div className="list">
          {done.map((x) => {
            const p = properties[x.propertyId];
            const st = inspectionStats(x);
            return (
              <a className="rowlink" key={x.id} href={`#/report/${x.id}`}>
                <Img id={p?.cover} className="thumb" />
                <div className="text">
                  <b>{p?.name}</b>
                  <span>
                    {templateInfo(x.template).name} · {shortDate(x.completedAt ?? x.scheduledAt)}
                  </span>
                  <span>
                    {x.number} · {st.issues.length} issue{st.issues.length === 1 ? '' : 's'}
                    {st.cost ? ` · ${money(st.cost, currency)}` : ''} · {st.photos} photos
                  </span>
                </div>
                <ScoreBadge score={st.score} />
                <ChevronRight className="chev" />
              </a>
            );
          })}
        </div>
      ) : (
        <div className="card empty">
          <FileText />
          No finished inspections{kind === 'all' ? ' yet' : ' of this type'}.
        </div>
      )}
    </>
  );
}
