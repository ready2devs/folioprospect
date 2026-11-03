import { describe, it, expect } from 'vitest';
import { bubbleYTicks } from '../chartScales';

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
