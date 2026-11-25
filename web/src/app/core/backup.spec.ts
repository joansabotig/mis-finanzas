import { backupFileName, buildBackup, inspectBackup } from './backup';

const tables = {
  accounts: [{ id: 'a1', user_id: 'u', name: 'Efectivo', currency: 'ARS' }],
  categories: [{ id: 'c1', user_id: 'u', name: 'Super', kind: 'expense' }],
  recurring_items: [],
  transactions: [{ id: 't1', user_id: 'u', account_id: 'a1', amount: 100, type: 'expense' }],
  exchange_rates: [],
  savings_goals: [],
};

describe('backup', () => {
  it('arma el archivo sin user_id y con la cotización elegida', () => {
    const b = buildBackup(tables, { user_id: 'u', rate_source: 'blue', updated_at: 'x' }, new Date('2026-11-26T12:00:00Z'));
    expect(b.app).toBe('mis-finanzas');
    expect(b.version).toBe(1);
    expect(b.exported_at).toBe('2026-11-26T12:00:00.000Z');
    expect(b.data.accounts[0]).toEqual({ id: 'a1', name: 'Efectivo', currency: 'ARS' });
    expect(JSON.stringify(b)).not.toContain('"user_id"');
    expect(b.data.user_settings).toEqual({ rate_source: 'blue' });
  });

  it('inspecciona un backup válido (también después de pasar por JSON)', () => {
    const b = JSON.parse(JSON.stringify(buildBackup(tables, null)));
    const r = inspectBackup(b);
    expect('summary' in r && r.summary).toMatchObject({ accounts: 1, categories: 1, recurring: 0, transactions: 1 });
  });

  it('rechaza archivos que no son backups o están dañados', () => {
    expect(inspectBackup(null)).toEqual({ error: 'El archivo no es un backup de Mis Finanzas.' });
    expect(inspectBackup({ app: 'otra', data: {} })).toEqual({ error: 'El archivo no es un backup de Mis Finanzas.' });
    expect('error' in inspectBackup({ ...buildBackup(tables, null), version: 2 })).toBe(true);

    const sinCuentas = buildBackup({ ...tables, accounts: [] }, null);
    expect(inspectBackup(sinCuentas)).toEqual({ error: 'El backup está dañado: hay movimientos de cuentas que no están en el archivo.' });

    const incompleto = buildBackup(tables, null) as unknown as { data: Record<string, unknown> };
    delete incompleto.data['transactions'];
    expect(inspectBackup(incompleto)).toEqual({ error: 'El backup está incompleto (falta "transactions").' });
  });

  it('nombra el archivo con la fecha local', () => {
    expect(backupFileName(new Date(2026, 10, 5))).toBe('mis-finanzas-backup-2026-11-05.json');
  });
});
