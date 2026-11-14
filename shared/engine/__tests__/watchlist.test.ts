import { describe, expect, it } from 'vitest';
import {
  buildWatchlistItems,
  groupWatchlistItems,
  resolveWatchlistConfig,
  seedWatchlistConfig,
  verdictToSigla,
  WATCHLIST_CAPTURE_ORDER,
} from '../watchlist.js';

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

describe('watchlist · verdictToSigla (SPEC-006 §1.3)', () => {
  it('mapea los cuatro veredictos de la ficha', () => {
    expect(verdictToSigla('COMPRA FUERTE')).toBe('CM'); // «CM» literal, pedido del dueño
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
