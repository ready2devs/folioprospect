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
 * De RE salen los años para duplicar = ln2/ln(1+RE), que ORDENAN
 * la tabla. El Score 0–100 es otra cosa desde la redefinición del
 * usuario (2026-11-03 11:23): mide la CONFIANZA en esa predicción
 * — acuerdo entre las patas del FV, acuerdo entre fuentes,
 * volatilidad, ancla de caja y techo para estimaciones
 * sospechosas — y no contiene velocidad ni oportunidad. Las
 * reglas internas que necesitaban retorno/oportunidad usan el
 * RE y el gap precio/FV directamente (ver R12.1 en los docs).
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
 *
 * R12 (mismo día, a pedido del usuario): cuatro correcciones que no
 * tocan ninguna estimación. (1) La escala de velocidad del score se
 * recalibró: la anterior saturaba en 100 para todo RE ≥ 35% (en vivo
 * 7–8 activos compartían el máximo y el score no discriminaba la
 * parte alta); la nueva es la recta por RE 15% ⇒ 50 puntos y
 * RE 75% ⇒ 100, para que el 100 sea excepcional. (2) Vista prudente:
 * cada activo expone además su retorno si la convergencia apuntara
 * al escenario PESIMISTA del FV (el piso de su rango) y la cartera
 * su métrica prudente: es otra LECTURA de los mismos escenarios, no
 * otro cálculo — la propuesta y la vista esperada no cambian.
 * (3) El régimen del ancla de GK se clasifica por el crecimiento de
 * ventas FUTURO de consenso (respaldo documentado: el trailing TTM)
 * y la frontera entre regímenes deja de ser un interruptor: en una
 * banda de ±5 pp alrededor del umbral las dos anclas se mezclan
 * linealmente, para que un refresco de estimaciones no pueda partir
 * el retorno de un activo de una lectura a la otra (defecto SIMO).
 * (4) Ancla de caja real: si el flujo de caja libre de los últimos
 * 12 meses reportados (TTM) fue negativo, el ajuste del score resta
 * hasta −6 puntos DENTRO de la misma banda ±15 — un ancla en la
 * realidad frente a las promesas de crecimiento que no toca ni el
 * FV ni el RE; las financieras quedan fuera de la métrica y la
 * ausencia de dato no castiga (R0). Además, la UI muestra por fin
 * señales que el motor ya computaba: la marca de caja, el driver
 * del ajuste en la tarjeta y la bandera modelSuspect («Estimación
 * a revisar») en tarjeta y ficha.
 * A nivel cartera el RE es GEOMÉTRICO: se
 * resta el arrastre de volatilidad σ²/2 (Invesco CMA). TODO el
 * riesgo (volatilidades, correlaciones, Euler: MCTR y PCTR por
 * activo) sale del módulo único de riesgo (riskMatrix.ts):
 * mediciones desde el historial de precios con shrinkage hacia
 * los priors de bloque, que ordenan desempates de extracción,
 * validan swaps y alimentan el score de confianza.
 *
 * Sin dependencias de red: lo alimentan el servidor (Yahoo + Finviz) y lo
 * consumen el cliente y los tests. Cripto y caja quedan fuera del score, con
 * retorno supuesto explícito, y no se proponen ventas automáticas de cripto.
 */
import { scoreFor, starsFor, normalizeUncertainty, type UncertaintyLevel } from './opportunity.js';
import {
  buildRiskMatrix,
  volForSpec,
  RISK_FREE_PCT,
  type DatedClose,
  type RiskAssetSpec,
  type RiskMatrix,
} from './riskMatrix.js';
import {
  cashRegimeFor,
  type CashComponents,
  type CashRegime,
  type CashRegimeInfo,
} from './cashRegime.js';

export type { CashComponents, CashRegime, CashRegimeInfo } from './cashRegime.js';

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
  /** Retorno supuesto EXPLÍCITO anual % (cripto/caja): solo
   *  entra si alguien lo declara como supuesto; sin él, la
   *  caja rinde 0 y la cripto queda fuera de la predicción
   *  (R13: nada de defaults inventados por el motor). */
  assumedReturnPct?: number | null;
  dividendYieldPct?: number | null;
  /** Crecimiento de ganancias TOTALES % (ancla GK anti doble conteo). */
  earningsGrowthTotalPct?: number | null;
  epsNextYearPct?: number | null;
  epsNext5YPct?: number | null;
  salesGrowthPct?: number | null;
  /** Crecimiento de ventas FUTURO de consenso % anual (estimaciones
   *  de ingresos del próximo año vs el actual: Yahoo earningsTrend +
   *  pronóstico de TradingView, promediados — la misma definición que
   *  el motor de FV usa para su chequeo de ingresos). Desde R12 es la
   *  serie que CLASIFICA el régimen del ancla de GK: el futuro manda
   *  también acá. `salesGrowthPct` (TTM trailing de Finviz) queda
   *  como respaldo documentado cuando el forward no está. */
  salesGrowthForwardPct?: number | null;
  /** Flujo de caja libre TTM (US$) tal cual lo sirve el proveedor,
   *  ANTES de cualquier reparación de la capa de datos. Desde R12.3
   *  ya NO es el insumo directo del ancla de caja: es su CHEQUEO
   *  CRUZADO y su respaldo. La reparación que completa un TTM
   *  faltante/negativo con el flujo anual auditado sirve al ancla
   *  histórica del FV y tampoco pisa este dato. */
  fcfTtmUsd?: number | null;
  /** FCF de los últimos 12 meses RESUELTO para el ANCLA DE CAJA REAL
   *  (R12.3, resuelto por la capa de datos en server/cashAnchor.ts):
   *  la fuente primaria son los ESTADOS REPORTADOS (derivación EDGAR
   *  desde los trimestres presentados), porque el ancla mide un hecho
   *  reportado y el campo TTM del proveedor demostró venir roto
   *  (GOOG con el signo invertido respecto de sus balances). El campo
   *  del proveedor solo manda como respaldo documentado cuando los
   *  reportados no permiten reconstruir la ventana. Solo importa el
   *  SIGNO del valor resuelto: quemar caja en la ventana móvil es un
   *  hecho que no se mueve con refrescos de estimaciones, a
   *  diferencia del año fiscal cerrado (que puede cerrar positivo
   *  con un TTM ya negativo, caso SIMO). null/ausente = sin
   *  resolución (el ancla cae al fcfTtmUsd histórico). */
  fcfTtmResolvedUsd?: number | null;
  /** Procedencia del FCF resuelto del ancla. */
  fcfTtmSource?: 'reportado' | 'proveedor' | null;
  /** Cierre de la ventana reportada usada (si la fuente es la
   *  reportada), para la ficha. */
  fcfTtmPeriodEnd?: string | null;
  /** El proveedor difería del reportado en signo o en más de 2,5×:
   *  mandó el reportado y la discrepancia queda registrada. */
  fcfTtmDiscrepancy?: boolean;
  /** EDGAR solo pudo ofrecer el año fiscal cerrado (ventana
   *  distinta de la móvil): hueco documentado del respaldo. */
  fcfTtmEdgarFyOnlyGap?: boolean;
  /** ===== FASE 2: componentes reportados del flujo (EDGAR:
   *  OCF, SBC, CapEx, D&A e ingresos de la MISMA ventana) que
   *  alimentan los REGÍMENES DE CAJA (cashRegime.ts). Viven
   *  SOLO en el score (factor M_cash) y en la elegibilidad de
   *  destinos: jamás en el FV ni en el RE. Ausente = régimen
   *  'sin-dato' (M = 1, sin castigo — R0). ===== */
  cashComponents?: CashComponents | null;
  /** ΔS % anual: positivo = emite acciones (diluye), negativo = recompra. */
  dilutionPct?: number | null;
  /** Procedencia del ΔS resuelto (server/dilution.ts, reparación
   *  2026-11-03): 'reportado' = conteo de acciones en circulación de
   *  los estados (primario); 'proveedor' = respaldo de la serie de
   *  promedio ponderado; null = sin término (sin dato o conflicto de
   *  signo irresoluble, con el motivo en dilutionGap). */
  dilutionSource?: string | null;
  /** La serie de promedio ponderado (cruce y respaldo). */
  dilutionSeriesPct?: number | null;
  /** La variación desde conteos reportados, si existe. */
  dilutionReportedPct?: number | null;
  /** La serie contradecía en signo al conteo reportado. */
  dilutionDiscrepancy?: boolean;
  /** Por qué no mandó la fuente primaria, cuando aplica. */
  dilutionGap?: string | null;
  forwardPe?: number | null;
  industryForwardPe?: number | null;
  fvPesimista?: number | null;
  fvBase?: number | null;
  fvOptimista?: number | null;
  uncertainty?: string | null;
  analystTarget?: number | null;
  volatilityPct?: number | null; // anual %
  beta?: number | null;
  /** Historial de precios (cierres fechados, ~1 año diario) que
   *  alimenta el módulo único de riesgo: volatilidad y
   *  correlaciones MEDIDAS. Sin él, el módulo usa sus respaldos. */
  priceHistory?: DatedClose[] | null;
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
  /** ===== Momentum (R14): datos que la app YA ingiere y que SOLO
   *  alimentan el tilt de momentum del score (0 a +5 pts). Sin
   *  dato, el tilt vale 0 (R0): nunca se inventa. ===== */
  /** Distancia % del precio a la SMA50 (Finviz). */
  sma50DistPct?: number | null;
  /** Distancia % del precio a la SMA200 (Finviz). */
  sma200DistPct?: number | null;
  /** RSI(14) (Finviz): el freno de euforia del tilt. */
  rsi14?: number | null;
  /** Rendimiento del último año % (Finviz «Perf Year»). */
  perfYearPct?: number | null;
  /** Revisiones de EPS +1y al alza, últimos 30 días (Yahoo). */
  epsRevisionUp30?: number | null;
  /** Revisiones de EPS +1y a la baja, últimos 30 días (Yahoo). */
  epsRevisionDown30?: number | null;
  /** ===== FASE 1: insumos de la credibilidad del consenso y
   *  del prior de correlación por región. SOLO alimentan la
   *  CERTEZA y los priors de riesgo: jamás el FV ni el RE
   *  (doctrina: prohibido descontar el target en la capa de
   *  retorno). ===== */
  /** Cantidad de analistas detrás del target promedio (el
   *  mayor conteo confiable entre las fuentes que ya lo
   *  publican: Yahoo financialData y el motor de FV). */
  analystCount?: number | null;
  /** Mínimo del rango de targets publicado (multifuente: el
   *  menor de los mínimos de Yahoo y TradingView). */
  analystTargetLow?: number | null;
  /** Máximo del rango de targets publicado (el mayor de los
   *  máximos de Yahoo y TradingView). */
  analystTargetHigh?: number | null;
  /** País de la sede (Yahoo assetProfile.country vía la capa
   *  de datos): alimenta SOLO el prior de correlación
   *  sector×región del módulo de riesgo. null si la fuente no
   *  lo trae de forma confiable. */
  region?: string | null;
}

