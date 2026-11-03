import { describe, expect, it } from 'vitest';
import { parseEdgarCashflow, parseEdgarSeries } from '../edgar.js';

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

  it('extrae la tasa de traducción y la caja USD del par de monedas (TSM)', () => {
    const tsmFacts = {
      facts: {
        'ifrs-full': {
          CashFlowsFromUsedInOperatingActivities: {
            units: {
              TWD: [{ end: '2024-12-31', start: '2024-01-01', val: 1826.18e9, form: '20-F', fp: 'FY', filed: '2025-03-18' }],
              USD: [{ end: '2024-12-31', start: '2024-01-01', val: 55.69e9, form: '20-F', fp: 'FY', filed: '2025-03-18' }],
            },
          },
          CashAndCashEquivalents: {
            units: {
              TWD: [{ end: '2024-12-31', val: 2127.63e9, form: '20-F', fp: '', filed: '2025-03-18' }],
              USD: [{ end: '2024-12-31', val: 64.89e9, form: '20-F', fp: '', filed: '2025-03-18' }],
            },
          },
        },
      },
    };
    const r = parseEdgarCashflow(tsmFacts);
    expect(r).not.toBeNull();
    expect(r!.operatingCashflow).toBeCloseTo(55.69e9, 0);
    expect(r!.totalCash).toBeCloseTo(64.89e9, 0);
    expect(r!.reportingCurrency).toBe('TWD');
    expect(r!.fxRate).toBeCloseTo(2127.63 / 64.89, 2);
    expect(r!.freeCashflow).toBeNull(); // sin concepto de capex en el fixture
  });

  it('sin hechos o sin concepto de OCF devuelve null', () => {
    expect(parseEdgarCashflow(null)).toBeNull();
    expect(parseEdgarCashflow({})).toBeNull();
    expect(parseEdgarCashflow({ facts: { 'us-gaap': {} } })).toBeNull();
  });
});

describe('parseEdgarSeries', () => {
  it('concepto de capex abandonado por el emisor: gana la serie fresca (ProductiveAssets)', () => {
    // El primer concepto de capex solo tiene datos de 2011-2012; el
    // emisor migró a PaymentsToAcquireProductiveAssets. La serie de FCF
    // debe emparejar los cierres actuales, no los de hace una década.
    const facts = {
      facts: {
        'us-gaap': {
          NetCashProvidedByUsedInOperatingActivities: {
            units: {
              USD: [
                { end: '2012-01-29', start: '2011-01-30', val: 0.9e9, form: '10-K', fp: 'FY', filed: '2012-03-01' },
                { end: '2025-01-26', start: '2024-01-29', val: 64.09e9, form: '10-K', fp: 'FY', filed: '2025-02-26' },
                { end: '2026-01-25', start: '2025-01-27', val: 102.72e9, form: '10-K', fp: 'FY', filed: '2026-02-25' },
              ],
            },
          },
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: {
              USD: [
                { end: '2012-01-29', start: '2011-01-30', val: 0.14e9, form: '10-K', fp: 'FY', filed: '2012-03-01' },
              ],
            },
          },
          PaymentsToAcquireProductiveAssets: {
            units: {
              USD: [
                { end: '2025-01-26', start: '2024-01-29', val: 3.24e9, form: '10-K', fp: 'FY', filed: '2025-02-26' },
                { end: '2026-01-25', start: '2025-01-27', val: 6.04e9, form: '10-K', fp: 'FY', filed: '2026-02-25' },
              ],
            },
          },
        },
      },
    };
    const s = parseEdgarSeries(facts);
    expect(s).not.toBeNull();
    expect(s!.fcfHistory).toHaveLength(2);
    expect(s!.fcfHistory[0]).toBeCloseTo(96.68e9, 0);
    expect(s!.fcfHistory[1]).toBeCloseTo(60.85e9, 0);
  });

  it('puntos TTM de 10-Q no desplazan a los años fiscales (fp FY manda)', () => {
    const facts = {
      facts: {
        'us-gaap': {
          NetCashProvidedByUsedInOperatingActivities: {
            units: {
              USD: [
                { end: '2025-09-30', start: '2024-10-01', val: 130e9, form: '10-Q', fp: 'Q3', filed: '2025-10-30' },
                { end: '2024-12-31', start: '2024-01-01', val: 100e9, form: '10-K', fp: 'FY', filed: '2025-01-30' },
                { end: '2025-12-31', start: '2025-01-01', val: 140e9, form: '10-K', fp: 'FY', filed: '2026-01-29' },
              ],
            },
          },
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: {
              USD: [
                { end: '2025-09-30', start: '2024-10-01', val: 120e9, form: '10-Q', fp: 'Q3', filed: '2025-10-30' },
                { end: '2024-12-31', start: '2024-01-01', val: 60e9, form: '10-K', fp: 'FY', filed: '2025-01-30' },
                { end: '2025-12-31', start: '2025-01-01', val: 132e9, form: '10-K', fp: 'FY', filed: '2026-01-29' },
              ],
            },
          },
        },
      },
    };
    const s = parseEdgarSeries(facts);
    expect(s).not.toBeNull();
    // Solo cierres fiscales: 140−132 y 100−60. El TTM 130−120 no aparece.
    expect(s!.fcfHistory).toEqual([8e9, 40e9]);
  });
});

