import type {
  ArgFxResponse,
  AssetMeta,
  CashTx,
  ComputedHolding,
  DailyPoint,
  DistributionRow,
  DividendTx,
  FairValueResult,
  IlliquidAsset,
  MonthlyComparison,
  PeriodPerformance,
  Portfolio,
  PortfolioKPIs,
  ProjectionResult,
  QuoteData,
  RiskMetrics,
  Trade,
} from '@shared/engine/types';
import {
  evaluateLedger,
  buildPortfolioSeries,
  computeRiskMetrics,
  runPortfolioProjection,
  resolveAssetMeta,
  normalizeTradingViewSymbol,
  findCatalogEntry,
  searchLocalCatalog,
} from '@shared/engine';

export type { ArgFxResponse };

export interface PortfolioEvaluationResponse {
  portfolio: Portfolio;
  kpis: PortfolioKPIs;
  holdings: ComputedHolding[];
  closedHoldings: ComputedHolding[];
  sparklines: Record<string, { prevClose: number; points: number[] }>;
  distribution: {
    assets: DistributionRow[];
    assetTypes: DistributionRow[];
    sectors: DistributionRow[];
    currency: DistributionRow[];
  };
  series: {
    daily: DailyPoint[];
    monthly: MonthlyComparison[];
    periods: PeriodPerformance;
    benchmarkSymbol: string;
  };
  risk: RiskMetrics;
  movers: {
    gainers: ComputedHolding[];
    losers: ComputedHolding[];
  };
  calendar: {
    snapshotDate: string;
    earnings: any[];
    dividends: any[];
    news: any[];
  };
  tvReference: any;
  defaultProjection: ProjectionResult;
  cached: boolean;
}

export interface MarketOverviewResponse {
  indices: {
    symbol: string;
    ticker: string;
    name: string;
    region: string;
    price: number;
    prevClose: number;
    change: number;
    changePct: number;
    sparkline: number[];
  }[];
  sectors: {
    symbol: string;
    ticker: string;
    name: string;
    weight: string;
    price: number;
    changePct: number;
    sparkline: number[];
  }[];
  news: { symbol: string; headline: string; provider: string }[];
  earnings: any[];
}

export interface AssetDetailResponse {
  symbol: string;
  meta: AssetMeta;
  quote: QuoteData;
  sparkline: { prevClose: number; points: number[] };
  chart: { points: [number, number][]; prevClose: number };
  fairValue: FairValueResult;
  holding: ComputedHolding | null;
  trades: any[];
  projection: ProjectionResult;
}

export const LEDGER_STORAGE_KEY = 'fp.ledger.v1';

export interface PersistedLedgerState {
  version: number;
  updatedAt: number;
  isCustomized: boolean;
  portfolioId: string;
  trades: Trade[];
  cash: CashTx[];
  dividends: DividendTx[];
  illiquid: IlliquidAsset[];
  customMeta: Record<string, AssetMeta>;
}

export function loadPersistedLedger(): PersistedLedgerState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LEDGER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.trades)) {
      return {
        version: 1,
        updatedAt: parsed.updatedAt || Date.now(),
        isCustomized: Boolean(parsed.isCustomized),
        portfolioId: parsed.portfolioId || '2bb80f7315764422a5347e8d38503f4e',
        trades: parsed.trades || [],
        cash: parsed.cash || [],
        dividends: parsed.dividends || [],
        illiquid: parsed.illiquid || [],
        customMeta: parsed.customMeta || {},
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function savePersistedLedger(state: PersistedLedgerState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      LEDGER_STORAGE_KEY,
      JSON.stringify({ ...state, updatedAt: Date.now() })
    );
  } catch {
    // ignore storage errors
  }
}

