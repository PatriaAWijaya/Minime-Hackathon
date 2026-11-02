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
  if (cmd === 'image_save') return {};
  if (cmd === 'video_save') return { path: '/tmp/omni-uji.mp4' };
  if (cmd === 'video_probe') return { duration: 8 };
  if (cmd === 'open_external_url') return {};
  if (cmd === 'social_oauth_listen') return new Promise(() => {});
  if (cmd === 'social_meta_exchange') return '{"access_token":"rig-meta-tok","expires_in":3600}';
  if (cmd === 'social_meta_pages') return '{"data":[{"id":"rig-page-1","name":"Rig Page","access_token":"rig-page-tok"}]}';
  if (cmd === 'social_publish') return 'ok';
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

  // ===== v208: naskah per baris + QC + Gerbang 2 =====
  check('v208: seksi naskah tampil sesudah Gerbang 1 (30 tombol Buat Ulang)',
    !!btn('plan-scripts') && !!btn('plan-scripts-approve')
    && document.querySelectorAll('#plan30-main [data-act="plan-regen"]').length === 30);
  btn('plan-scripts-approve').click();
  await tick(200);
  check('v208: Gerbang 2 terkunci sebelum ada naskah (30 baris diblokir)',
    (document.getElementById('p30ScriptStatus')?.textContent || '').includes('30'), document.getElementById('p30ScriptStatus')?.textContent || '');
  btn('plan-scripts').click();
  await waitFor(() => {
    const tas = Array.from(document.querySelectorAll('textarea[id^="p30Script-"]'));
    return tas.length === 30 && tas.every((t) => (t.value || '').includes('Naskah Uji')) ? true : null;
  }, '30 naskah terisi', 400);
  check('v208: 30 naskah terisi + badge hari 1 QC LOLOS',
    document.getElementById('p30Badge-1')?.textContent === 'QC: LOLOS', document.getElementById('p30Badge-1')?.textContent || '');
  const ta1 = document.getElementById('p30Script-1');
  ta1.value = 'Judul: Edit manual';
  ta1.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('v208: edit manual menandai baris sebagai Diedit manual',
    document.getElementById('p30Badge-1')?.textContent === 'Diedit manual', document.getElementById('p30Badge-1')?.textContent || '');
  btn('plan-scripts-approve').click();
  await tick(200);
  const cardTxt2 = document.getElementById('plan30-main')?.textContent || '';
  check('v208: Gerbang 2 lolos (badge disetujui + Buat Naskah nonaktif)',
    cardTxt2.includes('Naskah disetujui') && btn('plan-scripts')?.disabled === true, cardTxt2.slice(0, 160));
  check('v208: total 64 panggilan model (4 + 30 draf + 30 QC)', modelCalls === 64, 'modelCalls=' + modelCalls);

  // ===== v209: visual + caption + Gerbang 3 =====
  store.set('minime.geminiKey', 'rig-key');
  check('v209: seksi visual tampil sesudah Gerbang 2 (gaya + 3 tombol)',
    !!btn('plan-visuals') && !!btn('plan-captions') && !!btn('plan-visual-approve') && !!document.getElementById('p30Style'));
  const cardEst = document.getElementById('plan30-main')?.textContent || '';
  check('v209: estimasi 92 gambar + 40 klip (12 + 10x8, 8x5 beat)',
    cardEst.includes('92 gambar') && cardEst.includes('40 klip'), cardEst.slice(0, 200));
  btn('plan-visuals').click();
  await waitFor(() => {
    const b1 = document.getElementById('p30MediaBadge-1')?.textContent;
    const b3 = document.getElementById('p30MediaBadge-3')?.textContent;
    const b23 = document.getElementById('p30MediaBadge-23')?.textContent;
    if (b1 !== 'Siap' || b3 !== 'Siap' || b23 !== 'Siap') return null;
    const p23 = document.getElementById('p30MediaBadge-23')?.parentElement?.querySelector('p')?.textContent || '';
    return (p23.match(/omni-uji\.mp4/g) || []).length === 5 ? true : null;
  }, 'visual 30 baris Siap + 5 klip reels hari 23', 600);
  check('v209: badge visual Siap (image/carousel/reels) + 5 klip hari 23',
    document.getElementById('p30MediaBadge-1')?.textContent === 'Siap'
    && document.getElementById('p30MediaBadge-3')?.textContent === 'Siap'
    && document.getElementById('p30MediaBadge-23')?.textContent === 'Siap');
  const imgCallsBefore = log.filter((l) => l.includes('images/generations')).length;
  check('v209: 92 panggilan gambar (12 + 80 slide)', imgCallsBefore === 92, 'imgCalls=' + imgCallsBefore);
  btn('plan-visuals').click();
  await tick(500);
  const imgCallsAfter = log.filter((l) => l.includes('images/generations')).length;
  check('v209: batch visual kedua tidak mengulang baris Siap (tanpa bayar ulang)', imgCallsAfter === imgCallsBefore, imgCallsBefore + ' -> ' + imgCallsAfter);
  btn('plan-captions').click();
  await waitFor(() => {
    const tas = Array.from(document.querySelectorAll('textarea[id^="p30Caption-"]'));
    return tas.length === 30 && tas.every((t) => (t.value || '').trim().length > 0) ? true : null;
  }, '30 caption terisi', 400);
  check('v209: 30 caption terisi', document.querySelectorAll('textarea[id^="p30Caption-"]').length === 30);
  const callsBefore = modelCalls;
  btn('plan-captions').click();
  await tick(500);
  check('v209: batch caption kedua melewati baris bercaption (0 panggilan baru)', modelCalls === callsBefore, callsBefore + ' -> ' + modelCalls);
  btn('plan-visual-approve').click();
  await tick(200);
  const cardTxt3 = document.getElementById('plan30-main')?.textContent || '';
  check('v209: Gerbang 3 lolos (badge disetujui + Buat Visual nonaktif)',
    cardTxt3.includes('Visual + caption disetujui') && btn('plan-visuals')?.disabled === true, cardTxt3.slice(0, 160));

  // ===== v210: batch 3 kanal + draf bertanggal + H-3 =====
  check('v210: seksi batch tampil sesudah Gerbang 3', !!btn('plan-batch'));
  btn('plan-batch').click();
  await tick(300);
  const q = JSON.parse(store.get('minime.socialQueue') || '[]');
  const byPlat = { instagram: 0, threads: 0, linkedin: 0 };
  for (const it of q) { if (byPlat[it.platform] !== undefined) byPlat[it.platform]++; }
  const day1ig = q.find((it) => it.planDay === 1 && it.platform === 'instagram');
  const day3ig = q.find((it) => it.planDay === 3 && it.platform === 'instagram');
  const day23ig = q.find((it) => it.planDay === 23 && it.platform === 'instagram');
  check('v210: 90 draf (30 baris x 3 kanal), semua status draft',
    q.length === 90 && byPlat.instagram === 30 && byPlat.threads === 30 && byPlat.linkedin === 30
    && q.every((it) => it.status === 'draft'), JSON.stringify(byPlat) + ' total=' + q.length);
  check('v210: tanggal hari 1 = 2026-11-10 09:00 WIB',
    day1ig && day1ig.scheduledAt === Date.parse('2026-11-10T02:00:00.000Z'), day1ig ? String(day1ig.scheduledAt) : 'tidak ada');
  check('v210: image hari 1 membawa berkas; carousel hari 3 membawa 8 slide; reels hari 23 membawa 5 klip',
    day1ig && day1ig.imageFile === 'p30-d1-1.webp'
    && day3ig && day3ig.imageFile === 'p30-d3-1.webp' && (day3ig.imageFiles || []).length === 8
    && day23ig && (day23ig.videoFiles || []).length === 5 && !day23ig.imageFile,
    (day1ig?.imageFile || '') + ' / ' + (day3ig?.imageFiles?.length ?? -1) + ' / ' + (day23ig?.videoFiles?.length ?? -1));
  check('v210: tombol batch terkunci sesudah batch (tanpa duplikat)',
    btn('plan-batch')?.disabled === true);
  // H-3: satu draf batch dibuat jatuh tempo -> seksi pengingat tampil.
  const q2 = JSON.parse(store.get('minime.socialQueue') || '[]');
  q2[0].scheduledAt = Date.now() + 86400000;
  store.set('minime.socialQueue', JSON.stringify(q2));
  dom.window.showView('planner');
  dom.window.renderPlanner();
  await tick(300);
  const remindTxt = document.querySelector('.soc-remind')?.textContent || '';
  check('v210: draf batch yang jatuh tempo masuk seksi pengingat H-3',
    remindTxt.includes('Naskah Uji'), remindTxt.slice(0, 160));
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-plan30 exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-PLAN30 ALL PASSED' : 'RIG-PLAN30 FAILED');
process.exit(failed === 0 ? 0 : 1);
