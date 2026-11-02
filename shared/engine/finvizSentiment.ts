/**
 * Sentimiento de color estilo Finviz para los indicadores de la ficha del
 * activo: verde («positive») / rojo («negative») / sin color (null).
 *
 * Los umbrales NO son una opinión de esta app: se extrajeron el 2026-11-02
 * del propio HTML de Finviz (cada valor coloreado trae la clase
 * `is-positive` / `is-negative`) sobre una muestra de 53 tickers y ~75
 * indicadores por ticker, ordenando cada indicador por valor para localizar
 * el punto donde cambia el color. Especificación completa e intervalos
 * empíricos: ~/workspace/folioprospect-design/FINVIZ-COLORES-CRITERIOS-2026-11-02.md
 *
 * Reglas (todas verificadas contra la muestra; «—»/null/NaN ⇒ sin color):
 * - Múltiplos de valuación: bandas fijas; múltiplo ≤ 0 (o negativo) ⇒ sin
 *   color, como hace Finviz cuando el denominador no tiene sentido.
 * - Crecimiento (%): regla única para EPS y ventas en todo horizonte:
 *   > +25% verde · 0% a +25% sin color · < 0% rojo.
 * - Rentabilidad (%): verde sobre un piso por indicador (ROA 15, ROE 30,
 *   ROIC 25, margen bruto 50, operativo 30, neto 20); rojo solo si negativo.
 * - Solvencia: Deuda/Patrimonio verde < 0,1 y rojo > 0,5; Current Ratio
 *   rojo < 1 y verde > 3; Quick Ratio rojo < 0,5 y verde > 3.
 * - RSI: verde < 30 (sobreventa), rojo > 70 (sobrecompra).
 * - Short Float: rojo > 20%. Insider Own: verde > 30%. Insider Trans: rojo
 *   solo con ventas muy fuertes (< −20%). Inst Own/Trans, Payout,
 *   dividendos, Beta, volatilidad, Short Ratio: Finviz nunca los colorea.
 */

export type FinvizSentiment = 'positive' | 'negative' | null;

export type FinvizSentimentKind =
  | 'pe'
  | 'forwardPe'
  | 'peg'
  | 'priceToSales'
  | 'priceToBook'
  | 'priceToCash'
  | 'priceToFcf'
  | 'evToEbitda'
  | 'evToSales'
  | 'growthPct'
  | 'roa'
  | 'roe'
  | 'roic'
  | 'grossMargin'
  | 'operMargin'
  | 'profitMargin'
  | 'debtToEquity'
  | 'currentRatio'
  | 'quickRatio'
  | 'insiderOwn'
  | 'insiderTrans'
  | 'shortFloat'
  | 'rsi';

function band(v: number, greenBelow: number, redAbove: number): FinvizSentiment {
  if (v < greenBelow) return 'positive';
  if (v > redAbove) return 'negative';
  return null;
}

function profitBand(v: number, greenAbove: number): FinvizSentiment {
  if (v > greenAbove) return 'positive';
  if (v < 0) return 'negative';
  return null;
}

export function finvizSentiment(
  kind: FinvizSentimentKind,
  value: number | null | undefined
): FinvizSentiment {
  if (value == null || !Number.isFinite(value)) return null;
  const v = value;
  switch (kind) {
    // ── Valuación ──────────────────────────────────────────────────────
    case 'pe':
    case 'forwardPe':
      return v <= 0 ? null : band(v, 20, 40);
    case 'peg':
      return v <= 0 ? null : band(v, 1, 2);
    case 'priceToSales':
    case 'evToSales':
      return v <= 0 ? null : band(v, 1, 10);
    case 'priceToBook':
      // Finviz nunca lo marca verde (ni con 1,20 en la muestra); rojo > 5.
      return v > 5 ? 'negative' : null;
    case 'priceToCash':
      return v <= 0 ? null : band(v, 3, 50);
    case 'priceToFcf':
      return v <= 0 ? null : band(v, 20, 40);
    case 'evToEbitda':
      return v <= 0 ? null : band(v, 10, 20);
    // ── Crecimiento (regla única de Finviz para % de EPS y ventas) ─────
    case 'growthPct':
      if (v > 25) return 'positive';
      if (v < 0) return 'negative';
      return null;
    // ── Rentabilidad ───────────────────────────────────────────────────
    case 'roa':
      return profitBand(v, 15);
    case 'roe':
      return profitBand(v, 30);
    case 'roic':
      return profitBand(v, 25);
    case 'grossMargin':
      return profitBand(v, 50);
    case 'operMargin':
      return profitBand(v, 30);
    case 'profitMargin':
      return profitBand(v, 20);
    // ── Solvencia ──────────────────────────────────────────────────────
    case 'debtToEquity':
      if (v < 0.1) return 'positive';
      if (v > 0.5) return 'negative';
      return null;
    case 'currentRatio':
      if (v < 1) return 'negative';
      if (v > 3) return 'positive';
      return null;
    case 'quickRatio':
      if (v < 0.5) return 'negative';
      if (v > 3) return 'positive';
      return null;
    // ── Propiedad y riesgo ─────────────────────────────────────────────
    case 'insiderOwn':
      return v > 30 ? 'positive' : null;
    case 'insiderTrans':
      // Solo ventas muy fuertes; Finviz no lo marca verde ni con compras.
      return v < -20 ? 'negative' : null;
    case 'shortFloat':
      return v > 20 ? 'negative' : null;
    case 'rsi':
      if (v < 30) return 'positive';
      if (v > 70) return 'negative';
      return null;
    default:
      return null;
  }
}
