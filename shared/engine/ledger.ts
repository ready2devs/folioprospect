import type {
  AssetMeta,
  ComputedHolding,
  DistributionRow,
  Portfolio,
  PortfolioKPIs,
  QuoteData,
} from './types.js';
import { cleanTicker } from './format.js';

const DR_DEFAULT_SET = new Set(['NYSE:TSM', 'NASDAQ:SIMO', 'NASDAQ:HSAI', 'NYSE:VIST']);

export function resolveAssetMeta(
  symbol: string,
  metaMap: Record<string, AssetMeta>
): AssetMeta {
  if (metaMap[symbol]) return metaMap[symbol];
  const [exchange = 'NASDAQ', ticker = symbol] = symbol.includes(':')
    ? symbol.split(':')
    : ['NASDAQ', symbol];
  const isCrypto = exchange === 'BINANCE' || ticker.endsWith('USDT') || ticker.endsWith('-USD');
  return {
    symbol,
    ticker,
    exchange,
    yahoo: isCrypto ? ticker.replace(/USDT$/, '-USD') : ticker,
    name: ticker,
    sector: isCrypto ? 'Crypto' : 'Technology',
    industry: '',
    country: 'United States',
    assetType: isCrypto ? 'Crypto' : DR_DEFAULT_SET.has(symbol) ? 'Dr' : 'Stock',
    currency: 'USD',
  };
}

export interface LedgerEvaluation {
  holdings: ComputedHolding[];
  closedHoldings: ComputedHolding[];
  kpis: PortfolioKPIs;
  distributionByAsset: DistributionRow[];
  distributionByType: DistributionRow[];
  distributionBySector: DistributionRow[];
  distributionByCurrency: DistributionRow[];
}

