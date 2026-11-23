import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';
import { RateSource } from './models';
import { todayIso } from './util/dates';

export interface CurrentRate {
  rate: number;
  source: RateSource;
  date: string | null;
}

/**
 * Cotización del dólar que usa la app para pasar USD a pesos.
 * Si el usuario eligió una fuente automática, se consulta dolarapi.com una vez
 * por día (precio de venta) y se guarda en exchange_rates como historial.
 */
@Injectable({ providedIn: 'root' })
export class RateService {
  private readonly data = inject(DataService);
  private cache: { at: number; value: Promise<CurrentRate> } | null = null;

  current(force = false): Promise<CurrentRate> {
    if (!force && this.cache && Date.now() - this.cache.at < 10 * 60_000) return this.cache.value;
    const value = this.load().catch(() => ({ rate: 1, source: 'manual' as RateSource, date: null }));
    this.cache = { at: Date.now(), value };
    return value;
  }

  invalidate() {
    this.cache = null;
  }

  private async load(): Promise<CurrentRate> {
    const source = await this.data.rateSource();
    const today = todayIso();

    if (source !== 'manual') {
      const stored = await this.data.latestRate(source).catch(() => null);
      if (stored && stored.date === today) return { rate: stored.rate, source, date: stored.date };
      const fetched = await fetchDolarApi(source);
      if (fetched) {
        await this.data.saveRate(source, fetched).catch(() => undefined);
        return { rate: fetched, source, date: today };
      }
      if (stored) return { rate: stored.rate, source, date: stored.date };
    }

    const manual = (await this.data.latestRate('manual')) ?? (await this.data.latestRate());
    return manual ? { rate: manual.rate, source: 'manual', date: manual.date } : { rate: 1, source: 'manual', date: null };
  }
}

/** Precio de venta según dolarapi.com (gratis, sin clave, con CORS). */
export async function fetchDolarApi(source: Exclude<RateSource, 'manual'>): Promise<number | null> {
  try {
    const res = await fetch(`https://dolarapi.com/v1/dolares/${source}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { venta?: number };
    const rate = Number(json.venta);
    return rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
