import { describe, it, expect } from 'vitest';
import {
  grinoldKroner,
  consensusPct,
  fvConvergencePct,
  scoreAsset,
  RE_SANITY_CLAMP_PCT,
  type OptimizerAssetInput,
} from '../optimizer.js';

/**
 * Capa de RE tras R11 (docs/OPTIMIZER-PROFESSIONAL.md, adenda R11):
 * la convergencia usa el FV TAL COMO SE PUBLICA — sin shrinkage por
 * confianza, sin piso del rango bajo sospecha, sin penalización por
 * desacuerdo de signo: confianza, sospecha y desacuerdo son
 * ETIQUETAS que no tocan ningún número. Y sin topes sobre las
 * estimaciones: el consenso y la convergencia entran a valor facial
 * y el único clamp es el anti-basura final [−50%, +80%].
 * Fixtures sintéticos derivados de las reglas: el motor no conoce
 * tickers.
 */
const SCORE_OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX',
  ticker: 'XXX',
  name: 'Test Co',
  sector: 'Technology',
  industry: 'Semiconductors',
  price: 100,
  qty: 10,
  value: 1000,
  ...p,
});

describe('convergencia sin shrinkage (R11: el FV publicado manda)', () => {
  const mk = (extra: Partial<OptimizerAssetInput>) =>
    base({
      price: 100, fvBase: 450, fvRangeLow: 150, fvRangeHigh: 900,
      fvComponentCount: 2, earningsGrowthTotalPct: 10, analystTarget: 150,
      volatilityPct: 30, roicPct: 15,
      ...extra,
    });

  it('un activo Baja con rango ancho converge al FV completo (450), no a un encogido ni al piso', () => {
    const a = scoreAsset(mk({ fvConfidence: 'Baja' }), 1000, SCORE_OPTS);
    expect(a.modelSuspect).toBe(false);
    expect(a.conservativeConvergence).toBe(false);
    expect(a.fvEffective).toBe(450);
    expect(a.fvRaw).toBe(450);
    expect(a.fvConvergencePct!).toBeCloseTo((Math.pow(4.5, 1 / 3) - 1) * 100, 4);
  });

  it('el mismo activo marcado sospechoso converge IGUAL: la sospecha es etiqueta, no convergencia al piso', () => {
    const a = scoreAsset(mk({ fvConfidence: 'Baja', fvModelSuspect: true }), 1000, SCORE_OPTS);
    expect(a.modelSuspect).toBe(true);
    expect(a.conservativeConvergence).toBe(false);
    expect(a.fvEffective).toBe(450);
    expect(a.fvConvergencePct!).toBeCloseTo((Math.pow(4.5, 1 / 3) - 1) * 100, 4);
  });

  it('Alta, Media y Baja producen la MISMA convergencia con la misma valuación', () => {
    const conv = (c: 'Alta' | 'Media' | 'Baja') =>
      scoreAsset(mk({ fvConfidence: c }), 1000, SCORE_OPTS).fvConvergencePct!;
    const expected = (Math.pow(4.5, 1 / 3) - 1) * 100;
    expect(conv('Alta')).toBeCloseTo(expected, 4);
    expect(conv('Media')).toBeCloseTo(expected, 4);
    expect(conv('Baja')).toBeCloseTo(expected, 4);
  });
});

