/**
 * ============================================================
 *  REGÍMENES DE CAJA (FASE 2, en sombra — 2026-11-03)
 * ============================================================
 *  Reemplaza el ANCLA PLANA de R12/R14 (−6 puntos de certeza si
 *  el FCF TTM resuelto era negativo) por una clasificación
 *  DETERMINISTA en regímenes, calculada desde los COMPONENTES
 *  REPORTADOS del flujo (EDGAR: OCF, SBC, CapEx, D&A, ingresos
 *  de la misma ventana — server/edgar.ts + server/cashRegime.ts):
 *
 *   A  Compounder autofinanciado: FCF_real > 0 (y ratio
 *      SBC/OCF < 15% cuando el SBC se conoce). M = 1,00.
 *   B  CapEx productivo (el caso AMZN): FCF_real ≤ 0 pero
 *      OCF_real > 0, el flujo «estable» (tras el CapEx de
 *      MANTENIMIENTO estimado) supera el 5% de los ingresos y
 *      el ROIC supera al costo de capital del motor (ke = 10%)
 *      por 2,5 pp o más. M = 0,99: la ola de inversión no se
 *      castiga como quema, pero tampoco es gratis.
 *   C  Ilusión contable por SBC: SIN restar el SBC el FCF es
 *      positivo, pero restando el SBC (que es un costo real
 *      del accionista) deja de serlo. M = 0,82.
 *   D  Quema: OCF_real ≤ 0, o FCF_real ≤ 0 sin cumplir B ni C.
 *      M = 0,72 y BLOQUEO como destino de fondos.
 *   NA No aplica: financieras (su materia prima es el dinero),
 *      cripto y caja. M = 1,00.
 *   sin-dato: faltan OCF o CapEx reportados → M = 1,00 con el
 *      faltante declarado (R0: la ausencia de dato no castiga;
 *      tampoco se inventa un régimen).
 *
 *  Definiciones (todo en US$ de la MISMA ventana reportada):
 *   OCF_real   = OCF − SBC            (si SBC falta: OCF_real =
 *                                      OCF, con sbcMissing —
 *                                      la marca viaja en el payload)
 *   FCF_real   = OCF_real − CapEx_total
 *   FCF_sinSBC = OCF − CapEx_total    (el FCF «contable»)
 *   CapEx_maint = min(CapEx_total, max(0,85 × D&A, κ·Ingresos))
 *   FCF_steady = OCF_real − CapEx_maint
 *
 *  La caja se cobra UNA SOLA VEZ en todo el sistema: como
 *  factor multiplicativo M_cash del score titular. La certeza
 *  vF1 ya NO resta los −6 (pasó a ser confianza pura en la
 *  predicción) y el FV/RE jamás leen estos números (doctrina:
 *  la caja vive en el score y en la elegibilidad, nunca en la
 *  valuación).
 *
 *  El 1,03 de premio para el régimen A de la especificación
 *  externa v2 se RECHAZA a propósito: con M > 1 el score
 *  podría superar velocidad + tilt y se rompería el invariante
 *  estructural de la Fase 1. A es neutro (1,00): generar caja
 *  no infla; quemarla, sí cuesta.
 *
 *  Caso borde documentado (interpretación de este pase): una
 *  empresa con FCF_real > 0 cuyo ratio SBC/OCF es ≥ 15% no
 *  cumple la pata de ratio de A, pero tampoco es una «quema»
 *  (la definición de D exige OCF_real ≤ 0 o FCF_real ≤ 0).
 *  Se clasifica A con la pata declarada en falso
 *  (`legs.sbcRatioOk = false`, nota en `missing`) y M = 1,00:
 *  la alternativa (D, M = 0,72) afirmaría un hecho falso —
 *  que quema caja — y la Fase 2 no inventa castigos fuera de
 *  las definiciones. El informe lista los activos afectados
 *  para que el dueño decida si quiere endurecer la pata.
 * ============================================================
 */

/** Componentes reportados del flujo de caja de UNA ventana
 *  (TTM rodante reconstruido o año fiscal cerrado), tal como
 *  los resuelve la capa de datos. Todos los montos en US$. */
