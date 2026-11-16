// The PDF report: a cover sheet, the findings, every room with its photos, and the signatures.
// Laid out like a set of architectural drawings, with a title block on the cover and sheet numbers.
import fontkit from '@pdf-lib/fontkit';
import { clip, endPath, LineCapStyle, PDFDocument, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';

import { compareInspections } from './compare';
import { renderPhoto } from './photos';
import { ACTION_LABEL, effectiveRating, inspectionStats, ratingInfo, RESPONSIBILITY_LABEL, roomProgress, scoreWord, SEVERITY_LABEL } from './score';
import { getState } from './store';
import { templateInfo } from './templates';
import type { Inspection, Item, Photo, Property, Rating, Room, Settings } from './types';
import { address, money, shortDate, stamp } from './util';

const W = 612;
const H = 792;
const M = 42; // page margin
const CW = W - M * 2;

const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const INK = hex('#10203B');
const INK2 = hex('#4A5874');
const MUTED = hex('#8592AA');
const LINE = hex('#DCE2EC');
const PAPER = hex('#F4F6F9');
const WHITE = rgb(1, 1, 1);
const RATING_COLOR: Record<Rating, RGB> = {
  excellent: hex('#0F8B5F'),
  good: hex('#3FA45B'),
  fair: hex('#D58A12'),
  poor: hex('#D2372E'),
  na: hex('#98A2B3'),
};
const scoreRgb = (s: number | null) => (s === null ? RATING_COLOR.na : s >= 93 ? RATING_COLOR.excellent : s >= 78 ? RATING_COLOR.good : s >= 55 ? RATING_COLOR.fair : RATING_COLOR.poor);

interface Fonts {
  title: PDFFont;
  label: PDFFont;
  body: PDFFont;
  bold: PDFFont;
}

async function fonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const get = async (f: string) => new Uint8Array(await (await fetch(new URL(`fonts/${f}`, document.baseURI))).arrayBuffer());
  const [title, label, body, bold] = await Promise.all(['Archivo-ExpandedBold.ttf', 'Archivo-SemiBold.ttf', 'PublicSans-Regular.ttf', 'PublicSans-SemiBold.ttf'].map(get));
  return {
    title: await doc.embedFont(title, { subset: true }),
    label: await doc.embedFont(label, { subset: true }),
    body: await doc.embedFont(body, { subset: true }),
    bold: await doc.embedFont(bold, { subset: true }),
  };
}

/** Breaks text into lines that fit a width. */
export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

const clean = (s: string) => s.replace(/[\u2028\u2029\t]/g, ' ');

interface Ctx {
  doc: PDFDocument;
  f: Fonts;
  accent: RGB;
  accentDeep: RGB;
  x: Inspection;
  p: Property;
  s: Settings;
  page: PDFPage;
  y: number; // cursor, from the top of the page
  pages: PDFPage[];
  images: Map<string, { img: PDFImage; w: number; h: number }>;
  onProgress?: (p: number) => void;
}

const top = (_c: Ctx, y: number) => H - y;

function text(c: Ctx, s: string, x: number, y: number, size: number, font: PDFFont, color = INK, opts: { maxWidth?: number; align?: 'left' | 'right' | 'center' } = {}) {
  let str = clean(s);
  if (opts.maxWidth) {
    while (str.length > 1 && font.widthOfTextAtSize(str, size) > opts.maxWidth) str = str.slice(0, -2) + '…';
  }
  const w = font.widthOfTextAtSize(str, size);
  const dx = opts.align === 'right' ? -w : opts.align === 'center' ? -w / 2 : 0;
  c.page.drawText(str, { x: x + dx, y: top(c, y) - size * 0.8, size, font, color });
}

function newPage(c: Ctx) {
  c.page = c.doc.addPage([W, H]);
  c.pages.push(c.page);
  // Running header: the door-swing mark, the property and the inspection
  drawMark(c, M, 26, 13, c.accent);
  text(c, c.p.name, M + 20, 26, 9, c.f.label, INK);
  text(c, `${templateInfo(c.x.template).name} · ${shortDate(c.x.completedAt ?? c.x.scheduledAt)}`, W - M, 26, 9, c.f.body, INK2, { align: 'right' });
  c.page.drawLine({ start: { x: M, y: top(c, 46) }, end: { x: W - M, y: top(c, 46) }, thickness: 0.6, color: LINE });
  c.y = 66;
}

