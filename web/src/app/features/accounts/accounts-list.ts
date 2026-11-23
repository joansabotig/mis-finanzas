import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data.service';
import { ACCOUNT_TYPES, AccountBalance, Currency } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';

@Component({
  selector: 'app-accounts-list',
  imports: [RouterLink, MoneyPipe, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      @if (error()) { <p class="error">{{ error() }}</p> }

      @for (cur of currencies; track cur) {
        @if (byCurrency(cur).length) {
          <div class="section-title">{{ cur }} · {{ subtotal(cur) | money: cur }}</div>
          <div class="rows">
            @for (a of byCurrency(cur); track a.id) {
              <div class="row">
                <a class="grow link" [routerLink]="['/movimientos']" [queryParams]="{ cuenta: a.id }">
                  <span class="main">{{ a.name }}</span>
                  <span class="sub">{{ typeLabel(a) }}@if (!a.include_in_total) { · fuera del total }</span>
                </a>
                <span class="amount" [class.neg]="a.balance < 0">{{ a.balance | money: a.currency }}</span>
                <a mat-icon-button [routerLink]="['/cuentas', a.id]" aria-label="Editar cuenta"><mat-icon>edit</mat-icon></a>
              </div>
            }
          </div>
        }
      }

      @if (inactive().length) {
        <div class="section-title">Desactivadas</div>
        <div class="rows">
          @for (a of inactive(); track a.id) {
            <a class="row" [routerLink]="['/cuentas', a.id]">
              <span class="grow inactive"><span class="main">{{ a.name }}</span></span>
              <span class="amount inactive">{{ a.balance | money: a.currency }}</span>
            </a>
          }
        </div>
      }

      <button mat-stroked-button class="new" routerLink="/cuentas/nueva"><mat-icon>add</mat-icon> Nueva cuenta</button>
    </div>
  `,
  styles: `
    .link { color: inherit; text-decoration: none; }
    .new { width: 100%; margin-top: 24px; }
  `,
})
export class AccountsList implements OnInit {
  private readonly data = inject(DataService);
  protected readonly currencies: Currency[] = ['ARS', 'USD'];
  private readonly all = signal<AccountBalance[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly inactive = computed(() => this.all().filter((a) => !a.is_active));

  async ngOnInit() {
    try {
      this.all.set(await this.data.accountBalances(true));
    } catch (e) {
      this.error.set('Error cargando cuentas: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected byCurrency(cur: Currency) {
    return this.all().filter((a) => a.is_active && a.currency === cur);
  }

  protected subtotal(cur: Currency) {
    return this.byCurrency(cur)
      .filter((a) => a.include_in_total)
      .reduce((s, a) => s + a.balance, 0);
  }

  protected typeLabel(a: AccountBalance) {
    return ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type;
  }
}
