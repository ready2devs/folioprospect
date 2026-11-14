import type {
  NwSettings,
  WatchlistConfig,
  WatchlistGroupId,
  WatchlistItem,
} from './types.js';

/**
 * Watchlist de la vista de activo (SPEC-006) — lógica pura, sin React
 * ni store.
 *
 * La lista vive en `NwSettings.watchlist` (items con símbolo completo,
 * etiqueta de grupo y orden). Si el campo no existe, se siembra la
 * lista de seguimiento del dueño (su captura de Investing del
 * 2026-10-20, en su orden de importancia). Dentro de cada grupo se
 * conserva el orden relativo de la captura.
 *
 * Las siglas de veredicto NO se calculan acá: las resuelve el servidor
 * con el pipeline de Fair Value del motor y las cachea por día. Acá
 * solo vive el mapeo veredicto → sigla que la fila muestra.
 */

export const WATCHLIST_GROUP_ORDER: readonly WatchlistGroupId[] = [
  'ACCIONES',
  'CRIPTO',
  'ETFS',
];

export const WATCHLIST_GROUPS: readonly string[] = WATCHLIST_GROUP_ORDER;

export const MAX_WATCHLIST_ITEMS = 200;
export const MAX_WATCHLIST_TICKER = 16;

/**
 * Orden de la captura de Investing del dueño (SPEC-006 §2): 88 filas
 * que, deduplicadas conservando la primera aparición (duplicados:
 * INTU, ASTS, NASA, SPCX), quedan en estos 84 rótulos únicos. La
 * construcción de la semilla deduplica igual, por las dudas.
 */
export const WATCHLIST_CAPTURE_ORDER: readonly string[] = [
  'GOOG', 'TSM', 'MU', 'NVDA', 'META', 'MSFT', 'NU', 'AMZN',
  'BTC/USD', 'ETH/USD',
  'MELI', 'VIST', 'AAPL', 'CLS', 'AVGO', 'CRDO', 'TMDX', 'NBIS', 'SIMO', 'HSAI',
  'SOL/USD', 'BNB/USD', 'ETH/BTC',
  'SPY', 'APP', 'APH', 'LMB', 'MRVL', 'BKNG', 'ONDS', 'ASML', 'JD', 'PDD',
  'FSLR', 'BABA', 'TSLA', 'AXP', 'CRM', 'ACN', 'AMD', 'STRL', 'EEFT', 'EVER',
  'JBL', 'EXEL', 'WRD', 'AMBA', 'RMBS', 'SMCI', 'FTNT', 'MCHP', 'UPST', 'NVO',
  'APLD', 'ORCL', 'QCOM', 'NOW', 'SNDK', 'ADBE', 'ALAB', 'IREN', 'INTU',
  'ASTS', 'PRIM', 'TER', 'EWY', 'COPX', 'CBRS', 'NASA', 'LITE', 'GCT',
  'NFLX', 'SPCX', 'ONTO', 'SYM', 'MOD', 'HUMN', 'AAOI', 'TLN', 'ACMR', 'BE',
  'VST', 'CEG', 'CDW',
];

/** Rótulos que el dueño sigue como cripto (grupo CRIPTO). */
const WATCHLIST_CRYPTO_LABELS: ReadonlySet<string> = new Set([
  'BTC/USD',
  'ETH/USD',
  'SOL/USD',
  'BNB/USD',
  'ETH/BTC',
]);

/** Rótulos que el dueño sigue como ETF (grupo ETFS). */
const WATCHLIST_ETF_LABELS: ReadonlySet<string> = new Set([
  'SPY',
  'EWY',
  'COPX',
  'NASA',
  'HUMN',
]);

/** Grupo de un rótulo de la captura: cripto y ETFs por lista explícita
 *  (asignación de la SPEC-006 §2); el resto es ACCIONES. */
export function watchlistGroupForLabel(label: string): WatchlistGroupId {
  if (WATCHLIST_CRYPTO_LABELS.has(label)) return 'CRIPTO';
  if (WATCHLIST_ETF_LABELS.has(label)) return 'ETFS';
  return 'ACCIONES';
}

/**
 * Resolución rótulo → símbolo completo de la app, validada contra el
 * buscador/cotizaciones de la propia app (catálogo local + búsqueda de
 * Yahoo que expone /api/search, y cotización real por /api/quotes;
 * validación corrida el 2026-11-14: los 84 rótulos resuelven con
 * cotización real, incluido SPCX — el buscador devuelve «Space
 * Exploration Technologies Corp.» en NASDAQ y cotiza). `null` queda
 * como valor posible del tipo para activos que no resuelvan: la fila
 * se muestra sin precio, marcada no disponible — nunca se inventa uno.
 */
