import type {
  DailyPoint,
  MonthlyComparison,
  Portfolio,
  RiskMetrics,
} from './types.js';

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function popStdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

export function computeXirr(
  flows: { timeMs: number; amount: number }[]
): number {
  if (flows.length < 2) return 0;
  const t0 = flows[0].timeMs;
  const years = flows.map((f) => (f.timeMs - t0) / (365.25 * 86400000));

  let r = 0.15;
  for (let iter = 0; iter < 60; iter++) {
    let fVal = 0;
    let dfVal = 0;
    for (let i = 0; i < flows.length; i++) {
      const base = Math.max(0.05, 1 + r);
      const y = years[i];
      const disc = Math.pow(base, y);
      fVal += flows[i].amount / disc;
      if (y !== 0) {
        dfVal -= (y * flows[i].amount) / (disc * base);
      }
    }
    if (Math.abs(fVal) < 1e-5) break;
    if (Math.abs(dfVal) < 1e-9) break;
    const step = fVal / dfVal;
    r = Math.max(-0.9, Math.min(10, r - step));
  }
  return r * 100;
}

export function computeRiskMetrics(
  portfolio: Portfolio,
  monthly: MonthlyComparison[],
  daily: DailyPoint[],
  dailyReturns: number[]
): RiskMetrics {
  const rfMonthly = (portfolio.riskFreeRate ?? 2) / 100 / 12;
  const u = monthly.map((m) => m.userReturnPct / 100);
  const b = monthly.map((m) => m.benchReturnPct / 100);

  const uMean = mean(u);
  const bMean = mean(b);
  const uSd = popStdDev(u);
  const bSd = popStdDev(b);

  const sharpeUser = uSd > 0 ? (uMean - rfMonthly) / uSd : 0;
  const sharpeBench = bSd > 0 ? (bMean - rfMonthly) / bSd : 0;

  // TradingView Sortino uses full N denominator: sqrt( sum(min(0, r - rf)^2) / N )
  const downsideUser =
    u.length > 0
      ? Math.sqrt(u.reduce((s, r) => s + Math.min(0, r - rfMonthly) ** 2, 0) / u.length)
      : 0;
  const downsideBench =
    b.length > 0
      ? Math.sqrt(b.reduce((s, r) => s + Math.min(0, r - rfMonthly) ** 2, 0) / b.length)
      : 0;

  const sortinoUser = downsideUser > 0 ? (uMean - rfMonthly) / downsideUser : 0;
  const sortinoBench = downsideBench > 0 ? (bMean - rfMonthly) / downsideBench : 0;

  let cov = 0;
  let varB = 0;
  for (let i = 0; i < u.length; i++) {
    cov += (u[i] - uMean) * (b[i] - bMean);
    varB += (b[i] - bMean) ** 2;
  }
  const beta = varB > 0 ? cov / varB : 1;

  // Annualized volatility from daily returns
  const dailySd = popStdDev(dailyReturns);
  const annualizedVolatility = dailySd * Math.sqrt(252) * 100;
  const benchmarkVolatility = bSd * Math.sqrt(12) * 100;

  // Max Drawdown on TWR index
  let peak = 1;
  let cur = 1;
  let maxDd = 0;
  for (const r of dailyReturns) {
    cur *= 1 + r;
    if (cur > peak) peak = cur;
    const dd = peak > 0 ? (peak - cur) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // MWR / XIRR from trade cash flows + terminal holdings value
  const flows: { timeMs: number; amount: number }[] = [];
  for (const t of portfolio.trades) {
    const gross = t.qty * t.price + (t.isBuy ? t.commission : -t.commission);
    flows.push({ timeMs: t.time, amount: t.isBuy ? -gross : gross });
  }
  const lastDay = daily[daily.length - 1];
  if (lastDay) {
    flows.push({ timeMs: lastDay.time, amount: lastDay.holdingsValue });
  }
  flows.sort((a, b) => a.timeMs - b.timeMs);
  const mwrIrrPct = computeXirr(flows);
  const twrPct = lastDay ? lastDay.cumReturnPct : 0;

  return {
    sharpeRatio: { user: sharpeUser, benchmark: sharpeBench },
    sortinoRatio: { user: sortinoUser, benchmark: sortinoBench },
    beta,
    annualizedVolatility,
    benchmarkVolatility,
    maxDrawdownPct: maxDd * 100,
    mwrIrrPct,
    twrPct,
  };
}
