// Script Editor — tab Script di Media Studio, 2 panel:
// sidebar kiri (Social Media / Artikel / Movie Script) + window utama
// yang isinya mengikuti menu aktif. Generate memakai router AI yang
// sama dengan chat (Meta -> Gemini -> Ollama lokal), dengan prompt
// yang dibangun deterministik dari form — bukan template tempel.
// State (termasuk hasil) tersimpan di localStorage; hasil juga dicerminkan
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { readKeys } from './chat.js';
import { getLang, MODEL_LANG_INSTRUCTION, tr } from './i18n.js';
import { libAddScript, mediaTab } from './v5logic.js';
import { recordLiveCost } from './cost.js';
import { esc } from './esc.js';

export type SeMenu = 'social' | 'artikel' | 'movie';
type SePlatform = 'instagram' | 'facebook' | 'whatsapp' | 'tiktok' | 'thread' | 'linkedin';
type SeMode = 'content' | 'caption' | 'both';
type SeFormat = 'image' | 'carousel' | 'reels';
type SeLength = 'short' | 'medium' | 'long';

interface SeState {
  menu: SeMenu;
  platform: SePlatform;
  mode: SeMode;
  format: SeFormat;
  framework: string;
  what: string;
  who: string;
  where: string;
  when: string;
  why: string;
  how: string;
  topic: string;
  audience: string;
  length: SeLength;
  premise: string;
  genre: string;
  character: string;
  output: string;
  outputMeta: string;
  note: string;
}

const LS = 'minime.scriptEditor';
const PLATFORMS: SePlatform[] = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'thread', 'linkedin'];
const MODES: SeMode[] = ['content', 'caption', 'both'];
const FORMATS: SeFormat[] = ['image', 'carousel', 'reels'];
const LENGTHS: SeLength[] = ['short', 'medium', 'long'];
const GENRES = ['drama', 'komedi', 'horor', 'aksi', 'thriller', 'dokumenter'];
const FRAMEWORKS = [
  { id: 'aida', label: 'AIDA — Attention–Interest–Desire–Action' },
  { id: 'pas', label: 'PAS — Problem–Agitate–Solution' },
  { id: 'bab', label: 'BAB — Before–After–Bridge' },
  { id: 'fab', label: 'FAB — Features–Advantages–Benefits' },
  { id: 'empatp', label: '4P — Picture–Promise–Prove–Push' },
  { id: 'acca', label: 'ACCA — Awareness–Comprehension–Conviction–Action' },
  { id: 'hso', label: 'Hook–Story–Offer' },
  { id: 'golden', label: 'Golden Circle — Why–How–What' },
];

const DEFAULTS: SeState = {
  menu: 'social',
  platform: 'instagram',
  mode: 'content',
  format: 'image',
  framework: 'aida',
  what: '',
  who: '',
  where: '',
  when: '',
  why: '',
  how: '',
  topic: '',
  audience: '',
  length: 'medium',
  premise: '',
  genre: 'drama',
  character: '',
  output: '',
  outputMeta: '',
  note: '',
};

let state: SeState = { ...DEFAULTS };
let busy = false;

function inList<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

function loadState(): void {
  try {
    const raw = window.localStorage.getItem(LS);
    if (!raw) return;
    const p = JSON.parse(raw) as Partial<SeState>;
    state = {
      ...DEFAULTS,
      ...p,
      menu: inList(p.menu, ['social', 'artikel', 'movie'] as const, 'social'),
      platform: inList(p.platform, PLATFORMS, 'instagram'),
      mode: inList(p.mode, MODES, 'content'),
      format: inList(p.format, FORMATS, 'image'),
      length: inList(p.length, LENGTHS, 'medium'),
      framework: FRAMEWORKS.some((f) => f.id === p.framework) ? (p.framework as string) : 'aida',
      genre: GENRES.includes(p.genre ?? '') ? (p.genre as string) : 'drama',
    };
  } catch {
    state = { ...DEFAULTS };
  }
}

function saveState(): void {
  try {
    window.localStorage.setItem(LS, JSON.stringify(state));
  } catch {
    // storage unavailable: editor tetap jalan untuk sesi ini
  }
}

