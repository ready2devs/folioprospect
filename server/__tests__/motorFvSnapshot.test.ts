import { describe, expect, it, vi } from 'vitest';
import {
  createMotorFvResolver,
  MotorFvMemoryCache,
  MOTOR_FV_KEEP_MS,
  MOTOR_FV_TTL_MS,
  type MotorFvComputation,
  type MotorFvKvStore,
  type MotorFvSnapshotEntry,
} from '../motorFvSnapshot.js';
import type { MotorFvView } from '../../shared/engine/index.js';

// SPEC-006, enmiendas v13 y v15: la ficha y la sigla de la watchlist
// leen el MISMO snapshot de FV del motor, y la CALIDAD del cómputo
// manda: una corrida degradada (sin Finviz, contexto sectorial
// parcial) no congela su número sobre uno bueno — el caso TMDX del
// despliegue de la v13 (foto degradada US$80,36 contra el cálculo
// sano de US$96,94).

const VIEW: MotorFvView = { fv: 96.94, fvPesimista: 87.52, fvOptimista: 106.37, uncertainty: 'Extreme' };
const VIEW_DEGRADED: MotorFvView = { fv: 80.36, fvPesimista: 41.92, fvOptimista: 107.27, uncertainty: 'Extreme' };
const VIEW2: MotorFvView = { fv: 70.0, fvPesimista: 60.0, fvOptimista: 80.0, uncertainty: 'High' };
const GOOD: MotorFvComputation = { view: VIEW, quality: 5 };
const DEGRADED: MotorFvComputation = { view: VIEW_DEGRADED, quality: 1 };
const T0 = 1_700_000_000_000;

function fakeKv(seed: Record<string, MotorFvSnapshotEntry> = {}) {
  const store = new Map(Object.entries(seed));
  const kv: MotorFvKvStore = {
    get: vi.fn(async (s: string) => store.get(s) ?? null),
    set: vi.fn(async (s: string, e: MotorFvSnapshotEntry) => {
      store.set(s, e);
    }),
  };
  return { kv, store };
}

describe('createMotorFvResolver · snapshot compartido ficha↔watchlist', () => {
  it('dos lecturas en la ventana comparten UNA computación y devuelven el mismo FV', async () => {
    const { kv } = fakeKv();
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    const compute = vi.fn(async () => GOOD);
    const a = await resolve('NASDAQ:TMDX', compute); // «ficha»
    const b = await resolve('NASDAQ:TMDX', compute); // «watchlist»
    expect(a).toEqual(VIEW);
    expect(b).toEqual(VIEW);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(kv.set).toHaveBeenCalledTimes(1);
  });

  it('una «instancia» nueva lee del KV lo que computó la otra, sin recomputar', async () => {
    const { kv } = fakeKv();
    const r1 = createMotorFvResolver({ kv, now: () => T0 });
    await r1('NASDAQ:TMDX', async () => GOOD);
    const r2 = createMotorFvResolver({ kv, now: () => T0 + 60_000 });
    const compute2 = vi.fn(async () => ({ view: VIEW2, quality: 5 }));
    await expect(r2('NASDAQ:TMDX', compute2)).resolves.toEqual(VIEW);
    expect(compute2).not.toHaveBeenCalled();
  });

  it('vencida la ventana, un cómputo de igual calidad recomputa y manda', async () => {
    const { kv } = fakeKv();
    let now = T0;
    const resolve = createMotorFvResolver({ kv, now: () => now });
    await resolve('NASDAQ:TMDX', async () => GOOD);
    now = T0 + MOTOR_FV_TTL_MS + 1;
    await expect(
      resolve('NASDAQ:TMDX', async () => ({ view: VIEW2, quality: 5 }))
    ).resolves.toEqual(VIEW2);
  });

  it('una entrada de KV vencida o inválida no se sirve como fresca', async () => {
    const { kv } = fakeKv({
      'NASDAQ:TMDX': { view: VIEW, at: T0 - MOTOR_FV_TTL_MS - 1, quality: 5 },
      'NASDAQ:MU': { view: { fv: -5, fvPesimista: 0, fvOptimista: 0, uncertainty: null } as any, at: T0, quality: 5 },
    });
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    await expect(resolve('NASDAQ:TMDX', async () => ({ view: VIEW2, quality: 5 }))).resolves.toEqual(VIEW2);
    await expect(resolve('NASDAQ:MU', async () => GOOD)).resolves.toEqual(VIEW);
  });

  it('un cálculo nulo NO se cachea: el próximo pedido reintenta', async () => {
    const { kv, store } = fakeKv();
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    const compute = vi
      .fn<() => Promise<MotorFvComputation | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(GOOD);
    await expect(resolve('NASDAQ:TMDX', compute)).resolves.toBeNull();
    await expect(resolve('NASDAQ:TMDX', compute)).resolves.toEqual(VIEW);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(store.has('NASDAQ:TMDX')).toBe(true);
  });

  it('pedidos concurrentes del mismo símbolo comparten el cálculo en curso', async () => {
    const { kv } = fakeKv();
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    let release!: (v: MotorFvComputation) => void;
    const compute = vi.fn(
      () => new Promise<MotorFvComputation>((res) => (release = res))
    );
    const p1 = resolve('NASDAQ:TMDX', compute);
    const p2 = resolve('NASDAQ:TMDX', compute);
    await new Promise((r) => setTimeout(r, 10));
    release(GOOD);
    await expect(p1).resolves.toEqual(VIEW);
    await expect(p2).resolves.toEqual(VIEW);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('REGLA v15 (caso TMDX): vencida la ventana, un cómputo degradado NO desplaza a la foto buena', async () => {
    const { kv, store } = fakeKv({
      'NASDAQ:TMDX': { view: VIEW, at: T0, quality: 5 },
    });
    const resolve = createMotorFvResolver({
      kv,
      now: () => T0 + MOTOR_FV_TTL_MS + 1000,
    });
    await expect(resolve('NASDAQ:TMDX', async () => DEGRADED)).resolves.toEqual(VIEW);
    // Y la foto guardada sigue siendo la buena.
    expect(store.get('NASDAQ:TMDX')?.view).toEqual(VIEW);
  });

  it('REGLA v15: pasada la guarda de 24 h, el cómputo nuevo manda aunque sea degradado', async () => {
    const { kv } = fakeKv({
      'NASDAQ:TMDX': { view: VIEW, at: T0, quality: 5 },
    });
    const resolve = createMotorFvResolver({
      kv,
      now: () => T0 + MOTOR_FV_KEEP_MS + 1000,
    });
    await expect(resolve('NASDAQ:TMDX', async () => DEGRADED)).resolves.toEqual(VIEW_DEGRADED);
  });

  it('REGLA v15: un cómputo nulo cede ante la foto guardada aunque esté vencida', async () => {
    const { kv } = fakeKv({
      'NASDAQ:TMDX': { view: VIEW, at: T0, quality: 5 },
    });
    const resolve = createMotorFvResolver({
      kv,
      now: () => T0 + MOTOR_FV_TTL_MS + 1000,
    });
    await expect(resolve('NASDAQ:TMDX', async () => null)).resolves.toEqual(VIEW);
  });

  it('la memoria comparte la misma regla de calidad entre lecturas', async () => {
    const { kv } = fakeKv();
    let now = T0;
    const resolve = createMotorFvResolver({ kv, now: () => now });
    await resolve('NASDAQ:TMDX', async () => GOOD);
    now = T0 + MOTOR_FV_TTL_MS + 1000;
    await expect(resolve('NASDAQ:TMDX', async () => DEGRADED)).resolves.toEqual(VIEW);
  });
});