function ensure(c: Ctx, height: number) {
  if (c.y + height > H - 56) newPage(c);
}

/** The logo: a wall line with a door swinging open, as drawn on a floor plan. */
function drawMark(c: Ctx, x: number, y: number, size: number, color: RGB) {
  const s = size / 24;
  const draw = (d: string, w: number) =>
    c.page.drawSvgPath(d, { x, y: top(c, y - 2), scale: s, borderColor: color, borderWidth: ((size / 13) * w) / s, borderLineCap: LineCapStyle.Round });
  draw('M 7.5 19 L 4.5 19 L 4.5 4.5 L 19.5 4.5 L 19.5 19 L 13.5 19', 1.5);
  draw('M 7.5 19 L 7.5 13', 1.15);
  draw('M 7.5 13 A 6 6 0 0 1 13.5 19', 0.9);
}

function heading(c: Ctx, title: string, sub?: string) {
  ensure(c, 60);
  text(c, title, M, c.y, 17, c.f.title, INK);
  c.y += 24;
  if (sub) {
    for (const l of wrap(sub, c.f.body, 9.5, CW)) {
      text(c, l, M, c.y, 9.5, c.f.body, INK2);
      c.y += 13;
    }
  }
  c.y += 6;
}

function pill(c: Ctx, label: string, x: number, y: number, color: RGB, size = 8): number {
  const w = c.f.label.widthOfTextAtSize(label, size) + 12;
  c.page.drawRectangle({ x, y: top(c, y + size + 6), width: w, height: size + 6, color, opacity: 0.12, borderColor: color, borderWidth: 0.6, borderOpacity: 0.5 });
  text(c, label, x + 6, y + 3.2, size, c.f.label, color);
  return w;
}

async function image(c: Ctx, p: Photo, maxEdge = 1100) {
  const hit = c.images.get(p.id);
  if (hit) return hit;
  const r = await renderPhoto(p, maxEdge, 0.8);
  const img = await c.doc.embedJpg(r.bytes);
  const v = { img, w: r.width, h: r.height };
  c.images.set(p.id, v);
  return v;
}

/** Draws a photo cropped to fill a box, like CSS object-fit: cover. */
async function photoBox(c: Ctx, p: Photo, x: number, y: number, w: number, h: number) {
  const { img, w: iw, h: ih } = await image(c, p);
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  // Clip to the box inside a saved graphics state.
  c.page.pushOperators(pushGraphicsState(), rectangle(x, top(c, y + h), w, h), clip(), endPath());
  c.page.drawImage(img, { x: x - (dw - w) / 2, y: top(c, y + h) - (dh - h) / 2, width: dw, height: dh });
  c.page.pushOperators(popGraphicsState());
}

// ---------------------------------------------------------------------------------------------------------------

