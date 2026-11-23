import { Currency } from '../models';

/**
 * Convierte lo que se tipea en el celular a número, aceptando formato argentino:
 * "1500", "1.500", "1.500,50", "1500,5", "$ 2.000" → 1500, 1500, 1500.5, 1500.5, 2000.
 * Devuelve null si no es un número válido.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  let s = (raw ?? '').trim().replace(/[\s$]/g, '').replace(/^US/i, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.500" = mil quinientos
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100) / 100;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** "$ 1.500" / "US$ 1.500" / "$ 1.500,50" — decimales solo si hacen falta. */
export function formatMoney(value: number | null | undefined, currency: Currency = 'ARS'): string {
  const n = Number(value ?? 0);
  const decimals = Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2;
  const key = `${currency}-${decimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      currencyDisplay: currency === 'USD' ? 'symbol' : 'narrowSymbol',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, f);
  }
  return f.format(n);
}

/** Texto para precargar un input de monto al editar: 1500.5 → "1500,5". */
export function amountToInput(n: number | null | undefined): string {
  return n == null ? '' : String(n).replace('.', ',');
}
