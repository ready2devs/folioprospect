import { describe, expect, it } from 'vitest';
import {
  addWatchlistItem,
  buildSeenSiglasSnapshot,
  buildWatchlistItemFromSearch,
  buildWatchlistItems,
  countWatchlistSiglas,
  detectWatchlistGroup,
  diffWatchlistSiglas,
  evaluateWatchlistAlerts,
  filterWatchlistItems,
  groupWatchlistItems,
  reactivateWatchlistAlert,
  removeWatchlistAlert,
  reorderWatchlistItem,
  rederiveVerdictSigla,
  removeWatchlistItem,
  resolveWatchlistConfig,
  seedWatchlistConfig,
  sortWatchlistByDayDrop,
  triggeredWatchlistAlerts,
  upsertWatchlistAlert,
  verdictToSigla,
  watchlistAlertFor,
  watchlistContains,
  WATCHLIST_CAPTURE_ORDER,
} from '../watchlist.js';
import type { WatchlistConfig, WatchlistItem } from '../types.js';

describe('watchlist · semilla (SPEC-006 §2)', () => {
  const seed = seedWatchlistConfig();

  it('la captura deduplicada da exactamente 84 únicos', () => {
    expect(seed.items).toHaveLength(84);
    const tickers = seed.items.map((i) => i.ticker);
    expect(new Set(tickers).size).toBe(84);
  });

  it('los duplicados de la captura aparecen una sola vez (INTU, ASTS, NASA, SPCX)', () => {
    for (const t of ['INTU', 'ASTS', 'NASA', 'SPCX']) {
      expect(seed.items.filter((i) => i.ticker === t)).toHaveLength(1);
    }
  });

  it('la deduplicación conserva la primera aparición', () => {
    const items = buildWatchlistItems(['NVDA', 'GOOG', 'NVDA', 'TSM', 'GOOG']);
    expect(items.map((i) => i.ticker)).toEqual(['NVDA', 'GOOG', 'TSM']);
  });

  it('grupos: 74 ACCIONES, 5 CRIPTO, 5 ETFS', () => {
    const groups = groupWatchlistItems(seed.items);
    expect(groups.map((g) => g.group)).toEqual(['ACCIONES', 'CRIPTO', 'ETFS']);
    expect(groups[0].items).toHaveLength(74);
    expect(groups[1].items).toHaveLength(5);
    expect(groups[2].items).toHaveLength(5);
  });

  it('dentro de cada grupo se conserva el orden relativo de la captura', () => {
    const groups = groupWatchlistItems(seed.items);
    const acciones = groups[0].items.map((i) => i.ticker);
    expect(acciones.slice(0, 8)).toEqual([
      'GOOG', 'TSM', 'MU', 'NVDA', 'META', 'MSFT', 'NU', 'AMZN',
    ]);
    expect(acciones[acciones.length - 1]).toBe('CDW');
    // El orden relativo global de la captura se respeta: APP va detrás
    // de MELI/HSAI y antes que APH; ONTO detrás de NFLX.
    expect(acciones.indexOf('APP')).toBeGreaterThan(acciones.indexOf('HSAI'));
    expect(acciones.indexOf('ONTO')).toBeGreaterThan(acciones.indexOf('NFLX'));
    expect(groups[1].items.map((i) => i.ticker)).toEqual([
      'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'ETH/BTC',
    ]);
    expect(groups[2].items.map((i) => i.ticker)).toEqual([
      'SPY', 'EWY', 'COPX', 'NASA', 'HUMN',
    ]);
  });

  it('resolución a símbolos completos de la app', () => {
    const byTicker = new Map(seed.items.map((i) => [i.ticker, i.symbol]));
    expect(byTicker.get('GOOG')).toBe('NASDAQ:GOOG');
    expect(byTicker.get('TSM')).toBe('NYSE:TSM');
    expect(byTicker.get('NU')).toBe('NYSE:NU');
    expect(byTicker.get('ONTO')).toBe('NYSE:ONTO');
    expect(byTicker.get('BTC/USD')).toBe('BINANCE:BTCUSDT');
    expect(byTicker.get('ETH/USD')).toBe('BINANCE:ETHUSDT');
    expect(byTicker.get('SOL/USD')).toBe('BINANCE:SOLUSDT');
    expect(byTicker.get('BNB/USD')).toBe('BINANCE:BNBUSDT');
    expect(byTicker.get('ETH/BTC')).toBe('BINANCE:ETHBTC');
    expect(byTicker.get('SPY')).toBe('AMEX:SPY');
  });

  it('SPCX resuelve contra el buscador de la app (Space Exploration Technologies, NASDAQ)', () => {
    // La SPEC-006 lo daba como ejemplo de posible no-resolución, pero
    // la validación contra /api/search + /api/quotes del 2026-11-14
    // devolvió empresa y cotización reales: manda la regla de
    // validación de la propia spec.
    const spcx = seed.items.find((i) => i.ticker === 'SPCX');
    expect(spcx?.symbol).toBe('NASDAQ:SPCX');
    expect(spcx?.group).toBe('ACCIONES');
  });

  it('un rótulo sin resolución conocida queda con símbolo null (fila sin precio)', () => {
    const items = buildWatchlistItems(['GOOG', 'XXXX']);
    expect(items[1]).toEqual({ ticker: 'XXXX', group: 'ACCIONES', symbol: null });
  });

  it('todo rótulo de la captura tiene resolución declarada (símbolo o null)', () => {
    expect(WATCHLIST_CAPTURE_ORDER).toHaveLength(84);
    for (const item of seed.items) {
      expect(item.symbol === null || /^[A-Z]+:[A-Z0-9.\-]+$/.test(item.symbol)).toBe(true);
    }
  });
});

