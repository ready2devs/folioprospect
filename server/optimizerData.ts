/**
 * Datos del Optimizador (SPEC-004): arma los inputs del motor puro desde las
 * fuentes gratuitas que la app ya consume (Yahoo + Finviz), calcula scores de
 * pares de la misma industria (screener de Finviz) y cachea el resultado.
 * Nunca lanza: cada activo degrada a los componentes que sí se pudieron leer.
 */
import {
  computeFairValue,
  motorFvViewFor,
  optimizePortfolio,
  scoreAsset,
  RISK_FREE_PCT,
  type DatedClose,
  type MotorFvView,
  type OptimizerAssetInput,
  type OptimizerResult,
  type ScoredPeer,
} from '../shared/engine/index.js';
import { cleanTicker } from '../shared/engine/format.js';
import { fetchAssetChart, fetchAssetExtras, fetchFundamentals } from './yahoo.js';
import { fetchFinvizFundamentals } from './finviz.js';
import { fetchSectorContext, finvizIndustrySlug } from './sectorContext.js';
import { addDays, fetchNasdaqEarningsDay, todayInNewYork } from './earnings.js';
import { resolveAnchorFromFundamentals } from './cashAnchor.js';

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

/** Activo BASE de un ticker de par (BTCUSDT → BTC; USDTUSDT →
 *  USDT; un ticker sin sufijo de cotización queda como está).
 *  La tenencia de Tether se guarda como el par USDTUSDT, así
 *  que la detección de caja que solo miraba el ticker completo
 *  la trataba como cripto volátil: con el 11,5% inventado y
 *  volatilidad 60% en la matriz de riesgo (corregido en R13). */
function pairBaseAsset(ticker: string): string {
  return ticker.endsWith('USDT') && ticker.length > 4 ? ticker.slice(0, -4) : ticker;
}

/** Caja y equivalentes: la unidad estable misma (USD o USDT),
 *  venga como ticker suelto o como base de su par. */
