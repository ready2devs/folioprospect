import { create } from 'zustand';
import type {
  ArgFxQuote,
  ArgFxResponse,
  CurrencyCode,
  NwSettings,
} from '@shared/engine/types';
import { normalizeTradingViewSymbol } from '@shared/engine';
import {
  api,
  loadPersistedLedger,
  recomputeEvaluationWithPersistedLedger,
  type AssetDetailResponse,
  type MarketOverviewResponse,
  type PortfolioEvaluationResponse,
} from './api';

export type { ArgFxQuote, ArgFxResponse, NwSettings };

export type RightPanelState = 'market' | 'portfolio' | 'asset';
export type PortfolioTab = 'overview' | 'holdings' | 'transactions' | 'analysis' | 'prospectiva';
export type MobileTab = 'holdings' | 'right';
export type AddModalTab = 'trade' | 'cash' | 'illiquid' | 'dividend' | 'csv';
export type CashModalTarget = 'ledger' | 'brokerCash' | 'reserveUsd';

const NW_STORAGE_KEY = 'fp.nwSettings.v1';

export const DEFAULT_NW_SETTINGS: NwSettings = {
  brokerCashUsd: 0,
  cashReserveUsd: 0,
  includeCryptoInCcl: false,
  cclOverride: null,
  mepOverride: null,
  cclBaseOverride: null,
  sellCommPct: 0.5,
  mepBuyCommPct: 0.5,
  mepSellCommPct: 0.5,
  fxDiffOverride: null,
};

export const DEFAULT_ARG_FX: ArgFxResponse = {
  cclRate: 1637.9,
  mepRate: 1553.6,
  ccl: { compra: 1637.9, venta: 1639.5 },
  mep: { compra: 1546.9, venta: 1553.6 },
  source: 'fallback',
  fetchedAt: Date.now(),
};

function loadNwSettings(): NwSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_NW_SETTINGS };
  try {
    const raw = window.localStorage.getItem(NW_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NW_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_NW_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_NW_SETTINGS };
  }
}

