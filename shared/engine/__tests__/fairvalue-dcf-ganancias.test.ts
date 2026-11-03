import { describe, it, expect } from 'vitest';
import {
  computeFairValue,
  evaluateEarningsDcf,
  evaluateMultiplesComponent,
  EARNINGS_DCF_DISCOUNT_PCT,
  EARNINGS_CASH_CONVERSION,
} from '../fairvalue.js';

/**
 * Arquitectura simplificada R10 (decisión del usuario 2026-11-03):
 * el FV se forma con tres patas hacia adelante — target de analistas,
 * múltiplos sobre EPS forward con múltiplo de sector, y DCF CORTO
 * SOBRE GANANCIAS de consenso — y el DCF de FCF histórico pasa a ser
 * el ancla histórica (referencia y escenario pesimista, fuera del
 * promedio y de la confianza). Fixtures sintéticos de las reglas.
 */

describe('DCF corto sobre ganancias: sendero explícito', () => {
  it('reproduce el cálculo a mano: fade en 5 años, conversión ×0,85, terminal con múltiplo de sector', () => {
    const r = evaluateEarningsDcf({
      epsYear1: 5,
      growthNextYear: 0.2,
      growth5y: 0.1,
      sectorMultiple: 20,
      revenueGrowthCheck: null,
    });
    expect(r.value).not.toBeNull();
    expect(r.growthTier).toBe('consensus');
    // Sendero: E1 5 · E2 6,0 (+20%) · E3 6,9 (+15%, punto medio hacia
    // g5) · E4 7,59 (+10%) · E5 8,1972 (+8%, punto medio hacia la tasa
    // terminal: g5 acotada a +6%).
    expect(r.epsPath).toHaveLength(5);
    expect(r.epsPath[1]).toBeCloseTo(6.0, 6);
    expect(r.epsPath[2]).toBeCloseTo(6.9, 6);
    expect(r.epsPath[3]).toBeCloseTo(7.59, 6);
    expect(r.epsPath[4]).toBeCloseTo(8.1972, 4);
    expect(r.growthUsed.gTerm).toBeCloseTo(0.06, 6);
    // Recomputación independiente con la fórmula documentada.
    const d = EARNINGS_DCF_DISCOUNT_PCT / 100;
    const path = [5, 6.0, 6.9, 7.59, 8.1972];
    const pvFlows = path.reduce(
      (s, e, i) => s + (e * EARNINGS_CASH_CONVERSION) / Math.pow(1 + d, i + 1),
      0
    );
    const pvTerminal =
      (path[4] * 20 * EARNINGS_CASH_CONVERSION) / Math.pow(1 + d, 5);
    expect(r.value).toBeCloseTo(pvFlows + pvTerminal, 3);
    expect(r.value).toBeCloseTo(107.7, 0);
  });

  it('el crecimiento de ganancias no supera el de VENTAS de consenso + 15 pp (cruce con la pata 3)', () => {
    const r = evaluateEarningsDcf({
      epsYear1: 5,
      growthNextYear: 0.55,
      growth5y: 0.1,
      sectorMultiple: 20,
      revenueGrowthCheck: 0.2, // ventas +20% → techo 35%
    });
    expect(r.flags).toContain('earningsDcfRevenueCapped');
    expect(r.growthUsed.g1).toBeCloseTo(0.35, 6);
    expect(r.epsPath[1]).toBeCloseTo(5 * 1.35, 6);
  });

  it('EPS ≤ 0: la pata es n/m (imposibilidad, no exclusión discrecional)', () => {
    expect(
      evaluateEarningsDcf({ epsYear1: 0, growthNextYear: 0.2, growth5y: 0.1, sectorMultiple: 20 }).value
    ).toBeNull();
    expect(
      evaluateEarningsDcf({ epsYear1: -2, growthNextYear: 0.2, growth5y: 0.1, sectorMultiple: 20 }).value
    ).toBeNull();
  });

  it('sin crecimiento de consenso usa el respaldo documentado (tier fallback) y sigue valuando', () => {
    const r = evaluateEarningsDcf({
      epsYear1: 5,
      growthNextYear: null,
      growth5y: null,
      sectorMultiple: 15,
      revenueGrowthCheck: null,
    });
    expect(r.value).not.toBeNull();
    expect(r.growthTier).toBe('fallback');
    expect(r.value!).toBeGreaterThan(0);
  });
});