describe('parseEdgarSeries — acciones en circulación (ΔS)', () => {
  it('extrae la serie anual de acciones diluidas, más reciente primero', () => {
    const facts = {
      facts: {
        'us-gaap': {
          WeightedAverageNumberOfSharesOutstandingDiluted: {
            units: {
              shares: [
                { end: '2024-12-31', start: '2024-01-01', val: 100e6, form: '10-K', fp: 'FY', filed: '2025-02-01' },
                { end: '2025-12-31', start: '2025-01-01', val: 112e6, form: '10-K', fp: 'FY', filed: '2026-02-01' },
                { end: '2025-06-30', start: '2025-01-01', val: 110e6, form: '10-Q', fp: 'Q2', filed: '2025-08-01' },
              ],
            },
          },
          NetCashProvidedByUsedInOperatingActivities: {
            units: { USD: [{ end: '2025-12-31', start: '2025-01-01', val: 10e9, form: '10-K', fp: 'FY', filed: '2026-02-01' }] },
          },
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: { USD: [{ end: '2025-12-31', start: '2025-01-01', val: 2e9, form: '10-K', fp: 'FY', filed: '2026-02-01' }] },
          },
        },
      },
    };
    const s = parseEdgarSeries(facts);
    expect(s).not.toBeNull();
    // Solo años fiscales: el punto Q2 (110 M) no entra; ΔS = 112/100 − 1 = +12%.
    expect(s!.sharesHistory).toEqual([112e6, 100e6]);
  });

  it('sin concepto de acciones (emisor extranjero típico), la serie es vacía y el resto sigue', () => {
    const s = parseEdgarSeries({
      facts: {
        'us-gaap': {
          EarningsPerShareDiluted: {
            units: { USD: [{ end: '2025-12-31', start: '2025-01-01', val: 2.5, form: '20-F', fp: 'FY', filed: '2026-03-01' }] },
          },
        },
      },
    });
    expect(s?.sharesHistory).toEqual([]);
    expect(s?.epsHistory).toEqual([2.5]);
  });
});

describe('parseEdgarSeries — EPS en unidades USD/shares', () => {
  it('lee el EPS diluido de la unidad USD/shares (la USD a secas lo dejaba vacío)', () => {
    const facts = {
      facts: {
        'us-gaap': {
          EarningsPerShareDiluted: {
            units: {
              'USD/shares': [
                { end: '2024-12-31', start: '2024-01-01', val: 1.25, form: '10-K', fp: 'FY', filed: '2025-02-01' },
                { end: '2025-12-31', start: '2025-01-01', val: 2.5, form: '10-K', fp: 'FY', filed: '2026-02-01' },
              ],
            },
          },
          NetCashProvidedByUsedInOperatingActivities: {
            units: { USD: [{ end: '2025-12-31', start: '2025-01-01', val: 10e9, form: '10-K', fp: 'FY', filed: '2026-02-01' }] },
          },
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: { USD: [{ end: '2025-12-31', start: '2025-01-01', val: 2e9, form: '10-K', fp: 'FY', filed: '2026-02-01' }] },
          },
        },
      },
    };
    const s = parseEdgarSeries(facts);
    expect(s!.epsHistory).toEqual([2.5, 1.25]);
  });
});
