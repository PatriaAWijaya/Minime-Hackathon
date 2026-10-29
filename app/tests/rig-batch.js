// Rig Batch Konten (jsdom, test-only): membuktikan flow batch —
// BUKAN mock logika bisnis:
//  1. Form batch render + topik kosong ditolak jujur tanpa fetch.
//  2. Buat Skrip (2 hari, via fetch stub bentuk chat-completions
//     Meta) -> 2 baris skrip ter-parse (TITLE/CONCEPT/VISUAL).
//  3. Approve -> generate 2 kartu x 3 visual (fetch stub bentuk
//     images Meta) -> kartu ready + spend tercatat 6 gambar.
//  4. Pilih visual -> status terpilih; revisi Canva (file input)
//     -> pilihan ke-4 otomatis terpilih.
//  5. Jadwal Postiz (double-confirm, invoke stub postiz_request) ->
//     kedua kartu scheduled + postizId tercatat.
//  6. Batch carousel 1 hari -> pilihan berisi 3 file (loop slide).
// Jalankan: npm run rig:batch (butuh dist ter-build + jsdom devDependency).
// Keluar 0 bila semua lolos, 1 bila ada yang gagal.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dir, '..', 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const modMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!modMatch) throw new Error('script module dist tidak ditemukan');
html = html.replace(modMatch[0], '').replace('</body>', `<script src="${modMatch[1]}"></script></body>`);

const log = [];
const store = new Map();
const imgFiles = new Map();
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SCRIPT_TEXT = 'TITLE: Kopi Pagi\nCONCEPT: Es kopi susu segar untuk memulai hari.\nVISUAL: A minimalist product photo of iced milk coffee, no text';

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
  const req = (args && args.req) || {};
  if (cmd === 'postiz_install') {
    if (installMode === 'need_docker') return { status: 'need_docker', detail: '' };
    postizUp = true;
    return { status: 'ok', detail: '' };
  }
  if (cmd === 'open_docker_desktop') return { ok: true };
  if (cmd === 'image_save') {
    imgFiles.set(req.name, req.b64);
    return { file: req.name, bytes: req.b64 ? req.b64.length : 0 };
  }
  if (cmd === 'image_read') {
    if (!imgFiles.has(req.name)) throw new Error('file tidak ditemukan');
    return { file: req.name, b64: imgFiles.get(req.name), bytes: imgFiles.get(req.name).length };
  }
  if (cmd === 'image_delete') {
    imgFiles.delete(req.name);
    return { file: req.name, deleted: true };
  }
  if (cmd === 'postiz_request') {
    if (req.op === 'upload') return { status: 201, body: JSON.stringify({ id: 'up1', path: 'https://uploads.postiz.com/x.webp' }) };
    if (req.op === 'post') return { status: 201, body: JSON.stringify({ id: 'post1' }) };
    if (req.op === 'ping') {
      if (req.key === 'bad-key') return { status: 401, body: JSON.stringify({ msg: 'Invalid API key' }) };
      if (req.key === 'empty-key') return { status: 200, body: '[]' };
      return { status: 200, body: JSON.stringify([{ id: 'ig1' }]) };
    }
    throw new Error('unexpected postiz op ' + req.op);
  }
  throw new Error('unexpected invoke ' + cmd);
}

let postizUp = false;
let installMode = 'ok';

