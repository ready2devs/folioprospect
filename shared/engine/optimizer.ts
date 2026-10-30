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
 * De RE salen: años para duplicar = ln2/ln(1+RE) y el Score de inversión 0–100
 * (50% velocidad, 25% oportunidad Precio/FV de la ficha, 15% calidad, 10%
 * riesgo). A nivel cartera el RE es GEOMÉTRICO: se resta el arrastre de
 * volatilidad σ²/2 (Invesco CMA). El riesgo usa matriz de correlaciones por
 * bloques (aproximación v1 documentada) y descomposición de Euler: MCTR y
 * PCTR por activo, que ordenan desempates de extracción y validan swaps.
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
  grossMarginPct?: number | null;
  operatingMarginPct?: number | null;
  debtToEquity?: number | null;
  /** Score de oportunidad 0–100 de la ficha (bandas Precio/FV). */
  opportunityScore?: number | null;
  moatScore?: number | null;
  locked?: boolean;
  defensive?: boolean;
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
}

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
  reasonCode: 'veredicto-vender' | 'score-bajo' | 'reemplazo-sectorial' | 'concentracion' | 'bajo-retorno' | 'manual' | 'sugerencia';
  replacementTicker?: string;
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

/** Grinold-Kroner por activo. Devuelve null si no hay crecimiento estimable. */
export function grinoldKroner(a: OptimizerAssetInput): number | null {
  const growthCandidates: number[] = [];
  // Ancla preferida: ganancias totales (anti doble conteo con el buyback).
  if (a.earningsGrowthTotalPct != null) growthCandidates.push(a.earningsGrowthTotalPct);
  if (a.salesGrowthPct != null) growthCandidates.push(a.salesGrowthPct);
  if (growthCandidates.length === 0) {
    // Sin ancla de totales: EPS amortiguado (mediana próximo año / 5 años).
    const eps: number[] = [];
    if (a.epsNextYearPct != null) eps.push(a.epsNextYearPct);
    if (a.epsNext5YPct != null) eps.push(a.epsNext5YPct);
    if (eps.length === 0) return null;
    growthCandidates.push(median(eps));
  }
  const gRaw = clamp(median(growthCandidates), -10, 30);
  // Fade institucional: el crecimiento spot (trimestral/TTM en picos de ciclo)
  // revierte hacia el crecimiento nominal de largo plazo (~6%): por encima de
  // ese nivel solo se conserva el 45% del exceso. Sin esto, un boom sectorial
  // proyecta retornos imposibles de sostener.
  const g = gRaw > 6 ? 6 + (gRaw - 6) * 0.45 : gRaw;
  const div = a.dividendYieldPct ?? 0;
  const buyback = a.dilutionPct != null ? -a.dilutionPct : 0;
  let repricing = 0;
  if (a.forwardPe != null && a.industryForwardPe != null && a.forwardPe > 0 && a.industryForwardPe > 0) {
    repricing = clamp((Math.pow(a.industryForwardPe / a.forwardPe, 1 / 5) - 1) * 100, -5, 5);
  }
  return div + buyback + g + repricing;
}

export function fvConvergencePct(a: OptimizerAssetInput, years: number): number | null {
  if (a.fvBase == null || !(a.fvBase > 0) || !(a.price > 0) || years <= 0) return null;
  return clamp((Math.pow(a.fvBase / a.price, 1 / years) - 1) * 100, -25, 35);
}

