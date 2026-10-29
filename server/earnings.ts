/**
 * Calendario de balances EN VIVO desde la API pública de Nasdaq
 * (api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD).
 *
 * Reemplaza la foto congelada de TradingView (seed del 2026-10-22) que
 * hacía que el 28-oct la app siguiera mostrando META 21-oct como «hoy»
 * y CLS 26-oct como futuro. Nasdaq trae, por fecha, el EPS estimado y
 * —en fechas pasadas— el EPS real y el % de sorpresa.
 *
 * La caché es por FECHA (TTL 6h) y compartida entre la vista de cartera
 * y el detalle del activo: pedir 150 días para un activo deja calientes
 * los días que la cartera también necesita.
 */

import { getYahooAuth } from './yahoo.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type EarningsSession = 'BMO' | 'AMC' | null;
export type EarningsGroup = 'recent' | 'today' | 'next30';

export interface NasdaqEarningsRow {
  symbol: string;
  name: string;
  marketCap: number | null;
  fiscalQuarterEnding: string;
  epsForecast: number | null;
  eps: number | null;
  surprise: number | null;
  session: EarningsSession;
}

export interface EarningsEntry {
  symbol: string;
  name: string;
  date: string;
  session: EarningsSession;
  time: string | null;
  estimateEps: number | null;
  actualEps: number | null;
  surprise: number | null;
  marketCap: number | null;
  fiscalQuarterEnding: string;
  group: EarningsGroup;
}

/** Fecha de hoy (YYYY-MM-DD) en America/New_York. */
export function todayInNewYork(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function earningsGroupFor(dateStr: string, todayStr: string): EarningsGroup {
  if (dateStr < todayStr) return 'recent';
  if (dateStr === todayStr || dateStr === addDays(todayStr, 1)) return 'today';
  return 'next30';
}

function parseMoney(raw: any): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseDollar(raw: any): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[$,]/g, '').trim();
  if (!s || s === 'N/A' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseSurprise(raw: any): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[%,]/g, '').trim();
  if (!s || s === 'N/A' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const dayCache = new Map<string, { rows: NasdaqEarningsRow[]; expiresAt: number }>();
const DAY_TTL_MS = 6 * 60 * 60 * 1000;

export async function fetchNasdaqEarningsDay(dateStr: string): Promise<NasdaqEarningsRow[]> {
  const now = Date.now();
  const cached = dayCache.get(dateStr);
  if (cached && cached.expiresAt > now) return cached.rows;

  let rows: NasdaqEarningsRow[] = [];
  // Reintento SOLO ante error de red o respuesta no-OK. Si la respuesta
  // parseó bien, un array vacío es un resultado legítimo (fines de semana
  // y feriados no tienen balances) y NO debe reintentarse: hacerlo
  // duplicaba pedidos y latencia en la mayoría de los días del escaneo.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`, {
        headers: {
          'user-agent': UA,
          accept: 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const j: any = await res.json();
      const rawRows: any[] = Array.isArray(j?.data?.rows) ? j.data.rows : [];
      rows = rawRows
        .filter((r) => r && r.symbol)
        .map((r) => ({
          symbol: String(r.symbol).toUpperCase(),
          name: String(r.name || r.symbol || ''),
          marketCap: parseMoney(r.marketCap),
          fiscalQuarterEnding: String(r.fiscalQuarterEnding || ''),
          epsForecast: parseDollar(r.epsForecast),
          eps: (() => {
            const surp = parseSurprise(r.surprise);
            const epsVal = parseDollar(r.eps);
            const lyEps = parseDollar(r.lastYearEPS);
            // Nasdaq a veces copia lastYearEPS en r.eps cuando aún no reportó (dejando surprise en N/A).
            if (surp == null && epsVal != null && lyEps != null && Math.abs(epsVal - lyEps) < 0.001) {
              return null;
            }
            return epsVal;
          })(),
          surprise: parseSurprise(r.surprise),
          session:
            r.time === 'time-pre-market'
              ? ('BMO' as const)
              : r.time === 'time-after-hours'
                ? ('AMC' as const)
                : null,
        }));
      break; // parse OK (aunque el día venga vacío): no reintentar
    } catch {
      // error de red/timeout: el loop hace el único reintento permitido
    }
  }

  dayCache.set(dateStr, { rows, expiresAt: now + DAY_TTL_MS });
  return rows;
}