export function clearPersistedLedger(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(LEDGER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const STABLECOIN_SYMS = new Set([
  'BINANCE:USDTUSDT', 'BINANCE:USDCUSDT', 'BINANCE:BUSDUSDT', 'BINANCE:DAIUSDT',
]);

/**
 * Fetch live crypto prices directly from Binance in the browser.
 * This bypasses server-side IP blocks (Vercel/AWS) since Binance API has CORS: *.
 */
async function fetchLiveCryptoQuotes(symbols: string[]): Promise<Record<string, QuoteData>> {
  const cryptoSyms = symbols.filter(
    (s) => (s.startsWith('BINANCE:') || s.endsWith('USDT')) && !STABLECOIN_SYMS.has(s)
  );
  const result: Record<string, QuoteData> = {};

  // Stablecoins: always $1.00
  for (const s of symbols) {
    if (STABLECOIN_SYMS.has(s)) {
      result[s] = {
        symbol: s, price: 1.00, prevClose: 1.00,
        change: 0, changePct: 0, currency: 'USD', marketState: 'open',
      };
    }
  }

  // Fetch real crypto prices from Binance (browser can reach it)
  await Promise.all(
    cryptoSyms.map(async (sym) => {
      const pair = sym.includes(':') ? sym.split(':')[1] : sym;
      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
          const d: any = await res.json();
          const price = Number(d.lastPrice);
          if (Number.isFinite(price) && price > 0) {
            const prevClose = Number(d.prevClosePrice) || price;
            result[sym] = {
              symbol: sym,
              price,
              prevClose,
              change: Number(d.priceChange),
              changePct: Number(d.priceChangePercent),
              currency: 'USD',
              marketState: 'open',
            };
            return;
          }
        }
      } catch { /* try coinbase */ }
      // Fallback: Coinbase
      try {
        const base = pair.replace(/USDT$|USD$/, '');
        const res = await fetch(
          `https://api.coinbase.com/v2/prices/${base}-USD/spot`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const d: any = await res.json();
          const price = Number(d?.data?.amount);
          if (Number.isFinite(price) && price > 0) {
            result[sym] = {
              symbol: sym, price, prevClose: price,
              change: 0, changePct: 0, currency: 'USD', marketState: 'open',
            };
          }
        }
      } catch { /* use server fallback */ }
    })
  );
  return result;
}

/**
 * Patch crypto prices in a PortfolioEvaluationResponse with live browser-fetched data.
 */
function patchCryptoInEvaluation(
  evalResult: PortfolioEvaluationResponse,
  liveQuotes: Record<string, QuoteData>
): PortfolioEvaluationResponse {
  if (Object.keys(liveQuotes).length === 0) return evalResult;

  const patchedHoldings = evalResult.holdings.map((h) => {
    const lq = liveQuotes[h.symbol];
    if (!lq) return h;
    const lastPrice = lq.price;
    const prevClose = lq.prevClose;
    const value = h.qty * lastPrice;
    const prevVal = h.qty * prevClose;
    const uVal = value - h.invested;
    const uPct = h.invested > 0 ? (uVal / h.invested) * 100 : 0;
    const dVal = value - prevVal;
    const dPct = prevVal > 0 ? (dVal / prevVal) * 100 : 0;
    return {
      ...h,
      lastPrice,
      prevClose,
      value,
      dailyChangeAbs: lastPrice - prevClose,
      unrealizedGain: { v: uVal, p: uPct },
      dailyGain: { v: dVal, p: dPct },
      totalGain: { v: uVal + h.realizedGain + h.dividendGain, p: uPct },
      marketState: 'open' as const,
    };
  });

  // Recalculate KPIs
  const totalValue = patchedHoldings.reduce((s, h) => s + h.value, 0);
  const patchedWithAlloc = patchedHoldings.map((h) => ({
    ...h,
    allocation: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
  }));

  const totalInvested = patchedWithAlloc.reduce((s, h) => s + h.invested, 0);
  const totalUnrealized = patchedWithAlloc.reduce((s, h) => s + h.unrealizedGain.v, 0);
  const totalDaily = patchedWithAlloc.reduce((s, h) => s + h.dailyGain.v, 0);

  const patchedSparklines = { ...(evalResult.sparklines || {}) };
  for (const [sym, lq] of Object.entries(liveQuotes)) {
    if (patchedSparklines[sym]) {
      const sp = patchedSparklines[sym];
      sp.points = [...sp.points.slice(0, -1), lq.price];
    } else {
      patchedSparklines[sym] = { prevClose: lq.prevClose, points: [lq.prevClose, lq.price] };
    }
  }

  return {
    ...evalResult,
    holdings: patchedWithAlloc,
    sparklines: patchedSparklines,
    kpis: {
      ...evalResult.kpis,
      totalGrossPatrimony: totalValue + (evalResult.kpis.totalGrossPatrimony - evalResult.holdings.reduce((s, h) => s + h.value, 0)),
      holdingsValue: totalValue,
      unrealizedGainLoss: totalUnrealized,
      unrealizedGainLossPct: totalInvested > 0 ? (totalUnrealized / totalInvested) * 100 : 0,
      dailyChange: totalDaily,
      dailyChangePct: totalValue > 0 ? (totalDaily / (totalValue - totalDaily)) * 100 : 0,
    },
  };
}

