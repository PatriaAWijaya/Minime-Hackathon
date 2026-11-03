// v238: parser label bersama untuk IMAGE-PLAN / CAROUSEL-PLAN / REELS-PLAN.
// Satu sumber kebenaran dipakai creative-brief (loader hasil) dan image-flow
// (pindah tab bulk) supaya prompt generator + caption tidak pernah beda tafsir.
//
// Aturan output kreatif (Patria 3 Nov 2026, BERDIRI): hasil kreatif harus
// SPESIFIK pada output itu, bukan cuma brief umum — selain brief umum, wajib
// ada prompt image generator + caption sosmed; prompt langsung masuk Image
// Editor, caption masuk body copy untuk digabung pada proses upload
// penjadwalan. Berlaku untuk SEMUA output kreatif.
//
// Label yang dikenali (tanpa peduli kapitalisasi dan marker markdown #, **, -):
//   Prompt Generator:  prompt image generator SPESIFIK output itu (siap generate)
//   Prompt Slide n:    prompt generator per slide carousel
//   Caption:           caption final siap posting (jalur sosmed; masuk body copy)
//   Title:/Judul:, Subtitle:/Subjudul:, Body:/Isi:, Listicle:/Daftar:,
//   Header:/Kepala:, Footer:/Kaki:
// Logo/elemen visual tetap diabaikan (tetap di teks utuh, bukan field).
//
// Body copy = teks posting lengkap: paragraf Body + caption digabung
// (keputusan turunan v238: caption adalah body copy final; bila hanya ada
// Caption tanpa Body, body = caption; bila hanya ada Body tanpa Caption,
// body = paragraf Body — perilaku lama tetap jalan).

export type PlanLabels = {
  prompt: string;
  caption: string;
  title: string;
  subtitle: string;
  body: string;
  listicle: string;
  header: string;
  footer: string;
  slides: string[];
  // Tab berformat triple (punya Prompt Generator dan/atau Caption) — dipakai
  // image-flow untuk memutuskan serialize saat pindah tab.
  hasTriple: boolean;
  hasSlides: boolean;
};

type SectionKey = 'prompt' | 'caption' | 'title' | 'subtitle' | 'body' | 'listicle' | 'header' | 'footer' | 'skip' | `slide:${number}`;