async function cover(c: Ctx) {
  const st = inspectionStats(c.x);
  const t = templateInfo(c.x.template);
  c.page = c.doc.addPage([W, H]);
  c.pages.push(c.page);

  // Photo across the top, with the company over a dark band
  const coverPhoto = getState().photos[c.p.cover ?? ''] ?? getState().photos[c.x.rooms[0]?.shots[0]?.photo ?? ''];
  const ph = 330;
  if (coverPhoto) await photoBox(c, coverPhoto, 0, 0, W, ph);
  else c.page.drawRectangle({ x: 0, y: top(c, ph), width: W, height: ph, color: c.accentDeep });
  c.page.drawRectangle({ x: 0, y: top(c, 64), width: W, height: 64, color: hex('#0B1428'), opacity: 0.55 });
  if (c.s.logo) {
    try {
      const bytes = Uint8Array.from(atob(c.s.logo.split(',')[1]), (ch) => ch.charCodeAt(0));
      const img = c.s.logo.startsWith('data:image/png') ? await c.doc.embedPng(bytes) : await c.doc.embedJpg(bytes);
      const h = 30;
      const w = (img.width / img.height) * h;
      c.page.drawImage(img, { x: M, y: top(c, 17 + h), width: w, height: h });
    } catch {
      /* a logo that can't be read is left out */
    }
  } else {
    drawMark(c, M, 22, 22, WHITE);
    text(c, c.s.company, M + 32, 24, 13, c.f.title, WHITE);
  }
  text(c, `Report ${c.x.number}`, W - M, 27, 9.5, c.f.label, WHITE, { align: 'right' });

  // Title and score
  c.y = ph + 34;
  // Long template names take two lines rather than being cut short.
  const titleLines = wrap(t.name, c.f.title, 24, CW - 150).slice(0, 2);
  titleLines.forEach((l, i) => text(c, l, M, c.y + i * 28, 24, c.f.title, INK, { maxWidth: CW - 150 }));
  const dy = (titleLines.length - 1) * 28;
  text(c, c.p.name, M, c.y + 36 + dy, 15, c.f.bold, INK, { maxWidth: CW - 150 });
  text(c, address(c.p), M, c.y + 57 + dy, 10.5, c.f.body, INK2, { maxWidth: CW - 150 });
  const when = c.x.completedAt ?? c.x.startedAt ?? c.x.scheduledAt;
  text(c, `Inspected ${stamp(c.x.startedAt ?? when)} by ${c.x.inspector}`, M, c.y + 75 + dy, 10.5, c.f.body, INK2, { maxWidth: CW - 150 });

  // Score ring
  const cx = W - M - 58;
  const cy = c.y + 46;
  const r = 50;
  c.page.drawCircle({ x: cx, y: top(c, cy), size: r, borderColor: LINE, borderWidth: 9 });
  if (st.score !== null) {
    // In SVG space (y down) from the top of the ring, clockwise.
    const a = (Math.min(99.9, st.score) / 100) * Math.PI * 2;
    const x1 = (r * Math.sin(a)).toFixed(2);
    const y1 = (-r * Math.cos(a)).toFixed(2);
    c.page.drawSvgPath(`M 0 ${-r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x1} ${y1}`, {
      x: cx,
      y: top(c, cy),
      borderColor: scoreRgb(st.score),
      borderWidth: 9,
      borderLineCap: LineCapStyle.Round,
    });
  }
  text(c, st.score === null ? '–' : String(st.score), cx, cy - 20, 30, c.f.title, INK, { align: 'center' });
  text(c, 'of 100', cx, cy + 14, 8.5, c.f.body, MUTED, { align: 'center' });
  text(c, scoreWord(st.score), cx, cy + r + 14, 9.5, c.f.label, scoreRgb(st.score), { align: 'center' });

  // Key numbers
  c.y += 128 + dy;
  const facts: [string, string][] = [
    ['Spaces', String(c.x.rooms.length)],
    ['Checks', `${st.done}/${st.total}`],
    ['Photos', String(st.photos)],
    ['Issues', String(st.issues.length)],
    [t.responsibility && st.tenantCost ? 'Tenant charges' : 'Estimated work', money(t.responsibility && st.tenantCost ? st.tenantCost : st.cost, c.s.currency)],
  ];
  const fw = CW / facts.length;
  c.page.drawLine({ start: { x: M, y: top(c, c.y) }, end: { x: W - M, y: top(c, c.y) }, thickness: 0.8, color: INK });
  facts.forEach(([k, v], i) => {
    const x = M + i * fw;
    if (i) c.page.drawLine({ start: { x, y: top(c, c.y) }, end: { x, y: top(c, c.y + 52) }, thickness: 0.5, color: LINE });
    text(c, v, x + (i ? 12 : 0), c.y + 12, 17, c.f.title, INK);
    text(c, k, x + (i ? 12 : 0), c.y + 36, 8.5, c.f.body, INK2);
  });
  c.y += 52;
  c.page.drawLine({ start: { x: M, y: top(c, c.y) }, end: { x: W - M, y: top(c, c.y) }, thickness: 0.5, color: LINE });

  // Title block, as on a drawing sheet
  const bh = 92;
  const by = H - M - bh;
  const cols: [string, string[]][] = [
    ['Prepared by', [c.s.company, c.x.inspector, c.s.license ? `License ${c.s.license}` : ''].filter(Boolean)],
    ['Prepared for', c.x.attendees.length ? c.x.attendees.slice(0, 2).map((a) => `${a.name} (${a.role})`) : ['Property owner']],
    ['Contact', [c.s.phone, c.s.email].filter(Boolean)],
    ['Sheet', [`Report ${c.x.number}`, `Issued ${shortDate(when)}`]],
  ];
  const bw = [CW * 0.3, CW * 0.3, CW * 0.22, CW * 0.18];
  c.page.drawRectangle({ x: M, y: top(c, by + bh), width: CW, height: bh, borderColor: INK, borderWidth: 0.9 });
  let bx = M;
  cols.forEach(([k, lines], i) => {
    if (i) c.page.drawLine({ start: { x: bx, y: top(c, by) }, end: { x: bx, y: top(c, by + bh) }, thickness: 0.5, color: INK });
    text(c, k, bx + 10, by + 10, 7.5, c.f.label, MUTED);
    lines.slice(0, 3).forEach((l, j) => text(c, l, bx + 10, by + 26 + j * 15, j === 0 ? 9.5 : 9, j === 0 ? c.f.bold : c.f.body, j === 0 ? INK : INK2, { maxWidth: bw[i] - 20 }));
    bx += bw[i];
  });
}