export interface CashComponents {
  /** Flujo de caja operativo reportado de la ventana. */
  ocfUsd: number | null;
  /** Stock-Based Compensation de la ventana (costo no-caja que
   *  el GAAP suma de vuelta al OCF: para el accionista es un
   *  costo real vía dilución). */
  sbcUsd: number | null;
  /** De dónde salió el SBC: derivación EDGAR de la misma
   *  ventana ('edgar'), estado anual de Yahoo como respaldo
   *  ('yahoo') o null (sin dato en ninguna fuente). */
  sbcSource: 'edgar' | 'yahoo' | null;
  /** Concepto XBRL que aportó el SBC (trazabilidad). */
  sbcConcept?: string | null;
  /** CapEx total de la ventana (positivo). */
  capexUsd: number | null;
  /** Depreciación + amortización de la ventana. */
  daUsd: number | null;
  /** Ingresos de la ventana. */
  revenueUsd: number | null;
  /** Cierre de la ventana (ISO). */
  periodEnd: string | null;
  /** 'ttm' = ventana móvil reconstruida con puntos intermedios;
   *  'fy' = solo el año fiscal cerrado (otra ventana: se
   *  declara, no se disfraza de TTM). */
  windowKind: 'ttm' | 'fy' | null;
  /** Procedencia general de los componentes. */
  source?: string | null;
}

export type CashRegime = 'A' | 'B' | 'C' | 'D' | 'NA' | 'sin-dato';

/** Multiplicador de caja por régimen (FASE 2). A es NEUTRO a
 *  propósito (ver encabezado: el premio 1,03 rompería el
 *  invariante score ≤ velocidad + tilt de la Fase 1). */
export const CASH_REGIME_MULTIPLIER: Record<CashRegime, number> = {
  A: 1.0,
  B: 0.99,
  C: 0.82,
  D: 0.72,
  NA: 1.0,
  'sin-dato': 1.0,
};

/** Pata de ratio de A: el SBC no puede superar esta fracción
 *  del OCF para que la autofinanciación sea «limpia». */
export const CASH_REGIME_A_SBC_MAX_OCF_PCT = 15;
/** Pata de flujo estable de B: FCF_steady > este % de los
 *  ingresos — la operación sostiene su mantenimiento con
 *  holgura aunque el FCF total sea negativo por crecimiento. */
export const CASH_REGIME_B_STEADY_MIN_REVENUE_PCT = 5;
/** Pata de retorno de B: ROIC > ke + este spread (pp), con ke
 *  = el costo de capital vigente del motor de FV (10%). */
export const CASH_REGIME_B_ROIC_SPREAD_PP = 2.5;
/** Costo de capital del motor (réplica declarada de
 *  JUSTIFIED_DISCOUNT_PCT de fairvalue.ts: el umbral de B es
 *  ke + spread = 12,5%). */
export const CASH_REGIME_COST_OF_CAPITAL_PCT = 10;
/** Piso del CapEx de mantenimiento: esta fracción de la D&A
 *  (mantener la base de activos cuesta, como mínimo, casi lo
 *  que se deprecia). */
export const CAPEX_MAINT_DA_FLOOR = 0.85;

/** Intensidad mínima de mantenimiento κ (% de los ingresos)
 *  por sector: cuánto CapEx necesita un sector solo para
 *  SOSTENER su base, antes de crecer. Software casi no tiene
 *  activos físicos; el shale debe reponer pozos que declinan.
 *  El mapeo se hace desde los campos sector/industria que el
 *  input ya trae (sin constantes por ticker). */
export const CAPEX_MAINT_KAPPA_PCT = {
  software: 3,
  semisHardware: 6,
  retailPlatforms: 6,
  cloudInfra: 8,
  energy: 12,
  default: 6,
} as const;

/** κ (% de ingresos) según sector/industria del input:
 *  software (por industria fina o sector) → 3; energía → 12;
 *  cloud/infraestructura y plataformas de comunicaciones con
 *  centros de datos propios → 8; semiconductores/hardware,
 *  retail/plataformas y el resto → 6 (default). */
