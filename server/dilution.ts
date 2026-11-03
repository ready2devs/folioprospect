import type { ReportedSharesYoY } from './edgar.js';

// ─── Resolución del ΔS (dilución/recompra) del Grinold-Kroner ───────
//
// Reparación de integridad (2026-11-03): el ΔS salía de la variación
// interanual del PROMEDIO PONDERADO de acciones (EDGAR), una serie que
// promedia el año y mezcla regímenes cuando el conteo cambia de forma
// escalonada dentro del período. El caso auditado es NBIS: su promedio
// ponderado FY2025 (242,5 M) contra FY2024 (281,0 M) da −13,69% y el
// motor le sumaba +13,69 puntos de «buyback» a su pata GK — pero el
// promedio FY2024 todavía arrastra el conteo previo a la escisión de
// Yandex (jul-2024), mientras los CONTEOS REPORTADOS de cierre dicen
// 235,8 M → 253,0 M: en FY2025 Nebius EMITIÓ (la oferta de sep-2025),
// no recompró. Es el mismo tipo de defecto que el FCF del proveedor
// corregido en R12.3, y se repara con la misma doctrina: para un hecho
// reportado, manda el conteo reportado.
//
// Reglas (generales, sin excepciones por ticker):
//  1. Si hay variación interanual desde conteos reportados de
//     acciones en circulación con par comparable (cierres a 300–460
//     días, sin artefactos de split/tageo), MANDA EL REPORTADO. Si la
//     serie del pipeline (promedio ponderado) la contradice en signo,
//     la discrepancia queda registrada en la procedencia.
//  2. Si hay conteos reportados pero el par NO es comparable (no es
//     una ventana anual limpia), el reportado no puede arbitrar:
//     - si la serie coincide en signo con la dirección reportada, no
//       hay conflicto que resolver: manda la serie;
//     - si la contradice en signo, el conflicto es IRRESOLUBLE → el
//       insumo queda null (el término ΔS de GK vale 0: ni recompra ni
//       dilución inventadas) y el hueco queda registrado.
//  3. Sin conteos reportados utilizables (brecha de cobertura: el
//     emisor no tagea el concepto o lo tagea solo por clase), manda
//     la serie del pipeline como respaldo, con el hueco declarado.
//  4. Sin ninguna fuente → null, «sin dato» (R0: la ausencia de dato
//     nunca castiga ni premia).

export type DilutionGap =
  | 'sin-conteo-reportado'
  | 'conteo-reportado-no-comparable'
  | 'conflicto-irresoluble'
  | 'sin-dato';

export interface DilutionResolution {
  /** El ΔS % que manda para el motor (positivo = dilución neta,
   *  negativo = recompra neta); null = sin término (GK suma 0). */
  dilutionPct: number | null;
  /** Procedencia del valor que manda. */
  source: 'reportado' | 'proveedor' | null;
  /** La variación desde conteos reportados, si existe. */
  reportedDilutionPct: number | null;
  /** La serie del pipeline (promedio ponderado), para el cruce. */
  seriesDilutionPct: number | null;
  /** La serie contradecía en signo al conteo reportado. */
  discrepancy: boolean;
  /** Por qué no mandó la fuente primaria, cuando aplica. */
  gap: DilutionGap | null;
  /** Cierres [reciente, anterior] del par reportado, si existe. */
  reportedPeriodEnds: [string, string] | null;
}

const finiteOrNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

export function resolveDilution(args: {
  reported: Pick<ReportedSharesYoY, 'pct' | 'comparable' | 'latestEnd' | 'priorEnd'> | null;
  seriesYoYPct: number | null | undefined;
}): DilutionResolution {
  const series = finiteOrNull(args.seriesYoYPct);
  const reported =
    args.reported && Number.isFinite(args.reported.pct) ? args.reported : null;
  const base: DilutionResolution = {
    dilutionPct: null,
    source: null,
    reportedDilutionPct: reported?.pct ?? null,
    seriesDilutionPct: series,
    discrepancy: false,
    gap: null,
    reportedPeriodEnds: reported ? [reported.latestEnd, reported.priorEnd] : null,
  };
  // Regla 1: conteo reportado con par comparable → manda el reportado.
  if (reported && reported.comparable) {
    return {
      ...base,
      dilutionPct: reported.pct,
      source: 'reportado',
      discrepancy: series != null && sign(series) !== sign(reported.pct),
    };
  }
  // Regla 2: hay conteos reportados pero el par no es ventana anual
  // limpia → no pueden arbitrar; el signo decide si hay conflicto.
  if (reported && !reported.comparable) {
    if (series != null && sign(series) === sign(reported.pct)) {
      return {
        ...base,
        dilutionPct: series,
        source: 'proveedor',
        gap: 'conteo-reportado-no-comparable',
      };
    }
    if (series != null) {
      return { ...base, discrepancy: true, gap: 'conflicto-irresoluble' };
    }
    return { ...base, gap: 'conteo-reportado-no-comparable' };
  }
  // Regla 3: sin conteos reportados → respaldo de la serie.
  if (series != null) {
    return { ...base, dilutionPct: series, source: 'proveedor', gap: 'sin-conteo-reportado' };
  }
  // Regla 4: sin fuentes.
  return { ...base, gap: 'sin-dato' };
}

/** Resolución completa desde los fundamentales de un activo: UNA sola
 *  resolución para todo el pipeline (el ΔS del GK y el buyback del
 *  ancla de crecimiento sustentable consumen el mismo número, como el
 *  ancla de caja desde R12.3). */
export function resolveDilutionFromFundamentals(fund: {
  sharesOutstandingYoY?: {
    pct: number;
    comparable: boolean;
    latestEnd: string;
    priorEnd: string;
  } | null;
  sharesGrowthYoYPct?: number | null;
}): DilutionResolution {
  return resolveDilution({
    reported: fund.sharesOutstandingYoY ?? null,
    seriesYoYPct: fund.sharesGrowthYoYPct,
  });
}
