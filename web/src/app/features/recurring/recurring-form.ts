import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data.service';
import { AccountBalance, Category, CategoryKind, Currency } from '../../core/models';
import { injectGoBack } from '../../core/nav';
import { amountToInput, parseAmount } from '../../core/util/money';

@Component({
  selector: 'app-recurring-form',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <form class="page form" (ngSubmit)="save()">
      <mat-button-toggle-group name="kind" class="kind" [(ngModel)]="kind">
        <mat-button-toggle value="expense">Gasto fijo</mat-button-toggle>
        <mat-button-toggle value="income">Ingreso fijo</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline">
        <mat-label>Nombre</mat-label>
        <input matInput name="name" autocomplete="off" placeholder="Ej: Luz, Internet, Netflix, Sueldo" [(ngModel)]="name" required />
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Monto estimado</mat-label>
        <input matInput name="amount" inputmode="decimal" autocomplete="off" [(ngModel)]="amountText" />
        <mat-hint>Se propone al marcarlo como pagado; podés cambiarlo cada mes.</mat-hint>
      </mat-form-field>

      <div class="field-label">Moneda</div>
      <mat-button-toggle-group name="currency" class="kind" [(ngModel)]="currency">
        <mat-button-toggle value="ARS">Pesos</mat-button-toggle>
        <mat-button-toggle value="USD">Dólares</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline">
        <mat-label>Categoría</mat-label>
        <mat-select name="category" [(ngModel)]="categoryId">
          <mat-option [value]="null">Sin categoría</mat-option>
          @for (c of kindCategories(); track c.id) { <mat-option [value]="c.id">{{ c.name }}</mat-option> }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ kind() === 'income' ? 'Cuenta donde se cobra' : 'Se paga con' }}</mat-label>
        <mat-select name="account" [(ngModel)]="accountId">
          <mat-option [value]="null">Elegir al pagar</mat-option>
          @for (a of accounts(); track a.id) { <mat-option [value]="a.id">{{ a.name }}</mat-option> }
        </mat-select>
        <mat-hint>Si lo debitan de la tarjeta, elegí la tarjeta.</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Día de vencimiento (opcional)</mat-label>
        <input matInput name="due" type="number" min="1" max="31" inputmode="numeric" [(ngModel)]="dueDay" />
      </mat-form-field>

      <mat-slide-toggle name="active" [(ngModel)]="isActive">Activo (aparece en el checklist)</mat-slide-toggle>

      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="saving() || loading()">Guardar</button>
      </div>
    </form>
  `,
  styles: `
    .kind { width: 100%; margin-bottom: 16px; }
    .kind mat-button-toggle { flex: 1; }
    mat-form-field { margin-bottom: 4px; }
    mat-slide-toggle { margin: 8px 0; }
  `,
})
export class RecurringForm implements OnInit {
  readonly id = input<string>();
  private readonly data = inject(DataService);
  private readonly snack = inject(MatSnackBar);
  private readonly goBack = injectGoBack();

  protected readonly kind = signal<CategoryKind>('expense');
  protected readonly name = signal('');
  protected readonly amountText = signal('');
  protected readonly currency = signal<Currency>('ARS');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly accountId = signal<string | null>(null);
  protected readonly dueDay = signal<number | null>(null);
  protected readonly isActive = signal(true);
  private sortOrder = 0;

  protected readonly accounts = signal<AccountBalance[]>([]);
  private readonly categories = signal<Category[]>([]);
  protected readonly kindCategories = computed(() => this.categories().filter((c) => c.kind === this.kind()));
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit() {
    try {
      const [accounts, categories] = await Promise.all([this.data.accountBalances(), this.data.categories()]);
      this.accounts.set(accounts);
      this.categories.set(categories);
      const id = this.id();
      if (id) {
        const r = await this.data.recurringItem(id);
        this.kind.set(r.kind);
        this.name.set(r.name);
        this.amountText.set(amountToInput(r.estimated_amount));
        this.currency.set(r.currency);
        this.categoryId.set(r.category_id);
        this.accountId.set(r.default_account_id);
        this.dueDay.set(r.due_day);
        this.isActive.set(r.is_active);
        this.sortOrder = r.sort_order;
      }
    } catch (e) {
      this.error.set('Error cargando datos: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save() {
    const name = this.name().trim();
    const amount = this.amountText().trim() ? parseAmount(this.amountText()) : null;
    const due = this.dueDay() ? Number(this.dueDay()) : null;
    if (!name) return this.error.set('Poné un nombre.');
    if (this.amountText().trim() && amount === null) return this.error.set('El monto no es un número válido.');
    if (due !== null && (due < 1 || due > 31)) return this.error.set('El día de vencimiento va de 1 a 31.');
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.data.saveRecurringItem(this.id(), {
        name,
        kind: this.kind(),
        estimated_amount: amount,
        currency: this.currency(),
        category_id: this.categoryId(),
        default_account_id: this.accountId(),
        due_day: due,
        is_active: this.isActive(),
        sort_order: this.sortOrder,
      });
      this.snack.open('Guardado', undefined, { duration: 2000 });
      this.goBack('/fijos');
    } catch (e) {
      this.error.set('No se pudo guardar: ' + (e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