async function summaryPage(c: Ctx, before?: Inspection) {
  const st = inspectionStats(c.x);
  const t = templateInfo(c.x.template);
  newPage(c);
  heading(c, 'Summary');
  for (const l of wrap(c.x.summary || 'No summary written.', c.f.body, 10.5, CW)) {
    ensure(c, 16);
    text(c, l, M, c.y, 10.5, c.f.body, INK);
    c.y += 15.5;
  }
  c.y += 14;

  // Findings
  heading(c, 'Findings', st.issues.length ? `${st.issues.length} item${st.issues.length === 1 ? '' : 's'} need attention, most urgent first.` : 'Nothing needs attention.');
  if (st.issues.length) {
    const cols = t.responsibility
      ? [
          { k: 'Item', w: 0.38 },
          { k: 'Severity', w: 0.14 },
          { k: 'Who pays', w: 0.16 },
          { k: 'Action', w: 0.14 },
          { k: 'Estimate', w: 0.18, right: true },
        ]
      : [
          { k: 'Item', w: 0.46 },
          { k: 'Severity', w: 0.16 },
          { k: 'Action', w: 0.18 },
          { k: 'Estimate', w: 0.2, right: true },
        ];
    const row = (cells: string[], y: number, fonts: PDFFont[], colors: RGB[], sizes: number[]) => {
      let x = M;
      cols.forEach((col, i) => {
        const w = col.w * CW;
        text(c, cells[i], col.right ? x + w : x, y, sizes[i], fonts[i], colors[i], { maxWidth: w - 8, align: col.right ? 'right' : 'left' });
        x += w;
      });
    };
    ensure(c, 30);
    row(cols.map((x) => x.k), c.y, cols.map(() => c.f.label), cols.map(() => MUTED), cols.map(() => 8));
    c.y += 16;
    for (const it of st.issues) {
      ensure(c, 34);
      c.page.drawLine({ start: { x: M, y: top(c, c.y - 4) }, end: { x: W - M, y: top(c, c.y - 4) }, thickness: 0.5, color: LINE });
      const sevColor = it.issue.severity === 'safety' || it.issue.severity === 'major' ? RATING_COLOR.poor : it.issue.severity === 'moderate' ? RATING_COLOR.fair : INK2;
      const cells = t.responsibility
        ? [it.item.name, SEVERITY_LABEL[it.issue.severity], RESPONSIBILITY_LABEL[it.issue.responsibility], ACTION_LABEL[it.issue.action], it.issue.cost ? money(it.issue.cost, c.s.currency) : '–']
        : [it.item.name, SEVERITY_LABEL[it.issue.severity], ACTION_LABEL[it.issue.action], it.issue.cost ? money(it.issue.cost, c.s.currency) : '–'];
      row(cells, c.y + 2, [c.f.bold, c.f.label, c.f.body, c.f.body, c.f.bold], [INK, sevColor, INK2, INK2, INK], cells.map(() => 9.5));
      text(c, it.room.name, M, c.y + 16, 8.5, c.f.body, MUTED, { maxWidth: cols[0].w * CW - 8 });
      c.y += 32;
    }
    c.page.drawLine({ start: { x: M, y: top(c, c.y - 4) }, end: { x: W - M, y: top(c, c.y - 4) }, thickness: 0.9, color: INK });
    const totals: [string, number][] = t.responsibility
      ? ([
          ['Tenant charges', st.tenantCost],
          ['Owner repairs', st.ownerCost],
          ['Total estimate', st.cost],
        ] as [string, number][]).filter(([, v], i) => v || i === 2)
      : [['Total estimate', st.cost]];
    for (const [k, v] of totals) {
      ensure(c, 18);
      text(c, k, W - M - 150, c.y + 2, 9.5, k.startsWith('Total') ? c.f.bold : c.f.body, INK2);
      text(c, money(v, c.s.currency), W - M, c.y + 2, 10, c.f.title, INK, { align: 'right' });
      c.y += 18;
    }
    c.y += 10;
  }

  // Changes since move-in
  if (before) {
    const { changes } = compareInspections(before, c.x);
    const worse = changes.filter((ch) => ch.kind === 'worse');
    heading(c, 'Changes since move-in', `Compared with ${before.number} on ${shortDate(before.completedAt ?? before.scheduledAt)}. ${worse.length ? `${worse.length} item${worse.length === 1 ? ' is' : 's are'} in worse condition.` : 'Nothing is in worse condition.'}`);
    for (const ch of worse) {
      const bp = ch.before.photos.map((id) => getState().photos[id]).find(Boolean);
      const ap = ch.after.photos.map((id) => getState().photos[id]).find(Boolean);
      const hasPhotos = !!(bp && ap);
      ensure(c, hasPhotos ? 150 : 34);
      c.page.drawLine({ start: { x: M, y: top(c, c.y - 4) }, end: { x: W - M, y: top(c, c.y - 4) }, thickness: 0.5, color: LINE });
      text(c, `${ch.after.name}`, M, c.y + 2, 10, c.f.bold, INK, { maxWidth: CW * 0.5 });
      text(c, ch.room.name, M, c.y + 16, 8.5, c.f.body, MUTED);
      const fr = effectiveRating(ch.before)!;
      const to = effectiveRating(ch.after)!;
      let px = M + CW * 0.52;
      px += pill(c, ratingInfo(fr).label, px, c.y, RATING_COLOR[fr]) + 6;
      text(c, '→', px, c.y + 1, 10, c.f.body, MUTED);
      px += 16;
      pill(c, ratingInfo(to).label, px, c.y, RATING_COLOR[to]);
      if (ch.after.issue?.cost) text(c, money(ch.after.issue.cost, c.s.currency), W - M, c.y + 2, 10, c.f.title, INK, { align: 'right' });
      c.y += 30;
      if (hasPhotos) {
        const pw = (CW - 12) / 2;
        const phh = 108;
        await photoBox(c, bp!, M, c.y, pw, phh);
        await photoBox(c, ap!, M + pw + 12, c.y, pw, phh);
        text(c, `Move-in · ${shortDate(bp!.takenAt)}`, M, c.y + phh + 4, 8, c.f.body, MUTED);
        text(c, `Move-out · ${shortDate(ap!.takenAt)}`, M + pw + 12, c.y + phh + 4, 8, c.f.body, MUTED);
        c.y += phh + 22;
      }
    }
    c.y += 8;
  }

  // Scores by space
  heading(c, 'Condition by space');
  for (const r of c.x.rooms) {
    ensure(c, 22);
    const p = roomProgress(r);
    text(c, r.name, M, c.y, 9.5, c.f.bold, INK, { maxWidth: 150 });
    const bx = M + 160;
    const bw = CW - 160 - 120;
    c.page.drawRectangle({ x: bx, y: top(c, c.y + 9), width: bw, height: 7, color: PAPER });
    if (p.score !== null) c.page.drawRectangle({ x: bx, y: top(c, c.y + 9), width: (bw * p.score) / 100, height: 7, color: scoreRgb(p.score) });
    text(c, p.score === null ? '–' : String(p.score), bx + bw + 30, c.y - 1, 10, c.f.title, INK, { align: 'right' });
    text(c, `${p.done}/${p.total} checks${p.issues ? ` · ${p.issues} issue${p.issues === 1 ? '' : 's'}` : ''}`, W - M, c.y, 8.5, c.f.body, MUTED, { align: 'right' });
    c.y += 21;
  }
}

