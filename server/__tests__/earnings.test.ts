import { describe, it, expect } from 'vitest';
import { matchQuarter } from '../earnings.js';

describe('matchQuarter', () => {
  it('empareja correctamente formatos de trimestre de Nasdaq con fechas de Yahoo', () => {
    expect(matchQuarter('Sep/2026', '2026-09-30', '2026-10-28')).toBe(true);
    expect(matchQuarter('Sep 2026', '2026-09-30', '2026-10-28')).toBe(true);
    expect(matchQuarter('09/2026', '2026-09-30', '2026-10-28')).toBe(true);
    expect(matchQuarter('Jun/2026', '2026-06-30', '2026-07-29')).toBe(true);
    expect(matchQuarter('Dec/2025', '2025-12-31', '2026-01-28')).toBe(true);
    expect(matchQuarter('Mar/2026', '2026-03-31', '2026-04-29')).toBe(true);
  });

  it('no empareja trimestres diferentes', () => {
    expect(matchQuarter('Sep/2026', '2026-06-30', '2026-10-28')).toBe(false);
    expect(matchQuarter('Jun/2026', '2026-09-30', '2026-07-29')).toBe(false);
  });

  it('empareja por proximidad de fecha si el trimestre en Nasdaq está vacío', () => {
    expect(matchQuarter('', '2026-09-30', '2026-10-28')).toBe(true);
    expect(matchQuarter('', '2026-06-30', '2026-10-28')).toBe(false);
  });
});
