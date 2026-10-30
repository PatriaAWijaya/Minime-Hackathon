// B3 — real chat wiring for the Tauri frontend.
//
// The composer and Enter key all funnel through
// v5logic's sendChat(), which B3 turns into a delegate: when
// setSendChatImpl() has installed this module's sendChatReal, every
// path calls the real router instead of the v5 dummy replies.
//
// Keys live ONLY in this device's localStorage, entered by the user in
// Settings. They are never baked into the bundle, never committed,
// and never sent anywhere except the provider's own API endpoint.
// No key -> that provider is skipped by the chain (LiveUnavailableError
// -> fallthrough), exactly like the Node fase runners.
import { ModelRouter, defaultRouterConfig } from '../../../src/router';
import { AGENTS, activateAgent, currentProjectMemberKeys, currentProjectName, ensureProjectForBrief, graphNoteDelegation, graphNoteDelegationForMember, hasProject, isAgentDeactivated, libAddReport, markChatApproveDone, mediaTab, postChat, showView } from './v5logic.js';
import { getLang, MODEL_LANG_INSTRUCTION, tr } from './i18n.js';
import { esc } from './esc.js';
import { recordLiveCost } from './cost.js';

const GEMINI_KEY_LS = 'minime.geminiKey';
const META_KEY_LS = 'minime.metaKey';
const VALIDATED_LS = 'minime.keyValidated';

export function readKeys(): { gemini: string | null; meta: string | null } {
  try {
    return {
      gemini: window.localStorage.getItem(GEMINI_KEY_LS) || null,
      meta: window.localStorage.getItem(META_KEY_LS) || null,
    };
  } catch {
    return { gemini: null, meta: null };
  }
}

export type KeyKind = 'gemini' | 'meta';

function savedKey(kind: KeyKind): string | null {
  return readKeys()[kind];
}

function saveKey(kind: KeyKind, value: string): void {
  try {
    const ls = kind === 'gemini' ? GEMINI_KEY_LS : META_KEY_LS;
    window.localStorage.setItem(ls, value);
  } catch {
    // storage unavailable: key simply stays unset for this session
  }
}

function isKeyValidated(kind: KeyKind): boolean {
  try {
    const raw = window.localStorage.getItem(VALIDATED_LS);
    if (!raw) return false;
    return !!(JSON.parse(raw) as Record<string, unknown>)[kind];
  } catch {
    return false;
  }
}

function setKeyValidated(kind: KeyKind, value: boolean): void {
  try {
    const raw = window.localStorage.getItem(VALIDATED_LS);
    const obj = (raw ? JSON.parse(raw) : {}) as Record<string, boolean>;
    obj[kind] = value;
    window.localStorage.setItem(VALIDATED_LS, JSON.stringify(obj));
  } catch {
    // storage unavailable: validation flag simply doesn't persist
  }
}

function keyBtnId(kind: KeyKind): string {
  return 'keyBtn' + kind.charAt(0).toUpperCase() + kind.slice(1);
}

function keyNoteId(kind: KeyKind): string {
  return 'keyNote' + kind.charAt(0).toUpperCase() + kind.slice(1);
}

function keyInputId(kind: KeyKind): string {
  return kind === 'gemini' ? 'apiKeyGemini' : 'apiKeyMeta';
}

function setKeyNote(kind: KeyKind, text: string): void {
  const el = document.getElementById(keyNoteId(kind));
  if (el) el.textContent = text;
}

/**
 * Gambar ulang tombol per-kunci di Settings. Satu tombol = satu kunci,
 * dan tombol ITU SENDIRI adalah statusnya: "Hubungkan API" (belum
 * teruji) atau "TERHUBUNG" hijau (kunci tersimpan DAN lolos uji live).
 * Tidak ada lagi tombol simpan bersama maupun baris status bersama —
 * keduanya dihapus total di v52 karena fungsinya tumpang tindih
 * dengan tombol per-kunci ini.
 */
