/**
 * Evaluación de oportunidad — lógica pura de la ficha (PMV del 21/10/2026).
 *
 * Port directo de la lógica validada en la app «Evaluación de oportunidad:
 * estudio de datos y app PMV» (caso de prueba ALB):
 *  - Una sola métrica de ganancia potencial: % hasta el Fair Value (upside).
 *  - Ranking de oportunidad de inversión: estrellas (1–5) + puntaje 0–100 +
 *    etiqueta, según bandas de exigencia Precio/Fair Value por incertidumbre.
 *  - Veredicto ponderado: compra fuerte / comprar de a poco / mantener / vender.
 *
 * Sin dependencias: lo usan el cliente (ficha embebida en el detalle del
 * activo) y los tests.
 */

export type UncertaintyLevel = 'Low' | 'Medium' | 'High' | 'Very High' | 'Extreme';
export type MoatLevel = 'None' | 'Narrow' | 'Wide';
export type ScenarioKey = 'Pesimista' | 'Base' | 'Optimista';

/** Bandas de exigencia: ratio Precio/Fair Value máximo para 5★, 4★, 3★ y 2★. */
export const OPPORTUNITY_BANDS: Record<UncertaintyLevel, [number, number, number, number]> = {
  Low: [0.8, 0.95, 1.05, 1.2],
  Medium: [0.7, 0.9, 1.1, 1.3],
  High: [0.6, 0.85, 1.15, 1.4],
  'Very High': [0.5, 0.8, 1.25, 1.75],
  Extreme: [0.25, 0.5, 1.5, 2.5],
};

export const UNCERTAINTY_LEVELS: UncertaintyLevel[] = [
  'Low',
  'Medium',
  'High',
  'Very High',
  'Extreme',
];

/** Normaliza la incertidumbre del motor de Fair Value (sin «Very High») a la de la ficha. */
export function normalizeUncertainty(
  raw: string | null | undefined
): UncertaintyLevel {
  if (raw === 'Very High') return 'Very High';
  if (raw === 'Low' || raw === 'Medium' || raw === 'High' || raw === 'Extreme') return raw;
  return 'Medium';
}

export function starsFor(ratio: number, unc: UncertaintyLevel): number {
  const b = OPPORTUNITY_BANDS[unc];
  if (!(ratio > 0)) return 1;
  if (ratio <= b[0]) return 5;
  if (ratio <= b[1]) return 4;
  if (ratio <= b[2]) return 3;
  if (ratio <= b[3]) return 2;
  return 1;
}

export function scoreFor(ratio: number, unc: UncertaintyLevel): number {
  const b = OPPORTUNITY_BANDS[unc];
  const s = starsFor(ratio, unc);
  let lo: number;
  let hi: number;
  if (s === 5) {
    lo = 0;
    hi = b[0];
  } else if (s === 4) {
    lo = b[0];
    hi = b[1];
  } else if (s === 3) {
    lo = b[1];
    hi = b[2];
  } else if (s === 2) {
    lo = b[2];
    hi = b[3];
  } else {
    lo = b[3];
    hi = b[3] + (b[3] - b[2]);
  }
  const raw = (s - 1) * 20 + ((hi - ratio) / (hi - lo)) * 20;
  const min = s === 1 ? 0 : (s - 1) * 20 + 1;
  return Math.round(Math.max(min, Math.min(s * 20, raw)));
}

export function labelForScore(score: number): string {
  if (score >= 81) return 'Oportunidad alta';
  if (score >= 61) return 'Oportunidad buena';
  if (score >= 41) return 'Oportunidad neutra · precio justo';
  if (score >= 21) return 'Oportunidad baja';
  return 'Sin oportunidad · cara';
}

export interface OpportunityInput {
  price: number;
  fvPesimista: number;
  fvBase: number;
  fvOptimista: number;
  scenario: ScenarioKey;
  uncertainty: UncertaintyLevel;
  yearsToCorrection: number;
}

