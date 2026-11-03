/**
 * R14 — Score de revalorización (velocidad cobrada al riesgo y a
 * la incertidumbre) + tilt de momentum acotado + sub-índice de
 * certeza como número de las reglas de fiabilidad.
 *
 * Propiedades que se fijan acá:
 *  1. El tilt vive en [0, +5], nunca resta, y el RSI ≥ 80 lo anula.
 *  2. El momentum toca SOLO el score: FV y RE idénticos con el
 *     tilt activo o anulado (test de recomposición obligatorio).
 *  3. La composición del score se recompone a mano desde los
 *     campos del payload (velocidad − restricciones + tilt).
 *  4. El listón de destinos lee la CERTEZA, no el score titular:
 *     un activo rápido pero incierto NO es destino; uno lento
 *     pero cierto SÍ puede serlo.
 */
import { describe, expect, it } from 'vitest';
import {
  headlineScoreFor,
  momentumTiltFor,
  scoreAsset,
  scoreVelocityFor,
  type OptimizerAssetInput,
} from '../optimizer.js';

const OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX', ticker: 'XXX', name: 'Test Co', sector: 'Technology',
  industry: 'Semiconductors', price: 100, qty: 10, value: 1000, ...p,
});

describe('R14 · tilt de momentum: acotado, solo positivo, con freno de euforia', () => {
  it('sin ningún dato de momentum: tilt 0 (R0)', () => {
    expect(momentumTiltFor(base({})).tiltPts).toBe(0);
  });

  it('tendencia firme + rendimiento + revisiones al alza: tilt alto, nunca más de 5', () => {
    const t = momentumTiltFor(base({
      sma50DistPct: 12, sma200DistPct: 25, perfYearPct: 90, rsi14: 55,
      epsRevisionUp30: 9, epsRevisionDown30: 0,
    }));
    expect(t.tiltPts).toBeGreaterThan(4);
    expect(t.tiltPts).toBeLessThanOrEqual(5);
  });

  it('todo en contra (bajo las medias, año negativo, revisiones a la baja): tilt 0, jamás negativo', () => {
    const t = momentumTiltFor(base({
      sma50DistPct: -8, sma200DistPct: -20, perfYearPct: -35, rsi14: 30,
      epsRevisionUp30: 0, epsRevisionDown30: 7,
    }));
    expect(t.tiltPts).toBe(0);
  });

  it('RSI ≥ 80 anula el tilt aunque la tendencia sea perfecta (freno de euforia)', () => {
    const t = momentumTiltFor(base({
      sma50DistPct: 15, sma200DistPct: 30, perfYearPct: 120, rsi14: 84,
      epsRevisionUp30: 5, epsRevisionDown30: 0,
    }));
    expect(t.tiltPts).toBe(0);
    expect(t.rsiBrake).toBe(0);
  });

  it('entre RSI 70 y 80 el freno reduce el tilt a la mitad (a 75)', () => {
    const sin = momentumTiltFor(base({ sma50DistPct: 8, sma200DistPct: 15, perfYearPct: 60, rsi14: 60 }));
    const con = momentumTiltFor(base({ sma50DistPct: 8, sma200DistPct: 15, perfYearPct: 60, rsi14: 75 }));
    expect(con.rsiBrake).toBeCloseTo(0.5, 9);
    expect(con.tiltPts).toBeCloseTo(sin.tiltPts / 2, 1);
  });

  it('solo revisiones (sin precio): la pata de confirmación computa sola', () => {
    const t = momentumTiltFor(base({ epsRevisionUp30: 6, epsRevisionDown30: 2 }));
    expect(t.priceLeg).toBeNull();
    expect(t.revisionLeg).toBeCloseTo(0.75, 9);
    expect(t.tiltPts).toBeCloseTo(3.8, 1); // 5 × 0,75
  });
});

