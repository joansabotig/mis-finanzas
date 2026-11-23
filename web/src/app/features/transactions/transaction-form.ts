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
import { AccountBalance, Category, CategoryKind } from '../../core/models';
import { injectGoBack } from '../../core/nav';
import { prefs } from '../../core/prefs';
import { todayIso } from '../../core/util/dates';
import { amountToInput, parseAmount } from '../../core/util/money';
import { MoneyPipe } from '../../shared/money.pipe';

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
        <p class="error">Este tipo de movimiento (transferencia o ajuste) todavía no se puede editar desde acá.</p>
      }

      <mat-button-toggle-group class="type" [value]="type()" (change)="setType($event.value)" [disabled]="unsupported()">
        <mat-button-toggle value="expense"><mat-icon>remove</mat-icon> Gasto</mat-button-toggle>
        <mat-button-toggle value="income"><mat-icon>add</mat-icon> Ingreso</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline" class="amount">
        <mat-label>Monto</mat-label>
        <span matTextPrefix>{{ account()?.currency === 'USD' ? 'US$' : '$' }}&nbsp;</span>
        <input matInput name="amount" inputmode="decimal" autocomplete="off" placeholder="0" [(ngModel)]="amountText" required />
        @if (amountPreview(); as p) { <mat-hint>{{ p | money: account()?.currency }}</mat-hint> }
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Cuenta</mat-label>
        <mat-select name="account" [(ngModel)]="accountId" required>
          @for (a of accounts(); track a.id) {
            <mat-option [value]="a.id">{{ a.name }} · {{ a.balance | money: a.currency }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="field-label">Categoría</div>
      <mat-chip-listbox aria-label="Categoría" [value]="categoryId()" (change)="categoryId.set($event.value ?? null)">
        @for (c of visibleCategories(); track c.id) {
          <mat-chip-option [value]="c.id">
            @if (c.icon) { <mat-icon matChipAvatar>{{ c.icon }}</mat-icon> }
            {{ c.name }}
          </mat-chip-option>
        }
      </mat-chip-listbox>

      <mat-form-field appearance="outline" class="desc">
        <mat-label>Descripción (opcional)</mat-label>
        <input matInput name="description" autocomplete="off" [(ngModel)]="description" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Fecha</mat-label>
        <input matInput type="date" name="date" [(ngModel)]="date" required />
      </mat-form-field>

      @if (error()) { <p class="error">{{ error() }}</p> }

      <div class="actions">
        @if (id()) {
          <button mat-stroked-button type="button" class="delete" (click)="remove()" [disabled]="saving()">
            {{ confirmDelete() ? '¿Seguro? Tocá de nuevo' : 'Eliminar' }}
          </button>
        }
        <button mat-flat-button type="submit" [disabled]="saving() || loading() || unsupported()">Guardar</button>
      </div>
    </form>
  `,
  styles: `
    .type { width: 100%; margin-bottom: 16px; }
    .type mat-button-toggle { flex: 1; }
    .amount input { font-size: 28px; }
    mat-chip-listbox { margin-bottom: 16px; }
    .desc { margin-top: 4px; }
    .delete { color: var(--mat-sys-error); }
  `,
})
export class TransactionForm implements OnInit {
  /** Parámetro de ruta /movimientos/:id */
  readonly id = input<string>();
  /** Query param ?cuenta=… para precargar la cuenta */
  readonly cuenta = input<string>();

  private readonly data = inject(DataService);
  private readonly snack = inject(MatSnackBar);
  private readonly goBack = injectGoBack();

  protected readonly type = signal<CategoryKind>('expense');
  protected readonly amountText = signal('');
  protected readonly accountId = signal<string | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly description = signal('');
  protected readonly date = signal(todayIso());

  protected readonly accounts = signal<AccountBalance[]>([]);
  private readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly unsupported = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly account = computed(() => this.accounts().find((a) => a.id === this.accountId()));
  protected readonly amountPreview = computed(() => parseAmount(this.amountText()));

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

      const id = this.id();
      if (id) {
        const t = await this.data.transaction(id);
        if (t.type !== 'expense' && t.type !== 'income') this.unsupported.set(true);
        else this.type.set(t.type);
        this.amountText.set(amountToInput(t.amount));
        this.accountId.set(t.account_id);
        this.categoryId.set(t.category_id);
        this.description.set(t.description ?? '');
        this.date.set(t.date);
        // Si la cuenta está desactivada, igual tiene que aparecer en el selector.
        if (!accounts.some((a) => a.id === t.account_id)) {
          const all = await this.data.accountBalances(true);
          this.accounts.set(all.filter((a) => a.is_active || a.id === t.account_id));
        }
      } else {
        this.accountId.set(this.defaultAccount('expense'));
      }
    } catch (e) {
      this.error.set('Error cargando datos: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected setType(t: CategoryKind) {
    this.type.set(t);
    this.categoryId.set(null);
    if (!this.id()) this.accountId.set(this.defaultAccount(t));
  }

  private defaultAccount(type: string): string | null {
    const ids = new Set(this.accounts().map((a) => a.id));
    const preferred = [this.cuenta(), prefs.lastAccount(type)].find((id) => id && ids.has(id));
    if (preferred) return preferred;
    // Primera vez: la cuenta en pesos con más saldo (la de uso diario, normalmente).
    const ars = this.accounts()
      .filter((a) => a.currency === 'ARS' && a.type !== 'debt' && a.type !== 'receivable')
      .sort((a, b) => b.balance - a.balance);
    return ars[0]?.id ?? this.accounts()[0]?.id ?? null;
  }

  protected async save() {
    const amount = parseAmount(this.amountText());
    const accountId = this.accountId();
    if (!amount || amount <= 0) return this.error.set('Ingresá un monto mayor a 0.');
    if (!accountId) return this.error.set('Elegí una cuenta.');
    if (!this.categoryId()) return this.error.set('Elegí una categoría.');
    if (!this.date()) return this.error.set('Elegí una fecha.');

    this.error.set(null);
    this.saving.set(true);
    try {
      await this.data.saveTransaction(this.id(), {
        type: this.type(),
        amount,
        account_id: accountId,
        category_id: this.categoryId(),
        description: this.description().trim() || null,
        date: this.date(),
      });
      if (!this.id()) prefs.rememberUse(this.type(), accountId, this.categoryId());
      this.snack.open(this.id() ? 'Movimiento actualizado' : 'Movimiento guardado', undefined, { duration: 2000 });
      this.goBack('/movimientos');
    } catch (e) {
      this.error.set('No se pudo guardar: ' + (e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove() {
    const id = this.id();
    if (!id) return;
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      setTimeout(() => this.confirmDelete.set(false), 4000);
      return;
    }
    this.saving.set(true);
    try {
      await this.data.deleteTransaction(id);
      this.snack.open('Movimiento eliminado', undefined, { duration: 2000 });
      this.goBack('/movimientos');
    } catch (e) {
      this.error.set('No se pudo eliminar: ' + (e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
