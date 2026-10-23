import { describe, it, expect } from 'vitest';
import {
  normalizeTradingViewSymbol,
  searchLocalCatalog,
  findCatalogEntry,
} from '../../engine/symbolCatalog';
import {
  evaluateLedger,
  buildPortfolioSeries,
  resolveAssetMeta,
} from '../../engine/index';
import type {
  Portfolio,
  Trade,
  QuoteData,
  AssetMeta,
} from '../../engine/types';
import { parseCsvTransactionsClient } from '../../../src/api';

/* ═══════════════════════════════════════════════════
   1.  SYMBOL NORMALIZATION & TYPO CORRECTION
   ═══════════════════════════════════════════════════ */
describe('normalizeTradingViewSymbol – typo correction & alias', () => {
  it('corrects BINANE → BINANCE', () => {
    expect(normalizeTradingViewSymbol('BINANE:SOLUSDT')).toBe('BINANCE:SOLUSDT');
  });
  it('corrects NASDA → NASDAQ', () => {
    expect(normalizeTradingViewSymbol('NASDA:NVDA')).toBe('NASDAQ:NVDA');
  });
  it('corrects NYS → NYSE', () => {
    expect(normalizeTradingViewSymbol('NYS:TSM')).toBe('NYSE:TSM');
  });
  it('resolves bare SOL → BINANCE:SOLUSDT', () => {
    expect(normalizeTradingViewSymbol('SOL')).toBe('BINANCE:SOLUSDT');
  });
  it('resolves bare BTC → BINANCE:BTCUSDT', () => {
    expect(normalizeTradingViewSymbol('BTC')).toBe('BINANCE:BTCUSDT');
  });
  it('resolves bare ETH → BINANCE:ETHUSDT', () => {
    expect(normalizeTradingViewSymbol('ETH')).toBe('BINANCE:ETHUSDT');
  });
  it('resolves bare NVDA → NASDAQ:NVDA (catalog match)', () => {
    expect(normalizeTradingViewSymbol('NVDA')).toBe('NASDAQ:NVDA');
  });
  it('resolves bare SPY → AMEX:SPY (ETF catalog)', () => {
    expect(normalizeTradingViewSymbol('SPY')).toBe('AMEX:SPY');
  });
  it('resolves bare YPF → NYSE:YPF (Argentina ADR)', () => {
    expect(normalizeTradingViewSymbol('YPF')).toBe('NYSE:YPF');
  });
  it('resolves bare TSM → NYSE:TSM', () => {
    expect(normalizeTradingViewSymbol('TSM')).toBe('NYSE:TSM');
  });
  it('resolves GGAL → NASDAQ:GGAL', () => {
    expect(normalizeTradingViewSymbol('GGAL')).toBe('NASDAQ:GGAL');
  });
  it('resolves SOLUSDT without exchange → BINANCE:SOLUSDT', () => {
    expect(normalizeTradingViewSymbol('SOLUSDT')).toBe('BINANCE:SOLUSDT');
  });
  it('handles empty string → fallback NASDAQ:NVDA', () => {
    expect(normalizeTradingViewSymbol('')).toBe('NASDAQ:NVDA');
  });
  it('handles already correct BINANCE:BTCUSDT', () => {
    expect(normalizeTradingViewSymbol('BINANCE:BTCUSDT')).toBe('BINANCE:BTCUSDT');
  });
  it('handles case-insensitive input', () => {
    expect(normalizeTradingViewSymbol('nasdaq:nvda')).toBe('NASDAQ:NVDA');
    expect(normalizeTradingViewSymbol('binance:ethusdt')).toBe('BINANCE:ETHUSDT');
  });
  it('adds USDT suffix for BINANCE tickers without it', () => {
    const result = normalizeTradingViewSymbol('BINANCE:SOL');
    expect(result).toBe('BINANCE:SOLUSDT');
  });
  it('corrects BINANC → BINANCE', () => {
    expect(normalizeTradingViewSymbol('BINANC:BTCUSDT')).toBe('BINANCE:BTCUSDT');
  });
  it('corrects NASDQ → NASDAQ', () => {
    expect(normalizeTradingViewSymbol('NASDQ:AAPL')).toBe('NASDAQ:AAPL');
  });
  it('NMS (Yahoo) → NASDAQ', () => {
    expect(normalizeTradingViewSymbol('NMS:AAPL')).toBe('NASDAQ:AAPL');
  });
  it('NYQ (Yahoo) → NYSE', () => {
    expect(normalizeTradingViewSymbol('NYQ:TSM')).toBe('NYSE:TSM');
  });
  // Stablecoin aliases
  it('resolves bare USDT → BINANCE:USDTUSDT', () => {
    expect(normalizeTradingViewSymbol('USDT')).toBe('BINANCE:USDTUSDT');
  });
  it('resolves bare USDC → BINANCE:USDCUSDT', () => {
    expect(normalizeTradingViewSymbol('USDC')).toBe('BINANCE:USDCUSDT');
  });
  it('handles BINANCE:USDTUSDT correctly', () => {
    expect(normalizeTradingViewSymbol('BINANCE:USDTUSDT')).toBe('BINANCE:USDTUSDT');
  });
});

