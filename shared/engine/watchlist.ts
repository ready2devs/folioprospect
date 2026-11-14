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
 * de `computeOpportunity`): Compra Fuerte = «CF» (corrección del
 * dueño, enmienda v8 de la SPEC-006: en la v1 se publicó «CM» por un
 * malentendido y el dueño lo corrigió en vivo). Sin veredicto
 * (cripto, ETFs, activo sin valuación del motor) → «—».
 */
export function verdictToSigla(verdict: string | null | undefined): string {
  if (!verdict) return '—';
  const v = verdict.trim().toUpperCase();
  if (v === 'COMPRA FUERTE') return 'CF';
  if (v.startsWith('COMPRAR')) return 'C';
  if (v === 'MANTENER') return 'M';
  if (v === 'VENDER') return 'V';
  return '—';
}

/**
 * Re-deriva la sigla de una entrada de la caché de veredictos desde
 * su veredicto guardado (enmienda v8). El endpoint de siglas la usa
 * al servir: una entrada persistida con una sigla de una versión
 * anterior («CM») se sirve con la vigente («CF») sin esperar al
 * vencimiento diario de la caché.
 */
export function rederiveVerdictSigla<
  T extends { sigla: string; verdict: string | null },
>(entry: T): T {
  return { ...entry, sigla: verdictToSigla(entry.verdict) };
}

/** Filtros de la fila de chips del panel (enmienda v8): «TODOS» o una
 *  sigla de veredicto ya cargada. */
export type WatchlistSiglaFilter = 'TODOS' | 'CF' | 'C' | 'M' | 'V';

export const WATCHLIST_SIGLA_FILTERS: readonly WatchlistSiglaFilter[] = [
  'TODOS',
  'CF',
  'C',
  'M',
  'V',
];

/** Nombre legible del veredicto de cada sigla, para mensajes como
 *  «Ningún activo en Compra Fuerte por ahora». */
export function siglaFilterName(filter: WatchlistSiglaFilter): string {
  switch (filter) {
    case 'CF':
      return 'Compra Fuerte';
    case 'C':
      return 'Comprar de a poco';
    case 'M':
      return 'Mantener';
    case 'V':
      return 'Vender';
    default:
      return 'Todos';
  }
}

/** Entrada de veredicto tal como la consume el panel (estructural:
 *  coincide con `WatchlistVerdictEntry` de la API del cliente). */
export interface WatchlistVerdictLike {
  sigla: string;
  verdict?: string | null;
}

/**
 * Sigla visible de un item según las entradas ya cargadas: las
 * ACCIONES con símbolo devuelven la sigla del servidor o `null`
 * (todavía cargando, la fila muestra «··»); el resto (cripto, par
 * ETH/BTC, ETFs, sin símbolo) es «—» definitivo.
 */
export function watchlistItemSigla(
  item: Pick<WatchlistItem, 'group' | 'symbol'>,
  verdicts: Record<string, WatchlistVerdictLike | undefined>
): string | null {
  if (item.group === 'ACCIONES' && item.symbol) {
    const entry = verdicts[item.symbol];
    return entry ? entry.sigla : null;
  }
  return '—';
}

/**
 * Filtro por veredicto del panel (enmienda v8), función pura: con
 * «TODOS» pasan todos los items; con una sigla, solo los que ya la
 * tienen CARGADA e igual a la del filtro. Los que todavía cargan
 * («··») y los «—» (cripto/ETFs) solo aparecen en «TODOS».
 */
export function filterWatchlistItems<T extends Pick<WatchlistItem, 'group' | 'symbol'>>(
  items: readonly T[],
  verdicts: Record<string, WatchlistVerdictLike | undefined>,
  filter: WatchlistSiglaFilter
): T[] {
  if (filter === 'TODOS') return [...items];
  return items.filter((it) => watchlistItemSigla(it, verdicts) === filter);
}

/** Conteo de siglas ya cargadas (para los chips del filtro). */
export function countWatchlistSiglas(
  items: readonly Pick<WatchlistItem, 'group' | 'symbol'>[],
  verdicts: Record<string, WatchlistVerdictLike | undefined>
): Record<'CF' | 'C' | 'M' | 'V', number> {
  const counts: Record<'CF' | 'C' | 'M' | 'V', number> = { CF: 0, C: 0, M: 0, V: 0 };
  for (const it of items) {
    const sigla = watchlistItemSigla(it, verdicts);
    if (sigla === 'CF' || sigla === 'C' || sigla === 'M' || sigla === 'V') {
      counts[sigla] += 1;
    }
  }
  return counts;
}