/**
 * Re-computes a PortfolioEvaluationResponse deterministically on the client
 * when the local/PersistedLedgerState has custom mutations that a serverless
 * cold-start instance did not yet have, or when offline fallback is needed.
 */
export function recomputeEvaluationWithPersistedLedger(
  serverEval: PortfolioEvaluationResponse,
  persisted: PersistedLedgerState,
  liveCrypto: Record<string, QuoteData> = {}
): PortfolioEvaluationResponse {
  const mergedPortfolio: Portfolio = {
    ...serverEval.portfolio,
    trades: persisted.trades,
    cash: persisted.cash,
    dividends: persisted.dividends,
    illiquid: persisted.illiquid,
  };

  const metaMap: Record<string, AssetMeta> = { ...(persisted.customMeta || {}) };
  for (const h of [...(serverEval.holdings || []), ...(serverEval.closedHoldings || [])]) {
    metaMap[h.symbol] = resolveAssetMeta(h.symbol, metaMap);
    metaMap[h.symbol].name = h.name;
    metaMap[h.symbol].sector = h.sector;
    metaMap[h.symbol].assetType = h.assetType;
    metaMap[h.symbol].exchange = h.exchange;
  }
  for (const t of mergedPortfolio.trades) {
    const norm = normalizeTradingViewSymbol(t.symbol);
    t.symbol = norm;
    if (!metaMap[norm]) {
      const cat = findCatalogEntry(norm);
      metaMap[norm] = cat
        ? {
            symbol: cat.symbol,
            ticker: cat.ticker,
            exchange: cat.exchange,
            yahoo: cat.yahoo,
            name: cat.name,
            sector: cat.sector,
            industry: cat.industry || '',
            country: cat.country || 'United States',
            assetType: cat.type,
            currency: 'USD',
          }
        : resolveAssetMeta(norm, metaMap);
    }
  }

  // Merge: server quotes -> server holdings -> live browser crypto -> catalog fallback
  const quotesMap: Record<string, QuoteData> = { ...(serverEval.quotes || {}) };
  for (const h of [...(serverEval.holdings || []), ...(serverEval.closedHoldings || [])]) {
    quotesMap[h.symbol] = {
      symbol: h.symbol,
      price: h.lastPrice,
      prevClose: h.prevClose,
      change: h.dailyChangeAbs ?? h.lastPrice - h.prevClose,
      changePct: h.dailyGain?.p ?? 0,
      currency: 'USD',
      marketState: h.marketState,
      regularMarketTime: h.regularMarketTime,
      extPrice: h.extPrice,
      extChange: h.extChange,
      extChangePct: h.extChangePct,
      extTime: h.extTime,
      extSession: h.extSession,
    };
  }
  // Override crypto prices with live browser-fetched data (server may have stale/blocked data)
  for (const [sym, lq] of Object.entries(liveCrypto)) {
    quotesMap[sym] = lq;
  }
  for (const t of mergedPortfolio.trades) {
    if (!quotesMap[t.symbol]) {
      const isStable = STABLECOIN_SYMS.has(t.symbol);
      if (isStable) {
        quotesMap[t.symbol] = {
          symbol: t.symbol, price: 1.00, prevClose: 1.00,
          change: 0, changePct: 0, currency: 'USD', marketState: 'open',
        };
      } else {
        const cat = findCatalogEntry(t.symbol);
        const px = cat?.refPrice ?? t.price;
        quotesMap[t.symbol] = {
          symbol: t.symbol,
          price: px,
          prevClose: px * 0.99,
          change: px * 0.01,
          changePct: 1.01,
          currency: 'USD',
          marketState: t.symbol.startsWith('BINANCE:') ? 'open' : 'closed',
        };
      }
    }
  }

  const ledger = evaluateLedger(mergedPortfolio, metaMap, quotesMap);

  const historyMap: Record<string, [number, number][]> = {};
  if (serverEval.series?.daily?.length) {
    for (const h of ledger.holdings) {
      const sp = serverEval.sparklines?.[h.symbol]?.points;
      const px = h.lastPrice;
      historyMap[h.symbol] = serverEval.series.daily.map((d, idx, arr) => {
        const ratio = idx / Math.max(1, arr.length - 1);
        const est = h.avgPrice + (px - h.avgPrice) * ratio;
        return [Math.floor(d.time / 1000), idx === arr.length - 1 ? px : est];
      });
      if (sp && !serverEval.sparklines[h.symbol]) {
        serverEval.sparklines[h.symbol] = { prevClose: h.prevClose, points: [h.prevClose, px] };
      }
    }
  }

  const benchmark = serverEval.series?.benchmarkSymbol || mergedPortfolio.benchmark || 'SP:SPX';
  const series =
    serverEval.series?.daily?.length && !persisted.isCustomized
      ? serverEval.series
      : (() => {
          const built = buildPortfolioSeries(mergedPortfolio, historyMap, quotesMap, benchmark);
          ledger.kpis.totalGain.p = built.twrAllPct;
          ledger.kpis.annualizedYield = built.annualizedYieldPct;
          return {
            daily: built.daily,
            monthly: built.monthly,
            periods: built.periods,
            benchmarkSymbol: benchmark,
          };
        })();

  const dailyReturns = series.daily.map((d, i) => {
    if (i === 0) return 0;
    const prev = series.daily[i - 1].holdingsValue;
    return prev > 0 ? (d.holdingsValue - prev - d.netFlow) / prev : 0;
  });

  const risk = computeRiskMetrics(mergedPortfolio, series.monthly, series.daily, dailyReturns);

  const sortedByDayPct = [...ledger.holdings].sort((a, b) => b.dailyGain.p - a.dailyGain.p);
  const dailyGainers = sortedByDayPct.filter((h) => h.dailyGain.p >= 0).slice(0, 5);
  const dailyLosers = [...ledger.holdings]
    .sort((a, b) => a.dailyGain.p - b.dailyGain.p)
    .filter((h) => h.dailyGain.p < 0)
    .slice(0, 5);

  const defaultProjection = runPortfolioProjection({
    horizonYears: 20,
    initialCapital: ledger.kpis.totalGrossPatrimony,
    monthlyContribution: 1000,
    baseCagrPct: 12.0,
    annualVolatilityPct: Math.max(12, Math.min(35, risk.annualizedVolatility || 21)),
    inflationPct: 3.0,
    convergeToFairValue: true,
    portfolioPriceToFairValue: 0.87,
  });

  const nextSparklines = { ...(serverEval.sparklines || {}) };
  for (const h of ledger.holdings) {
    if (!nextSparklines[h.symbol]) {
      nextSparklines[h.symbol] = {
        prevClose: h.prevClose,
        points: [h.prevClose, h.lastPrice],
      };
    }
  }

  return {
    ...serverEval,
    portfolio: mergedPortfolio,
    kpis: ledger.kpis,
    holdings: ledger.holdings,
    closedHoldings: ledger.closedHoldings,
    sparklines: nextSparklines,
    distribution: {
      assets: ledger.distributionByAsset,
      assetTypes: ledger.distributionByType,
      sectors: ledger.distributionBySector,
      currency: ledger.distributionByCurrency,
    },
    series,
    risk,
    movers: {
      gainers: dailyGainers,
      losers: dailyLosers,
    },
    defaultProjection,
  };
}