describe('R14 · el momentum toca SOLO el score (recomposición)', () => {
  const comun = {
    price: 100, fvBase: 200, fvConfidence: 'Media' as const, fvComponentCount: 2,
    fvRangeLow: 170, fvRangeHigh: 240, earningsGrowthTotalPct: 12,
    analystTarget: 180, volatilityPct: 30,
  };
  it('FV y RE idénticos con tilt activo o anulado; el score difiere solo por el tilt', () => {
    const sin = scoreAsset(base({ ...comun }), 1000, OPTS);
    const con = scoreAsset(base({
      ...comun, sma50DistPct: 10, sma200DistPct: 20, perfYearPct: 70, rsi14: 50,
      epsRevisionUp30: 4, epsRevisionDown30: 1,
    }), 1000, OPTS);
    expect(con.fvEffective).toBe(sin.fvEffective);
    expect(con.expectedReturnPct).toBe(sin.expectedReturnPct);
    expect(con.certaintyScore).toBe(sin.certaintyScore); // la certeza tampoco lo lee
    expect(con.momentum).not.toBeNull();
    expect(con.momentum!.tiltPts).toBeGreaterThan(0);
    expect(sin.momentum).toBeNull();
    // La diferencia de score es el tilt (salvo redondeo de enteros).
    expect(Math.abs((con.score! - sin.score!) - con.momentum!.tiltPts)).toBeLessThanOrEqual(1);
  });
});

describe('R14 · composición del score titular (recomposición a mano)', () => {
  it('velocidad − 0,35×riesgo − 0,30×incertidumbre − caja + tilt, con techo 39 si sospechoso', () => {
    const s = scoreAsset(base({
      price: 100, fvBase: 200, fvConfidence: 'Media', fvComponentCount: 2,
      fvRangeLow: 160, fvRangeHigh: 260, earningsGrowthTotalPct: 10,
      analystTarget: 190, volatilityPct: 30,
    }), 1000, OPTS);
    const b = s.scoreBreakdown!;
    expect(b.velocity).toBeCloseTo(scoreVelocityFor(s.expectedReturnPct!), 0);
    const dispersion = (s.certaintyComponents!.legs! * 35 + s.certaintyComponents!.sources! * 30) / 65;
    expect(b.riskRestrictionPts).toBeCloseTo((100 - s.certaintyComponents!.risk!) * 0.35, 0);
    expect(b.uncertaintyRestrictionPts).toBeCloseTo((100 - dispersion) * 0.3, 0);
    const recomp = headlineScoreFor({
      rePct: s.expectedReturnPct,
      certaintyComponents: s.certaintyComponents,
      cashPenaltyPts: s.cashAnchorPenaltyPts,
      momentumTiltPts: s.momentum?.tiltPts ?? 0,
      modelSuspect: s.modelSuspect,
    });
    expect(recomp.score).toBe(s.score);
    expect(s.score).toBe(
      Math.max(0, Math.min(100, Math.round(
        scoreVelocityFor(s.expectedReturnPct!) - b.riskRestrictionPts - b.uncertaintyRestrictionPts +
        b.cashPenaltyPts + b.momentumTiltPts
      )))
    );
  });
});

describe('R14 · el listón de destinos lee la CERTEZA, no el score titular', () => {
  it('rápido pero incierto: NO es destino aunque su velocidad sea alta', () => {
    const s = scoreAsset(base({
      price: 100, fvBase: 250, fvConfidence: 'Media', fvComponentCount: 2,
      fvRangeLow: 180, fvRangeHigh: 330, earningsGrowthTotalPct: 10,
      analystTarget: 240, volatilityPct: 55,
    }), 1000, OPTS);
    expect(s.certaintyScore!).toBeLessThan(65);
    expect(s.destinationEligible).toBe(false);
  });

  it('lento pero cierto: SÍ es destino (la certeza manda, no el atractivo)', () => {
    const s = scoreAsset(base({
      price: 100, fvBase: 130, fvConfidence: 'Alta', fvComponentCount: 2,
      fvRangeLow: 125, fvRangeHigh: 136, earningsGrowthTotalPct: 6,
      analystTarget: 128, volatilityPct: 15,
    }), 1000, OPTS);
    expect(s.certaintyScore!).toBeGreaterThanOrEqual(65);
    expect(s.destinationEligible).toBe(true);
    // Y su score titular es modesto: elegible por fiable, no por rápido.
    expect(s.score!).toBeLessThan(65);
  });
});
