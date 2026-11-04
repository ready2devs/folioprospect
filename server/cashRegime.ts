import type { CashComponents } from '../shared/engine/cashRegime.js';
import { providerTtmFromFundamentals, reportedWindowIsTtm } from './cashAnchor.js';
import type { EdgarTtmCashflow } from './edgar.js';

// ─── Resolución de los COMPONENTES del régimen de caja (FASE 2) ─────
//
// El motor puro (shared/engine/cashRegime.ts) clasifica el régimen
// desde los componentes reportados de UNA ventana (OCF, SBC, CapEx,
// D&A, ingresos). Esta capa resuelve esos componentes con la misma
// doctrina y la misma disciplina de ventanas del ancla de caja real
// (server/cashAnchor.ts, R12.3):
//
//  1. EDGAR manda cuando su ventana ES la de los últimos 12 meses
//     (rodante reconstruido, o año fiscal cerrado hace ≤ 135 días).
//     Dentro de esa ventana: SBC y D&A salen de la misma derivación
//     (server/edgar.ts); si el SBC no deriva en EDGAR, entra el SBC
//     ANUAL de Yahoo como respaldo DECLARADO (otra ventana: la mezcla
//     queda escrita en `source`); si la D&A no deriva, entra la
//     última depreciación anual reportada (serie EDGAR); los ingresos
//     caen a los TTM del proveedor (TV/Yahoo) si EDGAR no los deriva.
//  2. Sin ventana EDGAR elegible (el caso SIMO/NBIS/HSAI: EDGAR solo
//     ofrece un año fiscal viejo), los componentes se componen del
//     PROVEEDOR, igual que el ancla cae a su respaldo: OCF TTM de
//     Yahoo y CapEx TTM implícito (OCF − FCF del proveedor, ambos de
//     la misma foto TTM); SBC anual de Yahoo y D&A anual reportada
//     como respaldos declarados; ingresos TTM del proveedor.
//  3. Si ni así hay OCF y CapEx computables → null: el motor
//     clasifica 'sin-dato' (R0: la ausencia no castiga ni inventa).
//
// Ninguna decisión de clasificación vive acá: solo procedencia.

const finiteOrNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export interface CashComponentsFund {
  fcfTtmEdgar?: EdgarTtmCashflow | null;
  operatingCashflow?: number | null;
  freeCashflowTtmRaw?: number | null;
  freeCashflow?: number | null;
  fcfDerivedFromFilings?: boolean;
  sbcAnnualYahoo?: number | null;
  totalRevenueTtm?: number | null;
  tvRevenueTtm?: number | null;
  depreciationHistory?: number[] | null;
}

export function resolveCashComponents(
  fund: CashComponentsFund,
  now: Date = new Date()
): CashComponents | null {
  const edgar = fund.fcfTtmEdgar ?? null;
  const yahooSbc = finiteOrNull(fund.sbcAnnualYahoo);
  const daAnnual = finiteOrNull(fund.depreciationHistory?.[0]);
  const revenueProvider = finiteOrNull(fund.tvRevenueTtm) ?? finiteOrNull(fund.totalRevenueTtm);

  if (edgar && reportedWindowIsTtm(edgar, now)) {
    const sbcEdgar = finiteOrNull(edgar.sbc);
    const sbcUsd = sbcEdgar ?? yahooSbc;
    const mix: string[] = ['edgar'];
    if (sbcEdgar == null && yahooSbc != null) mix.push('sbc-anual-yahoo');
    const daEdgar = finiteOrNull(edgar.depreciationAmortization);
    if (daEdgar == null && daAnnual != null) mix.push('da-anual-edgar');
    const revenueEdgar = finiteOrNull(edgar.revenue);
    if (revenueEdgar == null && revenueProvider != null) mix.push('ingresos-proveedor');
    return {
      ocfUsd: edgar.operatingCashflow,
      sbcUsd,
      sbcSource: sbcUsd == null ? null : sbcEdgar != null ? 'edgar' : 'yahoo',
      sbcConcept: sbcEdgar != null ? (edgar.sbcConcept ?? null) : null,
      capexUsd: edgar.capex,
      daUsd: daEdgar ?? daAnnual,
      revenueUsd: revenueEdgar ?? revenueProvider,
      periodEnd: edgar.periodEnd,
      windowKind: edgar.windowKind,
      source: mix.join('+'),
    };
  }

  // Respaldo del proveedor (misma filosofía que el ancla): OCF TTM
  // y CapEx implícito de la misma foto TTM del proveedor.
  const ocf = finiteOrNull(fund.operatingCashflow);
  const providerFcf = providerTtmFromFundamentals(fund);
  if (ocf != null && providerFcf != null) {
    const capex = ocf - providerFcf;
    if (capex > 0) {
      return {
        ocfUsd: ocf,
        sbcUsd: yahooSbc,
        sbcSource: yahooSbc != null ? 'yahoo' : null,
        sbcConcept: null,
        capexUsd: capex,
        daUsd: daAnnual,
        revenueUsd: revenueProvider,
        periodEnd: null,
        windowKind: null,
        source: 'proveedor',
      };
    }
  }
  return null;
}
