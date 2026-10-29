// Batch konten: perintah -> skrip konsep batch (1-30 hari) -> approve
// -> kartu draf (maks 3 visual per kartu) -> pilih / sistem pilihkan
// -> revisi via Canva (round-trip manual) -> jadwalkan ke antrean
// penjadwal native (v63: Postiz dihapus dari app).
//
// KEJUJURAN YANG DIJAGA DI SINI:
// - Auto-pick "terbaik" v1 = aturan transparan: kartu yang tidak
//   dipilih user memakai Visual 1 saat dijadwalkan. Tidak ada skor
//   kecocokan palsu; juri visi adalah v2 (butuh probe model multimodal).
// - Canva = round-trip manual: unduh + salin prompt, edit di Canva
//   (browser), unggah balik sebagai revisi. Bukan API sekali klik.
// - Jadwal native (v63): tiap kartu menjadi 1 item antrean penjadwal
//   native per kanal tujuan (socQueueAdd) — tanpa server luar.
//   Kanal tujuan dipilih saat penjadwalan dari kanal native yang
//   terhubung dan mendukung gambar (LinkedIn, Facebook Page).
//   1 gambar per kartu (gambar pertama dari pilihan); carousel
//   multi-gambar belum didukung native — tertulis jelas di catatan
//   Batch, bukan di-drop diam-diam. Setiap kartu melaporkan
//   sukses/gagal sendiri-sendiri dan yang gagal bisa diulang tanpa
//   mengulang yang berhasil.
// - Langkah jadwal ini adalah "batch step" yang diotorisasi Patria
//   28 Okt 2026 (perintah "jadwalkan otomatis dengan persetujuan
//   user" + tap "Buatkan flow ini"), dengan konfirmasi ganda di
//   tombol (arm -> eksekusi). Ini menggantikan constraint draft-only
//   di app/AGENTS.md HANYA untuk langkah batch ini.

import { invoke } from '@tauri-apps/api/core';
import { tr, getLang, MODEL_LANG_INSTRUCTION } from './i18n.js';
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { readKeys } from './chat.js';
import { readBrand, brandSuffix } from './brand.js';
import { socConnectedChannels, socQueueAdd, socMimeFromExt } from './social.js';
import { metaGenerateImage, addImgSpend, RATIO_SIZE, readThumb } from './image-api.js';
import { recordLiveCost } from './cost.js';
import { esc } from './esc.js';

export const BATCH_LS = 'minime.batch';
export type BatchChoice = { files: string[]; label: string };
export type BatchScript = { day: number; title: string; concept: string; visual: string };
export type BatchCard = {
  day: number; title: string; concept: string; visual: string;
  choices: BatchChoice[]; selected: number | null;
  status: 'draft' | 'generating' | 'ready' | 'failed' | 'scheduled';
  nativeIds: string[]; error: string;
  // Kanal asal penjadwalan pertama (audit v66 B-M2): retry harus
  // memakai kanal yang sama, bukan semua kanal yang sedang terhubung.
  platforms?: string[];
};
export type BatchState = {
  kind: 'image' | 'carousel'; topic: string; days: number; start: string;
  phase: 'form' | 'scripts' | 'cards';
  scripts: BatchScript[]; cards: BatchCard[];
  generating: boolean; genDone: number; genTotal: number;
  scheduleArmed: boolean;
};

function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function emptyBatch(): BatchState {
  return {
    kind: 'image', topic: '', days: 7, start: todayLocal(),
    phase: 'form', scripts: [], cards: [], generating: false, genDone: 0, genTotal: 0,
    scheduleArmed: false,
  };
}

