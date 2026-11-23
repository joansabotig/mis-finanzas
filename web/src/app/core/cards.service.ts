import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';
import { AccountBalance } from './models';
import { cardCycle, CardSummary, cardSummary } from './util/cards';
import { todayIso } from './util/dates';

export interface CardInfo {
  card: AccountBalance;
  /** null si la tarjeta no tiene día de cierre/vencimiento configurado. */
  summary: CardSummary | null;
  /** Deuda total (incluye cuotas futuras). */
  debt: number;
}

@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly data = inject(DataService);

  async infos(accounts: AccountBalance[]): Promise<CardInfo[]> {
    const today = todayIso();
    const cards = accounts.filter((a) => a.type === 'credit_card' && a.is_active);
    return Promise.all(
      cards.map(async (card) => {
        const debt = Math.max(0, -card.balance);
        if (!card.closing_day || !card.due_day) return { card, summary: null, debt };
        const cycle = cardCycle(card.closing_day, card.due_day, today);
        const txs = await this.data.transactions({ accountId: card.id, from: cycle.previousClosing });
        return { card, summary: cardSummary(card.id, card.closing_day, card.due_day, txs, today), debt };
      }),
    );
  }
}