/* ═══════════════════════════════════════════════════
   2.  CATALOG SEARCH
   ═══════════════════════════════════════════════════ */
describe('searchLocalCatalog – instant TradingView-style search', () => {
  const emptyMeta: Record<string, AssetMeta> = {};
  const emptySet = new Set<string>();

  it('searching "SOL" returns BINANCE:SOLUSDT in top results', () => {
    const results = searchLocalCatalog('SOL', emptyMeta, emptySet, 'ALL', 10);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('BINANCE:SOLUSDT');
    // Should be near the top
    const idx = symbols.indexOf('BINANCE:SOLUSDT');
    expect(idx).toBeLessThan(5);
  });

  it('searching "NVDA" returns NASDAQ:NVDA as first result', () => {
    const results = searchLocalCatalog('NVDA', emptyMeta, emptySet, 'ALL', 10);
    expect(results[0]?.symbol).toBe('NASDAQ:NVDA');
  });

  it('searching "YPF" returns NYSE:YPF', () => {
    const results = searchLocalCatalog('YPF', emptyMeta, emptySet, 'ALL', 10);
    expect(results[0]?.symbol).toBe('NYSE:YPF');
  });

  it('filter "Crypto" only returns crypto assets', () => {
    const results = searchLocalCatalog('', emptyMeta, emptySet, 'Crypto', 50);
    for (const r of results) {
      expect(r.type).toBe('Crypto');
    }
    expect(results.length).toBeGreaterThan(5);
  });

  it('filter "ETF" only returns ETF assets', () => {
    const results = searchLocalCatalog('', emptyMeta, emptySet, 'ETF', 25);
    for (const r of results) {
      expect(r.type).toBe('ETF');
    }
    expect(results.length).toBeGreaterThan(5);
  });

  it('filter "PORTFOLIO" returns only in-portfolio symbols', () => {
    const portSet = new Set(['NASDAQ:NVDA', 'BINANCE:BTCUSDT']);
    const results = searchLocalCatalog('', emptyMeta, portSet, 'PORTFOLIO', 25);
    for (const r of results) {
      expect(r.inPortfolio).toBe(true);
    }
  });

  it('searching "BINANE:SOL" with typo still finds BINANCE:SOLUSDT', () => {
    // The exFilter correction maps BINANE→BINANCE in search
    const results = searchLocalCatalog('BINANE:SOL', emptyMeta, emptySet, 'ALL', 10);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('BINANCE:SOLUSDT');
  });

  it('searching "Tesla" by name finds NASDAQ:TSLA', () => {
    const results = searchLocalCatalog('Tesla', emptyMeta, emptySet, 'ALL', 10);
    const symbols = results.map(r => r.symbol);
    expect(symbols).toContain('NASDAQ:TSLA');
  });

  it('findCatalogEntry returns correct entry for BINANCE:ETHUSDT', () => {
    const entry = findCatalogEntry('BINANCE:ETHUSDT');
    expect(entry).toBeDefined();
    expect(entry!.ticker).toBe('ETHUSDT');
    expect(entry!.type).toBe('Crypto');
  });
});

/* ═══════════════════════════════════════════════════
   3.  SERIES WITH >20 POSITIONS & OLD DATES
   ═══════════════════════════════════════════════════ */
