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
 *
 * ADOPCIÓN F1b (2026-11-03): el titular pasó a ser el RATING
 * DE TRANQUILIDAD. Las propiedades 2 y 4 se migraron a la
 * semántica nueva (el momentum ya no toca el titular; el
 * listón lee el rating) y la 3 se reescribió como composición
 * del rating — cada migración está declarada en su test. La
 * fórmula multiplicativa de R14/Fase 1 sigue cubierta a nivel
 * función (headlineScoreFor) como infraestructura.
 */
import { describe, expect, it } from 'vitest';
import {
  headlineScoreFor,
  momentumTiltFor,
  ratingBandFor,
  scoreAsset,
  scoreVelocityFor,
  tranquilityRatingFor,
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

  it('solo revisiones (sin precio): la pata de confirmación computa, pero el tilt queda TOPADO (Fase 1)', () => {
    const t = momentumTiltFor(base({ epsRevisionUp30: 6, epsRevisionDown30: 2 }));
    expect(t.priceLeg).toBeNull();
    expect(t.revisionLeg).toBeCloseTo(0.75, 9);
    // FASE 1 (corrección pendiente de R14 §9.6): sin pata de
    // precio, las revisiones solas NO pueden dar el tilt alto:
    // 5 × 0,75 = 3,75 queda topado a +1,5.
    expect(t.tiltPts).toBe(1.5);
  });
});

describe('R14 · el momentum tocaba SOLO el score (histórico) → ADOPCIÓN F1b: ya no toca el titular', () => {
  const comun = {
    price: 100, fvBase: 200, fvConfidence: 'Media' as const, fvComponentCount: 2,
    fvRangeLow: 170, fvRangeHigh: 240, earningsGrowthTotalPct: 12,
    analystTarget: 180, volatilityPct: 30,
  };
  it('MIGRADO (adopción F1b): FV, RE, certeza y RATING idénticos con tilt activo o anulado — el rating no lleva tilt', () => {
    // Motivo de la migración: en R14/Fase 1 el titular era la
    // velocidad cobrada (con tilt de momentum sumado al final).
    // El paquete aprobado define el rating SIN tilt: el
    // momentum es ritmo, no tranquilidad. El tilt sigue
    // existiendo como dato de auditoría en el payload.
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
    // El RATING no se mueve con el momentum.
    expect(con.score).toBe(sin.score);
  });
});

describe('ADOPCIÓN F1b · composición del RATING titular (recomposición a mano)', () => {
  it('rating = 100 × (certeza)^0,45 × (riesgo)^0,35 × (Q)^0,20, sin tilt y sin M_cash; techo 39 si sospechoso', () => {
    // MIGRADO desde «FASE 1 · composición del score titular»:
    // ese test fijaba el multiplicativo de velocidad como
    // titular; el paquete aprobado lo reemplaza por el rating
    // de tranquilidad. La fórmula del multiplicativo sigue
    // cubierta a nivel función (headlineScoreFor) más abajo.
    const s = scoreAsset(base({
      price: 100, fvBase: 200, fvConfidence: 'Media', fvComponentCount: 2,
      fvRangeLow: 160, fvRangeHigh: 260, earningsGrowthTotalPct: 10,
      analystTarget: 190, volatilityPct: 30,
    }), 1000, OPTS);
    const b = s.scoreBreakdown!;
    expect(b.certaintyScore).toBe(s.certaintyScore);
    expect(b.riskSubscale).toBe(s.riskSubscale);
    expect(b.cashRegime).toBe('sin-dato'); // sin componentes de caja
    expect(b.cashQualityQ).toBe(75);
    expect(b.certaintyExponent).toBe(0.45);
    expect(b.riskExponent).toBe(0.35);
    expect(b.cashExponent).toBe(0.2);
    const recomp = tranquilityRatingFor({
      certaintyScore: s.certaintyScore,
      riskSubscale: s.riskSubscale,
      cashRegime: s.cashRegime?.regime ?? null,
      modelSuspect: s.modelSuspect,
    });
    expect(recomp.rating).toBe(s.score);
    expect(s.score).toBe(
      Math.round(100 *
        Math.pow(s.certaintyScore! / 100, 0.45) *
        Math.pow(s.riskSubscale! / 100, 0.35) *
        Math.pow(75 / 100, 0.2))
    );
    expect(s.ratingBand).toBe(ratingBandFor(s.score));
    // Techo 39 si el modelo es sospechoso.
    const susp = scoreAsset(base({
      price: 100, fvBase: 200, fvConfidence: 'Media', fvComponentCount: 2,
      fvRangeLow: 160, fvRangeHigh: 260, earningsGrowthTotalPct: 10,
      analystTarget: 190, volatilityPct: 30, fvModelSuspect: true,
    }), 1000, OPTS);
    expect(susp.score!).toBeLessThanOrEqual(39);
  });

  it('la fórmula del multiplicativo de velocidad (Fases 1–2) sigue viva como infraestructura de auditoría', () => {
    const h = headlineScoreFor({
      rePct: 30, certaintyScore: 80, riskSubscale: 60,
      cashPenaltyPts: 0, cashMultiplier: 0.72, cashRegime: 'D',
      momentumTiltPts: 2, modelSuspect: false,
    });
    const manual = Math.round(
      scoreVelocityFor(30) * Math.pow(0.8, 0.6) * Math.pow(0.6, 0.4) * 0.72 + 2
    );
    expect(h.score).toBe(Math.max(0, Math.min(100, manual)));
    expect(h.breakdown?.cashMultiplier).toBe(0.72);
    expect(h.breakdown?.cashRegime).toBe('D');
  });
});

