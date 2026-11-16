import { describe, expect, it } from 'vitest';
import {
  sectorContextFromPeerRecords,
  type SectorPeerRecord,
} from '../sectorContext.js';

// SPEC-006, enmienda v16: el contexto sectorial se mide por par con
// Finviz primario y Yahoo de respaldo por métrica (la fusión ya
// ocurrió al armar cada registro); acá se prueba el armado de las
// medianas desde los registros: muestras por métrica independientes,
// P/E con mínimo de 2 y el ROE contando como retorno sobre el
// capital de respaldo.

const rec = (p: Partial<SectorPeerRecord>): SectorPeerRecord => ({
  forwardPe: null,
  growth5yPct: null,
  capitalReturnPct: null,
  capitalFromRoe: false,
  ...p,
});

describe('sectorContextFromPeerRecords · medianas multi-fuente', () => {
  it('mediana por métrica sobre su propia muestra (un par puede aportar a una y no a otra)', () => {
    const ctx = sectorContextFromPeerRecords(
      [
        rec({ forwardPe: 20, growth5yPct: 10, capitalReturnPct: 15 }),
        rec({ forwardPe: 24, capitalReturnPct: 17 }),
        rec({ forwardPe: 28, growth5yPct: 14 }),
        rec({}),
      ],
      'medicaldevices',
      'finviz'
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.forwardPe).toBe(24);
    expect(ctx!.growth5yPct).toBe(12);
    expect(ctx!.roicPct).toBe(16);
    expect(ctx!.peersUsed).toBe(3);
    expect(ctx!.samples).toEqual({ pe: 3, growth: 2, capital: 2, capitalFromRoe: 0 });
  });

  it('el crecimiento existe aunque solo lo traiga el respaldo de Yahoo de algunos pares (caso TMDX)', () => {
    const ctx = sectorContextFromPeerRecords(
      [
        rec({ forwardPe: 21 }),
        rec({ forwardPe: 23, growth5yPct: 9 }),
        rec({ forwardPe: 22, growth5yPct: 11 }),
      ],
      'medicaldevices',
      'tradingview'
    );
    expect(ctx!.growth5yPct).toBe(10);
    expect(ctx!.samples!.growth).toBe(2);
  });

  it('el ROE de respaldo alimenta el retorno sobre el capital y queda contado', () => {
    const ctx = sectorContextFromPeerRecords(
      [
        rec({ forwardPe: 20, capitalReturnPct: 30, capitalFromRoe: true }),
        rec({ forwardPe: 22, capitalReturnPct: 10 }),
      ],
      'software',
      'finviz'
    );
    expect(ctx!.roicPct).toBe(20);
    expect(ctx!.samples).toEqual({ pe: 2, growth: 0, capital: 2, capitalFromRoe: 1 });
  });

  it('P/E sectorial exige ≥2 valores; con 1 queda null pero el resto del contexto vive', () => {
    const ctx = sectorContextFromPeerRecords(
      [rec({ forwardPe: 20, growth5yPct: 8, capitalReturnPct: 12 }), rec({ growth5yPct: 9 })],
      'software',
      'finviz'
    );
    expect(ctx!.forwardPe).toBeNull();
    expect(ctx!.growth5yPct).toBe(8.5);
    expect(ctx!.roicPct).toBe(12);
  });

  it('sin ningún dato útil no hay contexto', () => {
    expect(sectorContextFromPeerRecords([rec({}), rec({})], 'x', 'finviz')).toBeNull();
    expect(sectorContextFromPeerRecords([], 'x', 'finviz')).toBeNull();
  });

  it('P/E no positivo no entra en la muestra', () => {
    const ctx = sectorContextFromPeerRecords(
      [rec({ forwardPe: -3 }), rec({ forwardPe: 0 }), rec({ forwardPe: 18 }), rec({ forwardPe: 20 })],
      'x',
      'finviz'
    );
    expect(ctx!.forwardPe).toBe(19);
    expect(ctx!.samples!.pe).toBe(2);
  });
});
