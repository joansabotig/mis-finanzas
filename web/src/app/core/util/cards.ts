import { Transaction } from '../models';
import { toIsoDate } from './dates';

/** Fecha con el día pedido, recortado al último día del mes (31 → 30/28). */
function dayInMonth(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, last));
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface CardCycle {
  /** Último cierre (inclusive) ya ocurrido — define el resumen a pagar. */
  lastClosing: string;
  /** Cierre anterior al último: el resumen a pagar va de previousClosing (excl.) a lastClosing (incl.). */
  previousClosing: string;
  /** Vencimiento del resumen cerrado. */
  dueDate: string;
  /** Próximo cierre: los consumos de hoy entran acá. */
  nextClosing: string;
}

/**
 * Calcula el ciclo de una tarjeta para la fecha `today`.
 * Ej.: cierre 15, vence 25, hoy 20/11 → resumen cerrado el 15/11 (consumos 16/10–15/11), vence 25/11; próximo cierre 15/12.
 * Si el día de vencimiento es menor que el de cierre (cierra 28, vence 8), vence el mes siguiente.
 */
export function cardCycle(closingDay: number, dueDay: number, today: string): CardCycle {
  const t = parseIso(today);
  let last = dayInMonth(t.getFullYear(), t.getMonth(), closingDay);
  if (last > t) last = dayInMonth(t.getFullYear(), t.getMonth() - 1, closingDay);
  const previous = dayInMonth(last.getFullYear(), last.getMonth() - 1, closingDay);
  const next = dayInMonth(last.getFullYear(), last.getMonth() + 1, closingDay);
  let due = dayInMonth(last.getFullYear(), last.getMonth(), dueDay);
  if (due <= last) due = dayInMonth(last.getFullYear(), last.getMonth() + 1, dueDay);
  return {
    lastClosing: toIsoDate(last),
    previousClosing: toIsoDate(previous),
    dueDate: toIsoDate(due),
    nextClosing: toIsoDate(next),
  };
}

type CardTx = Pick<Transaction, 'date' | 'type' | 'amount' | 'account_id' | 'to_account_id' | 'to_amount'>;

/** Consumos netos (gastos − devoluciones) de una tarjeta en el período (from, to]. */
export function statementTotal(cardId: string, txs: CardTx[], fromExclusive: string, toInclusive: string): number {
  let total = 0;
  for (const t of txs) {
    if (t.account_id !== cardId || t.date <= fromExclusive || t.date > toInclusive) continue;
    if (t.type === 'expense') total += t.amount;
    else if (t.type === 'income') total -= t.amount;
  }
  return Math.round(total * 100) / 100;
}

/** Pagos hechos a la tarjeta (transferencias hacia ella) después de `afterExclusive`. */
export function paymentsSince(cardId: string, txs: CardTx[], afterExclusive: string): number {
  let total = 0;
  for (const t of txs) {
    if (t.type === 'transfer' && t.to_account_id === cardId && t.date > afterExclusive) total += t.to_amount ?? t.amount;
  }
  return Math.round(total * 100) / 100;
}

export interface CardSummary {
  cycle: CardCycle;
  /** Resumen cerrado (lo que hay que pagar al vencimiento). */
  statement: number;
  /** Lo que falta pagar de ese resumen. */
  pending: number;
  /** Consumos que van al próximo resumen. */
  current: number;
}

export function cardSummary(
  cardId: string,
  closingDay: number,
  dueDay: number,
  txs: CardTx[],
  today: string,
): CardSummary {
  const cycle = cardCycle(closingDay, dueDay, today);
  const statement = statementTotal(cardId, txs, cycle.previousClosing, cycle.lastClosing);
  const paid = paymentsSince(cardId, txs, cycle.lastClosing);
  return {
    cycle,
    statement,
    pending: Math.max(0, Math.round((statement - paid) * 100) / 100),
    current: statementTotal(cardId, txs, cycle.lastClosing, cycle.nextClosing),
  };
}

/**
 * Divide una compra en cuotas mensuales. La última cuota absorbe el redondeo
 * para que la suma dé exacto el total.
 */
export function splitInstallments(total: number, count: number, firstDate: string): { amount: number; date: string }[] {
  const n = Math.max(1, Math.floor(count));
  const base = Math.floor((total / n) * 100) / 100;
  const first = parseIso(firstDate);
  const out: { amount: number; date: string }[] = [];
  for (let i = 0; i < n; i++) {
    const amount = i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
    out.push({ amount, date: toIsoDate(dayInMonth(first.getFullYear(), first.getMonth() + i, first.getDate())) });
  }
  return out;
}