export function capexMaintKappaPct(sector?: string | null, industry?: string | null): number {
  const s = `${sector ?? ''} ${industry ?? ''}`.toLowerCase();
  if (/software|software/.test(s)) return CAPEX_MAINT_KAPPA_PCT.software;
  if (/energy|energ|petrol|oil|gas/.test(s)) return CAPEX_MAINT_KAPPA_PCT.energy;
  if (/communication|comunicac|cloud|infraestruct|data ?center|telecom/.test(s)) {
    return CAPEX_MAINT_KAPPA_PCT.cloudInfra;
  }
  return CAPEX_MAINT_KAPPA_PCT.default;
}

export interface CashRegimeInfo {
  regime: CashRegime;
  /** Factor multiplicativo del score (M_cash). */
  mCash: number;
  /** Componentes crudos que alimentaron la clasificación. */
  ocfUsd: number | null;
  sbcUsd: number | null;
  sbcSource: 'edgar' | 'yahoo' | null;
  sbcMissing: boolean;
  capexUsd: number | null;
  daUsd: number | null;
  revenueUsd: number | null;
  periodEnd: string | null;
  windowKind: 'ttm' | 'fy' | null;
  /** Derivados de la clasificación. */
  ocfRealUsd: number | null;
  fcfRealUsd: number | null;
  /** FCF sin restar SBC (el «contable»): la pata de C. */
  fcfNoSbcUsd: number | null;
  capexMaintUsd: number | null;
  fcfSteadyUsd: number | null;
  fcfSteadyToRevenuePct: number | null;
  sbcToOcfPct: number | null;
  kappaPct: number;
  /** ROIC % usado en la pata de B y su umbral (ke + spread). */
  roicPct: number | null;
  roicThresholdPct: number;
  /** Cada pata de la clasificación, para auditar el veredicto
   *  sin rehacer cuentas (el informe de la fase las publica). */
  legs: {
    fcfRealPositive: boolean | null;
    sbcRatioOk: boolean | null;
    ocfRealPositive: boolean | null;
    steadyOk: boolean | null;
    roicOk: boolean | null;
    /** FCF contable > 0 con FCF real ≤ 0 (la definición de C). */
    sbcIllusion: boolean | null;
  };
  /** Faltantes y notas de interpretación, declarados (R0). */
  missing: string[];
  /** ¿Puede ser destino de fondos por la pata de caja?
   *  C y D bloquean; A, B, NA y sin-dato no (R0). */
  destinationBlockedByCash: boolean;
}

const finite = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) ? v : null;

/** Clasifica el régimen de caja de un activo desde sus
 *  componentes reportados. Función pura: sin red, sin reloj.
 *  `financial` lo decide el llamador con la misma regla del
 *  ancla histórica (sector/industria financieros). */
