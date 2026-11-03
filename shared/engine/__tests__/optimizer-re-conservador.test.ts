import { describe, it, expect } from 'vitest';
import {
  grinoldKroner,
  consensusPct,
  fvConvergencePct,
  scoreAsset,
  convergenceTargetFor,
  reConfidenceFor,
  RE_SANITY_CLAMP_PCT,
  type OptimizerAssetInput,
} from '../optimizer.js';

/**
 * Pase correctivo de la capa de RE (docs/OPTIMIZER-PROFESSIONAL.md §12,
 * desapilado de §13 y correcciones del usuario de §15): convergencia
 * al FV encogido por confianza con piso del rango SOLO bajo el
 * tripwire modelSuspect (A), SIN topes sobre las estimaciones — el
 * consenso y la convergencia entran a valor facial y el único clamp
 * es el anti-basura final [−50%, +80%] — y desacuerdo de signo en el
 * EPS (D). Fixtures sintéticos derivados de las reglas: el motor no
 * conoce tickers.
 */
const SCORE_OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX',
  ticker: 'XXX',
  name: 'Test Co',
  sector: 'Technology',
  industry: 'Semiconductors',
  price: 100,
  qty: 10,
  value: 1000,
  ...p,
});

describe('convergencia por confianza (A, desapilada §13)', () => {
  it('el destino: encogido por confianza; el piso SOLO con modelSuspect', () => {
    expect(convergenceTargetFor(100, 450, 'Alta', 150)).toEqual({ target: 450, conservative: false });
    expect(convergenceTargetFor(100, 450, 'Media', 150)).toEqual({ target: 345, conservative: false });
    // Baja SIN tripwire: encogido k=0,4 (240) — el piso ya no gobierna
    // como regla general (la prudencia vive una sola vez, en el FV).
    expect(convergenceTargetFor(100, 450, 'Baja', 150)).toEqual({ target: 240, conservative: false });
    // Con modelSuspect: el piso del rango (150) manda sobre el encogido.
    expect(convergenceTargetFor(100, 450, 'Baja', 150, true)).toEqual({ target: 150, conservative: true });
    // Con modelSuspect y piso por encima del encogido: manda el encogido.
    expect(convergenceTargetFor(100, 450, 'Baja', 440, true)).toEqual({ target: 240, conservative: true });
    // Con modelSuspect y sin rango: respaldo k=0,25.
    expect(convergenceTargetFor(100, 450, 'Baja', null, true)).toEqual({ target: 187.5, conservative: true });
    expect(convergenceTargetFor(100, null, 'Baja', 150)).toBeNull();
  });

  it('un activo Baja con rango ancho converge al encogido k=0,4 (no al piso) sin tripwire', () => {
    const a = scoreAsset(
      base({
        price: 100, fvBase: 450, fvConfidence: 'Baja', fvRangeLow: 150, fvRangeHigh: 900,
        fvComponentCount: 3, earningsGrowthTotalPct: 10, analystTarget: 150,
        volatilityPct: 30, roicPct: 15,
      }),
      1000, SCORE_OPTS
    );
    expect(a.modelSuspect).toBe(false);
    expect(a.conservativeConvergence).toBe(false);
    expect(a.fvConvergencePct!).toBeCloseTo((Math.pow(2.4, 1 / 3) - 1) * 100, 4);
    expect(a.fvEffective).toBeCloseTo(240);
    expect(a.fvRaw).toBe(450);
  });

  it('el mismo activo con el FV marcado sospechoso SÍ converge al piso del rango', () => {
    const a = scoreAsset(
      base({
        price: 100, fvBase: 450, fvConfidence: 'Baja', fvRangeLow: 150, fvRangeHigh: 900,
        fvComponentCount: 3, fvModelSuspect: true, earningsGrowthTotalPct: 10,
        analystTarget: 150, volatilityPct: 30, roicPct: 15,
      }),
      1000, SCORE_OPTS
    );
    expect(a.modelSuspect).toBe(true);
    expect(a.conservativeConvergence).toBe(true);
    expect(a.fvConvergencePct!).toBeCloseTo((Math.pow(1.5, 1 / 3) - 1) * 100, 4);
  });

  it('un activo Media con el mismo rango NO usa el piso (sigue el shrinkage)', () => {
    const a = scoreAsset(
      base({
        price: 100, fvBase: 450, fvConfidence: 'Media', fvRangeLow: 150, fvRangeHigh: 900,
        fvComponentCount: 3, earningsGrowthTotalPct: 10, analystTarget: 150,
        volatilityPct: 30, roicPct: 15,
      }),
      1000, SCORE_OPTS
    );
    expect(a.conservativeConvergence).toBe(false);
    // El destino es 345 (k=0,7) y su CAGR a 3 años entra SIN clamp
    // (51,2%): el tope histórico de +35% fue retirado por la
    // corrección del usuario 2026-11-03 (§15).
    expect(a.fvConvergencePct!).toBeCloseTo((Math.pow(3.45, 1 / 3) - 1) * 100, 4);
  });
});

