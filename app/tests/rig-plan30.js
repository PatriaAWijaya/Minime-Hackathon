// Rig Rencana 30 Hari v207 (jsdom, test-only): membuktikan panel
// Rencana 30 Hari di Planner view + Tahap 0/1/2 Skenario 2:
//  1. Panel render (input niche/kompetitor/tanggal + 4 tombol).
//  2. Tombol Setujui nonaktif sebelum ada tabel.
//  3. Riset: model stub CARI -> BUKA -> LAPORAN -> laporan tampil.
//  4. Tabel: model stub 30 baris (12 image + 10 carousel + 8 reels)
//     -> 30 baris ter-render, tanggal baris 1 = tanggal mulai.
//  5. Setujui (Gerbang 1): badge disetujui + tombol Buat Tabel nonaktif.
// Jalankan: npm run rig:plan30 (butuh dist ter-build + jsdom).
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
const IMG_DAYS = [1, 2, 4, 5, 7, 9, 11, 13, 15, 17, 19, 21];
const CAR_DAYS = [3, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const REEL_DAYS = [23, 24, 25, 26, 27, 28, 29, 30];
const TABLE_LINES = [];
for (let d = 1; d <= 30; d++) {
  const fmt = IMG_DAYS.includes(d) ? 'image' : CAR_DAYS.includes(d) ? 'carousel' : 'reels';
  const hr = fmt === 'image' ? '09:00' : fmt === 'carousel' ? '12:00' : '19:00';
  TABLE_LINES.push(d + '|' + fmt + '|Topik ' + d + '|Hook ' + d + '|Pilar ' + d + '|' + hr);
}
const MODEL_REPLIES = [
  'CARI: kopi susu Surabaya',
  'BUKA: https://contoh.com/kopi-susu',
  'LAPORAN: Tren kopi susu Surabaya 2026 naik. Sumber: https://contoh.com/kopi-susu',
  TABLE_LINES.join('\n'),
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
const invokeCount = (part) => log.filter((l) => l.startsWith('invoke:') && l.includes(part)).length;
const btn = (act) => document.querySelector('#plan30-main [data-act="' + act + '"]');

try {
  await waitFor(() => typeof dom.window.showView === 'function', 'mount showView', 120);
  dom.window.showView('planner');
  await tick(200);
  check('v207: panel Rencana 30 Hari tampil di Planner view',
    !!document.getElementById('p30Niche') && !!btn('plan-research') && !!btn('plan-table') && !!btn('plan-approve') && !!btn('plan-new'));
  check('v207: Setujui nonaktif sebelum ada tabel', btn('plan-approve')?.disabled === true);

  // Riset: CARI -> BUKA -> LAPORAN.
  store.set('minime.metaKey', 'rig-key');
  document.getElementById('p30Niche').value = 'kopi susu Surabaya';
  document.getElementById('p30Comp').value = 'Kopi Kenangan, Janji Jiwa';
  document.getElementById('p30Start').value = '2026-11-10';
  btn('plan-research').click();
  await waitFor(() => (document.getElementById('p30Report')?.value || '').includes('Tren kopi susu'), 'laporan riset tampil', 200);
  const rep = document.getElementById('p30Report')?.value || '';
  check('v207: laporan riset berisi isi LAPORAN + URL sumber',
    rep.includes('Tren kopi susu Surabaya 2026 naik') && rep.includes('https://contoh.com/kopi-susu'), rep.slice(0, 120));
  check('v207: invoke research_search 1x + research_fetch 1x',
    invokeCount('research_search') === 1 && invokeCount('research_fetch') === 1,
    'search=' + invokeCount('research_search') + ' fetch=' + invokeCount('research_fetch'));

  // Tabel 30 baris.
  btn('plan-table').click();
  await waitFor(() => document.querySelectorAll('#p30Table tr').length === 31, 'tabel 30 baris tampil', 200);
  const rows = Array.from(document.querySelectorAll('#p30Table tr')).slice(1);
  const fmts = { image: 0, carousel: 0, reels: 0 };
  for (const r of rows) { const f = r.children[2]?.textContent || ''; if (fmts[f] !== undefined) fmts[f]++; }
  const firstDate = rows[0]?.children[1]?.textContent || '';
  const reelDate = rows[22]?.children[1]?.textContent || '';
  check('v207: campuran tepat 12 image + 10 carousel + 8 reels',
    fmts.image === 12 && fmts.carousel === 10 && fmts.reels === 8, JSON.stringify(fmts));
  check('v207: tanggal baris 1 = tanggal mulai, baris 23 = mulai+22 hari',
    firstDate === '2026-11-10' && reelDate === '2026-12-02', firstDate + ' / ' + reelDate);
  check('v207: Setujui aktif sesudah tabel dibuat', btn('plan-approve')?.disabled === false);
  check('v207: total 4 panggilan model (3 riset + 1 tabel)', modelCalls === 4, 'modelCalls=' + modelCalls);

  // Gerbang 1.
  btn('plan-approve').click();
  await tick(200);
  const cardTxt = document.getElementById('plan30-main')?.textContent || '';
  check('v207: Gerbang 1 lolos (badge disetujui + Buat Tabel nonaktif)',
    cardTxt.includes('Rencana disetujui') && btn('plan-table')?.disabled === true, cardTxt.slice(0, 160));
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-plan30 exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-PLAN30 ALL PASSED' : 'RIG-PLAN30 FAILED');
process.exit(failed === 0 ? 0 : 1);
