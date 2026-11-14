import { create } from 'zustand';
import type {
  ArgFxQuote,
  ArgFxResponse,
  CurrencyCode,
  NwSettings,
  SubPortfolioDef,
  Trade,
} from '@shared/engine/types';
import { normalizeTradingViewSymbol } from '@shared/engine';
import {
  removeDef as removeSubPortfolioDefFromConfig,
  resolveSubPortfolioConfig,
  setAssignment as setSubPortfolioAssignment,
  upsertDef as upsertSubPortfolioDefInConfig,
} from '@shared/engine/subPortfolios';
import {
  api,
  type AssetDetailResponse,
  type MarketOverviewResponse,
  type PortfolioEvaluationResponse,
} from './api';

export type { ArgFxQuote, ArgFxResponse, NwSettings };

export type RightPanelState = 'market' | 'portfolio' | 'asset' | 'optimizer';
export type PortfolioTab = 'overview' | 'holdings' | 'transactions' | 'analysis' | 'prospectiva';
export type MobileTab = 'holdings' | 'right';
/** Vista desde la que se abrió la ficha del activo: el «Volver» regresa ahí. */
export type AssetOrigin = Exclude<RightPanelState, 'asset'> | 'holdings';
/** Entrada libre de «Obtener más fondos» del Optimizador. */
export interface ManualFund {
  id: string;
  type: 'cash' | 'sell';
  symbol?: string;
  amountUsd: number;
}
export type AddModalTab = 'trade' | 'cash' | 'illiquid' | 'dividend' | 'csv';
export type CashModalTarget = 'ledger' | 'brokerCash' | 'reserveUsd';
/** Precarga de la pantalla de operación al venir del menú de un activo en cartera. */
export interface TradePrefill {
  side?: 'BUY' | 'SELL';
  /** Cantidad precargada (en Venta total = total de la posición existente). */
  qty?: number;
}
/** Destino del producido de una venta: ver `SaleProceedsDestination` en shared/engine/saleProceeds. */

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

// Sincronización de los ajustes NW entre dispositivos: el servidor guarda la
// última versión (con su updatedAt) y cada cliente conserva la suya en
// localStorage como caché. La marca de tiempo vive en una clave aparte para
// no cambiar el formato histórico de `fp.nwSettings.v1`.
const NW_META_KEY = 'fp.nwSettings.v1.meta';

function loadNwUpdatedAt(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(NW_META_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Number(parsed?.updatedAt) || 0;
  } catch {
    return 0;
  }
}

