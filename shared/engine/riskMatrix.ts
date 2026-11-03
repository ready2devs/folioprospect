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
 *  QUÉ MIDE (desde el historial de precios, 1 año diario):
 *   - Volatilidad medida por activo: desvío de los retornos
 *     logarítmicos diarios × √252.
 *   - Correlación medida por pares: Pearson sobre los retornos
 *     diarios alineados por fecha.
 *
 *  QUÉ SUPONE (cuando no hay datos, y solo ahí):
 *   - Las correlaciones de bloque (industria 0,65 · sector 0,55 ·
 *     resto 0,45 · cripto-cripto 0,70 · cripto-resto 0,25) son
 *     PRIORS: cada correlación medida se encoge hacia su prior
 *     según la historia compartida (shrinkage n/(n+K), K = 60
 *     días: con 60 días compartidos, medición y prior pesan lo
 *     mismo; con menos de 20 días de solape manda el prior).
 *   - La volatilidad, si no se puede medir (menos de 60 cierres),
 *     cae a la volatilidad de respaldo que traiga el insumo
 *     (Finviz), después a beta × 22% (acotado 8–90), después a
 *     60% si es cripto y a 26% como último default. La caja tiene
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
/** Solape mínimo para que la medición exista; debajo, prior puro. */
export const MIN_OVERLAP_DAYS = 20;
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

/** Volatilidad anualizada % MEDIDA desde los cierres (desvío
 *  muestral de los retornos diarios × √252). null si la historia
 *  no alcanza para medir. */
export function measuredVolPct(closes: DatedClose[] | null | undefined): number | null {
  if (!closes || closes.length < MIN_MEASURED_CLOSES) return null;
  const rets = [...logReturnsByDate(closes).values()];
  if (rets.length < MIN_MEASURED_CLOSES - 1) return null;
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1));
  const vol = sd * Math.sqrt(TRADING_DAYS_YEAR) * 100;
  return vol > 0 && Number.isFinite(vol) ? vol : null;
}

/** LA volatilidad de un activo según este módulo (única cadena):
 *  caja 0 → medida → respaldo externo → beta × 22 → cripto 60 →
 *  default 26. */
export function volForSpec(spec: RiskAssetSpec): number {
  if (spec.isCash) return 0;
  const measured = measuredVolPct(spec.closes);
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
  /** Correlación medida cruda (Pearson), null si no se pudo medir. */
  measured: number | null;
  /** Días de retornos compartidos entre ambas series. */
  overlapDays: number;
  prior: number;
}

/** Correlación entre dos activos: medida con shrinkage hacia el
 *  prior cuando hay historia compartida suficiente; prior puro
 *  en caso contrario. */
export function pairCorrelation(x: RiskAssetSpec, y: RiskAssetSpec): PairDetail {
  const prior = priorCorrelation(x, y);
  if (x.key === y.key) return { rho: 1, measured: 1, overlapDays: 0, prior };
  if (x.isCash || y.isCash) return { rho: 0, measured: null, overlapDays: 0, prior };
  if (!x.closes || !y.closes) return { rho: prior, measured: null, overlapDays: 0, prior };
  const ra = logReturnsByDate(x.closes);
  const rb = logReturnsByDate(y.closes);
  const pairs: Array<[number, number]> = [];
  ra.forEach((r, t) => {
    const other = rb.get(t);
    if (other != null) pairs.push([r, other]);
  });
  const n = pairs.length;
  if (n < MIN_OVERLAP_DAYS) return { rho: prior, measured: null, overlapDays: n, prior };
  const ma = pairs.reduce((s, p) => s + p[0], 0) / n;
  const mb = pairs.reduce((s, p) => s + p[1], 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (const [a, b] of pairs) {
    cov += (a - ma) * (b - mb);
    va += (a - ma) ** 2;
    vb += (b - mb) ** 2;
  }
  if (va <= 0 || vb <= 0) return { rho: prior, measured: null, overlapDays: n, prior };
  const measured = clamp(cov / Math.sqrt(va * vb), -1, 1);
  const w = n / (n + SHRINKAGE_K_DAYS);
  return { rho: clamp(w * measured + (1 - w) * prior, -1, 1), measured, overlapDays: n, prior };
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

  constructor(specs: RiskAssetSpec[]) {
    for (const s of specs) {
      if (this.specs.has(s.key)) continue;
      this.specs.set(s.key, s);
      this.vols.set(s.key, volForSpec(s));
    }
  }

  has(key: string): boolean {
    return this.specs.has(key);
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
        ? pairCorrelation(a, b)
        : { rho: keyA === keyB ? 1 : 0, measured: null, overlapDays: 0, prior: keyA === keyB ? 1 : 0 };
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
   *  medida. Los pesos son fracciones (suman 1); la volatilidad
   *  de cada entrada sale de la matriz salvo override explícito
   *  (para activos ajenos a la matriz, p. ej. filas sintéticas). */
  decompose(entries: Array<{ key: string; weight: number; volPct?: number }>): RiskDecomposition {
    const sig = entries.map((e) => (e.volPct ?? this.volPct(e.key)) / 100);
    const w = entries.map((e) => e.weight);
    const sigmaW = entries.map((_, i) => {
      let s = 0;
      for (let j = 0; j < entries.length; j++) {
        s += this.correlation(entries[i].key, entries[j].key) * sig[j] * w[j];
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
