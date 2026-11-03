/**
 * Módulo único de riesgo (consolidación 2026-11-03): la matriz se
 * construye desde fixtures de precios; shrinkage hacia los priors
 * de bloque; respaldo sin historia; Euler idéntico con matriz
 * dada; y el test de consistencia obligatorio: la volatilidad y
 * el aporte que muestran el gráfico y la ficha (campos del
 * payload) son numéricamente los mismos que alimentaron el
 * score de confianza.
 */
import { describe, expect, it } from 'vitest';
import {
  buildRiskMatrix,
  measuredVolPct,
  pairCorrelation,
  volForSpec,
  type DatedClose,
  type RiskAssetSpec,
} from '../riskMatrix';
import { optimizePortfolio, type OptimizerAssetInput } from '../optimizer';

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

/** Retornos alternados ±amp (volatilidad conocida). */
function alternatingReturns(n: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? amp : -amp));
}

/** Random determinístico (LCG) para fixtures estables. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
}

describe('módulo de riesgo — medición desde precios', () => {
  it('volatilidad medida: retornos ±2% diarios ⇒ ≈31,8% anual', () => {
    const closes = closesFromReturns(alternatingReturns(251, 0.02));
    const vol = measuredVolPct(closes);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(31);
    expect(vol!).toBeLessThan(32.5);
  });

  it('con menos de 60 cierres no se mide: null', () => {
    expect(measuredVolPct(closesFromReturns(alternatingReturns(30, 0.02)))).toBeNull();
    expect(measuredVolPct(null)).toBeNull();
    expect(measuredVolPct(undefined)).toBeNull();
  });

  it('correlación de una serie consigo misma: medida 1, encogida hacia el prior', () => {
    const closes = closesFromReturns(alternatingReturns(251, 0.02));
    const spec: RiskAssetSpec = { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes };
    const twin: RiskAssetSpec = { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes };
    const d = pairCorrelation(spec, twin);
    expect(d.measured).toBeCloseTo(1, 6);
    expect(d.overlapDays).toBe(251);
    // w = 251/(251+60) = 0,807; rho = 0,807×1 + 0,193×0,65 (prior industria)
    expect(d.rho).toBeCloseTo(0.807 * 1 + 0.193 * 0.65, 2);
    expect(d.prior).toBe(0.65);
  });

  it('series inversas: la medida es −1 y el shrinkage la acerca al prior', () => {
    const up = closesFromReturns(alternatingReturns(251, 0.02));
    const down = closesFromReturns(alternatingReturns(251, -0.02));
    const d = pairCorrelation(
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: up },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes: down }
    );
    expect(d.measured).toBeCloseTo(-1, 6);
    expect(d.rho).toBeCloseTo(0.807 * -1 + 0.193 * 0.65, 2);
  });

  it('solape corto (< 20 días) o sin historia: manda el prior, sin medir', () => {
    const long = closesFromReturns(alternatingReturns(251, 0.02));
    const short = closesFromReturns(alternatingReturns(10, 0.02));
    const dShort = pairCorrelation(
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: long },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes: short }
    );
    expect(dShort.measured).toBeNull();
    expect(dShort.rho).toBe(0.65);
    const dNone = pairCorrelation(
      { key: 'A', sector: 'Technology', industry: 'Semiconductors' },
      { key: 'B', sector: 'Energy', industry: 'Oil & Gas' }
    );
    expect(dNone.rho).toBe(0.45);
    expect(dNone.measured).toBeNull();
  });

  it('priors de bloque: industria 0,65 · sector 0,55 · resto 0,45 · cripto 0,70/0,25 · caja 0', () => {
    const m = buildRiskMatrix([
      { key: 'A', sector: 'Technology', industry: 'Semiconductors' },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors' },
      { key: 'C', sector: 'Technology', industry: 'Software' },
      { key: 'D', sector: 'Energy', industry: 'Oil & Gas' },
      { key: 'E', sector: 'Crypto', isCrypto: true },
      { key: 'F', sector: 'Crypto', isCrypto: true },
      { key: 'G', isCash: true },
    ]);
    expect(m.correlation('A', 'B')).toBe(0.65);
    expect(m.correlation('A', 'C')).toBe(0.55);
    expect(m.correlation('A', 'D')).toBe(0.45);
    expect(m.correlation('E', 'F')).toBe(0.7);
    expect(m.correlation('E', 'A')).toBe(0.25);
    expect(m.correlation('G', 'A')).toBe(0);
    expect(m.correlation('A', 'A')).toBe(1);
  });
});

describe('módulo de riesgo — cadena de volatilidad (única)', () => {
  it('caja 0, medida manda, respaldo Finviz, beta × 22, cripto 60, default 26', () => {
    const closes = closesFromReturns(alternatingReturns(251, 0.02));
    expect(volForSpec({ key: 'X', isCash: true, closes })).toBe(0);
    expect(volForSpec({ key: 'X', closes, fallbackVolPct: 99, beta: 3 })).toBeCloseTo(31.8, 0);
    expect(volForSpec({ key: 'X', fallbackVolPct: 33 })).toBe(33);
    expect(volForSpec({ key: 'X', beta: 1.5 })).toBe(33);
    expect(volForSpec({ key: 'X', beta: 10 })).toBe(90); // clamp
    expect(volForSpec({ key: 'X', isCrypto: true })).toBe(60);
    expect(volForSpec({ key: 'X' })).toBe(26);
  });
});

describe('módulo de riesgo — Euler desde la matriz', () => {
  it('dos activos, priors puros: valores a mano e identidades de Euler', () => {
    const m = buildRiskMatrix([
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', fallbackVolPct: 20 },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', fallbackVolPct: 40 },
    ]);
    const d = m.decompose([
      { key: 'A', weight: 0.5 },
      { key: 'B', weight: 0.5 },
    ]);
    // A mano: σw_A = 0,046 · σw_B = 0,106 · varP = 0,076
    expect(d.portfolioVolPct).toBeCloseTo(27.57, 1);
    expect(d.mctrPct.get('A')).toBeCloseTo(16.69, 1);
    expect(d.mctrPct.get('B')).toBeCloseTo(38.45, 1);
    expect(d.pctrPct.get('A')).toBeCloseTo(30.26, 1);
    expect(d.pctrPct.get('B')).toBeCloseTo(69.74, 1);
    // Identidades: Σ PCTR = 100 · Σ w·MCTR = σ de cartera
    expect(d.pctrPct.get('A')! + d.pctrPct.get('B')!).toBeCloseTo(100, 6);
    expect(0.5 * d.mctrPct.get('A')! + 0.5 * d.mctrPct.get('B')!).toBeCloseTo(d.portfolioVolPct, 6);
  });

  it('con correlaciones medidas, la volatilidad de cartera se mueve respecto del prior', () => {
    const factor = Array.from({ length: 251 }, (_, i) => Math.sin(i / 9) * 0.012);
    const mk = (seed: number) => {
      const rnd = lcg(seed);
      return closesFromReturns(factor.map((f) => f + rnd() * 0.004));
    };
    const specs: RiskAssetSpec[] = [
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: mk(7) },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes: mk(13) },
    ];
    const measured = buildRiskMatrix(specs);
    const priorsOnly = buildRiskMatrix(specs.map((s) => ({ ...s, closes: null })));
    const entries = [
      { key: 'A', weight: 0.5 },
      { key: 'B', weight: 0.5 },
    ];
    const rho = measured.pairDetail('A', 'B');
    expect(rho.measured).not.toBeNull();
    expect(rho.measured!).toBeGreaterThan(0.8); // factor común fuerte
    // A igual volatilidad por activo, más correlación ⇒ más riesgo total
    const sameVols = (mx: ReturnType<typeof buildRiskMatrix>) =>
      mx.decompose(entries.map((e) => ({ ...e, volPct: 30 }))).portfolioVolPct;
    expect(sameVols(measured)).toBeGreaterThan(sameVols(priorsOnly));
  });
});

describe('consistencia score ↔ gráfico ↔ ficha (mismo payload, mismos campos)', () => {
  const OPTS = {
    sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
    maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
  } as const;

  it('la volatilidad del payload es la medida del módulo y el componente de riesgo del score sale de esos mismos campos', () => {
    const factor = Array.from({ length: 251 }, (_, i) => Math.sin(i / 9) * 0.012);
    const mkCloses = (seed: number, amp: number) => {
      const rnd = lcg(seed);
      return closesFromReturns(factor.map((f) => f * amp + rnd() * 0.006));
    };
    const mk = (ticker: string, seed: number, amp: number, value: number): OptimizerAssetInput => ({
      symbol: `NASDAQ:${ticker}`, ticker, name: ticker, sector: 'Technology',
      industry: 'Semiconductors', price: 100, qty: value / 100, value,
      fvBase: 200, fvConfidence: 'Media', fvComponentCount: 2,
      earningsGrowthTotalPct: 10, analystTarget: 150, salesGrowthPct: 20,
      priceHistory: mkCloses(seed, amp),
    });
    const inputs = [mk('AAA', 7, 1, 5000), mk('BBB', 13, 1, 3000), mk('CCC', 29, 0.2, 2000)];
    const result = optimizePortfolio(inputs, OPTS);
    const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
    for (const input of inputs) {
      const a = result.assets.find((x) => x.symbol === input.symbol)!;
      // (1) La volatilidad que muestra el payload ES la medida del módulo.
      expect(a.volatilityPct).toBeCloseTo(measuredVolPct(input.priceHistory)!, 6);
      // (2) El gráfico y la ficha leen mctrPct/riskContributionPct del
      // mismo payload; el componente de riesgo del score se recomputa
      // desde ESOS campos con la fórmula documentada y coincide.
      expect(a.mctrPct).not.toBeNull();
      expect(a.riskContributionPct).not.toBeNull();
      const volScore = clamp(100 - Math.max(0, a.volatilityPct - 12) * 2, 0, 100);
      const pctrScore = clamp(120 - 40 * (a.riskContributionPct! / a.weightPct), 0, 100);
      const expectedRisk = Math.round(0.7 * volScore + 0.3 * pctrScore);
      expect(a.scoreComponents?.risk).toBe(expectedRisk);
      expect(a.score).not.toBeNull();
    }
    // (3) La descomposición del resultado suma: Σ PCTR ≈ 100.
    const totalPctr = result.assets.reduce((s, a) => s + (a.riskContributionPct ?? 0), 0);
    expect(totalPctr).toBeCloseTo(100, 4);
  });
});
