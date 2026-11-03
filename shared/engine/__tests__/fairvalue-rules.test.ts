import { describe, it, expect } from 'vitest';
import {
  aggregateFairValue,
  computeFairValue,
  evaluateMultiplesComponent,
  type FvComponentInput,
} from '../fairvalue.js';

/**
 * Aceptación del rediseño de valuación (docs/VALUATION-RULES.md):
 * reparar antes que excluir, ampliar la muestra y promediar con
 * winsorización; nulidad solo ante imposibilidad matemática. Los
 * fixtures usan valores reales de los casos que motivaron el rediseño,
 * pero el motor no contiene ninguna lógica por ticker.
 */
const C = (
  key: FvComponentInput['key'],
  value: number,
  extra?: Partial<FvComponentInput>
): FvComponentInput => ({ key, value, ...extra });

describe('reparación del EPS forward (cadena multifuente)', () => {
  it('VIST: la primitiva corrupta (EPS ~216, P/E 0,31) se repara con las fuentes sanas', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 67,
      publishedForwardPe: 0.31,
      altPublishedForwardPe: 10,
      forwardEps: 216.13,
      forwardEpsAlt: 6.7,
      forwardEpsAltSource: 'finviz',
      trailingEps: 6.1,
      earningsGrowth: 0.08,
      moatMultiple: 26,
      // Prima Wide que computeFairValue pasa para un moat de 26× (R9).
      moatPremium: 1.5,
    });
    // Fuentes plausibles: 6,70 (Finviz) y 6,588 (trailing × crecimiento).
    expect(ev.epsUsed).toBeCloseTo(6.644, 2);
    // Tope sectorial (R9): el P/E propio recomputado es 67/6,644 = 10,08;
    // con prima Wide 1,5 el múltiplo aplicado es 15,13 (no 26) y el
    // componente queda en la zona del mercado (~100, no 172,74).
    expect(ev.multipleCap).toBeCloseTo(15.13, 1);
    expect(ev.value).toBeCloseTo(100.5, 0);
    expect(ev.flags).toContain('sectorCappedMultiple');
    expect(ev.flags).toContain('repairedFromSources');
    expect(ev.excluded).toBeNull();
    expect(ev.provenance.originalEps).toBeCloseTo(216.13, 2);
    expect(ev.provenance.sources).toContain('finvizImpliedEps');

    // Y el FV resultante nunca es el 409,90 del régimen anterior: el DCF
    // gigante entra winsorizado, y el target YA NO se levanta — la
    // referencia robusta excluye al DCF extremo del cálculo de bandas
    // ajenas (R9). El tripwire marca el modelo sospechoso (FV > 2,5×
    // precio) con el DCF como componente dominante.
    const agg = aggregateFairValue(
      [C('dcf', 724.3), C('multiples', ev.value ?? 0), C('target', 95.44)],
      { currentPrice: 67 }
    );
    expect(agg.fairValue).not.toBeCloseTo(409.9, 0);
    expect(agg.excluded).toHaveLength(0);
    expect(agg.winsorized.map((w) => w.component)).toEqual(['dcf']);
    expect(agg.components.find((c) => c.key === 'target')?.value).toBe(95.44);
    expect(agg.referenceOutliers).toEqual(['dcf']);
    expect(agg.flags).toContain('modelSuspect');
    expect(agg.modelSuspectDominant).toBe('dcf');
    expect(agg.confidence).toBe('Baja');
  });

  it('VIST sin primitiva: el EPS derivado del ratio publicado también se repara', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 67,
      publishedForwardPe: 0.31,
      altPublishedForwardPe: 10,
      forwardEpsAlt: 6.7,
      forwardEpsAltSource: 'finviz',
      trailingEps: 6.1,
      earningsGrowth: 0.08,
      moatMultiple: 26,
      moatPremium: 1.5,
    });
    expect(ev.value).toBeCloseTo(100.5, 0);
    expect(ev.flags).toContain('unconfirmedEps');
    expect(ev.flags).toContain('repairedFromSources');
  });

  it('HSAI: factor entero 8 entre fuentes ⇒ base normalizada; yield extremo confirmado, componente admitido', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 12.29,
      publishedForwardPe: 2.2268,
      altPublishedForwardPe: 17.8,
      forwardEps: 5.52,
      forwardEpsAlt: 0.69,
      forwardEpsAltSource: 'finviz',
      moatMultiple: 15,
    });
    expect(ev.flags).toContain('basisNormalized');
    expect(ev.flags).toContain('extremeYieldConfirmed');
    expect(ev.excluded).toBeNull();
    expect(ev.epsUsed).toBeCloseTo(5.52, 2);
    // Tope sectorial (R9): el P/E propio recomputado es 12,29/5,52 =
    // 2,23 — un múltiplo de tabla de 15× sobre ese papel es indefendible;
    // sin prima declarada el componente queda en el precio (×1).
    expect(ev.flags).toContain('sectorCappedMultiple');
    expect(ev.multipleUsed).toBeCloseTo(2.23, 1);
    expect(ev.value).toBeCloseTo(12.29, 1);
  });

  it('MU: desacuerdo entre fuentes ⇒ mediana de fuentes; el componente entra (no se rechaza)', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 833.59,
      publishedForwardPe: 4.01,
      altPublishedForwardPe: 4.39,
      forwardEps: 207.8,
      forwardEpsAlt: 190,
      forwardEpsAltSource: 'finviz',
      trailingEps: 30,
      earningsGrowth: 0.5,
      moatMultiple: 26,
    });
    expect(ev.epsUsed).toBeCloseTo(190, 6);
    // Tope sectorial (R9): P/E propio 833,59/190 = 4,39; crecimiento
    // 50% ⇒ prima de crecimiento máxima (+40%): múltiplo aplicado
    // 6,14 y componente 1.167 (no los 4.940 del múltiplo de tabla 26×).
    expect(ev.flags).toContain('sectorCappedMultiple');
    expect(ev.multipleUsed).toBeCloseTo(6.14, 1);
    expect(ev.value).toBeCloseTo(1167.03, 1);
    expect(ev.flags).toContain('repairedFromSources');
    expect(ev.excluded).toBeNull();
  });

  it('MU sin segunda fuente: yield 24,9% entra con cautela (ya no hay rechazo por zona)', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 833.59,
      publishedForwardPe: 4.01,
      forwardEps: 207.8,
      moatMultiple: 26,
    });
    // Con el tope sectorial (R9) el componente queda en el propio
    // precio: el mercado paga 4,01× y ningún múltiplo de tabla lo
    // multiplica por 6,5 sin referencia sectorial que lo sostenga.
    expect(ev.value).toBeCloseTo(833.59, 1);
    expect(ev.flags).toContain('sectorCappedMultiple');
    expect(ev.flags).toContain('extremeYieldCaution');
    expect(ev.excluded).toBeNull();
  });

  it('yield >33% confirmado por dos grupos independientes: entra con extremeYieldConfirmed', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 50,
      forwardEps: 20,
      forwardEpsAlt: 19,
      forwardEpsAltSource: 'finviz',
      moatMultiple: 15,
    });
    // EPS 19,5 a precio 50 ⇒ P/E propio 2,56: el tope sectorial (R9)
    // deja el componente en el precio (el yield extremo queda
    // documentado por el flag, no amplificado por el múltiplo).
    expect(ev.value).toBeCloseTo(50, 6);
    expect(ev.flags).toContain('sectorCappedMultiple');
    expect(ev.flags).toContain('extremeYieldConfirmed');
    expect(ev.excluded).toBeNull();
  });

  it('NBIS: EPS forward negativo ⇒ múltiplos null (n/m); ningún número negativo llega a la agregación', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 92.5,
      publishedForwardPe: -39.3,
      forwardEps: -2.54,
      forwardEpsAlt: -2.4,
      forwardEpsAltSource: 'finviz',
      trailingEps: -3,
      moatMultiple: 20,
    });
    expect(ev.value).toBeNull();
    expect(ev.flags).toContain('notMeaningful');
    expect(ev.excluded?.reason).toBe('notMeaningful');

    const agg = aggregateFairValue([C('dcf', 678.61), C('target', 281)], {
      currentPrice: 92.5,
    });
    expect(agg.fairValue).toBeCloseTo(479.81, 1);
    expect(agg.components.every((c) => c.value > 0)).toBe(true);
  });

  it('ratio publicado vs recomputado difieren >5%: manda la primitiva y queda el flag', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      publishedForwardPe: 25, // recomputado: 100/5 = 20
      forwardEps: 5,
      moatMultiple: 20,
    });
    expect(ev.epsUsed).toBe(5);
    expect(ev.value).toBe(100);
    expect(ev.flags).toContain('providerRatioMismatch');
  });

  it('zona de cautela 12,5% < ey ≤ 33%: entra con extremeYieldCaution', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 16,
      moatMultiple: 20,
    });
    // P/E propio 6,25 ⇒ tope sectorial (R9): componente = precio.
    expect(ev.value).toBe(100);
    expect(ev.flags).toContain('sectorCappedMultiple');
    expect(ev.flags).toContain('extremeYieldCaution');
  });

  it('R0: sin ningún EPS de proveedor, se deriva de los estados contables (EDGAR) y se valúa igual', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 50,
      reportedEpsLatest: 4,
      earningsGrowth: 0.25,
      moatMultiple: 20,
    });
    // EPS derivado: 4 × 1,25 = 5 (último EPS anual auditado × crecimiento).
    expect(ev.epsUsed).toBeCloseTo(5, 6);
    // Tope sectorial (R9): P/E propio 10 × prima de crecimiento (25%
    // ⇒ +15%) = 11,5 ⇒ componente 57,5 (no 5 × 20 de tabla).
    expect(ev.value).toBeCloseTo(57.5, 6);
    expect(ev.flags).toContain('sectorCappedMultiple');
    expect(ev.flags).toContain('derivedFromFilings');
    expect(ev.flags).toContain('singleSource');
    expect(ev.excluded).toBeNull();
    expect(ev.provenance.sources).toEqual(['edgarFilingsDerivedEps']);
  });

  it('R0: el escalón de filings no desplaza a las fuentes directas cuando existen', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 5.2,
      reportedEpsLatest: 4,
      earningsGrowth: 0.25,
      moatMultiple: 20,
    });
    expect(ev.flags).not.toContain('derivedFromFilings');
    expect(ev.epsUsed).toBeCloseTo(5.1, 6); // promedio de fuentes que coinciden
    expect(ev.value).toBeCloseTo(102, 6);
  });

  it('P/E forward > 150 con EPS > 0: entra igual, con flag informativo', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 300,
      forwardEps: 1.5,
      moatMultiple: 20,
    });
    expect(ev.value).toBe(30);
    expect(ev.flags).toContain('extremePeReferenceOnly');
    expect(ev.excluded).toBeNull();
  });
});

