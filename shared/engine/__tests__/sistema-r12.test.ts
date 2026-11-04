import { describe, it, expect } from 'vitest';
import {
  scoreAsset,
  optimizePortfolio,
  growthAnchorFor,
  grinoldKroner,
  consensusPct,
  cashAnchorFor,
  tranquilityRatingFor,
  type OptimizerAssetInput,
} from '../optimizer.js';
import { pePairFor } from '../fairvalue.js';

/**
 * Sistema R12 (aprobado por el usuario 2026-11-03; docs/VALUATION-RULES.md
 * R12 y docs/OPTIMIZER-PROFESSIONAL.md §17):
 *  1) Escala de velocidad del score recalibrada (el 100 excepcional).
 *  2) Vista prudente: lectura contra el piso del rango de FV, sin
 *     tocar ningún número de la vista esperada.
 *  3) Régimen del ancla de GK clasificado por ventas FUTURAS de
 *     consenso y frontera suave (banda ±5 pp sobre el umbral 12,5%).
 *  4) Ancla de caja real: reparo de hasta −6 pts en el score si el
 *     FCF de los últimos 12 meses reportados (TTM) fue negativo;
 *     jamás toca FV ni RE.
 */
const OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX', ticker: 'XXX', name: 'Test Co', sector: 'Technology',
  industry: 'Semiconductors', price: 100, qty: 10, value: 1000, ...p,
});

/** Fixture con ajuste del score NEUTRO (índice 50 → ajuste 0): la
 *  oportunidad dada vale 50 y el riesgo calculado vale 50
 *  (vol 46,25 → 100 − 31,25 × 1,6 = 50). El RE sale solo de la pata
 *  de consenso (target), a valor facial. */
const flatCloses = Array.from({ length: 130 }, (_, i) => ({ t: 1_700_000_000_000 + i * 86_400_000, c: 100 }));
const neutral = (rePct: number, p: Partial<OptimizerAssetInput> = {}) =>
  base({
    price: 100,
    analystTarget: 100 * (1 + rePct / 100),
    opportunityScore: 50,
    volatilityPct: 46.25,
    // FASE 1 (migración vF1): la certeza ya no sale de la
    // volatilidad — el fixture declara los insumos de certeza
    // que todo input de producción trae (etiqueta del FV, rango
    // y conteo de analistas) y una historia plana, para que la
    // pata sticky lea «sin caída» en los nueve casos por igual.
    fvConfidence: 'Media',
    fvComponentCount: 2,
    fvRangeLow: 160,
    fvRangeHigh: 260,
    analystCount: 20,
    priceHistory: flatCloses,
    ...p,
  });

describe('certeza — independencia de la velocidad; score titular — lo contrario (R14)', () => {
  // Retornos esperados en vivo de la tabla R11 (posiciones 1–9).
  const RES = [80, 72.6, 60.5, 49.3, 42.2, 41.8, 35.5, 35.3, 29.9];
  it('MIGRADO (adopción F1b): con la MISMA dispersión, nueve retornos distintos dan la MISMA certeza y el MISMO rating', () => {
    // Los RE en vivo de la tabla R11 (29,9% … 80%) con los insumos
    // de dispersión idénticos en los nueve fixtures (sin etiqueta
    // de FV, sin rango de targets, misma volatilidad): el
    // SUB-ÍNDICE DE CERTEZA es UNO solo — la certeza no depende de
    // la velocidad de la predicción (semántica R12.1, conservada).
    // En R14 el SCORE TITULAR se movía con la velocidad (era su
    // núcleo); el RATING DE TRANQUILIDAD aprobado NO compone
    // velocidad: con los mismos insumos de tranquilidad, los
    // nueve ratings son el mismo aunque los retornos difieran.
    const scored = RES.map((re) => scoreAsset(neutral(re), 10_000, OPTS));
    expect(new Set(scored.map((s) => s.certaintyScore)).size).toBe(1);
    const scores = scored.map((s) => s.score!);
    expect(new Set(scores).size).toBe(1);
    const res = scored.map((s) => s.expectedReturnPct!);
    expect(Math.max(...res) - Math.min(...res)).toBeGreaterThan(30);
  });
});

