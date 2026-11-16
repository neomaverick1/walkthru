// A quick Wi-Fi speed test: downloads a test file a few times and reports megabits per second.
import { isNativeApp } from './util';

const SITE = 'https://neomaverick1.github.io/walkthru/';

export async function speedTest(onProgress?: (mbps: number) => void): Promise<number> {
  const base = isNativeApp() ? SITE : document.baseURI;
  const results: number[] = [];
  for (let i = 0; i < 3; i++) {
    const url = new URL(`speedtest.bin?r=${Date.now()}-${i}`, base).href;
    const t0 = performance.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok || !res.body) throw new Error('The test file could not be downloaded.');
    const reader = res.body.getReader();
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      const secs = (performance.now() - t0) / 1000;
      if (secs > 0.05) onProgress?.((bytes * 8) / secs / 1e6);
    }
    const secs = (performance.now() - t0) / 1000;
    results.push((bytes * 8) / secs / 1e6);
  }
  results.sort((a, b) => a - b);
  return Math.round(results[results.length - 1] * 10) / 10;
}