describe('las tres patas en computeFairValue (R10)', () => {
  const bankLike = {
    symbol: 'BANK',
    currentPrice: 25,
    sharesOutstanding: 900,
    revenueGrowth: 0.2,
    beta: 1.1,
    totalCash: 0,
    totalDebt: 0,
    // Sin FCF utilizable (una financiera): el ancla histórica queda
    // vacía, pero la pata de ganancias SÍ aplica (lógica FCFE).
    forwardEps: 2,
    epsTrendGrowthNextYear: 0.25,
    finvizEpsNext5YPct: 15,
    industryForwardPe: 12,
    targetMeanPrice: 30,
    targetHighPrice: 38,
    targetLowPrice: 22,
    analystCount: 20,
  };

  it('un banco conserva sus TRES patas y el ancla vacía no lo castiga', () => {
    const r = computeFairValue(bankLike);
    expect(r.fairValue).not.toBeNull();
    expect(r.fvComponents).toHaveLength(3);
    expect(r.dcfValue).not.toBeNull(); // pata 3 = DCF sobre ganancias
    expect(r.dcfValue!).toBeGreaterThan(0);
    expect(r.historicalAnchorValue).toBeNull();
    const prov = r.fvProvenance?.find((p) => p.component === 'anchor');
    expect(prov).toBeTruthy();
    expect(prov!.usedValue).toBeNull();
    // El target lidera el promedio con esta cobertura.
    const w = r.fvComponentWeights ?? [];
    expect(w[2]).toBeGreaterThan(w[0]);
    expect(w[2]).toBeGreaterThan(w[1]);
  });

  it('EPS de consenso ≤ 0: la pata 3 es n/m y el activo se valúa con las patas restantes (R0)', () => {
    const r = computeFairValue({
      symbol: 'NEG',
      currentPrice: 110,
      sharesOutstanding: 100,
      revenueGrowth: 0.6,
      beta: 1.4,
      totalCash: 0,
      totalDebt: 0,
      forwardEps: -2, // consenso negativo: múltiplos y DCF-ganancias n/m
      targetMeanPrice: 290,
      analystCount: 14,
    });
    expect(r.dcfValue).toBeNull();
    const excl = (r.fvExcluded ?? []).find((e) => e.component === 'dcf');
    expect(excl?.reason).toBe('notMeaningful');
    // Queda el target, solo: el activo NO queda sin valuación.
    expect(r.fairValue).toBe(290);
    expect(r.fvFlags).toContain('singleComponent');
  });

  it('desacuerdo de signo irresoluble: la pata 3 es n/m pero los múltiplos siguen valuando', () => {
    const r = computeFairValue({
      symbol: 'SIGN',
      currentPrice: 100,
      sharesOutstanding: 100,
      revenueGrowth: 0.1,
      beta: 1,
      totalCash: 0,
      totalDebt: 0,
      forwardEps: 5,
      forwardEpsAlt: -3,
      forwardEpsAltSource: 'finviz' as const,
      epsTrendGrowthNextYear: 0.15,
      targetMeanPrice: 130,
      analystCount: 9,
    });
    expect(r.dcfValue).toBeNull();
    const excl = (r.fvExcluded ?? []).find((e) => e.component === 'dcf');
    expect(excl?.reason).toBe('epsSignDisagreement');
    expect(r.fvComponents).toHaveLength(2); // múltiplos + target
    expect(r.fairValue).not.toBeNull();
  });

  it('el ancla histórica outlier (caso SIMO) no entra al promedio, al rango ni a la confianza', () => {
    const legs = {
      symbol: 'INFLEX',
      currentPrice: 190,
      sharesOutstanding: 60,
      revenueGrowth: 0.3,
      beta: 1.2,
      totalCash: 0,
      totalDebt: 0,
      forwardEps: 20.6,
      forwardEpsAlt: 20.1,
      forwardEpsAltSource: 'finviz' as const,
      epsTrendGrowthNextYear: 0.3,
      finvizEpsNext5YPct: 20,
      targetMeanPrice: 363.09,
      targetHighPrice: 450,
      targetLowPrice: 280,
      analystCount: 15,
    };
    const withAnchor = computeFairValue({
      ...legs,
      freeCashflow: 40,
      fcfHistory: [40, 35, 30], // historia pre-inflexión: ancla ínfima
    });
    const withoutAnchor = computeFairValue(legs);
    expect(withAnchor.historicalAnchorValue).not.toBeNull();
    expect(withAnchor.historicalAnchorValue!).toBeLessThan(withAnchor.fairValue! * 0.15);
    // El rango del FV se construye SOLO con las patas vigentes.
    expect(withAnchor.fvRange![0]).toBeGreaterThan(withAnchor.historicalAnchorValue!);
    // Y la confianza no cambia por la presencia del ancla outlier:
    // se mide sobre las patas vigentes, no sobre la historia.
    expect(withAnchor.fvConfidence).toBe(withoutAnchor.fvConfidence);
    expect(withAnchor.fairValue!).toBeCloseTo(withoutAnchor.fairValue!, 6);
  });

  it('TradingView suma como fuente del EPS en la cadena (pata 2) y la cadena media ante un desacuerdo salvaje', () => {
    const agreeing = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 10,
      forwardEpsTv: 10.4,
      moatMultiple: 20,
    });
    expect(agreeing.provenance.sources).toContain('tradingviewEpsForecastNextFy');
    expect(agreeing.epsUsed!).toBeGreaterThanOrEqual(10);
    expect(agreeing.epsUsed!).toBeLessThanOrEqual(10.4);

    const wild = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 10,
      forwardEpsAlt: 10.2,
      forwardEpsAltSource: 'finviz',
      forwardEpsTv: 30, // TV despegado del resto: la mediana manda
      moatMultiple: 20,
    });
    expect(wild.epsUsed!).toBeLessThan(12);
    expect(wild.value!).toBeGreaterThan(0);
  });
});
