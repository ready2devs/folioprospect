import fs from 'node:fs';
import path from 'node:path';
import type { AssetMeta, Portfolio, Trade } from '../shared/engine/types.js';

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
  try {
    const res = await fetch(`${KV_URL}/get/${encodeURIComponent(KV_KEY)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!data?.result) return null;
    const parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    if (parsed && Array.isArray(parsed.portfolios)) return parsed as DatabaseSchema;
  } catch {
    // KV unreachable: fall back to local sources
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
  if (hydratedDb) return hydratedDb;
  const vercelTmp = path.join('/tmp', 'folioprospect-db.json');
  if (fs.existsSync(vercelTmp)) {
    try {
      return JSON.parse(fs.readFileSync(vercelTmp, 'utf8'));
    } catch {}
  }
  if (fs.existsSync(DB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
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
  };
  saveDatabase(db);
  return db;
}

export function saveDatabase(db: DatabaseSchema): void {
  db.updatedAt = new Date().toISOString();
  hydratedDb = db;
  // Durable write (fire-and-forget; local copies below stay synchronous)
  void kvSetDb(db);
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
}