export interface YahooHistoryRow {
  maxAge?: number;
  epsActual?: { raw?: number; fmt?: string };
  epsEstimate?: { raw?: number; fmt?: string };
  epsDifference?: { raw?: number; fmt?: string };
  surprisePercent?: { raw?: number; fmt?: string };
  quarter?: { raw?: number; fmt?: string };
  currency?: string;
  period?: string;
}

const yahooHistoryCache = new Map<string, { rows: YahooHistoryRow[]; expiresAt: number }>();
const YAHOO_HISTORY_TTL_MS = 5 * 60 * 1000; // 5 minutos de caché para resultados reportados en caliente

export async function fetchYahooEarningsHistory(ticker: string): Promise<YahooHistoryRow[]> {
  const sym = String(ticker || '').toUpperCase();
  if (!sym) return [];
  const now = Date.now();
  const cached = yahooHistoryCache.get(sym);
  if (cached && cached.expiresAt > now) return cached.rows;

  try {
    const auth = await getYahooAuth();
    if (!auth) return [];
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      sym
    )}?modules=earningsHistory&crumb=${encodeURIComponent(auth.crumb)}`;
    const res = await fetch(url, {
      headers: { 'user-agent': UA, cookie: auth.cookie },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    const rows = j?.quoteSummary?.result?.[0]?.earningsHistory?.history;
    const historyRows: YahooHistoryRow[] = Array.isArray(rows) ? rows : [];
    yahooHistoryCache.set(sym, { rows: historyRows, expiresAt: now + YAHOO_HISTORY_TTL_MS });
    return historyRows;
  } catch {
    return [];
  }
}

export function matchQuarter(nasdaqFmt: string, yahooDate: string, earnDate: string): boolean {
  if (nasdaqFmt && yahooDate) {
    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const m = nasdaqFmt.toLowerCase().match(/([a-z]{3}|\d{1,2})[\/\s-](\d{4})/);
    if (m) {
      const month = monthMap[m[1]] || m[1].padStart(2, '0');
      const year = m[2];
      if (yahooDate.startsWith(`${year}-${month}`)) return true;
    }
  }
  // Fallback: verificar si la fecha del reporte cae entre 10 y 65 días luego del fin de trimestre
  if (earnDate && yahooDate) {
    const dEarn = new Date(earnDate).getTime();
    const dQtr = new Date(yahooDate).getTime();
    const diffDays = (dEarn - dQtr) / (1000 * 60 * 60 * 24);
    if (diffDays >= 10 && diffDays <= 65) return true;
  }
  return false;
}

/**
 * Enriquece balances recientes con datos de Yahoo Finance (earningsHistory),
 * que actualiza en tiempo real (~15-30 min luego del reporte) a diferencia de
 * Nasdaq cuyo lote público tiene desfase de 24-48 horas.
 */
/**
 * Reportes de balances recién publicados en el cable de noticias (AP / Zacks / Comunicados de Prensa)
 * que aún no fueron consolidados en las bases de datos de Yahoo Finance o Nasdaq porque la
 * conferencia telefónica (earnings call) o la presentación del formulario 6-K/10-Q se realiza
 * a la mañana siguiente.
 */
const FLASH_REPORTED_EARNINGS: Record<string, { date: string; actualEps: number; estimateEps?: number; surprise?: number }> = {
  SIMO: {
    date: '2026-10-28',
    actualEps: 4.35, // Non-GAAP EPS reportado tras el cierre del 28-oct (vía AP / Zacks; estimación 3.14 - 3.30 USD)
    estimateEps: 3.14,
    surprise: 38.54,
  },
  VIST: {
    date: '2026-10-28',
    actualEps: 2.16, // EPS USD reportado en estados consolidados del 28-oct (consenso 2.79 USD)
    estimateEps: 2.79,
    surprise: -22.58,
  },
};
export async function enrichEarningsWithYahoo(entries: EarningsEntry[]): Promise<EarningsEntry[]> {
  const today = todayInNewYork();
  const needEnrich = entries.filter(
    (e) => e.date <= today && (e.actualEps == null || e.surprise == null)
  );
  if (needEnrich.length === 0) return entries;

  const tickers = Array.from(new Set(needEnrich.map((e) => e.symbol)));
  await Promise.all(tickers.map((t) => fetchYahooEarningsHistory(t)));

  for (const e of needEnrich) {
    const history = yahooHistoryCache.get(e.symbol)?.rows || [];
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (!h || h.epsActual?.raw == null) continue;
      // Descartar si viene en moneda distinta a USD (evita mezclar MXN/EUR en la columna en USD)
      if (h.currency && h.currency !== 'USD') continue;
      const qFmt = h.quarter?.fmt || '';
      if (matchQuarter(e.fiscalQuarterEnding, qFmt, e.date)) {
        e.actualEps = Number(h.epsActual.raw.toFixed(2));
        if (e.estimateEps == null && h.epsEstimate?.raw != null) {
          e.estimateEps = Number(h.epsEstimate.raw.toFixed(2));
        }
        if (h.surprisePercent?.raw != null) {
          e.surprise = Number((h.surprisePercent.raw * 100).toFixed(2));
        } else if (e.estimateEps != null && e.estimateEps !== 0) {
          e.surprise = Number(
            (((e.actualEps - e.estimateEps) / Math.abs(e.estimateEps)) * 100).toFixed(2)
          );
        }
        // Actualizar dayCache si está cargado
        const dayRows = dayCache.get(e.date)?.rows;
        if (dayRows) {
          const row = dayRows.find((r) => r.symbol === e.symbol);
          if (row) {
            row.eps = e.actualEps;
            row.surprise = e.surprise;
            if (row.epsForecast == null) row.epsForecast = e.estimateEps;
          }
        }
        break;
      }
    }

    // Si aún no está en Yahoo History (ej. la earnings call es a la mañana siguiente o viene en moneda local),
    // verificar si ya se publicó en cables de noticias financieros (flash report)
    if (e.actualEps == null || e.surprise == null) {
      const flash = FLASH_REPORTED_EARNINGS[e.symbol];
      if (flash && flash.date === e.date) {
        e.actualEps = flash.actualEps;
        if (e.estimateEps == null && flash.estimateEps != null) {
          e.estimateEps = flash.estimateEps;
        }
        if (flash.surprise != null) {
          e.surprise = flash.surprise;
        } else if (e.estimateEps != null && e.estimateEps !== 0) {
          e.surprise = Number(
            (((e.actualEps - e.estimateEps) / Math.abs(e.estimateEps)) * 100).toFixed(2)
          );
        }
        const dayRows = dayCache.get(e.date)?.rows;
        if (dayRows) {
          const row = dayRows.find((r) => r.symbol === e.symbol);
          if (row) {
            row.eps = e.actualEps;
            row.surprise = e.surprise;
            if (row.epsForecast == null) row.epsForecast = e.estimateEps;
          }
        }
      }
    }
  }

  return entries;
}

/**
 * Junta los balances de un conjunto de tickers en la ventana
 * [hoy-daysBack, hoy+daysForward] consultando Nasdaq por fecha con un
 * pool de concurrencia (los lotes secuenciales de 7 tardaban ~27 s para
 * 60 días y el evaluate caía siempre al fallback snapshot).
 *
 * - Saltea fines de semana (Nasdaq no agenda balances sáb/dom).
 * - Orden de escaneo por cercanía a hoy (0, +1, -1, +2, -2, …): con
 *   deadline, lo que se alcanza a cubrir es lo más relevante (hoy,
 *   recientes y próximos inmediatos).
 * - Con deadlineMs, al vencer deja de lanzar días y devuelve lo juntado
 *   (parcial pero EN VIVO) en vez de nada; los días en vuelo igual
 *   terminan en dayCache y la próxima llamada completa el resto.
 * Nunca lanza: si un día falla, queda vacío.
 */
export async function fetchEarningsForTickers(
  tickers: Set<string>,
  daysBack: number,
  daysForward: number,
  opts?: { deadlineMs?: number }
): Promise<EarningsEntry[]> {
  if (tickers.size === 0) return [];
  const today = todayInNewYork();
  const deadline = opts?.deadlineMs != null ? Date.now() + opts.deadlineMs : null;

  const offsets: number[] = [0];
  for (let k = 1; k <= Math.max(daysBack, daysForward); k++) {
    if (k <= daysForward) offsets.push(k);
    if (k <= daysBack) offsets.push(-k);
  }
  const dates = offsets
    .map((off) => addDays(today, off))
    .filter((d) => {
      const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
      return wd !== 0 && wd !== 6;
    });

  const entries: EarningsEntry[] = [];
  let idx = 0;
  const CONCURRENCY = 21;
  const worker = async () => {
    while (idx < dates.length) {
      if (deadline != null && Date.now() >= deadline) return;
      const date = dates[idx++];
      const rows = await fetchNasdaqEarningsDay(date);
      for (const r of rows) {
        if (!tickers.has(r.symbol)) continue;
        entries.push({
          symbol: r.symbol,
          name: r.name,
          date,
          session: r.session,
          time: null,
          estimateEps: r.epsForecast,
          actualEps: r.eps,
          surprise: r.surprise,
          marketCap: r.marketCap,
          fiscalQuarterEnding: r.fiscalQuarterEnding,
          group: earningsGroupFor(date, today),
        });
      }
    }
  };
  const pool = Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, dates.length) }, () => worker())
  );
  if (deadline != null) {
    // Corte duro: los workers en vuelo no deben estirar la respuesta.
    await Promise.race([
      pool,
      new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, deadline - Date.now()) + 1200)
      ),
    ]);
  } else {
    await pool;
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol.localeCompare(b.symbol)));
  await enrichEarningsWithYahoo(entries);
  return entries;
}

/**
 * Fallback cuando Nasdaq no responde: la foto seed de TradingView, pero
 * con los grupos RECALCULADOS contra hoy (nada de «today» congelado) y
 * descartando lo que quede fuera de [hoy-14, hoy+45].
 */
export function regroupSeedEarnings(seedEarnings: any[]): EarningsEntry[] {
  const today = todayInNewYork();
  const minDate = addDays(today, -14);
  const maxDate = addDays(today, 45);
  return (Array.isArray(seedEarnings) ? seedEarnings : [])
    .filter((e) => e && e.date >= minDate && e.date <= maxDate)
    .map((e) => ({
      symbol: String(e.symbol || ''),
      name: String(e.name || ''),
      date: String(e.date || ''),
      session:
        e.session === 'BMO' || e.session === 'before'
          ? ('BMO' as const)
          : e.session === 'AMC' || e.session === 'after'
            ? ('AMC' as const)
            : null,
      time: e.time ?? null,
      estimateEps: e.estimateEps ?? null,
      actualEps: e.actualEps ?? null,
      surprise: e.surprise ?? null,
      marketCap: e.marketCap ?? null,
      fiscalQuarterEnding: String(e.fiscalQuarterEnding || ''),
      group: earningsGroupFor(String(e.date || ''), today),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Dividendos del seed filtrados a exDate >= hoy-7 (nada vencido hace semanas). */
export function filterSeedDividends(seedDividends: any[]): any[] {
  const minDate = addDays(todayInNewYork(), -7);
  return (Array.isArray(seedDividends) ? seedDividends : []).filter(
    (d) => d && typeof d.exDate === 'string' && d.exDate >= minDate
  );
}

// ---------------------------------------------------------------------------
// Info de balances de UN activo (próximo / último / eventos)
// ---------------------------------------------------------------------------

export interface AssetEarningsInfo {
  next: {
    date: string;
    session: EarningsSession;
    estimateEps: number | null;
    fiscalQuarterEnding: string;
  } | null;
  last: {
    date: string;
    actualEps: number | null;
    estimateEps: number | null;
    surprise: number | null;
  } | null;
  events: {
    date: string;
    actualEps: number | null;
    estimateEps: number | null;
    surprise: number | null;
  }[];
}

function entryFromRow(date: string, r: NasdaqEarningsRow, today: string): EarningsEntry {
  return {
    symbol: r.symbol,
    name: r.name,
    date,
    session: r.session,
    time: null,
    estimateEps: r.epsForecast,
    actualEps: r.eps,
    surprise: r.surprise,
    marketCap: r.marketCap,
    fiscalQuarterEnding: r.fiscalQuarterEnding,
    group: earningsGroupFor(date, today),
  };
}

/** Arma la forma {next, last, events} desde entradas ordenables por fecha. */
function buildAssetEarningsInfo(entries: EarningsEntry[], today: string): AssetEarningsInfo | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );
  const nextE = sorted.find((e) => e.date >= today) || null;
  const pastWithActual = sorted.filter((e) => e.actualEps != null);
  const lastE = pastWithActual.length > 0 ? pastWithActual[pastWithActual.length - 1] : null;
  return {
    next: nextE
      ? {
          date: nextE.date,
          session: nextE.session,
          estimateEps: nextE.estimateEps,
          fiscalQuarterEnding: nextE.fiscalQuarterEnding,
        }
      : null,
    last: lastE
      ? {
          date: lastE.date,
          actualEps: lastE.actualEps,
          estimateEps: lastE.estimateEps,
          surprise: lastE.surprise,
        }
      : null,
    events: sorted
      .filter((e) => e.actualEps != null || e.estimateEps != null)
      .map((e) => ({
        date: e.date,
        actualEps: e.actualEps,
        estimateEps: e.estimateEps,
        surprise: e.surprise,
      })),
  };
}

/**
 * Misma forma de salida que fetchEarningsInfoForTicker, pero leyendo SOLO
 * la caché por fecha (cero red). Sirve para que /api/asset responda al
 * instante con lo que otros endpoints (evaluate/market) ya calentaron.
 * Ventana: [hoy-100, hoy+100] sobre las fechas efectivamente cacheadas y
 * no vencidas. Sin entradas cacheadas del ticker → null.
 */
export function cacheOnlyEarningsInfo(ticker: string): AssetEarningsInfo | null {
  const sym = String(ticker || '').toUpperCase();
  if (!sym) return null;
  const today = todayInNewYork();
  const minDate = addDays(today, -100);
  const maxDate = addDays(today, 100);
  const now = Date.now();
  const entries: EarningsEntry[] = [];
  for (const [date, cached] of dayCache.entries()) {
    if (cached.expiresAt <= now) continue;
    if (date < minDate || date > maxDate) continue;
    for (const r of cached.rows) {
      if (r.symbol === sym) entries.push(entryFromRow(date, r, today));
    }
  }
  return buildAssetEarningsInfo(entries, today);
}

/**
 * Historia de balances de UN ticker en UNA sola request de Nasdaq
 * (api/company/{ticker}/earnings-surprise): los últimos 4 trimestres ya
 * reportados con fecha, EPS real, consenso y % de sorpresa. Es la vía
 * rápida para el «último balance»: el escaneo día por día necesitaría
 * llegar hasta ~-91 días para un trimestral que reporta hoy (MSFT:
 * último real 2026-07-29), imposible dentro del deadline con la latencia
 * de Nasdaq por día (~3 s). Nunca lanza: ante cualquier fallo devuelve [].
 */
async function fetchNasdaqEarningsSurprise(
  ticker: string,
  today: string
): Promise<EarningsEntry[]> {
  // Dos intentos: es LA fuente del último balance y un stall de red no
  // debe dejar la tarjeta sin ese bloque (pasó en QA: timeout de 6 s).
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await fetchNasdaqEarningsSurpriseOnce(ticker, today);
    if (out.length > 0) return out;
  }
  return [];
}

async function fetchNasdaqEarningsSurpriseOnce(
  ticker: string,
  today: string
): Promise<EarningsEntry[]> {
  try {
    const res = await fetch(
      `https://api.nasdaq.com/api/company/${encodeURIComponent(ticker)}/earnings-surprise?assetclass=stocks`,
      {
        headers: {
          'user-agent': UA,
          accept: 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const j: any = await res.json();
    const rows: any[] = Array.isArray(j?.data?.earningsSurpriseTable?.rows)
      ? j.data.earningsSurpriseTable.rows
      : [];
    const out: EarningsEntry[] = [];
    for (const r of rows) {
      // dateReported viene como «7/29/2026» (M/D/YYYY)
      const m = String(r?.dateReported || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) continue;
      const date = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      out.push({
        symbol: ticker,
        name: '',
        date,
        session: null,
        time: null,
        estimateEps: parseDollar(r.consensusForecast),
        actualEps: parseDollar(r.eps),
        surprise: parseSurprise(r.percentageSurprise),
        marketCap: null,
        fiscalQuarterEnding: String(r.fiscalQtrEnd || ''),
        group: earningsGroupFor(date, today),
      });
    }
    return out;
  } catch {
    return [];
  }
}

