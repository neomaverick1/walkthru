import { Eraser } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const BW = 600;
const BH = 200;

/** Draw with a finger or a mouse. Saves as SVG path data in a 600 × 200 box, so it stays sharp in the PDF. */
export function SignaturePad({ onChange }: { onChange: (path: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<[number, number][][]>([]);
  const cur = useRef<[number, number][] | null>(null);
  const [empty, setEmpty] = useState(true);

  const redraw = () => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#16306e';
    ctx.lineWidth = 3.2 * (c.width / BW);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const k = c.width / BW;
    for (const s of [...strokes.current, ...(cur.current ? [cur.current] : [])]) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0][0] * k, s[0][1] * k);
      for (let i = 1; i < s.length - 1; i++) {
        const mx = (s[i][0] + s[i + 1][0]) / 2;
        const my = (s[i][1] + s[i + 1][1]) / 2;
        ctx.quadraticCurveTo(s[i][0] * k, s[i][1] * k, mx * k, my * k);
      }
      ctx.lineTo(s[s.length - 1][0] * k, s[s.length - 1][1] * k);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const c = canvas.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = BW * dpr;
    c.height = BH * dpr;
    redraw();
  }, []);

  const toPath = () =>
    strokes.current
      .filter((s) => s.length > 1)
      .map((s) => {
        let d = `M ${s[0][0].toFixed(1)} ${s[0][1].toFixed(1)}`;
        for (let i = 1; i < s.length - 1; i++) {
          const mx = (s[i][0] + s[i + 1][0]) / 2;
          const my = (s[i][1] + s[i + 1][1]) / 2;
          d += ` Q ${s[i][0].toFixed(1)} ${s[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
        }
        const l = s[s.length - 1];
        return `${d} L ${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
      })
      .join(' ');

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BW, ((e.clientY - r.top) / r.height) * BH];
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="pad-wrap">
        <canvas
          ref={canvas}
          style={{ aspectRatio: `${BW} / ${BH}` }}
          aria-label="Signature area. Draw your signature."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            cur.current = [pt(e)];
          }}
          onPointerMove={(e) => {
            if (!cur.current) return;
            cur.current.push(pt(e));
            redraw();
          }}
          onPointerUp={() => {
            if (cur.current && cur.current.length > 1) strokes.current.push(cur.current);
            cur.current = null;
            setEmpty(!strokes.current.length);
            redraw();
            onChange(toPath());
          }}
        />
        <div className="line" />
        <div className="x">×</div>
      </div>
      <div className="row">
        <span className="tiny faint grow">{empty ? 'Sign above the line' : 'Looks good'}</span>
        <button
          className="btn sm ghost"
          onClick={() => {
            strokes.current = [];
            setEmpty(true);
            redraw();
            onChange('');
          }}
        >
          <Eraser /> Clear
        </button>
      </div>
    </div>
  );
}

export function SignatureView({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${BW} ${BH}`} className={className} aria-hidden="true">
      <path d={path} fill="none" stroke="#16306e" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