async function roomSection(c: Ctx, r: Room, n: number) {
  const p = roomProgress(r);
  const shots = r.shots.filter((s) => s.photo).map((s) => ({ p: getState().photos[s.photo!], label: s.label })).filter((s) => s.p);
  // Keep the header with its first row of photos, or with its first few checks
  ensure(c, 42 + (shots.length ? (shots.length === 1 ? 220 : 150) + 24 : 3 * 26));
  // Section header like a sheet title: number, name, score
  c.page.drawRectangle({ x: M, y: top(c, c.y + 30), width: CW, height: 30, color: PAPER });
  c.page.drawRectangle({ x: M, y: top(c, c.y + 30), width: 3, height: 30, color: c.accent });
  text(c, String(n).padStart(2, '0'), M + 12, c.y + 9, 11, c.f.title, c.accent);
  text(c, r.name, M + 40, c.y + 8.5, 12.5, c.f.title, INK, { maxWidth: CW - 200 });
  const sc = p.score === null ? 'Not rated' : `${p.score} · ${scoreWord(p.score)}`;
  text(c, sc, W - M - 10, c.y + 10, 9.5, c.f.label, scoreRgb(p.score), { align: 'right' });
  c.y += 42;

  // Required photos first, in a strip
  if (shots.length) {
    const per = shots.length === 1 ? 1 : 2;
    const gw = (CW - (per - 1) * 10) / per;
    const gh = per === 1 ? 220 : 150;
    for (let i = 0; i < shots.length; i += per) {
      ensure(c, gh + 24);
      for (let j = 0; j < per && i + j < shots.length; j++) {
        const s = shots[i + j];
        await photoBox(c, s.p, M + j * (gw + 10), c.y, gw, gh);
        text(c, s.label, M + j * (gw + 10), c.y + gh + 4, 8.5, c.f.label, INK2, { maxWidth: gw - 90 });
        text(c, stamp(s.p.takenAt), M + j * (gw + 10) + gw, c.y + gh + 4, 8, c.f.body, MUTED, { align: 'right' });
      }
      c.y += gh + 22;
      c.onProgress?.(0);
    }
  }

  // Checklist
  const colItem = CW * 0.34;
  const colRating = 92;
  const noteW = CW - colItem - colRating;
  for (const it of r.items) {
    const rating = effectiveRating(it);
    const valueText = it.type !== 'rate' && it.value !== undefined ? `${it.value.toLocaleString('en-US')} ${it.unit ?? ''}`.trim() : '';
    const note = [valueText, it.note].filter(Boolean).join(' · ');
    const lines = note ? wrap(note, c.f.body, 9, noteW - 8) : [];
    const h = Math.max(22, 10 + lines.length * 12.5 + (it.issue ? 14 : 0));
    ensure(c, h + 4);
    c.page.drawLine({ start: { x: M, y: top(c, c.y) }, end: { x: W - M, y: top(c, c.y) }, thickness: 0.4, color: LINE });
    text(c, it.name, M, c.y + 6, 9.5, c.f.bold, INK, { maxWidth: colItem - 10 });
    if (rating) pill(c, ratingInfo(rating).short === 'Exc' ? 'Excellent' : ratingInfo(rating).short, M + colItem, c.y + 4, RATING_COLOR[rating]);
    else if (it.type === 'rate') text(c, 'Not checked', M + colItem, c.y + 6, 8.5, c.f.body, MUTED);
    lines.forEach((l, i) => text(c, l, M + colItem + colRating, c.y + 6 + i * 12.5, 9, c.f.body, INK2));
    if (it.issue) {
      const iy = c.y + 6 + lines.length * 12.5 + 1;
      const bits = [SEVERITY_LABEL[it.issue.severity], ACTION_LABEL[it.issue.action], templateInfo(c.x.template).responsibility ? RESPONSIBILITY_LABEL[it.issue.responsibility] : '', it.issue.cost ? money(it.issue.cost, c.s.currency) : '']
        .filter(Boolean)
        .join(' · ');
      text(c, `Issue: ${bits}`, M + colItem + colRating, iy, 8.5, c.f.label, it.issue.severity === 'minor' ? RATING_COLOR.fair : RATING_COLOR.poor);
    }
    c.y += h;
  }
  c.page.drawLine({ start: { x: M, y: top(c, c.y) }, end: { x: W - M, y: top(c, c.y) }, thickness: 0.4, color: LINE });
  c.y += 10;

  // Photos of findings
  const finds: { p: Photo; item: Item }[] = [];
  for (const it of r.items) for (const id of it.photos) if (getState().photos[id]) finds.push({ p: getState().photos[id], item: it });
  if (finds.length) {
    const per = 3;
    const gw = (CW - 2 * 10) / per;
    const gh = gw * 0.72;
    for (let i = 0; i < finds.length; i += per) {
      ensure(c, gh + 34);
      for (let j = 0; j < per && i + j < finds.length; j++) {
        const f = finds[i + j];
        await photoBox(c, f.p, M + j * (gw + 10), c.y, gw, gh);
        text(c, f.item.name, M + j * (gw + 10), c.y + gh + 4, 8.5, c.f.label, INK2, { maxWidth: gw });
        text(c, stamp(f.p.takenAt), M + j * (gw + 10), c.y + gh + 16, 7.5, c.f.body, MUTED);
      }
      c.y += gh + 32;
    }
  }
  if (r.note) {
    for (const l of wrap(r.note, c.f.body, 9.5, CW)) {
      ensure(c, 14);
      text(c, l, M, c.y, 9.5, c.f.body, INK2);
      c.y += 13.5;
    }
  }
  c.y += 14;
}

