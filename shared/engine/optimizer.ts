/**
 * Optimizador de cartera — motor puro (SPEC-004).
 *
 * Núcleo: Retorno Esperado anual (RE) por activo por triangulación de métodos
 * (lo que recomiendan las fuentes de Capital Market Expectations relevadas por
 * el usuario: Gemini «Métodos para proyectar valor de portafolios» y NotebookLM
 * «Optimización de Portafolios de Inversión»):
 *   1. Grinold-Kroner por activo (45%): dividend yield − ΔS (buyback yield)
 *      + crecimiento de ganancias TOTALES (no EPS: si se suma el buyback, usar
 *      EPS contaría la recompra dos veces) + repricing del múltiplo hacia la
 *      mediana de la industria.
 *   2. Convergencia al Fair Value propio (35%): CAGR hasta el FV base en el
 *      horizonte de corrección, con el motor fairvalue.ts existente.
 *   3. Consenso de analistas a 1 año (20%): upside al target promedio, acotado.
 * Pesos renormalizados si falta un componente; jamás se rellena un dato.
 *
 * De RE salen: años para duplicar = ln2/ln(1+RE) y el Score de inversión
 * 0–100. El score lo DOMINA la capacidad de duplicar (directiva del
 * usuario 2026-11-03): la velocidad derivada del RE es la base (0–100)
 * y las demás dimensiones (oportunidad precio/FV, calidad, confianza
 * de la valuación, riesgo) entran como un AJUSTE acotado de ±15
 * puntos — pueden premiar o castigar dentro de esa banda, pero no
 * invertir el titular: la tabla ordena por duplicación y el score no
 * puede contradecirla groseramente.
 *
 * Sistema forward (R11, docs/VALUATION-RULES.md): esta capa NO
 * corrige ni descuenta ninguna estimación. La convergencia usa el
 * Fair Value TAL CUAL lo publica el motor de valuación (sin encoger
 * por confianza, sin bajar al piso del rango por tripwires): la
 * confianza es una ETIQUETA que acompaña al número (y un ajuste menor
 * dentro del score), nunca un reescalado. Sin topes sobre las
 * estimaciones (consenso y convergencia a valor facial); los únicos
 * clamps que quedan son anti-basura numérica documentados: el RE
 * final a [−50%, +80%] y la tasa de crecimiento de GK a [−30%, +100%].
 * El crecimiento de GK conserva su ancla por régimen (ventas en
 * crecimiento, ROIC × reinversión en maduras — la doctrina del
 * usuario), que es un techo con fundamento económico, no un descuento.
 * A nivel cartera el RE es GEOMÉTRICO: se
 * resta el arrastre de volatilidad σ²/2 (Invesco CMA). El riesgo usa
 * matriz de correlaciones por bloques (aproximación documentada) y
 * descomposición de Euler: MCTR y PCTR por activo, que ordenan desempates
 * de extracción y validan swaps.
 *
 * Sin dependencias de red: lo alimentan el servidor (Yahoo + Finviz) y lo
 * consumen el cliente y los tests. Cripto y caja quedan fuera del score, con
 * retorno supuesto explícito, y no se proponen ventas automáticas de cripto.
 */
import { scoreFor, normalizeUncertainty, type UncertaintyLevel } from './opportunity.js';

export interface OptimizerAssetInput {
  symbol: string;
  ticker: string;
  name: string;
  sector: string;
  industry?: string;
  price: number;
  qty: number;
  value: number; // US$ actuales
  isCrypto?: boolean;
  isCash?: boolean;
  assumedReturnPct?: number | null; // cripto/caja: retorno supuesto anual %
  dividendYieldPct?: number | null;
  /** Crecimiento de ganancias TOTALES % (ancla GK anti doble conteo). */
  earningsGrowthTotalPct?: number | null;
  epsNextYearPct?: number | null;
  epsNext5YPct?: number | null;
  salesGrowthPct?: number | null;
  /** ΔS % anual: positivo = emite acciones (diluye), negativo = recompra. */
  dilutionPct?: number | null;
  forwardPe?: number | null;
  industryForwardPe?: number | null;
  fvPesimista?: number | null;
  fvBase?: number | null;
  fvOptimista?: number | null;
  uncertainty?: string | null;
  analystTarget?: number | null;
  volatilityPct?: number | null; // anual %
  beta?: number | null;
  roicPct?: number | null;
  /** Tasa de reinversión % calculada de los reportados ((capex −
   *  depreciación) / ingreso neto, EDGAR): insumo del ancla de
   *  crecimiento sustentable en régimen maduro (corrección 2). */
  reinvestmentRatePct?: number | null;
  /** Crecimiento sustentable % en su forma equity, ROE × (1 − payout
   *  total), precomputado por la capa de datos: respaldo del ancla
   *  madura cuando la reinversión no se pudo calcular con fiabilidad. */
  sustainableGrowthPct?: number | null;
  grossMarginPct?: number | null;
  operatingMarginPct?: number | null;
  debtToEquity?: number | null;
  /** Score de oportunidad 0–100 de la ficha (bandas Precio/FV). */
  opportunityScore?: number | null;
  moatScore?: number | null;
  locked?: boolean;
  defensive?: boolean;
  /** Confianza de la valuación propia (fairvalue.ts): ETIQUETA que
   *  acompaña al FV. Desde R11 no reescala ningún número; solo entra
   *  como una dimensión menor del ajuste acotado del score y en el
   *  listón de destino (≥2 componentes, FV/precio). */
  fvConfidence?: 'Alta' | 'Media' | 'Baja' | null;
  /** Cantidad de componentes válidos detrás del FV (1–3). Un FV de un
   *  solo componente no compite de igual a igual como destino. */
  fvComponentCount?: number | null;
  /** EPS forward efectivamente usado por el motor de FV (tras la cadena
   *  de reparación); ≤ 0 es señal dura de deterioro de tesis. */
  forwardEpsUsed?: number | null;
  /** Mediana de FCF 3–5 años ≤ 0 (serie EDGAR/Yahoo del motor de FV). */
  fcfMedianNonPositive?: boolean | null;
  /** Crecimiento de ingresos TTM % (proxy de desaceleración cuando se
   *  combina con FCF mediano ≤ 0). */
  revenueGrowthPct?: number | null;
  /** Próximo balance: fecha ISO y días hábiles hasta la fecha (calculados
   *  por la capa de datos). Dentro de la ventana de examen (≤5) no se
   *  propone ni compra ni venta: la decisión se difiere al balance. */
  nextEarningsDate?: string | null;
  earningsBusinessDays?: number | null;
  /** Campo histórico: la normalización de EPS a mitad de ciclo SALIÓ
   *  en R11 (era un juicio narrativo codificado que contradecía la
   *  visibilidad forward — p. ej. capacidad vendida por años). La
   *  capa de datos ya no la calcula: siempre false. Se conserva el
   *  campo por compatibilidad de la API. */
  cyclicalNormalized?: boolean;
  /** Campo histórico (ver cyclicalNormalized): siempre null. */
  midCycleEps?: number | null;
  /** Rango [piso, techo] de los componentes del FV (motor de
   *  valuación, valores crudos): información que acompaña al FV.
   *  Desde R11 ningún extremo del rango gobierna la convergencia. */
  fvRangeLow?: number | null;
  fvRangeHigh?: number | null;
  /** El motor de valuación marcó el FV como sospechoso (FV > 2× el
   *  target de consenso o > 2,5× el precio, R9): ETIQUETA informativa;
   *  desde R11 no cambia la convergencia ni ningún número. */
  fvModelSuspect?: boolean;
  /** Las fuentes directas del EPS forward discrepan en el signo en el
   *  mismo refresco (consenso ≈ break-even): trazabilidad; desde R11
   *  no altera ningún número de esta capa. */
  epsSignDisagreement?: boolean;
}

export interface ScoredPeer {
  symbol: string;
  ticker: string;
  name: string;
  industry: string;
  price: number;
  score: number;
  expectedReturnPct: number;
  volatilityPct?: number | null;
  /** Mismo listón que las posiciones propias cuando actúa de destino. */
  fvConfidence?: 'Alta' | 'Media' | 'Baja' | null;
  fvComponentCount?: number | null;
  fvToPrice?: number | null;
}

export interface OptimizerOptions {
  sellCommissionPct?: number; // default 0.5 (el configurado por el usuario)
  riskFreePct?: number; // default 4
  yearsToCorrection?: number; // default 3
  minTradeUsd?: number; // default 250
  maxWeightPct?: number; // tope por posición, default 12
  maxExtractionPct?: number; // del valor total, default 15
  newPositionCapPct?: number; // posición nueva máxima, default 5
  riskTolerancePp?: number; // tolerancia de riesgo para el veredicto, default 1
  peersByIndustry?: Record<string, ScoredPeer[]>;
  /** Tickers que el usuario desactivó en la UI: no se proponen extracciones. */
  excludeTickers?: string[];
  /** Ventas manuales del usuario (botón «Obtener más fondos»): monto en US$ por símbolo. */
  manualExtractions?: Array<{ symbol: string; amountUsd: number }>;
  /** Efectivo nuevo que el usuario agrega como fondos (no es una venta). */
  extraCashUsd?: number;
  /** Tickers de sugerencias automáticas aceptadas por el usuario. */
  acceptedSuggestions?: string[];
}

