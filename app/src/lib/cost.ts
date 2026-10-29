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

// Hard limit ledger $5 (satuan tagihan provider). Nilai Rp setara
// dihitung pada kurs 28 Okt 2026 (Rp18.148/USD) untuk kartu Billing.
export const BILLING_HARD_LIMIT = {
  usdMin: 5,
  usdMax: 5,
  idrMin: 90740,
  idrMax: 90740,
};

export const COST_TOTAL = {
  calls: 8,
  tokens: 11577,
  usdMin: 0.00295,
  usdMax: 0.00295,
  idrMin: 53.5,
  idrMax: 53.5,
};

// Pemakaian live dari app (audit v66 $-B1): setiap callWithFallback
// yang sukses dicatat di sini (localStorage, device only) agar Billing
// menampilkan pemakaian berjalan, bukan hanya konstanta historis di
// atas. Biaya Meta dihitung router dari token x tarif muse-spark-1.3;
// Gemini $0 (free tier, keputusan Patria 28 Okt 2026); Ollama $0.
// Nilai null (tarif model tak dikenal) dicatat 0 panggilan/token tapi
// TIDAK menambah USD — jangan menebak tarif.
export interface LiveCost {
  calls: number;
  tokens: number;
  usd: number;
}

const LIVE_COST_LS = 'minime.costLive';

export function readLiveCost(): LiveCost {
  try {
    const raw = window.localStorage.getItem(LIVE_COST_LS);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object') {
      return {
        calls: typeof o.calls === 'number' ? o.calls : 0,
        tokens: typeof o.tokens === 'number' ? o.tokens : 0,
        usd: typeof o.usd === 'number' ? o.usd : 0,
      };
    }
  } catch {
    // Korup -> mulai dari nol (bukan klaim angka).
  }
  return { calls: 0, tokens: 0, usd: 0 };
}

export function recordLiveCost(r: {
  promptTokens?: number | null;
  completionTokens?: number | null;
  costUsd?: number | null;
  mock?: boolean;
}): LiveCost {
  if (r.mock) return readLiveCost();
  const cur = readLiveCost();
  const tokens = (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
  const next: LiveCost = {
    calls: cur.calls + 1,
    tokens: cur.tokens + tokens,
    usd: cur.usd + (typeof r.costUsd === 'number' ? r.costUsd : 0),
  };
  try {
    window.localStorage.setItem(LIVE_COST_LS, JSON.stringify(next));
  } catch {
    // Kuota penuh: pemakaian berjalan tidak tercatat — Billing tetap
    // menampilkan angka terakhir yang berhasil disimpan, bukan nol.
    return cur;
  }
  return next;
}

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

export function fmtIdrNum(n: number): string {
  return Math.round(n).toLocaleString('id-ID');
}

export function fmtIdr(
  r: { idrMin: number; idrMax: number },
  _lang: string,
): string {
  const a = fmtIdrNum(r.idrMin);
  const b = fmtIdrNum(r.idrMax);
  return 'Rp' + (a === b ? a : a + '–' + b);
}

export function fmtInt(n: number, lang: string): string {
  return n
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'id' ? '.' : ',');
}
