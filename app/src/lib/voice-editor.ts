import { invoke } from '@tauri-apps/api/core';
import { tr } from './i18n.js';
import { esc } from './esc.js';

// Voice Editor (v65): timeline waveform + daftar aset + transkrip
// Whisper, di tab Voice Media Studio.
//
// Arsitektur jujur:
// - Aset = file audio di ~/minime-audio/ (Rust audio_save/read/delete)
//   + metadata di localStorage minime.voiceAssets (nama, sumber,
//   durasi, transkrip). Hasil TTS/clone/Sherpa otomatis didaftarkan
//   lewat vedRegisterBlob/vedRegisterDataUrl (dipanggil dari
//   voicestudio.ts/sherpa.ts); unggahan lewat input file di editor.
// - Waveform = Web Audio decodeAudioData -> puncak min/maks per kolom
//   -> canvas. Tanpa AudioContext (mis. rig jsdom) editor tetap
//   menampilkan daftar + transkrip; waveform/trim nonaktif dengan
//   catatan jelas, bukan gambar palsu.
// - Edit NON-DESTRUKTIF: trim/potong selalu menyimpan aset BARU;
//   file asal tidak pernah ditimpa.
// - Transkrip = whisper_transcribe Rust (whisper-cli + ggml-small,
//   Bahasa Indonesia, timestamp segmen). Bila biner/model hilang,
//   perintah gagal dengan pesan jelas — tidak ada teks karangan.

export interface VedSegment {
  start: number;
  end: number;
  text: string;
}

export interface VedAsset {
  id: string;
  name: string;
  file: string;
  source: 'tts' | 'clone' | 'sherpa' | 'upload';
  createdAt: number;
  duration: number;
  transcript: { segments: VedSegment[]; text: string } | null;
}

const LS = 'minime.voiceAssets';
let current: { asset: VedAsset; buf: AudioBuffer | null; url: string } | null = null;
let peaks: { min: Float32Array; max: Float32Array } | null = null;
let sel: { start: number; end: number } | null = null;
let raf = 0;
let bound = false;
let lastTranscriptId: string | null = null;
// Audit v66: token muatan (V-B3) — hasil decode basi diabaikan bila
// pengguna sudah memuat aset lain / menghapus aset di tengah jalan.
let loadSeq = 0;
// ID yang sedang ditranskrip (V-M3): klik ganda tidak menjalankan
// dua proses whisper bersamaan.
const transcribing = new Set<string>();
// localStorage aset korup (V-M8): dibaca sekali, dicadangkan, dan
// ditampilkan sebagai peringatan — bukan ditimpa diam-diam.
let assetsCorrupt = false;
let lastAssetsSig = '';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setNote(msg: string): void {
  const n = el('vedNote');
  if (n) n.textContent = msg;
}

export function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return m + ':' + sec.toFixed(1).padStart(4, '0');
}

function loadAssets(): VedAsset[] {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as VedAsset[]) : [];
  } catch {
    // Audit v66 V-M8: jangan kembalikan [] diam-diam — penyimpanan
    // berikutnya akan menimpa metadata lama. Cadangkan raw korup dan
    // tandai; vedRenderAssets menampilkan peringatan.
    if (!assetsCorrupt) {
      assetsCorrupt = true;
      try {
        const raw = localStorage.getItem(LS);
        if (raw) localStorage.setItem(LS + '.corrupt', raw);
      } catch {
        // Cadangan pun gagal: peringatan tetap tampil.
      }
    }
    return [];
  }
}

function saveAssets(list: VedAsset[]): void {
  try {
    localStorage.setItem(LS, JSON.stringify(list));
  } catch {
    // Kuota localStorage penuh: aset di disk tetap ada, daftar sesi ini saja yang hilang.
  }
}

function sanitizeFile(name: string): string {
  // Audit v66 V-M7 + tabrakan milidetik: runtuhkan titik beruntun
  // ('..' di tengah selalu ditolak safe_name Rust) dan tambah suffix
  // acak (dua simpan dalam milidetik yang sama tidak lagi menimpa
  // file yang sama).
  let base = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_');
  base = base.replace(/\.+/g, '.');
  if (!base.replace(/\./g, '')) base = 'audio';
  return 'ved-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '-' + base;
}

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  }
  return btoa(out);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getCtx(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AC ? new AC() : null;
  } catch {
    return null;
  }
}

