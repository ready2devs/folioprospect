import { describe, expect, it, vi } from 'vitest';
import {
  createMotorFvResolver,
  MotorFvMemoryCache,
  MOTOR_FV_TTL_MS,
  type MotorFvKvStore,
  type MotorFvSnapshotEntry,
} from '../motorFvSnapshot.js';
import type { MotorFvView } from '../../shared/engine/index.js';

// SPEC-006, enmienda v13: la ficha y la sigla de la watchlist leen el
// MISMO snapshot de FV del motor. Estas pruebas fijan el contrato del
// resolvedor compartido: una sola computación por activo y ventana,
// compartida entre «endpoints» (dos llamadas cualesquiera), con el
// KV durable como puente entre instancias y sin congelar nulos.

const VIEW: MotorFvView = { fv: 96.94, fvPesimista: 87.52, fvOptimista: 106.37, uncertainty: 'Extreme' };
const VIEW2: MotorFvView = { fv: 70.0, fvPesimista: 60.0, fvOptimista: 80.0, uncertainty: 'High' };
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

describe('MotorFvMemoryCache', () => {
  it('sirve dentro de la ventana y vence a los 15 min', () => {
    const c = new MotorFvMemoryCache();
    c.set('NASDAQ:TMDX', VIEW, T0);
    expect(c.get('NASDAQ:TMDX', T0 + MOTOR_FV_TTL_MS - 1)).toEqual(VIEW);
    expect(c.get('NASDAQ:TMDX', T0 + MOTOR_FV_TTL_MS)).toBeNull();
  });
});

describe('createMotorFvResolver · snapshot compartido ficha↔watchlist', () => {
  it('dos lecturas en la ventana comparten UNA computación y devuelven el mismo FV', async () => {
    const { kv } = fakeKv();
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    const compute = vi.fn(async () => VIEW);
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
    await r1('NASDAQ:TMDX', async () => VIEW);
    const r2 = createMotorFvResolver({ kv, now: () => T0 + 60_000 });
    const compute2 = vi.fn(async () => VIEW2);
    await expect(r2('NASDAQ:TMDX', compute2)).resolves.toEqual(VIEW);
    expect(compute2).not.toHaveBeenCalled();
  });

  it('vencida la ventana, recomputa y el nuevo FV manda', async () => {
    const { kv } = fakeKv();
    let now = T0;
    const resolve = createMotorFvResolver({ kv, now: () => now });
    await resolve('NASDAQ:TMDX', async () => VIEW);
    now = T0 + MOTOR_FV_TTL_MS + 1;
    await expect(resolve('NASDAQ:TMDX', async () => VIEW2)).resolves.toEqual(VIEW2);
  });

  it('una entrada de KV vencida o inválida no se sirve', async () => {
    const { kv } = fakeKv({
      'NASDAQ:TMDX': { view: VIEW, at: T0 - MOTOR_FV_TTL_MS - 1 },
      'NASDAQ:MU': { view: { fv: -5, fvPesimista: 0, fvOptimista: 0, uncertainty: null } as any, at: T0 },
    });
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    await expect(resolve('NASDAQ:TMDX', async () => VIEW2)).resolves.toEqual(VIEW2);
    await expect(resolve('NASDAQ:MU', async () => VIEW)).resolves.toEqual(VIEW);
  });

  it('un cálculo nulo NO se cachea: el próximo pedido reintenta', async () => {
    const { kv, store } = fakeKv();
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    const compute = vi
      .fn<() => Promise<MotorFvView | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(VIEW);
    await expect(resolve('NASDAQ:TMDX', compute)).resolves.toBeNull();
    await expect(resolve('NASDAQ:TMDX', compute)).resolves.toEqual(VIEW);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(store.has('NASDAQ:TMDX')).toBe(true);
  });

  it('pedidos concurrentes del mismo símbolo comparten el cálculo en curso', async () => {
    const { kv } = fakeKv();
    const resolve = createMotorFvResolver({ kv, now: () => T0 });
    let release!: (v: MotorFvView) => void;
    const compute = vi.fn(
      () => new Promise<MotorFvView>((res) => (release = res))
    );
    const p1 = resolve('NASDAQ:TMDX', compute);
    const p2 = resolve('NASDAQ:TMDX', compute);
    // Dejar correr las continuaciones (memoria → KV → cálculo en curso).
    await new Promise((r) => setTimeout(r, 10));
    release(VIEW);
    await expect(p1).resolves.toEqual(VIEW);
    await expect(p2).resolves.toEqual(VIEW);
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
