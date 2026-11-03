import { describe, it, expect } from 'vitest';
import {
  aggregateFairValue,
  computeFairValue,
  evaluateMultiplesComponent,
  type FvComponentInput,
} from '../fairvalue.js';

/**
 * Anclajes de realidad del FV (docs/VALUATION-RULES.md, adenda R9) y
 * ponderación target/DCF/múltiplos (directivas del usuario 2026-11-03):
 * múltiplo acotado por el sector, target que nunca vive ni se recorta
 * por encima del máximo de su consenso, referencia de banda robusta a
 * outliers, base del DCF normalizada en cíclicas y tripwire
 * `modelSuspect`. Fixtures sintéticos derivados de las reglas (los
 * valores evocan el caso VIST auditado por el usuario, pero el motor
 * no contiene ninguna lógica por ticker).
 */
const C = (
  key: FvComponentInput['key'],
  value: number,
  extra?: Partial<FvComponentInput>
): FvComponentInput => ({ key, value, ...extra });

describe('tope sectorial del múltiplo (R9-1)', () => {
  it('petrolera E&P con moat Wide: el múltiplo de tabla 26× queda acotado por el P/E propio', () => {
    // Réplica del caso auditado: precio 66,89, EPS forward reparado
    // 10,40 (consenso real), P/E forward propio 6,43.
    const r = computeFairValue({
      symbol: 'TEST',
      currentPrice: 66.89,
      sharesOutstanding: 100e6,
      freeCashflow: 200e6,
      revenueGrowth: 0.3,
      earningsGrowth: 0.08,
      beta: 1.2,
      totalCash: 0,
      totalDebt: 0,
      forwardEps: 10.4,
      forwardEpsAlt: 10.2,
      forwardEpsAltSource: 'finviz',
      grossMargins: 0.65,
      operatingMargins: 0.45,
      returnOnEquity: 0.3,
      targetMeanPrice: 95.46,
    });
    expect(r.moat).toBe('Wide');
    // Cap = 6,43 (P/E propio) × 1,5 (prima Wide) × 1,0 (crecimiento
    // 8% < 10% no suma prima) ≈ 9,7 ⇒ componente ≈ 10,3 × 9,7 ≈ 100.
    expect(r.fvFlags).toContain('sectorCappedMultiple');
    expect(r.multiplesValue).not.toBeNull();
    expect(r.multiplesValue!).toBeGreaterThan(85);
    expect(r.multiplesValue!).toBeLessThan(115);
  });

  it('la referencia preferida es el P/E de la industria si se conoce', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 4, // P/E propio 25
      moatMultiple: 26,
      moatPremium: 1.5,
      industryForwardPe: 12,
    });
    // Cap = 12 (industria) × 1,5 = 18, no 25 × 1,5 = 37,5.
    expect(ev.multipleCap).toBeCloseTo(18, 6);
    expect(ev.value).toBeCloseTo(72, 6);
    expect(ev.flags).toContain('sectorCappedMultiple');
  });

  it('el crecimiento documentado amplía el tope hasta +40%', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 4,
      earningsGrowth: 0.5,
      moatMultiple: 26,
      moatPremium: 1.5,
      industryForwardPe: 12,
    });
    // Cap = 12 × 1,5 × 1,4 = 25,2.
    expect(ev.multipleCap).toBeCloseTo(25.2, 6);
    expect(ev.value).toBeCloseTo(100.8, 6);
  });

  it('si el múltiplo de tabla ya está bajo el tope, no se toca (sin flag)', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 200,
      forwardEps: 4, // P/E propio 50 ⇒ cap 75 con prima Wide
      moatMultiple: 26,
      moatPremium: 1.5,
    });
    expect(ev.value).toBe(104);
    expect(ev.multipleUsed).toBe(26);
    expect(ev.flags).not.toContain('sectorCappedMultiple');
  });
});

