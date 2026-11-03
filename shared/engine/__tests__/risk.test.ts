/**
 * Módulo único de riesgo (consolidación 2026-11-03; medición
 * refinada en R14): la matriz se construye desde fixtures de
 * precios; la medición es A LA BAJA (días en que la cartera
 * cae) y ponderada EWMA (λ=0,94), con shrinkage de la muestra
 * efectiva hacia los priors de bloque; respaldo sin historia;
 * Euler idéntico con matriz dada (con reparación espectral si
 * la matriz por pares no es SDP); y el test de consistencia
 * obligatorio: la volatilidad y el aporte que muestran el
 * gráfico y la ficha (campos del payload) son numéricamente los
 * mismos que alimentaron el sub-índice de certeza.
 */
import { describe, expect, it } from 'vitest';
import {
  buildConditioning,
  buildRiskMatrix,
  downsideVolPct,
  effectiveSampleSize,
  EWMA_LAMBDA,
  jacobiEigen,
  minEigenvalue,
  pairCorrelation,
  repairCorrelationMatrix,
  volForSpec,
  type DatedClose,
  type RiskAssetSpec,
} from '../riskMatrix';
import { optimizePortfolio, type OptimizerAssetInput } from '../optimizer';

const DAY = 86_400_000;

/** Serie de cierres desde retornos logarítmicos dados. */
function closesFromReturns(rets: number[], start = 100): DatedClose[] {
  let price = start;
  const out: DatedClose[] = [{ t: 0, c: price }];
  rets.forEach((r, i) => {
    price *= Math.exp(r);
    out.push({ t: (i + 1) * DAY, c: price });
  });
  return out;
}

/** Retornos alternados ±amp (volatilidad conocida). */
function alternatingReturns(n: number, amp: number): number[] {
  return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? amp : -amp));
}