export function readBatch(): BatchState {
  try {
    const raw = window.localStorage.getItem(BATCH_LS);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      const b = emptyBatch();
      if (o.kind === 'carousel') b.kind = 'carousel';
      if (typeof o.topic === 'string') b.topic = o.topic;
      if (typeof o.days === 'number') b.days = Math.max(1, Math.min(30, Math.floor(o.days)));
      if (typeof o.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.start)) b.start = o.start;
      if (o.phase === 'scripts' || o.phase === 'cards') b.phase = o.phase;
      if (Array.isArray(o.scripts)) {
        b.scripts = o.scripts.filter((x: { day?: number }) => typeof x?.day === 'number')
          .map((x: { day: number; title?: string; concept?: string; visual?: string }) => ({
            day: x.day,
            title: typeof x.title === 'string' ? x.title : '',
            concept: typeof x.concept === 'string' ? x.concept : '',
            visual: typeof x.visual === 'string' ? x.visual : '',
          }));
      }
      if (Array.isArray(o.cards)) {
        b.cards = o.cards.filter((x: { day?: number }) => typeof x?.day === 'number')
          .map((x: BatchCard) => ({
            day: x.day,
            title: typeof x.title === 'string' ? x.title : '',
            concept: typeof x.concept === 'string' ? x.concept : '',
            visual: typeof x.visual === 'string' ? x.visual : '',
            choices: Array.isArray(x.choices) ? x.choices.map((c: BatchChoice) => ({
              files: Array.isArray(c.files) ? c.files.filter((f) => typeof f === 'string') : [],
              label: typeof c.label === 'string' ? c.label : '',
            })) : [],
            selected: typeof x.selected === 'number' ? x.selected : null,
            status: x.status === 'ready' || x.status === 'failed' || x.status === 'scheduled' ? x.status : 'draft',
            nativeIds: Array.isArray(x.nativeIds) ? x.nativeIds.filter((v) => typeof v === 'string') : [],
            error: typeof x.error === 'string' ? x.error : '',
            platforms: Array.isArray(x.platforms) ? x.platforms.filter((v) => typeof v === 'string') : undefined,
          }));
      }
      if (typeof o.genDone === 'number') b.genDone = o.genDone;
      if (typeof o.genTotal === 'number') b.genTotal = o.genTotal;
      if (typeof o.scheduleArmed === 'boolean') b.scheduleArmed = o.scheduleArmed;
      // generating TIDAK dipulihkan: reload di tengah generate tidak
      // boleh meninggalkan UI terkunci pada loop yang sudah mati.
      b.generating = false;
      return b;
    }
  } catch { /* abaikan, pakai default */ }
  return emptyBatch();
}

function saveBatch(b: BatchState): void {
  try { window.localStorage.setItem(BATCH_LS, JSON.stringify(b)); } catch { /* abaikan */ }
}

let inited = false;
let cancelled = false;
// Thumbnail memakai cache bersama image-api (readThumb) — satu Map
// untuk batch + galeri + brand, bukan cache per modul.

export function initBatchFlow(): void {
  const root = document.getElementById('batch-main');
  if (!root || inited) return;
  inited = true;
  renderBatch();
}

export function batchRefreshUI(): void {
  if (!inited) return;
  renderBatch();
}

