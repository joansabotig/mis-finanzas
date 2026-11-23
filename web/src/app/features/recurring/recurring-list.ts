import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data.service';
import { RecurringItem, TransactionRow } from '../../core/models';
import { addMonths, currentMonth, isMonth, monthLabel } from '../../core/util/dates';
import { MoneyPipe } from '../../shared/money.pipe';

interface Row {
  item: RecurringItem;
  payment: TransactionRow | undefined;
}

/** Checklist mensual de gastos/ingresos fijos (equivalente a la columna "ok" del Excel). */
@Component({
  selector: 'app-recurring-list',
  imports: [RouterLink, MoneyPipe, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      <div class="month">
        <button mat-icon-button aria-label="Mes anterior" (click)="go(-1)"><mat-icon>chevron_left</mat-icon></button>
        <span class="month-label">{{ label() }}</span>
        <button mat-icon-button aria-label="Mes siguiente" (click)="go(1)"><mat-icon>chevron_right</mat-icon></button>
      </div>

      <div class="totals">
        <div><span class="muted">Pagado</span><b>{{ paidTotal() | money: 'ARS' }}</b></div>
        <div><span class="muted">Pendiente</span><b class="neg">{{ pendingTotal() | money: 'ARS' }}</b></div>
        <div><span class="muted">Listos</span><b>{{ paidCount() }}/{{ expenses().length }}</b></div>
      </div>

      @if (error()) { <p class="error">{{ error() }}</p> }

      @for (section of sections(); track section.title) {
        @if (section.rows.length) {
          <div class="section-title">{{ section.title }}</div>
          <div class="rows">
            @for (r of section.rows; track r.item.id) {
              <div class="row">
                <mat-icon [class.pos]="r.payment" [class.muted]="!r.payment">{{ r.payment ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                <a class="grow link" [routerLink]="['/fijos', r.item.id]">
                  <span class="main">{{ r.item.name }}</span>
                  <span class="sub">
                    @if (r.payment) {
                      {{ r.payment.date.slice(8) }}/{{ r.payment.date.slice(5, 7) }} · {{ r.payment.account?.name }}
                    } @else {
                      @if (r.item.due_day) { Vence el {{ r.item.due_day }} · }
                      Estimado {{ r.item.estimated_amount | money: r.item.currency }}
                    }
                  </span>
                </a>
                @if (r.payment) {
                  <a class="amount link" [routerLink]="['/movimientos', r.payment.id]">{{ r.payment.amount | money: r.payment.account?.currency }}</a>
                } @else {
                  <button mat-stroked-button (click)="pay(r.item)">{{ r.item.kind === 'income' ? 'Cobrar' : 'Pagar' }}</button>
                }
              </div>
            }
          </div>
        }
      }

      @if (!loading() && !items().length) {
        <p class="empty">Todavía no cargaste gastos fijos.<br />Agregá servicios, suscripciones, alquiler, sueldo…</p>
      }

      <a mat-stroked-button class="new" routerLink="/fijos/nuevo"><mat-icon>add</mat-icon> Nuevo gasto o ingreso fijo</a>
    </div>
  `,
  styles: `
    .month { display: flex; align-items: center; justify-content: space-between; }
    .month-label { font: var(--mat-sys-title-medium); }
    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
    .totals div { display: flex; flex-direction: column; }
    .link { color: inherit; text-decoration: none; }
    .new { width: 100%; margin-top: 24px; }
  `,
})
export class RecurringList {
  readonly mes = input<string>();
  private readonly data = inject(DataService);
  private readonly router = inject(Router);

  protected readonly month = computed(() => (isMonth(this.mes()) ? this.mes()! : currentMonth()));
  protected readonly label = computed(() => monthLabel(this.month()));
  protected readonly items = signal<RecurringItem[]>([]);
  private readonly payments = signal<TransactionRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private request = 0;

  private readonly rows = computed<Row[]>(() => {
    const byItem = new Map(this.payments().map((p) => [p.recurring_id, p]));
    return this.items().map((item) => ({ item, payment: byItem.get(item.id) }));
  });

  protected readonly expenses = computed(() => this.rows().filter((r) => r.item.kind === 'expense'));
  protected readonly sections = computed(() => {
    const sortPending = (a: Row, b: Row) => Number(!!a.payment) - Number(!!b.payment) || (a.item.due_day ?? 99) - (b.item.due_day ?? 99);
    return [
      { title: 'Gastos fijos', rows: [...this.expenses()].sort(sortPending) },
      { title: 'Ingresos fijos', rows: this.rows().filter((r) => r.item.kind === 'income').sort(sortPending) },
    ];
  });

  protected readonly paidCount = computed(() => this.expenses().filter((r) => r.payment).length);
  protected readonly paidTotal = computed(() =>
    this.expenses().reduce((s, r) => s + (r.payment && r.payment.account?.currency !== 'USD' ? r.payment.amount : 0), 0),
  );
  protected readonly pendingTotal = computed(() =>
    this.expenses().reduce((s, r) => s + (!r.payment && r.item.currency === 'ARS' ? (r.item.estimated_amount ?? 0) : 0), 0),
  );

  constructor() {
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
      const [items, payments] = await Promise.all([this.data.recurringItems(), this.data.recurringPayments(month)]);
      if (req !== this.request) return;
      this.items.set(items);
      this.payments.set(payments);
    } catch (e) {
      if (req === this.request) this.error.set('Error cargando fijos: ' + (e as Error).message);
    } finally {
      if (req === this.request) this.loading.set(false);
    }
  }

  protected go(delta: number) {
    this.router.navigate([], { queryParams: { mes: addMonths(this.month(), delta) }, replaceUrl: true });
  }

  protected pay(item: RecurringItem) {
    this.router.navigate(['/movimientos/nuevo'], { queryParams: { fijo: item.id, periodo: this.month() } });
  }
}
