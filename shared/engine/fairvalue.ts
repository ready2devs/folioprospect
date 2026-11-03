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
  /** Máximo del consenso de analistas (Yahoo targetHighPrice): el
   *  componente target nunca vive — ni se recorta por winsorización —
   *  por encima del máximo de las estimaciones que lo componen (R9). */
  targetHighPrice?: number | null;
  /** Mínimo del consenso (Yahoo targetLowPrice): piso del componente. */
  targetLowPrice?: number | null;
  /** Cantidad de analistas del consenso (Yahoo numberOfAnalystOpinions):
   *  gobierna la calidad — y por tanto el peso — del componente target
   *  en la agregación (directiva del usuario 2026-11-03: el consenso,
   *  promedio de muchas estimaciones independientes, lidera el FV). */
  analystCount?: number | null;
  /** P/E forward de la industria/pares si la capa de datos lo conoce:
   *  referencia preferida del tope sectorial del múltiplo (R9). Si
   *  falta, el tope usa el P/E forward recomputado del propio activo. */
  industryForwardPe?: number | null;
  /** Series anuales de EDGAR (USD, más reciente primero): flujo
   *  operativo y capex alineados por cierre fiscal, ingreso neto y
   *  depreciación. Las consume la capa de datos del Optimizador para
   *  la tasa de reinversión del ancla de crecimiento sustentable
   *  (corrección 2026-11-03); el motor de FV no las usa. */
  ocfHistory?: number[] | null;
  capexHistory?: number[] | null;
  netIncomeHistory?: number[] | null;
  depreciationHistory?: number[] | null;
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
  /** Variación interanual de acciones diluidas en circulación, % (EDGAR):
   *  positivo = dilución neta. Lo consume el Optimizador (ancla GK ΔS y
   *  señal de deterioro por dilución); el FV no lo usa. */
  sharesGrowthYoYPct?: number | null;
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
  // ---- Arquitectura simplificada (R10): DCF corto sobre ganancias ----
  /** Crecimiento del EPS del próximo año fiscal según la tendencia de
   *  consenso (Yahoo earningsTrend +1y, decimal): fija el año +2 de la
   *  pata de DCF sobre ganancias (E2 = E1 × (1 + g)). */
  epsTrendGrowthNextYear?: number | null;
  /** Crecimiento de EPS a 5 años de la tendencia de consenso (Yahoo
   *  earningsTrend +5y, decimal): ancla del desvanecimiento. */
  epsTrendGrowth5y?: number | null;
  /** Crecimiento de EPS del próximo año según Finviz («EPS next Y», %). */
  finvizEpsNextYearPct?: number | null;
  /** Crecimiento de EPS a 5 años según Finviz («EPS next 5Y», %). */
  finvizEpsNext5YPct?: number | null;
  /** Crecimiento de ingresos implícito en las estimaciones de la
   *  tendencia (revenueEstimate +1y vs 0y, decimal): contraste de
   *  cordura del crecimiento de la pata de ganancias. */
  trendRevenueGrowth?: number | null;
  // ---- TradingView (directiva del usuario 2026-11-03) ----
  /** EPS forecast del próximo año fiscal según el scanner de
   *  TradingView: fuente directa adicional de la cadena de reparación
   *  (independencia parcial: los universos de analistas se solapan). */
  tvEpsForecastNextFy?: number | null;
  /** Ingresos forecast del próximo año fiscal según TradingView:
   *  contraste de crecimiento de la pata de ganancias. */
  tvRevenueForecastNextFy?: number | null;
  /** Ingresos TTM según TradingView (misma fuente que el forecast:
   *  el crecimiento implícito se calcula dentro del mismo proveedor). */
  tvRevenueTtm?: number | null;
  /** Target promedio de analistas según TradingView: tercera fuente
   *  del componente target, con su propio rango [low, high]. */
  targetTvPrice?: number | null;
  targetTvHigh?: number | null;
  targetTvLow?: number | null;
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
  /** Calidad medible del dato detrás del componente (0,3–1): largo de la
   *  serie del DCF, grupos de fuentes independientes del EPS, cantidad de
   *  fuentes del target. Pondera el promedio winsorizado con ratio acotado
   *  (ningún peso sale de [0,5×, 2×] el peso igualitario). Sin dato = 1. */
  quality?: number;
  /** Techo duro del valor final del componente tras la winsorización:
   *  para el target es el máximo del consenso de analistas — un
   *  componente anclado en mercado jamás se recorta HACIA ARRIBA por
   *  encima de la estimación más optimista que lo compone (R9). */
  clipCeiling?: number;
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
  /** Las tres patas del FV más 'anchor': el ancla histórica (DCF de
   *  FCF reportado), que ya NO forma parte del promedio — se expone
   *  como referencia y escenario pesimista (arquitectura R10). */
  component: FvComponentKey | 'anchor';
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
  /** Peso efectivo de cada componente en el promedio (alineado con
   *  `components`): igualitario salvo que la calidad medible difiera. */
  weights: number[];
  excluded: FvExcludedComponent[];
  winsorized: FvWinsorizedComponent[];
  flags: string[];
  confidence: 'Alta' | 'Media' | 'Baja' | null;
  range: [number, number] | null;
  nullReason: string | null;
  /** Componentes extremos contra la mediana del pool (>3,5× o <0,25×):
   *  siguen dentro del promedio, pero NO arrastran la referencia de
   *  banda que recorta a los demás (referencia robusta, R9). */
  referenceOutliers: FvComponentKey[];
  /** Tripwire de plausibilidad (R9): si el FV final supera 2× el target
   *  de consenso o 2,5× el precio, el modelo se marca sospechoso
   *  (`modelSuspect`, confianza forzada a Baja) y este campo nombra el
   *  componente que domina la desviación. El número no cambia: se señala. */
  modelSuspectDominant: FvComponentKey | null;
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
  'ttmBaseEmerging',
  'cyclicalNormalized',
]);