describe('R12 · vista prudente (lectura contra el piso del rango)', () => {
  const fixture = () =>
    base({
      price: 100, fvBase: 200, fvPesimista: 130, fvOptimista: 260,
      analystTarget: 150, earningsGrowthTotalPct: 20, salesGrowthPct: 30,
      // FASE 1 (migración vF1): insumos de certeza (la pata de
      // riesgo ya no garantiza un índice no nulo por sí sola).
      fvConfidence: 'Media', fvComponentCount: 2, fvRangeLow: 160, fvRangeHigh: 260,
    });

  it('el RE prudente usa el piso y el esperado NO se altera (recomposición a mano)', () => {
    const a = fixture();
    const s = scoreAsset(a, 1000, OPTS);
    const gk = grinoldKroner(a)!;
    const cons = consensusPct(a)!;
    const convBase = (Math.pow(200 / 100, 1 / OPTS.yearsToCorrection) - 1) * 100;
    const convPess = (Math.pow(130 / 100, 1 / OPTS.yearsToCorrection) - 1) * 100;
    const expectedHand = 0.45 * gk + 0.35 * convBase + 0.2 * cons;
    const prudentHand = 0.45 * gk + 0.35 * convPess + 0.2 * cons;
    expect(s.expectedReturnPct).toBeCloseTo(expectedHand, 4);
    expect(s.expectedReturnPessimisticPct).toBeCloseTo(prudentHand, 4);
    expect(s.prudentFallback).toBe(false);
    expect(s.expectedReturnPessimisticPct!).toBeLessThan(s.expectedReturnPct!);
    expect(s.yearsToDoublePessimistic!).toBeGreaterThan(s.yearsToDouble!);
    // MIGRADO (adopción F1b): en R14 el «score prudente» era la
    // composición del titular sobre la velocidad del retorno
    // prudente (menor ⇒ score menor). El RATING DE TRANQUILIDAD
    // no compone velocidad: es EL MISMO en las dos vistas, igual
    // que la certeza (un solo sub-índice por activo).
    expect(s.certaintyScore).not.toBeNull();
    expect(s.scorePessimistic).toBe(s.score);
    expect(s.scorePessimistic).toBe(
      tranquilityRatingFor({
        certaintyScore: s.certaintyScore,
        riskSubscale: s.riskSubscale,
        cashRegime: s.cashRegime?.regime ?? null,
        modelSuspect: s.modelSuspect,
      }).rating
    );
  });

  it('sin escenario pesimista válido: cae al esperado y queda marcado', () => {
    const s = scoreAsset(
      base({ price: 100, fvBase: 200, fvPesimista: null, analystTarget: 150, earningsGrowthTotalPct: 20, salesGrowthPct: 30 }),
      1000, OPTS
    );
    expect(s.prudentFallback).toBe(true);
    expect(s.expectedReturnPessimisticPct).toBe(s.expectedReturnPct);
  });

  it('la cartera prudente existe, es ≤ la esperada y el orden prudente reordena por el piso', () => {
    const mk = (ticker: string, fvPess: number) =>
      base({
        symbol: `NASDAQ:${ticker}`, ticker, price: 100, value: 1000,
        fvBase: 200, fvPesimista: fvPess, fvOptimista: 260,
        analystTarget: 150, earningsGrowthTotalPct: 20, salesGrowthPct: 30,
      });
    const r = optimizePortfolio([mk('AAA', 150), mk('BBB', 110), mk('CCC', 190)]);
    expect(r.beforePessimistic).toBeTruthy();
    expect(r.beforePessimistic.expectedReturnGeoPct).toBeLessThanOrEqual(r.before.expectedReturnGeoPct);
    expect(r.beforePessimistic.yearsToDouble!).toBeGreaterThanOrEqual(r.before.yearsToDouble!);
    // Los tres tienen el MISMO RE esperado (mismo FV base y mismas
    // patas); el orden prudente los separa por el piso: CCC > AAA > BBB.
    const prudentOrder = [...r.assets]
      .sort((x, y) => (y.expectedReturnPessimisticPct ?? -Infinity) - (x.expectedReturnPessimisticPct ?? -Infinity))
      .map((a) => a.ticker);
    expect(prudentOrder).toEqual(['CCC', 'AAA', 'BBB']);
    const pess = prudentOrder.map(
      (t) => r.assets.find((a) => a.ticker === t)!.expectedReturnPessimisticPct!
    );
    expect(pess[0]).toBeGreaterThan(pess[1]);
    expect(pess[1]).toBeGreaterThan(pess[2]);
  });
});

