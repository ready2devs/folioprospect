import { describe, expect, it } from 'vitest';
import { sanitizeNwSettings, sanitizeWatchlist } from '../db.js';

// SPEC-006: el sanitizador de la watchlist sigue el patrón de
// subPortfolios — campo ausente → undefined (el cliente siembra),
// basura → config vacía, nunca lanza.
describe('sanitizeWatchlist', () => {
  it('campo ausente → undefined', () => {
    expect(sanitizeWatchlist(undefined)).toBeUndefined();
  });

  it('basura → config vacía, sin lanzar', () => {
    expect(sanitizeWatchlist(null)).toEqual({ items: [] });
    expect(sanitizeWatchlist('basura')).toEqual({ items: [] });
    expect(sanitizeWatchlist(42)).toEqual({ items: [] });
    expect(sanitizeWatchlist({})).toEqual({ items: [] });
    expect(sanitizeWatchlist({ items: 'nope' })).toEqual({ items: [] });
  });

  it('preserva items válidos, incluido símbolo null (no disponible)', () => {
    const out = sanitizeWatchlist({
      items: [
        { symbol: 'NASDAQ:GOOG', ticker: 'GOOG', group: 'ACCIONES' },
        { symbol: 'BINANCE:BTCUSDT', ticker: 'BTC/USD', group: 'CRIPTO' },
        { symbol: null, ticker: 'SPCX', group: 'ACCIONES' },
        { symbol: 'AMEX:SPY', ticker: 'SPY', group: 'ETFS' },
      ],
    });
    expect(out?.items).toHaveLength(4);
    expect(out?.items[2].symbol).toBeNull();
  });

  it('descarta duplicados por ticker (gana la primera) e items inválidos', () => {
    const out = sanitizeWatchlist({
      items: [
        { symbol: 'NASDAQ:NVDA', ticker: 'NVDA', group: 'ACCIONES' },
        { symbol: 'NYSE:NVDA', ticker: 'NVDA', group: 'ACCIONES' },
        { symbol: 'NASDAQ', ticker: 'SINPREFIJO', group: 'ACCIONES' },
        { symbol: 'NASDAQ:XX', ticker: '', group: 'ACCIONES' },
        { symbol: 'NASDAQ:XX', ticker: 'GRUPOMAL', group: 'OTRO' },
        { symbol: 123, ticker: 'NUM', group: 'ACCIONES' },
        'no-es-objeto',
      ],
    });
    expect(out?.items.map((i) => i.ticker)).toEqual(['NVDA']);
    expect(out?.items[0].symbol).toBe('NASDAQ:NVDA');
  });

  it('respeta el tope de 200 items', () => {
    const items = Array.from({ length: 250 }, (_, i) => ({
      symbol: `NASDAQ:T${i}`,
      ticker: `T${i}`,
      group: 'ACCIONES',
    }));
    expect(sanitizeWatchlist({ items })?.items).toHaveLength(200);
  });

  it('sanitizeNwSettings integra la watchlist sin tocar el resto', () => {
    const out = sanitizeNwSettings({
      brokerCashUsd: 100,
      watchlist: {
        items: [{ symbol: 'NASDAQ:GOOG', ticker: 'GOOG', group: 'ACCIONES' }],
      },
    });
    expect(out?.brokerCashUsd).toBe(100);
    expect(out?.watchlist?.items).toHaveLength(1);
    const sinCampo = sanitizeNwSettings({ brokerCashUsd: 5 });
    expect(sinCampo?.watchlist).toBeUndefined();
  });
});

describe('sanitizeWatchlist · enmienda v11 (siglas vistas y alertas)', () => {
  it('preserva snapshot y alertas válidos, con disparo incluido', () => {
    const out = sanitizeWatchlist({
      items: [{ symbol: 'NASDAQ:NVDA', ticker: 'NVDA', group: 'ACCIONES' }],
      seenSiglas: { NVDA: 'M', GOOG: 'XX' },
      alerts: [
        {
          ticker: 'NVDA',
          belowPrice: 150,
          dropPct: 5,
          triggeredAt: '2026-11-15T15:00:00.000Z',
          triggeredPrice: 149.5,
        },
      ],
    });
    expect(out?.seenSiglas).toEqual({ NVDA: 'M' });
    expect(out?.alerts).toEqual([
      {
        ticker: 'NVDA',
        belowPrice: 150,
        dropPct: 5,
        triggeredAt: '2026-11-15T15:00:00.000Z',
        triggeredPrice: 149.5,
      },
    ]);
  });

  it('descarta alertas inválidas o duplicadas y snapshot basura', () => {
    const out = sanitizeWatchlist({
      items: [],
      seenSiglas: 'basura',
      alerts: [
        { ticker: 'NVDA', belowPrice: 150 },
        { ticker: 'NVDA', dropPct: 5 },
        { ticker: 'MU', belowPrice: -2 },
        { ticker: 'MU' },
        { ticker: '', belowPrice: 10 },
        42,
      ],
    });
    expect(out?.seenSiglas).toBeUndefined();
    expect(out?.alerts).toEqual([{ ticker: 'NVDA', belowPrice: 150 }]);
  });

  it('sin campos nuevos, la salida es la de siempre (retrocompatible)', () => {
    const out = sanitizeWatchlist({
      items: [{ symbol: 'NASDAQ:GOOG', ticker: 'GOOG', group: 'ACCIONES' }],
    });
    expect(out).toEqual({
      items: [{ symbol: 'NASDAQ:GOOG', ticker: 'GOOG', group: 'ACCIONES' }],
    });
  });
});