describe('target anclado en su consenso (R9-2)', () => {
  it('el componente target se recorta al rango [low, high] publicado en la construcción', () => {
    const r = computeFairValue({
      symbol: 'TEST',
      currentPrice: 100,
      sharesOutstanding: 10,
      freeCashflow: 100,
      revenueGrowth: 0.1,
      beta: 1.0,
      totalCash: 0,
      totalDebt: 0,
      targetMeanPrice: 120,
      targetAltPrice: 130, // promedio multifuente 125 > máximo 110
      targetHighPrice: 110,
      targetLowPrice: 90,
      analystCount: 12,
    });
    expect(r.analystTarget).toBe(110);
    expect(r.fvFlags).toContain('targetClampedToConsensus');
    const prov = r.fvProvenance?.find((p) => p.component === 'target');
    expect(prov?.usedValue).toBe(110);
    expect(prov?.flags).toContain('targetClampedToConsensus');
  });

  it('la winsorización jamás levanta el target por encima del máximo del consenso (clipCeiling)', () => {
    const agg = aggregateFairValue(
      [C('dcf', 900), C('multiples', 850), C('target', 95, { clipCeiling: 95 })],
      { currentPrice: 100 }
    );
    // Sin techo, la banda (referencia 875) levantaría el target a 218,75.
    expect(agg.components.find((c) => c.key === 'target')?.value).toBe(95);
  });

  it('sin clipCeiling, el mismo pool SÍ levantaría el target (control del defecto original)', () => {
    const agg = aggregateFairValue([C('dcf', 900), C('multiples', 850), C('target', 95)], {
      currentPrice: 100,
    });
    expect(agg.components.find((c) => c.key === 'target')?.value).toBeCloseTo(218.75, 2);
  });
});

describe('referencia robusta de la banda (R9-2b)', () => {
  it('un componente diminuto tampoco arrastra las bandas ajenas (outlier por abajo)', () => {
    const agg = aggregateFairValue([C('dcf', 10), C('multiples', 100), C('target', 105)], {
      currentPrice: 90,
    });
    expect(agg.referenceOutliers).toEqual(['dcf']);
    // Los múltiplos conservan su valor: su referencia pasa a ser solo
    // el target (105), no el promedio contaminado con el 10.
    expect(agg.components.find((c) => c.key === 'multiples')?.value).toBe(100);
    expect(agg.excluded).toHaveLength(0);
  });
});

describe('base del DCF en cíclicas sin serie (R9-3)', () => {
  const baseInput = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10, // capitalización 1.000
    revenueGrowth: 0.1,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
  };

  it('FCF yield TTM de 30%: la base entra con haircut hacia el yield de mitad de ciclo (×0,40)', () => {
    const r = computeFairValue({ ...baseInput, freeCashflow: 300 });
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.originalValue).toBe(300);
    expect(prov?.usedValue).toBeCloseTo(120, 6);
    expect(r.fvFlags).toContain('cyclicalBaseHaircut');
  });

  it('FCF yield de 20%: haircut parcial ×0,60 (continuo, sin escalón)', () => {
    const r = computeFairValue({ ...baseInput, freeCashflow: 200 });
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.usedValue).toBeCloseTo(120, 6);
    expect(r.fvFlags).toContain('cyclicalBaseHaircut');
  });

  it('FCF yield de 10%: sin haircut, la base TTM entra pelada', () => {
    const r = computeFairValue({ ...baseInput, freeCashflow: 100 });
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.usedValue).toBe(100);
    expect(r.fvFlags).not.toContain('cyclicalBaseHaircut');
  });

  it('con serie ≥3 años manda la mediana y NO se aplica el haircut (no se normaliza dos veces)', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 300,
      fcfHistory: [300, 100, 100], // mediana 100, yield TTM 30%
    });
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.usedValue).toBe(100);
    expect(prov?.sources).toEqual(['fcfHistoryMedian']);
    expect(r.fvFlags).not.toContain('cyclicalBaseHaircut');
  });
});