async function fetchStub(url) {
  const u = String(url);
  log.push('fetch:' + u);
  if (u.includes('4007')) {
    if (!postizUp) throw new Error('postiz down');
    return makeResp({});
  }
  if (u.includes('images/generations')) {
    return makeResp({ jsonData: { created: 1793000000, data: [{ b64_json: PNG_1X1 }], output_format: 'webp', usage: {} } });
  }
  // Chat completions (router): bentuk Meta yang sudah terbukti rig-chat.
  return makeResp({ jsonData: { choices: [{ message: { content: SCRIPT_TEXT } }], usage: { prompt_tokens: 10, completion_tokens: 20 } } });
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
const batch = () => JSON.parse(store.get('minime.batch') || '{}');
const fetchCount = (part) => log.filter((l) => l.startsWith('fetch:') && l.includes(part)).length;
const invokeCount = (part) => log.filter((l) => l.startsWith('invoke:') && l.includes(part)).length;

try {
  await tick(500);
  dom.window.showView('media');
  dom.window.mediaTab('batch');
  await tick(100);

  // 1. Form render + topik kosong ditolak tanpa fetch.
  check('form Batch render', !!document.getElementById('batch-topic') && !!document.getElementById('batch-make'));
  document.getElementById('batch-make').click();
  await tick(100);
  check('topik kosong ditolak tanpa fetch', fetchCount('api.meta.ai') === 0 && (document.getElementById('batch-note')?.textContent || '').length > 0);

  // 2. Buat Skrip 2 hari.
  store.set('minime.metaKey', 'rig-key');
  const topic = document.getElementById('batch-topic');
  topic.value = 'promo es kopi susu';
  topic.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const days = document.getElementById('batch-days');
  days.value = '2';
  days.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.getElementById('batch-make').click();
  await waitFor(() => document.querySelectorAll('[data-script]').length === 2, '2 skrip tampil', 200);
  check('2 skrip tampil', document.querySelectorAll('[data-script]').length === 2);
  check('skrip ter-parse (judul + konsep)', batch().scripts[0].title === 'Kopi Pagi' && batch().scripts[0].concept.includes('Es kopi susu'), JSON.stringify(batch().scripts[0]));
  check('prompt visual ter-parse', batch().scripts[0].visual.includes('iced milk coffee'), batch().scripts[0].visual);

  // 3. Approve -> 2 kartu x 3 visual ready + spend 6.
  document.getElementById('batch-approve').click();
  await waitFor(() => batch().cards.length === 2 && batch().cards.every((c) => c.status === 'ready'), 'kartu ready', 200);
  check('2 kartu ready', batch().cards.every((c) => c.status === 'ready'), JSON.stringify(batch().cards.map((c) => c.status)));
  check('tiap kartu 3 pilihan', batch().cards.every((c) => c.choices.length === 3 && c.choices.every((ch) => ch.files.length === 1)), JSON.stringify(batch().cards.map((c) => c.choices.map((ch) => ch.files.length))));
  const spend = JSON.parse(store.get('minime.imageSpend') || '{}');
  check('spend tercatat 6 gambar', spend.images === 6, JSON.stringify(spend));

  // 4. Pilih visual + revisi Canva.
  document.querySelector('[data-choice="0-1"]').click();
  await tick(100);
  check('pilih visual tercatat', batch().cards[0].selected === 1, JSON.stringify(batch().cards[0].selected));
  const revFile = new dom.window.File([Buffer.from(PNG_1X1, 'base64')], 'canva.png', { type: 'image/png' });
  const revInput = document.querySelector('[data-canvafile="0"]');
  Object.defineProperty(revInput, 'files', { value: [revFile], configurable: true });
  document.querySelector('[data-canvaup="0"]').click();
  await waitFor(() => batch().cards[0].choices.length === 4, 'revisi Canva masuk', 200);
  check('revisi Canva jadi pilihan ke-4 + terpilih', batch().cards[0].choices.length === 4 && batch().cards[0].selected === 3, JSON.stringify(batch().cards[0].choices.length) + '/' + batch().cards[0].selected);

  // 5. Jadwal Postiz: double-confirm -> kedua kartu scheduled.
  store.set('minime.postizKey', 'rig-postiz-key');
  document.getElementById('batch-schedule').click();
  await tick(100);
  check('klik pertama = arm (konfirmasi)', (document.getElementById('batch-schedule')?.textContent || '').includes('Konfirmasi'));
  document.getElementById('batch-schedule').click();
  await waitFor(() => batch().cards.every((c) => c.status === 'scheduled'), 'kartu scheduled', 200);
  check('kedua kartu scheduled + postizId', batch().cards.every((c) => c.status === 'scheduled' && c.postizId === 'post1'), JSON.stringify(batch().cards.map((c) => c.postizId)));
  check('upload + posts dipanggil via Rust', invokeCount('postiz_request') === 4, 'postiz_request=' + invokeCount('postiz_request'));

  // 6. Batch carousel 1 hari -> pilihan berisi 3 file.
  document.getElementById('batch-new').click();
  await tick(100);
  check('batch baru kembali ke form (topik dipertahankan)', !!document.getElementById('batch-topic') && document.getElementById('batch-topic').value === 'promo es kopi susu');
  const carouselRadio = document.querySelector('input[name="batch-kind"][value="carousel"]');
  carouselRadio.checked = true;
  carouselRadio.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const days2 = document.getElementById('batch-days');
  days2.value = '1';
  days2.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.getElementById('batch-make').click();
  await waitFor(() => document.querySelectorAll('[data-script]').length === 1, '1 skrip carousel', 200);
  document.getElementById('batch-approve').click();
  await waitFor(() => batch().cards.length === 1 && batch().cards[0].status === 'ready', 'kartu carousel ready', 200);
  check('pilihan carousel berisi 3 file', batch().cards[0].choices.every((ch) => ch.files.length === 3), JSON.stringify(batch().cards[0].choices.map((ch) => ch.files.length)));

  // 7. Wizard Setup Postiz: instalasi satu klik + uji koneksi via ping (Rust).
  dom.window.showView('planner');
  dom.window.renderPlanner();
  await tick(200);
  const setupText = () => document.getElementById('postizSetup')?.textContent || '';
  check('wizard Setup tampil', !!document.getElementById('postizSetup') && setupText().includes('Setup Postiz'), setupText());
  check('tombol Pasang tampil saat Postiz offline', !!document.getElementById('postizSetupInstallBtn'), setupText());
  document.getElementById('postizSetupInstallBtn').click();
  await waitFor(() => !!document.querySelector('#postizSetup .setup-step .badge.b-ok'), 'langkah 1 centang sesudah instalasi', 200);
  check('instalasi satu klik -> langkah 1 centang', invokeCount('postiz_install') === 1, 'postiz_install=' + invokeCount('postiz_install'));
  const pingBefore = invokeCount('postiz_request');
  store.set('minime.postizKey', 'rig-postiz-key');
  document.getElementById('postizSetupTestBtn').click();
  await waitFor(() => setupText().includes('Postiz siap'), 'wizard siap sesudah uji ok', 200);
  check('uji ok (1 channel) -> wizard siap', setupText().includes('Postiz siap') && setupText().includes('Setup ulang'), setupText());
  document.getElementById('postizSetupResetBtn').click();
  await tick(100);
  store.set('minime.postizKey', 'bad-key');
  document.getElementById('postizSetupTestBtn').click();
  await waitFor(() => setupText().includes('ditolak'), 'uji badkey', 200);
  check('uji badkey ditolak + wizard belum siap', setupText().includes('ditolak') && !setupText().includes('Postiz siap'), setupText());
  store.set('minime.postizKey', 'empty-key');
  document.getElementById('postizSetupTestBtn').click();
  await waitFor(() => setupText().includes('belum ada channel'), 'uji nochannel', 200);
  check('uji nochannel + tombol konfirmasi tampil', setupText().includes('belum ada channel') && !!document.getElementById('postizSetupConfirmBtn'), setupText());
  document.getElementById('postizSetupConfirmBtn').click();
  await tick(100);
  check('konfirmasi manual channel -> wizard siap', setupText().includes('Postiz siap'), setupText());
  check('ping dipanggil 3x via Rust', invokeCount('postiz_request') === pingBefore + 3, 'postiz_request=' + invokeCount('postiz_request'));

  // 8. Instalasi need_docker: pesan + tombol Docker.
  postizUp = false;
  installMode = 'need_docker';
  document.getElementById('postizSetupResetBtn').click();
  await tick(200);
  check('tombol Pasang tampil lagi sesudah reset', !!document.getElementById('postizSetupInstallBtn'), setupText());
  document.getElementById('postizSetupInstallBtn').click();
  await waitFor(() => setupText().includes('belum berjalan'), 'pesan need_docker', 200);
  check('need_docker -> pesan + tombol Docker', setupText().includes('belum berjalan') && !!document.getElementById('postizSetupDockerBtn'), setupText());
  check('instalasi dipanggil 2x total', invokeCount('postiz_install') === 2, 'postiz_install=' + invokeCount('postiz_install'));
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-batch exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-BATCH ALL PASSED' : 'RIG-BATCH FAILED');
process.exit(failed === 0 ? 0 : 1);