export interface AssetScore {
  symbol: string;
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  qty: number;
  value: number;
  weightPct: number;
  isCrypto: boolean;
  isCash: boolean;
  /** Componentes del RE (null = no calculable con los datos disponibles). */
  gkPct: number | null;
  fvConvergencePct: number | null;
  consensusPct: number | null;
  /** Crecimiento efectivamente usado dentro de GK, su ancla de
   *  cordura por régimen y el régimen aplicado (corrección 2):
   *  trazabilidad de por qué GK cree lo que cree. */
  gkGrowthPct: number | null;
  growthAnchorPct: number | null;
  growthRegime: GrowthRegime | null;
  /** RE anual estimado % (aritmético por activo). */
  expectedReturnPct: number | null;
  /** Piso de cordura Gordon: D/P + g acotado. */
  gordonFloorPct: number | null;
  belowGordonFloor: boolean;
  score: number | null;
  stars: number | null;
  yearsToDouble: number | null;
  volatilityPct: number;
  /** Descomposición de riesgo de Euler (aprox. por bloques de correlación). */
  mctrPct: number | null;
  riskContributionPct: number | null; // PCTR %
  excessPerRisk: number | null; // (RE − rf) / MCTR
  locked: boolean;
  defensive: boolean;
  confidence: 'alta' | 'media' | 'baja';
  /** FV crudo del motor de valuación (sin shrinkage). */
  fvRaw: number | null;
  /** FV usado por convergencia y score: desde R11 es el MISMO FV del
   *  motor, tal cual — sin encoger por confianza ni bajar a ningún
   *  piso. Se conserva el campo por compatibilidad de la API. */
  fvEffective: number | null;
  /** Base del score: la velocidad (capacidad de duplicar derivada del
   *  RE), 0–100. Es la pata dominante del puntaje (directiva
   *  2026-11-03). */
  scoreVelocity: number | null;
  /** Ajuste acotado del score (±15 pts máx): lo que las demás
   *  dimensiones (oportunidad, calidad, confianza, riesgo) suman o
   *  restan sobre la velocidad. */
  scoreAdjustmentPts: number | null;
  /** Motivo principal del ajuste, en lenguaje simple, cuando el
   *  ajuste es llamativo (|ajuste| ≥ 5 pts): la evaluación escrita lo
   *  cita para que ninguna diferencia score↔duplicación quede sin
   *  explicación. */
  scoreAdjustmentDriver: string | null;
  fvConfidence: 'Alta' | 'Media' | 'Baja' | null;
  fvComponentCount: number | null;
  fvToPrice: number | null;
  /** Pasa el listón de destino de fondos (score ajustado, ≥2 componentes
   *  o desconocido, FV/precio ≤ 3, no defensivo, sin examen próximo). */
  destinationEligible: boolean;
  /** Códigos de señal de deterioro de tesis (ver thesisSignalsFor). */
  thesisSignals: ThesisSignalCode[];
  /** Examen de balance dentro de la ventana: decisión diferida. */
  earningsGate: { date: string; businessDays: number } | null;
  cyclicalNormalized: boolean;
  dilutionPct: number | null;
  /** Campo histórico (desapilado §13): desde R11 la convergencia
   *  siempre usa el FV tal cual, así que este flag queda en false; se
   *  conserva por compatibilidad de la API. */
  conservativeConvergence: boolean;
  /** El FV trae la marca `modelSuspect` del motor de valuación (R9):
   *  es una ETIQUETA informativa (el número no cambia por ella). */
  modelSuspect: boolean;
  /** Desacuerdo de signo entre fuentes del EPS forward: dato de
   *  trazabilidad; desde R11 no altera ningún número. */
  epsSignDisagreement: boolean;
}

/** Señales medibles de deterioro de tesis (ninguna depende del ticker). */
export type ThesisSignalCode =
  | 'eps-negativo'
  | 'ganancias-en-caida'
  | 'dilucion-fuerte'
  | 'fcf-negativo-sin-crecimiento'
  | 'fv-un-solo-componente';

export const THESIS_SIGNAL_TEXT: Record<ThesisSignalCode, string> = {
  'eps-negativo': 'EPS forward ≤ 0: el consenso espera pérdidas',
  'ganancias-en-caida': 'el consenso espera que las ganancias caigan el próximo año',
  'dilucion-fuerte': 'dilución neta mayor al 10% anual (acciones en circulación, EDGAR)',
  'fcf-negativo-sin-crecimiento': 'flujo de caja libre mediano de 3–5 años ≤ 0 sin crecimiento de ingresos que lo justifique',
  'fv-un-solo-componente': 'su valor justo depende de un único método, con confianza baja',
};

export interface Extraction {
  symbol: string;
  ticker: string;
  name: string;
  kind: 'total' | 'parcial' | 'efectivo';
  qtySold: number;
  price: number;
  grossUsd: number;
  netUsd: number;
  reason: string;
  reasonCode: 'veredicto-vender' | 'score-bajo' | 'reemplazo-sectorial' | 'concentracion' | 'bajo-retorno' | 'manual' | 'sugerencia' | 'tesis-deteriorada';
  replacementTicker?: string;
  /** Señales que dispararon la salida (solo reasonCode tesis-deteriorada). */
  thesisSignals?: ThesisSignalCode[];
}

/** Activo con balance dentro de la ventana de examen: decisión diferida. */
export interface PendingExam {
  symbol: string;
  ticker: string;
  name: string;
  date: string;
  businessDays: number;
  /** Señales de deterioro presentes (la salida también se difiere). */
  thesisSignals: ThesisSignalCode[];
}

/** Activo con UNA señal de deterioro: se vigila, no se toca. */
export interface WatchAlert {
  symbol: string;
  ticker: string;
  name: string;
  thesisSignals: ThesisSignalCode[];
}

/** Candidata a venta que la UI ofrece en «Obtener más fondos» (aún no aceptada). */
export interface SuggestionCandidate {
  symbol: string;
  ticker: string;
  name: string;
  qtySold: number;
  price: number;
  grossUsd: number;
  netUsd: number;
  reason: string;
  score: number | null;
  expectedReturnPct: number | null;
}

export interface Allocation {
  symbol: string;
  ticker: string;
  name: string;
  isNew: boolean;
  industry: string;
  amountUsd: number;
  qtyBought: number;
  price: number;
  score: number | null;
  expectedReturnPct: number | null;
  note: string;
}

export interface PortfolioMetrics {
  totalValue: number;
  positions: number;
  expectedReturnArithPct: number;
  expectedReturnGeoPct: number;
  volatilityPct: number;
  yearsToDouble: number | null;
  hhi: number; // 0–10000
  topSector: string;
  topSectorPct: number;
  top3WeightPct: number;
}