function renderBatch(): void {
  const root = document.getElementById('batch-main');
  if (!root) return;
  const b = readBatch();
  const brand = readBrand();
  const brandLine = brand.name
    ? (brand.useBrand ? tr('batch.brand.on', { name: brand.name }) : tr('batch.brand.offname', { name: brand.name }))
    : tr('batch.brand.missing');

  if (b.phase === 'form') {
    root.innerHTML =
      '<div class="se-group"><label>' + tr('batch.kind') + '</label>' +
      '<div class="se-radios">' +
      '<label><input type="radio" name="batch-kind" value="image" ' + (b.kind === 'image' ? 'checked' : '') + '> ' + tr('batch.kind.image') + '</label>' +
      '<label><input type="radio" name="batch-kind" value="carousel" ' + (b.kind === 'carousel' ? 'checked' : '') + '> ' + tr('batch.kind.carousel') + '</label>' +
      '</div></div>' +
      '<div class="se-group"><label>' + tr('batch.topic') + '</label>' +
      '<textarea class="se-field" id="batch-topic" placeholder="' + tr('batch.topic.ph') + '">' + esc(b.topic) + '</textarea></div>' +
      '<div class="se-group"><label>' + tr('batch.days') + '</label>' +
      '<input class="se-field" type="number" id="batch-days" min="1" max="30" value="' + b.days + '"></div>' +
      '<div class="se-group"><label>' + tr('batch.start') + '</label>' +
      '<input class="se-field" type="date" id="batch-start" value="' + esc(b.start) + '"></div>' +
      '<div class="se-note">' + tr('batch.channel.native') + '</div>' +
      '<div class="se-note">' + esc(brandLine) + '</div>' +
      '<button class="se-btn" id="batch-make">' + tr('batch.scripts.make') + '</button>' +
      '<div class="se-note" id="batch-note"></div>';
    bindForm();
    return;
  }

  if (b.phase === 'scripts') {
    const rows = b.scripts.map((s, i) =>
      '<div class="img-card" data-script="' + i + '">' +
      '<div class="se-group"><label>' + tr('batch.scripts.day', { n: s.day }) + '</label>' +
      '<input class="se-field" type="text" data-scripttitle="' + i + '" value="' + esc(s.title) + '" placeholder="' + tr('batch.scripts.title') + '">' +
      '<textarea class="se-field" data-scriptconcept="' + i + '" placeholder="' + tr('batch.scripts.concept') + '">' + esc(s.concept) + '</textarea>' +
      '<textarea class="se-field" data-scriptvisual="' + i + '" placeholder="' + tr('batch.scripts.visual') + '">' + esc(s.visual) + '</textarea>' +
      '<button class="se-btn2" data-scriptdel="' + i + '">' + tr('batch.scripts.del') + '</button></div>' +
      '</div>').join('');
    root.innerHTML =
      '<h4>' + tr('batch.scripts.title2', { n: b.scripts.length }) + '</h4>' +
      (rows || '<div class="se-note">' + tr('batch.scripts.empty') + '</div>') +
      '<button class="se-btn" id="batch-approve" ' + (b.scripts.length === 0 ? 'disabled' : '') + '>' + tr('batch.scripts.approve') + '</button> ' +
      '<button class="se-btn2" id="batch-backform">' + tr('batch.scripts.back') + '</button>' +
      '<div class="se-note">' + tr('batch.scripts.reapprove') + '</div>' +
      '<div class="se-note" id="batch-note"></div>';
    bindScripts();
    return;
  }

  // phase === 'cards'
  const cardsHtml = b.cards.map((c, i) => {
    const choicesHtml = c.choices.map((ch, j) => {
      const thumbs = ch.files.map((f) => '<img data-thumb="' + i + '-' + j + '-' + esc(f) + '" alt="' + esc(ch.label) + '">').join('')
        || '<div class="se-note">' + tr('batch.card.pending') + '</div>';
      return '<div class="choice' + (c.selected === j ? ' sel' : '') + '" data-choice="' + i + '-' + j + '">' +
        '<div class="choice-thumbs">' + thumbs + '</div>' +
        '<div class="se-note">' + esc(ch.label || tr('batch.card.visual', { n: j + 1 })) + '</div>' +
        '</div>';
    }).join('');
    const statusLine = c.status === 'scheduled'
      ? tr('batch.card.scheduled', { id: c.nativeIds.length ? String(c.nativeIds.length) : '?' })
      : c.status === 'failed'
        ? tr('batch.card.failed') + ' ' + esc(c.error)
        : c.status === 'ready' && c.selected === null
          ? tr('batch.card.undecided')
          : c.status === 'ready'
            ? tr('batch.card.selected', { n: (c.selected as number) + 1 })
            : tr('batch.card.pending');
    return '<div class="batch-card" data-card="' + i + '">' +
      '<div class="se-group"><strong>' + tr('batch.scripts.day', { n: c.day }) + ' · ' + esc(c.title) + '</strong>' +
      '<div class="se-note">' + esc(c.concept) + '</div></div>' +
      '<div class="choices-row">' + choicesHtml + '</div>' +
      '<div class="se-note">' + statusLine + '</div>' +
      '<div class="se-group">' +
      '<button class="se-btn2" data-canvadl="' + i + '">' + tr('batch.card.canva.download') + '</button> ' +
      '<input type="file" accept="image/*" multiple data-canvafile="' + i + '"> ' +
      '<button class="se-btn2" data-canvaup="' + i + '">' + tr('batch.card.canva.import') + '</button>' +
      (c.status === 'failed' ? ' <button class="se-btn2" data-regen="' + i + '">' + tr('batch.cards.regen') + '</button>' : '') +
      '</div></div>';
  }).join('');
  const ready = b.cards.filter((c) => c.status === 'ready').length;
  const scheduled = b.cards.filter((c) => c.status === 'scheduled').length;
  const failed = b.cards.filter((c) => c.status === 'failed').length;
  root.innerHTML =
    '<h4>' + tr('batch.cards.title', { n: b.cards.length }) + '</h4>' +
    (b.generating
      ? '<div class="se-note">' + tr('batch.gen.progress', { done: b.genDone, total: b.genTotal }) + '</div>' +
        '<button class="se-btn2" id="batch-cancelgen">' + tr('batch.gen.cancel') + '</button>'
      : '') +
    cardsHtml +
    '<div class="se-group">' +
    '<button class="se-btn2" id="batch-backscripts">' + tr('batch.cards.back') + '</button> ' +
    '<button class="se-btn" id="batch-schedule">' + (b.scheduleArmed ? tr('batch.schedule.exec', { n: ready }) : tr('batch.schedule.arm')) + '</button> ' +
    '<button class="se-btn2" id="batch-new">' + tr('batch.new') + '</button>' +
    (failed ? ' <button class="se-btn2" id="batch-retry">' + tr('batch.schedule.retry') + '</button>' : '') +
    '</div>' +
    '<div class="se-note">' + tr('batch.schedule.summary', { ready, scheduled, failed }) + '</div>' +
    (b.scheduleArmed ? '<div class="se-group">' + batchTargetChecks() + '</div>' : '') +
    '<div class="se-note">' + tr('batch.note.native') + '</div>' +
    '<div class="se-note" id="batch-note"></div>';
  bindCards();

  // Muat thumbnail dari disk (async; elemen hilang setelah re-render
  // diabaikan — render berikutnya memuat ulang).
  const loadThumb = async (file: string, sel: string) => {
    const url = await readThumb(file);
    if (!url) return;
    const el = root.querySelector(sel) as HTMLImageElement | null;
    if (el) el.src = url;
  };
  b.cards.forEach((c, i) => c.choices.forEach((ch, j) => ch.files.forEach((f) => {
    void loadThumb(f, '[data-thumb="' + i + '-' + j + '-' + f + '"]');
  })));
}

