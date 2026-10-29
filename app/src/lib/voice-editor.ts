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
  const base = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_') || 'audio';
  return 'ved-' + Date.now() + '-' + base;
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
  const ch = buf.getChannelData(0);
  const min = new Float32Array(cols);
  const max = new Float32Array(cols);
  const step = Math.max(1, Math.floor(ch.length / cols));
  for (let c = 0; c < cols; c++) {
    let lo = 0;
    let hi = 0;
    const start = c * step;
    const end = Math.min(ch.length, start + step);
    for (let i = start; i < end; i++) {
      if (ch[i] < lo) lo = ch[i];
      if (ch[i] > hi) hi = ch[i];
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
    if (sel && audio.currentTime >= sel.end) {
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
    void audio.play();
    const btn = el<HTMLButtonElement>('vedPlay');
    if (btn) btn.textContent = tr('ved.pause');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(vedTick);
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
  return 'audio/wav';
}

export async function vedLoadAsset(id: string, seekTo?: number): Promise<void> {
  const list = loadAssets();
  const asset = list.find((a) => a.id === id);
  if (!asset) return;
  try {
    const r = (await invoke('audio_read', { req: { name: asset.file } })) as {
      b64: string;
    };
    const bytes = b64ToBytes(r.b64);
    const blob = new Blob([bytes as unknown as BlobPart], { type: mimeFor(asset.file) });
    const audio = el<HTMLAudioElement>('vedAudio');
    if (!audio) return;
    if (current?.url) URL.revokeObjectURL(current.url);
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.load();
    const buf = await decodeBytes(bytes);
    current = { asset, buf, url };
    peaks = buf ? computePeaks(buf, 900) : null;
    sel = null;
    renderSelInfo();
    const btn = el<HTMLButtonElement>('vedPlay');
    if (btn) btn.textContent = tr('ved.play');
    if (seekTo !== undefined) audio.currentTime = seekTo;
    setNote(asset.name);
    vedDraw();
    vedRenderTranscript(asset.id);
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
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
    const file = sanitizeFile(current.asset.file.replace(/\.[^.]+$/, '') + '-' + suffix + '.wav');
    await invoke('audio_save', { req: { name: file, b64: bytesToB64(wav) } });
    const list = loadAssets();
    list.unshift({
      id: 'ved-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name: current.asset.name + ' (' + suffix + ')',
      file,
      source: current.asset.source,
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
  if (!sel) {
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
  // Potong = gabung [0, start) + (end, dur] jadi aset baru (asal utuh).
  const src = current.buf;
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
    const file = sanitizeFile(current.asset.file.replace(/\.[^.]+$/, '') + '-tanpa-seleksi.wav');
    await invoke('audio_save', { req: { name: file, b64: bytesToB64(wav) } });
    const list = loadAssets();
    list.unshift({
      id: 'ved-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name: current.asset.name + ' (tanpa seleksi)',
      file,
      source: current.asset.source,
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
  if (list.length === 0) {
    box.innerHTML = '<p style="color:#a1a1a1;font-size:13px">' + esc(tr('ved.empty')) + '</p>';
    return;
  }
  box.innerHTML = list
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
  try {
    await invoke('audio_delete', { req: { name: asset.file } });
  } catch {
    // File mungkin sudah hilang dari disk; metadata tetap dibersihkan.
  }
  saveAssets(list.filter((a) => a.id !== id));
  if (current?.asset.id === id) {
    current = null;
    peaks = null;
    sel = null;
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
    }
    vedRenderAssets();
    vedRenderTranscript(id);
    setNote(
      r.segments.length === 0
        ? tr('ved.no_speech')
        : tr('ved.transcript') + ' (' + r.segments.length + ' segmen)',
    );
  } catch (e) {
    setNote(tr('vs.error') + (e instanceof Error ? e.message : String(e)));
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
      void vedLoadAsset(asset.id, sec).then(() => {
        const audio = el<HTMLAudioElement>('vedAudio');
        if (audio && audio.paused) vedPlay();
      });
    });
  });
}

async function vedRegisterBytes(
  bytes: Uint8Array,
  name: string,
  source: VedAsset['source'],
): Promise<void> {
  try {
    const file = sanitizeFile(name);
    await invoke('audio_save', { req: { name: file, b64: bytesToB64(bytes) } });
    const buf = await decodeBytes(bytes);
    const list = loadAssets();
    list.unshift({
      id: 'ved-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
      name,
      file,
      source,
      createdAt: Date.now(),
      duration: buf?.duration ?? 0,
      transcript: null,
    });
    saveAssets(list);
    vedRenderAssets();
  } catch {
    // Gagal simpan (mis. kuota): hasil tetap bisa diputar dari player asal.
  }
}

/** Dipanggil dari voicestudio.ts/sherpa.ts setelah generate sukses. */
export async function vedRegisterBlob(
  url: string,
  name: string,
  source: VedAsset['source'],
): Promise<void> {
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    await vedRegisterBytes(new Uint8Array(buf), name, source);
  } catch {
    // Abaikan: player asal tetap berfungsi.
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
    await vedRegisterBytes(b64ToBytes(b64), name, source);
  } catch {
    // Abaikan: player asal tetap berfungsi.
  }
}

async function vedUpload(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    await vedRegisterBytes(new Uint8Array(buf), file.name, 'upload');
    setNote(tr('ved.saved'));
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
    dragging = true;
    moved = false;
    x0 = toSec(e.clientX);
    sel = { start: x0, end: x0 };
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
  cv.addEventListener('mouseleave', () => {
    dragging = false;
    vedDraw();
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