export interface OpportunityResult {
  fv: number;
  upsidePct: number;
  ratio: number;
  stars: number;
  score: number;
  label: string;
  /** Rango de estrellas/puntaje recalculando con los escenarios pesimista y optimista. */
  starsRange: [number, number];
  scoreRange: [number, number];
  /** CAGR (rentabilidad anual compuesta) si el precio converge al FV en los años indicados. */
  annualizedPct: number | null;
  verdict: 'COMPRA FUERTE' | 'COMPRAR (de a poco, no todo junto)' | 'MANTENER' | 'VENDER';
  verdictWhy: string;
  verdictNote: string;
}

const fmtUsd0 = (n: number): string =>
  'US$ ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
const fmtPct0 = (x: number): string =>
  (x >= 0 ? '+' : '−') + Math.abs(x * 100).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + '%';

export function computeOpportunity(input: OpportunityInput): OpportunityResult | null {
  const { price, fvPesimista, fvBase, fvOptimista, scenario, uncertainty, yearsToCorrection } = input;
  const fv =
    scenario === 'Pesimista' ? fvPesimista : scenario === 'Optimista' ? fvOptimista : fvBase;
  if (!(price > 0) || !(fv > 0)) return null;

  const upsidePct = (fv / price - 1) * 100;
  const ratio = price / fv;
  const stars = starsFor(ratio, uncertainty);
  const score = scoreFor(ratio, uncertainty);

  const sPes = fvPesimista > 0 ? starsFor(price / fvPesimista, uncertainty) : stars;
  const sOpt = fvOptimista > 0 ? starsFor(price / fvOptimista, uncertainty) : stars;
  const scPes = fvPesimista > 0 ? scoreFor(price / fvPesimista, uncertainty) : score;
  const scOpt = fvOptimista > 0 ? scoreFor(price / fvOptimista, uncertainty) : score;

  const annualizedPct =
    yearsToCorrection > 0 ? (Math.pow(fv / price, 1 / yearsToCorrection) - 1) * 100 : null;

  // Veredicto ponderado (regla del PMV, textual)
  let verdict: OpportunityResult['verdict'];
  let verdictWhy: string;
  let verdictNote: string;
  const upBase = fvBase > 0 ? fvBase / price - 1 : -1;
  const upPes = fvPesimista > 0 ? fvPesimista / price - 1 : -1;
  if (upPes > 0.2) {
    verdict = 'COMPRA FUERTE';
    verdictWhy = `Hasta en el escenario pesimista (${fmtUsd0(fvPesimista)}) el valor justo supera al precio por más de 20%: hay colchón aun si las cosas salen mal.`;
    verdictNote = 'Si ya la tenés: MANTENER (y se puede sumar).';
  } else if (upBase >= 0.3) {
    verdict = 'COMPRAR (de a poco, no todo junto)';
    verdictWhy = `El upside hasta el valor justo base es ${fmtPct0(upBase)}, pero en el escenario pesimista (${fmtUsd0(fvPesimista)}) casi no hay colchón: por eso conviene entrar de a poco y no todo junto.`;
    verdictNote = 'Si ya la tenés: MANTENER.';
  } else if (upBase >= -0.1) {
    verdict = 'MANTENER';
    verdictWhy = `El upside hasta el valor justo base es chico (${fmtPct0(upBase)}): no alcanza para comprar con convicción, pero tampoco hay motivos fuertes para vender.`;
    verdictNote = 'Si no la tenés: esperar un precio mejor.';
  } else {
    verdict = 'VENDER';
    verdictWhy = `El precio ya está por encima del valor justo base (${fmtUsd0(fvBase)}): los riesgos pesan más que la oportunidad.`;
    verdictNote = 'Si ya la tenés: VENDER o reducir la posición.';
  }

  return {
    fv,
    upsidePct,
    ratio,
    stars,
    score,
    label: labelForScore(score),
    starsRange: [Math.min(sPes, sOpt), Math.max(sPes, sOpt)],
    scoreRange: [Math.min(scPes, scOpt), Math.max(scPes, scOpt)],
    annualizedPct,
    verdict,
    verdictWhy,
    verdictNote,
  };
}

/** Consenso de analistas: etiqueta a partir del conteo alcista/neutral/bajista. */
export function consensusTag(bullish: number, neutral: number, bearish: number): string {
  if (bullish > neutral + bearish) return 'Comprar';
  if (bearish > neutral + bullish) return 'Vender';
  return 'Neutral';
}