export function renderKeyButtons(): void {
  (['gemini', 'meta'] as KeyKind[]).forEach((kind) => {
    const btn = document.getElementById(keyBtnId(kind)) as HTMLButtonElement | null;
    if (!btn) return;
    // Bila input sedang berisi ketikan baru, kunci yang berlaku adalah
    // ketikan itu (BELUM teruji) — tombol harus "Hubungkan API", bukan
    // hijau basi dari validasi kunci lama. Bila input kosong, yang
    // berlaku adalah kunci tersimpan + flag validasinya. Turunan UI
    // murni: tidak menulis storage apa pun.
    const input = document.getElementById(keyInputId(kind)) as HTMLInputElement | null;
    const pending = !!input && input.value.trim() !== '';
    const ok = !pending && isKeyValidated(kind) && !!savedKey(kind);
    btn.textContent = ok ? tr('key.connected') : tr('key.connect');
    btn.className = ok ? 'btn btn-connected' : 'btn btn-primary';
    btn.disabled = false;
  });
}

function failNote(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP 400|HTTP 401/.test(msg)) return tr('key.fail.badkey');
  if (/HTTP \d+/.test(msg)) return tr('key.fail.error');
  return tr('key.fail.offline');
}

/**
 * Hubungkan satu kunci: simpan (bila ada ketikan baru), lalu UJI LIVE
 * kunci itu — langsung ke providernya, TANPA rantai fallback (fallback
 * akan menutupi kunci yang salah dengan provider lain dan memberi
 * tanda terhubung palsu). Tanda TERHUBUNG hanya muncul bila uji
 * lolos; gagal -> tombol kembali "Hubungkan API" + catatan alasan,
 * dan flag validasi dicabut bila sebelumnya sempat hijau.
 * Input kosong + tidak ada kunci tersimpan -> no-op (tidak ada uji).
 */
export async function connectKey(kind: KeyKind): Promise<void> {
  const btn = document.getElementById(keyBtnId(kind)) as HTMLButtonElement | null;
  if (!btn || btn.disabled) return;
  const input = document.getElementById(keyInputId(kind)) as HTMLInputElement | null;
  const typed = input?.value.trim() || '';
  const key = typed || savedKey(kind) || '';
  if (!key) return;
  if (typed) {
    saveKey(kind, typed);
    setKeyValidated(kind, false);
    if (input) input.value = '';
  }
  btn.disabled = true;
  btn.textContent = tr('key.testing');
  btn.className = 'btn btn-primary';
  setKeyNote(kind, '');
  let ok = false;
  let note = '';
  try {
    // Uji langsung ke provider itu saja (callMeta/callGemini tanpa
    // callWithFallback): satu panggilan minimal, biaya nyaris nol
    // (Meta: puluhan token; Gemini: free tier).
    const cfg = defaultRouterConfig();
    cfg.geminiApiKey = kind === 'gemini' ? key : null;
    cfg.metaApiKey = kind === 'meta' ? key : null;
    const router = new ModelRouter(cfg);
    if (kind === 'gemini') recordLiveCost(await router.callGemini('Jawab satu kata: OK'));
    else recordLiveCost(await router.callMeta('Jawab satu kata: OK', 'key-test'));
    ok = true;
  } catch (e) {
    ok = false;
    note = failNote(e);
  }
  setKeyValidated(kind, ok);
  if (!ok) setKeyNote(kind, note);
  renderKeyButtons();
}

/* Orkestrasi chat (perintah Patria 28 Okt 18:58).
   Alur: user -> Prime menyapa ramah (mengerti + melaksanakan) ->
   bila perlu, Prime mendelegasikan (terlihat sebagai chat) -> agen
   penerima AKTIF di list (activateAgent) + membalas Prime -> agen
   menunjukkan hasil di chat -> bila perlu Media Studio, agen memberi
   tahu + tombol Approve; window PINDAH ke studio HANYA sesudah user
   mengetuk Approve. Skill panggil studio: HANYA Prime + Kreatif.
   Peta kata kunci di bawah PROVISIONAL — user bisa mengubahnya. */