function radioRow(name: string, options: readonly string[], current: string, labelKey: (o: string) => string): string {
  return `<div class="se-radios">${options
    .map(
      (o) =>
        `<label><input type="radio" name="${name}" value="${o}"${o === current ? ' checked' : ''}> ${esc(tr(labelKey(o)))}</label>`,
    )
    .join('')}</div>`;
}

function fwLabel(id: string): string {
  return FRAMEWORKS.find((f) => f.id === id)?.label ?? id;
}

function fwSelect(): string {
  return `<select id="se-framework" class="se-field">${FRAMEWORKS.map(
    (f) => `<option value="${f.id}"${f.id === state.framework ? ' selected' : ''}>${esc(f.label)}</option>`,
  ).join('')}</select><div class="se-note">${esc(tr('se.fwdesc.' + state.framework))}</div>`;
}

function wField(id: string, key: string, value: string): string {
  return `<label>${esc(tr(key))}<textarea id="${id}" rows="2" class="se-field">${esc(value)}</textarea></label>`;
}

function outputBlock(): string {
  if (!state.output && !state.note) return '';
  return `<div class="se-group">${state.output ? `<h4>${esc(tr('se.output.title'))}</h4><textarea id="se-output" rows="10" class="se-field">${esc(state.output)}</textarea>${state.outputMeta ? `<div class="se-note">${esc(state.outputMeta)}</div>` : ''}<button id="se-copy" class="se-btn2">${esc(tr('se.output.copy'))}</button> <button id="se-save" class="se-btn2">${esc(tr('se.btn.save'))}</button> <button id="se-use" class="se-btn2">${esc(tr('se.btn.use'))}</button>` : ''}${state.note ? `<div id="se-note" class="se-note">${esc(state.note)}</div>` : ''}</div>`;
}

function titleFor(st: SeState): string {
  if (st.menu === 'artikel') return `${tr('se.menu.artikel')}: ${st.topic}`.slice(0, 60);
  if (st.menu === 'movie') return `${tr('se.menu.movie')}: ${st.premise}`.slice(0, 60);
  const fw = fwLabel(st.framework).split(' — ')[0];
  return `Naskah ${tr('se.platform.' + st.platform)} · ${tr('se.mode.' + st.mode)} · ${fw}`;
}

function seSave(): void {
  const r = libAddScript(titleFor(state), state.output);
  state.note = tr(r.saveFailed ? 'lib.err.save' : (r.added ? 'se.note.saved' : 'se.note.already'));
  renderSeMain();
}

function seUse(): void {
  libAddScript(titleFor(state), state.output);
  state.note = tr('se.note.used');
  saveState();
  renderSeMain();
  // Audit v66 (overlap M1): 'Gunakan' benar-benar memakai naskah —
  // brief tab Image diisi langsung, bukan menunggu klik kedua.
  if (typeof (window as unknown as Record<string, unknown>).imgSetBrief === 'function') {
    ((window as unknown as Record<string, (t: string) => void>).imgSetBrief)(state.output);
  }
  mediaTab('image');
}

