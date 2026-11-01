// Rig video generator Veo (jsdom, test-only): membuktikan panel Generate
// tab Video nyata (v167) — tanpa kunci live, tanpa panggilan Google.
// Stub: predictLongRunning -> operasi; poll pertama done:false, kedua
// done:true + URI file; unduh -> byte palsu; video_save -> path palsu.
// Jeda polling dipangkas via seam __VEO_POLL_MS__ (test-only).
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
let pollCount = 0;
async function fetchStub(url, opts) {
  const u = String(url);
  fetchLog.push({ url: u, body: opts && opts.body ? String(opts.body) : '' });
  const base = { ok: true, status: 200, headers: { get: () => '' }, text: async () => '', arrayBuffer: async () => new TextEncoder().encode('FAKE-MP4').buffer };
  if (u.includes('predictLongRunning')) return { ...base, json: async () => ({ name: 'operations/veo-uji' }) };
  if (u.includes('operations/veo-uji')) {
    pollCount++;
    if (pollCount === 1) return { ...base, json: async () => ({ done: false }) };
    return { ...base, json: async () => ({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/veo-uji' } }] } } }) };
  }
  if (u.includes('files/veo-uji')) return base;
  return { ...base, ok: false, status: 0, json: async () => ({}) };
}
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function invokeStub(cmd, args) {
  if (cmd === 'image_read') return { b64: PNG_1X1 };
  if (cmd === 'video_save') return { path: '/Users/mac/Movies/minime-veo/veo-uji.mp4' };
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
      window.__VEO_POLL_MS__ = 10;
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
store.set('minime.library.added', JSON.stringify([{ o: 'Gambar: storyboard uji', a: 'Kreatif', s: 'Draf', badge: 'b-idle', content: '', kind: 'image', imageFile: 'img-uji.webp', proj: '', addedAt: '2026-11-01' }]));
try {
  const dom = makeDom(store);
  const { document } = dom.window;
  await waitFor(() => document.querySelector('[data-view="media"]'), 'mount rail media', 100);
  document.querySelector('[data-view="media"]').click();
  await tick(100);
  document.getElementById('ms-tabbtn-video').click();
  await waitFor(() => document.getElementById('vg-generate'), 'panel veo', 100);
  const status = () => document.getElementById('vg-status')?.textContent || '';

  // (a) Tanpa kunci: generate ditolak sebelum fetch Veo apa pun.
  document.getElementById('vg-generate').click();
  await waitFor(() => status().includes('Kunci Gemini'), 'status need-key', 100);
  check('v167 tanpa kunci ditolak', !fetchLog.some((f) => f.url.includes('predictLongRunning')), fetchLog.map((f) => f.url).join(' '));

  // (b) Dengan kunci: start -> poll -> unduh -> simpan -> aset + spend.
  store.set('minime.geminiKey', 'rig-key');
  setInput(document.getElementById('vg-prompt'), 'barista menuang latte art, sinematik', 'input');
  document.getElementById('vg-generate').click();
  await waitFor(() => status().includes('veo-uji.mp4'), 'status done', 200);
  const start = fetchLog.find((f) => f.url.includes('predictLongRunning'));
  let body = {};
  try { body = JSON.parse(start ? start.body : '{}'); } catch { body = {}; }
  check('v167 start pakai model fast default', !!start && start.url.includes('veo-3.1-fast-generate-preview'), start ? start.url : 'no-start');
  check('v167 body aspek + durasi default', body?.parameters?.aspectRatio === '9:16' && body?.parameters?.durationSeconds === 8 && body?.parameters?.sampleCount === 1, JSON.stringify(body?.parameters));
  check('v167 poll sampai done', pollCount >= 2, 'poll=' + pollCount);
  const st = ve2State(store);
  check('v167 aset ve2 bertambah', (st.assets || []).some((a) => a.src === '/Users/mac/Movies/minime-veo/veo-uji.mp4'), JSON.stringify(st.assets));
  const sp = spendState(store);
  check('v167 spend fast 1080p 8s = $0,96', sp.videos === 1 && sp.usd === 0.96, JSON.stringify(sp));

  // (c) Tambah ke timeline: klip Video dari path hasil generate.
  document.getElementById('vg-add-timeline').click();
  await tick(100);
  const st2 = ve2State(store);
  check('v167 klip timeline dari hasil generate', (st2.clips || []).some((c) => c.src === '/Users/mac/Movies/minime-veo/veo-uji.mp4' && c.track === 'Video' && c.dur === 8), JSON.stringify(st2.clips));

  // (d) v168: referensi dari Library -> preview png (sniff, bukan webp).
  document.getElementById('vg-ref-lib').click();
  await waitFor(() => document.querySelector('.vg-ref-thumb'), 'thumbnail Library', 100);
  document.querySelector('.vg-ref-thumb').click();
  await waitFor(() => (document.getElementById('vg-ref-preview')?.src || '').startsWith('data:image/png;base64,'), 'preview ref png', 100);
  check('v168 ref Library tampil + mime png', true);

  // (e) v168: referensi dari file -> label nama file tampil.
  const refFile = document.getElementById('vg-ref-file');
  const f = new dom.window.File([new Uint8Array([1, 2, 3])], 'frame-test.png', { type: 'image/png' });
  Object.defineProperty(refFile, 'files', { value: [f], configurable: true });
  refFile.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await waitFor(() => (document.getElementById('vg-ref-preview')?.parentElement?.textContent || '').includes('frame-test.png'), 'preview ref file', 100);
  check('v168 ref file tampil', true);

  // (f) v168: generate dengan referensi -> body memuat image frame awal.
  document.getElementById('vg-prompt').value = 'gerakan kamera pelan';
  document.getElementById('vg-prompt').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.getElementById('vg-generate').click();
  await waitFor(() => (document.getElementById('vg-status')?.textContent || '').includes('veo-uji.mp4'), 'status done ref', 200);
  const starts = fetchLog.filter((x) => x.url.includes('predictLongRunning'));
  let lastBody = {};
  try { lastBody = JSON.parse(starts[starts.length - 1].body); } catch { lastBody = {}; }
  check('v168 body memuat image frame awal', lastBody?.instances?.[0]?.image?.bytesBase64Encoded === 'AQID' && lastBody?.instances?.[0]?.image?.mimeType === 'image/png', JSON.stringify(lastBody?.instances?.[0]?.image));
} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL v167 rig-video :: ' + String(e && e.stack || e).slice(0, 500));
  failed++;
}
// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-VIDEO ALL PASSED' : 'RIG-VIDEO FAILED');
process.exit(failed ? 1 : 0);