describe('agregación por promedio winsorizado', () => {
  it('SIMO: FV = promedio winsorizado de los tres componentes (no la mediana pelada)', () => {
    const agg = aggregateFairValue(
      [
        C('dcf', 48.14, { troughAdjusted: true }),
        C('target', 363.09),
        C('multiples', 560.31),
      ],
      { currentPrice: 187.9, flags: ['troughAdjusted'] }
    );
    // El DCF entra recortado al borde inferior: 0,25 × prom(363,09; 560,31).
    expect(agg.winsorized).toHaveLength(1);
    expect(agg.winsorized[0].component).toBe('dcf');
    expect(agg.winsorized[0].originalValue).toBe(48.14);
    expect(agg.winsorized[0].clippedValue).toBeCloseTo(115.425, 6);
    expect(agg.fairValue).toBeCloseTo(346.28, 1);
    expect(agg.fairValue).not.toBeCloseTo(363.09, 6);
    expect(agg.excluded).toHaveLength(0);
    expect(agg.range).toEqual([48.14, 560.31]);
    expect(agg.confidence).toBe('Baja');
  });

  it('MELI: el DCF gigante entra winsorizado al borde; nada se excluye ni desaparece', () => {
    const agg = aggregateFairValue(
      [C('dcf', 9758.77), C('multiples', 1117.89), C('target', 2271.93)],
      { currentPrice: 1900 }
    );
    expect(agg.excluded).toHaveLength(0);
    // Referencia robusta (R9): el DCF es un outlier contra la mediana
    // (9.758 > 3,5 × 2.272) y ya NO arrastra el piso que recortaba a
    // los múltiplos sanos — estos entran con su valor, sin levantarse.
    // Solo el propio DCF se winsoriza contra los otros dos.
    expect(agg.referenceOutliers).toEqual(['dcf']);
    expect(agg.flags).toContain('referenceOutlierExcluded');
    expect(agg.winsorized.map((w) => w.component)).toEqual(['dcf']);
    const dcfW = agg.winsorized.find((w) => w.component === 'dcf');
    expect(dcfW?.originalValue).toBe(9758.77);
    expect(dcfW?.clippedValue).toBeCloseTo(5932.19, 1);
    expect(agg.components.find((c) => c.key === 'multiples')?.value).toBe(1117.89);
    expect(agg.fairValue).toBeCloseTo(3107.34, 1);
    expect(Number.isFinite(agg.fairValue ?? NaN)).toBe(true);
  });

  it('un solo componente: el activo igual tiene valuación (singleComponent, Baja)', () => {
    const agg = aggregateFairValue([C('target', 120)], { currentPrice: 100 });
    expect(agg.fairValue).toBe(120);
    expect(agg.flags).toContain('singleComponent');
    expect(agg.confidence).toBe('Baja');
    expect(agg.range).toEqual([120, 120]);
    expect(agg.nullReason).toBeNull();
  });

  it('cero componentes: null con motivo noValidComponents (nunca se fabrica desde el precio)', () => {
    const agg = aggregateFairValue([], { currentPrice: 100 });
    expect(agg.fairValue).toBeNull();
    expect(agg.nullReason).toBe('noValidComponents');
  });

  it('componentes cercanos y sin flags: confianza Alta', () => {
    const agg = aggregateFairValue(
      [C('dcf', 100), C('multiples', 105), C('target', 110)],
      { currentPrice: 100 }
    );
    expect(agg.fairValue).toBe(105);
    expect(agg.winsorized).toHaveLength(0);
    expect(agg.confidence).toBe('Alta');
  });
});

