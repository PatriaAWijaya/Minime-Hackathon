// Rig video generator Gemini Omni (jsdom, test-only): membuktikan panel
// Generate tab Video nyata (v181, migrasi dari Veo yang pensiun 22 Okt
// 2026) — tanpa kunci live, tanpa panggilan Google.
// Stub: POST /interactions -> steps model_output berisi video base64
// palsu; video_save -> path palsu; video_probe -> durasi 8 detik untuk
// path omni (15 untuk HyperFrames).
// Jalankan: npm run rig:video (butuh dist ter-build + jsdom devDependency).
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

const fetchLog = [];
async function fetchStub(url, opts) {
  const u = String(url);
  fetchLog.push({ url: u, body: opts && opts.body ? String(opts.body) : '' });
  const base = { ok: true, status: 200, headers: { get: () => '' }, text: async () => '', arrayBuffer: async () => new TextEncoder().encode('FAKE-MP4').buffer };
  if (u.includes('/interactions')) return { ...base, json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'video', mime_type: 'video/mp4', data: 'RkFLRS1NUDQ=' }] }], id: 'v1_uji', status: 'completed', model: 'gemini-omni-1.1-flash', object: 'interaction' }) };
  if (u.includes('generativelanguage')) return { ...base, json: async () => ({ candidates: [{ content: { parts: [{ text: '<!doctype html><html><head><script src="./gsap.min.js"></script></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="15" data-width="1080" data-height="1920"><h1 class="clip" data-start="0" data-duration="15" data-track-index="0">UJI</h1></div><script>const tl = gsap.timeline({paused:true}); window.__timelines["main"] = tl; tl.seek(0);</script></body></html>' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 50 } }) };
  return { ...base, ok: false, status: 0, json: async () => ({}) };
}
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function invokeStub(cmd, args) {
  if (cmd === 'image_read') return { b64: PNG_1X1 };
  if (cmd === 'video_save') return { path: '/Users/mac/Movies/minime-veo/omni-uji.mp4' };
  if (cmd === 'hyperframes_check') return { found: true, version: 'hyperframes 0.8.212', method: 'npx' };
  if (cmd === 'hyperframes_render') return { path: '/Users/mac/Movies/minime-hyperframes/hf-uji.mp4', quality: 'draft', bytes: 107597 };
  if (cmd === 'video_probe') return { duration: String(args?.req?.path || '').includes('omni') ? 8 : 15, size: 107597, streams: [], format_name: 'mp4' };
  throw new Error('unexpected invoke ' + cmd);
}
function makeDom(store) {
  return new JSDOM(html, {
    url: 'file://' + distDir + '/index.html',
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.__TAURI_INTERNALS__ = { invoke: invokeStub };
      window.fetch = fetchStub;
      const ls = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
      Object.defineProperty(window, 'localStorage', { value: ls });
    },
  });
}
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await tick();
  }
  throw new Error('timeout menunggu ' + label);
}
let failed = 0;
function check(name, ok, extra = '') {
  // eslint-disable-next-line no-console
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !extra ? '' : ' :: ' + String(extra).slice(0, 300)));
  if (!ok) failed++;
}
function setInput(el, value, evName) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event(evName, { bubbles: true }));
}
const ve2State = (store) => JSON.parse(store.get('minime.ve2') || '{}');
const spendState = (store) => JSON.parse(store.get('minime.videoSpend') || '{}');

