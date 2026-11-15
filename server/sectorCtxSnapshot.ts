/**
 * Foto compartida del CONTEXTO SECTORIAL (SPEC-006, enmienda v14).
 *
 * El contexto (medianas de P/E forward, ROIC y crecimiento de los
 * pares de la industria) se arma en vivo raspando Finviz/TradingView
 * y es el insumo más frágil del Fair Value: la pata de múltiplos es
 * P/E del sector × ajuste empresa/sector (tope 1,6), y si en una
 * corrida la mediana de crecimiento del sector no llega, el ajuste
 * cae a 1,0 y el múltiplo se desploma (caso TMDX, 2026-11-15: el FV
 * saltó de US$96,94 a US$80,36 con el precio quieto, porque distintas
 * instancias serverless juntaban versiones distintas — completas o
 * parciales — del mismo contexto).
 *
 * Este módulo le da al contexto el mismo tratamiento que la v13 le
 * dio al FV: UNA foto por industria, compartida entre instancias
 * (memoria + KV durable), con dos reglas de estabilidad:
 *  1. Ventana de frescura: dentro de las 6 h se sirve la foto
 *     guardada sin recomputar.
 *  2. Completitud manda: una foto COMPLETA (los tres campos) no la
 *     desplaza una parcial más nueva; una parcial solo se sirve si
 *     no hay nada mejor guardado de las últimas 24 h. Recién un
 *     cómputo al menos tan completo como lo guardado lo reemplaza.
 * Sin KV configurado (desarrollo local), la memoria de la instancia
 * sostiene las mismas reglas dentro del proceso.
 */
import type { SectorContext } from './sectorContext.js';

export const SECTOR_CTX_FRESH_MS = 6 * 3600 * 1000;
export const SECTOR_CTX_KEEP_MS = 24 * 3600 * 1000;
const KV_KEY_PREFIX = 'folioprospect:sectorctx:';

export interface SectorCtxSnapshotEntry {
  ctx: SectorContext;
  at: number;
}

/** Completitud 0–3: cuántos de los tres campos de medianas trae. */
export function sectorCtxCompleteness(ctx: SectorContext | null): number {
  if (!ctx) return -1;
  return (
    (ctx.forwardPe != null && ctx.forwardPe > 0 ? 1 : 0) +
    (ctx.roicPct != null && Number.isFinite(ctx.roicPct) ? 1 : 0) +
    (ctx.growth5yPct != null && Number.isFinite(ctx.growth5yPct) ? 1 : 0)
  );
}

function isValidCtx(ctx: unknown): ctx is SectorContext {
  if (typeof ctx !== 'object' || ctx === null) return false;
  const c = ctx as SectorContext;
  return typeof c.peersUsed === 'number' && typeof c.industrySlug === 'string';
}

export class SectorCtxMemoryCache {
  private map = new Map<string, SectorCtxSnapshotEntry>();

  get(key: string): SectorCtxSnapshotEntry | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, entry: SectorCtxSnapshotEntry): void {
    this.map.set(key, entry);
  }
}

export interface SectorCtxKvStore {
  get(key: string): Promise<SectorCtxSnapshotEntry | null>;
  set(key: string, entry: SectorCtxSnapshotEntry, ttlSeconds: number): Promise<void>;
}

function kvConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export const sectorCtxKvStore: SectorCtxKvStore = {
  async get(key) {
    const cfg = kvConfig();
    if (!cfg) return null;
    try {
      const res = await fetch(`${cfg.url}/get/${encodeURIComponent(KV_KEY_PREFIX + key)}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const j: any = await res.json().catch(() => null);
      if (typeof j?.result !== 'string') return null;
      const parsed = JSON.parse(j.result);
      if (
        parsed &&
        typeof parsed.at === 'number' &&
        isValidCtx(parsed.ctx)
      ) {
        return { ctx: parsed.ctx, at: parsed.at };
      }
      return null;
    } catch {
      return null;
    }
  },
  async set(key, entry, ttlSeconds) {
    const cfg = kvConfig();
    if (!cfg) return;
    const value = encodeURIComponent(JSON.stringify(entry));
    const fullKey = encodeURIComponent(KV_KEY_PREFIX + key);
    try {
      const res = await fetch(`${cfg.url}/set/${fullKey}/${value}/EX/${ttlSeconds}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error('kv set not ok');
    } catch {
      try {
        await fetch(`${cfg.url}/set/${fullKey}/${value}`, {
          headers: { Authorization: `Bearer ${cfg.token}` },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        /* sin KV el contexto sigue en memoria */
      }
    }
  },
};

export interface SectorCtxResolverDeps {
  memory?: SectorCtxMemoryCache;
  kv?: SectorCtxKvStore;
  freshMs?: number;
  keepMs?: number;
  now?: () => number;
}

export type SectorCtxResolver = (
  key: string,
  compute: () => Promise<SectorContext | null>
) => Promise<SectorContext | null>;

/**
 * Resolvedor con inyección de dependencias (testeable): memoria →
 * KV → cómputo, con vuelo único por clave y la regla de completitud
 * al guardar y al servir.
 */
export function createSectorCtxResolver(deps: SectorCtxResolverDeps = {}): SectorCtxResolver {
  const memory = deps.memory ?? new SectorCtxMemoryCache();
  const kv = deps.kv ?? sectorCtxKvStore;
  const freshMs = deps.freshMs ?? SECTOR_CTX_FRESH_MS;
  const keepMs = deps.keepMs ?? SECTOR_CTX_KEEP_MS;
  const now = deps.now ?? Date.now;
  const inflight = new Map<string, Promise<SectorContext | null>>();

  const betterOf = (
    a: SectorCtxSnapshotEntry | null,
    b: SectorCtxSnapshotEntry | null
  ): SectorCtxSnapshotEntry | null => {
    if (!a) return b;
    if (!b) return a;
    const ca = sectorCtxCompleteness(a.ctx);
    const cb = sectorCtxCompleteness(b.ctx);
    if (ca !== cb) return ca > cb ? a : b;
    return a.at >= b.at ? a : b;
  };

  return async function resolveSectorCtx(key, compute) {
    const t = now();
    const mem = memory.get(key);
    // Atajo solo para la foto COMPLETA y fresca: una parcial en
    // memoria no tapa una completa que otra instancia haya guardado.
    if (mem && t - mem.at < freshMs && sectorCtxCompleteness(mem.ctx) === 3) {
      return mem.ctx;
    }
    const stored = betterOf(mem, await kv.get(key).catch(() => null));
    if (stored && t - stored.at < freshMs) {
      memory.set(key, stored);
      return stored.ctx;
    }
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = (async (): Promise<SectorContext | null> => {
      try {
        const computed = await compute();
        const computedEntry: SectorCtxSnapshotEntry | null =
          computed && isValidCtx(computed) ? { ctx: computed, at: now() } : null;
        // Completitud manda: lo guardado (≤ keepMs) solo se desplaza
        // por un cómputo al menos tan completo; si el cómputo nuevo
        // es más pobre, se sigue sirviendo lo guardado.
        const winner =
          stored && now() - stored.at < keepMs
            ? betterOf(stored, computedEntry)
            : (computedEntry ?? stored);
        if (winner) {
          memory.set(key, winner);
          const ttlSeconds = Math.max(
            60,
            Math.round((winner.at + keepMs - now()) / 1000)
          );
          await kv.set(key, winner, ttlSeconds).catch(() => undefined);
          return winner.ctx;
        }
        return computed;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  };
}

const sharedResolver = createSectorCtxResolver();

/** Punto de entrada del servidor: la foto compartida del contexto. */
export function getOrComputeSectorCtx(
  key: string,
  compute: () => Promise<SectorContext | null>
): Promise<SectorContext | null> {
  return sharedResolver(key, compute);
}
