import { describe, it, expect } from 'vitest';
import {
  normalizeTradingViewSymbol,
  searchLocalCatalog,
  findCatalogEntry,
} from '../symbolCatalog.js';

describe('symbolCatalog — activos poco conocidos (regresión ONTO, 2026-11-02)', () => {
  it('ONTO se normaliza a NYSE:ONTO (cotiza en NYSE, no en NASDAQ)', () => {
    expect(normalizeTradingViewSymbol('ONTO')).toBe('NYSE:ONTO');
    expect(normalizeTradingViewSymbol('onto')).toBe('NYSE:ONTO');
    expect(normalizeTradingViewSymbol('Onto')).toBe('NYSE:ONTO');
  });

  it('corrige la bolsa si el usuario escribe NASDAQ:ONTO', () => {
    expect(normalizeTradingViewSymbol('NASDAQ:ONTO')).toBe('NYSE:ONTO');
  });

  it('ONTO se encuentra por ticker y por nombre de empresa', () => {
    const byTicker = searchLocalCatalog('ONTO', {}, new Set());
    expect(byTicker[0]?.symbol).toBe('NYSE:ONTO');
    expect(byTicker[0]?.name).toBe('Onto Innovation Inc.');

    const byName = searchLocalCatalog('Onto', {}, new Set());
    expect(byName.some((e) => e.symbol === 'NYSE:ONTO')).toBe(true);

    const byFullName = searchLocalCatalog('onto innovation', {}, new Set());
    expect(byFullName.some((e) => e.symbol === 'NYSE:ONTO')).toBe(true);
  });

  it('la shortlist multibagger del usuario está en el catálogo local', () => {
    expect(findCatalogEntry('UCTT')?.symbol).toBe('NASDAQ:UCTT');
    expect(findCatalogEntry('APLD')?.symbol).toBe('NASDAQ:APLD');
    expect(findCatalogEntry('LEU')?.symbol).toBe('AMEX:LEU');
    expect(findCatalogEntry('VIAV')?.symbol).toBe('NASDAQ:VIAV');
    expect(searchLocalCatalog('centrus', {}, new Set())[0]?.symbol).toBe('AMEX:LEU');
    expect(searchLocalCatalog('viavi', {}, new Set())[0]?.symbol).toBe('NASDAQ:VIAV');
  });

  it('no rompe los símbolos de siempre', () => {
    expect(normalizeTradingViewSymbol('NVDA')).toBe('NASDAQ:NVDA');
    expect(normalizeTradingViewSymbol('TSM')).toBe('NYSE:TSM');
    expect(normalizeTradingViewSymbol('SPY')).toBe('AMEX:SPY');
    expect(normalizeTradingViewSymbol('SOL')).toBe('BINANCE:SOLUSDT');
    expect(searchLocalCatalog('NVDA', {}, new Set())[0]?.symbol).toBe('NASDAQ:NVDA');
  });
});
