// A small hash router: #/property/abc, #/inspect/abc/room/def. Hash URLs work the same on the web and in the app.
import { useSyncExternalStore } from 'react';

const read = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
const query = () => new URLSearchParams(location.hash.split('?')[1] ?? '');

let depth = 0; // screens opened inside the app, so Back never leaves it
window.addEventListener('popstate', () => {
  depth = Math.max(0, depth - 1);
});

const subscribe = (l: () => void) => {
  window.addEventListener('hashchange', l);
  return () => window.removeEventListener('hashchange', l);
};

export function useRoute(): { path: string; parts: string[]; q: URLSearchParams } {
  useSyncExternalStore(subscribe, () => location.hash, () => '');
  const p = read();
  return { path: p, parts: p.split('/').filter(Boolean), q: query() };
}

export function go(path: string, opts: { replace?: boolean } = {}) {
  const url = `#${path}`;
  if (opts.replace) history.replaceState(null, '', url);
  else {
    history.pushState(null, '', url);
    depth++;
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.scrollTo({ top: 0 });
}

/** Goes back to the previous screen, or to a fallback when the app was opened on this one. */
export function back(fallback = '/') {
  if (depth > 0) history.back();
  else go(fallback, { replace: true });
}

export const canGoBack = () => depth > 0;