function ensureLocalLedgerInitialized(portfolio?: Portfolio): PersistedLedgerState {
  const existing = loadPersistedLedger();
  if (existing) return existing;
  const initial: PersistedLedgerState = {
    version: 1,
    updatedAt: Date.now(),
    isCustomized: false,
    portfolioId: portfolio?.id || '2bb80f7315764422a5347e8d38503f4e',
    trades: portfolio?.trades ? [...portfolio.trades] : [],
    cash: portfolio?.cash ? [...portfolio.cash] : [],
    dividends: portfolio?.dividends ? [...portfolio.dividends] : [],
    illiquid: portfolio?.illiquid ? [...portfolio.illiquid] : [],
    customMeta: {},
  };
  savePersistedLedger(initial);
  return initial;
}

export function parseCsvTransactionsClient(csvText: string): Trade[] {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const splitCsvRow = (row: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out.map((c) => c.replace(/^"|"$/g, '').trim());
  };

  const headers = splitCsvRow(lines[0]).map((h) => h.toLowerCase());
  const idxSym = headers.findIndex((h) => h.includes('symbol') || h.includes('ticker') || h.includes('activo'));
  const idxSide = headers.findIndex((h) => h.includes('side') || h.includes('type') || h.includes('tipo'));
  const idxQty = headers.findIndex((h) => h.includes('qty') || h.includes('quantity') || h.includes('cant'));
  const idxPrice = headers.findIndex((h) => h.includes('price') || h.includes('precio'));
  const idxComm = headers.findIndex((h) => h.includes('comm') || h.includes('fee') || h.includes('comis'));
  const idxTime = headers.findIndex((h) => h.includes('time') || h.includes('date') || h.includes('fecha'));

  const trades: Trade[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]);
    const symRaw = cols[idxSym >= 0 ? idxSym : 0] || '';
    if (!symRaw) continue;
    const symbol = normalizeTradingViewSymbol(symRaw);
    const sideRaw = (cols[idxSide >= 0 ? idxSide : 1] || 'BUY').toUpperCase();
    const isBuy = !sideRaw.includes('SELL') && !sideRaw.includes('VENTA');
    const qty = Number(cols[idxQty >= 0 ? idxQty : 2]);
    const price = Number(cols[idxPrice >= 0 ? idxPrice : 3]);
    const commission = idxComm >= 0 ? Number(cols[idxComm] || 0) : 0;
    const timeStr = idxTime >= 0 ? cols[idxTime] : '';
    let parsedTime = Date.now();
    if (timeStr) {
      if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(timeStr)) {
        const [dd, mm, yyyy] = timeStr.split(/[/-]/);
        parsedTime = Date.parse(`${yyyy}-${mm}-${dd}T14:30:00Z`);
      } else {
        parsedTime = Date.parse(timeStr);
      }
    }
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;

    trades.push({
      id: 'csv_' + Date.now() + '_' + i,
      time: Number.isFinite(parsedTime) ? parsedTime : Date.now(),
      symbol,
      isBuy,
      qty,
      price,
      commission: Number.isFinite(commission) && commission >= 0 ? commission : 0,
      comment: 'Importado vía CSV',
    });
  }
  return trades;
}

