import { cleanTicker } from '../shared/engine/format.js';

/**
 * Estimaciones hacia adelante desde TradingView (directiva del
 * usuario 2026-11-03: «de ahí los tomo yo cuando analizo»).
 *
 * Ruta: el endpoint SCANNER que alimenta el screener público de
 * TradingView (POST scanner.tradingview.com/{mercado}/scan): JSON
 * estructurado, sin autenticación. NO es una API pública oficial —
 * es un endpoint interno estable de facto; por eso esta fuente es
 * ESTRICTAMENTE ADICIONAL: todo campo es opcional, cualquier fallo
 * devuelve null y la cadena Yahoo/Finviz valúa igual sin ella (R0).
 * Apagado de emergencia: TRADINGVIEW_ESTIMATES=off.
 *
 * Campos verificados en vivo (2026-11-03) contra el scanner:
 *  - earnings_per_share_forecast_next_fy → EPS de consenso del
 *    próximo año fiscal según el proveedor de TV.
 *  - revenue_forecast_next_fy / total_revenue_ttm → ingresos
 *    forecast del próximo año fiscal y TTM (mismo proveedor: el
 *    crecimiento implícito se computa puertas adentro).
 *  - price_target_average / _high / _low → target de analistas.
 * Los campos *_fy «actual» y total_revenue_forecast_* NO existen en
 * esta superficie (devuelven null siempre): brecha documentada en
 * docs/VALUATION-RULES.md (R10).
 *
 * Independencia PARCIAL: los universos de analistas de TV y de
 * Yahoo/Finviz se solapan (verificado el 2026-11-02/03: targets
 * idénticos en varios activos). Suma como una estimación más al
 * promedio, no como una fuente totalmente independiente.
 */
export interface TvEstimates {
  epsForecastNextFy: number | null;
  revenueForecastNextFy: number | null;
  revenueTtm: number | null;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { value: TvEstimates | null; expiresAt: number }>();

const COLUMNS = [
  'earnings_per_share_forecast_next_fy',
  'revenue_forecast_next_fy',
  'total_revenue_ttm',
  'price_target_average',
  'price_target_high',
  'price_target_low',
] as const;

/** Mercados del scanner con cobertura verificada: EE. UU. (america).
 *  Otros listados devuelven null por ahora (la cartera es US). */
const SCAN_MARKETS: Record<string, string> = {
  NASDAQ: 'america',
  NYSE: 'america',
  AMEX: 'america',
  ARCA: 'america',
};

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export async function fetchTvEstimates(symbol: string): Promise<TvEstimates | null> {
  if (process.env.TRADINGVIEW_ESTIMATES === 'off') return null;
  const upper = (symbol || '').toUpperCase();
  const exchange = upper.includes(':') ? upper.split(':')[0] : '';
  const ticker = cleanTicker(upper);
  const market = SCAN_MARKETS[exchange];
  if (!market || !ticker || !/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return null;

  const tvSymbol = `${exchange}:${ticker}`;
  const now = Date.now();
  const cached = cache.get(tvSymbol);
  if (cached && cached.expiresAt > now) return cached.value;

  let result: TvEstimates | null = null;
  try {
    const res = await fetch(`https://scanner.tradingview.com/${market}/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({
        symbols: { tickers: [tvSymbol] },
        columns: [...COLUMNS],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const j: any = await res.json();
      const row = Array.isArray(j?.data) ? j.data.find((d: any) => d?.s === tvSymbol) : null;
      const d: unknown[] = Array.isArray(row?.d) ? row.d : [];
      if (row) {
        result = {
          epsForecastNextFy: num(d[0]),
          revenueForecastNextFy: num(d[1]),
          revenueTtm: num(d[2]),
          targetMean: num(d[3]),
          targetHigh: num(d[4]),
          targetLow: num(d[5]),
        };
      }
    }
  } catch {
    result = null;
  }

  cache.set(tvSymbol, { value: result, expiresAt: now + CACHE_TTL_MS });
  return result;
}
