import { amountError, amountToInput, formatMoney, parseAmount } from './money';

describe('parseAmount', () => {
  it.each([
    ['1500', 1500],
    ['1.500', 1500],
    ['1.500.000', 1500000],
    ['1.500,50', 1500.5],
    ['1500,5', 1500.5],
    ['$ 2.000', 2000],
    ['US$ 10', 10],
    ['1.5', 1.5],
    ['-2.500.000', -2500000],
    ['  300 ', 300],
    ['0,333', 0.33],
  ])('"%s" → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '1,2,3', '12a', null, undefined])('"%s" → null', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('formatMoney', () => {
  const clean = (s: string) => s.replace(/\s/g, ' ');

  it('formatea pesos sin decimales si es entero', () => {
    expect(clean(formatMoney(1500, 'ARS'))).toBe('$ 1.500');
  });

  it('muestra decimales cuando hacen falta', () => {
    expect(clean(formatMoney(1500.5, 'ARS'))).toBe('$ 1.500,50');
  });

  it('distingue dólares con US$', () => {
    expect(clean(formatMoney(8150, 'USD'))).toBe('US$ 8.150');
  });

  it('formatea negativos', () => {
    expect(clean(formatMoney(-2500000, 'ARS'))).toBe('-$ 2.500.000');
  });
});

describe('amountError', () => {
  it('un gasto común exige monto mayor a 0', () => {
    expect(amountError(0)).toContain('mayor a 0');
    expect(amountError(null)).toContain('mayor a 0');
    expect(amountError(-5)).toContain('mayor a 0');
    expect(amountError(1500)).toBeNull();
  });

  it('el pago de un gasto fijo puede ser $0, pero no negativo ni vacío', () => {
    expect(amountError(0, true)).toBeNull();
    expect(amountError(7000, true)).toBeNull();
    expect(amountError(null, true)).toContain('puede ser 0');
    expect(amountError(-1, true)).toContain('puede ser 0');
  });
});

describe('amountToInput', () => {
  it('usa coma decimal', () => {
    expect(amountToInput(1500.5)).toBe('1500,5');
    expect(amountToInput(null)).toBe('');
  });

  it('es la inversa de parseAmount', () => {
    for (const n of [0, 1, 1500, 1500.5, 1234567.89, -2500000]) {
      expect(parseAmount(amountToInput(n))).toBe(n);
    }
  });
});
