// Rig VoiceStudio (jsdom, test-only): membuktikan wiring tab Voice di
// bundle yang sudah di-build — BUKAN mock logika bisnis:
//  1. (v67, perintah Patria: tombol Periksa status + seksi Setup
//     DIHAPUS dari tab) Tombol Setup (Pasang + Buka) TIDAK ada dan
//     #vsSetupNote TIDAK ada — fungsi vsSetup* dipertahankan di
//     voicestudio.ts untuk jalur upgrade, bukan dari UI.
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

async function invokeStub(cmd) {
  log.push('invoke:' + cmd);
  if (cmd === 'vs_launch') {
    backendAlive = true;
    return { backendUp: true, appPath: '/Applications/VoiceStudio.app' };
  }
  if (cmd === 'vs_install') {
    backendAlive = true;
    return { installed: true, skippedDownload: true, appPath: '/Applications/VoiceStudio.app', backendUp: true, version: 'existing' };
  }
  if (cmd === 'audio_save') return { file: 'ved-test.wav', bytes: 4 };
  if (cmd === 'audio_read') return { file: 'ved-test.wav', b64: 'UklGRg==', bytes: 4 };
  if (cmd === 'audio_delete') return { file: 'ved-test.wav', deleted: true };
  if (cmd === 'whisper_transcribe') {
    return { segments: [{ start: 2.5, end: 4.0, text: 'Halo dunia' }], text: 'Halo dunia' };
  }
  throw new Error('unexpected invoke ' + cmd);
}

async function fetchStub(url) {
  const u = String(url);
  const p = u.replace(/^https?:\/\/127\.0\.0\.1:3900/, '');
  log.push('fetch:' + p);
  if (p === '/v1/models') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ jsonData: [] });
  }
  if (p === '/v1/audio/voices') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ jsonData: [] });
  }
  if (p === '/v1/audio/speech') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ contentType: 'audio/wav' });
  }
  if (p === '/health') {
    if (!backendAlive) throw new Error('fetch failed');
    return makeResp({ jsonData: { status: 'ok', device: 'mps', version: '0.5.6' } });
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
  const speechIdx = log.indexOf('fetch:/v1/audio/speech');
  check('Generate memanggil vs_launch saat backend mati', launchIdx >= 0, log.join(','));
  check('vs_launch SEBELUM fetch speech (urutan agen)', launchIdx >= 0 && speechIdx > launchIdx, log.join(','));
  check('audio kembali ke MiniMe (player terisi)', document.getElementById('vsAudio')?.src === 'blob:vs-test', document.getElementById('vsAudio')?.src || '');
  check('note TTS selesai', (document.getElementById('vsNote')?.textContent || '').includes('siap'), document.getElementById('vsNote')?.textContent || '');

  // Panel embed VoiceStudio: probe :3901 + cek koneksi API.
  backendAlive = true;
  check('panel embed ada (iframe + status + catatan)', !!document.getElementById('vsEmbedFrame') && !!document.getElementById('vsEmbedStatus') && !!document.getElementById('vsEmbedNote'));
  [...document.querySelectorAll('.vs-embed button')].find((b) => b.textContent.trim() === 'Muat ulang').click();
  await tick(300);
  check('embed: iframe terpasang saat :3901 menjawab', document.getElementById('vsEmbedFrame')?.getAttribute('src') === 'http://localhost:3901', document.getElementById('vsEmbedFrame')?.getAttribute('src') || '');
  check('embed: status Terhubung', (document.getElementById('vsEmbedStatus')?.textContent || '').includes('Terhubung'), document.getElementById('vsEmbedStatus')?.textContent || '');
  check('embed: koneksi API terverifikasi (versi + device)', (document.getElementById('vsEmbedNote')?.textContent || '').includes('0.5.6') && (document.getElementById('vsEmbedNote')?.textContent || '').includes('mps'), document.getElementById('vsEmbedNote')?.textContent || '');

  // Backend sudah hidup -> Generate tidak launch lagi.
  log.length = 0;
  document.getElementById('vsText').value = 'Kedua kalinya langsung jalan.';
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Generate').click();
  await tick(500);
  check('Generate tanpa vs_launch saat backend hidup', !log.includes('invoke:vs_launch'), log.join(','));
  check('speech tetap terpanggil', log.includes('fetch:/v1/audio/speech'), log.join(','));

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
} catch (e) {
  console.log('FAIL rig error: ' + (e && e.message ? e.message : String(e)));
  failures.push('rig error');
}

console.log(failures.length === 0 ? 'RIG-VS ALL PASSED' : 'RIG-VS FAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
