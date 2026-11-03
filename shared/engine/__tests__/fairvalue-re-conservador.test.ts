import { describe, it, expect } from 'vitest';
import { computeFairValue, evaluateMultiplesComponent } from '../fairvalue.js';

/**
 * Pase correctivo RE — piezas que viven en el motor de valuación:
 * (C) castigo al DCF emergente (haircut ×0,75 a la base TTM y calidad
 * al piso 0,30; el componente se castiga, no se elimina) y (D) la
 * detección del desacuerdo de signo entre fuentes directas del EPS
 * forward. Fixtures sintéticos derivados de las reglas.
 */
describe('DCF emergente castigado (C)', () => {
  const baseInput = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10,
    revenueGrowth: 0.3,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
  };

  it('la base TTM del DCF emergente entra con haircut ×0,75 (procedencia lo muestra)', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200], // mediana −50 ≤ 0, TTM +100, ingresos +30%
      targetMeanPrice: 120,
    });
    expect(r.fvFlags).toContain('ttmBaseEmerging');
    expect(r.dcfValue).not.toBeNull();
    const prov = r.fvProvenance?.find((p) => p.component === 'dcf');
    expect(prov?.originalValue).toBe(100);
    expect(prov?.usedValue).toBeCloseTo(75, 6);
  });

  it('el DCF emergente vale exactamente 75% del mismo DCF con base plena (sin caja neta)', () => {
    const emerging = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200],
      targetMeanPrice: 120,
    });
    // Gemelo no emergente: la mediana de la serie ES 100 (la base plena).
    const fullBase = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, 100, 100],
      targetMeanPrice: 120,
    });
    expect(fullBase.dcfValue).not.toBeNull();
    expect(emerging.dcfValue!).toBeCloseTo(0.75 * fullBase.dcfValue!, 4);
  });

  it('la calidad del DCF emergente es el piso de la escala de ponderación (R9)', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200],
      // Escala de ponderación vigente (directivas 2026-11-03): múltiplos
      // con 2 grupos directos → 0,45; target de una fuente sin conteo
      // de analistas → 0,45; DCF emergente → 0,30 (el piso). Pesos
      // resultantes: [0,25, 0,375, 0,375] — el emergente es el menor.
      forwardEps: 5,
      forwardEpsAlt: 5,
      forwardEpsAltSource: 'finviz' as const,
      targetMeanPrice: 120,
    });
    expect(r.fvComponents).toHaveLength(3);
    const w = r.fvComponentWeights ?? [];
    expect(w).toHaveLength(3);
    // Orden del pool: dcf, múltiplos, target.
    expect(w[0]).toBeCloseTo(0.25, 6);
    expect(w[0]).toBeLessThan(w[1]);
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
  });
});

describe('desacuerdo de signo entre fuentes del EPS (D)', () => {
  it('fuentes directas con signos opuestos en el mismo refresco: signDisagreement', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 141.39,
      forwardEps: -4.88, // Yahoo en este refresco
      forwardEpsAlt: 1.83, // Finviz implícito en el mismo refresco
      forwardEpsAltSource: 'finviz',
      moatMultiple: 26,
    });
    expect(ev.signDisagreement).toBe(true);
    expect(ev.flags).toContain('signDisagreement');
    // La valuación sigue: manda la fuente plausible positiva.
    expect(ev.epsUsed).toBeCloseTo(1.83, 6);
    expect(ev.value).not.toBeNull();
  });

  it('fuentes directas del mismo signo: sin desacuerdo', () => {
    const ev = evaluateMultiplesComponent({
      currentPrice: 100,
      forwardEps: 2.0,
      forwardEpsAlt: 2.2,
      forwardEpsAltSource: 'finviz',
      moatMultiple: 20,
    });
    expect(ev.signDisagreement).toBe(false);
    expect(ev.flags).not.toContain('signDisagreement');
  });

  it('computeFairValue expone epsSignDisagreement sin bajar la etiqueta pública por ese flag', () => {
    const r = computeFairValue({
      symbol: 'TEST',
      currentPrice: 141.39,
      sharesOutstanding: 100,
      forwardEps: -4.88,
      forwardEpsAlt: 1.83,
      forwardEpsAltSource: 'finviz',
      targetMeanPrice: 200,
      beta: 1.2,
      totalCash: 0,
      totalDebt: 0,
    });
    expect(r.epsSignDisagreement).toBe(true);
    expect(r.fvFlags).toContain('signDisagreement');
  });
});
