/**
 * ============================================================
 *  MÓDULO ÚNICO DE RIESGO DEL OPTIMIZADOR (consolidación
 *  ordenada por el usuario, 2026-11-03 11:45: «que todo quede
 *  consolidado en un único análisis de riesgo… y tiene que
 *  estar correlacionado todo»).
 * ============================================================
 *  Este módulo es el DUEÑO de todos los números de riesgo del
 *  Optimizador: volatilidades, correlaciones, volatilidad de
 *  cartera y la descomposición de Euler (MCTR/PCTR/exceso por
 *  riesgo), y de ahí toman el score de confianza, el gráfico de
 *  burbujas, el veredicto y la evaluación escrita. Ninguna otra
 *  parte del motor ni del servidor define riesgo para el
 *  Optimizador: si un cálculo lo necesita, lo pide acá.
 *  (El `risk.ts` vecino es otra capa — analítica histórica de
 *  performance de la cartera: XIRR, drawdown — y no alimenta
 *  ninguno de estos números.)
 *
 *  QUÉ MIDE (desde el historial de precios, 1 año diario) —
 *  REFINAMIENTO R14 (aprobado por el usuario 2026-11-03 12:56,
 *  «sumá los dos refinamientos de riesgo al pase del score»):
 *  el riesgo se mide A LA BAJA y con MEMORIA CORTA.
 *   - DÍAS DE BAJA: el conjunto de medición son los días en que
 *     el retorno diario de LA CARTERA (la canasta de posiciones
 *     con peso, equiponderada si no hay pesos) fue negativo —
 *     la condición estándar tipo semivarianza/Sortino. Subir
 *     junto al resto no cuenta como riesgo.
 *   - Volatilidad medida por activo = DESVIACIÓN A LA BAJA:
 *     desvío de sus retornos logarítmicos EN ESOS DÍAS, × √252
 *     (misma anualización que la simétrica histórica, para que
 *     la escala siga siendo comparable; es naturalmente menor
 *     que la simétrica: no es «menos riesgo», es otra regla).
 *   - Correlación medida por pares: Pearson sobre los retornos
 *     de ambos EN LOS DÍAS DE BAJA conjuntos.
 *   - EWMA (RiskMetrics): cada día pesa λ^edad con λ = 0,94 —
 *     lo reciente manda. El tamaño de muestra EFECTIVO de esos
 *     pesos, n_eff = (Σw)²/Σw² (≈32 como máximo con λ=0,94),
 *     alimenta el shrinkage hacia los priors como antes lo
 *     hacía el conteo crudo de días: la medición pesa menos
 *     que con la historia completa equiponderada, por diseño.
 *   - SEMIDEFINIDA POSITIVA: la matriz de correlación que usa
 *     cada descomposición se verifica por autovalores
 *     (Jacobi); si el condicionamiento por pares la rompe
 *     (autovalor mínimo < 0), se repara por recorte espectral
 *     (autovalores negativos a 0 y reescala a diagonal 1) —
 *     método estándar, documentado acá y en docs R14.
 *
 *  QUÉ SUPONE (cuando no hay datos, y solo ahí):
 *   - Las correlaciones de bloque (industria 0,65 · sector 0,55 ·
 *     resto 0,45 · cripto-cripto 0,70 · cripto-resto 0,25) son
 *     PRIORS: cada correlación medida se encoge hacia su prior
 *     según la muestra efectiva compartida (shrinkage
 *     n_eff/(n_eff+K), K = 60: con n_eff = 60, medición y prior
 *     pesan lo mismo; con menos de 20 días de baja conjuntos
 *     manda el prior puro).
 *   - La volatilidad, si no se puede medir a la baja (menos de
 *     60 cierres o menos de 15 días de baja propios), cae a la
 *     volatilidad de respaldo que traiga el insumo (Finviz),
 *     después a beta × 22% (acotado 8–90), después a 60% si es
 *     cripto y a 26% como último default. La caja tiene
 *     volatilidad 0 y correlación 0 con todo.
 *
 *  CONSTANTES: todas viven ACÁ y en ningún otro lado — incluida
 *  la tasa libre de riesgo (RISK_FREE_PCT = 4%), el único
 *  supuesto financiero global del sistema de riesgo.
 */

