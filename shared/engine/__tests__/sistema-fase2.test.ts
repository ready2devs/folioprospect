/**
 * FASE 2 (en sombra, 2026-11-03) — regímenes de caja:
 *  - Clasificación determinista A/B/C/D/NA/sin-dato desde los
 *    componentes reportados (cashRegime.ts), con CapEx de
 *    mantenimiento (0,85×D&A vs κ sectorial) y FCF_steady.
 *  - La caja se cobra UNA sola vez: M_cash multiplicativo del
 *    score titular. La certeza vF1 ya NO resta el −6 (confianza
 *    pura); el campo cashAnchorPenaltyPts quedó desapilado en 0.
 *  - Destinos con régimen C o D: bloqueados categóricamente.
 *  - FV y RE jamás leen los componentes (Δ exacto 0).
 */
import { describe, it, expect } from 'vitest';
import {
  scoreAsset,
  headlineScoreFor,
  scoreVelocityFor,
  type CashComponents,
  type OptimizerAssetInput,
} from '../optimizer.js';
import { cashRegimeFor, capexMaintKappaPct } from '../cashRegime.js';

const OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX', ticker: 'XXX', name: 'Test Co', sector: 'Technology',
  industry: 'Semiconductors', price: 100, qty: 10, value: 1000, ...p,
});

const comp = (p: Partial<CashComponents>): CashComponents => ({
  ocfUsd: null, sbcUsd: null, sbcSource: null, sbcConcept: null,
  capexUsd: null, daUsd: null, revenueUsd: null, periodEnd: '2026-09-30',
  windowKind: 'ttm', source: 'edgar', ...p,
});

