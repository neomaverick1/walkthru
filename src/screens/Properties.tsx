import { Building2, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Img } from '../components/Photo';
import { ScoreBadge } from '../components/ui';
import { inspectionStats } from '../lib/score';
import { useStore } from '../lib/store';
import { PROPERTY_KIND } from '../lib/labels';
import { PropertyEditor } from './PropertyEditor';

export function PropertiesScreen({ onNew }: { onNew: (propertyId?: string) => void }) {
  const properties = useStore((s) => s.properties);
  const inspections = useStore((s) => s.inspections);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(properties)
      .filter((p) => !needle || `${p.name} ${p.street} ${p.city} ${p.contacts.map((c) => c.name).join(' ')}`.toLowerCase().includes(needle))
      .map((p) => {
        const all = Object.values(inspections).filter((x) => x.propertyId === p.id);
        const last = all.filter((x) => x.status === 'complete').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
        const next = all.filter((x) => x.status !== 'complete').sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
        return { p, last, next, score: last ? inspectionStats(last).score : null };
      })
      .sort((a, b) => a.p.name.localeCompare(b.p.name));
  }, [properties, inspections, q]);

  return (
    <>
      <div className="topbar">
        <div className="title">
          <h1>Properties</h1>
          <div className="sub">{Object.keys(properties).length} homes</div>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Plus /> Add
        </button>
      </div>
      <div className="search">
        <Search />
        <input className="input" type="search" placeholder="Search by name, street, city or contact" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search properties" />
      </div>
      {rows.length ? (
        <div className="prop-grid">
          {rows.map(({ p, last, next, score }) => (
            <a className="prop" key={p.id} href={`#/property/${p.id}`}>
              <div className="ph">
                <Img id={p.cover} alt="" />
                {last ? <ScoreBadge score={score} title="Latest score" /> : null}
              </div>
              <div className="info">
                <b>{p.name}</b>
                <div className="addr">
                  {p.street === p.name ? '' : `${p.street}, `}
                  {p.city}, {p.state}
                </div>
                <div className="facts">
                  <span className="chip">{PROPERTY_KIND[p.kind]}</span>
                  <span className="chip">
                    {p.beds} bd · {p.baths} ba
                  </span>
                  {next ? <span className={`chip ${next.status === 'in-progress' ? 'brand' : ''}`}>{next.status === 'in-progress' ? 'Inspecting now' : 'Scheduled'}</span> : null}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="card empty">
          <Building2 />
          <div>{q ? 'No properties match.' : 'Add your first property to start inspecting.'}</div>
          {!q ? (
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Plus /> Add property
            </button>
          ) : null}
        </div>
      )}
      {adding ? (
        <PropertyEditor
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            onNew(id);
          }}
        />
      ) : null}
    </>
  );
}
