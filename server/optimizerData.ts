/**
 * Datos del Optimizador (SPEC-004): arma los inputs del motor puro desde las
 * fuentes gratuitas que la app ya consume (Yahoo + Finviz), calcula scores de
 * pares de la misma industria (screener de Finviz) y cachea el resultado.
 * Nunca lanza: cada activo degrada a los componentes que sí se pudieron leer.
 */
import {
  aggregateFairValue,
  computeFairValue,
  optimizePortfolio,
  scoreAsset,
  type FvComponentInput,
  type OptimizerAssetInput,
  type OptimizerResult,
  type ScoredPeer,
} from '../shared/engine/index.js';
import { cleanTicker } from '../shared/engine/format.js';
import { fetchAssetChart, fetchAssetExtras, fetchFundamentals } from './yahoo.js';
import { fetchFinvizFundamentals } from './finviz.js';
import { addDays, fetchNasdaqEarningsDay, todayInNewYork } from './earnings.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface OptimizerHoldingLike {
  symbol: string;
  ticker: string;
  name: string;
  sector: string;
  qty: number;
  lastPrice: number;
  value: number;
}

/** Reglas del usuario: SOL no se toca (apuesta de ciclo); AAPL/VIST defensivos. */
const LOCKED_TICKERS = new Set(['SOL']);
const DEFENSIVE_TICKERS = new Set(['AAPL', 'VIST']);

function isCryptoSymbol(symbol: string, ticker: string): boolean {
  return (
    symbol.startsWith('BINANCE:') ||
    symbol.startsWith('CRYPTO:') ||
    ticker.endsWith('USDT') ||
    ['BTC', 'ETH', 'SOL', 'BNB'].includes(ticker)
  );
}

