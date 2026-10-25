/**
 * Formatare defensivă pentru valori venite din API.
 *
 * Apelurile directe de tipul `tx.amount.toFixed(2)` sau
 * `new Date(x).toLocaleString()` arunca excepții (sau afișau "Invalid Date")
 * când backendul întorcea `null`. Orice excepție la render golește arborele
 * React, deci aceste helper-e trebuie folosite peste tot.
 */

/** Numărul cu 2 zecimale; `null`/`undefined`/NaN devin "0.00". */
export function money(value: unknown, fallback = '0.00'): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : fallback;
}

/** Numărul brut, sigur pentru comparații (`> 0` etc.). */
export function num(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/** Data și ora locale; valorile invalide devin "-". */
export function dateTime(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;

  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' });
}

/** Doar data locală; valorile invalide devin "-". */
export function dateOnly(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;

  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString('ro-RO');
}

/**
 * Timpul rămas până la o dată, scurt: „23 min”, „2 h 10 min”, „3 zile”.
 * Întoarce `null` pentru date invalide și „expirat” pentru cele trecute.
 */
export function timeUntil(value: unknown, now = Date.now()): string | null {
  if (value === null || value === undefined || value === '') return null;
  const target = new Date(value as string | number | Date).getTime();
  if (Number.isNaN(target)) return null;
  const minutes = Math.round((target - now) / 60000);
  if (minutes <= 0) return 'expirat';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? '1 zi' : `${days} zile`;
}

/** Ziua relativă pentru agende: „Azi”, „Mâine”, „Ieri” sau data. */
export function relativeDay(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return '-';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(date) - startOf(new Date())) / 86400000);
  if (diff === 0) return 'Azi';
  if (diff === 1) return 'Mâine';
  if (diff === -1) return 'Ieri';
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

/** Doar ora locală („14:30”). */
export function timeOnly(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}
