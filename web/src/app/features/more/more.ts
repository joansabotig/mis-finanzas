import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { DataService } from '../../core/data.service';
import { RATE_SOURCES, RateSource, TransactionRow } from '../../core/models';
import { CurrentRate, RateService } from '../../core/rate.service';
import { todayIso } from '../../core/util/dates';
import { formatMoney, parseAmount } from '../../core/util/money';

@Component({
  selector: 'app-more',
  imports: [FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  template: `
    <div class="page">
      <div class="rows">
        @for (l of links; track l.path) {
          <a class="row" [routerLink]="l.path">
            <mat-icon>{{ l.icon }}</mat-icon>
            <span class="grow"><span class="main">{{ l.label }}</span><span class="sub">{{ l.sub }}</span></span>
            <mat-icon class="muted">chevron_right</mat-icon>
          </a>
        }
      </div>

      <div class="section-title">Cotización del dólar</div>
      <div class="box">
        <p class="muted small">
          Se usa para sumar tus cuentas en USD al patrimonio total.
          @if (rate(); as r) { Hoy: <b>{{ money(r.rate) }}</b>@if (r.date) { ({{ r.date.slice(8) }}/{{ r.date.slice(5, 7) }}) }. }
        </p>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fuente</mat-label>
          <mat-select [value]="source()" (selectionChange)="setSource($event.value)">
            @for (s of sources; track s.value) { <mat-option [value]="s.value">{{ s.label }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (source() === 'manual') {
          <div class="inline">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Valor del dólar</mat-label>
              <input matInput inputmode="decimal" autocomplete="off" [(ngModel)]="manualText" />
            </mat-form-field>
            <button mat-stroked-button (click)="saveManual()">Guardar</button>
          </div>
        } @else {
          <p class="muted small">Se actualiza solo una vez por día desde dolarapi.com (precio de venta).</p>
        }
      </div>

      <div class="section-title">Tus datos</div>
      <div class="box">
        <p class="muted small">Descargá todos tus movimientos en un archivo CSV (se abre con Excel o Google Sheets).</p>
        <button mat-stroked-button (click)="exportCsv()" [disabled]="exporting()">
          <mat-icon>download</mat-icon> {{ exporting() ? 'Preparando…' : 'Exportar movimientos (CSV)' }}
        </button>
      </div>

      <div class="section-title">Cuenta</div>
      <div class="box">
        <p class="muted small">{{ email() }}</p>
        <a mat-button routerLink="/privacidad"><mat-icon>privacy_tip</mat-icon> Política de privacidad</a>
        <button mat-stroked-button class="logout" (click)="logout()"><mat-icon>logout</mat-icon> Cerrar sesión</button>
      </div>
    </div>
  `,
  styles: `
    .box { padding: 4px 0 8px; display: flex; flex-direction: column; gap: 8px; }
    .small { font: var(--mat-sys-body-small); margin: 0; }
    .inline { display: flex; gap: 8px; align-items: center; }
    .inline mat-form-field { flex: 1; }
    .logout { color: var(--mat-sys-error); }
  `,
})
export class More implements OnInit {
  private readonly data = inject(DataService);
  private readonly rates = inject(RateService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly sources = RATE_SOURCES;

  protected readonly links = [
    { path: '/cuentas', icon: 'account_balance_wallet', label: 'Cuentas y tarjetas', sub: 'Saldos, tarjetas de crédito, ajustes' },
    { path: '/categorias', icon: 'category', label: 'Categorías', sub: 'Cómo clasificás tus gastos e ingresos' },
    { path: '/fijos', icon: 'event_repeat', label: 'Gastos e ingresos fijos', sub: 'Servicios, suscripciones, sueldo' },
  ];

  protected readonly source = signal<RateSource>('manual');
  protected readonly rate = signal<CurrentRate | null>(null);
  protected readonly manualText = signal('');
  protected readonly exporting = signal(false);
  protected readonly email = () => this.auth.session()?.user.email ?? '';

  async ngOnInit() {
    this.source.set(await this.data.rateSource());
    const r = await this.rates.current();
    this.rate.set(r);
    if (r.source === 'manual') this.manualText.set(String(r.rate).replace('.', ','));
  }

  protected money(n: number) {
    return formatMoney(n, 'ARS');
  }

  protected async setSource(source: RateSource) {
    try {
      await this.data.setRateSource(source);
      this.source.set(source);
      this.rate.set(await this.rates.current(true));
      this.snack.open('Cotización actualizada', undefined, { duration: 2000 });
    } catch (e) {
      const msg = (e as Error).message;
      this.snack.open(msg.includes('user_settings') ? 'Falta aplicar la migración 2 en Supabase' : 'Error: ' + msg, 'OK');
    }
  }

  protected async saveManual() {
    const value = parseAmount(this.manualText());
    if (!value || value <= 0) {
      this.snack.open('Ingresá un valor válido', undefined, { duration: 2000 });
      return;
    }
    await this.data.saveRate('manual', value);
    this.rate.set(await this.rates.current(true));
    this.snack.open('Cotización guardada', undefined, { duration: 2000 });
  }

  protected async exportCsv() {
    this.exporting.set(true);
    try {
      const rows = await this.data.allTransactions();
      const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `movimientos-${todayIso()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      this.snack.open('No se pudo exportar: ' + (e as Error).message, 'OK');
    } finally {
      this.exporting.set(false);
    }
  }

  protected async logout() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}

const TYPE_LABEL = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', adjustment: 'Ajuste' } as const;

/** CSV con ; y coma decimal, como lo espera Excel en español. */
export function toCsv(rows: TransactionRow[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const amount = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
  const header = ['Fecha', 'Tipo', 'Monto', 'Moneda', 'Cuenta', 'Cuenta destino', 'Monto destino', 'Categoría', 'Descripción', 'Cuota'];
  const lines = rows.map((t) =>
    [
      t.date,
      TYPE_LABEL[t.type],
      amount(t.amount),
      t.account?.currency ?? '',
      t.account?.name ?? '',
      t.to_account?.name ?? '',
      amount(t.to_amount),
      t.category?.name ?? '',
      t.description ?? '',
      t.installment_total ? `${t.installment_number}/${t.installment_total}` : '',
    ]
      .map(esc)
      .join(';'),
  );
  return [header.join(';'), ...lines].join('\r\n');
}
