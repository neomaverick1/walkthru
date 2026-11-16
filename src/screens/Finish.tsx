import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, CircleDashed, FileCheck2, PenLine, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { SignaturePad, SignatureView } from '../components/SignaturePad';
import { Sheet } from '../components/ui';
import { toast } from '../components/toast';
import { back, go } from '../lib/router';
import { inspectionStats, itemDone, roomProgress } from '../lib/score';
import { draftSummary } from '../lib/summary';
import { updateInspection, useStore } from '../lib/store';
import { money, stamp } from '../lib/util';

export function FinishScreen({ id }: { id: string }) {
  const x = useStore((s) => s.inspections[id]);
  const p = useStore((s) => (x ? s.properties[x.propertyId] : undefined));
  const before = useStore((s) => (x?.compareTo ? s.inspections[x.compareTo] : undefined));
  const photos = useStore((s) => s.photos);
  const currency = useStore((s) => s.settings.currency);
  const [signing, setSigning] = useState<{ role: string; name: string } | null>(null);

  // Start from a drafted summary the first time.
  useEffect(() => {
    if (x && p && !x.summary) updateInspection(x.id, (d) => (d.summary = draftSummary(d, p, before, currency)));
  }, [x, p, before, currency]);

  if (!x || !p) return <div className="card empty">This inspection was removed.</div>;
  const st = inspectionStats(x);
  const missingItems = st.total - st.done;
  const firstMissing = x.rooms.find((r) => r.items.some((i) => !itemDone(i)));
  const firstShot = x.rooms.find((r) => roomProgress(r).shots < r.shots.length);
  const weak = Object.values(photos).filter((ph) => ph.check && ph.check.verdict !== 'ok' && x.rooms.some((r) => r.shots.some((s) => s.photo === ph.id) || r.items.some((i) => i.photos.includes(ph.id)))).length;
  const signers = [{ role: 'Inspector', name: x.inspector }, ...x.attendees.map((a) => ({ role: a.role, name: a.name }))];
  const signed = (role: string, name: string) => x.signatures.find((s) => s.role === role && s.name === name);
  const ready = missingItems === 0;

  const complete = () => {
    updateInspection(x.id, (d) => {
      d.status = 'complete';
      d.completedAt = Date.now();
      d.startedAt ??= Date.now();
    });
    toast('Inspection complete');
    go(`/report/${x.id}`, { replace: true });
  };

  return (
    <>
      <div className="sticky-head">
        <div className="row">
          <button className="icon-btn" aria-label="Back" onClick={() => back(`/inspect/${x.id}`)}>
            <ArrowLeft />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2>Review & sign</h2>
            <div className="small muted">{p.name}</div>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="stack" style={{ gap: 22 }}>
          <section>
            <div className="section-head">
              <h2>Before you finish</h2>
            </div>
            <div className="list">
              <a className="check-row" style={{ textDecoration: 'none', color: 'inherit' }} href={firstMissing ? `#/inspect/${x.id}/room/${firstMissing.id}` : undefined}>
                {missingItems ? <CircleDashed style={{ color: 'var(--fair)' }} /> : <CheckCircle2 style={{ color: 'var(--excellent)' }} />}
                <div>
                  <b>{missingItems ? `${missingItems} check${missingItems === 1 ? '' : 's'} not done` : `All ${st.total} checks done`}</b>
                  <div className="small muted">{firstMissing ? `Next: ${firstMissing.name}` : 'Every space has a rating or reading.'}</div>
                </div>
              </a>
              <a className="check-row" style={{ textDecoration: 'none', color: 'inherit' }} href={firstShot ? `#/inspect/${x.id}/room/${firstShot.id}` : undefined}>
                {st.shotsMissing ? <Camera style={{ color: 'var(--fair)' }} /> : <CheckCircle2 style={{ color: 'var(--excellent)' }} />}
                <div>
                  <b>{st.shotsMissing ? `${st.shotsMissing} required photo${st.shotsMissing === 1 ? '' : 's'} missing` : 'Every required photo taken'}</b>
                  <div className="small muted">
                    {st.photos} photos in total{weak ? ` · ${weak} may be blurry or dark` : ''}
                  </div>
                </div>
              </a>
              <div className="check-row">
                {st.issues.length ? <AlertTriangle style={{ color: st.safety ? 'var(--poor)' : 'var(--fair)' }} /> : <CheckCircle2 style={{ color: 'var(--excellent)' }} />}
                <div>
                  <b>{st.issues.length ? `${st.issues.length} issue${st.issues.length === 1 ? '' : 's'}, ${money(st.cost, currency)} estimated` : 'No issues flagged'}</b>
                  <div className="small muted">
                    {st.safety ? `${st.safety} safety item${st.safety === 1 ? '' : 's'}. ` : ''}
                    {st.tenantCost ? `Tenant charges ${money(st.tenantCost, currency)}.` : ''}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="section-head">
              <h2>Summary</h2>
              <button className="btn sm ghost end" onClick={() => updateInspection(x.id, (d) => (d.summary = draftSummary(d, p, before, currency)))}>
                <Sparkles /> Rewrite from findings
              </button>
            </div>
            <textarea className="textarea" style={{ minHeight: 170 }} value={x.summary} onChange={(e) => updateInspection(x.id, (d) => (d.summary = e.target.value))} aria-label="Report summary" />
            <p className="tiny faint" style={{ margin: '6px 0 0' }}>
              Drafted from your ratings and issues. Edit it freely; it opens the report.
            </p>
          </section>
        </div>

        <div className="stack" style={{ gap: 22 }}>
          <section>
            <div className="section-head">
              <h2>Signatures</h2>
            </div>
            <div className="list">
              {signers.map((s) => {
                const sig = signed(s.role, s.name);
                return (
                  <div className="sig" key={`${s.role}-${s.name}`}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <b style={{ display: 'block' }}>{s.name}</b>
                      <span className="small muted">{sig ? `${s.role} · signed ${stamp(sig.signedAt)}` : s.role}</span>
                    </div>
                    {sig ? <SignatureView path={sig.path} className="drawn" /> : null}
                    <button className="btn sm" onClick={() => setSigning(s)}>
                      <PenLine /> {sig ? 'Redo' : 'Sign'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div className="bottom-bar">
        <button className="btn primary grow" onClick={complete}>
          <FileCheck2 /> {ready ? 'Complete and create report' : 'Complete anyway'}
        </button>
      </div>

      {signing ? <SignSheet who={signing} onClose={() => setSigning(null)} onSave={(path) => {
        updateInspection(x.id, (d) => {
          d.signatures = d.signatures.filter((g) => !(g.role === signing.role && g.name === signing.name));
          d.signatures.push({ role: signing.role, name: signing.name, path, signedAt: Date.now() });
        });
        setSigning(null);
        toast('Signed');
      }} /> : null}
    </>
  );
}

function SignSheet({ who, onClose, onSave }: { who: { role: string; name: string }; onClose: () => void; onSave: (path: string) => void }) {
  const [path, setPath] = useState('');
  return (
    <Sheet title={`${who.name} · ${who.role}`} onClose={onClose}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          By signing, {who.name} confirms they took part in this inspection and received the report.
        </p>
        <SignaturePad onChange={setPath} />
        <button className="btn primary block" disabled={!path} onClick={() => onSave(path)}>
          Save signature
        </button>
      </div>
    </Sheet>
  );
}