const medianOf = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Días hábiles (lun–vie) en el intervalo (from, to] entre fechas ISO. */
function businessDaysBetween(fromIso: string, toIso: string): number {
  let count = 0;
  let d = fromIso;
  while (d < toIso) {
    d = addDays(d, 1);
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

/**
 * Próximo balance por ticker escaneando el calendario Nasdaq de los
 * próximos 14 días (una sola pasada para toda la cartera; el endpoint
 * cachea por día). Alimenta el cinturón de balances del motor.
 */
async function upcomingEarningsMap(
  tickers: string[]
): Promise<Map<string, { date: string; businessDays: number }>> {
  const want = new Set(tickers.map((t) => t.toUpperCase()));
  const found = new Map<string, { date: string; businessDays: number }>();
  const today = todayInNewYork();
  // En paralelo: secuencial, 15 días de Nasdaq empujaban la función de
  // Vercel fuera de su timeout. Las respuestas se cachean por día y se
  // procesan en orden cronológico (gana la fecha más cercana).
  const dates = Array.from({ length: 15 }, (_, i) => addDays(today, i));
  const perDay = await Promise.all(
    dates.map(async (date) => {
      try {
        return { date, rows: await fetchNasdaqEarningsDay(date) };
      } catch {
        return { date, rows: [] as Awaited<ReturnType<typeof fetchNasdaqEarningsDay>> };
      }
    })
  );
  for (const { date, rows } of perDay) {
    for (const r of rows) {
      const t = (r.symbol || '').toUpperCase();
      if (want.has(t) && !found.has(t)) {
        found.set(t, { date, businessDays: businessDaysBetween(today, date) });
      }
    }
  }
  return found;
}

/** Volatilidad anualizada % desde la serie 1Y (retornos mensuales). */
async function volatilityFromChart(symbol: string): Promise<number | null> {
  try {
    const chart = await fetchAssetChart(symbol, '1Y');
    const closes = (chart.points || []).map((p: any) => (Array.isArray(p) ? p[1] : p?.close)).filter((x: any) => x > 0);
    if (closes.length < 60) return null;
    const monthly: number[] = [];
    for (let i = 21; i < closes.length; i += 21) {
      monthly.push(Math.log(closes[i] / closes[i - 21]));
    }
    if (monthly.length < 5) return null;
    const mean = monthly.reduce((s, x) => s + x, 0) / monthly.length;
    const sd = Math.sqrt(monthly.reduce((s, x) => s + (x - mean) ** 2, 0) / (monthly.length - 1));
    const vol = sd * Math.sqrt(12) * 100;
    return vol > 3 && vol < 150 ? vol : null;
  } catch {
    return null;
  }
}

async function buildAssetInput(
  h: OptimizerHoldingLike,
  earnings?: { date: string; businessDays: number } | null
): Promise<OptimizerAssetInput> {
  const ticker = cleanTicker(h.symbol).toUpperCase();
  const crypto = isCryptoSymbol(h.symbol, ticker);
  const isCash = ticker === 'USDT' || ticker === 'USD';
  const baseInput: OptimizerAssetInput = {
    symbol: h.symbol,
    ticker,
    name: h.name,
    sector: h.sector || (crypto ? 'Crypto' : '—'),
    price: h.lastPrice,
    qty: h.qty,
    value: h.value,
    isCrypto: crypto && !isCash,
    isCash,
    locked: LOCKED_TICKERS.has(ticker),
    defensive: DEFENSIVE_TICKERS.has(ticker),
  };
  if (baseInput.isCrypto || isCash) return baseInput;
  try {
    const [extras, fund, vol] = await Promise.all([
      fetchAssetExtras(h.symbol, h.lastPrice),
      fetchFundamentals(h.symbol, h.lastPrice),
      volatilityFromChart(h.symbol),
    ]);
    const fv = computeFairValue(fund);
    const finviz = extras.finviz;
    // Escenarios alineados con el FV titular: solo los componentes que la
    // banda de credibilidad efectivamente promedió (fvComponents). Antes se
    // usaba el dcfValue crudo aunque hubiera quedado fuera de banda, y un
    // DCF disparado fijaba el escenario optimista (p. ej. VIST 724, MELI 9.759).
    const scenarioBase: number[] =
      fv.fvComponents && fv.fvComponents.length > 0
        ? [...fv.fvComponents]
        : fv.fairValue != null
          ? [fv.fairValue]
          : [];
    let components = scenarioBase.filter((x) => x > 0);

    // ---- Capa profesional del Optimizador (docs/OPTIMIZER-PROFESSIONAL.md)
    // Confianza y estructura del FV (shrinkage y listón de destino en el
    // motor), EPS usado (señal de tesis), mediana de FCF, ΔS real (EDGAR).
    const forwardEpsUsed =
      fv.fvProvenance?.find((p) => p.component === 'multiples')?.usedValue ?? null;
    const fcfHist = (fund.fcfHistory ?? []).filter(
      (x): x is number => x != null && Number.isFinite(x)
    );
    const fcfMedianNonPositive =
      fcfHist.length >= 3 ? medianOf(fcfHist) <= 0 : null;

    // Normalización a mitad de ciclo (§6): si el yield forward implícito
    // (EPS usado ÷ precio — ambos del instrumento cotizado, misma base)
    // supera 20%, el EPS de pico se presume no permanente. La
    // normalización es INVARIANTE A LA BASE: escala el EPS forward por
    // la razón mediana/último año de la MISMA serie reportada de EDGAR
    // (si el emisor reporta por acción ordinaria y cotiza por ADS, la
    // razón cancela la base; comparar niveles sería mezclar peras con
    // manzanas — el caso SIMO). El componente normalizado se reagrega
    // con la MISMA función del motor de FV. El FV de la ficha no cambia.
    let fvBaseUsed = fv.fairValue;
    let fvConfidenceUsed = fv.fvConfidence ?? null;
    let fvRangeUsed: [number, number] | null = fv.fvRange ?? null;
    let fvComponentCountUsed: number | null =
      fv.fvComponents != null ? fv.fvComponents.length : fv.fairValue != null ? 1 : 0;
    let cyclicalNormalized = false;
    let midCycleEps: number | null = null;
    const price = h.lastPrice;
    const fwdYield =
      forwardEpsUsed != null && forwardEpsUsed > 0 && price > 0
        ? forwardEpsUsed / price
        : null;
    const epsHist = (fund.epsHistory ?? []).filter(
      (x): x is number => x != null && Number.isFinite(x)
    );
    const cyclicalTrigger = fwdYield != null && fwdYield > 0.2;
    if (cyclicalTrigger && fv.multiplesValue != null && forwardEpsUsed != null && forwardEpsUsed > 0) {
      const medAll = epsHist.length >= 3 ? medianOf(epsHist) : null;
      const latestEps = epsHist.length >= 3 ? epsHist[0] : null;
      // EPS forward re-escalado a mitad de ciclo (base del instrumento).
      midCycleEps =
        medAll != null && medAll > 0 && latestEps != null && latestEps > 0
          ? forwardEpsUsed * (medAll / latestEps)
          : null;
      if (midCycleEps != null && midCycleEps > 0 && midCycleEps < forwardEpsUsed) {
        const multiple = fv.multiplesValue / forwardEpsUsed;
        // Calidad por componente alineada con fvComponents (mismo orden
        // de construcción dcf → múltiplos → target que computeFairValue).
        const keyOrder: Array<'dcf' | 'multiples' | 'target'> = [];
        if (fv.dcfValue != null) keyOrder.push('dcf');
        if (fv.multiplesValue != null) keyOrder.push('multiples');
        if (fv.analystTarget != null) keyOrder.push('target');
        const qualityOf = (k: string): number | undefined => {
          const i = keyOrder.indexOf(k as 'dcf' | 'multiples' | 'target');
          return i >= 0 ? fv.fvComponentWeights?.[i] : undefined;
        };
        const pool: FvComponentInput[] = [];
        if (fv.dcfValue != null) pool.push({ key: 'dcf', value: fv.dcfValue, quality: qualityOf('dcf') });
        pool.push({ key: 'multiples', value: midCycleEps * multiple, quality: qualityOf('multiples') });
        if (fv.analystTarget != null) pool.push({ key: 'target', value: fv.analystTarget, quality: qualityOf('target') });
        const agg = aggregateFairValue(pool, {
          currentPrice: price,
          flags: [...(fv.fvFlags ?? []), 'cyclicalNormalized'],
        });
        if (agg.fairValue != null) {
          fvBaseUsed = agg.fairValue;
          fvConfidenceUsed = agg.confidence;
          fvRangeUsed = agg.range;
          fvComponentCountUsed = agg.components.length;
          components = agg.components.map((c) => c.value);
          cyclicalNormalized = true;
        }
      }
    }
    // Crecimiento de ganancias totales (ancla GK): mediana entre crecimiento de
    // ventas (Finviz TTM) y crecimiento de ganancias/ingresos de Yahoo.
    const totalGrowth: number[] = [];
    if (finviz?.salesYoyTtmPct != null) totalGrowth.push(finviz.salesYoyTtmPct);
    if (fund.revenueGrowth != null) totalGrowth.push(fund.revenueGrowth * 100);
    if (fund.earningsGrowth != null) totalGrowth.push(fund.earningsGrowth * 100);
    totalGrowth.sort((a, b) => a - b);
    return {
      ...baseInput,
      industry: undefined, // se completa con el slug de Finviz si hace falta para pares
      dividendYieldPct: extras.forwardDividendYieldPct ?? extras.dividendYieldPct ?? finviz?.dividendEstPct ?? null,
      earningsGrowthTotalPct: totalGrowth.length ? totalGrowth[Math.floor(totalGrowth.length / 2)] : null,
      epsNextYearPct: finviz?.epsNextYearPct ?? null,
      epsNext5YPct: extras.epsNext5YGrowthPct ?? finviz?.epsNext5YPct ?? null,
      salesGrowthPct: finviz?.salesYoyTtmPct ?? null,
      // ΔS real desde EDGAR (variación interanual de acciones diluidas):
      // antes era null «sin fuente confiable»; EDGAR sí la trae para los
      // emisores que reportan el concepto (brecha declarada en el doc).
      dilutionPct: fund.sharesGrowthYoYPct ?? null,
      forwardPe: extras.forwardPE ?? finviz?.forwardPe ?? null,
      fvPesimista: components.length ? Math.min(...components) : fvBaseUsed,
      fvBase: fvBaseUsed,
      fvOptimista: components.length ? Math.max(...components) : fvBaseUsed,
      uncertainty: fv.uncertainty,
      analystTarget: extras.targetMean ?? fv.analystTarget ?? null,
      fvConfidence: fvConfidenceUsed,
      fvComponentCount: fvComponentCountUsed,
      // Piso del rango del FV: destino conservador de la convergencia
      // cuando la confianza es Baja (pase correctivo RE, A).
      fvRangeLow: fvRangeUsed?.[0] ?? null,
      fvRangeHigh: fvRangeUsed?.[1] ?? null,
      // Desacuerdo de signo entre fuentes del EPS forward (pase D).
      epsSignDisagreement: fv.epsSignDisagreement ?? false,
      forwardEpsUsed,
      fcfMedianNonPositive,
      revenueGrowthPct: fund.revenueGrowth != null ? fund.revenueGrowth * 100 : null,
      nextEarningsDate: earnings?.date ?? null,
      earningsBusinessDays: earnings?.businessDays ?? null,
      cyclicalNormalized,
      midCycleEps,
      volatilityPct: (() => {
        const realized = vol ?? (finviz?.volatilityMonthPct != null ? finviz.volatilityMonthPct * Math.sqrt(12) : null);
        const betaImplied = extras.beta != null ? Math.min(extras.beta * 22, 65) : finviz?.beta != null ? Math.min(finviz.beta * 22, 65) : null;
        if (realized != null && betaImplied != null) {
          // Blend robusto: la realizada mensual en picos de ciclo exagera.
          return Math.min(0.6 * Math.min(realized, 70) + 0.4 * betaImplied, 75);
        }
        return realized != null ? Math.min(realized, 75) : betaImplied;
      })(),
      beta: extras.beta ?? finviz?.beta ?? null,
      roicPct: extras.roicPct ?? finviz?.roicPct ?? null,
      grossMarginPct: extras.grossMarginPct ?? finviz?.grossMarginPct ?? null,
      operatingMarginPct: extras.operatingMarginPct ?? finviz?.operatingMarginPct ?? null,
      debtToEquity: extras.debtToEquity ?? finviz?.debtToEquity ?? null,
      moatScore: fv.moatScore ?? null,
    };
  } catch {
    return baseInput;
  }
}

/** Slug de industria de Finviz (ind_...) desde la página de la acción. */
const slugCache = new Map<string, { slug: string | null; industryName: string | null; at: number }>();
async function finvizIndustry(ticker: string): Promise<{ slug: string | null; industryName: string | null }> {
  const c = slugCache.get(ticker);
  if (c && Date.now() - c.at < 6 * 3600 * 1000) return c;
  let out: { slug: string | null; industryName: string | null } = { slug: null, industryName: null };
  try {
    const res = await fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}&p=d`, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/f=ind_([a-z0-9_]+)/i);
      out = { slug: m ? m[1] : null, industryName: null };
    }
  } catch {
    /* sin industria: no hay pares para este activo */
  }
  slugCache.set(ticker, { ...out, at: Date.now() });
  return out;
}

async function fetchIndustryPeers(
  slug: string,
  industryName: string,
  excludeTickers: Set<string>
): Promise<ScoredPeer[]> {
  try {
    const res = await fetch(
      `https://finviz.com/screener.ashx?v=111&f=ind_${slug}&o=-marketcap`,
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const tickers: string[] = [];
    const re = /quote\.ashx\?t=([A-Z0-9.\-]{1,12})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && tickers.length < 14) {
      const t = m[1].toUpperCase();
      if (!tickers.includes(t) && !excludeTickers.has(t)) tickers.push(t);
    }
    const peers: ScoredPeer[] = [];
    for (const t of tickers.slice(0, 5)) {
      const symbol = `NASDAQ:${t}`;
      const [extras, finviz] = await Promise.all([
        fetchAssetExtras(symbol, 0).catch(() => null),
        fetchFinvizFundamentals(t),
      ]);
      const price = finviz?.price ?? extras?.finviz?.price ?? null;
      if (!price) continue;
      const fundAtPrice = await fetchFundamentals(symbol, price);
      const fv = computeFairValue(fundAtPrice);
      const input: OptimizerAssetInput = {
        symbol, ticker: t, name: t, sector: industryName, industry: industryName,
        price, qty: 1, value: price,
        dividendYieldPct: extras?.forwardDividendYieldPct ?? extras?.dividendYieldPct ?? null,
        epsNextYearPct: finviz?.epsNextYearPct ?? null,
        epsNext5YPct: finviz?.epsNext5YPct ?? null,
        salesGrowthPct: finviz?.salesYoyTtmPct ?? null,
        forwardPe: extras?.forwardPE ?? finviz?.forwardPe ?? null,
        fvBase: fv.fairValue, fvPesimista: fv.fairValue, fvOptimista: fv.fairValue,
        uncertainty: fv.uncertainty,
        fvConfidence: fv.fvConfidence ?? null,
        fvComponentCount: fv.fvComponents != null ? fv.fvComponents.length : fv.fairValue != null ? 1 : 0,
        analystTarget: extras?.targetMean ?? fv.analystTarget ?? null,
        beta: extras?.beta ?? finviz?.beta ?? null,
        roicPct: finviz?.roicPct ?? null,
        grossMarginPct: finviz?.grossMarginPct ?? null,
        operatingMarginPct: finviz?.operatingMarginPct ?? null,
        debtToEquity: finviz?.debtToEquity ?? null,
        moatScore: fv.moatScore ?? null,
      };
      const scored = scoreAsset(input, price, {
        sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
        maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
      });
      if (scored.score != null && scored.expectedReturnPct != null) {
        peers.push({
          symbol, ticker: t, name: t, industry: industryName, price,
          score: scored.score, expectedReturnPct: scored.expectedReturnPct,
          volatilityPct: scored.volatilityPct,
          fvConfidence: fv.fvConfidence ?? null,
          fvComponentCount: fv.fvComponents != null ? fv.fvComponents.length : null,
          fvToPrice: fv.fairValue != null && price > 0 ? fv.fairValue / price : null,
        });
      }
    }
    return peers.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

const resultCache = new Map<string, { result: OptimizerResult; inputs: OptimizerAssetInput[]; peersByIndustry: Record<string, ScoredPeer[]>; at: number }>();
const CACHE_MS = 15 * 60 * 1000;

export async function buildOptimizerResult(
  holdings: OptimizerHoldingLike[],
  sellCommissionPct: number,
  force = false
): Promise<{ result: OptimizerResult; inputs: OptimizerAssetInput[]; peersByIndustry: Record<string, ScoredPeer[]>; generatedAt: number; cached: boolean }> {
  const key = holdings.map((h) => h.symbol).sort().join(',');
  const c = resultCache.get(key);
  if (!force && c && Date.now() - c.at < CACHE_MS) {
    return { result: c.result, inputs: c.inputs, peersByIndustry: c.peersByIndustry, generatedAt: c.at, cached: true };
  }
  const earningsMap = await upcomingEarningsMap(
    holdings
      .filter((h) => !isCryptoSymbol(h.symbol, cleanTicker(h.symbol).toUpperCase()))
      .map((h) => cleanTicker(h.symbol).toUpperCase())
  );
  const inputs: OptimizerAssetInput[] = [];
  const queue = [...holdings];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const h = queue.shift()!;
      const ticker = cleanTicker(h.symbol).toUpperCase();
      inputs.push(await buildAssetInput(h, earningsMap.get(ticker) ?? null));
    }
  });
  await Promise.all(workers);

  // Pares por industria (solo para industrias presentes en cartera accionaria)
  const heldTickers = new Set(inputs.map((i) => i.ticker));
  const peersByIndustry: Record<string, ScoredPeer[]> = {};
  const industries = new Map<string, string>(); // industryName -> slug
  for (const inp of inputs) {
    if (inp.isCrypto || inp.isCash) continue;
    const { slug } = await finvizIndustry(inp.ticker);
    if (slug) industries.set(inp.sector + '|' + slug, slug);
  }
  // La industria del motor es el sector si no hay nombre fino: usamos el slug
  // como clave de industria para agrupar pares y salidas del mismo rubro.
  for (const inp of inputs) {
    if (inp.isCrypto || inp.isCash) continue;
    const { slug } = await finvizIndustry(inp.ticker);
    if (slug) inp.industry = slug.replace(/_/g, ' ');
  }
  for (const [, slug] of industries) {
    const name = slug.replace(/_/g, ' ');
    if (!peersByIndustry[name]) {
      peersByIndustry[name] = await fetchIndustryPeers(slug, name, heldTickers);
    }
  }
  // industryForwardPe: mediana de los pares + la propia cartera del rubro
  for (const inp of inputs) {
    if (!inp.industry) continue;
    const group = inputs.filter((x) => x.industry === inp.industry && x.forwardPe != null);
    const pes = group.map((x) => x.forwardPe!).sort((a, b) => a - b);
    if (pes.length >= 2) inp.industryForwardPe = pes[Math.floor(pes.length / 2)];
  }

  const result = optimizePortfolio(inputs, {
    sellCommissionPct,
    peersByIndustry,
  });
  const at = Date.now();
  resultCache.set(key, { result, inputs, peersByIndustry, at });
  return { result, inputs, peersByIndustry, generatedAt: at, cached: false };
}