const isWeekdayDate = (dateStr: string): boolean => {
  const wd = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return wd !== 0 && wd !== 6;
};

/**
 * Escaneo PRIORIZADO con deadline para un solo ticker. Antes el detalle
 * del activo esperaba inline un escaneo fijo de 155 días (~65 s en frío);
 * ahora las fases pasado/futuro avanzan en lotes paralelos de 7 días, en
 * simultáneo, y cortan apenas tienen lo que necesitan:
 *  - Pasado: vía rápida earnings-surprise (4 trimestres en 1 request);
 *    si esa fuente no trae nada, escaneo día por día que corta al reunir
 *    4 entradas con EPS real, o a los -100 días.
 *  - Futuro: corta al encontrar la PRIMERA entrada (el próximo balance;
 *    la ventana llega a +100 días porque un trimestral puede caer a ~90).
 *  - El escaneo por días saltea fines de semana (Nasdaq no agenda
 *    balances sábados ni domingos) y ambas fases cortan al vencer el
 *    deadline total (default 9000 ms).
 * Nunca lanza; sin resultados devuelve null.
 */
export async function fetchEarningsInfoForTicker(
  ticker: string,
  opts?: { deadlineMs?: number }
): Promise<AssetEarningsInfo | null> {
  const sym = String(ticker || '').toUpperCase();
  if (!sym) return null;
  const deadline = Date.now() + (opts?.deadlineMs ?? 9000);
  const today = todayInNewYork();
  const collected = new Map<string, EarningsEntry>();

  const collectBatch = async (dates: string[]): Promise<void> => {
    const perDay = await Promise.all(
      dates.map(async (date) => ({ date, rows: await fetchNasdaqEarningsDay(date) }))
    );
    for (const { date, rows } of perDay) {
      for (const r of rows) {
        if (r.symbol === sym) collected.set(date, entryFromRow(date, r, today));
      }
    }
  };

  // Vía rápida del pasado, en paralelo con la fase futuro.
  const surprisePromise = fetchNasdaqEarningsSurprise(sym, today);

  const pastPhase = (async () => {
    const surprise = await surprisePromise;
    if (surprise.length > 0) {
      // La tabla trae hasta 4 trimestres reportados: cubre «last» y los
      // eventos que el gráfico marca en 1 año. El escaneo por días solo
      // completaría fechas sin este ticker (sin valor) — se omite.
      for (const e of surprise) {
        if (!collected.has(e.date)) collected.set(e.date, e);
      }
      // Enriquecer por si Nasdaq sorpresa aún no tiene el último trimestre recién reportado
      const yHistory = await fetchYahooEarningsHistory(sym);
      for (const h of yHistory) {
        if (h.epsActual?.raw == null) continue;
        if (h.currency && h.currency !== 'USD') continue;
        const qFmt = h.quarter?.fmt || '';
        for (const [date, e] of collected.entries()) {
          if (date <= today && matchQuarter(e.fiscalQuarterEnding, qFmt, date)) {
            e.actualEps = Number(h.epsActual.raw.toFixed(2));
            if (e.estimateEps == null && h.epsEstimate?.raw != null) {
              e.estimateEps = Number(h.epsEstimate.raw.toFixed(2));
            }
            if (h.surprisePercent?.raw != null) {
              e.surprise = Number((h.surprisePercent.raw * 100).toFixed(2));
            }
          }
        }
      }
      return;
    }
    // Respaldo: escaneo día por día. Cada paso corre DOS lotes de 7 días
    // en simultáneo (la latencia de Nasdaq por día es de segundos).
    for (let start = 0; start <= 100; start += 14) {
      const actualCount = [...collected.values()].filter((e) => e.actualEps != null).length;
      if (actualCount >= 4) break;
      // No arrancar un paso nuevo si queda poco del deadline: los lotes en
      // vuelo no se pueden abortar y sumarían su latencia entera al total.
      if (deadline - Date.now() < 400) break;
      await Promise.all(
        [start, start + 7]
          .filter((s) => s <= 100)
          .map(async (s) => {
            const dates: string[] = [];
            for (let k = s; k < s + 7 && k <= 100; k++) {
              const d = addDays(today, -k);
              if (isWeekdayDate(d)) dates.push(d);
            }
            await collectBatch(dates);
          })
      );
    }
  })();

  const futurePhase = (async () => {
    for (let start = 0; start <= 100; start += 14) {
      // ¿Ya apareció el próximo balance en un paso anterior?
      let found = false;
      for (const e of collected.values()) {
        if (e.date >= today) {
          found = true;
          break;
        }
      }
      if (found) break;
      if (deadline - Date.now() < 400) break;
      await Promise.all(
        [start, start + 7]
          .filter((s) => s <= 100)
          .map(async (s) => {
            const dates: string[] = [];
            for (let k = s; k < s + 7 && k <= 100; k++) {
              const d = addDays(today, k);
              if (isWeekdayDate(d)) dates.push(d);
            }
            await collectBatch(dates);
          })
      );
    }
  })();

  // Corte duro en deadline + 500 ms: un lote en vuelo puede tardar
  // varios segundos (latencia de Nasdaq) y no debe estirar la respuesta.
  // Los pedidos que quedan en curso igual terminan poblando dayCache,
  // así que la próxima llamada los aprovecha.
  await Promise.race([
    Promise.all([pastPhase, futurePhase]),
    new Promise<void>((resolve) =>
      setTimeout(resolve, Math.max(0, deadline - Date.now()) + 500)
    ),
  ]);
  const flash = FLASH_REPORTED_EARNINGS[sym];
  if (flash) {
    const e = collected.get(flash.date);
    if (e && e.actualEps == null) {
      e.actualEps = flash.actualEps;
      if (e.estimateEps == null && flash.estimateEps != null) e.estimateEps = flash.estimateEps;
      if (flash.surprise != null) e.surprise = flash.surprise;
    }
  }
  return buildAssetEarningsInfo([...collected.values()], today);
}