describe('sin topes sobre las estimaciones (corrección 2026-11-03, §15 — vigente)', () => {
  // Blend deliberadamente caliente: GK 40 (div 5 + recompra 5 +
  // crecimiento 30 a valor facial), convergencia al FV publicado y
  // consenso +200% (target 3× precio) sin recorte.
  const hot = (fvConfidence: 'Alta' | 'Media' | 'Baja', fvBase = 450) =>
    base({
      price: 100, fvBase, fvConfidence, fvRangeLow: 440, fvComponentCount: 2,
      dividendYieldPct: 5, dilutionPct: -5, earningsGrowthTotalPct: 30,
      analystTarget: 300, volatilityPct: 30, roicPct: 15,
    });

  it('el consenso entra a valor facial: +200% y −60%, sin techo ni piso', () => {
    expect(consensusPct(base({ price: 100, analystTarget: 300 }))).toBe(200);
    expect(consensusPct(base({ price: 100, analystTarget: 40 }))).toBe(-60);
  });

  it('la convergencia entra a valor facial: CAGR 51,2% sin el clamp histórico', () => {
    expect(fvConvergencePct(base({ price: 100, fvBase: 345 }), 3)).toBeCloseTo(
      (Math.pow(3.45, 1 / 3) - 1) * 100, 4
    );
  });

  it('el RE ya no se recorta a +25% — el blend manda (~76,1%)', () => {
    const a = scoreAsset(hot('Baja', 350), 1000, SCORE_OPTS);
    // 0,45×40 + 0,35×51,83 (convergencia al FV 350 publicado) + 0,20×200.
    expect(a.expectedReturnPct!).toBeCloseTo(76.14, 1);
    expect(a.expectedReturnPct!).toBeGreaterThan(60);
    expect(a.yearsToDouble!).toBeCloseTo(Math.LN2 / Math.log(1.7614), 2);
  });

  it('Media y Baja dan el MISMO RE con la misma valuación (la etiqueta no diferencia números)', () => {
    const media = scoreAsset(hot('Media', 350), 1000, SCORE_OPTS);
    const baja = scoreAsset(hot('Baja', 350), 1000, SCORE_OPTS);
    expect(media.expectedReturnPct!).toBeCloseTo(baja.expectedReturnPct!, 6);
    expect(media.fvConvergencePct!).toBeCloseTo(baja.fvConvergencePct!, 6);
  });

  it('Alta: solo el clamp anti-basura final ata, y únicamente en un fixture fuera de todo caso real', () => {
    const a = scoreAsset(hot('Alta'), 1000, SCORE_OPTS);
    // Blend crudo 80,8% (0,45×40 + 0,35×65,10 + 0,20×200): el único
    // tope que existe, el anti-basura de +80%, es el que lo deja en 80.
    expect(a.expectedReturnPct).toBe(RE_SANITY_CLAMP_PCT.max);
  });

  it('el clamp anti-basura también acota el lado negativo (−50%)', () => {
    const a = scoreAsset(
      base({
        price: 100, fvBase: 1, fvConfidence: 'Alta', fvComponentCount: 2,
        earningsGrowthTotalPct: -30, analystTarget: 1, volatilityPct: 30,
      }),
      1000, SCORE_OPTS
    );
    // GK −30 + convergencia −78,5 (FV = 1% del precio) + consenso −99
    // → blend crudo −60,8% → −50.
    expect(a.expectedReturnPct).toBe(RE_SANITY_CLAMP_PCT.min);
  });
});

describe('desacuerdo de signo en el EPS: etiqueta informativa, sin efecto en números (R11)', () => {
  it('GK usa el crecimiento de EPS igual que sin desacuerdo (la penalización salió del motor)', () => {
    // Mismos inputs con y sin el flag ⇒ mismo GK.
    const withFlag = grinoldKroner(
      base({ epsSignDisagreement: true, epsNextYearPct: 40, epsNext5YPct: 40, salesGrowthPct: 10 })
    );
    const without = grinoldKroner(base({ epsNextYearPct: 40, epsNext5YPct: 40, salesGrowthPct: 10 }));
    expect(withFlag).toBeCloseTo(without!, 5);
    expect(withFlag).toBeCloseTo(40, 5);
    expect(
      grinoldKroner(base({ epsSignDisagreement: true, epsNextYearPct: 40, dividendYieldPct: 2, dilutionPct: -1 }))
    ).toBeCloseTo(43, 5);
  });

  it('un Media con desacuerdo de signo converge y rinde EXACTAMENTE como el mismo Media sin desacuerdo', () => {
    const mk = (epsSignDisagreement: boolean) =>
      base({
        price: 100, fvBase: 450, fvConfidence: 'Media', fvRangeLow: 150, fvRangeHigh: 900,
        fvComponentCount: 2, epsSignDisagreement,
        earningsGrowthTotalPct: 10, analystTarget: 150, volatilityPct: 30, roicPct: 15,
      });
    const a = scoreAsset(mk(true), 1000, SCORE_OPTS);
    const b = scoreAsset(mk(false), 1000, SCORE_OPTS);
    expect(a.epsSignDisagreement).toBe(true);
    expect(a.conservativeConvergence).toBe(false);
    // Convergencia al FV publicado (450): (4,5^(1/3) − 1) ≈ 65,10%.
    expect(a.fvConvergencePct!).toBeCloseTo((Math.pow(4.5, 1 / 3) - 1) * 100, 4);
    expect(a.fvConvergencePct!).toBeCloseTo(b.fvConvergencePct!, 6);
    expect(a.expectedReturnPct!).toBeCloseTo(b.expectedReturnPct!, 6);
    // La etiqueta pública de la valuación no se toca.
    expect(a.fvConfidence).toBe('Media');
    // RE sin topes: 0,45×GK 10 + 0,35×65,10 + 0,20×50 (consenso a
    // valor facial) ≈ 37,28.
    expect(a.expectedReturnPct!).toBeCloseTo(37.28, 1);
  });
});
