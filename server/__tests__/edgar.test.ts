import { describe, expect, it } from 'vitest';
import { parseEdgarCashflow, parseEdgarSeries, parseEdgarTtmCashflow } from '../edgar.js';

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
  it('emisor IFRS (20-F): el capex «…ClassifiedAsInvestingActivities» arma la serie de FCF', () => {
    // Patrón de las petroleras latinoamericanas que reportan en
    // ifrs-full: el OCF se llama CashFlowsFromUsedInOperatingActivities
    // y el capex PurchaseOfPropertyPlantAndEquipmentClassifiedAs… —
    // sin ese nombre de concepto la serie salía vacía y el DCF caía a
    // la foto TTM sin normalizar (hallazgo VIST, adenda R9). Valores
    // sintéticos del mismo orden que los reales auditados.
    const facts = {
      facts: {
        'ifrs-full': {
          CashFlowsFromUsedInOperatingActivities: {
            units: {
              USD: [
                { end: '2022-12-31', start: '2022-01-01', val: 690e6, form: '20-F', fp: 'FY', filed: '2023-04-01' },
                { end: '2023-12-31', start: '2023-01-01', val: 712e6, form: '20-F', fp: 'FY', filed: '2024-04-01' },
                { end: '2024-12-31', start: '2024-01-01', val: 959e6, form: '20-F', fp: 'FY', filed: '2025-04-01' },
              ],
            },
          },
          PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities: {
            units: {
              USD: [
                { end: '2022-12-31', start: '2022-01-01', val: 479e6, form: '20-F', fp: 'FY', filed: '2023-04-01' },
                { end: '2023-12-31', start: '2023-01-01', val: 688e6, form: '20-F', fp: 'FY', filed: '2024-04-01' },
                { end: '2024-12-31', start: '2024-01-01', val: 1053e6, form: '20-F', fp: 'FY', filed: '2025-04-01' },
              ],
            },
          },
          DilutedEarningsLossPerShare: {
            units: {
              'USD/shares': [
                { end: '2023-12-31', start: '2023-01-01', val: 4.0, form: '20-F', fp: 'FY', filed: '2024-04-01' },
                { end: '2024-12-31', start: '2024-01-01', val: 4.63, form: '20-F', fp: 'FY', filed: '2025-04-01' },
              ],
            },
          },
        },
      },
    };
    const s = parseEdgarSeries(facts);
    expect(s).not.toBeNull();
    // FCF = OCF − capex, más reciente primero: 2024 negativo (capex de
    // crecimiento por encima del OCF), 2023 chico, 2022 sano.
    expect(s!.fcfHistory).toHaveLength(3);
    expect(s!.fcfHistory[0]).toBeCloseTo(-94e6, 0);
    expect(s!.fcfHistory[1]).toBeCloseTo(24e6, 0);
    expect(s!.fcfHistory[2]).toBeCloseTo(211e6, 0);
    // Y el EPS IFRS (EarningsLossPerShare) también se lee.
    expect(s!.epsHistory).toEqual([4.63, 4.0]);
  });

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

// ─── R12.3: derivación TTM desde estados reportados ──────────────────
// Fuente primaria del ANCLA DE CAJA REAL: la ventana móvil se
// reconstruye desde los puntos reportados, no del campo TTM de un
// proveedor (que para GOOG devolvía el signo invertido).

const pt = (start: string, end: string, val: number, filed = '2026-10-30') => ({ start, end, val, form: '10-Q', fp: 'Q3', filed });

// Filer con 10-Q (estilo GOOG): FY cerrado + acumulados YTD de ambos años.
const googTtmFacts = {
  facts: {
    'us-gaap': {
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            pt('2025-01-01', '2025-12-31', 164.7e9, '2026-02-05'),
            pt('2025-01-01', '2025-09-30', 120.1e9, '2025-10-30'),
            pt('2026-01-01', '2026-03-31', 40.0e9, '2026-04-30'),
            pt('2026-01-01', '2026-09-30', 134.9e9, '2026-10-29'),
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            pt('2025-01-01', '2025-12-31', 91.4e9, '2026-02-05'),
            pt('2025-01-01', '2025-09-30', 64.1e9, '2025-10-30'),
            pt('2026-01-01', '2026-09-30', 132.5e9, '2026-10-29'),
          ],
        },
      },
    },
  },
};

// Filer con puntos RODANTES tageados y concepto de capex migrado
// (estilo AMZN): el concepto viejo no tiene puntos desde 2017 y NO
// debe ganar; sin YTD del año anterior, la fórmula no se puede armar
// y manda el rodante reportado.
const amznTtmFacts = {
  facts: {
    'us-gaap': {
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            pt('2025-01-01', '2025-12-31', 139.5e9, '2026-02-05'),
            pt('2026-01-01', '2026-09-30', 141.2e9),
            pt('2025-10-01', '2026-09-30', 168.3e9),
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            pt('2016-01-01', '2016-12-31', 7.0e9, '2017-02-15'),
            pt('2017-01-01', '2017-03-31', 2.0e9, '2017-04-28'),
          ],
        },
      },
      PaymentsToAcquireProductiveAssets: {
        units: {
          USD: [pt('2026-01-01', '2026-09-30', 175.7e9), pt('2025-10-01', '2026-09-30', 215.2e9)],
        },
      },
    },
  },
};