type AgentKey = 'riset' | 'strategi' | 'kreatif' | 'media' | 'distribusi';

const DELEGATE_RULES: Array<{ key: AgentKey; words: string[] }> = [
  { key: 'riset', words: ['riset', 'penelitian', 'data', 'survey', 'survei', 'tren', 'research'] },
  { key: 'strategi', words: ['strategi', 'stp', 'brand', 'positioning', 'segmentasi', 'targeting', 'merek'] },
  // Produksi kreatif (termasuk gambar/video) diarahkan ke Kreatif,
  // BUKAN ke Media — karena hanya Prime + Kreatif yang boleh
  // memanggil Media Studio (aturan skill Patria).
  { key: 'kreatif', words: ['konten', 'caption', 'naskah', 'tulisan', 'artikel', 'copywriting', 'cerita', 'gambar', 'desain', 'video', 'reels', 'poster', 'visual', 'script'] },
  { key: 'distribusi', words: ['distribusi', 'jadwal posting', 'posting', 'jadwal terbit', 'channel'] },
  { key: 'media', words: ['aset media', 'status produksi', 'daftar media'] },
];

// Kata kreatif + kata media disatukan (audit v66 C-M2): dulu kata
// 'konten/caption' merutekan ke Kreatif tapi TIDAK ada di MEDIA_WORDS,
// sehingga tugas Kreatif itu tidak pernah mendapat tombol Approve.
const MEDIA_WORDS = ['gambar', 'desain', 'video', 'reels', 'poster', 'visual', 'naskah', 'script', 'voice', 'audio', 'musik', 'suara', 'konten', 'caption', 'tulisan', 'artikel', 'copywriting', 'cerita'];

