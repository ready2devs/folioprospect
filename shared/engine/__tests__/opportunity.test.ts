import { describe, expect, it } from 'vitest';
import {
  computeOpportunity,
  consensusTag,
  labelForScore,
  scoreFor,
  starsFor,
} from '../opportunity.js';

// Casos validados en el PMV del 21/10/2026 con ALB:
// FV propio por escenarios 94 / 157 / 225, incertidumbre Very High.
const ALB = {
  fvPesimista: 94,
  fvBase: 157,
  fvOptimista: 225,
  scenario: 'Base' as const,
  uncertainty: 'Very High' as const,
  yearsToCorrection: 3,
};

describe('Evaluación de oportunidad — bandas y puntaje (PMV)', () => {
  it('ALB hoy (US$93,77): upside +67,4%, 4★, 74/100, Oportunidad buena', () => {
    const r = computeOpportunity({ ...ALB, price: 93.77 });
    expect(r).not.toBeNull();
    expect(r!.upsidePct).toBeCloseTo(67.4, 0);
    expect(r!.stars).toBe(4);
    expect(r!.score).toBe(74);
    expect(r!.label).toBe('Oportunidad buena');
    expect(r!.starsRange).toEqual([3, 5]);
    expect(r!.annualizedPct).toBeCloseTo(18.7, 0);
  });

  it('ALB hace 3 semanas (US$109,73): 4★ pero puntaje 67/100', () => {
    const r = computeOpportunity({ ...ALB, price: 109.73 });
    expect(r!.stars).toBe(4);
    expect(r!.score).toBe(67);
    expect(r!.upsidePct).toBeCloseTo(43.1, 0);
  });

  it('con incertidumbre Low el mismo precio da 5★ (banda Low, ratio 0,597)', () => {
    const r = computeOpportunity({ ...ALB, price: 93.77, uncertainty: 'Low' });
    expect(r!.stars).toBe(5);
    expect(r!.score).toBe(85);
    expect(r!.label).toBe('Oportunidad alta');
  });

  it('veredicto ALB: COMPRAR de a poco (base +67%, pesimista sin colchón)', () => {
    const r = computeOpportunity({ ...ALB, price: 93.77 });
    expect(r!.verdict).toBe('COMPRAR (de a poco, no todo junto)');
    expect(r!.verdictNote).toBe('Si ya la tenés: MANTENER.');
  });

  it('compra fuerte si hasta el pesimista deja más de +20%', () => {
    const r = computeOpportunity({ ...ALB, price: 70 });
    expect(r!.verdict).toBe('COMPRA FUERTE');
  });

  it('vender si el precio supera al Fair Value base por más de 10%', () => {
    const r = computeOpportunity({ ...ALB, price: 180 });
    expect(r!.verdict).toBe('VENDER');
  });

  it('sin precio o sin Fair Value no calcula', () => {
    expect(computeOpportunity({ ...ALB, price: 0 })).toBeNull();
    expect(computeOpportunity({ ...ALB, price: 93.77, fvBase: 0 })).toBeNull();
  });

  it('bandas: extremos de la tabla Very High', () => {
    expect(starsFor(0.5, 'Very High')).toBe(5);
    expect(starsFor(0.51, 'Very High')).toBe(4);
    expect(starsFor(0.8, 'Very High')).toBe(4);
    expect(starsFor(1.25, 'Very High')).toBe(3);
    expect(starsFor(1.76, 'Very High')).toBe(1);
    expect(scoreFor(93.77 / 157, 'Very High')).toBe(74);
    expect(labelForScore(74)).toBe('Oportunidad buena');
  });

  it('consenso: etiqueta por conteo', () => {
    expect(consensusTag(12, 6, 0)).toBe('Comprar');
    expect(consensusTag(0, 6, 12)).toBe('Vender');
    expect(consensusTag(5, 6, 4)).toBe('Neutral');
  });
});
