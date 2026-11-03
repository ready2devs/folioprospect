import { describe, it, expect } from 'vitest';
import {
  aggregateFairValue,
  computeFairValue,
  evaluateMultiplesComponent,
  justifiedMultiple,
  type FvComponentInput,
} from '../fairvalue.js';

/**
 * Anclajes de realidad del FV (docs/VALUATION-RULES.md, R11): el
 * método elegido — promedio de DOS estimaciones hacia adelante: el
 * target de consenso (íntegro en su rango [low, high]) y la fórmula
 * EPS forward × múltiplo justificado (sector ajustado por la fórmula
 * de Damodaran según ROIC y crecimiento propios contra el sector).
 * Sin topes sectoriales R9, sin haircuts cíclicos, sin shrinkage: la
 * confianza es etiqueta. Fixtures sintéticos derivados de las reglas
 * (los valores evocan casos auditados por el usuario, pero el motor
 * no contiene ninguna lógica por ticker).
 */
const C = (
  key: FvComponentInput['key'],
  value: number,
  extra?: Partial<FvComponentInput>
): FvComponentInput => ({ key, value, ...extra });

describe('múltiplo justificado (R11)', () => {
  it('petrolera E&P: el múltiplo sale del sector ajustado por su ROIC contra el sector (no de la tabla 26×)', () => {
    // Evoca el caso auditado: precio 66,89, EPS forward reparado
    // ~10,3–10,4, P/E propio 6,4×, sector (energía) ~11,2× con ROIC
    // mediano 7,95% contra 13,06% propio.
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
      roicPct: 13.06,
      industryForwardPe: 11.24,
      sectorRoicPct: 7.95,
      sectorGrowth5yPct: 10,
      finvizEpsNext5YPct: 12,
      targetMeanPrice: 95.46,
      analystCount: 12,
    });
    expect(r.fvFlags).toContain('multipleBasis:sectorAjustado');
    expect(r.fvFlags).not.toContain('sectorCappedMultiple');
    // J(empresa) = (1 − 5/13,06)/0,05 = 12,34; J(sector) =
    // (1 − 5/7,95)/0,05 = 7,42; cociente 1,66 ⇒ acotado a 1,6;
    // múltiplo = 11,24 × 1,6 = 17,98; pata ≈ 10,3 × 17,98 ≈ 185.
    expect(r.multiplesValue).not.toBeNull();
    expect(r.multiplesValue!).toBeGreaterThan(165);
    expect(r.multiplesValue!).toBeLessThan(200);
    // FV = promedio con el target 95,46 ⇒ zona 130–150, no 409,90.
    expect(r.fairValue!).toBeGreaterThan(125);
    expect(r.fairValue!).toBeLessThan(155);
  });

  it('fundamentos iguales a los del sector ⇒ el múltiplo ES el del sector (ajuste 1)', () => {
    const jm = justifiedMultiple({
      sectorForwardPe: 20,
      capitalReturnPct: 15,
      longRunGrowthPct: 10,
      sectorCapitalReturnPct: 15,
      sectorLongRunGrowthPct: 10,
      ownForwardPe: 22,
    });
    expect(jm.basis).toBe('sectorAjustado');
    expect(jm.adjustment).toBeCloseTo(1, 6);
    expect(jm.multiple).toBeCloseTo(20, 6);
  });

  it('mejor ROIC que el sector ⇒ múltiplo sobre el sector, acotado a 1,6×', () => {
    const jm = justifiedMultiple({
      sectorForwardPe: 20,
      capitalReturnPct: 40,
      longRunGrowthPct: 10,
      sectorCapitalReturnPct: 10,
      sectorLongRunGrowthPct: 10,
      ownForwardPe: 22,
    });
    expect(jm.basis).toBe('sectorAjustado');
    expect(jm.multiple!).toBeGreaterThan(20);
    expect(jm.multiple!).toBeLessThanOrEqual(32 + 1e-9);
    expect(jm.adjustment).toBeCloseTo(1.6, 6);
  });

  it('sin ROIC computable no hay ajuste: manda el P/E del sector pelado', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 4,
      moatMultiple: 26,
      industryForwardPe: 12,
    });
    expect(ev.multipleBasis).toBe('sector');
    expect(ev.multipleUsed).toBeCloseTo(12, 6);
    expect(ev.value).toBeCloseTo(48, 6);
    expect(ev.multipleCap).toBeCloseTo(12, 6);
  });

  it('sector no comparable (su P/E más que duplica al propio): cae al justificado por fundamentos propios', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 20, // P/E propio 5× contra un «sector» a 30×
      moatMultiple: 26,
      industryForwardPe: 30,
      capitalReturnPct: 40,
      longRunGrowthPct: 10,
      sectorCapitalReturnPct: 12,
      sectorLongRunGrowthPct: 10,
    });
    expect(ev.flags).toContain('sectorNotComparable');
    expect(ev.multipleBasis).toBe('fundamental');
    // J propio = (1 − 5/40)/0,05 = 17,5 ⇒ pata = 20 × 17,5 = 350.
    expect(ev.multipleUsed).toBeCloseTo(17.5, 6);
    expect(ev.value).toBeCloseTo(350, 6);
  });
});

