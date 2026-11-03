// Rig VoiceStudio (jsdom, test-only): membuktikan wiring tab Voice di
// bundle yang sudah di-build — BUKAN mock logika bisnis:
//  1. (v67: tombol Setup DIHAPUS dari tab; v215: fungsi vsSetup*
//     + command vs_install DIHAPUS PENUH dari kode) Tombol Setup
//     (Pasang + Buka) TIDAK ada dan #vsSetupNote TIDAK ada; stub
//     vs_install ikut dihapus — pemanggilan vs_install kini membuat
//     rig GAGAL (tripwire), membuktikan tidak ada lagi pemanggilnya.
//  2. Generate TTS saat backend mati MEMANGGIL vs_launch DULU sebelum
//     fetch /v1/audio/speech (urutan auto-launch agen).
//  3. Bila backend sudah hidup, Generate TIDAK memanggil vs_launch lagi.
//  4. Audio hasil kembali ke MiniMe: #vsAudio.src terisi + note selesai.
//  5. Voice Editor (v65): kanvas waveform + daftar aset + panel transkrip
//     + input unggah ada; aset seed tampil dengan tombol Muat/Transkrip/
//     Hapus — TANPA tombol Unduh (dedup: unduh sudah ada di player
//     generasi) dan TANPA tombol Putar seleksi (dedup: Putar memutar
//     seleksi bila ada).
//  6. Transkrip: klik Transkrip memanggil whisper_transcribe, segmen
//     tampil dengan waktu + teks, klik segmen memuat aset + seek.
//  7. v222 (aktivasi otomatis): klik tab Voice / tombol Muat ulang
//     saat backend mati MEMANGGIL vs_launch dulu (bukan sekadar
//     periksa) lalu status jadi Terhubung; tick watchdog memanggil
//     vs_launch bila tab Voice aktif, dan DIAM bila tab tak aktif.
//  8. v223 (proxy Rust): semua API :3900 lewat invoke vs_api (bukan
//     fetch WebView yang diblokir CORS VoiceStudio); fetch langsung
//     :3900 membuat rig GAGAL (tripwire); TTS + Clone lewat proxy.
//  9. v224 (hapus): judul 'Panel VoiceStudio' + catatan #vsEmbedNote
//     TIDAK ADA lagi; koneksi dibuktikan badge status, bukan catatan.
// 10. v225 (hapus): paragraf sherpa.note + daftar Model lokal TIDAK
//     ADA lagi; pilihan model mengunci ke default (omnivoice) — cek
//     §v215 diubah dari klik-pilih menjadi model default.
// Jalankan: npm run rig:vs (butuh dist ter-build + jsdom devDependency).
// Keluar 0 bila semua lolos, 1 bila ada yang gagal.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dir, '..', 'dist');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
// Transform test-only (pola rig lama): jsdom tidak mengeksekusi script
// type=module — pindahkan bundle ke akhir body sebagai script klasik.
const modMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!modMatch) throw new Error('script module dist tidak ditemukan');
html = html.replace(modMatch[0], '').replace('</body>', `<script src="${modMatch[1]}"></script></body>`);

const log = [];
let backendAlive = false;

function makeResp({ ok = true, status = 200, jsonData = null, blobData = null, contentType = 'application/json' } = {}) {
  return {
    ok,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => jsonData,
    blob: async () => blobData ?? new Blob(['RIFF....'], { type: 'audio/wav' }),
    text: async () => (jsonData ? JSON.stringify(jsonData) : ''),
  };
}