describe('sin topes sobre las estimaciones (corrección 2026-11-03, §15)', () => {
  // Blend deliberadamente caliente: GK 40 (div 5 + recompra 5 +
  // crecimiento 30 a valor facial), convergencia al encogido y
  // consenso +200% (target 3× precio) sin recorte.
  const hot = (fvConfidence: 'Alta' | 'Media' | 'Baja') =>
    base({
      price: 100, fvBase: 450, fvConfidence, fvRangeLow: 440, fvComponentCount: 3,
      dividendYieldPct: 5, dilutionPct: -5, earningsGrowthTotalPct: 30,
      analystTarget: 300, volatilityPct: 30, roicPct: 15,
    });

  it('el consenso entra a valor facial: +200% y −60%, sin techo ni piso', () => {
    expect(consensusPct(base({ price: 100, analystTarget: 300 }))).toBe(200);
    expect(consensusPct(base({ price: 100, analystTarget: 40 }))).toBe(-60);
  });

  it('la convergencia entra a valor facial: CAGR 51,2% sin el clamp histórico', () => {
    expect(fvConvergencePct(base({ price: 100, fvBase: 345 }), 3)).toBeCloseTo(
      (Math.pow(3.45, 1 / 3) - 1) * 100, 4
    );
  });

  it('Baja: el RE ya no se recorta a +25% — el blend manda (~69,9%)', () => {
    const a = scoreAsset(hot('Baja'), 1000, SCORE_OPTS);
    // 0,45×40 + 0,35×33,89 (encogido k=0,4 → 240) + 0,20×200 = 69,86.
    expect(a.expectedReturnPct!).toBeCloseTo(69.86, 1);
    expect(a.expectedReturnPct!).toBeGreaterThan(60);
    expect(a.yearsToDouble!).toBeCloseTo(Math.LN2 / Math.log(1.6986), 2);
  });

  it('Media: menos encogido ⇒ más RE que Baja (la diferenciación vive en el FV, no en un tope)', () => {
    const a = scoreAsset(hot('Media'), 1000, SCORE_OPTS);
    // 0,45×40 + 0,35×51,16 (encogido k=0,7 → 345) + 0,20×200 = 75,91.
    expect(a.expectedReturnPct!).toBeCloseTo(75.91, 1);
    expect(a.expectedReturnPct!).toBeLessThan(RE_SANITY_CLAMP_PCT.max);
  });

  it('Alta: solo el clamp anti-basura final ata, y únicamente en un fixture fuera de todo caso real', () => {
    const a = scoreAsset(hot('Alta'), 1000, SCORE_OPTS);
    // Blend crudo 80,8% (FV 4,5× precio + target 3×): el único tope
    // que existe, el anti-basura de +80%, es el que lo deja en 80.
    expect(a.expectedReturnPct).toBe(RE_SANITY_CLAMP_PCT.max);
  });

  it('el clamp anti-basura también acota el lado negativo (−50%)', () => {
    const a = scoreAsset(
      base({
        price: 100, fvBase: 1, fvConfidence: 'Alta', fvComponentCount: 3,
        earningsGrowthTotalPct: -30, analystTarget: 1, volatilityPct: 30,
      }),
      1000, SCORE_OPTS
    );
    // Sin encogido (Alta): GK −30 + convergencia −78,5 (FV = 1% del
    // precio) + consenso −99 → blend crudo −60,8% → −50.
    expect(a.expectedReturnPct).toBe(RE_SANITY_CLAMP_PCT.min);
  });
});

