import type {
  NwSettings,
  WatchlistConfig,
  WatchlistGroupId,
  WatchlistItem,
  WatchlistPriceAlert,
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

// ── Enmienda v11: snapshot de siglas vistas y alertas de precio ─────
// Los dos campos nuevos de la config atraviesan las mismas capas que
// los items: validación/normalización acá (motor puro, lo comparten
// el cliente al resolver y el servidor al sanitizar).

/** Siglas que un snapshot puede guardar: las cuatro de veredicto. */
export const WATCHLIST_SEEN_SIGLAS: readonly string[] = ['CF', 'C', 'M', 'V'];

/** Valida y normaliza el snapshot de siglas vistas: claves ticker
 *  válidas (mayúsculas), valores dentro de las cuatro siglas, tope
 *  de entradas = tope de items. Basura → objeto vacío. */
export function normalizeWatchlistSeenSiglas(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_WATCHLIST_ITEMS) break;
    const ticker = String(key || '').trim().toUpperCase();
    if (!ticker || ticker.length > MAX_WATCHLIST_TICKER || !WATCHLIST_TICKER_RE.test(ticker)) {
      continue;
    }
    if (typeof value !== 'string' || !WATCHLIST_SEEN_SIGLAS.includes(value)) continue;
    out[ticker] = value;
  }
  return out;
}

/** Una alerta válida: ticker válido y al menos un umbral numérico
 *  finito y positivo (precio en US$ o % de caída del día, con topes
 *  sanos). Los campos de disparo, si vienen, se conservan solo con
 *  forma válida (fecha ISO parseable y precio finito). */
export function isValidWatchlistAlertShape(a: any): a is WatchlistPriceAlert {
  if (!a || typeof a !== 'object') return false;
  const ticker = typeof a.ticker === 'string' ? a.ticker.trim().toUpperCase() : '';
  if (!ticker || ticker.length > MAX_WATCHLIST_TICKER || !WATCHLIST_TICKER_RE.test(ticker)) {
    return false;
  }
  const belowOk =
    a.belowPrice === undefined ||
    (typeof a.belowPrice === 'number' && Number.isFinite(a.belowPrice) && a.belowPrice > 0 && a.belowPrice <= 1_000_000);
  const dropOk =
    a.dropPct === undefined ||
    (typeof a.dropPct === 'number' && Number.isFinite(a.dropPct) && a.dropPct > 0 && a.dropPct <= 100);
  if (!belowOk || !dropOk) return false;
  if (a.belowPrice === undefined && a.dropPct === undefined) return false;
  return true;
}

/** Normaliza una alerta válida (ticker en mayúsculas; disparo solo
 *  si la fecha parsea y el precio es finito). */
export function normalizeWatchlistAlert(a: WatchlistPriceAlert): WatchlistPriceAlert {
  const out: WatchlistPriceAlert = { ticker: a.ticker.trim().toUpperCase() };
  if (typeof a.belowPrice === 'number' && Number.isFinite(a.belowPrice)) out.belowPrice = a.belowPrice;
  if (typeof a.dropPct === 'number' && Number.isFinite(a.dropPct)) out.dropPct = a.dropPct;
  const at = typeof a.triggeredAt === 'string' ? a.triggeredAt : null;
  const price = typeof a.triggeredPrice === 'number' && Number.isFinite(a.triggeredPrice) ? a.triggeredPrice : null;
  if (at && Number.isFinite(Date.parse(at))) {
    out.triggeredAt = at;
    out.triggeredPrice = price;
  }
  return out;
}

/** Valida y normaliza la lista de alertas: una por ticker (gana la
 *  primera), tope = tope de items. Basura → lista vacía. */
