// Movie plan (v218) — Bridge Movie↔Script Editor: uraian naskah movie
// menjadi daftar scene yang bisa digenerate per scene di Video Editor.
// Parser MURNI (tanpa DOM/storage) supaya mudah diuji: heading scene
// eksplisit (Scene/Shot/Adegan/Beat + nomor) membuka scene baru; bila
// tidak ada heading sama sekali, blok paragraf (dipisah baris kosong)
// menjadi satu scene. Tanpa cap jumlah scene.
export interface MovieScene {
  n: number;
  heading: string;
  text: string;
}

export interface MoviePlan {
  title: string;
  scenes: MovieScene[];
}

const HEAD_RE =
  /^\s*(?:scene|shot|adegan|beat|bagian|part)\s+\d+\s*[:.\-–—]?\s*(.*)$/i;
const TITLE_RE = /^\s*(?:judul|title)\s*:\s*(.+?)\s*$/i;
const NUM_RE = /^\s*\d+\s*[.)]\s+(.+?)\s*$/;

export function parseMovieScenes(raw: string): MoviePlan {
  const text = (raw || '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  let title = '';
  const scenes: MovieScene[] = [];
  let cur: MovieScene | null = null;
  const push = () => {
    if (cur && cur.text.trim()) scenes.push(cur);
    cur = null;
  };
  for (const line of lines) {
    if (!title) {
      const tm = line.match(TITLE_RE);
      if (tm) {
        title = tm[1].slice(0, 80);
        continue;
      }
    }
    const hm = line.match(HEAD_RE);
    if (hm) {
      push();
      cur = { n: scenes.length + 1, heading: hm[1].trim(), text: '' };
      continue;
    }
    const nm = line.match(NUM_RE);
    if (nm && !cur) {
      cur = { n: scenes.length + 1, heading: '', text: '' };
    }
    if (line.trim() === '') {
      // Baris kosong menutup blok paragraf HANYA bila scene berjalan
      // tanpa heading (jalur fallback); scene ber-heading menelan
      // baris kosong sebagai pemisah paragraf di dalam scene.
      if (cur && !cur.heading) {
        // Blok selesai bila baris berikutnya non-kosong: tandai dengan
        // menutup di sini; baris kosong beruntun tidak membuat scene kosong.
        push();
      }
      continue;
    }
    if (!cur) cur = { n: scenes.length + 1, heading: '', text: '' };
    cur.text = cur.text ? cur.text + '\n' + line : line;
  }
  push();
  scenes.forEach((s, i) => {
    s.n = i + 1;
    s.text = s.text.trim();
  });
  return { title, scenes: scenes.filter((s) => s.text) };
}

export function movieScenePrompt(s: MovieScene): string {
  const head = s.heading.trim();
  return head ? `${head}\n${s.text}`.trim() : s.text;
}