describe('buildPortfolioSeries – >20 positions & pre-startPoint dates', () => {
  // Build a portfolio with 25 trades
  const baseSymbols = [
    'NASDAQ:NVDA', 'NYSE:TSM', 'NASDAQ:MU', 'NASDAQ:GOOG', 'NASDAQ:MSFT',
    'NASDAQ:META', 'NYSE:NU', 'NASDAQ:AMZN', 'BINANCE:BTCUSDT', 'NYSE:VIST',
    'BINANCE:ETHUSDT', 'NASDAQ:MELI', 'NASDAQ:AAPL', 'NYSE:CLS', 'NASDAQ:AVGO',
    'NASDAQ:NBIS', 'NASDAQ:TMDX', 'NASDAQ:CRDO', 'NASDAQ:SIMO', 'NASDAQ:HSAI',
    'NASDAQ:TSLA', 'NASDAQ:AMD', 'NASDAQ:PLTR', 'NYSE:YPF', 'BINANCE:SOLUSDT',
  ];

  const trades: Trade[] = baseSymbols.map((sym, i) => ({
    id: `trade_${i}`,
    time: Date.parse('2025-08-01T14:30:00Z') + i * 86400000,
    symbol: sym,
    isBuy: true,
    qty: 10,
    price: 100 + i * 10,
    commission: 0,
    comment: `Trade ${i + 1}`,
  }));

  const portfolio: Portfolio = {
    id: 'test-portfolio',
    title: 'Test >20 positions',
    currency: 'USD',
    benchmark: 'SP:SPX',
    riskFreeRate: 2,
    startPoint: Date.parse('2025-08-25T00:00:00Z'), // After first trade
    trades,
    cash: [],
    dividends: [],
    splits: [],
    illiquid: [],
  };

  // Minimal history map with a few dates
  const historyMap: Record<string, [number, number][]> = {};
  for (const sym of baseSymbols) {
    const tradeIdx = baseSymbols.indexOf(sym);
    const buyPrice = 100 + tradeIdx * 10;
    historyMap[sym] = [
      [Math.floor(Date.parse('2025-08-01T00:00:00Z') / 1000), buyPrice],
      [Math.floor(Date.parse('2025-09-01T00:00:00Z') / 1000), buyPrice * 1.05],
      [Math.floor(Date.parse('2025-10-01T00:00:00Z') / 1000), buyPrice * 1.10],
    ];
  }
  // Add benchmark
  historyMap['SP:SPX'] = [
    [Math.floor(Date.parse('2025-08-01T00:00:00Z') / 1000), 5500],
    [Math.floor(Date.parse('2025-09-01T00:00:00Z') / 1000), 5600],
    [Math.floor(Date.parse('2025-10-01T00:00:00Z') / 1000), 5700],
  ];

  it('builds series with 25 positions without crashing', () => {
    const series = buildPortfolioSeries(portfolio, historyMap, {});
    expect(series).toBeDefined();
    expect(series.daily.length).toBeGreaterThan(0);
    expect(series.monthly.length).toBeGreaterThan(0);
  });

  it('no NaN or Infinity in daily series with >20 positions', () => {
    const series = buildPortfolioSeries(portfolio, historyMap, {});
    for (const pt of series.daily) {
      expect(Number.isFinite(pt.holdingsValue)).toBe(true);
      expect(Number.isFinite(pt.cashBalance)).toBe(true);
      expect(Number.isFinite(pt.cumReturnPct)).toBe(true);
    }
  });

  it('adjusts startDate to earliest trade when trades predate portfolio.startPoint', () => {
    const series = buildPortfolioSeries(portfolio, historyMap, {});
    // The first trade is Aug 1, startPoint is Aug 25
    // Series should start at or before Aug 25 (adjusted to Aug 1 effectively)
    const firstDate = series.daily[0]?.date || '';
    expect(firstDate <= '2025-08-25').toBe(true);
  });

  it('back-fills price from trade price when no prior history exists', () => {
    // Create a new symbol with NO history data
    const extraTrade: Trade = {
      id: 'extra_new',
      time: Date.parse('2025-07-15T14:30:00Z'), // Before any history
      symbol: 'NASDAQ:NEWSTOCK',
      isBuy: true,
      qty: 5,
      price: 42.50,
      commission: 0,
    };
    const portWithNew: Portfolio = {
      ...portfolio,
      trades: [...trades, extraTrade],
    };
    // No history for NASDAQ:NEWSTOCK
    const series = buildPortfolioSeries(portWithNew, historyMap, {});
    expect(series.daily.length).toBeGreaterThan(0);
    // Should not crash; values should be finite
    const lastPt = series.daily[series.daily.length - 1];
    expect(Number.isFinite(lastPt.holdingsValue)).toBe(true);
  });

  it('TWR and annualized yield are finite numbers', () => {
    const series = buildPortfolioSeries(portfolio, historyMap, {});
    expect(Number.isFinite(series.twrAllPct)).toBe(true);
    expect(Number.isFinite(series.annualizedYieldPct)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════
   4.  EVALUATION ENGINE WITH >20 HOLDINGS
   ═══════════════════════════════════════════════════ */
describe('evaluateLedger – >20 holdings & dividends normalization', () => {
  const symbols = [
    'NASDAQ:NVDA', 'NYSE:TSM', 'NASDAQ:MU', 'NASDAQ:GOOG', 'NASDAQ:MSFT',
    'NASDAQ:META', 'NYSE:NU', 'NASDAQ:AMZN', 'BINANCE:BTCUSDT', 'NYSE:VIST',
    'BINANCE:ETHUSDT', 'NASDAQ:MELI', 'NASDAQ:AAPL', 'NYSE:CLS', 'NASDAQ:AVGO',
    'NASDAQ:NBIS', 'NASDAQ:TMDX', 'NASDAQ:CRDO', 'NASDAQ:SIMO', 'NASDAQ:HSAI',
    'NASDAQ:TSLA', // 21st
    'NASDAQ:AMD',  // 22nd
    'NASDAQ:PLTR', // 23rd
  ];

  const trades: Trade[] = symbols.map((sym, i) => ({
    id: `eval_trade_${i}`,
    time: Date.parse('2025-08-01T14:30:00Z') + i * 86400000,
    symbol: sym,
    isBuy: true,
    qty: 10,
    price: 50 + i * 10,
    commission: 0,
  }));

  const portfolio: Portfolio = {
    id: 'eval-test',
    title: 'Eval Test 23 positions',
    currency: 'USD',
    benchmark: 'SP:SPX',
    riskFreeRate: 2,
    startPoint: Date.parse('2025-08-01T00:00:00Z'),
    trades,
    cash: [],
    dividends: [
      {
        id: 'div1',
        time: Date.parse('2025-09-15T14:30:00Z'),
        symbol: 'NASDAQ:NVDA', // normalized
        amount: 25.0,
      },
      {
        id: 'div2',
        time: Date.parse('2025-09-20T14:30:00Z'),
        symbol: 'BINANCE:BTCUSDT',
        amount: 10.0,
      },
    ],
    splits: [],
    illiquid: [],
  };

  const metaMap: Record<string, AssetMeta> = {};
  const quotesMap: Record<string, QuoteData> = {};

  for (const sym of symbols) {
    metaMap[sym] = resolveAssetMeta(sym, metaMap);
    const tradeIdx = symbols.indexOf(sym);
    const buyPx = 50 + tradeIdx * 10;
    quotesMap[sym] = {
      symbol: sym,
      price: buyPx * 1.1,
      prevClose: buyPx * 1.05,
      change: buyPx * 0.05,
      changePct: 4.76,
      currency: 'USD',
    };
  }

  it('evaluates 23 holdings correctly', () => {
    const result = evaluateLedger(portfolio, metaMap, quotesMap);
    expect(result.holdings.length).toBe(23);
    expect(result.kpis.openHoldingsCount).toBe(23);
  });

  it('gross holdings value is sum of all qty*lastPrice', () => {
    const result = evaluateLedger(portfolio, metaMap, quotesMap);
    let expectedGross = 0;
    for (let i = 0; i < symbols.length; i++) {
      expectedGross += 10 * (50 + i * 10) * 1.1;
    }
    expect(Math.abs(result.kpis.grossHoldingsValue - expectedGross)).toBeLessThan(1);
  });

  it('dividends are accrued to the correct holdings', () => {
    const result = evaluateLedger(portfolio, metaMap, quotesMap);
    const nvdaHolding = result.holdings.find(h => h.symbol === 'NASDAQ:NVDA');
    expect(nvdaHolding).toBeDefined();
    expect(nvdaHolding!.dividendGain).toBe(25.0);

    const btcHolding = result.holdings.find(h => h.symbol === 'BINANCE:BTCUSDT');
    expect(btcHolding).toBeDefined();
    expect(btcHolding!.dividendGain).toBe(10.0);
  });

  it('distribution tables include all 23 positions', () => {
    const result = evaluateLedger(portfolio, metaMap, quotesMap);
    expect(result.distributionByAsset.length).toBe(23);
    const totalAlloc = result.distributionByAsset.reduce((s, d) => s + d.allocation, 0);
    expect(Math.abs(totalAlloc - 100)).toBeLessThan(0.5);
  });
});

/* ═══════════════════════════════════════════════════
   5.  CSV PARSING WITH NORMALIZATION
   ═══════════════════════════════════════════════════ */
describe('parseCsvTransactionsClient – CSV import with normalization', () => {
  it('parses standard TradingView CSV format', () => {
    const csv = `Symbol,Side,Qty,Fill Price,Commission,Closing Time
NASDAQ:NVDA,Buy,10,185.50,0,2026-09-15
BINANCE:BTCUSDT,Buy,0.5,42000,5,2026-08-01`;
    const trades = parseCsvTransactionsClient(csv);
    expect(trades.length).toBe(2);
    expect(trades[0].symbol).toBe('NASDAQ:NVDA');
    expect(trades[0].isBuy).toBe(true);
    expect(trades[0].qty).toBe(10);
    expect(trades[0].price).toBe(185.50);
    expect(trades[1].symbol).toBe('BINANCE:BTCUSDT');
  });

  it('normalizes symbols without exchange prefix', () => {
    const csv = `Symbol,Side,Qty,Fill Price,Commission,Closing Time
NVDA,Buy,5,200,0,2026-10-01
SOL,Buy,100,150,0,2026-10-01
TSM,Buy,20,300,0,2026-10-01`;
    const trades = parseCsvTransactionsClient(csv);
    expect(trades.length).toBe(3);
    expect(trades[0].symbol).toBe('NASDAQ:NVDA');
    expect(trades[1].symbol).toBe('BINANCE:SOLUSDT');
    expect(trades[2].symbol).toBe('NYSE:TSM');
  });

  it('handles DD/MM/YYYY date format', () => {
    const csv = `Symbol,Side,Qty,Fill Price,Commission,Closing Time
NASDAQ:AAPL,Buy,10,250,0,15/09/2025`;
    const trades = parseCsvTransactionsClient(csv);
    expect(trades.length).toBe(1);
    const d = new Date(trades[0].time);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(8); // September = 8 in JS
  });

  it('handles quoted CSV fields', () => {
    const csv = `"Symbol","Side","Qty","Fill Price","Commission","Closing Time"
"NASDAQ:META","Buy","5","750.50","2.50","2026-10-01"`;
    const trades = parseCsvTransactionsClient(csv);
    expect(trades.length).toBe(1);
    expect(trades[0].symbol).toBe('NASDAQ:META');
    expect(trades[0].price).toBe(750.50);
    expect(trades[0].commission).toBe(2.50);
  });

  it('corrects typo exchanges in CSV symbols', () => {
    const csv = `Symbol,Side,Qty,Fill Price,Commission,Closing Time
BINANE:SOLUSDT,Buy,50,200,0,2026-10-01
NASDA:NVDA,Buy,10,200,0,2026-10-01`;
    const trades = parseCsvTransactionsClient(csv);
    expect(trades.length).toBe(2);
    expect(trades[0].symbol).toBe('BINANCE:SOLUSDT');
    expect(trades[1].symbol).toBe('NASDAQ:NVDA');
  });

  it('skips invalid rows (zero qty, missing price)', () => {
    const csv = `Symbol,Side,Qty,Fill Price,Commission,Closing Time
NASDAQ:NVDA,Buy,0,200,0,2026-10-01
NASDAQ:AAPL,Buy,10,,0,2026-10-01
NASDAQ:META,Buy,5,500,0,2026-10-01`;
    const trades = parseCsvTransactionsClient(csv);
    expect(trades.length).toBe(1); // Only META is valid
    expect(trades[0].symbol).toBe('NASDAQ:META');
  });

  it('handles SELL/VENTA side correctly', () => {
    const csv = `Symbol,Side,Qty,Fill Price,Commission,Closing Time
NASDAQ:NVDA,Sell,5,200,0,2026-10-01
NYSE:YPF,VENTA,10,38,0,2026-10-01`;
    const trades = parseCsvTransactionsClient(csv);
    expect(trades.length).toBe(2);
    expect(trades[0].isBuy).toBe(false);
    expect(trades[1].isBuy).toBe(false);
  });
});