describe('Fase 2 · clasificación de regímenes (cashRegimeFor)', () => {
  it('A: FCF_real > 0 con SBC/OCF < 15% → M = 1,00, sin bloqueo', () => {
    const r = cashRegimeFor({
      components: comp({ ocfUsd: 1000, sbcUsd: 100, sbcSource: 'edgar', capexUsd: 400, daUsd: 200, revenueUsd: 5000 }),
      sector: 'Technology', industry: 'Semiconductors', roicPct: 20,
    });
    expect(r.regime).toBe('A');
    expect(r.mCash).toBe(1);
    expect(r.fcfRealUsd).toBe(500);
    expect(r.sbcToOcfPct).toBeCloseTo(10, 6);
    expect(r.legs.sbcRatioOk).toBe(true);
    expect(r.destinationBlockedByCash).toBe(false);
  });

  it('A con SBC faltante: FCF_real > 0 alcanza, con la marca sbcMissing', () => {
    const r = cashRegimeFor({
      components: comp({ ocfUsd: 1000, sbcUsd: null, capexUsd: 400 }),
      sector: 'Technology',
    });
    expect(r.regime).toBe('A');
    expect(r.sbcMissing).toBe(true);
    expect(r.ocfRealUsd).toBe(1000); // sin depurar, declarado
    expect(r.missing.some((m) => m.includes('SBC'))).toBe(true);
  });

  it('A borde: FCF_real > 0 con SBC/OCF ≥ 15% → A con la pata de ratio declarada en falso (no es una quema)', () => {
    const r = cashRegimeFor({
      components: comp({ ocfUsd: 1000, sbcUsd: 300, sbcSource: 'edgar', capexUsd: 400 }),
      sector: 'Technology',
    });
    expect(r.regime).toBe('A');
    expect(r.legs.sbcRatioOk).toBe(false);
    expect(r.missing.some((m) => m.includes('pata de ratio'))).toBe(true);
    expect(r.mCash).toBe(1);
  });

  it('B (caso AMZN): FCF_real < 0 pero OCF_real > 0, FCF_steady > 5% de ingresos y ROIC > 12,5% → M = 0,99', () => {
    const r = cashRegimeFor({
      components: comp({
        ocfUsd: 100_000, sbcUsd: 15_000, sbcSource: 'edgar', capexUsd: 120_000,
        daUsd: 30_000, revenueUsd: 600_000,
      }),
      sector: 'Consumer Cyclical', industry: 'Internet Retail', roicPct: 20,
    });
    expect(r.ocfRealUsd).toBe(85_000);
    expect(r.fcfRealUsd).toBe(-35_000);
    // CapEx_maint = min(120.000, max(0,85×30.000, 6%×600.000)) = 36.000
    expect(r.capexMaintUsd).toBe(36_000);
    expect(r.fcfSteadyUsd).toBe(49_000);
    expect(r.fcfSteadyToRevenuePct).toBeCloseTo((49_000 / 600_000) * 100, 6);
    expect(r.legs.steadyOk).toBe(true);
    expect(r.legs.roicOk).toBe(true);
    expect(r.regime).toBe('B');
    expect(r.mCash).toBe(0.99);
    expect(r.destinationBlockedByCash).toBe(false);
  });

  it('B exige el ROIC: con ROIC ≤ 12,5% o sin ROIC, el mismo flujo cae a D', () => {
    const components = comp({
      ocfUsd: 100_000, sbcUsd: 15_000, sbcSource: 'edgar', capexUsd: 120_000,
      daUsd: 30_000, revenueUsd: 600_000,
    });
    const low = cashRegimeFor({ components, sector: 'Consumer Cyclical', roicPct: 10 });
    expect(low.legs.roicOk).toBe(false);
    expect(low.regime).toBe('D');
    const none = cashRegimeFor({ components, sector: 'Consumer Cyclical', roicPct: null });
    expect(none.legs.roicOk).toBeNull();
    expect(none.regime).toBe('D');
    expect(none.missing.some((m) => m.includes('ROIC'))).toBe(true);
  });

  it('C: el FCF contable es positivo pero restando el SBC deja de serlo → M = 0,82 y bloqueo', () => {
    const r = cashRegimeFor({
      components: comp({ ocfUsd: 1000, sbcUsd: 500, sbcSource: 'edgar', capexUsd: 600 }),
      sector: 'Technology',
    });
    expect(r.fcfNoSbcUsd).toBe(400);
    expect(r.fcfRealUsd).toBe(-100);
    expect(r.legs.sbcIllusion).toBe(true);
    expect(r.regime).toBe('C');
    expect(r.mCash).toBe(0.82);
    expect(r.destinationBlockedByCash).toBe(true);
  });

  it('D: FCF_real ≤ 0 sin ilusión SBC ni pase de B → M = 0,72 y bloqueo', () => {
    const r = cashRegimeFor({
      components: comp({ ocfUsd: 300, sbcUsd: 100, sbcSource: 'edgar', capexUsd: 500, daUsd: 50, revenueUsd: 2000 }),
      sector: 'Technology', roicPct: 30,
    });
    expect(r.fcfNoSbcUsd).toBe(-200);
    expect(r.legs.sbcIllusion).toBe(false);
    expect(r.regime).toBe('D');
    expect(r.mCash).toBe(0.72);
    expect(r.destinationBlockedByCash).toBe(true);
  });

  it('D por OCF_real ≤ 0 (el SBC solo ya se come el flujo operativo)', () => {
    const r = cashRegimeFor({
      components: comp({ ocfUsd: 300, sbcUsd: 400, sbcSource: 'edgar', capexUsd: 500 }),
      sector: 'Technology',
    });
    expect(r.ocfRealUsd).toBe(-100);
    expect(r.regime).toBe('D');
  });

  it('NA: financiera, cripto y caja no se clasifican (M = 1, sin bloqueo)', () => {
    const burning = comp({ ocfUsd: -500, sbcUsd: 100, sbcSource: 'edgar', capexUsd: 900 });
    expect(cashRegimeFor({ components: burning, sector: 'Financial Services', financial: true }).regime).toBe('NA');
    expect(cashRegimeFor({ components: burning, sector: 'Technology', isCrypto: true }).regime).toBe('NA');
    expect(cashRegimeFor({ components: burning, sector: 'Technology', isCash: true }).mCash).toBe(1);
  });

  it('sin-dato: sin componentes, o sin OCF/CapEx → M = 1 con el faltante declarado (R0)', () => {
    const none = cashRegimeFor({ components: null, sector: 'Technology' });
    expect(none.regime).toBe('sin-dato');
    expect(none.mCash).toBe(1);
    expect(none.missing.length).toBeGreaterThanOrEqual(2);
    const partial = cashRegimeFor({ components: comp({ ocfUsd: 100 }), sector: 'Technology' });
    expect(partial.regime).toBe('sin-dato');
    expect(partial.missing.some((m) => m.includes('CapEx'))).toBe(true);
  });

  it('κ sectorial: software 3 · energía 12 · comunicaciones/cloud 8 · default 6', () => {
    expect(capexMaintKappaPct('Technology', 'Software - Application')).toBe(3);
    expect(capexMaintKappaPct('Energy', 'Oil & Gas E&P')).toBe(12);
    expect(capexMaintKappaPct('Communication Services', 'Internet Content & Information')).toBe(8);
    expect(capexMaintKappaPct('Technology', 'Semiconductors')).toBe(6);
    expect(capexMaintKappaPct('Consumer Cyclical', 'Internet Retail')).toBe(6);
    expect(capexMaintKappaPct(null, null)).toBe(6);
  });

  it('CapEx de mantenimiento: min(CapEx_total, max(0,85×D&A, κ×ingresos))', () => {
    const r = cashRegimeFor({
      components: comp({ ocfUsd: 5000, sbcUsd: 100, sbcSource: 'edgar', capexUsd: 1000, daUsd: 100, revenueUsd: 10_000 }),
      sector: 'Technology', industry: 'Semiconductors',
    });
    // max(85, 6% × 10.000 = 600) = 600 < 1000 → maint 600
    expect(r.capexMaintUsd).toBe(600);
    expect(r.fcfSteadyUsd).toBe(5000 - 100 - 600);
  });
});

