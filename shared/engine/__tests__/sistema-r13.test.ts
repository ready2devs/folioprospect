import { describe, it, expect } from 'vitest';
import {
  scoreAsset,
  optimizePortfolio,
  confidenceRiskComponent,
  motorFvViewFor,
  yearsToDoubleFor,
  type OptimizerAssetInput,
} from '../optimizer.js';
import {
  computeOpportunity,
  normalizeUncertainty,
  scenariosFromMotorFv,
} from '../opportunity.js';
import type { DatedClose } from '../riskMatrix.js';

/**
 * Sistema R13 — UNIFICACIÓN ficha ↔ Optimizador (aprobada por el
 * usuario 2026-11-03; docs/VALUATION-RULES.md R13):
 *  1) Un solo valor justo por activo en toda la app: la ficha
 *     consume el FV del motor (motorFvViewFor) y su rango es el
 *     piso/techo del rango del motor.
 *  2) El ranking de oportunidad de la ficha se computa sobre ese
 *     FV compartido, con las bandas de siempre.
 *  3) El riesgo de desvío del score de confianza es
 *     MARGINAL-PRIMERO: mandan el aporte de la posición a esta
 *     cartera (PCTR/peso y MCTR); la volatilidad propia es el
 *     insumo secundario.
 *  4) Fin del retorno inventado de 11,5% en cripto: sin patas de
 *     FV no hay predicción; la caja rinde 0; el retorno de
 *     cartera se computa solo sobre activos con predicción.
 */
const OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX', ticker: 'XXX', name: 'Test Co', sector: 'Technology',
  industry: 'Semiconductors', price: 100, qty: 10, value: 1000, ...p,
});

const DAY = 86_400_000;

/** Serie de cierres desde retornos logarítmicos dados. */
function closesFromReturns(rets: number[], start = 100): DatedClose[] {
  let price = start;
  const out: DatedClose[] = [{ t: 0, c: price }];
  rets.forEach((r, i) => {
    price *= Math.exp(r);
    out.push({ t: (i + 1) * DAY, c: price });
  });
  return out;
}

