import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { CardInfo, CardsService } from '../../core/cards.service';
import { DataService } from '../../core/data.service';
import { AccountBalance, Currency, RATE_SOURCES, RecurringItem, TransactionRow } from '../../core/models';
import { CurrentRate, RateService } from '../../core/rate.service';
import { currentMonth, monthLabel } from '../../core/util/dates';
import { CardSummaryView } from '../../shared/card-summary';
import { MoneyPipe } from '../../shared/money.pipe';

const WELCOME_KEY = 'mis-finanzas.welcome-dismissed';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* sin almacenamiento */
  }
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, MoneyPipe, CardSummaryView, MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      @if (error()) { <p class="error">{{ error() }}</p> }

      @if (showWelcome()) {
        <mat-card appearance="outlined" class="card welcome">
          <mat-card-content>
            <div class="label">¡Bienvenido/a a Mis Finanzas!</div>
            <p class="muted small">Cuatro pasos para arrancar:</p>
            <a class="step" routerLink="/cuentas/nueva"><mat-icon>account_balance_wallet</mat-icon> Creá tus cuentas (banco, billetera, efectivo) con su saldo actual</a>
            <a class="step" routerLink="/cuentas/nueva"><mat-icon>credit_card</mat-icon> Agregá tus tarjetas con el día de cierre y vencimiento</a>
            <a class="step" routerLink="/fijos/nuevo"><mat-icon>event_repeat</mat-icon> Cargá tus gastos fijos (luz, internet, suscripciones…)</a>
            <span class="step"><mat-icon>add_circle</mat-icon> Tocá <b>+</b> cada vez que gastes</span>
            <button mat-button (click)="dismissWelcome()">Entendido</button>
          </mat-card-content>
        </mat-card>
      }

      <mat-card appearance="outlined" class="card">
        <mat-card-content>
          <div class="label">Patrimonio total</div>
          <div class="big">{{ totalArs() | money: 'ARS' }}</div>
          <a class="muted rate" routerLink="/mas">
            {{ totalArs() / rate().rate | money: 'USD' }} · {{ rateLabel() }} {{ rate().rate | money: 'ARS' }}
          </a>
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
            @if (hasUsd()) { <div class="muted note">Incluye movimientos en USD convertidos a {{ rate().rate | money: 'ARS' }}.</div> }
          </mat-card-content>
        </mat-card>
      </a>

      @if (pendingFixed().length) {
        <a class="card-link" routerLink="/fijos">
          <mat-card appearance="outlined" class="card fixed">
            <mat-card-content>
              <mat-icon>event_repeat</mat-icon>
              <span class="grow">
                <b>{{ pendingFixed().length }} {{ pendingFixed().length === 1 ? 'gasto fijo pendiente' : 'gastos fijos pendientes' }}</b>
                <span class="muted small">{{ pendingNames() }}</span>
              </span>
              <b class="neg">{{ pendingFixedTotal() | money: 'ARS' }}</b>
            </mat-card-content>
          </mat-card>
        </a>
      }

      @if (cards().length) {
        <div class="section-title">Tarjetas de crédito</div>
        @for (c of cards(); track c.card.id) { <app-card-summary [info]="c" /> }
      }

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

      @if (!loading() && !accounts().length) {
        <p class="empty">Empezá creando tus cuentas: banco, billetera, efectivo, tarjeta…</p>
        <a mat-flat-button class="wide" routerLink="/cuentas/nueva">Crear cuenta</a>
      }
    </div>
  `,
  styles: `
    .card { margin-bottom: 12px; }
    .card-link { color: inherit; text-decoration: none; }
    .label { font: var(--mat-sys-label-large); color: var(--mat-sys-on-surface-variant); }
    .month { margin-bottom: 8px; }
    .big { font: var(--mat-sys-headline-large); margin: 4px 0; }
    .rate { text-decoration: none; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .summary div { display: flex; flex-direction: column; min-width: 0; }
    .note, .small { font: var(--mat-sys-body-small); }
    .fixed mat-card-content { display: flex; align-items: center; gap: 12px; }
    .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .grow .small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wide { width: 100%; }
    .welcome { border-color: var(--mat-sys-primary); }
    .welcome p { margin: 4px 0 8px; }
    .step { display: flex; align-items: center; gap: 10px; padding: 8px 0; color: inherit; text-decoration: none; font: var(--mat-sys-body-medium); }
    .step mat-icon { color: var(--mat-sys-primary); flex: none; }
  `,
})
export class Home implements OnInit {
  private readonly data = inject(DataService);
  private readonly cardsService = inject(CardsService);
  private readonly rates = inject(RateService);
  protected readonly currencies: Currency[] = ['ARS', 'USD'];
  protected readonly month = monthLabel(currentMonth());
  protected readonly accounts = signal<AccountBalance[]>([]);
  protected readonly cards = signal<CardInfo[]>([]);
  private readonly monthTx = signal<TransactionRow[]>([]);
  private readonly fixed = signal<RecurringItem[]>([]);
  private readonly fixedPaid = signal<Set<string>>(new Set());
  protected readonly rate = signal<CurrentRate>({ rate: 1, source: 'manual', date: null });
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly welcomeDismissed = signal(readFlag(WELCOME_KEY));
  /** Usuario nuevo: a lo sumo la cuenta "Efectivo" inicial en cero, sin movimientos ni fijos. */
  protected readonly showWelcome = computed(
    () =>
      !this.loading() &&
      !this.welcomeDismissed() &&
      this.accounts().length <= 1 &&
      this.accounts().every((a) => a.balance === 0) &&
      !this.monthTx().length &&
      !this.fixed().length,
  );

  protected dismissWelcome() {
    this.welcomeDismissed.set(true);
    writeFlag(WELCOME_KEY);
  }

  protected readonly rateLabel = computed(() =>
    this.rate().source === 'manual' ? 'dólar a' : (RATE_SOURCES.find((s) => s.value === this.rate().source)?.label ?? 'dólar') + ' a',
  );

  private toArs(amount: number, currency: Currency | undefined) {
    return currency === 'USD' ? amount * this.rate().rate : amount;
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

  protected readonly pendingFixed = computed(() =>
    this.fixed().filter((f) => f.kind === 'expense' && !this.fixedPaid().has(f.id)),
  );
  protected readonly pendingFixedTotal = computed(() =>
    this.pendingFixed().reduce((s, f) => s + this.toArs(f.estimated_amount ?? 0, f.currency), 0),
  );
  protected readonly pendingNames = computed(() =>
    this.pendingFixed()
      .slice(0, 4)
      .map((f) => f.name)
      .join(', ') + (this.pendingFixed().length > 4 ? '…' : ''),
  );

  async ngOnInit() {
    try {
      const month = currentMonth();
      const [accounts, rate, tx, fixed, paid] = await Promise.all([
        this.data.accountBalances(),
        this.rates.current(),
        this.data.transactionsOfMonth(month),
        this.data.recurringItems().catch(() => []),
        this.data.recurringPayments(month).catch(() => []),
      ]);
      this.accounts.set(accounts);
      this.rate.set(rate);
      this.monthTx.set(tx);
      this.fixed.set(fixed);
      this.fixedPaid.set(new Set(paid.map((p) => p.recurring_id!)));
      this.cards.set(await this.cardsService.infos(accounts));
    } catch (e) {
      this.error.set('Error cargando datos: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected byCurrency(cur: Currency) {
    return this.accounts().filter((a) => a.currency === cur && a.type !== 'credit_card');
  }

  protected subtotal(cur: Currency) {
    return this.byCurrency(cur)
      .filter((a) => a.include_in_total)
      .reduce((s, a) => s + a.balance, 0);
  }
}
