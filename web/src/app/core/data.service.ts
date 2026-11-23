import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Account,
  AccountBalance,
  Category,
  RateSource,
  RecurringItem,
  Transaction,
  TransactionFilter,
  TransactionInput,
  TransactionRow,
} from './models';
import { monthRange, todayIso } from './util/dates';
import { splitInstallments } from './util/cards';

type Result<T> = { data: T | null; error: { message: string } | null };

function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const num = (v: unknown) => (v == null ? null : Number(v));

function toAccount<T extends Account>(a: T): T {
  return { ...a, initial_balance: Number(a.initial_balance), monthly_rate: num(a.monthly_rate), credit_limit: num(a.credit_limit) };
}

function toBalance(a: AccountBalance): AccountBalance {
  return { ...toAccount(a), balance: Number(a.balance) };
}

function toTx<T extends Transaction>(t: T): T {
  return { ...t, amount: Number(t.amount), to_amount: num(t.to_amount) };
}

/** Movimiento + nombres de categoría y cuentas (dos FKs a accounts, por eso se nombran). */
const TX_WITH_NAMES: string =
  '*, category:categories(name,icon),' +
  ' account:accounts!transactions_account_id_fkey(name,currency,type),' +
  ' to_account:accounts!transactions_to_account_id_fkey(name,currency,type)';

/** Escapa comodines y separadores para usar texto libre dentro de un filtro de PostgREST. */
function likePattern(text: string): string {
  return '%' + text.replace(/[%_\\]/g, (c) => '\\' + c).replace(/[,()]/g, ' ') + '%';
}

