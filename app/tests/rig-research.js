// Rig Browser Riset Teks v206 (jsdom, test-only): membuktikan panel
// Riset Live di Search view + loop agen CARI / BUKA / LAPORAN —
// BUKAN mock logika bisnis:
//  1. Panel render di Search view.
//  2. Query kosong ditolak tanpa fetch.
//  3. Query terisi -> model stub berurutan: CARI, lalu BUKA, lalu
//     LAPORAN -> laporan tampil + log berisi CARI + BUKA + tanpa
//     catatan "tanpa membuka halaman" (grounded).
//  4. Invoke tercatat: research_search 1x, research_fetch 1x.
// Jalankan: npm run rig:research (butuh dist ter-build + jsdom).
// Keluar 0 bila semua lolos, 1 bila ada yang gagal.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dir, '..', 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const modMatch = html.match(/<script type="module"[^>]*src="([^"]+)"><\/script>/);
if (!modMatch) throw new Error('script module dist tidak ditemukan');
html = html.replace(modMatch[0], '').replace('</body>', `<script src="${modMatch[1]}"></script></body>`);

const log = [];
const store = new Map();
const MODEL_REPLIES = [
  'CARI: kopi susu Surabaya',
  'BUKA: https://contoh.com/kopi-susu',
  'LAPORAN: Tren kopi susu Surabaya 2026 naik. Sumber: https://contoh.com/kopi-susu',
];
let modelCalls = 0;

function makeResp({ ok = true, status = 200, jsonData = null } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: async () => jsonData,
    text: async () => (jsonData ? JSON.stringify(jsonData) : ''),
  };
}

async function invokeStub(cmd, args) {
  log.push('invoke:' + cmd);
  if (cmd === 'research_search') {
    return { results: [{ title: 'Kopi Susu Surabaya', url: 'https://contoh.com/kopi-susu', snippet: 'Tren naik' }] };
  }
  if (cmd === 'research_fetch') {
    return { url: (args && args.url) || '', title: 'Kopi Susu', text: 'Tren kopi susu Surabaya 2026 naik pesat.' };
  }
  if (cmd === 'open_external_url') return {};
  if (cmd === 'social_oauth_listen') return new Promise(() => {});
  if (cmd === 'social_meta_exchange') return '{"access_token":"rig-meta-tok","expires_in":3600}';
  if (cmd === 'social_meta_pages') return '{"data":[{"id":"rig-page-1","name":"Rig Page","access_token":"rig-page-tok"}]}';
  if (cmd === 'social_publish') return 'ok';
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url) {
  const u = String(url);
  log.push('fetch:' + u);
  // Urutan balasan model HANYA untuk panggilan model (api.meta.ai).
  // Panggilan mount lain (mis. VoiceStudio 127.0.0.1:3900) TIDAK BOLEH
  // menggeser urutan — insiden rig pertama: 8 fetch mount menggeser
  // counter global sehingga panggilan model pertama mendapat balasan
  // LAPORAN (ke-3) dan loop selesai tanpa browsing sama sekali.
  if (u.includes('api.meta.ai')) {
    const content = MODEL_REPLIES[Math.min(modelCalls, MODEL_REPLIES.length - 1)];
    modelCalls++;
    return makeResp({ jsonData: { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } } });
  }
  return makeResp({ jsonData: {} });
}

const dom = new JSDOM(html, {
  url: 'file://' + distDir + '/index.html',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__TAURI_INTERNALS__ = { invoke: invokeStub };
    window.fetch = fetchStub;
    window.URL.createObjectURL = () => 'blob:image-test';
    const ls = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
    Object.defineProperty(window, 'localStorage', { value: ls });
  },
});

const { document } = dom.window;
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await tick();
  }
  throw new Error('timeout: ' + label);
}

let failed = 0;
function check(name, ok, extra = '') {
  // eslint-disable-next-line no-console
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 300)));
  if (!ok) failed++;
}
const fetchCount = (part) => log.filter((l) => l.startsWith('fetch:') && l.includes(part)).length;
const invokeCount = (part) => log.filter((l) => l.startsWith('invoke:') && l.includes(part)).length;

try {
  await waitFor(() => typeof dom.window.showView === 'function', 'mount showView', 120);
  dom.window.showView('search');
  await tick(200);
  check('v206: panel Riset Live tampil di Search view', !!document.getElementById('rsQuery') && !!document.getElementById('rsRun'), document.getElementById('rsQuery') ? 'ok' : 'tidak ada rsQuery');

  // Query kosong ditolak tanpa fetch.
  document.getElementById('rsRun').click();
  await tick(200);
  check('v206: query kosong ditolak tanpa fetch', fetchCount('api.meta.ai') === 0 && (document.getElementById('rsStatus')?.textContent || '').length > 0, document.getElementById('rsStatus')?.textContent || '');

  // Riset penuh: CARI -> BUKA -> LAPORAN.
  store.set('minime.metaKey', 'rig-key');
  const qEl = document.getElementById('rsQuery');
  qEl.value = 'tren kopi susu Surabaya';
  qEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.getElementById('rsRun').click();
  await waitFor(() => (document.getElementById('rsReport')?.textContent || '').includes('Tren kopi susu'), 'laporan tampil', 200);
  const rep = document.getElementById('rsReport')?.textContent || '';
  const logTxt = document.getElementById('rsLog')?.textContent || '';
  check('v206: laporan berisi isi LAPORAN + URL sumber', rep.includes('Tren kopi susu Surabaya 2026 naik') && rep.includes('https://contoh.com/kopi-susu'), rep.slice(0, 120));
  check('v206: log berisi langkah CARI + BUKA', logTxt.includes('CARI kopi susu Surabaya') && logTxt.includes('BUKA https://contoh.com/kopi-susu'), logTxt.slice(0, 160));
  check('v206: laporan grounded (tanpa catatan tanpa-browsing)', !rep.includes('TANPA membuka halaman'), rep.slice(0, 120));
  check('v206: invoke research_search 1x + research_fetch 1x', invokeCount('research_search') === 1 && invokeCount('research_fetch') === 1, 'search=' + invokeCount('research_search') + ' fetch=' + invokeCount('research_fetch'));
  check('v206: 3 panggilan model (CARI, BUKA, LAPORAN)', modelCalls === 3, 'modelCalls=' + modelCalls);
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-research exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-RESEARCH ALL PASSED' : 'RIG-RESEARCH FAILED');
process.exit(failed === 0 ? 0 : 1);