/** Random determinístico (LCG) para fixtures estables. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
}

describe('módulo de riesgo — medición A LA BAJA desde precios (R14)', () => {
  /** Ciclo de retornos de A: [+3, −3, +3, −7]% — en los días de
   *  baja de la cartera (con B = −1% constante, la canasta cae
   *  cuando A < +1%) los retornos de A son −3% y −7%: desvío
   *  ≈ 2% ⇒ desviación a la baja ≈ 31,7% anual, contra ~67%
   *  simétrica: la baja es naturalmente menor (otra regla). */
  const cycleA = Array.from({ length: 120 }, (_, i) => [0.03, -0.03, 0.03, -0.07][i % 4]);
  const dragB = Array.from({ length: 120 }, () => -0.01);

  it('desviación a la baja: dispersión SOLO en los días en que la cartera cae', () => {
    const specA: RiskAssetSpec = { key: 'A', closes: closesFromReturns(cycleA) };
    const specB: RiskAssetSpec = { key: 'B', closes: closesFromReturns(dragB) };
    const cond = buildConditioning([specA, specB]);
    expect(cond.downDays.size).toBe(60); // la mitad del ciclo
    const vol = downsideVolPct(specA.closes, cond);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(29);
    expect(vol!).toBeLessThan(34);
    // B es constante: sin dispersión en ningún día → no se mide.
    expect(downsideVolPct(specB.closes, cond)).toBeNull();
  });

  it('con menos de 60 cierres no se mide: null', () => {
    const cond = buildConditioning([{ key: 'A', closes: closesFromReturns(cycleA) }]);
    expect(downsideVolPct(closesFromReturns(alternatingReturns(30, 0.02)), cond)).toBeNull();
    expect(downsideVolPct(null, cond)).toBeNull();
    expect(downsideVolPct(undefined, cond)).toBeNull();
  });

  it('sin días de baja no hay medición (cartera que solo sube)', () => {
    const up = closesFromReturns(Array.from({ length: 120 }, () => 0.01));
    const cond = buildConditioning([{ key: 'A', closes: up }]);
    expect(cond.downDays.size).toBe(0);
    expect(downsideVolPct(up, cond)).toBeNull();
  });

  it('correlación de una serie consigo misma: medida 1, encogida hacia el prior por muestra efectiva', () => {
    const rnd = lcg(42);
    const closes = closesFromReturns(Array.from({ length: 251 }, () => rnd() * 0.06));
    const spec: RiskAssetSpec = { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes };
    const twin: RiskAssetSpec = { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes };
    const d = pairCorrelation(spec, twin);
    expect(d.measured).toBeCloseTo(1, 6);
    expect(d.overlapDays).toBeGreaterThan(20);
    expect(d.overlapDays).toBeLessThan(251); // solo cuentan los días de baja
    expect(d.effectiveDays).toBeGreaterThan(0);
    expect(d.effectiveDays).toBeLessThanOrEqual(32.4); // techo EWMA λ=0,94
    const w = d.effectiveDays / (d.effectiveDays + 60);
    expect(d.rho).toBeCloseTo(w * 1 + (1 - w) * 0.65, 6);
    expect(d.prior).toBe(0.65);
  });

  it('series inversas entre sí (con una canasta que sí cae): la medida es −1', () => {
    const rndA = lcg(7);
    const retsA = Array.from({ length: 251 }, () => rndA() * 0.06);
    const retsB = retsA.map((r) => -r);
    const rndC = lcg(99);
    const retsC = Array.from({ length: 251 }, () => rndC() * 0.06);
    const specA: RiskAssetSpec = { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: closesFromReturns(retsA) };
    const specB: RiskAssetSpec = { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes: closesFromReturns(retsB) };
    const specC: RiskAssetSpec = { key: 'C', sector: 'Energy', industry: 'Oil & Gas', closes: closesFromReturns(retsC) };
    // Canasta A+B+C: A y B se cancelan → los días de baja son los de C.
    const cond = buildConditioning([specA, specB, specC]);
    const d = pairCorrelation(specA, specB, cond);
    expect(d.measured).toBeCloseTo(-1, 6);
    const w = d.effectiveDays / (d.effectiveDays + 60);
    expect(d.rho).toBeCloseTo(w * -1 + (1 - w) * 0.65, 6);
  });

  it('solape de baja corto (< 20 días) o sin historia: manda el prior, sin medir', () => {
    const long = closesFromReturns(alternatingReturns(251, 0.02));
    const short = closesFromReturns(alternatingReturns(10, 0.02));
    const dShort = pairCorrelation(
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: long },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes: short }
    );
    expect(dShort.measured).toBeNull();
    expect(dShort.rho).toBe(0.65);
    const dNone = pairCorrelation(
      { key: 'A', sector: 'Technology', industry: 'Semiconductors' },
      { key: 'B', sector: 'Energy', industry: 'Oil & Gas' }
    );
    expect(dNone.rho).toBe(0.45);
    expect(dNone.measured).toBeNull();
  });

  it('priors de bloque: industria 0,65 · sector 0,55 · resto 0,45 · cripto 0,70/0,25 · caja 0', () => {
    const m = buildRiskMatrix([
      { key: 'A', sector: 'Technology', industry: 'Semiconductors' },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors' },
      { key: 'C', sector: 'Technology', industry: 'Software' },
      { key: 'D', sector: 'Energy', industry: 'Oil & Gas' },
      { key: 'E', sector: 'Crypto', isCrypto: true },
      { key: 'F', sector: 'Crypto', isCrypto: true },
      { key: 'G', isCash: true },
    ]);
    expect(m.correlation('A', 'B')).toBe(0.65);
    expect(m.correlation('A', 'C')).toBe(0.55);
    expect(m.correlation('A', 'D')).toBe(0.45);
    expect(m.correlation('E', 'F')).toBe(0.7);
    expect(m.correlation('E', 'A')).toBe(0.25);
    expect(m.correlation('G', 'A')).toBe(0);
    expect(m.correlation('A', 'A')).toBe(1);
  });
});