function note(msg: string): void {
  const el = document.getElementById('batch-note');
  if (el) el.textContent = msg;
}

function bindForm(): void {
  const save = (fn: (b: BatchState) => void) => {
    const cur = readBatch();
    fn(cur);
    saveBatch(cur);
  };
  document.querySelectorAll('input[name="batch-kind"]').forEach((el) => {
    el.addEventListener('change', () => save((cur) => {
      const v = (document.querySelector('input[name="batch-kind"]:checked') as HTMLInputElement | null)?.value;
      cur.kind = v === 'carousel' ? 'carousel' : 'image';
    }));
  });
  const topic = document.getElementById('batch-topic') as HTMLTextAreaElement | null;
  topic?.addEventListener('input', () => save((cur) => { cur.topic = topic.value; }));
  const days = document.getElementById('batch-days') as HTMLInputElement | null;
  days?.addEventListener('input', () => save((cur) => {
    const n = Math.floor(Number(days.value));
    cur.days = Number.isFinite(n) ? Math.max(1, Math.min(30, n)) : 7;
  }));
  const start = document.getElementById('batch-start') as HTMLInputElement | null;
  start?.addEventListener('input', () => save((cur) => { if (/^\d{4}-\d{2}-\d{2}$/.test(start.value)) cur.start = start.value; }));
  document.getElementById('batch-make')?.addEventListener('click', () => void makeScripts());
}