export function consensusPct(a: OptimizerAssetInput): number | null {
  if (a.analystTarget == null || !(a.analystTarget > 0) || !(a.price > 0)) return null;
  // Es una vista a 1 año y suele perseguir al precio en mercados alcistas:
  // se acota más que la convergencia a FV para que no domine el blend.
  return clamp((a.analystTarget / a.price - 1) * 100, -20, 35);
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

  if (isCrypto || isCash) {
    re = a.assumedReturnPct ?? (isCash ? 0 : 11.5);
  } else {
    gk = grinoldKroner(a);
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
      re = clamp(avail.reduce((s, [v, w]) => s + v * w, 0) / tw, -15, 35);
    }
    const gAnchor =
      a.earningsGrowthTotalPct ?? a.salesGrowthPct ??
      (a.epsNext5YPct != null || a.epsNextYearPct != null
        ? median([a.epsNextYearPct, a.epsNext5YPct].filter((x): x is number => x != null))
        : null);
    if (gAnchor != null) gordon = (a.dividendYieldPct ?? 0) + clamp(gAnchor, 0, 5.5);

    // Score 0–100. Velocidad sobre el rango completo del RE acotado (−5..35):
    // un RE de 15% da 50; hacen falta ~25% para 75 y 35% para 100.
    const velocity = re != null ? clamp(((re + 5) / 40) * 100, 0, 100) : null;
    let opportunity = a.opportunityScore ?? null;
    if (opportunity == null && a.fvBase != null && a.fvBase > 0 && a.price > 0) {
      opportunity = scoreFor(a.price / a.fvBase, normalizeUncertainty(a.uncertainty) as UncertaintyLevel);
    }
    const quality = qualityScore(a);
    const riskScore = clamp(100 - Math.max(0, vol - 15) * 1.6 - Math.max(0, (a.debtToEquity ?? 0) - 1) * 8, 0, 100);
    const comps: Array<[number | null, number]> = [
      [velocity, 0.5],
      [opportunity, 0.25],
      [quality, 0.15],
      [riskScore, 0.1],
    ];
    const av = comps.filter(([v]) => v != null) as Array<[number, number]>;
    if (av.length >= 2 && re != null) {
      const tw = av.reduce((s, [, w]) => s + w, 0);
      score = Math.round(av.reduce((s, [v, w]) => s + v * w, 0) / tw);
      stars = clamp(Math.round(score / 20), 1, 5);
    }
  }

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
      !manualBySymbol.has(a.symbol)
  );
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

  // Orden de prioridad: peor eficiencia retorno/riesgo primero (Euler) como desempate.
  const byRiskEfficiency = [...stockAssets].sort(
    (x, y) => (x.excessPerRisk ?? Infinity) - (y.excessPerRisk ?? Infinity)
  );
  for (const a of byRiskEfficiency) {
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
  const extractedSymbols = new Set(extractions.map((e) => e.symbol));
  const sugPool = stockAssets
    .filter((a) => !extractedSymbols.has(a.symbol) && a.value * 0.5 >= opts.minTradeUsd)
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
  let suggestionCandidates: SuggestionCandidate[] = sugPool.slice(0, 5).map((a) => {
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
  const acceptedSug = new Set((options.acceptedSuggestions ?? []).map((t) => t.toUpperCase()));
  if (acceptedSug.size) {
    const appliedSyms = new Set<string>();
    for (const c of suggestionCandidates) {
      if (!acceptedSug.has(c.ticker.toUpperCase())) continue;
      soldQty.set(c.symbol, (soldQty.get(c.symbol) ?? 0) + c.qtySold);
      extractions.push({
        symbol: c.symbol, ticker: c.ticker, name: c.name, kind: 'parcial',
        qtySold: c.qtySold, price: c.price, grossUsd: c.grossUsd, netUsd: c.netUsd,
        reason: c.reason, reasonCode: 'sugerencia',
      });
      appliedSyms.add(c.symbol);
    }
    if (appliedSyms.size) {
      suggestionCandidates = suggestionCandidates.filter((c) => !appliedSyms.has(c.symbol));
    }
  }

  const fundsToReallocate = extractions.reduce((s, e) => s + e.netUsd, 0);

  // ---------- Reaplicación ----------
  const allocations: Allocation[] = [];
  if (fundsToReallocate >= opts.minTradeUsd) {
    interface Cand { key: string; score: number; capUsd: number; make: (amount: number) => Allocation }
    const cands: Cand[] = [];
    // 1) Pares sectoriales de los reemplazos
    const seenPeer = new Set<string>();
    for (const e of extractions) {
      if (!e.replacementTicker || seenPeer.has(e.replacementTicker)) continue;
      seenPeer.add(e.replacementTicker);
      const src = scored.find((a) => a.symbol === e.symbol)!;
      const peer = (peersByIndustry[src.industry] ?? []).find((p) => p.ticker === e.replacementTicker)!;
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
    // 2) Posiciones propias con score alto (reforzar), sin pasar el tope de peso
    for (const a of sorted) {
      if (a.isCrypto || a.isCash || a.score == null || a.score < 70) continue;
      if ((soldQty.get(a.symbol) ?? 0) >= a.qty) continue; // salió entera
      const roomUsd = (totalValue * opts.maxWeightPct) / 100 - a.value;
      if (roomUsd < opts.minTradeUsd) continue;
      cands.push({
        key: 'held:' + a.symbol,
        score: a.score,
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
            ? fundsToReallocate - assigned
            : Math.round((fundsToReallocate * (c.score * c.score)) / wSum);
        amount = Math.min(amount, c.capUsd);
        if (amount >= opts.minTradeUsd || (i === top.length - 1 && amount > 0)) {
          assigned += amount;
          const al = c.make(amount);
          made.push({ c, al });
          allocations.push(al);
        }
      });
      // Redistribuir lo que los topes dejaron libre entre las mismas candidatas;
      // lo que no entra queda como efectivo sin asignar en la cartera final.
      let leftover = fundsToReallocate - allocations.reduce((s, x) => s + x.amountUsd, 0);
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

  // ---------- Cartera final ----------
  const finalMap = new Map<string, AssetScore>();
  for (const a of scored) {
    const sold = soldQty.get(a.symbol) ?? 0;
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
      expectedReturnPct: al.expectedReturnPct, gordonFloorPct: null, belowGordonFloor: false,
      score: al.score, stars: al.score != null ? clamp(Math.round(al.score / 20), 1, 5) : null,
      yearsToDouble: yearsToDoubleFor(al.expectedReturnPct),
      volatilityPct: 30, mctrPct: null, riskContributionPct: null, excessPerRisk: null,
      locked: false, defensive: false, confidence: 'media',
    });
  }
  const finalAssets = [...finalMap.values()].sort(
    (x, y) => (y.expectedReturnPct ?? -Infinity) - (x.expectedReturnPct ?? -Infinity)
  );
  // Recalcular pesos/riesgo con el total final (las ventas netas quedan como caja)
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
      expectedReturnPct: 0, gordonFloorPct: null, belowGordonFloor: false, score: null, stars: null,
      yearsToDouble: null, volatilityPct: 0, mctrPct: null, riskContributionPct: null,
      excessPerRisk: null, locked: false, defensive: false, confidence: 'alta',
    });
  }
  finalAssets.forEach((a) => {
    a.weightPct = totalAfter > 0 ? (a.value / totalAfter) * 100 : 0;
  });
  const volAfter = applyRiskDecomposition(finalAssets, opts.riskFreePct);
  const after = portfolioMetrics(finalAssets, volAfter);

  // ---------- Veredicto riesgo/beneficio ----------
  const benefitUp = after.expectedReturnGeoPct > before.expectedReturnGeoPct + 0.1;
  const riskSimilar = after.volatilityPct <= before.volatilityPct + opts.riskTolerancePp;
  let verdict: OptimizerResult['verdict'];
  let verdictText: string;
  const [reBv, reAv] = fmtPairPct(before.expectedReturnGeoPct, after.expectedReturnGeoPct);
  const [volBv, volAv] = fmtPairPct(before.volatilityPct, after.volatilityPct);
  if (benefitUp && riskSimilar) {
    verdict = 'valida';
    verdictText = `Estrategia válida: riesgo similar (${volBv} → ${volAv}) y beneficio superior (${reBv} → ${reAv}). Vale la pena pensar en ejecutarla.`;
  } else if (benefitUp) {
    verdict = 'evaluar';
    verdictText = `Beneficio superior (${reBv} → ${reAv}), pero con más riesgo (${volBv} → ${volAv}). A evaluar con cuidado.`;
  } else {
    verdict = 'sin-mejora';
    verdictText = 'Con los datos de hoy, ninguna rotación mejora el beneficio sin subir el riesgo: la cartera queda como está.';
  }

  const narrative = buildNarrative(scored, before, after, extractions, allocations, verdictText);
  return {
    assets: sorted,
    extractions,
    allocations,
    fundsToReallocate,
    suggestionCandidates,
    before,
    after,
    finalAssets,
    verdict,
    verdictText,
    narrative,
  };
}

