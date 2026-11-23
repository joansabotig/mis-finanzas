import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SupabaseService } from '../../core/supabase.service';
import { AccountBalance, Currency } from '../../core/models';

@Component({
  selector: 'app-home',
  imports: [CurrencyPipe, MatCardModule, MatListModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (error()) { <p class="error">{{ error() }}</p> }

    <mat-card appearance="outlined" class="total">
      <mat-card-content>
        <div class="label">Patrimonio total</div>
        <div class="big">{{ totalArs() | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}</div>
        <div class="sub">
          {{ totalArs() / rate() | currency: 'USD' : 'US$' : '1.0-0' }} · dólar a {{ rate() | currency: 'ARS' : 'symbol-narrow' : '1.0-0' }}
        </div>
      </mat-card-content>
    </mat-card>

    @for (cur of currencies; track cur) {
      <h3>Cuentas en {{ cur }} · {{ subtotal(cur) | currency: cur : 'symbol-narrow' : '1.0-0' }}</h3>
      <mat-list>
        @for (a of byCurrency(cur); track a.id) {
          <mat-list-item>
            <span matListItemTitle>{{ a.name }}</span>
            <span matListItemMeta [class.neg]="a.balance < 0">{{ a.balance | currency: cur : 'symbol-narrow' : '1.0-0' }}</span>
          </mat-list-item>
        }
      </mat-list>
    }
  `,
  styles: `
    :host { display: block; padding: 16px; max-width: 640px; margin: 0 auto; }
    .total { margin-bottom: 8px; }
    .label { font: var(--mat-sys-label-large); color: var(--mat-sys-on-surface-variant); }
    .big { font: var(--mat-sys-display-small); margin: 4px 0; }
    .sub { color: var(--mat-sys-on-surface-variant); }
    h3 { margin: 24px 0 0; font: var(--mat-sys-title-medium); }
    .neg, .error { color: var(--mat-sys-error); }
  `,
})
export class Home implements OnInit {
  private readonly sb = inject(SupabaseService).client;
  protected readonly currencies: Currency[] = ['ARS', 'USD'];
  protected readonly accounts = signal<AccountBalance[]>([]);
  protected readonly rate = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly totalArs = computed(() =>
    this.accounts()
      .filter((a) => a.include_in_total)
      .reduce((sum, a) => sum + (a.currency === 'USD' ? a.balance * this.rate() : a.balance), 0),
  );

  async ngOnInit() {
    const [accounts, rate] = await Promise.all([
      this.sb.from('account_balances').select('*').eq('is_active', true).order('sort_order'),
      this.sb.from('exchange_rates').select('rate').order('date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    this.loading.set(false);
    if (accounts.error) {
      this.error.set('Error cargando cuentas: ' + accounts.error.message);
      return;
    }
    this.accounts.set((accounts.data ?? []).map((a) => ({ ...a, balance: Number(a.balance) })));
    if (rate.data) this.rate.set(Number(rate.data.rate));
  }

  protected byCurrency(cur: Currency) {
    return this.accounts().filter((a) => a.currency === cur);
  }

  protected subtotal(cur: Currency) {
    return this.byCurrency(cur).reduce((s, a) => s + a.balance, 0);
  }
}
