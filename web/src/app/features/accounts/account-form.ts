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
import { ACCOUNT_TYPES, AccountType, Currency } from '../../core/models';
import { injectGoBack } from '../../core/nav';
import { amountToInput, formatMoney, parseAmount } from '../../core/util/money';

@Component({
  selector: 'app-account-form',
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
      <mat-form-field appearance="outline">
        <mat-label>Nombre</mat-label>
        <input matInput name="name" autocomplete="off" [(ngModel)]="name" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Tipo</mat-label>
        <mat-select name="type" [(ngModel)]="type">
          @for (t of types; track t.value) { <mat-option [value]="t.value">{{ t.label }}</mat-option> }
        </mat-select>
      </mat-form-field>

      <div class="field-label">Moneda</div>
      <mat-button-toggle-group name="currency" [(ngModel)]="currency" [disabled]="!!id()" class="currency">
        <mat-button-toggle value="ARS">Pesos (ARS)</mat-button-toggle>
        <mat-button-toggle value="USD">Dólares (USD)</mat-button-toggle>
      </mat-button-toggle-group>
      @if (id()) { <p class="muted hint">La moneda no se puede cambiar en una cuenta existente.</p> }

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Saldo inicial</mat-label>
        <input matInput name="initial" inputmode="decimal" autocomplete="off" [(ngModel)]="initialText" />
        <mat-hint>El saldo actual = saldo inicial + movimientos. Para deudas, usá un número negativo.</mat-hint>
      </mat-form-field>

      @if (type() === 'credit_card') {
        <div class="card-days">
          <mat-form-field appearance="outline">
            <mat-label>Día de cierre</mat-label>
            <input matInput name="closing" type="number" min="1" max="31" inputmode="numeric" [(ngModel)]="closingDay" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Día de vencimiento</mat-label>
            <input matInput name="due" type="number" min="1" max="31" inputmode="numeric" [(ngModel)]="dueDay" />
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Límite de compra (opcional)</mat-label>
          <input matInput name="limit" inputmode="decimal" autocomplete="off" [(ngModel)]="limitText" />
          <mat-hint>Las compras con la tarjeta suman deuda (saldo negativo). Pagarla = transferencia desde una cuenta.</mat-hint>
        </mat-form-field>
      } @else {
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Rendimiento mensual estimado (%)</mat-label>
          <input matInput name="rate" inputmode="decimal" autocomplete="off" placeholder="Ej: 1,42" [(ngModel)]="rateText" />
          <mat-hint>Opcional. Para billeteras que rinden, plazos fijos, brokers.</mat-hint>
        </mat-form-field>
      }

      <mat-slide-toggle name="total" [(ngModel)]="includeInTotal">Sumar al patrimonio total</mat-slide-toggle>
      <mat-slide-toggle name="active" [(ngModel)]="isActive">Cuenta activa</mat-slide-toggle>

      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="saving() || loading()">Guardar</button>
      </div>
    </form>

    @if (id() && currentBalance() !== null) {
      <div class="page form adjust">
        <div class="section-title">Ajustar saldo</div>
        <p class="muted hint">
          Saldo en la app: <b>{{ currentBalanceText() }}</b>. Si no coincide con tu banco/billetera, escribí el saldo real y se registra la diferencia como "Ajuste".
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Saldo real hoy{{ type() === 'credit_card' ? ' (deuda en negativo)' : '' }}</mat-label>
          <input matInput name="real" inputmode="decimal" autocomplete="off" [(ngModel)]="realText" />
        </mat-form-field>
        <button mat-stroked-button type="button" (click)="adjust()" [disabled]="saving()">Registrar ajuste</button>
      </div>
    }
  `,
  styles: `
    .currency { width: 100%; margin-bottom: 4px; }
    .currency mat-button-toggle { flex: 1; }
    .hint { margin: 0 0 12px; font: var(--mat-sys-body-small); }
    mat-form-field { margin-top: 12px; }
    mat-slide-toggle { margin: 12px 0 4px; }
    .card-days { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .adjust { padding-top: 0; }
  `,
})
export class AccountForm implements OnInit {
  readonly id = input<string>();
  private readonly data = inject(DataService);
  private readonly snack = inject(MatSnackBar);
  private readonly goBack = injectGoBack();
  protected readonly types = ACCOUNT_TYPES;

  protected readonly name = signal('');
  protected readonly type = signal<AccountType>('bank');
  protected readonly currency = signal<Currency>('ARS');
  protected readonly initialText = signal('0');
  protected readonly rateText = signal('');
  protected readonly includeInTotal = signal(true);
  protected readonly isActive = signal(true);
  protected readonly closingDay = signal<number | null>(null);
  protected readonly dueDay = signal<number | null>(null);
  protected readonly limitText = signal('');
  protected readonly realText = signal('');
  protected readonly currentBalance = signal<number | null>(null);
  protected readonly currentBalanceText = computed(() => formatMoney(this.currentBalance(), this.currency()));
  private sortOrder = 0;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit() {
    const id = this.id();
    if (!id) return;
    this.loading.set(true);
    try {
      const [a, balances] = await Promise.all([this.data.account(id), this.data.accountBalances(true)]);
      this.currentBalance.set(balances.find((b) => b.id === id)?.balance ?? null);
      this.closingDay.set(a.closing_day ?? null);
      this.dueDay.set(a.due_day ?? null);
      this.limitText.set(amountToInput(a.credit_limit));
      this.name.set(a.name);
      this.type.set(a.type);
      this.currency.set(a.currency);
      this.initialText.set(amountToInput(a.initial_balance));
      this.rateText.set(a.monthly_rate == null ? '' : amountToInput(Math.round(a.monthly_rate * 1e5) / 1e3));
      this.includeInTotal.set(a.include_in_total);
      this.isActive.set(a.is_active);
      this.sortOrder = a.sort_order;
    } catch (e) {
      this.error.set('Error cargando la cuenta: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save() {
    const name = this.name().trim();
    const initial = parseAmount(this.initialText() || '0');
    const ratePct = this.rateText().trim() ? parseAmount(this.rateText()) : null;
    if (!name) return this.error.set('Poné un nombre.');
    if (initial === null) return this.error.set('El saldo inicial no es un número válido.');
    if (this.rateText().trim() && ratePct === null) return this.error.set('El rendimiento no es un número válido.');

    const isCard = this.type() === 'credit_card';
    const day = (v: number | null) => (v ? Number(v) : null);
    const closing = isCard ? day(this.closingDay()) : null;
    const due = isCard ? day(this.dueDay()) : null;
    const limit = isCard && this.limitText().trim() ? parseAmount(this.limitText()) : null;
    if ([closing, due].some((d) => d !== null && (d < 1 || d > 31))) return this.error.set('Los días van de 1 a 31.');
    if (isCard && this.limitText().trim() && limit === null) return this.error.set('El límite no es un número válido.');

    this.error.set(null);
    this.saving.set(true);
    try {
      await this.data.saveAccount(this.id(), {
        name,
        type: this.type(),
        currency: this.currency(),
        initial_balance: initial,
        monthly_rate: isCard || ratePct === null ? null : ratePct / 100,
        include_in_total: this.includeInTotal(),
        is_active: this.isActive(),
        sort_order: this.sortOrder,
        closing_day: closing,
        due_day: due,
        credit_limit: limit,
      });
      this.snack.open('Cuenta guardada', undefined, { duration: 2000 });
      this.goBack('/cuentas');
    } catch (e) {
      const msg = (e as Error).message;
      this.error.set(
        /closing_day|credit_card|accounts_type_check/.test(msg)
          ? 'Para usar tarjetas de crédito falta aplicar la migración 2 en Supabase (ver SETUP.md).'
          : 'No se pudo guardar: ' + msg,
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async adjust() {
    const real = parseAmount(this.realText());
    const current = this.currentBalance();
    const id = this.id();
    if (real === null) return this.error.set('Escribí el saldo real.');
    if (current === null || !id) return;
    const diff = Math.round((real - current) * 100) / 100;
    if (!diff) {
      this.snack.open('El saldo ya coincide', undefined, { duration: 2000 });
      return;
    }
    this.saving.set(true);
    try {
      await this.data.adjustBalance(id, diff);
      this.currentBalance.set(real);
      this.realText.set('');
      this.snack.open(`Ajuste registrado: ${formatMoney(diff, this.currency())}`, undefined, { duration: 3000 });
    } catch (e) {
      this.error.set('No se pudo ajustar: ' + (e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
