export type AssetType = 'Stock' | 'Dr' | 'Crypto' | 'ETF' | 'Index' | 'Cash' | 'Illiquid';
export type CurrencyCode = 'USD' | 'ARS' | 'EUR';
export type MarketState = 'open' | 'pre' | 'post' | 'closed';

export interface Trade {
  id: string | number;
  time: number; // epoch ms
  symbol: string; // e.g. "NASDAQ:NVDA", "BINANCE:BTCUSDT"
  isBuy: boolean;
  qty: number;
  price: number;
  commission: number;
  comment?: string;
  fxRate?: number; // optional USDT/USD or local FX factor at execution
}

export interface CashTx {
  id: string;
  time: number;
  type: 'deposit' | 'withdrawal' | 'taxes_and_fees' | 'income';
  amount: number; // positive number in USD (or converted)
  currency: string;
  comment?: string;
}

export interface DividendTx {
  id: string;
  time: number;
  symbol: string;
  amount: number; // net USD dividend
  tax?: number;
  comment?: string;
}

export interface SplitTx {
  id: string;
  time: number;
  symbol: string;
  ratio: number; // e.g. 10 for 10-for-1
}

export interface IlliquidAsset {
  id: string;
  name: string;
  category: 'Real estate' | 'Private fund' | 'Fixed deposit' | 'Bond' | 'Other';
  costBasis: number; // in USD
  currentValue: number; // in USD
  currency: string;
  annualYieldPct: number; // expected annual yield / appreciation %
  acquiredAt: number; // epoch ms
  notes?: string;
}

export interface Portfolio {
  id: string;
  title: string;
  description?: string;
  currency: 'USD';
  benchmark: string; // e.g. "SP:SPX"
  riskFreeRate: number; // annual % e.g. 2
  startPoint: number; // epoch ms
  trades: Trade[];
  cash: CashTx[];
  dividends: DividendTx[];
  splits: SplitTx[];
  illiquid: IlliquidAsset[];
}

export interface AssetMeta {
  symbol: string;
  ticker: string;
  exchange: string;
  yahoo: string;
  name: string;
  sector: string;
  industry: string;
  country: string;
  assetType: AssetType;
  currency: string;
}

export interface QuoteData {
  symbol: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  currency: string;
  name?: string;
  marketCap?: number;
  updatedAt?: number;
  marketState?: MarketState;
  regularMarketTime?: number;
  extPrice?: number;
  extChange?: number;
  extChangePct?: number;
  extTime?: number;
  extSession?: 'pre' | 'post';
}

export interface ComputedHolding {
  symbol: string;
  ticker: string;
  exchange: string;
  name: string;
  sector: string;
  assetType: AssetType;
  qty: number;
  avgPrice: number;
  invested: number;
  lastPrice: number;
  prevClose: number;
  value: number;
  allocation: number; // % of total gross holdings (+ positive cash + illiquid)
  unrealizedGain: { v: number; p: number };
  dailyGain: { v: number; p: number };
  realizedGain: number;
  dividendGain: number;
  totalGain: { v: number; p: number };
  annualizedYield: number;
  firstBuyTime: number;
  marketState?: MarketState;
  regularMarketTime?: number;
  extPrice?: number;
  extChange?: number;
  extChangePct?: number;
  extTime?: number;
  extSession?: 'pre' | 'post';
  dailyChangeAbs?: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  time: number; // epoch ms
  holdingsValue: number; // H(t)
  cashBalance: number; // C(t)
  illiquidValue: number; // I(t)
  portfolioValue: number; // PV(t) = H(t) + C(t) + I(t)
  grossValue: number; // H(t) + max(0, C(t)) + I(t)
  investedCapital: number;
  netFlow: number;
  cumReturnPct: number; // Chained TWR/Dietz %
  benchmarkPct: number; // Rebased benchmark %
}

export interface MonthlyComparison {
  month: string; // YYYY-MM
  timestamp: number; // start of period sec
  userGain: number;
  userReturnPct: number;
  benchChange: number;
  benchReturnPct: number;
}

export interface DistributionRow {
  key: string;
  label: string;
  value: number;
  allocation: number;
  unrealizedGain: number;
  count: number;
  color: string;
}