describe('R12 · régimen por ventas futuras y frontera suave', () => {
  it('el forward manda sobre el trailing: trailing 8% + forward 45% → crecimiento, ancla 55', () => {
    const anchor = growthAnchorFor(
      base({ salesGrowthPct: 8, salesGrowthForwardPct: 45, roicPct: 20, reinvestmentRatePct: 30 })
    );
    expect(anchor?.basis).toBe('forward');
    expect(anchor?.regime).toBe('crecimiento');
    expect(anchor?.blendPct).toBe(100);
    expect(anchor?.anchorPct).toBeCloseTo(55, 6);
  });

  it('mitad de la banda (forward 12,5%): el ancla es el promedio de ambas', () => {
    // Crecimiento: 12,5 + 10 = 22,5. Sustentable: ROIC 20 × RR 30 = 6.
    // Promedio: 14,25.
    const anchor = growthAnchorFor(
      base({ salesGrowthForwardPct: 12.5, roicPct: 20, reinvestmentRatePct: 30 })
    );
    expect(anchor?.basis).toBe('forward');
    expect(anchor?.blendPct).toBe(50);
    expect(anchor?.anchorPct).toBeCloseTo(14.25, 6);
  });

  it('bordes de la banda: 7,5% → sustentable pura; 17,5% → crecimiento pura', () => {
    const lo = growthAnchorFor(base({ salesGrowthForwardPct: 7.5, roicPct: 20, reinvestmentRatePct: 30 }));
    expect(lo?.blendPct).toBe(0);
    expect(lo?.regime).toBe('madura');
    expect(lo?.anchorPct).toBeCloseTo(6, 6);
    const hi = growthAnchorFor(base({ salesGrowthForwardPct: 17.5, roicPct: 20, reinvestmentRatePct: 30 }));
    expect(hi?.blendPct).toBe(100);
    expect(hi?.regime).toBe('crecimiento');
    expect(hi?.anchorPct).toBeCloseTo(27.5, 6);
  });

  it('estabilidad: un refresco de ±2 pp del forward dentro de la banda mueve el RE pocos puntos', () => {
    const mk = (fwd: number) =>
      base({
        price: 100, fvBase: 200, analystTarget: 160,
        earningsGrowthTotalPct: 60, salesGrowthForwardPct: fwd,
        roicPct: 25, reinvestmentRatePct: 40,
      });
    const s11 = scoreAsset(mk(11), 1000, OPTS);
    const s14 = scoreAsset(mk(14), 1000, OPTS);
    expect(s11.expectedReturnPct).not.toBeNull();
    expect(s14.expectedReturnPct).not.toBeNull();
    // Con el interruptor viejo, cruzar 12,5% cambiaba el ancla de
    // golpe (de sustentable 10 a ventas+10 ≈ 21–24) y el RE saltaba
    // mucho más; con la mezcla, el salto queda acotado.
    expect(Math.abs(s14.expectedReturnPct! - s11.expectedReturnPct!)).toBeLessThanOrEqual(5);
  });
});

