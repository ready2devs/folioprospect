import { describe, expect, it, vi } from 'vitest';
import {
  createSectorCtxResolver,
  sectorCtxCompleteness,
  SECTOR_CTX_FRESH_MS,
  SECTOR_CTX_KEEP_MS,
  type SectorCtxKvStore,
  type SectorCtxSnapshotEntry,
} from '../sectorCtxSnapshot.js';
import type { SectorContext } from '../sectorContext.js';

// SPEC-006, enmienda v14: el contexto sectorial es UNA foto por
// industria compartida entre instancias, y la COMPLETITUD manda
// sobre la novedad — el defecto del caso TMDX (2026-11-15) fue que
// una corrida sin la mediana de crecimiento del sector derrumbaba
// el ajuste del múltiplo (1,6 → 1,0) y el FV saltaba 96,94 → 80,36.

const COMPLETE: SectorContext = {
  forwardPe: 22.0,
  roicPct: 7.2,
  growth5yPct: 9.7,
  peersUsed: 6,
  industrySlug: 'medicaldevices',
  source: 'tradingview',
};
const PARTIAL_NO_GROWTH: SectorContext = { ...COMPLETE, growth5yPct: null, forwardPe: 21.87 };
const PARTIAL_NO_ROIC: SectorContext = { ...COMPLETE, roicPct: null };
const T0 = 1_700_000_000_000;

function fakeKv(seed: Record<string, SectorCtxSnapshotEntry> = {}) {
  const store = new Map(Object.entries(seed));
  const kv: SectorCtxKvStore = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, e: SectorCtxSnapshotEntry) => {
      store.set(k, e);
    }),
  };
  return { kv, store };
}

describe('sectorCtxCompleteness', () => {
  it('cuenta los campos presentes', () => {
    expect(sectorCtxCompleteness(COMPLETE)).toBe(3);
    expect(sectorCtxCompleteness(PARTIAL_NO_GROWTH)).toBe(2);
    expect(sectorCtxCompleteness(null)).toBe(-1);
  });
});

describe('createSectorCtxResolver · foto compartida del contexto sectorial', () => {
  it('dentro de la ventana fresca no recomputa', async () => {
    const { kv } = fakeKv();
    const resolve = createSectorCtxResolver({ kv, now: () => T0 });
    const compute = vi.fn(async () => COMPLETE);
    await resolve('medicaldevices', compute);
    await resolve('medicaldevices', compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('una instancia nueva lee del KV el contexto que computó otra', async () => {
    const { kv } = fakeKv();
    const r1 = createSectorCtxResolver({ kv, now: () => T0 });
    await r1('medicaldevices', async () => COMPLETE);
    const r2 = createSectorCtxResolver({ kv, now: () => T0 + 60_000 });
    const compute2 = vi.fn(async () => PARTIAL_NO_GROWTH);
    await expect(r2('medicaldevices', compute2)).resolves.toEqual(COMPLETE);
    expect(compute2).not.toHaveBeenCalled();
  });

  it('LA REGLA DEL CASO TMDX: un cómputo parcial NO desplaza al contexto completo guardado', async () => {
    const { kv } = fakeKv({
      medicaldevices: { ctx: COMPLETE, at: T0 },
    });
    // La foto guardada ya venció la ventana fresca: toca recomputar,
    // pero la corrida nueva trae el contexto SIN crecimiento.
    const resolve = createSectorCtxResolver({
      kv,
      now: () => T0 + SECTOR_CTX_FRESH_MS + 1000,
    });
    const out = await resolve('medicaldevices', async () => PARTIAL_NO_GROWTH);
    expect(out).toEqual(COMPLETE);
  });

  it('un cómputo igual de completo SÍ reemplaza al guardado vencido', async () => {
    const { kv } = fakeKv({
      medicaldevices: { ctx: COMPLETE, at: T0 },
    });
    const fresh: SectorContext = { ...COMPLETE, forwardPe: 23.5 };
    const resolve = createSectorCtxResolver({
      kv,
      now: () => T0 + SECTOR_CTX_FRESH_MS + 1000,
    });
    await expect(resolve('medicaldevices', async () => fresh)).resolves.toEqual(fresh);
  });

  it('un cómputo más completo reemplaza a una foto parcial guardada', async () => {
    const { kv } = fakeKv({
      medicaldevices: { ctx: PARTIAL_NO_ROIC, at: T0 },
    });
    const resolve = createSectorCtxResolver({
      kv,
      now: () => T0 + SECTOR_CTX_FRESH_MS + 1000,
    });
    await expect(resolve('medicaldevices', async () => COMPLETE)).resolves.toEqual(COMPLETE);
  });

  it('pasada la ventana de guarda (24 h), manda el cómputo nuevo aunque sea parcial', async () => {
    const { kv } = fakeKv({
      medicaldevices: { ctx: COMPLETE, at: T0 },
    });
    const resolve = createSectorCtxResolver({
      kv,
      now: () => T0 + SECTOR_CTX_KEEP_MS + 1000,
    });
    await expect(
      resolve('medicaldevices', async () => PARTIAL_NO_GROWTH)
    ).resolves.toEqual(PARTIAL_NO_GROWTH);
  });

  it('sin nada guardado y cómputo nulo, devuelve null sin guardar foto', async () => {
    const { kv, store } = fakeKv();
    const resolve = createSectorCtxResolver({ kv, now: () => T0 });
    await expect(resolve('medicaldevices', async () => null)).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it('pedidos concurrentes comparten un solo cómputo', async () => {
    const { kv } = fakeKv();
    const resolve = createSectorCtxResolver({ kv, now: () => T0 });
    let release!: (v: SectorContext) => void;
    const compute = vi.fn(
      () => new Promise<SectorContext>((res) => (release = res))
    );
    const p1 = resolve('medicaldevices', compute);
    const p2 = resolve('medicaldevices', compute);
    await new Promise((r) => setTimeout(r, 10));
    release(COMPLETE);
    await expect(p1).resolves.toEqual(COMPLETE);
    await expect(p2).resolves.toEqual(COMPLETE);
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
