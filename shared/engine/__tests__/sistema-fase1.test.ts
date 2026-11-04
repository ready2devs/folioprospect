/**
 * FASE 1 (en sombra, 2026-11-03) — score multiplicativo, doble
 * horizonte EWMA y certeza vF1:
 *  A) score = velocidad × (certeza)^0,6 × (riesgo)^0,4 + tilt,
 *     con la calibración pedida y el invariante score ≤ vel+tilt;
 *     tope de tilt +1,5 sin pata de precio.
 *  B) correlaciones con memoria larga (λ 0,985, shrinkage n0=30)
 *     y prior 0,22 para distinto sector Y distinta región.
 *  C) certeza vF1: el riesgo SALE del índice (vive en
 *     riskSubscale) y entra la credibilidad del consenso
 *     (N, dispersión, sticky) — solo en la certeza, jamás en
 *     el FV ni en el RE.
 */
import { describe, it, expect } from 'vitest';
import {
  scoreAsset,
  headlineScoreFor,
  momentumTiltFor,
  scoreVelocityFor,
  scoreRetentionFactors,
  consensusCredibilityFor,
  trailingReturnPct,
  type OptimizerAssetInput,
} from '../optimizer.js';
import { priorCorrelation, type RiskAssetSpec } from '../riskMatrix.js';

const OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX', ticker: 'XXX', name: 'Test Co', sector: 'Technology',
  industry: 'Semiconductors', price: 100, qty: 10, value: 1000, ...p,
});

const flatCloses = (n: number, c = 100) =>
  Array.from({ length: n }, (_, i) => ({ t: 1_700_000_000_000 + i * 86_400_000, c }));

describe('Fase 1A · calibración de los factores de retención', () => {
  it('certeza ~85 y riesgo ~70 conservan 75–85% de la velocidad', () => {
    const { certaintyFactor, riskFactor } = scoreRetentionFactors(85, 70);
    const retention = certaintyFactor * riskFactor;
    expect(retention).toBeGreaterThanOrEqual(0.75);
    expect(retention).toBeLessThanOrEqual(0.85);
    expect(retention).toBeCloseTo(0.786, 2);
  });

  it('certeza ~36 y riesgo ~28 conservan 30–40% de la velocidad', () => {
    const { certaintyFactor, riskFactor } = scoreRetentionFactors(36, 28);
    const retention = certaintyFactor * riskFactor;
    expect(retention).toBeGreaterThanOrEqual(0.3);
    expect(retention).toBeLessThanOrEqual(0.4);
    expect(retention).toBeCloseTo(0.325, 2);
  });

  it('sin índice (null), el factor es 1: la ausencia de dato no castiga (R0)', () => {
    expect(scoreRetentionFactors(null, null)).toEqual({ certaintyFactor: 1, riskFactor: 1 });
  });

  it('una velocidad saturada con certeza y riesgo bajos ya NO lidera: 100 → ~33', () => {
    const { score } = headlineScoreFor({
      rePct: 75, certaintyScore: 36, riskSubscale: 28,
      cashPenaltyPts: -6, momentumTiltPts: 0, modelSuspect: false,
    });
    expect(scoreVelocityFor(75)).toBe(100);
    expect(score!).toBeLessThanOrEqual(35);
    expect(score!).toBeGreaterThanOrEqual(28);
  });

  it('invariante: el score nunca supera velocidad + tilt (grilla)', () => {
    for (const rePct of [-20, 0, 15, 40, 64, 80]) {
      for (const cert of [5, 36, 62, 85, 100]) {
        for (const risk of [5, 28, 55, 83, 100]) {
          const { score, breakdown } = headlineScoreFor({
            rePct, certaintyScore: cert, riskSubscale: risk,
            cashPenaltyPts: 0, momentumTiltPts: 3, modelSuspect: false,
          });
          expect(score!).toBeLessThanOrEqual(Math.ceil(scoreVelocityFor(rePct)) + 3);
          expect(breakdown!.certaintyFactor).toBeLessThanOrEqual(1);
          expect(breakdown!.riskFactor).toBeLessThanOrEqual(1);
          expect(Number.isFinite(score!)).toBe(true);
        }
      }
    }
  });

  it('modelSuspect sigue techando el score en 39 aunque la velocidad sea máxima', () => {
    const { score } = headlineScoreFor({
      rePct: 80, certaintyScore: 95, riskSubscale: 95,
      cashPenaltyPts: 0, momentumTiltPts: 5, modelSuspect: true,
    });
    expect(score!).toBeLessThanOrEqual(39);
  });
});

