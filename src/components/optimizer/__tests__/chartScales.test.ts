import { describe, it, expect } from 'vitest';
import { bubbleYTicks, sortOptimizerAssets } from '../chartScales';

/**
 * Eje Y del gráfico de burbujas (corrección R13): las etiquetas
 * se generan para cubrir TODO el rango visible. Antes la lista
 * era fija (0…18) y las burbujas por encima del 18% quedaban
 * sin escala de referencia.
 */
describe('bubbleYTicks — etiquetas del eje Y de burbujas', () => {
  it('cubre el rango real de la cartera (burbujas hasta ~74%, eje hasta ~87%)', () => {
    const ticks = bubbleYTicks(-3.6, 87.3);
    expect(ticks[0]).toBeLessThanOrEqual(-3.6);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(87.3);
    expect(ticks).toContain(0);
    expect(ticks.length).toBeLessThanOrEqual(10);
    // Estrictamente crecientes y con paso uniforme.
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBe(ticks[1] - ticks[0]);
    }
    // Hay etiquetas por encima del viejo corte de 18%:
    expect(ticks.some((v) => v > 18)).toBe(true);
    expect(ticks.some((v) => v >= 74)).toBe(true);
  });

  it('en rangos chicos mantiene granularidad fina (como la escala histórica 0–18)', () => {
    const ticks = bubbleYTicks(-3, 18);
    for (const v of [0, 3, 6, 9, 12, 15, 18]) expect(ticks).toContain(v);
  });

  it('rangos negativos y degenerados no rompen', () => {
    expect(bubbleYTicks(0, 0)).toEqual([0]);
    const neg = bubbleYTicks(-25, -5);
    expect(neg[neg.length - 1]).toBeGreaterThanOrEqual(-5);
    expect(neg).toContain(0);
  });
});

describe('sortOptimizerAssets (R14): orden conmutable de la tabla', () => {
  const mk = (
    ticker: string,
    re: number | null,
    rePess: number | null,
    score: number | null,
    scorePess: number | null
  ) => ({
    ticker,
    expectedReturnPct: re,
    expectedReturnPessimisticPct: rePess,
    score,
    scorePessimistic: scorePess,
  });
  const assets = [
    mk('LENTA', 8, 5, 60, 55),
    mk('RAPIDA', 40, 30, 35, 30),
    mk('MEDIA', 20, 15, 80, 70),
    mk('CRIPTO', null, null, null, null),
  ];
  const names = (xs: Array<{ ticker: string }>) => xs.map((x) => x.ticker);

  it('default (esperada + velocidad): el orden entrante queda INTACTO', () => {
    const out = sortOptimizerAssets(assets, 'esperada', 'velocidad');
    expect(out).toBe(assets);
    expect(names(out)).toEqual(['LENTA', 'RAPIDA', 'MEDIA', 'CRIPTO']);
  });

  it('velocidad + prudente: ordena por el retorno prudente (el histórico)', () => {
    expect(names(sortOptimizerAssets(assets, 'prudente', 'velocidad'))).toEqual([
      'RAPIDA', 'MEDIA', 'LENTA', 'CRIPTO',
    ]);
  });

  it('score + esperada: descendente por el score de la vista, sin score al final', () => {
    expect(names(sortOptimizerAssets(assets, 'esperada', 'score'))).toEqual([
      'MEDIA', 'LENTA', 'RAPIDA', 'CRIPTO',
    ]);
  });

  it('score + prudente: usa el score PRUDENTE, no el esperado', () => {
    const xs = [mk('A', 10, 9, 90, 20), mk('B', 12, 11, 30, 85)];
    expect(names(sortOptimizerAssets(xs, 'prudente', 'score'))).toEqual(['B', 'A']);
    expect(names(sortOptimizerAssets(xs, 'esperada', 'score'))).toEqual(['A', 'B']);
  });

  it('empate de score: desempata la velocidad de la vista; empate total: orden estable', () => {
    const xs = [mk('X1', 10, 8, 50, 50), mk('X2', 30, 8, 50, 50), mk('X3', 30, 8, 50, 50)];
    expect(names(sortOptimizerAssets(xs, 'esperada', 'score'))).toEqual(['X2', 'X3', 'X1']);
  });
});