export interface OptimizerResult {
  assets: AssetScore[]; // ordenados por RE desc (sin RE al final)
  extractions: Extraction[];
  allocations: Allocation[];
  fundsToReallocate: number;
  /** Fondos liberados que quedan deliberadamente en efectivo porque
   *  ningún destino superó el listón (un profesional no redespliega por
   *  obligación). */
  cashHeldUsd: number;
  cashNote: string | null;
  /** Balances dentro de la ventana de examen: decisiones diferidas. */
  pendingExams: PendingExam[];
  /** Una sola señal de deterioro: vigilancia, sin movimiento. */
  watchAlerts: WatchAlert[];
  /** Próximas ventas sugeridas (no dispararon reglas; la UI las ofrece de a una). */
  suggestionCandidates: SuggestionCandidate[];
  before: PortfolioMetrics;
  after: PortfolioMetrics;
  /** Cartera final: posiciones resultantes con peso y score. */
  finalAssets: AssetScore[];
  verdict: 'valida' | 'evaluar' | 'sin-mejora';
  verdictText: string;
  narrative: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const yearsToDoubleFor = (rPct: number | null): number | null =>
  rPct != null && rPct > 0 ? Math.LN2 / Math.log(1 + rPct / 100) : null;

/** Umbral de régimen por crecimiento de VENTAS (% anual): por encima,
 *  la empresa es «en crecimiento» y su crecimiento de ganancias se
 *  ancla a las ventas; por debajo es «madura» y manda el crecimiento
 *  sustentable. Punto medio de la banda 10–15% indicada por el
 *  usuario (corrección 2026-11-03). */
export const GROWTH_REGIME_SALES_PCT = 12.5;
/** Margen de apalancamiento operativo (pp): en régimen de crecimiento
 *  las ganancias pueden crecer hasta ventas + 10 pp (expansión de
 *  márgenes; la recompra ya entra como componente separado de GK, no
 *  se cuenta dos veces). */
export const GROWTH_LEVERAGE_SLACK_PP = 10;
/** Crecimiento sustentable a nivel firma: g = ROIC × tasa de
 *  reinversión (estándar Damodaran; el fade de Morningstar usa la
 *  misma lógica con su RONIC). Entradas en %. */
export function sustainableGrowthFromRoic(
  roicPct: number | null | undefined,
  reinvestmentRatePct: number | null | undefined
): number | null {
  if (roicPct == null || reinvestmentRatePct == null) return null;
  return (roicPct * reinvestmentRatePct) / 100;
}

export type GrowthRegime = 'crecimiento' | 'madura';

/** Ancla de cordura del crecimiento de ganancias, por régimen
 *  (corrección del usuario 2026-11-03):
 *  - Empresa en crecimiento (ventas > +12,5%): ancla = crecimiento de
 *    ventas + margen de apalancamiento operativo. Las ventas mandan
 *    porque una base de ganancias casi cero (Nebius) convierte
 *    cualquier % de EPS en un número sin sentido, mientras las ventas
 *    son la magnitud económica real que crece.
 *  - Empresa madura: ancla = crecimiento sustentable, g = ROIC ×
 *    reinversión con los reportados del motor; si la reinversión no
 *    se pudo calcular con fiabilidad, el respaldo es la forma equity
 *    ROE × (1 − payout) que la capa de datos precomputa
 *    (`sustainableGrowthPct`).
 *  El ancla es TECHO de cordura, nunca piso: si el consenso implica
 *  menos, manda el consenso. Sin datos para el ancla, no hay ancla y
 *  la estimación entra a valor facial. */
export function growthAnchorFor(a: OptimizerAssetInput): {
  anchorPct: number;
  regime: GrowthRegime;
} | null {
  const sales = a.salesGrowthPct ?? null;
  if (sales != null && sales > GROWTH_REGIME_SALES_PCT) {
    return { anchorPct: sales + GROWTH_LEVERAGE_SLACK_PP, regime: 'crecimiento' };
  }
  const firm = sustainableGrowthFromRoic(a.roicPct, a.reinvestmentRatePct);
  if (firm != null) return { anchorPct: firm, regime: 'madura' };
  if (a.sustainableGrowthPct != null) {
    return { anchorPct: a.sustainableGrowthPct, regime: 'madura' };
  }
  return null;
}

export interface GrinoldKronerParts {
  total: number | null;
  /** Crecimiento efectivamente usado en GK (tras el ancla). */
  growthUsedPct: number | null;
  /** Ancla de cordura aplicada (techo), si hubo. */
  growthAnchorPct: number | null;
  growthRegime: GrowthRegime | null;
  /** Crecimiento base antes del ancla (consenso de ganancias o, en su
   *  defecto, el de ventas). */
  growthBasePct: number | null;
}

/** Banda anti-basura de la TASA de crecimiento que entra a GK: no es
 *  una opinión sobre ninguna empresa — existe para que un input
 *  corrupto no imprima un crecimiento de 3 dígitos en pantalla. Se
 *  subió de +60 a +100 en R11 porque ataba en 7 de 19 activos reales
 *  (más de un tercio): a ese nivel dejaba de ser anti-basura y pasaba
 *  a ser un tope encubierto sobre estimaciones legítimas. */
export const GK_GROWTH_CLAMP_PCT = { min: -30, max: 100 } as const;

/** Grinold-Kroner por activo, con el despiece del crecimiento.
 *  `total` es null si no hay crecimiento estimable. */
export function grinoldKronerParts(a: OptimizerAssetInput): GrinoldKronerParts {
  let baseGrowth: number | null = null;
  // Estimación de crecimiento de ganancias: ganancias totales si
  // está (anti doble conteo con el buyback); si no, la mediana del
  // crecimiento de EPS de consenso (próximo año / 5 años). Desde R11
  // no hay trato especial por desacuerdo de signo entre fuentes: la
  // cadena de valuación ya resolvió el EPS, y el ancla por régimen
  // de abajo es el único techo.
  if (a.earningsGrowthTotalPct != null) {
    baseGrowth = a.earningsGrowthTotalPct;
  } else {
    const eps: number[] = [];
    if (a.epsNextYearPct != null) eps.push(a.epsNextYearPct);
    if (a.epsNext5YPct != null) eps.push(a.epsNext5YPct);
    if (eps.length > 0) baseGrowth = median(eps);
  }
  // Sin estimación de ganancias, el crecimiento de ventas es el proxy.
  if (baseGrowth == null) baseGrowth = a.salesGrowthPct ?? null;
  if (baseGrowth == null) {
    return { total: null, growthUsedPct: null, growthAnchorPct: null, growthRegime: null, growthBasePct: null };
  }
  // Ancla por régimen (corrección 2): techo de cordura con fundamento
  // económico según el régimen — reemplaza al fade mecánico anterior
  // (conservar el 45% del exceso sobre 6%), que era un descuento
  // sistemático sobre la estimación sin orden del usuario. El clamp
  // residual [−30, +100] es la protección anti-basura de arriba.
  const anchor = growthAnchorFor(a);
  const gRaw = clamp(
    anchor != null ? Math.min(baseGrowth, anchor.anchorPct) : baseGrowth,
    GK_GROWTH_CLAMP_PCT.min,
    GK_GROWTH_CLAMP_PCT.max
  );
  const div = a.dividendYieldPct ?? 0;
  const buyback = a.dilutionPct != null ? -a.dilutionPct : 0;
  let repricing = 0;
  if (a.forwardPe != null && a.industryForwardPe != null && a.forwardPe > 0 && a.industryForwardPe > 0) {
    repricing = clamp((Math.pow(a.industryForwardPe / a.forwardPe, 1 / 5) - 1) * 100, -5, 5);
  }
  return {
    total: div + buyback + gRaw + repricing,
    growthUsedPct: gRaw,
    growthAnchorPct: anchor?.anchorPct ?? null,
    growthRegime: anchor?.regime ?? null,
    growthBasePct: baseGrowth,
  };
}

/** Grinold-Kroner por activo. Devuelve null si no hay crecimiento estimable. */
export function grinoldKroner(a: OptimizerAssetInput): number | null {
  return grinoldKronerParts(a).total;
}

export function fvConvergencePct(a: OptimizerAssetInput, years: number): number | null {
  if (a.fvBase == null || !(a.fvBase > 0) || !(a.price > 0) || years <= 0) return null;
  // SIN tope ni encogido (correcciones del usuario 2026-11-03 y R11):
  // la brecha contra el Fair Value entra a valor facial, sobre el FV
  // tal cual lo publica el motor de valuación.
  return (Math.pow(a.fvBase / a.price, 1 / years) - 1) * 100;
}

export type ValuationConfidence = 'Alta' | 'Media' | 'Baja';

/** Clamp final del retorno esperado: ÚNICA cota que queda en la capa
 *  de RE y es protección anti-basura numérica, no una opinión. Los
 *  topes por confianza (+35/+30/+25 del pase B/§13) y los de las patas
 *  (consenso −20/+35, convergencia −25/+35, calibraciones del
 *  asistente del 30-oct nunca ordenadas por el usuario) fueron
 *  RETIRADOS por la corrección del usuario 2026-11-03, y en R11 se
 *  retiró también el último reescalado que quedaba: el encogido del
 *  FV por confianza al converger (y su versión tripwire, bajar al
 *  piso del rango). La convergencia usa el FV tal cual lo publica el
 *  motor: la confianza es una etiqueta que acompaña al número, no un
 *  factor que lo reescribe. Este clamp [−50%, +80%] existe solo para
 *  que un input corrupto no imprima un retorno de tres dígitos. */
export const RE_SANITY_CLAMP_PCT = { min: -50, max: 80 } as const;

/** Ventana de examen: balance a ≤ 5 días hábiles ⇒ decisión diferida. */
export const EARNINGS_GATE_BUSINESS_DAYS = 5;
export function earningsGateFor(
  a: OptimizerAssetInput
): { date: string; businessDays: number } | null {
  if (
    a.nextEarningsDate != null &&
    a.earningsBusinessDays != null &&
    a.earningsBusinessDays >= 0 &&
    a.earningsBusinessDays <= EARNINGS_GATE_BUSINESS_DAYS
  ) {
    return { date: a.nextEarningsDate, businessDays: a.earningsBusinessDays };
  }
  return null;
}

/**
 * Señales medibles de deterioro de tesis. Ninguna mira el ticker: son
 * campos que el motor ya recolecta (EPS usado por el FV, ΔS de EDGAR,
 * mediana de FCF, crecimiento de ingresos, estructura del FV). Una sola
 * señal = vigilancia; dos o más combinadas = candidata a salida.
 */
export function thesisSignalsFor(a: OptimizerAssetInput): ThesisSignalCode[] {
  if (a.isCrypto || a.isCash) return [];
  const out: ThesisSignalCode[] = [];
  if (a.forwardEpsUsed != null && a.forwardEpsUsed <= 0) out.push('eps-negativo');
  if (a.epsNextYearPct != null && a.epsNextYearPct <= -5) out.push('ganancias-en-caida');
  if (a.dilutionPct != null && a.dilutionPct > 10) out.push('dilucion-fuerte');
  if (
    a.fcfMedianNonPositive === true &&
    a.revenueGrowthPct != null &&
    a.revenueGrowthPct < 10
  ) {
    out.push('fcf-negativo-sin-crecimiento');
  }
  if (a.fvComponentCount === 1 && a.fvConfidence === 'Baja') {
    out.push('fv-un-solo-componente');
  }
  return out;
}

/** Score mínimo para recibir fondos. */
export const DESTINATION_MIN_SCORE = 65;

/** Banda del ajuste del score (puntos): las dimensiones distintas de
 *  la velocidad mueven el puntaje como máximo ±15. Es la garantía
 *  estructural de que el score no contradice el orden por
 *  duplicación que muestra la tabla (directiva 2026-11-03). */
export const SCORE_ADJUSTMENT_BAND_PTS = 15;
/** Ajuste a partir del cual el motivo se considera llamativo y la
 *  evaluación escrita lo cita con su driver. */
export const SCORE_ADJUSTMENT_NOTABLE_PTS = 5;

export function consensusPct(a: OptimizerAssetInput): number | null {
  if (a.analystTarget == null || !(a.analystTarget > 0) || !(a.price > 0)) return null;
  // SIN tope (corrección del usuario 2026-11-03): la suba implícita en
  // el target de analistas entra a VALOR FACIAL. El clamp [−20, +35]
  // anterior era una calibración del asistente (30-oct) que el propio
  // relevamiento del 2-nov ya había mostrado que «no diferenciaba»
  // (16 de 19 activos saturados en el techo): si el número diferencia,
  // que diferencie. Su peso en el blend (20%) ya limita su influencia.
  return (a.analystTarget / a.price - 1) * 100;
}

function qualityScore(a: OptimizerAssetInput): number | null {
  if (a.moatScore != null) return clamp(a.moatScore, 0, 100);
  const parts: number[] = [];
  if (a.roicPct != null) parts.push(clamp(35 + a.roicPct * 2.2, 0, 100));
  if (a.grossMarginPct != null) parts.push(clamp(20 + a.grossMarginPct * 1.1, 0, 100));
  if (a.operatingMarginPct != null) parts.push(clamp(30 + a.operatingMarginPct * 1.8, 0, 100));
  return parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
}

export function scoreAsset(
  a: OptimizerAssetInput,
  totalValue: number,
  opts: Required<Omit<OptimizerOptions, 'peersByIndustry' | 'excludeTickers' | 'manualExtractions' | 'extraCashUsd' | 'acceptedSuggestions'>>
): AssetScore {
  const isCrypto = !!a.isCrypto;
  const isCash = !!a.isCash;
  const weightPct = totalValue > 0 ? (a.value / totalValue) * 100 : 0;
  const vol =
    a.volatilityPct != null && a.volatilityPct > 0
      ? a.volatilityPct
      : a.beta != null
        ? clamp(a.beta * 22, 8, 90)
        : isCrypto
          ? 60
          : 26;

  let gk: number | null = null;
  let fv: number | null = null;
  let cons: number | null = null;
  let re: number | null = null;
  let score: number | null = null;
  let stars: number | null = null;
  let gordon: number | null = null;

  // FV usado por convergencia y score: el del motor, TAL CUAL (R11:
  // sin encoger por confianza, sin pisos por tripwire).
  const fvEffective = isCrypto || isCash ? null : (a.fvBase ?? null);
  const gate = isCrypto || isCash ? null : earningsGateFor(a);
  const thesisSignals = thesisSignalsFor(a);
  const conservativeConvergence = false;

  let gkParts: GrinoldKronerParts | null = null;
  let scoreVelocity: number | null = null;
  let scoreAdjustmentPts: number | null = null;
  let scoreAdjustmentDriver: string | null = null;
  if (isCrypto || isCash) {
    re = a.assumedReturnPct ?? (isCash ? 0 : 11.5);
  } else {
    gkParts = grinoldKronerParts(a);
    gk = gkParts.total;
    // Convergencia al FV publicado, a valor facial: la brecha entre
    // precio y valor justo se convierte en retorno anual en el
    // horizonte de corrección, sin descuentos de esta capa.
    fv = fvConvergencePct(a, opts.yearsToCorrection);
    cons = consensusPct(a);
    const parts: Array<[number | null, number]> = [
      [gk, 0.45],
      [fv, 0.35],
      [cons, 0.2],
    ];
    const avail = parts.filter(([v]) => v != null) as Array<[number, number]>;
    if (avail.length) {
      const tw = avail.reduce((s, [, w]) => s + w, 0);
      // Sin topes por confianza ni por pata (corrección 2026-11-03):
      // solo el clamp anti-basura final, que no ata en casos reales.
      re = clamp(
        avail.reduce((s, [v, w]) => s + v * w, 0) / tw,
        RE_SANITY_CLAMP_PCT.min,
        RE_SANITY_CLAMP_PCT.max
      );
    }
    const gAnchor =
      a.earningsGrowthTotalPct ?? a.salesGrowthPct ??
      (a.epsNext5YPct != null || a.epsNextYearPct != null
        ? median([a.epsNextYearPct, a.epsNext5YPct].filter((x): x is number => x != null))
        : null);
    if (gAnchor != null) gordon = (a.dividendYieldPct ?? 0) + clamp(gAnchor, 0, 5.5);

    // SCORE DOMINADO POR LA CAPACIDAD DE DUPLICAR (directiva del
    // usuario 2026-11-03, mismo día): la base es la velocidad — el
    // retorno esperado convertido a escala 0–100 (RE −5% → 0; 15% →
    // 50; 35% → 100) — y las demás dimensiones entran como un AJUSTE
    // ACOTADO de ±15 puntos: oportunidad precio/FV (25/70 del
    // ajuste), calidad del negocio (20/70), confianza de la
    // valuación (15/70) y riesgo (10/70). El ajuste puede premiar o
    // castigar dentro de su banda, pero no puede invertir el
    // titular: dos activos cuya velocidad difiera en más de 30
    // puntos jamás se cruzan en el score, y nadie del tercio más
    // rápido termina en el tercio inferior por el ajuste. (El diseño
    // «profesional» anterior — velocidad al 30% — invertía el orden
    // que la tabla muestra y era contraintuitivo: score bajo arriba
    // en la tabla.)
    scoreVelocity = re != null ? clamp(((re + 5) / 40) * 100, 0, 100) : null;
    let opportunity = a.opportunityScore ?? null;
    if (opportunity == null && fvEffective != null && fvEffective > 0 && a.price > 0) {
      opportunity = scoreFor(a.price / fvEffective, normalizeUncertainty(a.uncertainty) as UncertaintyLevel);
    }
    const quality = qualityScore(a);
    const valuationConfidenceScore =
      a.fvConfidence === 'Alta' ? 90 : a.fvConfidence === 'Media' ? 65 : a.fvConfidence === 'Baja' ? 35 : null;
    const riskScore = clamp(100 - Math.max(0, vol - 15) * 1.6 - Math.max(0, (a.debtToEquity ?? 0) - 1) * 8, 0, 100);
    const adjDims: Array<{ value: number | null; weight: number; driver: string }> = [
      { value: opportunity, weight: 25, driver: 'su precio contra el valor justo' },
      { value: quality, weight: 20, driver: 'su calidad (rentabilidad del capital y márgenes)' },
      { value: valuationConfidenceScore, weight: 15, driver: 'la confianza de su valuación' },
      { value: riskScore, weight: 10, driver: 'su riesgo (volatilidad y deuda)' },
    ];
    const adjAvail = adjDims.filter((d) => d.value != null);
    if (scoreVelocity != null) {
      let adjustment = 0;
      if (adjAvail.length > 0) {
        const tw = adjAvail.reduce((s, d) => s + d.weight, 0);
        const index = adjAvail.reduce((s, d) => s + (d.value as number) * d.weight, 0) / tw;
        adjustment = ((index - 50) / 50) * SCORE_ADJUSTMENT_BAND_PTS;
        // Driver: la dimensión que más empujó el ajuste (su desvío
        // del centro, ponderado). Solo se nombra si el ajuste es
        // llamativo: la evaluación escrita lo cita.
        let bestDriver: string | null = null;
        let bestPush = 0;
        for (const d of adjAvail) {
          const push = ((d.value as number) - 50) * (d.weight / tw);
          if (Math.abs(push) > Math.abs(bestPush)) {
            bestPush = push;
            bestDriver = d.driver;
          }
        }
        if (Math.abs(adjustment) >= SCORE_ADJUSTMENT_NOTABLE_PTS) {
          scoreAdjustmentDriver = bestDriver;
        }
      }
      scoreAdjustmentPts = Math.round(adjustment * 10) / 10;
      score = Math.round(clamp(scoreVelocity + adjustment, 0, 100));
      stars = clamp(Math.round(score / 20), 1, 5);
    }
  }

  const fvToPrice =
    a.fvBase != null && a.fvBase > 0 && a.price > 0 ? a.fvBase / a.price : null;
  const destinationEligible =
    !isCrypto &&
    !isCash &&
    score != null &&
    score >= DESTINATION_MIN_SCORE &&
    (a.fvComponentCount == null || a.fvComponentCount >= 2) &&
    (fvToPrice == null || fvToPrice <= 3) &&
    !a.defensive &&
    gate == null;

  const components = [gk, fv, cons].filter((x) => x != null).length;
  return {
    symbol: a.symbol,
    ticker: a.ticker,
    name: a.name,
    sector: a.sector,
    industry: a.industry || a.sector,
    price: a.price,
    qty: a.qty,
    value: a.value,
    weightPct,
    isCrypto,
    isCash,
    gkPct: gk,
    fvConvergencePct: fv,
    consensusPct: cons,
    gkGrowthPct: gkParts?.growthUsedPct ?? null,
    growthAnchorPct: gkParts?.growthAnchorPct ?? null,
    growthRegime: gkParts?.growthRegime ?? null,
    expectedReturnPct: re,
    gordonFloorPct: gordon,
    belowGordonFloor: gordon != null && re != null && re < gordon - 4,
    score,
    stars,
    yearsToDouble: yearsToDoubleFor(re),
    volatilityPct: vol,
    mctrPct: null,
    riskContributionPct: null,
    excessPerRisk: null,
    locked: !!a.locked,
    defensive: !!a.defensive,
    confidence: isCrypto || isCash ? 'baja' : components >= 3 ? 'alta' : components === 2 ? 'media' : 'baja',
    fvRaw: a.fvBase ?? null,
    fvEffective,
    scoreVelocity,
    scoreAdjustmentPts,
    scoreAdjustmentDriver,
    fvConfidence: a.fvConfidence ?? null,
    fvComponentCount: a.fvComponentCount ?? null,
    fvToPrice,
    destinationEligible,
    thesisSignals,
    earningsGate: gate,
    cyclicalNormalized: !!a.cyclicalNormalized,
    dilutionPct: a.dilutionPct ?? null,
    conservativeConvergence,
    modelSuspect: !!a.fvModelSuspect,
    epsSignDisagreement: !!a.epsSignDisagreement,
  };
}

/** Correlación asumida por bloques (aproximación v1, documentada en la UI). */
function blockCorrelation(x: AssetScore, y: AssetScore): number {
  if (x.symbol === y.symbol) return 1;
  if (x.isCash || y.isCash) return 0;
  if (x.isCrypto && y.isCrypto) return 0.7;
  if (x.isCrypto || y.isCrypto) return 0.25;
  if (x.industry === y.industry) return 0.65;
  if (x.sector === y.sector) return 0.55;
  return 0.45;
}

/** Volatilidad de cartera y descomposición de Euler (MCTR/PCTR) in-place. */
export function applyRiskDecomposition(assets: AssetScore[], riskFreePct: number): number {
  const total = assets.reduce((s, a) => s + a.value, 0);
  if (total <= 0) return 0;
  const w = assets.map((a) => a.value / total);
  const sig = assets.map((a) => a.volatilityPct / 100);
  // (Σw)_i y varianza de cartera
  const sigmaW = assets.map((_, i) => {
    let s = 0;
    for (let j = 0; j < assets.length; j++) s += blockCorrelation(assets[i], assets[j]) * sig[j] * w[j];
    return sig[i] * s;
  });
  const varP = w.reduce((s, wi, i) => s + wi * sigmaW[i], 0);
  const volP = Math.sqrt(Math.max(varP, 0)) * 100;
  assets.forEach((a, i) => {
    if (volP > 0) {
      a.mctrPct = (sigmaW[i] / (volP / 100)) * 100;
      a.riskContributionPct = ((w[i] * sigmaW[i]) / varP) * 100;
      a.excessPerRisk =
        a.expectedReturnPct != null && a.mctrPct > 0 ? (a.expectedReturnPct - riskFreePct) / a.mctrPct : null;
    }
  });
  return volP;
}

export function portfolioMetrics(assets: AssetScore[], volPct: number): PortfolioMetrics {
  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  const reArith =
    totalValue > 0
      ? assets.reduce((s, a) => s + (a.value / totalValue) * (a.expectedReturnPct ?? 0), 0)
      : 0;
  const reGeo = reArith - Math.pow(volPct / 100, 2) * 50; // −σ²/2 en %
  const hhi = assets.reduce((s, a) => s + Math.pow(a.weightPct, 2), 0);
  const sectorMap = new Map<string, number>();
  assets.forEach((a) => sectorMap.set(a.sector, (sectorMap.get(a.sector) ?? 0) + a.weightPct));
  let topSector = '';
  let topSectorPct = 0;
  sectorMap.forEach((v, k) => {
    if (v > topSectorPct) {
      topSectorPct = v;
      topSector = k;
    }
  });
  const top3 = [...assets].sort((x, y) => y.weightPct - x.weightPct).slice(0, 3);
  return {
    totalValue,
    positions: assets.filter((a) => !a.isCash).length,
    expectedReturnArithPct: reArith,
    expectedReturnGeoPct: reGeo,
    volatilityPct: volPct,
    yearsToDouble: yearsToDoubleFor(reGeo),
    hhi,
    topSector,
    topSectorPct,
    top3WeightPct: top3.reduce((s, a) => s + a.weightPct, 0),
  };
}

const fmtUsd = (n: number) => 'US$ ' + Math.round(n).toLocaleString('es-AR');
const fmtPct1 = (n: number) => n.toFixed(1).replace('.', ',') + '%';
const fmtY = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','));
/**
 * Formato de un PAR antes/después: si con 1 decimal se verían iguales pero los
 * valores difieren, pasa a 2 decimales (la mejora de una rotación chica es de
 * centésimas y con 1 decimal el antes/después parece copiado).
 */