export function normalizeWatchlistAlerts(raw: unknown): WatchlistPriceAlert[] {
  if (!Array.isArray(raw)) return [];
  const out: WatchlistPriceAlert[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    if (out.length >= MAX_WATCHLIST_ITEMS) break;
    if (!isValidWatchlistAlertShape(a)) continue;
    const norm = normalizeWatchlistAlert(a);
    if (seen.has(norm.ticker)) continue;
    seen.add(norm.ticker);
    out.push(norm);
  }
  return out;
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
  const out: WatchlistConfig = { items };
  // Enmienda v11: el snapshot de siglas y las alertas se conservan
  // (validados); solo se incluyen si traen contenido, para que una
  // config vieja resuelva exactamente igual que antes.
  const seenSiglas = normalizeWatchlistSeenSiglas(raw.seenSiglas);
  if (Object.keys(seenSiglas).length > 0) out.seenSiglas = seenSiglas;
  const alerts = normalizeWatchlistAlerts(raw.alerts);
  if (alerts.length > 0) out.alerts = alerts;
  return out;
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
  return { config: { ...config, items: [...config.items, norm] }, added: true };
}

/** Baja de un activo por ticker (enmienda v8). Con la baja se van
 *  también su alerta y su sigla vista (enmienda v11): no queda
 *  estado colgando de un activo que ya no se sigue. */
export function removeWatchlistItem(
  config: WatchlistConfig,
  ticker: string
): WatchlistConfig {
  const t = String(ticker || '').trim().toUpperCase();
  if (!t) return config;
  const out: WatchlistConfig = {
    ...config,
    items: config.items.filter((it) => it.ticker !== t),
  };
  if (out.alerts) out.alerts = out.alerts.filter((a) => a.ticker !== t);
  if (out.seenSiglas && t in out.seenSiglas) {
    const next = { ...out.seenSiglas };
    delete next[t];
    out.seenSiglas = next;
  }
  return out;
}

/**
 * Reordenamiento por arrastre dentro del grupo (enmienda v9: el
 * dueño pidió arrastrar el bloque del activo con presión sostenida
 * en vez de las flechas ↑/↓ de la v8, impracticables para bajar
 * muchas posiciones de una vez). Mueve el ítem al índice destino
 * **dentro de su grupo** (0 = primer puesto del grupo) con
 * remove + insert sobre la subsecuencia del grupo; los demás grupos
 * y el entrelazado de la lista plana no se tocan, así que el
 * movimiento **nunca cruza de grupo**. El índice destino se clampea
 * a los bordes del grupo. Si el ticker no existe, el índice no es un
 * número finito o el destino es el puesto actual, devuelve la MISMA
 * config (sin cambios y sin mutar la original), para que el llamador
 * pueda decidir no persistir.
 */
export function reorderWatchlistItem(
  config: WatchlistConfig,
  ticker: string,
  targetIndexInGroup: number
): WatchlistConfig {
  const t = String(ticker || '').trim().toUpperCase();
  if (!t || !Number.isFinite(targetIndexInGroup)) return config;
  const fromFlat = config.items.findIndex((it) => it.ticker === t);
  if (fromFlat < 0) return config;
  const group = config.items[fromFlat].group;
  const groupItems = config.items.filter((it) => it.group === group);
  const fromIndex = groupItems.findIndex((it) => it.ticker === t);
  const targetIndex = Math.max(
    0,
    Math.min(groupItems.length - 1, Math.trunc(targetIndexInGroup))
  );
  if (targetIndex === fromIndex) return config;
  const reorderedGroup = [...groupItems];
  const [moved] = reorderedGroup.splice(fromIndex, 1);
  reorderedGroup.splice(targetIndex, 0, moved);
  // Reconstruir la lista plana: cada «hueco» del grupo toma el
  // siguiente ítem de la subsecuencia reordenada; los demás grupos
  // quedan exactamente donde estaban.
  let cursor = 0;
  const items = config.items.map((it) =>
    it.group === group ? reorderedGroup[cursor++] : it
  );
  return { ...config, items };
}

// ── Enmienda v11: vista Watchlist (caídas, cambios de veredicto,
// alertas dentro de la app) — funciones puras ────────────────────────

/** Cotización mínima que consumen el orden por caída y las alertas
 *  (estructural: coincide con `WatchlistQuote` de la API). */
export interface WatchlistQuoteLike {
  price: number;
  changePct: number;
}