describe('watchlist · resolveWatchlistConfig', () => {
  it('sin campo guardado → semilla', () => {
    expect(resolveWatchlistConfig(null).items).toHaveLength(84);
    expect(resolveWatchlistConfig({}).items).toHaveLength(84);
    expect(resolveWatchlistConfig({ watchlist: undefined }).items).toHaveLength(84);
  });

  it('config guardada se respeta (aunque esté vacía: no se vuelve a sembrar)', () => {
    expect(resolveWatchlistConfig({ watchlist: { items: [] } }).items).toEqual([]);
    const stored = {
      watchlist: {
        items: [{ symbol: 'NASDAQ:NVDA', ticker: 'NVDA', group: 'ACCIONES' as const }],
      },
    };
    expect(resolveWatchlistConfig(stored).items).toEqual(stored.watchlist.items);
  });

  it('filtra items inválidos y duplicados por ticker', () => {
    const out = resolveWatchlistConfig({
      watchlist: {
        items: [
          { symbol: 'NASDAQ:NVDA', ticker: 'nvda', group: 'ACCIONES' },
          { symbol: 'NASDAQ:NVDA', ticker: 'NVDA', group: 'ACCIONES' }, // duplicado
          { symbol: 'sin-prefijo', ticker: 'MAL', group: 'ACCIONES' }, // símbolo inválido
          { symbol: null, ticker: 'SPCX', group: 'ACCIONES' }, // null válido
          { symbol: 'AMEX:SPY', ticker: 'SPY', group: 'OTRO' as any }, // grupo inválido
          { symbol: 'AMEX:SPY', ticker: 'SPY', group: 'ETFS' },
        ] as any,
      },
    });
    expect(out.items.map((i) => i.ticker)).toEqual(['NVDA', 'SPCX', 'SPY']);
    expect(out.items[0].ticker).toBe('NVDA'); // normalizado a mayúsculas
  });
});

