import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { DataService } from '../../core/data.service';
import { AccountBalance, Currency, TransactionRow } from '../../core/models';
import { addMonths, currentMonth, dayLabel, isMonth, monthLabel } from '../../core/util/dates';
import { MoneyPipe } from '../../shared/money.pipe';

interface DayGroup {
  date: string;
  label: string;
  items: TransactionRow[];
}

@Component({
  selector: 'app-transactions-list',
  imports: [FormsModule, RouterLink, MoneyPipe, MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressBarModule, MatSelectModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      <div class="month">
        <button mat-icon-button aria-label="Mes anterior" (click)="go(-1)"><mat-icon>chevron_left</mat-icon></button>
        <span class="month-label">{{ label() }}</span>
        <button mat-icon-button aria-label="Mes siguiente" (click)="go(1)" [disabled]="month() >= today"><mat-icon>chevron_right</mat-icon></button>
      </div>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filter">
        <mat-label>Cuenta</mat-label>
        <mat-select [value]="cuenta() ?? ''" (selectionChange)="setAccount($event.value)">
          <mat-option value="">Todas las cuentas</mat-option>
          @for (a of accounts(); track a.id) {
            <mat-option [value]="a.id">{{ a.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="totals">
        @for (t of totals(); track t.currency) {
          <div><span class="muted">Ingresos {{ t.currency }}</span><b class="pos">{{ t.income | money: t.currency }}</b></div>
          <div><span class="muted">Gastos {{ t.currency }}</span><b class="neg">{{ t.expense | money: t.currency }}</b></div>
        }
      </div>

      @if (error()) { <p class="error">{{ error() }}</p> }

      @for (g of groups(); track g.date) {
        <div class="section-title">{{ g.label }}</div>
        <div class="rows">
          @for (t of g.items; track t.id) {
            <a class="row" [routerLink]="['/movimientos', t.id]">
              <mat-icon class="muted">{{ icon(t) }}</mat-icon>
              <span class="grow">
                <span class="main">{{ t.description || t.category?.name || typeLabel(t) }}</span>
                <span class="sub">
                  @if (t.description && t.category) { {{ t.category.name }} · }
                  {{ t.account?.name }}@if (t.to_account) { → {{ t.to_account.name }} }
                </span>
              </span>
              <span class="amount" [class.neg]="sign(t) < 0" [class.pos]="sign(t) > 0">
                {{ sign(t) < 0 ? '−' : sign(t) > 0 ? '+' : '' }}{{ displayAmount(t) | money: displayCurrency(t) }}
              </span>
            </a>
          }
        </div>
      } @empty {
        @if (!loading()) { <p class="empty">No hay movimientos en {{ label() }}.<br />Tocá <b>+</b> para cargar uno.</p> }
      }
    </div>
  `,
  styles: `
    .month { display: flex; align-items: center; justify-content: space-between; }
    .month-label { font: var(--mat-sys-title-medium); }
    .filter { width: 100%; margin: 8px 0; }
    .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 8px; }
    .totals div { display: flex; flex-direction: column; }
  `,
})
export class TransactionsList {
  /** Query params: ?mes=YYYY-MM&cuenta=<id> */
  readonly mes = input<string>();
  readonly cuenta = input<string>();

  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  protected readonly today = currentMonth();

  protected readonly month = computed(() => (isMonth(this.mes()) ? this.mes()! : this.today));
  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly accounts = signal<AccountBalance[]>([]);
  protected readonly items = signal<TransactionRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private request = 0;

  protected readonly groups = computed<DayGroup[]>(() => {
    const map = new Map<string, TransactionRow[]>();
    for (const t of this.items()) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map].map(([date, items]) => ({ date, label: dayLabel(date), items }));
  });

  protected readonly totals = computed(() => {
    const acc = new Map<Currency, { currency: Currency; income: number; expense: number }>();
    for (const t of this.items()) {
      if (t.type !== 'income' && t.type !== 'expense') continue;
      const cur = t.account?.currency ?? 'ARS';
      const row = acc.get(cur) ?? { currency: cur, income: 0, expense: 0 };
      if (t.type === 'income') row.income += t.amount;
      else row.expense += t.amount;
      acc.set(cur, row);
    }
    if (!acc.size) acc.set('ARS', { currency: 'ARS', income: 0, expense: 0 });
    return [...acc.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  });

  constructor() {
    this.data.accountBalances(true).then((a) => this.accounts.set(a)).catch(() => undefined);
    effect(() => {
      const month = this.month();
      const accountId = this.cuenta() || undefined;
      untracked(() => this.load(month, accountId));
    });
  }

  private async load(month: string, accountId?: string) {
    const req = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const items = await this.data.transactionsOfMonth(month, accountId);
      if (req === this.request) this.items.set(items);
    } catch (e) {
      if (req === this.request) this.error.set('Error cargando movimientos: ' + (e as Error).message);
    } finally {
      if (req === this.request) this.loading.set(false);
    }
  }

  protected go(delta: number) {
    this.navigate({ mes: addMonths(this.month(), delta) });
  }

  protected setAccount(id: string) {
    this.navigate({ cuenta: id || null });
  }

  private navigate(params: Record<string, string | null>) {
    this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** +1 entra plata a la cuenta mirada, −1 sale, 0 neutro (transferencia sin filtro). */
  protected sign(t: TransactionRow): number {
    switch (t.type) {
      case 'income':
        return 1;
      case 'expense':
        return -1;
      case 'adjustment':
        return Math.sign(t.amount);
      case 'transfer':
        if (!this.cuenta()) return 0;
        return t.to_account_id === this.cuenta() ? 1 : -1;
    }
  }

  protected displayAmount(t: TransactionRow): number {
    if (t.type === 'transfer' && this.cuenta() && t.to_account_id === this.cuenta()) return t.to_amount ?? t.amount;
    return Math.abs(t.amount);
  }

  protected displayCurrency(t: TransactionRow): Currency {
    if (t.type === 'transfer' && this.cuenta() && t.to_account_id === this.cuenta()) return t.to_account?.currency ?? 'ARS';
    return t.account?.currency ?? 'ARS';
  }

  protected icon(t: TransactionRow): string {
    if (t.type === 'transfer') return 'swap_horiz';
    if (t.type === 'adjustment') return 'tune';
    return t.category?.icon || (t.type === 'income' ? 'south_west' : 'north_east');
  }

  protected typeLabel(t: TransactionRow): string {
    return { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', adjustment: 'Ajuste de saldo' }[t.type];
  }
}