describe('target anclado en su consenso (R9-2, vigente en R11)', () => {
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

  it('la winsorización jamás mueve el target anclado a su consenso (exento de la banda entre patas)', () => {
    const agg = aggregateFairValue(
      [C('multiples', 850), C('target', 95, { clipFloor: 60, clipCeiling: 95 })],
      { currentPrice: 100 }
    );
    // Sin la exención, la banda (referencia 850) levantaría el target
    // a 212,50; con ella, entra en su valor de consenso: 95.
    expect(agg.components.find((c) => c.key === 'target')?.value).toBe(95);
    expect(agg.winsorized.map((w) => w.component)).not.toContain('target');
  });

  it('sin ancla de consenso, el mismo pool SÍ levantaría el target (control del defecto original)', () => {
    const agg = aggregateFairValue([C('dcf', 900), C('multiples', 850), C('target', 95)], {
      currentPrice: 100,
    });
    expect(agg.components.find((c) => c.key === 'target')?.value).toBeCloseTo(218.75, 2);
  });

  it('el target tampoco se hunde por debajo de su mínimo de consenso cuando la fórmula colapsa (caso NBIS/MELI)', () => {
    const agg = aggregateFairValue(
      [C('multiples', 40), C('target', 280, { clipFloor: 200, clipCeiling: 320 })],
      { currentPrice: 100 }
    );
    // La banda contra la fórmula (40) recortaría el target a 140; la
    // exención lo deja en su valor de consenso.
    expect(agg.components.find((c) => c.key === 'target')?.value).toBe(280);
    // La fórmula sí entra winsorizada contra el target: 3,5 × 280 = 980
    // no la toca (40 < 980 y > 0,25 × 280 = 70 ⇒ sube al piso 70).
    expect(agg.components.find((c) => c.key === 'multiples')?.value).toBeCloseTo(70, 6);
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

describe('base del ANCLA histórica (R11: sin haircuts — la historia entra pelada, fuera del promedio)', () => {
  const baseInput = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10, // capitalización 1.000
    revenueGrowth: 0.1,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
  };

  it('FCF yield TTM de 30%: la base entra PELADA (el haircut de mitad de ciclo salió del motor)', () => {
    const r = computeFairValue({ ...baseInput, freeCashflow: 300 });
    const prov = r.fvProvenance?.find((p) => p.component === 'anchor');
    expect(prov?.originalValue).toBe(300);
    expect(prov?.usedValue).toBeCloseTo(300, 6);
    expect(r.fvFlags).not.toContain('cyclicalBaseHaircut');
  });

  it('FCF yield de 20%: también pelada, sin escalones', () => {
    const r = computeFairValue({ ...baseInput, freeCashflow: 200 });
    const prov = r.fvProvenance?.find((p) => p.component === 'anchor');
    expect(prov?.usedValue).toBeCloseTo(200, 6);
    expect(r.fvFlags).not.toContain('cyclicalBaseHaircut');
  });

  it('con serie ≥3 años manda la mediana (base normalizada, sin segundo ajuste)', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 300,
      fcfHistory: [300, 100, 100], // mediana 100, yield TTM 30%
    });
    const prov = r.fvProvenance?.find((p) => p.component === 'anchor');
    expect(prov?.usedValue).toBe(100);
    expect(prov?.sources).toEqual(['fcfHistoryMedian']);
    expect(r.fvFlags).not.toContain('cyclicalBaseHaircut');
  });
});

