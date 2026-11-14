import { describe, expect, it } from 'vitest';
import { sanitizeSubPortfolios } from '../db.js';

// SPEC-005 v3: el sanitizador de NwSettings debe preservar la decisión del
// modal «Distribución por defecto» solo si viene como boolean.
const DEFS = [
  { id: 'nucleo', name: 'Núcleo', color: '#10b981' },
  { id: 'especulativa', name: 'Especulativas', color: '#8b5cf6' },
  { id: 'cripto', name: 'Cripto', color: '#f59e0b' },
];

describe('sanitizeSubPortfolios · campos v3 (defaults)', () => {
  it('preserva defaultsConfirmed y autoDefaults booleanos', () => {
    const out = sanitizeSubPortfolios({
      defs: DEFS,
      assignments: { 'NASDAQ:GOOG': 'nucleo' },
      defaultsConfirmed: true,
      autoDefaults: false,
    });
    expect(out?.defaultsConfirmed).toBe(true);
    expect(out?.autoDefaults).toBe(false);
    expect(out?.defs).toHaveLength(3);
    expect(out?.assignments).toEqual({ 'NASDAQ:GOOG': 'nucleo' });
  });

  it('descarta valores que no son boolean (quedan ausentes, no inventa)', () => {
    const out = sanitizeSubPortfolios({
      defs: DEFS,
      assignments: {},
      defaultsConfirmed: 'true',
      autoDefaults: 1,
    });
    expect(out?.defaultsConfirmed).toBeUndefined();
    expect(out?.autoDefaults).toBeUndefined();
  });

  it('sin los campos v3, la config sale sin ellos (base vieja)', () => {
    const out = sanitizeSubPortfolios({ defs: DEFS, assignments: {} });
    expect(out?.defaultsConfirmed).toBeUndefined();
    expect(out?.autoDefaults).toBeUndefined();
  });

  it('campo ausente → undefined; basura → config vacía sin campos v3', () => {
    expect(sanitizeSubPortfolios(undefined)).toBeUndefined();
    const out = sanitizeSubPortfolios('basura');
    expect(out).toEqual({ defs: [], assignments: {} });
  });
});
