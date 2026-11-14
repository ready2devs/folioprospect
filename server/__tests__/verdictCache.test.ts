import { describe, expect, it } from 'vitest';
import { VerdictMemoryCache, VERDICT_CACHE_TTL_MS } from '../verdictCache.js';
import { normalizeDatabase } from '../db.js';

// SPEC-006, enmienda v10: la sigla de la watchlist ya no se sirve
// desde una caché persistida por día (podía contradecir a la ficha
// durante horas) sino desde esta caché en memoria de 15 min, la
// ventana del optimizador, alimentada por el mismo cálculo que la
// ficha.
describe('VerdictMemoryCache', () => {
  const T0 = 1_700_000_000_000;

  it('sin entrada → null', () => {
    const c = new VerdictMemoryCache();
    expect(c.get('NASDAQ:TMDX', T0)).toBeNull();
  });

  it('recién guardada → se sirve dentro de la ventana', () => {
    const c = new VerdictMemoryCache();
    c.set('NASDAQ:TMDX', { sigla: 'M', verdict: 'MANTENER' }, T0);
    expect(c.get('NASDAQ:TMDX', T0)).toEqual({ sigla: 'M', verdict: 'MANTENER' });
    expect(c.get('NASDAQ:TMDX', T0 + VERDICT_CACHE_TTL_MS - 1)).toEqual({
      sigla: 'M',
      verdict: 'MANTENER',
    });
  });

  it('al vencer la ventana → null y se poda', () => {
    const c = new VerdictMemoryCache();
    c.set('NASDAQ:TMDX', { sigla: 'M', verdict: 'MANTENER' }, T0);
    expect(c.get('NASDAQ:TMDX', T0 + VERDICT_CACHE_TTL_MS)).toBeNull();
    expect(c.size).toBe(0);
  });

  it('cada símbolo vence por su cuenta', () => {
    const c = new VerdictMemoryCache();
    c.set('NASDAQ:TMDX', { sigla: 'M', verdict: 'MANTENER' }, T0);
    c.set('NYSE:NU', { sigla: 'CF', verdict: 'COMPRA FUERTE' }, T0 + 10 * 60 * 1000);
    const later = T0 + VERDICT_CACHE_TTL_MS + 1;
    expect(c.get('NASDAQ:TMDX', later)).toBeNull();
    expect(c.get('NYSE:NU', later)).toEqual({ sigla: 'CF', verdict: 'COMPRA FUERTE' });
  });

  it('sobreescribir renueva la ventana y el valor', () => {
    const c = new VerdictMemoryCache();
    c.set('NASDAQ:TMDX', { sigla: 'V', verdict: 'VENDER' }, T0);
    c.set('NASDAQ:TMDX', { sigla: 'M', verdict: 'MANTENER' }, T0 + 14 * 60 * 1000);
    expect(c.get('NASDAQ:TMDX', T0 + VERDICT_CACHE_TTL_MS + 1)).toEqual({
      sigla: 'M',
      verdict: 'MANTENER',
    });
  });

  it('la sigla «—» sin veredicto también se cachea (cripto/ETF/sin FV)', () => {
    const c = new VerdictMemoryCache();
    c.set('AMEX:SPY', { sigla: '—', verdict: null }, T0);
    expect(c.get('AMEX:SPY', T0 + 1000)).toEqual({ sigla: '—', verdict: null });
  });

  it('TTL inyectable para tests y usos cortos', () => {
    const c = new VerdictMemoryCache(1000);
    c.set('NASDAQ:MU', { sigla: 'CF', verdict: 'COMPRA FUERTE' }, T0);
    expect(c.get('NASDAQ:MU', T0 + 999)).not.toBeNull();
    expect(c.get('NASDAQ:MU', T0 + 1000)).toBeNull();
  });
});

// La base persistida vieja traía `verdictCache`; al cargarla con el
// código nuevo el campo se descarta (no queda en el esquema ni se
// vuelve a guardar).
describe('normalizeDatabase sin verdictCache (enmienda v10)', () => {
  it('descarta el campo heredado y conserva el resto', () => {
    const legacy: any = {
      portfolios: [],
      assetMeta: {},
      updatedAt: '2026-11-14T00:00:00.000Z',
      tombstones: {},
      nwSettings: null,
      verdictCache: {
        'NASDAQ:TMDX': { sigla: 'V', verdict: 'VENDER', at: 1, day: '2026-11-14' },
      },
    };
    const out = normalizeDatabase(legacy);
    expect('verdictCache' in out).toBe(false);
    expect(out.portfolios).toEqual([]);
    expect(out.updatedAt).toBe('2026-11-14T00:00:00.000Z');
  });

  it('una base sin el campo queda intacta', () => {
    const clean: any = {
      portfolios: [],
      assetMeta: {},
      updatedAt: '2026-11-14T00:00:00.000Z',
      tombstones: {},
      nwSettings: null,
    };
    const out = normalizeDatabase(clean);
    expect('verdictCache' in out).toBe(false);
    expect(out.nwSettings).toBeNull();
  });
});