function signaturesPage(c: Ctx) {
  ensure(c, 260);
  heading(c, 'Signatures', 'By signing, each party confirms they took part in this inspection and received a copy of this report.');
  const sigs = c.x.signatures;
  const bw = (CW - 16) / 2;
  const bh = 110;
  if (!sigs.length) {
    text(c, 'Not signed.', M, c.y, 10, c.f.body, MUTED);
    c.y += 20;
  }
  sigs.forEach((s, i) => {
    const x = M + (i % 2) * (bw + 16);
    if (i % 2 === 0 && i) c.y += bh + 30;
    if (i % 2 === 0) ensure(c, bh + 30);
    c.page.drawRectangle({ x, y: top(c, c.y + bh), width: bw, height: bh, borderColor: LINE, borderWidth: 0.8 });
    const scale = (bw - 30) / 600;
    c.page.drawSvgPath(s.path, { x: x + 15, y: top(c, c.y + 8), scale, borderColor: hex('#16306E'), borderWidth: 1.6 / scale, borderLineCap: LineCapStyle.Round });
    c.page.drawLine({ start: { x: x + 15, y: top(c, c.y + bh - 30) }, end: { x: x + bw - 15, y: top(c, c.y + bh - 30) }, thickness: 0.6, color: INK2 });
    text(c, `${s.name}`, x + 15, c.y + bh - 25, 9.5, c.f.bold, INK, { maxWidth: bw - 30 });
    text(c, `${s.role} · ${stamp(s.signedAt)}`, x + 15, c.y + bh - 12, 8.5, c.f.body, MUTED, { maxWidth: bw - 30 });
  });
  if (sigs.length) c.y += bh + 30;
  c.y += 6;
  for (const l of wrap(c.s.disclaimer, c.f.body, 8.5, CW)) {
    ensure(c, 12);
    text(c, l, M, c.y, 8.5, c.f.body, MUTED);
    c.y += 12;
  }
}

