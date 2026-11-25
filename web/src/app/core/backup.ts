/**
 * Formato del archivo de backup (JSON). Se puede restaurar en la misma cuenta
 * o en una nueva (ver restore_my_data() en la migración 4).
 */
export const BACKUP_TABLES = [
  'accounts',
  'categories',
  'recurring_items',
  'transactions',
  'exchange_rates',
  'savings_goals',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  app: 'mis-finanzas';
  version: 1;
  exported_at: string;
  data: Record<BackupTable, Record<string, unknown>[]> & { user_settings: Record<string, unknown> | null };
}

/** Campos que no viajan en el backup: el dueño se asigna al restaurar. */
const OMIT = new Set(['user_id']);

export function buildBackup(
  tables: Record<BackupTable, Record<string, unknown>[]>,
  userSettings: Record<string, unknown> | null,
  now = new Date(),
): BackupFile {
  const clean = (rows: Record<string, unknown>[]) =>
    rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !OMIT.has(k))));
  const data = Object.fromEntries(BACKUP_TABLES.map((t) => [t, clean(tables[t] ?? [])])) as unknown as BackupFile['data'];
  data.user_settings = userSettings ? { rate_source: userSettings['rate_source'] } : null;
  return { app: 'mis-finanzas', version: 1, exported_at: now.toISOString(), data };
}

export interface BackupSummary {
  exportedAt: string;
  accounts: number;
  categories: number;
  recurring: number;
  transactions: number;
}

/** Valida un archivo leído y devuelve un resumen, o un mensaje de error. */
export function inspectBackup(raw: unknown): { summary: BackupSummary; backup: BackupFile } | { error: string } {
  const b = raw as Partial<BackupFile> | null;
  if (!b || typeof b !== 'object' || b.app !== 'mis-finanzas' || !b.data || typeof b.data !== 'object') {
    return { error: 'El archivo no es un backup de Mis Finanzas.' };
  }
  if (b.version !== 1) return { error: 'Este backup es de una versión que la app no reconoce.' };
  for (const t of BACKUP_TABLES) {
    if (!Array.isArray(b.data[t])) return { error: `El backup está incompleto (falta "${t}").` };
  }
  const accountIds = new Set(b.data.accounts.map((a) => a['id']));
  const orphan = b.data.transactions.find((t) => !accountIds.has(t['account_id']));
  if (orphan) return { error: 'El backup está dañado: hay movimientos de cuentas que no están en el archivo.' };
  return {
    backup: b as BackupFile,
    summary: {
      exportedAt: String(b.exported_at ?? ''),
      accounts: b.data.accounts.length,
      categories: b.data.categories.length,
      recurring: b.data.recurring_items.length,
      transactions: b.data.transactions.length,
    },
  };
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `mis-finanzas-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