export const RISK_FREE_PCT = 4;

/** Priors de correlación por bloque (ver encabezado). */
export const CORRELATION_PRIORS = {
  sameIndustry: 0.65,
  sameSector: 0.55,
  other: 0.45,
  cryptoCrypto: 0.7,
  cryptoOther: 0.25,
} as const;

/** Días de historia compartida para que la medición pese 50%. */
export const SHRINKAGE_K_DAYS = 60;
/** Solape mínimo para que la medición exista; debajo, prior puro.
 *  Desde R14 el solape se cuenta en DÍAS DE BAJA conjuntos. */
export const MIN_OVERLAP_DAYS = 20;
/** Días de baja propios mínimos para medir una desviación a la baja. */
export const MIN_DOWNSIDE_DAYS = 15;
/** Decaimiento EWMA diario (estándar RiskMetrics, R14). */
export const EWMA_LAMBDA = 0.94;
/** Cierres mínimos para medir una volatilidad (1 año ≈ 252). */
export const MIN_MEASURED_CLOSES = 60;
export const TRADING_DAYS_YEAR = 252;
/** Escalera de respaldo de volatilidad (ver encabezado). */
export const BETA_VOL_BASE_PCT = 22;
export const CRYPTO_DEFAULT_VOL_PCT = 60;
export const DEFAULT_VOL_PCT = 26;

export interface DatedClose {
  /** Timestamp del cierre (solo se usa como clave de alineación). */
  t: number;
  c: number;
}