// Filer 20-F solo con años fiscales (estilo SIMO): la derivación
// devuelve la ventana del año fiscal, marcada 'fy' — NO un TTM.
const simoAnnualFacts = {
  facts: {
    'us-gaap': {
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            pt('2024-01-01', '2024-12-31', 77.1e6, '2025-04-30'),
            pt('2025-01-01', '2025-12-31', 61.4e6, '2026-04-30'),
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            pt('2024-01-01', '2024-12-31', 44.4e6, '2025-04-30'),
            pt('2025-01-01', '2025-12-31', 55.1e6, '2026-04-30'),
          ],
        },
      },
    },
  },
};

describe('parseEdgarTtmCashflow (R12.3)', () => {
  it('filer 10-Q: reconstruye el TTM con FY + YTD − YTDpy (estilo GOOG)', () => {
    const r = parseEdgarTtmCashflow(googTtmFacts);
    expect(r).not.toBeNull();
    expect(r!.windowKind).toBe('ttm');
    expect(r!.periodEnd).toBe('2026-09-30');
    expect(r!.operatingCashflow).toBeCloseTo(179.5e9, 0);
    expect(r!.capex).toBeCloseTo(159.8e9, 0);
    expect(r!.freeCashflow).toBeCloseTo(19.7e9, 0);
  });

  it('punto rodante reportado + concepto de capex migrado: gana el vigente (estilo AMZN)', () => {
    const r = parseEdgarTtmCashflow(amznTtmFacts);
    expect(r).not.toBeNull();
    expect(r!.windowKind).toBe('ttm');
    expect(r!.periodEnd).toBe('2026-09-30');
    expect(r!.operatingCashflow).toBeCloseTo(168.3e9, 0);
    expect(r!.capex).toBeCloseTo(215.2e9, 0);
    expect(r!.freeCashflow).toBeCloseTo(-46.9e9, 0);
  });

  it('solo años fiscales: devuelve la ventana FY marcada como tal, no un TTM (estilo SIMO)', () => {
    const r = parseEdgarTtmCashflow(simoAnnualFacts);
    expect(r).not.toBeNull();
    expect(r!.windowKind).toBe('fy');
    expect(r!.periodEnd).toBe('2025-12-31');
    expect(r!.freeCashflow).toBeCloseTo(6.3e6, 0);
  });

  it('capex sin puntos en la ventana vigente: no deriva (una ventana vieja no es un TTM)', () => {
    const facts = {
      facts: {
        'us-gaap': {
          NetCashProvidedByUsedInOperatingActivities: googTtmFacts.facts['us-gaap'].NetCashProvidedByUsedInOperatingActivities,
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: { USD: [pt('2024-01-01', '2024-12-31', 50.0e9, '2025-03-01')] },
          },
        },
      },
    };
    expect(parseEdgarTtmCashflow(facts)).toBeNull();
  });

  it('sin unidades USD: deriva en la moneda de reporte y traduce con el par de caja', () => {
    const facts = {
      facts: {
        'us-gaap': {
          CashAndCashEquivalentsAtCarryingValue: {
            units: {
              USD: [{ end: '2025-12-31', val: 100e9, form: '20-F', fp: 'FY', filed: '2026-03-01' }],
              AUD: [{ end: '2025-12-31', val: 200e9, form: '20-F', fp: 'FY', filed: '2026-03-01' }],
            },
          },
          NetCashProvidedByUsedInOperatingActivities: {
            units: {
              AUD: [
                pt('2025-01-01', '2025-12-31', 329.4e9, '2026-03-01'),
                pt('2025-01-01', '2025-09-30', 240.2e9, '2025-11-15'),
                pt('2026-01-01', '2026-09-30', 269.8e9, '2026-11-15'),
              ],
            },
          },
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: {
              AUD: [
                pt('2025-01-01', '2025-12-31', 182.8e9, '2026-03-01'),
                pt('2025-01-01', '2025-09-30', 128.2e9, '2025-11-15'),
                pt('2026-01-01', '2026-09-30', 265.0e9, '2026-11-15'),
              ],
            },
          },
        },
      },
    };
    const r = parseEdgarTtmCashflow(facts);
    expect(r).not.toBeNull();
    expect(r!.windowKind).toBe('ttm');
    // (329,4 + 269,8 − 240,2) / 2 = 179,5 ; (182,8 + 265,0 − 128,2) / 2 = 159,8
    expect(r!.operatingCashflow).toBeCloseTo(179.5e9, 0);
    expect(r!.freeCashflow).toBeCloseTo(19.7e9, 0);
  });

  it('sin facts utilizables → null', () => {
    expect(parseEdgarTtmCashflow(null)).toBeNull();
    expect(parseEdgarTtmCashflow({ facts: {} })).toBeNull();
  });
});