/**
 * Orden «▼ Caídas hoy» de la vista Watchlist: variación del día
 * ascendente (mayor caída primero). Los items sin cotización (sin
 * símbolo o todavía sin precio) van al final, conservando su orden
 * relativo; el orden entre cotizados con igual variación también se
 * conserva (orden estable). No muta la entrada.
 */
export function sortWatchlistByDayDrop<T extends Pick<WatchlistItem, 'symbol'>>(
  items: readonly T[],
  quotes: Record<string, WatchlistQuoteLike | undefined>
): T[] {
  return items
    .map((it, idx) => {
      const q = it.symbol ? quotes[it.symbol] : undefined;
      const change =
        q && Number.isFinite(q.changePct) ? q.changePct : null;
      return { it, idx, change };
    })
    .sort((a, b) => {
      if (a.change === null && b.change === null) return a.idx - b.idx;
      if (a.change === null) return 1;
      if (b.change === null) return -1;
      if (a.change !== b.change) return a.change - b.change;
      return a.idx - b.idx;
    })
    .map((r) => r.it);
}

/**
 * Snapshot de siglas vistas a partir de las siglas YA CARGADAS:
 * entran solo las ACCIONES con sigla de veredicto (CF/C/M/V); las
 * que todavía cargan («··») o no tienen evaluación («—») no entran.
 * Sobre un snapshot previo, las entradas de activos sin sigla
 * cargada en esta pasada se conservan (no se pierde lo visto).
 */
export function buildSeenSiglasSnapshot(
  items: readonly Pick<WatchlistItem, 'ticker' | 'group' | 'symbol'>[],
  verdicts: Record<string, WatchlistVerdictLike | undefined>,
  prev?: Record<string, string> | null
): Record<string, string> {
  const out: Record<string, string> = { ...(prev ?? {}) };
  for (const it of items) {
    const sigla = watchlistItemSigla(it, verdicts);
    if (sigla && WATCHLIST_SEEN_SIGLAS.includes(sigla)) {
      out[it.ticker] = sigla;
    }
  }
  return out;
}

/** Un cambio de veredicto visible en la fila: sigla guardada →
 *  sigla actual. */
export interface WatchlistSiglaChange {
  ticker: string;
  from: string;
  to: string;
}

/**
 * Diff de siglas de la vista Watchlist: un cambio por activo cuya
 * sigla cargada (CF/C/M/V) difiere de la guardada en el snapshot.
 * Sin snapshot (o sin entrada para el activo) no hay marca: el
 * snapshot se siembra antes de que pueda haber cambios. Las siglas
 * todavía no cargadas tampoco marcan.
 */
export function diffWatchlistSiglas(
  items: readonly Pick<WatchlistItem, 'ticker' | 'group' | 'symbol'>[],
  verdicts: Record<string, WatchlistVerdictLike | undefined>,
  seen: Record<string, string> | undefined | null
): WatchlistSiglaChange[] {
  if (!seen) return [];
  const out: WatchlistSiglaChange[] = [];
  for (const it of items) {
    const from = seen[it.ticker];
    if (!from) continue;
    const to = watchlistItemSigla(it, verdicts);
    if (!to || !WATCHLIST_SEEN_SIGLAS.includes(to)) continue;
    if (to !== from) out.push({ ticker: it.ticker, from, to });
  }
  return out;
}

/** La alerta de un activo (o undefined si no tiene). */
export function watchlistAlertFor(
  config: WatchlistConfig,
  ticker: string
): WatchlistPriceAlert | undefined {
  const t = String(ticker || '').trim().toUpperCase();
  return (config.alerts ?? []).find((a) => a.ticker === t);
}

/**
 * Alta o edición de la alerta de un activo (una por ticker): si ya
 * había una, se reemplaza EN el lugar y vuelve a estado activa (los
 * datos de disparo se limpian: editar = re-definir la vigilancia).
 * Devuelve la misma config si la alerta es inválida.
 */
