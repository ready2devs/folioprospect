import type { FairValueResult } from './types.js';

export interface FundamentalInput {
  symbol: string;
  currentPrice: number;
  targetMeanPrice?: number | null;
  freeCashflow?: number | null;
  operatingCashflow?: number | null;
  totalCash?: number | null;
  totalDebt?: number | null;
  sharesOutstanding?: number | null;
  earningsGrowth?: number | null; // decimal e.g. 0.25
  revenueGrowth?: number | null; // decimal e.g. 0.20
  trailingPE?: number | null;
  forwardPE?: number | null;
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

/**
 * Banda de credibilidad de un componente de valuación, medida contra los
 * DEMÁS componentes — nunca contra el precio. Un componente se promedia solo
 * si no contradice groseramente a las otras valuaciones: debe caer dentro de
 * [0.25×, 3.5×] del promedio de las demás. Medir la banda contra el precio
 * hacía que el Fair Value saltara cuando el precio cruzaba un umbral, y en el
 * sentido perverso (SIMO, 2026-11-02: al caer el precio bajo US$192,58, su
 * DCF de US$48,14 «entró» al promedio y el FV cayó 29,8% sin ningún cambio
 * fundamental). Si no hay otros componentes, nada contradice al componente
 * y se incluye.
 */
export function withinCredibilityBand(value: number, others: number[]): boolean {
  if (others.length === 0) return true;
  const ref = others.reduce((s, x) => s + x, 0) / others.length;
  return value > ref * 0.25 && value < ref * 3.5;
}

export interface ValuationComponents {
  dcf: number | null;
  multiples: number | null;
  target: number | null;
}

/**
 * Componentes que efectivamente se promedian en el Fair Value. La decisión
 * de inclusión de cada componente con banda (DCF y múltiplos) depende solo
 * de los demás componentes, por lo que el Fair Value es invariante ante
 * movimientos del precio. El target de analistas no lleva banda (como antes).
 */
export function selectFairValueComponents(c: ValuationComponents): number[] {
  const present = (v: number | null): v is number =>
    v != null && v > 0 && Number.isFinite(v);
  const othersFor = (self: 'dcf' | 'multiples'): number[] =>
    [self === 'dcf' ? c.multiples : c.dcf, c.target].filter(present);
  const components: number[] = [];
  if (present(c.dcf) && withinCredibilityBand(c.dcf, othersFor('dcf'))) {
    components.push(c.dcf);
  }
  if (present(c.multiples) && withinCredibilityBand(c.multiples, othersFor('multiples'))) {
    components.push(c.multiples);
  }
  if (present(c.target)) {
    components.push(c.target);
  }
  return components;
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

  if (isCrypto) {
    return {
      symbol,
      currentPrice,
      fairValue: null,
      dcfValue: null,
      analystTarget: null,
      fvComponents: [],
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

  // 2-stage 10-year DCF per share
  let dcfValue: number | null = null;
  if (fcfBase && input.sharesOutstanding && input.sharesOutstanding > 0) {
    const fcfPerShare = fcfBase / input.sharesOutstanding;
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

  // Forward earnings multiple valuation fallback
  let multipleFairValue: number | null = null;
  if (input.forwardPE && input.forwardPE > 0 && currentPrice > 0) {
    const forwardEps = currentPrice / input.forwardPE;
    const targetMultiple = moat === 'Wide' ? 26 : moat === 'Narrow' ? 20 : 15;
    multipleFairValue = forwardEps * targetMultiple;
  }

  const analystTarget =
    input.targetMeanPrice && input.targetMeanPrice > 0 ? input.targetMeanPrice : null;

  // Inclusión por banda de credibilidad contra los otros componentes (no
  // contra el precio): ver withinCredibilityBand / selectFairValueComponents.
  const components = selectFairValueComponents({
    dcf: dcfValue,
    multiples: multipleFairValue,
    target: analystTarget,
  });

  const fairValue =
    components.length > 0
      ? components.reduce((s, x) => s + x, 0) / components.length
      : currentPrice * 1.05;

  const priceToFairValue = fairValue > 0 ? currentPrice / fairValue : null;
  const upsidePct = fairValue > 0 ? ((fairValue - currentPrice) / currentPrice) * 100 : null;

  let status: 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A' = 'Fairly Valued';
  if (priceToFairValue != null) {
    if (priceToFairValue < 0.88) status = 'Undervalued';
    else if (priceToFairValue > 1.12) status = 'Overvalued';
    else status = 'Fairly Valued';
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
    fvComponents: components,
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
