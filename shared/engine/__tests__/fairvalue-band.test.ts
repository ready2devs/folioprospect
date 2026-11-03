import { describe, it, expect } from 'vitest';
import {
  computeFairValue,
  aggregateFairValue,
  type FundamentalInput,
  type FvComponentInput,
} from '../fairvalue.js';

// Regresión 2026-11-03: el Fair Value nunca puede depender del precio.
// Antes la banda de credibilidad se medía contra el precio y el FV
// saltaba cuando el precio cruzaba un umbral (SIMO bajo US$192,58; META
// sobre US$615,99; MU bajo US$715,69). Con el promedio winsorizado la
// referencia es el promedio de los otros componentes y los componentes
// se anclan al EPS reparado (no al P/E publicado), así que el FV es
// idéntico a cualquier precio.
const C = (key: FvComponentInput['key'], value: number): FvComponentInput => ({
  key,
  value,
});

describe('invariancia del FV frente al precio (agregación)', () => {
  it('componentes fijos de SIMO: mismo FV a cualquier precio', () => {
    const pool = [C('dcf', 48.14), C('multiples', 560.31), C('target', 363.09)];
    const fvs = [120, 187.9, 192.58, 250, 300].map(
      (p) => aggregateFairValue(pool, { currentPrice: p }).fairValue
    );
    expect(new Set(fvs).size).toBe(1);
    expect(fvs[0]).toBeCloseTo(346.28, 1);
  });

  it('umbral viejo de META (US$615,99): el FV no salta al cruzarlo', () => {
    const pool = [C('dcf', 2155.95), C('multiples', 925.28), C('target', 848.38)];
    const fvs = [600, 615.99, 700].map(
      (p) => aggregateFairValue(pool, { currentPrice: p }).fairValue
    );
    expect(new Set(fvs).size).toBe(1);
    expect(fvs[0]).toBeCloseTo(1309.87, 1);
  });

  it('umbral viejo de MU (US$715,69): el FV no salta al cruzarlo', () => {
    const pool = [C('dcf', 2504.92), C('multiples', 5401.77), C('target', 1561.91)];
    const fvs = [700, 715.69, 833.59, 900].map(
      (p) => aggregateFairValue(pool, { currentPrice: p }).fairValue
    );
    expect(new Set(fvs).size).toBe(1);
    expect(fvs[0]).toBeCloseTo(3156.2, 0);
  });
});

describe('invariancia del FV frente al precio (computeFairValue, EPS anclado)', () => {
  const anchored = (price: number): FundamentalInput => ({
    symbol: 'TEST',
    currentPrice: price,
    targetMeanPrice: 363.09,
    freeCashflow: 5.876e8,
    operatingCashflow: 7.5e8,
    totalCash: 1e8,
    totalDebt: 5e7,
    sharesOutstanding: 1e7,
    revenueGrowth: 0.2,
    earningsGrowth: 0.2,
    forwardPE: 8.72,
    forwardEps: 21.55,
    forwardEpsAlt: 21.0,
    forwardEpsAltSource: 'finviz',
    trailingEps: 12,
    beta: 1.1,
    grossMargins: 0.6,
    operatingMargins: 0.3,
    returnOnEquity: 0.25,
  });

  it('mismo FV a precios 120–300 (incluye el viejo umbral 192,58)', () => {
    const fvs = [120, 187.9, 192.58, 250, 300].map(
      (p) => computeFairValue(anchored(p)).fairValue
    );
    expect(fvs.every((v) => v != null)).toBe(true);
    expect(new Set(fvs).size).toBe(1);
  });
});
