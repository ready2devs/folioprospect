import { describe, it, expect } from 'vitest';
import { computeNwPatrimony, DEFAULT_NW_SETTINGS } from '../nw.js';

describe('NW Líquido & CCL/MEP FX Difference Engine (FP-130..FP-133)', () => {
  const sampleHoldings = [
    { value: 150000, assetType: 'Stock' },
    { value: 23361.55, assetType: 'Dr' },
    { value: 7315.07, assetType: 'Crypto' },
  ];
  const grossHoldingsUsd = 180676.62;

  it('computes default CCL base (excluding Crypto), commission factor (0.5% + 0.5% + 0.5%) and FX diff', () => {
    const res = computeNwPatrimony({
      holdings: sampleHoldings,
      grossHoldingsUsd,
      illiquidTotalUsd: 45000,
      cclLive: 1637.9,
      mepLive: 1553.6,
      settings: DEFAULT_NW_SETTINGS,
    });

    // Excludes Crypto by default: 150000 + 23361.55 = 173361.55
    expect(res.cclBaseAutoUsd).toBeCloseTo(173361.55, 2);
    expect(res.cclBaseUsd).toBeCloseTo(173361.55, 2);

    // Commission factor = 0.995 * 0.995 * 0.995 = 0.985074875
    expect(res.commissionFactor).toBeCloseTo(0.985074875, 6);
    expect(res.totalCommPct).toBeCloseTo(1.4925, 3);

    // USD MEP obtained = 173361.55 * (1637.9 / 1553.6) * 0.985074875 = 180040.49
    expect(res.usdMepObtained).toBeCloseTo(180040.49, 1);
    expect(res.fxDiffAutoUsd).toBeCloseTo(6678.94, 1);
    expect(res.fxDiffUsd).toBeCloseTo(6678.94, 1);

    // NW Liquid = 180676.62 + 0 + 6678.94 = 187355.56
    expect(res.nwLiquidUsd).toBeCloseTo(187355.56, 1);
    // NW Total = NW Liquid + 45000 illiquid
    expect(res.nwTotalUsd).toBeCloseTo(232355.56, 1);
  });

  it('supports brokerCashUsd, cashReserveUsd, includeCryptoInCcl and manual cell overrides', () => {
    const res = computeNwPatrimony({
      holdings: sampleHoldings,
      grossHoldingsUsd,
      illiquidTotalUsd: 10000,
      cclLive: 1637.9,
      mepLive: 1553.6,
      settings: {
        ...DEFAULT_NW_SETTINGS,
        brokerCashUsd: 2500,
        cashReserveUsd: 5000,
        includeCryptoInCcl: true,
        fxDiffOverride: 7000,
      },
    });

    expect(res.cclBaseAutoUsd).toBeCloseTo(180676.62, 2);
    expect(res.financialPortfolioLiquidUsd).toBeCloseTo(183176.62, 2);
    expect(res.fxDiffUsd).toBe(7000);
    expect(res.nwLiquidUsd).toBeCloseTo(183176.62 + 5000 + 7000, 2);
    expect(res.nwTotalUsd).toBeCloseTo(195176.62 + 10000, 2);
  });
});