function saveNwUpdatedAt(updatedAt: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NW_META_KEY, JSON.stringify({ updatedAt }));
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
  addModalPrefill: TradePrefill | null;
  /** Transacción que se está MODIFICANDO desde el Libro Mayor, o null si
   *  la pantalla de operación está cargando una nueva. */
  addModalEditingTrade: Trade | null;
  /** Símbolo cuyo menú de acciones (Análisis / Agregar / Venta) está abierto, o null. */
  holdingMenuSymbol: string | null;
  /** El menú se abrió por long-press / clic derecho: debe mostrar enfocado la
   *  sección «Subcartera» (SPEC-005). */
  holdingMenuFocusTag: boolean;
  /** Filtro de la lista por subcartera (defId o '__general__'), o null. */
  subPortfolioFilter: string | null;
  loading: boolean;
  evaluation: PortfolioEvaluationResponse | null;
  optimizerData: import('./api').OptimizerResponse | null;
  optimizerLoading: boolean;
  marketData: MarketOverviewResponse | null;
  assetDetail: AssetDetailResponse | null;
  assetError: string | null;
  assetOrigin: AssetOrigin;
  /** Ajustes del análisis del Optimizador: persisten al ir a una ficha y volver. */
  optDisabled: Set<string>;
  optManualFunds: ManualFund[];
  optAcceptedSug: string[];
  optSkippedSug: string[];
  optMobileStep: 1 | 2 | 3;
  /** Vista del Optimizador (R12): lectura esperada o prudente de la
   *  tabla y los indicadores. Presentación solamente. */
  optViewMode: 'esperada' | 'prudente';
  /** Orden de la tabla del Optimizador (R14, pedido del usuario):
   *  por velocidad de revalorización (default, el histórico) o por
   *  el score de la vista activa. Presentación solamente. */
  optSortMode: 'velocidad' | 'score';

  setTheme: (t: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setCurrency: (c: CurrencyCode) => void;
  setPricingMode: (m: 'tv_snapshot' | 'live') => void;
  setPortfolioScope: (s: 'personal' | 'overview') => void;
  setRightState: (s: RightPanelState) => void;
  loadOptimizer: (force?: boolean) => Promise<void>;
  setPortfolioTab: (t: PortfolioTab) => void;
  setMobileTab: (t: MobileTab) => void;
  setOptDisabled: (u: Set<string> | ((p: Set<string>) => Set<string>)) => void;
  setOptManualFunds: (u: ManualFund[] | ((p: ManualFund[]) => ManualFund[])) => void;
  setOptAcceptedSug: (u: string[] | ((p: string[]) => string[])) => void;
  setOptSkippedSug: (u: string[] | ((p: string[]) => string[])) => void;
  setOptMobileStep: (s: 1 | 2 | 3) => void;
  setOptViewMode: (m: 'esperada' | 'prudente') => void;
  setOptSortMode: (m: 'velocidad' | 'score') => void;
  selectAsset: (symbol: string, range?: string) => Promise<void>;
  setBenchmark: (b: string) => Promise<void>;
  setNetOrGrossMode: (m: 'net' | 'gross') => void;
  setNwSettings: (patch: Partial<NwSettings>) => void;
  resetNwSettings: () => void;
  hydrateNwSettings: () => Promise<void>;
  syncNwSettingsToServer: (data: NwSettings, updatedAt: number) => Promise<void>;
  setSearchOpen: (open: boolean) => void;
  openAddModal: (
    tab?: AddModalTab,
    cashTarget?: CashModalTarget,
    symbol?: string,
    prefill?: TradePrefill | null
  ) => void;
  openEditTrade: (trade: Trade) => void;
  openHoldingMenu: (symbol: string, opts?: { focusTag?: boolean }) => void;
  closeHoldingMenu: () => void;
  /** Subcarteras (SPEC-005): operan sobre NwSettings vía setNwSettings, que
   *  ya persiste en localStorage y sincroniza al servidor. */
  setHoldingSubPortfolio: (symbol: string, defId: string | null) => void;
  upsertSubPortfolioDef: (def: SubPortfolioDef) => void;
  removeSubPortfolioDef: (defId: string) => void;
  setSubPortfolioFilter: (filter: string | null) => void;
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
  addModalPrefill: null,
  addModalEditingTrade: null,
  holdingMenuSymbol: null,
  holdingMenuFocusTag: false,
  subPortfolioFilter: null,
  loading: false,
  evaluation: null,
  optimizerData: null,
  optimizerLoading: false,
  marketData: null,
  assetDetail: null,
  assetError: null,
  assetOrigin: 'market',
  optDisabled: new Set(),
  optManualFunds: [],
  optAcceptedSug: [],
  optSkippedSug: [],
  optMobileStep: 1,
  optViewMode: 'esperada',
  optSortMode: 'velocidad',

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
    if (rightState === 'optimizer' && !get().optimizerData) {
      void get().loadOptimizer();
    }
  },
  loadOptimizer: async (force = false) => {
    if (get().optimizerLoading) return;
    set({ optimizerLoading: true });
    try {
      const data = await api.getOptimizer(force);
      if (data) set({ optimizerData: data });
    } finally {
      set({ optimizerLoading: false });
    }
  },
  setPortfolioTab: (portfolioTab) => {
    set({ portfolioTab, rightState: 'portfolio', mobileTab: 'right' });
    scrollTopOnMobile();
  },
  setMobileTab: (mobileTab) => {
    set({ mobileTab });
    scrollTopOnMobile();
  },
  setOptDisabled: (u) =>
    set({
      optDisabled:
        typeof u === 'function' ? (u as (p: Set<string>) => Set<string>)(get().optDisabled) : u,
    }),
  setOptManualFunds: (u) =>
    set({
      optManualFunds:
        typeof u === 'function'
          ? (u as (p: ManualFund[]) => ManualFund[])(get().optManualFunds)
          : u,
    }),
  setOptAcceptedSug: (u) =>
    set({
      optAcceptedSug:
        typeof u === 'function' ? (u as (p: string[]) => string[])(get().optAcceptedSug) : u,
    }),
  setOptSkippedSug: (u) =>
    set({
      optSkippedSug:
        typeof u === 'function' ? (u as (p: string[]) => string[])(get().optSkippedSug) : u,
    }),
  setOptMobileStep: (optMobileStep) => set({ optMobileStep }),
  setOptViewMode: (optViewMode) => set({ optViewMode }),
  setOptSortMode: (optSortMode: 'velocidad' | 'score') => set({ optSortMode }),
  selectAsset: async (symbol, range) => {
    const normSym = normalizeTradingViewSymbol(symbol);
    const r = range || get().selectedAssetRange || '1Y';
    // Origen de la navegación: el «Volver» de la ficha regresa a la vista
    // desde la que se llegó (Optimizer, Portafolio, Mercado o la lista de
    // posiciones). Si ya estamos en una ficha, se conserva el origen.
    const cur = get();
    const assetOrigin: AssetOrigin =
      cur.mobileTab === 'holdings'
        ? 'holdings'
        : cur.rightState === 'asset'
          ? cur.assetOrigin
          : cur.rightState;
    set({
      selectedSymbol: normSym,
      selectedAssetRange: r,
      rightState: 'asset',
      mobileTab: 'right',
      assetOrigin,
      loading: true,
      assetError: null,
    });
    scrollTopOnMobile();
    try {
      const assetDetail = await api.getAssetDetail(normSym, r);
      // Validate the payload before storing it: an error/partial response
      // stored as-is used to crash AssetView and black-screen the whole app.
      if (
        !assetDetail ||
        !assetDetail.meta ||
        !assetDetail.quote ||
        typeof assetDetail.quote.price !== 'number' ||
        !Number.isFinite(assetDetail.quote.price)
      ) {
        set({
          assetDetail: null,
          assetError: `La fuente de datos no devolvió el detalle de ${normSym}.`,
          loading: false,
        });
        return;
      }
      set({ assetDetail, loading: false });
    } catch {
      set({
        assetDetail: null,
        assetError: `No se pudo cargar el detalle de ${normSym}.`,
        loading: false,
      });
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
    const ts = Date.now();
    saveNwUpdatedAt(ts);
    set({ nwSettings: next });
    void get().syncNwSettingsToServer(next, ts);
  },
  resetNwSettings: () => {
    const next: NwSettings = { ...DEFAULT_NW_SETTINGS };
    saveNwSettings(next);
    const ts = Date.now();
    saveNwUpdatedAt(ts);
    set({ nwSettings: next });
    void get().syncNwSettingsToServer(next, ts);
  },
  syncNwSettingsToServer: async (data, updatedAt) => {
    try {
      const r = await fetch('/api/settings/nw', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, updatedAt }),
      });
      if (!r.ok) return;
      const stored = await r.json();
      // Si otro dispositivo guardó algo más nuevo, el servidor lo conserva
      // y este cliente lo adopta.
      if (stored?.data && Number(stored.updatedAt) > updatedAt) {
        const adopted: NwSettings = { ...DEFAULT_NW_SETTINGS, ...stored.data };
        saveNwSettings(adopted);
        saveNwUpdatedAt(Number(stored.updatedAt));
        set({ nwSettings: adopted });
      }
    } catch {
      // Sin conexión: queda local; la próxima hidratación reintenta.
    }
  },
  hydrateNwSettings: async () => {
    try {
      const r = await fetch('/api/settings/nw');
      if (!r.ok) return;
      const stored = await r.json();
      const localTs = loadNwUpdatedAt();
      if (!stored) {
        // Servidor vacío: primera sincronización, sube lo local.
        const ts = localTs || Date.now();
        if (!localTs) saveNwUpdatedAt(ts);
        void get().syncNwSettingsToServer(get().nwSettings, ts);
        return;
      }
      const serverTs = Number(stored.updatedAt) || 0;
      if (serverTs > localTs && stored.data) {
        const adopted: NwSettings = { ...DEFAULT_NW_SETTINGS, ...stored.data };
        saveNwSettings(adopted);
        saveNwUpdatedAt(serverTs);
        set({ nwSettings: adopted });
      } else if (localTs > serverTs) {
        void get().syncNwSettingsToServer(get().nwSettings, localTs);
      }
    } catch {
      // Sin conexión: se sigue con la caché local.
    }
  },
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openAddModal: (tab = 'trade', cashTarget = 'ledger', symbol, prefill) =>
    set({
      addModalOpen: true,
      addModalTab: tab,
      cashModalTarget: cashTarget,
      addModalSymbol: symbol ? normalizeTradingViewSymbol(symbol) : '',
      addModalPrefill: tab === 'trade' ? (prefill ?? null) : null,
      addModalEditingTrade: null,
      holdingMenuSymbol: null,
      holdingMenuFocusTag: false,
    }),
  openEditTrade: (trade) =>
    set({
      addModalOpen: true,
      addModalTab: 'trade',
      cashModalTarget: 'ledger',
      addModalSymbol: normalizeTradingViewSymbol(trade.symbol),
      addModalPrefill: null,
      addModalEditingTrade: trade,
      holdingMenuSymbol: null,
      holdingMenuFocusTag: false,
    }),
  openHoldingMenu: (symbol, opts) =>
    set({
      holdingMenuSymbol: normalizeTradingViewSymbol(symbol),
      holdingMenuFocusTag: Boolean(opts?.focusTag),
    }),
  closeHoldingMenu: () => set({ holdingMenuSymbol: null, holdingMenuFocusTag: false }),
  setHoldingSubPortfolio: (symbol, defId) => {
    const config = resolveSubPortfolioConfig(get().nwSettings);
    const next = setSubPortfolioAssignment(
      config,
      normalizeTradingViewSymbol(symbol),
      defId
    );
    get().setNwSettings({ subPortfolios: next });
  },
  upsertSubPortfolioDef: (def) => {
    const config = resolveSubPortfolioConfig(get().nwSettings);
    get().setNwSettings({
      subPortfolios: upsertSubPortfolioDefInConfig(config, def),
    });
  },
  removeSubPortfolioDef: (defId) => {
    const config = resolveSubPortfolioConfig(get().nwSettings);
    get().setNwSettings({
      subPortfolios: removeSubPortfolioDefFromConfig(config, defId),
    });
    if (get().subPortfolioFilter === defId) set({ subPortfolioFilter: null });
  },
  setSubPortfolioFilter: (subPortfolioFilter) => set({ subPortfolioFilter }),
  setCashModalTarget: (cashModalTarget) => set({ cashModalTarget }),
  closeAddModal: () =>
    set({
      addModalOpen: false,
      addModalSymbol: '',
      addModalPrefill: null,
      addModalEditingTrade: null,
    }),
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

      // evaluatePortfolio already handles desync + live crypto patching
      const evaluation = rawEvaluation;

      set({ fxRates, evaluation, marketData, argFx, loading: false });
      if (get().rightState === 'asset') {
        const assetDetail = await api.getAssetDetail(
          get().selectedSymbol,
          get().selectedAssetRange
        );
        // Only replace the current detail with a valid payload; a failed
        // background refresh must not wipe a good screen (or crash it).
        if (
          assetDetail &&
          assetDetail.meta &&
          assetDetail.quote &&
          typeof assetDetail.quote.price === 'number' &&
          Number.isFinite(assetDetail.quote.price)
        ) {
          set({ assetDetail });
        }
      }
    } catch {
      set({ loading: false });
    }
  },
}));