const LABELS: Array<{ re: RegExp; key: SectionKey | ((m: RegExpMatchArray) => SectionKey) }> = [
  // Slide dicek DULU: 'Prompt Slide 1:' tidak boleh ditelan aturan prompt.
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?prompt\s+slide\s+(\d+)\s*:/i, key: (m) => `slide:${Number(m[1])}` as SectionKey },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?prompt(?:\s+generator)?\s*:/i, key: 'prompt' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(caption|keterangan)\s*:/i, key: 'caption' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(title|judul)\s*:/i, key: 'title' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(subtitle|subjudul)\s*:/i, key: 'subtitle' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(body|isi)\s*:/i, key: 'body' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(listicle|daftar)\s*:/i, key: 'listicle' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(header|kepala)\s*:/i, key: 'header' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(footer|kaki)\s*:/i, key: 'footer' },
  { re: /^(?:#{1,6}\s*)?(?:\*{0,2}\s*)?(logo|elemen visual|visual|elemen)\s*:/i, key: 'skip' },
];

const stripStars = (s: string): string => s.replace(/^\*+|\*+$/g, '').trim();

export function parsePlanLabels(text: string): PlanLabels {
  const out: PlanLabels = {
    prompt: '', caption: '', title: '', subtitle: '', body: '',
    listicle: '', header: '', footer: '', slides: [], hasTriple: false, hasSlides: false,
  };
  const sections = new Map<SectionKey, string[]>();
  let cur: SectionKey | null = null;
  let labeled = false;
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    let matched = false;
    for (const { re, key } of LABELS) {
      const m = line.match(re);
      if (m) {
        labeled = true;
        cur = typeof key === 'function' ? key(m) : key;
        matched = true;
        const rest = stripStars(line.slice(m[0].length).trim());
        if (rest) {
          const arr = sections.get(cur) || [];
          arr.push(rest);
          sections.set(cur, arr);
        }
        break;
      }
    }
    if (!matched && /^#{1,6}\s/.test(line)) {
      // v235: heading markdown baru menutup seksi berjalan — dulu heading
      // ikut tertelan ke Footer.
      cur = null;
      continue;
    }
    if (!matched && cur) {
      const arr = sections.get(cur) || [];
      arr.push(line);
      sections.set(cur, arr);
    }
  }
  if (!labeled) return out;
  const oneLine = (k: SectionKey): string => (sections.get(k) || []).map((s) => s.trim()).filter(Boolean).join(' ');
  out.prompt = oneLine('prompt');
  out.caption = oneLine('caption');
  out.title = oneLine('title');
  out.subtitle = oneLine('subtitle');
  out.header = oneLine('header');
  out.footer = oneLine('footer');
  // Body dipisah dua bentuk (keputusan Patria 23:13: listicle adalah SALAH
  // SATU bentuk body copy): baris daftar menjadi Listicle, baris lain
  // menjadi Body paragraf. Caption digabung ke body copy (v238).
  const bodyLines = (sections.get('body') || []).map((s) => s.trim()).filter(Boolean);
  const paras: string[] = [];
  const items: string[] = [];
  for (const ln of bodyLines) {
    const lm = ln.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (lm) items.push(lm[1].trim());
    else paras.push(ln);
  }
  const listLines = (sections.get('listicle') || []).map((s) => s.trim()).filter(Boolean)
    .map((ln) => {
      const lm = ln.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
      return lm ? lm[1].trim() : ln;
    });
  out.listicle = [...items, ...listLines].join('\n');
  const parasText = paras.join('\n');
  out.body = parasText + (out.caption ? (parasText ? '\n\n' : '') + out.caption : '');
  // Slide diurutkan menurut nomor (model kadang menulis tidak berurutan).
  const slideEntries: Array<{ n: number; text: string }> = [];
  for (const [k, lines] of sections) {
    if (typeof k === 'string' && k.startsWith('slide:')) {
      slideEntries.push({ n: Number(k.slice(6)), text: lines.map((s) => s.trim()).filter(Boolean).join(' ') });
    }
  }
  slideEntries.sort((a, b) => a.n - b.n);
  out.slides = slideEntries.map((s) => s.text).filter(Boolean);
  out.hasTriple = out.prompt !== '' || out.caption !== '';
  out.hasSlides = out.slides.length > 0;
  return out;
}

// Serialisasi balik field editor menjadi teks tab berlabel (v238): dipakai
// image-flow saat meninggalkan tab triple, supaya suntingan prompt (brief)
// dan caption (body) tidak hilang saat pindah tab. Hanya untuk tab triple
// tanpa slide — tab slide/carousel disimpan apa adanya (brief mentah).
export function serializePlanLabels(f: {
  prompt: string; title: string; subtitle: string;
  header: string; footer: string; listicle: string; body: string;
}): string {
  const lines: string[] = [];
  // Body editor = paragraf + caption gabungan; saat serialisasi, body
  // ditulis sebagai Caption (bentuk kanonik v238) — nilainya stabil
  // saat diurai ulang (body = caption bila tak ada seksi Body).
  const caption = (f.body || '').trim();
  if (f.prompt.trim()) lines.push('Prompt Generator: ' + f.prompt.trim());
  if (f.title.trim()) lines.push('Title: ' + f.title.trim());
  if (f.subtitle.trim()) lines.push('Subtitle: ' + f.subtitle.trim());
  if (f.header.trim()) lines.push('Header: ' + f.header.trim());
  if (f.footer.trim()) lines.push('Footer: ' + f.footer.trim());
  const items = (f.listicle || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (items.length) {
    lines.push('Listicle:');
    for (const it of items) lines.push('- ' + it);
  }
  if (caption) lines.push('Caption: ' + caption);
  return lines.join('\n');
}
