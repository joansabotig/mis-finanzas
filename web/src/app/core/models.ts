export type Currency = 'ARS' | 'USD';
export type AccountType = 'bank' | 'wallet' | 'cash' | 'investment' | 'crypto' | 'receivable' | 'debt';

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  initial_balance: number;
  monthly_rate: number | null;
  include_in_total: boolean;
  is_active: boolean;
  sort_order: number;
  balance: number;
}