describe('R12 · ancla de caja real (TTM reportado)', () => {
  it('TTM negativo → marca quema-caja, aunque el año fiscal haya cerrado positivo (MIGRACIÓN FASE 2: sin componentes no hay cobro)', () => {
    // Caso SIMO (diseño aprobado): su último año FISCAL cerró apenas
    // positivo (~+US$6 M), pero la ventana móvil de 12 meses quema
    // caja. El motor solo recibe el TTM — el año fiscal no es un
    // insumo del ancla, justamente para que no la desactive.
    const plain = scoreAsset(neutral(30), 1000, OPTS);
    const burn = scoreAsset(neutral(30, { fcfTtmUsd: -50_000_000 }), 1000, OPTS);
    expect(burn.cashAnchorState).toBe('quema-caja');
    // MIGRACIÓN FASE 2: el reparo −6 quedó DESAPILADO — el campo
    // cashAnchorPenaltyPts vale 0 y la CERTEZA es confianza pura
    // (la caja se cobra una sola vez como M_cash del score, y
    // solo cuando hay componentes reportados del régimen: este
    // fixture no los trae → régimen 'sin-dato', M = 1, y el
    // score tampoco se mueve). El cobro nuevo vive en
    // sistema-fase2.test.ts.
    expect(burn.cashAnchorPenaltyPts).toBe(0);
    expect(burn.cashRegime?.regime).toBe('sin-dato');
    expect(burn.certaintyScore!).toBe(plain.certaintyScore!);
    expect(burn.score!).toBe(plain.score!);
  });

  it('TTM positivo → genera caja, sin reparo', () => {
    const s = scoreAsset(neutral(30, { fcfTtmUsd: 50_000_000 }), 1000, OPTS);
    expect(s.cashAnchorState).toBe('genera-caja');
    expect(s.cashAnchorPenaltyPts).toBe(0);
    expect(s.score).toBe(scoreAsset(neutral(30), 1000, OPTS).score);
  });

  it('financiera con TTM negativo → no aplica, sin reparo ni marca negativa', () => {
    const s = scoreAsset(
      neutral(30, { sector: 'Financial Services', industry: 'Banks - Diversified', fcfTtmUsd: -50_000_000 }),
      1000, OPTS
    );
    expect(s.cashAnchorState).toBe('no-aplica');
    expect(s.cashAnchorPenaltyPts).toBe(0);
    expect(s.score).toBe(scoreAsset(neutral(30), 1000, OPTS).score);
  });

  it('sin dato → sin-dato y sin reparo (R0: la ausencia no castiga)', () => {
    const s = scoreAsset(neutral(30), 1000, OPTS);
    expect(s.cashAnchorState).toBe('sin-dato');
    expect(s.cashAnchorPenaltyPts).toBe(0);
    expect(cashAnchorFor(base({})).state).toBe('sin-dato');
  });

  it('recomposición: FV y RE idénticos con y sin el ancla — vive solo en el score', () => {
    const mk = (fcf?: number) =>
      base({
        price: 100, fvBase: 200, fvPesimista: 150, analystTarget: 160,
        earningsGrowthTotalPct: 25, salesGrowthPct: 30,
        opportunityScore: 50, volatilityPct: 46.25,
        ...(fcf != null ? { fcfTtmUsd: fcf } : {}),
      });
    const without = scoreAsset(mk(), 1000, OPTS);
    const withAnchor = scoreAsset(mk(-80_000_000), 1000, OPTS);
    expect(withAnchor.expectedReturnPct).toBe(without.expectedReturnPct);
    expect(withAnchor.expectedReturnPessimisticPct).toBe(without.expectedReturnPessimisticPct);
    expect(withAnchor.gkPct).toBe(without.gkPct);
    expect(withAnchor.fvConvergencePct).toBe(without.fvConvergencePct);
    expect(withAnchor.consensusPct).toBe(without.consensusPct);
    expect(withAnchor.fvEffective).toBe(without.fvEffective);
    // MIGRACIÓN FASE 2: la certeza ya no cobra la caja (es
    // confianza pura) — con y sin ancla, el índice es EL MISMO.
    // (En la Fase 1 el −6 era exacto acá; el cobro se mudó al
    // M_cash del score, que sin componentes vale 1.)
    if (without.certaintyScore != null && withAnchor.certaintyScore != null) {
      expect(withAnchor.certaintyScore).toBe(without.certaintyScore);
    }
    expect(withAnchor.score!).toBeLessThanOrEqual(without.score!);
  });

  it('el medidor es puro: mismas primitivas, mismo par, sin mutar la entrada', () => {
    // pePairFor SOLO se consume en la ruta de la ficha para
    // mostrarlo; ningún camino de cálculo (FV, RE, score) lo lee.
    // La garantía testeable acá es su pureza: determinista y sin
    // efectos sobre su entrada.
    const input = { price: 187.9, epsTrailing: 2.44, epsForward: 20.9 };
    const snapshot = { ...input };
    const p1 = pePairFor(input);
    const p2 = pePairFor(input);
    expect(p1).toEqual(p2);
    expect(input).toEqual(snapshot);
  });
});