describe('Fase 1A · tope de tilt sin pata de precio', () => {
  it('revisiones perfectas sin datos de precio: tilt 1,5 (antes 5,0)', () => {
    const t = momentumTiltFor(base({ epsRevisionUp30: 9, epsRevisionDown30: 0 }));
    expect(t.priceLeg).toBeNull();
    expect(t.tiltPts).toBe(1.5);
  });

  it('con pata de precio, el tilt puede superar 1,5 como siempre', () => {
    const t = momentumTiltFor(base({
      sma50DistPct: 12, sma200DistPct: 25, perfYearPct: 90, rsi14: 55,
      epsRevisionUp30: 9, epsRevisionDown30: 0,
    }));
    expect(t.tiltPts).toBeGreaterThan(1.5);
    expect(t.tiltPts).toBeLessThanOrEqual(5);
  });
});

describe('Fase 1B · prior de correlación por región', () => {
  const spec = (p: Partial<RiskAssetSpec>): RiskAssetSpec => ({ key: 'X', ...p });
  it('distinto sector Y distinta región → 0,22 (caso VIST vs tech US)', () => {
    const vist = spec({ key: 'VIST', sector: 'Energy', region: 'Mexico' });
    const nvda = spec({ key: 'NVDA', sector: 'Technology', region: 'United States' });
    expect(priorCorrelation(vist, nvda)).toBe(0.22);
  });
  it('mismo sector aunque difiera la región → 0,55 (el prior sectorial manda)', () => {
    const a = spec({ key: 'A', sector: 'Energy', region: 'Mexico' });
    const b = spec({ key: 'B', sector: 'Energy', region: 'United States' });
    expect(priorCorrelation(a, b)).toBe(0.55);
  });
  it('sin región en alguno → 0,45 de siempre (el dato faltante no inventa descorrelación)', () => {
    const a = spec({ key: 'A', sector: 'Energy', region: null });
    const b = spec({ key: 'B', sector: 'Technology', region: 'United States' });
    expect(priorCorrelation(a, b)).toBe(0.45);
  });
});

