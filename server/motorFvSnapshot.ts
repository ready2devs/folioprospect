/**
 * Snapshot COMPARTIDO del Fair Value del motor por activo (SPEC-006,
 * enmienda v13).
 *
 * El defecto que corrige: la ficha (/api/asset) y las siglas de la
 * watchlist (/api/watchlist/verdicts) llamaban CADA UNA por su lado a
 * buildAssetOptimizerFv, en momentos distintos y — en Vercel — sobre
 * instancias serverless distintas, cada una con sus cachés de fuentes
 * (Finviz, contexto sectorial, TradingView, Yahoo) en un estado
 * distinto. El pipeline de FV no es determinístico entre corridas:
 * una fuente que tarda o cae cambia las patas que forman el FV y el
 * número salta (caso real 2026-11-15: TMDX «V» en la watchlist con la
 * ficha en MANTENER y FV US$96,94; MRVL, PDD y AAOI también difirieron
 * entre los dos endpoints en la misma auditoría, y se dieron vuelta
 * minutos después). La enmienda v10 había unificado la REGLA y la
 * ventana de caché, pero no la COMPUTACIÓN: dos corridas separadas
 * podían producir dos FV distintos para el mismo activo.
 *
 * Ahora hay UNA SOLA computación por activo y ventana, compartida:
 * el primer cálculo se guarda en memoria de la instancia y en el KV
 * durable (Upstash, clave propia por símbolo, con vencimiento) y
 * AMBOS endpoints lo leen. Dentro de la ventana, la ficha y la sigla
 * salen del mismo FV sí o sí, en cualquier instancia; el veredicto se
 * deriva en cada pedido con el precio vivo y ese FV snapshot.
 *
 * Sin KV configurado (desarrollo local) manda la memoria de la
 * instancia, que igual unifica los dos endpoints del proceso.
 * Nunca se cachea un resultado nulo: si el motor no produjo FV, el
 * próximo pedido reintenta en vez de congelar el «sin dato».
 */
import type { MotorFvView } from '../shared/engine/index.js';

/** Ventana del snapshot: la misma del resultado del optimizador
 *  (`CACHE_MS` en server/optimizerData.ts). */
export const MOTOR_FV_TTL_MS = 15 * 60 * 1000;

export interface MotorFvSnapshotEntry {
  view: MotorFvView;
  at: number;
}

function isValidView(v: any): v is MotorFvView {
  return (
    v != null &&
    typeof v === 'object' &&
    Number.isFinite(v.fv) && v.fv > 0 &&
    Number.isFinite(v.fvPesimista) && v.fvPesimista > 0 &&
    Number.isFinite(v.fvOptimista) && v.fvOptimista > 0
  );
}

/** Caché EN MEMORIA del snapshot (una instancia). Lo vencido se poda
 *  al leer. */
export class MotorFvMemoryCache {
  private readonly entries = new Map<string, MotorFvSnapshotEntry>();

  constructor(private readonly ttlMs: number = MOTOR_FV_TTL_MS) {}

  get(symbol: string, now: number = Date.now()): MotorFvView | null {
    const e = this.entries.get(symbol);
    if (!e) return null;
    if (now - e.at >= this.ttlMs) {
      this.entries.delete(symbol);
      return null;
    }
    return e.view;
  }

  set(symbol: string, view: MotorFvView, now: number = Date.now()): void {
    this.entries.set(symbol, { view, at: now });
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Almacén durable mínimo (Upstash Redis vía REST, como server/db.ts). */
export interface MotorFvKvStore {
  get(symbol: string): Promise<MotorFvSnapshotEntry | null>;
  set(symbol: string, entry: MotorFvSnapshotEntry): Promise<void>;
}

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const kvKey = (symbol: string): string => `folioprospect:fv:${symbol}`;

/** KV real; sin credenciales, un almacén vacío (solo memoria). */
export const motorFvKvStore: MotorFvKvStore = {
  async get(symbol) {
    if (!KV_URL || !KV_TOKEN) return null;
    try {
      const res = await fetch(`${KV_URL}/get/${encodeURIComponent(kvKey(symbol))}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data?.result) return null;
      const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      if (!parsed || typeof parsed.at !== 'number' || !isValidView(parsed.view)) return null;
      return parsed as MotorFvSnapshotEntry;
    } catch {
      return null;
    }
  },
  async set(symbol, entry) {
    if (!KV_URL || !KV_TOKEN) return;
    const value = JSON.stringify(entry);
    try {
      // Con vencimiento en el propio KV (EX en segundos, = TTL): la
      // clave vieja no sobrevive a la ventana aunque nadie la lea.
      const res = await fetch(
        `${KV_URL}/set/${encodeURIComponent(kvKey(symbol))}/${encodeURIComponent(value)}/EX/${Math.floor(MOTOR_FV_TTL_MS / 1000)}`,
        { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` }, signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) return;
      // Respaldo sin EX (la frescura la juzga el `at` al leer).
      await fetch(`${KV_URL}/set/${encodeURIComponent(kvKey(symbol))}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: value,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // best effort: la memoria de la instancia ya tiene el snapshot
    }
  },
};

export interface MotorFvResolverDeps {
  memory?: MotorFvMemoryCache;
  kv?: MotorFvKvStore;
  ttlMs?: number;
  now?: () => number;
}

/**
 * Resuelve el FV del motor de un activo desde el snapshot compartido:
 * memoria → KV durable → computación (una sola por símbolo y ventana
 * en la instancia: los pedidos concurrentes comparten el cálculo en
 * curso). `compute` devuelve la vista del motor o null (no se
 * cachea). Lo computado se guarda en memoria y en KV.
 */
export function createMotorFvResolver(deps: MotorFvResolverDeps = {}) {
  const memory = deps.memory ?? new MotorFvMemoryCache(deps.ttlMs ?? MOTOR_FV_TTL_MS);
  const kv = deps.kv ?? motorFvKvStore;
  const ttlMs = deps.ttlMs ?? MOTOR_FV_TTL_MS;
  const now = deps.now ?? (() => Date.now());
  const inflight = new Map<string, Promise<MotorFvView | null>>();

  return async function resolveMotorFv(
    symbol: string,
    compute: () => Promise<MotorFvView | null>
  ): Promise<MotorFvView | null> {
    const hit = memory.get(symbol, now());
    if (hit) return hit;

    const stored = await kv.get(symbol).catch(() => null);
    if (stored && now() - stored.at < ttlMs && isValidView(stored.view)) {
      memory.set(symbol, stored.view, stored.at);
      return stored.view;
    }

    const running = inflight.get(symbol);
    if (running) return running;

    const p = (async (): Promise<MotorFvView | null> => {
      try {
        const view = await compute();
        if (!view || !isValidView(view)) return null;
        const at = now();
        memory.set(symbol, view, at);
        await kv.set(symbol, { view, at }).catch(() => undefined);
        return view;
      } finally {
        inflight.delete(symbol);
      }
    })();
    inflight.set(symbol, p);
    return p;
  };
}

/** Resolvedor singleton del servidor: lo comparten /api/asset y
 *  /api/watchlist/verdicts (server/routes.ts). */
export const getOrComputeMotorFv = createMotorFvResolver();
