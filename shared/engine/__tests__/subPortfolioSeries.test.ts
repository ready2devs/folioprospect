import { describe, it, expect } from 'vitest';
import { filterPortfolioBySymbols } from '../subPortfolioSeries.js';
import { buildPortfolioSeries, type PriceHistoryMap } from '../series.js';
import type { Portfolio } from '../types.js';

const DAY = 86400000;
const T0 = Date.parse('2026-01-05T00:00:00Z');

function makePortfolio(): Portfolio {
  return {
    id: 'p1',
    title: 'Test',
    currency: 'USD',
    benchmark: 'SP:SPX',
    riskFreeRate: 2,
    startPoint: T0 - 90 * DAY,
    trades: [
      { id: 1, time: T0, symbol: 'NASDAQ:AAA', isBuy: true, qty: 10, price: 100, commission: 0 },
      { id: 2, time: T0, symbol: 'NASDAQ:BBB', isBuy: true, qty: 5, price: 200, commission: 0 },
      { id: 3, time: T0 + 30 * DAY, symbol: 'NASDAQ:BBB', isBuy: true, qty: 5, price: 220, commission: 0 },
    ],
    cash: [
      { id: 'c1', time: T0, type: 'deposit', amount: 5000, currency: 'USD' },
    ],
    dividends: [
      { id: 'd1', time: T0 + 10 * DAY, symbol: 'NASDAQ:AAA', amount: 12 },
      { id: 'd2', time: T0 + 10 * DAY, symbol: 'NASDAQ:BBB', amount: 30 },
    ],
    splits: [{ id: 's1', time: T0 + 5 * DAY, symbol: 'NASDAQ:BBB', ratio: 2 }],
    illiquid: [
      {
        id: 'i1',
        name: 'Depto',
        category: 'Real estate',
        costBasis: 1000,
        currentValue: 1200,
        currency: 'USD',
        annualYieldPct: 5,
        acquiredAt: T0,
      },
    ],
  };
}

const history: PriceHistoryMap = {
  'NASDAQ:AAA': [
    [Math.floor(T0 / 1000), 100],
    [Math.floor((T0 + 30 * DAY) / 1000), 110],
    [Math.floor((T0 + 60 * DAY) / 1000), 121],
  ],
  'NASDAQ:BBB': [
    [Math.floor(T0 / 1000), 200],
    [Math.floor((T0 + 30 * DAY) / 1000), 100], // BBB se desploma: no debe contaminar la serie de AAA
    [Math.floor((T0 + 60 * DAY) / 1000), 50],
  ],
  'SP:SPX': [
    [Math.floor(T0 / 1000), 5000],
    [Math.floor((T0 + 30 * DAY) / 1000), 5100],
    [Math.floor((T0 + 60 * DAY) / 1000), 5200],
  ],
};

describe('SPEC-005 §6 bis · filterPortfolioBySymbols', () => {
  it('conserva solo los trades/dividendos/splits de los símbolos pedidos y descarta cash e ilíquidos', () => {
    const filtered = filterPortfolioBySymbols(makePortfolio(), ['NASDAQ:AAA']);
    expect(filtered.trades.map((t) => t.symbol)).toEqual(['NASDAQ:AAA']);
    expect(filtered.dividends.map((d) => d.symbol)).toEqual(['NASDAQ:AAA']);
    expect(filtered.splits).toEqual([]);
    expect(filtered.cash).toEqual([]);
    expect(filtered.illiquid).toEqual([]);
    expect(filtered.benchmark).toBe('SP:SPX');
  });

  it('el startPoint pasa a la primera operación del subconjunto', () => {
    const filtered = filterPortfolioBySymbols(makePortfolio(), ['NASDAQ:BBB']);
    expect(filtered.startPoint).toBe(T0);
  });

  it('sin operaciones del subconjunto: trades vacío (el endpoint responde serie vacía, nada fabricado)', () => {
    const filtered = filterPortfolioBySymbols(makePortfolio(), ['NASDAQ:ZZZ']);
    expect(filtered.trades).toEqual([]);
    expect(filtered.startPoint).toBe(makePortfolio().startPoint);
  });

  it('la serie del subconjunto usa SOLO sus operaciones: AAA sube +21% aunque BBB se desplome', () => {
    const portfolio = makePortfolio();
    const onlyA = buildPortfolioSeries(
      filterPortfolioBySymbols(portfolio, ['NASDAQ:AAA']),
      history,
      {},
      'SP:SPX'
    );
    const lastA = onlyA.daily[onlyA.daily.length - 1];
    // 10 acciones de AAA: 100 → 121 = +21% encadenado, sin flujos intermedios.
    expect(lastA.holdingsValue).toBeCloseTo(1210, 4);
    expect(lastA.cumReturnPct).toBeCloseTo(21, 1);
    // El benchmark se sigue calculando (SPX 5000 → 5200 ≈ +4%).
    expect(lastA.benchmarkPct).toBeCloseTo(4, 0);

    const onlyB = buildPortfolioSeries(
      filterPortfolioBySymbols(portfolio, ['NASDAQ:BBB']),
      history,
      {},
      'SP:SPX'
    );
    const lastB = onlyB.daily[onlyB.daily.length - 1];
    // BBB: 5@200 + 5@220 con split 2:1 y precio final 50 → valor muy inferior al de AAA.
    expect(lastB.holdingsValue).toBeLessThan(lastA.holdingsValue);
    expect(lastB.cumReturnPct).toBeLessThan(0);
  });
});