export function cashRegimeFor(args: {
  components?: CashComponents | null;
  sector?: string | null;
  industry?: string | null;
  roicPct?: number | null;
  financial?: boolean;
  isCrypto?: boolean;
  isCash?: boolean;
}): CashRegimeInfo {
  const c = args.components ?? null;
  const kappaPct = capexMaintKappaPct(args.sector, args.industry);
  const roicThresholdPct = CASH_REGIME_COST_OF_CAPITAL_PCT + CASH_REGIME_B_ROIC_SPREAD_PP;
  const base: CashRegimeInfo = {
    regime: 'sin-dato',
    mCash: CASH_REGIME_MULTIPLIER['sin-dato'],
    ocfUsd: finite(c?.ocfUsd),
    sbcUsd: finite(c?.sbcUsd),
    sbcSource: c?.sbcUsd != null && Number.isFinite(c.sbcUsd) ? (c?.sbcSource ?? null) : null,
    sbcMissing: finite(c?.sbcUsd) == null,
    capexUsd: finite(c?.capexUsd),
    daUsd: finite(c?.daUsd),
    revenueUsd: finite(c?.revenueUsd),
    periodEnd: c?.periodEnd ?? null,
    windowKind: c?.windowKind ?? null,
    ocfRealUsd: null,
    fcfRealUsd: null,
    fcfNoSbcUsd: null,
    capexMaintUsd: null,
    fcfSteadyUsd: null,
    fcfSteadyToRevenuePct: null,
    sbcToOcfPct: null,
    kappaPct,
    roicPct: finite(args.roicPct),
    roicThresholdPct,
    legs: {
      fcfRealPositive: null,
      sbcRatioOk: null,
      ocfRealPositive: null,
      steadyOk: null,
      roicOk: null,
      sbcIllusion: null,
    },
    missing: [],
    destinationBlockedByCash: false,
  };

  // NA: la métrica no es la del negocio (financieras) o no hay
  // negocio operativo detrás del ticker (cripto/caja).
  if (args.financial || args.isCrypto || args.isCash) {
    return { ...base, regime: 'NA', mCash: CASH_REGIME_MULTIPLIER.NA };
  }

  const ocf = base.ocfUsd;
  const capex = base.capexUsd;
  if (ocf == null || capex == null) {
    if (ocf == null) base.missing.push('sin OCF reportado computable');
    if (capex == null) base.missing.push('sin CapEx reportado computable');
    return base; // sin-dato: M = 1, sin castigo inventado (R0)
  }

  const sbc = base.sbcUsd;
  if (sbc == null) base.missing.push('sin SBC en EDGAR ni en Yahoo: OCF_real = OCF (sin depurar)');
  const sbcEff = sbc ?? 0;
  const ocfReal = ocf - sbcEff;
  const fcfReal = ocfReal - capex;
  const fcfNoSbc = ocf - capex;
  const da = base.daUsd;
  const revenue = base.revenueUsd;
  if (da == null) base.missing.push('sin D&A: el CapEx de mantenimiento sale solo de κ·ingresos');
  if (revenue == null) base.missing.push('sin ingresos de la ventana: κ y la pata de flujo estable de B no computan');
  const maintFloor = Math.max(
    da != null ? CAPEX_MAINT_DA_FLOOR * da : 0,
    revenue != null ? (kappaPct / 100) * revenue : 0
  );
  const capexMaint = Math.min(capex, maintFloor);
  const fcfSteady = ocfReal - capexMaint;
  const sbcToOcfPct = sbc != null && ocf > 0 ? (sbc / ocf) * 100 : null;
  const steadyToRevenuePct =
    revenue != null && revenue > 0 ? (fcfSteady / revenue) * 100 : null;

  const legs: CashRegimeInfo['legs'] = {
    fcfRealPositive: fcfReal > 0,
    sbcRatioOk: sbcToOcfPct != null ? sbcToOcfPct < CASH_REGIME_A_SBC_MAX_OCF_PCT : null,
    ocfRealPositive: ocfReal > 0,
    steadyOk: steadyToRevenuePct != null ? steadyToRevenuePct > CASH_REGIME_B_STEADY_MIN_REVENUE_PCT : null,
    roicOk: base.roicPct != null ? base.roicPct > roicThresholdPct : null,
    sbcIllusion: sbc != null && fcfNoSbc > 0 && fcfReal <= 0,
  };
  if (base.roicPct == null) base.missing.push('sin ROIC del motor: la pata de retorno de B no puede verificarse');

  let regime: CashRegime;
  if (fcfReal > 0) {
    // A — con la interpretación documentada del encabezado:
    // si el ratio SBC/OCF ≥ 15%, la pata queda declarada en
    // falso pero el régimen es A (no es una quema: D exige
    // FCF_real ≤ 0 u OCF_real ≤ 0).
    regime = 'A';
    if (legs.sbcRatioOk === false) {
      base.missing.push(
        `ratio SBC/OCF ${sbcToOcfPct != null ? Math.round(sbcToOcfPct * 10) / 10 : '—'}% ≥ ${CASH_REGIME_A_SBC_MAX_OCF_PCT}%: no cumple la pata de ratio de A; se clasifica A por FCF_real > 0 (ver encabezado del módulo)`
      );
    }
  } else if (legs.sbcIllusion) {
    regime = 'C';
  } else if (
    ocfReal > 0 &&
    legs.steadyOk === true &&
    legs.roicOk === true
  ) {
    regime = 'B';
  } else {
    regime = 'D';
  }

  return {
    ...base,
    regime,
    mCash: CASH_REGIME_MULTIPLIER[regime],
    ocfRealUsd: ocfReal,
    fcfRealUsd: fcfReal,
    fcfNoSbcUsd: fcfNoSbc,
    capexMaintUsd: capexMaint,
    fcfSteadyUsd: fcfSteady,
    fcfSteadyToRevenuePct: steadyToRevenuePct,
    sbcToOcfPct,
    legs,
    destinationBlockedByCash: regime === 'C' || regime === 'D',
  };
}
