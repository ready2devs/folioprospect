import { describe, expect, it } from 'vitest';
import { EMPTY_FINVIZ, type FinvizFundamentals } from '@shared/engine/finvizParse';
import type { AssetDetailResponse, AssetExtras } from '../api';
import { mergeAssetDetailPreservingExtras } from '../assetDetailMerge';

const finviz = (over: Partial<FinvizFundamentals>): FinvizFundamentals => ({
  ...EMPTY_FINVIZ,
  ...over,
});

const extras = (over: Partial<AssetExtras>): AssetExtras =>
  ({
    targetLow: null,
    targetMean: null,
    targetMedian: null,
    targetHigh: null,
    analystCount: null,
    strongBuy: null,
    buy: null,
    hold: null,
    sell: null,
    strongSell: null,
    dividendYieldPct: null,
    forwardDividendYieldPct: null,
    marketCap: null,
    trailingPE: null,
    forwardPE: null,
    pegRatio: null,
    priceToSales: null,
    priceToBook: null,
    priceToFreeCashFlow: null,
    fcfYieldPct: null,
    roePct: null,
    roaPct: null,
    debtToEquity: null,
    shortFloatPct: null,
    evToEbitda: null,
    earningsGrowthPct: null,
    revenueGrowthPct: null,
    epsNextYearGrowthPct: null,
    epsNext5YGrowthPct: null,
    profitMarginPct: null,
    grossMarginPct: null,
    operatingMarginPct: null,
    roicProxyPct: null,
    roicPct: null,
    finviz: null,
    currentRatio: null,
    quickRatio: null,
    beta: null,
    epsTrailing: null,
    ceo: '',
    employees: null,
    hq: '',
    website: '',
    businessSummary: '',
    ...over,
  }) as AssetExtras;

const detail = (
  symbol: string,
  price: number,
  detailExtras?: AssetExtras
): AssetDetailResponse =>
  ({
    symbol,
    quote: { price },
    extras: detailExtras,
  }) as unknown as AssetDetailResponse;

describe('mergeAssetDetailPreservingExtras', () => {
  it('un refresco sin Finviz no borra los ratios ya conocidos', () => {
    const previous = detail(
      'NASDAQ:XYZ',
      100,
      extras({
        targetMean: 150,
        debtToEquity: 0.01,
        quickRatio: 2.07,
        finviz: finviz({
          debtToEquity: 0.01,
          ltDebtToEquity: 0.01,
          cashPerShare: 36.59,
          bookPerShare: 125.93,
          enterpriseValue: 120_920_000_000,
          sales: 28_970_000_000,
          income: 19_420_000_000,
          insiderOwnPct: 1.3,
          insiderTransPct: -4.2,
          instOwnPct: 82.5,
          instTransPct: 4.9,
          shortRatio: 0.45,
          rsi14: 33.93,
          volatilityMonthPct: 8.1,
        }),
      })
    );
    const degraded = detail(
      'NASDAQ:XYZ',
      101,
      extras({
        targetMean: null,
        // El respaldo Yahoo trae valores no nulos: a nivel extras manda
        // el dato nuevo, pero el catálogo Finviz preservado es el que
        // OpportunitySheet prefiere para estos ratios.
        debtToEquity: 1.11,
        quickRatio: 1.99,
        finviz: null,
      })
    );

    const merged = mergeAssetDetailPreservingExtras(previous, degraded);

    expect(merged.quote.price).toBe(101);
    expect(merged.extras?.targetMean).toBe(150);
    expect(merged.extras?.finviz?.debtToEquity).toBe(0.01);
    expect(merged.extras?.finviz?.ltDebtToEquity).toBe(0.01);
    expect(merged.extras?.finviz?.cashPerShare).toBe(36.59);
    expect(merged.extras?.finviz?.bookPerShare).toBe(125.93);
    expect(merged.extras?.finviz?.enterpriseValue).toBe(120_920_000_000);
    expect(merged.extras?.finviz?.sales).toBe(28_970_000_000);
    expect(merged.extras?.finviz?.income).toBe(19_420_000_000);
    expect(merged.extras?.finviz?.insiderOwnPct).toBe(1.3);
    expect(merged.extras?.finviz?.instOwnPct).toBe(82.5);
    expect(merged.extras?.finviz?.shortRatio).toBe(0.45);
    expect(merged.extras?.finviz?.rsi14).toBe(33.93);
    expect(merged.extras?.finviz?.volatilityMonthPct).toBe(8.1);
  });

  it('los valores nuevos no nulos actualizan y los nulos de un Finviz parcial no borran', () => {
    const previous = detail(
      'NASDAQ:XYZ',
      100,
      extras({
        targetMean: 150,
        quickRatio: 2.07,
        finviz: finviz({ bookPerShare: 125.93, rsi14: 33.93 }),
      })
    );
    const fresh = detail(
      'NASDAQ:XYZ',
      102,
      extras({
        targetMean: 155,
        quickRatio: 2.11,
        finviz: finviz({ bookPerShare: null, rsi14: 40.25 }),
      })
    );

    const merged = mergeAssetDetailPreservingExtras(previous, fresh);

    expect(merged.extras?.targetMean).toBe(155);
    expect(merged.extras?.quickRatio).toBe(2.11);
    expect(merged.extras?.finviz?.rsi14).toBe(40.25);
    expect(merged.extras?.finviz?.bookPerShare).toBe(125.93);
  });

  it('si la respuesta nueva no trae extras, conserva los anteriores del mismo símbolo', () => {
    const previousExtras = extras({
      debtToEquity: 0.01,
      finviz: finviz({ ltDebtToEquity: 0.01 }),
    });
    const previous = detail('NASDAQ:XYZ', 100, previousExtras);
    const fresh = detail('NASDAQ:XYZ', 103);

    expect(mergeAssetDetailPreservingExtras(previous, fresh).extras).toBe(previousExtras);
  });

  it('no fusiona detalles de símbolos distintos', () => {
    const previous = detail(
      'NASDAQ:XYZ',
      100,
      extras({ finviz: finviz({ ltDebtToEquity: 0.01, rsi14: 33.93 }) })
    );
    const other = detail('NASDAQ:ABC', 25, extras({ finviz: null }));

    const merged = mergeAssetDetailPreservingExtras(previous, other);

    expect(merged).toBe(other);
    expect(merged.extras?.finviz).toBeNull();
  });

  it('sin detalle anterior devuelve la respuesta nueva', () => {
    const fresh = detail('NASDAQ:XYZ', 100, extras({ finviz: null }));
    expect(mergeAssetDetailPreservingExtras(null, fresh)).toBe(fresh);
    expect(mergeAssetDetailPreservingExtras(undefined, fresh)).toBe(fresh);
  });
});
