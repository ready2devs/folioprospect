import { describe, it, expect } from 'vitest';
import { computeFairValue, evaluateMultiplesComponent } from '../fairvalue.js';

/**
 * Pase correctivo RE — piezas que viven en el motor de valuación:
 * (C) castigo al DCF emergente (haircut ×0,75 a la base TTM; desde la
 * arquitectura R10 ese DCF es el ancla histórica y el castigo vive
 * dentro de ella, fuera del promedio) y (D) la detección del
 * desacuerdo de signo entre fuentes directas del EPS forward.
 * Fixtures sintéticos derivados de las reglas.
 */
describe('ancla con base TTM (ex «DCF emergente»): sin castigo (R11)', () => {
  const baseInput = {
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10,
    revenueGrowth: 0.3,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
  };

  it('la base TTM entra PELADA (el haircut ×0,75 salió del motor; la procedencia lo muestra)', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200], // mediana −50 ≤ 0, TTM +100, ingresos +30%
      targetMeanPrice: 120,
    });
    expect(r.fvFlags).not.toContain('ttmBaseEmerging');
    // El DCF de historia vive en el ANCLA histórica (fuera del FV).
    expect(r.historicalAnchorValue).not.toBeNull();
    const prov = r.fvProvenance?.find((p) => p.component === 'anchor');
    expect(prov?.originalValue).toBe(100);
    expect(prov?.usedValue).toBeCloseTo(100, 6);
    expect(prov?.flags).toContain('anchorTtmBase');
  });

  it('el ancla con base TTM vale EXACTAMENTE lo mismo que con base plena (sin caja neta)', () => {
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
    expect(fullBase.historicalAnchorValue).not.toBeNull();
    expect(emerging.historicalAnchorValue!).toBeCloseTo(fullBase.historicalAnchorValue!, 4);
  });

  it('el ancla no pondera: vive fuera del promedio, que se forma con las DOS patas vigentes', () => {
    const r = computeFairValue({
      ...baseInput,
      freeCashflow: 100,
      fcfHistory: [100, -50, -200],
      forwardEps: 5,
      forwardEpsAlt: 5,
      forwardEpsAltSource: 'finviz' as const,
      targetMeanPrice: 120,
    });
    // El ancla existe como referencia…
    expect(r.historicalAnchorValue).not.toBeNull();
    const prov = r.fvProvenance?.find((p) => p.component === 'anchor');
    expect(prov?.flags).toContain('anchorTtmBase');
    expect(prov?.usedValue).toBeCloseTo(100, 6);
    // …pero el FV se forma SOLO con fórmula y target (2 componentes,
    // ninguno es el valor del ancla).
    expect(r.fvComponents).toHaveLength(2);
    expect(r.fvComponents).not.toContain(r.historicalAnchorValue);
    const w = r.fvComponentWeights ?? [];
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
