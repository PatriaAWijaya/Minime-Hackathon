// Rig Flow Gambar (jsdom, test-only): membuktikan panel Image baru —
// BUKAN mock logika bisnis:
//  1. Panel render (brief, rasio, Generate) + preview prompt terkirim.
//  2. Tanpa kunci Meta: Generate ditolak jujur, tanpa fetch.
//  3. Generate via fetch stub (bentuk respons Meta terverifikasi live)
//     -> varian tampil + biaya Rp tercatat.
//  4. Simpan varian -> baris Library + galeri (via invoke stub
//     image_save/image_read) + spend tercatat.
//  5. Muat dari Script terakhir mengisi brief.
//  6. Recall Library (Media Studio) memuat gambar tersimpan ke panel.
// Jalankan: npm run rig:image (butuh dist ter-build + jsdom devDependency).
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
const googleBodies = [];
const imgPrompts = [];
const capPrompts = [];
let capSeq = 0;
const store = new Map();
const imgFiles = new Map();
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url, opts) {
  log.push('fetch:' + String(url));
  let body = {};
  try { body = typeof opts?.body === 'string' ? JSON.parse(opts.body) : (opts?.body || {}); } catch (_) { body = {}; }
  const u = String(url);
  // v168: cabang Google image (Nano Banana) — SEBELUM cabang chat,
  // karena generateContent juga bukan images/generations.
  if (u.includes('generateContent')) {
    googleBodies.push(body);
    return makeResp({
      jsonData: {
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_1X1 } }] } }],
      },
    });
  }
  // v163: cabang chat untuk caption/VO model (approve draft) — VO
  // dibedakan dari caption lewat kata 'voice over' di prompt.
  if (!u.includes('images/generations') && !u.includes('127.0.0.1') && !u.includes('localhost')) {
    const text = JSON.stringify(body);
    capPrompts.push(text);
    return makeResp({
      jsonData: {
        choices: [{ message: { content: (text.includes('voice over') ? 'VO-UJI-' : 'CAPTION-UJI-') + (++capSeq) } }],
        usage: { prompt_tokens: 42, completion_tokens: 30 },
      },
    });
  }
  // v164: rekam prompt gambar terkirim untuk asersi sequence.
  if (u.includes('images/generations') && typeof body.prompt === 'string') imgPrompts.push(body.prompt);
  // Gambar: hormati n seperti API nyata (sebelumnya stub selalu 2,
  // padahal generate v163 memanggil per gambar dengan n=1).
  const n = Number.isInteger(body.n) && body.n > 0 && body.n <= 10 ? body.n : 2;
  return makeResp({
    jsonData: {
      created: 1793000000,
      data: Array.from({ length: n }, () => ({ b64_json: PNG_1X1 })),
      output_format: 'webp',
      usage: {},
    },
  });
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
async function waitFor(fn, label, tries = 120) {
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
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 200)));
  if (!ok) failed++;
}

const bodyText = () => document.body.textContent || '';
// Hitung hanya MODEL call: onMount menjalankan vsCheck() (ping
// localhost:3900: status + model + voice), renderPlanner() menjalankan
// postizCheck() (ping localhost:4007), dan panel VoiceStudio menjalankan
// vsEmbedCheck() (probe UI localhost:3901 + /health). Itu cek status
// lokal, bukan model call — dikecualikan agar asersi '1 model call' /
// 'tanpa fetch' tetap bermakna.
const fetchCount = () =>
  log.filter((l) => l.startsWith('fetch:') && !l.includes('127.0.0.1:3900') && !l.includes('localhost:4007') && !l.includes('localhost:3901')).length;
const libRows = () => document.getElementById('libGrid')?.querySelectorAll('.lib-card').length || 0;