export const fmtPairPct = (a: number, b: number): [string, string] => {
  const d = a.toFixed(1) === b.toFixed(1) && Math.abs(a - b) > 0.0001 ? 2 : 1;
  return [a.toFixed(d).replace('.', ',') + '%', b.toFixed(d).replace('.', ',') + '%'];
};
export const fmtPairYears = (a: number | null, b: number | null): [string, string] => {
  if (a == null || b == null) return [fmtY(a), fmtY(b)];
  const d = a.toFixed(1) === b.toFixed(1) && Math.abs(a - b) > 0.001 ? 2 : 1;
  return [a.toFixed(d).replace('.', ','), b.toFixed(d).replace('.', ',')];
};

export function optimizePortfolio(
  inputs: OptimizerAssetInput[],
  options: OptimizerOptions = {}
): OptimizerResult {
  const opts: Required<Omit<OptimizerOptions, 'peersByIndustry' | 'excludeTickers' | 'manualExtractions' | 'extraCashUsd' | 'acceptedSuggestions'>> = {
    sellCommissionPct: options.sellCommissionPct ?? 0.5,
    riskFreePct: options.riskFreePct ?? 4,
    yearsToCorrection: options.yearsToCorrection ?? 3,
    minTradeUsd: options.minTradeUsd ?? 250,
    maxWeightPct: options.maxWeightPct ?? 12,
    maxExtractionPct: options.maxExtractionPct ?? 15,
    newPositionCapPct: options.newPositionCapPct ?? 5,
    riskTolerancePp: options.riskTolerancePp ?? 1,
  };
  const peersByIndustry = options.peersByIndustry ?? {};
  const excluded = new Set((options.excludeTickers ?? []).map((t) => t.toUpperCase()));
  const totalValue = inputs.reduce((s, a) => s + a.value, 0);

  const scored = inputs.map((a) => scoreAsset(a, totalValue, opts));
  const volBefore = applyRiskDecomposition(scored, opts.riskFreePct);
  const before = portfolioMetrics(scored, volBefore);
  const sorted = [...scored].sort(
    (x, y) => (y.expectedReturnPct ?? -Infinity) - (x.expectedReturnPct ?? -Infinity)
  );

  // ---------- Extracciones ----------
  // Fondos definidos por el usuario (botón «Obtener más fondos»): ventas
  // manuales de posiciones vigentes y efectivo nuevo. Son decisión explícita:
  // no consumen el tope de extracción automática y reemplazan a las reglas
  // automáticas sobre esos mismos activos.
  const extraCashUsd = Math.max(0, options.extraCashUsd ?? 0);
  const manualBySymbol = new Map<string, number>();
  for (const m of options.manualExtractions ?? []) {
    if (!(m.amountUsd > 0)) continue;
    manualBySymbol.set(m.symbol, (manualBySymbol.get(m.symbol) ?? 0) + m.amountUsd);
  }
  const stockAssets = scored.filter(
    (a) =>
      !a.isCrypto && !a.isCash && !a.locked && !excluded.has(a.ticker.toUpperCase()) &&
      !manualBySymbol.has(a.symbol) &&
      // Cinturón de balances: con examen dentro de la ventana no se
      // propone ni venta ni compra; la decisión se difiere al balance.
      !a.earningsGate
  );
  // Exámenes próximos (incluye los activos con señales de deterioro: su
  // eventual salida también se difiere a después del balance).
  const pendingExams: PendingExam[] = scored
    .filter((a) => !a.isCrypto && !a.isCash && a.earningsGate)
    .map((a) => ({
      symbol: a.symbol,
      ticker: a.ticker,
      name: a.name,
      date: a.earningsGate!.date,
      businessDays: a.earningsGate!.businessDays,
      thesisSignals: a.thesisSignals,
    }))
    .sort((x, y) => x.businessDays - y.businessDays);
  // Una sola señal de deterioro: vigilancia declarada, sin movimiento.
  const watchAlerts: WatchAlert[] = scored
    .filter(
      (a) =>
        !a.isCrypto && !a.isCash && !a.earningsGate && a.thesisSignals.length === 1
    )
    .map((a) => ({
      symbol: a.symbol,
      ticker: a.ticker,
      name: a.name,
      thesisSignals: a.thesisSignals,
    }));
  const medianRE = median(
    stockAssets.map((a) => a.expectedReturnPct).filter((x): x is number => x != null)
  );
  const maxExtractionUsd = (totalValue * opts.maxExtractionPct) / 100;
  let extractedGross = 0;
  const extractions: Extraction[] = [];
  const soldQty = new Map<string, number>();

  const pushExtraction = (
    a: AssetScore,
    kind: 'total' | 'parcial',
    frac: number,
    reason: string,
    reasonCode: Extraction['reasonCode'],
    replacementTicker?: string
  ) => {
    if (extractedGross >= maxExtractionUsd) return;
    let qtySold = kind === 'total' ? a.qty : a.qty * frac;
    let gross = qtySold * a.price;
    if (kind === 'parcial' && extractedGross + gross > maxExtractionUsd) {
      gross = maxExtractionUsd - extractedGross;
      qtySold = a.price > 0 ? gross / a.price : 0;
    }
    if (gross < opts.minTradeUsd && kind !== 'total') return;
    if (qtySold <= 0 || gross <= 0) return;
    extractedGross += gross;
    soldQty.set(a.symbol, (soldQty.get(a.symbol) ?? 0) + qtySold);
    extractions.push({
      symbol: a.symbol,
      ticker: a.ticker,
      name: a.name,
      kind,
      qtySold: Math.round(qtySold * 1000) / 1000,
      price: a.price,
      grossUsd: gross,
      netUsd: gross * (1 - opts.sellCommissionPct / 100),
      reason,
      reasonCode,
      replacementTicker,
    });
  };

  // Aplicar los fondos manuales primero (venta por monto, acotada al saldo).
  for (const [symbol, amountUsd] of manualBySymbol) {
    const a = scored.find((x) => x.symbol === symbol);
    if (!a || a.isCash || !(a.price > 0) || a.qty <= 0) continue;
    const gross = Math.min(amountUsd, a.value);
    const qtySold = gross / a.price;
    if (qtySold <= 0 || gross <= 0) continue;
    soldQty.set(a.symbol, (soldQty.get(a.symbol) ?? 0) + qtySold);
    extractions.push({
      symbol: a.symbol, ticker: a.ticker, name: a.name,
      kind: qtySold >= a.qty * 0.999 ? 'total' : 'parcial',
      qtySold: Math.round(qtySold * 1000) / 1000, price: a.price,
      grossUsd: gross, netUsd: gross * (1 - opts.sellCommissionPct / 100),
      reason: 'Venta definida por vos', reasonCode: 'manual',
    });
  }
  if (extraCashUsd > 0) {
    extractions.push({
      symbol: 'CASH:NEW', ticker: 'EFECTIVO', name: 'Efectivo nuevo',
      kind: 'efectivo', qtySold: 0, price: 1,
      grossUsd: extraCashUsd, netUsd: extraCashUsd,
      reason: 'Efectivo agregado por vos', reasonCode: 'manual',
    });
  }

  // ---------- Salidas por tesis deteriorada ----------
  // Dos o más señales medibles combinadas ⇒ candidata a salida. No
  // consumen el tope de extracción automática (no son un rebalanceo: son
  // una decisión de tesis) y respetan candados, roles y el cinturón de
  // balances (stockAssets ya excluye bloqueados, manuales y con examen
  // próximo). Las defensivas solo salen parciales salvo deterioro grave
  // (≥3 señales con EPS negativo entre ellas).
  for (const a of stockAssets) {
    const signals = a.thesisSignals;
    if (signals.length < 2) continue;
    const hard = signals.includes('eps-negativo');
    let kind: 'total' | 'parcial';
    if (a.defensive) {
      kind = signals.length >= 3 && hard ? 'total' : 'parcial';
    } else {
      kind = signals.length >= 3 || hard ? 'total' : 'parcial';
    }
    const qtySold = kind === 'total' ? a.qty : a.qty * 0.5;
    const gross = qtySold * a.price;
    if (qtySold <= 0 || gross <= 0) continue;
    if (kind === 'parcial' && gross < opts.minTradeUsd) continue;
    soldQty.set(a.symbol, (soldQty.get(a.symbol) ?? 0) + qtySold);
    extractions.push({
      symbol: a.symbol,
      ticker: a.ticker,
      name: a.name,
      kind,
      qtySold: Math.round(qtySold * 1000) / 1000,
      price: a.price,
      grossUsd: gross,
      netUsd: gross * (1 - opts.sellCommissionPct / 100),
      reason:
        'Tesis deteriorada: ' + signals.map((s) => THESIS_SIGNAL_TEXT[s]).join('; '),
      reasonCode: 'tesis-deteriorada',
      thesisSignals: signals,
    });
  }

  // Orden de prioridad: peor eficiencia retorno/riesgo primero (Euler) como desempate.
  const byRiskEfficiency = [...stockAssets].sort(
    (x, y) => (x.excessPerRisk ?? Infinity) - (y.excessPerRisk ?? Infinity)
  );
  for (const a of byRiskEfficiency) {
    if ((soldQty.get(a.symbol) ?? 0) > 0) continue; // ya salió por tesis
    const input = inputs.find((i) => i.symbol === a.symbol)!;
    const sellVerdict =
      input.fvBase != null && input.fvBase > 0 && a.price > input.fvBase * 1.1;
    // Las defensivas tienen un rol (contrapeso): su umbral de salida es más
    // exigente (score <30) y siempre parcial. Decisión del usuario 2026-10-29.
    const lowScoreBar = a.defensive ? 30 : 40;
    if (a.score != null && a.score < lowScoreBar && sellVerdict) {
      pushExtraction(a, a.defensive ? 'parcial' : 'total', 0.5,
        'Precio por encima de su valor justo y score bajo', 'veredicto-vender');
      continue;
    }
    // Reemplazo sectorial: par de la misma industria claramente superior.
    const peers = (peersByIndustry[a.industry] ?? []).filter((p) => p.ticker !== a.ticker);
    const bestPeer = peers.sort((x, y) => y.score - x.score)[0];
    if (
      bestPeer && a.score != null &&
      bestPeer.score >= a.score + 15 &&
      a.expectedReturnPct != null &&
      bestPeer.expectedReturnPct >= a.expectedReturnPct + 3
    ) {
      pushExtraction(a, a.defensive ? 'parcial' : 'total', 0.5,
        `Su par ${bestPeer.ticker} (misma industria) tiene mejor score (${bestPeer.score} vs ${a.score})`,
        'reemplazo-sectorial', bestPeer.ticker);
      continue;
    }
    if (a.score != null && a.score < lowScoreBar) {
      pushExtraction(a, a.defensive ? 'parcial' : 'total', 0.5,
        `Score de inversión bajo (${a.score}/100)`, 'score-bajo');
      continue;
    }
    if (a.weightPct > opts.maxWeightPct) {
      const excessFrac = (a.weightPct - opts.maxWeightPct) / a.weightPct;
      pushExtraction(a, 'parcial', excessFrac,
        `Concentración: pesa ${fmtPct1(a.weightPct)} de la cartera`, 'concentracion');
      continue;
    }
    if (
      !a.defensive &&
      a.expectedReturnPct != null &&
      a.expectedReturnPct < 8 &&
      a.expectedReturnPct < medianRE - 3 &&
      a.score != null && a.score < 55
    ) {
      pushExtraction(a, 'parcial', 0.5,
        'Retorno esperado muy por debajo del resto de la cartera', 'bajo-retorno');
    }
  }
  // ---------- Sugerencias automáticas adicionales ----------
  // Candidatas a vender que NO dispararon las reglas duras, ordenadas por
  // menor eficiencia retorno/riesgo (Euler), defensivas al final: son la
  // "segunda o tercera opción" que la UI ofrece en «Obtener más fondos».
  // Las aceptadas por el usuario (acceptedSuggestions) se convierten en
  // extracción parcial del 50% y salen de la lista de candidatas.
  const computeSuggestionCandidates = (extractedSyms: Set<string>): SuggestionCandidate[] => {
    const pool = stockAssets
      .filter((a) => !extractedSyms.has(a.symbol) && a.value * 0.5 >= opts.minTradeUsd)
      .sort((x, y) => {
        const dx = x.defensive ? 1 : 0;
        const dy = y.defensive ? 1 : 0;
        if (dx !== dy) return dx - dy;
        const ex = x.excessPerRisk ?? Infinity;
        const ey = y.excessPerRisk ?? Infinity;
        if (ex !== ey) return ex - ey;
        const sx = x.score ?? 999;
        const sy = y.score ?? 999;
        if (sx !== sy) return sx - sy;
        return (x.expectedReturnPct ?? Infinity) - (y.expectedReturnPct ?? Infinity);
      });
    return pool.slice(0, 5).map((a) => {
      const gross = a.value * 0.5;
      return {
        symbol: a.symbol, ticker: a.ticker, name: a.name,
        qtySold: Math.round(a.qty * 0.5 * 1000) / 1000, price: a.price,
        grossUsd: gross, netUsd: gross * (1 - opts.sellCommissionPct / 100),
        reason:
          `Sugerencia automática: la menor eficiencia retorno/riesgo entre las posiciones restantes ` +
          `(score ${a.score != null ? a.score + '/100' : '—'} · retorno esp. ${a.expectedReturnPct != null ? fmtPct1(a.expectedReturnPct) : '—'} anual)` +
          (a.defensive ? ' · ojo: cumple rol defensivo' : ''),
        score: a.score, expectedReturnPct: a.expectedReturnPct,
      };
    });
  };
  const acceptedSug = new Set((options.acceptedSuggestions ?? []).map((t) => t.toUpperCase()));
  if (acceptedSug.size) {
    const preCandidates = computeSuggestionCandidates(new Set(extractions.map((e) => e.symbol)));
    for (const c of preCandidates) {
      if (!acceptedSug.has(c.ticker.toUpperCase())) continue;
      soldQty.set(c.symbol, (soldQty.get(c.symbol) ?? 0) + c.qtySold);
      extractions.push({
        symbol: c.symbol, ticker: c.ticker, name: c.name, kind: 'parcial',
        qtySold: c.qtySold, price: c.price, grossUsd: c.grossUsd, netUsd: c.netUsd,
        reason: c.reason, reasonCode: 'sugerencia',
      });
    }
  }

  // ---------- Liquidación: reaplicación con listón y caja deliberada ----------
  // Los fondos se asignan SOLO a destinos que superan el listón
  // (destinationEligible: score ajustado ≥ 65, FV de ≥2 componentes,
  // FV/precio ≤ 3, no defensivos, sin examen próximo). Lo que no
  // encuentra destino queda como efectivo explícito: forzar el
  // redespliegue total era comportamiento de rebalanceador, no de
  // profesional.
  interface SettleOutcome {
    allocations: Allocation[];
    finalAssets: AssetScore[];
    after: PortfolioMetrics;
    cashHeldUsd: number;
  }
  const settle = (extractionList: Extraction[]): SettleOutcome => {
    const funds = extractionList.reduce((s, e) => s + e.netUsd, 0);
    const soldMap = new Map<string, number>();
    for (const e of extractionList) {
      if (e.kind === 'efectivo') continue;
      soldMap.set(e.symbol, (soldMap.get(e.symbol) ?? 0) + e.qtySold);
    }
    const allocations: Allocation[] = [];
    if (funds >= opts.minTradeUsd) {
      interface Cand { key: string; score: number; capUsd: number; make: (amount: number) => Allocation }
      const cands: Cand[] = [];
      // 1) Pares sectoriales de los reemplazos, con el mismo listón
      const seenPeer = new Set<string>();
      for (const e of extractionList) {
        if (!e.replacementTicker || seenPeer.has(e.replacementTicker)) continue;
        seenPeer.add(e.replacementTicker);
        const src = scored.find((a) => a.symbol === e.symbol)!;
        const peer = (peersByIndustry[src.industry] ?? []).find((p) => p.ticker === e.replacementTicker)!;
        if (!peer) continue;
        if (peer.score < DESTINATION_MIN_SCORE) continue;
        if (peer.fvComponentCount != null && peer.fvComponentCount < 2) continue;
        if (peer.fvToPrice != null && peer.fvToPrice > 3) continue;
        cands.push({
          key: 'peer:' + peer.symbol,
          score: peer.score,
          capUsd: (totalValue * opts.newPositionCapPct) / 100,
          make: (amount) => ({
            symbol: peer.symbol, ticker: peer.ticker, name: peer.name, isNew: true,
            industry: peer.industry, amountUsd: amount,
            qtyBought: peer.price > 0 ? amount / peer.price : 0, price: peer.price,
            score: peer.score, expectedReturnPct: peer.expectedReturnPct,
            note: `NUEVO · reemplaza a ${e.ticker} en ${peer.industry}`,
          }),
        });
      }
      // 2) Posiciones propias que superan el listón, sin pasar el tope de peso
      for (const a of sorted) {
        if (!a.destinationEligible) continue;
        if ((soldMap.get(a.symbol) ?? 0) >= a.qty) continue; // salió entera
        const roomUsd = (totalValue * opts.maxWeightPct) / 100 - a.value;
        if (roomUsd < opts.minTradeUsd) continue;
        cands.push({
          key: 'held:' + a.symbol,
          score: a.score!,
          capUsd: roomUsd,
          make: (amount) => ({
            symbol: a.symbol, ticker: a.ticker, name: a.name, isNew: false,
            industry: a.industry, amountUsd: amount,
            qtyBought: a.price > 0 ? amount / a.price : 0, price: a.price,
            score: a.score, expectedReturnPct: a.expectedReturnPct,
            note: 'Posición reforzada',
          }),
        });
      }
      const top = cands.sort((x, y) => y.score - x.score).slice(0, 3);
      if (top.length) {
        const wSum = top.reduce((s, c) => s + c.score * c.score, 0);
        let assigned = 0;
        const made: Array<{ c: Cand; al: Allocation }> = [];
        top.forEach((c, i) => {
          let amount =
            i === top.length - 1
              ? funds - assigned
              : Math.round((funds * (c.score * c.score)) / wSum);
          amount = Math.min(amount, c.capUsd);
          if (amount >= opts.minTradeUsd || (i === top.length - 1 && amount > 0)) {
            assigned += amount;
            const al = c.make(amount);
            made.push({ c, al });
            allocations.push(al);
          }
        });
        // Redistribuir lo que los topes dejaron libre entre las mismas
        // candidatas; lo que no entra queda como efectivo deliberado.
        let leftover = funds - allocations.reduce((s, x) => s + x.amountUsd, 0);
        for (const { c, al } of made) {
          if (leftover < opts.minTradeUsd) break;
          const add = Math.min(leftover, c.capUsd - al.amountUsd);
          if (add > 0) {
            al.amountUsd += add;
            al.qtyBought = al.price > 0 ? al.amountUsd / al.price : 0;
            leftover -= add;
          }
        }
      }
    }
    const allocatedUsd = allocations.reduce((s, x) => s + x.amountUsd, 0);
    const cashHeldUsd = Math.max(0, funds - allocatedUsd);

    // Cartera final
    const finalMap = new Map<string, AssetScore>();
    for (const a of scored) {
      const sold = soldMap.get(a.symbol) ?? 0;
      const bought = allocations.filter((x) => x.symbol === a.symbol && !x.isNew)
        .reduce((s, x) => s + x.qtyBought, 0);
      const qty = a.qty - sold + bought;
      if (qty <= 0.0005) continue;
      const value = qty * a.price;
      finalMap.set(a.symbol, { ...a, qty, value, weightPct: totalValue > 0 ? (value / totalValue) * 100 : 0 });
    }
    for (const al of allocations) {
      if (!al.isNew) continue;
      finalMap.set(al.symbol, {
        symbol: al.symbol, ticker: al.ticker, name: al.name, sector: al.industry, industry: al.industry,
        price: al.price, qty: al.qtyBought, value: al.amountUsd,
        weightPct: totalValue > 0 ? (al.amountUsd / totalValue) * 100 : 0,
        isCrypto: false, isCash: false, gkPct: null, fvConvergencePct: null, consensusPct: null,
        gkGrowthPct: null, growthAnchorPct: null, growthRegime: null,
        expectedReturnPct: al.expectedReturnPct, gordonFloorPct: null, belowGordonFloor: false,
        score: al.score, stars: al.score != null ? clamp(Math.round(al.score / 20), 1, 5) : null,
        yearsToDouble: yearsToDoubleFor(al.expectedReturnPct),
        volatilityPct: 30, mctrPct: null, riskContributionPct: null, excessPerRisk: null,
        locked: false, defensive: false, confidence: 'media',
        fvRaw: null, fvEffective: null, fvConfidence: null, fvComponentCount: null,
        fvToPrice: null, destinationEligible: false, thesisSignals: [],
        earningsGate: null, cyclicalNormalized: false, dilutionPct: null,
        conservativeConvergence: false, modelSuspect: false, epsSignDisagreement: false,
        scoreVelocity: null, scoreAdjustmentPts: null, scoreAdjustmentDriver: null,
      });
    }
    const finalAssets = [...finalMap.values()].sort(
      (x, y) => (y.expectedReturnPct ?? -Infinity) - (x.expectedReturnPct ?? -Infinity)
    );
    const finalTotal = finalAssets.reduce((s, a) => s + a.value, 0);
    // El efectivo nuevo (extraCashUsd) suma al total final: no es una venta.
    const totalAfter = totalValue + extraCashUsd;
    const cashLeft = Math.max(0, totalAfter - finalTotal);
    if (cashLeft > 1) {
      finalAssets.push({
        symbol: 'CASH:USD', ticker: 'USD', name: 'Efectivo sin asignar', sector: 'Efectivo',
        industry: 'Efectivo', price: 1, qty: cashLeft, value: cashLeft,
        weightPct: totalValue > 0 ? (cashLeft / totalValue) * 100 : 0,
        isCrypto: false, isCash: true, gkPct: null, fvConvergencePct: null, consensusPct: null,
        gkGrowthPct: null, growthAnchorPct: null, growthRegime: null,
        expectedReturnPct: 0, gordonFloorPct: null, belowGordonFloor: false, score: null, stars: null,
        yearsToDouble: null, volatilityPct: 0, mctrPct: null, riskContributionPct: null,
        excessPerRisk: null, locked: false, defensive: false, confidence: 'alta',
        fvRaw: null, fvEffective: null, fvConfidence: null, fvComponentCount: null,
        fvToPrice: null, destinationEligible: false, thesisSignals: [],
        earningsGate: null, cyclicalNormalized: false, dilutionPct: null,
        conservativeConvergence: false, modelSuspect: false, epsSignDisagreement: false,
        scoreVelocity: null, scoreAdjustmentPts: null, scoreAdjustmentDriver: null,
      });
    }
    finalAssets.forEach((a) => {
      a.weightPct = totalAfter > 0 ? (a.value / totalAfter) * 100 : 0;
    });
    const volAfter = applyRiskDecomposition(finalAssets, opts.riskFreePct);
    const after = portfolioMetrics(finalAssets, volAfter);
    return { allocations, finalAssets, after, cashHeldUsd };
  };

  let settled = settle(extractions);

  // ---------- Umbral de materialidad ----------
  // Una rotación por reglas que mejora el retorno menos de 0,25 pp (y no
  // baja el riesgo de forma apreciable) es ruido, no una recomendación:
  // se retira y la salida es «sin mejora» estructural. Las salidas por
  // tesis, las manuales, las sugerencias aceptadas y los recortes por
  // CONCENTRACIÓN son decisiones de otro tipo (tesis, del usuario o
  // política de riesgo) y nunca se retiran por esta vía: el veredicto
  // sigue diciendo con honestidad qué pasa con el retorno.
  const RULE_REASON_CODES = new Set<Extraction['reasonCode']>([
    'veredicto-vender', 'score-bajo', 'reemplazo-sectorial', 'bajo-retorno',
  ]);
  const improvementOf = (afterM: PortfolioMetrics) => {
    const dRE = afterM.expectedReturnGeoPct - before.expectedReturnGeoPct;
    const yearsFrac =
      before.yearsToDouble != null && afterM.yearsToDouble != null && before.yearsToDouble > 0
        ? (before.yearsToDouble - afterM.yearsToDouble) / before.yearsToDouble
        : 0;
    const dVol = afterM.volatilityPct - before.volatilityPct;
    const material = dRE >= 0.25 || (yearsFrac >= 0.01 && dRE > 0) || (dVol <= -1 && dRE >= -0.1);
    return { dRE, yearsFrac, dVol, material };
  };
  let improvement = improvementOf(settled.after);
  if (extractions.some((e) => RULE_REASON_CODES.has(e.reasonCode)) && !improvement.material) {
    for (let i = extractions.length - 1; i >= 0; i--) {
      if (RULE_REASON_CODES.has(extractions[i].reasonCode)) extractions.splice(i, 1);
    }
    settled = settle(extractions);
    improvement = improvementOf(settled.after);
  }
  const { allocations, finalAssets, after, cashHeldUsd } = settled;
  const fundsToReallocate = extractions.reduce((s, e) => s + e.netUsd, 0);
  const suggestionCandidates = computeSuggestionCandidates(
    new Set(extractions.map((e) => e.symbol))
  );
  const cashNote =
    cashHeldUsd >= opts.minTradeUsd
      ? 'Sin destino que supere el listón (score de al menos 65, valor justo formado por las dos estimaciones —fórmula y consenso— y sin examen de balance próximo): el resto queda en efectivo a la espera de mejores precios o de los exámenes.'
      : null;

  // ---------- Veredicto riesgo/beneficio ----------
  const riskSimilar = after.volatilityPct <= before.volatilityPct + opts.riskTolerancePp;
  let verdict: OptimizerResult['verdict'];
  let verdictText: string;
  const [reBv, reAv] = fmtPairPct(before.expectedReturnGeoPct, after.expectedReturnGeoPct);
  const [volBv, volAv] = fmtPairPct(before.volatilityPct, after.volatilityPct);
  const hasThesisMoves = extractions.some((e) => e.reasonCode === 'tesis-deteriorada');
  const hasConcentrationMoves = extractions.some((e) => e.reasonCode === 'concentracion');
  if (extractions.length === 0) {
    verdict = 'sin-mejora';
    verdictText = 'Con los datos de hoy, ninguna rotación mejora el beneficio sin subir el riesgo: la cartera queda como está.';
  } else if (improvement.material && riskSimilar) {
    verdict = 'valida';
    verdictText = `Estrategia válida: riesgo similar (${volBv} → ${volAv}) y beneficio superior (${reBv} → ${reAv}). Vale la pena pensar en ejecutarla.`;
  } else if (improvement.material) {
    verdict = 'evaluar';
    verdictText = `Beneficio superior (${reBv} → ${reAv}), pero con más riesgo (${volBv} → ${volAv}). A evaluar con cuidado.`;
  } else if (hasThesisMoves) {
    verdict = 'sin-mejora';
    verdictText = `Las salidas propuestas no buscan mejorar el retorno de corto plazo (${reBv} → ${reAv}): responden a deterioro medible de tesis. Es una decisión de calidad de cartera, no de optimización.`;
  } else if (hasConcentrationMoves) {
    verdict = 'sin-mejora';
    const costClause =
      after.expectedReturnGeoPct < before.expectedReturnGeoPct - 0.005
        ? `a costa de algo de retorno estimado (${reBv} → ${reAv})`
        : `sin costo de retorno estimado (${reBv} → ${reAv})`;
    verdictText = `El recorte propuesto es una decisión de riesgo, no de retorno: baja la volatilidad (${volBv} → ${volAv}), ${costClause}. Es el precio de no depender tanto de una sola posición.`;
  } else {
    verdict = 'sin-mejora';
    verdictText = 'Los movimientos propuestos son decisiones tuyas (manuales o sugerencias aceptadas); por retorno/riesgo, la cartera no mejora de forma material.';
  }

  const narrative = buildNarrative(scored, before, after, extractions, allocations, verdictText, {
    pendingExams,
    watchAlerts,
    cashHeldUsd,
  });
  return {
    assets: sorted,
    extractions,
    allocations,
    fundsToReallocate,
    cashHeldUsd,
    cashNote,
    pendingExams,
    watchAlerts,
    suggestionCandidates,
    before,
    after,
    finalAssets,
    verdict,
    verdictText,
    narrative,
  };
}