function paneHtml(): string {
  if (state.menu === 'artikel') {
    return `<div class="se-note">${esc(tr('se.note.provisional'))}</div>
      <div class="se-group"><label>${esc(tr('se.artikel.topic'))}<input id="se-topic" class="se-field" value="${esc(state.topic)}"></label></div>
      <div class="se-group"><label>${esc(tr('se.artikel.audience'))}<input id="se-audience" class="se-field" value="${esc(state.audience)}"></label></div>
      <div class="se-group"><div>${esc(tr('se.artikel.length'))}</div>${radioRow('se-length', LENGTHS, state.length, (o) => 'se.len.' + o)}</div>
      <div class="se-group"><div>${esc(tr('se.framework.label'))}</div>${fwSelect()}</div>
      <div class="se-group"><button id="se-generate" class="se-btn"${busy ? ' disabled' : ''}>${esc(tr(busy ? 'se.generating' : 'se.btn.generate'))}</button></div>
      ${outputBlock()}`;
  }
  if (state.menu === 'movie') {
    return `<div class="se-note">${esc(tr('se.note.provisional'))}</div>
      <div class="se-group"><label>${esc(tr('se.movie.premise'))}<textarea id="se-premise" rows="3" class="se-field">${esc(state.premise)}</textarea></label></div>
      <div class="se-group"><label>${esc(tr('se.movie.genre'))}<select id="se-genre" class="se-field">${GENRES.map(
        (g) => `<option value="${g}"${g === state.genre ? ' selected' : ''}>${esc(tr('se.genre.' + g))}</option>`,
      ).join('')}</select></label></div>
      <div class="se-group"><label>${esc(tr('se.movie.character'))}<input id="se-character" class="se-field" value="${esc(state.character)}"></label></div>
      <div class="se-group"><button id="se-generate" class="se-btn"${busy ? ' disabled' : ''}>${esc(tr(busy ? 'se.generating' : 'se.btn.generate'))}</button></div>
      ${outputBlock()}`;
  }
  return `<div class="se-group"><div>${esc(tr('se.platform.label'))}</div>${radioRow('se-platform', PLATFORMS, state.platform, (o) => 'se.platform.' + o)}</div>
    <div class="se-group"><div>${esc(tr('se.mode.label'))}</div>${radioRow('se-mode', MODES, state.mode, (o) => 'se.mode.' + o)}</div>
    ${state.platform === 'instagram' ? `<div class="se-group" id="se-format-row"><div>${esc(tr('se.format.label'))}</div>${radioRow('se-format', FORMATS, state.format, (o) => 'se.format.' + o)}</div>` : ''}
    <div class="se-group"><div>${esc(tr('se.framework.label'))}</div>${fwSelect()}</div>
    <div class="se-group"><div>${esc(tr('se.w.label'))}</div>
      ${wField('se-what', 'se.w.what', state.what)}
      ${wField('se-who', 'se.w.who', state.who)}
      ${wField('se-where', 'se.w.where', state.where)}
      ${wField('se-when', 'se.w.when', state.when)}
      ${wField('se-why', 'se.w.why', state.why)}
      ${wField('se-how', 'se.w.how', state.how)}
    </div>
    <div class="se-group"><button id="se-generate" class="se-btn"${busy ? ' disabled' : ''}>${esc(tr(busy ? 'se.generating' : 'se.btn.generate'))}</button></div>
    ${outputBlock()}`;
}

function bind(id: string, ev: string, fn: (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => void): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (el) el.addEventListener(ev, () => fn(el));
}

function bindRadio(name: string, fn: (v: string) => void): void {
  document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
    el.addEventListener('change', () => fn((el as HTMLInputElement).value));
  });
}

function renderSeMain(): void {
  const main = document.getElementById('se-main');
  if (!main) return;
  main.innerHTML = paneHtml();
  document.querySelectorAll('.se-menubtn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-se-menu') === state.menu);
  });
  bindRadio('se-platform', (v) => {
    state.platform = v as SePlatform;
    saveState();
    renderSeMain();
  });
  bindRadio('se-mode', (v) => {
    state.mode = v as SeMode;
    saveState();
    renderSeMain();
  });
  bindRadio('se-format', (v) => {
    state.format = v as SeFormat;
    saveState();
  });
  bindRadio('se-length', (v) => {
    state.length = v as SeLength;
    saveState();
  });
  bind('se-framework', 'change', (el) => {
    state.framework = el.value;
    saveState();
    renderSeMain();
  });
  bind('se-genre', 'change', (el) => {
    state.genre = el.value;
    saveState();
  });
  const textFields: Array<[string, keyof SeState]> = [
    ['se-what', 'what'],
    ['se-who', 'who'],
    ['se-where', 'where'],
    ['se-when', 'when'],
    ['se-why', 'why'],
    ['se-how', 'how'],
    ['se-topic', 'topic'],
    ['se-audience', 'audience'],
    ['se-premise', 'premise'],
    ['se-character', 'character'],
  ];
  for (const [id, key] of textFields) {
    // input saja, TANPA re-render: re-render memindahkan karet teks.
    bind(id, 'input', (el) => {
      (state as unknown as Record<string, string>)[key as string] = el.value;
      saveState();
    });
  }
  bind('se-output', 'input', (el) => {
    // Edit langsung di output: tanpa re-render (karet teks aman).
    state.output = el.value;
    saveState();
  });
  const gen = document.getElementById('se-generate');
  if (gen) gen.addEventListener('click', () => void seGenerate());
  const saveBtn = document.getElementById('se-save');
  if (saveBtn) saveBtn.addEventListener('click', () => seSave());
  const useBtn = document.getElementById('se-use');
  if (useBtn) useBtn.addEventListener('click', () => seUse());
  const copy = document.getElementById('se-copy');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.output);
        state.note = tr('se.output.copied');
      } catch {
        // clipboard tidak tersedia: hasil tetap tampil, bisa diseleksi manual
      }
      renderSeMain();
    });
  }
}