// Normalisasi untuk pencocokan kata: huruf kecil, non-huruf jadi
// spasi, diberi bantalan spasi — 'data' tidak lagi cocok di 'datang',
// 'jadwal posting' tetap cocok sebagai frasa.
function normPadded(text: string): string {
  return ' ' + text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

function delegateFor(text: string): AgentKey | null {
  // Audit v66 C-M1: skor, bukan urutan kaku — frasa bernilai 2, kata
  // bernilai 1, seri dimenangkan aturan yang lebih dulu. Contoh:
  // 'jadwal posting video' -> distribusi (2) mengalahkan kreatif (1).
  const low = normPadded(text);
  let best: AgentKey | null = null;
  let bestScore = 0;
  for (const rule of DELEGATE_RULES) {
    let score = 0;
    for (const w of rule.words) {
      if (low.includes(' ' + w + ' ')) score += w.includes(' ') ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule.key;
    }
  }
  return best;
}

function mediaNeeded(text: string): boolean {
  const low = normPadded(text);
  return MEDIA_WORDS.some((w) => low.includes(' ' + w + ' '));
}

function taskShort(text: string): string {
  return text.length > 120 ? text.slice(0, 120) + '…' : text;
}

/* Handoff studio per tombol (audit v66 C-M3): dulu SATU slot
   pendingStudio — tombol Approve pada bubble lama memuat hasil
   TERBARU. Kini tiap tombol mengikat indeks hasilnya sendiri. */
const pendingStudios: Array<{ text: string; agent: string }> = [];

function studioButton(resultText: string, agentKey: string): string {
  pendingStudios.push({ text: resultText, agent: agentKey });
  if (pendingStudios.length > 50) pendingStudios.shift();
  const idx = pendingStudios.length - 1;
  return (
    '<br><br>' + esc(tr('chat.studio.note')) +
    '<br><button class="btn btn-sm chat-act" data-act="chat-approve" data-idx="' + idx + '">' + esc(tr('chat.studio.approve')) + '</button>'
  );
}

/* Approve dari chat: muat hasil ke output Script Editor (bisa diedit),
   konfirmasi di chat, lalu PINDAH ke Media Studio tab Script.
   Tanpa ketukan ini, window TIDAK pernah berpindah sendiri.
   Batasan Prime+Kreatif di sini hanya berlaku di jalur chat — dari
   kartu Library, Media Studio dibuka sebagai navigasi biasa
   (audit v66 C-M2: jangan baca ini sebagai kontrol akses app-wide). */
export function approveStudio(idx?: number): void {
  const item = typeof idx === 'number' ? pendingStudios[idx] : pendingStudios[pendingStudios.length - 1];
  if (!item) return;
  // Konfirmasi timpa draf (audit v66 C-M3): draf yang sedang dibuka
  // tidak boleh tertimpa diam-diam oleh hasil chat.
  try {
    const raw = window.localStorage.getItem('minime.scriptEditor');
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o.output === 'string' && o.output.trim()) {
      // v107: dialog native mati di WebView live (tombol hanya berkedip)
      // — ganti dua ketuk pada tombol yang sama. State armed disimpan di
      // elemen (dataset), bukan variabel modul: render ulang chat akan
      // menghapusnya sehingga ketuk berikutnya mempersenjatai ulang.
      const btn = document.querySelector('#chatBox [data-act="chat-approve"][data-idx="' + idx + '"]') as HTMLElement | null;
      if (!btn || btn.dataset.armed !== '1') {
        if (btn) { btn.dataset.armed = '1'; btn.textContent = tr('chat.studio.arm'); }
        return;
      }
    }
  } catch {
    // State tak terbaca: lanjut seperti biasa.
  }
  const { text, agent } = item;
  const ag = (AGENTS as Record<string, { name: string; color: string }>)[agent];
  if (typeof (window as unknown as Record<string, unknown>).seLoadOutput === 'function') {
    ((window as unknown as Record<string, (t: string) => void>).seLoadOutput)(text);
  }
  // v116: tombol yang sukses diklik berubah hijau dan bertahan (bukan
  // hanya di DOM sesaat) — ditandai sebelum bubble konfirmasi + pindah.
  markChatApproveDone(typeof idx === 'number' ? idx : pendingStudios.length - 1);
  if (ag) postChat(agent, ag.name, ag.color, tr('chat.studio.opened'));
  showView('media');
  mediaTab('script');
}
(window as unknown as Record<string, unknown>).approveStudio = approveStudio;

/**
 * Real sendChat: user bubble -> Prime ack ramah -> (delegasi bila
 * perlu: pengumuman Prime + aktivasi agen + ack agen + hasil agen) /
 * (langsung: jawaban Prime) -> tombol studio bila perlu + disetujui.
 * Failures post an honest error bubble, never a fabricated reply.
 */