describe('watchlist · verdictToSigla (SPEC-006 §1.3, enmienda v8)', () => {
  it('mapea los cuatro veredictos de la ficha', () => {
    // Compra Fuerte = «CF»: el dueño corrigió en vivo la «CM» de la v1.
    expect(verdictToSigla('COMPRA FUERTE')).toBe('CF');
    expect(verdictToSigla('COMPRAR (de a poco, no todo junto)')).toBe('C');
    expect(verdictToSigla('MANTENER')).toBe('M');
    expect(verdictToSigla('VENDER')).toBe('V');
  });

  it('sin veredicto o desconocido → «—»', () => {
    expect(verdictToSigla(null)).toBe('—');
    expect(verdictToSigla(undefined)).toBe('—');
    expect(verdictToSigla('')).toBe('—');
    expect(verdictToSigla('OTRA COSA')).toBe('—');
  });
});

describe('watchlist · rederiveVerdictSigla (enmienda v8: caché CM → CF)', () => {
  it('una entrada cacheada como «CM» se re-deriva a «CF» desde el veredicto', () => {
    const cached = { sigla: 'CM', verdict: 'COMPRA FUERTE' as string | null, at: 123, day: '2026-11-14' };
    const fresh = rederiveVerdictSigla(cached);
    expect(fresh.sigla).toBe('CF');
    // El resto de la entrada no se toca.
    expect(fresh.verdict).toBe('COMPRA FUERTE');
    expect(fresh.at).toBe(123);
    expect(fresh.day).toBe('2026-11-14');
  });

  it('veredicto null sigue en «—» y las demás siglas quedan igual', () => {
    expect(rederiveVerdictSigla({ sigla: '—', verdict: null }).sigla).toBe('—');
    expect(rederiveVerdictSigla({ sigla: 'M', verdict: 'MANTENER' }).sigla).toBe('M');
    expect(rederiveVerdictSigla({ sigla: 'V', verdict: 'VENDER' }).sigla).toBe('V');
  });
});

describe('watchlist · filtro por veredicto (enmienda v8)', () => {
  const items: WatchlistItem[] = [
    { ticker: 'NU', group: 'ACCIONES', symbol: 'NYSE:NU' },
    { ticker: 'GOOG', group: 'ACCIONES', symbol: 'NASDAQ:GOOG' },
    { ticker: 'AAPL', group: 'ACCIONES', symbol: 'NASDAQ:AAPL' },
    { ticker: 'PEND', group: 'ACCIONES', symbol: 'NASDAQ:PEND' }, // sin entrada: cargando
    { ticker: 'BTC/USD', group: 'CRIPTO', symbol: 'BINANCE:BTCUSDT' },
    { ticker: 'SPY', group: 'ETFS', symbol: 'AMEX:SPY' },
  ];
  const verdicts = {
    'NYSE:NU': { sigla: 'CF', verdict: 'COMPRA FUERTE' },
    'NASDAQ:GOOG': { sigla: 'M', verdict: 'MANTENER' },
    'NASDAQ:AAPL': { sigla: 'V', verdict: 'VENDER' },
  };

  it('TODOS muestra todo, incluidos cargando («··») y «—»', () => {
    expect(filterWatchlistItems(items, verdicts, 'TODOS').map((i) => i.ticker)).toEqual([
      'NU', 'GOOG', 'AAPL', 'PEND', 'BTC/USD', 'SPY',
    ]);
  });

  it('cada sigla muestra solo las filas con esa sigla cargada', () => {
    expect(filterWatchlistItems(items, verdicts, 'CF').map((i) => i.ticker)).toEqual(['NU']);
    expect(filterWatchlistItems(items, verdicts, 'M').map((i) => i.ticker)).toEqual(['GOOG']);
    expect(filterWatchlistItems(items, verdicts, 'V').map((i) => i.ticker)).toEqual(['AAPL']);
    expect(filterWatchlistItems(items, verdicts, 'C')).toEqual([]);
  });

  it('las filas cargando y las «—» no aparecen en ningún filtro de veredicto', () => {
    for (const f of ['CF', 'C', 'M', 'V'] as const) {
      const tickers = filterWatchlistItems(items, verdicts, f).map((i) => i.ticker);
      expect(tickers).not.toContain('PEND');
      expect(tickers).not.toContain('BTC/USD');
      expect(tickers).not.toContain('SPY');
    }
  });

  it('compuesto con el agrupado, los grupos sin filas visibles desaparecen', () => {
    const groups = groupWatchlistItems(filterWatchlistItems(items, verdicts, 'CF'));
    expect(groups.map((g) => g.group)).toEqual(['ACCIONES']);
    expect(groups[0].items.map((i) => i.ticker)).toEqual(['NU']);
  });

  it('countWatchlistSiglas cuenta solo las siglas ya cargadas', () => {
    expect(countWatchlistSiglas(items, verdicts)).toEqual({ CF: 1, C: 0, M: 1, V: 1 });
    expect(countWatchlistSiglas(items, {})).toEqual({ CF: 0, C: 0, M: 0, V: 0 });
  });
});

