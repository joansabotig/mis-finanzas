export type Currency = 'ARS' | 'USD';
export type AccountType = 'bank' | 'wallet' | 'cash' | 'investment' | 'crypto' | 'receivable' | 'debt';
export type CategoryKind = 'expense' | 'income';
export type CategoryGroup = 'fijo' | 'variable' | 'casa' | 'inversion';
export type TxType = 'expense' | 'income' | 'transfer' | 'adjustment';

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: string }[] = [
  { value: 'bank', label: 'Banco', icon: 'account_balance' },
  { value: 'wallet', label: 'Billetera virtual', icon: 'account_balance_wallet' },
  { value: 'cash', label: 'Efectivo', icon: 'payments' },
  { value: 'investment', label: 'Inversión', icon: 'trending_up' },
  { value: 'crypto', label: 'Cripto', icon: 'currency_bitcoin' },
  { value: 'receivable', label: 'Me deben', icon: 'call_received' },
  { value: 'debt', label: 'Deuda', icon: 'call_made' },
];

export const CATEGORY_GROUPS: { value: CategoryGroup; label: string }[] = [
  { value: 'fijo', label: 'Fijo' },
  { value: 'variable', label: 'Variable' },
  { value: 'casa', label: 'Casa' },
  { value: 'inversion', label: 'Inversión' },
];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  initial_balance: number;
  monthly_rate: number | null;
  include_in_total: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface AccountBalance extends Account {
  balance: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  grp: CategoryGroup | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  account_id: string;
  amount: number;
  to_account_id: string | null;
  to_amount: number | null;
  category_id: string | null;
  description: string | null;
  recurring_id: string | null;
  period: string | null;
  created_at: string;
}

export interface TransactionRow extends Transaction {
  category: { name: string; icon: string | null } | null;
  account: { name: string; currency: Currency } | null;
  to_account: { name: string; currency: Currency } | null;
}

export type TransactionInput = Pick<Transaction, 'date' | 'type' | 'account_id' | 'amount' | 'category_id' | 'description'>;
