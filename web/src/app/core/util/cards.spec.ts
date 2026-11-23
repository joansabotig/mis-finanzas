import { cardCycle, cardSummary, splitInstallments, statementTotal } from './cards';

describe('cardCycle', () => {
  it('después del cierre: el resumen a pagar es el que cerró este mes', () => {
    expect(cardCycle(15, 25, '2026-11-20')).toEqual({
      previousClosing: '2026-10-15',
      lastClosing: '2026-11-15',
      dueDate: '2026-11-25',
      nextClosing: '2026-12-15',
    });
  });

  it('antes del cierre: el resumen a pagar es el del mes anterior', () => {
    expect(cardCycle(15, 25, '2026-11-10')).toMatchObject({
      lastClosing: '2026-10-15',
      dueDate: '2026-10-25',
      nextClosing: '2026-11-15',
    });
  });

  it('el día de cierre cuenta como cerrado', () => {
    expect(cardCycle(15, 25, '2026-11-15').lastClosing).toBe('2026-11-15');
  });

  it('si vence antes del día de cierre, vence el mes siguiente', () => {
    expect(cardCycle(28, 8, '2026-11-30')).toMatchObject({ lastClosing: '2026-11-28', dueDate: '2026-12-08' });
  });

  it('recorta días que no existen en el mes', () => {
    expect(cardCycle(31, 10, '2026-03-01')).toMatchObject({
      previousClosing: '2026-01-31',
      lastClosing: '2026-02-28',
      dueDate: '2026-03-10',
      nextClosing: '2026-03-31',
    });
  });

  it('cruza el año', () => {
    expect(cardCycle(20, 2, '2027-01-05')).toMatchObject({ lastClosing: '2026-12-20', dueDate: '2027-01-02' });
  });
});

describe('cardSummary', () => {
  const card = 'card';
  const tx = (date: string, type: 'expense' | 'income' | 'transfer', amount: number, opts: Partial<{ account_id: string; to_account_id: string }> = {}) => ({
    date,
    type,
    amount,
    account_id: opts.account_id ?? card,
    to_account_id: opts.to_account_id ?? null,
    to_amount: null,
  });

  const txs = [
    tx('2026-10-15', 'expense', 999), // resumen anterior
    tx('2026-10-16', 'expense', 1000),
    tx('2026-11-01', 'expense', 500),
    tx('2026-11-02', 'income', 100), // devolución
    tx('2026-11-15', 'expense', 200), // día de cierre: entra
    tx('2026-11-16', 'expense', 300), // próximo resumen
    tx('2026-11-03', 'expense', 7777, { account_id: 'otra' }),
    tx('2026-11-20', 'transfer', 600, { account_id: 'banco', to_account_id: card }),
  ];

  it('separa el resumen cerrado de los consumos actuales y descuenta pagos', () => {
    const s = cardSummary(card, 15, 25, txs, '2026-11-21');
    expect(s.statement).toBe(1600);
    expect(s.current).toBe(300);
    expect(s.pending).toBe(1000);
  });

  it('no queda saldo negativo si se pagó de más', () => {
    const paid = [...txs, tx('2026-11-21', 'transfer', 5000, { account_id: 'banco', to_account_id: card })];
    expect(cardSummary(card, 15, 25, paid, '2026-11-22').pending).toBe(0);
  });

  it('statementTotal ignora otras cuentas', () => {
    expect(statementTotal('otra', txs, '2026-10-15', '2026-11-15')).toBe(7777);
  });
});

describe('splitInstallments', () => {
  it('divide en cuotas mensuales y la última absorbe el redondeo', () => {
    const parts = splitInstallments(1000, 3, '2026-11-23');
    expect(parts.map((p) => p.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(parts.map((p) => p.date)).toEqual(['2026-11-23', '2026-12-23', '2027-01-23']);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(1000, 2);
  });

  it('recorta el día en meses cortos', () => {
    expect(splitInstallments(300, 3, '2026-01-31').map((p) => p.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('una cuota = compra normal', () => {
    expect(splitInstallments(99.99, 1, '2026-11-23')).toEqual([{ amount: 99.99, date: '2026-11-23' }]);
  });
});
