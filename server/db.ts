import fs from 'node:fs';
import path from 'node:path';
import type {
  AssetMeta,
  NwSettings,
  Portfolio,
  SubPortfolioConfig,
  Trade,
} from '../shared/engine/types.js';
import {
  MAX_SUBPORTFOLIO_ASSIGNMENTS,
  MAX_SUBPORTFOLIO_DEFS,
  MAX_SUBPORTFOLIO_NAME,
  SUBPORTFOLIO_COLORS,
} from '../shared/engine/subPortfolios.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SEED_DIR = path.join(DATA_DIR, 'seed');
const DB_PATH = path.join(DATA_DIR, 'db.json');

// ---------------------------------------------------------------------------
// Durable persistence via Upstash Redis (Vercel Marketplace integration).
// When KV env vars are present (production on Vercel), the database JSON is
// stored in Redis under a single key and becomes the source of truth, so it
// survives serverless cold starts. Without env vars (local dev), behavior is
// unchanged: data/db.json on disk with a /tmp fallback.
// ---------------------------------------------------------------------------
const KV_KEY = 'folioprospect:db';
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export function kvConfigured(): boolean {
  return Boolean(KV_URL && KV_TOKEN);
}

let hydratedDb: DatabaseSchema | null = null;

async function kvGetDb(): Promise<DatabaseSchema | null> {
  if (!kvConfigured()) return null;
  // Dos intentos: un fallo transitorio de red no debe tratarse como «KV
  // vacío», porque el arranque sin hidratación siembra la base local sobre
  // la durable y una relectura fallida deja a la instancia con su foto vieja.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${KV_URL}/get/${encodeURIComponent(KV_KEY)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      if (!data?.result) return null;
      const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
      if (parsed && Array.isArray(parsed.portfolios)) return parsed as DatabaseSchema;
      return null;
    } catch {
      // KV unreachable this attempt: retry once, then fall back to local
    }
  }
  return null;
}

