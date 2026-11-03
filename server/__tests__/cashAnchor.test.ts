import { describe, expect, it } from 'vitest';
import {
  anchorCrosscheckDiscrepancy,
  providerTtmFromFundamentals,
  reportedWindowIsTtm,
  resolveAnchorFcf,
  ANCHOR_CROSSCHECK_FACTOR,
} from '../cashAnchor.js';
import type { EdgarTtmCashflow } from '../edgar.js';

// R12.3: el ancla de caja real toma su FCF de los ESTADOS REPORTADOS
// (primario) con el campo del proveedor como chequeo cruzado y
// respaldo documentado. «Hoy» fijo para las ventanas: 2026-11-03.
const NOW = new Date('2026-11-03T12:00:00Z');

const reported = (p: Partial<EdgarTtmCashflow>): EdgarTtmCashflow => ({
  operatingCashflow: 0,
  capex: 0,
  freeCashflow: 0,
  periodEnd: '2026-09-30',
  windowKind: 'ttm',
  ...p,
});

describe('resolveAnchorFcf (R12.3)', () => {
  it('mega-cap con campo del proveedor roto (signo invertido) y reportado positivo → manda el reportado, con discrepancia (caso GOOG)', () => {
    const r = resolveAnchorFcf({
      reported: reported({ freeCashflow: 19_747_000_000 }),
      providerTtmUsd: -1_162_500_000,
      now: NOW,
    });
    expect(r.source).toBe('reportado');
    expect(r.fcfTtmUsd).toBe(19_747_000_000);
    expect(r.periodEnd).toBe('2026-09-30');
    expect(r.discrepancy).toBe(true);
    expect(r.providerFcfTtmUsd).toBe(-1_162_500_000);
  });

  it('quemador con reportado negativo consistente con el proveedor → manda el reportado, sin discrepancia (caso AMZN)', () => {
    const r = resolveAnchorFcf({
      reported: reported({ freeCashflow: -46_892_000_000 }),
      providerTtmUsd: -34_731_700_000,
      now: NOW,
    });
    expect(r.source).toBe('reportado');
    expect(r.fcfTtmUsd).toBe(-46_892_000_000);
    // Mismo signo y magnitud dentro del factor (46,9/34,7 ≈ 1,35 < 2,5).
    expect(r.discrepancy).toBe(false);
  });

  it('filer 20-F con solo año fiscal viejo: el FY NO es un TTM → respaldo al proveedor, hueco documentado (caso SIMO)', () => {
    const r = resolveAnchorFcf({
      reported: reported({ freeCashflow: 6_295_000, periodEnd: '2025-12-31', windowKind: 'fy' }),
      providerTtmUsd: -503_000_000,
      now: NOW,
    });
    expect(r.source).toBe('proveedor');
    expect(r.fcfTtmUsd).toBe(-503_000_000);
    expect(r.edgarFyOnlyGap).toBe(true);
    expect(r.discrepancy).toBe(false);
  });

  it('año fiscal recién cerrado (≤135 días): sí es la ventana de los últimos 12 meses → manda el reportado', () => {
    const r = resolveAnchorFcf({
      reported: reported({ freeCashflow: 120_000_000, periodEnd: '2026-10-20', windowKind: 'fy' }),
      providerTtmUsd: -40_000_000,
      now: NOW,
    });
    expect(r.source).toBe('reportado');
    expect(r.fcfTtmUsd).toBe(120_000_000);
    expect(r.edgarFyOnlyGap).toBe(false);
  });

  it('conflicto irresoluble: FY viejo sin respaldo del proveedor → sin dato (R0: no se castiga)', () => {
    const r = resolveAnchorFcf({
      reported: reported({ freeCashflow: 6_295_000, periodEnd: '2025-12-31', windowKind: 'fy' }),
      providerTtmUsd: null,
      now: NOW,
    });
    expect(r.fcfTtmUsd).toBeNull();
    expect(r.source).toBeNull();
    expect(r.edgarFyOnlyGap).toBe(true);
  });

  it('sin ninguna fuente → sin dato', () => {
    const r = resolveAnchorFcf({ reported: null, providerTtmUsd: null, now: NOW });
    expect(r.fcfTtmUsd).toBeNull();
    expect(r.source).toBeNull();
    expect(r.edgarFyOnlyGap).toBe(false);
  });

  it('sin EDGAR pero con proveedor → respaldo del proveedor', () => {
    const r = resolveAnchorFcf({ reported: null, providerTtmUsd: 250_000_000, now: NOW });
    expect(r.source).toBe('proveedor');
    expect(r.fcfTtmUsd).toBe(250_000_000);
  });
});

describe('anchorCrosscheckDiscrepancy', () => {
  it('signos opuestos → discrepancia; cero contra no-cero también', () => {
    expect(anchorCrosscheckDiscrepancy(100, -1)).toBe(true);
    expect(anchorCrosscheckDiscrepancy(0, 50)).toBe(true);
    expect(anchorCrosscheckDiscrepancy(-100, 100)).toBe(true);
  });

  it(`magnitudes dentro del factor ${ANCHOR_CROSSCHECK_FACTOR}× → sin discrepancia; fuera → discrepancia`, () => {
    expect(anchorCrosscheckDiscrepancy(100, 240)).toBe(false);
    expect(anchorCrosscheckDiscrepancy(100, 260)).toBe(true);
    expect(anchorCrosscheckDiscrepancy(-50, -120)).toBe(false);
    expect(anchorCrosscheckDiscrepancy(-50, -130)).toBe(true);
  });

  it('sin proveedor no hay cruce que registrar', () => {
    expect(anchorCrosscheckDiscrepancy(100, null)).toBe(false);
    expect(anchorCrosscheckDiscrepancy(0, 0)).toBe(false);
  });
});

describe('reportedWindowIsTtm', () => {
  it('ventana construida con intermedios: siempre es TTM', () => {
    expect(reportedWindowIsTtm({ windowKind: 'ttm', periodEnd: '2025-06-30' }, NOW)).toBe(true);
  });

  it('año fiscal: fresco sí, viejo no', () => {
    expect(reportedWindowIsTtm({ windowKind: 'fy', periodEnd: '2026-10-31' }, NOW)).toBe(true);
    expect(reportedWindowIsTtm({ windowKind: 'fy', periodEnd: '2025-12-31' }, NOW)).toBe(false);
  });
});

describe('providerTtmFromFundamentals', () => {
  it('el crudo del proveedor manda tal cual vino', () => {
    expect(
      providerTtmFromFundamentals({ freeCashflowTtmRaw: -5, fcfDerivedFromFilings: true, freeCashflow: 9 })
    ).toBe(-5);
  });

  it('sin crudo: el vigente solo vale si NO vino de los estados reportados', () => {
    expect(
      providerTtmFromFundamentals({ freeCashflowTtmRaw: null, fcfDerivedFromFilings: true, freeCashflow: 9 })
    ).toBeNull();
    expect(
      providerTtmFromFundamentals({ freeCashflowTtmRaw: null, fcfDerivedFromFilings: false, freeCashflow: 9 })
    ).toBe(9);
    expect(providerTtmFromFundamentals({})).toBeNull();
  });
});