/**
 * Grupo automático de un resultado del buscador (enmienda v8):
 * símbolo BINANCE: → CRIPTO; tipo ETF del resultado → ETFS; el resto
 * → ACCIONES.
 */
export function detectWatchlistGroup(result: {
  symbol?: string | null;
  type?: string | null;
}): WatchlistGroupId {
  const symbol = String(result?.symbol || '').toUpperCase();
  if (symbol.startsWith('BINANCE:')) return 'CRIPTO';
  if (String(result?.type || '').trim().toUpperCase() === 'ETF') return 'ETFS';
  return 'ACCIONES';
}

/**
 * Construye el item de watchlist desde un resultado del buscador de
 * la app (/api/search: símbolo completo, ticker y tipo). Devuelve
 * null si el símbolo no tiene la forma válida de la app.
 */
export function buildWatchlistItemFromSearch(result: {
  symbol?: string | null;
  ticker?: string | null;
  type?: string | null;
}): WatchlistItem | null {
  const symbol =
    typeof result?.symbol === 'string' ? result.symbol.trim().toUpperCase() : '';
  if (!isValidWatchlistSymbol(symbol)) return null;
  const fromResult =
    typeof result?.ticker === 'string' ? result.ticker.trim().toUpperCase() : '';
  const ticker = fromResult || symbol.split(':')[1] || '';
  const item: WatchlistItem = {
    ticker,
    group: detectWatchlistGroup(result),
    symbol,
  };
  if (!isValidWatchlistItemShape(item)) return null;
  return normalizeWatchlistItem(item);
}

/** ¿El activo ya está en la watchlist? Coincidencia por símbolo
 *  completo o por ticker (la config nunca tiene duplicados de
 *  ninguna de las dos claves: el sanitizador deduplica por ticker). */
export function watchlistContains(
  config: WatchlistConfig,
  probe: { symbol?: string | null; ticker?: string | null }
): boolean {
  const ticker = String(probe?.ticker || '').trim().toUpperCase();
  return config.items.some(
    (it) =>
      (probe?.symbol != null && it.symbol === probe.symbol) ||
      (ticker !== '' && it.ticker === ticker)
  );
}

/**
 * Alta de un activo (enmienda v8): lo agrega AL FINAL de su grupo
 * (al final de la lista plana; el agrupado conserva el orden dentro
 * de cada grupo). Si ya está (por símbolo o ticker) o la lista llegó
 * al tope, no toca nada y devuelve `added: false`.
 */
export function addWatchlistItem(
  config: WatchlistConfig,
  item: WatchlistItem
): { config: WatchlistConfig; added: boolean } {
  if (!isValidWatchlistItemShape(item)) return { config, added: false };
  if (config.items.length >= MAX_WATCHLIST_ITEMS) return { config, added: false };
  const norm = normalizeWatchlistItem(item);
  if (watchlistContains(config, norm)) return { config, added: false };
  return { config: { items: [...config.items, norm] }, added: true };
}

/** Baja de un activo por ticker (enmienda v8). */
export function removeWatchlistItem(
  config: WatchlistConfig,
  ticker: string
): WatchlistConfig {
  const t = String(ticker || '').trim().toUpperCase();
  if (!t) return config;
  return { items: config.items.filter((it) => it.ticker !== t) };
}

/**
 * Reordenamiento dentro del grupo (enmienda v8, agregado del dueño
 * con las capturas de edición de Investing): intercambia el ítem con
 * el anterior/siguiente **de su mismo grupo** en la lista plana (la
 * lista mezcla grupos en el orden de la captura, así que el vecino
 * de grupo puede no ser el vecino de array). Las secciones son por
 * tipo de activo: el movimiento **nunca cruza de grupo**. En los
 * bordes del grupo (primero hacia arriba, último hacia abajo), si el
 * ticker no existe o el ítem no es válido, devuelve la MISMA config
 * (sin cambios y sin mutar la original).
 */
export function moveWatchlistItem(
  config: WatchlistConfig,
  ticker: string,
  direction: 'up' | 'down'
): WatchlistConfig {
  const t = String(ticker || '').trim().toUpperCase();
  if (!t) return config;
  const idx = config.items.findIndex((it) => it.ticker === t);
  if (idx < 0) return config;
  const group = config.items[idx].group;
  const step = direction === 'up' ? -1 : 1;
  let j = idx + step;
  while (j >= 0 && j < config.items.length && config.items[j].group !== group) {
    j += step;
  }
  if (j < 0 || j >= config.items.length) return config;
  const items = [...config.items];
  const tmp = items[idx];
  items[idx] = items[j];
  items[j] = tmp;
  return { items };
}