/** Random determinístico (LCG) para fixtures estables. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

describe('un solo valor justo: la ficha consume el FV del motor', () => {
  // El caso que motivó el pase: VIST según la lectura del
  // diagnóstico (precio ~67,4; FV del motor 109,88; ficha 131,33).
  const vistInput = base({
    symbol: 'NYSE:VIST', ticker: 'VIST', name: 'Vista Energy', sector: 'Energy', industry: 'Energy',
    price: 67.4, qty: 97.66, value: 6583,
    fvBase: 109.88, fvPesimista: 98.16, fvOptimista: 121.3,
    fvRangeLow: 98.16, fvRangeHigh: 121.3, uncertainty: 'Low',
    fvConfidence: 'Baja', fvComponentCount: 2, analystTarget: 121.3,
  });

  it('el FV de la ficha ES el FV del Optimizador (mismo activo, misma lectura)', () => {
    const scored = scoreAsset(vistInput, 100_000, OPTS);
    const view = motorFvViewFor(vistInput, scored);
    expect(view).not.toBeNull();
    expect(view!.fv).toBe(scored.fvEffective);
    expect(view!.fv).toBe(vistInput.fvBase);
    // El rango de la ficha es el piso/techo del rango del motor.
    expect(view!.fvPesimista).toBe(98.16);
    expect(view!.fvOptimista).toBe(121.3);
    expect(view!.uncertainty).toBe('Low');
    // Y el mapeo a escenarios de la ficha es 1:1 con esa vista.
    const sc = scenariosFromMotorFv(view!);
    expect(sc).toEqual({ fvPesimista: 98.16, fvBase: 109.88, fvOptimista: 121.3 });
  });

  it('sin rango publicado, el piso/techo cae a los extremos de los componentes del motor', () => {
    const input = base({ fvBase: 150, fvPesimista: 120, fvOptimista: 190, fvConfidence: 'Media', fvComponentCount: 2 });
    const view = motorFvViewFor(input, scoreAsset(input, 10_000, OPTS));
    expect(view!.fvPesimista).toBe(120);
    expect(view!.fvOptimista).toBe(190);
  });

  it('cripto y caja no tienen vista de FV del motor (null, sin número competidor)', () => {
    const crypto = base({ symbol: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', isCrypto: true });
    expect(motorFvViewFor(crypto, scoreAsset(crypto, 10_000, OPTS))).toBeNull();
    const cash = base({ symbol: 'CASH:USD', ticker: 'USD', isCash: true });
    expect(motorFvViewFor(cash, scoreAsset(cash, 10_000, OPTS))).toBeNull();
  });

  it('el ranking de oportunidad sale del FV compartido (caso VIST del diagnóstico)', () => {
    const view = motorFvViewFor(vistInput, scoreAsset(vistInput, 100_000, OPTS))!;
    const sc = scenariosFromMotorFv(view);
    const r = computeOpportunity({
      price: 67.4,
      fvPesimista: sc.fvPesimista,
      fvBase: sc.fvBase,
      fvOptimista: sc.fvOptimista,
      scenario: 'Base',
      uncertainty: normalizeUncertainty(view.uncertainty),
      yearsToCorrection: 3,
    })!;
    // ratio 67,4/109,88 = 0,6134; bandas Low [0,80…] → 5★ y
    // puntaje 80 + (0,80 − 0,6134)/0,80 × 20 ≈ 84,7 → 85.
    expect(r.fv).toBe(109.88);
    expect(r.ratio).toBeCloseTo(0.6134, 3);
    expect(r.stars).toBe(5);
    expect(r.score).toBe(85);
    expect(r.label).toBe('Oportunidad alta');
  });
});

describe('riesgo de desvío MARGINAL-PRIMERO (sub-escala del score de confianza)', () => {
  it('composición exacta: aporte relativo 40% + MCTR 35% + volatilidad propia 25%', () => {
    // vol 40 → volScore 44. Aporte bajo (PCTR 1 con peso 4 →
    // ratio 0,25 → 100) y MCTR bajo (8 contra σp 30 → 100):
    expect(confidenceRiskComponent(40, 1, 4, { mctrPct: 8, portfolioVolPct: 30 })).toBe(86);
    // La MISMA volatilidad propia con aporte desproporcionado
    // (PCTR 8 con peso 4 → ratio 2 → 40) y MCTR alto (60 = 2×σp → 0):
    expect(confidenceRiskComponent(40, 8, 4, { mctrPct: 60, portfolioVolPct: 30 })).toBe(27);
    // Sin bloque marginal (fuera de cartera): la volatilidad sola.
    expect(confidenceRiskComponent(40, null, null)).toBe(44);
    // Solo aporte relativo: 65% aporte + 35% volatilidad.
    expect(confidenceRiskComponent(40, 1, 4)).toBe(80);
  });

  it('a igual volatilidad y mismas patas, la posición que menos riesgo suma a la cartera tiene más confianza', () => {
    // Factor común de mercado (250 retornos).
    const factor = Array.from({ length: 250 }, (_, i) => Math.sin(i / 9) * 0.012);
    const rnd = lcg(7);
    const corrRets = factor.map((f) => f + rnd() * 0.004);
    // La gemela DESACOPLADA: la MISMA multiset de retornos
    // permutada con un paso coprimo — idéntica volatilidad,
    // correlación con el factor destruida.
    const decorrRets = corrRets.map((_, i) => corrRets[(i * 37) % corrRets.length]);
    const fvInputs = {
      price: 100, fvBase: 200, fvConfidence: 'Media' as const, fvComponentCount: 2,
      earningsGrowthTotalPct: 10, analystTarget: 150, salesGrowthPct: 20,
    };
    const inputs: OptimizerAssetInput[] = [
      base({
        symbol: 'NASDAQ:BIG', ticker: 'BIG', value: 6000, qty: 60,
        priceHistory: closesFromReturns(factor), ...fvInputs,
      }),
      base({
        symbol: 'NASDAQ:CORR', ticker: 'CORR', value: 2000, qty: 20,
        priceHistory: closesFromReturns(corrRets), ...fvInputs,
      }),
      base({
        symbol: 'NASDAQ:DECORR', ticker: 'DECORR', value: 2000, qty: 20,
        priceHistory: closesFromReturns(decorrRets), ...fvInputs,
      }),
    ];
    const result = optimizePortfolio(inputs, OPTS);
    const corr = result.assets.find((a) => a.ticker === 'CORR')!;
    const decorr = result.assets.find((a) => a.ticker === 'DECORR')!;
    // Misma volatilidad propia (misma multiset de retornos)…
    expect(decorr.volatilityPct).toBeCloseTo(corr.volatilityPct, 4);
    // …pero la desacoplada suma mucho menos riesgo a ESTA cartera:
    expect(decorr.mctrPct!).toBeLessThan(corr.mctrPct!);
    expect(decorr.riskContributionPct!).toBeLessThan(corr.riskContributionPct!);
    // Y eso — no la volatilidad — es lo que manda en su confianza:
    expect(decorr.scoreComponents!.risk!).toBeGreaterThan(corr.scoreComponents!.risk!);
    expect(decorr.score!).toBeGreaterThan(corr.score!);
  });

  it('el techo de sospechoso (39) sigue mandando aunque el riesgo marginal sea mínimo', () => {
    const quiet = Array.from({ length: 250 }, (_, i) => (i % 2 === 0 ? 0.008 : -0.008));
    const s = scoreAsset(
      base({
        fvBase: 200, fvConfidence: 'Alta', fvComponentCount: 2, fvModelSuspect: true,
        analystTarget: 190, priceHistory: closesFromReturns(quiet),
      }),
      1000,
      OPTS
    );
    expect(s.score!).toBeLessThanOrEqual(39);
    expect(s.scoreBand).toBe('a-revisar');
  });
});

describe('fin del retorno inventado: cripto fuera de la predicción, caja en 0', () => {
  it('scoreAsset: cripto sin supuesto explícito no tiene RE, ni duplicación, ni score', () => {
    const s = scoreAsset(
      base({ symbol: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', name: 'Bitcoin', sector: 'Crypto', isCrypto: true, price: 100_000, value: 5000 }),
      10_000,
      OPTS
    );
    expect(s.expectedReturnPct).toBeNull();
    expect(s.expectedReturnPessimisticPct).toBeNull();
    expect(s.yearsToDouble).toBeNull();
    expect(s.yearsToDoublePessimistic).toBeNull();
    expect(s.score).toBeNull();
    expect(s.fvEffective).toBeNull();
  });

  it('la caja rinde 0: es una predicción real (entra en el promedio), sin duplicación', () => {
    const s = scoreAsset(
      base({ symbol: 'CASH:USD', ticker: 'USD', name: 'Efectivo', isCash: true, value: 1000 }),
      10_000,
      OPTS
    );
    expect(s.expectedReturnPct).toBe(0);
    expect(s.yearsToDouble).toBeNull();
    expect(s.score).toBeNull();
  });

  it('un supuesto EXPLÍCITO sí se honra (es un dato, no una invención del motor)', () => {
    const s = scoreAsset(
      base({ symbol: 'BINANCE:ETHUSDT', ticker: 'ETHUSDT', isCrypto: true, assumedReturnPct: 9, value: 1000 }),
      10_000,
      OPTS
    );
    expect(s.expectedReturnPct).toBe(9);
    expect(s.yearsToDouble).toBeCloseTo(yearsToDoubleFor(9)!, 10);
  });

  it('el retorno de cartera se computa SOLO sobre los activos con predicción (pesos renormalizados)', () => {
    const equity = base({
      symbol: 'NASDAQ:EQ', ticker: 'EQ', price: 100, qty: 90, value: 9000,
      analystTarget: 150, volatilityPct: 30,
    });
    const btc = base({
      symbol: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', name: 'Bitcoin', sector: 'Crypto',
      isCrypto: true, price: 100_000, qty: 0.05, value: 5000,
    });
    const usdt = base({
      symbol: 'BINANCE:USDTUSDT', ticker: 'USDTUSDT', name: 'Tether', sector: 'Crypto',
      isCash: true, price: 1, qty: 1000, value: 1000,
    });
    const r = optimizePortfolio([equity, btc, usdt], OPTS);
    const eqScored = r.assets.find((a) => a.ticker === 'EQ')!;
    expect(eqScored.expectedReturnPct).toBeCloseTo(50, 6); // solo pata consenso
    // Con predicción: EQ (9000 al 50%) y la caja (1000 al 0%).
    // BTC (5000) no entra ni en el numerador ni en el denominador:
    // (9000×50 + 1000×0) / 10000 = 45. Con la fórmula vieja (BTC
    // al 11,5% inventado sobre el total) daría 33,83.
    expect(r.before.expectedReturnArithPct).toBeCloseTo(45, 6);
    // Las posiciones cuentan acciones + cripto; la caja no.
    expect(r.before.positions).toBe(2);
  });
});
