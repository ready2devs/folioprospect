import { describe, expect, it } from 'vitest';
import { parseEdgarCashflow } from '../edgar.js';

// Fixture estilo SIMO (us-gaap): anuales USD + unidades TWD a ignorar,
// duplicados por re-presentación y un interino semestral que no debe ganar.
const simoFacts = {
  facts: {
    'us-gaap': {
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          TWD: [{ end: '2011-12-31', start: '2011-01-01', val: 1562.3e6, form: '20-F/A', fp: 'FY', filed: '2012-06-01' }],
          USD: [
            { end: '2024-12-31', start: '2024-01-01', val: 77.1e6, form: '20-F', fp: 'FY', filed: '2025-04-30' },
            { end: '2025-12-31', start: '2025-01-01', val: 61.4e6, form: '20-F', fp: 'FY', filed: '2026-04-30' },
            { end: '2025-06-30', start: '2025-01-01', val: 999e6, form: '6-K', fp: '', filed: '2025-09-01' },
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            { end: '2024-12-31', start: '2024-01-01', val: 44.4e6, form: '20-F', fp: 'FY', filed: '2025-04-30' },
            { end: '2025-12-31', start: '2025-01-01', val: 55.1e6, form: '20-F', fp: 'FY', filed: '2026-04-30' },
          ],
        },
      },
    },
  },
};

// Fixture estilo NU (ifrs-full): solo OCF, sin concepto de capex.
const nuFacts = {
  facts: {
    'ifrs-full': {
      CashFlowsFromUsedInOperatingActivities: {
        units: {
          USD: [
            { end: '2023-12-31', start: '2023-01-01', val: 1266.2e6, form: '20-F', fp: 'FY', filed: '2024-04-25' },
            { end: '2024-12-31', start: '2024-01-01', val: 2399.0e6, form: '20-F', fp: 'FY', filed: '2025-04-24' },
          ],
        },
      },
    },
  },
};

describe('parseEdgarCashflow', () => {
  it('toma el último año fiscal USD y calcula FCF = OCF − capex (SIMO)', () => {
    const r = parseEdgarCashflow(simoFacts);
    expect(r).not.toBeNull();
    expect(r!.fiscalYearEnd).toBe('2025-12-31');
    expect(r!.operatingCashflow).toBeCloseTo(61.4e6, 0);
    expect(r!.capex).toBeCloseTo(55.1e6, 0);
    expect(r!.freeCashflow).toBeCloseTo(6.3e6, 0);
  });

  it('sin capex en la taxonomía IFRS devuelve OCF y FCF null (NU)', () => {
    const r = parseEdgarCashflow(nuFacts);
    expect(r).not.toBeNull();
    expect(r!.operatingCashflow).toBeCloseTo(2399.0e6, 0);
    expect(r!.capex).toBeNull();
    expect(r!.freeCashflow).toBeNull();
  });

  it('sin hechos o sin concepto de OCF devuelve null', () => {
    expect(parseEdgarCashflow(null)).toBeNull();
    expect(parseEdgarCashflow({})).toBeNull();
    expect(parseEdgarCashflow({ facts: { 'us-gaap': {} } })).toBeNull();
  });
});
