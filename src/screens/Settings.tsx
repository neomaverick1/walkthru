import { Download, ImagePlus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';

import { GetApp } from '../components/GetApp';
import { Sheet } from '../components/ui';
import { toast } from '../components/toast';
import { exportBackup, importBackup } from '../lib/backup';
import { loadDemo } from '../lib/demo';
import { pickImages } from '../lib/photos';
import { go } from '../lib/router';
import { DEFAULT_SETTINGS, replaceAll, saveSettings, useStore } from '../lib/store';

const ACCENTS = ['#1E46C8', '#0F6E5A', '#7A2E8E', '#B4531A', '#10203B'];
const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD'];

export function SettingsScreen() {
  const s = useStore((x) => x.settings);
  const counts = {
    p: useStore((x) => Object.keys(x.properties).length),
    i: useStore((x) => Object.keys(x.inspections).length),
    ph: useStore((x) => Object.keys(x.photos).length),
  };
  const [confirm, setConfirm] = useState<'demo' | 'erase' | null>(null);

  const logo = async () => {
    const [blob] = await pickImages('library');
    if (!blob) return;
    const img = await createImageBitmap(blob);
    const scale = Math.min(1, 360 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    saveSettings({ logo: c.toDataURL('image/png') });
    toast('Logo added to your reports');
  };

  const field = (key: 'company' | 'inspector' | 'license' | 'phone' | 'email', label: string, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input className="input" type={type} value={s[key]} onChange={(e) => saveSettings({ [key]: e.target.value })} />
    </label>
  );

  return (
    <>
      <div className="topbar">
        <div className="title">
          <h1>Settings</h1>
          <div className="sub">Your details appear on every report</div>
        </div>
      </div>
      <GetApp />
      <div className="two-col">
        <div className="stack" style={{ gap: 22 }}>
          <section className="card pad stack">
            <h2>Company and inspector</h2>
            {field('company', 'Company')}
            {field('inspector', 'Inspector name')}
            <div className="grid2">
              {field('license', 'License number')}
              {field('phone', 'Phone', 'tel')}
            </div>
            {field('email', 'Email', 'email')}
          </section>
          <section className="card pad stack">
            <h2>Report branding</h2>
            <div className="row">
              <div style={{ width: 120, height: 56, borderRadius: 10, border: '1px solid var(--line)', display: 'grid', placeItems: 'center', background: '#fff', overflow: 'hidden' }}>
                {s.logo ? <img src={s.logo} alt="Your logo" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span className="tiny faint">No logo</span>}
              </div>
              <button className="btn sm" onClick={() => void logo()}>
                <ImagePlus /> {s.logo ? 'Change logo' : 'Add logo'}
              </button>
              {s.logo ? (
                <button className="btn sm ghost" onClick={() => saveSettings({ logo: undefined })}>
                  Remove
                </button>
              ) : null}
            </div>
            <div className="field">
              <span>Accent color</span>
              <div className="swatches">
                {ACCENTS.map((c) => (
                  <button key={c} style={{ background: c }} aria-label={`Accent ${c}`} aria-pressed={s.accent.toUpperCase() === c} onClick={() => saveSettings({ accent: c })} />
                ))}
              </div>
            </div>
            <label className="field">
              <span>Currency</span>
              <select className="select" value={s.currency} onChange={(e) => saveSettings({ currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Disclaimer at the end of each report</span>
              <textarea className="textarea" value={s.disclaimer} onChange={(e) => saveSettings({ disclaimer: e.target.value })} />
            </label>
          </section>
        </div>
        <div className="stack" style={{ gap: 22 }}>
          <section className="card pad stack">
            <h2>Your data</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Everything stays on this device: {counts.p} properties, {counts.i} inspections and {counts.ph} photos. Nothing is uploaded.
            </p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() =>
                  void exportBackup().then((how) => {
                    if (how === 'downloaded') toast('Backup downloaded');
                  })
                }
              >
                <Download /> Back up
              </button>
              <button
                className="btn"
                onClick={() =>
                  void importBackup().then((ok) => {
                    if (ok) toast('Backup restored');
                  })
                }
              >
                <Upload /> Restore
              </button>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => setConfirm('demo')}>
                <RotateCcw /> Reload the demo
              </button>
              <button className="btn danger" onClick={() => setConfirm('erase')}>
                <Trash2 /> Erase everything
              </button>
            </div>
          </section>
          <section className="card pad stack">
            <h2>About</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Walkthru 1.0 · Property inspections for Android, iPhone and the web. Works without signal; reports are built on the device.
            </p>
            <p className="tiny faint" style={{ margin: 0 }}>
              Demo photos from Unsplash. Fonts: Archivo and Public Sans (SIL Open Font License).
            </p>
          </section>
        </div>
      </div>

      {confirm ? (
        <Sheet title={confirm === 'demo' ? 'Reload the demo?' : 'Erase everything?'} onClose={() => setConfirm(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {confirm === 'demo' ? 'Your properties, inspections and photos are replaced with the sample homes.' : 'All properties, inspections and photos are deleted from this device. Make a backup first if you need them.'} This can’t be undone.
          </p>
          <div className="row">
            <button className="btn grow" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn grow danger"
              onClick={() => {
                void (async () => {
                  if (confirm === 'demo') await loadDemo();
                  else await replaceAll({ properties: {}, inspections: {}, photos: {}, settings: { ...DEFAULT_SETTINGS, ...s, seeded: Date.now() } });
                  setConfirm(null);
                  toast(confirm === 'demo' ? 'Demo reloaded' : 'Everything erased');
                  go('/', { replace: true });
                })();
              }}
            >
              {confirm === 'demo' ? 'Reload demo' : 'Erase'}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
