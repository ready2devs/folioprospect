import { describe, expect, it } from 'vitest';
import {
  computeOpportunity,
  consensusTag,
  labelForScore,
  scoreFor,
  starsFor,
} from '../opportunity.js';
import {
  fmtIsoDateEs,
  seedOpportunityForm,
} from '../../../src/components/asset/opportunitySeed';
import type { AssetDetailResponse } from '../../../src/api';

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

describe('fmtIsoDateEs', () => {
  it('formatea fechas ISO válidas en español', () => {
    expect(fmtIsoDateEs('1999-01-22')).toBe('22 ene 1999');
    expect(fmtIsoDateEs('2004-08-19')).toBe('19 ago 2004');
  });

  it('retorna string vacío ante entradas inválidas o nulas', () => {
    expect(fmtIsoDateEs(null)).toBe('');
    expect(fmtIsoDateEs(undefined)).toBe('');
    expect(fmtIsoDateEs('')).toBe('');
    expect(fmtIsoDateEs('invalida')).toBe('');
    expect(fmtIsoDateEs('1999-13-01')).toBe('');
    expect(fmtIsoDateEs('1999-00-01')).toBe('');
    expect(fmtIsoDateEs('1999-01-32')).toBe('');
  });
});

describe('seedOpportunityForm', () => {
  it('precarga datos desde mock de AssetDetailResponse para activo genérico (NVDA)', () => {
    const mockDetail = {
      symbol: 'NVDA',
      meta: {
        ticker: 'NVDA',
        name: 'NVIDIA Corporation',
        exchange: 'NASDAQ',
        sector: 'Technology',
        industry: 'Semiconductors',
        country: 'United States',
      },
      quote: {
        price: 130,
        name: 'NVIDIA Corporation',
      },
      fairValue: {
        fairValue: 140,
        moat: 'Wide',
        uncertainty: 'High',
      },
      extras: {
        foundedYear: 1993,
        ipoDate: '1999-01-22',
        grossMarginPct: 74.7,
        roicPct: 72.4,
        epsNext5YGrowthPct: 64.9,
        businessSummary: 'Descripción de prueba',
      },
    } as unknown as AssetDetailResponse;

    const res = seedOpportunityForm(mockDetail);
    expect(res.rFounded).toBe('1993');
    expect(res.rIpo).toBe('22 ene 1999');
    expect(res.core).toBe('Descripción de prueba');
    expect(res.edge).not.toBe('');
    expect(res.edge).toContain('Foso');
    expect(res.optionality).not.toBe('');
    expect(res.optionality).toContain('Base cuantitativa');
  });

  it('incluye aceleración de EPS, ventas y FCF yield en optionality cuando están disponibles', () => {
    const mockDetail = {
      symbol: 'MSFT',
      meta: {
        ticker: 'MSFT',
        name: 'Microsoft Corp',
        industry: 'Software',
      },
      quote: { price: 400 },
      fairValue: {
        fairValue: 450,
        moat: 'Wide',
      },
      extras: {
        finviz: {
          epsNext5YPct: 15.5,
          epsPast5YPct: 12.0,
          salesYoyTtmPct: 16.2,
        },
        fcfYieldPct: 3.5,
      },
    } as unknown as AssetDetailResponse;

    const res = seedOpportunityForm(mockDetail);
    expect(res.optionality).toContain('crecimiento esperado de EPS a 5 años de 15,5% anual (acelera frente al 12,0% histórico)');
    expect(res.optionality).toContain('ventas creciendo 16,2% interanual');
    expect(res.optionality).toContain('FCF Yield de 3,5% para financiar nuevas apuestas sin endeudarse');
  });

  it('deja optionality vacío si no hay métricas de crecimiento ni FCF', () => {
    const mockDetail = {
      symbol: 'TEST',
      meta: { ticker: 'TEST' },
      quote: { price: 50 },
    } as unknown as AssetDetailResponse;

    const res = seedOpportunityForm(mockDetail);
    expect(res.optionality).toBe('');
  });
});