describe('tripwire de plausibilidad modelSuspect (R9-4, solo etiqueta en R11)', () => {
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

  it('computeFairValue: el tripwire marca la pata de fórmula dominante SIN deformar el número', () => {
    const r = computeFairValue({
      symbol: 'TEST',
      currentPrice: 100,
      sharesOutstanding: 10,
      freeCashflow: 100,
      revenueGrowth: 0.2,
      earningsGrowth: 0.2,
      beta: 1.1,
      totalCash: 0,
      totalDebt: 0,
      forwardEps: 9,
      forwardEpsAlt: 9,
      forwardEpsAltSource: 'finviz',
      // Sector comparable (12× contra P/E propio 11,1×) con ROIC muy
      // inferior: el ajuste (acotado a 1,6) lleva la fórmula a ~173
      // contra un target de 40 ⇒ FV > 2× target ⇒ sospechoso.
      industryForwardPe: 12,
      roicPct: 60,
      sectorRoicPct: 10,
      sectorGrowth5yPct: 20,
      finvizEpsNext5YPct: 20,
      targetMeanPrice: 40,
      targetHighPrice: 45,
      targetLowPrice: 30,
      analystCount: 10,
    });
    expect(r.fvModelSuspect).toBe(true);
    expect(r.fvSuspectDominant).toBe('multiples');
    expect(r.fvConfidence).toBe('Baja');
    const prov = r.fvProvenance?.find((p) => p.component === 'multiples');
    expect(prov?.flags).toContain('dominantDeviation');
    // El target final nunca supera su máximo de consenso.
    const targetFinal = Math.min(...(r.fvComponents ?? []));
    expect(targetFinal).toBeLessThanOrEqual(45);
    // Y el FV es el promedio de las dos patas, sin convergencia al
    // piso del rango ni shrinkage: la marca es solo una etiqueta.
    expect(r.fairValue!).toBeGreaterThan(80);
  });
});

describe('ponderación: dos patas en pie de igualdad, moduladas por calidad (método elegido)', () => {
  const full = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10,
    revenueGrowth: 0.1,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
    freeCashflow: 500,
    fcfHistory: [500, 500, 500, 500, 500], // historia para el ancla (fuera del pool)
    forwardEps: 5,
    forwardEpsAlt: 5,
    forwardEpsAltSource: 'finviz' as const, // 2 grupos directos de EPS
    // Fórmula firme: sector comparable + ROIC propio y sectorial.
    industryForwardPe: 20,
    roicPct: 20,
    sectorRoicPct: 15,
    sectorGrowth5yPct: 12,
    finvizEpsNext5YPct: 15,
    targetMeanPrice: 120,
  };

  it('datos firmes en ambas patas: 50/50', () => {
    const r = computeFairValue({
      ...full,
      targetHighPrice: 150,
      targetLowPrice: 90, // dispersión (150−90)/120 = 0,5 → calidad 1,0
      analystCount: 12,
    });
    const w = r.fvComponentWeights ?? [];
    expect(w).toHaveLength(2);
    // Orden del pool: [múltiplos · target], ambas calidad 1,0.
    expect(w[0]).toBeCloseTo(0.5, 6);
    expect(w[1]).toBeCloseTo(0.5, 6);
    // El DCF de ganancias ya no es una pata: queda registrado como
    // retirado del promedio en las exclusiones trazables.
    expect(r.fvExcluded?.some((e) => e.component === 'dcf' && e.reason === 'retiredFromAverage')).toBe(true);
    expect(r.dcfValue).toBeNull();
  });

  it('cobertura escasa (1–2 analistas): el peso del target baja y la fórmula manda', () => {
    const r = computeFairValue({ ...full, analystCount: 2 });
    const w = r.fvComponentWeights ?? [];
    expect(w).toHaveLength(2);
    // Target calidad 0,45 contra fórmula 1,0 ⇒ 0,45/1,45 ≈ 0,31.
    expect(w[1]).toBeGreaterThan(0.26);
    expect(w[1]).toBeLessThan(0.36);
    expect(w[1]).toBeLessThan(w[0]);
  });

  it('fórmula débil (EPS de una sola fuente, sin ajuste sectorial): el target manda', () => {
    const { forwardEpsAlt: _a, forwardEpsAltSource: _b, roicPct: _c, sectorRoicPct: _d, ...weak } = full;
    const r = computeFairValue({
      ...weak,
      targetHighPrice: 150,
      targetLowPrice: 90,
      analystCount: 12,
    });
    const w = r.fvComponentWeights ?? [];
    expect(w).toHaveLength(2);
    expect(w[1]).toBeGreaterThan(w[0]);
  });

  it('sin target: la fórmula sola, con peso 1 (singleComponent)', () => {
    const { targetMeanPrice: _drop, ...noTarget } = full;
    const r = computeFairValue(noTarget);
    const w = r.fvComponentWeights ?? [];
    expect(w).toEqual([1]);
    expect(r.fvFlags).toContain('singleComponent');
    expect(r.fairValue).toBeCloseTo(r.multiplesValue ?? 0, 6);
  });

  it('sin EPS positivo: el FV sale del target solo (imposibilidad matemática de la fórmula)', () => {
    const r = computeFairValue({
      ...full,
      forwardEps: -2,
      forwardEpsAlt: -1.5,
      targetHighPrice: 150,
      targetLowPrice: 90,
      analystCount: 12,
    });
    expect(r.multiplesValue).toBeNull();
    expect(r.fairValue).toBeCloseTo(120, 6);
    expect(r.fvConfidence).toBe('Baja');
  });
});