async function invokeStub(cmd, args) {
  log.push('invoke:' + cmd);
  if (cmd === 'vs_api') {
    const req = (args && args.req) || {};
    const p = String(req.path || '');
    log.push('vs_api:' + p);
    if (!backendAlive) throw new Error('backend mati');
    if (p === '/v1/models') return { ok: true, status: 200, contentType: 'application/json', text: JSON.stringify([{ id: 'tts-1' }, { id: 'tts-1-hd' }]), b64: '' };
    if (p === '/v1/audio/voices') return { ok: true, status: 200, contentType: 'application/json', text: '[]', b64: '' };
    if (p === '/health') return { ok: true, status: 200, contentType: 'application/json', text: JSON.stringify({ status: 'ok', device: 'mps', version: '0.5.7' }), b64: '' };
    if (p === '/v1/audio/speech') {
      try { const b = JSON.parse(req.body || '{}'); if (b.model) log.push('speech-model:' + b.model); } catch (_) {}
      return { ok: true, status: 200, contentType: 'audio/wav', text: '', b64: 'UklGRg==' };
    }
    if (p === '/generate') return { ok: true, status: 200, contentType: 'audio/wav', text: '', b64: 'UklGRg==' };
    throw new Error('unexpected vs_api path ' + p);
  }
  if (cmd === 'vs_launch') {
    backendAlive = true;
    return { backendUp: true, appPath: '/Applications/VoiceStudio.app' };
  }
  if (cmd === 'audio_save') return { file: 'ved-test.wav', bytes: 4 };
  if (cmd === 'audio_read') return { file: 'ved-test.wav', b64: 'UklGRg==', bytes: 4 };
  if (cmd === 'audio_delete') return { file: 'ved-test.wav', deleted: true };
  if (cmd === 'audio_path') return { path: '/Users/mac/minime-audio/ved-test.wav' };
  if (cmd === 'video_write_ass') return { path: '/Users/mac/Movies/minime-ve2/caption-uji.ass' };
  if (cmd === 'whisper_transcribe') {
    return { segments: [{ start: 2.5, end: 4.0, text: 'Halo dunia' }], text: 'Halo dunia' };
  }
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url, opts) {
  const u = String(url);
  const p = u.replace(/^https?:\/\/127\.0\.0\.1:3900/, '');
  log.push('fetch:' + p);
  if (p === '/v1/models' || p === '/v1/audio/voices' || p === '/v1/audio/speech' || p === '/health') {
    // v223 tripwire: API :3900 TIDAK BOLEH lagi lewat fetch WebView
    // (CORS VoiceStudio memblokir origin Tauri) — harus via vs_api.
    throw new Error('fetch langsung :3900 dilarang (v223: pakai vs_api)');
  }
  if (p === '/health') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ jsonData: { status: 'ok', device: 'mps', version: '0.5.7' } });
  }
  if (u.startsWith('http://localhost:3901/')) {
    // Probe UI embed (no-cors di app asli): resolve = port menjawab.
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({});
  }
  throw new Error('unexpected fetch ' + u);
}

const dom = new JSDOM(html, {
  url: 'file://' + distDir + '/index.html',
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__TAURI_INTERNALS__ = { invoke: invokeStub };
    window.fetch = fetchStub;
    window.URL.createObjectURL = () => 'blob:vs-test';
    // jsdom dengan URL file:// = opaque origin: akses localStorage asli
    // melempar. Shim memori ini dipakai app + rig (seed aset v65).
    const mem = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; },
        clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
      },
      configurable: true,
      writable: true,
    });
  },
});

const { document } = dom.window;
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const v = fn();
    if (v) return v;
    await tick();
  }
  throw new Error('timeout menunggu ' + label);
}

const failures = [];
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' — ' + extra));
  if (!cond) failures.push(name);
}