describe('base del DCF normalizada y procedencia (computeFairValue)', () => {
  const baseInput = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10,
    revenueGrowth: 0.1,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
  };

  it('con ≥3 años, la base es la mediana de la serie (no el TTM inflado)', () => {
    // sharesOutstanding amplio: el yield TTM queda en 5% y no dispara
    // la normalización cíclica de la base (R9) — este test compara
    // mediana contra TTM pelado.
    const ttm = computeFairValue({ ...baseInput, sharesOutstanding: 100, freeCashflow: 500 });
    const withHistory = computeFairValue({
      ...baseInput,
      sharesOutstanding: 100,
      freeCashflow: 999,
      fcfHistory: [600, 500, 400],
    });
    expect(withHistory.dcfValue).toBeCloseTo(ttm.dcfValue ?? 0, 6);
    const prov = withHistory.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.originalValue).toBe(999);
    expect(prov?.usedValue).toBe(500);
    expect(prov?.sources).toEqual(['fcfHistoryMedian']);
  });

  it('último año >3× la mediana: se usa la mediana y se marca normalizedBase', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 2000,
      fcfHistory: [2000, 500, 400],
    });
    expect(r.fvFlags).toContain('normalizedBase');
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.usedValue).toBe(500);
  });

  it('mediana de FCF ≤ 0: DCF null por imposibilidad; el activo se valúa con el resto', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200],
      targetMeanPrice: 120,
    });
    expect(r.dcfValue).toBeNull();
    expect(r.fvExcluded?.some((e) => e.reason === 'medianFcfNonPositive')).toBe(true);
    expect(r.fairValue).toBe(120);
    expect(r.fvFlags).toContain('singleComponent');
  });

  it('valle cíclico: último FCF < 0,5× mediana ⇒ troughAdjusted y base = mediana', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 300,
      fcfHistory: [300, 1000, 1100],
    });
    expect(r.fvFlags).toContain('troughAdjusted');
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.usedValue).toBe(1000);
  });

  it('serie de menos de 3 años: fallback uniforme a la base TTM, sin flags', () => {
    // Yield TTM de 5% (sin pico de ciclo): la base entra pelada.
    const r = computeFairValue({
      ...baseInput,
      sharesOutstanding: 100,
      freeCashflow: 500,
      fcfHistory: [700],
    });
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.usedValue).toBe(500);
    expect(prov?.sources).toEqual(['ttm']);
    expect(r.fvFlags).not.toContain('normalizedBase');
    expect(r.fvFlags).not.toContain('cyclicalBaseHaircut');
  });

  it('target: promedia las fuentes disponibles (Yahoo + Finviz)', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 500,
      targetMeanPrice: 300,
      targetAltPrice: 340,
    });
    expect(r.analystTarget).toBe(320);
    const prov = r.fvProvenance?.find((p) => p.component === 'target');
    expect(prov?.sources).toEqual(['yahooTargetMean', 'finvizTargetPrice']);
  });

  it('target sin promedio: escalón de respaldo con la mediana del mismo consenso', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 500,
      targetMedianPrice: 280,
    });
    expect(r.analystTarget).toBe(280);
    const prov = r.fvProvenance?.find((p) => p.component === 'target');
    expect(prov?.sources).toEqual(['yahooTargetMedian']);
  });

  it('R0: base del DCF derivada de filings (EDGAR) queda marcada en la procedencia', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 500,
      fcfDerivedFromFilings: true,
    });
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.sources).toEqual(['edgarAnnualCashflow']);
    expect(prov?.flags).toContain('derivedFromFilings');
    expect(r.fvFlags).toContain('derivedFromFilings');
    expect(r.dcfValue).not.toBeNull();
  });
});

