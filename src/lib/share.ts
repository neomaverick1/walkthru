// Saving and sharing files: the phone's share sheet in the app, a download on the web.
import { isNativeApp } from './util';

function base64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** Shares a file from the app (mail, Drive, Messages…) or downloads it on the web. */
export async function shareFile(bytes: Uint8Array, name: string, mime: string, title: string): Promise<'shared' | 'downloaded'> {
  if (isNativeApp()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: name, data: base64(bytes), directory: Directory.Cache });
    await Share.share({ title, files: [res.uri], dialogTitle: title });
    return 'shared';
  }
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = new File([blob], name, { type: mime });
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch {
      /* fall back to a download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}

/** A calendar file for a scheduled inspection, so it lands in the phone's calendar. */
export function icsFile(o: { title: string; start: number; minutes: number; location: string; description: string; uid: string }): Uint8Array {
  const f = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Walkthru//Inspections//EN',
    'BEGIN:VEVENT',
    `UID:${o.uid}@walkthru`,
    `DTSTAMP:${f(Date.now())}`,
    `DTSTART:${f(o.start)}`,
    `DTEND:${f(o.start + o.minutes * 60_000)}`,
    `SUMMARY:${esc(o.title)}`,
    `LOCATION:${esc(o.location)}`,
    `DESCRIPTION:${esc(o.description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(o.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
}

export const mapsLink = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