describe('R12 · medidor de expectativas (PER actual vs futuro, desde primitivas)', () => {
  it('recomputa ambos PER desde precio y EPS, sin leer ningún P/E publicado', () => {
    const p = pePairFor({ price: 100, epsTrailing: 2, epsForward: 10 });
    expect(p.trailingPe).toBeCloseTo(50, 6);
    expect(p.forwardPe).toBeCloseTo(10, 6);
    expect(p.noEarningsYet).toBe(false);
  });

  it('brecha extrema: forward < 40% del actual y actual > 15× (caso tipo SIMO)', () => {
    // SIMO al cierre del pase R11: precio 187,90, EPS trailing ≈ 2,44
    // (≈77×) y EPS forward de consenso ≈ 20,9 (≈9×).
    const p = pePairFor({ price: 187.9, epsTrailing: 2.44, epsForward: 20.9 });
    expect(p.trailingPe!).toBeGreaterThan(70);
    expect(p.forwardPe!).toBeLessThan(10);
    expect(p.extremeGap).toBe(true);
  });

  it('sin brecha extrema si el actual no supera 15×, aunque el forward sea mucho menor', () => {
    const p = pePairFor({ price: 100, epsTrailing: 10, epsForward: 25 });
    expect(p.trailingPe).toBeCloseTo(10, 6);
    expect(p.extremeGap).toBe(false);
  });

  it('sin brecha extrema si el forward no cae por debajo del 40% del actual', () => {
    const p = pePairFor({ price: 100, epsTrailing: 2, epsForward: 4 });
    expect(p.trailingPe).toBeCloseTo(50, 6);
    expect(p.forwardPe).toBeCloseTo(25, 6);
    expect(p.extremeGap).toBe(false);
  });

  it('EPS trailing ≤ 0: estado honesto «sin ganancias todavía», sin PER actual', () => {
    const p = pePairFor({ price: 100, epsTrailing: -1.5, epsForward: 3 });
    expect(p.trailingPe).toBeNull();
    expect(p.noEarningsYet).toBe(true);
    expect(p.forwardPe).toBeCloseTo(33.3, 1);
    expect(p.extremeGap).toBe(false);
  });

  it('sin datos: ningún PER inventado', () => {
    const p = pePairFor({ price: 100, epsTrailing: null, epsForward: null });
    expect(p.trailingPe).toBeNull();
    expect(p.forwardPe).toBeNull();
    expect(p.noEarningsYet).toBe(false);
    expect(p.extremeGap).toBe(false);
  });

  it('EPS forward ≤ 0: sin PER futuro y sin brecha', () => {
    const p = pePairFor({ price: 100, epsTrailing: 2, epsForward: -0.5 });
    expect(p.forwardPe).toBeNull();
    expect(p.extremeGap).toBe(false);
  });
});

