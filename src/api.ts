import type {
  ArgFxResponse,
  AssetMeta,
  ComputedHolding,
  DailyPoint,
  DistributionRow,
  FairValueResult,
  MonthlyComparison,
  PeriodPerformance,
  Portfolio,
  PortfolioKPIs,
  ProjectionResult,
  QuoteData,
  RiskMetrics,
} from '@shared/engine/types';

export type { ArgFxResponse };

export interface PortfolioEvaluationResponse {
  portfolio: Portfolio;
  kpis: PortfolioKPIs;
  holdings: ComputedHolding[];
  closedHoldings: ComputedHolding[];
  sparklines: Record<string, { prevClose: number; points: number[] }>;
  distribution: {
    assets: DistributionRow[];
    assetTypes: DistributionRow[];
    sectors: DistributionRow[];
    currency: DistributionRow[];
  };
  series: {
    daily: DailyPoint[];
    monthly: MonthlyComparison[];
    periods: PeriodPerformance;
    benchmarkSymbol: string;
  };
  risk: RiskMetrics;
  movers: {
    gainers: ComputedHolding[];
    losers: ComputedHolding[];
  };
  calendar: {
    snapshotDate: string;
    earnings: any[];
    dividends: any[];
    news: any[];
  };
  tvReference: any;
  defaultProjection: ProjectionResult;
  cached: boolean;
}

export interface MarketOverviewResponse {
  indices: {
    symbol: string;
    ticker: string;
    name: string;
    region: string;
    price: number;
    prevClose: number;
    change: number;
    changePct: number;
    sparkline: number[];
  }[];
  sectors: {
    symbol: string;
    ticker: string;
    name: string;
    weight: string;
    price: number;
    changePct: number;
    sparkline: number[];
  }[];
  news: { symbol: string; headline: string; provider: string }[];
  earnings: any[];
}

export interface AssetDetailResponse {
  symbol: string;
  meta: AssetMeta;
  quote: QuoteData;
  sparkline: { prevClose: number; points: number[] };
  chart: { points: [number, number][]; prevClose: number };
  fairValue: FairValueResult;
  holding: ComputedHolding | null;
  trades: any[];
  projection: ProjectionResult;
}

export const api = {
  async getFx(): Promise<{ USD: number; ARS: number; EUR: number }> {
    const r = await fetch('/api/fx');
    return r.json();
  },
  async getArgFx(): Promise<ArgFxResponse> {
    const r = await fetch('/api/fx/ar');
    return r.json();
  },
  async evaluatePortfolio(
    id = '2bb80f7315764422a5347e8d38503f4e',
    benchmark = 'SP:SPX',
    mode: 'live' | 'tv_snapshot' = 'tv_snapshot'
  ): Promise<PortfolioEvaluationResponse> {
    const r = await fetch(
      `/api/portfolios/${encodeURIComponent(id)}/evaluate?benchmark=${encodeURIComponent(
        benchmark
      )}&mode=${mode}`
    );
    return r.json();
  },
  async getMarketOverview(): Promise<MarketOverviewResponse> {
    const r = await fetch('/api/market');
    return r.json();
  },
  async getAssetDetail(symbol: string, range = '1Y'): Promise<AssetDetailResponse> {
    const r = await fetch(
      `/api/asset/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`
    );
    return r.json();
  },
  async runProjection(params: Record<string, any>): Promise<ProjectionResult> {
    const r = await fetch('/api/projection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return r.json();
  },
  async addTrade(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async deleteTrade(portfolioId: string, txId: string | number): Promise<any> {
    const r = await fetch(
      `/api/portfolios/${encodeURIComponent(portfolioId)}/trades/${encodeURIComponent(
        String(txId)
      )}`,
      { method: 'DELETE' }
    );
    return r.json();
  },
  async addCash(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/cash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async addDividend(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/dividends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async addIlliquid(portfolioId: string, payload: Record<string, any>): Promise<any> {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/illiquid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  async deleteIlliquid(portfolioId: string, assetId: string): Promise<any> {
    const r = await fetch(
      `/api/portfolios/${encodeURIComponent(portfolioId)}/illiquid/${encodeURIComponent(
        assetId
      )}`,
      { method: 'DELETE' }
    );
    return r.json();
  },
  async importCsv(portfolioId: string, csv: string): Promise<any> {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv }),
    });
    return r.json();
  },
  async resetSeed(portfolioId: string): Promise<any> {
    const r = await fetch(`/api/portfolios/${encodeURIComponent(portfolioId)}/reset`, {
      method: 'POST',
    });
    return r.json();
  },
  async search(q: string): Promise<any[]> {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    return r.json();
  },
};