function saveNwSettings(settings: NwSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NW_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function scrollTopOnMobile(): void {
  if (typeof window !== 'undefined' && window.innerWidth <= 1023) {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }
}

export interface AppState {
  theme: 'dark' | 'light';
  currency: CurrencyCode;
  fxRates: Record<CurrencyCode, number>;
  argFx: ArgFxResponse | null;
  nwSettings: NwSettings;
  pricingMode: 'tv_snapshot' | 'live';
  portfolioScope: 'personal' | 'overview';
  rightState: RightPanelState;
  portfolioTab: PortfolioTab;
  mobileTab: MobileTab;
  selectedSymbol: string;
  selectedAssetRange: string;
  benchmark: string;
  netOrGrossMode: 'net' | 'gross';
  searchOpen: boolean;
  addModalOpen: boolean;
  addModalTab: AddModalTab;
  cashModalTarget: CashModalTarget;
  addModalSymbol: string;
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
  setMobileTab: (t: MobileTab) => void;
  selectAsset: (symbol: string, range?: string) => Promise<void>;
  setBenchmark: (b: string) => Promise<void>;
  setNetOrGrossMode: (m: 'net' | 'gross') => void;
  setNwSettings: (patch: Partial<NwSettings>) => void;
  resetNwSettings: () => void;
  setSearchOpen: (open: boolean) => void;
  openAddModal: (tab?: AddModalTab, cashTarget?: CashModalTarget, symbol?: string) => void;
  setCashModalTarget: (target: CashModalTarget) => void;
  closeAddModal: () => void;
  refreshAll: (background?: boolean) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'dark',
  currency: 'USD',
  fxRates: { USD: 1, ARS: 1185, EUR: 0.92 },
  argFx: DEFAULT_ARG_FX,
  nwSettings: loadNwSettings(),
  pricingMode: 'live',
  portfolioScope: 'personal',
  rightState: 'market', // Estado 1 por defecto al iniciar según especificación
  portfolioTab: 'overview',
  mobileTab: 'holdings',
  selectedSymbol: 'NASDAQ:NVDA',
  selectedAssetRange: '1Y',
  benchmark: 'SP:SPX',
  netOrGrossMode: 'net',
  searchOpen: false,
  addModalOpen: false,
  addModalTab: 'trade',
  cashModalTarget: 'ledger',
  addModalSymbol: '',
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
    set({ portfolioScope, rightState: 'portfolio', mobileTab: 'right' });
    scrollTopOnMobile();
  },
  setRightState: (rightState) => {
    set({ rightState, mobileTab: 'right' });
    scrollTopOnMobile();
  },
  setPortfolioTab: (portfolioTab) => {
    set({ portfolioTab, rightState: 'portfolio', mobileTab: 'right' });
    scrollTopOnMobile();
  },
  setMobileTab: (mobileTab) => {
    set({ mobileTab });
    scrollTopOnMobile();
  },
  selectAsset: async (symbol, range) => {
    const normSym = normalizeTradingViewSymbol(symbol);
    const r = range || get().selectedAssetRange || '1Y';
    set({
      selectedSymbol: normSym,
      selectedAssetRange: r,
      rightState: 'asset',
      mobileTab: 'right',
      loading: true,
    });
    scrollTopOnMobile();
    try {
      const assetDetail = await api.getAssetDetail(normSym, r);
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
  setNwSettings: (patch) => {
    const next: NwSettings = { ...get().nwSettings, ...patch };
    saveNwSettings(next);
    set({ nwSettings: next });
  },
  resetNwSettings: () => {
    const next: NwSettings = { ...DEFAULT_NW_SETTINGS };
    saveNwSettings(next);
    set({ nwSettings: next });
  },
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openAddModal: (tab = 'trade', cashTarget = 'ledger', symbol) =>
    set({
      addModalOpen: true,
      addModalTab: tab,
      cashModalTarget: cashTarget,
      addModalSymbol: symbol ? normalizeTradingViewSymbol(symbol) : '',
    }),
  setCashModalTarget: (cashModalTarget) => set({ cashModalTarget }),
  closeAddModal: () => set({ addModalOpen: false, addModalSymbol: '' }),
  refreshAll: async (background = false) => {
    if (!background) set({ loading: true });
    try {
      const getArgFxSafe = async (): Promise<ArgFxResponse> => {
        try {
          const apiAny = api as Record<string, any>;
          if (typeof apiAny.getArgFx === 'function') {
            const res = await apiAny.getArgFx();
            if (res && typeof res.cclRate === 'number' && typeof res.mepRate === 'number') {
              return res;
            }
          }
          const r = await fetch('/api/fx/ar');
          if (r.ok) {
            const data = await r.json();
            if (data && typeof data.cclRate === 'number' && typeof data.mepRate === 'number') {
              return data;
            }
          }
        } catch {
          // fallback
        }
        return get().argFx ?? DEFAULT_ARG_FX;
      };

      const [fxRates, rawEvaluation, marketData, argFx] = await Promise.all([
        api.getFx(),
        api.evaluatePortfolio(
          '2bb80f7315764422a5347e8d38503f4e',
          get().benchmark,
          get().pricingMode
        ),
        api.getMarketOverview(),
        getArgFxSafe(),
      ]);

      let evaluation = rawEvaluation;
      const persisted = loadPersistedLedger();
      if (
        persisted &&
        persisted.isCustomized &&
        ((evaluation?.portfolio?.trades?.length ?? 0) !== persisted.trades.length ||
          (evaluation?.portfolio?.cash?.length ?? 0) !== persisted.cash.length ||
          (evaluation?.portfolio?.dividends?.length ?? 0) !== persisted.dividends.length ||
          (evaluation?.portfolio?.illiquid?.length ?? 0) !== persisted.illiquid.length)
      ) {
        evaluation = recomputeEvaluationWithPersistedLedger(evaluation, persisted);
      }

      set({ fxRates, evaluation, marketData, argFx, loading: false });
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