describe('módulo de riesgo — cadena de volatilidad (única)', () => {
  it('caja 0, medida a la baja manda, respaldo Finviz, beta × 22, cripto 60, default 26', () => {
    // Ciclo con dispersión en sus propios días de baja (autocondicionamiento):
    // días negativos −3%/−7% alternados ⇒ desviación a la baja ≈ 31,7%.
    const cycle = Array.from({ length: 240 }, (_, i) => [0.03, -0.03, 0.03, -0.07][i % 4]);
    const closes = closesFromReturns(cycle);
    expect(volForSpec({ key: 'X', isCash: true, closes })).toBe(0);
    const measured = volForSpec({ key: 'X', closes, fallbackVolPct: 99, beta: 3 });
    expect(measured).toBeGreaterThan(29);
    expect(measured).toBeLessThan(34);
    expect(volForSpec({ key: 'X', fallbackVolPct: 33 })).toBe(33);
    expect(volForSpec({ key: 'X', beta: 1.5 })).toBe(33);
    expect(volForSpec({ key: 'X', beta: 10 })).toBe(90); // clamp
    expect(volForSpec({ key: 'X', isCrypto: true })).toBe(60);
    expect(volForSpec({ key: 'X' })).toBe(26);
  });
});

describe('módulo de riesgo — EWMA y reparación SDP (R14)', () => {
  it('la muestra efectiva de pesos iguales es n; con decaimiento λ=0,94 es menor y acotada', () => {
    expect(effectiveSampleSize([1, 1, 1, 1])).toBeCloseTo(4, 9);
    const decaying = Array.from({ length: 252 }, (_, i) => Math.pow(EWMA_LAMBDA, 251 - i));
    const nEff = effectiveSampleSize(decaying);
    expect(nEff).toBeLessThan(252);
    expect(nEff).toBeGreaterThan(28);
    expect(nEff).toBeLessThan(34); // (1+λ)/(1−λ) ≈ 32,3
  });

  it('los pesos EWMA del condicionamiento decaen con la edad: el día más reciente pesa 1', () => {
    const rnd = lcg(5);
    const closes = closesFromReturns(Array.from({ length: 100 }, () => rnd() * 0.04));
    const cond = buildConditioning([{ key: 'A', closes }]);
    const days = [...cond.dayWeight.keys()].sort((a, b) => a - b);
    expect(cond.dayWeight.get(days[days.length - 1])).toBe(1);
    expect(cond.dayWeight.get(days[0])).toBeCloseTo(Math.pow(EWMA_LAMBDA, days.length - 1), 9);
    const ws = days.map((d) => cond.dayWeight.get(d)!);
    for (let i = 1; i < ws.length; i++) expect(ws[i]).toBeGreaterThan(ws[i - 1]);
  });

  it('jacobiEigen recupera los autovalores de una matriz conocida', () => {
    const { values } = jacobiEigen([
      [2, 0],
      [0, 3],
    ]);
    expect(Math.min(...values)).toBeCloseTo(2, 9);
    expect(Math.max(...values)).toBeCloseTo(3, 9);
    const m = [
      [1, 0.9, 0.9],
      [0.9, 1, -0.5],
      [0.9, -0.5, 1],
    ];
    expect(minEigenvalue(m)).toBeLessThan(0); // no es SDP
  });

  it('repairCorrelationMatrix: la reparada es SDP, con diagonal 1 y cerca de la original', () => {
    const bad = [
      [1, 0.9, 0.9],
      [0.9, 1, -0.5],
      [0.9, -0.5, 1],
    ];
    const { matrix, repaired } = repairCorrelationMatrix(bad);
    expect(repaired).toBe(true);
    expect(minEigenvalue(matrix)).toBeGreaterThanOrEqual(-1e-9);
    for (let i = 0; i < 3; i++) expect(matrix[i][i]).toBe(1);
    // Una matriz ya válida no se toca.
    const good = [
      [1, 0.3],
      [0.3, 1],
    ];
    const untouched = repairCorrelationMatrix(good);
    expect(untouched.repaired).toBe(false);
    expect(untouched.matrix).toBe(good);
  });

  it('fixtures adversos: un solo día de baja o sin días conjuntos → prior puro, sin NaN, y Euler no rompe', () => {
    // Cartera casi siempre alcista: un único día de baja en 120.
    const retsUp = Array.from({ length: 120 }, (_, i) => (i === 60 ? -0.05 : 0.008));
    const retsUp2 = Array.from({ length: 120 }, (_, i) => (i === 60 ? -0.04 : 0.006));
    const m = buildRiskMatrix([
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: closesFromReturns(retsUp) },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes: closesFromReturns(retsUp2) },
    ]);
    expect(m.downDaysCount).toBe(1);
    const d = m.pairDetail('A', 'B');
    expect(d.measured).toBeNull(); // 1 día conjunto < 20 → prior
    expect(d.rho).toBe(0.65);
    const dec = m.decompose([
      { key: 'A', weight: 0.5 },
      { key: 'B', weight: 0.5 },
    ]);
    expect(Number.isFinite(dec.portfolioVolPct)).toBe(true);
    expect(dec.portfolioVolPct).toBeGreaterThanOrEqual(0);
    // Un activo sin NINGÚN día de baja conjunto con otro (historias disjuntas):
    const early = closesFromReturns(alternatingReturns(60, 0.02));
    const lateCloses: DatedClose[] = closesFromReturns(alternatingReturns(60, 0.02)).map((p) => ({
      t: p.t + 500 * DAY,
      c: p.c,
    }));
    const m2 = buildRiskMatrix([
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: early },
      { key: 'B', sector: 'Energy', industry: 'Oil & Gas', closes: lateCloses },
    ]);
    const d2 = m2.pairDetail('A', 'B');
    expect(d2.measured).toBeNull();
    expect(d2.rho).toBe(0.45); // prior «resto» — comportamiento sin historia, intacto
  });
});

