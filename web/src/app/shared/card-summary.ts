import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CardInfo } from '../core/cards.service';
import { dayLabel } from '../core/util/dates';
import { MoneyPipe } from './money.pipe';

/** Tarjeta de crédito: a pagar, vencimiento, consumos del período y deuda total. */
@Component({
  selector: 'app-card-summary',
  imports: [RouterLink, MoneyPipe, MatButtonModule, MatIconModule],
  template: `
    @let i = info();
    <div class="card">
      <a class="head" [routerLink]="['/movimientos']" [queryParams]="{ cuenta: i.card.id }">
        <mat-icon>credit_card</mat-icon>
        <span class="name">{{ i.card.name }}</span>
        <mat-icon class="muted">chevron_right</mat-icon>
      </a>
      @if (i.summary; as s) {
        <div class="grid">
          <div>
            <span class="muted">A pagar · vence {{ date(s.cycle.dueDate) }}</span>
            <b [class.neg]="s.pending > 0">{{ s.pending | money: i.card.currency }}</b>
            @if (s.pending === 0 && s.statement > 0) { <span class="pos small">Pagado ✓</span> }
          </div>
          <div>
            <span class="muted">Próximo resumen · cierra {{ date(s.cycle.nextClosing) }}</span>
            <b>{{ s.current | money: i.card.currency }}</b>
          </div>
        </div>
      } @else {
        <p class="muted small">Configurá el día de cierre y vencimiento para ver cuánto pagar.</p>
      }
      <div class="foot">
        <span class="muted small">Deuda total (con cuotas futuras): {{ i.debt | money: i.card.currency }}</span>
        <a mat-button [routerLink]="['/movimientos/nuevo']" [queryParams]="{ tipo: 'transfer', hacia: i.card.id, monto: i.summary?.pending || null }">Pagar</a>
      </div>
    </div>
  `,
  styles: `
    .card { border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px; padding: 12px 16px; margin-bottom: 8px; }
    .head { display: flex; align-items: center; gap: 8px; color: inherit; text-decoration: none; }
    .name { flex: 1; font: var(--mat-sys-title-small); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .grid div { display: flex; flex-direction: column; }
    .small { font: var(--mat-sys-body-small); }
    .foot { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
  `,
})
export class CardSummaryView {
  readonly info = input.required<CardInfo>();

  protected date(iso: string) {
    return dayLabel(iso);
  }
}
