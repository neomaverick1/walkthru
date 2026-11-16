// App state kept in memory and saved to IndexedDB on the device. Nothing leaves the phone.
import { openDB, type IDBPDatabase } from 'idb';
import { useSyncExternalStore } from 'react';

import type { Inspection, Photo, Property, Settings } from './types';

export interface State {
  ready: boolean;
  properties: Record<string, Property>;
  inspections: Record<string, Inspection>;
  photos: Record<string, Photo>;
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  company: 'Northwoods Property Group',
  inspector: 'Jordan Ellis',
  license: 'WI-PM 48213',
  phone: '(608) 555-0142',
  email: 'inspections@northwoods.example',
  accent: '#1E46C8',
  currency: 'USD',
  disclaimer:
    'This report records the visible condition of the property on the date of the inspection. It is not a structural, code-compliance or pest inspection, and it does not cover areas that were inaccessible or hidden.',
};

let state: State = { ready: false, properties: {}, inspections: {}, photos: {}, settings: DEFAULT_SETTINGS };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getState = () => state;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Reads part of the state; the component re-renders when that part changes. */
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(state),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// IndexedDB

type Store = 'properties' | 'inspections' | 'photos' | 'blobs' | 'meta';
let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('walkthru', 1, {
    upgrade(d) {
      for (const s of ['properties', 'inspections', 'photos', 'blobs', 'meta']) d.createObjectStore(s);
    },
  });
  return dbp;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();
function persist(store: Store, key: string, value: unknown) {
  const k = `${store}:${key}`;
  clearTimeout(pending.get(k));
  pending.set(
    k,
    setTimeout(() => {
      pending.delete(k);
      void db().then(async (d) => {
        if (value === undefined) await d.delete(store, key);
        else await d.put(store, value, key);
      });
    }, 250),
  );
}

/** Writes anything still waiting, e.g. before the app goes to the background. */
export async function flush() {
  const keys = [...pending.keys()];
  for (const k of keys) {
    clearTimeout(pending.get(k));
    pending.delete(k);
    const [store, key] = k.split(/:(.*)/) as [Store, string];
    const value = store === 'properties' ? state.properties[key] : store === 'inspections' ? state.inspections[key] : store === 'photos' ? state.photos[key] : undefined;
    const d = await db();
    if (value === undefined) await d.delete(store, key);
    else await d.put(store, value, key);
  }
}

export async function load() {
  const d = await db();
  const [props, insp, photos, settings] = await Promise.all([d.getAll('properties'), d.getAll('inspections'), d.getAll('photos'), d.get('meta', 'settings')]);
  state = {
    ready: true,
    properties: Object.fromEntries((props as Property[]).map((p) => [p.id, p])),
    inspections: Object.fromEntries((insp as Inspection[]).map((x) => [x.id, x])),
    photos: Object.fromEntries((photos as Photo[]).map((p) => [p.id, p])),
    settings: { ...DEFAULT_SETTINGS, ...(settings as Settings | undefined) },
  };
  emit();
}

// ---------------------------------------------------------------------------------------------------------------
// Changes

export function saveProperty(p: Property) {
  state = { ...state, properties: { ...state.properties, [p.id]: p } };
  persist('properties', p.id, p);
  emit();
}

export function deleteProperty(id: string) {
  const properties = { ...state.properties };
  delete properties[id];
  state = { ...state, properties };
  persist('properties', id, undefined);
  for (const x of Object.values(state.inspections)) if (x.propertyId === id) deleteInspection(x.id);
  emit();
}

export function saveInspection(x: Inspection) {
  const next = { ...x, updatedAt: Date.now() };
  state = { ...state, inspections: { ...state.inspections, [x.id]: next } };
  persist('inspections', x.id, next);
  emit();
}

/** Changes an inspection through a copy, so screens showing the old one re-render. */
export function updateInspection(id: string, change: (x: Inspection) => void) {
  const cur = state.inspections[id];
  if (!cur) return;
  const copy = structuredClone(cur);
  change(copy);
  saveInspection(copy);
}

export function deleteInspection(id: string) {
  const inspections = { ...state.inspections };
  delete inspections[id];
  state = { ...state, inspections };
  persist('inspections', id, undefined);
  emit();
}

export function savePhoto(p: Photo, blob?: Blob) {
  state = { ...state, photos: { ...state.photos, [p.id]: p } };
  persist('photos', p.id, p);
  if (blob) void db().then((d) => d.put('blobs', blob, p.id));
  emit();
}

export function deletePhoto(id: string) {
  const photos = { ...state.photos };
  delete photos[id];
  state = { ...state, photos };
  persist('photos', id, undefined);
  void db().then((d) => d.delete('blobs', id));
  emit();
}

export async function photoBlob(id: string): Promise<Blob | undefined> {
  return (await db()).get('blobs', id);
}

export function saveSettings(s: Partial<Settings>) {
  state = { ...state, settings: { ...state.settings, ...s } };
  void db().then((d) => d.put('meta', state.settings, 'settings'));
  emit();
}

/** Replaces everything at once (demo reset, backup restore). */
export async function replaceAll(next: Omit<State, 'ready'>, blobs: Record<string, Blob> = {}) {
  const d = await db();
  const tx = d.transaction(['properties', 'inspections', 'photos', 'blobs', 'meta'], 'readwrite');
  await Promise.all(['properties', 'inspections', 'photos', 'blobs'].map((s) => tx.objectStore(s).clear()));
  for (const p of Object.values(next.properties)) await tx.objectStore('properties').put(p, p.id);
  for (const x of Object.values(next.inspections)) await tx.objectStore('inspections').put(x, x.id);
  for (const p of Object.values(next.photos)) await tx.objectStore('photos').put(p, p.id);
  for (const [id, b] of Object.entries(blobs)) await tx.objectStore('blobs').put(b, id);
  await tx.objectStore('meta').put(next.settings, 'settings');
  await tx.done;
  state = { ready: true, ...next };
  emit();
}
