import { Component, inject, input, OnInit, signal } from '@angular/core';
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
import { amountToInput, parseAmount } from '../../core/util/money';

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

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Rendimiento mensual estimado (%)</mat-label>
        <input matInput name="rate" inputmode="decimal" autocomplete="off" placeholder="Ej: 1,42" [(ngModel)]="rateText" />
        <mat-hint>Opcional. Para billeteras que rinden, plazos fijos, brokers.</mat-hint>
      </mat-form-field>

      <mat-slide-toggle name="total" [(ngModel)]="includeInTotal">Sumar al patrimonio total</mat-slide-toggle>
      <mat-slide-toggle name="active" [(ngModel)]="isActive">Cuenta activa</mat-slide-toggle>

      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="saving() || loading()">Guardar</button>
      </div>
    </form>
  `,
  styles: `
    .currency { width: 100%; margin-bottom: 4px; }
    .currency mat-button-toggle { flex: 1; }
    .hint { margin: 0 0 12px; font: var(--mat-sys-body-small); }
    mat-form-field { margin-top: 12px; }
    mat-slide-toggle { margin: 12px 0 4px; }
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
  private sortOrder = 0;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit() {
    const id = this.id();
    if (!id) return;
    this.loading.set(true);
    try {
      const a = await this.data.account(id);
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

    this.error.set(null);
    this.saving.set(true);
    try {
      await this.data.saveAccount(this.id(), {
        name,
        type: this.type(),
        currency: this.currency(),
        initial_balance: initial,
        monthly_rate: ratePct === null ? null : ratePct / 100,
        include_in_total: this.includeInTotal(),
        is_active: this.isActive(),
        sort_order: this.sortOrder,
      });
      this.snack.open('Cuenta guardada', undefined, { duration: 2000 });
      this.goBack('/cuentas');
    } catch (e) {
      this.error.set('No se pudo guardar: ' + (e as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
