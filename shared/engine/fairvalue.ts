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

  const components: number[] = [];
  if (dcfValue && dcfValue > currentPrice * 0.25 && dcfValue < currentPrice * 3.5) {
    components.push(dcfValue);
  }
  if (multipleFairValue && multipleFairValue > currentPrice * 0.25 && multipleFairValue < currentPrice * 3.5) {
    components.push(multipleFairValue);
  }
  if (analystTarget) {
    components.push(analystTarget);
  }

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
