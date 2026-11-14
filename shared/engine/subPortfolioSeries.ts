import type { Portfolio } from './types.js';

/**
 * Filtrado de un Portfolio a los símbolos de una subcartera (SPEC-005 §6 bis).
 *
 * Se usa para construir la serie de performance de la subcartera con el
 * MISMO motor del portafolio (`buildPortfolioSeries`), pero solo con las
 * operaciones reales de esos activos. Qué se conserva y qué se filtra:
 *  - trades: solo los de los símbolos pedidos (el corazón de la serie).
 *  - dividends / splits: solo los de esos símbolos (son eventos de esos
 *    activos).
 *  - cash: se descarta (los flujos de caja son del portafolio completo; no
 *    hay forma honesta de atribuirlos a una subcartera).
 *  - illiquid: se descarta (no pertenece al portafolio financiero líquido).
 *  - benchmark: se conserva el del portafolio (SP:SPX en la app).
 *  - startPoint: pasa a ser la fecha de la primera operación del subconjunto
 *    (la historia de la subcartera empieza con su primera operación real;
 *    conservar el startPoint global haría acumular benchmark contra una
 *    subcartera todavía inexistente). Sin operaciones, se conserva el
 *    startPoint original y la serie resultante será vacía.
 *
 * Nunca interpola ni fabrica historia: si el subconjunto no tiene
 * operaciones, el resultado tiene `trades` vacío y el endpoint responde
 * serie vacía.
 */
export function filterPortfolioBySymbols(
  portfolio: Portfolio,
  symbols: Iterable<string>
): Portfolio {
  const wanted = new Set<string>();
  for (const s of symbols) {
    if (typeof s === 'string' && s.trim()) wanted.add(s.trim());
  }
  const trades = portfolio.trades.filter((t) => wanted.has(t.symbol));
  const earliest = trades.reduce(
    (min, t) => (t.time < min ? t.time : min),
    Number.POSITIVE_INFINITY
  );
  return {
    ...portfolio,
    trades,
    cash: [],
    dividends: (portfolio.dividends || []).filter((d) => wanted.has(d.symbol)),
    splits: (portfolio.splits || []).filter((s) => wanted.has(s.symbol)),
    illiquid: [],
    startPoint:
      earliest !== Number.POSITIVE_INFINITY ? earliest : portfolio.startPoint,
  };
}
