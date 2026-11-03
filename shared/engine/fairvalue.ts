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
  /** ROIC % de la empresa (Finviz, retorno sobre el capital
   *  invertido): insumo del múltiplo justificado (R11) y del ancla de
   *  crecimiento sustentable. Sin él, la fórmula usa el ROE. */
  roicPct?: number | null;
  /** ROIC mediano % de la industria (mediana de los pares grandes de
   *  Finviz, misma fuente que la empresa): lado sectorial de la
   *  fórmula del múltiplo justificado (R11). */
  sectorRoicPct?: number | null;
  /** Crecimiento de EPS a 5 años mediano % de la industria (pares de
   *  Finviz): lado sectorial de la fórmula del múltiplo justificado
   *  (R11). */
  sectorGrowth5yPct?: number | null;
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
  /** FCF TTM tal cual lo sirve el proveedor, ANTES de la reparación
   *  de la capa de datos que completa un TTM faltante/negativo con el
   *  flujo anual auditado (esa reparación sirve al ancla histórica,
   *  pero pisaría el dato que el ANCLA DE CAJA REAL del optimizador
   *  necesita: el signo del TTM reportado, R12). Solo lo lee el
   *  optimizador; el motor de FV no lo usa. */
  freeCashflowTtmRaw?: number | null;
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
  /** Piso duro del valor final del componente tras la winsorización:
   *  para el target es el mínimo del consenso de analistas — la
   *  winsorización tampoco puede arrastrarlo POR DEBAJO de la
   *  estimación más pesimista que lo compone (R11: el target entra
   *  siempre dentro de su rango publicado [low, high]; el caso NBIS
   *  de la fase 3, recortado de 283,86 a 86,64 por dos patas deprimidas,
   *  es el defecto que esto cierra). */
  clipFloor?: number;
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

/* ------------------------------------------------------------------ *
 * MÚLTIPLO JUSTIFICADO (R11, docs/VALUATION-RULES.md).
 *
 * La pata de múltiplos ya no usa una tabla por «moat» ni un tope con el
 * P/E propio: usa el múltiplo que los fundamentos justifican, con la
 * fórmula clásica de Damodaran para el P/E justificado (leading):
 *
 *     P/E justificado = payout / (ke − g),   con payout = 1 − g/R
 *
 * donde R es el retorno sobre el capital (ROIC; si falta, ROE), g el
 * crecimiento de largo plazo y ke el costo del capital. La fórmula se
 * evalúa DOS veces con la misma tasa: para la empresa y para su
 * sector (medianas de la industria). El múltiplo aplicado es el P/E
 * forward que el mercado paga por el sector, ajustado por el cociente
 * de ambos justificados:
 *
 *     M = P/E del sector × clamp(J_empresa / J_sector, 0,6 – 1,6)
 *
 * Así, lo que el sector vale lo pone el mercado (con su ciclo y su
 * riesgo adentro), y la empresa se mueve dentro de una banda según
 * rinda y crezca más o menos que su sector. El crecimiento que entra
 * a la fórmula es el de ESTADO ESTACIONARIO: se acota a +5% — una
 * perpetuidad no crece por encima de la economía nominal de largo
 * plazo (disciplina estándar de Damodaran para el crecimiento
 * terminal) — y eso además mantiene la fórmula bien comportada
 * cuando g se acerca a ke. El crecimiento cercano de cada empresa
 * vive en la pata de DCF y en el target, no en este múltiplo.
 *
 * Escalera de respaldo (documentada, sin excepciones por activo):
 *  1. sector + ambos justificados ⇒ sector × ajuste (arriba);
 *  2. sector sin ajuste computable ⇒ P/E del sector, pelado;
 *  3. sin sector, justificado propio computable ⇒ ese justificado,
 *     acotado a [3, 45] como anti-basura numérica;
 *  4. sin sector ni fundamentos ⇒ el P/E forward recomputado del
 *     propio activo (el veredicto actual del mercado; la pata aporta
 *     poca información y la confianza lo refleja);
 *  5. último recurso histórico: la tabla por moat.
 * ------------------------------------------------------------------ */

