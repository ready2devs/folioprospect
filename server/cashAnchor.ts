import type { EdgarTtmCashflow } from './edgar.js';

// ─── Resolución del FCF del ANCLA DE CAJA REAL (R12.3) ───────────────
//
// Directiva del usuario (2026-11-03): el ancla mide un HECHO reportado
// — si la empresa generó caja en los últimos 12 meses —, así que su
// fuente primaria pasan a ser los ESTADOS REPORTADOS (EDGAR: flujo
// operativo − capex reconstruidos desde los trimestres reportados).
// El campo TTM del proveedor queda como CHEQUEO CRUZADO y como
// respaldo: es una derivación opaca que para GOOG devolvía el signo
// invertido respecto de sus balances (−US$1.162 M contra +US$19.747 M
// reportados) y en AMZN difería en magnitud del reportado.
//
// Reglas (generales, sin excepciones por ticker):
//  1. Si EDGAR deriva la ventana móvil (puntos intermedios: rodante
//     reportado o FY+YTD−YTDpy), manda el reportado.
//  2. Si EDGAR solo tiene el año fiscal cerrado, esa ventana sirve
//     como «últimos 12 meses» SOLO si el cierre es reciente (≤ 135
//     días): recién cerrado, es literalmente lo último reportado por
//     cualquier fuente. Un año fiscal viejo NO es un TTM (el caso
//     SIMO: su FY positivo convive con un TTM negativo por el
//     trimestre de inventarios — mezclar ventanas reintroduciría el
//     error que el ancla vino a evitar) → respaldo al proveedor.
//  3. Chequeo cruzado: si el proveedor difiere del reportado en SIGNO
//     o en más de ANCHOR_CROSSCHECK_FACTOR× en magnitud, hay
//     discrepancia: manda el reportado y la procedencia la registra
//     (la ficha la muestra). El factor 2,5 deja holgura para las
//     diferencias de costura de ventanas entre proveedores sin
//     tolerar errores de signo ni de orden de magnitud.
//  4. Sin derivación elegible: manda el campo del proveedor, con su
//     procedencia. Si tampoco hay proveedor → «sin dato» (R0: la
//     ausencia o el conflicto irresoluble de dato nunca castiga).

/** Factor de magnitud del chequeo cruzado reportado vs proveedor. */
export const ANCHOR_CROSSCHECK_FACTOR = 2.5;

/** Un año fiscal cerrado hace ≤ esta cantidad de días cuenta como
 *  la ventana de los últimos 12 meses (es lo último reportado). */
export const EDGAR_FY_WINDOW_FRESH_DAYS = 135;

export interface AnchorFcfResolution {
  /** El FCF TTM (US$) que manda para el ancla; null = sin dato. */
  fcfTtmUsd: number | null;
  /** Procedencia del valor que manda. */
  source: 'reportado' | 'proveedor' | null;
  /** Cierre de la ventana reportada usada (solo si source reportado). */
  periodEnd: string | null;
  /** El crudo del proveedor, para el cruce y la ficha. */
  providerFcfTtmUsd: number | null;
  /** El proveedor difería del reportado en signo o en > 2,5×. */
  discrepancy: boolean;
  /** EDGAR solo pudo ofrecer su año fiscal (ventana distinta): el
   *  hueco queda documentado en la procedencia del respaldo. */
  edgarFyOnlyGap: boolean;
}

const DAY_MS = 86_400_000;
const finiteOrNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** ¿La derivación de EDGAR mide la ventana de los últimos 12 meses
 *  del ancla? Sí si se construyó con puntos intermedios (rodante o
 *  FY+YTD−YTDpy); si es solo el año fiscal, solo cuando cerró hace
 *  poco (ver la regla 2 del encabezado). */
export function reportedWindowIsTtm(
  reported: Pick<EdgarTtmCashflow, 'windowKind' | 'periodEnd'>,
  now: Date = new Date()
): boolean {
  if (reported.windowKind === 'ttm') return true;
  const end = Date.parse(reported.periodEnd);
  if (!Number.isFinite(end)) return false;
  return (now.getTime() - end) / DAY_MS <= EDGAR_FY_WINDOW_FRESH_DAYS;
}

/** Discrepancia del chequeo cruzado: signos opuestos, o magnitudes
 *  que difieren en más del factor. Un cero contra un no-cero cuenta
 *  como diferencia de signo. */
export function anchorCrosscheckDiscrepancy(reported: number, provider: number | null): boolean {
  if (provider == null || !Number.isFinite(provider)) return false;
  const s = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
  if (s(reported) !== s(provider)) return true;
  const a = Math.abs(reported);
  const b = Math.abs(provider);
  if (a === 0 && b === 0) return false;
  return Math.max(a, b) / Math.max(Math.min(a, b), 1) > ANCHOR_CROSSCHECK_FACTOR;
}

export function resolveAnchorFcf(args: {
  reported: EdgarTtmCashflow | null;
  providerTtmUsd: number | null | undefined;
  now?: Date;
}): AnchorFcfResolution {
  const provider = finiteOrNull(args.providerTtmUsd);
  const reported = args.reported;
  const edgarFyOnlyGap = reported != null && reported.windowKind === 'fy';
  if (reported && reportedWindowIsTtm(reported, args.now)) {
    return {
      fcfTtmUsd: reported.freeCashflow,
      source: 'reportado',
      periodEnd: reported.periodEnd,
      providerFcfTtmUsd: provider,
      discrepancy: anchorCrosscheckDiscrepancy(reported.freeCashflow, provider),
      edgarFyOnlyGap: false,
    };
  }
  if (provider != null) {
    return {
      fcfTtmUsd: provider,
      source: 'proveedor',
      periodEnd: null,
      providerFcfTtmUsd: provider,
      discrepancy: false,
      edgarFyOnlyGap,
    };
  }
  return {
    fcfTtmUsd: null,
    source: null,
    periodEnd: null,
    providerFcfTtmUsd: null,
    discrepancy: false,
    edgarFyOnlyGap,
  };
}

/** El crudo TTM del proveedor dentro de los fundamentales: el campo
 *  tal cual vino (preservado antes de toda reparación), y el vigente
 *  SOLO si no proviene de estados reportados — si vino de filings es
 *  un año fiscal, otra ventana, y no puede hacer de TTM. */
export function providerTtmFromFundamentals(fund: {
  freeCashflowTtmRaw?: number | null;
  fcfDerivedFromFilings?: boolean;
  freeCashflow?: number | null;
}): number | null {
  return (
    finiteOrNull(fund.freeCashflowTtmRaw) ??
    (fund.fcfDerivedFromFilings ? null : finiteOrNull(fund.freeCashflow))
  );
}

/** Resolución completa desde los fundamentales de un activo: la usan
 *  el Optimizador y la ficha, para que el ancla sea UNA sola en toda
 *  la app (misma doctrina que el módulo único de riesgo). */
export function resolveAnchorFromFundamentals(
  fund: {
    fcfTtmEdgar?: EdgarTtmCashflow | null;
    freeCashflowTtmRaw?: number | null;
    fcfDerivedFromFilings?: boolean;
    freeCashflow?: number | null;
  },
  now?: Date
): AnchorFcfResolution {
  return resolveAnchorFcf({
    reported: fund.fcfTtmEdgar ?? null,
    providerTtmUsd: providerTtmFromFundamentals(fund),
    now,
  });
}