export interface PortfolioKPIs {
  portfolioValue: number; // Net value = holdings + free_cash + illiquid
  grossHoldingsValue: number; // Sum of liquid holdings
  illiquidValue: number; // Sum of illiquid assets
  totalGrossPatrimony: number; // grossHoldingsValue + max(0, freeCash) + illiquidValue
  freeCash: number; // C(t), can be negative in TradingView margin/unfunded ledger mode
  investedOpen: number;
  unrealizedGain: { v: number; p: number };
  lastDayGain: { v: number; p: number };
  realizedGain: { v: number; p: number };
  dividendGain: number;
  totalGain: { v: number; p: number };
  annualizedYield: number;
  openHoldingsCount: number;
  totalAssetsCount: number;
}

export interface PeriodPerformance {
  '1M': { gain: number; pct: number; benchPct: number };
  '3M': { gain: number; pct: number; benchPct: number };
  '6M': { gain: number; pct: number; benchPct: number };
  'YTD': { gain: number; pct: number; benchPct: number };
  '1Y': { gain: number; pct: number; benchPct: number };
  'ALL': { gain: number; pct: number; benchPct: number };
}

export interface RiskMetrics {
  sharpeRatio: { user: number; benchmark: number };
  sortinoRatio: { user: number; benchmark: number };
  beta: number;
  annualizedVolatility: number;
  benchmarkVolatility: number;
  maxDrawdownPct: number;
  mwrIrrPct: number;
  twrPct: number;
}

export interface FairValueResult {
  symbol: string;
  currentPrice: number;
  fairValue: number | null;
  dcfValue: number | null;
  analystTarget: number | null;
  priceToFairValue: number | null;
  status: 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A';
  upsidePct: number | null;
  moat: 'Wide' | 'Narrow' | 'None';
  moatScore: number; // 0..100
  uncertainty: 'Low' | 'Medium' | 'High' | 'Extreme';
  multiples: {
    pe: number | null;
    forwardPe: number | null;
    evToEbitda: number | null;
    fcfYieldPct: number | null;
    roicProxyPct: number | null;
    grossMarginPct: number | null;
    operatingMarginPct: number | null;
    roePct: number | null;
    revenueGrowthPct: number | null;
    debtToEquity: number | null;
  };
  implied10YReturnCagrPct: number;
}

export interface ProjectionYearPoint {
  year: number;
  calendarYear: number;
  investedCumulative: number;
  conservative: number;
  base: number;
  optimistic: number;
  mcP10: number;
  mcP50: number;
  mcP90: number;
  realBase: number; // inflation adjusted
}

export interface ProjectionResult {
  horizonYears: number;
  initialCapital: number;
  monthlyContribution: number;
  inflationPct: number;
  baseCagrPct: number;
  annualVolatilityPct: number;
  convergeToFairValue: boolean;
  points: ProjectionYearPoint[];
  summary10Y: ProjectionYearPoint;
  summary20Y: ProjectionYearPoint;
}

export interface ArgFxQuote {
  compra: number;
  venta: number;
  updatedAt?: string;
}

export interface ArgFxResponse {
  ccl: ArgFxQuote;
  mep: ArgFxQuote;
  cclRate: number;
  mepRate: number;
  source: 'dolarapi' | 'criptoya' | 'fallback';
  fetchedAt: number;
}

export interface NwSettings {
  brokerCashUsd: number;
  cashReserveUsd: number;
  includeCryptoInCcl: boolean;
  cclOverride: number | null;
  mepOverride: number | null;
  cclBaseOverride: number | null;
  sellCommPct: number;
  mepBuyCommPct: number;
  mepSellCommPct: number;
  fxDiffOverride: number | null;
}

export interface NwComputedResult {
  grossHoldingsUsd: number;
  brokerCashUsd: number;
  financialPortfolioLiquidUsd: number;
  cclBaseAutoUsd: number;
  cclBaseUsd: number;
  cclRate: number;
  mepRate: number;
  gapPct: number;
  commissionFactor: number;
  totalCommPct: number;
  usdMepObtained: number;
  fxDiffAutoUsd: number;
  fxDiffUsd: number;
  cashReserveUsd: number;
  nwLiquidUsd: number;
  illiquidTotalUsd: number;
  nwTotalUsd: number;
}