/** Tasa de descuento única de la fórmula justificada (%): la misma
 *  del DCF corto sobre ganancias — una sola tasa para todo el motor,
 *  decisión de diseño por simplicidad (R10/R11). */
export const JUSTIFIED_DISCOUNT_PCT = 10;
/** Crecimiento máximo (%) que admite la fórmula del múltiplo
 *  justificado: es un objeto de estado estacionario, y ninguna
 *  perpetuidad crece por encima de ~5% nominal de largo plazo. */
export const JUSTIFIED_STEADY_GROWTH_CAP_PCT = 5;
/** Banda del ajuste relativo empresa/sector: anti-extremos numérico,
 *  simétrica en espíritu; ningún fundamento sostiene pagar más de
 *  ~1,6× el múltiplo del sector ni menos de 0,6× por esta vía. */
/** Factor máximo de divergencia entre el P/E del sector y el P/E
 *  forward propio para que el sector se considere un conjunto
 *  comparable (R11): si difieren en más de este factor, la fórmula
 *  cae al justificado por fundamentos propios. Decisión de diseño
 *  simple (anti-basura), de un solo lado: solo descarta al sector
 *  cuando su múltiplo más que duplica al propio. */
export const JUSTIFIED_SECTOR_COMPARABILITY_MAX = 2;
export const JUSTIFIED_ADJUSTMENT_MIN = 0.6;
export const JUSTIFIED_ADJUSTMENT_MAX = 1.6;
/** Banda anti-basura del justificado absoluto (escalón 3). */
export const JUSTIFIED_ABSOLUTE_MIN = 3;
export const JUSTIFIED_ABSOLUTE_MAX = 45;

/** Régimen de crecimiento (R11): si las ventas de consenso crecen más
 *  de +12,5% anual, la empresa es «en crecimiento» y su ancla de largo
 *  plazo son las ventas; si no, es «madura» y manda el crecimiento
 *  sustentable. Son los MISMOS umbral y margen que usa Grinold-Kroner
 *  en el Optimizador (GROWTH_REGIME_SALES_PCT /
 *  GROWTH_LEVERAGE_SLACK_PP): un solo criterio para todo el sistema. */
export const FV_GROWTH_REGIME_SALES_PCT = 12.5;
export const FV_GROWTH_LEVERAGE_SLACK_PP = 10;

/** P/E justificado (leading) desde fundamentos: (1 − g/R) / (ke − g).
 *  Devuelve null cuando la fórmula no aplica: sin retorno sobre el
 *  capital, retorno ≤ crecimiento (payout ≤ 0: la empresa necesitaría
 *  más capital del que gana para crecer a esa tasa) o g ≥ ke. Las
 *  entradas van en % (ROIC 25 = 25%). */
export function justifiedPeFromFundamentals(
  capitalReturnPct: number | null | undefined,
  growthPct: number | null | undefined,
  discountPct: number = JUSTIFIED_DISCOUNT_PCT
): number | null {
  if (capitalReturnPct == null || !(capitalReturnPct > 0) || !(discountPct > 0)) {
    return null;
  }
  const g = clamp(growthPct ?? 0, 0, JUSTIFIED_STEADY_GROWTH_CAP_PCT) / 100;
  const r = capitalReturnPct / 100;
  const ke = discountPct / 100;
  if (r <= g || ke <= g) return null;
  const payout = 1 - g / r;
  if (!(payout > 0)) return null;
  const pe = payout / (ke - g);
  return Number.isFinite(pe) && pe > 0 ? pe : null;
}

export type JustifiedMultipleBasis =
  | 'sectorAjustado'
  | 'sector'
  | 'fundamental'
  | 'propio'
  | 'tabla';

export interface JustifiedMultipleResult {
  multiple: number | null;
  basis: JustifiedMultipleBasis | null;
  /** Justificado de la empresa y del sector (mismo fórmula y tasa). */
  companyJustified: number | null;
  sectorJustified: number | null;
  /** Cociente acotado efectivamente aplicado sobre el P/E sectorial. */
  adjustment: number | null;
  /** Referencia sectorial usada (P/E forward de la industria). */
  sectorPe: number | null;
  /** false cuando el sector se descartó por no comparable (su P/E
   *  difiere del propio en más del factor de comparabilidad). */
  sectorComparable: boolean;
}