export interface RiskAssetSpec {
  key: string;
  sector?: string | null;
  industry?: string | null;
  isCrypto?: boolean;
  isCash?: boolean;
  closes?: DatedClose[] | null;
  /** Volatilidad de respaldo (dato externo, p. ej. Finviz). */
  fallbackVolPct?: number | null;
  beta?: number | null;
  /** Peso de la posición en la cartera (fracción) para armar la
   *  serie de condicionamiento: los «días de baja» son los del
   *  retorno de ESTA canasta. Sin pesos en ningún spec, la
   *  canasta es equiponderada sobre los que tienen historia. */
  basketWeight?: number | null;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Retornos logarítmicos diarios, fechados por el cierre final. */
export function logReturnsByDate(closes: DatedClose[]): Map<number, number> {
  const out = new Map<number, number>();
  const sorted = [...closes].filter((p) => p.c > 0).sort((a, b) => a.t - b.t);
  for (let i = 1; i < sorted.length; i++) {
    out.set(sorted[i].t, Math.log(sorted[i].c / sorted[i - 1].c));
  }
  return out;
}

/** ============================================================
 *  CONDICIONAMIENTO A LA BAJA + EWMA (R14): el conjunto de días
 *  de medición y el peso de cada día, compartidos por TODAS las
 *  mediciones de una matriz (la misma regla para volatilidades,
 *  correlaciones y la descomposición: una sola medición).
 *  ============================================================ */
export interface DownsideConditioning {
  /** Timestamps en que el retorno diario de la canasta fue < 0. */
  downDays: Set<number>;
  /** Peso EWMA de cada día de retorno de la canasta (λ^edad sin
   *  normalizar; la edad se cuenta en días de retorno, del más
   *  reciente hacia atrás). */
  dayWeight: Map<number, number>;
  /** Retorno diario de la canasta por timestamp (diagnóstico). */
  basketReturns: Map<number, number>;
}

/** Arma el condicionamiento: la canasta son los specs con
 *  basketWeight > 0 (si alguno lo declara) o, si ninguno, todos
 *  los que tienen historia, equiponderados. El retorno del día
 *  es el promedio ponderado de los miembros presentes ese día. */
export function buildConditioning(specs: RiskAssetSpec[]): DownsideConditioning {
  const weighted = specs.filter((s) => (s.basketWeight ?? 0) > 0 && s.closes && s.closes.length > 1);
  const basket = weighted.length
    ? weighted
    : specs.filter((s) => s.closes && s.closes.length > 1).map((s) => ({ ...s, basketWeight: 1 }));
  const series = basket.map((s) => ({
    w: s.basketWeight as number,
    rets: logReturnsByDate(s.closes as DatedClose[]),
  }));
  const days = new Set<number>();
  for (const s of series) for (const t of s.rets.keys()) days.add(t);
  const sortedDays = [...days].sort((a, b) => a - b);
  const basketReturns = new Map<number, number>();
  for (const t of sortedDays) {
    let num = 0;
    let den = 0;
    for (const s of series) {
      const r = s.rets.get(t);
      if (r != null) {
        num += s.w * r;
        den += s.w;
      }
    }
    if (den > 0) basketReturns.set(t, num / den);
  }
  const ordered = [...basketReturns.keys()].sort((a, b) => a - b);
  const dayWeight = new Map<number, number>();
  ordered.forEach((t, i) => {
    dayWeight.set(t, Math.pow(EWMA_LAMBDA, ordered.length - 1 - i));
  });
  const downDays = new Set<number>();
  basketReturns.forEach((r, t) => {
    if (r < 0) downDays.add(t);
  });
  return { downDays, dayWeight, basketReturns };
}

/** Tamaño de muestra EFECTIVO de unos pesos: (Σw)²/Σw². Con
 *  λ = 0,94 tiende a ≈32 en series largas: es el «n» que ve el
 *  shrinkage hacia los priors desde R14. */
export function effectiveSampleSize(weights: number[]): number {
  const sum = weights.reduce((s, w) => s + w, 0);
  const sq = weights.reduce((s, w) => s + w * w, 0);
  return sq > 0 ? (sum * sum) / sq : 0;
}

/** Media y desvío ponderados por EWMA (denominador Σw). */
function weightedMeanSd(
  points: Array<{ x: number; w: number }>
): { mean: number; sd: number } | null {
  const tw = points.reduce((s, p) => s + p.w, 0);
  if (tw <= 0 || points.length === 0) return null;
  const mean = points.reduce((s, p) => s + p.w * p.x, 0) / tw;
  const variance = points.reduce((s, p) => s + p.w * (p.x - mean) ** 2, 0) / tw;
  return { mean, sd: Math.sqrt(Math.max(variance, 0)) };
}

/** DESVIACIÓN A LA BAJA anualizada % de un activo: desvío
 *  (ponderado EWMA) de sus retornos EN LOS DÍAS DE BAJA del
 *  condicionamiento, × √252. null si la historia no alcanza
 *  (< 60 cierres o < MIN_DOWNSIDE_DAYS días de baja propios). */
export function downsideVolPct(
  closes: DatedClose[] | null | undefined,
  cond: DownsideConditioning
): number | null {
  if (!closes || closes.length < MIN_MEASURED_CLOSES) return null;
  const rets = logReturnsByDate(closes);
  const points: Array<{ x: number; w: number }> = [];
  rets.forEach((r, t) => {
    if (cond.downDays.has(t)) points.push({ x: r, w: cond.dayWeight.get(t) ?? 0 });
  });
  if (points.length < MIN_DOWNSIDE_DAYS) return null;
  const stats = weightedMeanSd(points);
  if (!stats) return null;
  const vol = stats.sd * Math.sqrt(TRADING_DAYS_YEAR) * 100;
  // Umbral numérico: una «dispersión» bajo 0,01% anual es polvo
  // de punto flotante (serie constante reconstruida), no una
  // medición — se trata como no medible y manda el respaldo.
  return vol > 0.01 && Number.isFinite(vol) ? vol : null;
}

/** LA volatilidad de un activo según este módulo (única cadena):
 *  caja 0 → desviación a la baja medida → respaldo externo →
 *  beta × 22 → cripto 60 → default 26. Sin condicionamiento
 *  explícito se arma el degenerado del propio activo (sus días
 *  de retorno negativo); la matriz siempre pasa el compartido. */
export function volForSpec(spec: RiskAssetSpec, cond?: DownsideConditioning): number {
  if (spec.isCash) return 0;
  const measured = downsideVolPct(spec.closes, cond ?? buildConditioning([spec]));
  if (measured != null) return measured;
  if (spec.fallbackVolPct != null && spec.fallbackVolPct > 0) return spec.fallbackVolPct;
  if (spec.beta != null) return clamp(spec.beta * BETA_VOL_BASE_PCT, 8, 90);
  if (spec.isCrypto) return CRYPTO_DEFAULT_VOL_PCT;
  return DEFAULT_VOL_PCT;
}

/** Prior de correlación entre dos activos (los bloques de siempre). */
export function priorCorrelation(x: RiskAssetSpec, y: RiskAssetSpec): number {
  if (x.key === y.key) return 1;
  if (x.isCash || y.isCash) return 0;
  if (x.isCrypto && y.isCrypto) return CORRELATION_PRIORS.cryptoCrypto;
  if (x.isCrypto || y.isCrypto) return CORRELATION_PRIORS.cryptoOther;
  if (x.industry && y.industry && x.industry === y.industry) return CORRELATION_PRIORS.sameIndustry;
  if (x.sector && y.sector && x.sector === y.sector) return CORRELATION_PRIORS.sameSector;
  return CORRELATION_PRIORS.other;
}

export interface PairDetail {
  /** Correlación final (medida encogida hacia el prior). */
  rho: number;
  /** Correlación medida cruda (Pearson a la baja, ponderado
   *  EWMA), null si no se pudo medir. */
  measured: number | null;
  /** Días de BAJA conjuntos entre ambas series (R14). */
  overlapDays: number;
  /** Tamaño de muestra efectivo EWMA de esos días conjuntos. */
  effectiveDays: number;
  prior: number;
}

/** Correlación entre dos activos: medida A LA BAJA (días en que
 *  la cartera cayó) y ponderada EWMA, con shrinkage hacia el
 *  prior según la muestra efectiva compartida; prior puro si
 *  los días de baja conjuntos no alcanzan. Sin condicionamiento
 *  explícito se arma el de la pareja (canasta equiponderada de
 *  dos); la matriz siempre pasa el compartido de la cartera. */
export function pairCorrelation(
  x: RiskAssetSpec,
  y: RiskAssetSpec,
  cond?: DownsideConditioning
): PairDetail {
  const prior = priorCorrelation(x, y);
  if (x.key === y.key) return { rho: 1, measured: 1, overlapDays: 0, effectiveDays: 0, prior };
  if (x.isCash || y.isCash) return { rho: 0, measured: null, overlapDays: 0, effectiveDays: 0, prior };
  if (!x.closes || !y.closes) return { rho: prior, measured: null, overlapDays: 0, effectiveDays: 0, prior };
  const conditioning = cond ?? buildConditioning([x, y]);
  const ra = logReturnsByDate(x.closes);
  const rb = logReturnsByDate(y.closes);
  const pairs: Array<{ a: number; b: number; w: number }> = [];
  ra.forEach((r, t) => {
    const other = rb.get(t);
    if (other != null && conditioning.downDays.has(t)) {
      pairs.push({ a: r, b: other, w: conditioning.dayWeight.get(t) ?? 0 });
    }
  });
  const n = pairs.length;
  const nEff = effectiveSampleSize(pairs.map((p) => p.w));
  if (n < MIN_OVERLAP_DAYS) {
    return { rho: prior, measured: null, overlapDays: n, effectiveDays: nEff, prior };
  }
  const tw = pairs.reduce((s, p) => s + p.w, 0);
  if (tw <= 0) return { rho: prior, measured: null, overlapDays: n, effectiveDays: nEff, prior };
  const ma = pairs.reduce((s, p) => s + p.w * p.a, 0) / tw;
  const mb = pairs.reduce((s, p) => s + p.w * p.b, 0) / tw;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (const p of pairs) {
    cov += p.w * (p.a - ma) * (p.b - mb);
    va += p.w * (p.a - ma) ** 2;
    vb += p.w * (p.b - mb) ** 2;
  }
  if (va <= 0 || vb <= 0) {
    return { rho: prior, measured: null, overlapDays: n, effectiveDays: nEff, prior };
  }
  const measured = clamp(cov / Math.sqrt(va * vb), -1, 1);
  const w = nEff / (nEff + SHRINKAGE_K_DAYS);
  return {
    rho: clamp(w * measured + (1 - w) * prior, -1, 1),
    measured,
    overlapDays: n,
    effectiveDays: nEff,
    prior,
  };
}

/** ============================================================
 *  REPARACIÓN ESPECTRAL (R14): una matriz de correlaciones
 *  armada por pares (cada par encogido hacia SU prior) puede
 *  dejar de ser semidefinida positiva. Antes de usarla en una
 *  descomposición se verifica por autovalores (Jacobi cíclico)
 *  y, si el mínimo es negativo, se repara recortando los
 *  autovalores negativos a 0 y reescalando a diagonal 1 — el
 *  método estándar de «matriz de correlación válida más
 *  cercana» en su versión espectral simple.
 *  ============================================================ */

/** Descomposición espectral de una matriz simétrica (rotaciones
 *  de Jacobi). Devuelve autovalores y autovectores (columnas). */
export function jacobiEigen(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < 1e-14) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (Math.abs(apq) < 1e-15) continue;
        const tau = (a[q][q] - a[p][p]) / (2 * apq);
        // t = tan(θ) con la convención estable (Numerical Recipes):
        // con tau = 0 (diagonales iguales) da t = 1 — rotación de
        // 45°, la que anula el fuera-de-diagonal. (La forma con
        // sign(tau) colapsa a t = 0 justo en ese caso.)
        const t = tau >= 0
          ? 1 / (tau + Math.sqrt(1 + tau * tau))
          : 1 / (tau - Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

/** Autovalor mínimo de una matriz simétrica. */
export function minEigenvalue(matrix: number[][]): number {
  if (matrix.length === 0) return 0;
  return Math.min(...jacobiEigen(matrix).values);
}

/** Si la matriz de correlación no es SDP (autovalor mínimo < 0),
 *  la repara por recorte espectral + reescala a diagonal 1.
 *  Devuelve la matriz (la misma referencia si ya era válida) y
 *  si hizo falta reparar. Si la reconstrucción degenera
 *  (diagonal ≤ 0 en alguna fila), devuelve la original: el
 *  llamador conserva su guarda de varianza ≥ 0. */
export function repairCorrelationMatrix(
  matrix: number[][]
): { matrix: number[][]; repaired: boolean } {
  const n = matrix.length;
  if (n === 0) return { matrix, repaired: false };
  const { values, vectors } = jacobiEigen(matrix);
  if (Math.min(...values) >= -1e-10) return { matrix, repaired: false };
  const clipped = values.map((v) => Math.max(v, 0));
  const rebuilt: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += vectors[i][k] * clipped[k] * vectors[j][k];
      rebuilt[i][j] = s;
    }
  }
  for (let i = 0; i < n; i++) {
    if (!(rebuilt[i][i] > 1e-9)) return { matrix, repaired: false };
  }
  const rescaled = rebuilt.map((row, i) =>
    row.map((x, j) => clamp(x / Math.sqrt(rebuilt[i][i] * rebuilt[j][j]), -1, 1))
  );
  for (let i = 0; i < n; i++) rescaled[i][i] = 1;
  return { matrix: rescaled, repaired: true };
}

