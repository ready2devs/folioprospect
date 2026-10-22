import fs from 'node:fs';
import path from 'node:path';
import type { AssetMeta, Portfolio, Trade } from '../shared/engine/types.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SEED_DIR = path.join(DATA_DIR, 'seed');
const DB_PATH = path.join(DATA_DIR, 'db.json');

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