try {
  await waitFor(() => typeof dom.window.showView === 'function', 'mount showView', 120);
  dom.window.showView('media');
  dom.window.mediaTab('image');
  await tick(100);

  // 1. Panel render + preview prompt terkirim.
  check('panel Image render', !!document.getElementById('img-brief') && !!document.getElementById('img-generate') && !!document.getElementById('img-ratio'));
  const brief = document.getElementById('img-brief');
  brief.value = 'kopi susu';
  brief.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  check('preview prompt memuat brief + tanpa-teks', (document.getElementById('img-preview')?.textContent || '').includes('kopi susu') && (document.getElementById('img-preview')?.textContent || '').includes('no text'));

  // 2. Tanpa kunci: ditolak jujur, tanpa fetch.
  document.getElementById('img-n').value = '2';
  document.getElementById('img-n').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  document.getElementById('img-generate').click();
  await waitFor(() => (document.getElementById('img-status')?.textContent || '').includes('Kunci Meta'), 'note tanpa kunci', 60);
  check('tanpa kunci ditolak tanpa fetch', fetchCount() === 0, 'fetch=' + fetchCount());

  // 3. Generate -> 2 varian + biaya Rp.
  store.set('minime.metaKey', 'rig-key');
  document.getElementById('img-generate').click();
  await waitFor(() => document.querySelectorAll('#img-variants img').length === 2, '2 varian tampil', 120);
  check('2 varian tampil', document.querySelectorAll('#img-variants img').length === 2);
  check('biaya generate tampil (Rp)', (document.getElementById('img-status')?.textContent || '').includes('Rp'));
  const spend = JSON.parse(store.get('minime.imageSpend') || '{}');
  check('spend tercatat 2 gambar', spend.images === 2 && spend.usd === 0.02, JSON.stringify(spend));

  // 4. Simpan varian -> Library + galeri.
  const rowsBefore = libRows();
  [...document.querySelectorAll('#img-variants button')].find((b) => b.textContent.trim() === 'Simpan ke Library').click();
  await waitFor(() => libRows() === rowsBefore + 1, 'kartu Library bertambah', 120);
  check('simpan menambah kartu Library', libRows() === rowsBefore + 1, 'rows=' + libRows());
  await waitFor(() => document.querySelectorAll('#img-gallery img').length === 1, 'galeri tampil', 120);
  check('galeri menampilkan gambar tersimpan', document.querySelectorAll('#img-gallery img').length === 1);

  // 5. Muat dari Script terakhir.
  store.set('minime.scriptEditor', JSON.stringify({ output: 'NASKAH-TEST-KOPI' }));
  document.getElementById('img-load-script').click();
  await tick(100);
  check('muat Script mengisi brief', (document.getElementById('img-brief')?.value || '').includes('NASKAH-TEST-KOPI'));

  // 6. Recall Library -> panel Image memuat gambar tersimpan.
  const addedRow = [...document.querySelectorAll('#libGrid .lib-card')].pop();
  [...addedRow.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Media Studio').click();
  await waitFor(() => (document.getElementById('img-loaded')?.querySelector('img') ? true : false), 'gambar recall tampil', 120);
  check('recall Library memuat gambar ke panel', !!document.getElementById('img-loaded')?.querySelector('img'));
  check('recall Library mengisi brief dari prompt', (document.getElementById('img-brief')?.value || '').includes('kopi susu'));

  // 7. v146: Bersihkan mengosongkan brief (+ tab bulk), tanpa mengubah rasio.
  dom.window.imgSetBulk(['brief bulk satu', 'brief bulk dua']);
  await tick(100);
  check('v146: bulk 2 tab tampil sebelum dibersihkan', document.querySelectorAll('#img-bulk-tabs .img-tab').length === 2, document.querySelectorAll('#img-bulk-tabs .img-tab').length);
  document.getElementById('img-clear').click();
  await tick(100);
  check('v146: brief kosong setelah Bersihkan', (document.getElementById('img-brief')?.value || '') === '');
  check('v146: tab bulk hilang setelah Bersihkan', document.querySelectorAll('#img-bulk-tabs .img-tab').length === 0);
  check('v146: rasio dipertahankan setelah Bersihkan', (JSON.parse(store.get('minime.imageFlow') || '{}').ratio || '') !== '', JSON.stringify(JSON.parse(store.get('minime.imageFlow') || '{}')));

  // 8. v158: galeri hanya 10 output terakhir, thumbnail saja.
  // (Jalur UI asli: 6 siklus generate + simpan semua varian dengan
  // brief berbeda. Sebelum seksi ini Library sudah berisi 1 gambar
  // §4, sehingga total 13 — galeri wajib menampilkan 10 terakhir.)
  const briefEl = document.getElementById('img-brief');
  for (let cyc = 1; cyc <= 6; cyc++) {
    // Nama varian memuat timestamp: tunggu nama BERUBAH agar tidak
    // terkecoh varian basi §3 (fetch stub mengembalikan PNG yang sama).
    const oldNames = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
    briefEl.value = 'uji galeri ' + cyc;
    briefEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await tick(100);
    document.getElementById('img-generate').click();
    await waitFor(() => {
      const names = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
      return document.querySelectorAll('#img-variants img').length === 2 && names !== oldNames;
    }, '2 varian baru siklus ' + cyc, 120);
    // Tombol varian yang sudah tersimpan tetap bertuliskan "Simpan ke
    // Library" (klik ulang = dedup, baris tidak bertambah) — jadi klik
    // tiap tombol sekali saja, tanpa menuntut +1 per klik.
    const rowsBefore = libRows();
    const saveBtns = [...document.querySelectorAll('#img-variants button')].filter((b) => b.textContent.trim() === 'Simpan ke Library');
    for (const btn of saveBtns) {
      btn.click();
      await tick(200);
    }
    await waitFor(() => libRows() > rowsBefore, 'simpan siklus ' + cyc, 120);
  }
  await waitFor(() => document.querySelectorAll('#img-gallery .img-thumb').length === 10, 'galeri 10 thumbnail', 120);
  // Thumbnail sukses tidak punya teks (judul hanya di atribut title
  // + data-img-brief) — asersi memakai atribut, bukan textContent.
  const galAttrs = [...document.querySelectorAll('#img-gallery .img-thumb')].map((el) => (el.getAttribute('title') || '') + '|' + (el.dataset.imgBrief || '')).join(' ');
  check('v158: galeri tepat 10 thumbnail', document.querySelectorAll('#img-gallery .img-thumb').length === 10, document.querySelectorAll('#img-gallery .img-thumb').length);
  check('v158: 10 terakhir tampil (uji galeri 2-6)', ['uji galeri 2', 'uji galeri 3', 'uji galeri 4', 'uji galeri 5', 'uji galeri 6'].every((t) => galAttrs.includes(t)), galAttrs.slice(0, 200));
  check('v158: output lama tidak tampil (uji galeri 1 + kopi susu §4)', !galAttrs.includes('uji galeri 1') && !galAttrs.includes('kopi susu'), galAttrs.slice(0, 200));
  check('v158: tanpa tombol Muat ke brief di galeri', ![...document.querySelectorAll('#img-gallery button')].some((b) => b.textContent.trim() === 'Muat ke brief'), [...document.querySelectorAll('#img-gallery button')].map((b) => b.textContent.trim()).join('|'));
  document.querySelector('#img-gallery .img-thumb')?.click();
  await tick(100);
  check('v158: klik thumbnail memuat brief (uji galeri 2)', (document.getElementById('img-brief')?.value || '').includes('uji galeri 2'), document.getElementById('img-brief')?.value || '');

  // 9. v163: Output Desain + kondisional + Canva + Setujui draft.
  const disp = (id) => document.getElementById(id)?.style.display || '';
  check('v163: default Poster (rasio+varian tampil, durasi/scene/slide sembunyi)', disp('img-ratio-wrap') !== 'none' && disp('img-n-wrap') !== 'none' && disp('img-duration-wrap') === 'none' && disp('img-scenes-wrap') === 'none' && disp('img-slides-wrap') === 'none', [disp('img-ratio-wrap'), disp('img-n-wrap'), disp('img-duration-wrap'), disp('img-scenes-wrap'), disp('img-slides-wrap')].join('|'));
  const setSel = async (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await tick(100); };
  await setSel('img-output', 'storyboard');
  check('v163: Story Board (durasi+scene+rasio tampil, varian sembunyi)', disp('img-duration-wrap') !== 'none' && disp('img-scenes-wrap') !== 'none' && disp('img-ratio-wrap') !== 'none' && disp('img-n-wrap') === 'none', [disp('img-duration-wrap'), disp('img-scenes-wrap'), disp('img-ratio-wrap'), disp('img-n-wrap')].join('|'));
  await setSel('img-output', 'carousel');
  check('v163: Carousel (slide tampil, rasio+varian sembunyi)', disp('img-slides-wrap') !== 'none' && disp('img-ratio-wrap') === 'none' && disp('img-n-wrap') === 'none', [disp('img-slides-wrap'), disp('img-ratio-wrap'), disp('img-n-wrap')].join('|'));
  await setSel('img-output', 'poster');
  check('v163: kembali ke Poster', disp('img-ratio-wrap') !== 'none' && disp('img-n-wrap') !== 'none', [disp('img-ratio-wrap'), disp('img-n-wrap')].join('|'));

  // Poster: generate -> tombol Canva per varian -> impor -> Setujui.
  briefEl.value = 'poster uji';
  briefEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  document.getElementById('img-generate').click();
  await waitFor(() => document.querySelectorAll('#img-variants img').length === 2, '2 varian poster', 120);
  check('v163: tiap varian punya tombol Edit + Impor Canva', document.querySelectorAll('#img-variants [data-img-canva]').length === 2 && document.querySelectorAll('#img-variants [data-img-canvaup]').length === 2, document.querySelectorAll('#img-variants [data-img-canva]').length + '/' + document.querySelectorAll('#img-variants [data-img-canvaup]').length);
  const fileInput = document.querySelector('#img-variants [data-img-canvafile]');
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const canvaFile = new dom.window.File([pngBytes], 'canva.png', { type: 'image/png' });
  Object.defineProperty(fileInput, 'files', { value: [canvaFile] });
  document.querySelector('#img-variants [data-img-canvaup]').click();
  await waitFor(() => document.querySelectorAll('#img-variants img').length === 3, 'varian impor Canva tampil', 120);
  check('v163: impor Canva menambah varian', document.querySelectorAll('#img-variants img').length === 3, document.querySelectorAll('#img-variants img').length);
  const rowsBeforeApprove = libRows();
  document.getElementById('img-approve').click();
  await waitFor(() => (document.getElementById('img-status')?.textContent || '').includes('disetujui'), 'note Setujui poster', 120);
  await tick(200);
  const libAfterPoster = JSON.parse(store.get('minime.library.added') || '[]');
  check('v163: Setujui poster menyimpan gambar + caption ke Library', libRows() >= rowsBeforeApprove + 3 && libAfterPoster.some((x) => (x.content || '').includes('CAPTION-UJI')), 'rows=' + libRows() + '/' + rowsBeforeApprove + ' cap=' + libAfterPoster.some((x) => (x.content || '').includes('CAPTION-UJI')));
  // v204 (Skenario 1 Tahap 4+5): Setujui poster -> 2 draf Planner
  // (IG + Threads, tanpa tanggal) + caption terpasang di gambar.
  const q204 = JSON.parse(store.get('minime.socialQueue') || '[]');
  const d204 = q204.filter((it) => it.status === 'draft' && !it.scheduledAt);
  const img204 = libAfterPoster.filter((x) => x.kind === 'image' && (x.content || '').includes('poster uji'));
  check('v204: Setujui poster membuat draf Planner IG + Threads tanpa tanggal', d204.length === 2 && d204.some((it) => it.platform === 'instagram') && d204.some((it) => it.platform === 'threads') && d204.every((it) => (it.text || '').includes('CAPTION-UJI') && !!it.imageFile), 'drafts=' + d204.length + ' ' + d204.map((it) => it.platform + ':' + (it.imageFile || '')).join('|'));
  check('v204: draf Planner menunjuk varian poster yang tersimpan', d204.every((it) => img204.some((x) => x.imageFile === it.imageFile)), 'img=' + img204.map((x) => x.imageFile).join('|'));
  check('v204: caption terpasang di item Library gambar poster', img204.length === 3 && img204.every((x) => (x.caption || '').includes('CAPTION-UJI')), 'img=' + img204.length + ' cap=' + img204.map((x) => (x.caption || '').slice(0, 12)).join('|'));

  // Story Board: generate 2 scene -> Setujui -> plan Video + VO Voice + caption.
  await setSel('img-output', 'storyboard');
  await setSel('img-scenes', '2');
  briefEl.value = 'story uji';
  briefEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  document.getElementById('img-generate').click();
  await waitFor(() => [...document.querySelectorAll('#img-variants .se-note')].some((el) => (el.textContent || '').includes('Scene 2')), 'varian Scene 2 tampil', 120);
  const notes163 = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent || '').join(' ');
  check('v163: storyboard menghasilkan keyframe Scene 1 + Scene 2', notes163.includes('Scene 1') && notes163.includes('Scene 2'), notes163.slice(0, 200));
  document.getElementById('img-approve').click();
  await waitFor(() => (document.getElementById('img-status')?.textContent || '').includes('disetujui'), 'note Setujui storyboard', 120);
  await tick(200);
  const libAfterSb = JSON.parse(store.get('minime.library.added') || '[]');
  const ve2 = JSON.parse(store.get('minime.ve2') || '{}');
  check('v163: storyboard menyimpan VO + caption ke Library', libAfterSb.some((x) => (x.content || '').includes('VO-UJI')) && libAfterSb.some((x) => (x.content || '').includes('CAPTION-UJI')), libAfterSb.map((x) => (x.content || '').slice(0, 20)).join('|').slice(0, 200));
  check('v163: rencana video masuk ke state Video Editor', (ve2.plan || '').includes('story uji'), (ve2.plan || '').slice(0, 120));
  check('v163: naskah VO masuk ke kolom teks Voice Editor', (document.getElementById('vsText')?.value || '').includes('VO-UJI'), (document.getElementById('vsText')?.value || '').slice(0, 60));
  // v204: Setujui storyboard TIDAK membuat draf Planner (gambarnya
  // keyframe video, bukan postingan sosmed) — jumlah draf tetap 2.
  const q204b = JSON.parse(store.get('minime.socialQueue') || '[]');
  check('v204: storyboard tidak menambah draf Planner', q204b.filter((it) => it.status === 'draft' && !it.scheduledAt).length === 2, 'drafts=' + q204b.filter((it) => it.status === 'draft' && !it.scheduledAt).length);


  // 10. v164: storyboard = sequence (satu shot per frame, bukan tema).
  await setSel('img-output', 'storyboard');
  await setSel('img-scenes', '2');
  briefEl.value = '1. 00-05 detik: tuang V60 perlahan, uap naik.\n2. 05-10 detik: barista tersenyum menyajikan cangkir.';
  briefEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  const oldNames10 = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
  imgPrompts.length = 0;
  document.getElementById('img-generate').click();
  await waitFor(() => {
    const names = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
    return document.querySelectorAll('#img-variants img').length === 2 && names !== oldNames10;
  }, '2 varian storyboard parse', 120);
  check('v164: frame 1 hanya shot 1 (bukan brief utuh)', imgPrompts.length === 2 && imgPrompts[0].includes('tuang V60') && !imgPrompts[0].includes('barista tersenyum'), JSON.stringify(imgPrompts).slice(0, 300));
  check('v164: frame 2 hanya shot 2', imgPrompts[1].includes('barista tersenyum') && !imgPrompts[1].includes('tuang V60'), JSON.stringify(imgPrompts).slice(0, 300));
  check('v164: kedua frame berbagi bible sequence', imgPrompts[0].includes('Storyboard frame 1 of 2') && imgPrompts[1].includes('Storyboard frame 2 of 2') && imgPrompts[0].includes('same video') && imgPrompts[1].includes('same video'), JSON.stringify(imgPrompts).slice(0, 200));
  // Fallback: brief tanpa nomor -> model-split gagal di stub -> bible
  // + penanda keyframe, tetap tanpa brief utuh.
  briefEl.value = 'video teaser kopi hangat komunal sore hari';
  briefEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  const oldNames10b = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
  imgPrompts.length = 0;
  document.getElementById('img-generate').click();
  await waitFor(() => {
    const names = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
    return document.querySelectorAll('#img-variants img').length === 2 && names !== oldNames10b;
  }, '2 varian storyboard fallback', 120);
  check('v164: fallback tetap sequence tanpa brief utuh', imgPrompts.length === 2 && imgPrompts[0].includes('Storyboard frame 1 of 2') && imgPrompts[1].includes('Storyboard frame 2 of 2') && !imgPrompts[0].includes('video teaser kopi hangat') && !imgPrompts[1].includes('video teaser kopi hangat'), JSON.stringify(imgPrompts).slice(0, 300));


  // 11. v165: style lock storyboard (konsistensi gaya antar panel).
  await setSel('img-style', 'flat design');
  briefEl.value = '1. 00-05 detik: montase cepat suasana kedai.\n2. 05-10 detik: end-card SELATAN SEDUH.';
  briefEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  const oldNames11 = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
  imgPrompts.length = 0;
  document.getElementById('img-generate').click();
  await waitFor(() => {
    const names = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
    return document.querySelectorAll('#img-variants img').length === 2 && names !== oldNames11;
  }, '2 varian storyboard lock', 120);
  // Catatan: lock sendiri memuat kata 'end-card' (aturan), jadi
  // pemisah shot diuji lewat 'montase' vs 'SELATAN SEDUH'.
  check('v165: tiap frame memuat style lock', imgPrompts.length === 2 && imgPrompts.every((pr) => pr.includes('STYLE LOCK') && pr.includes('never a collage') && pr.includes('never a poster layout') && pr.includes('flat design')), JSON.stringify(imgPrompts).slice(0, 300));
  check('v165: shot montase/end-card tetap terpisah', imgPrompts[0].includes('montase') && !imgPrompts[0].includes('SELATAN SEDUH') && imgPrompts[1].includes('SELATAN SEDUH') && !imgPrompts[1].includes('montase'), JSON.stringify(imgPrompts).slice(0, 300));

  // 12. v168: generate gambar Google (Nano Banana) via provider select.
  await setSel('img-output', 'poster');
  await setSel('img-provider', 'google');
  store.set('minime.geminiKey', 'rig-key');
  briefEl.value = 'kopi google uji';
  briefEl.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  const spendBefore = JSON.parse(store.get('minime.imageSpend') || '{}');
  googleBodies.length = 0;
  const oldNames12 = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
  document.getElementById('img-generate').click();
  await waitFor(() => {
    const names = [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent).join('|');
    return document.querySelectorAll('#img-variants img').length === 2 && names !== oldNames12;
  }, '2 varian Google', 120);
  check('v168: Google dipanggil 2x + aspek 1:1', googleBodies.length === 2 && googleBodies.every((b) => b?.generationConfig?.imageConfig?.aspectRatio === '1:1' && JSON.stringify(b?.contents || []).includes('kopi google uji')), JSON.stringify(googleBodies).slice(0, 300));
  const vimgs = [...document.querySelectorAll('#img-variants img')].map((im) => im.getAttribute('src') || '');
  check('v168: varian Google bermime png', vimgs.length === 2 && vimgs.every((u) => u.startsWith('data:image/png;base64,')), vimgs.join(' ').slice(0, 200));
  const spendAfter = JSON.parse(store.get('minime.imageSpend') || '{}');
  check('v168: spend Google +2 gambar ~$0,134', spendAfter.images - spendBefore.images === 2 && Math.abs((spendAfter.usd - spendBefore.usd) - 0.134) <= 0.01, JSON.stringify({ before: spendBefore, after: spendAfter }));
  const rows12 = libRows();
  [...document.querySelectorAll('#img-variants button')].find((b) => b.textContent.trim() === 'Simpan ke Library').click();
  await waitFor(() => libRows() === rows12 + 1, 'kartu Library Google bertambah', 120);
  const added12 = JSON.parse(store.get('minime.library.added') || '[]');
  const last12 = added12[added12.length - 1] || {};
  check('v168: file tersimpan berekstensi .png', typeof last12.imageFile === 'string' && last12.imageFile.endsWith('.png'), JSON.stringify(last12));


  // v171: template pola prompt poster — Header/Footer/Palet masuk prompt sesuai urutan pola.
  await setSel('img-provider', 'meta');
  await setSel('img-output', 'poster');
  const setTxt171 = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  check('v171: field template render', !!document.getElementById('img-header') && !!document.getElementById('img-footer') && !!document.getElementById('img-palette'));
  setTxt171('img-brief', 'foto prestasi tim');
  setTxt171('img-header', 'JUARA 3');
  setTxt171('img-title', 'POSTER DESIGN');
  setTxt171('img-subtitle', 'LO KREATIF 2024');
  setTxt171('img-footer', 'Nama A');
  setTxt171('img-palette', 'marun #7A1C28');
  await tick(100);
  imgPrompts.length = 0;
  document.getElementById('img-generate').click();
  await waitFor(() => imgPrompts.length > 0, 'prompt template terkirim', 120);
  const pr171 = imgPrompts[imgPrompts.length - 1];
  const ord171 = ['Header text: JUARA 3', 'Title: POSTER DESIGN', 'Subtitle: LO KREATIF 2024', 'Footer text: Nama A', 'Color palette: marun #7A1C28'].map((m) => pr171.indexOf(m));
  check('v171: prompt template urut pola (header>judul>subjudul>footer>palet)', ord171.every((v) => v >= 0) && ord171.every((v, i) => i === 0 || v > ord171[i - 1]), JSON.stringify(ord171) + ' :: ' + pr171.slice(0, 300));


  // v172: caption 3 jalur — storyboard pakai jalur Video, poster pakai
  // jalur Sosmed; terisolasi penulisannya, terintegrasi datanya
  // (caption approve langsung menunggu di komposer Planner).
  const setTxt172 = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const varNames = () => [...document.querySelectorAll('#img-variants .se-note')].map((el) => el.textContent || '').join(' ');
  await setSel('img-provider', 'meta');
  await setSel('img-output', 'storyboard');
  await setSel('img-scenes', '2');
  setTxt172('img-brief', 'cap uji video');
  setTxt172('img-title', 'Teaser Uji');
  await tick(100);
  document.getElementById('img-generate').click();
  await waitFor(() => [...document.querySelectorAll('#img-variants .se-note')].some((el) => (el.textContent || '').includes('Scene 2')), 'varian Scene 2 v172', 120);
  const capBeforeSb = capPrompts.length;
  document.getElementById('img-approve').click();
  await waitFor(() => (document.getElementById('img-status')?.textContent || '').includes('disetujui'), 'note Setujui storyboard v172', 120);
  await tick(200);
  const sbCaps = capPrompts.slice(capBeforeSb).filter((t) => /caption/i.test(t));
  const sbCap = sbCaps[sbCaps.length - 1] || '';
  check('v172: storyboard memakai prompt caption VIDEO (bukan media sosial)', sbCap.includes('caption video') && !sbCap.includes('media sosial'), sbCap.slice(0, 200));
  const libSb172 = JSON.parse(store.get('minime.library.added') || '[]');
  check('v172: caption storyboard tersimpan sebagai Caption Video: Teaser Uji', libSb172.some((x) => x.o === 'Caption Video: Teaser Uji'), libSb172.map((x) => x.o).join('|').slice(0, 200));

  // Poster: jalur Sosmed + langsung ke komposer Planner.
  await setSel('img-output', 'poster');
  setTxt172('img-brief', 'cap uji sosmed');
  setTxt172('img-title', 'Poster Uji');
  await tick(100);
  const namesBeforePoster = varNames();
  document.getElementById('img-generate').click();
  await waitFor(() => varNames() !== namesBeforePoster, 'nama varian poster v172 berubah', 120);
  const capBeforePoster = capPrompts.length;
  document.getElementById('img-approve').click();
  await waitFor(() => (document.getElementById('img-status')?.textContent || '').includes('disetujui'), 'note Setujui poster v172', 120);
  await tick(200);
  const posterCaps = capPrompts.slice(capBeforePoster).filter((t) => /caption/i.test(t));
  const posterCap = posterCaps[posterCaps.length - 1] || '';
  check('v172: poster memakai prompt caption media sosial', posterCap.includes('caption media sosial'), posterCap.slice(0, 200));
  const libPoster172 = JSON.parse(store.get('minime.library.added') || '[]');
  check('v172: caption poster tersimpan sebagai Caption Sosmed: Poster Uji', libPoster172.some((x) => x.o === 'Caption Sosmed: Poster Uji'), libPoster172.map((x) => x.o).join('|').slice(0, 200));
  document.getElementById('socCreatePost')?.click();
  await tick(200);
  check('v172: caption poster langsung terisi di komposer Planner (tanpa salin-tempel)', (document.getElementById('socCompText')?.value || '').includes('CAPTION-UJI'), (document.getElementById('socCompText')?.value || '').slice(0, 80));

  // 13. v174: struktur storyboard 7 field per panel (ganti shot teks-bebas).
  await setSel('img-output', 'storyboard');
  await setSel('img-scenes', '2');
  setTxt172('img-brief', '1. Fasad kedai pagi, papan nama Selatan Seduh.\n2. Barista menuang V60, uap mengepul.');
  await tick(100);
  document.getElementById('img-sb-build').click();
  await waitFor(() => document.querySelectorAll('[data-sb-panel]').length === 2, '2 panel storyboard', 120);
  check('v174: panel terisi visual dari shot list', (document.querySelector('[data-sb-panel="0"] [data-sb-field="visual"]')?.value || '').includes('Fasad kedai') && (document.querySelector('[data-sb-panel="1"] [data-sb-field="visual"]')?.value || '').includes('menuang V60'), (document.querySelector('[data-sb-panel="0"] [data-sb-field="visual"]')?.value || '').slice(0, 60));
  check('v174: panel punya 7 field (shot, visual, aksi, VO, transisi, durasi + label)', ['shot', 'visual', 'action', 'vo', 'transition', 'duration'].every((f) => !!document.querySelector('[data-sb-panel="0"] [data-sb-field="' + f + '"]')), [...document.querySelectorAll('[data-sb-panel="0"] [data-sb-field]')].map((e) => e.getAttribute('data-sb-field')).join(','));
  const setSb = (idx, field, v) => { const e = document.querySelector('[data-sb-panel="' + idx + '"] [data-sb-field="' + field + '"]'); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  setSb(0, 'shot', 'ES, eye-level, static');
  setSb(0, 'vo', 'Pagi selalu dimulai dari sini.');
  setSb(0, 'duration', '6');
  setSb(1, 'duration', '9');
  await tick(100);
  check('v174: total durasi panel tampil (6+9=15)', (document.getElementById('img-sb-total')?.textContent || '').includes('15'), document.getElementById('img-sb-total')?.textContent || '');
  imgPrompts.length = 0;
  document.getElementById('img-generate').click();
  await waitFor(() => imgPrompts.length === 2, '2 prompt panel', 120);
  check('v174: prompt panel memuat shot + visual (bukan brief utuh)', imgPrompts[0].includes('ES, eye-level, static') && imgPrompts[0].includes('Fasad kedai') && !imgPrompts[0].includes('menuang V60'), JSON.stringify(imgPrompts).slice(0, 300));
  document.getElementById('img-approve').click();
  await waitFor(() => (document.getElementById('img-status')?.textContent || '').includes('disetujui'), 'note Setujui panel', 120);
  await tick(200);
  const ve2v174 = JSON.parse(store.get('minime.ve2') || '{}');
  check('v174: rencana video memuat 7 field panel', (ve2v174.plan || '').includes('Scene 1') && (ve2v174.plan || '').includes('ES, eye-level, static') && (ve2v174.plan || '').includes('Durasi: 6 detik'), (ve2v174.plan || '').slice(0, 200));
  check('v174: VO gabungan panel masuk kolom Voice Editor', (document.getElementById('vsText')?.value || '').includes('Pagi selalu dimulai dari sini.'), (document.getElementById('vsText')?.value || '').slice(0, 80));

  // 14. v203: jembatan imgSetStructured mengisi field + Body + rasio.
  check('v203: jembatan imgSetStructured tersedia', typeof dom.window.imgSetStructured === 'function', typeof dom.window.imgSetStructured);
  dom.window.imgSetStructured({ brief: 'Rencana uji body', title: 'Judul Uji', subtitle: 'Sub Uji', body: 'Paragraf body uji.', listicle: 'Poin satu\nPoin dua', header: 'HEAD UJI', footer: 'FOOT UJI', ratio: '4:5', output: 'poster' });
  await tick(100);
  check('v203: imgSetStructured mengisi field editor', (document.getElementById('img-title')?.value || '') === 'Judul Uji' && (document.getElementById('img-body')?.value || '') === 'Paragraf body uji.' && (document.getElementById('img-listicle')?.value || '') === 'Poin satu\nPoin dua', (document.getElementById('img-title')?.value || '') + ' / ' + (document.getElementById('img-body')?.value || ''));
  check('v203: imgSetStructured mengatur rasio + output', (document.getElementById('img-ratio')?.value || '') === '4:5', document.getElementById('img-ratio')?.value || '');
  check('v203: pratinjau prompt memuat Body', (document.getElementById('img-preview')?.textContent || '').includes('Body: Paragraf body uji.'), (document.getElementById('img-preview')?.textContent || '').slice(0, 120));

  // 15. v173: preset pola carousel @marketingharry (pola saja, cap tetap 6-10).
  await setSel('img-output', 'carousel');
  check('v173: toggle template tampil di Carousel', disp('img-tpl-wrap') !== 'none', disp('img-tpl-wrap'));
  const tpl = document.getElementById('img-tpl-mh');
  check('v173: preset default mati', tpl && tpl.checked === false, String(tpl?.checked));
  await setSel('img-slides', '8');
  document.getElementById('img-brief').value = 'uji pola mh';
  document.getElementById('img-brief').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await tick(100);
  tpl.checked = true;
  tpl.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('v173: mengaktifkan preset mematikan Tanpa teks', document.getElementById('img-textfree').checked === false, String(document.getElementById('img-textfree').checked));
  const promptsBefore = imgPrompts.length;
  document.getElementById('img-generate').click();
  await waitFor(() => imgPrompts.length >= promptsBefore + 8, '8 prompt carousel preset', 120);
  const mh = imgPrompts.slice(promptsBefore);
  check('v173: 8 prompt sesuai jumlah slide (bukan 11)', mh.length === 8, String(mh.length));
  check('v173: prompt slide 1 memuat lock + peran cover + 4:5', mh[0].includes('bright red accent') && mh[0].includes('cover slide') && mh[0].includes('portrait 4:5') && mh[0].includes('slide 1 of 8'), mh[0].slice(0, 200));
  check('v173: prompt slide tengah memuat peran content', mh[3].includes('content slide') && mh[3].includes('slide 4 of 8'), mh[3].slice(0, 200));
  check('v173: prompt slide akhir memuat peran closing + SHARE', mh[7].includes('closing slide') && mh[7].includes('SHARE') && mh[7].includes('slide 8 of 8'), mh[7].slice(0, 200));
  check('v173: preset tidak memuat klausa tanpa-teks', mh.every((x) => !x.includes('no text, no words')), mh[0].slice(0, 200));
  tpl.checked = false;
  tpl.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  await setSel('img-output', 'poster');
  check('v173: toggle template sembunyi di Poster', disp('img-tpl-wrap') === 'none', disp('img-tpl-wrap'));

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-image exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-IMAGE ALL PASSED' : 'RIG-IMAGE FAILED');
process.exit(failed === 0 ? 0 : 1);