async function kvSetDb(db: DatabaseSchema): Promise<void> {
  if (!kvConfigured()) return;
  try {
    await fetch(`${KV_URL}/set/${encodeURIComponent(KV_KEY)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify(db),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // best effort: local /tmp copy was already written synchronously
  }
}

/**
 * Load the durable database from KV before routes are registered.
 * Returns true when KV held a database (which then becomes authoritative).
 */
export async function hydrateDatabase(): Promise<boolean> {
  const remote = await kvGetDb();
  if (remote) {
    hydratedDb = remote;
    return true;
  }
  return false;
}

export interface DatabaseSchema {
  portfolios: Portfolio[];
  assetMeta: Record<string, AssetMeta>;
  updatedAt: string;
  /** Ids borrados en algún dispositivo (id → timestamp): impiden que una
   *  copia local vieja resuba una operación ya eliminada. */
  tombstones: Record<string, number>;
  /** Ajustes de patrimonio neto (Reserva, cash de broker, overrides de FX)
   *  sincronizados entre dispositivos; gana la modificación más reciente. */
  nwSettings: { data: NwSettings; updatedAt: number } | null;
}

/** Completa los campos que una base persistida anterior a esta versión no
 *  tiene, sin tocar el resto. */
export function normalizeDatabase(db: DatabaseSchema): DatabaseSchema {
  if (!db.tombstones || typeof db.tombstones !== 'object') db.tombstones = {};
  if (db.nwSettings === undefined) db.nwSettings = null;
  return db;
}

const NW_NUM_FIELDS = [
  'brokerCashUsd',
  'cashReserveUsd',
  'sellCommPct',
  'mepBuyCommPct',
  'mepSellCommPct',
] as const;
const NW_NULLABLE_NUM_FIELDS = ['cclOverride', 'mepOverride', 'cclBaseOverride', 'fxDiffOverride'] as const;

/** Valida y normaliza un NwSettings recibido por la API. Devuelve null si el
 *  cuerpo no es un objeto utilizable. */
export function sanitizeNwSettings(raw: any): NwSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const num = (v: any, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const out: NwSettings = {
    brokerCashUsd: 0,
    cashReserveUsd: 0,
    includeCryptoInCcl: false,
    cclOverride: null,
    mepOverride: null,
    cclBaseOverride: null,
    sellCommPct: 0.5,
    mepBuyCommPct: 0.5,
    mepSellCommPct: 0.5,
    fxDiffOverride: null,
  };
  for (const f of NW_NUM_FIELDS) out[f] = num(raw[f], out[f]);
  for (const f of NW_NULLABLE_NUM_FIELDS) {
    out[f] = raw[f] === null || raw[f] === undefined ? null : num(raw[f], NaN);
    if (out[f] !== null && !Number.isFinite(out[f] as number)) out[f] = null;
  }
  out.includeCryptoInCcl = Boolean(raw.includeCryptoInCcl);
  if (typeof raw.fxFormulaExpr === 'string') out.fxFormulaExpr = raw.fxFormulaExpr;
  if (raw.labelStyle === 'clean' || raw.labelStyle === 'tv') out.labelStyle = raw.labelStyle;
  const subPortfolios = sanitizeSubPortfolios(raw.subPortfolios);
  if (subPortfolios) out.subPortfolios = subPortfolios;
  return out;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Valida la config de subcarteras (SPEC-005). Si el campo no viene, devuelve
 *  undefined (base vieja = «sin configurar»); si viene basura, devuelve una
 *  config vacía. Nunca lanza. Topes: 8 defs, nombre 1..24, color de la paleta
 *  o hex válido, ids únicos, asignaciones solo a defs existentes, máx. 300. */
export function sanitizeSubPortfolios(raw: any): SubPortfolioConfig | undefined {
  if (raw === undefined) return undefined;
  const empty: SubPortfolioConfig = { defs: [], assignments: {} };
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
    const defs: SubPortfolioConfig['defs'] = [];
    const seenIds = new Set<string>();
    if (Array.isArray(raw.defs)) {
      for (const d of raw.defs) {
        if (defs.length >= MAX_SUBPORTFOLIO_DEFS) break;
        if (!d || typeof d !== 'object') continue;
        const id = typeof d.id === 'string' ? d.id.trim() : '';
        const name = typeof d.name === 'string' ? d.name.trim() : '';
        const color = typeof d.color === 'string' ? d.color : '';
        if (!id || seenIds.has(id)) continue;
        if (name.length < 1 || name.length > MAX_SUBPORTFOLIO_NAME) continue;
        if (!SUBPORTFOLIO_COLORS.includes(color) && !HEX_COLOR_RE.test(color)) continue;
        seenIds.add(id);
        defs.push({ id, name, color });
      }
    }
    const assignments: Record<string, string> = {};
    if (raw.assignments && typeof raw.assignments === 'object' && !Array.isArray(raw.assignments)) {
      for (const [symbol, defId] of Object.entries(raw.assignments)) {
        if (Object.keys(assignments).length >= MAX_SUBPORTFOLIO_ASSIGNMENTS) break;
        if (typeof symbol !== 'string' || symbol.length === 0) continue;
        if (typeof defId === 'string' && seenIds.has(defId)) assignments[symbol] = defId;
      }
    }
    return { defs, assignments };
  } catch {
    return empty;
  }
}

export function loadSeedExtract(): any {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'tradingview_extract.json'), 'utf8'));
}

export function loadSeedMeta(): Record<string, AssetMeta> {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'asset_meta.json'), 'utf8'));
}

export function loadSeedHistory(): Record<string, [number, number][]> {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'price_history_snapshot.json'), 'utf8'));
}

export function loadSeedCalendar(): any {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'calendar_snapshot.json'), 'utf8'));
}

export function loadTvReference(): any {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'tv_reference.json'), 'utf8'));
}

export function initDatabase(): DatabaseSchema {
  if (hydratedDb) return normalizeDatabase(hydratedDb);
  const vercelTmp = path.join('/tmp', 'folioprospect-db.json');
  if (fs.existsSync(vercelTmp)) {
    try {
      return normalizeDatabase(JSON.parse(fs.readFileSync(vercelTmp, 'utf8')));
    } catch {}
  }
  if (fs.existsSync(DB_PATH)) {
    try {
      return normalizeDatabase(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
    } catch {
      // recreate if corrupted
    }
  }
  const seed = loadSeedExtract();
  const meta = loadSeedMeta();
  const trades: Trade[] = (seed.trades || []).map((t: any) => ({
    id: t.id,
    time: t.time,
    symbol: t.symbol,
    isBuy: Boolean(t.is_buy),
    qty: Number(t.qty),
    price: Number(t.price),
    commission: Number(t.commission || 0),
    comment: t.comment || '',
  }));

  const defaultPortfolio: Portfolio = {
    id: seed.portfolioId || '2bb80f7315764422a5347e8d38503f4e',
    title: seed.settings?.title || 'Personal largo plazo',
    description:
      seed.settings?.description ||
      'Portafolio real replicado de TradingView sin límites de holdings ni transacciones',
    currency: 'USD',
    benchmark: seed.settings?.benchmark || 'SP:SPX',
    riskFreeRate: seed.settings?.risk_free_rate ?? 2,
    startPoint: seed.summary?.data?.start_point || 1756166400000,
    trades,
    cash: [],
    dividends: [],
    splits: [],
    illiquid: [],
  };

  const db: DatabaseSchema = {
    portfolios: [defaultPortfolio],
    assetMeta: meta,
    updatedAt: new Date().toISOString(),
    tombstones: {},
    nwSettings: null,
  };
  saveDatabase(db);
  return db;
}

export function saveDatabase(db: DatabaseSchema): Promise<void> {
  db.updatedAt = new Date().toISOString();
  hydratedDb = db;
  // Durable write: las escrituras de la API la esperan (await) para que la
  // respuesta no vuelva antes de que el estado nuevo sea el durable; los
  // demás llamadores pueden ignorar la promesa como hasta ahora.
  const durable = kvSetDb(db);
  try {
    const tmp = DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch {
    try {
      const tmpPath = path.join('/tmp', 'folioprospect-db.json');
      fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
    } catch {
      // In-memory persistence
    }
  }
  return durable;
}

/**
 * Relee la base durable (KV) y, si su `updatedAt` es más nuevo que el de la
 * copia en memoria, la adopta EN EL LUGAR (misma referencia de objeto: los
 * handlers capturaron `db` al registrar las rutas).
 *
 * Por qué existe: cada instancia serverless hidrata su foto al arrancar y
 * nunca la refrescaba, así que una instancia vieja que recibía una escritura
 * guardaba su foto entera y pisaba el estado vigente (operaciones ya
 * corregidas resucitaban, saldos acreditados volvían a cero). Releer antes
 * de leer/escribir hace que todas las instancias converjan a la durable.
 * Sin KV configurado (desarrollo local) es un no-op. Devuelve true si
 * adoptó una versión más nueva.
 */
export async function refreshDatabase(db: DatabaseSchema): Promise<boolean> {
  const remote = await kvGetDb();
  if (!remote) return false;
  const fresh = normalizeDatabase(remote);
  if (!fresh.updatedAt || fresh.updatedAt <= db.updatedAt) return false;
  db.portfolios = fresh.portfolios;
  db.assetMeta = fresh.assetMeta;
  db.tombstones = fresh.tombstones;
  db.nwSettings = fresh.nwSettings;
  db.updatedAt = fresh.updatedAt;
  hydratedDb = db;
  return true;
}