function buildScriptPrompt(s: SeState): string {
  if (s.menu === 'artikel') {
    return [
      `${tr('se.prompt.artikel')} ${s.topic}.`,
      `${tr('se.artikel.audience')}: ${s.audience || '-'}.`,
      `${tr('se.artikel.length')}: ${tr('se.len.' + s.length)}.`,
      `${tr('se.framework.label')}: ${fwLabel(s.framework)}.`,
      tr('se.prompt.artikel.rule'),
    ].join('\n');
  }
  if (s.menu === 'movie') {
    return [
      `${tr('se.prompt.movie')} ${s.premise}.`,
      `${tr('se.movie.genre')}: ${tr('se.genre.' + s.genre)}.`,
      `${tr('se.movie.character')}: ${s.character || '-'}.`,
      tr('se.prompt.movie.rule'),
    ].join('\n');
  }
  const w5: Array<[string, string]> = [
    [tr('se.w.what'), s.what],
    [tr('se.w.who'), s.who],
    [tr('se.w.where'), s.where],
    [tr('se.w.when'), s.when],
    [tr('se.w.why'), s.why],
    [tr('se.w.how'), s.how],
  ];
  const lines = [
    `${tr('se.prompt.social')} ${tr('se.mode.' + s.mode)} ${tr('se.prompt.for')} ${tr('se.platform.' + s.platform)}${s.platform === 'instagram' ? ` (${tr('se.format.' + s.format)})` : ''} ${tr('se.prompt.with')} ${fwLabel(s.framework)}.`,
    ...w5.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`),
    s.mode === 'caption'
      ? tr('se.prompt.caption.rule')
      : s.mode === 'both'
        ? tr('se.prompt.both.rule')
        : s.platform === 'instagram' && s.format === 'carousel'
          ? tr('se.prompt.carousel.rule')
          : s.platform === 'instagram' && s.format === 'reels'
            ? tr('se.prompt.reels.rule')
            : tr('se.prompt.content.rule'),
  ];
  return lines.join('\n');
}

async function seGenerate(): Promise<void> {
  const needKey =
    state.menu === 'social' ? 'se.err.needWhat' : state.menu === 'artikel' ? 'se.err.needTopic' : 'se.err.needPremise';
  const required = state.menu === 'social' ? state.what : state.menu === 'artikel' ? state.topic : state.premise;
  if (!required.trim()) {
    state.note = tr(needKey);
    renderSeMain();
    return;
  }
  if (busy) return;
  busy = true;
  state.note = tr('se.generating');
  renderSeMain();
  try {
    const keys = readKeys();
    const cfg = defaultRouterConfig();
    cfg.geminiApiKey = keys.gemini;
    cfg.metaApiKey = keys.meta;
    cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()];
    const router = new ModelRouter(cfg);
    const r = await router.callWithFallback(buildScriptPrompt(state), 'trace-script-' + Date.now());
    recordLiveCost(r);
    state.output = r.text;
    state.outputMeta =
      tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
      (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '');
    state.note = '';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.note = tr('se.err.failed') + ' ' + msg;
  }
  busy = false;
  saveState();
  renderSeMain();
}

export function setSeMenu(menu: SeMenu): void {
  state.menu = menu;
  saveState();
  renderSeMain();
}

export function seRefreshUI(): void {
  renderSeMain();
}

export function initScriptEditor(): void {
  loadState();
  renderSeMain();
  // Jembatan untuk recall Library (v5logic.libMedia): muat isi ke
  // output Script Editor yang bisa diedit. Satu fungsi window, bukan
  // import balik (menghindari siklus script-editor <-> v5logic).
  (window as unknown as Record<string, unknown>).seLoadOutput = (text: string) => {
    state.output = text;
    state.note = tr('se.note.loaded');
    saveState();
    renderSeMain();
  };
}
