import { describe, it, expect } from 'vitest';
import { computeFairValue } from '../fairvalue.js';
import { scoreAsset, type OptimizerAssetInput } from '../optimizer.js';

/**
 * Sistema forward simple (R11, método elegido por el usuario
 * 2026-11-03): FV = promedio del target de consenso y de la fórmula
 * EPS forward × múltiplo justificado. Estos tests fijan las
 * propiedades que el usuario exigió: ningún override sobre el
 * consenso forward (caso Micron), el target íntegro en su rango, el
 * PEG como orientador que no toca números, y el score dominado por
 * la capacidad de duplicar con ajustes acotados a ±15 puntos.
 */

describe('MU sin override de ciclo: la fórmula usa el EPS forward de consenso tal cual', () => {
  it('EPS forward extremo confirmado por tres fuentes: entra sin normalizar; el múltiplo sale de sus fundamentos', () => {
    const r = computeFairValue({
      symbol: 'TEST',
      currentPrice: 833.59,
      sharesOutstanding: 1.13e9,
      revenueGrowth: 0.5,
      earningsGrowth: 0.5,
      beta: 1.4,
      totalCash: 0,
      totalDebt: 0,
      // Consenso forward multifuente (primitiva de Yahoo 207,8;
      // Finviz 190; TradingView 175,6): la reparación promedia las
      // fuentes — NO existe ninguna «normalización de mitad de ciclo»
      // que lo reemplace por una historia (p. ej. un EPS de 30).
      forwardEps: 207.8,
      forwardEpsAlt: 190,
      forwardEpsAltSource: 'finviz',
      tvEpsForecastNextFy: 175.6,
      roicPct: 59.39,
      industryForwardPe: 21.64,
      sectorRoicPct: 27.53,
      sectorGrowth5yPct: 64.93,
      finvizEpsNext5YPct: 55,
      targetMeanPrice: 1600,
      targetHighPrice: 2100,
      targetLowPrice: 900,
      analystCount: 45,
    });
    const prov = r.fvProvenance?.find((p) => p.component === 'multiples');
    // El EPS usado es el del consenso reparado (mediana ~190), jamás
    // un EPS «de ciclo» inventado por el modelo.
    expect(prov?.usedValue).toBeGreaterThan(150);
    // El sector amplio (21,6×) más que duplica su P/E propio (~4,4×):
    // no comparable ⇒ múltiplo justificado por SUS fundamentos
    // (ROIC 59,4% ⇒ J ≈ 18,3×) y la pata sale de esos datos forward.
    expect(r.fvFlags).toContain('sectorNotComparable');
    expect(r.fvFlags).toContain('multipleBasis:fundamental');
    expect(r.multiplesValue!).toBeGreaterThan(3000);
    expect(r.multiplesValue!).toBeLessThan(3900);
    // Dos patas, sin convergencias ni pisos que deformen el promedio.
    expect(r.fvComponents).toHaveLength(2);
    expect(r.fairValue!).toBeGreaterThan(2000);
    // El target entra íntegro (1600, dentro de su rango [900, 2100]).
    expect(r.analystTarget).toBe(1600);
  });
});

describe('NBIS: el target entra sin recorte por debajo de su mínimo de consenso', () => {
  it('con la fórmula débil, el target del pool queda ≥ su low y el FV no se fabrica', () => {
    const r = computeFairValue({
      symbol: 'TEST',
      currentPrice: 141.39,
      sharesOutstanding: 1e8,
      revenueGrowth: 1.2,
      beta: 1.6,
      totalCash: 0,
      totalDebt: 0,
      forwardEps: -3.6, // primitiva negativa…
      forwardEpsAlt: 2.0, // …que la reparación resuelve con las otras fuentes
      forwardEpsAltSource: 'finviz',
      tvEpsForecastNextFy: 1.8,
      industryForwardPe: 52.45,
      targetMeanPrice: 283.86,
      targetHighPrice: 320,
      targetLowPrice: 210,
      analystCount: 20,
    });
    expect(r.analystTarget).toBeCloseTo(283.86, 2);
    const prov = r.fvProvenance?.find((p) => p.component === 'target');
    expect(prov?.usedValue).toBeCloseTo(283.86, 2);
    const targetFinal = (r.fvComponents ?? []).reduce((m, v) => (v >= 210 && v <= 320 ? v : m), 0);
    expect(targetFinal).toBeGreaterThanOrEqual(210);
    expect(r.fairValue).not.toBeNull();
  });
});