/** Acceso a datos de Supabase. RLS asegura que solo se ven filas propias. */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly sb = inject(SupabaseService).client;

  // ---------- Cuentas ----------
  async accountBalances(includeInactive = false): Promise<AccountBalance[]> {
    let q = this.sb.from('account_balances').select('*').order('sort_order').order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    return unwrap<AccountBalance[]>(await q).map(toBalance);
  }

  async account(id: string): Promise<Account> {
    return toAccount(unwrap<Account>(await this.sb.from('accounts').select('*').eq('id', id).single()));
  }

  async saveAccount(id: string | undefined, a: Omit<Account, 'id'>): Promise<void> {
    // Sin la migración 2 no existen las columnas de tarjeta: no las mandamos si no hacen falta.
    const payload: Record<string, unknown> = { ...a };
    if (a.type !== 'credit_card') {
      for (const k of ['closing_day', 'due_day', 'credit_limit']) if (payload[k] == null) delete payload[k];
    }
    unwrap(await (id ? this.sb.from('accounts').update(payload).eq('id', id) : this.sb.from('accounts').insert(payload)));
  }

  /** Registra la diferencia entre el saldo de la app y el real como "ajuste". */
  async adjustBalance(accountId: string, difference: number): Promise<void> {
    if (!difference) return;
    unwrap(
      await this.sb.from('transactions').insert({
        type: 'adjustment',
        account_id: accountId,
        amount: difference,
        description: 'Ajuste de saldo',
        date: todayIso(),
      }),
    );
  }

  // ---------- Categorías ----------
  async categories(includeInactive = false): Promise<Category[]> {
    let q = this.sb.from('categories').select('*').order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    return unwrap<Category[]>(await q);
  }

  async category(id: string): Promise<Category> {
    return unwrap<Category>(await this.sb.from('categories').select('*').eq('id', id).single());
  }

  async saveCategory(id: string | undefined, c: Omit<Category, 'id'>): Promise<void> {
    unwrap(await (id ? this.sb.from('categories').update(c).eq('id', id) : this.sb.from('categories').insert(c)));
  }

  // ---------- Movimientos ----------
  async transactions(f: TransactionFilter): Promise<TransactionRow[]> {
    let q = this.sb
      .from('transactions')
      .select(TX_WITH_NAMES)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (f.from) q = q.gte('date', f.from);
    if (f.to) q = q.lte('date', f.to);
    if (f.accountId) q = q.or(`account_id.eq.${f.accountId},to_account_id.eq.${f.accountId}`);
    if (f.categoryId) q = q.eq('category_id', f.categoryId);
    if (f.search?.trim()) q = q.ilike('description', likePattern(f.search.trim()));
    if (f.limit) q = q.limit(f.limit);
    // Sin tipos generados, supabase-js no infiere los joins: lo tipamos a mano.
    return unwrap((await q) as unknown as Result<TransactionRow[]>).map(toTx);
  }

  transactionsOfMonth(month: string, accountId?: string): Promise<TransactionRow[]> {
    return this.transactions({ ...monthRange(month), accountId });
  }

  async transaction(id: string): Promise<Transaction> {
    return toTx(unwrap<Transaction>(await this.sb.from('transactions').select('*').eq('id', id).single()));
  }

  async saveTransaction(id: string | undefined, t: TransactionInput): Promise<void> {
    const payload = stripEmpty(t);
    unwrap(await (id ? this.sb.from('transactions').update(payload).eq('id', id) : this.sb.from('transactions').insert(payload)));
  }

  /** Crea una compra en N cuotas mensuales (una fila por cuota, mismo installment_group). */
  async createInstallments(t: TransactionInput, count: number): Promise<void> {
    const group = crypto.randomUUID();
    const base = t.description?.trim() || null;
    const rows = splitInstallments(t.amount, count, t.date).map((p, i) =>
      stripEmpty({
        ...t,
        amount: p.amount,
        date: p.date,
        description: base,
        installment_group: group,
        installment_number: i + 1,
        installment_total: count,
      }),
    );
    unwrap(await this.sb.from('transactions').insert(rows));
  }

  async deleteTransaction(id: string): Promise<void> {
    unwrap(await this.sb.from('transactions').delete().eq('id', id));
  }

  async deleteInstallmentGroup(group: string): Promise<void> {
    unwrap(await this.sb.from('transactions').delete().eq('installment_group', group));
  }

  /** Todos los movimientos (para exportar). */
  async allTransactions(): Promise<TransactionRow[]> {
    const pageSize = 1000;
    const out: TransactionRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const page = unwrap(
        (await this.sb
          .from('transactions')
          .select(TX_WITH_NAMES)
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)) as unknown as Result<TransactionRow[]>,
      ).map(toTx);
      out.push(...page);
      if (page.length < pageSize) return out;
    }
  }

  // ---------- Gastos e ingresos fijos ----------
  async recurringItems(includeInactive = false): Promise<RecurringItem[]> {
    let q = this.sb.from('recurring_items').select('*').order('kind').order('sort_order').order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    return unwrap<RecurringItem[]>(await q).map((r) => ({ ...r, estimated_amount: num(r.estimated_amount) }));
  }

  async recurringItem(id: string): Promise<RecurringItem> {
    const r = unwrap<RecurringItem>(await this.sb.from('recurring_items').select('*').eq('id', id).single());
    return { ...r, estimated_amount: num(r.estimated_amount) };
  }

  async saveRecurringItem(id: string | undefined, r: Omit<RecurringItem, 'id'>): Promise<void> {
    unwrap(await (id ? this.sb.from('recurring_items').update(r).eq('id', id) : this.sb.from('recurring_items').insert(r)));
  }

  /** Pagos/cobros de fijos registrados para un período YYYY-MM. */
  async recurringPayments(period: string): Promise<TransactionRow[]> {
    const q = this.sb.from('transactions').select(TX_WITH_NAMES).eq('period', period).not('recurring_id', 'is', null);
    return unwrap((await q) as unknown as Result<TransactionRow[]>).map(toTx);
  }

  // ---------- Cotización y preferencias ----------
  async rateSource(): Promise<RateSource> {
    // Si la migración 2 todavía no corrió, la tabla no existe: usamos manual.
    const { data, error } = await this.sb.from('user_settings').select('rate_source').maybeSingle();
    return error || !data ? 'manual' : (data.rate_source as RateSource);
  }

  async setRateSource(source: RateSource): Promise<void> {
    unwrap(
      await this.sb
        .from('user_settings')
        .upsert({ rate_source: source, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
    );
  }

  async latestRate(source?: RateSource): Promise<{ rate: number; date: string; source: string } | null> {
    let q = this.sb.from('exchange_rates').select('rate,date,source').order('date', { ascending: false }).limit(1);
    if (source) q = q.eq('source', source);
    const r = unwrap<{ rate: number; date: string; source: string } | null>(await q.maybeSingle());
    return r ? { ...r, rate: Number(r.rate) } : null;
  }

  async saveRate(source: RateSource, rate: number, date = todayIso()): Promise<void> {
    unwrap(await this.sb.from('exchange_rates').upsert({ source, rate, date }, { onConflict: 'user_id,date,source' }));
  }
}

/** Saca campos undefined/null opcionales para no mandar columnas que quizá no existan aún. */
function stripEmpty<T extends object>(t: T): T {
  const optional = ['installment_group', 'installment_number', 'installment_total', 'recurring_id', 'period', 'to_account_id', 'to_amount'];
  const out = { ...t } as Record<string, unknown>;
  for (const k of optional) if (out[k] === undefined) delete out[k];
  return out as T;
}