describe('ADOPCIÓN F1b · el listón de destinos lee el RATING (antes leía la certeza)', () => {
  it('rápido pero incierto: NO es destino (certeza baja ⇒ rating bajo)', () => {
    // El fixture es incierto en los términos de la certeza vF1 —
    // patas en desacuerdo (etiqueta Baja), fuentes en conflicto
    // de signo y un consenso de apenas 3 analistas. Con la
    // certeza baja, el rating (que la lleva con exponente 0,45)
    // también queda bajo el listón.
    const s = scoreAsset(base({
      price: 100, fvBase: 250, fvConfidence: 'Baja', fvComponentCount: 2,
      fvRangeLow: 180, fvRangeHigh: 330, earningsGrowthTotalPct: 10,
      epsSignDisagreement: true,
      analystTarget: 240, analystCount: 3, analystTargetLow: 180, analystTargetHigh: 330,
      volatilityPct: 55,
    }), 1000, OPTS);
    expect(s.certaintyScore!).toBeLessThan(65);
    expect(s.score!).toBeLessThan(65);
    expect(s.destinationEligible).toBe(false);
  });

  it('lento pero tranquilo: SÍ es destino — por su RATING, no por su velocidad', () => {
    // MIGRADO desde R14 («la certeza manda»): el activo es
    // lento (poco upside) pero su predicción es firme, su
    // riesgo de desvío bajo y su caja neutra: el rating supera
    // el listón aunque la velocidad sea modesta. Esa es la
    // semántica aprobada: un destino se elige por tranquilidad.
    const s = scoreAsset(base({
      price: 100, fvBase: 130, fvConfidence: 'Alta', fvComponentCount: 2,
      fvRangeLow: 125, fvRangeHigh: 136, earningsGrowthTotalPct: 6,
      analystTarget: 128, volatilityPct: 15,
    }), 1000, OPTS);
    expect(s.certaintyScore!).toBeGreaterThanOrEqual(65);
    expect(s.score!).toBeGreaterThanOrEqual(65);
    expect(s.destinationEligible).toBe(true);
  });

  it('certeza ≥ 65 pero rating < 65 (riesgo de desvío alto): NO es destino — el caso CRDO de la evaluación', () => {
    // NUEVO (adopción F1b): discrimina el gate nuevo del viejo.
    // Con el listón de certeza (Fase 2) este activo ENTRABA;
    // con el listón de rating queda fuera sin necesidad del
    // piso de riskSubscale ≥ 40 que no se adoptó.
    const s = scoreAsset(base({
      price: 100, fvBase: 200, fvConfidence: 'Alta', fvComponentCount: 2,
      fvRangeLow: 190, fvRangeHigh: 215, earningsGrowthTotalPct: 10,
      analystTarget: 190, volatilityPct: 95,
    }), 1000, OPTS);
    expect(s.certaintyScore!).toBeGreaterThanOrEqual(65);
    expect(s.riskSubscale!).toBeLessThan(45);
    expect(s.score!).toBeLessThan(65);
    expect(s.destinationEligible).toBe(false);
  });
});