async function decodeBytes(bytes: Uint8Array): Promise<AudioBuffer | null> {
  const ctx = getCtx();
  if (!ctx) return null;
  try {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return await ctx.decodeAudioData(copy);
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => {});
  }
}

function computePeaks(buf: AudioBuffer, cols: number): { min: Float32Array; max: Float32Array } {
  // Audit v66 (minor): gabung SEMUA kanal — dulu hanya kanal 0,
  // sehingga stereo yang keras di kanan tampil datar.
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const len = chans.length ? chans[0].length : 0;
  const min = new Float32Array(cols);
  const max = new Float32Array(cols);
  const step = Math.max(1, Math.floor(len / cols));
  for (let c = 0; c < cols; c++) {
    let lo = 0;
    let hi = 0;
    const start = c * step;
    const end = Math.min(len, start + step);
    for (const ch of chans) {
      for (let i = start; i < end; i++) {
        if (ch[i] < lo) lo = ch[i];
        if (ch[i] > hi) hi = ch[i];
      }
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
}

function vedDraw(): void {
  const cv = el<HTMLCanvasElement>('vedCanvas');
  if (!cv) return;
  const g = cv.getContext('2d');
  if (!g) return;
  const w = cv.width;
  const h = cv.height;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#161616';
  g.fillRect(0, 0, w, h);
  const dur = current?.buf?.duration ?? 0;
  // Garis tengah.
  g.strokeStyle = '#3a3a3a';
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  if (peaks && dur > 0) {
    g.strokeStyle = '#a1a1a1';
    g.beginPath();
    for (let c = 0; c < peaks.min.length; c++) {
      const x = c;
      const y0 = h / 2 - peaks.max[c] * (h / 2 - 4);
      const y1 = h / 2 - peaks.min[c] * (h / 2 - 4);
      g.moveTo(x, y0);
      g.lineTo(x, y1);
    }
    g.stroke();
    // Ticks waktu (maks ~12 label).
    const steps = [1, 2, 5, 10, 30, 60, 120];
    const step = steps.find((s) => dur / s <= 12) ?? 300;
    g.fillStyle = '#717171';
    g.font = '11px sans-serif';
    for (let t = 0; t <= dur; t += step) {
      const x = (t / dur) * w;
      g.fillRect(x, h - 8, 1, 8);
      g.fillText(fmtTime(t), x + 2, h - 12);
    }
  }
  // Seleksi.
  if (sel && dur > 0) {
    const x0 = (sel.start / dur) * w;
    const x1 = (sel.end / dur) * w;
    g.fillStyle = 'rgba(166,235,177,0.22)';
    g.fillRect(x0, 0, x1 - x0, h);
    g.strokeStyle = '#A6EBB1';
    g.strokeRect(x0, 0, x1 - x0, h);
  }
  // Playhead.
  const audio = el<HTMLAudioElement>('vedAudio');
  if (audio && dur > 0 && isFinite(audio.currentTime)) {
    const x = (audio.currentTime / dur) * w;
    g.strokeStyle = '#EB87B4';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    g.lineWidth = 1;
  }
}

function vedTick(): void {
  const audio = el<HTMLAudioElement>('vedAudio');
  const timeEl = el('vedTime');
  if (audio && timeEl) {
    timeEl.textContent =
      fmtTime(audio.currentTime) + ' / ' + fmtTime(current?.buf?.duration ?? NaN);
    // Seleksi di bawah ambang (sisa jalur mouseleave lama) tidak
    // boleh menghentikan putar — seleksi valid selalu >= 0,05 dtk.
    if (sel && sel.end - sel.start >= 0.05 && audio.currentTime >= sel.end) {
      void audio.pause();
      const btn = el<HTMLButtonElement>('vedPlay');
      if (btn) btn.textContent = tr('ved.play');
      cancelAnimationFrame(raf);
      raf = 0;
      vedDraw();
      return;
    }
  }
  vedDraw();
  if (audio && !audio.paused) raf = requestAnimationFrame(vedTick);
}

export function vedPlay(): void {
  const audio = el<HTMLAudioElement>('vedAudio');
  if (!audio || !current) {
    setNote(tr('ved.no_audio'));
    return;
  }
  if (audio.paused) {
    // Satu tombol Putar, tanpa tumpang tindih dengan tombol seleksi:
    // bila ada seleksi dan playhead di luar seleksi, mulai dari awal
    // seleksi; bila tidak ada seleksi, putar semua. Berhenti di akhir
    // seleksi sudah ditangani vedTick.
    if (sel && (audio.currentTime < sel.start || audio.currentTime >= sel.end)) {
      audio.currentTime = sel.start;
    }
    // Audit v66 V-M9: play() bisa ditolak (decode gagal, blokir
    // autoplay) — label 'Jeda' + RAF hanya bila play() resolve.
    // Lingkungan tanpa Promise play() (rig jsdom) memakai perilaku
    // lama (label + RAF langsung).
    const playRes = audio.play() as unknown;
    if (playRes && typeof (playRes as Promise<void>).then === 'function') {
      (playRes as Promise<void>).then(() => {
        const btn = el<HTMLButtonElement>('vedPlay');
        if (btn) btn.textContent = tr('ved.pause');
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(vedTick);
      }).catch((e) => {
        const btn = el<HTMLButtonElement>('vedPlay');
        if (btn) btn.textContent = tr('ved.play');
        setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
      });
    } else {
      const btn = el<HTMLButtonElement>('vedPlay');
      if (btn) btn.textContent = tr('ved.pause');
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(vedTick);
    }
  } else {
    audio.pause();
    const btn = el<HTMLButtonElement>('vedPlay');
    if (btn) btn.textContent = tr('ved.play');
    cancelAnimationFrame(raf);
    raf = 0;
    vedDraw();
  }
}

export function vedClearSel(): void {
  sel = null;
  const info = el('vedSelInfo');
  if (info) info.textContent = '';
  vedDraw();
}

function renderSelInfo(): void {
  const info = el('vedSelInfo');
  if (!info) return;
  if (!sel) {
    info.textContent = '';
    return;
  }
  info.textContent = tr('ved.sel_info')
    .replace('{start}', fmtTime(sel.start))
    .replace('{end}', fmtTime(sel.end))
    .replace('{dur}', (sel.end - sel.start).toFixed(1));
}

function mimeFor(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'opus') return 'audio/opus';
  if (ext === 'aiff' || ext === 'aif') return 'audio/aiff';
  if (ext === 'wma') return 'audio/x-ms-wma';
  return 'audio/wav';
}

export async function vedLoadAsset(id: string, seekTo?: number): Promise<boolean> {
  const list = loadAssets();
  const asset = list.find((a) => a.id === id);
  if (!asset) return false;
  // Audit v66 (perf M1): aset yang sama sudah termuat — lewati
  // audio_read + decodeAudioData penuh, cukup seek (+transkrip).
  if (current?.asset.id === id && current.buf) {
    const audio = el<HTMLAudioElement>('vedAudio');
    if (audio && seekTo !== undefined) {
      audio.currentTime = Math.max(0, Math.min(seekTo, current.buf.duration));
    }
    lastTranscriptId = id;
    vedRenderTranscript(id);
    vedDraw();
    return true;
  }
  // Audit v66 V-B3: token muatan — hasil await yang basi (pengguna
  // memuat aset lain / menghapus aset di tengah decode) diabaikan.
  const seq = ++loadSeq;
  try {
    const r = (await invoke('audio_read', { req: { name: asset.file } })) as {
      b64: string;
    };
    if (seq !== loadSeq) return false;
    const bytes = b64ToBytes(r.b64);
    const blob = new Blob([bytes as unknown as BlobPart], { type: mimeFor(asset.file) });
    const audio = el<HTMLAudioElement>('vedAudio');
    if (!audio) return false;
    audio.pause();
    if (current?.url) URL.revokeObjectURL(current.url);
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.load();
    const buf = await decodeBytes(bytes);
    if (seq !== loadSeq) {
      // Muatan basi: cabut URL yang sempat dibuat, jangan sentuh current.
      URL.revokeObjectURL(url);
      return false;
    }
    // Audit v66 V-M10: decode gagal padahal AudioContext tersedia
    // (file bukan audio/korup) — jangan jadikan current; tampilkan
    // pesan jelas, bukan aset 'termuat' tanpa waveform dan suara.
    // Tanpa AudioContext (rig jsdom) decode memang tak mungkin:
    // pertahankan perilaku lama (current terdaftar, seek tetap jalan).
    if (!buf) {
      let hasCtx = false;
      try {
        const probe = getCtx();
        hasCtx = !!probe;
        if (probe) void probe.close().catch(() => {});
      } catch {
        hasCtx = false;
      }
      if (hasCtx) {
        URL.revokeObjectURL(url);
        audio.removeAttribute('src');
        audio.load();
        setNote(tr('ved.bad_audio'));
        return false;
      }
    }
    current = { asset, buf, url };
    peaks = buf ? computePeaks(buf, 900) : null;
    sel = null;
    renderSelInfo();
    const btn = el<HTMLButtonElement>('vedPlay');
    if (btn) btn.textContent = tr('ved.play');
    if (seekTo !== undefined) {
      if (!buf) {
        // Tanpa engine: set langsung (perilaku lama, dipakai rig).
        audio.currentTime = seekTo;
      } else {
        // Audit v66 V-M1: seek HANYA sesudah metadata siap (WebView
        // bisa melempar error atau mengabaikan seek pra-metadata).
        // Tunggu loadedmetadata (atau readyState cukup), maks 2 detik.
        const clamped = Math.max(0, Math.min(seekTo, buf.duration));
        if (audio.readyState >= 1) {
          audio.currentTime = clamped;
        } else {
          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              audio.removeEventListener('loadedmetadata', finish);
              resolve();
            };
            audio.addEventListener('loadedmetadata', finish);
            setTimeout(finish, 2000);
          });
          if (seq === loadSeq) audio.currentTime = clamped;
        }
      }
    }
    lastTranscriptId = id;
    setNote(asset.name);
    vedDraw();
    vedRenderTranscript(id);
    return true;
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
    return false;
  }
}

