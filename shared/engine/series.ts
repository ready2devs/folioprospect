import type {
  DailyPoint,
  MonthlyComparison,
  PeriodPerformance,
  Portfolio,
  QuoteData,
} from './types.js';
import { cleanTicker, tvToYahooSymbol } from './format.js';

export type PriceHistoryMap = Record<string, [number, number][]>; // symbol -> [unixSec, close][]

function toDateStr(secOrMs: number): string {
  const ms = secOrMs > 1e11 ? secOrMs : secOrMs * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export interface SeriesBuildResult {
  daily: DailyPoint[];
  monthly: MonthlyComparison[];
  periods: PeriodPerformance;
  twrAllPct: number;
  annualizedYieldPct: number;
  dailyReturns: number[];
}

export function buildPortfolioSeries(
  portfolio: Portfolio,
  historyMap: PriceHistoryMap,
  liveQuotes: Record<string, QuoteData> = {},
  benchmarkSymbol: string = portfolio.benchmark || 'SP:SPX'
): SeriesBuildResult {
  const trades = [...portfolio.trades].sort((a, b) => a.time - b.time);

  // Dynamically adjust startDate: use the earlier of portfolio.startPoint and the earliest trade
  const earliestTradeTime = trades.length > 0 ? trades[0].time : Date.now();
  const portfolioStart = portfolio.startPoint || earliestTradeTime;
  const effectiveStart = Math.min(portfolioStart, earliestTradeTime);
  const startDate = toDateStr(effectiveStart);

  // Build a map of each symbol's first known trade price for back-fill
  const firstTradePriceMap: Record<string, { date: string; price: number }> = {};
  for (const tr of trades) {
    if (!firstTradePriceMap[tr.symbol] && tr.price > 0) {
      firstTradePriceMap[tr.symbol] = { date: toDateStr(tr.time), price: tr.price };
    }
  }

  // Collect all calendar trading dates from non-crypto symbols (or all symbols if only crypto)
  const dateSet = new Set<string>();
  const nonCryptoEntries = Object.entries(historyMap).filter(([k]) => !k.startsWith('BINANCE:'));
  const sourceForDates = nonCryptoEntries.length > 0 ? nonCryptoEntries : Object.entries(historyMap);
  for (const [, arr] of sourceForDates) {
    for (const [t] of arr) {
      dateSet.add(toDateStr(t));
    }
  }

  // Also inject trade dates that may predate the history map
  for (const tr of trades) {
    dateSet.add(toDateStr(tr.time));
  }

  const allSortedDates = Array.from(dateSet).sort();
  const activeDates = allSortedDates.filter((d) => d >= startDate);
  if (activeDates.length === 0) {
    activeDates.push(toDateStr(Date.now()));
  }

  // Forward-filled price table per symbol, with back-fill from first trade price
  const symbols = Array.from(new Set([...trades.map((t) => t.symbol), benchmarkSymbol]));
  const pxTable: Record<string, Record<string, number>> = {};

  for (const sym of symbols) {
    const raw =
      historyMap[sym] ||
      historyMap[cleanTicker(sym)] ||
      historyMap[tvToYahooSymbol(sym)] ||
      [];
    const byDay: Record<string, number> = {};
    for (const [t, c] of raw) {
      if (c != null && Number.isFinite(c)) {
        byDay[toDateStr(t)] = c;
      }
    }

    // Back-fill: if the first trade date for this symbol precedes the earliest history data,
    // use the trade's fill price for all dates from the trade date to the first history point
    const tradeInfo = firstTradePriceMap[sym];
    if (tradeInfo && tradeInfo.price > 0) {
      const firstHistDate = Object.keys(byDay).sort()[0];
      if (!firstHistDate || tradeInfo.date < firstHistDate) {
        // Fill from trade date to (firstHistDate - 1) or today with trade price
        for (const d of allSortedDates) {
          if (d >= tradeInfo.date && (!firstHistDate || d < firstHistDate)) {
            byDay[d] = tradeInfo.price;
          }
        }
      }
    }

    let lastKnown: number | null = null;
    pxTable[sym] = {};
    for (const d of allSortedDates) {
      if (byDay[d] != null) lastKnown = byDay[d];
      if (lastKnown != null) pxTable[sym][d] = lastKnown;
    }
    // Override last date with live quote if present
    const q = liveQuotes[sym] || liveQuotes[cleanTicker(sym)] || liveQuotes[tvToYahooSymbol(sym)];
    if (q?.price && activeDates.length > 0) {
      pxTable[sym][activeDates[activeDates.length - 1]] = q.price;
    }
  }

  const qtyMap: Record<string, number> = {};
  const investedMap: Record<string, number> = {};
  let cashBalance = 0;
  let ti = 0;

  const cashEvents = [...(portfolio.cash || [])].sort((a, b) => a.time - b.time);
  let ci = 0;
  const divEvents = [...(portfolio.dividends || [])].sort((a, b) => a.time - b.time);
  let di = 0;

  const illiquidTotal = (portfolio.illiquid || []).reduce(
    (s, a) => s + (a.currentValue || 0),
    0
  );

  const daily: DailyPoint[] = [];
  const dailyReturns: number[] = [];
  let prevHoldingsVal = 0;
  let cumTwrFactor = 1.0;

  const benchFirst =
    pxTable[benchmarkSymbol]?.[activeDates[0]] ||
    Object.values(pxTable[benchmarkSymbol] || {})[0] ||
    1;

  for (const d of activeDates) {
    let dayTradeFlow = 0; // positive = net capital added to holdings

    while (ti < trades.length && toDateStr(trades[ti].time) <= d) {
      const tr = trades[ti++];
      const isBinanceUsdt = tr.symbol.startsWith('BINANCE:') && tr.symbol.endsWith('USDT');
      const fx = tr.fxRate ?? (isBinanceUsdt ? 1.0001 : 1.0);
      const gross = tr.qty * tr.price * fx;
      const comm = tr.commission || 0;
      if (tr.isBuy) {
        qtyMap[tr.symbol] = (qtyMap[tr.symbol] || 0) + tr.qty;
        investedMap[tr.symbol] = (investedMap[tr.symbol] || 0) + gross;
        cashBalance -= gross + comm;
        dayTradeFlow += gross;
      } else {
        const curQty = qtyMap[tr.symbol] || 0;
        const avg = curQty > 1e-9 ? (investedMap[tr.symbol] || 0) / curQty : 0;
        investedMap[tr.symbol] = Math.max(0, (investedMap[tr.symbol] || 0) - avg * tr.qty);
        qtyMap[tr.symbol] = Math.max(0, curQty - tr.qty);
        cashBalance += gross - comm;
        dayTradeFlow -= gross;
      }
    }

    while (ci < cashEvents.length && toDateStr(cashEvents[ci].time) <= d) {
      const ce = cashEvents[ci++];
      if (ce.type === 'deposit' || ce.type === 'income') cashBalance += ce.amount;
      else cashBalance -= ce.amount;
    }

    while (di < divEvents.length && toDateStr(divEvents[di].time) <= d) {
      const dv = divEvents[di++];
      cashBalance += dv.amount - (dv.tax || 0);
    }

    let holdingsValue = 0;
    for (const [sym, q] of Object.entries(qtyMap)) {
      if (q > 1e-8) {
        const px = pxTable[sym]?.[d] ?? 0;
        holdingsValue += q * px;
      }
    }

    const denom = prevHoldingsVal + Math.max(0, dayTradeFlow);
    const dayGain = holdingsValue - prevHoldingsVal - dayTradeFlow;
    const dayRet = denom > 0 ? dayGain / denom : 0;
    dailyReturns.push(dayRet);
    cumTwrFactor *= 1 + dayRet;
    prevHoldingsVal = holdingsValue;

    const investedCapital = Object.values(investedMap).reduce((s, x) => s + x, 0);
    const benchPx = pxTable[benchmarkSymbol]?.[d] ?? benchFirst;
    const benchmarkPct = benchFirst > 0 ? ((benchPx - benchFirst) / benchFirst) * 100 : 0;

    daily.push({
      date: d,
      time: Date.parse(d + 'T00:00:00Z'),
      holdingsValue,
      cashBalance,
      illiquidValue: illiquidTotal,
      portfolioValue: holdingsValue + cashBalance + illiquidTotal,
      grossValue: holdingsValue + Math.max(0, cashBalance) + illiquidTotal,
      investedCapital,
      netFlow: dayTradeFlow,
      cumReturnPct: (cumTwrFactor - 1) * 100,
      benchmarkPct,
    });
  }

  // Monthly Modified Dietz (exact TradingView calendar-month buckets)
  const monthKeys = Array.from(new Set(daily.map((p) => p.date.slice(0, 7)))).sort();
  const monthly: MonthlyComparison[] = [];

  for (let i = 0; i < monthKeys.length; i++) {
    const m = monthKeys[i];
    const seg = daily.filter((p) => p.date.slice(0, 7) === m);
    const prevPoints = daily.filter((p) => p.date.slice(0, 7) < m);
    const prevPt = prevPoints.length > 0 ? prevPoints[prevPoints.length - 1] : null;
    const V0 = prevPt ? prevPt.holdingsValue : 0;
    const T = seg.length || 1;
    let F = 0;
    let W = 0;
    seg.forEach((pt, k) => {
      F += pt.netFlow;
      W += pt.netFlow * ((T - k) / T);
    });
    const V1 = seg[seg.length - 1].holdingsValue;
    const userGain = V1 - V0 - F;
    const denom = V0 + W;
    const userReturnPct = denom > 0 ? (userGain / denom) * 100 : 0;

    // Benchmark monthly return
    const b0 = prevPt
      ? pxTable[benchmarkSymbol]?.[prevPt.date] ?? benchFirst
      : pxTable[benchmarkSymbol]?.[seg[0].date] ?? benchFirst;
    const b1 = pxTable[benchmarkSymbol]?.[seg[seg.length - 1].date] ?? b0;
    const benchChange = b1 - b0;
    const benchReturnPct = b0 > 0 ? ((b1 - b0) / b0) * 100 : 0;

    monthly.push({
      month: m,
      timestamp: Math.floor(Date.parse(seg[0].date + 'T00:00:00Z') / 1000),
      userGain,
      userReturnPct,
      benchChange,
      benchReturnPct,
    });
  }

  const chainMonths = (slice: MonthlyComparison[]) => {
    let uFactor = 1;
    let bFactor = 1;
    let gain = 0;
    for (const m of slice) {
      uFactor *= 1 + m.userReturnPct / 100;
      bFactor *= 1 + m.benchReturnPct / 100;
      gain += m.userGain;
    }
    return {
      gain,
      pct: (uFactor - 1) * 100,
      benchPct: (bFactor - 1) * 100,
    };
  };

  const currentYear = activeDates[activeDates.length - 1].slice(0, 4);
  const periods: PeriodPerformance = {
    '1M': chainMonths(monthly.slice(-1)),
    '3M': chainMonths(monthly.slice(-3)),
    '6M': chainMonths(monthly.slice(-6)),
    YTD: chainMonths(monthly.filter((m) => m.month.startsWith(currentYear))),
    '1Y': chainMonths(monthly.slice(-12)),
    ALL: chainMonths(monthly),
  };

  const twrAllPct = periods.ALL.pct;
  const lastMs = daily[daily.length - 1]?.time ?? Date.now();
  const startMs = portfolio.startPoint || daily[0]?.time || lastMs;
  const elapsedDays = Math.max(1, (lastMs - startMs) / 86400000);
  const annualizedYieldPct =
    1 + twrAllPct / 100 > 0
      ? (Math.pow(1 + twrAllPct / 100, 365 / elapsedDays) - 1) * 100
      : 0;

  return {
    daily,
    monthly,
    periods,
    twrAllPct,
    annualizedYieldPct,
    dailyReturns,
  };
}
