import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data.service';
import { Category, CATEGORY_GROUPS, TransactionRow } from '../../core/models';
import { RateService } from '../../core/rate.service';
import { addMonths, currentMonth, isMonth, monthLabel, monthRange } from '../../core/util/dates';
import { MoneyPipe } from '../../shared/money.pipe';

interface Bar {
  key: string;
  label: string;
  icon?: string | null;
  value: number;
  pct: number;
  link?: Record<string, string>;
}

const MONTHS_BACK = 6;

@Component({
  selector: 'app-reports',
  imports: [RouterLink, MoneyPipe, MatButtonModule, MatButtonToggleModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      <div class="month">
        <button mat-icon-button aria-label="Mes anterior" (click)="go(-1)"><mat-icon>chevron_left</mat-icon></button>
        <span class="month-label">{{ label() }}</span>
        <button mat-icon-button aria-label="Mes siguiente" (click)="go(1)"><mat-icon>chevron_right</mat-icon></button>
      </div>

      <div class="totals">
        <div><span class="muted">Ingresos</span><b class="pos">{{ income() | money: 'ARS' }}</b></div>
        <div><span class="muted">Gastos</span><b class="neg">{{ expenseTotal() | money: 'ARS' }}</b></div>
        <div><span class="muted">Ahorro</span><b [class.neg]="income() - expenseTotal() < 0">{{ savingsPct() }}</b></div>
      </div>

      @if (error()) { <p class="error">{{ error() }}</p> }

      <mat-button-toggle-group class="view" [value]="view()" (change)="view.set($event.value)">
        <mat-button-toggle value="cat">Categoría</mat-button-toggle>
        <mat-button-toggle value="grp">Tipo</mat-button-toggle>
        <mat-button-toggle value="acc">Medio de pago</mat-button-toggle>
      </mat-button-toggle-group>

      <div class="bars">
        @for (b of bars(); track b.key) {
          <a class="bar" [routerLink]="b.link ? ['/movimientos'] : null" [queryParams]="b.link ?? null">
            <div class="bar-head">
              @if (b.icon) { <mat-icon class="muted">{{ b.icon }}</mat-icon> }
              <span class="bar-label">{{ b.label }}</span>
              <span class="amount">{{ b.value | money: 'ARS' }}</span>
              <span class="pct muted">{{ b.pct }}%</span>
            </div>
            <div class="track"><div class="fill" [style.width.%]="b.pct"></div></div>
          </a>
        } @empty {
          @if (!loading()) { <p class="empty">No hay gastos en {{ label() }}.</p> }
        }
      </div>

      <div class="section-title">Últimos {{ monthsBack }} meses</div>
      <div class="chart">
        @for (m of history(); track m.month) {
          <a class="col" [routerLink]="['/reportes']" [queryParams]="{ mes: m.month }" [class.current]="m.month === month()">
            <div class="pair">
              <div class="b in" [style.height.%]="m.incomePct" [attr.title]="'Ingresos ' + (m.income | money: 'ARS')"></div>
              <div class="b out" [style.height.%]="m.expensePct" [attr.title]="'Gastos ' + (m.expense | money: 'ARS')"></div>
            </div>
            <span class="m">{{ m.short }}</span>
          </a>
        }
      </div>
      <div class="legend muted"><span class="dot in"></span> Ingresos <span class="dot out"></span> Gastos</div>
      @if (usdNote()) { <p class="muted small">Los montos en USD se convierten a {{ rate() | money: 'ARS' }}.</p> }
    </div>
  `,
  styles: `
    .month { display: flex; align-items: center; justify-content: space-between; }
    .month-label { font: var(--mat-sys-title-medium); }
    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0 16px; }
    .totals div { display: flex; flex-direction: column; }
    .view { width: 100%; margin-bottom: 12px; }
    .view mat-button-toggle { flex: 1; }
    .bars { display: flex; flex-direction: column; gap: 10px; }
    .bar { color: inherit; text-decoration: none; }
    .bar-head { display: flex; align-items: center; gap: 8px; }
    .bar-head mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .bar-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pct { width: 40px; text-align: right; font: var(--mat-sys-body-small); }
    .track { height: 8px; border-radius: 4px; background: var(--mat-sys-surface-container-high); margin-top: 4px; overflow: hidden; }
    .fill { height: 100%; border-radius: 4px; background: var(--mat-sys-primary); }
    .chart { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; height: 140px; align-items: end; margin-top: 8px; }
    .col { display: flex; flex-direction: column; align-items: center; height: 100%; color: inherit; text-decoration: none; }
    .col.current .m { font-weight: 700; color: var(--mat-sys-primary); }
    .pair { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; }
    .b { width: 40%; min-height: 2px; border-radius: 3px 3px 0 0; }
    .in, .dot.in { background: #1b873f; }
    .out, .dot.out { background: var(--mat-sys-error); }
    .m { font: var(--mat-sys-label-small); margin-top: 4px; text-transform: capitalize; }
    .legend { display: flex; align-items: center; gap: 6px; margin-top: 8px; font: var(--mat-sys-body-small); }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-left: 8px; }
    .small { font: var(--mat-sys-body-small); }
  `,
})
export class Reports {
  readonly mes = input<string>();
  private readonly data = inject(DataService);
  private readonly rates = inject(RateService);
  private readonly router = inject(Router);
  protected readonly monthsBack = MONTHS_BACK;

  protected readonly month = computed(() => (isMonth(this.mes()) ? this.mes()! : currentMonth()));
  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly view = signal<'cat' | 'grp' | 'acc'>('cat');
  private readonly txs = signal<TransactionRow[]>([]);
  private readonly categories = signal<Category[]>([]);
  protected readonly rate = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private request = 0;

  private ars(t: TransactionRow) {
    return t.account?.currency === 'USD' ? t.amount * this.rate() : t.amount;
  }

  private readonly monthTx = computed(() => this.txs().filter((t) => t.date.startsWith(this.month())));
  private readonly expenses = computed(() => this.monthTx().filter((t) => t.type === 'expense'));
  protected readonly expenseTotal = computed(() => this.expenses().reduce((s, t) => s + this.ars(t), 0));
  protected readonly income = computed(() =>
    this.monthTx()
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + this.ars(t), 0),
  );
  protected readonly savingsPct = computed(() => {
    const inc = this.income();
    if (!inc) return '—';
    return Math.round(((inc - this.expenseTotal()) / inc) * 100) + '%';
  });
  protected readonly usdNote = computed(() => this.txs().some((t) => t.account?.currency === 'USD' && t.type !== 'transfer'));

  protected readonly bars = computed<Bar[]>(() => {
    const total = this.expenseTotal() || 1;
    const groups = new Map<string, Bar>();
    const catById = new Map(this.categories().map((c) => [c.id, c]));
    for (const t of this.expenses()) {
      let key: string, label: string, icon: string | null | undefined, link: Record<string, string> | undefined;
      if (this.view() === 'cat') {
        key = t.category_id ?? 'none';
        label = t.category?.name ?? 'Sin categoría';
        icon = t.category?.icon;
        link = t.category_id ? { mes: this.month(), cat: t.category_id } : undefined;
      } else if (this.view() === 'grp') {
        const grp = (t.category_id && catById.get(t.category_id)?.grp) || 'none';
        key = grp;
        label = CATEGORY_GROUPS.find((g) => g.value === grp)?.label ?? 'Sin grupo';
      } else {
        key = t.account_id;
        label = t.account?.name ?? '—';
        icon = t.account?.type === 'credit_card' ? 'credit_card' : 'account_balance_wallet';
        link = { mes: this.month(), cuenta: t.account_id };
      }
      const bar = groups.get(key) ?? { key, label, icon, value: 0, pct: 0, link };
      bar.value += this.ars(t);
      groups.set(key, bar);
    }
    return [...groups.values()]
      .map((b) => ({ ...b, value: Math.round(b.value), pct: Math.round((b.value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  });

  protected readonly history = computed(() => {
    const months = Array.from({ length: MONTHS_BACK }, (_, i) => addMonths(this.month(), i - MONTHS_BACK + 1));
    const rows = months.map((m) => {
      let income = 0;
      let expense = 0;
      for (const t of this.txs()) {
        if (!t.date.startsWith(m)) continue;
        if (t.type === 'income') income += this.ars(t);
        else if (t.type === 'expense') expense += this.ars(t);
      }
      const [y, mo] = m.split('-').map(Number);
      const short = new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(y, mo - 1, 1)).replace('.', '');
      return { month: m, short, income, expense };
    });
    const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expense]));
    return rows.map((r) => ({ ...r, incomePct: (r.income / max) * 100, expensePct: (r.expense / max) * 100 }));
  });

  constructor() {
    this.data.categories(true).then((c) => this.categories.set(c)).catch(() => undefined);
    this.rates.current().then((r) => this.rate.set(r.rate));
    effect(() => {
      const m = this.month();
      untracked(() => this.load(m));
    });
  }

  private async load(month: string) {
    const req = ++this.request;
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = monthRange(addMonths(month, -(MONTHS_BACK - 1))).from;
      const to = monthRange(month).to;
      const txs = await this.data.transactions({ from, to });
      if (req === this.request) this.txs.set(txs);
    } catch (e) {
      if (req === this.request) this.error.set('Error cargando reportes: ' + (e as Error).message);
    } finally {
      if (req === this.request) this.loading.set(false);
    }
  }

  protected go(delta: number) {
    this.router.navigate([], { queryParams: { mes: addMonths(this.month(), delta) }, replaceUrl: true });
  }
}
