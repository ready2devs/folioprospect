import { describe, it, expect } from 'vitest';
import { financialCompositionShares } from '../nw.js';

describe('financialCompositionShares — % de Tenencias Brutas y Cash Comitente', () => {
  it('caso normal (valores reales del dueño): los dos % suman ~100', () => {
    const shares = financialCompositionShares(158986, 4734);
    expect(shares).not.toBeNull();
    expect(shares!.grossPct).toBeCloseTo(97.1, 1);
    expect(shares!.cashPct).toBeCloseTo(2.9, 1);
    expect(shares!.grossPct + shares!.cashPct).toBeCloseTo(100, 10);
  });

  it('base 0 → sin porcentaje (null)', () => {
    expect(financialCompositionShares(0, 0)).toBeNull();
  });

  it('base negativa → sin porcentaje (null)', () => {
    expect(financialCompositionShares(-100, 50)).toBeNull();
  });

  it('valores no finitos → sin porcentaje (null)', () => {
    expect(financialCompositionShares(NaN, 100)).toBeNull();
    expect(financialCompositionShares(100, Infinity)).toBeNull();
  });

  it('cash 0 → 0% de cash y 100% de tenencias', () => {
    const shares = financialCompositionShares(1000, 0);
    expect(shares).not.toBeNull();
    expect(shares!.cashPct).toBe(0);
    expect(shares!.grossPct).toBe(100);
  });

  it('tenencias 0 → 0% de tenencias y 100% de cash', () => {
    const shares = financialCompositionShares(0, 250);
    expect(shares).not.toBeNull();
    expect(shares!.grossPct).toBe(0);
    expect(shares!.cashPct).toBe(100);
  });
});