describe('watchlist · alta y baja (enmienda v8)', () => {
  it('detectWatchlistGroup: BINANCE: → CRIPTO, tipo ETF → ETFS, resto ACCIONES', () => {
    expect(detectWatchlistGroup({ symbol: 'BINANCE:BTCUSDT', type: 'Crypto' })).toBe('CRIPTO');
    expect(detectWatchlistGroup({ symbol: 'AMEX:SPY', type: 'ETF' })).toBe('ETFS');
    expect(detectWatchlistGroup({ symbol: 'NASDAQ:QQQ', type: 'ETF' })).toBe('ETFS');
    expect(detectWatchlistGroup({ symbol: 'NASDAQ:KLAC', type: 'Stock' })).toBe('ACCIONES');
    expect(detectWatchlistGroup({ symbol: 'NYSE:TSM', type: 'Dr' })).toBe('ACCIONES');
  });

  it('buildWatchlistItemFromSearch arma el item y detecta el grupo', () => {
    expect(
      buildWatchlistItemFromSearch({ symbol: 'NASDAQ:KLAC', ticker: 'KLAC', type: 'Stock' })
    ).toEqual({ ticker: 'KLAC', group: 'ACCIONES', symbol: 'NASDAQ:KLAC' });
    expect(
      buildWatchlistItemFromSearch({ symbol: 'AMEX:SPY', ticker: 'SPY', type: 'ETF' })?.group
    ).toBe('ETFS');
    // Sin ticker en el resultado: se deriva del sufijo del símbolo.
    expect(buildWatchlistItemFromSearch({ symbol: 'NYSE:NU' })?.ticker).toBe('NU');
    // Símbolo sin la forma de la app → null (no se inventa nada).
    expect(buildWatchlistItemFromSearch({ symbol: 'KLAC' })).toBeNull();
    expect(buildWatchlistItemFromSearch({ symbol: '' })).toBeNull();
    expect(buildWatchlistItemFromSearch({})).toBeNull();
  });

  it('addWatchlistItem agrega al final de su grupo', () => {
    const seed = seedWatchlistConfig();
    const klac: WatchlistItem = { ticker: 'KLAC', group: 'ACCIONES', symbol: 'NASDAQ:KLAC' };
    const { config, added } = addWatchlistItem(seed, klac);
    expect(added).toBe(true);
    expect(config.items).toHaveLength(85);
    const acciones = groupWatchlistItems(config.items)[0];
    expect(acciones.items[acciones.items.length - 1].ticker).toBe('KLAC');
    // La config original no se muta.
    expect(seed.items).toHaveLength(84);
  });

  it('addWatchlistItem no duplica: ni por símbolo ni por ticker', () => {
    const seed = seedWatchlistConfig();
    const porSimbolo = addWatchlistItem(seed, {
      ticker: 'OTRO',
      group: 'ACCIONES',
      symbol: 'NASDAQ:GOOG',
    });
    expect(porSimbolo.added).toBe(false);
    expect(porSimbolo.config.items).toHaveLength(84);
    const porTicker = addWatchlistItem(seed, {
      ticker: 'GOOG',
      group: 'ACCIONES',
      symbol: 'NYSE:GOOG',
    });
    expect(porTicker.added).toBe(false);
    expect(watchlistContains(seed, { symbol: 'NASDAQ:GOOG' })).toBe(true);
    expect(watchlistContains(seed, { ticker: 'goog' })).toBe(true);
    expect(watchlistContains(seed, { symbol: 'NASDAQ:KLAC', ticker: 'KLAC' })).toBe(false);
  });

  it('removeWatchlistItem quita solo el ticker pedido', () => {
    const seed = seedWatchlistConfig();
    const out = removeWatchlistItem(seed, 'GOOG');
    expect(out.items).toHaveLength(83);
    expect(out.items.some((i) => i.ticker === 'GOOG')).toBe(false);
    expect(out.items[0].ticker).toBe('TSM');
    // Ticker inexistente: la lista queda igual.
    expect(removeWatchlistItem(seed, 'KLAC').items).toHaveLength(84);
    expect(seed.items).toHaveLength(84);
  });
});