// v103 (Alur 1): Prime memecah brief menjadi tugas per agen lewat 1 model
// call. Balasan harus array JSON murni; apa pun yang tidak lolos validasi
// (agen tak dikenal, Prime, duplikat, tugas kosong) dibuang — bila hasil
// kosong, pengirim jatuh kembali ke delegasi tunggal lama.
const FLOW_AGENTS = ['riset', 'strategi', 'kreatif', 'media', 'distribusi', 'produk'];
async function splitBriefTasks(router: ModelRouter, cfg: ReturnType<typeof defaultRouterConfig>, brief: string): Promise<{ agent: string; task: string }[]> {
  cfg.systemInstruction = 'Bagi brief user menjadi tugas untuk agen-agen berikut (pakai kunci persis ini): riset (Riset pasar & audiens), strategi (Positioning & STP), kreatif (Naskah & Brief), media (Produksi media), distribusi (Draf distribusi), produk (Brief produk digital). Balas HANYA dengan array JSON, tanpa teks lain dan tanpa pagar kode. Format: [{"agent":"riset","task":"..."}]. Sertakan hanya agen yang benar-benar relevan dengan brief; tugas singkat, konkret, Bahasa Indonesia.';
  try {
    const r = await router.callWithFallback(brief, 'trace-flow1-split-' + Date.now());
    recordLiveCost(r);
    const raw = (r.text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: { agent: string; task: string }[] = [];
    for (const it of parsed) {
      if (!it || typeof it.agent !== 'string' || typeof it.task !== 'string') continue;
      const key = it.agent.trim();
      const task = it.task.trim();
      if (key === 'prime' || !FLOW_AGENTS.includes(key) || !task || seen.has(key)) continue;
      seen.add(key);
      out.push({ agent: key, task });
    }
    return out;
  } catch {
    return [];
  }
}

// v103 (Alur 1): laporan lengkap mentah (tanpa escape — pengirim meng-escape
// saat posting bubble; salinan Library menyimpan teks mentah yang sama).
function composeFlowReport(name: string, brief: string, results: { name: string; task: string; text: string }[], qc: string, doneText?: string, titleText?: string): string {
  const lines = [(titleText || tr('flow.report.title')) + ' — ' + name, '', tr('flow.report.brief') + ': ' + brief, ''];
  for (const r of results) lines.push('- ' + r.name + ' (' + r.task + '): ' + r.text, '');
  lines.push(tr('flow.report.qc') + ': ' + qc, '', doneText || tr('flow.report.done'));
  return lines.join('\n');
}

export async function sendChatReal(): Promise<void> {
  const input = document.getElementById('chatInput') as HTMLInputElement | null;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const keys = readKeys();
  const cfg = defaultRouterConfig();
  cfg.geminiApiKey = keys.gemini;
  cfg.metaApiKey = keys.meta;
  const router = new ModelRouter(cfg);
  // v103 (Alur 1): tanpa project aktif, pesan diuji dulu sebagai brief —
  // Prime memecah brief lewat 1 model call. Hanya bila ada tugas relevan,
  // project dibuat (main window + graph) dan fan-out berjalan; sapaan /
  // obrolan biasa tetap di Main chat (v101) tanpa membuat project.
  const flow1 = !hasProject();
  const flow1Tasks = flow1 ? await splitBriefTasks(router, cfg, text) : [];
  // v117 (Alur 2): project SUDAH ada — brief dipecah sama seperti Alur 1,
  // tapi fan-out DIBATASI ke anggota aktif project (status Nonaktif
  // dikecualikan oleh currentProjectMemberKeys). Bukan anggota TIDAK
  // ditambahkan/diaktifkan; tanpa tugas anggota -> jalur lama di bawah.
  // Delegasi eksplisit (keyword satu agen) selalu menang atas fan-out:
  // pesan yang menyebut satu agen tetap lewat jalur delegasi tunggal lama
  // dan split tidak dijalankan untuknya (hemat 1 model call).
  const hasExplicitDelegate = !flow1 && delegateFor(text) !== null;
  const flow2Raw = (!flow1 && !hasExplicitDelegate) ? await splitBriefTasks(router, cfg, text) : [];
  const flow2Tasks = flow2Raw.filter((t) => currentProjectMemberKeys().includes(t.agent));
  if (flow1 && flow1Tasks.length > 0) ensureProjectForBrief(text);
  postChat('user', 'Patria', '#374151', esc(text));
  input.value = '';
  postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.prime.ack'));
  // v103 (Alur 1): brief tervalidasi — fan-out ke masing-masing agen.
  if (flow1 && flow1Tasks.length > 0) {
    postChat('prime', 'Prime Agent', '#EB87B4', tr('flow.project.created', { name: currentProjectName() }));
    const tasks = flow1Tasks;
    if (tasks.length > 0) {
      const results: { name: string; task: string; text: string }[] = [];
      for (const t of tasks) {
        const ag = (AGENTS as Record<string, { name: string; color: string; role: string }>)[t.agent];
        postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.delegate.announce', { agent: esc(ag.name), task: esc(taskShort(t.task)) }));
        graphNoteDelegation(t.agent, t.task);
        activateAgent(t.agent);
        postChat(t.agent, ag.name, ag.color, tr('chat.delegate.agentack'));
        cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] + ' Kamu adalah ' + ag.name + ' (' + ag.role + ').';
        const trace = 'trace-flow1-' + t.agent + '-' + Date.now();
        let resultText: string;
        try {
          const r = await router.callWithFallback(t.task, trace);
          recordLiveCost(r);
          const footer =
            ' — ' + tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
            (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '') +
            (r.promptTokens != null || r.completionTokens != null ? ' · ' + (r.promptTokens ?? '—') + '+' + (r.completionTokens ?? '—') + ' token' : '');
          const studio = t.agent === 'kreatif' && mediaNeeded(t.task) ? studioButton(r.text, t.agent) : '';
          resultText = r.text;
          postChat(t.agent, ag.name, ag.color, esc(r.text) + footer + studio);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          resultText = tr('chat.error') + msg;
          postChat(t.agent, ag.name, ag.color, tr('chat.error') + esc(msg) + tr('chat.error.hint'));
        }
        results.push({ name: ag.name, task: t.task, text: resultText });
      }
      let qcText: string;
      try {
        cfg.systemInstruction = 'QC hasil kerja agen: nilai tiap hasil terhadap brief. Balas dengan verdict singkat per agen: LOLOS atau REVISI + satu kalimat alasan, diakhiri satu kalimat simpulan. Bahasa Indonesia.';
        const qcInput = 'Brief: ' + text + '\n\nHasil agen:\n' + results.map((r) => '- ' + r.name + ': ' + r.text).join('\n');
        const q = await router.callWithFallback(qcInput, 'trace-flow1-qc-' + Date.now());
        recordLiveCost(q);
        qcText = q.text;
      } catch {
        qcText = tr('flow.qc.unavailable');
      }
      postChat('prime', 'Prime Agent', '#EB87B4', qcText, true);
      const report = composeFlowReport(currentProjectName(), text, results, qcText);
      postChat('prime', 'Prime Agent', '#EB87B4', esc(report), true);
      libAddReport(tr('flow.report.title') + ' — ' + currentProjectName(), report);
      return;
    }
    // Split gagal/kosong: jatuh ke delegasi tunggal lama di bawah.
  }
  // v117 (Alur 2): fan-out ke anggota aktif saja — pengumuman, node
  // Graph (tanpa mengubah keanggotaan), ack agen sebagai laporan progres,
  // model call, lalu QC + laporan progres Prime ke user. TANPA membuat
  // project baru dan TANPA dokumen Library (project tetap berjalan).
  if (flow2Tasks.length > 0) {
    const results: { name: string; task: string; text: string }[] = [];
    for (const t of flow2Tasks) {
      const ag = (AGENTS as Record<string, { name: string; color: string; role: string }>)[t.agent];
      postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.delegate.announce', { agent: esc(ag.name), task: esc(taskShort(t.task)) }));
      graphNoteDelegationForMember(t.agent, t.task);
      activateAgent(t.agent);
      postChat(t.agent, ag.name, ag.color, tr('chat.delegate.agentack'));
      cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] + ' Kamu adalah ' + ag.name + ' (' + ag.role + ').';
      const trace = 'trace-flow2-' + t.agent + '-' + Date.now();
      let resultText: string;
      try {
        const r = await router.callWithFallback(t.task, trace);
        recordLiveCost(r);
        const footer =
          ' — ' + tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
          (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '') +
          (r.promptTokens != null || r.completionTokens != null ? ' · ' + (r.promptTokens ?? '—') + '+' + (r.completionTokens ?? '—') + ' token' : '');
        const studio = t.agent === 'kreatif' && mediaNeeded(t.task) ? studioButton(r.text, t.agent) : '';
        resultText = r.text;
        postChat(t.agent, ag.name, ag.color, esc(r.text) + footer + studio);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resultText = tr('chat.error') + msg;
        postChat(t.agent, ag.name, ag.color, tr('chat.error') + esc(msg) + tr('chat.error.hint'));
      }
      results.push({ name: ag.name, task: t.task, text: resultText });
    }
    let qcText: string;
    try {
      cfg.systemInstruction = 'QC hasil kerja agen: nilai tiap hasil terhadap brief. Balas dengan verdict singkat per agen: LOLOS atau REVISI + satu kalimat alasan, diakhiri satu kalimat simpulan. Bahasa Indonesia.';
      const qcInput = 'Brief: ' + text + '\n\nHasil agen:\n' + results.map((r) => '- ' + r.name + ': ' + r.text).join('\n');
      const q = await router.callWithFallback(qcInput, 'trace-flow2-qc-' + Date.now());
      recordLiveCost(q);
      qcText = q.text;
    } catch {
      qcText = tr('flow.qc.unavailable');
    }
    postChat('prime', 'Prime Agent', '#EB87B4', qcText, true);
    const report = composeFlowReport(currentProjectName(), text, results, qcText, tr('flow2.report.done'), tr('flow2.report.title'));
    postChat('prime', 'Prime Agent', '#EB87B4', esc(report), true);
    return;
  }
  // Audit v66 C-M1: agen yang dinonaktifkan user tidak lagi menjawab
  // lewat chat — delegasi jatuh kembali ke Prime.
  let delegate = delegateFor(text);
  if (delegate && isAgentDeactivated(delegate)) delegate = null;
  if (!delegate) {
    cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()];
    const trace = 'trace-chat-' + Date.now();
    try {
      const r = await router.callWithFallback(text, trace);
      recordLiveCost(r);
      const footer =
        ' — ' + tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
        (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '') +
        (r.promptTokens != null || r.completionTokens != null ? ' · ' + (r.promptTokens ?? '—') + '+' + (r.completionTokens ?? '—') + ' token' : '');
      const studio = mediaNeeded(text) ? studioButton(r.text, 'prime') : '';
      postChat('prime', 'Prime Agent', '#EB87B4', esc(r.text) + footer + studio);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.error') + esc(msg) + tr('chat.error.hint'));
    }
    return;
  }
  const ag = (AGENTS as Record<string, { name: string; color: string; role: string }>)[delegate];
  postChat('prime', 'Prime Agent', '#EB87B4', tr('chat.delegate.announce', { agent: esc(ag.name), task: esc(taskShort(text)) }));
  // v104: node dibuat DULU supaya activateAgent menemukan agen (di project
  // atau di Graph-only) dan memindahkannya ke panel detail + list aktif.
  graphNoteDelegation(delegate, text);
  activateAgent(delegate);
  postChat(delegate, ag.name, ag.color, tr('chat.delegate.agentack'));
  cfg.systemInstruction = MODEL_LANG_INSTRUCTION[getLang()] + ' Kamu adalah ' + ag.name + ' (' + ag.role + ').';
  const trace = 'trace-chat-' + delegate + '-' + Date.now();
  try {
    const r = await router.callWithFallback(text, trace);
    recordLiveCost(r);
    const footer =
      ' — ' + tr('chat.footer.via') + ' ' + r.provider + ' ' + r.model + ' · ' + r.latencyMs + 'ms' +
      (r.fallbackFrom ? ' (' + tr('chat.footer.fb') + ' ' + r.fallbackFrom + ')' : '') +
      (r.promptTokens != null || r.completionTokens != null ? ' · ' + (r.promptTokens ?? '—') + '+' + (r.completionTokens ?? '—') + ' token' : '');
    // Tombol studio HANYA untuk Kreatif (aturan skill) + tugas media.
    const studio = delegate === 'kreatif' && mediaNeeded(text) ? studioButton(r.text, delegate) : '';
    postChat(delegate, ag.name, ag.color, esc(r.text) + footer + studio);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postChat(delegate, ag.name, ag.color, tr('chat.error') + esc(msg) + tr('chat.error.hint'));
  }
}