describe('R12.3 · ancla de caja: fuente reportada primaria, proveedor respaldo', () => {
  it('mega-cap con el campo del proveedor roto y reportado positivo → genera caja, sin reparo, procedencia registrada (caso GOOG)', () => {
    const s = scoreAsset(
      neutral(30, {
        fcfTtmUsd: -1_162_500_000,
        fcfTtmResolvedUsd: 19_747_000_000,
        fcfTtmSource: 'reportado',
        fcfTtmPeriodEnd: '2026-09-30',
        fcfTtmDiscrepancy: true,
      }),
      1000, OPTS
    );
    expect(s.cashAnchorState).toBe('genera-caja');
    expect(s.cashAnchorPenaltyPts).toBe(0);
    expect(s.cashAnchorFcfTtmUsd).toBe(19_747_000_000);
    expect(s.cashAnchorSource).toBe('reportado');
    expect(s.cashAnchorPeriodEnd).toBe('2026-09-30');
    expect(s.cashAnchorDiscrepancy).toBe(true);
    expect(s.cashAnchorProviderFcfTtmUsd).toBe(-1_162_500_000);
    expect(s.score).toBe(scoreAsset(neutral(30), 1000, OPTS).score);
  });

  it('quemador real con reportado negativo consistente → marca y procedencia intactas (caso AMZN reportado; MIGRACIÓN FASE 2: el campo de puntos quedó en 0)', () => {
    const s = scoreAsset(
      neutral(30, {
        fcfTtmUsd: -34_731_700_000,
        fcfTtmResolvedUsd: -46_892_000_000,
        fcfTtmSource: 'reportado',
        fcfTtmPeriodEnd: '2026-09-30',
        fcfTtmDiscrepancy: false,
      }),
      1000, OPTS
    );
    expect(s.cashAnchorState).toBe('quema-caja');
    // FASE 2: cashAnchorPenaltyPts desapilado (= 0 siempre); el
    // cobro de caja es el M_cash del régimen, que exige
    // componentes — este fixture no los trae.
    expect(s.cashAnchorPenaltyPts).toBe(0);
    expect(s.cashAnchorSource).toBe('reportado');
    expect(s.cashAnchorDiscrepancy).toBe(false);
  });

  it('respaldo del proveedor cuando EDGAR no reconstruye la ventana → la marca sobrevive con su procedencia (caso SIMO)', () => {
    const s = scoreAsset(
      neutral(30, {
        fcfTtmUsd: -503_000_000,
        fcfTtmResolvedUsd: -503_000_000,
        fcfTtmSource: 'proveedor',
        fcfTtmEdgarFyOnlyGap: true,
      }),
      1000, OPTS
    );
    expect(s.cashAnchorState).toBe('quema-caja');
    // FASE 2: campo de puntos desapilado (= 0); ver el caso AMZN.
    expect(s.cashAnchorPenaltyPts).toBe(0);
    expect(s.cashAnchorSource).toBe('proveedor');
    expect(s.cashAnchorEdgarFyOnlyGap).toBe(true);
  });

  it('resolución explícita sin dato → sin-dato y sin reparo, aunque no haya campo del proveedor', () => {
    const s = scoreAsset(neutral(30, { fcfTtmResolvedUsd: null, fcfTtmSource: null }), 1000, OPTS);
    expect(s.cashAnchorState).toBe('sin-dato');
    expect(s.cashAnchorPenaltyPts).toBe(0);
    expect(s.cashAnchorSource).toBeNull();
  });

  it('el valor resuelto manda sobre el crudo: mismo activo, el estado sigue a la resolución y no al proveedor', () => {
    const info = cashAnchorFor(base({
      fcfTtmUsd: -10_000_000,
      fcfTtmResolvedUsd: 5_000_000,
      fcfTtmSource: 'reportado',
    }));
    expect(info.state).toBe('genera-caja');
    expect(info.fcfTtmUsd).toBe(5_000_000);
    expect(info.providerFcfTtmUsd).toBe(-10_000_000);
  });
});

describe('R12 · ancla de caja real (TTM reportado)', () => {
  it('el score vive en [0, 100] y el sospechoso tiene techo 39, también en el peor fixture', () => {
    const peor = {
      fvConfidence: 'Baja' as const, fvComponentCount: 2,
      epsSignDisagreement: true, fvRangeLow: 20, fvRangeHigh: 480,
      volatilityPct: 95, fcfTtmUsd: -1_000_000,
    };
    const s = scoreAsset(neutral(30, peor), 10_000, OPTS);
    expect(s.score!).toBeGreaterThanOrEqual(0);
    expect(s.score!).toBeLessThanOrEqual(100);
    const sospechoso = scoreAsset(neutral(30, { ...peor, fvModelSuspect: true }), 10_000, OPTS);
    expect(sospechoso.score!).toBeLessThanOrEqual(39);
    expect(sospechoso.certaintyScore!).toBeLessThanOrEqual(39);
    expect(sospechoso.certaintyBand).toBe('a-revisar');
  });
});
