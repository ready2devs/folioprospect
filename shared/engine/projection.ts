import type { ProjectionResult, ProjectionYearPoint } from './types.js';

export interface ProjectionParams {
  horizonYears?: number; // 10 or 20
  initialCapital: number;
  monthlyContribution?: number;
  baseCagrPct?: number; // e.g. 11.5
  annualVolatilityPct?: number; // e.g. 22
  inflationPct?: number; // e.g. 3.0
  convergeToFairValue?: boolean;
  portfolioPriceToFairValue?: number; // e.g. 0.86 (<1 means undervalued tailwind)
  simulations?: number; // default 1000
  startCalendarYear?: number;
}

// Deterministic mulberry32 PRNG + Box-Muller normal
function createRng(seed: number) {
  let a = seed >>> 0;
  return function nextGaussian(): number {
    const rand = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const u1 = Math.max(1e-9, rand());
    const u2 = rand();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

export function runPortfolioProjection(params: ProjectionParams): ProjectionResult {
  const horizonYears = Math.max(10, Math.min(30, params.horizonYears ?? 20));
  const initialCapital = Math.max(0, params.initialCapital);
  const monthlyContribution = params.monthlyContribution ?? 500;
  const baseCagrPct = params.baseCagrPct ?? 11.0;
  const annualVolatilityPct = Math.max(5, Math.min(60, params.annualVolatilityPct ?? 21.0));
  const inflationPct = params.inflationPct ?? 3.0;
  const convergeToFairValue = params.convergeToFairValue ?? true;
  const p2fv = params.portfolioPriceToFairValue ?? 0.88;
  const simulations = Math.max(200, Math.min(3000, params.simulations ?? 1000));
  const startYear = params.startCalendarYear ?? new Date().getFullYear();

  // Convergence annual boost during first 5 years if convergeToFairValue enabled
  const convAnnualBoost =
    convergeToFairValue && p2fv > 0.3 && p2fv < 2.0 ? Math.pow(1 / p2fv, 1 / 5) - 1 : 0;

  const baseRate = baseCagrPct / 100;
  const consRate = Math.max(0.01, baseRate - 0.04);
  const optRate = baseRate + 0.045;
  const infRate = inflationPct / 100;
  const sigmaAnnual = annualVolatilityPct / 100;
  const sigmaMonthly = sigmaAnnual / Math.sqrt(12);

  // Pre-run Monte Carlo paths month by month up to horizonYears
  const gaussian = createRng(4202026);
  const pathsByYear: number[][] = Array.from({ length: horizonYears + 1 }, () => []);
  for (let s = 0; s < simulations; s++) {
    let val = initialCapital;
    pathsByYear[0].push(val);
    for (let yr = 1; yr <= horizonYears; yr++) {
      const annualDrift = baseRate + (yr <= 5 ? convAnnualBoost : 0);
      const muMonthly = (annualDrift - 0.5 * sigmaAnnual * sigmaAnnual) / 12;
      for (let m = 0; m < 12; m++) {
        const z = gaussian();
        const growth = Math.exp(muMonthly + sigmaMonthly * z);
        val = val * growth + monthlyContribution;
      }
      pathsByYear[yr].push(val);
    }
  }

  const points: ProjectionYearPoint[] = [];
  let vCons = initialCapital;
  let vBase = initialCapital;
  let vOpt = initialCapital;

  for (let yr = 0; yr <= horizonYears; yr++) {
    if (yr > 0) {
      const boost = yr <= 5 ? convAnnualBoost : 0;
      const rConsM = Math.pow(1 + consRate + boost * 0.5, 1 / 12) - 1;
      const rBaseM = Math.pow(1 + baseRate + boost, 1 / 12) - 1;
      const rOptM = Math.pow(1 + optRate + boost * 1.2, 1 / 12) - 1;
      for (let m = 0; m < 12; m++) {
        vCons = vCons * (1 + rConsM) + monthlyContribution;
        vBase = vBase * (1 + rBaseM) + monthlyContribution;
        vOpt = vOpt * (1 + rOptM) + monthlyContribution;
      }
    }

    const sorted = [...pathsByYear[yr]].sort((a, b) => a - b);
    const investedCumulative = initialCapital + monthlyContribution * 12 * yr;
    const deflator = Math.pow(1 + infRate, yr);

    points.push({
      year: yr,
      calendarYear: startYear + yr,
      investedCumulative,
      conservative: vCons,
      base: vBase,
      optimistic: vOpt,
      mcP10: percentile(sorted, 0.1),
      mcP50: percentile(sorted, 0.5),
      mcP90: percentile(sorted, 0.9),
      realBase: vBase / deflator,
    });
  }

  return {
    horizonYears,
    initialCapital,
    monthlyContribution,
    inflationPct,
    baseCagrPct,
    annualVolatilityPct,
    convergeToFairValue,
    points,
    summary10Y: points[Math.min(10, points.length - 1)],
    summary20Y: points[Math.min(20, points.length - 1)],
  };
}