describe('módulo de riesgo — Euler desde la matriz', () => {
  it('dos activos, priors puros: valores a mano e identidades de Euler', () => {
    const m = buildRiskMatrix([
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', fallbackVolPct: 20 },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', fallbackVolPct: 40 },
    ]);
    const d = m.decompose([
      { key: 'A', weight: 0.5 },
      { key: 'B', weight: 0.5 },
    ]);
    // A mano: σw_A = 0,046 · σw_B = 0,106 · varP = 0,076
    expect(d.portfolioVolPct).toBeCloseTo(27.57, 1);
    expect(d.mctrPct.get('A')).toBeCloseTo(16.69, 1);
    expect(d.mctrPct.get('B')).toBeCloseTo(38.45, 1);
    expect(d.pctrPct.get('A')).toBeCloseTo(30.26, 1);
    expect(d.pctrPct.get('B')).toBeCloseTo(69.74, 1);
    // Identidades: Σ PCTR = 100 · Σ w·MCTR = σ de cartera
    expect(d.pctrPct.get('A')! + d.pctrPct.get('B')!).toBeCloseTo(100, 6);
    expect(0.5 * d.mctrPct.get('A')! + 0.5 * d.mctrPct.get('B')!).toBeCloseTo(d.portfolioVolPct, 6);
  });

  it('con correlaciones medidas, la volatilidad de cartera se mueve respecto del prior', () => {
    const factor = Array.from({ length: 251 }, (_, i) => Math.sin(i / 9) * 0.012);
    const mk = (seed: number) => {
      const rnd = lcg(seed);
      return closesFromReturns(factor.map((f) => f + rnd() * 0.004));
    };
    const specs: RiskAssetSpec[] = [
      { key: 'A', sector: 'Technology', industry: 'Semiconductors', closes: mk(7) },
      { key: 'B', sector: 'Technology', industry: 'Semiconductors', closes: mk(13) },
    ];
    const measured = buildRiskMatrix(specs);
    const priorsOnly = buildRiskMatrix(specs.map((s) => ({ ...s, closes: null })));
    const entries = [
      { key: 'A', weight: 0.5 },
      { key: 'B', weight: 0.5 },
    ];
    const rho = measured.pairDetail('A', 'B');
    expect(rho.measured).not.toBeNull();
    expect(rho.measured!).toBeGreaterThan(0.8); // factor común fuerte
    // A igual volatilidad por activo, más correlación ⇒ más riesgo total
    const sameVols = (mx: ReturnType<typeof buildRiskMatrix>) =>
      mx.decompose(entries.map((e) => ({ ...e, volPct: 30 }))).portfolioVolPct;
    expect(sameVols(measured)).toBeGreaterThan(sameVols(priorsOnly));
  });
});