describe('PEG orientador: se calcula y se muestra, pero NO ajusta ningún número', () => {
  const fixture = (sectorGrowth5yPct: number) => ({
    symbol: 'TEST',
    currentPrice: 100,
    sharesOutstanding: 10,
    revenueGrowth: 0.1,
    beta: 1.0,
    totalCash: 0,
    totalDebt: 0,
    forwardEps: 4,
    forwardEpsAlt: 4,
    forwardEpsAltSource: 'finviz' as const,
    industryForwardPe: 30,
    roicPct: 15,
    sectorRoicPct: 15,
    sectorGrowth5yPct,
    finvizEpsNext5YPct: 2, // crecimiento de largo plazo bajo ⇒ PEG alto
    targetMeanPrice: 110,
    analystCount: 10,
  });

  it('PEG al precio, de la fórmula y del sector, con flag de revisión cuando la fórmula se dispara', () => {
    const r = computeFairValue(fixture(5));
    // P/E propio 25, crecimiento 2% ⇒ PEG precio 12,5. La fórmula:
    // J(empresa, g=2) = (1 − 2/15)/(0,10 − 0,02) = 10,83; J(sector,
    // g=5) = (1 − 5/15)/(0,10 − 0,05) = 13,33; ajuste 0,8125 ⇒
    // múltiplo 24,375 ⇒ PEG fórmula 24,375/2 ≈ 12,19. Sector:
    // 30/5 = 6 ⇒ 12,19 > 2×6: flag de revisión de datos.
    expect(r.pegAtPrice).toBeCloseTo(12.5, 1);
    expect(r.pegFormula).toBeCloseTo(12.19, 1);
    expect(r.pegSector).toBeCloseTo(6, 1);
    expect(r.fvFlags).toContain('pegFormulaOutlierVsSector');
    expect(r.multiplesValue!).toBeCloseTo(97.5, 1);
  });

  it('el flag de PEG no cambia el FV: el valor es el promedio ponderado de las dos patas, sin término de ajuste', () => {
    const r = computeFairValue(fixture(5));
    expect(r.fvFlags).toContain('pegFormulaOutlierVsSector');
    const w = r.fvComponentWeights ?? [];
    const legs = r.fvComponents ?? [];
    const recomposed = legs.reduce((acc, v, i) => acc + v * (w[i] ?? 0), 0);
    // Con el flag disparado y todo, el FV se recompone EXACTO desde
    // las patas y sus pesos: no hay descuento ni corrección por PEG.
    expect(r.fairValue!).toBeCloseTo(recomposed, 6);
    expect(r.fairValue!).toBeCloseTo(103.75, 1);
  });
});

describe('score dominado por la capacidad de duplicar (directiva 2026-11-03 04:34)', () => {
  const SCORE_OPTS = {
    sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
    maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
  } as const;
  const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
    symbol: 'NASDAQ:XXX', ticker: 'XXX', name: 'Test Co', sector: 'Technology',
    industry: 'Semiconductors', price: 100, qty: 10, value: 1000, ...p,
  });

  it('el ajuste vive en una banda de ±15 y el score es velocidad + ajuste', () => {
    const fast = scoreAsset(
      base({
        price: 100, fvBase: 220, fvConfidence: 'Baja', fvComponentCount: 2,
        earningsGrowthTotalPct: 30, analystTarget: 150,
        volatilityPct: 90, roicPct: 3, // peores ajustes posibles
      }),
      1000, SCORE_OPTS
    );
    expect(Math.abs(fast.scoreAdjustmentPts!)).toBeLessThanOrEqual(15);
    expect(fast.score!).toBe(
      Math.max(0, Math.min(100, Math.round(fast.scoreVelocity! + fast.scoreAdjustmentPts!)))
    );
    // Escala R12: este fixture (RE ≈ 34%) ya NO satura la velocidad —
    // con la recta nueva vale ≈ 66 (antes > 85 con la escala vieja,
    // que daba 100 a todo RE ≥ 35%). El 100 quedó excepcional.
    expect(fast.scoreVelocity!).toBeGreaterThan(60);
    expect(fast.scoreVelocity!).toBeLessThan(75);
  });

  it('una brecha de velocidad > 30 pts no se invierte ni con los peores/mejores ajustes', () => {
    // Fixture rápido reforzado para la escala R12: con la recta
    // nueva, una brecha de velocidad > 30 exige una brecha de RE de
    // ≳ 36 pp (acá: RE ≈ 50% contra ≈ 3%).
    const fast = scoreAsset(
      base({
        price: 100, fvBase: 320, fvConfidence: 'Baja', fvComponentCount: 2,
        earningsGrowthTotalPct: 30, analystTarget: 200,
        volatilityPct: 90, roicPct: 3,
      }),
      1000, SCORE_OPTS
    );
    const slow = scoreAsset(
      base({
        price: 100, fvBase: 110, fvConfidence: 'Alta', fvComponentCount: 2,
        earningsGrowthTotalPct: 2, analystTarget: 105,
        volatilityPct: 15, roicPct: 35, // mejores ajustes posibles
      }),
      1000, SCORE_OPTS
    );
    expect(fast.scoreVelocity! - slow.scoreVelocity!).toBeGreaterThan(30);
    // Ni el peor ajuste del rápido ni el mejor del lento invierten
    // el titular: el que duplica mucho más rápido puntúa más alto.
    expect(fast.score!).toBeGreaterThan(slow.score!);
    // Y el rápido no cae al tercio inferior del score (0–33).
    expect(fast.score!).toBeGreaterThan(33);
  });

  it('el driver del ajuste queda expuesto cuando el ajuste es notable (≥5 pts)', () => {
    const a = scoreAsset(
      base({
        price: 100, fvBase: 220, fvConfidence: 'Baja', fvComponentCount: 2,
        earningsGrowthTotalPct: 30, analystTarget: 150,
        volatilityPct: 90, roicPct: 3,
      }),
      1000, SCORE_OPTS
    );
    if (Math.abs(a.scoreAdjustmentPts!) >= 5) {
      expect(a.scoreAdjustmentDriver).toBeTruthy();
    }
    expect(a.scoreAdjustmentDriver === null || typeof a.scoreAdjustmentDriver === 'string').toBe(true);
  });
});
