import { describe, it, expect } from 'vitest';
import { squarifiedTreemap, type TreemapItem, type TreemapRect } from '../treemap.js';

const FRAME = { x: 0, y: 0, width: 400, height: 168 };
const EPS = 1e-6;

function overlaps(a: TreemapRect, b: TreemapRect): boolean {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 1e-6 && oy > 1e-6;
}

function expectValidLayout(items: TreemapItem[], rects: TreemapRect[]) {
  expect(rects).toHaveLength(items.length);
  const totalArea = FRAME.width * FRAME.height;
  const sumAreas = rects.reduce((s, r) => s + r.width * r.height, 0);
  expect(Math.abs(sumAreas - totalArea) / totalArea).toBeLessThan(1e-6);
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(FRAME.x - EPS);
    expect(r.y).toBeGreaterThanOrEqual(FRAME.y - EPS);
    expect(r.x + r.width).toBeLessThanOrEqual(FRAME.x + FRAME.width + 1e-6);
    expect(r.y + r.height).toBeLessThanOrEqual(FRAME.y + FRAME.height + 1e-6);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlaps(rects[i], rects[j])).toBe(false);
    }
  }
}

describe('SPEC-005 · treemap squarified', () => {
  it('un solo ítem llena todo el marco', () => {
    const rects = squarifiedTreemap([{ key: 'a', value: 10 }], FRAME);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 400, height: 168 });
  });

  it('las áreas son proporcionales al valor (dos ítems 75/25)', () => {
    const rects = squarifiedTreemap(
      [
        { key: 'big', value: 75 },
        { key: 'small', value: 25 },
      ],
      FRAME
    );
    const total = FRAME.width * FRAME.height;
    const big = rects.find((r) => r.key === 'big')!;
    const small = rects.find((r) => r.key === 'small')!;
    expect((big.width * big.height) / total).toBeCloseTo(0.75, 6);
    expect((small.width * small.height) / total).toBeCloseTo(0.25, 6);
  });

  it('layout válido con 21 valores desparejos (cartera real): sin solapes, dentro del marco, suma de áreas', () => {
    const values = [
      23127, 18473, 16345, 14200, 12800, 11500, 9800, 8600, 7400, 6900, 5600, 4900,
      4100, 3600, 2900, 2300, 1800, 1300, 900, 500, 210,
    ];
    const items = values.map((v, i) => ({ key: `t${i}`, value: v }));
    const rects = squarifiedTreemap(items, FRAME);
    expectValidLayout(items, rects);
    // Proporcionalidad ítem por ítem
    const totalValue = values.reduce((s, v) => s + v, 0);
    const totalArea = FRAME.width * FRAME.height;
    for (const r of rects) {
      const v = values[Number(r.key.slice(1))];
      expect(Math.abs(r.width * r.height - (v / totalValue) * totalArea) / totalArea).toBeLessThan(
        1e-6
      );
    }
  });

  it('funciona en un marco angosto de panel (segundo nivel) y con offset', () => {
    const frame = { x: 12, y: 30, width: 90, height: 120 };
    const items = [
      { key: 'a', value: 50 },
      { key: 'b', value: 30 },
      { key: 'c', value: 20 },
    ];
    const rects = squarifiedTreemap(items, frame);
    const total = frame.width * frame.height;
    expect(rects.reduce((s, r) => s + r.width * r.height, 0)).toBeCloseTo(total, 4);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(frame.x - EPS);
      expect(r.y).toBeGreaterThanOrEqual(frame.y - EPS);
      expect(r.x + r.width).toBeLessThanOrEqual(frame.x + frame.width + 1e-6);
      expect(r.y + r.height).toBeLessThanOrEqual(frame.y + frame.height + 1e-6);
    }
  });

  it('valores cero o inválidos reciben área cero y no rompen el layout', () => {
    const items = [
      { key: 'ok', value: 100 },
      { key: 'zero', value: 0 },
      { key: 'neg', value: -5 },
      { key: 'nan', value: NaN },
    ];
    const rects = squarifiedTreemap(items, FRAME);
    expect(rects.find((r) => r.key === 'ok')).toMatchObject({ width: 400, height: 168 });
    for (const k of ['zero', 'neg', 'nan']) {
      const r = rects.find((x) => x.key === k)!;
      expect(r.width * r.height).toBe(0);
    }
  });

  it('lista vacía y marco degenerado devuelven sin lanzar', () => {
    expect(squarifiedTreemap([], FRAME)).toEqual([]);
    expect(squarifiedTreemap([{ key: 'a', value: 1 }], { x: 0, y: 0, width: 0, height: 10 })).toEqual([
      { key: 'a', x: 0, y: 0, width: 0, height: 0 },
    ]);
  });

  it('mantiene el orden de entrada en la salida', () => {
    const items = [
      { key: 'chico', value: 1 },
      { key: 'grande', value: 100 },
      { key: 'medio', value: 10 },
    ];
    expect(squarifiedTreemap(items, FRAME).map((r) => r.key)).toEqual([
      'chico',
      'grande',
      'medio',
    ]);
  });
});