export interface RiskDecomposition {
  portfolioVolPct: number;
  /** MCTR por clave: riesgo marginal de la posición (en %). */
  mctrPct: Map<string, number>;
  /** PCTR por clave: % del riesgo total que explica la posición. */
  pctrPct: Map<string, number>;
}

/** Matriz de riesgo de un universo de activos: volatilidades y
 *  correlaciones de este módulo, con la descomposición de Euler
 *  computada desde esa única matriz. */
export class RiskMatrix {
  private readonly specs = new Map<string, RiskAssetSpec>();
  private readonly vols = new Map<string, number>();
  private readonly pairCache = new Map<string, PairDetail>();
  /** El condicionamiento a la baja de ESTA matriz (R14): un solo
   *  conjunto de días y unos solos pesos EWMA para todo. */
  readonly conditioning: DownsideConditioning;

  constructor(specs: RiskAssetSpec[]) {
    const unique: RiskAssetSpec[] = [];
    for (const s of specs) {
      if (this.specs.has(s.key)) continue;
      this.specs.set(s.key, s);
      unique.push(s);
    }
    this.conditioning = buildConditioning(unique);
    for (const s of unique) {
      this.vols.set(s.key, volForSpec(s, this.conditioning));
    }
  }

  has(key: string): boolean {
    return this.specs.has(key);
  }

