import { ArrowLeft, Download, ExternalLink, GitCompareArrows, Mail, Pencil, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Ring } from '../components/ui';
import { toast } from '../components/toast';
import { reportFileName } from '../lib/labels';
import { back } from '../lib/router';
import { inspectionStats, scoreColor, scoreWord } from '../lib/score';
import { shareFile } from '../lib/share';
import { useStore } from '../lib/store';
import { templateInfo } from '../lib/templates';
import { address, isNativeApp, money, shortDate } from '../lib/util';

export function ReportScreen({ id }: { id: string }) {
  const x = useStore((s) => s.inspections[id]);
  const p = useStore((s) => (x ? s.properties[x.propertyId] : undefined));
  const currency = useStore((s) => s.settings.currency);
  const settings = useStore((s) => s.settings);
  const [built, setBuilt] = useState<{ version: string; bytes?: Uint8Array; error?: string; progress: number } | null>(null);
  const pages = useRef<HTMLDivElement>(null);
  const version = x ? `${x.updatedAt}|${settings.company}|${settings.accent}|${settings.logo?.length ?? 0}|${settings.disclaimer}` : '';
  // Whatever was built for an older version of the inspection or the branding is stale.
  const current = built?.version === version ? built : null;
  const bytes = current?.bytes ?? null;
  const error = current?.error ?? '';
  const progress = current?.progress ?? 0;

  useEffect(() => {
    if (!x) return;
    let live = true;
    // pdf-lib and the fonts load only when a report is opened.
    import('../lib/report')
      .then(({ buildReport }) => buildReport(x, (v) => live && setBuilt({ version, progress: v })))
      .then((b) => live && setBuilt({ version, bytes: b, progress: 1 }))
      .catch((e: unknown) => live && setBuilt({ version, progress: 0, error: e instanceof Error ? e.message : 'The report could not be built.' }));
    return () => {
      live = false;
    };
  }, [x, version]);

  // Draw the pages with pdf.js, loaded only on this screen.
  useEffect(() => {
    if (!bytes || !pages.current) return;
    let cancelled = false;
    const host = pages.current;
    host.innerHTML = '';
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      for (let i = 1; i <= doc.numPages && !cancelled; i++) {
        const page = await doc.getPage(i);
        const width = Math.min(760, host.clientWidth || 760);
        const vp1 = page.getViewport({ scale: 1 });
        const scale = (width / vp1.width) * Math.min(2, window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.setAttribute('aria-label', `Report page ${i} of ${doc.numPages}`);
        host.appendChild(canvas);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  if (!x || !p) return <div className="card empty">This report was removed.</div>;
  const st = inspectionStats(x);
  const name = reportFileName(x, p);
  const share = async () => {
    if (!bytes) return;
    const how = await shareFile(bytes, name, 'application/pdf', `${templateInfo(x.template).name}: ${p.name}`);
    if (how === 'downloaded') toast('Report downloaded');
  };
  const openTab = () => {
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const recipients = x.attendees.map((a) => a.email).filter(Boolean).join(',');
  const mail = `mailto:${recipients}?subject=${encodeURIComponent(`${templateInfo(x.template).name}: ${p.name} (${x.number})`)}&body=${encodeURIComponent(
    `Hi,\n\nHere is the ${templateInfo(x.template).name.toLowerCase()} for ${address(p)}.\n\n${x.summary}\n\nThe full report with photos is attached.\n\n${settings.inspector}\n${settings.company}\n${settings.phone}`,
  )}`;

  return (
    <>
      <div className="sticky-head">
        <div className="row">
          <button className="icon-btn" aria-label="Back" onClick={() => back(`/property/${p.id}`)}>
            <ArrowLeft />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</h2>
            <div className="small muted">
              {templateInfo(x.template).name} · {x.number}
            </div>
          </div>
          <a className="icon-btn" aria-label="Edit inspection" href={`#/inspect/${x.id}`}>
            <Pencil />
          </a>
        </div>
      </div>

      <section className="card insp-stats" style={{ marginBottom: 14 }}>
        <Ring value={(st.score ?? 0) / 100} color={scoreColor(st.score)}>
          {st.score ?? '–'}
        </Ring>
        <div style={{ minWidth: 0 }}>
          <b style={{ display: 'block' }}>{scoreWord(st.score)}</b>
          <div className="small muted">
            {shortDate(x.completedAt ?? x.scheduledAt)} · {st.issues.length} issue{st.issues.length === 1 ? '' : 's'}
            {st.cost ? ` · ${money(st.cost, currency)} estimated` : ''}
            {st.tenantCost ? ` · tenant ${money(st.tenantCost, currency)}` : ''}
          </div>
          {x.compareTo ? (
            <a className="chip brand" style={{ marginTop: 8, textDecoration: 'none' }} href={`#/compare/${x.id}`}>
              <GitCompareArrows /> Move-in vs move-out
            </a>
          ) : null}
        </div>
      </section>

      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
        <button className="btn primary grow" disabled={!bytes} onClick={() => void share()}>
          {isNativeApp() ? <Share2 /> : <Download />} {isNativeApp() ? 'Share PDF' : 'Download PDF'}
        </button>
        <a className="btn grow" href={mail}>
          <Mail /> Email
        </a>
        {!isNativeApp() ? (
          <button className="btn grow" disabled={!bytes} onClick={openTab}>
            <ExternalLink /> Open
          </button>
        ) : null}
      </div>

      {error ? <div className="card pad" style={{ color: 'var(--poor)' }}>{error}</div> : null}
      {!bytes && !error ? (
        <div className="card pad stack">
          <b>Building the report…</b>
          <div className="progress">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="small muted">Laying out {x.rooms.length} spaces and {st.photos} photos on this device.</span>
        </div>
      ) : null}
      <div className="pages" ref={pages} />
      {bytes ? (
        <p className="tiny faint" style={{ textAlign: 'center' }}>
          {name} · {(bytes.length / 1024 / 1024).toFixed(1)} MB
        </p>
      ) : null}
    </>
  );
}
