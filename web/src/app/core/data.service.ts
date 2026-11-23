import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Account,
  AccountBalance,
  Category,
  Transaction,
  TransactionInput,
  TransactionRow,
} from './models';
import { monthRange } from './util/dates';

type Result<T> = { data: T | null; error: { message: string } | null };

function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const num = (v: unknown) => (v == null ? null : Number(v));

function toBalance(a: AccountBalance): AccountBalance {
  return { ...a, balance: Number(a.balance), initial_balance: Number(a.initial_balance), monthly_rate: num(a.monthly_rate) };
}

function toTx<T extends Transaction>(t: T): T {
  return { ...t, amount: Number(t.amount), to_amount: num(t.to_amount) };
}

/** Movimiento + nombres de categoría y cuentas (dos FKs a accounts, por eso se nombran). */
const TX_WITH_NAMES: string =
  '*, category:categories(name,icon),' +
  ' account:accounts!transactions_account_id_fkey(name,currency),' +
  ' to_account:accounts!transactions_to_account_id_fkey(name,currency)';

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
    const a = unwrap<Account>(await this.sb.from('accounts').select('*').eq('id', id).single());
    return { ...a, initial_balance: Number(a.initial_balance), monthly_rate: num(a.monthly_rate) };
  }

  async saveAccount(id: string | undefined, a: Omit<Account, 'id'>): Promise<void> {
    unwrap(await (id ? this.sb.from('accounts').update(a).eq('id', id) : this.sb.from('accounts').insert(a)));
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
  async transactionsOfMonth(month: string, accountId?: string): Promise<TransactionRow[]> {
    const { from, to } = monthRange(month);
    let q = this.sb
      .from('transactions')
      .select(TX_WITH_NAMES)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    if (accountId) q = q.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`);
    // Sin tipos generados, supabase-js no infiere los joins: lo tipamos a mano.
    return unwrap((await q) as unknown as Result<TransactionRow[]>).map(toTx);
  }

  async transaction(id: string): Promise<Transaction> {
    return toTx(unwrap<Transaction>(await this.sb.from('transactions').select('*').eq('id', id).single()));
  }

  async saveTransaction(id: string | undefined, t: TransactionInput): Promise<void> {
    unwrap(await (id ? this.sb.from('transactions').update(t).eq('id', id) : this.sb.from('transactions').insert(t)));
  }

  async deleteTransaction(id: string): Promise<void> {
    unwrap(await this.sb.from('transactions').delete().eq('id', id));
  }

  // ---------- Cotización ----------
  async latestRate(): Promise<number | null> {
    const r = unwrap<{ rate: number } | null>(
      await this.sb.from('exchange_rates').select('rate').order('date', { ascending: false }).limit(1).maybeSingle(),
    );
    return r ? Number(r.rate) : null;
  }
}
