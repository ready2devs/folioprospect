import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateLedger,
  buildPortfolioSeries,
  computeRiskMetrics,
  computeFairValue,
  runPortfolioProjection,
} from '../index.js';
import type { Portfolio, AssetMeta, QuoteData } from '../types.js';

const seedRaw = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data/seed/tradingview_extract.json'), 'utf8')
);
const metaMap: Record<string, AssetMeta> = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data/seed/asset_meta.json'), 'utf8')
);
const histMap = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'data/seed/price_history_snapshot.json'), 'utf8')
);

function buildSeedPortfolio(): Portfolio {
  return {
    id: seedRaw.portfolioId,
    title: seedRaw.settings.title,
    currency: 'USD',
    benchmark: seedRaw.settings.benchmark,
    riskFreeRate: seedRaw.settings.risk_free_rate,
    startPoint: seedRaw.summary.data.start_point,
    trades: seedRaw.trades.map((t: any) => ({
      id: t.id,
      time: t.time,
      symbol: t.symbol,
      isBuy: t.is_buy,
      qty: t.qty,
      price: t.price,
      commission: t.commission,
      comment: t.comment || '',
    })),
    cash: [],
    dividends: [],
    splits: [],
    illiquid: [],
  };
}

describe('FolioProspect Financial Engine — TradingView REA Parity', () => {
  it('reconstructs all 20 open holdings, exact quantities, free_cash and realized gain from the 30 trades', () => {
    const portfolio = buildSeedPortfolio();
    const quotes: Record<string, QuoteData> = {};
    for (const h of seedRaw.holdings.opened) {
      const prevClose = h.last_price - h.daily_gain.v / h.qty;
      quotes[h.symbol] = {
        symbol: h.symbol,
        price: h.last_price,
        prevClose,
        change: h.last_price - prevClose,
        changePct: h.daily_gain.p,
        currency: 'USD',
      };
    }

    const res = evaluateLedger(portfolio, metaMap, quotes);
    expect(res.holdings.length).toBe(20);
    expect(res.kpis.openHoldingsCount).toBe(20);

    // Check free cash (-134,853.81 USD)
    expect(res.kpis.freeCash).toBeCloseTo(-134853.81, 1);

    // Check realized gain (+10,168.39 USD)
    expect(res.kpis.realizedGain.v).toBeCloseTo(10168.39, 1);

    // Check gross holdings value & net portfolio value (within USDT/USD intraday tick ~9 USD on 180.6k)
    expect(Math.abs(res.kpis.grossHoldingsValue - 180676.62)).toBeLessThan(12);
    expect(Math.abs(res.kpis.portfolioValue - 45822.81)).toBeLessThan(12);

    // Check distribution by Asset Type (Stock, Dr, Crypto)
    const byType = Object.fromEntries(res.distributionByType.map((d) => [d.key, d]));
    expect(byType.Stock.allocation).toBeCloseTo(73.85, 0);
    expect(byType.Dr.allocation).toBeCloseTo(17.54, 0);
    expect(byType.Crypto.allocation).toBeCloseTo(8.61, 0);
  });

  it('reconstructs historical series, monthly Modified Dietz returns and risk metrics', () => {
    const portfolio = buildSeedPortfolio();
    const series = buildPortfolioSeries(portfolio, histMap, {}, 'SP:SPX');
    expect(series.daily.length).toBeGreaterThan(250);
    expect(series.monthly.length).toBe(15);

    const apr26 = series.monthly.find((m) => m.month === '2026-04')!;
    expect(apr26.userReturnPct).toBeCloseTo(20.48, 1);

    const may26 = series.monthly.find((m) => m.month === '2026-05')!;
    expect(may26.userReturnPct).toBeCloseTo(10.65, 1);

    expect(series.twrAllPct).toBeGreaterThan(34);
    expect(series.twrAllPct).toBeLessThan(38);

    const risk = computeRiskMetrics(portfolio, series.monthly, series.daily, series.dailyReturns);
    expect(risk.beta).toBeGreaterThan(1.5);
    expect(risk.beta).toBeLessThan(2.1);
    expect(risk.sharpeRatio.user).toBeGreaterThan(0.25);
    expect(risk.sortinoRatio.user).toBeGreaterThan(0.65);
  });

  it('computes Morningstar-style Fair Value and 10/20Y Monte Carlo projections', () => {
    const fv = computeFairValue({
      symbol: 'NASDAQ:NVDA',
      currentPrice: 221.97,
      targetMeanPrice: 328.72,
      freeCashflow: 41.81e9,
      sharesOutstanding: 24.15e9,
      revenueGrowth: 0.35,
      grossMargins: 0.746,
      operatingMargins: 0.662,
      returnOnEquity: 1.17,
      forwardPE: 13.95,
      beta: 2.21,
    });
    expect(fv.fairValue).toBeGreaterThan(200);
    expect(fv.moat).toBe('Wide');

    const proj = runPortfolioProjection({
      horizonYears: 20,
      initialCapital: 180719.71,
      monthlyContribution: 1000,
      baseCagrPct: 12,
    });
    expect(proj.points.length).toBe(21);
    expect(proj.summary20Y.base).toBeGreaterThan(proj.summary10Y.base);
    expect(proj.summary20Y.mcP90).toBeGreaterThan(proj.summary20Y.mcP10);
  });
});