/** Banda de credibilidad entre componentes (ratios históricos del motor). */
export const FV_BAND_LOW = 0.25;
export const FV_BAND_HIGH = 3.5;

/** Castigo al DCF «emergente» (base TTM sin mediana histórica que la
 *  respalde): la base entra recortada 25% y su calidad de ponderación
 *  es el piso del sistema (0,30). Pase correctivo RE (C): el componente
 *  se castiga, no se elimina — R0 sigue vigente. */
export const EMERGING_DCF_HAIRCUT = 0.75;
export const EMERGING_DCF_QUALITY = 0.3;

/** Normalización cíclica de la base del DCF (R9): si NO hay serie ≥3
 *  años cuya mediana ya normalice, la base es la foto TTM — y una foto
 *  con FCF yield alto es un pico de ciclo (productoras de commodities
 *  en año de precios altos; el umbral de ciclicidad del sistema es
 *  20%). La base se recorta con un factor CONTINUO 12/yield (yield de
 *  mitad de ciclo ≈ 12%): a yield 20% el factor es 0,60; a 30%, 0,40
 *  (piso: recorte máximo 60%). Sin escalón en ningún umbral — un salto
 *  discreto al cruzar 20% sería el mismo artefacto de umbral que la
 *  banda contra el precio ya eliminó. Extrapolar un FCF de pico por
 *  una década es el error espejo de anular el DCF: se normaliza. */