function parseScript(text: string, day: number): BatchScript {
  const pick = (re: RegExp): string => {
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  // Label marker SELALU Inggris (TITLE:/CONCEPT:/VISUAL:) agar parsing
  // tidak bergantung bahasa UI — nilainya dalam bahasa UI.
  const title = pick(/^TITLE:\s*(.+)$/im);
  const concept = pick(/^CONCEPT:\s*([\s\S]+?)(?=^VISUAL:|\Z)/im);
  const visual = pick(/^VISUAL:\s*([\s\S]+)$/im);
  return {
    day,
    title: title || tr('batch.scripts.day', { n: day }),
    concept: concept || text.trim(),
    visual: visual || concept || text.trim(),
  };
}

async function makeScripts(): Promise<void> {
  const b = readBatch();
  if (!b.topic.trim()) { note(tr('batch.err.topic')); return; }
  const keys = readKeys();
  if (!keys.meta && !keys.gemini) { note(tr('batch.err.key')); return; }
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] +
    ' Kamu adalah Agen Kreatif (Content Strategist).';
  const router = new ModelRouter(cfg);
  const scripts: BatchScript[] = [];
  for (let day = 1; day <= b.days; day++) {
    note(tr('batch.scripts.generating', { done: day, total: b.days }));
    const prompt = 'Topic: ' + b.topic.trim() + '\n' +
      'Content type: ' + (b.kind === 'carousel' ? 'carousel of 3 slides (hook, body, call to action)' : 'single image') + '\n' +
      'Day ' + day + ' of ' + b.days + ' in a series on this topic (vary the angle per day).\n' +
      'Output ONLY these three lines, labels in English, values in the user language:\n' +
      'TITLE: <short title>\n' +
      'CONCEPT: <2-3 sentence concept, also usable as the post caption>\n' +
      'VISUAL: <English image prompt, text-free, describing the visual>';
    try {
      const res = await router.callWithFallback(prompt, 'trace-batch-script-' + Date.now());
      recordLiveCost(res);
      scripts.push(parseScript(res.text, day));
    } catch (e) {
      note(tr('batch.err.script', { n: day }) + ' ' + (e instanceof Error ? e.message : String(e)));
      break;
    }
  }
  const cur = readBatch();
  cur.scripts = scripts;
  cur.phase = scripts.length ? 'scripts' : 'form';
  saveBatch(cur);
  renderBatch();
}

function bindScripts(): void {
  const saveOnly = (fn: (b: BatchState) => void) => {
    const cur = readBatch();
    fn(cur);
    saveBatch(cur);
  };
  const mutate = (fn: (b: BatchState) => void) => {
    const cur = readBatch();
    fn(cur);
    saveBatch(cur);
    renderBatch();
  };
  const b = readBatch();
  b.scripts.forEach((_s, i) => {
    const t = document.querySelector('[data-scripttitle="' + i + '"]') as HTMLInputElement | null;
    const c = document.querySelector('[data-scriptconcept="' + i + '"]') as HTMLTextAreaElement | null;
    const v = document.querySelector('[data-scriptvisual="' + i + '"]') as HTMLTextAreaElement | null;
    t?.addEventListener('input', () => saveOnly((cur) => { if (cur.scripts[i]) cur.scripts[i].title = t.value; }));
    c?.addEventListener('input', () => saveOnly((cur) => { if (cur.scripts[i]) cur.scripts[i].concept = c.value; }));
    v?.addEventListener('input', () => saveOnly((cur) => { if (cur.scripts[i]) cur.scripts[i].visual = v.value; }));
    document.querySelector('[data-scriptdel="' + i + '"]')?.addEventListener('click', () => mutate((cur) => { cur.scripts.splice(i, 1); }));
  });
  document.getElementById('batch-backform')?.addEventListener('click', () => mutate((cur) => { cur.phase = 'form'; }));
  document.getElementById('batch-approve')?.addEventListener('click', () => void approveAndGenerate());
}

async function approveAndGenerate(): Promise<void> {
  const cur = readBatch();
  if (!cur.scripts.length) return;
  cur.cards = cur.scripts.map((s) => ({
    day: s.day, title: s.title, concept: s.concept, visual: s.visual,
    choices: [
      { files: [], label: '' }, { files: [], label: '' }, { files: [], label: '' },
    ],
    selected: null, status: 'draft' as const, nativeIds: [], error: '',
  }));
  cur.phase = 'cards';
  saveBatch(cur);
  await runGeneration(null);
}