export const WATCHLIST_SYMBOL_BY_LABEL: Readonly<Record<string, string | null>> = {
  GOOG: 'NASDAQ:GOOG',
  TSM: 'NYSE:TSM',
  MU: 'NASDAQ:MU',
  NVDA: 'NASDAQ:NVDA',
  META: 'NASDAQ:META',
  MSFT: 'NASDAQ:MSFT',
  NU: 'NYSE:NU',
  AMZN: 'NASDAQ:AMZN',
  'BTC/USD': 'BINANCE:BTCUSDT',
  'ETH/USD': 'BINANCE:ETHUSDT',
  MELI: 'NASDAQ:MELI',
  VIST: 'NYSE:VIST',
  AAPL: 'NASDAQ:AAPL',
  CLS: 'NYSE:CLS',
  AVGO: 'NASDAQ:AVGO',
  CRDO: 'NASDAQ:CRDO',
  TMDX: 'NASDAQ:TMDX',
  NBIS: 'NASDAQ:NBIS',
  SIMO: 'NASDAQ:SIMO',
  HSAI: 'NASDAQ:HSAI',
  'SOL/USD': 'BINANCE:SOLUSDT',
  'BNB/USD': 'BINANCE:BNBUSDT',
  'ETH/BTC': 'BINANCE:ETHBTC',
  SPY: 'AMEX:SPY',
  APP: 'NASDAQ:APP',
  APH: 'NYSE:APH',
  LMB: 'NASDAQ:LMB',
  MRVL: 'NASDAQ:MRVL',
  BKNG: 'NASDAQ:BKNG',
  ONDS: 'NASDAQ:ONDS',
  ASML: 'NASDAQ:ASML',
  JD: 'NASDAQ:JD',
  PDD: 'NASDAQ:PDD',
  FSLR: 'NASDAQ:FSLR',
  BABA: 'NYSE:BABA',
  TSLA: 'NASDAQ:TSLA',
  AXP: 'NYSE:AXP',
  CRM: 'NYSE:CRM',
  ACN: 'NYSE:ACN',
  AMD: 'NASDAQ:AMD',
  STRL: 'NASDAQ:STRL',
  EEFT: 'NASDAQ:EEFT',
  EVER: 'NASDAQ:EVER',
  JBL: 'NYSE:JBL',
  EXEL: 'NASDAQ:EXEL',
  WRD: 'NASDAQ:WRD',
  AMBA: 'NASDAQ:AMBA',
  RMBS: 'NASDAQ:RMBS',
  SMCI: 'NASDAQ:SMCI',
  FTNT: 'NASDAQ:FTNT',
  MCHP: 'NASDAQ:MCHP',
  UPST: 'NASDAQ:UPST',
  NVO: 'NYSE:NVO',
  APLD: 'NASDAQ:APLD',
  ORCL: 'NYSE:ORCL',
  QCOM: 'NASDAQ:QCOM',
  NOW: 'NYSE:NOW',
  SNDK: 'NASDAQ:SNDK',
  ADBE: 'NASDAQ:ADBE',
  ALAB: 'NASDAQ:ALAB',
  IREN: 'NASDAQ:IREN',
  INTU: 'NASDAQ:INTU',
  ASTS: 'NASDAQ:ASTS',
  PRIM: 'NYSE:PRIM',
  TER: 'NASDAQ:TER',
  EWY: 'AMEX:EWY',
  COPX: 'AMEX:COPX',
  CBRS: 'NASDAQ:CBRS',
  NASA: 'AMEX:NASA',
  LITE: 'NASDAQ:LITE',
  GCT: 'NASDAQ:GCT',
  NFLX: 'NASDAQ:NFLX',
  SPCX: 'NASDAQ:SPCX',
  ONTO: 'NYSE:ONTO',
  SYM: 'NASDAQ:SYM',
  MOD: 'NYSE:MOD',
  HUMN: 'AMEX:HUMN',
  AAOI: 'NASDAQ:AAOI',
  TLN: 'NASDAQ:TLN',
  ACMR: 'NASDAQ:ACMR',
  BE: 'NYSE:BE',
  VST: 'NYSE:VST',
  CEG: 'NASDAQ:CEG',
  CDW: 'NASDAQ:CDW',
};