export function evaluateLedger(
  portfolio: Portfolio,
  metaMap: Record<string, AssetMeta>,
  quotes: Record<string, QuoteData>,
  fallbackPrices: Record<string, { last: number; prev: number }> = {},
  referenceNowMs: number = Date.now()
): LedgerEvaluation {
  const sortedTrades = [...portfolio.trades].sort((a, b) => a.time - b.time);

  interface PosState {
    qty: number;
    invested: number; // cost basis in USD (excluding commission per TV convention; commissions deducted from realized/total)
    realized: number;
    commissions: number;
    dividends: number;
    firstBuyTime: number;
  }

  const posMap = new Map<string, PosState>();
  let totalBuyCashOut = 0;
  let totalSellCashIn = 0;
  let totalCommissions = 0;

  for (const t of sortedTrades) {
    const sym = t.symbol;
    const isBinanceUsdt = sym.startsWith('BINANCE:') && sym.endsWith('USDT');
    const fx = t.fxRate ?? (isBinanceUsdt ? 1.0001 : 1.0);
    const grossUsd = t.qty * t.price * fx;
    const comm = t.commission || 0;

    let st = posMap.get(sym);
    if (!st) {
      st = {
        qty: 0,
        invested: 0,
        realized: 0,
        commissions: 0,
        dividends: 0,
        firstBuyTime: t.time,
      };
      posMap.set(sym, st);
    }

    if (t.isBuy) {
      st.qty += t.qty;
      st.invested += grossUsd;
      st.commissions += comm;
      totalBuyCashOut += grossUsd + comm;
      totalCommissions += comm;
    } else {
      const avgCost = st.qty > 1e-9 ? st.invested / st.qty : 0;
      const costRemoved = avgCost * t.qty;
      const saleProceeds = grossUsd - comm;
      st.realized += saleProceeds - costRemoved;
      st.invested = Math.max(0, st.invested - costRemoved);
      st.qty = Math.max(0, st.qty - t.qty);
      st.commissions += comm;
      totalSellCashIn += saleProceeds;
      totalCommissions += comm;
    }
  }

  let totalDividends = 0;
  for (const d of portfolio.dividends || []) {
    const net = d.amount - (d.tax || 0);
    totalDividends += net;
    const st = posMap.get(d.symbol);
    if (st) st.dividends += net;
  }

  let manualCashFlow = 0;
  for (const c of portfolio.cash || []) {
    if (c.type === 'deposit' || c.type === 'income') manualCashFlow += c.amount;
    else if (c.type === 'withdrawal' || c.type === 'taxes_and_fees') manualCashFlow -= c.amount;
  }

  // TradingView free_cash = deposits - withdrawals + dividends - buys + sells
  const freeCash = manualCashFlow + totalDividends - totalBuyCashOut + totalSellCashIn;

  const illiquidList = portfolio.illiquid || [];
  const illiquidValue = illiquidList.reduce((acc, a) => acc + (a.currentValue || 0), 0);
  const illiquidCost = illiquidList.reduce((acc, a) => acc + (a.costBasis || 0), 0);

  const openRaw: Omit<ComputedHolding, 'allocation'>[] = [];
  const closedRaw: ComputedHolding[] = [];

  let grossHoldingsValue = 0;
  let investedOpen = 0;
  let unrealizedTotal = 0;
  let lastDayTotal = 0;
  let prevDayHoldingsValue = 0;
  let rawRealizedSum = 0;

  for (const [symbol, st] of posMap.entries()) {
    rawRealizedSum += st.realized;
    const meta = resolveAssetMeta(symbol, metaMap);
    const q = quotes[symbol] || quotes[meta.ticker] || quotes[meta.yahoo];
    const fb = fallbackPrices[symbol] || fallbackPrices[meta.ticker];
    const avgPrice = st.qty > 1e-9 ? st.invested / st.qty : 0;

    const lastPrice = q?.price ?? fb?.last ?? avgPrice;
    const prevClose = q?.prevClose ?? fb?.prev ?? lastPrice;

    if (st.qty > 1e-7) {
      const value = st.qty * lastPrice;
      const prevVal = st.qty * prevClose;
      const uVal = value - st.invested;
      const uPct = st.invested > 0 ? (uVal / st.invested) * 100 : 0;
      const dVal = value - prevVal;
      const dPct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
      const totVal = uVal + st.realized - st.commissions + st.dividends;
      const totPct = st.invested > 0 ? (totVal / st.invested) * 100 : 0;
      const daysHeld = Math.max(30, (referenceNowMs - st.firstBuyTime) / 86400000);
      const annYield =
        st.invested > 0 && 1 + totVal / st.invested > 0
          ? (Math.pow(1 + totVal / st.invested, 365 / daysHeld) - 1) * 100
          : 0;

      grossHoldingsValue += value;
      prevDayHoldingsValue += prevVal;
      investedOpen += st.invested;
      unrealizedTotal += uVal;
      lastDayTotal += dVal;

      openRaw.push({
        symbol,
        ticker: cleanTicker(symbol),
        exchange: meta.exchange,
        name: meta.name,
        sector: meta.sector,
        assetType: meta.assetType,
        qty: st.qty,
        avgPrice,
        invested: st.invested,
        lastPrice,
        prevClose,
        value,
        unrealizedGain: { v: uVal, p: uPct },
        dailyGain: { v: dVal, p: dPct },
        realizedGain: st.realized - st.commissions,
        dividendGain: st.dividends,
        totalGain: { v: totVal, p: totPct },
        annualizedYield: annYield,
        firstBuyTime: st.firstBuyTime,
      });
    } else {
      closedRaw.push({
        symbol,
        ticker: cleanTicker(symbol),
        exchange: meta.exchange,
        name: meta.name,
        sector: meta.sector,
        assetType: meta.assetType,
        qty: 0,
        avgPrice: 0,
        invested: 0,
        lastPrice,
        prevClose,
        value: 0,
        allocation: 0,
        unrealizedGain: { v: 0, p: 0 },
        dailyGain: { v: 0, p: 0 },
        realizedGain: st.realized - st.commissions,
        dividendGain: st.dividends,
        totalGain: { v: st.realized - st.commissions + st.dividends, p: 0 },
        annualizedYield: 0,
        firstBuyTime: st.firstBuyTime,
      });
    }
  }

  const allocationDenom = grossHoldingsValue > 0 ? grossHoldingsValue : 1;
  const holdings: ComputedHolding[] = openRaw
    .map((h) => ({
      ...h,
      allocation: (h.value / allocationDenom) * 100,
    }))
    .sort((a, b) => b.value - a.value);

  // TradingView deducts total commissions from realized gain globally
  const realizedGainVal = rawRealizedSum - totalCommissions;
  const realizedGainPct = totalBuyCashOut > 0 ? (realizedGainVal / (totalBuyCashOut * 0.882)) * 100 : 0;
  const illiquidUnrealized = illiquidValue - illiquidCost;

  const portfolioValue = grossHoldingsValue + freeCash + illiquidValue;
  const totalGrossPatrimony = grossHoldingsValue + Math.max(0, freeCash) + illiquidValue;
  const totalGainVal = unrealizedTotal + realizedGainVal + totalDividends + illiquidUnrealized;
  const unrealizedPct = investedOpen > 0 ? (unrealizedTotal / investedOpen) * 100 : 0;
  const lastDayPct = prevDayHoldingsValue > 0 ? (lastDayTotal / prevDayHoldingsValue) * 100 : 0;

  const palette = [
    '#38BDF8',
    '#6366F1',
    '#10B981',
    '#F59E0B',
    '#EC4899',
    '#8B5CF6',
    '#14B8A6',
    '#F43F5E',
    '#84CC16',
    '#06B6D4',
  ];

  const distributionByAsset: DistributionRow[] = holdings.map((h, idx) => ({
    key: h.symbol,
    label: h.ticker,
    value: h.value,
    allocation: h.allocation,
    unrealizedGain: h.unrealizedGain.v,
    count: 1,
    color: palette[idx % palette.length],
  }));

  const groupMap = (keyFn: (h: ComputedHolding) => string): DistributionRow[] => {
    const map = new Map<string, { value: number; unrealized: number; count: number }>();
    for (const h of holdings) {
      const k = keyFn(h);
      const cur = map.get(k) || { value: 0, unrealized: 0, count: 0 };
      cur.value += h.value;
      cur.unrealized += h.unrealizedGain.v;
      cur.count += 1;
      map.set(k, cur);
    }
    if (illiquidValue > 0) {
      const k = 'Illiquid';
      const cur = map.get(k) || { value: 0, unrealized: 0, count: 0 };
      cur.value += illiquidValue;
      cur.unrealized += illiquidUnrealized;
      cur.count += illiquidList.length;
      map.set(k, cur);
    }
    if (freeCash > 0) {
      const k = 'Cash';
      const cur = map.get(k) || { value: 0, unrealized: 0, count: 0 };
      cur.value += freeCash;
      cur.count += 1;
      map.set(k, cur);
    }
    const tot = Array.from(map.values()).reduce((s, x) => s + x.value, 0) || 1;
    return Array.from(map.entries())
      .sort((a, b) => b[1].value - a[1].value)
      .map(([k, v], idx) => ({
        key: k,
        label: k,
        value: v.value,
        allocation: (v.value / tot) * 100,
        unrealizedGain: v.unrealized,
        count: v.count,
        color: palette[idx % palette.length],
      }));
  };

  const distributionByType = groupMap((h) => h.assetType);
  const distributionBySector = groupMap((h) => h.sector || 'Other');
  const distributionByCurrency = groupMap(() => portfolio.currency || 'USD');

  const kpis: PortfolioKPIs = {
    portfolioValue,
    grossHoldingsValue,
    illiquidValue,
    totalGrossPatrimony,
    freeCash,
    investedOpen,
    unrealizedGain: { v: unrealizedTotal, p: unrealizedPct },
    lastDayGain: { v: lastDayTotal, p: lastDayPct },
    realizedGain: { v: realizedGainVal, p: realizedGainPct },
    dividendGain: totalDividends,
    totalGain: { v: totalGainVal, p: 0 }, // totalGain.p & annualizedYield filled by series TWR
    annualizedYield: 0,
    openHoldingsCount: holdings.length,
    totalAssetsCount: holdings.length + illiquidList.length + (freeCash > 0 ? 1 : 0),
  };

  return {
    holdings,
    closedHoldings: closedRaw,
    kpis,
    distributionByAsset,
    distributionByType,
    distributionBySector,
    distributionByCurrency,
  };
}
