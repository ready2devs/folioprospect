import { describe, it, expect } from 'vitest';
import {
  recomputeEvaluationWithPersistedLedger,
  type PortfolioEvaluationResponse,
  type PersistedLedgerState,
} from '../../../src/api';

/*
 * Regression test — Portfolio change / benchmark bug (2026-10-27):
 * When the persisted local ledger was customized and desynced from the
 * server, recomputeEvaluationWithPersistedLedger rebuilt the portfolio
 * series from a fabricated per-symbol history (linear interpolation from
 * average cost to current price, with NO benchmark history). Result:
 * benchmark flat at 0.00% and real (negative) period returns turned into
 * a smooth, positive line. The fix: keep the server series as-is.
 */

function makeServerEval(): PortfolioEvaluationResponse {
  const day = 86400000;
  const t0 = Date.parse('2026-07-21T00:00:00Z');
  const daily = [0, 30, 60, 91].map((offsetDays, i) => ({
    date: new Date(t0 + offsetDays * day).toISOString().slice(0, 10),
    time: t0 + offsetDays * day,
    holdingsValue: [100000, 104000, 102000, 98850][i],
    cashBalance: 0,
    illiquidValue: 0,
    portfolioValue: [100000, 104000, 102000, 98850][i],
    grossValue: [100000, 104000, 102000, 98850][i],
    investedCapital: 100000,
    netFlow: 0,
    // Real TWR: +10% at period start, ends at +8.85% — the last
    // stretch is negative when rebased (8.85/10 - 1 < 0 via periods below).
    cumReturnPct: [10, 14, 12, 8.85][i],
    // Real SPX benchmark movement — must never collapse to 0.
    benchmarkPct: [16, 18, 17, 19.3][i],
  }));
  return {
    portfolio: {
      id: 'p1',
      title: 'Personal largo plazo',
      description: '',
      currency: 'USD',
      benchmark: 'SP:SPX',
      riskFreeRate: 2,
      startPoint: t0,
      trades: [
        { id: 1, time: t0, symbol: 'NASDAQ:NVDA', isBuy: true, qty: 10, price: 100, commission: 0 },
      ],
      cash: [],
      dividends: [],
      splits: [],
      illiquid: [],
    } as any,
    quotes: {
      'NASDAQ:NVDA': { symbol: 'NASDAQ:NVDA', price: 110, prevClose: 108, change: 2, changePct: 1.85, currency: 'USD', marketState: 'closed' },
      'NASDAQ:MSFT': { symbol: 'NASDAQ:MSFT', price: 500, prevClose: 495, change: 5, changePct: 1.01, currency: 'USD', marketState: 'closed' },
    },
    kpis: {} as any,
    holdings: [
      {
        symbol: 'NASDAQ:NVDA', ticker: 'NVDA', name: 'NVIDIA', sector: 'Technology',
        assetType: 'Stock', exchange: 'NASDAQ', qty: 10, avgPrice: 100, lastPrice: 110,
        prevClose: 108, value: 1100, invested: 1000,
      },
    ] as any,
    closedHoldings: [],
    sparklines: {},
    distribution: { assets: [], assetTypes: [], sectors: [], currency: [] },
    series: {
      daily: daily as any,
      monthly: [] as any,
      periods: {
        '1M': { gain: -3150, pct: -3.09, benchPct: 2.3 },
        '3M': { gain: -1150, pct: -1.15, benchPct: 3.3 },
        '6M': { gain: 0, pct: 0, benchPct: 0 },
        YTD: { gain: 0, pct: 0, benchPct: 0 },
        '1Y': { gain: 0, pct: 0, benchPct: 0 },
        ALL: { gain: 8850, pct: 8.85, benchPct: 19.3 },
      } as any,
      benchmarkSymbol: 'SP:SPX',
    },
    risk: {} as any,
    movers: { gainers: [], losers: [] },
    calendar: { snapshotDate: '', earnings: [], dividends: [], news: [] },
    tvReference: null,
    defaultProjection: { points: [], summary10Y: {}, summary20Y: {} } as any,
    cached: false,
  };
}

function makePersistedCustomized(): PersistedLedgerState {
  const t0 = Date.parse('2026-07-21T00:00:00Z');
  return {
    version: 1,
    updatedAt: Date.now(),
    isCustomized: true, // <-- the trigger condition of the original bug
    portfolioId: 'p1',
    trades: [
      { id: 1, time: t0, symbol: 'NASDAQ:NVDA', isBuy: true, qty: 10, price: 100, commission: 0 },
      // Extra local trade the server does not have (desync).
      { id: 2, time: t0 + 86400000, symbol: 'NASDAQ:MSFT', isBuy: true, qty: 2, price: 480, commission: 0 },
    ] as any,
    cash: [],
    dividends: [],
    illiquid: [],
    customMeta: {},
  };
}

describe('recomputeEvaluationWithPersistedLedger – series preservation', () => {
  it('keeps the real server benchmark instead of flattening it to 0.00%', () => {
    const serverEval = makeServerEval();
    const result = recomputeEvaluationWithPersistedLedger(
      serverEval,
      makePersistedCustomized()
    );
    const last = result.series.daily[result.series.daily.length - 1];
    expect(last.benchmarkPct).toBeCloseTo(19.3, 6);
    expect(result.series.benchmarkSymbol).toBe('SP:SPX');
  });

  it('keeps the real (negative) period returns instead of an interpolated positive line', () => {
    const serverEval = makeServerEval();
    const result = recomputeEvaluationWithPersistedLedger(
      serverEval,
      makePersistedCustomized()
    );
    expect(result.series.daily).toEqual(serverEval.series.daily);
    expect(result.series.periods['1M'].pct).toBeLessThan(0);
    expect(result.series.periods['3M'].benchPct).toBeCloseTo(3.3, 6);
  });

  it('still reflects the customized local ledger in holdings', () => {
    const serverEval = makeServerEval();
    const result = recomputeEvaluationWithPersistedLedger(
      serverEval,
      makePersistedCustomized()
    );
    const symbols = result.holdings.map((h: any) => h.symbol);
    expect(symbols).toContain('NASDAQ:MSFT');
    expect(result.portfolio.trades).toHaveLength(2);
  });

  it('fills totalGain.p / annualizedYield from the preserved series TWR', () => {
    const serverEval = makeServerEval();
    const result = recomputeEvaluationWithPersistedLedger(
      serverEval,
      makePersistedCustomized()
    );
    expect(result.kpis.totalGain.p).toBeCloseTo(8.85, 6);
    expect(result.kpis.annualizedYield).toBeGreaterThan(0);
  });
});