type GenTask = { card: number; choice: number; slide: number; prompt: string };

function buildTasks(b: BatchState, onlyCard: number | null): GenTask[] {
  const tasks: GenTask[] = [];
  const brand = brandSuffix();
  b.cards.forEach((c, ci) => {
    if (onlyCard !== null && onlyCard !== ci) return;
    if (c.status === 'scheduled') return;
    const slides = b.kind === 'carousel' ? 3 : 1;
    const roles = ['hook', 'body', 'call to action'];
    c.choices.forEach((_ch, ji) => {
      for (let k = 0; k < slides; k++) {
        if (c.choices[ji].files[k]) continue; // sudah ada -> lewati
        let p = c.visual.trim();
        if (b.kind === 'carousel') p += ' (slide ' + (k + 1) + ' of 3: ' + roles[k] + ')';
        p += ', no text, no words, no letters, no watermark';
        if (brand) p += brand;
        tasks.push({ card: ci, choice: ji, slide: k, prompt: p });
      }
    });
  });
  return tasks;
}

async function runGeneration(onlyCard: number | null): Promise<void> {
  const keys = readKeys();
  if (!keys.meta) { note(tr('batch.err.key')); return; }
  const b0 = readBatch();
  const tasks = buildTasks(b0, onlyCard);
  if (!tasks.length) { note(tr('batch.gen.done')); return; }
  cancelled = false;
  const cur = readBatch();
  cur.generating = true;
  cur.genDone = 0;
  cur.genTotal = tasks.length;
  saveBatch(cur);
  renderBatch();

  let idx = 0;
  const workers: Promise<void>[] = [];
  const worker = async () => {
    while (idx < tasks.length) {
      if (cancelled) break;
      const t = tasks[idx++];
      try {
        const b64s = await metaGenerateImage(keys.meta as string, t.prompt, 1, RATIO_SIZE[b0.kind === 'carousel' ? '1:1' : '4:5']);
        if (cancelled) break;
        if (!b64s.length) throw new Error('Meta mengembalikan 0 gambar');
        // Audit v66 $-M1: biaya dicatat SEGERA setelah generate (API
        // menagih saat itu) — dulu setelah image_save, sehingga gagal
        // simpan = tagihan luput dari catatan.
        addImgSpend(1);
        const name = 'img-batch-' + Date.now() + '-' + t.card + '-' + t.choice + '-' + t.slide + '.webp';
        await invoke('image_save', { req: { name, b64: b64s[0] } });
        const cur2 = readBatch();
        const card = cur2.cards[t.card];
        if (card && card.choices[t.choice]) {
          card.choices[t.choice].files[t.slide] = name;
          const done = card.choices.every((ch) => ch.files.filter(Boolean).length === (b0.kind === 'carousel' ? 3 : 1));
          if (done) card.status = 'ready';
          else card.status = 'generating';
        }
        cur2.genDone += 1;
        saveBatch(cur2);
        renderBatch();
      } catch (e) {
        const cur2 = readBatch();
        const card = cur2.cards[t.card];
        if (card) {
          card.status = 'failed';
          card.error = e instanceof Error ? e.message : String(e);
        }
        cur2.genDone += 1;
        saveBatch(cur2);
        renderBatch();
      }
    }
  };
  // Konkurensi dibatasi 3: rate limit Meta tidak dipublikasikan.
  for (let w = 0; w < 3; w++) workers.push(worker());
  await Promise.all(workers);
  const fin = readBatch();
  fin.generating = false;
  fin.cards.forEach((c) => { if (c.status === 'generating') c.status = 'draft'; });
  saveBatch(fin);
  note(cancelled ? tr('batch.gen.cancelled', { done: fin.genDone, total: fin.genTotal }) : tr('batch.gen.done'));
  renderBatch();
}

