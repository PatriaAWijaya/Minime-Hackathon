// Rig ve2 (jsdom, test-only): membuktikan engine timeline ve2 nyata (v80).
//  Sejak v146 seed bawaan DIHAPUS dari app: rig memakai fixture sendiri
//  (8 klip + 5 aset, id fix*) yang di-preset ke store sebelum mount.
//  1. Fixture 8 klip terrender + toolbar + output default.
//  2. Klik klip -> inspector terisi (nama + start).
//  3. Ubah Durasi -> minime.ve2 berubah (lalu dipulihkan).
//  4. Putar 0,7 dtk -> Potong membelah klip (8 -> 9) + status.
//  5. Tambah Teks -> klip Teks baru (9 -> 10).
//  6. Subtitle -> invoke video_write_ass terpanggil.
//  7. Transisi -> effect fade tersimpan di localStorage.
//  8. Simpan proyek -> status tersimpan.
//  9. Ekspor tanpa src -> status need_video (ditolak jujur).
//  10. Tambah aset (probe stub) -> aset 6; klik aset -> klip baru (10 -> 11).
//  11. Ekspor ber-src + fade -> video_render 2x (base + fade) + frame + status.
//  12. Zoom 200% -> lebar timeline berubah.
//  15. v182: tombol tambah '+' saja, jenis aset Image/Video/Audio,
//      aset gambar -> klip B-Roll 5 dtk -> ekspor pakai -loop 1.
//  16. v183: tombol '+' dengan path kosong -> dialog pemilih file asli.
// Jalankan: npm run rig:ve2 (butuh dist ter-build + jsdom devDependency).
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

const invokeLog = [];
const renderArgsLog = [];
async function invokeStub(cmd, args) {
  invokeLog.push('invoke:' + cmd);
  if (cmd === 'video_probe') {
    const pth = (args && args.req && args.req.path) || '';
    const isImg = /\.(png|jpe?g|webp|gif|bmp)$/i.test(pth);
    return { duration: isImg ? 0 : 12.5, size: 0, streams: [], format_name: isImg ? 'png' : 'mp4' };
  }
  if (cmd === 'video_read') return { b64: '' };
  if (cmd === 'video_write_ass') return { path: '/tmp/ve2-test.ass' };
  if (cmd === 'video_render') { renderArgsLog.push((args && args.req && args.req.args) || []); return { success: true, output: (args && args.req && args.req.output) || '', duration_ms: 1, stderr_tail: '' }; }
  if (cmd === 'plugin:dialog|open') return ['/tmp/picker.png'];
  if (cmd === 'video_qc') return { duration: 12.5, has_video: true, has_audio: false, black: [], silent: [], passed: true, notes: [] };
  if (cmd === 'video_capture') return { data_url: 'data:image/jpeg;base64,x' };
  if (cmd === 'image_save' || cmd === 'image_read' || cmd === 'image_delete') return {};
  if (cmd === 'open_external_url') return {};
  throw new Error('unexpected invoke ' + cmd);
}
async function fetchStub() {
  return { ok: false, status: 0, headers: { get: () => '' }, json: async () => ({}), text: async () => '' };
}

