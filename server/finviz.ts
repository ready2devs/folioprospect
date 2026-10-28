import { cleanTicker } from '../shared/engine/format.js';
import {
  parseFinvizSnapshot,
  type FinvizFundamentals,
} from '../shared/engine/finvizParse.js';

export type { FinvizFundamentals };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { value: FinvizFundamentals | null; expiresAt: number }>();

/**
 * Fundamentales completos desde la tabla snapshot de Finviz (una sola
 * página trae el catálogo entero: EPS next 5Y, ROIC real, EV/Sales, P/C,
 * LT Debt/Eq, crecimientos 3/5Y, ownership, short, RSI, ATR…).
 * Nunca lanza: ante cualquier fallo (red, timeout, HTML inesperado)
 * devuelve null y la UI completa con Yahoo o muestra «—».
 */
export async function fetchFinvizFundamentals(
  symbol: string
): Promise<FinvizFundamentals | null> {
  const upper = (symbol || '').toUpperCase();
  const exchange = upper.includes(':') ? upper.split(':')[0] : '';
  const ticker = cleanTicker(upper);
  // Cripto y símbolos no accionables en Finviz: sin llamada.
  if (
    exchange === 'BINANCE' ||
    exchange === 'CRYPTO' ||
    exchange === 'COINBASE' ||
    !ticker ||
    !/^[A-Z0-9.\-]{1,12}$/.test(ticker) ||
    ticker.endsWith('USDT')
  ) {
    return null;
  }

  const now = Date.now();
  const cached = cache.get(ticker);
  if (cached && cached.expiresAt > now) return cached.value;

  let result: FinvizFundamentals | null = null;
  try {
    const res = await fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}&p=d`, {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const html = await res.text();
      result = parseFinvizSnapshot(html);
    }
  } catch {
    result = null;
  }

  cache.set(ticker, { value: result, expiresAt: now + CACHE_TTL_MS });
  return result;
}
