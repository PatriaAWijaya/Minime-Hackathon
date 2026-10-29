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
  if (cmd === 'open_external_url') {
    globalThis.__lastOAuthUrl = (args && args.url) || '';
    return {};
  }
  if (cmd === 'social_oauth_listen') {
    return new Promise(() => {});
  }
  if (cmd === 'social_publish') {
    return 'ok';
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

  // 7. Planner gaya Postiz v72: sidebar = tombol Tambah Channel +
  // Buat Postingan + HANYA baris channel terhubung (avatar + nama
  // akun + badge platform); kalender kartu tetap di window utama.
  dom.window.showView('planner');
  dom.window.renderPlanner();
  await tick(200);
  check('planner tampil: sidebar + kalender kartu', !!document.getElementById('nativePlanner') && !!document.querySelector('.soc-cal-grid'), '');
  check('tombol Tambah Channel + Buat Postingan di sidebar', !!document.getElementById('socAddChannel') && !!document.getElementById('socCreatePost'), '');
  check('sidebar hanya baris terhubung (LinkedIn dari seksi 5)', document.querySelectorAll('[data-soc-side]').length === 1 && !!document.querySelector('[data-soc-side="linkedin"]'), document.querySelectorAll('[data-soc-side]').length);
  check('baris LinkedIn pakai logo asli + nama fallback', (document.querySelector('[data-soc-side="linkedin"] img')?.getAttribute('src') || '').includes('linkedin-icon.png') && (document.querySelector('[data-soc-side="linkedin"]')?.textContent || '').includes('LinkedIn'), '');
  check('tanpa pilih kanal: detail hanya petunjuk, bukan kartu koneksi', !document.querySelector('.soc-side-detail .soc-card'), '');
  document.querySelector('[data-soc-side="linkedin"]').click();
  await tick(100);
  check('klik baris LinkedIn -> tombol Putuskan muncul', !!document.getElementById('socDisc-linkedin'), '');
  check('setiap kartu tanggal punya tombol +', document.querySelectorAll('[data-soc-add]').length > 0, document.querySelectorAll('[data-soc-add]').length);

  // 8. Popup Tambah Channel: grid 8 ikon + nama, klik ikon ->
  // login browser langsung bila kredensial tersimpan, form bila
  // belum; Putuskan menyimpan kredensial (login ulang tanpa isi).
  document.getElementById('socAddChannel').click();
  await tick(100);
  check('popup Tambah Channel: grid 8 ikon + nama', document.querySelectorAll('[data-soc-tile]').length === 8, document.querySelectorAll('[data-soc-tile]').length);
  check('logo asli 8 kanal di popup', ['facebook', 'facebook_page', 'instagram', 'threads', 'linkedin', 'tiktok', 'youtube', 'x'].every((id) => (document.querySelector('[data-soc-tile="' + id + '"] img')?.getAttribute('src') || '').includes('-icon.png')), '');
  document.querySelector('[data-soc-tile="facebook"]').click();
  await tick(100);
  check('klik ikon FB profil -> pesan jujur + tombol Kembali (bukan login palsu)', !!document.getElementById('socPopBack') && !document.querySelector('.soc-pop-grid'), '');
  document.getElementById('socPopBack').click();
  await tick(100);
  check('Kembali -> grid popup lagi', !!document.querySelector('.soc-pop-grid'), '');
  document.querySelector('[data-soc-tile="tiktok"]').click();
  await tick(100);
  check('klik ikon TikTok tanpa kredensial -> wizard langkah 1', !!document.getElementById('socWizOpen') && !!document.getElementById('socWizSkip') && document.querySelectorAll('.soc-wiz-step').length === 4, '');
  document.getElementById('socWizSkip').click();
  await tick(100);
  check('wizard: Saya sudah punya aplikasi -> form ID + Secret', !!document.getElementById('socPopId') && !!document.getElementById('socPopConn'), '');
  document.getElementById('socPopId').value = 'rig-tk-id';
  document.getElementById('socPopSec').value = 'rig-tk-sec';
  document.getElementById('socPopConn').click();
  await tick(100);
  check('Hubungkan -> login browser TikTok langsung', (globalThis.__lastOAuthUrl || '').includes('tiktok.com'), globalThis.__lastOAuthUrl);
  check('popup tertutup saat login browser dimulai', !document.querySelector('.soc-pop-overlay'), '');
  // Putuskan menyimpan kredensial: seed TikTok terhubung + kredensial,
  // putuskan dari barisnya, lalu klik ikonnya lagi -> login langsung.
  store.set('minime.social', JSON.stringify({ linkedin: { accessToken: 'rig-token', expiresAt: Date.now() + 3600000 }, tiktok: { clientId: 'rig-tk-id', clientSecret: 'rig-tk-sec', accessToken: 'rig-tk-tok', expiresAt: Date.now() + 3600000, label: 'RigTok' } }));
  dom.window.renderPlanner();
  await tick(100);
  document.querySelector('[data-soc-side="tiktok"]').click();
  await tick(100);
  document.getElementById('socDisc-tiktok').click();
  await tick(100);
  const afterDisc = JSON.parse(store.get('minime.social') || '{}');
  check('Putuskan simpan kredensial, hapus token', afterDisc.tiktok && afterDisc.tiktok.clientId === 'rig-tk-id' && !afterDisc.tiktok.accessToken, JSON.stringify(afterDisc.tiktok));
  check('baris TikTok hilang dari sidebar setelah putus', !document.querySelector('[data-soc-side="tiktok"]'), '');
  document.getElementById('socAddChannel').click();
  await tick(100);
  globalThis.__lastOAuthUrl = '';
  document.querySelector('[data-soc-tile="tiktok"]').click();
  await tick(100);
  check('ikon TikTok berkredensial tersimpan -> login browser langsung', (globalThis.__lastOAuthUrl || '').includes('tiktok.com'), globalThis.__lastOAuthUrl);

  // 9. Komposer Buat Postingan gaya Postiz: kanal avatar + teks +
  // pratinjau live + draf + edit + jadwal + ulangi + terbit + konfirmasi tutup.
  const today = new Date();
  const todayKey = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
  const dayCell = [...document.querySelectorAll('.soc-cal-day[data-day]')].find((c) => c.getAttribute('data-day') !== todayKey);
  const dayKey2 = dayCell.getAttribute('data-day');
  dayCell.querySelector('[data-soc-add]').click();
  await tick(100);
  check('klik + kartu -> komposer Buat Postingan terbuka', !!document.getElementById('socCompText') && !!document.getElementById('socCompSave') && !!document.getElementById('socPreviewBody'), '');
  check('komposer: kanal terhubung tampil sebagai avatar', document.querySelectorAll('[data-comp-chan]').length >= 1, document.querySelectorAll('[data-comp-chan]').length);
  const compText = document.getElementById('socCompText');
  compText.value = 'draf komposer uji';
  compText.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('pratinjau live mengikuti teks', (document.getElementById('socPreviewBody')?.textContent || '').includes('draf komposer uji'), '');
  document.getElementById('socCompDraft').click();
  await tick(100);
  const qDraft = JSON.parse(store.get('minime.socialQueue') || '[]');
  check('Simpan sebagai draf -> item status draft, komposer tertutup', qDraft.some((it) => it.text === 'draf komposer uji' && it.status === 'draft') && !document.getElementById('socCompText'), JSON.stringify(qDraft.map((it) => it.text + ':' + it.status)));
  check('chip draf tampil dengan label Draf', [...document.querySelectorAll('.soc-item-title')].some((el) => el.textContent.includes('Draf: draf komposer uji')), '');
  const draftChip = [...document.querySelectorAll('.soc-item')].find((el) => el.textContent.includes('draf komposer uji'));
  check('chip draf bisa diklik untuk edit', !!draftChip?.querySelector('[data-soc-del]') && !!draftChip?.getAttribute('data-soc-edit'), '');
  draftChip.click();
  await tick(100);
  check('klik chip draf -> komposer edit terisi teks', (document.getElementById('socCompText')?.value || '') === 'draf komposer uji', document.getElementById('socCompText')?.value);
  const repSel = document.getElementById('socCompRepeat');
  repSel.value = 'day';
  repSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  document.getElementById('socCompSave').click();
  await tick(100);
  const qEdit = JSON.parse(store.get('minime.socialQueue') || '[]');
  check('edit + Tambah ke Kalender -> draf terganti antrean repeat day', !qEdit.some((it) => it.text === 'draf komposer uji' && it.status === 'draft') && qEdit.some((it) => it.text === 'draf komposer uji' && it.status === 'queued' && it.repeat === 'day'), JSON.stringify(qEdit.map((it) => it.text + ':' + it.status + ':' + (it.repeat || ''))));
  check('socNextRepeat: day +1 hari, month clamp 31 Jan -> 28 Feb', (() => {
    const d1 = dom.window.socNextRepeat(new Date(2026, 9, 30, 9, 0).getTime(), 'day');
    const d2 = dom.window.socNextRepeat(new Date(2026, 0, 31, 9, 0).getTime(), 'month');
    return new Date(d1).getDate() === 31 && new Date(d2).getMonth() === 1 && new Date(d2).getDate() === 28;
  })(), '');
  // Terbit sekarang: komposer baru -> publish stub -> tutup, tanpa antrean.
  const dayCell2 = [...document.querySelectorAll('.soc-cal-day[data-day]')].find((c) => c.getAttribute('data-day') !== todayKey && c.getAttribute('data-day') !== dayKey2);
  dayCell2.querySelector('[data-soc-add]').click();
  await tick(100);
  const compText2 = document.getElementById('socCompText');
  compText2.value = 'terbit langsung uji';
  compText2.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const pubBefore = invokeCount('social_publish');
  document.getElementById('socCompNow').click();
  await tick(200);
  check('Terbit sekarang -> publish terpanggil + komposer tertutup + tanpa antrean', invokeCount('social_publish') === pubBefore + 1 && !document.getElementById('socCompText') && !JSON.parse(store.get('minime.socialQueue') || '[]').some((it) => it.text === 'terbit langsung uji'), 'pub=' + invokeCount('social_publish'));
  // Konfirmasi tutup: draf kotor -> tanya dulu; Tidak -> tetap buka; Ya -> tutup.
  dayCell.querySelector('[data-soc-add]').click();
  await tick(100);
  const compText3 = document.getElementById('socCompText');
  compText3.value = 'jangan hilang';
  compText3.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.getElementById('socComposerClose').click();
  await tick(100);
  check('tutup komposer kotor -> konfirmasi muncul', !!document.getElementById('socConfirmYes'), '');
  document.getElementById('socConfirmNo').click();
  await tick(100);
  check('pilih Tidak -> komposer tetap terbuka', !!document.getElementById('socCompText'), '');
  document.getElementById('socComposerClose').click();
  await tick(100);
  document.getElementById('socConfirmYes').click();
  await tick(100);
  check('pilih Ya -> komposer tertutup', !document.querySelector('.soc-composer'), '');

  // 10. Wizard hubungkan v73: semua kanal terpandu 4 langkah
  // (buat aplikasi -> salin URI -> tempel URI -> isi ID/Secret).
  store.set('minime.social', JSON.stringify({ linkedin: { accessToken: 'rig-token', expiresAt: Date.now() + 3600000 } }));
  dom.window.renderPlanner();
  await tick(100);
  const wizOpen = async (tile, expect) => {
    document.getElementById('socAddChannel').click();
    await tick(100);
    document.querySelector('[data-soc-tile="' + tile + '"]').click();
    await tick(100);
    const ok = !!document.getElementById('socWizOpen') && document.querySelectorAll('.soc-wiz-step').length === 4;
    globalThis.__lastOAuthUrl = '';
    document.getElementById('socWizOpen').click();
    await tick(100);
    check('wizard ' + tile + ' -> buka dashboard provider', ok && (globalThis.__lastOAuthUrl || '').includes(expect), globalThis.__lastOAuthUrl);
    document.getElementById('socPopClose').click();
    await tick(100);
  };
  await wizOpen('instagram', 'developers.facebook.com/apps/create/');
  await wizOpen('threads', 'developers.facebook.com/apps/');
  await wizOpen('linkedin', 'linkedin.com/developers');
  await wizOpen('tiktok', 'developers.tiktok.com');
  await wizOpen('youtube', 'console.cloud.google.com');
  await wizOpen('x', 'developer.x.com');
  // Jalan langkah IG penuh: 1 -> 2 (salin URI) -> 3 -> 4 -> kembali.
  document.getElementById('socAddChannel').click();
  await tick(100);
  document.querySelector('[data-soc-tile="instagram"]').click();
  await tick(100);
  document.getElementById('socWizNext').click();
  await tick(100);
  check('wizard langkah 2: URI loopback + tombol salin', (document.getElementById('socWizUri')?.value || '') === 'http://127.0.0.1:4317/callback' && !!document.getElementById('socWizCopy'), document.getElementById('socWizUri')?.value);
  document.getElementById('socWizCopy').click();
  await tick(100);
  check('wizard: salin -> nota Tersalin', (document.getElementById('socWizNote')?.textContent || '').includes('Tersalin'), document.getElementById('socWizNote')?.textContent);
  document.getElementById('socWizNext').click();
  await tick(100);
  check('wizard langkah 3: petunjuk tempel URI Meta', (document.querySelector('.soc-pop')?.textContent || '').includes('Facebook Login'), '');
  document.getElementById('socWizNext').click();
  await tick(100);
  check('wizard langkah 4: form ID + Secret', !!document.getElementById('socPopId') && !!document.getElementById('socPopConn'), '');
  document.getElementById('socWizPrev').click();
  await tick(100);
  check('wizard: Kembali dari 4 -> 3', !!document.getElementById('socWizNext') && (document.querySelector('.soc-pop')?.textContent || '').includes('Facebook Login'), '');
  document.getElementById('socWizPrev').click();
  await tick(100);
  check('wizard: Kembali dari 3 -> 2', !!document.getElementById('socWizUri'), '');
  document.getElementById('socWizPrev').click();
  await tick(100);
  check('wizard: Kembali dari 2 -> 1', !!document.getElementById('socWizOpen'), '');
  document.getElementById('socPopBack').click();
  await tick(100);
  check('wizard: Kembali dari 1 -> grid channel', !!document.querySelector('.soc-pop-grid'), '');
  // Pakai ulang aplikasi Meta: FB Page -> IG dan IG -> FB Page.
  store.set('minime.social', JSON.stringify({ linkedin: { accessToken: 'rig-token', expiresAt: Date.now() + 3600000 }, facebook_page: { clientId: 'fb-id', clientSecret: 'fb-sec' } }));
  dom.window.renderPlanner();
  await tick(100);
  document.getElementById('socAddChannel').click();
  await tick(100);
  document.querySelector('[data-soc-tile="instagram"]').click();
  await tick(100);
  document.getElementById('socWizSkip').click();
  await tick(100);
  check('wizard IG: tombol pakai aplikasi FB Page muncul', !!document.getElementById('socWizUseFb'), '');
  document.getElementById('socWizUseFb').click();
  await tick(100);
  check('wizard IG: pakai aplikasi FB Page mengisi form', document.getElementById('socPopId').value === 'fb-id' && document.getElementById('socPopSec').value === 'fb-sec', document.getElementById('socPopId').value);
  document.getElementById('socPopClose').click();
  await tick(100);
  store.set('minime.social', JSON.stringify({ linkedin: { accessToken: 'rig-token', expiresAt: Date.now() + 3600000 }, instagram: { clientId: 'ig-id', clientSecret: 'ig-sec' } }));
  dom.window.renderPlanner();
  await tick(100);
  document.getElementById('socAddChannel').click();
  await tick(100);
  document.querySelector('[data-soc-tile="facebook_page"]').click();
  await tick(100);
  document.getElementById('socWizSkip').click();
  await tick(100);
  check('wizard FB Page: tombol pakai aplikasi IG muncul + mengisi form', !!document.getElementById('socWizUseIg'), '');
  document.getElementById('socWizUseIg').click();
  await tick(100);
  check('wizard FB Page: pakai aplikasi IG mengisi form', document.getElementById('socPopId').value === 'ig-id' && document.getElementById('socPopSec').value === 'ig-sec', document.getElementById('socPopId').value);

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-batch exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-BATCH ALL PASSED' : 'RIG-BATCH FAILED');
process.exit(failed === 0 ? 0 : 1);