function makeDom(store) {
  const dom = new JSDOM(html, {
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
  return dom;
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

const store = new Map();
// v146: fixture pengganti seed bawaan (bentuk sama, id berbeda agar tidak
// kena migrasi dummy; nama/durasi dipertahankan supaya cek lama tetap jalan).
store.set('minime.ve2', JSON.stringify({ clips: [
  { id: 'fix1', name: 'Hook (0–8 dtk)', track: 'Video', start: 0, dur: 8, src: '', effect: 'none' },
  { id: 'fix2', name: 'Isi (8–22 dtk)', track: 'Video', start: 8, dur: 14, src: '', effect: 'none' },
  { id: 'fix3', name: 'CTA (22–30 dtk)', track: 'Video', start: 22, dur: 8, src: '', effect: 'none' },
  { id: 'fix4', name: 'B-Roll: seduh kopi', track: 'B-Roll', start: 8, dur: 14, src: '', effect: 'none' },
  { id: 'fix5', name: 'Voice-over promo bundling', track: 'Audio', start: 0, dur: 30, src: '', effect: 'none' },
  { id: 'fix6', name: 'Musik: akustik ringan', track: 'Audio', start: 0, dur: 30, src: '', effect: 'none' },
  { id: 'fix7', name: 'Overlay: TEST Kopi — Rp15.000', track: 'Teks', start: 0, dur: 9, src: '', effect: 'none' },
  { id: 'fix8', name: 'Overlay: Pesan via WA', track: 'Teks', start: 12, dur: 9, src: '', effect: 'none' },
], assets: [
  { id: 'fixa1', name: 'Footage: Kedai kopi pagi', icon: '🎬', kind: 'Video', src: '', duration: 0 },
  { id: 'fixa2', name: 'B-Roll: Seduh & sajikan', icon: '🎬', kind: 'B-Roll', src: '', duration: 0 },
  { id: 'fixa3', name: 'Voice-over: Promo bundling', icon: '🎙', kind: 'Audio', src: '', duration: 0 },
  { id: 'fixa4', name: 'Musik: Akustik ringan', icon: '🎵', kind: 'Audio', src: '', duration: 0 },
  { id: 'fixa5', name: 'Teks: Overlay harga', icon: '🔤', kind: 'Teks', src: '', duration: 0 },
], out: '/Users/mac/Movies/minime-ve2.mp4', zoom: 1 }));
try {
  const dom = makeDom(store);
  const { document } = dom.window;
  await waitFor(() => document.querySelector('[data-view="media"]'), 'mount rail media', 100);
  document.querySelector('[data-view="media"]').click();
  await tick(100);
  document.getElementById('ms-tabbtn-video').click();
  await tick(100);

  const clips = () => document.querySelectorAll('[data-ve2-clip]');
  const status = () => document.getElementById('ve2Status')?.textContent || '';

  // 1. Seed + toolbar + output.
  check('toolbar ve2 ada (4 tombol)', ['ve2BtnCut', 've2BtnText', 've2BtnSub', 've2BtnTrans'].every((id) => !!document.getElementById(id)));
  check('v146: fixture 8 klip terrender', clips().length === 8, clips().length);
  check('output default minime-ve2.mp4', document.getElementById('ve2Out')?.value === '/Users/mac/Movies/minime-ve2.mp4', document.getElementById('ve2Out')?.value);

  // 2. Klik klip -> inspector.
  document.querySelector('[data-ve2-clip="fix1"]').click();
  await tick(100);
  check('inspector nama klip fix1', document.getElementById('ve2Name')?.value === 'Hook (0–8 dtk)', document.getElementById('ve2Name')?.value);
  check('inspector start klip fix1 = 0', document.getElementById('ve2Start')?.value === '0', document.getElementById('ve2Start')?.value);

  // 3. Ubah durasi -> tersimpan, lalu pulihkan.
  setInput(document.getElementById('ve2Dur'), '10', 'change');
  await tick(100);
  check('durasi fix1 tersimpan 10', ve2State(store).clips?.find((c) => c.id === 'fix1')?.dur === 10, JSON.stringify(ve2State(store).clips?.find((c) => c.id === 'fix1')));
  setInput(document.getElementById('ve2Dur'), '8', 'change');
  await tick(100);
  check('durasi fix1 dipulihkan 8', ve2State(store).clips?.find((c) => c.id === 'fix1')?.dur === 8);

  // 4. Putar -> potong.
  const transportBtns = [...document.querySelectorAll('.ve2-transport button')];
  transportBtns[1].click(); // Putar
  await tick(700);
  document.getElementById('ve2BtnCut').click();
  await tick(100);
  check('potong: klip 8 -> 9', clips().length === 9, clips().length);
  check('status potong ok', status().includes('dibelah'), status());
  transportBtns[0].click(); // ke awal (hentikan playback)
  await tick(100);

  // 5. Tambah teks.
  document.getElementById('ve2BtnText').click();
  await tick(100);
  check('tambah teks: klip 9 -> 10', clips().length === 10, clips().length);
  check('klip teks baru bernama Teks Baru', [...clips()].some((el) => (el.textContent || '').includes('Teks Baru')));

  // 6. Subtitle.
  invokeLog.length = 0;
  document.getElementById('ve2BtnSub').click();
  await tick(200);
  check('subtitle memanggil video_write_ass', invokeLog.includes('invoke:video_write_ass'), invokeLog.join(','));
  check('status subtitle tersimpan', status().includes('/tmp/ve2-test.ass'), status());

  // 7. Transisi.
  document.querySelector('[data-ve2-clip="fix2"]').click();
  await tick(100);
  document.getElementById('ve2BtnTrans').click();
  await tick(100);
  check('transisi: effect fix2 = fade tersimpan', ve2State(store).clips?.find((c) => c.id === 'fix2')?.effect === 'fade');

  // 8. Simpan proyek.
  document.getElementById('ve2BtnSave').click();
  await tick(100);
  check('simpan proyek: status tersimpan', status().includes('tersimpan'), status());

  // 9. Ekspor tanpa src ditolak jujur.
  invokeLog.length = 0;
  document.getElementById('ve2BtnExport').click();
  await tick(200);
  check('ekspor tanpa src ditolak', status().includes('Tidak ada klip video ber-src'), status());
  check('ekspor tanpa src tidak memanggil render', !invokeLog.includes('invoke:video_render'), invokeLog.join(','));

  // 10. Tambah aset + klik aset -> klip.
  setInput(document.getElementById('ve2NewSrc'), '/tmp/klip.mp4', 'input');
  const kindSel = document.getElementById('ve2NewKind');
  kindSel.value = 'Video';
  kindSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  document.getElementById('ve2AssetAdd').click();
  await tick(200);
  check('tambah aset memanggil video_probe', invokeLog.includes('invoke:video_probe'), invokeLog.join(','));
  check('aset 5 -> 6', (ve2State(store).assets || []).length === 6, (ve2State(store).assets || []).length);
  const assetBtns = [...document.querySelectorAll('[data-ve2-asset]')];
  assetBtns[assetBtns.length - 1].click();
  await tick(100);
  check('klik aset: klip 10 -> 11', clips().length === 11, clips().length);

  // 11. Ekspor ber-src + fade: 2x render + frame + status.
  invokeLog.length = 0;
  document.getElementById('ve2BtnExport').click();
  await tick(500);
  check('ekspor memanggil video_render 2x (base + fade)', invokeLog.filter((x) => x === 'invoke:video_render').length === 2, invokeLog.join(','));
  check('ekspor memanggil video_qc + video_capture', invokeLog.includes('invoke:video_qc') && invokeLog.includes('invoke:video_capture'), invokeLog.join(','));
  check('frame hasil ekspor tampil', !!document.getElementById('ve2Frame'), '');
  check('status ekspor selesai + catatan fade', status().includes('Ekspor selesai') && status().includes('tanpa fade'), status());

  // 12. Zoom.
  const zoomSel = document.getElementById('ve2Zoom');
  zoomSel.value = '2';
  zoomSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  await tick(100);
  check('zoom 200% mengubah lebar timeline', (document.querySelector('#ve2Timeline > div')?.style?.width || '').includes('200%'), document.querySelector('#ve2Timeline > div')?.style?.width);

  // 13. v114: workstation video editor fluid — cap 880px dicabut.
  const cssLink114 = html.match(/<link[^>]*href="([^"]+\.css)"/);
  const cssText114 = (cssLink114 ? fs.readFileSync(path.join(distDir, cssLink114[1]), 'utf-8') : '');
  check('v114: CSS ter-build membuat .ms-video fluid (width 100%, tanpa cap)', cssText114.includes('.ms-video{width:100%;max-width:none}'), '');
  check('v114: cap 880px tidak ada lagi di CSS ter-build', !cssText114.includes('880px'), '');

  // 15. v182: daftar aset tiga jenis + tombol '+' + gambar ikut ekspor.
  const kindOpts = [...document.getElementById('ve2NewKind').options].map((o) => o.value).join(',');
  check('v182: opsi jenis aset hanya Image/Video/Audio', kindOpts === 'Image,Video,Audio', kindOpts);
  check('v182: tombol tambah hanya tanda +', (document.getElementById('ve2AssetAdd')?.textContent || '').trim() === '+', document.getElementById('ve2AssetAdd')?.textContent);
  setInput(document.getElementById('ve2NewSrc'), '/tmp/gambar.png', 'input');
  const kindSel182 = document.getElementById('ve2NewKind');
  kindSel182.value = 'Image';
  kindSel182.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  document.getElementById('ve2AssetAdd').click();
  await tick(200);
  const assets182 = ve2State(store).assets || [];
  const imgAsset = assets182.find((a) => a.src === '/tmp/gambar.png');
  check('v182: aset gambar masuk daftar (ikon + durasi default 5)', !!imgAsset && imgAsset.kind === 'Image' && imgAsset.duration === 5 && (imgAsset.icon || '').includes('🖼'), JSON.stringify(imgAsset));
  const assetBtns182 = [...document.querySelectorAll('[data-ve2-asset]')];
  assetBtns182[assetBtns182.length - 1].click();
  await tick(100);
  const imgClip = (ve2State(store).clips || []).find((c) => c.src === '/tmp/gambar.png');
  check('v182: klik + aset gambar -> klip B-Roll 5 dtk', !!imgClip && imgClip.track === 'B-Roll' && imgClip.dur === 5, JSON.stringify(imgClip));
  check('v182: klip 11 -> 12', clips().length === 12, clips().length);
  renderArgsLog.length = 0;
  document.getElementById('ve2BtnExport').click();
  await tick(500);
  const baseArgs = renderArgsLog[0] || [];
  const loopIdx = baseArgs.indexOf('-loop');
  const pngIdx = baseArgs.indexOf('/tmp/gambar.png');
  check('v182: ekspor gambar pakai -loop 1 sebelum input png', loopIdx !== -1 && baseArgs[loopIdx + 1] === '1' && loopIdx < pngIdx, JSON.stringify(baseArgs.slice(0, 12)));

  // 16. v183: path kosong -> dialog pemilih file -> aset gambar masuk.
  invokeLog.length = 0;
  setInput(document.getElementById('ve2NewSrc'), '', 'input');
  document.getElementById('ve2AssetAdd').click();
  await tick(200);
  const assets183 = ve2State(store).assets || [];
  const pickAsset = assets183.find((a) => a.src === '/tmp/picker.png');
  check('v183: tombol + path kosong memanggil dialog file', invokeLog.includes('invoke:plugin:dialog|open'), invokeLog.join(','));
  check('v183: hasil pilih masuk daftar sebagai Image 5 dtk', !!pickAsset && pickAsset.kind === 'Image' && pickAsset.duration === 5, JSON.stringify(pickAsset));
  check('v183: aset 7 -> 8', assets183.length === 8, assets183.length);

  // 14. v146: state kosong -> editor mulai kosong (tanpa seed dummy).
  const store2 = new Map();
  const dom2 = makeDom(store2);
  const doc2 = dom2.window.document;
  await waitFor(() => doc2.querySelector('[data-view="media"]'), 'mount2 rail media', 100);
  doc2.querySelector('[data-view="media"]').click();
  await tick(100);
  doc2.getElementById('ms-tabbtn-video').click();
  await tick(100);
  check('v146: tanpa state tersimpan, 0 klip terrender', doc2.querySelectorAll('[data-ve2-clip]').length === 0, doc2.querySelectorAll('[data-ve2-clip]').length);
  check('v146: toolbar tetap ada di editor kosong', ['ve2BtnCut', 've2BtnText', 've2BtnSub', 've2BtnTrans'].every((id) => !!doc2.getElementById(id)));
  check('v146: tidak ada nama dummy di tab Video kosong', ![...doc2.querySelectorAll('#ms-tab-video *')].some((el) => (el.textContent || '').includes('TEST Kopi')));

} catch (e) {
  // eslint-disable-next-line no-console
  console.log('FAIL rig-ve2 exception :: ' + (e && e.stack ? e.stack : e));
  failed++;
}

// eslint-disable-next-line no-console
console.log(failed === 0 ? 'RIG-VE2 ALL PASSED' : 'RIG-VE2 FAILED');
process.exit(failed === 0 ? 0 : 1);