describe('tripwire de plausibilidad modelSuspect (R9-4)', () => {
  it('FV > 2× el target del pool: sospechoso, confianza Baja, dominante identificado', () => {
    const agg = aggregateFairValue([C('dcf', 800), C('multiples', 300), C('target', 100)], {
      currentPrice: 100,
    });
    expect(agg.fairValue!).toBeGreaterThan(200);
    expect(agg.flags).toContain('modelSuspect');
    expect(agg.modelSuspectDominant).toBe('dcf');
    expect(agg.confidence).toBe('Baja');
  });

  it('FV > 2,5× el precio alcanza, aunque no duplique al target', () => {
    const agg = aggregateFairValue([C('dcf', 300), C('multiples', 280), C('target', 260)], {
      currentPrice: 100,
    });
    expect(agg.fairValue!).toBeLessThan(520);
    expect(agg.fairValue!).toBeGreaterThan(250);
    expect(agg.modelSuspectDominant).toBe('dcf');
  });

  it('un FV razonable no dispara el tripwire', () => {
    const agg = aggregateFairValue([C('dcf', 120), C('multiples', 110), C('target', 130)], {
      currentPrice: 100,
    });
    expect(agg.modelSuspectDominant).toBeNull();
    expect(agg.flags).not.toContain('modelSuspect');
  });

  it('computeFairValue expone la marca y la deja en la procedencia del dominante', () => {
    const r = computeFairValue({
      symbol: 'TEST',
      currentPrice: 100,
      sharesOutstanding: 10,
      freeCashflow: 2000, // DCF crudo gigante aun con haircut cíclico
      revenueGrowth: 0.2,
      earningsGrowth: 0.2,
      beta: 1.1,
      totalCash: 0,
      totalDebt: 0,
      forwardEps: 30,
      forwardEpsAlt: 29,
      forwardEpsAltSource: 'finviz',
      industryForwardPe: 30, // múltiplos ~990 sin el tope propio
      targetMeanPrice: 100,
      targetHighPrice: 105,
      targetLowPrice: 60,
      analystCount: 10,
    });
    expect(r.fvModelSuspect).toBe(true);
    expect(r.fvSuspectDominant).toBe('dcf');
    expect(r.fvConfidence).toBe('Baja');
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.flags).toContain('dominantDeviation');
    // Y el target, pese a la banda, nunca supera su máximo de consenso.
    const targetFinal = (r.fvComponents ?? [])[2];
    expect(targetFinal).toBeLessThanOrEqual(105);
  });
});

describe('ponderación: target líder, DCF contrapeso, múltiplos menor (directivas 2026-11-03)', () => {
  const full = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10,
    revenueGrowth: 0.1,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
    freeCashflow: 500,
    fcfHistory: [500, 500, 500, 500, 500], // serie mediana 5 años → DCF 0,65
    forwardEps: 5,
    forwardEpsAlt: 5,
    forwardEpsAltSource: 'finviz' as const, // 2 grupos directos → múltiplos 0,45
    targetMeanPrice: 120,
  };

  it('cobertura completa (≥5 analistas, dispersión moderada): target ~48% y es el mayor peso', () => {
    const r = computeFairValue({
      ...full,
      targetHighPrice: 150,
      targetLowPrice: 90, // dispersión (150−90)/120 = 0,5 → calidad 1,0
      analystCount: 12,
    });
    const w = r.fvComponentWeights ?? [];
    expect(w).toHaveLength(3);
    // [DCF 0,65 · múltiplos 0,45 · target 1,0] → [0,310 · 0,214 · 0,476].
    expect(w[2]).toBeGreaterThan(0.44);
    expect(w[2]).toBeLessThan(0.52);
    expect(w[2]).toBeGreaterThan(w[0]);
    expect(w[0]).toBeGreaterThan(w[1]);
  });

  it('cobertura escasa (1–2 analistas): el target baja a ~30% y no domina', () => {
    const r = computeFairValue({ ...full, analystCount: 2 });
    const w = r.fvComponentWeights ?? [];
    // [0,65 · 0,45 · 0,45] → target 0,29: manda el DCF contrapeso.
    expect(w[2]).toBeGreaterThan(0.26);
    expect(w[2]).toBeLessThan(0.34);
    expect(w[2]).toBeLessThan(w[0]);
  });

  it('sin target en ninguna fuente: el DCF pesa más que los múltiplos (contrapeso)', () => {
    const { targetMeanPrice: _drop, ...noTarget } = full;
    const r = computeFairValue(noTarget);
    const w = r.fvComponentWeights ?? [];
    expect(w).toHaveLength(2);
    expect(w[0]).toBeGreaterThan(w[1]);
    expect(w[0]).toBeCloseTo(0.65 / 1.1, 2);
  });
});
