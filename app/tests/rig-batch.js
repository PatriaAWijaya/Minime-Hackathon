// Rig Batch Konten (jsdom, test-only): membuktikan flow batch —
// BUKAN mock logika bisnis:
//  1. Form batch render + topik kosong ditolak jujur tanpa fetch.
//  2. Buat Skrip (2 hari, via fetch stub bentuk chat-completions
//     Meta) -> 2 baris skrip ter-parse (TITLE/CONCEPT/VISUAL).
//  3. Approve -> generate 2 kartu x 3 visual (fetch stub bentuk
//     images Meta) -> kartu ready + spend tercatat 6 gambar.
//  4. Pilih visual -> status terpilih; revisi Canva (file input)
//     -> pilihan ke-4 otomatis terpilih.
//  5. Jadwal native (double-confirm, antrean penjadwal native) ->
//     kedua kartu scheduled + nativeIds + 2 item antrean LinkedIn.
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
  throw new Error('unexpected invoke ' + cmd);
}


async function fetchStub(url) {
  const u = String(url);
  log.push('fetch:' + u);
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

  // 5. Jadwal native: double-confirm -> kedua kartu masuk antrean
  // penjadwal native (1 kanal terhubung = LinkedIn) + nativeIds.
  store.set('minime.social', JSON.stringify({ linkedin: { accessToken: 'rig-token', expiresAt: Date.now() + 3600000 } }));
  document.getElementById('batch-schedule').click();
  await tick(100);
  check('klik pertama = arm (konfirmasi)', (document.getElementById('batch-schedule')?.textContent || '').includes('Konfirmasi'));
  check('saat armed: picker kanal native tampil', !!document.querySelector('.batch-tgt[value="linkedin"]'));
  document.getElementById('batch-schedule').click();
  await waitFor(() => batch().cards.every((c) => c.status === 'scheduled'), 'kartu scheduled', 200);
  const q = JSON.parse(store.get('minime.socialQueue') || '[]');
  check('kedua kartu scheduled + nativeIds', batch().cards.every((c) => c.status === 'scheduled' && c.nativeIds.length === 1), JSON.stringify(batch().cards.map((c) => c.nativeIds)));
  check('2 item antrean native (LinkedIn, file gambar pertama)', q.length === 2 && q.every((it) => it.platform === 'linkedin' && it.imageFile && it.status === 'queued'), JSON.stringify(q.map((it) => it.platform + ':' + it.imageFile)));
  check('tanpa panggilan Postiz', invokeCount('postiz_request') === 0, 'postiz_request=' + invokeCount('postiz_request'));

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

  // 7. Planner native v68: dua panel — sidebar 8 kanal (ikon +
  // status, klik = kartu koneksi) + window utama HANYA kalender
  // kartu (tombol + = jadwal via dialog, chip = judul + ikon kanal,
  // tombol − = hapus item). Composer + daftar antrean lama dihapus.
  dom.window.showView('planner');
  dom.window.renderPlanner();
  await tick(200);
  check('planner dua panel tampil: sidebar 8 kanal + kalender kartu', !!document.getElementById('nativePlanner') && document.querySelectorAll('[data-soc-side]').length === 8 && !!document.querySelector('.soc-cal-grid'), '');
  check('tanpa pilih kanal: kartu koneksi belum muncul + composer/queue lama hilang', !document.querySelector('.soc-side-detail .soc-card') && !document.getElementById('socText') && !document.querySelector('.soc-queue'), '');
  check('setiap kartu tanggal punya tombol +', document.querySelectorAll('[data-soc-add]').length > 0, document.querySelectorAll('[data-soc-add]').length);
  // Pilih kanal X (belum terhubung) -> tombol Hubungkan muncul;
  // pilih LinkedIn (terhubung, dari seksi 5) -> tombol Putuskan.
  document.querySelector('[data-soc-side="x"]').click();
  await tick(100);
  check('klik kanal X -> kartu koneksi X muncul', !!document.getElementById('socConn-x'), '');
  document.querySelector('[data-soc-side="linkedin"]').click();
  await tick(100);
  check('klik kanal LinkedIn -> tombol Putuskan muncul', !!document.getElementById('socDisc-linkedin'), '');
  // YouTube tanpa tombol hubung (can: false).
  document.querySelector('[data-soc-side="youtube"]').click();
  await tick(100);
  check('kanal YouTube tanpa tombol hubung', !document.getElementById('socConn-youtube'), '');
  // Ikon kanal v69: logo asli untuk 6 kanal berkas, monogram untuk
  // Threads (berkas kiriman kosong) + X (belum dikirim).
  const sideImg = (id) => document.querySelector('[data-soc-side="' + id + '"] img')?.getAttribute('src') || '';
  check('logo asli FB/FB Page/IG/LinkedIn/TikTok/YouTube di sidebar', ['facebook', 'facebook_page', 'instagram', 'linkedin', 'tiktok', 'youtube'].every((id) => sideImg(id).includes('-icon.png')), ['facebook', 'facebook_page', 'instagram', 'linkedin', 'tiktok', 'youtube'].map(sideImg).join(','));
  check('Threads + X masih monogram', (document.querySelector('[data-soc-side="threads"] .soc-mono')?.textContent || '') === 'TH' && (document.querySelector('[data-soc-side="x"] .soc-mono')?.textContent || '') === 'X', '');
  // Klik hari kalender (bukan hari ini, supaya tidak bercampur item
  // Batch hari ini) -> dialog tanggal terbuka.
  const today = new Date();
  const todayKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  const dayCell = [...document.querySelectorAll('.soc-cal-day[data-day]')].find((c) => c.getAttribute('data-day') !== todayKey);
  dayCell.click();
  await tick(100);
  check('klik hari -> dialog tanggal terbuka', !!document.getElementById('socDayText') && !!document.getElementById('socDayScheduleBtn'), '');
  document.getElementById('socDayText').value = 'jadwal hari uji';
  document.getElementById('socDayScheduleBtn').click();
  await tick(100);
  const q2 = JSON.parse(store.get('minime.socialQueue') || '[]');
  check('jadwal via dialog tanggal masuk antrean', q2.some((it) => it.text === 'jadwal hari uji'), JSON.stringify(q2.map((it) => it.text)));
  check('item tampil di kartu sebagai chip judul + tombol −', [...document.querySelectorAll('.soc-item-title')].some((el) => el.textContent.includes('jadwal hari uji')) && !!document.querySelector('[data-soc-del]'), '');
  // Hapus via − di chip item itu (bukan via dialog, bukan item lain).
  const chipDel = [...document.querySelectorAll('.soc-item')].find((el) => el.textContent.includes('jadwal hari uji'))?.querySelector('[data-soc-del]');
  check('chip item punya tombol −', !!chipDel, '');
  chipDel.click();
  await tick(100);
  const q3 = JSON.parse(store.get('minime.socialQueue') || '[]');
  check('hapus via − kartu menghilangkan item', !q3.some((it) => it.text === 'jadwal hari uji'), JSON.stringify(q3.map((it) => it.text)));

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-batch exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-BATCH ALL PASSED' : 'RIG-BATCH FAILED');
process.exit(failed === 0 ? 0 : 1);
