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
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

/** Doar data locală; valorile invalide devin "-". */
export function dateOnly(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;

  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
}
