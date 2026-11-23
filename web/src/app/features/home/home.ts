import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data.service';
import { AccountBalance, Currency, TransactionRow } from '../../core/models';
import { currentMonth, monthLabel } from '../../core/util/dates';
import { MoneyPipe } from '../../shared/money.pipe';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MoneyPipe, MatCardModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      @if (error()) { <p class="error">{{ error() }}</p> }

      <mat-card appearance="outlined" class="card">
        <mat-card-content>
          <div class="label">Patrimonio total</div>
          <div class="big">{{ totalArs() | money: 'ARS' }}</div>
          <div class="muted">{{ totalArs() / rate() | money: 'USD' }} · dólar a {{ rate() | money: 'ARS' }}</div>
        </mat-card-content>
      </mat-card>

      <a class="card-link" routerLink="/movimientos">
        <mat-card appearance="outlined" class="card">
          <mat-card-content>
            <div class="label month">{{ month }}</div>
            <div class="summary">
              <div><span class="muted">Ingresos</span><b class="pos">{{ income() | money: 'ARS' }}</b></div>
              <div><span class="muted">Gastos</span><b class="neg">{{ expense() | money: 'ARS' }}</b></div>
              <div><span class="muted">Queda</span><b [class.neg]="income() - expense() < 0">{{ income() - expense() | money: 'ARS' }}</b></div>
            </div>
            @if (hasUsd()) { <div class="muted note">Incluye movimientos en USD convertidos a {{ rate() | money: 'ARS' }}.</div> }
          </mat-card-content>
        </mat-card>
      </a>

      @for (cur of currencies; track cur) {
        @if (byCurrency(cur).length) {
          <div class="section-title">Cuentas en {{ cur }} · {{ subtotal(cur) | money: cur }}</div>
          <div class="rows">
            @for (a of byCurrency(cur); track a.id) {
              <a class="row" [routerLink]="['/movimientos']" [queryParams]="{ cuenta: a.id }">
                <span class="grow main">{{ a.name }}</span>
                <span class="amount" [class.neg]="a.balance < 0">{{ a.balance | money: cur }}</span>
              </a>
            }
          </div>
        }
      }
    </div>
  `,
  styles: `
    .card { margin-bottom: 12px; }
    .card-link { color: inherit; text-decoration: none; }
    .label { font: var(--mat-sys-label-large); color: var(--mat-sys-on-surface-variant); }
    .month { margin-bottom: 8px; }
    .big { font: var(--mat-sys-headline-large); margin: 4px 0; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .summary div { display: flex; flex-direction: column; min-width: 0; }
    .note { margin-top: 8px; font: var(--mat-sys-body-small); }
  `,
})
export class Home implements OnInit {
  private readonly data = inject(DataService);
  protected readonly currencies: Currency[] = ['ARS', 'USD'];
  protected readonly month = monthLabel(currentMonth());
  protected readonly accounts = signal<AccountBalance[]>([]);
  private readonly monthTx = signal<TransactionRow[]>([]);
  protected readonly rate = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private toArs(amount: number, currency: Currency | undefined) {
    return currency === 'USD' ? amount * this.rate() : amount;
  }

  protected readonly totalArs = computed(() =>
    this.accounts()
      .filter((a) => a.include_in_total)
      .reduce((sum, a) => sum + this.toArs(a.balance, a.currency), 0),
  );

  private sumOf(type: 'income' | 'expense') {
    return this.monthTx()
      .filter((t) => t.type === type)
      .reduce((s, t) => s + this.toArs(t.amount, t.account?.currency), 0);
  }

  protected readonly income = computed(() => this.sumOf('income'));
  protected readonly expense = computed(() => this.sumOf('expense'));
  protected readonly hasUsd = computed(() =>
    this.monthTx().some((t) => (t.type === 'income' || t.type === 'expense') && t.account?.currency === 'USD'),
  );

  async ngOnInit() {
    try {
      const [accounts, rate, tx] = await Promise.all([
        this.data.accountBalances(),
        this.data.latestRate(),
        this.data.transactionsOfMonth(currentMonth()),
      ]);
      this.accounts.set(accounts);
      if (rate) this.rate.set(rate);
      this.monthTx.set(tx);
    } catch (e) {
      this.error.set('Error cargando datos: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected byCurrency(cur: Currency) {
    return this.accounts().filter((a) => a.currency === cur);
  }

  protected subtotal(cur: Currency) {
    return this.byCurrency(cur)
      .filter((a) => a.include_in_total)
      .reduce((s, a) => s + a.balance, 0);
  }
}