export const CYCLICAL_FCF_YIELD_TARGET_PCT = 12;
export const CYCLICAL_FCF_HAIRCUT_FLOOR = 0.4;

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

  // Tripwire de plausibilidad (R9), compartido por los caminos de 1 y
  // ≥2 componentes: FV > 2× el target de consenso del pool, o > 2,5× el
  // precio ⇒ el modelo se declara sospechoso. No altera el número.
  const suspectCheck = (
    fv: number,
    finalComps: FvComponentInput[]
  ): FvComponentKey | null => {
    const targetPool = pool.find((c) => c.key === 'target');
    const byTarget = targetPool != null && fv > 2 * targetPool.value;
    const byPrice = opts.currentPrice > 0 && fv > 2.5 * opts.currentPrice;
    if (!byTarget && !byPrice) return null;
    if (!flags.includes('modelSuspect')) flags.push('modelSuspect');
    const dom = finalComps.reduce((m, c) => (c.value > m.value ? c : m), finalComps[0]);
    return dom ? dom.key : null;
  };

  if (pool.length === 0) {
    return {
      fairValue: null,
      components: [],
      weights: [],
      excluded,
      winsorized,
      flags: [...new Set(flags)],
      confidence: null,
      range: null,
      nullReason: 'noValidComponents',
      referenceOutliers: [],
      modelSuspectDominant: null,
    };
  }

  if (pool.length === 1) {
    flags.push('singleComponent');
    const dominant = suspectCheck(pool[0].value, pool);
    return {
      fairValue: pool[0].value,
      components: pool,
      weights: [1],
      excluded,
      winsorized,
      flags: [...new Set(flags)],
      confidence: 'Baja',
      range,
      nullReason: null,
      referenceOutliers: [],
      modelSuspectDominant: dominant,
    };
  }

  // Referencia ROBUSTA de la banda (R9): un componente extremo contra
  // la mediana del pool (>3,5× o <0,25×) sigue entrando al promedio
  // winsorizado como siempre, pero deja de arrastrar el piso/techo que
  // recorta a los demás. Era el defecto espejo de MELI (un DCF gigante
  // levantaba el piso y expulsaba/levantaba a los múltiplos sanos) y de
  // VIST (dos componentes fantasía levantaron el target anclado).
  const medAll = medianOf(pool.map((c) => c.value));
  const outlierKeys = new Set<FvComponentKey>(
    pool.length >= 3
      ? pool
          .filter((c) => c.value > medAll * FV_BAND_HIGH || c.value < medAll * FV_BAND_LOW)
          .map((c) => c.key)
      : []
  );
  if (outlierKeys.size > 0) flags.push('referenceOutlierExcluded');
  const referenceOutliers = [...outlierKeys];

  const finalComponents: FvComponentInput[] = pool.map((c) => {
    const othersAll = pool.filter((o) => o !== c);
    const othersSane = othersAll.filter((o) => !outlierKeys.has(o.key));
    const others = (othersSane.length > 0 ? othersSane : othersAll).map((o) => o.value);
    const ref = meanOf(others);
    let clipped = clamp(c.value, ref * FV_BAND_LOW, ref * FV_BAND_HIGH);
    // Techo duro del componente (target: máximo del consenso): la
    // winsorización jamás lo levanta por encima de su propio ancla.
    if (c.clipCeiling != null && c.clipCeiling > 0) {
      clipped = Math.min(clipped, c.clipCeiling);
    }
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

  // Promedio ponderado por CALIDAD MEDIBLE del dato (no por opinión):
  // peso ∝ calidad, acotado a [0,5×, 2×] el peso igualitario y
  // renormalizado. Sin información de calidad, todos pesan igual (el
  // comportamiento histórico del motor).
  const n = finalComponents.length;
  const equal = 1 / n;
  const qSum = finalComponents.reduce((s, c) => s + clamp(c.quality ?? 1, 0.3, 1), 0);
  let weights = finalComponents.map(
    (c) => clamp((clamp(c.quality ?? 1, 0.3, 1) / qSum) || equal, equal * 0.5, equal * 2)
  );
  const wSum = weights.reduce((s, w) => s + w, 0);
  weights = weights.map((w) => w / wSum);
  const fairValue = finalComponents.reduce((s, c, i) => s + c.value * weights[i], 0);

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
  // Tripwire: un FV que duplica al consenso o vale 2,5× el precio es,
  // hasta demostrar lo contrario, un error del modelo: confianza Baja
  // forzada y componente dominante identificado (el número no cambia).
  const modelSuspectDominant = suspectCheck(fairValue, finalComponents);
  if (modelSuspectDominant != null) level = 2;
  const confidence = (['Alta', 'Media', 'Baja'] as const)[level];

  return {
    fairValue,
    components: finalComponents,
    weights,
    excluded,
    winsorized,
    flags: [...new Set(flags)],
    confidence,
    range,
    nullReason: null,
    referenceOutliers,
    modelSuspectDominant,
  };
}

export interface MultiplesEvaluation {
  /** Componente de múltiplos (EPS reparado × múltiplo acotado por el
   *  sector), o null solo ante imposibilidad matemática (EPS ≤ 0 o
   *  inexistente). */
  value: number | null;
  epsUsed: number | null;
  /** Múltiplo efectivamente aplicado (tras el tope sectorial R9) y el
   *  tope calculado, para trazabilidad. */
  multipleUsed: number | null;
  multipleCap: number | null;
  flags: string[];
  excluded: FvExcludedComponent | null;
  /** Las fuentes DIRECTAS del EPS forward discrepan en el signo en el
   *  mismo refresco (consenso ≈ break-even: un input cara o cruz). No
   *  cambia la etiqueta pública de confianza (el flag NO está en
   *  MINOR_CONFIDENCE_FLAGS); lo consume la capa de retorno esperado
   *  del Optimizador como castigo propio (pase correctivo RE, D). */
  signDisagreement: boolean;
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
  /** Prima de calidad sobre la referencia sectorial según el moat
   *  (Wide 1,5 · Narrow 1,25 · None 1,0): cuánto más que el sector puede
   *  valer una franquicia superior. La fija quien llama (R9). */
  moatPremium?: number;
  /** P/E forward de la industria/pares si se conoce: referencia
   *  preferida del tope. Sin él, el tope usa el P/E forward recomputado
   *  del propio activo (el veredicto del mercado sobre ese papel). */
  industryForwardPe?: number | null;
  /** EPS forecast del próximo año fiscal según TradingView: fuente
   *  directa adicional (grupo propio; independencia parcial). */
  forwardEpsTv?: number | null;
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

  // Fuente directa adicional: TradingView (directiva del usuario
  // 2026-11-03). Grupo de independencia propio; la independencia es
  // PARCIAL (los universos de analistas se solapan entre proveedores)
  // y el horizonte es el próximo año fiscal según el proveedor de TV,
  // cercano al NTM de Yahoo pero no idéntico: la cadena de reparación
  // media con su lógica habitual de acuerdo/desacuerdo entre fuentes.
  if (args.forwardEpsTv != null && Number.isFinite(args.forwardEpsTv)) {
    candidates.push({
      value: args.forwardEpsTv,
      source: 'tradingviewEpsForecastNextFy',
      group: 'tradingview',
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

  // Desacuerdo de SIGNO entre fuentes directas en el mismo refresco:
  // el consenso está en break-even y el signo del EPS es cara o cruz
  // según qué fuente responda último. Se registra como flag de
  // trazabilidad y como campo propio; la valuación pública no cambia
  // (no integra MINOR_CONFIDENCE_FLAGS), pero la capa de RE del
  // Optimizador baja un escalón la confianza que usa y deja de creerle
  // crecimiento de EPS a Grinold-Kroner (pase correctivo RE, D).
  const directValues = candidates.filter((c) => c.direct).map((c) => c.value);
  const signDisagreement =
    directValues.some((v) => v > 0) && directValues.some((v) => v < 0);
  if (signDisagreement) flags.push('signDisagreement');

  if (candidates.length === 0) {
    return {
      value: null,
      epsUsed: null,
      multipleUsed: null,
      multipleCap: null,
      flags,
      excluded: null,
      signDisagreement,
      provenance: provenance(null),
    };
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

  // Normalización de base (ordinaria vs ADS) entre fuentes directas.
  // La base de referencia es la PRIMITIVA PRIMARIA (el EPS forward de
  // Yahoo, del que el motor recomputa todo ratio — doctrina R9): las
  // demás fuentes se expresan en esa base cuando un factor entero
  // (2, 3, 4, 5, 8, 10) explica su distancia, en cualquier dirección.
  // La primitiva primaria NUNCA se escala lejos de sí misma: con tres
  // fuentes (Yahoo 10, Finviz 10,2, TV 30) la lectura ingenua «el
  // mayor es la base ADS» escalaba la MAYORÍA hacia el outlier; con el
  // ancla primaria, el 30 de TV se interpreta como la misma ganancia
  // en una base 3× menor y se armoniza a ~10. Sin primitiva primaria
  // (sin dato de Yahoo), rige el criterio legado: escalar hacia el
  // mayor (el EPS por ADS es el mayor).
  let values = candidates.map((c) => c.value);
  let basisNormalizedAny = false;
  if (primaryEps != null && primaryEps > 0) {
    values = values.map((v, i) => {
      if (!candidates[i].direct || v <= 0 || v === primaryEps) return v;
      const k = basisFactorBetween(primaryEps!, v);
      if (k == null) return v;
      basisNormalizedAny = true;
      return v > primaryEps! ? v / k : v * k;
    });
  } else {
    const directPositives = candidates
      .map((c, i) => ({ direct: c.direct, v: values[i] }))
      .filter((x) => x.direct && x.v > 0)
      .map((x) => x.v);
    if (directPositives.length >= 2) {
      const hi = Math.max(...directPositives);
      values = values.map((v, i) => {
        if (candidates[i].direct && v > 0 && v < hi) {
          const k = basisFactorBetween(hi, v);
          if (k != null) {
            basisNormalizedAny = true;
            return v * k;
          }
        }
        return v;
      });
    }
  }
  if (basisNormalizedAny) flags.push('basisNormalized');

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
      multipleUsed: null,
      multipleCap: null,
      flags,
      excluded: { component: 'multiples', reason: 'notMeaningful', value: null },
      signDisagreement,
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

  // TOPE SECTORIAL del múltiplo (R9): la tabla por moat es ciega al
  // sector — le aplicaba 26× a una petrolera E&P que el mercado paga
  // 5–7×. El múltiplo aplicado queda acotado por la referencia del
  // sector: el P/E forward de la industria si se conoce; si no, el P/E
  // forward recomputado del propio activo (precio ÷ EPS reparado).
  // Sobre esa referencia se admite una prima por moat (franquicia
  // superior vale más que el sector) y una prima por crecimiento
  // documentada en el propio cálculo: el crecimiento de ganancias por
  // encima de 10% anual suma hasta +40% de múltiplo. El tope solo
  // puede bajar el múltiplo de tabla, nunca subirlo.
  const ownPe = price > 0 ? price / epsUsed : null;
  const baseRef =
    args.industryForwardPe != null && args.industryForwardPe > 0
      ? args.industryForwardPe
      : ownPe;
  let multipleUsed = args.moatMultiple;
  let multipleCap: number | null = null;
  if (baseRef != null && baseRef > 0) {
    const gForCap = args.earningsGrowth ?? args.revenueGrowth ?? null;
    const growthPremium = gForCap != null ? clamp(gForCap - 0.1, 0, 0.4) : 0;
    multipleCap = baseRef * (args.moatPremium ?? 1) * (1 + growthPremium);
    if (multipleCap < multipleUsed) {
      multipleUsed = multipleCap;
      flags.push('sectorCappedMultiple');
    }
  }

  return {
    value: epsUsed * multipleUsed,
    epsUsed,
    multipleUsed,
    multipleCap,
    flags,
    excluded: null,
    signDisagreement,
    provenance: provenance(epsUsed),
  };
}

/** Tasa de descuento ÚNICA del DCF corto sobre ganancias (R10): una
 *  sola tasa para todos los activos — la simplicidad manda sobre el
 *  ajuste fino por beta; la dispersión entre patas y la winsorización
 *  ya cobran la incertidumbre. */
export const EARNINGS_DCF_DISCOUNT_PCT = 10;
/** Conversión EPS → flujo de caja del accionista (proxy único,
 *  documentado): las ganancias contables sobredeclaran la caja
 *  distribuible por el capex de mantenimiento y el capital de trabajo
 *  que el D&A no captura; ×0,85 es el haircut medio prudente. Se
 *  aplica a los flujos proyectados Y a la base del valor terminal,
 *  para que la pata sea internamente consistente. */
export const EARNINGS_CASH_CONVERSION = 0.85;
/** Topes sanos del crecimiento de la pata de ganancias (R10): el
 *  crecimiento del año +2 se acota a [−30%, +60%]; el de largo plazo
 *  (consenso a 5 años) a [−10%, +35%]; el terminal a [−5%, +6%]. */
export const EARNINGS_G1_MIN = -0.3;
export const EARNINGS_G1_MAX = 0.6;
export const EARNINGS_G5_MIN = -0.1;
export const EARNINGS_G5_MAX = 0.35;
export const EARNINGS_GTERM_MIN = -0.05;
export const EARNINGS_GTERM_MAX = 0.06;
/** Holgura del chequeo de ingresos: el EPS puede crecer más rápido
 *  que las ventas por expansión de márgenes y recompras, pero no
 *  indefinidamente — el crecimiento de ganancias usado no supera el
 *  crecimiento de ingresos de consenso + 15 pp. */
export const EARNINGS_REVENUE_SLACK = 0.15;

export interface EarningsDcfEvaluation {
  /** Valor de la pata (por acción), o null si el sendero colapsa. */
  value: number | null;
  /** Sendero de EPS proyectado años 1–5 (E1 = epsUsed). */
  epsPath: number[];
  /** Crecimientos efectivamente usados: año +2, largo plazo y terminal. */
  growthUsed: { g1: number; g5: number; gTerm: number };
  /** Procedencia del crecimiento: 'consensus' (g1 y g5 de consenso),
   *  'partial' (uno de los dos por respaldo), 'fallback' (ninguno:
   *  crecimiento de ingresos o de ganancias contable). Gobierna la
   *  calidad — y el peso — de la pata. */
  growthTier: 'consensus' | 'partial' | 'fallback';
  flags: string[];
}

/**
 * Pata 3 de la arquitectura simplificada (R10): DCF CORTO SOBRE
 * GANANCIAS de consenso. Reemplaza al DCF de FCF histórico como pata
 * central (que queda como ancla histórica, fuera del promedio).
 *
 * Operación transparente: E1 = EPS forward de consenso ya reparado
 * (el mismo de la pata de múltiplos); E2 = E1 × (1 + g1) con g1 =
 * crecimiento de consenso del próximo año; el crecimiento se desvanece
 * hacia el consenso a 5 años (g5) y de ahí al terminal (gTerm): años
 * 3–5 interpolan linealmente. Cada EPS se convierte a flujo con
 * ×0,85 y se descuenta al 10% único; el valor terminal es E5 × 0,85 ×
 * múltiplo del sector (el mismo múltiplo acotado de la pata 2),
 * descontado 5 años. Al ser sobre ganancias (lógica FCFE), la pata
 * aplica también a financieras.
 *
 * Quien llama decide la n/m (R-C): EPS ≤ 0 o desacuerdo de signo
 * irresoluble entre fuentes ⇒ la pata no se computa.
 */
export function evaluateEarningsDcf(args: {
  epsYear1: number;
  /** Crecimiento de EPS año +2 de consenso (tendencia +1y o Finviz
   *  «next Y»), decimal. */
  growthNextYear?: number | null;
  /** Crecimiento de EPS a 5 años de consenso, decimal. */
  growth5y?: number | null;
  /** Respaldo final de crecimiento (ingresos o ganancias contable). */
  growthFallback?: number | null;
  /** Crecimiento de ingresos de consenso (contraste): si existe, el
   *  crecimiento de ganancias usado no lo supera por más de 15 pp. */
  revenueGrowthCheck?: number | null;
  /** Múltiplo del sector ya acotado (el de la pata de múltiplos). */
  sectorMultiple: number;
}): EarningsDcfEvaluation {
  const flags: string[] = [];
  const fromPct = (v: number | null | undefined): number | null =>
    v != null && Number.isFinite(v) ? v : null;
  const gNextRaw = fromPct(args.growthNextYear);
  const g5Raw = fromPct(args.growth5y);
  const gFallback = fromPct(args.growthFallback);

  let g1 = gNextRaw ?? g5Raw ?? gFallback ?? 0.05;
  let g5 = g5Raw ?? gNextRaw ?? gFallback ?? 0.05;
  const tier: EarningsDcfEvaluation['growthTier'] =
    gNextRaw != null && g5Raw != null
      ? 'consensus'
      : gNextRaw != null || g5Raw != null
        ? 'partial'
        : 'fallback';
  if (tier !== 'consensus') flags.push('earningsDcfGrowthFallback');

  // Chequeo de ingresos (contraste de cordura): el crecimiento de
  // ganancias no puede despegarse del de ventas para siempre.
  const revCheck = fromPct(args.revenueGrowthCheck);
  if (revCheck != null) {
    const cap = revCheck + EARNINGS_REVENUE_SLACK;
    if (g1 > cap || g5 > cap) flags.push('earningsDcfRevenueCapped');
    g1 = Math.min(g1, cap);
    g5 = Math.min(g5, cap);
  }

  g1 = clamp(g1, EARNINGS_G1_MIN, EARNINGS_G1_MAX);
  g5 = clamp(g5, EARNINGS_G5_MIN, EARNINGS_G5_MAX);
  const gTerm = clamp(g5, EARNINGS_GTERM_MIN, EARNINGS_GTERM_MAX);

  // Sendero con desvanecimiento: año 2 a g1; año 3 a mitad de camino
  // hacia g5; año 4 a g5; año 5 a mitad de camino hacia el terminal.
  const e1 = args.epsYear1;
  const e2 = e1 * (1 + g1);
  const e3 = e2 * (1 + (g1 + (g5 - g1) * 0.5));
  const e4 = e3 * (1 + g5);
  const e5 = e4 * (1 + (g5 + (gTerm - g5) * 0.5));
  const epsPath = [e1, e2, e3, e4, e5];

  const r = EARNINGS_DCF_DISCOUNT_PCT / 100;
  let value = 0;
  for (let t = 0; t < 5; t++) {
    const flow = Math.max(epsPath[t], 0) * EARNINGS_CASH_CONVERSION;
    value += flow / Math.pow(1 + r, t + 1);
  }
  const terminal =
    (Math.max(e5, 0) * EARNINGS_CASH_CONVERSION * args.sectorMultiple) /
    Math.pow(1 + r, 5);
  value += terminal;
  if (epsPath.some((e) => e <= 0)) flags.push('earningsDcfPathNegative');

  return {
    value: value > 0 && Number.isFinite(value) ? value : null,
    epsPath,
    growthUsed: { g1, g5, gTerm },
    growthTier: tier,
    flags,
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
    } else if (
      fcfBase != null &&
      fcfBase > 0 &&
      (input.revenueGrowth ?? input.earningsGrowth ?? 0) > 0.15
    ) {
      // Regla de «emergente»: la mediana histórica ≤ 0 describe el pasado
      // de una empresa que ya genera caja hoy (TTM > 0) y crece fuerte
      // (ingresos > +15%): anular el DCF la dejaría valuada por un solo
      // componente. Se computa sobre la base TTM con flag y confianza
      // reducida. R0: más información, no menos. Si el TTM también es
      // ≤ 0 o no hay crecimiento que lo explique, sí es imposibilidad y
      // el componente queda null.
      // CASTIGO (pase correctivo RE, C): ese FCF TTM puede estar
      // inflado por prepagos de clientes mientras el capex explota —
      // es una foto, no una base normalizada. La base entra con haircut
      // de incertidumbre (×0,75, ver EMERGING_DCF_HAIRCUT) y su calidad
      // de ponderación baja al piso del sistema (0,30): se castiga el
      // componente, no se elimina.
      dcfBase = fcfBase * EMERGING_DCF_HAIRCUT;
      dcfBaseSource = 'ttmEmerging';
      fvFlags.push('ttmBaseEmerging');
    } else {
      dcfBase = null;
      dcfPreExcluded = { component: 'dcf', reason: 'medianFcfNonPositive', value: null };
    }
  }
  // Normalización cíclica de la base (R9): sin serie ≥3 años no hay
  // mediana que normalice, y la base TTM entra con haircut progresivo
  // según su yield (pico de ciclo ⇒ recorte hacia el yield de mitad de
  // ciclo). Con serie, la mediana ya hizo este trabajo y no se recorta
  // dos veces.
  if (
    fcfSeries.length < 3 &&
    dcfBase != null &&
    dcfBase > 0 &&
    fcfYieldPct != null &&
    fcfYieldPct > CYCLICAL_FCF_YIELD_TARGET_PCT
  ) {
    const factor = clamp(
      CYCLICAL_FCF_YIELD_TARGET_PCT / fcfYieldPct,
      CYCLICAL_FCF_HAIRCUT_FLOOR,
      1
    );
    if (factor < 1) {
      dcfBase = dcfBase * factor;
      fvFlags.push('cyclicalBaseHaircut');
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
      historicalAnchorValue: null,
      analystTarget: null,
      fvComponents: [],
      fvComponentWeights: [],
      multiplesValue: null,
      fvConfidence: null,
      fvRange: null,
      fvExcluded: [],
      fvWinsorized: [],
      fvProvenance: [],
      fvFlags: [],
      epsSignDisagreement: false,
      fvModelSuspect: false,
      fvSuspectDominant: null,
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

  // ANCLA HISTÓRICA (R10): el DCF de FCF reportado (2 etapas, 10 años,
  //  sobre la base normalizada) se sigue computando EXACTAMENTE igual,
  //  pero ya no es una pata del promedio: es la referencia «valor según
  //  historia reportada» — escenario pesimista y contrapeso — expuesta
  //  en la procedencia como componente 'anchor'. La arquitectura
  //  anterior lo distorsionaba todo ante cambios de paradigma (una
  //  empresa en inflexión quedaba condenada por su historia, y una en
  //  pico de ciclo, coronada por ella).
  let anchorValue: number | null = null;
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
      anchorValue = rawDcf;
    }
  }
  const anchorExcluded = dcfPreExcluded;

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
    // Tope sectorial (R9): prima sobre la referencia según el moat.
    moatPremium: moat === 'Wide' ? 1.5 : moat === 'Narrow' ? 1.25 : 1,
    industryForwardPe: input.industryForwardPe ?? null,
    forwardEpsTv: input.tvEpsForecastNextFy ?? null,
  });
  fvFlags.push(...mult.flags);

  // Pata 3 (R10): DCF corto sobre ganancias de consenso, con el mismo
  // EPS reparado y el mismo múltiplo sectorial de la pata 2. N/m solo
  // ante imposibilidad (R-C): EPS ≤ 0 o desacuerdo de signo irresoluble
  // entre fuentes — un sendero que arranca en break-even no proyecta.
  const revenueChecks: number[] = [];
  if (input.trendRevenueGrowth != null && Number.isFinite(input.trendRevenueGrowth)) {
    revenueChecks.push(input.trendRevenueGrowth);
  }
  if (
    input.tvRevenueForecastNextFy != null &&
    input.tvRevenueTtm != null &&
    input.tvRevenueTtm > 0
  ) {
    revenueChecks.push(input.tvRevenueForecastNextFy / input.tvRevenueTtm - 1);
  }
  const revenueGrowthCheck =
    revenueChecks.length > 0
      ? revenueChecks.reduce((a, b) => a + b, 0) / revenueChecks.length
      : null;
  let earningsDcf: EarningsDcfEvaluation | null = null;
  let earningsDcfExcluded: FvExcludedComponent | null = null;
  if (mult.epsUsed != null && mult.epsUsed > 0 && mult.multipleUsed != null) {
    if (mult.signDisagreement) {
      earningsDcfExcluded = {
        component: 'dcf',
        reason: 'epsSignDisagreement',
        value: null,
      };
      fvFlags.push('earningsDcfSignDisagreement');
    } else {
      earningsDcf = evaluateEarningsDcf({
        epsYear1: mult.epsUsed,
        growthNextYear:
          input.epsTrendGrowthNextYear ??
          (input.finvizEpsNextYearPct != null ? input.finvizEpsNextYearPct / 100 : null),
        growth5y:
          input.epsTrendGrowth5y ??
          (input.finvizEpsNext5YPct != null ? input.finvizEpsNext5YPct / 100 : null),
        growthFallback: input.earningsGrowth ?? input.revenueGrowth ?? null,
        revenueGrowthCheck,
        sectorMultiple: mult.multipleUsed,
      });
      fvFlags.push(...earningsDcf.flags);
      if (earningsDcf.value == null) {
        earningsDcfExcluded = {
          component: 'dcf',
          reason: 'earningsPathCollapsed',
          value: null,
        };
      }
    }
  } else {
    earningsDcfExcluded = { component: 'dcf', reason: 'notMeaningful', value: null };
  }
  const dcfValue = earningsDcf?.value ?? null;

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
  // Tercera fuente: TradingView (directiva del usuario 2026-11-03) —
  // un promedio más en la muestra, con independencia parcial.
  if (input.targetTvPrice != null && input.targetTvPrice > 0) {
    targetSources.push({ value: input.targetTvPrice, source: 'tradingviewTargetMean' });
  }
  let analystTarget =
    targetSources.length > 0 ? meanOf(targetSources.map((t) => t.value)) : null;
  // Ancla de consenso (R9): el componente vive SIEMPRE dentro del rango
  // publicado del consenso [low, high] — ningún promedio multifuente lo
  // deja por encima de la estimación más optimista de los analistas que
  // lo componen (a VIST el promedio multifuente lo había dejado en
  // 97,48 con máximo publicado de ~95, y la winsorización lo levantó
  // después hasta 124). Con dos proveedores que publican rango
  // (Yahoo y TradingView), el rango efectivo es la UNIÓN: el techo es
  // el máximo de los máximos y el piso el mínimo de los mínimos.
  const consensusHighs = [input.targetHighPrice, input.targetTvHigh].filter(
    (v): v is number => v != null && v > 0
  );
  const consensusLows = [input.targetLowPrice, input.targetTvLow].filter(
    (v): v is number => v != null && v > 0
  );
  const consensusHigh = consensusHighs.length > 0 ? Math.max(...consensusHighs) : null;
  const consensusLow = consensusLows.length > 0 ? Math.min(...consensusLows) : null;
  if (analystTarget != null) {
    let clampedTarget = analystTarget;
    if (consensusHigh != null) {
      clampedTarget = Math.min(clampedTarget, consensusHigh);
    }
    if (consensusLow != null) {
      clampedTarget = Math.max(clampedTarget, consensusLow);
    }
    if (clampedTarget !== analystTarget) {
      fvFlags.push('targetClampedToConsensus');
      analystTarget = clampedTarget;
    }
  }

  // Agregación por promedio winsorizado: lo extremo entra recortado al
  // borde de la banda, nunca se borra; con 1 componente el FV es ese
  // componente. El fallback precio × 1,05 no existe: el FV jamás se
  // fabrica desde el precio.
  // PONDERACIÓN (arquitectura simplificada R10, directiva del usuario
  // 2026-11-03): referencia central target ~45% / múltiplos ~30% /
  // DCF-sobre-ganancias ~25%, modulada por la calidad medible:
  //   target: ≥5 analistas y dispersión (high−low)/media ≤ 0,6 → 1,0
  //           (dispersión alta → 0,85); 3–4 analistas → 0,8;
  //           1–2 analistas o cobertura desconocida de fuente única →
  //           0,45 (nunca dominante); 2+ fuentes sin conteo → 0,8.
  //           Sigue siendo el mayor con cobertura razonable: es el
  //           promedio de muchas estimaciones independientes (ley de
  //           los grandes números).
  //   múltiplos: EPS directo de ≥2 proveedores → 0,67; de 1 → 0,55;
  //           solo derivado → 0,45.
  //   DCF-ganancias: crecimiento año +2 y a 5 años ambos de consenso
  //           → 0,56; uno por respaldo → 0,48; ninguno → 0,40.
  // La directiva intermedia «el DCF de historia pesa más que los
  // múltiplos como contrapeso» queda SUSTITUIDA por esta arquitectura:
  // el rol de contrapeso conservador lo cumple ahora el ANCLA
  // HISTÓRICA fuera del promedio (escenario pesimista), y dentro del
  // promedio manda el consenso hacia adelante.
  const earningsDcfQuality =
    earningsDcf == null
      ? 0.4
      : earningsDcf.growthTier === 'consensus'
        ? 0.56
        : earningsDcf.growthTier === 'partial'
          ? 0.48
          : 0.4;
  const multGroups = new Set(
    mult.provenance.sources.map((s) =>
      s.startsWith('finviz')
        ? 'finviz'
        : s.startsWith('yahoo')
          ? 'yahoo'
          : s.startsWith('tradingview')
            ? 'tradingview'
            : s.startsWith('edgar')
              ? 'filings'
              : 'fundamentals'
    )
  );
  const multDirectGroups = (['yahoo', 'finviz', 'tradingview'] as const).filter((g) =>
    multGroups.has(g)
  ).length;
  const multiplesQuality = multDirectGroups >= 2 ? 0.67 : multDirectGroups === 1 ? 0.55 : 0.45;
  const targetDispersion =
    analystTarget != null && analystTarget > 0 && consensusHigh != null && consensusLow != null
      ? (consensusHigh - consensusLow) / analystTarget
      : null;
  const analystCount = input.analystCount ?? null;
  const targetQuality =
    analystCount != null && analystCount >= 5
      ? targetDispersion != null && targetDispersion > 0.6
        ? 0.85
        : 1
      : analystCount != null && analystCount >= 3
        ? 0.8
        : analystCount != null && analystCount >= 1
          ? 0.45
          : targetSources.length >= 2
            ? 0.8
            : 0.45;

  const pool: FvComponentInput[] = [];
  if (dcfValue != null) pool.push({ key: 'dcf', value: dcfValue, quality: earningsDcfQuality });
  if (mult.value != null) pool.push({ key: 'multiples', value: mult.value, quality: multiplesQuality });
  if (analystTarget != null)
    pool.push({
      key: 'target',
      value: analystTarget,
      quality: targetQuality,
      // Techo duro: ni la winsorización lo levanta sobre el máximo del
      // consenso (R9; con dos proveedores, la unión de rangos).
      clipCeiling: consensusHigh ?? undefined,
    });
  const agg = aggregateFairValue(pool, {
    currentPrice,
    flags: fvFlags,
    excluded: [earningsDcfExcluded, mult.excluded].filter(
      (x): x is FvExcludedComponent => x != null
    ),
  });

  const fvProvenance: FvProvenance[] = [
    {
      // Pata 3 (R10): DCF corto sobre ganancias — la «base» trazable es
      // el EPS de consenso del año 1 y el valor usado, el de la pata.
      component: 'dcf',
      originalValue: mult.provenance.usedEps,
      usedValue: dcfValue,
      sources: earningsDcf != null ? ['consensusEpsPath'] : [],
      flags:
        earningsDcf != null
          ? earningsDcf.flags
          : [earningsDcfExcluded?.reason ?? 'notMeaningful'],
    },
    {
      // Ancla histórica (R10): DCF de FCF reportado, fuera del
      // promedio. Su procedencia conserva la base y los flags de
      // siempre (mediana, valle, emergente, filings).
      component: 'anchor',
      originalValue: fcfBase,
      usedValue: dcfBase,
      sources: dcfBase != null ? [dcfBaseSource] : [],
      flags: [
        ...(fvFlags.includes('normalizedBase') ? ['normalizedBase'] : []),
        ...(troughAdjusted ? ['troughAdjusted'] : []),
        ...(dcfBaseSource === 'edgarAnnualCashflow' ? ['derivedFromFilings'] : []),
        ...(dcfBaseSource === 'ttmEmerging' ? ['ttmBaseEmerging'] : []),
        ...(anchorExcluded?.reason === 'medianFcfNonPositive'
          ? ['medianFcfNonPositive']
          : []),
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
      flags: fvFlags.includes('targetClampedToConsensus') ? ['targetClampedToConsensus'] : [],
    },
  ];
  // Tripwire: la procedencia deja constancia de qué componente domina
  // la desviación cuando el modelo se marca sospechoso (R9).
  if (agg.modelSuspectDominant != null) {
    const dominantProv = fvProvenance.find((p) => p.component === agg.modelSuspectDominant);
    if (dominantProv && !dominantProv.flags.includes('dominantDeviation')) {
      dominantProv.flags.push('dominantDeviation');
    }
  }

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
    historicalAnchorValue: anchorValue,
    analystTarget,
    fvComponents: agg.components.map((c) => c.value),
    fvComponentWeights: agg.weights,
    multiplesValue: mult.value,
    fvConfidence: agg.confidence,
    fvRange: agg.range,
    fvExcluded: agg.excluded,
    fvWinsorized: agg.winsorized,
    fvProvenance,
    fvFlags: agg.flags,
    epsSignDisagreement: mult.signDisagreement,
    fvModelSuspect: agg.modelSuspectDominant != null,
    fvSuspectDominant: agg.modelSuspectDominant,
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