/** Construye los items desde rótulos en orden de captura: deduplica
 *  conservando la primera aparición y asigna grupo y símbolo. */
export function buildWatchlistItems(
  labels: readonly string[] = WATCHLIST_CAPTURE_ORDER
): WatchlistItem[] {
  const seen = new Set<string>();
  const items: WatchlistItem[] = [];
  for (const raw of labels) {
    const ticker = String(raw || '').trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    items.push({
      ticker,
      group: watchlistGroupForLabel(ticker),
      symbol: ticker in WATCHLIST_SYMBOL_BY_LABEL ? WATCHLIST_SYMBOL_BY_LABEL[ticker] : null,
    });
  }
  return items;
}

/** La lista sembrada: la captura del dueño, deduplicada y resuelta. */
export function seedWatchlistConfig(): WatchlistConfig {
  return { items: buildWatchlistItems() };
}

const WATCHLIST_SYMBOL_RE = /^[A-Z]{2,10}:[A-Z0-9][A-Z0-9.\-]{0,15}$/;
const WATCHLIST_TICKER_RE = /^[A-Z0-9][A-Z0-9./\-]{0,15}$/;

export function isValidWatchlistSymbol(symbol: unknown): symbol is string {
  return typeof symbol === 'string' && WATCHLIST_SYMBOL_RE.test(symbol);
}

export function isValidWatchlistItemShape(it: any): it is WatchlistItem {
  if (!it || typeof it !== 'object') return false;
  const ticker = typeof it.ticker === 'string' ? it.ticker.trim().toUpperCase() : '';
  if (!ticker || ticker.length > MAX_WATCHLIST_TICKER || !WATCHLIST_TICKER_RE.test(ticker)) {
    return false;
  }
  if (!WATCHLIST_GROUPS.includes(it.group)) return false;
  if (it.symbol !== null && !isValidWatchlistSymbol(it.symbol)) return false;
  return true;
}

/** Normaliza un item válido (ticker en mayúsculas, símbolo tal cual). */
export function normalizeWatchlistItem(it: WatchlistItem): WatchlistItem {
  return {
    ticker: it.ticker.trim().toUpperCase(),
    group: it.group,
    symbol: it.symbol,
  };
}

/**
 * Resuelve la config efectiva a partir de los settings guardados.
 * - `watchlist === undefined` → semilla de la SPEC-006.
 * - Config presente (aunque `items` sea []) → se respeta tal cual,
 *   filtrando items con forma inválida y duplicados por ticker.
 */
export function resolveWatchlistConfig(
  settings?: Pick<NwSettings, 'watchlist'> | null
): WatchlistConfig {
  const raw = settings?.watchlist;
  if (raw === undefined || raw === null) return seedWatchlistConfig();
  const items: WatchlistItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.items)) {
    for (const it of raw.items) {
      if (items.length >= MAX_WATCHLIST_ITEMS) break;
      if (!isValidWatchlistItemShape(it)) continue;
      const norm = normalizeWatchlistItem(it);
      if (seen.has(norm.ticker)) continue;
      seen.add(norm.ticker);
      items.push(norm);
    }
  }
  return { items };
}

/** Agrupa los items por etiqueta en el orden fijo de secciones,
 *  conservando dentro de cada grupo el orden guardado (el de la
 *  captura). Los grupos vacíos no se devuelven. */
export function groupWatchlistItems(
  items: readonly WatchlistItem[]
): { group: WatchlistGroupId; items: WatchlistItem[] }[] {
  const out: { group: WatchlistGroupId; items: WatchlistItem[] }[] = [];
  for (const group of WATCHLIST_GROUP_ORDER) {
    const inGroup = items.filter((it) => it.group === group);
    if (inGroup.length > 0) out.push({ group, items: inGroup });
  }
  return out;
}

/**
 * Sigla de la fila para un veredicto de la ficha (los textos exactos
 * de `computeOpportunity`): el dueño pidió «CM» literal para Compra
 * Fuerte. Sin veredicto (cripto, ETFs, activo sin valuación del
 * motor) → «—».
 */
export function verdictToSigla(verdict: string | null | undefined): string {
  if (!verdict) return '—';
  const v = verdict.trim().toUpperCase();
  if (v === 'COMPRA FUERTE') return 'CM';
  if (v.startsWith('COMPRAR')) return 'C';
  if (v === 'MANTENER') return 'M';
  if (v === 'VENDER') return 'V';
  return '—';
}