describe('Fase 1C · credibilidad del consenso', () => {
  const fields = (p: Record<string, unknown>) => ({
    fvConfidence: null, fvComponentCount: null, fvBase: null, cashPenaltyPts: 0, ...p,
  }) as never;

  it('masa crítica: N=2 vale ~22; N=35, ~83; N=58, ~89', () => {
    expect(consensusCredibilityFor(fields({ analystCount: 2 }))!.countScore).toBe(22);
    expect(consensusCredibilityFor(fields({ analystCount: 35 }))!.countScore).toBe(83);
    expect(consensusCredibilityFor(fields({ analystCount: 58 }))!.countScore).toBe(89);
  });

  it('acuerdo: rango angosto no resta; rango de 100% deja el acuerdo en ~45', () => {
    const narrow = consensusCredibilityFor(fields({ analystTarget: 150, analystTargetLow: 140, analystTargetHigh: 165 }))!;
    expect(narrow.dispersionScore).toBe(100);
    const wide = consensusCredibilityFor(fields({ analystTarget: 150, analystTargetLow: 75, analystTargetHigh: 225 }))!;
    expect(wide.dispersionScore).toBeGreaterThan(40);
    expect(wide.dispersionScore).toBeLessThan(50);
  });

  it('sticky: upside 80% + caída de 30% + revisiones a la baja → factor castigado (42)', () => {
    // S = 1,0 (upside) × 0,30 (caída) × 0,906 (breadth −0,56)
    // = 0,27 → 100·exp(−3,2 × 0,27) ≈ 42.
    const c = consensusCredibilityFor(fields({
      analystTarget: 180, price: 100, ret3mPct: -30, ret6mPct: -35,
      epsRevisionUp30: 1, epsRevisionDown30: 6,
    }))!;
    expect(c.stickyScore!).toBe(42);
  });

  it('sticky extremo: upside 150% + caída de 45% + breadth −1 → factor ~1', () => {
    const c = consensusCredibilityFor(fields({
      analystTarget: 250, price: 100, ret3mPct: -45, ret6mPct: -50,
      epsRevisionUp30: 0, epsRevisionDown30: 9,
    }))!;
    expect(c.stickyScore!).toBeLessThan(10);
  });

  it('sticky NO se activa si las revisiones suben (caída por simpatía = oportunidad)', () => {
    const c = consensusCredibilityFor(fields({
      analystTarget: 180, price: 100, ret3mPct: -30, ret6mPct: -35,
      epsRevisionUp30: 8, epsRevisionDown30: 0,
    }))!;
    expect(c.stickyScore).toBe(100);
  });

  it('upside ≤ 30%: nada que sospechar, sticky 100', () => {
    const c = consensusCredibilityFor(fields({
      analystTarget: 120, price: 100, ret3mPct: -30, epsRevisionUp30: 0, epsRevisionDown30: 5,
    }))!;
    expect(c.stickyScore).toBe(100);
  });

  it('sin ningún insumo: null (no se inventa credibilidad)', () => {
    expect(consensusCredibilityFor(fields({}))).toBeNull();
  });

  it('los faltantes se declaran y las patas disponibles renormalizan', () => {
    const c = consensusCredibilityFor(fields({ analystCount: 20 }))!;
    expect(c.score).toBe(74); // solo la pata de conteo
    expect(c.missing.join(' ')).toContain('rango');
  });
});

describe('Fase 1C · la certeza vF1 no contiene riesgo; el RE/FV no se enteran del consenso', () => {
  const firme = (p: Partial<OptimizerAssetInput> = {}) => base({
    price: 100, fvBase: 200, fvPesimista: 150, fvOptimista: 260,
    fvConfidence: 'Media', fvComponentCount: 2, fvRangeLow: 160, fvRangeHigh: 260,
    earningsGrowthTotalPct: 10, analystTarget: 150, volatilityPct: 25,
    analystCount: 20, analystTargetLow: 120, analystTargetHigh: 190,
    priceHistory: flatCloses(130),
    ...p,
  });

  it('misma certeza con volatilidad 20 o 60; riskSubscale distinto', () => {
    const calm = scoreAsset(firme({ volatilityPct: 20 }), 1000, OPTS);
    const wild = scoreAsset(firme({ volatilityPct: 60 }), 1000, OPTS);
    expect(calm.certaintyScore).toBe(wild.certaintyScore);
    expect(wild.riskSubscale!).toBeLessThan(calm.riskSubscale!);
    // El score sí cobra el riesgo (vía el factor): el volátil puntúa menos.
    expect(wild.score!).toBeLessThan(calm.score!);
  });

  it('consenso débil (N=2, rango ancho) vs fuerte (N=50, rango angosto): MISMO FV y MISMO RE, distinta certeza', () => {
    const weak = scoreAsset(firme({ analystCount: 2, analystTargetLow: 60, analystTargetHigh: 320 }), 1000, OPTS);
    const strong = scoreAsset(firme({ analystCount: 50, analystTargetLow: 140, analystTargetHigh: 165 }), 1000, OPTS);
    expect(weak.fvEffective).toBe(strong.fvEffective);
    expect(weak.expectedReturnPct).toBe(strong.expectedReturnPct);
    expect(weak.certaintyScore!).toBeLessThan(strong.certaintyScore!);
    expect(weak.score!).toBeLessThan(strong.score!);
  });

  it('trailingReturnPct: +10% en 63 ruedas; historia corta → null', () => {
    const closes = [...flatCloses(63), { t: 1_700_000_000_000 + 63 * 86_400_000, c: 110 }];
    expect(trailingReturnPct(closes, 63)).toBeCloseTo(10, 6);
    expect(trailingReturnPct(flatCloses(30), 63)).toBeNull();
  });
});
