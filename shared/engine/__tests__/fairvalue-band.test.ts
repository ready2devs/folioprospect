import { describe, it, expect } from 'vitest';
import {
  computeFairValue,
  selectFairValueComponents,
  withinCredibilityBand,
  type FundamentalInput,
} from '../fairvalue.js';

// Regresión 2026-11-03: la banda de credibilidad del DCF (y de múltiplos) se
// medía contra el PRECIO, así que el Fair Value saltaba cuando el precio
// cruzaba un umbral — y en el sentido perverso: SIMO cayó bajo US$192,58 el
// 2026-11-02, su DCF de US$48,14 «entró» al promedio y el FV bajó de
// US$461,70 a US$323,85 (−29,8%) sin ningún cambio fundamental. La banda
// ahora se mide contra los otros componentes: el FV debe ser invariante
// ante el precio cuando los fundamentales no cambian.

describe('banda de credibilidad contra los otros componentes (no contra el precio)', () => {
  it('withinCredibilityBand: sin otros componentes, nada contradice → incluye', () => {
    expect(withinCredibilityBand(50, [])).toBe(true);
    expect(withinCredibilityBand(48.14, [560.31, 363.09])).toBe(false); // SIMO real
    expect(withinCredibilityBand(400, [560.31, 363.09])).toBe(true);
  });

  it('SIMO (componentes reales): el DCF de 48,14 queda fuera y el FV es 461,70', () => {
    const comps = selectFairValueComponents({ dcf: 48.14, multiples: 560.31, target: 363.09 });
    expect(comps).toEqual([560.31, 363.09]);
    const fv = comps.reduce((s, x) => s + x, 0) / comps.length;
    expect(fv).toBeCloseTo(461.7, 2);
  });

  it('caso sintético en banda: el DCF se incluye y el FV es el promedio de los tres', () => {
    const comps = selectFairValueComponents({ dcf: 400, multiples: 560.31, target: 363.09 });
    expect(comps).toEqual([400, 560.31, 363.09]);
    const fv = comps.reduce((s, x) => s + x, 0) / comps.length;
    expect(fv).toBeCloseTo((400 + 560.31 + 363.09) / 3, 6);
  });

  it('activo solo-DCF: el DCF se incluye (no hay nada que lo contradiga)', () => {
    expect(selectFairValueComponents({ dcf: 50, multiples: null, target: null })).toEqual([50]);
    expect(selectFairValueComponents({ dcf: null, multiples: 80, target: null })).toEqual([80]);
    expect(selectFairValueComponents({ dcf: null, multiples: null, target: 120 })).toEqual([120]);
  });

  it('META (componentes reales 2026-11-02): selección estable, sin salto en 615,99', () => {
    // Con la regla vieja el DCF (2.155,95) entraba/salía según el precio
    // cruzara 615,99 (3,5 × precio). La selección ya no recibe el precio.
    const comps = selectFairValueComponents({ dcf: 2155.95, multiples: 925.28, target: 848.38 });
    expect(comps).toEqual([2155.95, 925.28, 848.38]);
  });

  it('MU (componentes reales 2026-11-02): selección estable, sin salto en 715,69', () => {
    const comps = selectFairValueComponents({ dcf: 2504.92, multiples: 2033.4, target: 1561.91 });
    expect(comps).toEqual([2504.92, 2033.4, 1561.91]);
    const fv = comps.reduce((s, x) => s + x, 0) / comps.length;
    expect(fv).toBeCloseTo(2033.41, 2);
  });
});

// Fundamentales fijos (EPS forward anclado vía forwardPE = precio/EPS, así el
// componente de múltiplos no se mueve con el precio) y precios variables: el
// FV no puede cambiar si no cambia ningún fundamental.
const FIXED = {
  sharesOutstanding: 1e8,
  revenueGrowth: 0.1,
  grossMargins: 0.6,
  operatingMargins: 0.3,
  returnOnEquity: 0.3,
  beta: 1.2,
} satisfies Partial<FundamentalInput>;

function fvAt(price: number, epsAnchor: number, fcf: number, target: number) {
  return computeFairValue({
    symbol: 'NASDAQ:TEST',
    currentPrice: price,
    ...FIXED,
    targetMeanPrice: target,
    freeCashflow: fcf,
    forwardPE: price / epsAnchor,
  });
}

describe('computeFairValue: invariancia del FV ante el precio', () => {
  it('SIMO-like: FV = 461,70 (DCF excluido) a precios 120…300, idéntico en todos', () => {
    const prices = [120, 150, 187.9, 195, 210, 300];
    const fvs = prices.map((p) => fvAt(p, 21.55, 2.4e8, 363.09));
    for (const fv of fvs) {
      expect(fv.fairValue).toBeCloseTo(461.7, 2);
      expect(fv.fvComponents).toHaveLength(2);
      expect(fv.dcfValue).not.toBeNull();
      expect(fv.fvComponents).not.toContain(fv.dcfValue);
    }
    const values = fvs.map((f) => f.fairValue ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.01);
  });

  it('en banda: el DCF se promedia a todo precio y el FV es el promedio de los tres', () => {
    const prices = [120, 187.9, 300];
    const fvs = prices.map((p) => fvAt(p, 21.55, 1.6e9, 363.09));
    for (const fv of fvs) {
      expect(fv.fvComponents).toHaveLength(3);
      expect(fv.fvComponents).toContain(fv.dcfValue);
      const expected = ((fv.dcfValue ?? 0) + 560.3 + 363.09) / 3;
      expect(fv.fairValue).toBeCloseTo(expected, 4);
    }
    const values = fvs.map((f) => f.fairValue ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.01);
  });

  it('META-like: el FV no cambia al cruzar 615,99 (umbral peligroso de la regla vieja)', () => {
    const prices = [550, 600, 615.99, 700];
    const fvs = prices.map((p) => fvAt(p, 35.58, 9.58e9, 848.38));
    const values = fvs.map((f) => f.fairValue ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.01);
    // La inclusión del DCF es la misma a todo precio.
    const included = fvs.map((f) => (f.fvComponents ?? []).includes(f.dcfValue ?? NaN));
    expect(new Set(included).size).toBe(1);
  });

  it('MU-like: el FV no cambia al cruzar 715,69 (umbral peligroso de la regla vieja)', () => {
    const prices = [650, 700, 715.69, 900];
    const fvs = prices.map((p) => fvAt(p, 78.21, 1.11e10, 1561.91));
    const values = fvs.map((f) => f.fairValue ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.01);
    const included = fvs.map((f) => (f.fvComponents ?? []).includes(f.dcfValue ?? NaN));
    expect(new Set(included).size).toBe(1);
  });
});
