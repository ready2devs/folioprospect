/**
 * Caché EN MEMORIA de siglas de veredicto de la watchlist (SPEC-006,
 * enmienda v10). SUPERADA por la enmienda v13 (2026-11-15): el
 * endpoint ya no cachea siglas — deriva cada una en el momento desde
 * el snapshot compartido de FV (server/motorFvSnapshot.ts), que es
 * lo que la ficha también lee. Esta clase queda solo como referencia
 * histórica y por sus tests; no está en el camino de servicio.
 *
 * Reemplaza a la vieja caché PERSISTIDA por día (`db.verdictCache`):
 * aquella congelaba la sigla en el primer cálculo del día y podía
 * contradecir durante horas el veredicto de la ficha, que recalcula
 * con la ventana corta del optimizador (caso real: TMDX «V» en la
 * watchlist con la ficha en MANTENER). Ahora el endpoint calcula
 * siempre por el mismo camino de la ficha y guarda el resultado acá
 * por 15 minutos — la misma ventana de `CACHE_MS` del optimizador —
 * para que sigla y ficha salgan del mismo snapshot y la tanda de la
 * watchlist no recalcule símbolo por símbolo en cada apertura.
 *
 * Es estado efímero del proceso: no se persiste ni se sincroniza
 * entre instancias; al vencer, la sigla se recalcula.
 */

/** Una sigla de veredicto ya calculada. `verdict: null` y
 *  `sigla: '—'` = el motor no produce evaluación para el activo. */
export interface WatchlistVerdict {
  sigla: string;
  verdict: string | null;
}

/** Ventana de la caché: la misma del resultado del optimizador
 *  (`CACHE_MS` en server/optimizerData.ts). */
export const VERDICT_CACHE_TTL_MS = 15 * 60 * 1000;

export class VerdictMemoryCache {
  private readonly entries = new Map<string, { value: WatchlistVerdict; at: number }>();

  constructor(private readonly ttlMs: number = VERDICT_CACHE_TTL_MS) {}

  /** La entrada vigente del símbolo, o null si no hay o venció
   *  (lo vencido se poda al leer). */
  get(symbol: string, now: number = Date.now()): WatchlistVerdict | null {
    const e = this.entries.get(symbol);
    if (!e) return null;
    if (now - e.at >= this.ttlMs) {
      this.entries.delete(symbol);
      return null;
    }
    return e.value;
  }

  set(symbol: string, value: WatchlistVerdict, now: number = Date.now()): void {
    this.entries.set(symbol, { value, at: now });
  }

  get size(): number {
    return this.entries.size;
  }
}
