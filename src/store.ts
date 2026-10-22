import { create } from 'zustand';
import type { CurrencyCode } from '@shared/engine/types';
import {
  api,
  type AssetDetailResponse,
  type MarketOverviewResponse,
  type PortfolioEvaluationResponse,
} from './api';

export type RightPanelState = 'market' | 'portfolio' | 'asset';
export type PortfolioTab = 'overview' | 'holdings' | 'transactions' | 'analysis' | 'prospectiva';

interface AppState {
  theme: 'dark' | 'light';
  currency: CurrencyCode;
  fxRates: Record<CurrencyCode, number>;
  pricingMode: 'tv_snapshot' | 'live';
  portfolioScope: 'personal' | 'overview';
  rightState: RightPanelState;
  portfolioTab: PortfolioTab;
  selectedSymbol: string;
  selectedAssetRange: string;
  benchmark: string;
  netOrGrossMode: 'net' | 'gross';
  searchOpen: boolean;
  addModalOpen: boolean;
  addModalTab: 'trade' | 'cash' | 'illiquid' | 'dividend' | 'csv';
  loading: boolean;
  evaluation: PortfolioEvaluationResponse | null;
  marketData: MarketOverviewResponse | null;
  assetDetail: AssetDetailResponse | null;

  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setCurrency: (c: CurrencyCode) => void;
  setPricingMode: (m: 'tv_snapshot' | 'live') => void;
  setPortfolioScope: (s: 'personal' | 'overview') => void;
  setRightState: (s: RightPanelState) => void;
  setPortfolioTab: (t: PortfolioTab) => void;
  selectAsset: (symbol: string, range?: string) => Promise<void>;
  setBenchmark: (b: string) => Promise<void>;
  setNetOrGrossMode: (m: 'net' | 'gross') => void;
  setSearchOpen: (open: boolean) => void;
  openAddModal: (tab?: 'trade' | 'cash' | 'illiquid' | 'dividend' | 'csv') => void;
  closeAddModal: () => void;
  refreshAll: (background?: boolean) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'dark',
  currency: 'USD',
  fxRates: { USD: 1, ARS: 1185, EUR: 0.92 },
  pricingMode: 'live',
  portfolioScope: 'personal',
  rightState: 'market', // Estado 1 por defecto al iniciar según especificación
  portfolioTab: 'overview',
  selectedSymbol: 'NASDAQ:NVDA',
  selectedAssetRange: '1Y',
  benchmark: 'SP:SPX',
  netOrGrossMode: 'net',
  searchOpen: false,
  addModalOpen: false,
  addModalTab: 'trade',
  loading: false,
  evaluation: null,
  marketData: null,
  assetDetail: null,

  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
  },
  setCurrency: (currency) => set({ currency }),
  setPricingMode: async (pricingMode) => {
    set({ pricingMode, loading: true });
    const evaluation = await api.evaluatePortfolio(
      '2bb80f7315764422a5347e8d38503f4e',
      get().benchmark,
      pricingMode
    );
    set({ evaluation, loading: false });
  },
  setPortfolioScope: (portfolioScope) => {
    set({ portfolioScope, rightState: 'portfolio' });
  },
  setRightState: (rightState) => set({ rightState }),
  setPortfolioTab: (portfolioTab) => set({ portfolioTab, rightState: 'portfolio' }),
  selectAsset: async (symbol, range) => {
    const r = range || get().selectedAssetRange || '1Y';
    set({ selectedSymbol: symbol, selectedAssetRange: r, rightState: 'asset', loading: true });
    try {
      const assetDetail = await api.getAssetDetail(symbol, r);
      set({ assetDetail, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  setBenchmark: async (benchmark) => {
    set({ benchmark, loading: true });
    const evaluation = await api.evaluatePortfolio(
      '2bb80f7315764422a5347e8d38503f4e',
      benchmark,
      get().pricingMode
    );
    set({ evaluation, loading: false });
  },
  setNetOrGrossMode: (netOrGrossMode) => set({ netOrGrossMode }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openAddModal: (tab = 'trade') => set({ addModalOpen: true, addModalTab: tab }),
  closeAddModal: () => set({ addModalOpen: false }),
  refreshAll: async (background = false) => {
    if (!background) set({ loading: true });
    try {
      const [fxRates, evaluation, marketData] = await Promise.all([
        api.getFx(),
        api.evaluatePortfolio(
          '2bb80f7315764422a5347e8d38503f4e',
          get().benchmark,
          get().pricingMode
        ),
        api.getMarketOverview(),
      ]);
      set({ fxRates, evaluation, marketData, loading: false });
      if (get().rightState === 'asset') {
        const assetDetail = await api.getAssetDetail(
          get().selectedSymbol,
          get().selectedAssetRange
        );
        set({ assetDetail });
      }
    } catch {
      set({ loading: false });
    }
  },
}));
