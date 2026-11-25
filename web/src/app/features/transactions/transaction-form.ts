import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data.service';
import { AccountBalance, Category, TransactionInput } from '../../core/models';
import { injectGoBack } from '../../core/nav';
import { prefs } from '../../core/prefs';
import { RateService } from '../../core/rate.service';
import { isMonth, monthLabel, todayIso } from '../../core/util/dates';
import { amountError, amountToInput, formatMoney, parseAmount } from '../../core/util/money';
import { MoneyPipe } from '../../shared/money.pipe';

type FormType = 'expense' | 'income' | 'transfer';

const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 9, 12, 18, 24];

@Component({
  selector: 'app-transaction-form',
  imports: [
    FormsModule,
    MoneyPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <form class="page form" (ngSubmit)="save()">
      @if (unsupported()) {
        <p class="error">Los ajustes de saldo no se editan desde acá: eliminalo y cargá el ajuste de nuevo desde la cuenta.</p>
      }
      @if (recurringName()) {
        <p class="banner"><mat-icon>event_repeat</mat-icon> {{ type() === 'income' ? 'Cobro' : 'Pago' }} de <b>{{ recurringName() }}</b> · {{ periodLabel() }}</p>
      }
      @if (installmentInfo(); as info) {
        <p class="banner"><mat-icon>credit_score</mat-icon> Cuota {{ info }}. Los cambios aplican solo a esta cuota.</p>
      }

      <mat-button-toggle-group class="type" [value]="type()" (change)="setType($event.value)" [disabled]="unsupported() || !!recurringName() || !!installmentInfo()">
        <mat-button-toggle value="expense">Gasto</mat-button-toggle>
        <mat-button-toggle value="income">Ingreso</mat-button-toggle>
        <mat-button-toggle value="transfer">Transferencia</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline" class="amount" subscriptSizing="dynamic">
        <mat-label>{{ type() === 'transfer' ? 'Monto que sale' : 'Monto' }}{{ installments() > 1 ? ' total' : '' }}</mat-label>
        <span matTextPrefix>{{ account()?.currency === 'USD' ? 'US$' : '$' }}&nbsp;</span>
        <input matInput name="amount" inputmode="decimal" autocomplete="off" placeholder="0" [(ngModel)]="amountText" required />
        @if (amountPreview(); as p) {
          <mat-hint>{{ p | money: account()?.currency }}@if (installments() > 1) { · {{ installments() }} cuotas de {{ p / installments() | money: account()?.currency }} }</mat-hint>
        }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ type() === 'transfer' ? 'Desde' : type() === 'expense' ? 'Pagado con' : 'Cuenta' }}</mat-label>
        <mat-select name="account" [(ngModel)]="accountId" required>
          @for (a of accounts(); track a.id) {
            <mat-option [value]="a.id">{{ a.name }} · {{ a.balance | money: a.currency }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (type() === 'transfer') {
        <mat-form-field appearance="outline">
          <mat-label>Hacia</mat-label>
          <mat-select name="toAccount" [(ngModel)]="toAccountId" required>
            @for (a of accounts(); track a.id) {
              @if (a.id !== accountId()) {
                <mat-option [value]="a.id">{{ a.name }} · {{ a.balance | money: a.currency }}</mat-option>
              }
            }
          </mat-select>
          @if (toAccount()?.type === 'credit_card') { <mat-hint>Pago de tarjeta</mat-hint> }
        </mat-form-field>

        @if (crossCurrency()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Monto que entra</mat-label>
            <span matTextPrefix>{{ toAccount()?.currency === 'USD' ? 'US$' : '$' }}&nbsp;</span>
            <input matInput name="toAmount" inputmode="decimal" autocomplete="off" [(ngModel)]="toAmountText" required />
            <mat-hint>{{ rateHint() }}</mat-hint>
          </mat-form-field>
        }
      } @else {
        @if (isCard() && type() === 'expense' && !id() && !recurringName()) {
          <div class="field-label">Cuotas</div>
          <mat-chip-listbox aria-label="Cuotas" [value]="installments()" (change)="installments.set($event.value ?? 1)">
            @for (n of installmentOptions; track n) {
              <mat-chip-option [value]="n">{{ n === 1 ? '1 pago' : n }}</mat-chip-option>
            }
          </mat-chip-listbox>
        }

        <div class="field-label">Categoría</div>
        <mat-chip-listbox aria-label="Categoría" [value]="categoryId()" (change)="categoryId.set($event.value ?? null)">
          @for (c of visibleCategories(); track c.id) {
            <mat-chip-option [value]="c.id">
              @if (c.icon) { <mat-icon matChipAvatar>{{ c.icon }}</mat-icon> }
              {{ c.name }}
            </mat-chip-option>
          }
        </mat-chip-listbox>
      }

      <mat-form-field appearance="outline" class="desc">
        <mat-label>Descripción (opcional)</mat-label>
        <input matInput name="description" autocomplete="off" [(ngModel)]="description" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>{{ installments() > 1 ? 'Fecha de la primera cuota' : 'Fecha' }}</mat-label>
        <input matInput type="date" name="date" [(ngModel)]="date" required />
      </mat-form-field>

      @if (error()) { <p class="error">{{ error() }}</p> }

      <div class="actions">
        @if (id()) {
          <button mat-stroked-button type="button" class="delete" (click)="remove(false)" [disabled]="saving()">
            {{ confirmDelete() === 'one' ? '¿Seguro? Tocá de nuevo' : 'Eliminar' }}
          </button>
        }
        <button mat-flat-button type="submit" [disabled]="saving() || loading() || unsupported()">Guardar</button>
      </div>
      @if (id() && installmentGroup()) {
        <button mat-button type="button" class="delete all" (click)="remove(true)" [disabled]="saving()">
          {{ confirmDelete() === 'all' ? '¿Seguro? Se borran todas las cuotas' : 'Eliminar todas las cuotas de esta compra' }}
        </button>
      }
    </form>
  `,
  styles: `
    .type { width: 100%; margin-bottom: 16px; }
    .type mat-button-toggle { flex: 1; }
    .amount { margin-bottom: 12px; }
    .amount input { font-size: 28px; }
    mat-chip-listbox { margin-bottom: 16px; }
    .desc { margin-top: 4px; }
    .delete { color: var(--mat-sys-error); }
    .all { width: 100%; margin-top: 8px; }
    .banner { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 8px 12px; border-radius: 8px;
      background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); }
  `,
})
export class TransactionForm implements OnInit {
  /** Parámetro de ruta /movimientos/:id */
  readonly id = input<string>();
  /** Query params opcionales: ?cuenta=…&tipo=transfer&hacia=…&fijo=…&periodo=YYYY-MM */
  readonly cuenta = input<string>();
  readonly tipo = input<string>();
  readonly hacia = input<string>();
  readonly fijo = input<string>();
  readonly periodo = input<string>();
  readonly monto = input<string>();

  private readonly data = inject(DataService);
  private readonly rates = inject(RateService);
  private readonly snack = inject(MatSnackBar);
  private readonly goBack = injectGoBack();
  protected readonly installmentOptions = INSTALLMENT_OPTIONS;

  protected readonly type = signal<FormType>('expense');
  protected readonly amountText = signal('');
  protected readonly toAmountText = signal('');
  protected readonly accountId = signal<string | null>(null);
  protected readonly toAccountId = signal<string | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly description = signal('');
  protected readonly date = signal(todayIso());
  protected readonly installments = signal(1);

  private readonly recurringId = signal<string | null>(null);
  protected readonly recurringName = signal<string | null>(null);
  protected readonly period = signal<string | null>(null);
  protected readonly installmentGroup = signal<string | null>(null);
  protected readonly installmentInfo = signal<string | null>(null);

  protected readonly accounts = signal<AccountBalance[]>([]);
  private readonly categories = signal<Category[]>([]);
  private readonly rate = signal(1);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly unsupported = signal(false);
  protected readonly confirmDelete = signal<'one' | 'all' | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly account = computed(() => this.accounts().find((a) => a.id === this.accountId()));
  protected readonly toAccount = computed(() => this.accounts().find((a) => a.id === this.toAccountId()));
  protected readonly isCard = computed(() => this.account()?.type === 'credit_card');
  protected readonly crossCurrency = computed(
    () => !!this.account() && !!this.toAccount() && this.account()!.currency !== this.toAccount()!.currency,
  );
  protected readonly amountPreview = computed(() => parseAmount(this.amountText()));
  protected readonly periodLabel = computed(() => (isMonth(this.period()) ? monthLabel(this.period()!) : ''));

  protected readonly rateHint = computed(() => {
    const out = this.amountPreview();
    const inn = parseAmount(this.toAmountText());
    if (!out || !inn) return `Cotización de referencia: ${formatMoney(this.rate(), 'ARS')}`;
    const implied = this.account()?.currency === 'ARS' ? out / inn : inn / out;
    return `Equivale a ${formatMoney(Math.round(implied * 100) / 100, 'ARS')} por dólar`;
  });

  /** Categorías del tipo elegido, las más usadas en este dispositivo primero. */
  protected readonly visibleCategories = computed(() =>
    this.categories()
      .filter((c) => c.kind === this.type() && (c.is_active || c.id === this.categoryId()))
      .sort((a, b) => prefs.categoryUse(b.id) - prefs.categoryUse(a.id) || a.name.localeCompare(b.name)),
  );

  async ngOnInit() {
    try {
      const [accounts, categories] = await Promise.all([this.data.accountBalances(), this.data.categories(true)]);
      this.accounts.set(accounts);
      this.categories.set(categories);
      this.rates.current().then((r) => this.rate.set(r.rate));

      const id = this.id();
      if (id) await this.loadExisting(id);
      else await this.prefill();
    } catch (e) {
      this.error.set('Error cargando datos: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadExisting(id: string) {
    const t = await this.data.transaction(id);
    if (t.type === 'adjustment') this.unsupported.set(true);
    else this.type.set(t.type);
    this.amountText.set(amountToInput(Math.abs(t.amount)));
    this.accountId.set(t.account_id);
    this.toAccountId.set(t.to_account_id);
    this.toAmountText.set(amountToInput(t.to_amount));
    this.categoryId.set(t.category_id);
    this.description.set(t.description ?? '');
    this.date.set(t.date);
    this.recurringId.set(t.recurring_id);
    this.period.set(t.period);
    if (t.installment_group) {
      this.installmentGroup.set(t.installment_group);
      this.installmentInfo.set(`${t.installment_number}/${t.installment_total}`);
    }
    if (t.recurring_id) {
      this.data.recurringItem(t.recurring_id).then((r) => this.recurringName.set(r.name)).catch(() => undefined);
    }
    // Cuentas desactivadas usadas por este movimiento igual tienen que aparecer.
    const used = [t.account_id, t.to_account_id].filter((x): x is string => !!x);
    if (used.some((u) => !this.accounts().some((a) => a.id === u))) {
      const all = await this.data.accountBalances(true);
      this.accounts.set(all.filter((a) => a.is_active || used.includes(a.id)));
    }
  }

  private async prefill() {
    if (this.tipo() === 'transfer' || this.tipo() === 'income') this.type.set(this.tipo() as FormType);
    const fijo = this.fijo();
    if (fijo) {
      const r = await this.data.recurringItem(fijo);
      this.type.set(r.kind);
      this.recurringId.set(r.id);
      this.recurringName.set(r.name);
      this.period.set(isMonth(this.periodo()) ? this.periodo()! : todayIso().slice(0, 7));
      this.amountText.set(amountToInput(r.estimated_amount));
      this.categoryId.set(r.category_id);
      this.description.set(r.name);
      const exists = r.default_account_id && this.accounts().some((a) => a.id === r.default_account_id);
      this.accountId.set(exists ? r.default_account_id : this.defaultAccount(r.kind));
      return;
    }
    this.accountId.set(this.defaultAccount(this.type()));
    if (this.type() === 'transfer' && this.hacia()) {
      this.toAccountId.set(this.hacia()!);
      if (this.toAccount()?.type === 'credit_card') this.description.set(`Pago ${this.toAccount()!.name}`);
    }
    const monto = Number(this.monto());
    if (monto > 0) this.amountText.set(amountToInput(monto));
  }

  protected setType(t: FormType) {
    this.type.set(t);
    this.categoryId.set(null);
    this.installments.set(1);
    if (!this.id()) this.accountId.set(this.defaultAccount(t));
  }

  private defaultAccount(type: string): string | null {
    const ids = new Set(this.accounts().map((a) => a.id));
    const preferred = [this.cuenta(), prefs.lastAccount(type)].find((id) => id && ids.has(id));
    if (preferred) return preferred;
    // Primera vez: la cuenta en pesos con más saldo (la de uso diario, normalmente).
    const ars = this.accounts()
      .filter((a) => a.currency === 'ARS' && !['debt', 'receivable', 'credit_card'].includes(a.type))
      .sort((a, b) => b.balance - a.balance);
    return ars[0]?.id ?? this.accounts()[0]?.id ?? null;
  }

  protected async save() {
    const amount = parseAmount(this.amountText());
    const accountId = this.accountId();
    const type = this.type();
    // Pagar un gasto fijo en $0 (suscripción bonificada) es válido; un gasto común no.
    const amountProblem = amountError(amount, !!this.recurringId() && type === 'expense');
    if (amountProblem || amount === null) return this.error.set(amountProblem ?? 'Ingresá un monto.');
    if (!accountId) return this.error.set('Elegí una cuenta.');
    if (!this.date()) return this.error.set('Elegí una fecha.');

    const input: TransactionInput = {
      type,
      amount,
      account_id: accountId,
      category_id: null,
      description: this.description().trim() || null,
      date: this.date(),
    };

    if (type === 'transfer') {
      const to = this.toAccountId();
      if (!to || to === accountId) return this.error.set('Elegí la cuenta de destino.');
      input.to_account_id = to;
      if (this.crossCurrency()) {
        const toAmount = parseAmount(this.toAmountText());
        if (!toAmount || toAmount <= 0) return this.error.set('Ingresá el monto que entra en la otra moneda.');
        input.to_amount = toAmount;
      } else if (this.id()) {
        input.to_amount = null;
      }
    } else {
      if (!this.categoryId()) return this.error.set('Elegí una categoría.');
      input.category_id = this.categoryId();
      if (this.id()) {
        input.to_account_id = null;
        input.to_amount = null;
      }
    }
    if (this.recurringId()) {
      input.recurring_id = this.recurringId();
      input.period = this.period();
    }

    this.error.set(null);
    this.saving.set(true);
    try {
      if (!this.id() && this.installments() > 1) await this.data.createInstallments(input, this.installments());
      else await this.data.saveTransaction(this.id(), input);
      if (!this.id()) prefs.rememberUse(type, accountId, input.category_id);
      this.rates.invalidate();
      this.snack.open(this.id() ? 'Movimiento actualizado' : 'Movimiento guardado', undefined, { duration: 2000 });
      this.goBack(this.recurringId() ? '/fijos' : '/movimientos');
    } catch (e) {
      const msg = (e as Error).message;
      this.error.set(
        msg.includes('installment')
          ? 'Para cargar cuotas falta aplicar la migración 2 en Supabase (ver SETUP.md).'
          : msg.includes('amount_sign')
            ? 'Para marcar fijos en $0 falta aplicar la migración 3 en Supabase (ver SETUP.md).'
            : 'No se pudo guardar: ' + msg,
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(all: boolean) {
    const id = this.id();
    if (!id) return;
    const want = all ? 'all' : 'one';
    if (this.confirmDelete() !== want) {
      this.confirmDelete.set(want);
      setTimeout(() => this.confirmDelete.set(null), 4000);
      return;
    }
    this.saving.set(true);
    try {
      if (all && this.installmentGroup()) await this.data.deleteInstallmentGroup(this.installmentGroup()!);
      else await this.data.deleteTransaction(id);
      this.snack.open(all ? 'Cuotas eliminadas' : 'Movimiento eliminado', undefined, { duration: 2000 });
      this.goBack('/movimientos');
    } catch (e) {
      this.error.set('No se pudo eliminar: ' + (e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