const store = new Map();
store.set('minime.ve2', JSON.stringify({ clips: [], assets: [], out: '/Users/mac/Movies/minime-ve2.mp4', zoom: 1, plan: '' }));
store.set('minime.cleaned-v84', '1');
store.set('minime.cleaned-graph-v88', '1');
store.set('minime.library.added', JSON.stringify(Array.from({ length: 31 }, (_, k) => ({ o: 'Gambar: storyboard uji ' + k, a: 'Kreatif', s: 'Draf', badge: 'b-idle', content: '', kind: 'image', imageFile: 'img-uji' + k + '.webp', proj: '', addedAt: '2026-11-01' }))));
try {
  const dom = makeDom(store);
  const { document } = dom.window;
  await waitFor(() => document.querySelector('[data-view="media"]'), 'mount rail media', 100);
  document.querySelector('[data-view="media"]').click();
  await tick(100);
  document.getElementById('ms-tabbtn-video').click();
  await waitFor(() => document.getElementById('vg-generate'), 'panel video', 100);
  const status = () => document.getElementById('vg-status')?.textContent || '';

  // (a) Tanpa kunci: generate ditolak sebelum fetch Omni apa pun.
  document.getElementById('vg-generate').click();
  await waitFor(() => status().includes('Kunci Gemini'), 'status need-key', 100);
  check('v181 tanpa kunci ditolak', !fetchLog.some((f) => f.url.includes('/interactions')), fetchLog.map((f) => f.url).join(' '));

  // (b) Dengan kunci: satu POST interactions -> simpan -> aset + spend.
  store.set('minime.geminiKey', 'rig-key');
  setInput(document.getElementById('vg-prompt'), 'barista menuang latte art, sinematik', 'input');
  document.getElementById('vg-generate').click();
  await waitFor(() => status().includes('omni-uji.mp4'), 'status done', 200);
  const start = fetchLog.find((f) => f.url.includes('/interactions'));
  let body = {};
  try { body = JSON.parse(start ? start.body : '{}'); } catch { body = {}; }
  check('v181 POST ke Interactions API model gemini-omni-1.1-flash', !!start && body?.model === 'gemini-omni-1.1-flash', start ? start.url + ' ' + JSON.stringify(body?.model) : 'no-start');
  check('v181 body teks + format default (9:16, 720p, tanpa durasi)', body?.input === 'barista menuang latte art, sinematik' && body?.response_format?.aspect_ratio === '9:16' && body?.response_format?.resolution === '720p' && body?.response_format?.type === 'video' && !('durationSeconds' in (body || {})), JSON.stringify(body?.response_format));
  check('v181 satu panggilan tanpa polling', fetchLog.filter((f) => f.url.includes('/interactions')).length === 1, 'n=' + fetchLog.filter((f) => f.url.includes('/interactions')).length);
  const st = ve2State(store);
  check('v181 aset ve2 bertambah', (st.assets || []).some((a) => a.src === '/Users/mac/Movies/minime-veo/omni-uji.mp4'), JSON.stringify(st.assets));
  const sp = spendState(store);
  check('v181 spend omni 720p 8s = $0,81', sp.videos === 1 && sp.usd === 0.81, JSON.stringify(sp));

  // (c) Tambah ke timeline: klip Video dari path hasil generate.
  document.getElementById('vg-add-timeline').click();
  await tick(100);
  const st2 = ve2State(store);
  check('v181 klip timeline dari hasil generate', (st2.clips || []).some((c) => c.src === '/Users/mac/Movies/minime-veo/omni-uji.mp4' && c.track === 'Video' && c.dur === 8), JSON.stringify(st2.clips));

  // (d) v178: frame awal dari Library -> preview png (sniff, bukan webp).
  document.querySelector('[data-vg-tab="frames"]').click();
  await tick(100);
  document.getElementById('vg-first-lib').click();
  await waitFor(() => document.querySelector('.vg-ref-thumb'), 'thumbnail Library', 100);
  document.querySelector('.vg-ref-thumb').click();
  await waitFor(() => (document.getElementById('vg-first-preview')?.src || '').startsWith('data:image/png;base64,'), 'preview first png', 100);
  check('v178 frame awal Library tampil + mime png', true);

  // (e) v178: frame awal dari file -> label nama file tampil.
  const refFile = document.getElementById('vg-first-file');
  const f = new dom.window.File([new Uint8Array([1, 2, 3])], 'frame-test.png', { type: 'image/png' });
  Object.defineProperty(refFile, 'files', { value: [f], configurable: true });
  refFile.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await waitFor(() => (document.getElementById('vg-first-preview')?.parentElement?.textContent || '').includes('frame-test.png'), 'preview first file', 100);
  check('v178 frame awal file tampil', true);

  // (f) v181: generate frame awal saja -> input [gambar, teks].
  document.querySelector('[data-vg-tab="prompt"]').click();
  await tick(100);
  document.getElementById('vg-prompt').value = 'gerakan kamera pelan';
  document.getElementById('vg-prompt').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.getElementById('vg-generate').click();
  await waitFor(() => (document.getElementById('vg-status')?.textContent || '').includes('omni-uji.mp4'), 'status done first', 200);
  const starts = fetchLog.filter((x) => x.url.includes('/interactions'));
  let lastBody = {};
  try { lastBody = JSON.parse(starts[starts.length - 1].body); } catch { lastBody = {}; }
  check('v181 input frame awal [gambar, teks]', Array.isArray(lastBody?.input) && lastBody.input.length === 2 && lastBody.input[0]?.type === 'image' && lastBody.input[0]?.data === 'AQID' && lastBody.input[0]?.mime_type === 'image/png' && lastBody.input[1]?.type === 'text' && lastBody.input[1]?.text === 'gerakan kamera pelan', JSON.stringify(lastBody?.input));
  // (f2) v181: frame akhir -> input [awal, akhir, teks] (byte beda).
  document.querySelector('[data-vg-tab="frames"]').click();
  await tick(100);
  const lastFile = document.getElementById('vg-last-file');
  const lf = new dom.window.File([new Uint8Array([4, 5, 6])], 'frame-akhir.png', { type: 'image/png' });
  Object.defineProperty(lastFile, 'files', { value: [lf], configurable: true });
  lastFile.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await waitFor(() => (document.getElementById('vg-last-preview')?.parentElement?.textContent || '').includes('frame-akhir.png'), 'preview last file', 100);
  document.getElementById('vg-generate').click();
  await waitFor(() => (document.getElementById('vg-status')?.textContent || '').includes('omni-uji.mp4'), 'status done frames', 200);
  const starts2 = fetchLog.filter((x) => x.url.includes('/interactions'));
  let framesBody = {};
  try { framesBody = JSON.parse(starts2[starts2.length - 1].body); } catch { framesBody = {}; }
  check('v181 input frame awal + akhir + teks', Array.isArray(framesBody?.input) && framesBody.input.length === 3 && framesBody.input[0]?.data === 'AQID' && framesBody.input[1]?.data === 'BAUG' && framesBody.input[2]?.type === 'text', JSON.stringify(framesBody?.input));

  // (h) v179: HyperFrames sebagai pilihan model lokal (bukan panel terpisah).
  check('v179: select model ada (Omni + HyperFrames)', !!document.getElementById('vg-model') && document.getElementById('vg-model').options.length === 2);
  setInput(document.getElementById('vg-model'), 'hyperframes', 'change');
  await tick(100);
  check('v179: model HyperFrames menampilkan form HF, menyembunyikan Omni', !!document.getElementById('hf-html') && !!document.getElementById('hf-render') && !!document.getElementById('hf-quality') && !document.getElementById('vg-prompt'));
  document.getElementById('hf-sample').click();
  await tick(100);
  const hfHtmlVal = document.getElementById('hf-html').value || '';
  check('v175: contoh memuat format probe (composition-id + gsap + timeline)', hfHtmlVal.includes('data-composition-id="main"') && hfHtmlVal.includes('gsap.min.js') && hfHtmlVal.includes('window.__timelines'), hfHtmlVal.slice(0, 120));
  document.getElementById('hf-check').click();
  await waitFor(() => (document.getElementById('hf-status')?.textContent || '').includes('0.8.212'), 'status check CLI', 100);
  check('v175: Periksa CLI menampilkan versi + metode', (document.getElementById('hf-status')?.textContent || '').includes('npx'), document.getElementById('hf-status')?.textContent || '');
  document.getElementById('hf-render').click();
  await waitFor(() => (document.getElementById('hf-status')?.textContent || '').includes('hf-uji.mp4'), 'status render done', 100);
  check('v175: render stub menghasilkan path + durasi probe', (document.getElementById('hf-status')?.textContent || '').includes('15'), document.getElementById('hf-status')?.textContent || '');
  document.getElementById('hf-add-timeline').click();
  await tick(100);
  const hfClips = ve2State(store).clips || [];
  check('v175: klip HyperFrames masuk timeline', hfClips.some((c) => c.src === '/Users/mac/Movies/minime-hyperframes/hf-uji.mp4' && c.name === 'HyperFrames 15s'), JSON.stringify(hfClips));

  // (j) v181: tab References 0/3 + input [gambar, gambar, teks] + contoh.
  setInput(document.getElementById('vg-model'), 'omni', 'change');
  await tick(100);
  check('v178: tiga tab generator render', document.querySelectorAll('[data-vg-tab]').length === 3);
  document.querySelector('[data-vg-tab="refs"]').click();
  await tick(100);
  document.getElementById('vg-refs-lib').click();
  await waitFor(() => document.querySelector('.vg-ref-thumb'), 'thumbnail refs', 100);
  document.querySelectorAll('.vg-ref-thumb')[0].click();
  document.querySelectorAll('.vg-ref-thumb')[1].click();
  await tick(100);
  check('v181: 2 slot referensi terisi (2/3)', document.querySelectorAll('[data-vg-refdel]').length === 2, 'slots=' + document.querySelectorAll('[data-vg-refdel]').length);
  document.getElementById('vg-generate').click();
  await waitFor(() => (document.getElementById('vg-status')?.textContent || '').includes('omni-uji.mp4'), 'status done refs', 200);
  const refStarts = fetchLog.filter((x) => x.url.includes('/interactions'));
  let refBody = {};
  try { refBody = JSON.parse(refStarts[refStarts.length - 1].body); } catch { refBody = {}; }
  check('v181: input referensi [gambar, gambar, teks], tanpa instances', Array.isArray(refBody?.input) && refBody.input.length === 3 && refBody.input[0]?.type === 'image' && refBody.input[1]?.type === 'image' && refBody.input[2]?.type === 'text' && !refBody?.instances, JSON.stringify(refBody?.input));
  document.querySelector('[data-vg-tab="prompt"]').click();
  await tick(100);
  document.getElementById('vg-sample').click();
  await tick(50);
  check('v178: contoh prompt mengisi kolom', (document.getElementById('vg-prompt').value || '').includes('mobil sport merah'), document.getElementById('vg-prompt').value.slice(0, 120));
  document.getElementById('vg-portrait').click();
  await tick(50);
  check('v178: portrait set rasio 9:16 + isi prompt vertikal', document.getElementById('vg-aspect').value === '9:16' && (document.getElementById('vg-prompt').value || '').includes('vertikal'), 'aspect=' + document.getElementById('vg-aspect').value);
  // v184: tombol Bersihkan di tiap form input Omni + HyperFrames.
  document.querySelector('[data-vg-tab="prompt"]').click();
  await tick(50);
  setInput(document.getElementById('vg-prompt'), 'teks uji hapus', 'input');
  document.getElementById('vg-prompt-clear').click();
  await tick(50);
  check('v184: Bersihkan prompt mengosongkan kolom', (document.getElementById('vg-prompt').value || '') === '', (document.getElementById('vg-prompt').value || '').slice(0, 60));
  document.querySelector('[data-vg-tab="refs"]').click();
  await tick(100);
  document.getElementById('vg-refs-lib').click();
  await waitFor(() => document.querySelector('.vg-ref-thumb'), 'thumbnail refs v184', 100);
  document.querySelectorAll('.vg-ref-thumb')[0].click();
  await tick(100);
  check('v184: slot referensi terisi sebelum dibersihkan', document.querySelectorAll('[data-vg-refdel]').length >= 1, 'slots=' + document.querySelectorAll('[data-vg-refdel]').length);
  document.getElementById('vg-refs-clear').click();
  await tick(50);
  check('v184: Bersihkan referensi mengosongkan semua slot', document.querySelectorAll('[data-vg-refdel]').length === 0, 'slots=' + document.querySelectorAll('[data-vg-refdel]').length);
  setInput(document.getElementById('vg-model'), 'hyperframes', 'change');
  await tick(100);
  setInput(document.getElementById('hf-html'), 'prosa uji hapus', 'input');
  document.getElementById('hf-clear').click();
  await tick(50);
  check('v184: Bersihkan HyperFrames mengosongkan komposisi', (document.getElementById('hf-html').value || '') === '', (document.getElementById('hf-html').value || '').slice(0, 60));
  setInput(document.getElementById('vg-model'), 'omni', 'change');
  await tick(100);
  // v185: deskripsi -> Generate HTML -> komposisi terisi.
  setInput(document.getElementById('vg-model'), 'hyperframes', 'change');
  await tick(100);
  setInput(document.getElementById('hf-desc'), 'judul besar MINIME lalu subtitle muncul', 'input');
  document.getElementById('hf-gen-html').click();
  await waitFor(() => (document.getElementById('hf-html').value || '').includes('data-composition-id'), 'html hasil generate', 100);
  check('v185: Generate HTML mengisi komposisi dari deskripsi', (document.getElementById('hf-html').value || '').includes('data-composition-id="main"') && (document.getElementById('hf-html').value || '').includes('data-duration="15"'), (document.getElementById('hf-html').value || '').slice(0, 120));
  check('v185: generate memanggil model Gemini (bukan Omni)', fetchLog.some((f) => f.url.includes('generativelanguage')), fetchLog.map((f) => f.url).join(' '));
  setInput(document.getElementById('vg-model'), 'omni', 'change');
  await tick(100);
  // (k) v179: penghapusan + heading Video Editor.
  check('v179: ringkasan tugas + template + batch sudah tidak ada', !document.getElementById('vg-batch-run') && document.querySelectorAll('[data-vt-beat]').length === 0 && !(document.body.textContent || '').includes('Ringkasan tugas'), 'batch=' + !!document.getElementById('vg-batch-run') + ' beats=' + document.querySelectorAll('[data-vt-beat]').length);
  check('v179: heading Video Editor tampil di atas kartu editor', (document.body.textContent || '').includes('Video Editor') && !!document.querySelector('.ve2-top'), 've2-top=' + !!document.querySelector('.ve2-top'));

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL v181 rig-video :: ' + String(e && e.stack || e).slice(0, 500));
  failed++;
}
// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-VIDEO ALL PASSED' : 'RIG-VIDEO FAILED');
process.exit(failed ? 1 : 0);