/**
 * Evaluación escrita de la cartera: la nota de un profesional de
 * portafolios, generada desde códigos de motivo estructurados. Cada
 * afirmación está atada a un dato del motor: núcleo que se mantiene y
 * por qué, salidas con su motivo en lenguaje llano, destinos con su
 * motivo, caja deliberada si la hay y exámenes de balance que pueden
 * cambiar el plan (con fechas).
 */
export function buildNarrative(
  assets: AssetScore[],
  before: PortfolioMetrics,
  after: PortfolioMetrics,
  extractions: Extraction[],
  allocations: Allocation[],
  verdictText: string,
  extras?: {
    pendingExams?: PendingExam[];
    watchAlerts?: WatchAlert[];
    cashHeldUsd?: number;
  }
): string[] {
  const out: string[] = [];
  const pendingExams = extras?.pendingExams ?? [];
  const watchAlerts = extras?.watchAlerts ?? [];
  const cashHeldUsd = extras?.cashHeldUsd ?? 0;
  const stocks = assets.filter((a) => !a.isCrypto && !a.isCash);
  const top = [...assets].sort((x, y) => y.weightPct - x.weightPct).slice(0, 3);
  const best = [...stocks].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))[0];
  const worst = [...stocks].sort((x, y) => (x.score ?? 100) - (y.score ?? 100))[0];
  const extractedTickers = new Set(
    extractions.filter((e) => e.kind !== 'efectivo').map((e) => e.ticker)
  );
  const coreTouched = top.some((a) => extractedTickers.has(a.ticker));

  // 1) Situación y núcleo
  out.push(
    `Tu cartera vale ${fmtUsd(before.totalValue)} en ${before.positions} posiciones y, con los precios y fundamentos de hoy, rinde un estimado de ${fmtPct1(before.expectedReturnGeoPct)} anual: duplicaría en unos ${fmtY(before.yearsToDouble)} años. Las tres posiciones más grandes (${top.map((a) => `${a.ticker} ${fmtPct1(a.weightPct)}`).join(', ')}) concentran el ${fmtPct1(before.top3WeightPct)} del total${coreTouched ? '' : ' y ninguna tiene motivo de salida: el núcleo se mantiene intacto'}. Tu mejor oportunidad según el score (que manda la capacidad de duplicar, con ajustes acotados por calidad, precio, confianza y riesgo) es ${best?.ticker} (${best?.score}/100) y la más débil, ${worst?.ticker} (${worst?.score}/100).`
  );

  // 2) Concentración sectorial
  if (before.topSectorPct >= 45) {
    out.push(
      `El punto más delicado es la concentración: el sector ${before.topSector} pesa ${fmtPct1(before.topSectorPct)} de la cartera. No es un problema hoy si la tesis se mantiene, pero significa que un mal ciclo de ese sector define casi la mitad de tu resultado. La mejora no pasa por salir del sector, sino por rotar dentro de él hacia las empresas con mejor score.`
    );
  } else {
    out.push(
      `La concentración sectorial es razonable: el mayor sector (${before.topSector}) pesa ${fmtPct1(before.topSectorPct)}. El índice de concentración (HHI) es ${Math.round(before.hhi)}, compatible con una cartera concentrada pero no extrema.`
    );
  }

  // 3) Riesgo (Euler)
  const topRisk = [...assets]
    .filter((a) => a.riskContributionPct != null)
    .sort((x, y) => (y.riskContributionPct ?? 0) - (x.riskContributionPct ?? 0))
    .slice(0, 2);
  if (topRisk.length) {
    out.push(
      `En riesgo, la volatilidad estimada es ${fmtPct1(before.volatilityPct)} anual. No la aportan las posiciones más grandes sino las más volátiles: ${topRisk.map((a) => `${a.ticker} explica el ${fmtPct1(a.riskContributionPct ?? 0)} del riesgo total`).join(' y ')}. Por eso la optimización valida cada movimiento contra el riesgo total (descomposición de Euler): un cambio solo se propone si no lo empeora.`
    );
  }

  // 3b) Coherencia precio ↔ retorno (R11): un activo entre los que
  // más rápido duplican cuyo valor justo está POR DEBAJO del precio
  // no está arriba «por barato»: está arriba porque el modelo le cree
  // al crecimiento y al consenso. Eso se dice explícito, con las
  // causas, para que la tabla nunca se lea al revés.
  const byDoubling = [...stocks]
    .filter((a) => a.yearsToDouble != null)
    .sort((x, y) => (x.yearsToDouble ?? Infinity) - (y.yearsToDouble ?? Infinity))
    .slice(0, 3);
  const incoherent = byDoubling.filter(
    (a) => a.fvRaw != null && a.fvRaw > 0 && a.price > a.fvRaw
  );
  for (const a of incoherent) {
    const causes: string[] = [];
    if (a.gkGrowthPct != null && a.gkGrowthPct > 0) {
      causes.push(`el crecimiento estimado de sus ganancias (${fmtPct1(a.gkGrowthPct)} anual)`);
    }
    if (a.consensusPct != null && a.consensusPct > 0) {
      causes.push(`el consenso de analistas, que espera una suba de ${fmtPct1(a.consensusPct)} a un año`);
    }
    out.push(
      `Ojo con ${a.ticker}: está entre los que más rápido duplican (${fmtY(a.yearsToDouble)} años) aunque su valor justo (${fmtUsd(a.fvRaw as number)}) está por debajo del precio (${fmtUsd(a.price)}). No está arriba por barato: el ranking le cree a ${causes.length ? causes.join(' y a ') : 'su crecimiento estimado'}. Si eso no se cumple, el puesto no se sostiene — es la posición más exigente de la tabla, no la más segura.`
    );
  }

  // 3c) Ajustes de score llamativos: el score lo domina la capacidad
  // de duplicar; cuando el ajuste acotado (±15 pts) mueve mucho a un
  // activo visible, la nota nombra el motivo (directiva 2026-11-03:
  // ninguna diferencia score↔duplicación sin explicación).
  const notableAdj = [...stocks]
    .filter(
      (a) =>
        a.scoreAdjustmentPts != null &&
        Math.abs(a.scoreAdjustmentPts) >= SCORE_ADJUSTMENT_NOTABLE_PTS &&
        a.scoreAdjustmentDriver != null &&
        a.score != null &&
        a.scoreVelocity != null
    )
    .sort((x, y) => Math.abs(y.scoreAdjustmentPts ?? 0) - Math.abs(x.scoreAdjustmentPts ?? 0))
    .slice(0, 2);
  for (const a of notableAdj) {
    const pts = a.scoreAdjustmentPts as number;
    out.push(
      `El score de ${a.ticker} (${a.score}/100) ${pts < 0 ? 'queda' : 'sube'} ${fmtPct1(Math.abs(pts)).replace('%', '')} puntos ${pts < 0 ? 'por debajo' : 'por encima'} de lo que marca su sola capacidad de duplicar, por ${a.scoreAdjustmentDriver}. El ajuste está acotado (±${SCORE_ADJUSTMENT_BAND_PTS} puntos): premia o castiga, pero no cambia el titular — la tabla se ordena por años para duplicar y el score acompaña ese orden.`
    );
  }

  // 4) Salidas, por tipo de motivo
  const thesisExits = extractions.filter((e) => e.reasonCode === 'tesis-deteriorada');
  const ruleExits = extractions.filter((e) =>
    ['veredicto-vender', 'score-bajo', 'reemplazo-sectorial', 'concentracion', 'bajo-retorno'].includes(e.reasonCode)
  );
  const userExits = extractions.filter((e) => ['manual', 'sugerencia'].includes(e.reasonCode));
  if (thesisExits.length) {
    const parts = thesisExits.map(
      (e) =>
        `${e.ticker} (${e.kind === 'total' ? 'salida total' : 'salida parcial'}, ${fmtUsd(e.grossUsd)}): ${(e.thesisSignals ?? []).map((s) => THESIS_SIGNAL_TEXT[s]).join('; ')}`
    );
    out.push(
      `Salidas por tesis deteriorada — no por precio, sino por fundamentos medibles: ${parts.join(' · ')}. Cuando dos o más señales de deterioro coinciden, la experiencia dice que el problema rara vez se arregla esperando: se sale y se reevalúa con la plata afuera.`
    );
  }
  if (ruleExits.length) {
    const deltaRE = after.expectedReturnGeoPct - before.expectedReturnGeoPct;
    const [reB, reA] = fmtPairPct(before.expectedReturnGeoPct, after.expectedReturnGeoPct);
    const [yB, yA] = fmtPairYears(before.yearsToDouble, after.yearsToDouble);
    const [vB, vA] = fmtPairPct(before.volatilityPct, after.volatilityPct);
    const yearsClause =
      yB === yA
        ? `el tiempo para duplicar se mantiene en ${yB} años`
        : `el tiempo para duplicar ${after.yearsToDouble! < before.yearsToDouble! ? 'baja' : 'sube'} de ${yB} a ${yA} años`;
    const destTxt = allocations.length
      ? `y reaplicándolo en ${allocations.map((a) => a.ticker).join(', ')}`
      : 'y dejándolo en efectivo';
    const moves = `liberando ${fmtUsd(ruleExits.reduce((s, e) => s + e.netUsd, 0))} desde ${ruleExits.map((e) => `${e.ticker} (${e.reason.toLowerCase()})`).join(', ')} ${destTxt}, el retorno estimado ${deltaRE >= 0 ? 'pasa' : 'queda'} de ${reB} a ${reA} y ${yearsClause}, con un riesgo de ${vA} (antes ${vB})`;
    if (deltaRE >= 0.25) {
      out.push(`Las posibilidades de mejora están en la cola de la cartera: ${moves}.`);
    } else {
      out.push(
        `La rotación que disparan las reglas es marginal (un ajuste fino, no un cambio de panorama): ${moves}.`
      );
    }
  }
  if (userExits.length) {
    out.push(
      `Además registraste movimientos propios (${userExits.filter((e) => e.kind !== 'efectivo').map((e) => e.ticker).join(', ') || 'efectivo nuevo'}): son decisiones tuyas y el motor solo verifica que no rompan el equilibrio riesgo/beneficio.`
    );
  }
  if (!extractions.length) {
    out.push(
      'No aparecen rotaciones con fundamento suficiente: ninguna posición combina deterioro de tesis, score bajo con sobreprecio contra su valor justo o un par sectorial claramente mejor. Mantener también es una decisión.'
    );
  }

  // 5) Destinos y caja deliberada
  if (allocations.length) {
    const parts = allocations.map(
      (a) =>
        `${a.ticker} (${fmtUsd(a.amountUsd)}${a.isNew ? ', posición nueva' : ''}, score ${a.score ?? '—'})`
    );
    out.push(
      `El dinero liberado va a los destinos que superan el listón — score de al menos 65, valor justo formado por las dos estimaciones (fórmula y consenso) y sin balance en puerta: ${parts.join(' · ')}.`
    );
  }
  if (cashHeldUsd >= 250) {
    out.push(
      `Quedan ${fmtUsd(cashHeldUsd)} en efectivo de forma deliberada: ningún destino adicional supera el listón hoy, y forzar el redespliegue comprando «lo menos malo» suele salir más caro que esperar. La caja se reevalúa con los próximos balances.`
    );
  }

  // 6) Exámenes próximos y vigilancia
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fmtDate = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[3])}-${MONTHS[Number(m[2]) - 1]}` : iso;
  };
  if (pendingExams.length) {
    const parts = pendingExams.map(
      (p) =>
        `${p.ticker} (balance el ${fmtDate(p.date)}${p.thesisSignals.length ? '; con señales de deterioro en vigilancia' : ''})`
    );
    out.push(
      `Decisiones diferidas a examen: ${parts.join(' · ')}. Con el balance a menos de una semana, comprar o vender antes es apostar al número en vez de analizarlo: esas posiciones se reevalúan con el resultado publicado.`
    );
  }
  if (watchAlerts.length) {
    const parts = watchAlerts.map(
      (w) => `${w.ticker} (${w.thesisSignals.map((s) => THESIS_SIGNAL_TEXT[s]).join('; ')})`
    );
    out.push(
      `En vigilancia, sin movimiento: ${parts.join(' · ')}. Una sola señal no alcanza para vender; si aparece una segunda, la posición pasa a candidata de salida.`
    );
  }

  out.push(verdictText + ' Esto es una estimación con datos públicos y metodología documentada (ícono de información en cada métrica): no es asesoramiento financiero.');
  return out;
}
