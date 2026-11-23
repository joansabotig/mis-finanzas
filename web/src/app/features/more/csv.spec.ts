import { TransactionRow } from '../../core/models';
import { toCsv } from './more';

describe('toCsv', () => {
  it('usa ; como separador, coma decimal y escapa comillas', () => {
    const row = {
      date: '2026-11-23',
      type: 'expense',
      amount: 1500.5,
      to_amount: null,
      account: { name: 'MercadoPago', currency: 'ARS', type: 'wallet' },
      to_account: null,
      category: { name: 'Supermercado', icon: null },
      description: 'Compra "grande"; semana',
      installment_number: 2,
      installment_total: 6,
    } as unknown as TransactionRow;
    const [header, line] = toCsv([row]).split('\r\n');
    expect(header.startsWith('Fecha;Tipo;Monto')).toBe(true);
    expect(line).toBe('2026-11-23;Gasto;1500,5;ARS;MercadoPago;;;Supermercado;"Compra ""grande""; semana";2/6');
  });
});