function footers(c: Ctx) {
  const n = c.pages.length;
  c.pages.forEach((pg, i) => {
    c.page = pg;
    const y = H - 30;
    text(c, `${c.s.company} · Report ${c.x.number}`, M, y, 8, c.f.body, MUTED);
    text(c, `Sheet ${i + 1} of ${n}`, W - M, y, 8, c.f.label, MUTED, { align: 'right' });
  });
}

/** Builds the PDF and returns its bytes. */
export async function buildReport(x: Inspection, onProgress?: (p: number) => void): Promise<Uint8Array> {
  const st = getState();
  const p = st.properties[x.propertyId];
  const s = st.settings;
  const doc = await PDFDocument.create();
  doc.setTitle(`${templateInfo(x.template).name}: ${p.name}`);
  doc.setAuthor(x.inspector);
  doc.setSubject(address(p));
  doc.setCreator('Walkthru');
  doc.setProducer('Walkthru');
  const f = await fonts(doc);
  const accent = hex(s.accent);
  const c: Ctx = { doc, f, accent, accentDeep: hex('#0F2A7A'), x, p, s, page: undefined as unknown as PDFPage, y: 0, pages: [], images: new Map(), onProgress };
  const before = x.compareTo ? st.inspections[x.compareTo] : undefined;
  await cover(c);
  onProgress?.(0.1);
  await summaryPage(c, before);
  onProgress?.(0.25);
  newPage(c);
  let i = 0;
  for (const r of x.rooms) {
    await roomSection(c, r, ++i);
    onProgress?.(0.25 + (0.65 * i) / x.rooms.length);
  }
  signaturesPage(c);
  footers(c);
  onProgress?.(1);
  return doc.save();
}