describe('consistencia score ↔ gráfico ↔ ficha (mismo payload, mismos campos)', () => {
  const OPTS = {
    sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
    maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
  } as const;

  it('la volatilidad del payload es la medida del módulo y el componente de riesgo del score sale de esos mismos campos', () => {
    const factor = Array.from({ length: 251 }, (_, i) => Math.sin(i / 9) * 0.012);
    const mkCloses = (seed: number, amp: number) => {
      const rnd = lcg(seed);
      return closesFromReturns(factor.map((f) => f * amp + rnd() * 0.006));
    };
    const mk = (ticker: string, seed: number, amp: number, value: number): OptimizerAssetInput => ({
      symbol: `NASDAQ:${ticker}`, ticker, name: ticker, sector: 'Technology',
      industry: 'Semiconductors', price: 100, qty: value / 100, value,
      fvBase: 200, fvConfidence: 'Media', fvComponentCount: 2,
      earningsGrowthTotalPct: 10, analystTarget: 150, salesGrowthPct: 20,
      priceHistory: mkCloses(seed, amp),
    });
    const inputs = [mk('AAA', 7, 1, 5000), mk('BBB', 13, 1, 3000), mk('CCC', 29, 0.2, 2000)];
    const result = optimizePortfolio(inputs, OPTS);
    const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
    // La matriz del pase, reconstruida como la arma el motor:
    // canasta = las posiciones con su peso en la cartera.
    const total = inputs.reduce((s, a) => s + a.value, 0);
    const matrix = buildRiskMatrix(
      inputs.map((a) => ({
        key: a.symbol, sector: a.sector, industry: a.industry,
        closes: a.priceHistory ?? null, basketWeight: a.value / total,
      }))
    );
    for (const input of inputs) {
      const a = result.assets.find((x) => x.symbol === input.symbol)!;
      // (1) La volatilidad que muestra el payload ES la medida del
      // módulo: la desviación A LA BAJA bajo el condicionamiento
      // compartido de la cartera (R14).
      expect(a.volatilityPct).toBeCloseTo(
        downsideVolPct(input.priceHistory, matrix.conditioning)!,
        6
      );
      // (2) El gráfico y la ficha leen mctrPct/riskContributionPct del
      // mismo payload; el componente de riesgo de la CERTEZA se
      // recomputa desde ESOS campos con la fórmula documentada y
      // coincide. Desde R13 la composición es MARGINAL-PRIMERO:
      // aporte relativo (PCTR/peso) 40% + riesgo marginal (MCTR
      // contra la volatilidad de la cartera) 35% + volatilidad 25%.
      expect(a.mctrPct).not.toBeNull();
      expect(a.riskContributionPct).not.toBeNull();
      const volScore = clamp(100 - Math.max(0, a.volatilityPct - 12) * 2, 0, 100);
      const relScore = clamp(120 - 40 * (a.riskContributionPct! / a.weightPct), 0, 100);
      const mctrScore = clamp(120 - 60 * (a.mctrPct! / result.before.volatilityPct), 0, 100);
      const expectedRisk = Math.round(0.4 * relScore + 0.35 * mctrScore + 0.25 * volScore);
      expect(a.certaintyComponents?.risk).toBe(expectedRisk);
      expect(a.certaintyScore).not.toBeNull();
      expect(a.score).not.toBeNull();
    }
    // (3) La descomposición del resultado suma: Σ PCTR ≈ 100.
    const totalPctr = result.assets.reduce((s, a) => s + (a.riskContributionPct ?? 0), 0);
    expect(totalPctr).toBeCloseTo(100, 4);
  });
});