export interface ScoredPeer {
  symbol: string;
  ticker: string;
  name: string;
  industry: string;
  price: number;
  /** SCORE del par = su RATING DE TRANQUILIDAD (adopción F1b):
   *  el listón de destinos lo lee a él. */
  score: number;
  /** Sub-índice de CERTEZA del par: insumo del rating y prosa. */
  certaintyScore?: number | null;
  /** Estrellas de OPORTUNIDAD del par (precio/FV, adopción F1b):
   *  las hereda la fila final si el par entra como posición nueva. */
  stars?: number | null;
  expectedReturnPct: number;
  volatilityPct?: number | null;
  /** Mismo listón que las posiciones propias cuando actúa de destino. */
  fvConfidence?: 'Alta' | 'Media' | 'Baja' | null;
  fvComponentCount?: number | null;
  fvToPrice?: number | null;
  /** Historial de precios para la matriz de riesgo (correlaciones
   *  medidas del par si llega a entrar a la cartera propuesta). */
  priceHistory?: DatedClose[] | null;
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
  /** Peso (0–100) del ancla de crecimiento dentro del ancla mezclada
   *  de R12: 100 = ancla de ventas pura, 0 = sustentable pura; los
   *  valores intermedios son la banda de transición entre regímenes. */
  growthAnchorBlendPct: number | null;
  /** Qué serie clasificó el régimen: las ventas futuras de consenso
   *  ('forward') o, en su defecto, el trailing TTM ('trailing'). */
  growthRegimeBasis: GrowthRegimeBasis | null;
  /** RE anual estimado % (aritmético por activo). */
  expectedReturnPct: number | null;
  /** Piso de cordura Gordon: D/P + g acotado. */
  gordonFloorPct: number | null;
  belowGordonFloor: boolean;
  /** SCORE TITULAR (ADOPCIÓN F1b): el RATING DE TRANQUILIDAD
   *  (tranquilityRatingFor) — qué tan seguro es que el activo
   *  cumpla sus previsiones. NO es oportunidad ni velocidad:
   *  la oportunidad son las estrellas y la velocidad es la
   *  columna de años a duplicar. */
  score: number | null;
  /** ESTRELLAS = OPORTUNIDAD (adopción F1b): bandas precio/FV
   *  por incertidumbre (opportunityStarsFor), las mismas de la
   *  ficha. NO salen del score: el rating no se filtra acá. */
  stars: number | null;
  yearsToDouble: number | null;
  /** Vista prudente (R12): el MISMO retorno triangulado pero con la
   *  convergencia apuntando al escenario pesimista del FV (el piso
   *  de su rango, fvPesimista) en vez del FV base. GK y consenso no
   *  dependen del FV y no cambian. Es una lectura alternativa de los
   *  escenarios que el motor ya computa: no altera ningún número de
   *  la vista esperada ni la propuesta. */
  expectedReturnPessimisticPct: number | null;
  /** Años a duplicar con el retorno prudente. */
  yearsToDoublePessimistic: number | null;
  /** Score en la vista prudente: desde la adopción F1b el
   *  titular es el RATING DE TRANQUILIDAD, que no depende del
   *  retorno de la vista (no compone velocidad): vale lo mismo
   *  en la vista esperada y en la prudente. Se conserva el
   *  campo porque la UI lee el score «de la vista activa». */
  scorePessimistic: number | null;
  /** true si el activo no tiene un escenario pesimista válido
   *  (sin rango de FV): su retorno prudente cae al esperado y la UI
   *  lo marca, para que nadie lea un esperado como si fuera el piso. */
  prudentFallback: boolean;
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
  /** Velocidad de la predicción (el RE en escala 0–100):
   *  INFORMATIVO. Desde la redefinición del score (2026-11-03) no
   *  compone el puntaje: el score es confianza, no velocidad. */
  scoreVelocity: number | null;
  /** DESAPILADO por la redefinición del score (2026-11-03): el
   *  score ya no es «velocidad + ajuste». Quedan en null por
   *  compatibilidad de la API. */
  scoreAdjustmentPts: number | null;
  /** Ídem scoreAdjustmentPts: desapilado, siempre null. */
  scoreAdjustmentDriver: string | null;
  /** Banda del SUB-ÍNDICE DE CERTEZA en palabras (R14): 'alta'
   *  (≥70, «Confianza alta»), 'media' (40–69) o 'a-revisar' (<40
   *  o modelSuspect activo, «Estimación a revisar»). La lee el
   *  análisis del activo; la tarjeta muestra solo el score. */
  certaintyBand: ScoreBand | null;
  /** Sub-puntajes del sub-índice de certeza vF1: acuerdo entre
   *  las patas del FV, credibilidad del consenso de analistas
   *  y acuerdo entre fuentes. El riesgo de desvío YA NO es un
   *  componente: vive en `riskSubscale`. null en filas sin
   *  certeza propia (cripto, caja). */
  certaintyComponents: { legs: number | null; sources: number | null; consensus: number | null } | null;
  /** SUB-ÍNDICE DE CERTEZA vF1 (Fase 1): patas 35 + consenso
   *  35 + fuentes 30, techo 39 si modelSuspect — SOLO
   *  confianza en la predicción (el riesgo salió en vF1 y la
   *  caja salió en la Fase 2). NO es el score titular: es el
   *  insumo principal del RATING (exponente 0,45) y el número
   *  que leen la prosa de firmeza/frágil y el análisis del
   *  activo («cuánto creerle a la predicción»). El listón de
   *  destinos ya no lo lee a él: lee el rating (adopción F1b). */
  certaintyScore: number | null;
  /** Desglose del SCORE titular (ADOPCIÓN F1b): el score es
   *  el RATING DE TRANQUILIDAD — media geométrica ponderada de
   *  la certeza de la predicción (exponente 0,45), la
   *  sub-escala de riesgo de desvío (0,35) y la calidad de
   *  caja Q del régimen (0,20). La caja entra UNA sola vez,
   *  vía Q: el M_cash del viejo score multiplicativo de
   *  velocidad (Fases 1–2, hoy fuera del titular pero
   *  conservado en headlineScoreFor como infraestructura de
   *  auditoría) NO se aplica acá. null en filas sin score
   *  (cripto, caja). */
  scoreBreakdown: RatingBreakdown | null;
  /** Banda del RATING en palabras: 'tranquilidad-alta'
   *  (85–100), 'buena' (70–84), 'media' (50–69) o
   *  'especulativo' (<50, «Especulativo / a revisar»). La lee
   *  el análisis del activo; la tarjeta muestra solo el número. */
  ratingBand: RatingBand | null;
  /** Sub-escala de riesgo de desvío §5.1 (marginal-primero:
   *  PCTR/peso, MCTR y volatilidad propia), 0–100. Desde la
   *  Fase 1 NO forma parte del índice de certeza: es el insumo
   *  del factor de riesgo del score titular. null en filas sin
   *  riesgo propio (cripto, caja). */
  riskSubscale: number | null;
  /** Credibilidad del consenso de analistas (componente NUEVO
   *  de la certeza en Fase 1): puntaje 0–100 y sus tres patas
   *  con los faltantes declarados. null sin ningún insumo. */
  consensusCredibility: {
    score: number;
    countScore: number | null;
    dispersionScore: number | null;
    stickyScore: number | null;
    analystCount: number | null;
    targetDispersionPct: number | null;
    missing: string[];
  } | null;
  /** Tilt de momentum crudo (0 a +5, 1 decimal) y sus patas,
   *  para auditar qué lo produjo. null sin ningún dato. */
  momentum: {
    tiltPts: number;
    priceLeg: number | null;
    revisionLeg: number | null;
    rsiBrake: number;
  } | null;
  /** Marca de caja visible. Desde la FASE 2 se DERIVA DEL
   *  RÉGIMEN de caja (cashRegime): A y B = 'genera-caja' (B con
   *  la nota de CapEx productivo en el payload del régimen),
   *  C y D = 'quema-caja', NA = 'no-aplica'. Solo cuando no hay
   *  componentes para clasificar ('sin-dato') la marca cae al
   *  ancla histórica por signo del FCF resuelto. No entra en el
   *  FV, en el RE ni en el orden por duplicación. */
  cashAnchorState: CashAnchorState;
  /** DESAPILADO en la Fase 2: el reparo de caja ya no resta
   *  puntos — es el factor M_cash del score (scoreBreakdown.
   *  cashMultiplier). Queda en 0 por compatibilidad de la API. */
  cashAnchorPenaltyPts: number;
  /** FASE 2: régimen de caja completo (clasificación,
   *  multiplicador, componentes y patas auditables). null en
   *  filas sin motor de score (cripto/caja conservan su
   *  régimen NA dentro del objeto cuando se computa; las
   *  filas sintéticas de pares nuevos lo traen en null). */
  cashRegime: CashRegimeInfo | null;
  /** El FCF TTM (US$) detrás de la marca, para mostrarlo/auditarlo. */
  cashAnchorFcfTtmUsd: number | null;
  /** Procedencia del FCF del ancla (R12.3): estados reportados ante
   *  la SEC o campo del proveedor (respaldo). */
  cashAnchorSource: 'reportado' | 'proveedor' | null;
  /** Cierre de la ventana reportada usada por el ancla. */
  cashAnchorPeriodEnd: string | null;
  /** El proveedor difería del reportado (signo o > 2,5×): mandó el
   *  reportado y la discrepancia quedó registrada. */
  cashAnchorDiscrepancy: boolean;
  /** El crudo TTM del proveedor, para el cruce visible en la ficha. */
  cashAnchorProviderFcfTtmUsd: number | null;
  /** EDGAR solo ofrecía el año fiscal cerrado (otra ventana). */
  cashAnchorEdgarFyOnlyGap: boolean;
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
  /** Procedencia del ΔS (réplica de los campos del insumo). */
  dilutionSource: string | null;
  dilutionSeriesPct: number | null;
  dilutionReportedPct: number | null;
  dilutionDiscrepancy: boolean;
  dilutionGap: string | null;
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
  reasonCode: 'veredicto-vender' | 'retorno-muy-bajo' | 'reemplazo-sectorial' | 'concentracion' | 'bajo-retorno' | 'manual' | 'sugerencia' | 'tesis-deteriorada';
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
  /** SCORE del destino = su RATING DE TRANQUILIDAD (adopción F1b). */
  score: number | null;
  /** Sub-índice de certeza del destino: lo cita la prosa
   *  de la propuesta («confianza X/100»). */
  certaintyScore?: number | null;
  /** Estrellas de OPORTUNIDAD del destino (solo posiciones
   *  nuevas): la fila final las muestra sin recalcular. */
  stars?: number | null;
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
  /** La cartera ACTUAL bajo la vista prudente (R12): la misma
   *  agregación geométrica que `before`, pero con el retorno
   *  prudente (convergencia al piso del rango) de cada activo. La
   *  volatilidad es la misma: no cambia entre vistas. */
  beforePessimistic: PortfolioMetrics;
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
 *  usuario (corrección 2026-11-03). Desde R12 la serie que se compara
 *  contra el umbral es el crecimiento de ventas FUTURO de consenso
 *  (respaldo: el trailing TTM) y el umbral es el centro de una banda
 *  de transición, no un interruptor (ver GROWTH_REGIME_BLEND_BAND_PP). */
export const GROWTH_REGIME_SALES_PCT = 12.5;
/** Semiancho (pp) de la banda de transición entre regímenes (R12):
 *  con el crecimiento de ventas dentro de umbral ± 5 pp, el ancla de
 *  GK es una MEZCLA LINEAL del ancla de crecimiento (ventas + 10 pp)
 *  y la sustentable (ROIC × reinversión): en el borde inferior manda
 *  la sustentable, en el superior la de ventas, en el centro el
 *  promedio. Fuera de la banda manda el régimen correspondiente, como
 *  siempre. Existe porque la frontera dura dejaba que un refresco de
 *  estimaciones reclasificara a un activo de una lectura a la otra y
 *  le partiera el retorno (SIMO: ancla 114 → 22 y RE 72,6% → 34,6%
 *  entre dos lecturas del mismo día). Decisión de diseño simple. */
export const GROWTH_REGIME_BLEND_BAND_PP = 5;
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

/** Serie que clasificó el régimen (R12): las ventas futuras de
 *  consenso cuando están; el trailing TTM como respaldo documentado. */
export type GrowthRegimeBasis = 'forward' | 'trailing';

/** Ancla de cordura del crecimiento de ganancias, por régimen
 *  (corrección del usuario 2026-11-03; frontera suavizada en R12):
 *  - Empresa en crecimiento: ancla = crecimiento de ventas + margen
 *    de apalancamiento operativo. Las ventas mandan porque una base
 *    de ganancias casi cero (Nebius) convierte cualquier % de EPS en
 *    un número sin sentido, mientras las ventas son la magnitud
 *    económica real que crece.
 *  - Empresa madura: ancla = crecimiento sustentable, g = ROIC ×
 *    reinversión con los reportados del motor; si la reinversión no
 *    se pudo calcular con fiabilidad, el respaldo es la forma equity
 *    ROE × (1 − payout) que la capa de datos precomputa
 *    (`sustainableGrowthPct`).
 *  El ancla es TECHO de cordura, nunca piso: si el consenso implica
 *  menos, manda el consenso. Sin datos para el ancla, no hay ancla y
 *  la estimación entra a valor facial.
 *
 *  R12 — qué serie clasifica y cómo se cruza la frontera:
 *  la clasificación usa el crecimiento de ventas FUTURO de consenso
 *  (`salesGrowthForwardPct`) y solo cae al trailing TTM
 *  (`salesGrowthPct`) cuando el forward no está — el futuro manda
 *  también para decidir el régimen. Y la frontera ya no es un
 *  interruptor: dentro de la banda umbral ± 5 pp, el ancla es la
 *  mezcla lineal de ambas (peso `blendPct` sobre la de crecimiento,
 *  de 0 en el borde inferior a 100 en el superior; en el centro, el
 *  promedio). El régimen informado es el del lado dominante de la
 *  mezcla. Sin ancla sustentable computable no hay con qué mezclar:
 *  rige el interruptor clásico sobre el umbral. */
export function growthAnchorFor(a: OptimizerAssetInput): {
  anchorPct: number;
  regime: GrowthRegime;
  blendPct: number;
  basis: GrowthRegimeBasis | null;
} | null {
  const fwd = a.salesGrowthForwardPct ?? null;
  const sales = fwd ?? a.salesGrowthPct ?? null;
  const basis: GrowthRegimeBasis | null =
    fwd != null ? 'forward' : sales != null ? 'trailing' : null;
  const firm = sustainableGrowthFromRoic(a.roicPct, a.reinvestmentRatePct);
  const sustainable = firm ?? a.sustainableGrowthPct ?? null;
  if (sales == null) {
    // Sin ningún dato de ventas: el ancla sustentable si existe
    // (comportamiento histórico); si no, sin ancla.
    return sustainable != null
      ? { anchorPct: sustainable, regime: 'madura', blendPct: 0, basis }
      : null;
  }
  const growthAnchor = sales + GROWTH_LEVERAGE_SLACK_PP;
  if (sustainable == null) {
    // Sin ancla sustentable no hay mezcla posible: interruptor
    // clásico sobre el umbral.
    return sales > GROWTH_REGIME_SALES_PCT
      ? { anchorPct: growthAnchor, regime: 'crecimiento', blendPct: 100, basis }
      : null;
  }
  const lo = GROWTH_REGIME_SALES_PCT - GROWTH_REGIME_BLEND_BAND_PP;
  const hi = GROWTH_REGIME_SALES_PCT + GROWTH_REGIME_BLEND_BAND_PP;
  const w = clamp((sales - lo) / (hi - lo), 0, 1);
  return {
    anchorPct: w * growthAnchor + (1 - w) * sustainable,
    regime: w >= 0.5 ? 'crecimiento' : 'madura',
    blendPct: Math.round(w * 100),
    basis,
  };
}

export interface GrinoldKronerParts {
  total: number | null;
  /** Crecimiento efectivamente usado en GK (tras el ancla). */
  growthUsedPct: number | null;
  /** Ancla de cordura aplicada (techo), si hubo. */
  growthAnchorPct: number | null;
  growthRegime: GrowthRegime | null;
  /** Peso de la ancla de crecimiento en la mezcla de R12 (0–100). */
  growthAnchorBlendPct: number | null;
  /** Serie que clasificó el régimen: forward o trailing (R12). */
  growthRegimeBasis: GrowthRegimeBasis | null;
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
    return {
      total: null, growthUsedPct: null, growthAnchorPct: null, growthRegime: null,
      growthAnchorBlendPct: null, growthRegimeBasis: null, growthBasePct: null,
    };
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
    growthAnchorBlendPct: anchor?.blendPct ?? null,
    growthRegimeBasis: anchor?.basis ?? null,
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

/** Rating de tranquilidad mínimo para recibir fondos (ADOPCIÓN
 *  F1b, 2026-11-03): hasta la Fase 2 el listón de destinos leía
 *  el SUB-ÍNDICE DE CERTEZA (≥ 65); con el score convertido en
 *  RATING DE TRANQUILIDAD, el listón lee el rating — la pregunta
 *  que hace una asignación de fondos nueva es «¿es un activo
 *  tranquilo, que cumple sus previsiones?», y esa es exactamente
 *  la pregunta del rating (certeza de la predicción × riesgo de
 *  desvío × calidad de caja). El valor (65) no cambió. La
 *  certeza sigue existiendo como sub-índice: alimenta el rating
 *  y la leen la prosa de firmeza/frágil y el análisis del activo. */
export const DESTINATION_MIN_RATING = 65;

/** Bandas del sub-índice de certeza (redefinición 2026-11-03):
 *  ≥ 70 «Confianza alta» · 40–69 «Confianza media» · < 40
 *  «Estimación a revisar». Decisiones de diseño simple, calibradas
 *  para que la cartera real no quede toda en una misma banda. */
export const SCORE_CONFIDENCE_HIGH = 70;
export const SCORE_CONFIDENCE_LOW = 40;
/** Techo cuando `modelSuspect` está activo: un activo con las
 *  fuentes en contradicción extrema no puede quedar en banda
 *  alta ni media — su banda es «a revisar» por definición. El
 *  techo pisa el sub-índice de certeza Y el score titular (R14:
 *  la sospecha es una restricción de ambos). */
export const SUSPECT_SCORE_CAP = 39;

export type ScoreBand = 'alta' | 'media' | 'a-revisar';

export function scoreBandFor(score: number | null, modelSuspect: boolean): ScoreBand | null {
  if (score == null) return null;
  if (modelSuspect) return 'a-revisar';
  if (score >= SCORE_CONFIDENCE_HIGH) return 'alta';
  if (score >= SCORE_CONFIDENCE_LOW) return 'media';
  return 'a-revisar';
}

/** ============================================================
 *  RATING DE TRANQUILIDAD — EL SCORE TITULAR (ADOPCIÓN F1b,
 *  aprobada por el dueño el 2026-11-03 22:55; definición suya
 *  de las 22:22): el score NO mide oportunidad — eso ya lo
 *  cubren las ESTRELLAS de la ficha (precio vs valor justo) y
 *  la VELOCIDAD (potencial y ritmo de revalorización, la
 *  columna de años a duplicar). El score mide qué tan seguro
 *  es que el activo cumpla sus previsiones, estimaciones y
 *  guidance, sin contratiempos: un RATING, como el crediticio
 *  de un bono. Que un activo tranquilo sin upside tenga score
 *  alto es correcto en esta semántica (un bono AAA rinde poco
 *  y es el más seguro).
 *
 *    rating = 100 × (certeza/100)^0,45 × (riesgo/100)^0,35
 *                  × (Q_caja/100)^0,20
 *
 *  Media geométrica ponderada (los exponentes suman 1): la
 *  certeza manda (es la pata «cumplimiento de previsiones»),
 *  el riesgo de desvío (sub-escala marginal §5.1) segundo y la
 *  calidad de caja (Q del régimen de la Fase 2) entra UNA sola
 *  vez — acá NO se aplica el M_cash del multiplicativo: la
 *  caja no se cobra dos veces. Sin tilt de momentum (el
 *  momentum es ritmo, no tranquilidad). Techo 39 si
 *  modelSuspect, clamp [0,100] — igual que los scores previos.
 *  Componente ausente (sin certeza o sin sub-escala de
 *  riesgo): su exponente se reparte entre los presentes
 *  (renormalización de la media geométrica) y el faltante
 *  queda visible en el desglose — la ausencia de dato no
 *  castiga ni regala (R0). Si no hay NINGÚN componente, el
 *  rating es null.
 *  ============================================================ */
export const RATING_CERTAINTY_EXPONENT = 0.45;
export const RATING_RISK_EXPONENT = 0.35;
export const RATING_CASH_EXPONENT = 0.2;
/** Calidad de caja Q por régimen (Fase 2): A pleno (caja real
 *  verificada), B casi pleno (CapEx productivo verificado),
 *  C/D castigan fuerte (ilusión SBC / quema), NA y sin-dato
 *  neutros-altos (la métrica no aplica o falta: no es demérito). */
export const RATING_CASH_QUALITY: Record<CashRegime, number> = {
  A: 100,
  B: 85,
  C: 40,
  D: 20,
  NA: 75,
  'sin-dato': 75,
};
/** Bandas del rating (lectura tipo rating crediticio):
 *  85–100 «Tranquilidad alta» · 70–84 «Buena» · 50–69 «Media»
 *  · <50 «Especulativo / a revisar». */
export type RatingBand = 'tranquilidad-alta' | 'buena' | 'media' | 'especulativo';
export const RATING_BAND_LABELS: Record<RatingBand, string> = {
  'tranquilidad-alta': 'Tranquilidad alta',
  buena: 'Buena',
  media: 'Media',
  especulativo: 'Especulativo / a revisar',
};
export function ratingBandFor(rating: number | null): RatingBand | null {
  if (rating == null) return null;
  if (rating >= 85) return 'tranquilidad-alta';
  if (rating >= 70) return 'buena';
  if (rating >= 50) return 'media';
  return 'especulativo';
}

export interface RatingBreakdown {
  certaintyScore: number | null;
  riskSubscale: number | null;
  /** Calidad de caja Q (0–100) derivada del régimen. */
  cashQualityQ: number;
  cashRegime: CashRegime | null;
  certaintyExponent: number;
  riskExponent: number;
  cashExponent: number;
}

export function tranquilityRatingFor(args: {
  certaintyScore: number | null;
  riskSubscale: number | null;
  cashRegime?: CashRegime | null;
  modelSuspect: boolean;
}): { rating: number | null; band: RatingBand | null; breakdown: RatingBreakdown | null } {
  const cashQualityQ = RATING_CASH_QUALITY[args.cashRegime ?? 'sin-dato'];
  // La Q de caja sola no es un rating: sin certeza NI riesgo no
  // hay predicción que calificar — rating null (R0).
  if (args.certaintyScore == null && args.riskSubscale == null) {
    return { rating: null, band: null, breakdown: null };
  }
  const parts: Array<{ value: number; exponent: number }> = [];
  if (args.certaintyScore != null) {
    parts.push({ value: clamp(args.certaintyScore, 0, 100), exponent: RATING_CERTAINTY_EXPONENT });
  }
  if (args.riskSubscale != null) {
    parts.push({ value: clamp(args.riskSubscale, 0, 100), exponent: RATING_RISK_EXPONENT });
  }
  parts.push({ value: cashQualityQ, exponent: RATING_CASH_EXPONENT });
  const totalExp = parts.reduce((s, p) => s + p.exponent, 0);
  if (totalExp <= 0) return { rating: null, band: null, breakdown: null };
  let logSum = 0;
  for (const p of parts) {
    // Un componente en 0 lleva el rating a 0 (media geométrica):
    // se acota a 1 para que el log sea finito y el resultado
    // quede en el piso de la escala, no en NaN.
    logSum += (p.exponent / totalExp) * Math.log(Math.max(p.value, 1) / 100);
  }
  let raw = 100 * Math.exp(logSum);
  if (args.modelSuspect) raw = Math.min(raw, SUSPECT_SCORE_CAP);
  const rating = Math.round(clamp(raw, 0, 100));
  return {
    rating,
    band: ratingBandFor(rating),
    breakdown: {
      certaintyScore: args.certaintyScore,
      riskSubscale: args.riskSubscale,
      cashQualityQ,
      cashRegime: args.cashRegime ?? null,
      certaintyExponent: RATING_CERTAINTY_EXPONENT,
      riskExponent: RATING_RISK_EXPONENT,
      cashExponent: RATING_CASH_EXPONENT,
    },
  };
}

/** ESTRELLAS = OPORTUNIDAD (ADOPCIÓN F1b): las estrellas del
 *  motor se derivan del GAP precio/valor justo con la lógica
 *  de la ficha (opportunity.ts: bandas precio/FV moduladas por
 *  la incertidumbre del motor de FV) — la MISMA cuenta que la
 *  ficha hace con computeOpportunity sobre el FV del motor
 *  (unificación R13), así ficha y Optimizador publican las
 *  mismas estrellas para el mismo activo. Hasta este pase las
 *  estrellas salían del score titular (round(score/20)): con
 *  el score convertido en rating de tranquilidad, ese camino
 *  las habría vuelto «tranquilidad» en silencio. El rating NO
 *  entra acá por ningún camino. Sin FV válido no hay
 *  oportunidad computable: null (R0). */
export function opportunityStarsFor(a: {
  price: number;
  fvBase?: number | null;
  uncertainty?: string | null;
}): number | null {
  if (a.fvBase == null || !(a.fvBase > 0) || !(a.price > 0)) return null;
  return starsFor(a.price / a.fvBase, normalizeUncertainty(a.uncertainty ?? null));
}

/** Velocidad de la predicción (informativo): el RE convertido a
 *  escala 0–100 con la recta de R12 (RE 15% ⇒ 50; RE 75% ⇒ 100).
 *  Desde la redefinición del score (2026-11-03) este número YA NO
 *  compone el score — el score es confianza, no velocidad — y
 *  queda expuesto solo como dato de la predicción. */
export function scoreVelocityFor(rePct: number): number {
  return clamp(((rePct + 45) / 120) * 100, 0, 100);
}

/** Estado del ancla de caja real (R12) de un activo:
 *  - 'genera-caja': su FCF de los últimos 12 meses reportados > 0.
 *  - 'quema-caja': su FCF TTM < 0 → reparo en el score.
 *  - 'sin-dato': no hay FCF TTM disponible → sin reparo (R0: la
 *    ausencia de dato no se castiga).
 *  - 'no-aplica': el FCF no es la métrica del negocio (financieras:
 *    su materia prima es el dinero; cripto y caja) → sin reparo y
 *    sin marca negativa. */
export type CashAnchorState = 'genera-caja' | 'quema-caja' | 'sin-dato' | 'no-aplica';

/** Reparo del ancla de caja real (R12, diseño aprobado 2026-11-03):
 *  −6 puntos si la empresa quemó caja en los últimos 12 meses
 *  reportados. Desde la redefinición del score (2026-11-03) se lee
 *  como lo que es: un componente de CONFIANZA — quemar caja resta
 *  certeza a cualquier predicción; generar caja no suma por encima
 *  de lo neutro (el ancla solo resta, jamás infla: elección de
 *  asimetría documentada). No toca ni el FV ni el RE ni el orden
 *  por duplicación. */
export const CASH_ANCHOR_PENALTY_PTS = 6;

/** El FCF no aplica como métrica cuando el sector o la industria
 *  son financieros (bancos, fintechs de balance, aseguradoras): su
 *  «flujo de caja libre» contable no es comparable al de una empresa
 *  industrial o de servicios. */
const FINANCIAL_LABEL_RE = /financ/i;

export interface CashAnchorInfo {
  state: CashAnchorState;
  penaltyPts: number;
  /** El FCF TTM detrás de la marca: el RESUELTO (R12.3) — el
   *  derivado de los estados reportados si EDGAR pudo reconstruirlo,
   *  el campo del proveedor como respaldo documentado si no. */
  fcfTtmUsd: number | null;
  /** Procedencia del FCF detrás de la marca: 'reportado' (estados
   *  presentados ante la SEC) o 'proveedor' (campo TTM del proveedor
   *  de mercado). null cuando no hay valor (sin dato / no aplica). */
  source: 'reportado' | 'proveedor' | null;
  /** Cierre de la ventana reportada usada (solo fuente reportada). */
  periodEnd: string | null;
  /** El proveedor difería del reportado en signo o en más de 2,5×;
   *  mandó el reportado y la ficha muestra la discrepancia. */
  discrepancy: boolean;
  /** El crudo del proveedor, para mostrar el cruce en la ficha. */
  providerFcfTtmUsd: number | null;
  /** EDGAR solo pudo ofrecer el año fiscal cerrado (otra ventana):
   *  hueco documentado cuando manda el respaldo del proveedor. */
  edgarFyOnlyGap: boolean;
}

/** Núcleo del ancla de caja, usable fuera del optimizador (la ficha
 *  del activo muestra la misma marca con el mismo criterio).
 *  R12.3: si la capa de datos resolvió el ancla (fcfTtmResolvedUsd
 *  presente como clave, aunque sea null), ese valor manda con su
 *  procedencia; sin resolución se usa el campo histórico del
 *  proveedor (compatibilidad con llamadores anteriores). */
export function cashAnchorStateFor(input: {
  sector?: string | null;
  industry?: string | null;
  fcfTtmUsd?: number | null;
  fcfTtmResolvedUsd?: number | null;
  fcfTtmSource?: 'reportado' | 'proveedor' | null;
  fcfTtmPeriodEnd?: string | null;
  fcfTtmDiscrepancy?: boolean;
  fcfTtmEdgarFyOnlyGap?: boolean;
  isCrypto?: boolean;
  isCash?: boolean;
}): CashAnchorInfo {
  const resolved = input.fcfTtmResolvedUsd !== undefined;
  const raw = resolved ? input.fcfTtmResolvedUsd ?? null : input.fcfTtmUsd ?? null;
  const fcf = raw != null && Number.isFinite(raw) ? raw : null;
  const provenance: Pick<CashAnchorInfo, 'periodEnd' | 'discrepancy' | 'providerFcfTtmUsd' | 'edgarFyOnlyGap'> = {
    periodEnd: resolved ? input.fcfTtmPeriodEnd ?? null : null,
    discrepancy: resolved ? !!input.fcfTtmDiscrepancy : false,
    providerFcfTtmUsd:
      input.fcfTtmUsd != null && Number.isFinite(input.fcfTtmUsd) ? input.fcfTtmUsd : null,
    edgarFyOnlyGap: resolved ? !!input.fcfTtmEdgarFyOnlyGap : false,
  };
  const source: CashAnchorInfo['source'] =
    fcf == null ? null : resolved ? input.fcfTtmSource ?? null : 'proveedor';
  if (input.isCrypto || input.isCash) {
    return { state: 'no-aplica', penaltyPts: 0, fcfTtmUsd: null, source: null, periodEnd: null, discrepancy: false, providerFcfTtmUsd: provenance.providerFcfTtmUsd, edgarFyOnlyGap: provenance.edgarFyOnlyGap };
  }
  if (FINANCIAL_LABEL_RE.test(input.sector ?? '') || FINANCIAL_LABEL_RE.test(input.industry ?? '')) {
    return { state: 'no-aplica', penaltyPts: 0, fcfTtmUsd: fcf, source, ...provenance };
  }
  if (fcf == null) return { state: 'sin-dato', penaltyPts: 0, fcfTtmUsd: null, source: null, ...provenance };
  if (fcf < 0) return { state: 'quema-caja', penaltyPts: -CASH_ANCHOR_PENALTY_PTS, fcfTtmUsd: fcf, source, ...provenance };
  return { state: 'genera-caja', penaltyPts: 0, fcfTtmUsd: fcf, source, ...provenance };
}

export function cashAnchorFor(a: OptimizerAssetInput): CashAnchorInfo {
  return cashAnchorStateFor({
    sector: a.sector,
    industry: a.industry,
    fcfTtmUsd: a.fcfTtmUsd,
    fcfTtmResolvedUsd: a.fcfTtmResolvedUsd,
    fcfTtmSource: a.fcfTtmSource,
    fcfTtmPeriodEnd: a.fcfTtmPeriodEnd,
    fcfTtmDiscrepancy: a.fcfTtmDiscrepancy,
    fcfTtmEdgarFyOnlyGap: a.fcfTtmEdgarFyOnlyGap,
    isCrypto: a.isCrypto,
    isCash: a.isCash,
  });
}

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


/** Spec de riesgo de un input (para el módulo único). */
function riskSpecForInput(a: OptimizerAssetInput, basketWeight?: number | null): RiskAssetSpec {
  return {
    key: a.symbol,
    sector: a.sector,
    industry: a.industry,
    region: a.region ?? null,
    isCrypto: !!a.isCrypto,
    isCash: !!a.isCash,
    closes: a.priceHistory ?? null,
    fallbackVolPct: a.volatilityPct ?? null,
    beta: a.beta ?? null,
    basketWeight: basketWeight ?? null,
  };
}

/** Insumos MARGINALES del componente de riesgo de desvío: el
 *  riesgo que la posición le suma a ESTA cartera, según la
 *  descomposición de Euler del módulo único de riesgo. */
export interface ConfidenceMarginalRisk {
  /** MCTR de la posición (%): su riesgo marginal en la cartera. */
  mctrPct?: number | null;
  /** Volatilidad total de la cartera (%) — la escala contra la
   *  que se lee el MCTR (identidad de Euler: es el promedio
   *  ponderado de los MCTR). */
  portfolioVolPct?: number | null;
}

/** Componente de RIESGO DE DESVÍO del score de confianza, desde el
 *  módulo único de riesgo. Desde R13 es MARGINAL-PRIMERO: el
 *  conductor principal es el aporte de la posición a ESTA cartera
 *  — no cuánto se mueve el activo solo, sino cuánto puede desviar
 *  el resultado del portafolio que el usuario efectivamente
 *  tiene. Composición interna de la sub-escala (0–100):
 *   · aporte relativo (peso 40% cuando está el bloque marginal):
 *     PCTR/peso — aportar la mitad del riesgo que el tamaño
 *     sugiere ⇒ ~100; en proporción ⇒ 80; el doble ⇒ 40; el
 *     triple ⇒ 0. Fórmula: 120 − 40 × (PCTR/peso).
 *   · riesgo marginal (peso 35%): MCTR contra la volatilidad de
 *     la cartera — la mitad de σp ⇒ 90; igual a σp ⇒ 60; 1,5×σp
 *     ⇒ 30; 2×σp ⇒ 0. Fórmula: 120 − 60 × (MCTR/σp).
 *   · volatilidad propia (peso 25%, insumo SECUNDARIO): la de
 *     siempre — 100 − (vol − 12) × 2 (vol 12% ⇒ 100; 62% ⇒ 0).
 *  Escalera de disponibilidad (sin dato, ese insumo no castiga —
 *  R0): con PCTR pero sin MCTR, aporte 65% / volatilidad 35%;
 *  con MCTR pero sin PCTR, marginal 60% / volatilidad 40%; sin
 *  bloque marginal (activos fuera de la cartera analizada, p.
 *  ej. pares o la ficha suelta), manda la volatilidad sola. */
export function confidenceRiskComponent(
  volPct: number,
  pctrPct: number | null,
  weightPct?: number | null,
  marginal?: ConfidenceMarginalRisk | null
): number {
  const volScore = clamp(100 - Math.max(0, volPct - 12) * 2, 0, 100);
  const relScore =
    pctrPct != null && weightPct != null && weightPct > 0
      ? clamp(120 - 40 * (pctrPct / weightPct), 0, 100)
      : null;
  const mctrScore =
    marginal?.mctrPct != null && marginal.mctrPct > 0 &&
    marginal?.portfolioVolPct != null && marginal.portfolioVolPct > 0
      ? clamp(120 - 60 * (marginal.mctrPct / marginal.portfolioVolPct), 0, 100)
      : null;
  if (relScore != null && mctrScore != null) {
    return Math.round(0.4 * relScore + 0.35 * mctrScore + 0.25 * volScore);
  }
  if (relScore != null) return Math.round(0.65 * relScore + 0.35 * volScore);
  if (mctrScore != null) return Math.round(0.6 * mctrScore + 0.4 * volScore);
  return Math.round(volScore);
}

interface ConfidenceFields {
  fvConfidence: 'Alta' | 'Media' | 'Baja' | null;
  fvComponentCount: number | null;
  epsSignDisagreement?: boolean;
  fvRangeLow?: number | null;
  fvRangeHigh?: number | null;
  fvBase: number | null;
  fvModelSuspect?: boolean;
  cashPenaltyPts: number;
  /** ===== FASE 1: insumos de la credibilidad del consenso
   *  (solo certeza; nunca FV/RE). Todos opcionales: lo que
   *  falta se declara en `missing` y se renormaliza. ===== */
  analystCount?: number | null;
  analystTarget?: number | null;
  analystTargetLow?: number | null;
  analystTargetHigh?: number | null;
  price?: number | null;
  sma200DistPct?: number | null;
  ret3mPct?: number | null;
  ret6mPct?: number | null;
  epsRevisionUp30?: number | null;
  epsRevisionDown30?: number | null;
}

/** Retorno % de una serie de cierres fechados en los últimos
 *  `tradingDays` días de rueda (63 ≈ 3 meses, 126 ≈ 6 meses).
 *  null si la historia no alcanza. Insumo del detector de
 *  targets pegajosos (certeza), calculado en el motor desde el
 *  MISMO priceHistory que alimenta el riesgo. */
export function trailingReturnPct(
  closes: Array<{ t: number; c: number }> | null | undefined,
  tradingDays: number
): number | null {
  if (!closes) return null;
  const sorted = [...closes].filter((p) => p.c > 0).sort((a, b) => a.t - b.t);
  if (sorted.length <= tradingDays) return null;
  const last = sorted[sorted.length - 1].c;
  const ref = sorted[sorted.length - 1 - tradingDays].c;
  if (!(ref > 0)) return null;
  return (last / ref - 1) * 100;
}

/** ============================================================
 *  CREDIBILIDAD DEL CONSENSO (FASE 1, componente NUEVO de la
 *  certeza, peso 35): cuánto respalda la evidencia al target
 *  promedio que la pata de consenso del RE toma a valor
 *  facial. OJO DOCTRINA: esto NO descuenta ni topa el target
 *  en el FV ni en el RE — mide confianza en la predicción y
 *  vive solo en la certeza (y, vía ella, en el factor de
 *  retención del score). Tres patas, promediadas sobre las
 *  disponibles (sin dato, esa pata no castiga — R0 — y el
 *  faltante se declara):
 *   (a) MASA CRÍTICA: w_N = N/(N+7) × 100 — con N=2 vale 22;
 *       con N=35, 83; con N=58, 89. Un target de 2 analistas
 *       no respalda igual que uno de 50.
 *   (b) ACUERDO: 100·exp(−1,25·max(0, δ−0,20)²), con
 *       δ = (high−low)/mean del rango publicado: un rango de
 *       ±20% no resta; uno del 100% deja el acuerdo en ~61;
 *       uno del 200%, en ~13.
 *   (c) VIGENCIA (sticky): 100 si el upside facial es ≤ 30%
 *       (nada que sospechar). Si el upside es > 30% Y hay
 *       evidencia de caída (retorno 3m/6m negativo o precio
 *       bajo la SMA200) Y la breadth de revisiones de EPS no
 *       es alcista, el target huele a vencido: el factor cae
 *       exponencialmente (exp(−3,2·S)) hacia ~10–30. Si las
 *       revisiones suben (breadth > 0,35), la caída se lee
 *       como oportunidad y el factor es 100 — la señal se
 *       apaga. Sin evidencia de caída computada, la pata es
 *       null (no se inventa sospecha).
 *  ============================================================ */
export const CONSENSUS_COUNT_HALF_MASS = 7;
export const CONSENSUS_DISPERSION_FREE_WIDTH = 0.2;
export const CONSENSUS_DISPERSION_DECAY = 1.25;
export const STICKY_UPSIDE_THRESHOLD = 0.3;
export const STICKY_DECAY = 3.2;

export function consensusCredibilityFor(f: ConfidenceFields): AssetScore['consensusCredibility'] {
  const missing: string[] = [];
  // (a) Masa crítica de analistas.
  let countScore: number | null = null;
  const n = f.analystCount != null && Number.isFinite(f.analystCount) && f.analystCount > 0 ? f.analystCount : null;
  if (n != null) {
    countScore = Math.round((n / (n + CONSENSUS_COUNT_HALF_MASS)) * 100);
  } else {
    missing.push('sin conteo de analistas');
  }
  // (b) Acuerdo por dispersión del rango de targets.
  let dispersionScore: number | null = null;
  let targetDispersionPct: number | null = null;
  const mean = f.analystTarget != null && f.analystTarget > 0 ? f.analystTarget : null;
  if (mean != null && f.analystTargetLow != null && f.analystTargetHigh != null && f.analystTargetHigh > f.analystTargetLow) {
    const delta = (f.analystTargetHigh - f.analystTargetLow) / mean;
    targetDispersionPct = Math.round(delta * 1000) / 10;
    dispersionScore = Math.round(
      100 * Math.exp(-CONSENSUS_DISPERSION_DECAY * Math.pow(Math.max(0, delta - CONSENSUS_DISPERSION_FREE_WIDTH), 2))
    );
  } else {
    missing.push('sin rango de targets');
  }
  // (c) Vigencia (sticky).
  let stickyScore: number | null = null;
  const price = f.price != null && f.price > 0 ? f.price : null;
  const upside = mean != null && price != null ? mean / price - 1 : null;
  if (upside == null) {
    missing.push('sin upside facial computable');
  } else if (upside <= STICKY_UPSIDE_THRESHOLD) {
    stickyScore = 100;
  } else {
    const ret3 = f.ret3mPct != null ? f.ret3mPct / 100 : null;
    const ret6 = f.ret6mPct != null ? f.ret6mPct / 100 : null;
    let dropEvidence: number | null = null;
    if (ret3 != null || ret6 != null) {
      dropEvidence = Math.max(0, -Math.min(ret3 ?? Infinity, 0.7 * (ret6 ?? Infinity)));
    } else if (f.sma200DistPct != null && f.sma200DistPct < 0) {
      // Sin retornos computables, la única evidencia de caída
      // disponible es «cotiza bajo su media de 200 días»: se
      // usa una magnitud mínima declarada (0,05) — la sospecha
      // existe pero su tamaño no se puede medir.
      dropEvidence = 0.05;
      missing.push('caída medida solo por SMA200 (sin retornos 3/6m)');
    }
    if (dropEvidence == null) {
      missing.push('sin evidencia de caída computable para sticky');
    } else if (dropEvidence <= 0) {
      stickyScore = 100; // upside alto SIN caída: nada pegajoso
    } else {
      let breadth: number | null = null;
      if (f.epsRevisionUp30 != null && f.epsRevisionDown30 != null) {
        breadth = (f.epsRevisionUp30 - f.epsRevisionDown30) / (f.epsRevisionUp30 + f.epsRevisionDown30 + 2);
      } else {
        missing.push('sin breadth de revisiones para sticky');
      }
      const breadthFactor = breadth != null ? Math.max(0, 0.35 - breadth) : 0.35;
      const sSticky =
        Math.max(0, (upside - STICKY_UPSIDE_THRESHOLD) / 0.5) * dropEvidence * breadthFactor;
      stickyScore = Math.round(100 * Math.exp(-STICKY_DECAY * sSticky));
    }
  }
  const parts = [countScore, dispersionScore, stickyScore].filter((x): x is number => x != null);
  if (!parts.length) return null;
  return {
    score: Math.round(parts.reduce((s, x) => s + x, 0) / parts.length),
    countScore,
    dispersionScore,
    stickyScore,
    analystCount: n,
    targetDispersionPct,
    missing,
  };
}

/** SUB-ÍNDICE DE CERTEZA (nació como «score = confianza en la
 *  predicción» en la redefinición del usuario 2026-11-03 11:23;
 *  desde R14 es un sub-índice INTERNO: restricción del score
 *  titular y el número de las reglas de fiabilidad — ver
 *  headlineScoreFor). Mide CUÁNTO HAY QUE CREERLE a la
 *  predicción.
 *
 *  FASE 1 (vF1, separación de semánticas pedida en el pase):
 *  la certeza mide SOLO confianza en la predicción y el RIESGO
 *  SALE de su composición — ya vive, una sola vez, en el
 *  factor de riesgo del score titular. Composición vF1:
 *   (1) acuerdo entre las dos patas del FV (la etiqueta de
 *       confianza del motor, que nace de esa dispersión; una
 *       sola pata no puede «acordar» consigo misma: tope 40) — 35
 *   (2) credibilidad del consenso de analistas (NUEVO:
 *       consensusCredibilityFor — masa crítica N, acuerdo por
 *       dispersión del rango de targets y vigencia anti-
 *       sticky; SOLO certeza, jamás descuenta el target en
 *       el FV ni en el RE) — 35
 *   (3) acuerdo entre fuentes: desacuerdo de SIGNO en el EPS
 *       forward (−40) y dispersión del rango de targets
 *       (ancho relativo al FV > 50% empieza a restar, hasta −35) — 30
 *  Pesos renormalizados sobre los componentes disponibles (sin
 *  dato de un componente, ese componente no castiga — R0). Sobre
 *  el índice: modelSuspect pone el techo SUSPECT_SCORE_CAP.
 *  FASE 2: el ancla de caja YA NO resta los −6 acá — la certeza
 *  es confianza pura en la predicción y la caja se cobra una
 *  sola vez como M_cash en el score titular (cashRegime.ts).
 *  El campo cashPenaltyPts de ConfidenceFields queda por
 *  compatibilidad de la firma y se IGNORA (los llamadores
 *  pasan 0).
 *  La sub-escala de riesgo de desvío (confidenceRiskComponent,
 *  §5.1 marginal-primero) se SIGUE calculando acá y se devuelve
 *  como `riskSubscale` — pero ya no entra al índice: alimenta
 *  el factor de riesgo del score y nada más. */
function confidenceFor(
  f: ConfidenceFields,
  volPct: number,
  pctrPct: number | null,
  weightPct?: number | null,
  marginal?: ConfidenceMarginalRisk | null
): {
  score: number | null;
  stars: number | null;
  band: ScoreBand | null;
  components: AssetScore['certaintyComponents'];
  /** Sub-escala de riesgo §5.1 (fuera del índice desde Fase 1). */
  riskSubscale: number | null;
  /** Detalle de la credibilidad del consenso (Fase 1). */
  consensus: AssetScore['consensusCredibility'];
} {
  let legsScore: number | null =
    f.fvConfidence === 'Alta' ? 90 : f.fvConfidence === 'Media' ? 65 : f.fvConfidence === 'Baja' ? 35 : null;
  if (legsScore == null && f.fvComponentCount != null) {
    legsScore = f.fvComponentCount >= 2 ? 55 : 35;
  }
  if (legsScore != null && f.fvComponentCount === 1) {
    legsScore = Math.min(legsScore, 40);
  }
  let sourcesScore: number | null = null;
  if (f.epsSignDisagreement || (f.fvRangeLow != null && f.fvRangeHigh != null)) {
    let s = 85;
    if (f.epsSignDisagreement) s -= 40;
    if (
      f.fvRangeLow != null && f.fvRangeHigh != null &&
      f.fvBase != null && f.fvBase > 0 && f.fvRangeHigh > f.fvRangeLow
    ) {
      s -= clamp(((f.fvRangeHigh - f.fvRangeLow) / f.fvBase - 0.5) * 40, 0, 35);
    }
    sourcesScore = clamp(s, 0, 100);
  }
  const riskScore = confidenceRiskComponent(volPct, pctrPct, weightPct, marginal);
  const consensus = consensusCredibilityFor(f);
  const confDims: Array<{ value: number | null; weight: number }> = [
    { value: legsScore, weight: 35 },
    { value: consensus?.score ?? null, weight: 35 },
    { value: sourcesScore, weight: 30 },
  ];
  const confAvail = confDims.filter((d) => d.value != null);
  if (confAvail.length === 0) return { score: null, stars: null, band: null, components: null, riskSubscale: riskScore, consensus };
  const tw = confAvail.reduce((s, d) => s + d.weight, 0);
  const index = confAvail.reduce((s, d) => s + (d.value as number) * d.weight, 0) / tw;
  // FASE 2: sin reparo de caja en el índice (ver encabezado).
  let raw = clamp(index, 0, 100);
  if (f.fvModelSuspect) raw = Math.min(raw, SUSPECT_SCORE_CAP);
  const score = Math.round(raw);
  return {
    score,
    stars: clamp(Math.round(score / 20), 1, 5),
    band: scoreBandFor(score, !!f.fvModelSuspect),
    components: {
      legs: legsScore != null ? Math.round(legsScore) : null,
      sources: sourcesScore != null ? Math.round(sourcesScore) : null,
      consensus: consensus?.score ?? null,
    },
    riskSubscale: riskScore,
    consensus,
  };
}

/** ============================================================
 *  SCORE TITULAR — EVOLUCIÓN:
 *   - R14 (2026-11-03 12:32): «velocidad de revalorización
 *     restringida al riesgo», ADITIVO: velocidad − (100−riesgo)
 *     ×0,35 − (100−dispersión)×0,30 − 6 de caja + tilt. El
 *     diagnóstico del dueño (15:03) lo condenó: las multas son
 *     puntos fijos mientras la velocidad satura en ~100, así
 *     que una afirmación extrema (NBIS, RE 64%) las pagaba
 *     todas y seguía liderando el score.
 *   - FASE 1 (en sombra, 2026-11-03): MULTIPLICATIVO, la
 *     corrección de principio que el propio dueño propuso:
 *       score = velocidad × fCerteza × fRiesgo + tilt
 *     con fCerteza = (certeza/100)^0,6 y fRiesgo =
 *     (riesgoMarginal/100)^0,4 — factores en (0,1], monótonos.
 *     Como los factores multiplican, ninguna velocidad, por
 *     extrema que sea, «paga» la desconfianza: la conserva en
 *     proporción. Y como ambos factores son ≤ 1, el score
 *     NUNCA supera velocidad + tilt (invariante estructural,
 *     con test). El techo 39 si modelSuspect se mantiene, y
 *     el clamp final [0,100] también.
 *     CALIBRACIÓN (criterio del pase): certeza ~85 y riesgo
 *     ~70 deben conservar ~75–85% de la velocidad → la pareja
 *     de potencias da 0,907 × 0,867 = 78,6% ✓; certeza ~36 y
 *     riesgo ~28 deben conservar ~30–40% → 0,541 × 0,601 =
 *     32,5% ✓. La alternativa «lineal con piso» (0,5+0,5·x)
 *     daba 78,6% en el extremo bueno pero 43,5% en el malo
 *     (fuera de banda: el piso le regalaba retención al peor
 *     caso) — descartada por eso; ver report-fase1.md.
 *   - La CERTEZA que alimenta fCerteza es el sub-índice de
 *     confidenceFor (que desde la Fase 1 mide SOLO confianza
 *     en la predicción: el riesgo salió de su composición y
 *     vive únicamente en fRiesgo — nada se cobra dos veces).
 *     (En la Fase 1 el reparo de caja vivía dentro de la
 *     certeza y se cobraba vía fCerteza.)
 *   - FASE 2 (en sombra, 2026-11-03): la caja SALE de la
 *     certeza y se cobra UNA sola vez como factor propio:
 *       score = velocidad × fCerteza × fRiesgo × M_cash + tilt
 *     con M_cash ∈ {1,00 A · 0,99 B · 0,82 C · 0,72 D · 1,00
 *     NA/sin-dato} del régimen de caja determinista
 *     (cashRegime.ts, desde los componentes reportados de
 *     EDGAR). Como M_cash ≤ 1, el invariante score ≤
 *     velocidad + tilt se preserva.
 *   - El SUB-ÍNDICE DE CERTEZA sigue siendo el número que
 *     leen las reglas de FIABILIDAD (listón de destinos ≥ 65,
 *     prosa de «predicción firme/frágil»). Las reglas de
 *     ATRACTIVO leen este score.
 *   - ADOPCIÓN F1b (2026-11-03, aprobada por el dueño): este
 *     multiplicativo deja de ser el TITULAR. El score pasa a
 *     ser el RATING DE TRANQUILIDAD (tranquilityRatingFor,
 *     junto a scoreBandFor): certeza^0,45 × riesgo^0,35 ×
 *     Q_caja^0,20, sin tilt y sin M_cash (la caja entra vía
 *     Q). headlineScoreFor queda conservado como
 *     infraestructura de auditoría (lo cubren los tests de las
 *     Fases 1–2) pero NINGUNA superficie ni regla lo lee como
 *     titular. El listón de destinos pasa a leer el RATING
 *     (DESTINATION_MIN_RATING) y las estrellas pasan a ser
 *     oportunidad pura (opportunityStarsFor).
 *  ============================================================ */
export const SCORE_CERTAINTY_EXPONENT = 0.6;
export const SCORE_RISK_EXPONENT = 0.4;

/** Factores de retención del score multiplicativo (Fase 1).
 *  Sin índice (null), el factor es 1: la ausencia de dato no
 *  castiga (R0) — el activo conserva su velocidad entera por
 *  esa pata, y la falta queda declarada en el payload. */
export function scoreRetentionFactors(
  certaintyScore: number | null,
  riskSubscale: number | null
): { certaintyFactor: number; riskFactor: number } {
  return {
    certaintyFactor:
      certaintyScore != null ? Math.pow(clamp(certaintyScore, 0, 100) / 100, SCORE_CERTAINTY_EXPONENT) : 1,
    riskFactor:
      riskSubscale != null ? Math.pow(clamp(riskSubscale, 0, 100) / 100, SCORE_RISK_EXPONENT) : 1,
  };
}
/** Techo del tilt de momentum (solo positivo, R14). */
export const MOMENTUM_TILT_MAX_PTS = 5;
/** Tope del tilt cuando falta la PATA DE PRECIO (Fase 1, la
 *  corrección pendiente de R14 §9.6): las revisiones de EPS son
 *  una CONFIRMACIÓN pensada al 25% del compuesto; si Finviz no
 *  trajo distancias ni rendimiento, la renormalización las dejaba
 *  solas y podían producir el tilt máximo de +5 (ocurrió: ONTO
 *  con 2 revisiones). Sin pata de precio, el tilt queda topado
 *  a +1,5: la confirmación acompaña, no lidera. */
export const MOMENTUM_TILT_CAP_NO_PRICE_LEG_PTS = 1.5;
/** RSI(14) desde el que el tilt empieza a frenar; a 80 es 0. */
export const MOMENTUM_RSI_BRAKE_START = 70;
export const MOMENTUM_RSI_BRAKE_FULL = 80;

/** TILT DE MOMENTUM (R14): 0 a +5 puntos, SOLO desde datos que
 *  la app ya ingiere. Fórmula exacta del compuesto:
 *   - Pata de precio (0..1): tendencia = 0,45×clamp01(distSMA50/8)
 *     + 0,55×clamp01(distSMA200/15) (distancias negativas aportan
 *     0; pesos renormalizados si falta una media) y rendimiento
 *     = clamp01(perfAnual/60); pataPrecio = 0,6×tendencia +
 *     0,4×rendimiento (renormalizado si falta una).
 *   - Pata de confirmación (0..1): revisiones de EPS +1y de
 *     Yahoo = clamp01(0,5 + 0,5×(alzas − bajas)/(alzas + bajas)).
 *   - Compuesto = 0,75×precio + 0,25×confirmación (renormalizado
 *     si falta una pata; sin ninguna pata → tilt 0, R0).
 *   - FRENO DE EUFORIA: con RSI(14) ≥ 80 el tilt es 0; entre 70
 *     y 80 se reduce linealmente (factor (80 − RSI)/10); sin RSI
 *     no hay freno.
 *   - tilt = 5 × compuesto × freno, redondeado a 1 decimal.
 *  El momentum toca SOLO el score: ni el FV ni el RE lo leen
 *  (test de recomposición en sistema-r14.test.ts). */
export function momentumTiltFor(a: OptimizerAssetInput): {
  tiltPts: number;
  priceLeg: number | null;
  revisionLeg: number | null;
  rsiBrake: number;
} {
  const trendParts: Array<{ v: number; w: number }> = [];
  if (a.sma50DistPct != null) trendParts.push({ v: clamp(a.sma50DistPct / 8, 0, 1), w: 0.45 });
  if (a.sma200DistPct != null) trendParts.push({ v: clamp(a.sma200DistPct / 15, 0, 1), w: 0.55 });
  const priceParts: Array<{ v: number; w: number }> = [];
  if (trendParts.length) {
    const tw = trendParts.reduce((s, p) => s + p.w, 0);
    priceParts.push({ v: trendParts.reduce((s, p) => s + p.v * p.w, 0) / tw, w: 0.6 });
  }
  if (a.perfYearPct != null) priceParts.push({ v: clamp(a.perfYearPct / 60, 0, 1), w: 0.4 });
  let priceLeg: number | null = null;
  if (priceParts.length) {
    const tw = priceParts.reduce((s, p) => s + p.w, 0);
    priceLeg = priceParts.reduce((s, p) => s + p.v * p.w, 0) / tw;
  }
  let revisionLeg: number | null = null;
  const up = a.epsRevisionUp30 ?? null;
  const down = a.epsRevisionDown30 ?? null;
  if (up != null && down != null && up + down > 0) {
    revisionLeg = clamp(0.5 + (0.5 * (up - down)) / (up + down), 0, 1);
  }
  const legs: Array<{ v: number; w: number }> = [];
  if (priceLeg != null) legs.push({ v: priceLeg, w: 0.75 });
  if (revisionLeg != null) legs.push({ v: revisionLeg, w: 0.25 });
  if (!legs.length) return { tiltPts: 0, priceLeg, revisionLeg, rsiBrake: 1 };
  const tw = legs.reduce((s, p) => s + p.w, 0);
  const composite = legs.reduce((s, p) => s + p.v * p.w, 0) / tw;
  let rsiBrake = 1;
  if (a.rsi14 != null) {
    rsiBrake =
      a.rsi14 >= MOMENTUM_RSI_BRAKE_FULL
        ? 0
        : a.rsi14 <= MOMENTUM_RSI_BRAKE_START
          ? 1
          : (MOMENTUM_RSI_BRAKE_FULL - a.rsi14) / (MOMENTUM_RSI_BRAKE_FULL - MOMENTUM_RSI_BRAKE_START);
  }
  let tiltPts = Math.round(clamp(MOMENTUM_TILT_MAX_PTS * composite * rsiBrake, 0, MOMENTUM_TILT_MAX_PTS) * 10) / 10;
  // FASE 1: sin pata de precio, la confirmación sola no puede dar
  // el máximo — tope MOMENTUM_TILT_CAP_NO_PRICE_LEG_PTS.
  if (priceLeg == null) tiltPts = Math.min(tiltPts, MOMENTUM_TILT_CAP_NO_PRICE_LEG_PTS);
  return { tiltPts, priceLeg, revisionLeg, rsiBrake };
}

/** Compone el score multiplicativo de velocidad (FASE 1 +
 *  FASE 2): velocidad × fCerteza × fRiesgo × M_cash + tilt,
 *  techo 39 si modelSuspect. DESDE LA ADOPCIÓN F1b NO es el
 *  titular (el titular es tranquilityRatingFor): se conserva
 *  como infraestructura de auditoría de las fases en sombra.
 *  `certaintyScore` es el sub-índice de certeza
 *  (confianza pura desde la Fase 2: sin reparo de caja, con el
 *  techo de sospechoso), `riskSubscale` la sub-escala de
 *  riesgo marginal §5.1 y `cashMultiplier` el M_cash del
 *  régimen de caja (default 1: sin régimen computable no hay
 *  cobro — R0). `cashPenaltyPts` queda por compatibilidad de
 *  la firma: desde la Fase 2 vale 0 y no compone nada. */
/** Desglose del score multiplicativo de velocidad (Fases 1–2,
 *  fuera del titular desde la adopción F1b). */
export interface MultiplicativeScoreBreakdown {
  velocity: number;
  certaintyFactor: number;
  riskFactor: number;
  certaintyScore: number | null;
  riskSubscale: number | null;
  cashPenaltyPts: number;
  cashMultiplier: number;
  cashRegime: CashRegime | null;
  momentumTiltPts: number;
}

export function headlineScoreFor(args: {
  rePct: number | null;
  certaintyScore: number | null;
  riskSubscale: number | null;
  cashPenaltyPts: number;
  cashMultiplier?: number;
  cashRegime?: CashRegime | null;
  momentumTiltPts: number;
  modelSuspect: boolean;
}): { score: number | null; breakdown: MultiplicativeScoreBreakdown | null } {
  if (args.rePct == null) return { score: null, breakdown: null };
  const velocity = scoreVelocityFor(args.rePct);
  const { certaintyFactor, riskFactor } = scoreRetentionFactors(args.certaintyScore, args.riskSubscale);
  const cashMultiplier =
    args.cashMultiplier != null && Number.isFinite(args.cashMultiplier)
      ? Math.min(1, Math.max(0, args.cashMultiplier))
      : 1;
  let raw = velocity * certaintyFactor * riskFactor * cashMultiplier + args.momentumTiltPts;
  if (args.modelSuspect) raw = Math.min(raw, SUSPECT_SCORE_CAP);
  const score = Math.round(clamp(raw, 0, 100));
  return {
    score,
    breakdown: {
      velocity: Math.round(velocity * 10) / 10,
      certaintyFactor: Math.round(certaintyFactor * 1000) / 1000,
      riskFactor: Math.round(riskFactor * 1000) / 1000,
      certaintyScore: args.certaintyScore,
      riskSubscale: args.riskSubscale,
      cashPenaltyPts: args.cashPenaltyPts,
      cashMultiplier,
      cashRegime: args.cashRegime ?? null,
      momentumTiltPts: args.momentumTiltPts,
    },
  };
}

/** Campos de la certeza vF1 desde un input: la ÚNICA vía por la
 *  que los insumos del consenso (N, rango, sticky) y de las
 *  patas/fuentes llegan a confidenceFor — la usan la primera
 *  pasada (scoreAsset) y la recomposición (optimizePortfolio)
 *  para que ambas calculen exactamente lo mismo. */
function confidenceFieldsFor(a: OptimizerAssetInput, cashPenaltyPts: number): ConfidenceFields {
  return {
    fvConfidence: a.fvConfidence ?? null,
    fvComponentCount: a.fvComponentCount ?? null,
    epsSignDisagreement: a.epsSignDisagreement,
    fvRangeLow: a.fvRangeLow,
    fvRangeHigh: a.fvRangeHigh,
    fvBase: a.fvBase ?? null,
    fvModelSuspect: a.fvModelSuspect,
    cashPenaltyPts,
    analystCount: a.analystCount ?? null,
    analystTarget: a.analystTarget ?? null,
    analystTargetLow: a.analystTargetLow ?? null,
    analystTargetHigh: a.analystTargetHigh ?? null,
    price: a.price,
    sma200DistPct: a.sma200DistPct ?? null,
    ret3mPct: trailingReturnPct(a.priceHistory, 63),
    ret6mPct: trailingReturnPct(a.priceHistory, 126),
    epsRevisionUp30: a.epsRevisionUp30 ?? null,
    epsRevisionDown30: a.epsRevisionDown30 ?? null,
  };
}

/** Listón de destinos: TRANQUILIDAD (RATING ≥ 65 — adopción
 *  F1b: hasta la Fase 2 el listón leía la CERTEZA ≥ 65; el
 *  rating la subsume —certeza × riesgo de desvío × calidad de
 *  caja— y es la pregunta correcta para plata nueva: «¿es un
 *  activo tranquilo?»), dos patas de FV, FV no más de 3× el
 *  precio, sin rol defensivo y sin balance en puerta.
 *  FASE 2 (regla categórica, se mantiene): régimen de caja C
 *  o D = NO elegible como destino, sin importar el rating —
 *  el dinero nuevo no va a empresas que queman caja o cuya
 *  caja «positiva» es una ilusión del SBC. NA y sin-dato no
 *  bloquean (R0). El piso de riskSubscale ≥ 40 que se evaluó
 *  en sombra NO se adoptó: el gate por rating lo vuelve
 *  innecesario (en la corrida de evaluación el conjunto fue
 *  {NVDA, NU, MSFT, META} y CRDO, con riskSubscale 32, quedó
 *  fuera por su rating 55). */
function destinationEligibleFor(args: {
  isCrypto: boolean;
  isCash: boolean;
  ratingScore: number | null;
  fvComponentCount: number | null;
  fvToPrice: number | null;
  defensive: boolean;
  earningsGate: unknown;
  cashBlocked?: boolean;
}): boolean {
  return (
    !args.isCrypto &&
    !args.isCash &&
    args.ratingScore != null &&
    args.ratingScore >= DESTINATION_MIN_RATING &&
    (args.fvComponentCount == null || args.fvComponentCount >= 2) &&
    (args.fvToPrice == null || args.fvToPrice <= 3) &&
    !args.defensive &&
    args.earningsGate == null &&
    !args.cashBlocked
  );
}

export function scoreAsset(
  a: OptimizerAssetInput,
  totalValue: number,
  opts: Required<Omit<OptimizerOptions, 'peersByIndustry' | 'excludeTickers' | 'manualExtractions' | 'extraCashUsd' | 'acceptedSuggestions'>>,
  risk?: RiskMatrix
): AssetScore {
  const isCrypto = !!a.isCrypto;
  const isCash = !!a.isCash;
  const weightPct = totalValue > 0 ? (a.value / totalValue) * 100 : 0;
  // LA volatilidad sale del módulo único de riesgo (medida desde
  // el historial cuando hay; respaldos documentados si no).
  const vol = risk && risk.has(a.symbol) ? risk.volPct(a.symbol) : volForSpec(riskSpecForInput(a));

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
  // Ancla de caja real (R12): se calcula siempre (la marca se
  // muestra aunque el activo no tenga score) y su reparo entra
  // después en la banda de ajuste del score.
  const cashAnchor = cashAnchorFor(a);
  // FASE 2: RÉGIMEN DE CAJA desde los componentes reportados
  // (cashRegime.ts). Es la ÚNICA vía por la que la caja entra
  // al score desde este pase: factor M_cash multiplicativo y
  // bloqueo de destinos C/D. La marca visible se deriva del
  // régimen cuando hay componentes; sin componentes, la marca
  // cae al ancla histórica (y el régimen queda 'sin-dato').
  const cashRegime = cashRegimeFor({
    components: a.cashComponents ?? null,
    sector: a.sector,
    industry: a.industry,
    roicPct: a.roicPct ?? null,
    financial:
      FINANCIAL_LABEL_RE.test(a.sector ?? '') || FINANCIAL_LABEL_RE.test(a.industry ?? ''),
    isCrypto,
    isCash,
  });
  const cashAnchorState: CashAnchorState =
    cashRegime.regime === 'A' || cashRegime.regime === 'B'
      ? 'genera-caja'
      : cashRegime.regime === 'C' || cashRegime.regime === 'D'
        ? 'quema-caja'
        : cashRegime.regime === 'NA'
          ? 'no-aplica'
          : cashAnchor.state;
  const gate = isCrypto || isCash ? null : earningsGateFor(a);
  const thesisSignals = thesisSignalsFor(a);
  const conservativeConvergence = false;

  let gkParts: GrinoldKronerParts | null = null;
  let scoreVelocity: number | null = null;
  let certaintyBand: ScoreBand | null = null;
  let certaintyComponents: AssetScore['certaintyComponents'] = null;
  let certaintyScore: number | null = null;
  let riskSubscale: number | null = null;
  let consensusCredibility: AssetScore['consensusCredibility'] = null;
  let scoreBreakdown: AssetScore['scoreBreakdown'] = null;
  let ratingBand: RatingBand | null = null;
  let momentum: AssetScore['momentum'] = null;
  let scoreAdjustmentPts: number | null = null;
  let scoreAdjustmentDriver: string | null = null;
  let rePess: number | null = null;
  let prudentFallback = false;
  let scorePess: number | null = null;
  if (isCrypto || isCash) {
    // SIN retorno inventado (R13): la caja rinde 0 y la cripto
    // queda FUERA del sistema de predicción — no tiene patas de
    // FV, así que no hay retorno esperado ni duplicación que
    // mostrarle; solo entra un retorno si viene como SUPUESTO
    // EXPLÍCITO en el input (assumedReturnPct), que es un dato
    // del usuario y no una invención del motor (ninguna fuente
    // de datos de producción lo completa). Antes el default era
    // un 11,5% plano para toda cripto — hasta para el USDT —
    // que contaminaba el retorno de cartera y las tarjetas.
    re = a.assumedReturnPct ?? (isCash ? 0 : null);
    // Cripto y caja no tienen rango de FV: su «prudente» es el
    // mismo retorno (0 en caja, ninguno en cripto), marcado como
    // caída (prudentFallback).
    rePess = re;
    prudentFallback = true;
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
    // VISTA PRUDENTE (R12): la misma triangulación, pero la pata de
    // convergencia apunta al escenario PESIMISTA del FV
    // (fvPesimista: el piso del rango — el menor de los componentes
    // que formaron el FV) en vez del FV base. GK y el consenso no
    // dependen del FV y entran igual. Sin fvPesimista válido no hay
    // escenario pesimista computable: el retorno prudente CAE al
    // esperado y el activo queda marcado (prudentFallback) para que
    // la UI lo muestre — nadie lee un esperado como si fuera el piso.
    const fvPessConv =
      a.fvPesimista != null && a.fvPesimista > 0 && a.price > 0
        ? (Math.pow(a.fvPesimista / a.price, 1 / opts.yearsToCorrection) - 1) * 100
        : null;
    if (fvPessConv != null) {
      const pParts: Array<[number | null, number]> = [
        [gk, 0.45],
        [fvPessConv, 0.35],
        [cons, 0.2],
      ];
      const pAvail = pParts.filter(([v]) => v != null) as Array<[number, number]>;
      if (pAvail.length) {
        const tw = pAvail.reduce((s, [, w]) => s + w, 0);
        rePess = clamp(
          pAvail.reduce((s, [v, w]) => s + v * w, 0) / tw,
          RE_SANITY_CLAMP_PCT.min,
          RE_SANITY_CLAMP_PCT.max
        );
      }
    }
    if (rePess == null) {
      rePess = re;
      prudentFallback = true;
    }
    const gAnchor =
      a.earningsGrowthTotalPct ?? a.salesGrowthPct ??
      (a.epsNext5YPct != null || a.epsNextYearPct != null
        ? median([a.epsNextYearPct, a.epsNext5YPct].filter((x): x is number => x != null))
        : null);
    if (gAnchor != null) gordon = (a.dividendYieldPct ?? 0) + clamp(gAnchor, 0, 5.5);

    // CERTEZA (confidenceFor) y SCORE TITULAR (el RATING DE
    // TRANQUILIDAD, tranquilityRatingFor — adopción F1b): en
    // esta pasada la sub-escala de riesgo usa solo la
    // volatilidad del módulo; optimizePortfolio la completa
    // con el aporte al riesgo (PCTR/MCTR) cuando la
    // descomposición ya está computada, y recompone AMBOS
    // números desde ahí.
    scoreVelocity = re != null ? scoreVelocityFor(re) : null;
    // FASE 2: la certeza ya no recibe el reparo de caja (pasa 0):
    // la caja entra al rating una sola vez, vía Q del régimen.
    const conf = confidenceFor(confidenceFieldsFor(a, 0), vol, null);
    certaintyScore = conf.score;
    certaintyBand = conf.band;
    certaintyComponents = conf.components;
    riskSubscale = conf.riskSubscale;
    consensusCredibility = conf.consensus;
    const tilt = momentumTiltFor(a);
    momentum = tilt.priceLeg != null || tilt.revisionLeg != null ? tilt : null;
    const ratingRes = tranquilityRatingFor({
      certaintyScore: conf.score,
      riskSubscale: conf.riskSubscale,
      cashRegime: cashRegime.regime,
      modelSuspect: !!a.fvModelSuspect,
    });
    score = ratingRes.rating;
    scoreBreakdown = ratingRes.breakdown;
    ratingBand = ratingRes.band;
    // ESTRELLAS = OPORTUNIDAD (adopción F1b): gap precio/FV con
    // las bandas de la ficha — NO salen del rating.
    stars = opportunityStarsFor(a);
    // Score de la vista prudente: el rating no depende del
    // retorno de la vista (no compone velocidad), así que es
    // el MISMO en ambas vistas.
    scorePess = score;


  }
  const fvToPrice =
    a.fvBase != null && a.fvBase > 0 && a.price > 0 ? a.fvBase / a.price : null;
  const destinationEligible = destinationEligibleFor({
    isCrypto, isCash, ratingScore: score,
    fvComponentCount: a.fvComponentCount ?? null,
    fvToPrice, defensive: !!a.defensive, earningsGate: gate,
    cashBlocked: cashRegime.destinationBlockedByCash,
  });

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
    growthAnchorBlendPct: gkParts?.growthAnchorBlendPct ?? null,
    growthRegimeBasis: gkParts?.growthRegimeBasis ?? null,
    expectedReturnPct: re,
    gordonFloorPct: gordon,
    belowGordonFloor: gordon != null && re != null && re < gordon - 4,
    score,
    stars,
    yearsToDouble: yearsToDoubleFor(re),
    expectedReturnPessimisticPct: rePess,
    yearsToDoublePessimistic: yearsToDoubleFor(rePess),
    scorePessimistic: scorePess,
    prudentFallback,
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
    certaintyBand,
    certaintyComponents,
    certaintyScore,
    riskSubscale,
    consensusCredibility,
    scoreBreakdown,
    ratingBand,
    momentum,
    // FASE 2: la marca se deriva del RÉGIMEN (cashAnchorState
    // computado arriba); el FCF que la respalda, cuando hay
    // componentes, es el FCF_real (OCF − SBC − CapEx) del
    // régimen — el número que efectivamente clasificó. Sin
    // componentes manda la procedencia histórica del ancla.
    cashAnchorState,
    cashAnchorPenaltyPts: 0,
    cashRegime,
    cashAnchorFcfTtmUsd:
      cashRegime.fcfRealUsd != null ? cashRegime.fcfRealUsd : cashAnchor.fcfTtmUsd,
    cashAnchorSource: cashAnchor.source,
    cashAnchorPeriodEnd:
      cashRegime.fcfRealUsd != null ? cashRegime.periodEnd : cashAnchor.periodEnd,
    cashAnchorDiscrepancy: cashAnchor.discrepancy,
    cashAnchorProviderFcfTtmUsd: cashAnchor.providerFcfTtmUsd,
    cashAnchorEdgarFyOnlyGap: cashAnchor.edgarFyOnlyGap,
    fvConfidence: a.fvConfidence ?? null,
    fvComponentCount: a.fvComponentCount ?? null,
    fvToPrice,
    destinationEligible,
    thesisSignals,
    earningsGate: gate,
    cyclicalNormalized: !!a.cyclicalNormalized,
    dilutionPct: a.dilutionPct ?? null,
    dilutionSource: a.dilutionSource ?? null,
    dilutionSeriesPct: a.dilutionSeriesPct ?? null,
    dilutionReportedPct: a.dilutionReportedPct ?? null,
    dilutionDiscrepancy: !!a.dilutionDiscrepancy,
    dilutionGap: a.dilutionGap ?? null,
    conservativeConvergence,
    modelSuspect: !!a.fvModelSuspect,
    epsSignDisagreement: !!a.epsSignDisagreement,
  };
}

/** LA vista del valor justo del motor para superficies que no
 *  son el Optimizador (la ficha del activo): UN solo FV por
 *  activo en toda la app (unificación R13, aprobada por el
 *  usuario 2026-11-03). La ficha consume ESTOS números — el FV
 *  efectivo del activo puntuado y el piso/techo del rango del
 *  motor — y su antiguo cálculo propio de escenarios deja de
 *  ser una fuente de verdad: ningún número visible de la ficha
 *  puede salir de otra valuación que la del motor. */
export interface MotorFvView {
  /** El FV del motor para el activo (AssetScore.fvEffective). */
  fv: number;
  /** Piso del rango del motor (fvRangeLow; respaldo: el piso de
   *  los componentes que formaron el FV, input.fvPesimista). */
  fvPesimista: number;
  /** Techo del rango del motor (fvRangeHigh; respaldo: el techo
   *  de los componentes, input.fvOptimista). */
  fvOptimista: number;
  /** Incertidumbre del motor de FV (la de la ficha, normalizada
   *  por la propia ficha). */
  uncertainty: string | null;
}

export function motorFvViewFor(a: OptimizerAssetInput, scored: AssetScore): MotorFvView | null {
  const fv = scored.fvEffective;
  if (fv == null || !(fv > 0)) return null;
  const lo = a.fvRangeLow ?? a.fvPesimista ?? null;
  const hi = a.fvRangeHigh ?? a.fvOptimista ?? null;
  return {
    fv,
    fvPesimista: lo != null && lo > 0 ? lo : fv,
    fvOptimista: hi != null && hi > 0 ? hi : fv,
    uncertainty: a.uncertainty ?? null,
  };
}

/** Descomposición de Euler (MCTR/PCTR) y volatilidad de cartera,
 *  computadas desde el MÓDULO ÚNICO DE RIESGO (riskMatrix.ts):
 *  misma matemática de siempre, alimentada por la matriz medida
 *  (con shrinkage a los priors de bloque). Sin matriz explícita
 *  se construye una de priors puros con las volatilidades que ya
 *  traen los activos — el respaldo documentado del módulo. */
export function applyRiskDecomposition(assets: AssetScore[], riskFreePct: number, matrix?: RiskMatrix): number {
  const total = assets.reduce((s, a) => s + a.value, 0);
  if (total <= 0) return 0;
  const mx =
    matrix ??
    buildRiskMatrix(
      assets.map((a) => ({
        key: a.symbol, sector: a.sector, industry: a.industry,
        isCrypto: a.isCrypto, isCash: a.isCash,
        closes: null, fallbackVolPct: a.volatilityPct, beta: null,
      }))
    );
  const dec = mx.decompose(
    assets.map((a) => ({
      key: a.symbol,
      weight: a.value / total,
      volPct: matrix && matrix.has(a.symbol) ? matrix.volPct(a.symbol) : a.volatilityPct,
    }))
  );
  assets.forEach((a) => {
    const m = dec.mctrPct.get(a.symbol);
    const pct = dec.pctrPct.get(a.symbol);
    if (m != null && pct != null) {
      a.mctrPct = m;
      a.riskContributionPct = pct;
      a.excessPerRisk =
        a.expectedReturnPct != null && m > 0 ? (a.expectedReturnPct - riskFreePct) / m : null;
    }
  });
  return dec.portfolioVolPct;
}

export function portfolioMetrics(assets: AssetScore[], volPct: number): PortfolioMetrics {
  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  // El retorno de cartera se computa SOLO sobre los activos CON
  // predicción (R13): los pesos se renormalizan dentro de ese
  // subconjunto. La caja (RE 0, una predicción real) entra; la
  // cripto sin supuesto explícito (RE null) no entra ni en el
  // numerador ni en el denominador — antes entraba con el 11,5%
  // inventado y, si se la excluyera solo del numerador, pesaría
  // como un 0% falso. El arrastre geométrico sigue usando la
  // volatilidad de TODA la cartera: es el riesgo que el tenedor
  // efectivamente soporta al componer.
  const predicted = assets.filter((a) => a.expectedReturnPct != null);
  const predictedValue = predicted.reduce((s, a) => s + a.value, 0);
  const reArith =
    predictedValue > 0
      ? predicted.reduce((s, a) => s + (a.value / predictedValue) * (a.expectedReturnPct as number), 0)
      : 0;
  const reGeo = predictedValue > 0 ? reArith - Math.pow(volPct / 100, 2) * 50 : 0; // −σ²/2 en %
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
    riskFreePct: options.riskFreePct ?? RISK_FREE_PCT,
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

  // LA matriz de riesgo del pase (módulo único): posiciones y
  // pares candidatos, con sus historiales. Todo número de riesgo
  // de este resultado sale de acá.
  const riskMatrix = buildRiskMatrix([
    ...inputs.map((a) => riskSpecForInput(a, totalValue > 0 ? a.value / totalValue : null)),
    ...Object.values(peersByIndustry)
      .flat()
      .map((peer) => ({
        key: peer.symbol, sector: peer.industry, industry: peer.industry,
        isCrypto: false, isCash: false,
        closes: peer.priceHistory ?? null,
        fallbackVolPct: peer.volatilityPct ?? null, beta: null,
      })),
  ]);
  const scored = inputs.map((a) => scoreAsset(a, totalValue, opts, riskMatrix));
  const volBefore = applyRiskDecomposition(scored, opts.riskFreePct, riskMatrix);
  // Segunda pasada de CERTEZA y SCORE (consolidación de
  // riesgo): con la descomposición computada, el componente de
  // riesgo de desvío de cada posición se recalcula MARGINAL-
  // PRIMERO (R13): mandan su aporte al riesgo total (PCTR
  // relativo a su peso) y su riesgo marginal (MCTR contra la
  // volatilidad de la cartera), con la volatilidad medida como
  // insumo secundario — los mismos campos del payload que
  // muestran el gráfico de burbujas y la ficha. Desde la
  // adopción F1b esa certeza alimenta DOS salidas: el
  // sub-índice de certeza (fiabilidad: prosa firme/frágil y
  // análisis del activo) y el RATING DE TRANQUILIDAD titular,
  // que a su vez lee el listón de destinos.
  for (const s of scored) {
    if (s.isCrypto || s.isCash || s.certaintyScore == null) continue;
    const input = inputs.find((i) => i.symbol === s.symbol);
    if (!input) continue;
    const conf = confidenceFor(
      confidenceFieldsFor(input, 0),
      s.volatilityPct,
      s.riskContributionPct,
      s.weightPct,
      { mctrPct: s.mctrPct, portfolioVolPct: volBefore }
    );
    if (conf.score != null) {
      s.certaintyScore = conf.score;
      s.certaintyBand = conf.band;
      s.certaintyComponents = conf.components;
      s.riskSubscale = conf.riskSubscale;
      s.consensusCredibility = conf.consensus;
      const ratingRes = tranquilityRatingFor({
        certaintyScore: conf.score,
        riskSubscale: conf.riskSubscale,
        cashRegime: s.cashRegime?.regime ?? null,
        modelSuspect: s.modelSuspect,
      });
      s.score = ratingRes.rating;
      s.scoreBreakdown = ratingRes.breakdown;
      s.ratingBand = ratingRes.band;
      // Las estrellas NO dependen de esta pasada: son
      // oportunidad (precio/FV) y ya salieron de scoreAsset.
      // El rating tampoco depende de la vista: el «score
      // prudente» es el mismo rating.
      s.scorePessimistic = ratingRes.rating;
      s.destinationEligible = destinationEligibleFor({
        isCrypto: s.isCrypto, isCash: s.isCash, ratingScore: ratingRes.rating,
        fvComponentCount: input.fvComponentCount ?? null,
        fvToPrice: s.fvToPrice, defensive: s.defensive, earningsGate: s.earningsGate,
        cashBlocked: s.cashRegime?.destinationBlockedByCash ?? false,
      });
    }
  }
  const before = portfolioMetrics(scored, volBefore);
  // Vista prudente de la cartera actual (R12): mismos pesos y misma
  // volatilidad; solo cambia el retorno de cada activo por su
  // lectura pesimista. No interviene en la propuesta, que se sigue
  // calculando con la vista esperada.
  const beforePessimistic = portfolioMetrics(
    scored.map((a) => ({ ...a, expectedReturnPct: a.expectedReturnPessimisticPct })),
    volBefore
  );
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
    // REGLAS RE-FUNDADAS (redefinición del score, 2026-11-03): el
    // score ahora mide CONFIANZA — vender «por desconfianza» sería
    // objetivamente incorrecto (un activo incierto es «a revisar»,
    // no «a vender»). Las salidas por debilidad se juzgan por los
    // criterios directos que el score viejo aproximaba: RETORNO
    // esperado y gap precio/FV. Las defensivas tienen un rol
    // (contrapeso): su umbral de retorno es más exigente y su
    // salida siempre parcial (decisión del usuario 2026-10-29).
    const lowReBar = a.defensive ? 5 : 10;
    if (a.expectedReturnPct != null && a.expectedReturnPct < lowReBar && sellVerdict) {
      pushExtraction(a, a.defensive ? 'parcial' : 'total', 0.5,
        'Precio por encima de su valor justo y retorno esperado bajo', 'veredicto-vender');
      continue;
    }
    // Reemplazo sectorial: par de la misma industria claramente
    // superior EN OPORTUNIDAD — más retorno esperado (≥ +3 pp) y
    // más recorrido hasta su valor justo (FV/precio ≥ +0,15).
    const peers = (peersByIndustry[a.industry] ?? []).filter((p) => p.ticker !== a.ticker);
    const bestPeer = peers.sort(
      (x, y) => (y.expectedReturnPct ?? -Infinity) - (x.expectedReturnPct ?? -Infinity)
    )[0];
    if (
      bestPeer && a.expectedReturnPct != null &&
      bestPeer.expectedReturnPct != null &&
      bestPeer.expectedReturnPct >= a.expectedReturnPct + 3 &&
      (bestPeer.fvToPrice ?? 0) >= (a.fvToPrice ?? 0) + 0.15
    ) {
      pushExtraction(a, a.defensive ? 'parcial' : 'total', 0.5,
        `Su par ${bestPeer.ticker} (misma industria) ofrece más retorno esperado (${fmtPct1(bestPeer.expectedReturnPct)} vs ${fmtPct1(a.expectedReturnPct)} anual) y más recorrido a su valor justo`,
        'reemplazo-sectorial', bestPeer.ticker);
      continue;
    }
    const veryLowReBar = a.defensive ? 2 : 5;
    if (a.expectedReturnPct != null && a.expectedReturnPct < veryLowReBar) {
      pushExtraction(a, a.defensive ? 'parcial' : 'total', 0.5,
        `Retorno esperado muy bajo (${fmtPct1(a.expectedReturnPct)} anual)`, 'retorno-muy-bajo');
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
      a.expectedReturnPct < medianRE - 3
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
          `(retorno esp. ${a.expectedReturnPct != null ? fmtPct1(a.expectedReturnPct) : '—'} anual · certeza de esa predicción: ${a.certaintyScore != null ? a.certaintyScore + '/100' : '—'})` +
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
  // (destinationEligible: rating de tranquilidad ≥ 65 y régimen
  // de caja no bloqueante, FV de ≥2 componentes, FV/precio ≤ 3,
  // no defensivos, sin examen próximo). Lo que no
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
      interface Cand { key: string; score: number; rePct: number | null; capUsd: number; make: (amount: number) => Allocation }
      const cands: Cand[] = [];
      // 1) Pares sectoriales de los reemplazos, con el mismo listón
      const seenPeer = new Set<string>();
      for (const e of extractionList) {
        if (!e.replacementTicker || seenPeer.has(e.replacementTicker)) continue;
        seenPeer.add(e.replacementTicker);
        const src = scored.find((a) => a.symbol === e.symbol)!;
        const peer = (peersByIndustry[src.industry] ?? []).find((p) => p.ticker === e.replacementTicker)!;
        if (!peer) continue;
        // El listón del par es de TRANQUILIDAD (adopción F1b):
        // se lee su SCORE, que ya es el rating (con respaldo a
        // su certeza para pares armados a mano sin rating).
        if ((peer.score ?? peer.certaintyScore ?? 0) < DESTINATION_MIN_RATING) continue;
        if (peer.fvComponentCount != null && peer.fvComponentCount < 2) continue;
        if (peer.fvToPrice != null && peer.fvToPrice > 3) continue;
        cands.push({
          key: 'peer:' + peer.symbol,
          score: peer.score, rePct: peer.expectedReturnPct,
          capUsd: (totalValue * opts.newPositionCapPct) / 100,
          make: (amount) => ({
            symbol: peer.symbol, ticker: peer.ticker, name: peer.name, isNew: true,
            industry: peer.industry, amountUsd: amount,
            qtyBought: peer.price > 0 ? amount / peer.price : 0, price: peer.price,
            score: peer.score, certaintyScore: peer.certaintyScore ?? peer.score,
            stars: peer.stars ?? null,
            expectedReturnPct: peer.expectedReturnPct,
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
          score: a.score!, rePct: a.expectedReturnPct,
          capUsd: roomUsd,
          make: (amount) => ({
            symbol: a.symbol, ticker: a.ticker, name: a.name, isNew: false,
            industry: a.industry, amountUsd: amount,
            qtyBought: a.price > 0 ? amount / a.price : 0, price: a.price,
            score: a.score, certaintyScore: a.certaintyScore,
            expectedReturnPct: a.expectedReturnPct,
            note: 'Posición reforzada',
          }),
        });
      }
      // El reparto entre destinos se ordena y pondera por RETORNO
      // esperado (la oportunidad directa), no por el score: el
      // score es el RATING DE TRANQUILIDAD y ponderar compras por
      // tranquilidad sesgaría hacia lo lento-pero-seguro. El listón
      // de ENTRADA de cada destino sí usa esa tranquilidad
      // (DESTINATION_MIN_RATING y destinationEligible).
      const top = cands.sort((x, y) => (y.rePct ?? -Infinity) - (x.rePct ?? -Infinity)).slice(0, 3);
      if (top.length) {
        const wOf = (c: Cand) => Math.pow(Math.max(c.rePct ?? 0, 0), 2);
        const wSum = top.reduce((s, c) => s + wOf(c), 0);
        const shareOf = (c: Cand) => (wSum > 0 ? wOf(c) / wSum : 1 / top.length);
        let assigned = 0;
        const made: Array<{ c: Cand; al: Allocation }> = [];
        top.forEach((c, i) => {
          let amount =
            i === top.length - 1
              ? funds - assigned
              : Math.round(funds * shareOf(c));
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
        growthAnchorBlendPct: null, growthRegimeBasis: null,
        expectedReturnPct: al.expectedReturnPct, gordonFloorPct: null, belowGordonFloor: false,
        score: al.score, stars: al.stars ?? null,
        yearsToDouble: yearsToDoubleFor(al.expectedReturnPct),
        expectedReturnPessimisticPct: al.expectedReturnPct,
        yearsToDoublePessimistic: yearsToDoubleFor(al.expectedReturnPct),
        scorePessimistic: al.score, prudentFallback: true,
        volatilityPct: 30, mctrPct: null, riskContributionPct: null, excessPerRisk: null,
        locked: false, defensive: false, confidence: 'media',
        fvRaw: null, fvEffective: null, fvConfidence: null, fvComponentCount: null,
        fvToPrice: null, destinationEligible: false, thesisSignals: [],
        earningsGate: null, cyclicalNormalized: false, dilutionPct: null,
        dilutionSource: null, dilutionSeriesPct: null, dilutionReportedPct: null,
        dilutionDiscrepancy: false, dilutionGap: null,
        conservativeConvergence: false, modelSuspect: false, epsSignDisagreement: false,
        scoreVelocity: null, scoreAdjustmentPts: null, scoreAdjustmentDriver: null,
        certaintyBand: null, certaintyComponents: null, certaintyScore: al.certaintyScore ?? null,
        riskSubscale: null, consensusCredibility: null,
        scoreBreakdown: null, ratingBand: null, momentum: null,
        cashAnchorState: 'sin-dato', cashAnchorPenaltyPts: 0, cashRegime: null, cashAnchorFcfTtmUsd: null,
        cashAnchorSource: null, cashAnchorPeriodEnd: null, cashAnchorDiscrepancy: false,
        cashAnchorProviderFcfTtmUsd: null, cashAnchorEdgarFyOnlyGap: false,
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
        growthAnchorBlendPct: null, growthRegimeBasis: null,
        expectedReturnPct: 0, gordonFloorPct: null, belowGordonFloor: false, score: null, stars: null,
        yearsToDouble: null,
        expectedReturnPessimisticPct: 0, yearsToDoublePessimistic: null,
        scorePessimistic: null, prudentFallback: true,
        volatilityPct: 0, mctrPct: null, riskContributionPct: null,
        excessPerRisk: null, locked: false, defensive: false, confidence: 'alta',
        fvRaw: null, fvEffective: null, fvConfidence: null, fvComponentCount: null,
        fvToPrice: null, destinationEligible: false, thesisSignals: [],
        earningsGate: null, cyclicalNormalized: false, dilutionPct: null,
        dilutionSource: null, dilutionSeriesPct: null, dilutionReportedPct: null,
        dilutionDiscrepancy: false, dilutionGap: null,
        conservativeConvergence: false, modelSuspect: false, epsSignDisagreement: false,
        scoreVelocity: null, scoreAdjustmentPts: null, scoreAdjustmentDriver: null,
        certaintyBand: null, certaintyComponents: null, certaintyScore: null,
        riskSubscale: null, consensusCredibility: null,
        scoreBreakdown: null, ratingBand: null, momentum: null,
        cashAnchorState: 'no-aplica', cashAnchorPenaltyPts: 0, cashRegime: null, cashAnchorFcfTtmUsd: null,
        cashAnchorSource: null, cashAnchorPeriodEnd: null, cashAnchorDiscrepancy: false,
        cashAnchorProviderFcfTtmUsd: null, cashAnchorEdgarFyOnlyGap: false,
      });
    }
    finalAssets.forEach((a) => {
      a.weightPct = totalAfter > 0 ? (a.value / totalAfter) * 100 : 0;
    });
    const volAfter = applyRiskDecomposition(finalAssets, opts.riskFreePct, riskMatrix);
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
    'veredicto-vender', 'retorno-muy-bajo', 'reemplazo-sectorial', 'bajo-retorno',
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
    beforePessimistic,
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
  const best = [...stocks].sort((x, y) => (y.certaintyScore ?? 0) - (x.certaintyScore ?? 0))[0];
  const worst = [...stocks].sort((x, y) => (x.certaintyScore ?? 100) - (y.certaintyScore ?? 100))[0];
  const extractedTickers = new Set(
    extractions.filter((e) => e.kind !== 'efectivo').map((e) => e.ticker)
  );
  const coreTouched = top.some((a) => extractedTickers.has(a.ticker));

  // 1) Situación y núcleo
  out.push(
    `Tu cartera vale ${fmtUsd(before.totalValue)} en ${before.positions} posiciones y, con los precios y fundamentos de hoy, rinde un estimado de ${fmtPct1(before.expectedReturnGeoPct)} anual: duplicaría en unos ${fmtY(before.yearsToDouble)} años. Las tres posiciones más grandes (${top.map((a) => `${a.ticker} ${fmtPct1(a.weightPct)}`).join(', ')}) concentran el ${fmtPct1(before.top3WeightPct)} del total${coreTouched ? '' : ' y ninguna tiene motivo de salida: el núcleo se mantiene intacto'}. La predicción más firme de la tabla es la de ${best?.ticker} (certeza ${best?.certaintyScore}/100) y la más frágil, la de ${worst?.ticker} (${worst?.certaintyScore}/100${worst?.certaintyBand === 'a-revisar' ? ': estimación a revisar' : ''}). El score de cada tarjeta es otra cosa: es su rating de tranquilidad — qué tan seguro es que cumpla sus previsiones —, no su atractivo ni su velocidad: la oportunidad la dicen las estrellas (precio contra valor justo) y el ritmo, los años para duplicar.`
  );

  // 2) Concentración sectorial
  if (before.topSectorPct >= 45) {
    out.push(
      `El punto más delicado es la concentración: el sector ${before.topSector} pesa ${fmtPct1(before.topSectorPct)} de la cartera. No es un problema hoy si la tesis se mantiene, pero significa que un mal ciclo de ese sector define casi la mitad de tu resultado. La mejora no pasa por salir del sector, sino por rotar dentro de él hacia las empresas con mejor retorno esperado.`
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
      `En riesgo, la volatilidad estimada en las caídas es ${fmtPct1(before.volatilityPct)} anual (se mide en los días en que la cartera baja, con más peso en las últimas semanas). No la aportan las posiciones más grandes sino las que más caen con el conjunto: ${topRisk.map((a) => `${a.ticker} explica el ${fmtPct1(a.riskContributionPct ?? 0)} del riesgo total`).join(' y ')}. Por eso la optimización valida cada movimiento contra el riesgo total (descomposición de Euler): un cambio solo se propone si no lo empeora.`
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

  // 3c) Confianza de las predicciones rápidas (redefinición del
  // score, 2026-11-03): la tabla ordena por la predicción y el
  // score dice cuánto creerle; cuando un activo del top-3 por
  // duplicación tiene confianza media o «a revisar», la nota
  // nombra la causa principal de su fragilidad. Esa divergencia
  // ya no es una contradicción a explicar: es el sistema
  // funcionando como el usuario lo definió.
  const bandWords = (b: ScoreBand | null): string =>
    b === 'alta' ? 'confianza alta' : b === 'media' ? 'confianza media' : 'estimación a revisar';
  const confidenceCause = (a: AssetScore): string => {
    if (a.modelSuspect) {
      return 'sus fuentes se contradicen entre sí de forma extrema, y su estimación quedó marcada a revisar';
    }
    const comps = a.certaintyComponents;
    if (comps) {
      const named: Array<{ v: number | null; text: string }> = [
        { v: comps.legs, text: 'las dos estimaciones de su valor justo están lejos entre sí' },
        { v: comps.sources, text: 'las fuentes de sus ganancias futuras y de su precio objetivo discrepan entre sí' },
        { v: comps.consensus, text: 'el consenso de analistas que respalda su precio objetivo es débil: pocos analistas, objetivos muy dispersos o posiblemente vencidos tras la caída' },
      ].filter((c) => c.v != null);
      named.sort((x, y) => (x.v as number) - (y.v as number));
      if (named.length && (named[0].v as number) < 55) return named[0].text;
    }
    if (a.cashAnchorState === 'quema-caja') {
      return 'quemó caja en los últimos 12 meses reportados, y eso resta certeza a su sendero';
    }
    return 'sus insumos de valuación todavía no se confirman entre sí';
  };
  const fragileFast = byDoubling
    .filter((a) => a.certaintyBand === 'a-revisar' || a.certaintyBand === 'media')
    .slice(0, 2);
  for (const a of fragileFast) {
    out.push(
      `Ojo con la letra chica de ${a.ticker}: está entre los que más rápido duplican (${fmtY(a.yearsToDouble)} años), pero la certeza de su predicción es ${a.certaintyScore}/100 (${bandWords(a.certaintyBand)}) porque ${confidenceCause(a)}. La tabla ordena por la predicción; la certeza dice cuánto hay que creerle, y su rating de tranquilidad lo refleja: con esa certeza, el rating no puede ser alto.`
    );
  }

  // 4) Salidas, por tipo de motivo
  const thesisExits = extractions.filter((e) => e.reasonCode === 'tesis-deteriorada');
  const ruleExits = extractions.filter((e) =>
    ['veredicto-vender', 'retorno-muy-bajo', 'reemplazo-sectorial', 'concentracion', 'bajo-retorno'].includes(e.reasonCode)
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
      'No aparecen rotaciones con fundamento suficiente: ninguna posición combina deterioro de tesis, retorno esperado bajo con sobreprecio contra su valor justo o un par sectorial claramente mejor. Mantener también es una decisión.'
    );
  }

  // 5) Destinos y caja deliberada
  if (allocations.length) {
    const parts = allocations.map(
      (a) =>
        `${a.ticker} (${fmtUsd(a.amountUsd)}${a.isNew ? ', posición nueva' : ''}, rating de tranquilidad ${a.score ?? '—'}/100)`
    );
    out.push(
      `El dinero liberado va a los destinos que superan el listón — rating de tranquilidad de al menos 65 (y sin quemar caja), valor justo formado por las dos estimaciones (fórmula y consenso) y sin balance en puerta: ${parts.join(' · ')}.`
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