export function upsertWatchlistAlert(
  config: WatchlistConfig,
  alert: WatchlistPriceAlert
): WatchlistConfig {
  if (!isValidWatchlistAlertShape(alert)) return config;
  const norm = normalizeWatchlistAlert({
    ticker: alert.ticker,
    belowPrice: alert.belowPrice,
    dropPct: alert.dropPct,
  });
  const alerts = [...(config.alerts ?? [])];
  const idx = alerts.findIndex((a) => a.ticker === norm.ticker);
  if (idx >= 0) alerts[idx] = norm;
  else alerts.push(norm);
  return { ...config, alerts };
}

/** Borra la alerta de un activo (si no tenía, misma config). */
export function removeWatchlistAlert(
  config: WatchlistConfig,
  ticker: string
): WatchlistConfig {
  const t = String(ticker || '').trim().toUpperCase();
  const alerts = config.alerts ?? [];
  if (!alerts.some((a) => a.ticker === t)) return config;
  return { ...config, alerts: alerts.filter((a) => a.ticker !== t) };
}

/** Re-activa una alerta disparada: limpia el registro de disparo
 *  para que pueda volver a disparar. Si no estaba disparada o no
 *  existe, misma config. */
export function reactivateWatchlistAlert(
  config: WatchlistConfig,
  ticker: string
): WatchlistConfig {
  const t = String(ticker || '').trim().toUpperCase();
  const alerts = config.alerts ?? [];
  const idx = alerts.findIndex((a) => a.ticker === t);
  if (idx < 0 || !alerts[idx].triggeredAt) return config;
  const next = [...alerts];
  const { triggeredAt: _at, triggeredPrice: _p, ...rest } = next[idx];
  next[idx] = rest;
  return { ...config, alerts: next };
}

/** Alertas ya disparadas (para el banner de la vista y el
 *  distintivo del selector). */
export function triggeredWatchlistAlerts(
  config: WatchlistConfig
): WatchlistPriceAlert[] {
  return (config.alerts ?? []).filter((a) => Boolean(a.triggeredAt));
}

/** Resultado de evaluar las alertas contra cotizaciones frescas. */
export interface WatchlistAlertEvaluation {
  /** Alertas que se dispararon en ESTA evaluación. */
  fired: WatchlistPriceAlert[];
  /** Lista de alertas resultante (la misma referencia si no se
   *  disparó ninguna: el llamador persiste solo si fired > 0). */
  alerts: WatchlistPriceAlert[];
}

/**
 * Evaluación de alertas dentro de la app (la corre el hook global
 * cada 15 s con la app abierta): por cada alerta ACTIVA (no
 * disparada) con cotización de su símbolo, se dispara si el precio
 * bajó del umbral (`price <= belowPrice`) o si la caída del día
 * llegó al umbral (`changePct <= -dropPct`). Al disparar quedan la
 * hora (ISO recibida) y el precio que la disparó. Las alertas sin
 * cotización o sin símbolo no se evalúan. Función pura: no muta.
 */
export function evaluateWatchlistAlerts(
  config: WatchlistConfig,
  items: readonly Pick<WatchlistItem, 'ticker' | 'symbol'>[],
  quotes: Record<string, WatchlistQuoteLike | undefined>,
  nowIso: string
): WatchlistAlertEvaluation {
  const alerts = config.alerts ?? [];
  if (alerts.length === 0) return { fired: [], alerts };
  const symbolByTicker = new Map<string, string | null>(
    items.map((it) => [it.ticker, it.symbol])
  );
  const fired: WatchlistPriceAlert[] = [];
  const next = alerts.map((a) => {
    if (a.triggeredAt) return a;
    const symbol = symbolByTicker.get(a.ticker);
    if (!symbol) return a;
    const q = quotes[symbol];
    if (!q || !Number.isFinite(q.price)) return a;
    const byPrice = a.belowPrice !== undefined && q.price <= a.belowPrice;
    const byDrop =
      a.dropPct !== undefined &&
      Number.isFinite(q.changePct) &&
      q.changePct <= -a.dropPct;
    if (!byPrice && !byDrop) return a;
    const hit: WatchlistPriceAlert = {
      ...a,
      triggeredAt: nowIso,
      triggeredPrice: q.price,
    };
    fired.push(hit);
    return hit;
  });
  return { fired, alerts: fired.length > 0 ? next : alerts };
}