describe('Fase 2 · integración en el score (la caja se cobra una sola vez)', () => {
  const firme = (p: Partial<OptimizerAssetInput> = {}) =>
    base({
      price: 100, fvBase: 200, fvConfidence: 'Alta', fvComponentCount: 2,
      fvRangeLow: 190, fvRangeHigh: 215,
      earningsGrowthTotalPct: 10, analystTarget: 190,
      volatilityPct: 18, ...p,
    });
  const compD = comp({ ocfUsd: 300, sbcUsd: 100, sbcSource: 'edgar', capexUsd: 500, daUsd: 50, revenueUsd: 2000 });
  const compA = comp({ ocfUsd: 1000, sbcUsd: 100, sbcSource: 'edgar', capexUsd: 400, daUsd: 200, revenueUsd: 5000 });

  it('MIGRADO (adopción F1b): el RATING de un régimen D entra con Q = 20 y la certeza NO se mueve; el M_cash sigue en el régimen', () => {
    // Motivo: el test original fijaba el M_cash ×0,72 SOBRE el
    // score titular (el multiplicativo de velocidad). El
    // paquete aprobado saca el M_cash del titular: la caja
    // entra al rating UNA vez, vía Q (D → 20). El M_cash sigue
    // existiendo en el objeto de régimen (lo usa el
    // multiplicativo, hoy infraestructura de auditoría).
    const sinDato = scoreAsset(firme(), 1000, OPTS);
    const d = scoreAsset(firme({ cashComponents: compD, roicPct: 30 }), 1000, OPTS);
    expect(sinDato.scoreBreakdown?.cashQualityQ).toBe(75);
    expect(sinDato.scoreBreakdown?.cashRegime).toBe('sin-dato');
    expect(sinDato.cashRegime?.regime).toBe('sin-dato');
    expect(d.scoreBreakdown?.cashQualityQ).toBe(20);
    expect(d.scoreBreakdown?.cashRegime).toBe('D');
    expect(d.cashRegime?.regime).toBe('D');
    expect(d.cashRegime?.mCash).toBe(0.72);
    // La certeza es confianza pura: la caja ya no la toca.
    expect(d.certaintyScore).toBe(sinDato.certaintyScore);
    // El rating cae exactamente por el factor de Q (media
    // geométrica: (20/75)^0,20 sobre los mismos otros insumos).
    const esperado = Math.round(sinDato.score! * Math.pow(20 / 75, 0.2));
    expect(Math.abs(d.score! - esperado)).toBeLessThanOrEqual(1);
    // El campo histórico quedó desapilado en 0 en ambos.
    expect(d.cashAnchorPenaltyPts).toBe(0);
    expect(sinDato.cashAnchorPenaltyPts).toBe(0);
  });

  it('la marca visible se deriva del régimen: D → todavía no genera caja; A → genera caja', () => {
    const d = scoreAsset(firme({ cashComponents: compD, roicPct: 30 }), 1000, OPTS);
    const a = scoreAsset(firme({ cashComponents: compA, roicPct: 30 }), 1000, OPTS);
    const sinDato = scoreAsset(firme(), 1000, OPTS);
    expect(d.cashAnchorState).toBe('quema-caja');
    // El FCF que respalda la marca es el FCF_real del régimen.
    expect(d.cashAnchorFcfTtmUsd).toBe(-300);
    expect(a.cashAnchorState).toBe('genera-caja');
    expect(a.cashAnchorFcfTtmUsd).toBe(500);
    // MIGRADO (adopción F1b): A ya no es «neutro» frente a
    // sin-dato en el titular — en el rating, A vale Q = 100 y
    // sin-dato Q = 75: a igual todo lo demás, el rating de A
    // es MAYOR (la caja verificada suma tranquilidad; la
    // ausencia de dato no es demérito pero tampoco prueba).
    expect(a.score!).toBeGreaterThan(sinDato.score!);
    expect(a.scoreBreakdown?.cashQualityQ).toBe(100);
  });

  it('elegibilidad: con certeza de sobra, C y D quedan bloqueados como destino; A no', () => {
    const a = scoreAsset(firme({ cashComponents: compA, roicPct: 30 }), 1000, OPTS);
    expect(a.certaintyScore!).toBeGreaterThanOrEqual(65);
    expect(a.destinationEligible).toBe(true);
    const compC = comp({ ocfUsd: 1000, sbcUsd: 500, sbcSource: 'edgar', capexUsd: 600 });
    const c = scoreAsset(firme({ cashComponents: compC, roicPct: 30 }), 1000, OPTS);
    expect(c.certaintyScore!).toBeGreaterThanOrEqual(65);
    expect(c.destinationEligible).toBe(false);
    const d = scoreAsset(firme({ cashComponents: compD, roicPct: 30 }), 1000, OPTS);
    expect(d.certaintyScore!).toBeGreaterThanOrEqual(65);
    expect(d.destinationEligible).toBe(false);
  });

  it('FV y RE no leen los componentes: Δ exacto 0 con y sin régimen', () => {
    const sin = scoreAsset(firme(), 1000, OPTS);
    const con = scoreAsset(firme({ cashComponents: compD, roicPct: 30 }), 1000, OPTS);
    expect(con.expectedReturnPct).toBe(sin.expectedReturnPct);
    expect(con.expectedReturnPessimisticPct).toBe(sin.expectedReturnPessimisticPct);
    expect(con.fvEffective).toBe(sin.fvEffective);
    expect(con.gkPct).toBe(sin.gkPct);
    expect(con.fvConvergencePct).toBe(sin.fvConvergencePct);
    expect(con.consensusPct).toBe(sin.consensusPct);
  });

  it('invariante con M_cash: el score nunca supera velocidad + tilt (grilla)', () => {
    for (const rePct of [-20, 0, 15, 40, 64]) {
      for (const m of [1, 0.99, 0.82, 0.72]) {
        const { score, breakdown } = headlineScoreFor({
          rePct, certaintyScore: 80, riskSubscale: 80,
          cashPenaltyPts: 0, cashMultiplier: m, momentumTiltPts: 3, modelSuspect: false,
        });
        expect(score!).toBeLessThanOrEqual(Math.ceil(scoreVelocityFor(rePct)) + 3);
        expect(breakdown!.cashMultiplier).toBe(m);
      }
    }
  });

  it('headlineScoreFor sin cashMultiplier se comporta como la Fase 1 (default M = 1)', () => {
    const args = {
      rePct: 30, certaintyScore: 70, riskSubscale: 60,
      cashPenaltyPts: 0, momentumTiltPts: 2, modelSuspect: false,
    };
    expect(headlineScoreFor(args).score).toBe(headlineScoreFor({ ...args, cashMultiplier: 1 }).score);
    expect(headlineScoreFor(args).breakdown?.cashRegime).toBeNull();
  });
});
