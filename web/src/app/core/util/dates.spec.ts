import { addMonths, isMonth, monthLabel, monthRange, toIsoDate } from './dates';

describe('dates', () => {
  it('toIsoDate usa la fecha local', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('addMonths cruza años', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('monthRange devuelve el último día correcto', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('isMonth valida YYYY-MM', () => {
    expect(isMonth('2026-11')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('nov')).toBe(false);
    expect(isMonth(undefined)).toBe(false);
  });

  it('monthLabel en español', () => {
    expect(monthLabel('2026-11')).toBe('Noviembre de 2026');
  });
});
