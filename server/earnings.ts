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
          eps: parseDollar(r.eps),
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
  return buildAssetEarningsInfo([...collected.values()], today);
}