function bindCards(): void {
  const mutate = (fn: (b: BatchState) => void) => {
    const cur = readBatch();
    fn(cur);
    saveBatch(cur);
    renderBatch();
  };
  const b = readBatch();
  document.getElementById('batch-cancelgen')?.addEventListener('click', () => { cancelled = true; });
  document.getElementById('batch-backscripts')?.addEventListener('click', () => mutate((cur) => { cur.phase = 'scripts'; cur.scheduleArmed = false; }));
  document.getElementById('batch-new')?.addEventListener('click', () => {
    const cur = emptyBatch();
    cur.topic = b.topic; // topik dipertahankan; kartu & skrip dibuang
    saveBatch(cur);
    renderBatch();
  });
  document.getElementById('batch-retry')?.addEventListener('click', () => void scheduleBatch(true));
  document.getElementById('batch-schedule')?.addEventListener('click', () => {
    if (!b.scheduleArmed) {
      mutate((cur) => { cur.scheduleArmed = true; });
      note(tr('batch.schedule.confirm', { n: b.cards.filter((c) => c.status === 'ready').length }));
      return;
    }
    // Audit v66 B-B1: pilihan kanal HARUS dibaca SEBELUM mutate (yang
    // me-render ulang tanpa checkbox) — dulu dibaca di dalam
    // scheduleBatch setelah re-render, sehingga picked selalu kosong
    // dan semua kanal terhubung ikut terkirim walau dicopot centangnya.
    const picked = Array.from(document.querySelectorAll('.batch-tgt:checked')).map((el) => (el as HTMLInputElement).value);
    mutate((cur) => { cur.scheduleArmed = false; });
    void scheduleBatch(false, picked);
  });
  b.cards.forEach((_c, i) => {
    document.querySelectorAll('[data-choice^="' + i + '-"]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = (el as HTMLElement).dataset.choice || '';
        const j = Number(key.split('-')[1]);
        mutate((cur) => { if (cur.cards[i]) cur.cards[i].selected = j; });
      });
    });
    document.querySelector('[data-canvadl="' + i + '"]')?.addEventListener('click', () => void canvaExport(i));
    document.querySelector('[data-canvaup="' + i + '"]')?.addEventListener('click', async () => {
      const input = document.querySelector('[data-canvafile="' + i + '"]') as HTMLInputElement | null;
      const files = input?.files;
      if (!files || !files.length) { note(tr('batch.card.canva.pick')); return; }
      const names: string[] = [];
      for (const f of Array.from(files)) {
        try {
          const b64 = await readFileB64(f);
          const name = 'img-canva-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.webp';
          await invoke('image_save', { req: { name, b64 } });
          names.push(name);
        } catch (e) {
          note(tr('brand.err.save') + ' ' + (e instanceof Error ? e.message : String(e)));
          return;
        }
      }
      mutate((cur) => {
        const card = cur.cards[i];
        if (!card) return;
        card.choices.push({ files: names, label: tr('batch.card.revision') });
        card.selected = card.choices.length - 1;
      });
    });
    document.querySelector('[data-regen="' + i + '"]')?.addEventListener('click', () => void runGeneration(i));
  });
}

function readFileB64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(((r.result as string) || '').split(',')[1] || '');
    r.onerror = () => reject(new Error('gagal membaca file'));
    r.readAsDataURL(f);
  });
}