export const api = {
  async getFx(): Promise<{ USD: number; ARS: number; EUR: number }> {
    try {
      const r = await fetch('/api/fx');
      if (r.ok) return await r.json();
    } catch {}
    return { USD: 1, ARS: 1185, EUR: 0.92 };
  },
  async getArgFx(): Promise<ArgFxResponse> {
    try {
      const r = await fetch('/api/fx/ar');
      if (r.ok) return await r.json();
    } catch {}
    return {
      cclRate: 1637.9,
      mepRate: 1553.6,
      ccl: { compra: 1637.9, venta: 1639.5 },
      mep: { compra: 1546.9, venta: 1553.6 },
      source: 'fallback',
      fetchedAt: Date.now(),
    };
  },
  async evaluatePortfolio(
    id = '2bb80f7315764422a5347e8d38503f4e',
    benchmark = 'SP:SPX',
    mode: 'live' | 'tv_snapshot' = 'live'
  ): Promise<PortfolioEvaluationResponse> {
    const r = await fetch(
      `/api/portfolios/${encodeURIComponent(id)}/evaluate?benchmark=${encodeURIComponent(
        benchmark
      )}&mode=${mode}`
    );
    const serverEval: PortfolioEvaluationResponse = await r.json();
    const persisted = loadPersistedLedger();

    // Collect ALL symbols that need pricing (server + persisted trades)
    const allSymbols = new Set<string>();
    for (const h of serverEval.holdings || []) allSymbols.add(h.symbol);
    if (persisted) {
      for (const t of persisted.trades) allSymbols.add(normalizeTradingViewSymbol(t.symbol));
    }

    // Always fetch live crypto prices client-side (server may be blocked by Binance on Vercel)
    const liveCrypto = await fetchLiveCryptoQuotes([...allSymbols]);

    if (!persisted) {
      savePersistedLedger({
        version: 1,
        updatedAt: Date.now(),
        isCustomized: false,
        portfolioId: serverEval.portfolio.id,
        trades: serverEval.portfolio.trades || [],
        cash: serverEval.portfolio.cash || [],
        dividends: serverEval.portfolio.dividends || [],
        illiquid: serverEval.portfolio.illiquid || [],
        customMeta: {},
      });
      return patchCryptoInEvaluation(serverEval, liveCrypto);
    }

    // Check if serverless instance cold-started and lost user mutations
    if (persisted.isCustomized) {
      const serverTradeCount = serverEval.portfolio?.trades?.length ?? 0;
      const serverCashCount = serverEval.portfolio?.cash?.length ?? 0;
      const serverDivCount = serverEval.portfolio?.dividends?.length ?? 0;
      const serverIlliqCount = serverEval.portfolio?.illiquid?.length ?? 0;

      const isDesynced =
        serverTradeCount !== persisted.trades.length ||
        serverCashCount !== persisted.cash.length ||
        serverDivCount !== persisted.dividends.length ||
        serverIlliqCount !== persisted.illiquid.length;

      if (isDesynced) {
        const recomputed = recomputeEvaluationWithPersistedLedger(serverEval, persisted, liveCrypto);
        return patchCryptoInEvaluation(recomputed, liveCrypto);
      }
    }

    return patchCryptoInEvaluation(serverEval, liveCrypto);
  },
  async getMarketOverview(): Promise<MarketOverviewResponse> {
    const r = await fetch('/api/market');
    return r.json();
  },
  async getAssetDetail(symbol: string, range = '1Y'): Promise<AssetDetailResponse> {
    const normSym = normalizeTradingViewSymbol(symbol);
    const r = await fetch(
      `/api/asset/${encodeURIComponent(normSym)}?range=${encodeURIComponent(range)}`
    );
    return r.json();
  },
  async runProjection(params: Record<string, any>): Promise<ProjectionResult> {
    const r = await fetch('/api/projection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return r.json();
  },
  async addTrade(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const normSymbol = normalizeTradingViewSymbol(String(payload.symbol || 'NASDAQ:NVDA'));
    const cat = findCatalogEntry(normSymbol);
    const enrichedPayload: Record<string, any> = {
      ...payload,
      symbol: normSymbol,
      name: payload.name || cat?.name,
      sector: payload.sector || cat?.sector,
      assetType: payload.assetType || cat?.type,
    };

    const state = ensureLocalLedgerInitialized();
    const tx: Trade = {
      id: enrichedPayload.id || Date.now() + Math.floor(Math.random() * 10000),
      time: enrichedPayload.time ? Number(enrichedPayload.time) : Date.now(),
      symbol: normSymbol,
      isBuy:
        enrichedPayload.isBuy !== undefined
          ? Boolean(enrichedPayload.isBuy)
          : String(enrichedPayload.side || 'BUY').toUpperCase() !== 'SELL',
      qty: Math.max(0.000001, Number(enrichedPayload.qty || 1)),
      price: Math.max(0.0001, Number(enrichedPayload.price || cat?.refPrice || 100)),
      commission: Math.max(0, Number(enrichedPayload.commission || 0)),
      comment: enrichedPayload.comment || '',
    };

    let resJson: any = { ok: true, added: [tx] };
    try {
      const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...enrichedPayload, id: tx.id, time: tx.time }),
      });
      if (r.ok) {
        resJson = await r.json();
      }
    } catch {
      // Fallback to local ledger persistence
    }

    const addedTx = resJson?.added?.[0] || tx;
    state.trades = [...state.trades.filter((t) => String(t.id) !== String(addedTx.id)), addedTx].sort(
      (a, b) => b.time - a.time
    );
    state.isCustomized = true;
    savePersistedLedger(state);
    return { ...resJson, ok: true, added: [addedTx], totalTrades: state.trades.length };
  },
  async deleteTrade(portfolioId: string, txId: string | number): Promise<any> {
    const state = ensureLocalLedgerInitialized();
    state.trades = state.trades.filter((t) => String(t.id) !== String(txId));
    state.isCustomized = true;
    savePersistedLedger(state);

    try {
      const r = await fetch(
        `/api/portfolios/${encodeURIComponent(portfolioId)}/trades/${encodeURIComponent(
          String(txId)
        )}`,
        { method: 'DELETE' }
      );
      if (r.ok) return await r.json();
    } catch {}
    return { ok: true, totalTrades: state.trades.length };
  },
  async addCash(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const state = ensureLocalLedgerInitialized();
    const tx: CashTx = {
      id: payload.id || 'cash_' + Date.now(),
      time: payload.time ? Number(payload.time) : Date.now(),
      type: payload.type || 'deposit',
      amount: Math.max(0, Number(payload.amount || 0)),
      currency: payload.currency || 'USD',
      comment: payload.comment || '',
    };

    let resJson: any = { ok: true, tx };
    try {
      const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/cash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      if (r.ok) resJson = await r.json();
    } catch {}

    const savedTx = resJson?.tx || tx;
    state.cash = [...state.cash, savedTx];
    state.isCustomized = true;
    savePersistedLedger(state);
    return { ...resJson, ok: true, tx: savedTx, cashCount: state.cash.length };
  },
  async addDividend(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const state = ensureLocalLedgerInitialized();
    const normSymbol = normalizeTradingViewSymbol(String(payload.symbol || 'NASDAQ:MSFT'));
    const tx: DividendTx = {
      id: payload.id || 'div_' + Date.now(),
      time: payload.time ? Number(payload.time) : Date.now(),
      symbol: normSymbol,
      amount: Math.max(0, Number(payload.amount || 0)),
      tax: Math.max(0, Number(payload.tax || 0)),
      comment: payload.comment || '',
    };

    let resJson: any = { ok: true, tx };
    try {
      const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/dividends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx),
      });
      if (r.ok) resJson = await r.json();
    } catch {}

    const savedTx = resJson?.tx || tx;
    state.dividends = [...state.dividends, savedTx];
    state.isCustomized = true;
    savePersistedLedger(state);
    return { ...resJson, ok: true, tx: savedTx };
  },
  async addIlliquid(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const state = ensureLocalLedgerInitialized();
    const asset: IlliquidAsset = {
      id: payload.id || 'illiq_' + Date.now(),
      name: String(payload.name || 'Inmueble / Bono Privado'),
      category: payload.category || 'Real estate',
      costBasis: Math.max(0, Number(payload.costBasis ?? payload.currentValue ?? 0)),
      currentValue: Math.max(0, Number(payload.currentValue || 0)),
      currency: payload.currency || 'USD',
      annualYieldPct: Number(payload.annualYieldPct ?? 7.5),
      acquiredAt: payload.acquiredAt ? Number(payload.acquiredAt) : Date.now(),
      notes: payload.notes || '',
    };

    let resJson: any = { ok: true, asset };
    try {
      const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/illiquid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asset),
      });
      if (r.ok) resJson = await r.json();
    } catch {}

    const savedAsset = resJson?.asset || asset;
    state.illiquid = [...state.illiquid, savedAsset];
    state.isCustomized = true;
    savePersistedLedger(state);
    return { ...resJson, ok: true, asset: savedAsset, illiquidCount: state.illiquid.length };
  },
  async deleteIlliquid(portfolioId: string, assetId: string): Promise<any> {
    const state = ensureLocalLedgerInitialized();
    state.illiquid = state.illiquid.filter((a) => a.id !== assetId);
    state.isCustomized = true;
    savePersistedLedger(state);

    try {
      const r = await fetch(
        `/api/portfolios/${encodeURIComponent(portfolioId)}/illiquid/${encodeURIComponent(
          assetId
        )}`,
        { method: 'DELETE' }
      );
      if (r.ok) return await r.json();
    } catch {}
    return { ok: true, illiquidCount: state.illiquid.length };
  },
  async importCsv(portfolioId: string, csv: string): Promise<any> {
    const state = ensureLocalLedgerInitialized();
    const parsedTrades = parseCsvTransactionsClient(csv);

    // Build normalized CSV string for backend
    const normalizedLines = [
      'Symbol,Side,Qty,Fill Price,Commission,Closing Time',
      ...parsedTrades.map(
        (t) =>
          `${t.symbol},${t.isBuy ? 'BUY' : 'SELL'},${t.qty},${t.price},${t.commission},${new Date(
            t.time
          ).toISOString()}`
      ),
    ].join('\n');

    let resJson: any = null;
    try {
      const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: parsedTrades.length > 0 ? normalizedLines : csv }),
      });
      if (r.ok) resJson = await r.json();
    } catch {}

    if (parsedTrades.length > 0) {
      state.trades = [...state.trades, ...parsedTrades].sort((a, b) => b.time - a.time);
      state.isCustomized = true;
      savePersistedLedger(state);
    }

    return {
      ok: true,
      imported: resJson?.imported ?? parsedTrades.length,
      totalTrades: state.trades.length,
    };
  },
  async resetSeed(portfolioId: string): Promise<any> {
    clearPersistedLedger();
    try {
      const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/reset`, {
        method: 'POST',
      });
      if (r.ok) return await r.json();
    } catch {}
    return { ok: true };
  },
  async search(q: string): Promise<any[]> {
    const localResults = searchLocalCatalog(q, {}, new Set(), 'ALL', 20);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        const remote = await r.json();
        if (Array.isArray(remote) && remote.length > 0) {
          const seen = new Set(remote.map((item: any) => item.symbol));
          for (const loc of localResults) {
            if (!seen.has(loc.symbol)) {
              seen.add(loc.symbol);
              remote.push(loc);
            }
          }
          return remote.slice(0, 25);
        }
      }
    } catch {
      // Fallback to instant local catalog
    }
    return localResults;
  },
};
