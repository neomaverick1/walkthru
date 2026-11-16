import { Camera, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Img } from '../components/Photo';
import { Sheet } from '../components/ui';
import { toast } from '../components/toast';
import { PROPERTY_KIND } from '../lib/labels';
import { addPhoto, pickImages } from '../lib/photos';
import { saveProperty } from '../lib/store';
import type { Contact, Property, PropertyKind } from '../lib/types';
import { uid } from '../lib/util';

export function PropertyEditor({ property, onClose, onSaved }: { property?: Property; onClose: () => void; onSaved: (id: string) => void }) {
  const [p, setP] = useState<Property>(
    () =>
      property ?? {
        id: uid(),
        name: '',
        street: '',
        city: '',
        state: 'WI',
        zip: '',
        kind: 'house',
        beds: 3,
        baths: 2,
        contacts: [],
        createdAt: Date.now(),
      },
  );
  const set = <K extends keyof Property>(k: K, v: Property[K]) => setP((x) => ({ ...x, [k]: v }));
  const setContact = (i: number, c: Partial<Contact>) => set('contacts', p.contacts.map((x, j) => (j === i ? { ...x, ...c } : x)));

  const pickCover = async (source: 'camera' | 'library') => {
    const [blob] = await pickImages(source);
    if (!blob) return;
    const photo = await addPhoto(blob);
    set('cover', photo.id);
  };

  const save = () => {
    if (!p.street.trim()) {
      toast('Add the street address');
      return;
    }
    const clean = { ...p, name: p.name.trim() || p.street.trim(), contacts: p.contacts.filter((c) => c.name.trim()) };
    saveProperty(clean);
    toast(property ? 'Property saved' : 'Property added');
    onSaved(clean.id);
  };

  return (
    <Sheet title={property ? 'Edit property' : 'Add a property'} onClose={onClose}>
      <div className="stack">
        <div className="row" style={{ alignItems: 'stretch' }}>
          <div style={{ width: 120, height: 86, borderRadius: 12, overflow: 'hidden', flex: 'none', background: 'var(--line-2)' }}>
            {p.cover ? <Img id={p.cover} className="cover-img" /> : null}
          </div>
          <div className="stack" style={{ gap: 8, flex: 1 }}>
            <button className="btn sm" onClick={() => void pickCover('camera')}>
              <Camera /> Take a cover photo
            </button>
            <button className="btn sm" onClick={() => void pickCover('library')}>
              <ImagePlus /> Choose from photos
            </button>
          </div>
        </div>
        <label className="field">
          <span>Name (optional)</span>
          <input className="input" placeholder="Lakeview Lodge" value={p.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          <span>Street address</span>
          <input className="input" autoComplete="street-address" placeholder="418 Maple Street" value={p.street} onChange={(e) => set('street', e.target.value)} />
        </label>
        <div className="grid2" style={{ gridTemplateColumns: '1.6fr 0.7fr 1fr' }}>
          <label className="field">
            <span>City</span>
            <input className="input" value={p.city} onChange={(e) => set('city', e.target.value)} />
          </label>
          <label className="field">
            <span>State</span>
            <input className="input" value={p.state} maxLength={2} onChange={(e) => set('state', e.target.value.toUpperCase())} />
          </label>
          <label className="field">
            <span>ZIP</span>
            <input className="input" inputMode="numeric" value={p.zip} onChange={(e) => set('zip', e.target.value)} />
          </label>
        </div>
        <div className="grid2" style={{ gridTemplateColumns: '1.4fr 0.8fr 0.8fr 1fr' }}>
          <label className="field">
            <span>Type</span>
            <select className="select" value={p.kind} onChange={(e) => set('kind', e.target.value as PropertyKind)}>
              {Object.entries(PROPERTY_KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Beds</span>
            <input className="input" type="number" min={0} max={12} value={p.beds} onChange={(e) => set('beds', Math.max(0, +e.target.value))} />
          </label>
          <label className="field">
            <span>Baths</span>
            <input className="input" type="number" min={0} max={10} step={0.5} value={p.baths} onChange={(e) => set('baths', Math.max(0, +e.target.value))} />
          </label>
          <label className="field">
            <span>Sq ft</span>
            <input className="input" type="number" min={0} value={p.sqft ?? ''} onChange={(e) => set('sqft', e.target.value ? +e.target.value : undefined)} />
          </label>
        </div>

        <div className="field">
          <span>People</span>
          {p.contacts.map((c, i) => (
            <div key={i} className="card pad stack" style={{ gap: 8 }}>
              <div className="row">
                <input className="input grow" placeholder="Name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                <select className="select" style={{ width: 140 }} value={c.role} onChange={(e) => setContact(i, { role: e.target.value })}>
                  {['Tenant', 'Owner', 'Host', 'Listing agent', 'Buyer', 'Seller', 'Property manager'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button className="icon-btn" aria-label="Remove person" onClick={() => set('contacts', p.contacts.filter((_, j) => j !== i))}>
                  <Trash2 />
                </button>
              </div>
              <div className="grid2">
                <input className="input" type="tel" placeholder="Phone" value={c.phone ?? ''} onChange={(e) => setContact(i, { phone: e.target.value })} />
                <input className="input" type="email" placeholder="Email" value={c.email ?? ''} onChange={(e) => setContact(i, { email: e.target.value })} />
              </div>
            </div>
          ))}
          <button className="btn sm" style={{ justifySelf: 'start' }} onClick={() => set('contacts', [...p.contacts, { name: '', role: 'Tenant' }])}>
            <Plus /> Add a person
          </button>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" placeholder="Lockbox code, parking, pets…" value={p.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <button className="btn primary block" onClick={save}>
          {property ? 'Save changes' : 'Add property'}
        </button>
      </div>
    </Sheet>
  );
}
