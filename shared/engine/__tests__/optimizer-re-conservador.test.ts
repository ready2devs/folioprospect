import { describe, it, expect } from 'vitest';
import {
  grinoldKroner,
  scoreAsset,
  convergenceTargetFor,
  reConfidenceFor,
  RE_CONFIDENCE_CAP_PCT,
  type OptimizerAssetInput,
} from '../optimizer.js';

/**
 * Pase correctivo de la capa de RE (docs/OPTIMIZER-PROFESSIONAL.md §12,
 * con la recalibración del desapilado de §13): convergencia al FV
 * encogido por confianza con piso del rango SOLO bajo el tripwire
 * modelSuspect (A), topes de RE por confianza en una sola capa
 * +35/+30/+25 (B) y desacuerdo de signo en el EPS (D). Fixtures
 * sintéticos derivados de las reglas: el motor no conoce tickers.
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
    // El destino es 345 (k=0,7): su CAGR a 3 años sería 51,1%, pero el
    // componente de convergencia conserva su clamp histórico de +35%.
    expect(a.fvConvergencePct!).toBe(35);
  });
});

describe('topes de RE por confianza (B)', () => {
  // Blend crudo deliberadamente altísimo: GK 26,8 (div 5 + recompra 5 +
  // crecimiento 30 con fade), convergencia y consenso en sus techos.
  const hot = (fvConfidence: 'Alta' | 'Media' | 'Baja') =>
    base({
      price: 100, fvBase: 450, fvConfidence, fvRangeLow: 440, fvComponentCount: 3,
      dividendYieldPct: 5, dilutionPct: -5, earningsGrowthTotalPct: 30,
      analystTarget: 300, volatilityPct: 30, roicPct: 15,
    });

  it('Baja: el RE final no supera +25% aunque el blend crudo dé ~31%', () => {
    const a = scoreAsset(hot('Baja'), 1000, SCORE_OPTS);
    expect(a.expectedReturnPct).toBe(RE_CONFIDENCE_CAP_PCT.Baja);
    expect(a.expectedReturnPct).toBe(25);
    expect(a.yearsToDouble!).toBeCloseTo(Math.LN2 / Math.log(1.25), 4);
  });

  it('Media: tope +30%', () => {
    const a = scoreAsset(hot('Media'), 1000, SCORE_OPTS);
    expect(a.expectedReturnPct).toBe(30);
  });

  it('Alta: el mismo blend queda por debajo del techo histórico (+35%) y no se recorta', () => {
    const a = scoreAsset(hot('Alta'), 1000, SCORE_OPTS);
    expect(a.expectedReturnPct!).toBeGreaterThan(30);
    expect(a.expectedReturnPct!).toBeLessThanOrEqual(35);
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
    // Con desacuerdo, el EPS +40% se ignora y manda ventas +10% (fade 7,8).
    expect(
      grinoldKroner(base({ epsSignDisagreement: true, epsNextYearPct: 40, epsNext5YPct: 40, salesGrowthPct: 10 }))
    ).toBeCloseTo(7.8, 5);
    // Ni siquiera el ancla de ganancias totales: solo ingresos.
    expect(
      grinoldKroner(base({ epsSignDisagreement: true, earningsGrowthTotalPct: 30, salesGrowthPct: 10 }))
    ).toBeCloseTo(7.8, 5);
    // Sin ingresos: el subcomponente vale 0 y GK computa el resto (no null).
    expect(
      grinoldKroner(base({ epsSignDisagreement: true, epsNextYearPct: 40, dividendYieldPct: 2, dilutionPct: -1 }))
    ).toBeCloseTo(3, 5);
    // Control: sin desacuerdo, el mismo input sí usa el EPS (mediana 40 → fade 16,8).
    expect(
      grinoldKroner(base({ epsNextYearPct: 40, epsNext5YPct: 40, dividendYieldPct: 2, dilutionPct: -1 }))
    ).toBeCloseTo(19.8, 5);
  });

  it('un Media con desacuerdo de signo converge como Baja (encogido k=0,4) y respeta el tope Baja', () => {
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
    expect(a.expectedReturnPct!).toBeLessThanOrEqual(RE_CONFIDENCE_CAP_PCT.Baja);
  });
});
