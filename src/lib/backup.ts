// Backups: everything in one JSON file, photos included, so a phone can be moved or reset.
import { photoBlob, getState, replaceAll } from './store';
import { shareFile } from './share';

interface Backup {
  app: 'walkthru';
  version: 1;
  exportedAt: number;
  state: Omit<ReturnType<typeof getState>, 'ready'>;
  blobs: Record<string, string>; // photo id → data URL
}

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

export async function exportBackup() {
  const { ready: _ready, ...state } = getState();
  void _ready;
  const blobs: Record<string, string> = {};
  for (const p of Object.values(state.photos)) {
    if (p.src) continue;
    const b = await photoBlob(p.id);
    if (b) blobs[p.id] = await toDataUrl(b);
  }
  const data: Backup = { app: 'walkthru', version: 1, exportedAt: Date.now(), state, blobs };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const d = new Date();
  return shareFile(bytes, `walkthru-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`, 'application/json', 'Walkthru backup');
}

export function importBackup(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(false);
      try {
        const data = JSON.parse(await f.text()) as Backup;
        if (data.app !== 'walkthru') throw new Error('Not a Walkthru backup');
        const blobs: Record<string, Blob> = {};
        for (const [id, url] of Object.entries(data.blobs)) blobs[id] = await (await fetch(url)).blob();
        await replaceAll(data.state, blobs);
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    input.click();
  });
}
