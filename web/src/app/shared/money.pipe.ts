import { Pipe, PipeTransform } from '@angular/core';
import { Currency } from '../core/models';
import { formatMoney } from '../core/util/money';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, currency: Currency | null | undefined = 'ARS'): string {
    return formatMoney(value, currency ?? 'ARS');
  }
}