async function renderBufferToWav(buf: AudioBuffer): Promise<Uint8Array> {
  const chans = buf.numberOfChannels;
  const len = buf.length;
  const out = new Uint8Array(44 + len * chans * 2);
  const view = new DataView(out.buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + len * chans * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chans, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * chans * 2, true);
  view.setUint16(32, chans * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, len * chans * 2, true);
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < chans; c++) {
      const v = Math.max(-1, Math.min(1, buf.getChannelData(c)[i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return out;
}

async function sliceToAsset(
  fromSec: number,
  toSec: number,
  suffix: string,
): Promise<void> {
  if (!current?.buf) {
    setNote(tr('ved.no_audio'));
    return;
  }
  const src = current.buf;
  // Audit v66 V-M2: tangkap aset SEBELUM await render — nama file,
  // nama aset, dan sumber dibaca dari jepretan ini, bukan dari
  // current yang bisa sudah berpindah/dihapus selama render.
  const assetSnap = current.asset;
  const ctx = getCtx();
  if (!ctx) {
    setNote(tr('ved.no_engine'));
    return;
  }
  try {
    const off = new OfflineAudioContext(
      src.numberOfChannels,
      Math.max(1, Math.floor((toSec - fromSec) * src.sampleRate)),
      src.sampleRate,
    );
    const node = off.createBufferSource();
    node.buffer = src;
    node.connect(off.destination);
    node.start(0, fromSec, toSec - fromSec);
    const rendered = await off.startRendering();
    const wav = await renderBufferToWav(rendered);
    const file = sanitizeFile(assetSnap.file.replace(/\.[^.]+$/, '') + '-' + suffix + '.wav');
    await invoke('audio_save', { req: { name: file, b64: bytesToB64(wav) } });
    const list = loadAssets();
    list.unshift({
      id: 'ved-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name: assetSnap.name + ' (' + suffix + ')',
      file,
      source: assetSnap.source,
      createdAt: Date.now(),
      duration: rendered.duration,
      transcript: null,
    });
    saveAssets(list);
    vedRenderAssets();
    setNote(tr('ved.saved'));
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  } finally {
    void ctx.close().catch(() => {});
  }
}

export function vedTrimSel(): void {
  if (!sel || sel.end - sel.start < 0.05) {
    setNote(tr('ved.no_sel'));
    return;
  }
  void sliceToAsset(sel.start, sel.end, 'potongan');
}

export async function vedCutSel(): Promise<void> {
  if (!current?.buf || !sel) {
    setNote(!current?.buf ? tr('ved.no_audio') : tr('ved.no_sel'));
    return;
  }
  // Audit v66 V-M4: seleksi nol-lebar dan seleksi penuh ditolak —
  // dulu menghasilkan WAV 1 sampel (hening) atas nama aset baru.
  if (sel.end - sel.start < 0.05) {
    setNote(tr('ved.no_sel'));
    return;
  }
  if (sel.start <= 0.05 && sel.end >= current.buf.duration - 0.05) {
    setNote(tr('ved.full_cut'));
    return;
  }
  // Potong = gabung [0, start) + (end, dur] jadi aset baru (asal utuh).
  const src = current.buf;
  const assetSnap = current.asset;
  const ctx = getCtx();
  if (!ctx) {
    setNote(tr('ved.no_engine'));
    return;
  }
  try {
    const total = src.duration - (sel.end - sel.start);
    const off = new OfflineAudioContext(
      src.numberOfChannels,
      Math.max(1, Math.floor(total * src.sampleRate)),
      src.sampleRate,
    );
    const mk = (from: number, dur: number, at: number) => {
      const node = off.createBufferSource();
      node.buffer = src;
      node.connect(off.destination);
      node.start(at, from, dur);
    };
    mk(0, sel.start, 0);
    mk(sel.end, src.duration - sel.end, sel.start);
    const rendered = await off.startRendering();
    const wav = await renderBufferToWav(rendered);
    const file = sanitizeFile(assetSnap.file.replace(/\.[^.]+$/, '') + '-tanpa-seleksi.wav');
    await invoke('audio_save', { req: { name: file, b64: bytesToB64(wav) } });
    const list = loadAssets();
    list.unshift({
      id: 'ved-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name: assetSnap.name + ' (tanpa seleksi)',
      file,
      source: assetSnap.source,
      createdAt: Date.now(),
      duration: rendered.duration,
      transcript: null,
    });
    saveAssets(list);
    vedRenderAssets();
    setNote(tr('ved.saved'));
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  } finally {
    void ctx.close().catch(() => {});
  }
}

export function vedRenderAssets(): void {
  const box = el('vedAssets');
  if (!box) return;
  const list = loadAssets();
  // Audit v66 (perf m3): jangan rebuild + re-attach listener tiap
  // buka tab bila daftar tidak berubah.
  const sig = list.map((a) => a.id + ':' + (a.transcript ? 't' : '-') + ':' + a.duration).join('|') + (assetsCorrupt ? '|corrupt' : '');
  if (sig === lastAssetsSig && box.dataset.vedSig === sig) return;
  lastAssetsSig = sig;
  box.dataset.vedSig = sig;
  const warn = assetsCorrupt
    ? '<p style="color:#f0b429;font-size:13px">' + esc(tr('ved.corrupt')) + '</p>'
    : '';
  if (list.length === 0) {
    box.innerHTML = warn + '<p style="color:#a1a1a1;font-size:13px">' + esc(tr('ved.empty')) + '</p>';
    return;
  }
  box.innerHTML = warn + list
    .map(
      (a) =>
        '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #2a2a2a">' +
        '<div style="flex:1;min-width:0"><b>' +
        esc(a.name) +
        '</b> <span class="badge">' +
        esc(tr('ved.src.' + a.source)) +
        '</span> <span style="color:#a1a1a1;font-size:13px">' +
        esc(fmtTime(a.duration)) +
        ' · ' +
        esc(new Date(a.createdAt).toLocaleString()) +
        ' · ' +
        (a.transcript ? '✓ ' + esc(tr('ved.transcript')) : '—') +
        '</span></div>' +
        '<button class="btn btn-sm" data-ved-load="' +
        esc(a.id) +
        '">' +
        esc(tr('ved.load')) +
        '</button>' +
        '<button class="btn btn-sm" data-ved-tr="' +
        esc(a.id) +
        '">' +
        esc(tr('ved.transcribe')) +
        '</button>' +
        '<button class="btn btn-sm" data-ved-del="' +
        esc(a.id) +
        '">' +
        esc(tr('ved.delete')) +
        '</button></div>',
    )
    .join('');
  box.querySelectorAll('[data-ved-load]').forEach((b) =>
    b.addEventListener('click', () => void vedLoadAsset((b as HTMLElement).dataset.vedLoad ?? '')),
  );
  box.querySelectorAll('[data-ved-tr]').forEach((b) =>
    b.addEventListener('click', () => void vedTranscribe((b as HTMLElement).dataset.vedTr ?? '')),
  );
  box.querySelectorAll('[data-ved-del]').forEach((b) =>
    b.addEventListener('click', () => void vedDeleteAsset((b as HTMLElement).dataset.vedDel ?? '')),
  );
}

async function vedDeleteAsset(id: string): Promise<void> {
  const list = loadAssets();
  const asset = list.find((a) => a.id === id);
  if (!asset) return;
  // Audit v66 V-B3: batalkan muatan yang tertunda untuk aset ini.
  loadSeq++;
  try {
    await invoke('audio_delete', { req: { name: asset.file } });
  } catch {
    // File mungkin sudah hilang dari disk; metadata tetap dibersihkan.
  }
  saveAssets(list.filter((a) => a.id !== id));
  if (current?.asset.id === id) {
    // Audit v66 V-B2: hentikan audio SECARA TOTAL — dulu hanya
    // current = null, sehingga blob yang sedang diputar tidak bisa
    // dihentikan dari UI (vedPlay menolak karena !current).
    const audio = el<HTMLAudioElement>('vedAudio');
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (current.url) URL.revokeObjectURL(current.url);
    cancelAnimationFrame(raf);
    raf = 0;
    current = null;
    peaks = null;
    sel = null;
    renderSelInfo();
    const btn = el<HTMLButtonElement>('vedPlay');
    if (btn) btn.textContent = tr('ved.play');
    const timeEl = el('vedTime');
    if (timeEl) timeEl.textContent = '';
    vedDraw();
  }
  if (lastTranscriptId === id) {
    lastTranscriptId = null;
    const box = el('vedTranscript');
    if (box) box.innerHTML = '';
  }
  vedRenderAssets();
  setNote(tr('ved.deleted'));
}

export async function vedTranscribe(id: string): Promise<void> {
  const list = loadAssets();
  const asset = list.find((a) => a.id === id);
  if (!asset) return;
  // Audit v66 V-M3: guard in-flight — klik kedua diabaikan, bukan
  // menjalankan proses whisper kedua (2x load model ~500 MB).
  if (transcribing.has(id)) {
    setNote(tr('ved.transcribing'));
    return;
  }
  transcribing.add(id);
  lastTranscriptId = id;
  setNote(tr('ved.transcribing'));
  try {
    const r = (await invoke('whisper_transcribe', { file: asset.file })) as {
      segments: VedSegment[];
      text: string;
    };
    const updated = loadAssets();
    const target = updated.find((a) => a.id === id);
    if (target) {
      target.transcript = { segments: r.segments, text: r.text };
      saveAssets(updated);
      vedRenderAssets();
      vedRenderTranscript(id);
      setNote(
        r.segments.length === 0
          ? tr('ved.no_speech')
          : tr('ved.transcript') + ' (' + r.segments.length + ' segmen)',
      );
    } else {
      // Aset dihapus selama transkrip berjalan: jangan tampilkan
      // catatan sukses atas transkrip yang tidak tersimpan.
      vedRenderAssets();
      vedRenderTranscript(id);
      setNote('');
    }
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  } finally {
    transcribing.delete(id);
  }
}

export function vedRenderTranscript(id?: string): void {
  const box = el('vedTranscript');
  if (!box) return;
  const showId = id ?? lastTranscriptId;
  const asset = showId ? loadAssets().find((a) => a.id === showId) : undefined;
  if (!asset || !asset.transcript) {
    box.innerHTML =
      '<p style="color:#a1a1a1;font-size:13px">' + esc(tr('ved.empty_transcript')) + '</p>';
    return;
  }
  const t = asset.transcript;
  if (t.segments.length === 0) {
    box.innerHTML =
      '<p style="color:#a1a1a1;font-size:13px">' + esc(tr('ved.no_speech')) + '</p>';
    return;
  }
  box.innerHTML =
    '<button class="btn btn-sm" id="vedCopyBtn">' +
    esc(tr('ved.copy')) +
    '</button>' +
    '<div style="margin-top:8px">' +
    t.segments
      .map(
        (s) =>
          '<div data-ved-seek="' +
          s.start +
          '" style="cursor:pointer;padding:4px 0;border-bottom:1px solid #2a2a2a"><span style="color:#A6EBB1;font-size:13px">' +
          esc(fmtTime(s.start) + ' – ' + fmtTime(s.end)) +
          '</span> ' +
          esc(s.text) +
          '</div>',
      )
      .join('') +
    '</div>';
  const copyBtn = el('vedCopyBtn');
  copyBtn?.addEventListener('click', () => {
    void navigator.clipboard
      ?.writeText(t.text)
      .then(() => setNote(tr('ved.copied')))
      .catch(() => setNote(tr('vs.error') + 'clipboard'));
  });
  box.querySelectorAll('[data-ved-seek]').forEach((row) => {
    row.addEventListener('click', () => {
      const sec = parseFloat((row as HTMLElement).dataset.vedSeek ?? '0');
      void vedLoadAsset(asset.id, sec).then((ok) => {
        // Audit v66 V-M1: hanya putar bila muat sukses — dulu gagal
        // muat tetap memutar aset lama seolah segmen yang diklik.
        const audio = el<HTMLAudioElement>('vedAudio');
        if (ok && audio && audio.paused) vedPlay();
      });
    });
  });
}

async function vedRegisterBytes(
  bytes: Uint8Array,
  name: string,
  source: VedAsset['source'],
): Promise<VedAsset | null> {
  // Audit v66 V-B1: mengembalikan aset bila benar-benar tersimpan,
  // null bila gagal — pemanggil TIDAK BOLEH menampilkan 'tersimpan'
  // atas kegagalan. Decode gagal (AudioContext tersedia tapi decode
  // null = file bukan audio) juga gagal tertutup, bukan aset durasi 0.
  // Tanpa AudioContext (rig jsdom) perilaku lama dipertahankan
  // (durasi 0, tetap terdaftar) karena decode memang tak mungkin.
  const file = sanitizeFile(name);
  await invoke('audio_save', { req: { name: file, b64: bytesToB64(bytes) } });
  let buf: AudioBuffer | null = null;
  let ctxAvailable = false;
  try {
    const probe = getCtx();
    ctxAvailable = !!probe;
    if (probe) void probe.close().catch(() => {});
  } catch {
    ctxAvailable = false;
  }
  buf = await decodeBytes(bytes);
  if (ctxAvailable && !buf) throw new Error(tr('ved.bad_audio'));
  const asset: VedAsset = {
    id: 'ved-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
    name,
    file,
    source,
    createdAt: Date.now(),
    duration: buf?.duration ?? 0,
    transcript: null,
  };
  const list = loadAssets();
  list.unshift(asset);
  saveAssets(list);
  vedRenderAssets();
  return asset;
}

/** Dipanggil dari voicestudio.ts/sherpa.ts setelah generate sukses. */
export async function vedRegisterBlob(
  url: string,
  name: string,
  source: VedAsset['source'],
): Promise<void> {
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const asset = await vedRegisterBytes(new Uint8Array(buf), name, source);
    if (!asset) setNote(tr('ved.reg_failed'));
  } catch {
    // Player asal tetap berfungsi; kegagalan registrasi ditampilkan,
    // bukan hilang diam-diam (audit v66, minor).
    setNote(tr('ved.reg_failed'));
  }
}

export async function vedRegisterDataUrl(
  dataUrl: string,
  name: string,
  source: VedAsset['source'],
): Promise<void> {
  const b64 = dataUrl.split(',')[1] ?? '';
  if (!b64) return;
  try {
    const asset = await vedRegisterBytes(b64ToBytes(b64), name, source);
    if (!asset) setNote(tr('ved.reg_failed'));
  } catch {
    setNote(tr('ved.reg_failed'));
  }
}

async function vedUpload(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const asset = await vedRegisterBytes(new Uint8Array(buf), file.name, 'upload');
    if (!asset) {
      setNote(tr('vs.error') + 'gagal menyimpan');
      return;
    }
    // Audit v66 (perf M5): audio panjang tetap diterima, tapi
    // pengguna diperingatkan bahwa pemuatan/trim bisa lambat.
    setNote(asset.duration > 600 ? tr('ved.saved') + ' ' + tr('ved.long_audio') : tr('ved.saved'));
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
  } finally {
    if (input) input.value = '';
  }
}

function bindCanvas(): void {
  const cv = el<HTMLCanvasElement>('vedCanvas');
  if (!cv) return;
  let dragging = false;
  let x0 = 0;
  let moved = false;
  const toSec = (clientX: number): number => {
    const dur = current?.buf?.duration ?? 0;
    if (!dur) return 0;
    const rect = cv.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * dur;
  };
  cv.addEventListener('mousedown', (e) => {
    if (!current?.buf) {
      setNote(tr('ved.no_audio'));
      return;
    }
    // Audit v66 V-M5: mousedown TIDAK menyentuh sel — sel titik di
    // sini membuat vedTick menghentikan putar saat klik-seek. Sel
    // baru dibentuk di mousemove (bila benar-benar diseret).
    dragging = true;
    moved = false;
    x0 = toSec(e.clientX);
  });
  cv.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = toSec(e.clientX);
    if (Math.abs(x - x0) > 0.05) moved = true;
    sel = { start: Math.min(x0, x), end: Math.max(x0, x) };
    renderSelInfo();
    vedDraw();
  });
  const endDrag = (e: MouseEvent) => {
    if (!dragging) return;
    dragging = false;
    const audio = el<HTMLAudioElement>('vedAudio');
    if (!moved) {
      // Klik biasa = seek.
      sel = null;
      renderSelInfo();
      if (audio) audio.currentTime = toSec(e.clientX);
      vedDraw();
      return;
    }
    if (sel && sel.end - sel.start < 0.05) {
      sel = null;
      renderSelInfo();
    }
    vedDraw();
  };
  cv.addEventListener('mouseup', endDrag);
  // Audit v66 V-M4: mouseleave dulu hanya mematikan dragging tanpa
  // endDrag — seleksi nol-lebar tertinggal permanen (dan trim atas
  // seleksi itu menyimpan WAV 1 sampel). Jalankan endDrag yang sama.
  cv.addEventListener('mouseleave', (e) => {
    if (dragging) endDrag(e);
    else vedDraw();
  });
}

/** Dipanggil saat tab Voice dibuka + setelah perubahan aset. */
export function vedRefresh(): void {
  if (!bound) {
    bound = true;
    bindCanvas();
    const up = el<HTMLInputElement>('vedUpload');
    up?.addEventListener('change', (ev) => void vedUpload(ev));
    const audio = el<HTMLAudioElement>('vedAudio');
    audio?.addEventListener('ended', () => {
      const btn = el<HTMLButtonElement>('vedPlay');
      if (btn) btn.textContent = tr('ved.play');
      cancelAnimationFrame(raf);
      raf = 0;
      vedDraw();
    });
  }
  vedRenderAssets();
  vedRenderTranscript();
  vedDraw();
}
