import { describe, it, expect } from 'vitest';
import {
  computeFairValue,
  aggregateFairValue,
  type FundamentalInput,
  type FvComponentInput,
} from '../fairvalue.js';

// Regresión 2026-11-03: la BANDA de credibilidad nunca se mide contra
// el precio. Antes se medía contra el precio y el FV SALTABA cuando el
// precio cruzaba un umbral (SIMO bajo US$192,58; META sobre US$615,99;
// MU bajo US$715,69). Con el promedio winsorizado la referencia es el
// promedio de los otros componentes y los componentes se anclan al EPS
// reparado (no al P/E publicado).
// Matiz R9 (mismo día): dos cotas deliberadas SÍ son relativas al
// mercado — el tope sectorial del múltiplo (referencia: el P/E forward
// del propio activo, o el de la industria si se conoce) y la
// normalización de la base del DCF por FCF yield. Son funciones
// CONTINUAS del precio: mueven el FV suavemente, jamás con el salto
// discreto del artefacto original. La invariancia exacta se mantiene
// cuando ninguna de las dos cotas está activa (fixture de abajo) y la
// agregación pura nunca dependió del precio.
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

  it('sin cotas de mercado activas, el FV es idéntico a precios 120–300', () => {
    // EPS bajo contra el precio (P/E propio 30–75 ⇒ el tope sectorial
    // de R9 no llega a atar) y capitalización amplia (FCF yield < 10%
    // ⇒ sin haircut cíclico): ningún componente depende del precio.
    const calm = (price: number): FundamentalInput => ({
      ...anchored(price),
      forwardEps: 4,
      forwardEpsAlt: 3.9,
      sharesOutstanding: 5e7,
    });
    const fvs = [120, 187.9, 192.58, 250, 300].map(
      (p) => computeFairValue(calm(p)).fairValue
    );
    expect(fvs.every((v) => v != null)).toBe(true);
    expect(new Set(fvs).size).toBe(1);
  });

  it('con el tope sectorial activo el FV se mueve CONTINUO, sin el salto del artefacto', () => {
    // El fixture original cotiza a P/E propio 5,6–14 contra un
    // múltiplo de tabla de 20: el tope R9 ata y el componente de
    // múltiplos sigue al precio de forma proporcional y continua. Lo
    // que no puede volver es el SALTO discreto al cruzar un umbral.
    const prices = [120, 187.9, 192.58, 250, 300];
    const fvs = prices.map((p) => computeFairValue(anchored(p)).fairValue ?? NaN);
    expect(fvs.every((v) => Number.isFinite(v))).toBe(true);
    for (let i = 1; i < fvs.length; i++) {
      expect(fvs[i]).toBeGreaterThan(fvs[i - 1]);
      // Continuidad: entre precios cercanos (187,9 → 192,58, +2,5%) el
      // FV no puede saltar más que unos pocos puntos porcentuales.
      if (prices[i] / prices[i - 1] < 1.05) {
        expect(fvs[i] / fvs[i - 1]).toBeLessThan(1.1);
      }
    }
  });
});
