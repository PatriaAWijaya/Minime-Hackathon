// Cost per model yang tercatat dari pekerjaan hackathon.
// Sumber: uji live Meta 28 Okt 2026 (1 panggilan, angka aktual) +
// Fase 1-3 (7 panggilan Gemini, 10.859 token, tertagih $0 karena
// free tier; rincian input/output TIDAK dapat direkonstruksi —
// cek dashboard Google Cloud 28 Okt hanya memberi agregat harian
// UTC-8 proyek, bukan rincian per panggilan).
// Modul murni: tanpa impor Node, aman di-bundle ke frontend.

export type CostRow = {
  model: string;
  provider: string;
  calls: number;
  input: number | null; // null = rincian belum tersedia
  output: number | null;
  usdMin: number;
  usdMax: number; // sama dengan min = nilai pasti
  idrMin: number;
  idrMax: number;
  tokens: number;
};

export const COST_ROWS: CostRow[] = [
  {
    model: 'muse-spark-1.3',
    provider: 'Meta',
    calls: 1,
    input: 34,
    output: 684,
    usdMin: 0.00295,
    usdMax: 0.00295,
    idrMin: 53.5,
    idrMax: 53.5,
    tokens: 718,
  },
  {
    model: 'gemini-3.1-flash-lite',
    provider: 'Google',
    calls: 7,
    input: null,
    output: null,
    usdMin: 0,
    usdMax: 0,
    idrMin: 0,
    idrMax: 0,
    tokens: 10859,
  },
];

export const COST_TOTAL = {
  calls: 8,
  tokens: 11577,
  usdMin: 0.00295,
  usdMax: 0.00295,
  idrMin: 53.5,
  idrMax: 53.5,
};

function trimNum(n: number): string {
  let s = n.toFixed(5);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

function dec(s: string, lang: string): string {
  return lang === 'id' ? s.replace('.', ',') : s;
}

export function fmtUsd(
  r: { usdMin: number; usdMax: number },
  lang: string,
): string {
  const a = dec(trimNum(r.usdMin), lang);
  const b = dec(trimNum(r.usdMax), lang);
  return '$' + (a === b ? a : a + '–' + b);
}

export function fmtIdr(
  r: { idrMin: number; idrMax: number },
  lang: string,
): string {
  const a = dec(String(r.idrMin), lang);
  const b = dec(String(r.idrMax), lang);
  return 'Rp' + (a === b ? a : a + '–' + b);
}

export function fmtInt(n: number, lang: string): string {
  return n
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'id' ? '.' : ',');
}