describe('DCF emergente y ponderación por calidad (Optimizador profesional §9–§10)', () => {
  const baseInput = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
  };

  it('mediana ≤ 0 pero TTM > 0 e ingresos creciendo > 15%: DCF sobre base TTM con flag, no null', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200],
      revenueGrowth: 0.3,
      targetMeanPrice: 120,
    });
    expect(r.dcfValue).not.toBeNull();
    expect(r.fvFlags).toContain('ttmBaseEmerging');
    expect(r.fvExcluded?.some((e) => e.reason === 'medianFcfNonPositive')).toBe(false);
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.flags).toContain('ttmBaseEmerging');
    // Y el activo queda valuado con MÁS de un componente (no singleComponent).
    expect(r.fvFlags).not.toContain('singleComponent');
  });

  it('sin crecimiento que lo explique (≤ 15%), la mediana ≤ 0 sí anula el DCF', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200],
      revenueGrowth: 0.15,
      targetMeanPrice: 120,
    });
    expect(r.dcfValue).toBeNull();
  });

  it('aggregateFairValue: la calidad mueve el promedio con ratio acotado y los pesos suman 1', () => {
    const agg = aggregateFairValue(
      [
        { key: 'dcf', value: 100, quality: 1 },
        { key: 'target', value: 200, quality: 0.3 },
      ],
      { currentPrice: 100 }
    );
    // Sin calidad sería 150 (promedio simple). Con calidad 1 vs 0,3 el
    // peso del target se acota a ≥ 0,5× el igualitario (0,25) y el FV
    // queda entre ambos extremos, más cerca del componente confiable.
    expect(agg.fairValue!).toBeGreaterThan(100);
    expect(agg.fairValue!).toBeLessThan(150);
    expect(agg.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 6);
    expect(Math.max(...agg.weights) / Math.min(...agg.weights)).toBeLessThanOrEqual(4.01);
  });

  it('sin datos de calidad, el promedio es el igualitario de siempre', () => {
    const agg = aggregateFairValue(
      [
        { key: 'dcf', value: 100 },
        { key: 'target', value: 200 },
      ],
      { currentPrice: 100 }
    );
    expect(agg.fairValue).toBeCloseTo(150);
    expect(agg.weights).toEqual([0.5, 0.5]);
  });
});