  /** Cantidad de días de baja del condicionamiento (diagnóstico). */
  get downDaysCount(): number {
    return this.conditioning.downDays.size;
  }

  /** Volatilidad del módulo para un activo (0 si no está en la matriz). */
  volPct(key: string): number {
    return this.vols.get(key) ?? 0;
  }

  pairDetail(keyA: string, keyB: string): PairDetail {
    const cacheKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    const hit = this.pairCache.get(cacheKey);
    if (hit) return hit;
    const a = this.specs.get(keyA);
    const b = this.specs.get(keyB);
    const detail =
      a && b
        ? pairCorrelation(a, b, this.conditioning)
        : {
            rho: keyA === keyB ? 1 : 0, measured: null, overlapDays: 0,
            effectiveDays: 0, prior: keyA === keyB ? 1 : 0,
          };
    this.pairCache.set(cacheKey, detail);
    return detail;
  }

  correlation(keyA: string, keyB: string): number {
    return this.pairDetail(keyA, keyB).rho;
  }

  /** Descomposición de Euler sobre esta matriz: volatilidad de
   *  cartera, MCTR y PCTR por posición. La matemática es la de
   *  siempre (σw = Σ·w; MCTR_i = σ_i·(Σw)_i/σp — expresado en %;
   *  PCTR_i = w_i·σ_i·(Σw)_i/σp²), alimentada por la matriz
   *  medida A LA BAJA y verificada SDP: la submatriz de
   *  correlaciones de las entradas se repara por recorte
   *  espectral si hace falta (repairCorrelationMatrix) antes de
   *  descomponer, para que la varianza de cartera nunca salga
   *  de una matriz inválida. Los pesos son fracciones (suman 1);
   *  la volatilidad de cada entrada sale de la matriz salvo
   *  override explícito (para activos ajenos a la matriz, p.
   *  ej. filas sintéticas). */
  decompose(entries: Array<{ key: string; weight: number; volPct?: number }>): RiskDecomposition {
    const sig = entries.map((e) => (e.volPct ?? this.volPct(e.key)) / 100);
    const w = entries.map((e) => e.weight);
    const rhoRaw = entries.map((e1) => entries.map((e2) => this.correlation(e1.key, e2.key)));
    const { matrix: rho } = repairCorrelationMatrix(rhoRaw);
    const sigmaW = entries.map((_, i) => {
      let s = 0;
      for (let j = 0; j < entries.length; j++) {
        s += rho[i][j] * sig[j] * w[j];
      }
      return sig[i] * s;
    });
    const varP = w.reduce((s, wi, i) => s + wi * sigmaW[i], 0);
    const volP = Math.sqrt(Math.max(varP, 0)) * 100;
    const mctrPct = new Map<string, number>();
    const pctrPct = new Map<string, number>();
    entries.forEach((e, i) => {
      if (volP > 0) {
        mctrPct.set(e.key, (sigmaW[i] / (volP / 100)) * 100);
        pctrPct.set(e.key, ((w[i] * sigmaW[i]) / varP) * 100);
      }
    });
    return { portfolioVolPct: volP, mctrPct, pctrPct };
  }
}

export function buildRiskMatrix(specs: RiskAssetSpec[]): RiskMatrix {
  return new RiskMatrix(specs);
}
