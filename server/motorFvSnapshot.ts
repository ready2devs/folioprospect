/**
 * Snapshot COMPARTIDO del Fair Value del motor por activo (SPEC-006,
 * enmiendas v13 y v15).
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
 * Enmienda v15 — la CALIDAD del cómputo manda: la primera foto tras
 * el despliegue de la v13 salió de una corrida degradada (sin Finviz
 * y con el contexto sectorial parcial: TMDX quedó congelado en
 * US$80,36 con pesimista US$41,92 mientras el cálculo sano daba
 * US$96,94). Cada cómputo declara su calidad (0–5: completitud del
 * contexto sectorial + presencia de Finviz y de TradingView) y una
 * foto buena (≤24 h) NO la desplaza un cómputo de menor calidad,
 * aunque la ventana de 15 min haya vencido: se sigue sirviendo la
 * buena mientras los cómputos nuevos salgan degradados.
 *
 * Sin KV configurado (desarrollo local) manda la memoria de la
 * instancia, que igual unifica los dos endpoints del proceso.
 * Nunca se cachea un resultado nulo: si el motor no produjo FV, el
 * próximo pedido reintenta en vez de congelar el «sin dato».
 */
import type { MotorFvView } from '../shared/engine/index.js';

/** Ventana fresca del snapshot: la misma del resultado del
 *  optimizador (`CACHE_MS` en server/optimizerData.ts). */
export const MOTOR_FV_TTL_MS = 15 * 60 * 1000;
/** Guarda de calidad (v15): una foto buena se sigue sirviendo hasta
 *  un día si los cómputos nuevos salen de menor calidad. */
export const MOTOR_FV_KEEP_MS = 24 * 3600 * 1000;

export interface MotorFvSnapshotEntry {
  view: MotorFvView;
  at: number;
  /** Calidad del cómputo que produjo la vista (0–5; v15). Las
   *  entradas legadas sin el campo valen 0. */
  quality: number;
}

/** Un cómputo del motor: la vista y la calidad de sus insumos. */
export interface MotorFvComputation {
  view: MotorFvView;
  quality: number;
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

function normalizeEntry(parsed: any): MotorFvSnapshotEntry | null {
  if (!parsed || typeof parsed.at !== 'number' || !isValidView(parsed.view)) return null;
  return {
    view: parsed.view,
    at: parsed.at,
    quality: typeof parsed.quality === 'number' && Number.isFinite(parsed.quality) ? parsed.quality : 0,
  };
}

/** Caché EN MEMORIA del snapshot (una instancia). */
export class MotorFvMemoryCache {
  private readonly entries = new Map<string, MotorFvSnapshotEntry>();

  getEntry(symbol: string): MotorFvSnapshotEntry | null {
    return this.entries.get(symbol) ?? null;
  }

  set(symbol: string, entry: MotorFvSnapshotEntry): void {
    this.entries.set(symbol, entry);
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
      return normalizeEntry(parsed);
    } catch {
      return null;
    }
  },
  async set(symbol, entry) {
    if (!KV_URL || !KV_TOKEN) return;
    const value = JSON.stringify(entry);
    try {
      // Vencimiento en el propio KV = ventana de guarda (24 h): la
      // frescura de 15 min la juzga el `at` al leer, pero una foto
      // buena sobrevive para la regla de calidad de la v15.
      const res = await fetch(
        `${KV_URL}/set/${encodeURIComponent(kvKey(symbol))}/${encodeURIComponent(value)}/EX/${Math.floor(MOTOR_FV_KEEP_MS / 1000)}`,
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
  keepMs?: number;
  now?: () => number;
}

/**
 * Resuelve el FV del motor de un activo desde el snapshot compartido:
 * memoria → KV durable → computación (una sola por símbolo en la
 * instancia: los pedidos concurrentes comparten el cálculo en curso).
 * Reglas: foto fresca (< 15 min) se sirve tal cual; vencida, se
 * recomputa y el cómputo nuevo solo desplaza a la guardada si su
 * calidad es al menos la de ella (o si la guardada pasó la guarda de
 * 24 h); cómputo nulo nunca se guarda y cede ante la foto guardada.
 */
export function createMotorFvResolver(deps: MotorFvResolverDeps = {}) {
  const memory = deps.memory ?? new MotorFvMemoryCache();
  const kv = deps.kv ?? motorFvKvStore;
  const ttlMs = deps.ttlMs ?? MOTOR_FV_TTL_MS;
  const keepMs = deps.keepMs ?? MOTOR_FV_KEEP_MS;
  const now = deps.now ?? (() => Date.now());
  const inflight = new Map<string, Promise<MotorFvView | null>>();

  return async function resolveMotorFv(
    symbol: string,
    compute: () => Promise<MotorFvComputation | null>
  ): Promise<MotorFvView | null> {
    const t = now();
    const mem = memory.getEntry(symbol);
    if (mem && t - mem.at < ttlMs) return mem.view;

    const kvEntry = await kv.get(symbol).catch(() => null);
    const candidate = mem && kvEntry ? (kvEntry.at >= mem.at ? kvEntry : mem) : (mem ?? kvEntry);
    // Una entrada inválida (vista corrupta) no es foto: se ignora.
    const stored = candidate && isValidView(candidate.view) ? candidate : null;
    if (stored && t - stored.at < ttlMs) {
      memory.set(symbol, stored);
      return stored.view;
    }

    const running = inflight.get(symbol);
    if (running) return running;

    const p = (async (): Promise<MotorFvView | null> => {
      try {
        const computed = await compute();
        if (!computed || !isValidView(computed.view)) {
          return stored ? stored.view : null;
        }
        const fresh: MotorFvSnapshotEntry = {
          view: computed.view,
          at: now(),
          quality: computed.quality,
        };
        // Regla de calidad (v15): la guardada, si es más nueva en
        // calidad y sigue dentro de la guarda, no se desplaza.
        if (stored && now() - stored.at < keepMs && fresh.quality < stored.quality) {
          memory.set(symbol, stored);
          return stored.view;
        }
        memory.set(symbol, fresh);
        await kv.set(symbol, fresh).catch(() => undefined);
        return fresh.view;
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
