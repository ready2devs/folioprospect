import type { NwComputedResult, NwSettings } from './types.js';

export const DEFAULT_NW_SETTINGS: NwSettings = {
  brokerCashUsd: 0,
  cashReserveUsd: 0,
  includeCryptoInCcl: false,
  cclOverride: null,
  mepOverride: null,
  cclBaseOverride: null,
  sellCommPct: 0.5,
  mepBuyCommPct: 0.5,
  mepSellCommPct: 0.5,
  fxDiffOverride: null,
};

export function computeNwPatrimony(params: {
  holdings: { value: number; assetType: string }[];
  grossHoldingsUsd: number;
  illiquidTotalUsd?: number;
  cclLive: number;
  mepLive: number;
  settings: NwSettings;
}): NwComputedResult {
  const {
    holdings,
    grossHoldingsUsd,
    illiquidTotalUsd = 0,
    cclLive,
    mepLive,
    settings,
  } = params;

  const brokerCashUsd = Number.isFinite(settings.brokerCashUsd) ? settings.brokerCashUsd : 0;
  const cashReserveUsd = Number.isFinite(settings.cashReserveUsd) ? settings.cashReserveUsd : 0;
  const financialPortfolioLiquidUsd = grossHoldingsUsd + brokerCashUsd;

  const cclBaseAutoUsd = holdings.reduce((sum, h) => {
    if (!settings.includeCryptoInCcl && h.assetType === 'Crypto') {
      return sum;
    }
    return sum + (Number.isFinite(h.value) ? h.value : 0);
  }, 0);

  const cclBaseUsd =
    settings.cclBaseOverride != null && Number.isFinite(settings.cclBaseOverride)
      ? settings.cclBaseOverride
      : cclBaseAutoUsd;

  const cclRate =
    settings.cclOverride != null && Number.isFinite(settings.cclOverride) && settings.cclOverride > 0
      ? settings.cclOverride
      : cclLive > 0
      ? cclLive
      : 1637.9;

  const mepRate =
    settings.mepOverride != null && Number.isFinite(settings.mepOverride) && settings.mepOverride > 0
      ? settings.mepOverride
      : mepLive > 0
      ? mepLive
      : 1553.6;

  const gapPct = mepRate > 0 ? (cclRate / mepRate - 1) * 100 : 0;

  const sellCommPct = Math.max(0, Number.isFinite(settings.sellCommPct) ? settings.sellCommPct : 0.5);
  const mepBuyCommPct = Math.max(
    0,
    Number.isFinite(settings.mepBuyCommPct) ? settings.mepBuyCommPct : 0.5
  );
  const mepSellCommPct = Math.max(
    0,
    Number.isFinite(settings.mepSellCommPct) ? settings.mepSellCommPct : 0.5
  );

  const commissionFactor =
    (1 - sellCommPct / 100) * (1 - mepBuyCommPct / 100) * (1 - mepSellCommPct / 100);
  const totalCommPct = (1 - commissionFactor) * 100;

  const usdMepObtained =
    mepRate > 0 ? cclBaseUsd * (cclRate / mepRate) * commissionFactor : cclBaseUsd;
  const fxDiffAutoUsd = usdMepObtained - cclBaseUsd;
  const fxDiffUsd =
    settings.fxDiffOverride != null && Number.isFinite(settings.fxDiffOverride)
      ? settings.fxDiffOverride
      : fxDiffAutoUsd;

  const nwLiquidUsd = financialPortfolioLiquidUsd + cashReserveUsd + fxDiffUsd;
  const nwTotalUsd = nwLiquidUsd + illiquidTotalUsd;

  return {
    grossHoldingsUsd,
    brokerCashUsd,
    financialPortfolioLiquidUsd,
    cclBaseAutoUsd,
    cclBaseUsd,
    cclRate,
    mepRate,
    gapPct,
    commissionFactor,
    totalCommPct,
    usdMepObtained,
    fxDiffAutoUsd,
    fxDiffUsd,
    cashReserveUsd,
    nwLiquidUsd,
    illiquidTotalUsd,
    nwTotalUsd,
  };
}