async function canvaExport(cardIdx: number): Promise<void> {
  const b = readBatch();
  const card = b.cards[cardIdx];
  if (!card) return;
  const choice = card.choices[card.selected ?? 0];
  if (!choice || !choice.files.filter(Boolean).length) { note(tr('batch.err.novisual')); return; }
  try {
    await navigator.clipboard.writeText(card.visual);
  } catch { /* clipboard boleh gagal; unduhan tetap jalan */ }
  for (const f of choice.files.filter(Boolean)) {
    try {
      const res = await invoke<{ b64: string }>('image_read', { req: { name: f } });
      const a = document.createElement('a');
      a.href = 'data:image/webp;base64,' + res.b64;
      a.download = f;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch { /* lanjut ke file berikutnya */ }
  }
  note(tr('batch.card.canva.done'));
}

function cardDateISO(start: string, day: number): string {
  const [y, m, d] = start.split('-').map(Number);
  // 09:00 WIB = 02:00 UTC.
  const t = Date.UTC(y, (m || 1) - 1, d || 1, 2, 0, 0) + (day - 1) * 86400000;
  return new Date(t).toISOString();
}

// Kanal native yang mendukung file untuk Batch (gambar disimpan di
// minime-images dan dikirim lewat perintah Rust publish — bukan URL).
// X ikut (upload media v2 dari file); TikTok tidak (foto hanya URL).
function batchFileChannels(): { id: string; name: string }[] {
  return socConnectedChannels().filter((c) => c.id === 'linkedin' || c.id === 'facebook_page' || c.id === 'x');
}

function batchTargetChecks(): string {
  const chans = batchFileChannels();
  if (!chans.length) return '<div class="se-note">' + tr('batch.schedule.nochannel') + '</div>';
  return '<div>' + tr('batch.channel.pick') + '</div>' + chans.map((c) =>
    '<label><input type="checkbox" class="batch-tgt" value="' + c.id + '" checked> ' + esc(c.name) + '</label>').join(' ');
}

async function scheduleBatch(onlyFailed: boolean, pickedOverride?: string[]): Promise<void> {
  const b = readBatch();
  const connected = batchFileChannels();
  if (!connected.length) { note(tr('batch.schedule.nochannel')); return; }
  // Target penjadwalan biasa: checkbox saat armed (diteruskan pemanggil
  // sebelum re-render — lihat B-B1). Retry (onlyFailed) tidak melewati
  // fase armed: tiap kartu memakai kanal ASALNYA (card.platforms),
  // bukan semua kanal yang sedang terhubung (audit v66 B-M2).
  const picked = pickedOverride ?? Array.from(document.querySelectorAll('.batch-tgt:checked')).map((el) => (el as HTMLInputElement).value);
  const baseTargets = picked.length ? connected.filter((c) => picked.includes(c.id)) : connected;
  if (!baseTargets.length) {
    note(tr('batch.schedule.nochannel'));
    const cur = readBatch();
    cur.scheduleArmed = true;
    saveBatch(cur);
    renderBatch();
    return;
  }
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  for (let i = 0; i < b.cards.length; i++) {
    const card = b.cards[i];
    // Audit v66 (minor): penjadwalan biasa hanya memproses 'ready'
    // (sesuai hitungan armed); kartu 'failed' hanya lewat retry.
    if (onlyFailed) {
      if (card.status !== 'failed') continue;
    } else if (card.status !== 'ready') { skipped++; continue; }
    const targets = onlyFailed && card.platforms?.length
      ? connected.filter((c) => card.platforms!.includes(c.id))
      : baseTargets;
    if (!targets.length) { skipped++; continue; }
    const choice = card.choices[card.selected ?? 0];
    const files = choice ? choice.files.filter(Boolean) : [];
    if (!files.length) {
      card.status = 'failed';
      card.error = tr('batch.err.novisual');
      fail++;
      saveBatch(b);
      renderBatch();
      continue;
    }
    try {
      // Native v63: 1 gambar per kartu (gambar pertama). Carousel
      // multi-gambar belum didukung — catatan Batch menyatakannya.
      const caption = (card.title ? card.title + '\n\n' : '') + card.concept;
      const ids = socQueueAdd(targets.map((t) => ({
        platform: t.id,
        text: caption,
        imageFile: files[0],
        imageMime: socMimeFromExt(files[0]),
        imageUrl: '',
        scheduledAt: Date.parse(cardDateISO(b.start, card.day)),
      })));
      card.nativeIds = ids;
      card.platforms = targets.map((t) => t.id);
      card.status = 'scheduled';
      card.error = '';
      ok++;
    } catch (e) {
      card.status = 'failed';
      card.error = e instanceof Error ? e.message : String(e);
      fail++;
    }
    saveBatch(b);
    renderBatch();
  }
  note(tr('batch.schedule.done', { ok, fail, skipped }));
}
