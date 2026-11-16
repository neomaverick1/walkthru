import { Building2, CalendarDays, FileText, Plus, Settings as Cog } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Logo, Toaster } from './components/ui';
import { GetApp } from './components/GetApp';
import { loadDemo } from './lib/demo';
import { back, go, useRoute } from './lib/router';
import { flush, getState, load, useStore } from './lib/store';
import { isNativeApp } from './lib/util';
import { CompareScreen } from './screens/Compare';
import { FinishScreen } from './screens/Finish';
import { InspectionScreen } from './screens/Inspection';
import { NewInspection } from './screens/NewInspection';
import { PropertiesScreen } from './screens/Properties';
import { PropertyScreen } from './screens/Property';
import { ReportScreen } from './screens/Report';
import { ReportsScreen } from './screens/Reports';
import { RoomScreen } from './screens/Room';
import { SettingsScreen } from './screens/Settings';
import { TodayScreen } from './screens/Today';

const TABS = [
  { path: '/', label: 'Today', icon: CalendarDays },
  { path: '/properties', label: 'Properties', icon: Building2 },
  { path: '/reports', label: 'Reports', icon: FileText },
  { path: '/settings', label: 'Settings', icon: Cog },
];

export default function App() {
  const ready = useStore((s) => s.ready);
  const { parts, q } = useRoute();
  const [newFor, setNewFor] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      await load();
      if (!getState().settings.seeded && !Object.keys(getState().properties).length) await loadDemo();
    })();
    const save = () => void flush();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    let off: (() => void) | undefined;
    if (isNativeApp()) {
      void import('@capacitor/app').then(({ App: CapApp }) => {
        const h1 = CapApp.addListener('backButton', () => {
          if (document.querySelector('.overlay, .viewer')) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return;
          }
          if (location.hash === '' || location.hash === '#/' || location.hash === '#') void CapApp.minimizeApp();
          else back('/');
        });
        const h2 = CapApp.addListener('pause', save);
        off = () => {
          void h1.then((h) => h.remove());
          void h2.then((h) => h.remove());
        };
      });
    }
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
      off?.();
    };
  }, []);

  // "New inspection" also opens from a link: #/new or #/new?property=id
  const routeNew = parts[0] === 'new' ? (q.get('property') ?? '') : null;
  const sheetFor = newFor ?? routeNew;

  if (!ready) return <div className="page" />;

  const top = '/' + (parts[0] ?? '');
  const focus = parts[0] === 'inspect' || parts[0] === 'report' || parts[0] === 'compare';
  let screen;
  switch (parts[0]) {
    case undefined:
    case 'new':
      screen = <TodayScreen onNew={(pid) => setNewFor(pid ?? '')} />;
      break;
    case 'properties':
      screen = <PropertiesScreen onNew={(pid) => setNewFor(pid ?? '')} />;
      break;
    case 'property':
      screen = <PropertyScreen id={parts[1]} onNew={(pid) => setNewFor(pid)} />;
      break;
    case 'inspect':
      screen = parts[2] === 'room' ? <RoomScreen id={parts[1]} roomId={parts[3]} /> : parts[2] === 'finish' ? <FinishScreen id={parts[1]} /> : <InspectionScreen id={parts[1]} />;
      break;
    case 'report':
      screen = <ReportScreen id={parts[1]} />;
      break;
    case 'compare':
      screen = <CompareScreen id={parts[1]} />;
      break;
    case 'reports':
      screen = <ReportsScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    default:
      screen = <TodayScreen onNew={(pid) => setNewFor(pid ?? '')} />;
  }

  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="#/">
          <Logo />
          Walkthru
        </a>
        <nav aria-label="Main">
          {TABS.map((t) => (
            <a key={t.path} href={`#${t.path}`} aria-current={(t.path === '/' ? top === '/' || top === '/new' : top === t.path || (t.path === '/properties' && top === '/property') || (t.path === '/reports' && top === '/report')) ? 'page' : undefined}>
              <t.icon />
              {t.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <button className="btn primary block" onClick={() => setNewFor('')}>
            <Plus /> New inspection
          </button>
          <GetApp compact />
        </div>
      </aside>
      <main className={`page${focus ? ' focus' : ''}`} key={parts.slice(0, 2).join('/')}>
        {screen}
      </main>
      {!focus ? (
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => (
            <a key={t.path} href={`#${t.path}`} aria-current={(t.path === '/' ? top === '/' : top === t.path || (t.path === '/properties' && top === '/property')) ? 'page' : undefined}>
              <t.icon />
              {t.label}
            </a>
          ))}
        </nav>
      ) : null}
      {sheetFor !== null ? (
        <NewInspection
          propertyId={sheetFor || undefined}
          onClose={() => {
            setNewFor(null);
            if (routeNew !== null) go('/', { replace: true });
          }}
        />
      ) : null}
      <Toaster />
    </div>
  );
}
