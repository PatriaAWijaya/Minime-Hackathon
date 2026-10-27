/**
 * Rupiah conversion (standing rule, Patria 27 Oct 2026): report costs in
 * IDR wherever possible; USD is kept only as the source unit when the
 * provider bills in USD (or when no price exists yet to convert).
 * The exchange rate is NEVER hard-coded as a permanent default: it
 * comes from USD_IDR_RATE in the environment and is recorded on every
 * summary so a converted figure is always auditable to its rate and
 * date. When no rate is set, conversion is null — never guessed.
 * Reference checked 27 Oct 2026: ~Rp18.137 per USD (Finnhub, other
 * public sources that day ranged Rp18.131–Rp18.152). That figure is a
 * dated reference, not a constant: refresh USD_IDR_RATE before reuse.
 */

export function parseUsdIdrRate(env: NodeJS.ProcessEnv): number | null {
  const raw = env.USD_IDR_RATE;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Convert a USD cost to IDR at the given rate, or null if either is missing. */
export function toIdr(costUsd: number | null, rate: number | null): number | null {
  if (costUsd === null || costUsd === undefined || rate === null || rate === undefined) return null;
  return Math.round(costUsd * rate * 100) / 100;
}

/** Format an IDR amount the Indonesian way: Rp90.685, or Rp1,81 for tiny amounts. */
export function formatIdr(amount: number): string {
  const rounded = amount >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  const parts = rounded.toFixed(amount >= 100 ? 0 : 2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = parts[1] ? `,${parts[1].replace(/0$/, '') === '' ? '00' : parts[1]}` : '';
  return `Rp${parts[0]}${amount >= 100 ? '' : frac}`;
}
