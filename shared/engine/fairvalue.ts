import type { FairValueResult } from './types.js';

export interface FundamentalInput {
  symbol: string;
  currentPrice: number;
  targetMeanPrice?: number | null;
  /** Target mediano de Yahoo: escalón de respaldo del componente target
   *  cuando falta el promedio (mismo consenso, otra estadística). */
  targetMedianPrice?: number | null;
  /** Segunda fuente del target de analistas (Finviz "Target Price"):
   *  amplía la muestra del componente target (R-B). */
  targetAltPrice?: number | null;
  /** Procedencia de la serie anual de FCF ('edgar' | 'yahoo'). */
  fcfHistorySource?: 'edgar' | 'yahoo' | null;
  /** La base TTM de FCF vino de los estados auditados de EDGAR porque el
   *  proveedor de mercado no la traía (escalón de estados contables). */
  fcfDerivedFromFilings?: boolean;
  freeCashflow?: number | null;
  operatingCashflow?: number | null;
  totalCash?: number | null;
  totalDebt?: number | null;
  sharesOutstanding?: number | null;
  earningsGrowth?: number | null; // decimal e.g. 0.25
  revenueGrowth?: number | null; // decimal e.g. 0.20
  trailingPE?: number | null;
  forwardPE?: number | null;
  /** Primitiva EPS forward (Yahoo defaultKeyStatistics.forwardEps). El motor
   *  recomputa todo P/E desde primitivas y repara el EPS entre fuentes
   *  (docs/VALUATION-RULES.md). */
  forwardEps?: number | null;
  /** Segunda fuente de EPS forward (EPS implícito del P/E forward de Finviz
   *  o promedio de estimaciones +1y de Yahoo earningsTrend). */
  forwardEpsAlt?: number | null;
  /** Procedencia de forwardEpsAlt: 'finviz' (proveedor independiente) o
   *  'yahooTrend' (mismo proveedor que la primitiva: cuenta como la misma
   *  fuente a efectos de independencia). */
  forwardEpsAltSource?: 'finviz' | 'yahooTrend' | null;
  /** EPS trailing TTM (Yahoo defaultKeyStatistics.trailingEps). */
  trailingEps?: number | null;
  /** P/E forward publicado por Finviz (segundo proveedor) para el chequeo
   *  de consistencia ratio publicado vs recomputado. */
  finvizForwardPe?: number | null;
  /** FCF anual reportado, más reciente primero (máx 5 años): base
   *  normalizada del DCF. */
  fcfHistory?: number[] | null;
  /** EPS diluido anual reportado, más reciente primero (máx 5 años):
   *  detección de valle cíclico. */
  epsHistory?: number[] | null;
  enterpriseValue?: number | null;
  ebitda?: number | null;
  grossMargins?: number | null; // decimal
  operatingMargins?: number | null; // decimal
  returnOnEquity?: number | null; // decimal
  returnOnAssets?: number | null; // decimal
  debtToEquity?: number | null;
  beta?: number | null;
  isCrypto?: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function meanOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/* ------------------------------------------------------------------ *
 * Reglas universales de valuación (docs/VALUATION-RULES.md). Filosofía:
 * reparar antes que excluir, ampliar la muestra y promediar; lo extremo
 * entra recortado al borde de la banda (winsorización), no se borra; un
 * componente solo es null ante imposibilidad matemática. Las mismas
 * reglas para todo activo, disparadas solo por características medibles
 * de los datos: ninguna lógica por ticker.
 * ------------------------------------------------------------------ */

export type FvComponentKey = 'dcf' | 'multiples' | 'target';

export interface FvComponentInput {
  key: FvComponentKey;
  value: number;
  /** Valle cíclico medible: válido pero con divergencia esperada
   *  (informativo; la winsorización no excluye a nadie). */
  troughAdjusted?: boolean;
}

export interface FvExcludedComponent {
  component: FvComponentKey;
  reason: string;
  value?: number | null;
}

export interface FvWinsorizedComponent {
  component: FvComponentKey;
  originalValue: number;
  clippedValue: number;
}

export interface FvProvenance {
  component: FvComponentKey;
  /** Valor crudo de la fuente primaria (null si no existía). */
  originalValue: number | null;
  /** Valor efectivamente usado tras la cadena de reparación. */
  usedValue: number | null;
  /** Fuentes independientes que alimentaron el valor usado. */
  sources: string[];
  flags: string[];
}

export interface FvAggregationResult {
  fairValue: number | null;
  /** Componentes finales que forman el Fair Value (valores winsorizados
   *  cuando fueron recortados). */
  components: FvComponentInput[];
  excluded: FvExcludedComponent[];
  winsorized: FvWinsorizedComponent[];
  flags: string[];
  confidence: 'Alta' | 'Media' | 'Baja' | null;
  range: [number, number] | null;
  nullReason: string | null;
}

/** Flags menores: cada uno baja un nivel la confianza. Son señales de
 *  calidad del dato, nunca motivos de exclusión. */
const MINOR_CONFIDENCE_FLAGS = new Set([
  'providerRatioMismatch',
  'unconfirmedEps',
  'extremeYieldCaution',
  'extremeYieldConfirmed',
  'extremeYieldUnconfirmed',
  'extremePeReferenceOnly',
  'normalizedBase',
  'repairedFromSources',
  'basisNormalized',
  'winsorized',
  'notMeaningful',
  'derivedFromFilings',
  'singleSource',
]);

/** Banda de credibilidad entre componentes (ratios históricos del motor). */
export const FV_BAND_LOW = 0.25;
export const FV_BAND_HIGH = 3.5;

/**
 * Agregación por PROMEDIO WINSORIZADO:
 * - Cada componente válido se recorta a la banda [0,25×, 3,5×] de la
 *   referencia = promedio de los OTROS componentes (el mecanismo ya
 *   desplegado), y el Fair Value es el promedio de los valores
 *   recortados. Ningún componente se excluye por extremo: entra al borde
 *   de la banda con flag `winsorized` y su recorte queda registrado.
 * - Con 1 solo componente válido, FV := ese componente (flag
 *   `singleComponent`, confianza Baja): ningún activo queda sin
 *   valuación por falta de un dato.
 * - Con 0 componentes, FV = null con motivo `noValidComponents` (tras la
 *   cadena de reparación debería ser inalcanzable; nunca se fabrica un
 *   FV desde el precio).
 * El FV nunca depende del precio: los componentes tampoco.
 */
export function aggregateFairValue(
  poolInput: FvComponentInput[],
  opts: {
    currentPrice: number;
    flags?: string[];
    excluded?: FvExcludedComponent[];
  }
): FvAggregationResult {
  const flags: string[] = [...(opts.flags ?? [])];
  const excluded: FvExcludedComponent[] = [...(opts.excluded ?? [])];
  const winsorized: FvWinsorizedComponent[] = [];
  const pool = poolInput.filter((c) => Number.isFinite(c.value) && c.value > 0);

  const range: [number, number] | null =
    pool.length >= 1
      ? [Math.min(...pool.map((c) => c.value)), Math.max(...pool.map((c) => c.value))]
      : null;

  if (pool.length === 0) {
    return {
      fairValue: null,
      components: [],
      excluded,
      winsorized,
      flags: [...new Set(flags)],
      confidence: null,
      range: null,
      nullReason: 'noValidComponents',
    };
  }

  if (pool.length === 1) {
    flags.push('singleComponent');
    return {
      fairValue: pool[0].value,
      components: pool,
      excluded,
      winsorized,
      flags: [...new Set(flags)],
      confidence: 'Baja',
      range,
      nullReason: null,
    };
  }

  const finalComponents: FvComponentInput[] = pool.map((c) => {
    const others = pool.filter((o) => o !== c).map((o) => o.value);
    const ref = meanOf(others);
    const clipped = clamp(c.value, ref * FV_BAND_LOW, ref * FV_BAND_HIGH);
    if (clipped !== c.value) {
      winsorized.push({
        component: c.key,
        originalValue: c.value,
        clippedValue: clipped,
      });
      return { ...c, value: clipped };
    }
    return c;
  });
  if (winsorized.length > 0) flags.push('winsorized');

  const fairValue = meanOf(finalComponents.map((c) => c.value));

  const vals = finalComponents.map((c) => c.value);
  const mean = meanOf(vals);
  const dispersion = mean > 0 ? (Math.max(...vals) - Math.min(...vals)) / mean : Infinity;
  let level = dispersion < 0.3 ? 0 : dispersion < 0.8 ? 1 : 2;
  for (const f of flags) {
    if (MINOR_CONFIDENCE_FLAGS.has(f)) level = Math.min(2, level + 1);
  }
  if (
    opts.currentPrice > 0 &&
    (fairValue < opts.currentPrice / 3 || fairValue > opts.currentPrice * 3)
  ) {
    level = 2;
  }
  const confidence = (['Alta', 'Media', 'Baja'] as const)[level];

  return {
    fairValue,
    components: finalComponents,
    excluded,
    winsorized,
    flags: [...new Set(flags)],
    confidence,
    range,
    nullReason: null,
  };
}

export interface MultiplesEvaluation {
  /** Componente de múltiplos (EPS reparado × múltiplo de moat), o null
   *  solo ante imposibilidad matemática (EPS ≤ 0 o inexistente). */
  value: number | null;
  epsUsed: number | null;
  flags: string[];
  excluded: FvExcludedComponent | null;
  provenance: {
    originalEps: number | null;
    usedEps: number | null;
    sources: string[];
  };
}

interface EpsCandidate {
  value: number;
  source: string;
  /** Grupo de independencia: dos campos del mismo proveedor = 1 fuente. */
  group: string;
  /** Fuente directa de EPS (rutas i/ii). La derivación desde fundamentos
   *  (ruta iii) es una estimación: no participa de la detección de base,
   *  donde un factor entero suele ser ruido y no mezcla ordinaria/ADS. */
  direct: boolean;
}

const BASIS_FACTORS = [2, 3, 4, 5, 8, 10];

/** Factor entero de base (ordinaria vs ADS) entre dos valores, o null. */
function basisFactorBetween(a: number, b: number): number | null {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (lo <= 0) return null;
  const ratio = hi / lo;
  const nearest = Math.round(ratio);
  if (BASIS_FACTORS.includes(nearest) && Math.abs(ratio - nearest) / nearest <= 0.1) {
    return nearest;
  }
  return null;
}

/**
 * Componente de múltiplos con CADENA DE REPARACIÓN del EPS forward:
 *  (i) primitiva del proveedor (Yahoo defaultKeyStatistics.forwardEps);
 *  (ii) recomputación desde otras primitivas: EPS implícito del P/E
 *       forward publicado por otro proveedor (Finviz) o por el propio, y
 *       promedio de estimaciones +1y (Yahoo earningsTrend);
 *  (iii) derivación desde fundamentos: EPS trailing × (1 + crecimiento
 *        de ganancias reportado).
 * Reglas de resolución (universales):
 *  - Todo P/E se recomputa como precio ÷ EPS; un ratio publicado jamás es
 *    input. Si el publicado difiere >5% del recomputado, flag
 *    `providerRatioMismatch` (el EPS primitivo manda).
 *  - Diferencia por factor entero ≥2 entre fuentes ⇒ mezcla de bases
 *    (ordinaria vs ADS): se normaliza expresando la fuente menor en la
 *    base del instrumento (× factor; el EPS por ADS es el mayor), flag
 *    `basisNormalized`.
 *  - Candidatos con earnings yield >33% que conviven con candidatos
 *    plausibles (≤33%) se presumen corruptos: el EPS usado sale de los
 *    plausibles, flag `repairedFromSources` con procedencia registrada.
 *  - Si las fuentes coinciden dentro del 25%, EPS := promedio de las
 *    fuentes (ley de los grandes números a nivel input). Si discrepan
 *    sin explicación de base, EPS := mediana de las fuentes, flag
 *    `repairedFromSources`.
 *  - Las zonas de yield son DISPARADORES de escrutinio, no puertas:
 *    ey >33% confirmado por ≥2 grupos independientes ⇒ entra con flag
 *    `extremeYieldConfirmed`; sin confirmación, entra igual con
 *    `extremeYieldUnconfirmed` (la winsorización acota su efecto).
 *    12,5% < ey ≤ 33% ⇒ `extremeYieldCaution`. P/E > 150 ⇒
 *    `extremePeReferenceOnly` (informativo; el componente entra igual).
 *  - Única nulidad: EPS resultante ≤ 0 o inexistente tras agotar la
 *    cadena ⇒ componente null, flag `notMeaningful` (un múltiplo
 *    negativo no es una valuación).
 */
export function evaluateMultiplesComponent(args: {
  currentPrice: number;
  publishedForwardPe?: number | null;
  altPublishedForwardPe?: number | null;
  forwardEps?: number | null;
  forwardEpsAlt?: number | null;
  forwardEpsAltSource?: 'finviz' | 'yahooTrend' | null;
  trailingEps?: number | null;
  /** Último EPS anual reportado en estados contables (EDGAR): escalón de
   *  derivación desde filings cuando los proveedores de mercado no traen
   *  EPS forward ni trailing (activos poco seguidos, regla R0). */
  reportedEpsLatest?: number | null;
  earningsGrowth?: number | null;
  revenueGrowth?: number | null;
  moatMultiple: number;
}): MultiplesEvaluation {
  const flags: string[] = [];
  const price = args.currentPrice;
  const candidates: EpsCandidate[] = [];
  let primaryEps: number | null = null;
  let primaryFromRatio = false;

  if (args.forwardEps != null && Number.isFinite(args.forwardEps)) {
    primaryEps = args.forwardEps;
    candidates.push({ value: args.forwardEps, source: 'yahooForwardEps', group: 'yahoo', direct: true });
  } else if (
    args.publishedForwardPe != null &&
    args.publishedForwardPe !== 0 &&
    price > 0
  ) {
    // Ruta (ii) sobre el propio proveedor: EPS derivado del ratio.
    primaryEps = price / args.publishedForwardPe;
    primaryFromRatio = true;
    candidates.push({ value: primaryEps, source: 'yahooPeDerivedEps', group: 'yahoo', direct: true });
  }

  if (args.forwardEpsAlt != null && Number.isFinite(args.forwardEpsAlt)) {
    const fromFinviz = args.forwardEpsAltSource === 'finviz';
    candidates.push({
      value: args.forwardEpsAlt,
      source: fromFinviz ? 'finvizImpliedEps' : 'yahooTrendEps',
      group: fromFinviz ? 'finviz' : 'yahoo',
      direct: true,
    });
  } else if (
    args.altPublishedForwardPe != null &&
    args.altPublishedForwardPe !== 0 &&
    price > 0
  ) {
    candidates.push({
      value: price / args.altPublishedForwardPe,
      source: 'finvizPeDerivedEps',
      group: 'finviz',
      direct: true,
    });
  }

  // Ruta (iii): derivación desde fundamentos reportados.
  if (
    args.trailingEps != null &&
    args.trailingEps > 0 &&
    args.earningsGrowth != null &&
    Number.isFinite(args.earningsGrowth)
  ) {
    const derived = args.trailingEps * (1 + args.earningsGrowth);
    if (derived > 0 && Number.isFinite(derived)) {
      candidates.push({
        value: derived,
        source: 'trailingGrowthDerivedEps',
        group: 'fundamentals',
        direct: false,
      });
    }
  }

  // Ruta (iv) — escalón de estados contables (regla R0): si los
  // proveedores de mercado no aportaron ningún EPS, se deriva del último
  // EPS anual auditado (EDGAR) ajustado por el crecimiento reportado.
  // Un activo poco seguido se valúa igual; lo que baja es la confianza.
  const growthForFilings = args.earningsGrowth ?? args.revenueGrowth ?? null;
  if (
    args.reportedEpsLatest != null &&
    args.reportedEpsLatest > 0 &&
    growthForFilings != null &&
    Number.isFinite(growthForFilings)
  ) {
    const derived = args.reportedEpsLatest * (1 + growthForFilings);
    if (derived > 0 && Number.isFinite(derived)) {
      candidates.push({
        value: derived,
        source: 'edgarFilingsDerivedEps',
        group: 'filings',
        direct: false,
      });
    }
  }
  const hasDirectCandidate = candidates.some((c) => c.direct);
  const hasFilingsCandidate = candidates.some((c) => c.group === 'filings');
  if (hasFilingsCandidate && !hasDirectCandidate) flags.push('derivedFromFilings');
  if (candidates.length === 1) flags.push('singleSource');

  const provenance = (usedEps: number | null): MultiplesEvaluation['provenance'] => ({
    originalEps: primaryEps,
    usedEps,
    sources: [...new Set(candidates.map((c) => c.source))],
  });

  if (candidates.length === 0) {
    return { value: null, epsUsed: null, flags, excluded: null, provenance: provenance(null) };
  }

  // Chequeo de consistencia ratio publicado vs recomputado (informativo).
  if (primaryEps != null && primaryEps > 0 && price > 0) {
    const recomputed = price / primaryEps;
    for (const pub of [args.publishedForwardPe, args.altPublishedForwardPe]) {
      if (pub != null && pub > 0 && Math.abs(recomputed - pub) / pub > 0.05) {
        flags.push('providerRatioMismatch');
        break;
      }
    }
  }
  if (primaryFromRatio) flags.push('unconfirmedEps');

  // Normalización de base (ordinaria vs ADS) entre fuentes directas: la
  // fuente menor se expresa en la base del instrumento multiplicándola
  // por el factor detectado (el EPS por ADS es el mayor).
  let values = candidates.map((c) => c.value);
  const directPositives = candidates
    .map((c, i) => ({ direct: c.direct, v: values[i] }))
    .filter((x) => x.direct && x.v > 0)
    .map((x) => x.v);
  if (directPositives.length >= 2) {
    const hi = Math.max(...directPositives);
    let normalized = false;
    values = values.map((v, i) => {
      if (candidates[i].direct && v > 0 && v < hi) {
        const k = basisFactorBetween(hi, v);
        if (k != null) {
          normalized = true;
          return v * k;
        }
      }
      return v;
    });
    if (normalized) flags.push('basisNormalized');
  }

  // Selección del EPS: partición por plausibilidad del earnings yield.
  const plausible = values.filter((v) => v > 0 && price > 0 && v / price <= 0.33);
  const implausible = values.filter((v) => v > 0 && price > 0 && v / price > 0.33);
  let epsUsed: number;
  if (plausible.length > 0 && implausible.length > 0) {
    // Conviven fuentes sanas y corruptas: mandan las sanas.
    epsUsed = meanOf(plausible);
    flags.push('repairedFromSources');
  } else if (values.every((v) => v <= 0)) {
    epsUsed = medianOf(values);
  } else {
    const pos = values.filter((v) => v > 0);
    const med = medianOf(pos);
    const agree =
      pos.length >= 1 && pos.every((v) => Math.abs(v - med) / med <= 0.25);
    if (agree) {
      epsUsed = meanOf(pos);
    } else {
      epsUsed = med;
      flags.push('repairedFromSources');
    }
    // Reparación también si el valor usado se apartó >25% de la primitiva.
    if (
      primaryEps != null &&
      primaryEps > 0 &&
      Math.abs(epsUsed - primaryEps) / primaryEps > 0.25 &&
      !flags.includes('repairedFromSources')
    ) {
      flags.push('repairedFromSources');
    }
  }

  // Única nulidad posible: imposibilidad matemática.
  if (!(epsUsed > 0)) {
    flags.push('notMeaningful');
    return {
      value: null,
      epsUsed,
      flags,
      excluded: { component: 'multiples', reason: 'notMeaningful', value: null },
      provenance: provenance(epsUsed),
    };
  }

  // Zonas de yield sobre el EPS ya reparado: escrutinio, no exclusión.
  const ey = price > 0 ? epsUsed / price : 0;
  if (ey > 0.33) {
    const confirmingGroups = new Set(
      candidates
        .filter((c, i) => values[i] > 0 && Math.abs(values[i] - epsUsed) / epsUsed <= 0.25)
        .map((c) => c.group)
    );
    flags.push(confirmingGroups.size >= 2 ? 'extremeYieldConfirmed' : 'extremeYieldUnconfirmed');
  } else if (ey > 0.125) {
    flags.push('extremeYieldCaution');
  }
  if (price > 0 && price / epsUsed > 150) {
    flags.push('extremePeReferenceOnly');
  }

  return {
    value: epsUsed * args.moatMultiple,
    epsUsed,
    flags,
    excluded: null,
    provenance: provenance(epsUsed),
  };
}

export function computeFairValue(input: FundamentalInput): FairValueResult {
  const { symbol, currentPrice } = input;
  const isCrypto =
    input.isCrypto || symbol.startsWith('BINANCE:') || symbol.endsWith('USDT') || symbol.endsWith('-USD');

  const grossMarginPct = input.grossMargins != null ? input.grossMargins * 100 : null;
  const operatingMarginPct = input.operatingMargins != null ? input.operatingMargins * 100 : null;
  const roePct = input.returnOnEquity != null ? input.returnOnEquity * 100 : null;
  const roaPct = input.returnOnAssets != null ? input.returnOnAssets * 100 : null;
  const revenueGrowthPct = input.revenueGrowth != null ? input.revenueGrowth * 100 : null;

  // ROIC proxy from ROE & ROA / operating margin
  const roicProxyPct =
    roePct != null && roaPct != null
      ? roePct * 0.6 + roaPct * 0.4
      : roePct ?? (operatingMarginPct != null ? operatingMarginPct * 0.85 : null);

  const evToEbitda =
    input.enterpriseValue && input.ebitda && input.ebitda > 0
      ? input.enterpriseValue / input.ebitda
      : null;

  const mktCap =
    input.sharesOutstanding && currentPrice > 0
      ? input.sharesOutstanding * currentPrice
      : null;
  const ocfAdjusted =
    input.operatingCashflow && input.operatingCashflow > 0
      ? input.operatingCashflow * 0.78
      : 0;
  const fcfBase =
    input.freeCashflow && input.freeCashflow > 0
      ? Math.max(input.freeCashflow, ocfAdjusted)
      : ocfAdjusted > 0
      ? ocfAdjusted
      : null;

  const fcfYieldPct = fcfBase && mktCap && mktCap > 0 ? (fcfBase / mktCap) * 100 : null;

  // Base del DCF normalizada: con ≥3 años de FCF anual reportado, la base
  // es la MEDIANA de los últimos 3–5 años — nunca un año valle ni un año
  // pico. Sin serie suficiente, rige la misma regla uniforme de fallback:
  // la base actual (TTM). La mediana ≤ 0 anula el componente (imposibilidad
  // matemática: no hay flujo positivo que descontar). El fcfYieldPct de
  // arriba sigue siendo la foto TTM.
  const fvFlags: string[] = [];
  let dcfBase = fcfBase;
  let dcfBaseSource = 'ttm';
  let dcfPreExcluded: FvExcludedComponent | null = null;
  let troughAdjusted = false;
  const fcfSeries = (input.fcfHistory ?? [])
    .filter((v): v is number => v != null && Number.isFinite(v))
    .slice(0, 5);
  if (fcfSeries.length >= 3) {
    const med = medianOf(fcfSeries);
    const latest = fcfSeries[0];
    if (med > 0) {
      if (latest > 3 * med || latest < med / 3) fvFlags.push('normalizedBase');
      if (latest < 0.5 * med) troughAdjusted = true;
      dcfBase = med;
      dcfBaseSource =
        input.fcfHistorySource === 'edgar'
          ? 'edgarFcfHistoryMedian'
          : input.fcfHistorySource === 'yahoo'
            ? 'yahooFcfHistoryMedian'
            : 'fcfHistoryMedian';
    } else {
      dcfBase = null;
      dcfPreExcluded = { component: 'dcf', reason: 'medianFcfNonPositive', value: null };
    }
  }
  const epsSeries = (input.epsHistory ?? [])
    .filter((v): v is number => v != null && Number.isFinite(v))
    .slice(0, 5);
  if (epsSeries.length >= 3) {
    const med = medianOf(epsSeries);
    if (med > 0 && epsSeries[0] < 0.5 * med) troughAdjusted = true;
  }
  if (troughAdjusted) fvFlags.push('troughAdjusted');
  if (dcfBase != null && dcfBaseSource === 'ttm' && input.fcfDerivedFromFilings) {
    // La base TTM vino de los estados auditados (EDGAR) porque el
    // proveedor de mercado no traía FCF: escalón de filings (regla R0).
    dcfBaseSource = 'edgarAnnualCashflow';
    fvFlags.push('derivedFromFilings');
  }

  if (isCrypto) {
    return {
      symbol,
      currentPrice,
      fairValue: null,
      dcfValue: null,
      analystTarget: null,
      fvComponents: [],
      multiplesValue: null,
      fvConfidence: null,
      fvRange: null,
      fvExcluded: [],
      fvWinsorized: [],
      fvProvenance: [],
      fvFlags: [],
      fvNullReason: null,
      priceToFairValue: null,
      status: 'N/A',
      upsidePct: null,
      moat: 'None',
      moatScore: 35,
      uncertainty: 'Extreme',
      multiples: {
        pe: null,
        forwardPe: null,
        evToEbitda: null,
        fcfYieldPct: null,
        roicProxyPct: null,
        grossMarginPct: null,
        operatingMarginPct: null,
        roePct: null,
        revenueGrowthPct: null,
        debtToEquity: null,
      },
      implied10YReturnCagrPct: 11.5,
    };
  }

  // Moat classification (Morningstar style heuristic)
  let moatScore = 40;
  if ((grossMarginPct ?? 0) > 55) moatScore += 22;
  else if ((grossMarginPct ?? 0) > 38) moatScore += 12;
  if ((operatingMarginPct ?? 0) > 25) moatScore += 20;
  else if ((operatingMarginPct ?? 0) > 14) moatScore += 10;
  if ((roePct ?? 0) > 22) moatScore += 18;
  else if ((roePct ?? 0) > 12) moatScore += 9;
  moatScore = clamp(moatScore, 15, 98);

  const moat: 'Wide' | 'Narrow' | 'None' =
    moatScore >= 74 ? 'Wide' : moatScore >= 52 ? 'Narrow' : 'None';

  // 2-stage 10-year DCF per share (sobre la base normalizada; los caps
  //  mecánicos de crecimiento y el WACC no cambian)
  let dcfValue: number | null = null;
  if (dcfBase && input.sharesOutstanding && input.sharesOutstanding > 0) {
    const fcfPerShare = dcfBase / input.sharesOutstanding;
    const rawGrowth =
      input.revenueGrowth ?? input.earningsGrowth ?? 0.10;
    const g0 = clamp(rawGrowth, 0.04, 0.26);
    const gTerminal = 0.032;
    const wacc = (input.beta ?? 1.1) > 1.45 ? 0.096 : 0.088;

    let pvSum = 0;
    let fcfT = fcfPerShare;
    for (let yr = 1; yr <= 10; yr++) {
      const gYr = g0 - ((g0 - gTerminal) * (yr - 1)) / 9;
      fcfT *= 1 + gYr;
      pvSum += fcfT / Math.pow(1 + wacc, yr);
    }
    const terminalVal = (fcfT * (1 + gTerminal)) / (wacc - gTerminal);
    const pvTerminal = terminalVal / Math.pow(1 + wacc, 10);
    const netCashPerShare =
      ((input.totalCash ?? 0) - (input.totalDebt ?? 0)) / input.sharesOutstanding;
    const rawDcf = pvSum + pvTerminal + netCashPerShare;
    if (rawDcf > 0 && Number.isFinite(rawDcf)) {
      dcfValue = rawDcf;
    }
  }

  // Componente de múltiplos: EPS forward reparado entre fuentes × múltiplo
  // de moat. El P/E publicado jamás entra como input directo.
  const targetMultiple = moat === 'Wide' ? 26 : moat === 'Narrow' ? 20 : 15;
  const mult = evaluateMultiplesComponent({
    currentPrice,
    publishedForwardPe: input.forwardPE ?? null,
    altPublishedForwardPe: input.finvizForwardPe ?? null,
    forwardEps: input.forwardEps ?? null,
    forwardEpsAlt: input.forwardEpsAlt ?? null,
    forwardEpsAltSource: input.forwardEpsAltSource ?? null,
    trailingEps: input.trailingEps ?? null,
    reportedEpsLatest: epsSeries.length > 0 ? epsSeries[0] : null,
    earningsGrowth: input.earningsGrowth ?? null,
    revenueGrowth: input.revenueGrowth ?? null,
    moatMultiple: targetMultiple,
  });
  fvFlags.push(...mult.flags);

  // Componente target: promedio de las fuentes de target disponibles
  // (Yahoo — promedio o, en su defecto, mediana del mismo consenso — y
  // Finviz Target Price). Null solo si ninguna fuente publica target
  // (imposibilidad).
  const targetSources: Array<{ value: number; source: string }> = [];
  if (input.targetMeanPrice && input.targetMeanPrice > 0) {
    targetSources.push({ value: input.targetMeanPrice, source: 'yahooTargetMean' });
  } else if (input.targetMedianPrice && input.targetMedianPrice > 0) {
    targetSources.push({ value: input.targetMedianPrice, source: 'yahooTargetMedian' });
  }
  if (input.targetAltPrice && input.targetAltPrice > 0) {
    targetSources.push({ value: input.targetAltPrice, source: 'finvizTargetPrice' });
  }
  const analystTarget =
    targetSources.length > 0 ? meanOf(targetSources.map((t) => t.value)) : null;

  // Agregación por promedio winsorizado: lo extremo entra recortado al
  // borde de la banda, nunca se borra; con 1 componente el FV es ese
  // componente. El fallback precio × 1,05 no existe: el FV jamás se
  // fabrica desde el precio.
  const pool: FvComponentInput[] = [];
  if (dcfValue != null) pool.push({ key: 'dcf', value: dcfValue, troughAdjusted });
  if (mult.value != null) pool.push({ key: 'multiples', value: mult.value });
  if (analystTarget != null) pool.push({ key: 'target', value: analystTarget });
  const agg = aggregateFairValue(pool, {
    currentPrice,
    flags: fvFlags,
    excluded: [dcfPreExcluded, mult.excluded].filter(
      (x): x is FvExcludedComponent => x != null
    ),
  });

  const fvProvenance: FvProvenance[] = [
    {
      component: 'dcf',
      originalValue: fcfBase,
      usedValue: dcfBase,
      sources: dcfBase != null ? [dcfBaseSource] : [],
      flags: [
        ...(fvFlags.includes('normalizedBase') ? ['normalizedBase'] : []),
        ...(troughAdjusted ? ['troughAdjusted'] : []),
        ...(dcfBaseSource === 'edgarAnnualCashflow' ? ['derivedFromFilings'] : []),
      ],
    },
    {
      component: 'multiples',
      originalValue: mult.provenance.originalEps,
      usedValue: mult.provenance.usedEps,
      sources: mult.provenance.sources,
      flags: mult.flags,
    },
    {
      component: 'target',
      originalValue: input.targetMeanPrice ?? null,
      usedValue: analystTarget,
      sources: targetSources.map((t) => t.source),
      flags: [],
    },
  ];

  const fairValue = agg.fairValue;
  const priceToFairValue =
    fairValue != null && fairValue > 0 ? currentPrice / fairValue : null;
  const upsidePct =
    fairValue != null && fairValue > 0
      ? ((fairValue - currentPrice) / currentPrice) * 100
      : null;

  let status: 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A' = 'Fairly Valued';
  if (priceToFairValue != null) {
    if (priceToFairValue < 0.88) status = 'Undervalued';
    else if (priceToFairValue > 1.12) status = 'Overvalued';
    else status = 'Fairly Valued';
  } else {
    status = 'N/A';
  }

  const beta = input.beta ?? 1.1;
  const uncertainty: 'Low' | 'Medium' | 'High' | 'Extreme' =
    beta < 0.9 ? 'Low' : beta < 1.35 ? 'Medium' : beta < 1.85 ? 'High' : 'Extreme';

  // Implied 10Y CAGR = base business return + valuation convergence over 10y
  const baseOrganic = moat === 'Wide' ? 11.5 : moat === 'Narrow' ? 9.5 : 8.0;
  const convFactor = priceToFairValue && priceToFairValue > 0 ? Math.pow(1 / priceToFairValue, 1 / 10) - 1 : 0;
  const implied10YReturnCagrPct = clamp(baseOrganic + convFactor * 100, 3.0, 24.0);

  return {
    symbol,
    currentPrice,
    fairValue,
    dcfValue,
    analystTarget,
    fvComponents: agg.components.map((c) => c.value),
    multiplesValue: mult.value,
    fvConfidence: agg.confidence,
    fvRange: agg.range,
    fvExcluded: agg.excluded,
    fvWinsorized: agg.winsorized,
    fvProvenance,
    fvFlags: agg.flags,
    fvNullReason: agg.nullReason,
    priceToFairValue,
    status,
    upsidePct,
    moat,
    moatScore,
    uncertainty,
    multiples: {
      pe: input.trailingPE ?? null,
      forwardPe: input.forwardPE ?? null,
      evToEbitda,
      fcfYieldPct,
      roicProxyPct,
      grossMarginPct,
      operatingMarginPct,
      roePct,
      revenueGrowthPct,
      debtToEquity: input.debtToEquity ?? null,
    },
    implied10YReturnCagrPct,
  };
}
