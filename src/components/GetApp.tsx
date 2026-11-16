import { Download, Share, Smartphone, SquarePlus, X } from 'lucide-react';
import { useState } from 'react';

import { isNativeApp } from '../lib/util';
import { Sheet } from './ui';

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const isIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
const installed = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const APK = 'Walkthru.apk';

const dismissedKey = 'walkthru-install-dismissed';
const isDismissed = () => {
  try {
    return localStorage.getItem(dismissedKey) === '1';
  } catch {
    return false;
  }
};

function Steps() {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section>
        <h3 style={{ marginBottom: 6 }}>iPhone and iPad</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Open this page in Safari.</li>
          <li>
            Tap <Share style={{ width: 16, height: 16, verticalAlign: -3, color: '#0a7aff' }} /> Share.
          </li>
          <li>
            Tap <SquarePlus style={{ width: 16, height: 16, verticalAlign: -3, color: '#0a7aff' }} /> <b>Add to Home Screen</b>, then Add.
          </li>
        </ol>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Walkthru opens full screen from its own icon and keeps working without signal.
        </p>
      </section>
      {isIos ? null : (
        <section>
          <h3 style={{ marginBottom: 8 }}>Android</h3>
          <a className="btn primary" href={APK} download={APK}>
            <Download /> Download Walkthru.apk
          </a>
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Open the file on your phone and allow the install when asked.
          </p>
        </section>
      )}
    </div>
  );
}

/** "Get the app" on the website: Android gets the APK, iPhone gets Add to Home Screen. Hidden inside the installed app. */
export function GetApp({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(isDismissed);
  if (isNativeApp() || installed) return null;

  if (compact) {
    return (
      <>
        <button className="btn block" onClick={() => setOpen(true)}>
          <Smartphone /> Get the phone app
        </button>
        {open ? (
          <Sheet title="Get Walkthru on your phone" onClose={() => setOpen(false)}>
            <Steps />
          </Sheet>
        ) : null}
      </>
    );
  }
  if (hidden || (!isIos && !isAndroid)) return null;
  return (
    <>
      <div className="install">
        <Smartphone />
        <div className="t">
          <b>{isIos ? 'Install on your iPhone' : 'Get the Android app'}</b>
          {isIos ? 'Add Walkthru to your Home Screen' : 'Full screen, with the camera and offline storage'}
        </div>
        {isAndroid ? (
          <a className="btn sm" href={APK} download={APK}>
            <Download /> APK
          </a>
        ) : (
          <button className="btn sm" onClick={() => setOpen(true)}>
            How
          </button>
        )}
        <button
          className="icon-btn"
          aria-label="Dismiss"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(dismissedKey, '1');
            } catch {
              /* storage off */
            }
          }}
        >
          <X />
        </button>
      </div>
      {open ? (
        <Sheet title="Install Walkthru" onClose={() => setOpen(false)}>
          <Steps />
        </Sheet>
      ) : null}
    </>
  );
}