/** Evaluación escrita de la cartera (generada desde los números, tono asesor). */
export function buildNarrative(
  assets: AssetScore[],
  before: PortfolioMetrics,
  after: PortfolioMetrics,
  extractions: Extraction[],
  allocations: Allocation[],
  verdictText: string
): string[] {
  const out: string[] = [];
  const stocks = assets.filter((a) => !a.isCrypto && !a.isCash);
  const top = [...assets].sort((x, y) => y.weightPct - x.weightPct).slice(0, 3);
  const best = [...stocks].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))[0];
  const worst = [...stocks].sort((x, y) => (x.score ?? 100) - (y.score ?? 100))[0];

  out.push(
    `Tu cartera vale ${fmtUsd(before.totalValue)} en ${before.positions} posiciones y, con los precios y fundamentos de hoy, rinde un estimado de ${fmtPct1(before.expectedReturnGeoPct)} anual: duplicaría en unos ${fmtY(before.yearsToDouble)} años. Las tres posiciones más grandes (${top.map((a) => `${a.ticker} ${fmtPct1(a.weightPct)}`).join(', ')}) concentran el ${fmtPct1(before.top3WeightPct)} del total. Tu mejor oportunidad según el score es ${best?.ticker} (${best?.score}/100) y la más débil, ${worst?.ticker} (${worst?.score}/100).`
  );

  if (before.topSectorPct >= 45) {
    out.push(
      `El punto más delicado es la concentración: el sector ${before.topSector} pesa ${fmtPct1(before.topSectorPct)} de la cartera. No es un problema hoy si la tesis se mantiene, pero significa que un mal ciclo de ese sector define casi la mitad de tu resultado. La mejora no pasa por salir del sector, sino por rotar dentro de él hacia las empresas con mejor score.`
    );
  } else {
    out.push(
      `La concentración sectorial es razonable: el mayor sector (${before.topSector}) pesa ${fmtPct1(before.topSectorPct)}. El índice de concentración (HHI) es ${Math.round(before.hhi)}, compatible con una cartera concentrada pero no extrema.`
    );
  }

  const topRisk = [...assets]
    .filter((a) => a.riskContributionPct != null)
    .sort((x, y) => (y.riskContributionPct ?? 0) - (x.riskContributionPct ?? 0))
    .slice(0, 2);
  if (topRisk.length) {
    out.push(
      `En riesgo, la volatilidad estimada es ${fmtPct1(before.volatilityPct)} anual. No la aportan las posiciones más grandes sino las más volátiles: ${topRisk.map((a) => `${a.ticker} explica el ${fmtPct1(a.riskContributionPct ?? 0)} del riesgo total`).join(' y ')}. Por eso la optimización valida cada movimiento contra el riesgo total (descomposición de Euler): un cambio solo se propone si no lo empeora.`
    );
  }

  if (extractions.length) {
    const deltaRE = after.expectedReturnGeoPct - before.expectedReturnGeoPct;
    const [reB, reA] = fmtPairPct(before.expectedReturnGeoPct, after.expectedReturnGeoPct);
    const [yB, yA] = fmtPairYears(before.yearsToDouble, after.yearsToDouble);
    const [vB, vA] = fmtPairPct(before.volatilityPct, after.volatilityPct);
    const yearsClause =
      yB === yA
        ? `el tiempo para duplicar se mantiene en ${yB} años`
        : `el tiempo para duplicar ${after.yearsToDouble! < before.yearsToDouble! ? 'baja' : 'sube'} de ${yB} a ${yA} años`;
    const moves = `liberando ${fmtUsd(extractions.reduce((s, e) => s + e.netUsd, 0))} desde ${extractions.filter((e) => e.kind !== 'efectivo').map((e) => e.ticker).join(', ') || 'efectivo nuevo'} y reaplicándolo en ${allocations.map((a) => a.ticker).join(', ') || 'las mejores posiciones'}, el retorno estimado ${deltaRE >= 0 ? 'pasa' : 'queda'} de ${reB} a ${reA} y ${yearsClause}, con un riesgo de ${vA} (antes ${vB})`;
    if (deltaRE >= 0.15) {
      out.push(`Las posibilidades de mejora están en la cola de la cartera: ${moves}.`);
    } else {
      out.push(
        `La única rotación que disparan las reglas es marginal: ${moves}. Es un ajuste fino (concentración y prolijidad), no un cambio de panorama.`
      );
    }
  } else {
    out.push(
      'No aparecen rotaciones con fundamento suficiente: ninguna posición combina score bajo, sobreprecio contra su valor justo o un par sectorial claramente mejor. Mantener también es una decisión.'
    );
  }

  out.push(verdictText + ' Esto es una estimación con datos públicos y metodología documentada (ícono de información en cada métrica): no es asesoramiento financiero.');
  return out;
}
