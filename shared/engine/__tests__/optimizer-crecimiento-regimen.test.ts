import { describe, it, expect } from 'vitest';
import {
  grinoldKroner,
  grinoldKronerParts,
  growthAnchorFor,
  sustainableGrowthFromRoic,
  type OptimizerAssetInput,
} from '../optimizer.js';

/**
 * Corrección del usuario 2026-11-03 (docs/OPTIMIZER-PROFESSIONAL.md
 * §15): el ancla del crecimiento de ganancias en GK depende del
 * régimen — empresa en crecimiento: ancla en VENTAS (+ margen de
 * apalancamiento operativo); empresa madura: crecimiento sustentable
 * g = ROIC × reinversión (estándar Damodaran/Morningstar), con el
 * respaldo ROE × (1 − payout) precomputado. En ambos regímenes, si el
 * consenso implica MENOS que el ancla, manda el consenso: el ancla es
 * techo de cordura, no piso. Fixtures sintéticos de las reglas.
 */
const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX',
  ticker: 'XXX',
  name: 'Test Co',
  sector: 'Technology',
  industry: 'Semiconductors',
  price: 100,
  qty: 10,
  value: 1000,
  isCrypto: false,
  isCash: false,
  ...p,
});

describe('crecimiento sustentable (fórmula pura)', () => {
  it('ROIC 20% × reinversión 30% → g ≈ 6% (ejemplo de la directiva)', () => {
    expect(sustainableGrowthFromRoic(20, 30)).toBeCloseTo(6, 6);
  });

  it('sin alguno de los dos insumos no hay ancla por esta vía', () => {
    expect(sustainableGrowthFromRoic(null, 30)).toBeNull();
    expect(sustainableGrowthFromRoic(20, null)).toBeNull();
    expect(sustainableGrowthFromRoic(undefined, undefined)).toBeNull();
  });
});

describe('régimen de crecimiento: el ancla son las ventas', () => {
  it('base de ganancias casi cero: el % de EPS absurdo queda anclado a ventas + apalancamiento', () => {
    // Caso Nebius: EPS creciendo +400% desde una base ínfima, ventas
    // +60%. El ancla es 60 + 10 = 70; sin ancla GK creería 400.
    const a = base({ earningsGrowthTotalPct: 400, salesGrowthPct: 60 });
    const parts = grinoldKronerParts(a);
    expect(parts.growthRegime).toBe('crecimiento');
    expect(parts.growthAnchorPct).toBe(70);
    expect(parts.growthBasePct).toBe(400);
    // R11: el clamp anti-basura de GK subió a +100 (el de +60 ataba en
    // 7 de 19 activos reales: rankeaba él, no el ancla) — ahora ata el
    // ANCLA por régimen: 70.
    expect(parts.growthUsedPct).toBe(70);
    expect(grinoldKroner(a)).toBe(70);
  });

  it('el ancla manda cuando el consenso de ganancias supera ventas + 10 pp', () => {
    const parts = grinoldKronerParts(base({ earningsGrowthTotalPct: 55, salesGrowthPct: 30 }));
    expect(parts.growthAnchorPct).toBe(40);
    expect(parts.growthUsedPct).toBe(40);
  });

  it('si el consenso implica MENOS que el ancla, manda el consenso (techo, no piso)', () => {
    const parts = grinoldKronerParts(base({ earningsGrowthTotalPct: 18, salesGrowthPct: 40 }));
    expect(parts.growthAnchorPct).toBe(50);
    expect(parts.growthUsedPct).toBe(18);
  });

  it('justo en el umbral (+12,5% de ventas) todavía no es régimen de crecimiento', () => {
    const anchor = growthAnchorFor(base({ salesGrowthPct: 12.5, roicPct: 10, reinvestmentRatePct: 20 }));
    expect(anchor?.regime).toBe('madura');
    expect(anchor?.anchorPct).toBeCloseTo(2, 6);
  });
});

describe('régimen maduro: g = ROIC × reinversión', () => {
  it('consenso exuberante queda anclado al sustentable (ROIC 20 × RR 30 → 6%)', () => {
    const a = base({
      salesGrowthPct: 4, earningsGrowthTotalPct: 25,
      roicPct: 20, reinvestmentRatePct: 30, dividendYieldPct: 2,
    });
    const parts = grinoldKronerParts(a);
    expect(parts.growthRegime).toBe('madura');
    expect(parts.growthAnchorPct).toBeCloseTo(6, 6);
    expect(parts.growthUsedPct).toBeCloseTo(6, 6);
    expect(parts.total!).toBeCloseTo(2 + 6, 5);
  });

  it('respaldo: sin reinversión calculable manda el sustentable equity precomputado', () => {
    const parts = grinoldKronerParts(base({
      salesGrowthPct: 3, earningsGrowthTotalPct: 25,
      roicPct: 20, sustainableGrowthPct: 7.5,
    }));
    expect(parts.growthAnchorPct).toBeCloseTo(7.5, 6);
    expect(parts.growthUsedPct).toBeCloseTo(7.5, 6);
  });

  it('la vía firma (ROIC × RR) tiene prioridad sobre el respaldo equity', () => {
    const anchor = growthAnchorFor(base({
      salesGrowthPct: 3, roicPct: 20, reinvestmentRatePct: 30, sustainableGrowthPct: 9,
    }));
    expect(anchor?.anchorPct).toBeCloseTo(6, 6);
  });

  it('consenso por debajo del ancla: manda el consenso', () => {
    const parts = grinoldKronerParts(base({
      salesGrowthPct: 4, earningsGrowthTotalPct: 3,
      roicPct: 20, reinvestmentRatePct: 30,
    }));
    expect(parts.growthUsedPct).toBe(3);
  });

  it('sin datos para el ancla, la estimación entra a valor facial', () => {
    const parts = grinoldKronerParts(base({ salesGrowthPct: 4, earningsGrowthTotalPct: 25 }));
    expect(parts.growthAnchorPct).toBeNull();
    expect(parts.growthUsedPct).toBe(25);
  });

  it('empresa sin crecimiento de ventas conocido y sin ROIC: tampoco hay ancla', () => {
    expect(growthAnchorFor(base({}))).toBeNull();
  });
});
