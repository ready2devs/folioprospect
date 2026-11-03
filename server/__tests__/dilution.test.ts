import { describe, expect, it } from 'vitest';
import { resolveDilution, resolveDilutionFromFundamentals } from '../dilution.js';
import type { ReportedSharesYoY } from '../edgar.js';

// Reparación del ΔS (2026-11-03): el insumo de dilución del GK pasa a
// salir de los CONTEOS REPORTADOS de acciones en circulación cuando
// hay un par anual comparable; la serie de promedio ponderado queda
// como respaldo/cruce, y el conflicto de signo irresoluble → null.
const reported = (p: Partial<ReportedSharesYoY>): ReportedSharesYoY => ({
  pct: 0,
  latestEnd: '2025-12-31',
  priorEnd: '2024-12-31',
  latest: 100e6,
  prior: 100e6,
  gapDays: 365,
  comparable: true,
  concept: 'CommonStockSharesOutstanding',
  ...p,
});

describe('resolveDilution (ΔS desde conteos reportados)', () => {
  it('serie con signo invertido contra conteo reportado creciente → manda el reportado, con discrepancia (caso NBIS)', () => {
    // La serie de promedio ponderado decía −13,69% («recompra») porque
    // el promedio FY2024 arrastra el conteo previo a la escisión; los
    // conteos de cierre reportados dicen 235,8 M → 253,0 M (+7,29%).
    const r = resolveDilution({
      reported: reported({ pct: 7.29, latest: 253.0e6, prior: 235.8e6 }),
      seriesYoYPct: -13.69,
    });
    expect(r.source).toBe('reportado');
    expect(r.dilutionPct).toBeCloseTo(7.29, 6);
    expect(r.discrepancy).toBe(true);
    expect(r.seriesDilutionPct).toBeCloseTo(-13.69, 6);
    expect(r.reportedPeriodEnds).toEqual(['2025-12-31', '2024-12-31']);
    expect(r.gap).toBeNull();
  });

  it('recompra real reportada: el conteo manda y el ΔS queda negativo (el término GK de recompra se conserva)', () => {
    const r = resolveDilution({
      reported: reported({ pct: -2.04, latest: 9.02e9, prior: 9.21e9 }),
      seriesYoYPct: -1.65,
    });
    expect(r.source).toBe('reportado');
    expect(r.dilutionPct).toBeCloseTo(-2.04, 6);
    expect(r.dilutionPct).toBeLessThan(0); // −dilutionPct > 0 en el GK
    expect(r.discrepancy).toBe(false);
  });

  it('reportado comparable sin serie → manda el reportado, sin discrepancia', () => {
    const r = resolveDilution({ reported: reported({ pct: 3.5 }), seriesYoYPct: null });
    expect(r.source).toBe('reportado');
    expect(r.dilutionPct).toBeCloseTo(3.5, 6);
    expect(r.discrepancy).toBe(false);
  });

  it('sin conteos reportados → respaldo de la serie, con el hueco declarado', () => {
    const r = resolveDilution({ reported: null, seriesYoYPct: 1.15 });
    expect(r.source).toBe('proveedor');
    expect(r.dilutionPct).toBeCloseTo(1.15, 6);
    expect(r.gap).toBe('sin-conteo-reportado');
    expect(r.discrepancy).toBe(false);
  });

  it('conteo reportado no comparable y la serie lo contradice en signo → null (conflicto irresoluble, GK suma 0)', () => {
    const r = resolveDilution({
      reported: reported({ pct: 18.0, comparable: false, gapDays: 92, priorEnd: '2025-09-30' }),
      seriesYoYPct: -4.2,
    });
    expect(r.dilutionPct).toBeNull();
    expect(r.source).toBeNull();
    expect(r.gap).toBe('conflicto-irresoluble');
    expect(r.discrepancy).toBe(true);
  });

  it('conteo reportado no comparable pero la serie coincide en signo → manda la serie (no hay conflicto)', () => {
    const r = resolveDilution({
      reported: reported({ pct: 6.0, comparable: false, gapDays: 92, priorEnd: '2025-09-30' }),
      seriesYoYPct: 2.8,
    });
    expect(r.source).toBe('proveedor');
    expect(r.dilutionPct).toBeCloseTo(2.8, 6);
    expect(r.gap).toBe('conteo-reportado-no-comparable');
    expect(r.discrepancy).toBe(false);
  });

  it('sin ninguna fuente → null «sin dato» (R0: no castiga ni premia)', () => {
    const r = resolveDilution({ reported: null, seriesYoYPct: null });
    expect(r.dilutionPct).toBeNull();
    expect(r.source).toBeNull();
    expect(r.gap).toBe('sin-dato');
  });

  it('la resolución desde fundamentales consume los campos del pipeline', () => {
    const r = resolveDilutionFromFundamentals({
      sharesOutstandingYoY: {
        pct: 7.29,
        comparable: true,
        latestEnd: '2025-12-31',
        priorEnd: '2024-12-31',
      },
      sharesGrowthYoYPct: -13.69,
    });
    expect(r.source).toBe('reportado');
    expect(r.dilutionPct).toBeCloseTo(7.29, 6);
  });
});