describe('desacuerdo de signo en el EPS (D)', () => {
  it('reConfidenceFor baja un escalón solo para la capa de RE', () => {
    expect(reConfidenceFor(base({ fvConfidence: 'Alta' }))).toBe('Alta');
    expect(reConfidenceFor(base({ fvConfidence: 'Alta', epsSignDisagreement: true }))).toBe('Media');
    expect(reConfidenceFor(base({ fvConfidence: 'Media', epsSignDisagreement: true }))).toBe('Baja');
    expect(reConfidenceFor(base({ fvConfidence: 'Baja', epsSignDisagreement: true }))).toBe('Baja');
    expect(reConfidenceFor(base({ fvConfidence: null, epsSignDisagreement: true }))).toBe('Baja');
  });

  it('GK no usa crecimiento de EPS en disputa: solo ingresos; sin ingresos, crecimiento 0', () => {
    // Con desacuerdo, el EPS +40% se ignora y manda ventas +10% a
    // valor facial (ventas 10 ≤ umbral de régimen; sin datos de ancla
    // madura en el fixture, no hay techo adicional).
    expect(
      grinoldKroner(base({ epsSignDisagreement: true, epsNextYearPct: 40, epsNext5YPct: 40, salesGrowthPct: 10 }))
    ).toBeCloseTo(10, 5);
    // Ni siquiera el ancla de ganancias totales: solo ingresos.
    expect(
      grinoldKroner(base({ epsSignDisagreement: true, earningsGrowthTotalPct: 30, salesGrowthPct: 10 }))
    ).toBeCloseTo(10, 5);
    // Sin ingresos: el subcomponente vale 0 y GK computa el resto (no null).
    expect(
      grinoldKroner(base({ epsSignDisagreement: true, epsNextYearPct: 40, dividendYieldPct: 2, dilutionPct: -1 }))
    ).toBeCloseTo(3, 5);
    // Control: sin desacuerdo, el mismo input sí usa el EPS (mediana
    // 40, sin fade desde la corrección 2026-11-03).
    expect(
      grinoldKroner(base({ epsNextYearPct: 40, epsNext5YPct: 40, dividendYieldPct: 2, dilutionPct: -1 }))
    ).toBeCloseTo(43, 5);
  });

  it('un Media con desacuerdo de signo converge como Baja (encogido k=0,4)', () => {
    const a = scoreAsset(
      base({
        price: 100, fvBase: 450, fvConfidence: 'Media', fvRangeLow: 150, fvRangeHigh: 900,
        fvComponentCount: 3, epsSignDisagreement: true,
        earningsGrowthTotalPct: 10, analystTarget: 150, volatilityPct: 30, roicPct: 15,
      }),
      1000, SCORE_OPTS
    );
    expect(a.epsSignDisagreement).toBe(true);
    // Desapilado §13: sin modelSuspect no hay piso — converge al
    // encogido del escalón Baja (k=0,4 ⇒ destino 240).
    expect(a.conservativeConvergence).toBe(false);
    expect(a.fvConvergencePct!).toBeCloseTo((Math.pow(2.4, 1 / 3) - 1) * 100, 4);
    // La etiqueta pública de la valuación no se toca.
    expect(a.fvConfidence).toBe('Media');
    // Sin topes: GK 0 (EPS en disputa, sin ventas) + convergencia
    // 33,89 + consenso +50 a valor facial → 0,35×33,89 + 0,20×50.
    expect(a.expectedReturnPct!).toBeCloseTo(21.86, 1);
  });
});
