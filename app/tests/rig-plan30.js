// Rig Alur Rencana Lewat Chat v212 (jsdom, test-only): membuktikan
// alur rencana 30 hari Skenario 2 berjalan LEWAT CHAT (bukan form) +
// entri riset chat + tidak ada lagi form panel/batch/riset:
//  0. "riset: ..." -> riset live (CARI/BUKA/LAPORAN) -> laporan di chat.
//  1. "buatkan rencana konten 30 hari" -> tanya niche/kompetitor/tanggal
//     -> riset -> laporan -> setuju -> tabel 30 baris (12/10/8).
//  2. Gerbang 1 (setuju) -> 30 naskah + QC -> Gerbang 2 (regen + gaya
//     + setuju) -> visual + caption -> Gerbang 3 (setuju) -> batch.
//  3. Batch: 90 draf bertanggal (30 x 3 kanal) + H-3.
//  4. Resume/batal: rencana tersimpan -> lanjut -> sudah dibatch ->
//     baru -> batal.
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
const imgbbCalls = [];
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
  if (cmd === 'image_save') return {};
  if (cmd === 'video_save') return { path: '/tmp/omni-uji.mp4' };
  if (cmd === 'video_probe') return { duration: 8 };
  if (cmd === 'open_external_url') return {};
  if (cmd === 'social_oauth_listen') return new Promise(() => {});
  if (cmd === 'social_meta_exchange') return '{"access_token":"rig-meta-tok","expires_in":3600}';
  if (cmd === 'social_meta_pages') return '{"data":[{"id":"rig-page-1","name":"Rig Page","access_token":"rig-page-tok"}]}';
  if (cmd === 'social_publish') return 'ok';
  if (cmd === 'image_read') return { b64: 'WEBPB64UJI', file: (args && args.req && args.req.name) || '' };
  if (cmd === 'imgbb_upload') {
    imgbbCalls.push({ mime: (args && args.req && args.req.mime) || '', b64: (args && args.req && args.req.b64) || '' });
    return { url: 'https://i.ibb.co/RIGTEST.png' };
  }
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url, opts) {
  const u = String(url);
  log.push('fetch:' + u);
  // v209: gambar Meta + klip Omni dirute dari URL-nya dulu.
  if (u.includes('images/generations')) {
    return makeResp({ jsonData: { data: [{ b64_json: 'AAAA' }] } });
  }
  if (u.includes('generativelanguage.googleapis.com')) {
    return makeResp({ jsonData: { steps: [{ type: 'model_output', content: [{ type: 'video', data: 'FAKEVIDEO' }] }] } });
  }
  // Urutan balasan model HANYA untuk panggilan model (api.meta.ai).
  if (u.includes('api.meta.ai')) {
    const body = (opts && typeof opts.body === 'string') ? opts.body : '';
    if (modelCalls >= MODEL_REPLIES.length) {
      // v208/v209: draf vs QC dibedakan dari isi body (QC memuat
      // 'Hasil agen:'); draf dibedakan per format dari promptnya.
      modelCalls++;
      let content;
      if (body.includes('Hasil agen:')) content = 'QC: LOLOS. Semua kriteria lolos.';
      else if (body.includes('carousel')) content = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => 'Slide ' + n + ': Naskah Uji ' + n + ' \u2014 isi singkat').join('\n');
      else if (body.includes('reels')) content = 'Hook: Naskah Uji\n' + [1, 2, 3, 4, 5].map((n) => 'Beat: detik ' + n + ' Naskah Uji').join('\n') + '\nCTA: Naskah Uji';
      else content = 'Judul: Naskah Uji\nSubjudul: Subjudul uji\nBody: Body uji.';
      return makeResp({ jsonData: { choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 20 } } });
    }
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
  await tick(200);
  const bodyTxt = () => document.body.textContent || '';
  const plan = () => JSON.parse(store.get('minime.plan30') || '{}');
  const say = async (msg) => {
    const inp = document.getElementById('chatInput');
    inp.value = msg;
    dom.window.sendChat();
    await tick(150);
  };
  const waitBubble = (needle, label, tries = 400) => waitFor(() => bodyTxt().includes(needle) ? true : null, label, tries);
  const imgCalls = () => log.filter((l) => l.includes('images/generations')).length;

  // Bukti form hilang (v212): tidak ada panel Rencana, form Batch, panel Riset.
  check('v212: tidak ada lagi #plan30-main / #batch-main / #rsQuery',
    !document.getElementById('plan30-main') && !document.getElementById('batch-main') && !document.getElementById('rsQuery'));

  // 0. Entri riset chat: "riset: ..." -> laporan di chat.
  store.set('minime.metaKey', 'rig-key');
  store.set('minime.geminiKey', 'rig-key');
  await say('riset: tren kopi susu Surabaya');
  await waitBubble('Tren kopi susu Surabaya 2026 naik', 'laporan riset chat', 300);
  check('v212: "riset: ..." -> laporan riset live di chat (bukan panel)',
    bodyTxt().includes('Tren kopi susu Surabaya 2026 naik') && bodyTxt().includes('https://contoh.com/kopi-susu'));
  check('v212: riset chat memakai research_search + research_fetch 1x',
    invokeCount('research_search') === 1 && invokeCount('research_fetch') === 1,
    'search=' + invokeCount('research_search') + ' fetch=' + invokeCount('research_fetch'));

  // 1. Alur rencana: pemicu -> niche -> kompetitor -> tanggal -> riset -> laporan.
  await say('buatkan rencana konten 30 hari');
  await waitBubble('Rencana konten 30 hari dimulai', 'pertanyaan niche', 200);
  await say('kopi susu Surabaya');
  await waitBubble('Kompetitornya siapa?', 'pertanyaan kompetitor', 200);
  await say('Kopi Kenangan, Janji Jiwa');
  await waitBubble('Tanggal mulai? (format YYYY-MM-DD', 'pertanyaan tanggal', 200);
  await say('2026-13-99');
  await waitBubble('Tanggal tidak dikenali', 'tanggal salah ditolak', 200);
  await say('2026-11-10');
  await waitBubble('Tren kopi susu Surabaya 2026 naik', 'laporan riset rencana', 300);
  check('v212: rencana tersimpan (niche/kompetitor/tanggal)',
    plan().niche === 'kopi susu Surabaya' && plan().competitors === 'Kopi Kenangan, Janji Jiwa' && plan().startDate === '2026-11-10',
    JSON.stringify({ niche: plan().niche, comp: plan().competitors, start: plan().startDate }));
  await say('setuju');
  await waitBubble('Tabel rencana (30 baris)', 'tabel rencana di chat', 300);
  const rows = plan().rows || [];
  const fmts = { image: 0, carousel: 0, reels: 0 };
  for (const r of rows) { if (fmts[r.format] !== undefined) fmts[r.format]++; }
  check('v212: tabel 30 baris, campuran tepat 12 image + 10 carousel + 8 reels',
    rows.length === 30 && fmts.image === 12 && fmts.carousel === 10 && fmts.reels === 8, JSON.stringify(fmts));
  check('v212: tanggal baris 1 = mulai, baris 23 = mulai+22 hari',
    rows[0]?.date === '2026-11-10' && rows[22]?.date === '2026-12-02', (rows[0]?.date || '') + ' / ' + (rows[22]?.date || ''));
  check('v212: total 7 panggilan model (2x riset 3 + 1 tabel)', modelCalls === 7, 'modelCalls=' + modelCalls);

  // 2. Gerbang 1 -> naskah + QC -> Gerbang 2 (regen + gaya) -> setuju.
  await say('setuju');
  await waitBubble('Naskah: 30 lolos', 'ringkasan naskah di chat', 600);
  check('v212: 30 naskah terisi + semua QC LOLOS',
    (plan().rows || []).length === 30 && (plan().rows || []).every((r) => (r.script || '').includes('Naskah Uji') && r.scriptState === 'ok'));
  await say('buat ulang naskah hari 1');
  await waitBubble('Naskah hari 1 dibuat ulang', 'regen naskah hari 1', 300);
  await say('gaya: photorealistic');
  await waitBubble('Gaya rencana diubah ke photorealistic', 'ubah gaya rencana', 200);
  check('v212: gaya rencana tersimpan', plan().planStyle === 'photorealistic', plan().planStyle || '');
  await say('setuju');
  await waitBubble('Visual: 30 siap', 'ringkasan visual di chat', 600);
  check('v212: 30 visual siap + 30 caption terisi',
    (plan().rows || []).every((r) => r.mediaState === 'ready' && (r.caption || '').trim()));
  check('v212: 92 panggilan gambar (12 + 80 slide)', imgCalls() === 92, 'imgCalls=' + imgCalls());
  check('v212: total 99 panggilan model (7 + 60 naskah/QC + 2 regen + 30 caption)', modelCalls === 99, 'modelCalls=' + modelCalls);

  // 3. Gerbang 3 -> batch -> antrean + H-3.
  await say('setuju');
  await waitBubble('Selesai — rencana masuk Planner', 'batch selesai di chat', 300);
  const q = JSON.parse(store.get('minime.socialQueue') || '[]');
  const byPlat = { instagram: 0, threads: 0, linkedin: 0 };
  for (const it of q) { if (byPlat[it.platform] !== undefined) byPlat[it.platform]++; }
  const day1ig = q.find((it) => it.planDay === 1 && it.platform === 'instagram');
  const day3ig = q.find((it) => it.planDay === 3 && it.platform === 'instagram');
  const day23ig = q.find((it) => it.planDay === 23 && it.platform === 'instagram');
  check('v212: 90 draf (30 baris x 3 kanal), semua status draft',
    q.length === 90 && byPlat.instagram === 30 && byPlat.threads === 30 && byPlat.linkedin === 30
    && q.every((it) => it.status === 'draft'), JSON.stringify(byPlat) + ' total=' + q.length);
  check('v212: tanggal hari 1 = 2026-11-10 09:00 WIB',
    day1ig && day1ig.scheduledAt === Date.parse('2026-11-10T02:00:00.000Z'), day1ig ? String(day1ig.scheduledAt) : 'tidak ada');
  check('v212: image hari 1 membawa berkas; carousel hari 3 membawa 8 slide; reels hari 23 membawa 5 klip',
    day1ig && day1ig.imageFile === 'p30-d1-1.webp'
    && day3ig && day3ig.imageFile === 'p30-d3-1.webp' && (day3ig.imageFiles || []).length === 8
    && day23ig && (day23ig.videoFiles || []).length === 5 && !day23ig.imageFile,
    (day1ig?.imageFile || '') + ' / ' + (day3ig?.imageFiles?.length ?? -1) + ' / ' + (day23ig?.videoFiles?.length ?? -1));
  check('v212: rencana ditandai batched + semua gerbang lolos',
    plan().batched === true && plan().approved === true && plan().scriptsApproved === true && plan().visualApproved === true);
  const q2 = JSON.parse(store.get('minime.socialQueue') || '[]');
  q2[0].scheduledAt = Date.now() + 86400000;
  store.set('minime.socialQueue', JSON.stringify(q2));
  dom.window.showView('planner');
  dom.window.renderPlanner();
  await tick(300);
  const remindTxt = document.querySelector('.soc-remind')?.textContent || '';
  check('v212: draf batch yang jatuh tempo masuk seksi pengingat H-3',
    remindTxt.includes('Naskah Uji'), remindTxt.slice(0, 160));
  check('v212: Planner native tetap tampil (kalender kartu)',
    !!document.getElementById('nativePlanner') && !!document.querySelector('.soc-cal-grid'));

  // 4. Resume / batal.
  await say('buatkan rencana konten 30 hari');
  await waitBubble('Ada rencana tersimpan', 'pertanyaan resume', 200);
  await say('lanjut');
  await waitBubble('Rencana ini sudah masuk Planner', 'resume rencana sudah dibatch', 200);
  await say('buatkan rencana konten 30 hari');
  await waitBubble('Ada rencana tersimpan', 'pertanyaan resume kedua', 200);
  await say('baru');
  await waitBubble('Rencana konten 30 hari dimulai', 'rencana baru -> tanya niche', 200);
  await say('batal');
  await waitBubble('Alur rencana dibatalkan', 'batal menutup alur', 200);
  check('v212: sesudah batal, state alur chat bersih', !store.has('minime.planChat'));

  // v244: Planner selalu punya public URL (ImgBB otomatis).
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  dom.window.HTMLCanvasElement.prototype.toDataURL = function (type) { return 'data:' + type + ';base64,UE5HREFUQQ=='; };
  dom.window.Image = class {
    set src(v) { this.naturalWidth = 64; this.naturalHeight = 64; setTimeout(() => { if (this.onload) this.onload(); }, 0); }
  };
  store.set('minime.social', JSON.stringify({ imgbbApiKey: 'RIG-API-KEY' }));
  const linksIG = await dom.window.socUploadLocalToImgbb({ kind: 'lib', imageFile: 'poster-uji.webp', mime: '' }, ['instagram', 'threads']);
  check('v244: IG+Threads webp Library -> satu unggahan PNG + link ImgBB untuk keduanya',
    linksIG.instagram === 'https://i.ibb.co/RIGTEST.png' && linksIG.threads === 'https://i.ibb.co/RIGTEST.png'
    && imgbbCalls.length === 1 && imgbbCalls[0].mime === 'image/png',
    JSON.stringify(linksIG) + ' calls=' + imgbbCalls.length + ' mime=' + (imgbbCalls[0] && imgbbCalls[0].mime));
  const linksTT = await dom.window.socUploadLocalToImgbb({ kind: 'lib', imageFile: 'poster-uji.webp', mime: '' }, ['tiktok']);
  check('v244: TikTok webp Library -> unggahan JPEG (bukan PNG)',
    linksTT.tiktok === 'https://i.ibb.co/RIGTEST.png' && imgbbCalls.length === 2 && imgbbCalls[1].mime === 'image/jpeg',
    JSON.stringify(linksTT) + ' mime=' + (imgbbCalls[1] && imgbbCalls[1].mime));
  const linkQ = await dom.window.socUploadQueueFileToImgbb('poster-uji.webp', '', 'instagram', 'RIG-API-KEY');
  check('v244: varian antrean (nama file saja) -> link ImgBB via PNG',
    linkQ === 'https://i.ibb.co/RIGTEST.png' && imgbbCalls.length === 3 && imgbbCalls[2].mime === 'image/png',
    linkQ + ' mime=' + (imgbbCalls[2] && imgbbCalls[2].mime));
  store.set('minime.social', JSON.stringify({}));
  let missingErr = '';
  try { await dom.window.socUploadLocalToImgbb({ kind: 'lib', imageFile: 'poster-uji.webp', mime: '' }, ['instagram']); }
  catch (e) { missingErr = String((e && e.message) || e || ''); }
  check('v244: tanpa API key -> gagal dengan pesan yang menyebut ImgBB (bukan diam-diam dibatalkan)',
    missingErr.includes('ImgBB'), missingErr.slice(0, 120));

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-plan30 exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-PLAN30 ALL PASSED' : 'RIG-PLAN30 FAILED');
process.exit(failed === 0 ? 0 : 1);
