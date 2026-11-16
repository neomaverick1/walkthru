// Taking photos, checking their quality, and drawing markup onto them.
import { useEffect, useState } from 'react';

import { getState, photoBlob, savePhoto } from './store';
import type { Mark, Photo, PhotoCheck } from './types';
import { isNativeApp, uid } from './util';

const MAX_EDGE = 1600;

// ---------------------------------------------------------------------------------------------------------------
// Getting an image

/** Opens the camera (or the photo library) and returns the chosen images. */
export async function pickImages(source: 'camera' | 'library', multiple = false): Promise<Blob[]> {
  if (isNativeApp()) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    if (source === 'library' && multiple) {
      const res = await Camera.pickImages({ quality: 88, width: 2400, correctOrientation: true, limit: 12 });
      return Promise.all(res.photos.map(async (p) => (await fetch(p.webPath)).blob()));
    }
    const p = await Camera.getPhoto({
      quality: 88,
      width: 2400,
      correctOrientation: true,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    });
    return [await (await fetch(p.webPath!)).blob()];
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    };
    input.oncancel = () => {
      resolve([]);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return img;
  }
}

const dims = (im: ImageBitmap | HTMLImageElement) => ('naturalWidth' in im ? [im.naturalWidth, im.naturalHeight] : [im.width, im.height]);

/**
 * How sharp and how bright a photo is, measured on a small gray copy.
 * Sharpness is the variance of the Laplacian: edges make it large, blur flattens it.
 */
export function checkPixels(data: Uint8ClampedArray, w: number, h: number): PhotoCheck {
  const grey = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    grey[i] = v;
    sum += v;
  }
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  const sharpness = n > 1 ? m2 / (n - 1) : 0;
  const brightness = sum / (w * h) / 255;
  const verdict: PhotoCheck['verdict'] = brightness < 0.16 ? 'dark' : brightness > 0.9 ? 'bright' : sharpness < 45 ? 'blurry' : 'ok';
  return { sharpness: Math.round(sharpness), brightness: +brightness.toFixed(3), verdict };
}

function measure(im: CanvasImageSource, w: number, h: number): PhotoCheck {
  const scale = 360 / Math.max(w, h);
  const cw = Math.max(8, Math.round(w * scale));
  const ch = Math.max(8, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(im, 0, 0, cw, ch);
  return checkPixels(ctx.getImageData(0, 0, cw, ch).data, cw, ch);
}

/** Shrinks a new photo, checks it, and stores it. Returns the stored photo. */
export async function addPhoto(blob: Blob): Promise<Photo> {
  const im = await decode(blob);
  const [w0, h0] = dims(im);
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(im, 0, 0, w, h);
  const check = measure(c, w, h);
  const out = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.84));
  const photo: Photo = { id: uid(), width: w, height: h, takenAt: Date.now(), check, marks: [] };
  savePhoto(photo, out);
  return photo;
}

// ---------------------------------------------------------------------------------------------------------------
// Showing a photo

const urls = new Map<string, string>();
const loading = new Map<string, Promise<string | undefined>>();

export function photoSrc(p: Photo): string | undefined {
  if (p.src) return new URL(p.src, document.baseURI).href;
  return urls.get(p.id);
}

async function loadUrl(p: Photo): Promise<string | undefined> {
  if (p.src) return photoSrc(p);
  if (urls.has(p.id)) return urls.get(p.id);
  if (!loading.has(p.id)) {
    loading.set(
      p.id,
      photoBlob(p.id).then((b) => {
        if (!b) return undefined;
        const u = URL.createObjectURL(b);
        urls.set(p.id, u);
        return u;
      }),
    );
  }
  return loading.get(p.id);
}

/** The address of a photo's image, loading it from the device if needed. */
export function usePhotoUrl(p: Photo | undefined): string | undefined {
  const [, setTick] = useState(0);
  const now = p ? photoSrc(p) : undefined;
  useEffect(() => {
    if (!p || now) return;
    let live = true;
    void loadUrl(p).then(() => live && setTick((t) => t + 1));
    return () => {
      live = false;
    };
  }, [p, now]);
  return now;
}

export async function loadImage(p: Photo): Promise<HTMLImageElement> {
  const url = await loadUrl(p);
  if (!url) throw new Error('Photo missing');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
}

// ---------------------------------------------------------------------------------------------------------------
// Markup

export const MARK_COLORS = ['#FF3B30', '#FFCC00', '#34C759', '#0A84FF', '#FFFFFF'];

/** Draws marks onto a canvas the size of the photo. Line width follows the photo's size. */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], w: number, h: number) {
  const lw = Math.max(3, Math.round(Math.max(w, h) * 0.0065));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const m of marks) {
    const pts = m.points.map(([x, y]) => [x * w, y * h] as [number, number]);
    ctx.strokeStyle = m.color;
    ctx.fillStyle = m.color;
    ctx.lineWidth = lw;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = lw * 1.2;
    if (m.kind === 'pen' && pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      for (const p of pts.slice(1)) ctx.lineTo(...p);
      ctx.stroke();
    } else if (m.kind === 'circle' && pts.length > 1) {
      const [[x0, y0], [x1, y1]] = pts;
      ctx.beginPath();
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(4, Math.abs(x1 - x0) / 2), Math.max(4, Math.abs(y1 - y0) / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (m.kind === 'arrow' && pts.length > 1) {
      const [[x0, y0], [x1, y1]] = pts;
      const a = Math.atan2(y1 - y0, x1 - x0);
      const head = lw * 4.2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
      ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45));
      ctx.closePath();
      ctx.fill();
    } else if (m.kind === 'text' && m.text) {
      const size = Math.round(Math.max(w, h) * 0.032);
      ctx.font = `600 ${size}px "Public Sans Variable", "Public Sans", system-ui, sans-serif`;
      const tw = ctx.measureText(m.text).width;
      const [x, y] = pts[0];
      const pad = size * 0.4;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(12, 20, 38, 0.82)';
      roundRect(ctx, x, y - size - pad, tw + pad * 2, size + pad * 2, size * 0.35);
      ctx.fill();
      ctx.fillStyle = m.color;
      ctx.fillText(m.text, x + pad, y - pad * 0.25);
    }
    ctx.shadowBlur = 0;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The photo with its markup, as a JPEG, sized for a report or a share. */
export async function renderPhoto(p: Photo, maxEdge = 1400, quality = 0.82): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const img = await loadImage(p);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  drawMarks(ctx, p.marks, w, h);
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
}

export const photoById = (id: string | undefined) => (id ? getState().photos[id] : undefined);

export const CHECK_TEXT: Record<PhotoCheck['verdict'], string> = {
  ok: 'Sharp and well lit',
  blurry: 'Looks blurry. Hold steady and retake?',
  dark: 'Too dark. Turn on the lights or use the flash?',
  bright: 'Washed out. Step out of direct light?',
};
