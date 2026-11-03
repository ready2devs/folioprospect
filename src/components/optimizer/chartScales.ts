/**
 * Escalas de los gráficos del Optimizador — lógica pura, sin
 * React, para poder testearla.
 */

/** Pasos candidatos para las etiquetas del eje Y (en %). */
const TICK_STEPS = [3, 5, 6, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];

/**
 * Etiquetas del eje Y del gráfico de burbujas riesgo/beneficio,
 * generadas para cubrir TODO el rango visible [yMin, yMax]:
 * incluye el 0, arranca en o debajo de yMin y termina en o
 * encima de yMax, con el paso más fino que mantenga la cantidad
 * de etiquetas en un máximo legible.
 *
 * (Bug corregido en R13: la lista de ticks era fija — 0, 3, 6,
 * …, 18 — así que con retornos de hasta ~74% las burbujas
 * quedaban flotando sin escala de referencia por encima del
 * 18%: el eje «solo mostraba una parte de las etiquetas».)
 */
export function bubbleYTicks(yMin: number, yMax: number, maxTicks = 10): number[] {
  const lo = Math.min(0, yMin);
  const hi = Math.max(0, yMax);
  if (!(hi > lo)) return [0];
  for (const step of TICK_STEPS) {
    const from = Math.floor(lo / step) * step;
    const to = Math.ceil(hi / step) * step;
    const count = Math.round((to - from) / step) + 1;
    if (count <= maxTicks) {
      const ticks: number[] = [];
      for (let v = from; v <= to; v += step) ticks.push(v);
      return ticks;
    }
  }
  const step = TICK_STEPS[TICK_STEPS.length - 1];
  const from = Math.floor(lo / step) * step;
  const to = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = from; v <= to; v += step) ticks.push(v);
  return ticks;
}

/** Orden de la tabla del Optimizador (R14, pedido del usuario
 *  2026-11-03 12:38): por VELOCIDAD de revalorización (el orden
 *  histórico: retorno esperado descendente; en vista prudente,
 *  retorno prudente descendente) o por SCORE descendente — el
 *  de la vista activa (en prudente, el score prudente). Función
 *  pura para poder testearla: el default (esperada + velocidad)
 *  devuelve el orden entrante INTACTO. El orden por score es
 *  estable: a igual score desempata la velocidad de la vista, y
 *  a igualdad total conserva el orden entrante. Los activos sin
 *  score (cripto/caja) quedan últimos. */
export interface SortableAsset {
  expectedReturnPct: number | null;
  expectedReturnPessimisticPct: number | null;
  score: number | null;
  scorePessimistic: number | null;
}

export function sortOptimizerAssets<T extends SortableAsset>(
  assets: T[],
  viewMode: 'esperada' | 'prudente',
  sortMode: 'velocidad' | 'score'
): T[] {
  if (sortMode === 'velocidad' && viewMode === 'esperada') return assets;
  const arr = [...assets];
  if (sortMode === 'score') {
    const scoreOf = (a: T) => (viewMode === 'prudente' ? a.scorePessimistic : a.score) ?? -Infinity;
    const velOf = (a: T) =>
      (viewMode === 'prudente' ? a.expectedReturnPessimisticPct : a.expectedReturnPct) ?? -Infinity;
    arr.sort((x, y) => scoreOf(y) - scoreOf(x) || velOf(y) - velOf(x));
    return arr;
  }
  // velocidad + prudente: el comparador histórico, sin cambios.
  arr.sort(
    (x, y) => (y.expectedReturnPessimisticPct ?? -Infinity) - (x.expectedReturnPessimisticPct ?? -Infinity)
  );
  return arr;
}