/** Múltiplo justificado de la pata de múltiplos (R11): ver la
 *  escalera documentada arriba. Nunca lanza; devuelve null solo si
 *  no hay NINGUNA referencia (ni sector, ni fundamentos, ni precio). */
export function justifiedMultiple(args: {
  /** P/E forward de la industria (mediana de pares), si se conoce. */
  sectorForwardPe?: number | null;
  /** Retorno sobre el capital de la empresa (ROIC %; respaldo: ROE %). */
  capitalReturnPct?: number | null;
  /** Crecimiento de largo plazo de la empresa, ya anclado (%). */
  longRunGrowthPct?: number | null;
  /** Retorno sobre el capital mediano del sector (ROIC %). */
  sectorCapitalReturnPct?: number | null;
  /** Crecimiento de largo plazo mediano del sector (%). */
  sectorLongRunGrowthPct?: number | null;
  /** P/E forward recomputado del propio activo (respaldo). */
  ownForwardPe?: number | null;
  /** Tabla histórica por moat (último recurso). */
  tableMultiple?: number | null;
}): JustifiedMultipleResult {
  const sectorPe =
    args.sectorForwardPe != null && args.sectorForwardPe > 0
      ? args.sectorForwardPe
      : null;
  const companyJustified = justifiedPeFromFundamentals(
    args.capitalReturnPct,
    args.longRunGrowthPct
  );
  const sectorJustified = justifiedPeFromFundamentals(
    args.sectorCapitalReturnPct,
    args.sectorLongRunGrowthPct
  );
  // Regla de comparabilidad del conjunto de pares (R11): si el P/E
  // del sector más que DUPLICA al P/E forward propio, importar ese
  // múltiplo inflaría la fórmula con un régimen ajeno al activo (una
  // memoria que cotiza a 4× dentro de un sector amplio a 21×; una
  // madura a 21× dentro de una industria de software a 52×) — es un
  // dato, no un juicio — y la fórmula cae al múltiplo justificado
  // por los fundamentos propios. La regla es de un solo lado a
  // propósito: cuando el sector es MÁS BARATO que el activo, su
  // múltiplo entra igual — es la referencia conservadora estándar
  // de la valuación relativa, y la brecha es información, no error.
  const sectorComparable =
    sectorPe == null ||
    args.ownForwardPe == null ||
    !(args.ownForwardPe > 0) ||
    sectorPe <= JUSTIFIED_SECTOR_COMPARABILITY_MAX * args.ownForwardPe;
  const out: JustifiedMultipleResult = {
    multiple: null,
    basis: null,
    companyJustified,
    sectorJustified,
    adjustment: null,
    sectorPe,
    sectorComparable,
  };
  if (sectorPe != null && sectorComparable && companyJustified != null && sectorJustified != null) {
    out.adjustment = clamp(
      companyJustified / sectorJustified,
      JUSTIFIED_ADJUSTMENT_MIN,
      JUSTIFIED_ADJUSTMENT_MAX
    );
    out.multiple = sectorPe * out.adjustment;
    out.basis = 'sectorAjustado';
    return out;
  }
  if (sectorPe != null && sectorComparable) {
    out.multiple = sectorPe;
    out.basis = 'sector';
    return out;
  }
  if (companyJustified != null) {
    out.multiple = clamp(companyJustified, JUSTIFIED_ABSOLUTE_MIN, JUSTIFIED_ABSOLUTE_MAX);
    out.basis = 'fundamental';
    return out;
  }
  if (args.ownForwardPe != null && args.ownForwardPe > 0) {
    out.multiple = args.ownForwardPe;
    out.basis = 'propio';
    return out;
  }
  if (args.tableMultiple != null && args.tableMultiple > 0) {
    out.multiple = args.tableMultiple;
    out.basis = 'tabla';
    return out;
  }
  return out;
}

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
    // Exención del target (método elegido, 2026-11-03): el componente
    // que trae ancla propia de consenso (clipFloor/clipCeiling) NUNCA
    // es recortado por la banda entre patas — entra en su rango real
    // [low, high], jamás arrastrado por la otra estimación (era el
    // defecto que en fase 3 hundió el target de NBIS y que aquí volvía
    // a aparecer contra MELI). La banda anti-basura sigue aplicando a
    // la pata de fórmula, usando al target como referencia.
    let clipped =
      c.clipCeiling != null || c.clipFloor != null
        ? c.value
        : clamp(c.value, ref * FV_BAND_LOW, ref * FV_BAND_HIGH);
    // Techo duro del componente (target: máximo del consenso): la
    // winsorización jamás lo levanta por encima de su propio ancla.
    if (c.clipCeiling != null && c.clipCeiling > 0) {
      clipped = Math.min(clipped, c.clipCeiling);
    }
    // Piso duro del componente (target: mínimo del consenso, R11): la
    // winsorización tampoco lo arrastra por debajo de su propio ancla.
    if (c.clipFloor != null && c.clipFloor > 0) {
      clipped = Math.max(clipped, c.clipFloor);
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
  /** Componente de múltiplos (EPS reparado × múltiplo justificado
   *  R11), o null solo ante imposibilidad matemática (EPS ≤ 0 o
   *  inexistente). */
  value: number | null;
  epsUsed: number | null;
  /** Múltiplo efectivamente aplicado (el justificado, R11) y la
   *  referencia sectorial usada, para trazabilidad. */
  multipleUsed: number | null;
  multipleCap: number | null;
  /** Cómo se obtuvo el múltiplo (escalera R11) y el despiece de la
   *  fórmula justificada, para trazabilidad. */
  multipleBasis: JustifiedMultipleBasis | null;
  justifiedCompany: number | null;
  justifiedSector: number | null;
  multipleAdjustment: number | null;
  flags: string[];
  excluded: FvExcludedComponent | null;
  /** Las fuentes DIRECTAS del EPS forward discrepan en el signo en el
   *  mismo refresco (consenso ≈ break-even: un input cara o cruz). Es
   *  un dato de trazabilidad: desde R11 no castiga ninguna pata ni
   *  ningún número — la cadena de reparación ya resolvió el EPS, y si
   *  el consenso está partido, eso es un hecho del consenso. */
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
  /** Tabla histórica por moat: ÚLTIMO recurso del múltiplo (R11). */
  moatMultiple: number;
  /** P/E forward de la industria/pares si se conoce: base del
   *  múltiplo justificado (R11). */
  industryForwardPe?: number | null;
  /** Retorno sobre el capital de la empresa en % (ROIC; respaldo
   *  ROE): lado empresa de la fórmula justificada (R11). */
  capitalReturnPct?: number | null;
  /** Crecimiento de largo plazo de la empresa en %, ya anclado por
   *  régimen (ventas / sustentable): lado empresa de la fórmula. */
  longRunGrowthPct?: number | null;
  /** Retorno sobre el capital mediano del sector en % (ROIC). */
  sectorCapitalReturnPct?: number | null;
  /** Crecimiento de largo plazo mediano del sector en %. */
  sectorLongRunGrowthPct?: number | null;
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
  // trazabilidad y como campo propio; desde R11 no altera ningún
  // número (ni la valuación pública ni la capa de RE): es un hecho
  // del consenso, visible en la procedencia.
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
      multipleBasis: null,
      justifiedCompany: null,
      justifiedSector: null,
      multipleAdjustment: null,
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
      multipleBasis: null,
      justifiedCompany: null,
      justifiedSector: null,
      multipleAdjustment: null,
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

  // MÚLTIPLO JUSTIFICADO (R11): reemplaza al tope sectorial de R9 y a
  // la tabla por moat como mecanismo principal. El múltiplo sale de
  // los fundamentos hacia adelante (ver justifiedMultiple): el P/E
  // que el mercado paga por el sector, ajustado por cuánto más (o
  // menos) rinde y crece esta empresa que su sector según la fórmula
  // del P/E justificado de Damodaran. Sin historia sobre el ciclo,
  // sin primas narrativas: si el consenso forward está mal, es
  // problema del consenso, no de una corrección del modelo.
  const ownPe = price > 0 ? price / epsUsed : null;
  const jm = justifiedMultiple({
    sectorForwardPe: args.industryForwardPe ?? null,
    capitalReturnPct: args.capitalReturnPct ?? null,
    longRunGrowthPct: args.longRunGrowthPct ?? null,
    sectorCapitalReturnPct: args.sectorCapitalReturnPct ?? null,
    sectorLongRunGrowthPct: args.sectorLongRunGrowthPct ?? null,
    ownForwardPe: ownPe,
    tableMultiple: args.moatMultiple,
  });
  const multipleUsed = jm.multiple ?? args.moatMultiple;
  if (jm.basis != null) flags.push(`multipleBasis:${jm.basis}`);
  if (!jm.sectorComparable && jm.sectorPe != null) flags.push('sectorNotComparable');

  return {
    value: epsUsed * multipleUsed,
    epsUsed,
    multipleUsed,
    multipleCap: jm.sectorPe,
    multipleBasis: jm.basis,
    justifiedCompany: jm.companyJustified,
    justifiedSector: jm.sectorJustified,
    multipleAdjustment: jm.adjustment,
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
/** Bandas mecánicas del crecimiento de la pata de ganancias: el año
 *  +2 se acota a [−30%, +100%] — solo anti-basura numérica (R11: sin
 *  topes-opinión sobre las estimaciones; el ancla de régimen y el
 *  chequeo de ventas son los frenos con fundamento) —; el de largo
 *  plazo a [−10%, +35%] y el terminal a [−5%, +6%], bandas de estado
 *  estacionario de la práctica estándar (ninguna empresa sostiene
 *  >35% de CAGR de ganancias una década, y el crecimiento terminal
 *  vive cerca del crecimiento nominal de la economía). */
export const EARNINGS_G1_MIN = -0.3;
export const EARNINGS_G1_MAX = 1.0;
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
  /** Ancla de largo plazo por régimen (R11, decimal): techo del g5 —
   *  en crecimiento, las ventas de consenso + apalancamiento; en
   *  maduras, el crecimiento sustentable ROIC × reinversión. Es la
   *  MISMA ancla que usa Grinold-Kroner en el Optimizador: un solo
   *  criterio de cordura para todo el sistema. */
  growthAnchor?: number | null;
  /** Múltiplo justificado (R11): el MISMO de la pata de múltiplos,
   *  sin prima extra — el crecimiento se cuenta una sola vez. */
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

  // Ancla de largo plazo por régimen (R11): el g5 — la tasa a la que
  // el sendero se desvanece — no supera lo que el negocio puede
  // sostener: sus ventas (crecimiento) o su ROIC × reinversión
  // (madura). Solo acota el LARGO plazo; el año +2 entra a valor
  // facial del consenso.
  const anchor = fromPct(args.growthAnchor);
  if (anchor != null && g5 > anchor) {
    flags.push('earningsDcfGrowthAnchored');
    g5 = anchor;
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

/** Medidor de expectativas (R12, agregado del usuario 2026-11-03):
 *  el par PER actual vs PER futuro, SIEMPRE recomputado desde
 *  primitivas (precio ÷ EPS), nunca tomado del P/E publicado por
 *  el proveedor. Es una capa de INFORMACIÓN visible: no alimenta
 *  ningún cálculo (ni FV, ni RE, ni score) — como el PEG
 *  orientador, existe para que el usuario vea cuánto futuro ya
 *  está pagando el precio. */
export interface PePairInfo {
  /** Precio ÷ EPS trailing reportado (TTM). null si el EPS ≤ 0 o no hay dato. */
  trailingPe: number | null;
  /** Precio ÷ EPS forward de consenso (el que usa la pata de
   *  fórmula del FV). null si el EPS ≤ 0 o no hay dato. */
  forwardPe: number | null;
  epsTrailing: number | null;
  epsForward: number | null;
  /** EPS trailing ≤ 0: con lo reportado, la empresa todavía no gana plata. */
  noEarningsYet: boolean;
  /** Brecha extrema: el PER futuro es menos del 40% del actual y
   *  el actual supera 15× — el precio ya paga un salto de
   *  ganancias que la empresa todavía tiene que ejecutar. */
  extremeGap: boolean;
}

/** Umbral de brecha extrema del medidor (decisión de diseño simple,
 *  ejemplo del usuario adoptado tal cual): forward < 40% del
 *  trailing, con trailing > 15×. */
export const PE_GAP_RATIO = 0.4;
export const PE_GAP_MIN_TRAILING = 15;

export function pePairFor(input: {
  price: number;
  epsTrailing?: number | null;
  epsForward?: number | null;
}): PePairInfo {
  const price = input.price;
  const epsT = input.epsTrailing ?? null;
  const epsF = input.epsForward ?? null;
  const trailingPe = price > 0 && epsT != null && epsT > 0 ? price / epsT : null;
  const forwardPe = price > 0 && epsF != null && epsF > 0 ? price / epsF : null;
  const extremeGap =
    trailingPe != null &&
    forwardPe != null &&
    trailingPe > PE_GAP_MIN_TRAILING &&
    forwardPe < PE_GAP_RATIO * trailingPe;
  return {
    trailingPe,
    forwardPe,
    epsTrailing: epsT,
    epsForward: epsF,
    noEarningsYet: epsT != null && epsT <= 0,
    extremeGap,
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

  // Base del ANCLA HISTÓRICA (desde R10 es solo una referencia
  // informativa, fuera del promedio): regla única y simple (R11) —
  // con ≥3 años de FCF anual reportado, la base es la MEDIANA de los
  // últimos 3–5 años (la mediana es higiene de datos estándar: ni un
  // año valle ni un año pico); si la mediana no es positiva o no hay
  // serie, la base es el FCF TTM tal cual viene; si tampoco hay TTM
  // positivo, no hay ancla. Sin haircuts ni castigos: el ancla es un
  // número de referencia, no una pata, y no deforma nada. El
  // fcfYieldPct de arriba sigue siendo la foto TTM.
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
    } else if (fcfBase != null && fcfBase > 0) {
      // Mediana histórica ≤ 0 pero la empresa genera caja hoy: el
      // ancla usa el TTM, sin castigo (la vieja «regla de emergente»
      // con haircut ×0,75 salió en R11: el ancla no deforma patas).
      dcfBase = fcfBase;
      dcfBaseSource = 'ttm';
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

  // ANCLA HISTÓRICA (R10, base simplificada en R11): el DCF de FCF
  //  reportado (2 etapas, 10 años, sobre la base mediana/TTM sin
  //  haircuts) no es una pata del promedio: es la referencia «valor
  //  según historia reportada» — escenario pesimista y contrapeso —
  //  expuesta en la procedencia como componente 'anchor'. La
  //  arquitectura anterior lo distorsionaba todo ante cambios de
  //  paradigma (una empresa en inflexión quedaba condenada por su
  //  historia, y una en pico de ciclo, coronada por ella).
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

  // Crecimiento de INGRESOS de consenso (hacia adelante): promedio de
  // las fuentes que lo estiman (tendencia de Yahoo; TradingView contra
  // su propio TTM). Alimenta el chequeo de la pata 3 y el ancla de
  // régimen de abajo.
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

  // ANCLA DE CRECIMIENTO DE LARGO PLAZO POR RÉGIMEN (R11): la misma
  // regla que usa Grinold-Kroner en el Optimizador, con los insumos
  // hacia adelante que esta capa conoce:
  //  - Empresa en crecimiento (ventas de consenso creciendo más de
  //    +12,5%): el techo del crecimiento de ganancias de largo plazo
  //    es ventas + 10 pp de apalancamiento operativo.
  //  - Empresa madura: el techo es su crecimiento sustentable,
  //    g = ROIC × tasa de reinversión, con la reinversión calculada de
  //    los reportados de EDGAR ((capex − depreciación) / ingreso
  //    neto del último año fiscal, acotada a [0%, 90%]).
  // El ancla es TECHO, nunca piso: si el consenso a 5 años implica
  // menos, manda el consenso. El retorno sobre el capital es el ROIC
  // real (Finviz) y, si falta, el ROE — nunca un proxy narrativo.
  const capitalReturnPct = input.roicPct ?? roePct;
  const niLatest = input.netIncomeHistory?.[0] ?? null;
  const daLatest = input.depreciationHistory?.[0] ?? null;
  const cxLatest = input.capexHistory?.[0] ?? null;
  const reinvestmentRatePct =
    niLatest != null && niLatest > 0 && daLatest != null && cxLatest != null
      ? clamp(((cxLatest - daLatest) / niLatest) * 100, 0, 90)
      : null;
  const forwardSalesPct = revenueGrowthCheck != null ? revenueGrowthCheck * 100 : null;
  let growthAnchorPct: number | null = null;
  if (forwardSalesPct != null && forwardSalesPct > FV_GROWTH_REGIME_SALES_PCT) {
    growthAnchorPct = forwardSalesPct + FV_GROWTH_LEVERAGE_SLACK_PP;
  } else if (capitalReturnPct != null && reinvestmentRatePct != null) {
    growthAnchorPct = (capitalReturnPct * reinvestmentRatePct) / 100;
  }
  // Crecimiento de largo plazo usado por el sistema: el consenso a 5
  // años, acotado por el ancla si la hay; sin consenso, el ancla sola.
  const consensusG5Pct =
    input.epsTrendGrowth5y != null
      ? input.epsTrendGrowth5y * 100
      : input.finvizEpsNext5YPct ?? null;
  const longRunGrowthPct =
    consensusG5Pct != null
      ? growthAnchorPct != null
        ? Math.min(consensusG5Pct, growthAnchorPct)
        : consensusG5Pct
      : growthAnchorPct;
  // La g de la FÓRMULA del múltiplo justificado es el crecimiento del
  // consenso a 5 años, sin el ancla por régimen: la fórmula ya lo
  // acota a su techo de estado estable (5%), y el ancla madura
  // (ROIC × reinversión con reinversión = (capex − depreciación) /
  // ingreso neto) subestima sistemáticamente la reinversión de las
  // empresas livianas en activos, cuyo gasto real de crecimiento es
  // el I+D que va por resultados (Damodaran: hay que capitalizar el
  // I+D para medir esa reinversión; sin ese ajuste, el ancla aplasta
  // la g de un AAPL a ~0,7% y deprime su múltiplo sin fundamento en
  // los datos forward). El ancla por régimen sigue gobernando el
  // crecimiento de Grinold-Kroner en el Optimizador y queda como
  // respaldo de la fórmula cuando no hay consenso a 5 años.
  const multipleGrowthPct = consensusG5Pct ?? growthAnchorPct;

  // Componente de múltiplos: EPS forward reparado entre fuentes ×
  // múltiplo JUSTIFICADO (R11). El P/E publicado jamás entra como
  // input directo; la tabla por moat queda como último recurso.
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
    industryForwardPe: input.industryForwardPe ?? null,
    capitalReturnPct,
    longRunGrowthPct: multipleGrowthPct,
    sectorCapitalReturnPct: input.sectorRoicPct ?? null,
    sectorLongRunGrowthPct: input.sectorGrowth5yPct ?? null,
    forwardEpsTv: input.tvEpsForecastNextFy ?? null,
  });
  fvFlags.push(...mult.flags);

  // MÉTODO ELEGIDO (decisión del usuario, 2026-11-03 04:40): el FV es
  // el promedio de DOS estimaciones independientes, ambas hacia
  // adelante — el target de consenso y la fórmula (EPS forward ×
  // múltiplo justificado). El DCF sobre ganancias SALE del promedio:
  // era la pata que contaba el crecimiento dos veces (crecía el EPS
  // por 5 años Y aplicaba múltiplo terminal con prima). La función
  // evaluateEarningsDcf se conserva como utilidad documentada (sus
  // tests fijan su matemática), pero ya no alimenta el FV.
  const earningsDcfExcluded: FvExcludedComponent = {
    component: 'dcf',
    reason: 'retiredFromAverage',
    value: null,
  };
  const dcfValue: number | null = null;

  // PEG — ORIENTADOR, NUNCA VALUADOR (directiva textual del usuario:
  // «el PEG orienta, no sirve para valuar en sí»). Se calculan el PEG
  // al precio actual (P/E forward recomputado ÷ crecimiento de largo
  // plazo del consenso), el PEG implícito de la fórmula (múltiplo
  // justificado ÷ el mismo crecimiento) y el PEG del sector (P/E del
  // sector ÷ crecimiento del sector). Un PEG de fórmula disparado
  // contra el sector (>2× o <0,5×) marca la estimación para REVISIÓN
  // DE DATOS con un flag: no ajusta ningún número por sí solo
  // (Easton 2004: el PEG es una heurística sesgada, útil para mirar,
  // no para construir valor).
  const pegGrowthPct = multipleGrowthPct;
  const ownForwardPeUsed =
    mult.epsUsed != null && mult.epsUsed > 0 ? currentPrice / mult.epsUsed : null;
  const pegAtPrice =
    ownForwardPeUsed != null && pegGrowthPct != null && pegGrowthPct > 0
      ? Math.round((ownForwardPeUsed / pegGrowthPct) * 100) / 100
      : null;
  const pegFormula =
    mult.multipleUsed != null && pegGrowthPct != null && pegGrowthPct > 0
      ? Math.round((mult.multipleUsed / pegGrowthPct) * 100) / 100
      : null;
  const pegSector =
    input.industryForwardPe != null &&
    input.industryForwardPe > 0 &&
    input.sectorGrowth5yPct != null &&
    input.sectorGrowth5yPct > 0
      ? Math.round((input.industryForwardPe / input.sectorGrowth5yPct) * 100) / 100
      : null;
  if (
    pegFormula != null &&
    pegSector != null &&
    pegSector > 0 &&
    (pegFormula > 2 * pegSector || pegFormula < 0.5 * pegSector)
  ) {
    fvFlags.push('pegFormulaOutlierVsSector');
  }

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
  // PONDERACIÓN (método elegido, 2026-11-03 04:40): DOS estimaciones
  // en pie de igualdad — target y fórmula 50/50 cuando ambas descansan
  // en datos firmes — moduladas por la calidad medible de cada una:
  //   target: ≥5 analistas y dispersión (high−low)/media ≤ 0,6 → 1,0
  //           (dispersión alta → 0,85); 3–4 analistas → 0,8;
  //           1–2 analistas o cobertura desconocida de fuente única →
  //           0,45; 2+ fuentes sin conteo → 0,8.
  //   fórmula: factor EPS (≥2 proveedores directos → 1,0; 1 → 0,75;
  //           solo derivado → 0,55) × firmeza del múltiplo (sector
  //           ajustado por la fórmula justificada → 1,0; sector pelado
  //           → 0,85; justificado sin sector → 0,7; P/E propio → 0,55;
  //           tabla heredada → 0,45). Si la fórmula depende de datos
  //           débiles (pocas fuentes de EPS o ROIC no computable, que
  //           impide el ajuste), su peso baja y el target manda.
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
  const multEpsFactor = multDirectGroups >= 2 ? 1 : multDirectGroups === 1 ? 0.75 : 0.55;
  const multBasisFirmness =
    mult.multipleBasis === 'sectorAjustado'
      ? 1
      : mult.multipleBasis === 'sector'
        ? 0.85
        : mult.multipleBasis === 'fundamental'
          ? 0.7
          : mult.multipleBasis === 'propio'
            ? 0.55
            : 0.45;
  const multiplesQuality = clamp(multEpsFactor * multBasisFirmness, 0.3, 1);
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
  if (mult.value != null) pool.push({ key: 'multiples', value: mult.value, quality: multiplesQuality });
  if (analystTarget != null)
    pool.push({
      key: 'target',
      value: analystTarget,
      quality: targetQuality,
      // Techo y piso duros (R9 + R11): la winsorización no lo mueve
      // fuera del rango publicado del consenso [low, high] en ninguna
      // dirección (con dos proveedores, la unión de rangos).
      clipCeiling: consensusHigh ?? undefined,
      clipFloor: consensusLow ?? undefined,
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
      // DCF sobre ganancias: RETIRADO del promedio por el método
      // elegido (2026-11-03 04:40) — contaba el crecimiento dos veces.
      // La entrada queda en la procedencia como registro histórico.
      component: 'dcf',
      originalValue: mult.provenance.usedEps,
      usedValue: null,
      sources: [],
      flags: ['retiredFromAverage'],
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
        ...(dcfBaseSource === 'ttm' && fcfSeries.length >= 3 ? ['anchorTtmBase'] : []),
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
    pegAtPrice,
    pegFormula,
    pegSector,
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