try {
  await waitFor(() => document.querySelector('[data-view="media"]'), 'tombol rail media');
  document.querySelector('[data-view="media"]').click();
  await tick(100);
  const voiceBtn = await waitFor(() => document.getElementById('ms-tabbtn-voice'), 'tombol tab voice');
  voiceBtn.click();
  await tick(100);
  const panel = document.getElementById('ms-tab-voice');
  check('panel voice tampil', panel && panel.style.display !== 'none');

  const btns = [...panel.querySelectorAll('button')].map((b) => b.textContent.trim());
  // v67: UI Setup dihapus atas perintah Patria — yang dicek kini
  // adalah KETIADAANNYA, bukan keberadaannya (ekspektasi rig lama
  // diperbarui, bukan kode yang dilemahkan).
  check('tombol Setup VoiceStudio hilang', !btns.includes('Pasang VoiceStudio') && !btns.includes('Buka & Periksa Backend'), btns.join('|'));
  check('catatan Setup hilang', !document.getElementById('vsSetupNote'));
  // Label 'Periksa status' dipakai bersama Sherpa — yang membuktikan
  // baris VoiceStudio hilang adalah JUMLAHNYA: tinggal 1 (Sherpa
  // saja), dulu 2 (VoiceStudio + Sherpa).
  check('Periksa status tinggal satu (Sherpa saja)', btns.filter((b) => b === 'Periksa status').length === 1, btns.join('|'));

  // Uji urutan agen: backend mati -> Generate harus launch dulu.
  log.length = 0;
  backendAlive = false;
  document.getElementById('vsText').value = 'Halo, ini uji suara MiniMe.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate').click();
  await tick(500);
  const launchIdx = log.indexOf('invoke:vs_launch');
  const speechIdx = log.indexOf('vs_api:/v1/audio/speech');
  check('Generate memanggil vs_launch saat backend mati', launchIdx >= 0, log.join(','));
  check('vs_launch SEBELUM vs_api speech (urutan agen)', launchIdx >= 0 && speechIdx > launchIdx, log.join(','));
  check('audio kembali ke MiniMe (player terisi)', document.getElementById('vsAudio')?.src === 'blob:vs-test', document.getElementById('vsAudio')?.src || '');
  check('note TTS selesai', (document.getElementById('vsNote')?.textContent || '').includes('siap'), document.getElementById('vsNote')?.textContent || '');

  // Panel embed VoiceStudio: probe :3901 + cek koneksi API.
  backendAlive = true;
  check('panel embed ada (iframe + status, TANPA catatan)', !!document.getElementById('vsEmbedFrame') && !!document.getElementById('vsEmbedStatus') && !document.getElementById('vsEmbedNote'));
  [...document.querySelectorAll('.vs-embed button')].find((b) => b.textContent.trim() === 'Muat ulang').click();
  await tick(300);
  check('embed: iframe terpasang saat :3901 menjawab', document.getElementById('vsEmbedFrame')?.getAttribute('src') === 'http://localhost:3901', document.getElementById('vsEmbedFrame')?.getAttribute('src') || '');
  check('embed: status Terhubung', (document.getElementById('vsEmbedStatus')?.textContent || '').includes('Terhubung'), document.getElementById('vsEmbedStatus')?.textContent || '');
  check('v224: judul Panel VoiceStudio hilang', ![...panel.querySelectorAll('h4')].some((h) => h.textContent.trim() === 'Panel VoiceStudio'), [...panel.querySelectorAll('h4')].map((h) => h.textContent.trim()).join('|'));
  check('v225: daftar Model lokal tidak ada', !document.getElementById('vsModelList') && ![...panel.querySelectorAll('h4')].some((h) => h.textContent.trim() === 'Model lokal'), [...panel.querySelectorAll('h4')].map((h) => h.textContent.trim()).join('|'));

  // Backend sudah hidup -> Generate tidak launch lagi.
  log.length = 0;
  document.getElementById('vsText').value = 'Kedua kalinya langsung jalan.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate').click();
  await tick(500);
  check('Generate tanpa vs_launch saat backend hidup', !log.includes('invoke:vs_launch'), log.join(','));
  check('speech tetap terpanggil (via vs_api)', log.includes('vs_api:/v1/audio/speech'), log.join(','));

  // Voice Editor v65: elemen statis + daftar aset + transkrip.
  check('editor: kanvas + transport + unggah + panel ada',
    !!document.getElementById('vedCanvas') && !!document.getElementById('vedPlay') &&
    !!document.getElementById('vedUpload') && !!document.getElementById('vedAssets') &&
    !!document.getElementById('vedTranscript') && !!document.getElementById('vedAudio'));
  dom.window.localStorage.setItem('minime.voiceAssets', JSON.stringify([
    { id: 'ved-test-1', name: 'Uji Suara', file: 'ved-test.wav', source: 'tts', createdAt: Date.now(), duration: 0, transcript: null },
  ]));
  voiceBtn.click();
  await tick(200);
  const assetBox = document.getElementById('vedAssets');
  const assetBtns = [...assetBox.querySelectorAll('button')].map((b) => b.textContent.trim());
  check('editor: aset seed tampil + tombol Muat/Transkrip/Hapus', assetBox.textContent.includes('Uji Suara') &&
    assetBtns.includes('Muat ke editor') && assetBtns.includes('Transkrip') && assetBtns.includes('Hapus'), assetBtns.join('|'));
  check('editor: TANPA tombol Unduh (dedup)', !assetBtns.includes('Unduh'), assetBtns.join('|'));
  check('editor: TANPA tombol Putar seleksi (dedup)', ![...panel.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Putar seleksi'));
  log.length = 0;
  assetBox.querySelector('[data-ved-tr]').click();
  await tick(500);
  check('Transkrip memanggil whisper_transcribe', log.includes('invoke:whisper_transcribe'), log.join(','));
  const trBox = document.getElementById('vedTranscript');
  check('segmen transkrip tampil (waktu + teks)', trBox.textContent.includes('Halo dunia') && trBox.textContent.includes('0:02.5'), trBox.textContent);
  trBox.querySelector('[data-ved-seek]').click();
  await waitFor(() => document.getElementById('vedAudio')?.currentTime === 2.5, 'seek ke segmen');
  check('klik segmen: seek ke 2.5 dtk', document.getElementById('vedAudio').currentTime === 2.5);

  // v215 (diubah v225): daftar model DIHAPUS dari UI — pilihan model
  // mengunci ke default (omnivoice); Generate memakai model itu.
  // (b) transkrip bisa disimpan sebagai caption ASS (sidecar) lewat
  // video_write_ass.
  check('v225: paragraf Sherpa hilang', ![...panel.querySelectorAll('p')].some((p) => (p.textContent || '').includes('Engine native berdampingan')), 'paragraf sherpa.note masih ada');
  log.length = 0;
  document.getElementById('vsText').value = 'Uji model default.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate').click();
  await tick(500);
  check('v225: sintesis memakai model default omnivoice', log.includes('speech-model:omnivoice'), log.join(','));
  check('v215: tombol Simpan ASS ada di panel transkrip', !!document.getElementById('vedAssBtn'), '');
  log.length = 0;
  document.getElementById('vedAssBtn').click();
  await tick(300);
  check('v215: Simpan ASS memanggil video_write_ass', log.includes('invoke:video_write_ass'), log.join(','));
  check('v215: nota ASS menampilkan path hasil', (document.getElementById('vedNote')?.textContent || '').includes('caption-uji.ass'), document.getElementById('vedNote')?.textContent || '');

  // v219: hasil Voice Editor dipanggil sebagai aset Video Editor +
  // disimpan ke Library (kind 'audio').
  const ve2Before = () => { try { return JSON.parse(dom.window.localStorage.getItem('minime.ve2') || '{}'); } catch (_) { return {}; } };
  const libBefore = () => { try { return JSON.parse(dom.window.localStorage.getItem('minime.library.added') || '[]'); } catch (_) { return []; } };
  const assetBox2 = document.getElementById('vedAssets');
  const assetBtns2 = [...assetBox2.querySelectorAll('button')].map((b) => b.textContent.trim());
  check('v219: tombol Ke Video + Ke Library ada di baris aset', assetBtns2.includes('Ke Video') && assetBtns2.includes('Ke Library'), assetBtns2.join('|'));
  log.length = 0;
  assetBox2.querySelector('[data-ved-ve2]').click();
  await tick(300);
  check('v219: Ke Video memanggil audio_path', log.includes('invoke:audio_path'), log.join(','));
  const ve2After = ve2Before();
  const ve2Assets = ve2After.assets || [];
  check('v219: aset Audio masuk state ve2 (path absolut)', ve2Assets.some((a) => a.src === '/Users/mac/minime-audio/ved-test.wav' && a.kind === 'Audio'), JSON.stringify(ve2Assets));
  check('v219: Ke Video pindah ke tab Video', document.getElementById('ms-tab-video')?.style.display === 'block', document.getElementById('ms-tab-video')?.style.display || '');
  assetBox2.querySelector('[data-ved-lib]').click();
  await tick(300);
  const libAfter = libBefore();
  check('v219: item audio masuk Library (audioFile + kind)', libAfter.some((it) => it.kind === 'audio' && it.audioFile === 'ved-test.wav'), JSON.stringify(libAfter.map((it) => it.kind + ':' + (it.audioFile || ''))));

  // v222: aktivasi otomatis + watchdog.
  // (Status 'Terhubung' bisa sudah menempel sejak mount — reset dulu
  // supaya waitFor benar-benar menunggu aktivasi BARU, bukan status
  // lama; dan tunggu kondisi gabungan status + vs_launch.)
  const vsStatusText = () => document.getElementById('vsEmbedStatus')?.textContent || '';
  const vsResetStatus = () => { const s = document.getElementById('vsEmbedStatus'); if (s) s.textContent = 'Belum terhubung'; };
  backendAlive = false; log.length = 0; vsResetStatus();
  document.getElementById('ms-tabbtn-voice').click();
  await waitFor(() => vsStatusText().includes('Terhubung') && log.includes('invoke:vs_launch'), 'tab Voice mengaktifkan backend');
  check('v222: klik tab Voice memanggil vs_launch saat backend mati', log.includes('invoke:vs_launch'), log.join(','));
  check('v222: status panel jadi Terhubung sesudah aktivasi tab', vsStatusText().includes('Terhubung'), vsStatusText());
  backendAlive = false; log.length = 0; vsResetStatus();
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Muat ulang').click();
  await waitFor(() => vsStatusText().includes('Terhubung') && log.includes('invoke:vs_launch'), 'Muat ulang mengaktifkan backend');
  check('v222: Muat ulang memanggil vs_launch saat backend mati', log.includes('invoke:vs_launch'), log.join(','));
  check('v222: status panel jadi Terhubung sesudah Muat ulang', vsStatusText().includes('Terhubung'), vsStatusText());
  document.querySelector('button[data-view="media"]').click();
  await tick(100);
  backendAlive = false; log.length = 0;
  await dom.window.vsVoiceWatchdogTick();
  await tick(300);
  check('v222: watchdog memanggil vs_launch bila tab Voice aktif + backend mati', log.includes('invoke:vs_launch'), log.join(','));
  document.getElementById('ms-tabbtn-script').click();
  await tick(100);
  backendAlive = false; log.length = 0;
  await dom.window.vsVoiceWatchdogTick();
  await tick(300);
  check('v222: watchdog DIAM bila tab Voice tak aktif', !log.includes('invoke:vs_launch'), log.join(','));

  // v223: TTS + Clone lewat proxy Rust (bukan fetch WebView).
  backendAlive = true; log.length = 0;
  document.getElementById('vsText').value = 'Uji suara lewat proxy.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate').click();
  await tick(500);
  check('v223: TTS speech lewat vs_api (bukan fetch)', log.includes('vs_api:/v1/audio/speech'), log.join(','));
  check('v223: TTS tidak memakai fetch langsung :3900', !log.some((l) => l.startsWith('fetch:/v1/') || l.startsWith('fetch:/health')), log.join(','));
  check('v223: audio TTS kembali (player terisi)', document.getElementById('vsAudio')?.src === 'blob:vs-test', document.getElementById('vsAudio')?.src || '');
  document.getElementById('vsCloneText').value = 'Uji kloning lewat proxy.';
  Object.defineProperty(document.getElementById('vsRefFile'), 'files', { value: [new dom.window.File(['RIFF....'], 'ref.wav', { type: 'audio/wav' })], configurable: true });
  log.length = 0;
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate Clone').click();
  await tick(500);
  check('v223: Clone menyimpan ref_audio lewat audio_save', log.includes('invoke:audio_save'), log.join(','));
  check('v223: Clone generate lewat vs_api', log.includes('vs_api:/generate'), log.join(','));
  check('v223: audio Clone kembali (player terisi)', document.getElementById('vsCloneAudio')?.src === 'blob:vs-test', document.getElementById('vsCloneAudio')?.src || '');
  check('v223: nota Clone selesai', (document.getElementById('vsCloneNote')?.textContent || '').includes('siap'), document.getElementById('vsCloneNote')?.textContent || '');
} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures.push('rig error');
}

console.log(failures.length === 0 ? 'RIG-VS ALL PASSED' : 'RIG-VS FAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
