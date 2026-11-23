/**
 * Preferencias de comodidad guardadas en el dispositivo (última cuenta usada,
 * categorías más usadas). Si el navegador bloquea localStorage, se ignora.
 */
const KEY = 'mis-finanzas.prefs';

interface Prefs {
  lastAccount: Record<string, string>; // por tipo de movimiento
  categoryUse: Record<string, number>;
}

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { lastAccount: {}, categoryUse: {}, ...JSON.parse(raw) };
  } catch {
    /* sin almacenamiento */
  }
  return { lastAccount: {}, categoryUse: {} };
}

function write(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento */
  }
}

export const prefs = {
  lastAccount(type: string): string | undefined {
    return read().lastAccount[type];
  },
  categoryUse(id: string): number {
    return read().categoryUse[id] ?? 0;
  },
  rememberUse(type: string, accountId: string, categoryId: string | null) {
    const p = read();
    p.lastAccount[type] = accountId;
    if (categoryId) p.categoryUse[categoryId] = (p.categoryUse[categoryId] ?? 0) + 1;
    write(p);
  },
};