function isCashTicker(ticker: string): boolean {
  const base = pairBaseAsset(ticker);
  return base === 'USDT' || base === 'USD' || ticker === 'USDT' || ticker === 'USD';
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

/** Historial de cierres fechados (1 año diario) para el módulo
 *  único de riesgo: la volatilidad y las correlaciones se MIDEN
 *  en el motor desde esta serie; el servidor ya no calcula
 *  ninguna volatilidad propia (la vieja mezcla realizada/beta
 *  quedó consolidada en riskMatrix.ts). */
async function closesFromChart(symbol: string): Promise<DatedClose[] | null> {
  try {
    const chart = await fetchAssetChart(symbol, '1Y');
    const closes: DatedClose[] = (chart.points || [])
      .map((p: any) =>
        Array.isArray(p)
          ? { t: Number(p[0]), c: Number(p[1]) }
          : { t: Number(p?.t ?? p?.time ?? 0), c: Number(p?.close) }
      )
      .filter((p: DatedClose) => p.c > 0);
    return closes.length >= 2 ? closes : null;
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
  const isCash = isCashTicker(ticker);
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
    const [extras, fund, closes] = await Promise.all([
      fetchAssetExtras(h.symbol, h.lastPrice),
      fetchFundamentals(h.symbol, h.lastPrice),
      closesFromChart(h.symbol),
    ]);
    // Contexto del sector (R11): medianas de la industria (pares
    // grandes de Finviz) que alimentan el múltiplo justificado del
    // motor — P/E forward, ROIC y crecimiento mediano del sector.
    try {
      const ctx = await fetchSectorContext(ticker);
      if (ctx) {
        fund.industryForwardPe = ctx.forwardPe;
        fund.sectorRoicPct = ctx.roicPct;
        fund.sectorGrowth5yPct = ctx.growth5yPct;
      }
    } catch {
      /* sin contexto: el motor cae por su escalera documentada */
    }
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

    // SIN normalización a mitad de ciclo (R11): la vieja regla §6
    // re-escalaba el EPS forward a su mediana histórica cuando el
    // yield forward superaba 20% — un juicio narrativo codificado
    // («este pico no es permanente») que contradice la visibilidad
    // hacia adelante que el propio consenso ya trae (capacidad
    // vendida años, contratos firmados). Si el consenso forward está
    // mal, es problema del consenso: el sistema usa el FV del motor
    // TAL CUAL, el mismo de la ficha del activo.
    const fvBaseUsed = fv.fairValue;
    const fvConfidenceUsed = fv.fvConfidence ?? null;
    const fvRangeUsed: [number, number] | null = fv.fvRange ?? null;
    const fvComponentCountUsed: number | null =
      fv.fvComponents != null ? fv.fvComponents.length : fv.fairValue != null ? 1 : 0;
    const cyclicalNormalized = false;
    const midCycleEps: number | null = null;
    // Crecimiento de ganancias totales (ancla GK): mediana entre crecimiento de
    // ventas (Finviz TTM) y crecimiento de ganancias/ingresos de Yahoo.
    const totalGrowth: number[] = [];
    if (finviz?.salesYoyTtmPct != null) totalGrowth.push(finviz.salesYoyTtmPct);
    if (fund.revenueGrowth != null) totalGrowth.push(fund.revenueGrowth * 100);
    if (fund.earningsGrowth != null) totalGrowth.push(fund.earningsGrowth * 100);
    totalGrowth.sort((a, b) => a - b);
    // Ancla de caja real (R12.3): resolución ÚNICA desde los
    // fundamentales — primario los estados reportados (EDGAR),
    // respaldo el crudo del proveedor. La misma resolución alimenta
    // la ficha del activo (server/routes.ts).
    const anchorFcf = resolveAnchorFromFundamentals(fund);
    return {
      ...baseInput,
      industry: undefined, // se completa con el slug de Finviz si hace falta para pares
      dividendYieldPct: extras.forwardDividendYieldPct ?? extras.dividendYieldPct ?? finviz?.dividendEstPct ?? null,
      earningsGrowthTotalPct: totalGrowth.length ? totalGrowth[Math.floor(totalGrowth.length / 2)] : null,
      epsNextYearPct: finviz?.epsNextYearPct ?? null,
      epsNext5YPct: extras.epsNext5YGrowthPct ?? finviz?.epsNext5YPct ?? null,
      salesGrowthPct: finviz?.salesYoyTtmPct ?? null,
      // Crecimiento de ventas FUTURO de consenso %: la misma
      // definición que el motor de FV usa para su chequeo de
      // ingresos — promedio de la tendencia de ingresos de Yahoo
      // (estimaciones del próximo año vs el año actual, earningsTrend)
      // y del pronóstico del próximo año fiscal de TradingView contra
      // su TTM, cuando ambas fuentes están. Desde R12 es la serie que
      // clasifica el régimen del ancla de GK en el motor (el futuro
      // manda también ahí); el TTM de arriba queda como respaldo.
      salesGrowthForwardPct: (() => {
        const checks: number[] = [];
        if (fund.trendRevenueGrowth != null && Number.isFinite(fund.trendRevenueGrowth)) {
          checks.push(fund.trendRevenueGrowth * 100);
        }
        if (
          fund.tvRevenueForecastNextFy != null &&
          fund.tvRevenueTtm != null &&
          fund.tvRevenueTtm > 0
        ) {
          checks.push((fund.tvRevenueForecastNextFy / fund.tvRevenueTtm - 1) * 100);
        }
        return checks.length ? checks.reduce((s, x) => s + x, 0) / checks.length : null;
      })(),
      // FCF TTM del proveedor (crudo, antes de la reparación que
      // completa un TTM faltante/negativo con el flujo anual
      // auditado): desde R12.3 es el CHEQUEO CRUZADO y el respaldo
      // del ancla de caja — si el crudo no está pero el FCF vigente
      // NO vino de esa reparación, el vigente es el TTM y se usa; si
      // vino de los estados (fcfDerivedFromFilings), no se presenta
      // como TTM del proveedor.
      fcfTtmUsd: anchorFcf.providerFcfTtmUsd,
      // FCF del ancla RESUELTO (R12.3): manda el derivado de los
      // estados reportados; el proveedor solo como respaldo con su
      // procedencia registrada.
      fcfTtmResolvedUsd: anchorFcf.fcfTtmUsd,
      fcfTtmSource: anchorFcf.source,
      fcfTtmPeriodEnd: anchorFcf.periodEnd,
      fcfTtmDiscrepancy: anchorFcf.discrepancy,
      fcfTtmEdgarFyOnlyGap: anchorFcf.edgarFyOnlyGap,
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
      // Piso/techo del rango del FV: información que acompaña al FV
      // (desde R11 ningún extremo gobierna la convergencia).
      fvRangeLow: fvRangeUsed?.[0] ?? null,
      fvRangeHigh: fvRangeUsed?.[1] ?? null,
      // Tripwire de plausibilidad del FV (R9): FV > 2× target o > 2,5×
      // precio. ETIQUETA informativa; no cambia ningún número (R11).
      fvModelSuspect: (fv.fvFlags ?? []).includes('modelSuspect'),
      // Desacuerdo de signo entre fuentes del EPS forward:
      // trazabilidad; no altera ningún número (R11).
      epsSignDisagreement: fv.epsSignDisagreement ?? false,
      forwardEpsUsed,
      fcfMedianNonPositive,
      revenueGrowthPct: fund.revenueGrowth != null ? fund.revenueGrowth * 100 : null,
      nextEarningsDate: earnings?.date ?? null,
      earningsBusinessDays: earnings?.businessDays ?? null,
      cyclicalNormalized,
      midCycleEps,
      // Respaldo del módulo de riesgo cuando el historial no
      // alcanza para MEDIR: el dato mensual de Finviz anualizado.
      // La volatilidad que usa el sistema es la del módulo
      // (riskMatrix.ts), que prefiere la medición diaria desde
      // priceHistory y cae a este respaldo, después al beta.
      volatilityPct: finviz?.volatilityMonthPct != null ? finviz.volatilityMonthPct * Math.sqrt(12) : null,
      priceHistory: closes,
      beta: extras.beta ?? finviz?.beta ?? null,
      roicPct: extras.roicPct ?? finviz?.roicPct ?? null,
      // Tasa de reinversión % desde los reportados de EDGAR: (capex −
      // depreciación) / ingreso neto del último año fiscal disponible
      // de cada serie. El NOPAT se aproxima por el ingreso neto
      // reportado (post-impuestos): en firmas apalancadas el ingreso
      // neto es MENOR que el NOPAT, así que la tasa resultante es un
      // techo generoso — coherente con que el ancla madura es un techo
      // de cordura y manda el menor entre ancla y consenso. Sin los
      // tres insumos, null y GK cae al respaldo equity (corrección
      // del usuario 2026-11-03; docs/OPTIMIZER-PROFESSIONAL.md §15).
      reinvestmentRatePct: (() => {
        const ni = fund.netIncomeHistory?.[0] ?? null;
        const da = fund.depreciationHistory?.[0] ?? null;
        const cx = fund.capexHistory?.[0] ?? null;
        if (ni == null || !(ni > 0) || da == null || cx == null) return null;
        return Math.max(0, Math.min(90, ((cx - da) / ni) * 100));
      })(),
      // Crecimiento sustentable en su forma equity: ROE × (1 − payout
      // total), con payout total = dividendos + recompras netas sobre
      // el ingreso neto TTM (EPS trailing × acciones). Respaldo del
      // ancla madura cuando la reinversión no se pudo calcular.
      sustainableGrowthPct: (() => {
        const roe = fund.returnOnEquity ?? null;
        const shares = fund.sharesOutstanding ?? null;
        const ni =
          fund.trailingEps != null && shares ? fund.trailingEps * shares : null;
        if (roe == null || ni == null || !(ni > 0) || !shares) return null;
        const mktCap = baseInput.price * shares;
        const divYieldPct =
          extras.forwardDividendYieldPct ?? extras.dividendYieldPct ?? finviz?.dividendEstPct ?? null;
        const divTotal = divYieldPct != null ? (divYieldPct / 100) * mktCap : 0;
        const buybackTotal =
          fund.sharesGrowthYoYPct != null ? -(fund.sharesGrowthYoYPct / 100) * mktCap : 0;
        const retention = Math.max(-0.5, Math.min(1, (ni - divTotal - buybackTotal) / ni));
        return roe * 100 * retention;
      })(),
      grossMarginPct: extras.grossMarginPct ?? finviz?.grossMarginPct ?? null,
      operatingMarginPct: extras.operatingMarginPct ?? finviz?.operatingMarginPct ?? null,
      debtToEquity: extras.debtToEquity ?? finviz?.debtToEquity ?? null,
      moatScore: fv.moatScore ?? null,
    };
  } catch {
    return baseInput;
  }
}

/** Slug de industria de Finviz (ind_...): vive en sectorContext.ts
 *  (compartido con el contexto del múltiplo justificado, R11). */

async function fetchIndustryPeers(
  slug: string,
  industryName: string,
  excludeTickers: Set<string>
): Promise<ScoredPeer[]> {
  try {
    // Finviz rediseñó el screener (misma corrección que sectorContext):
    // URL /screener/stocks con f=industry_<slug> y tickers en un JSON
    // embebido en orden de capitalización.
    const res = await fetch(
      `https://finviz.com/screener/stocks?v=111&f=industry_${slug}&o=-marketcap`,
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const tickers: string[] = [];
    const re = /"ticker":"([A-Z0-9.\-]{1,12})"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && tickers.length < 14) {
      const t = m[1].toUpperCase();
      if (!tickers.includes(t) && !excludeTickers.has(t)) tickers.push(t);
    }
    if (tickers.length < 2) {
      const reLink = /\/quote\?t=([A-Z0-9.\-]{1,12})/g;
      while ((m = reLink.exec(html)) && tickers.length < 14) {
        const t = m[1].toUpperCase();
        if (!tickers.includes(t) && !excludeTickers.has(t)) tickers.push(t);
      }
    }
    const peers: ScoredPeer[] = [];
    for (const t of tickers.slice(0, 5)) {
      const symbol = `NASDAQ:${t}`;
      const [extras, finviz, peerCloses] = await Promise.all([
        fetchAssetExtras(symbol, 0).catch(() => null),
        fetchFinvizFundamentals(t),
        closesFromChart(symbol),
      ]);
      const price = finviz?.price ?? extras?.finviz?.price ?? null;
      if (!price) continue;
      const fundAtPrice = await fetchFundamentals(symbol, price);
      // El par se valúa con el contexto de SU industria (la misma que
      // lo trajo): múltiplo justificado completo, como las posiciones.
      try {
        const ctx = await fetchSectorContext(t);
        if (ctx) {
          fundAtPrice.industryForwardPe = ctx.forwardPe;
          fundAtPrice.sectorRoicPct = ctx.roicPct;
          fundAtPrice.sectorGrowth5yPct = ctx.growth5yPct;
        }
      } catch {
        /* sin contexto: escalera del motor */
      }
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
        priceHistory: peerCloses,
        roicPct: finviz?.roicPct ?? null,
        grossMarginPct: finviz?.grossMarginPct ?? null,
        operatingMarginPct: finviz?.operatingMarginPct ?? null,
        debtToEquity: finviz?.debtToEquity ?? null,
        moatScore: fv.moatScore ?? null,
      };
      const scored = scoreAsset(input, price, {
        sellCommissionPct: 0.5, riskFreePct: RISK_FREE_PCT, yearsToCorrection: 3, minTradeUsd: 250,
        maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
      });
      if (scored.score != null && scored.expectedReturnPct != null) {
        peers.push({
          symbol, ticker: t, name: t, industry: industryName, price,
          score: scored.score, expectedReturnPct: scored.expectedReturnPct,
          volatilityPct: scored.volatilityPct,
          priceHistory: peerCloses,
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

/** LA vista del valor justo del motor para UN activo suelto
 *  (unificación R13): corre el MISMO camino que el Optimizador
 *  (buildAssetInput + scoreAsset) para que la ficha del activo
 *  muestre exactamente el FV que el Optimizador publica para
 *  ese activo — un solo valor justo por activo en toda la app.
 *  Devuelve null si el activo no tiene FV del motor (cripto,
 *  caja o fuentes caídas): la ficha cae a su lectura de respaldo
 *  y ningún número compite con el del motor. */
export async function buildAssetOptimizerFv(symbol: string, price: number): Promise<MotorFvView | null> {
  try {
    const ticker = cleanTicker(symbol).toUpperCase();
    const input = await buildAssetInput(
      { symbol, ticker, name: ticker, sector: '', qty: 1, lastPrice: price, value: price },
      null
    );
    if (input.isCrypto || input.isCash || input.fvBase == null) return null;
    const scored = scoreAsset(input, price, {
      sellCommissionPct: 0.5, riskFreePct: RISK_FREE_PCT, yearsToCorrection: 3, minTradeUsd: 250,
      maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
    });
    return motorFvViewFor(input, scored);
  } catch {
    return null;
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
    const slug = await finvizIndustrySlug(inp.ticker);
    if (slug) industries.set(inp.sector + '|' + slug, slug);
  }
  // La industria del motor es el sector si no hay nombre fino: usamos el slug
  // como clave de industria para agrupar pares y salidas del mismo rubro.
  for (const inp of inputs) {
    if (inp.isCrypto || inp.isCash) continue;
    const slug = await finvizIndustrySlug(inp.ticker);
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