describe('watchlist · reorderWatchlistItem (enmienda v9: arrastre)', () => {
  // Lista plana con grupos MEZCLADOS, como la semilla real (la
  // captura intercala cripto/ETFs entre acciones).
  const mixed = {
    items: [
      { ticker: 'AAA', group: 'ACCIONES', symbol: 'NASDAQ:AAA' },
      { ticker: 'BTC/USD', group: 'CRIPTO', symbol: 'BINANCE:BTCUSDT' },
      { ticker: 'BBB', group: 'ACCIONES', symbol: 'NASDAQ:BBB' },
      { ticker: 'SPY', group: 'ETFS', symbol: 'AMEX:SPY' },
      { ticker: 'CCC', group: 'ACCIONES', symbol: 'NASDAQ:CCC' },
      { ticker: 'DDD', group: 'ACCIONES', symbol: 'NASDAQ:DDD' },
      { ticker: 'ETH/USD', group: 'CRIPTO', symbol: 'BINANCE:ETHUSDT' },
      { ticker: 'EEE', group: 'ACCIONES', symbol: 'NASDAQ:EEE' },
    ] as WatchlistItem[],
  };
  const grupoDe = (cfg: { items: WatchlistItem[] }, group: string) =>
    groupWatchlistItems(cfg.items).find((g) => g.group === group)!.items.map((i) => i.ticker);
  const accionesDe = (cfg: { items: WatchlistItem[] }) => grupoDe(cfg, 'ACCIONES');

  it('mueve varias posiciones de una vez (remove + insert dentro del grupo)', () => {
    const out = reorderWatchlistItem(mixed, 'AAA', 3);
    expect(accionesDe(out)).toEqual(['BBB', 'CCC', 'DDD', 'AAA', 'EEE']);
    const back = reorderWatchlistItem(out, 'AAA', 0);
    expect(accionesDe(back)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
    const up = reorderWatchlistItem(mixed, 'EEE', 1);
    expect(accionesDe(up)).toEqual(['AAA', 'EEE', 'BBB', 'CCC', 'DDD']);
  });

  it('el índice destino se clampea a los bordes del grupo', () => {
    expect(accionesDe(reorderWatchlistItem(mixed, 'BBB', 99))).toEqual([
      'AAA', 'CCC', 'DDD', 'EEE', 'BBB',
    ]);
    expect(accionesDe(reorderWatchlistItem(mixed, 'DDD', -5))).toEqual([
      'DDD', 'AAA', 'BBB', 'CCC', 'EEE',
    ]);
  });

  it('nunca cruza de grupo: los demás grupos conservan items y orden', () => {
    const out = reorderWatchlistItem(mixed, 'AAA', 4);
    expect(grupoDe(out, 'CRIPTO')).toEqual(['BTC/USD', 'ETH/USD']);
    expect(grupoDe(out, 'ETFS')).toEqual(['SPY']);
    // El ítem movido sigue siendo de su grupo y el total no cambia.
    expect(out.items.find((i) => i.ticker === 'AAA')?.group).toBe('ACCIONES');
    expect(out.items).toHaveLength(mixed.items.length);
    // Y al revés: mover dentro de CRIPTO no toca ACCIONES.
    const cripto = reorderWatchlistItem(mixed, 'ETH/USD', 0);
    expect(grupoDe(cripto, 'CRIPTO')).toEqual(['ETH/USD', 'BTC/USD']);
    expect(accionesDe(cripto)).toEqual(['AAA', 'BBB', 'CCC', 'DDD', 'EEE']);
  });

  it('mismo puesto → misma config (sin cambios); ticker inexistente o índice inválido también', () => {
    expect(reorderWatchlistItem(mixed, 'BBB', 1)).toBe(mixed);
    expect(reorderWatchlistItem(mixed, 'SPY', 0)).toBe(mixed); // única en ETFS
    expect(reorderWatchlistItem(mixed, 'XXXX', 2)).toBe(mixed);
    expect(reorderWatchlistItem(mixed, 'AAA', Number.NaN)).toBe(mixed);
    expect(reorderWatchlistItem(mixed, '', 2)).toBe(mixed);
  });

  it('no muta la original', () => {
    const snapshot = JSON.stringify(mixed);
    reorderWatchlistItem(mixed, 'AAA', 4);
    reorderWatchlistItem(mixed, 'EEE', 0);
    expect(JSON.stringify(mixed)).toBe(snapshot);
  });

  it('sobre la semilla real: arrastrar GOOG al puesto 5 de ACCIONES', () => {
    const seed = seedWatchlistConfig();
    const out = reorderWatchlistItem(seed, 'GOOG', 5);
    expect(accionesDe(out).slice(0, 7)).toEqual([
      'TSM', 'MU', 'NVDA', 'META', 'MSFT', 'GOOG', 'NU',
    ]);
    expect(seed.items[0].ticker).toBe('GOOG'); // original intacta
    expect(grupoDe(out, 'CRIPTO')).toEqual([
      'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'ETH/BTC',
    ]);
  });
});

// ── Enmienda v11: vista Watchlist (caídas, siglas vistas, alertas) ──

const itemV = (ticker: string, symbol: string | null, group: WatchlistItem['group'] = 'ACCIONES'): WatchlistItem => ({
  ticker,
  symbol,
  group,
});

describe('watchlist · sortWatchlistByDayDrop (enmienda v11: chip «▼ Caídas hoy»)', () => {
  const items = [
    itemV('GOOG', 'NASDAQ:GOOG'),
    itemV('MU', 'NASDAQ:MU'),
    itemV('NVDA', 'NASDAQ:NVDA'),
    itemV('SPCX', null),
  ];
  const quotes = {
    'NASDAQ:GOOG': { price: 100, changePct: -1.5 },
    'NASDAQ:MU': { price: 100, changePct: -7.25 },
    'NASDAQ:NVDA': { price: 100, changePct: 2 },
  };

  it('ordena de mayor caída a mayor suba; sin cotización al final', () => {
    const out = sortWatchlistByDayDrop(items, quotes);
    expect(out.map((i) => i.ticker)).toEqual(['MU', 'GOOG', 'NVDA', 'SPCX']);
  });

  it('es estable ante empates y no muta la entrada', () => {
    const tied = [itemV('A', 'NASDAQ:A'), itemV('B', 'NASDAQ:B')];
    const q = {
      'NASDAQ:A': { price: 1, changePct: -3 },
      'NASDAQ:B': { price: 1, changePct: -3 },
    };
    expect(sortWatchlistByDayDrop(tied, q).map((i) => i.ticker)).toEqual(['A', 'B']);
    expect(items[0].ticker).toBe('GOOG');
  });
});

describe('watchlist · snapshot de siglas vistas (enmienda v11)', () => {
  const items = [
    itemV('GOOG', 'NASDAQ:GOOG'),
    itemV('MU', 'NASDAQ:MU'),
    itemV('BTC/USD', 'BINANCE:BTCUSDT', 'CRIPTO'),
  ];
  const verdicts = {
    'NASDAQ:GOOG': { sigla: 'CF', verdict: 'COMPRA FUERTE' },
    'NASDAQ:MU': { sigla: 'M', verdict: 'MANTENER' },
  };

  it('buildSeenSiglasSnapshot guarda solo ACCIONES con sigla de veredicto', () => {
    expect(buildSeenSiglasSnapshot(items, verdicts, null)).toEqual({ GOOG: 'CF', MU: 'M' });
  });

  it('sobre un snapshot previo conserva lo no cargado en esta pasada', () => {
    const out = buildSeenSiglasSnapshot(items, { 'NASDAQ:GOOG': { sigla: 'C', verdict: 'COMPRAR' } }, { GOOG: 'CF', MU: 'M', VIEJO: 'V' });
    expect(out).toEqual({ GOOG: 'C', MU: 'M', VIEJO: 'V' });
  });

  it('diffWatchlistSiglas marca solo cambios contra el snapshot', () => {
    expect(diffWatchlistSiglas(items, verdicts, { GOOG: 'M', MU: 'M' })).toEqual([
      { ticker: 'GOOG', from: 'M', to: 'CF' },
    ]);
    // Sin snapshot o sin entrada para el activo: sin marcas.
    expect(diffWatchlistSiglas(items, verdicts, undefined)).toEqual([]);
    expect(diffWatchlistSiglas(items, verdicts, { MU: 'M' })).toEqual([]);
    // Sigla todavía no cargada: sin marca.
    expect(diffWatchlistSiglas(items, {}, { GOOG: 'M', MU: 'C' })).toEqual([]);
  });

  it('resolveWatchlistConfig conserva snapshot y alertas válidos y descarta basura', () => {
    const out = resolveWatchlistConfig({
      watchlist: {
        items: [itemV('GOOG', 'NASDAQ:GOOG')],
        seenSiglas: { GOOG: 'CF', MAL: 'XX', '': 'C' },
        alerts: [
          { ticker: 'GOOG', belowPrice: 150 },
          { ticker: 'GOOG', dropPct: 5 },
          { ticker: 'MU', belowPrice: -3 },
          { ticker: 'MU' },
          'basura',
        ],
      } as any,
    });
    expect(out.seenSiglas).toEqual({ GOOG: 'CF' });
    expect(out.alerts).toEqual([{ ticker: 'GOOG', belowPrice: 150 }]);
    const limpia = resolveWatchlistConfig({ watchlist: { items: [] } as any });
    expect(limpia.seenSiglas).toBeUndefined();
    expect(limpia.alerts).toBeUndefined();
  });

  it('alta/baja/reorden conservan snapshot y alertas; la baja limpia los del activo', () => {
    const base: WatchlistConfig = {
      items: [itemV('GOOG', 'NASDAQ:GOOG'), itemV('MU', 'NASDAQ:MU')],
      seenSiglas: { GOOG: 'CF', MU: 'M' },
      alerts: [{ ticker: 'MU', dropPct: 5 }],
    };
    const re = reorderWatchlistItem(base, 'GOOG', 1);
    expect(re.seenSiglas).toEqual(base.seenSiglas);
    expect(re.alerts).toEqual(base.alerts);
    const baja = removeWatchlistItem(base, 'MU');
    expect(baja.alerts).toEqual([]);
    expect(baja.seenSiglas).toEqual({ GOOG: 'CF' });
  });
});

describe('watchlist · alertas de precio (enmienda v11)', () => {
  const items = [itemV('NVDA', 'NASDAQ:NVDA'), itemV('MU', 'NASDAQ:MU'), itemV('SPCX', null)];
  const base: WatchlistConfig = { items };

  it('upsert crea, edita en el lugar y re-activa (limpia el disparo); inválida no toca', () => {
    const c1 = upsertWatchlistAlert(base, { ticker: 'NVDA', belowPrice: 150 });
    expect(c1.alerts).toEqual([{ ticker: 'NVDA', belowPrice: 150 }]);
    const fired = {
      ...c1,
      alerts: [{ ticker: 'NVDA', belowPrice: 150, triggeredAt: '2026-11-15T10:00:00.000Z', triggeredPrice: 149 }],
    };
    const c2 = upsertWatchlistAlert(fired, { ticker: 'NVDA', dropPct: 6 });
    expect(c2.alerts).toEqual([{ ticker: 'NVDA', dropPct: 6 }]);
    expect(upsertWatchlistAlert(base, { ticker: 'NVDA' })).toBe(base);
    expect(upsertWatchlistAlert(base, { ticker: 'NVDA', belowPrice: -1 })).toBe(base);
  });

  it('remove y reactivate', () => {
    const c1 = upsertWatchlistAlert(base, { ticker: 'MU', dropPct: 5 });
    expect(removeWatchlistAlert(c1, 'MU').alerts).toEqual([]);
    expect(removeWatchlistAlert(c1, 'NVDA')).toBe(c1);
    const firedCfg: WatchlistConfig = {
      items,
      alerts: [{ ticker: 'MU', dropPct: 5, triggeredAt: '2026-11-15T10:00:00.000Z', triggeredPrice: 300 }],
    };
    expect(reactivateWatchlistAlert(firedCfg, 'MU').alerts).toEqual([{ ticker: 'MU', dropPct: 5 }]);
    expect(reactivateWatchlistAlert(c1, 'MU')).toBe(c1);
    expect(triggeredWatchlistAlerts(firedCfg)).toHaveLength(1);
    expect(watchlistAlertFor(firedCfg, 'MU')?.dropPct).toBe(5);
  });

  it('evaluate dispara por precio y por caída del día, una sola vez', () => {
    const cfg: WatchlistConfig = {
      items,
      alerts: [
        { ticker: 'NVDA', belowPrice: 150 },
        { ticker: 'MU', dropPct: 5 },
        { ticker: 'SPCX', belowPrice: 10 },
      ],
    };
    const now = '2026-11-15T15:00:00.000Z';
    const r1 = evaluateWatchlistAlerts(cfg, items, {
      'NASDAQ:NVDA': { price: 149.5, changePct: -1 },
      'NASDAQ:MU': { price: 380, changePct: -5.5 },
    }, now);
    expect(r1.fired.map((a) => a.ticker)).toEqual(['NVDA', 'MU']);
    expect(r1.fired[0]).toMatchObject({ triggeredAt: now, triggeredPrice: 149.5 });
    // SPCX no tiene símbolo: nunca se evalúa.
    expect(r1.alerts.find((a) => a.ticker === 'SPCX')?.triggeredAt).toBeUndefined();
    // Segunda pasada con las mismas cotizaciones: no re-dispara.
    const r2 = evaluateWatchlistAlerts({ ...cfg, alerts: r1.alerts }, items, {
      'NASDAQ:NVDA': { price: 140, changePct: -2 },
      'NASDAQ:MU': { price: 370, changePct: -6 },
    }, '2026-11-15T15:00:15.000Z');
    expect(r2.fired).toEqual([]);
    expect(r2.alerts).toBe(r1.alerts);
    // Sin cruzar umbrales: nada.
    const r3 = evaluateWatchlistAlerts(cfg, items, {
      'NASDAQ:NVDA': { price: 151, changePct: -4.9 },
      'NASDAQ:MU': { price: 380, changePct: -4.9 },
    }, now);
    expect(r3.fired).toEqual([]);
  });
});
