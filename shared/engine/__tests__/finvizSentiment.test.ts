import { describe, it, expect } from 'vitest';
import { finvizSentiment } from '../finvizSentiment.js';

// Umbrales extraídos del HTML de Finviz el 2026-11-02 (53 tickers).
// Los casos borde usan los valores reales donde la muestra cambió de color.
describe('finvizSentiment — valuación', () => {
  it('P/E y Forward P/E: verde < 20, rojo > 40', () => {
    expect(finvizSentiment('pe', 19.35)).toBe('positive'); // BA, máximo verde
    expect(finvizSentiment('pe', 20.26)).toBeNull(); // AMZN, mínimo blanco
    expect(finvizSentiment('pe', 39.48)).toBeNull(); // HOOD, máximo blanco
    expect(finvizSentiment('pe', 40.01)).toBe('negative'); // TXN, mínimo rojo
    expect(finvizSentiment('forwardPe', 19.02)).toBe('positive'); // AMGN
    expect(finvizSentiment('forwardPe', 41.47)).toBe('negative'); // COST
  });
  it('PEG: verde < 1, rojo > 2', () => {
    expect(finvizSentiment('peg', 0.99)).toBe('positive'); // GOOG
    expect(finvizSentiment('peg', 1.1)).toBeNull(); // MSFT
    expect(finvizSentiment('peg', 1.93)).toBeNull(); // SHOP
    expect(finvizSentiment('peg', 2.23)).toBe('negative'); // ARM
  });
  it('P/S y EV/Sales: verde < 1, rojo > 10', () => {
    expect(finvizSentiment('priceToSales', 0.8)).toBe('positive'); // LCID
    expect(finvizSentiment('priceToSales', 1.34)).toBeNull(); // LOW
    expect(finvizSentiment('priceToSales', 10.57)).toBe('negative'); // AAPL
    expect(finvizSentiment('evToSales', 0.97)).toBe('positive'); // F
    expect(finvizSentiment('evToSales', 10.62)).toBe('negative'); // AAPL
  });
  it('P/B: nunca verde, rojo > 5', () => {
    expect(finvizSentiment('priceToBook', 1.2)).toBeNull(); // GM
    expect(finvizSentiment('priceToBook', 4.53)).toBeNull(); // TMDX
    expect(finvizSentiment('priceToBook', 5.04)).toBe('negative'); // ONTO
  });
  it('P/C: verde < 3, rojo > 50', () => {
    expect(finvizSentiment('priceToCash', 2.74)).toBe('positive'); // SMCI
    expect(finvizSentiment('priceToCash', 3.53)).toBeNull(); // RIVN
    expect(finvizSentiment('priceToCash', 50.19)).toBe('negative'); // NVDA
  });
  it('P/FCF: verde < 20, rojo > 40; EV/EBITDA: verde < 10, rojo > 20', () => {
    expect(finvizSentiment('priceToFcf', 17.46)).toBe('positive'); // APP
    expect(finvizSentiment('priceToFcf', 21.2)).toBeNull(); // ABNB
    expect(finvizSentiment('priceToFcf', 42.28)).toBe('negative'); // TSM
    expect(finvizSentiment('evToEbitda', 9.82)).toBe('positive'); // ADBE
    expect(finvizSentiment('evToEbitda', 19.15)).toBeNull(); // MSFT
    expect(finvizSentiment('evToEbitda', 22.06)).toBe('negative'); // MELI
  });
  it('múltiplos sin sentido (≤ 0, null, NaN) quedan sin color', () => {
    expect(finvizSentiment('pe', -4)).toBeNull();
    expect(finvizSentiment('pe', null)).toBeNull();
    expect(finvizSentiment('pe', undefined)).toBeNull();
    expect(finvizSentiment('pe', NaN)).toBeNull();
    expect(finvizSentiment('priceToFcf', -12)).toBeNull();
  });
});

describe('finvizSentiment — crecimiento (regla única)', () => {
  it('> +25% verde, 0 a +25% blanco, < 0% rojo', () => {
    expect(finvizSentiment('growthPct', 25.12)).toBe('positive'); // mínimo verde (Sales Y/Y TTM)
    expect(finvizSentiment('growthPct', 24.81)).toBeNull(); // máximo blanco (EPS this Y)
    expect(finvizSentiment('growthPct', 0)).toBeNull();
    expect(finvizSentiment('growthPct', -0.17)).toBe('negative'); // rojo más leve (EPS this Y)
    expect(finvizSentiment('growthPct', 276.91)).toBe('positive'); // SIMO EPS this Y
  });
});

describe('finvizSentiment — rentabilidad', () => {
  it('pisos por indicador y rojo solo si negativo', () => {
    expect(finvizSentiment('roa', 16.5)).toBe('positive'); // QCOM
    expect(finvizSentiment('roa', 13.67)).toBeNull(); // AMZN/KO
    expect(finvizSentiment('roa', -2.39)).toBe('negative'); // COIN
    expect(finvizSentiment('roe', 30.23)).toBe('positive'); // CLS
    expect(finvizSentiment('roe', 28.4)).toBeNull(); // COST
    expect(finvizSentiment('roic', 26.19)).toBe('positive'); // ABNB
    expect(finvizSentiment('roic', 24.39)).toBeNull(); // AVGO
    expect(finvizSentiment('grossMargin', 50.54)).toBe('positive'); // SIMO
    expect(finvizSentiment('grossMargin', 49.36)).toBeNull(); // ONTO
    expect(finvizSentiment('grossMargin', -96.56)).toBe('negative'); // LCID
    expect(finvizSentiment('operMargin', 32.07)).toBe('positive'); // KO
    expect(finvizSentiment('operMargin', 24.54)).toBeNull(); // NU
    expect(finvizSentiment('operMargin', -0.13)).toBe('negative'); // BA
    expect(finvizSentiment('profitMargin', 20.16)).toBe('positive'); // NU
    expect(finvizSentiment('profitMargin', 19.36)).toBeNull(); // SIMO
  });
});

describe('finvizSentiment — solvencia', () => {
  it('Debt/Eq: verde < 0,1, rojo > 0,5', () => {
    expect(finvizSentiment('debtToEquity', 0.09)).toBe('positive'); // HSAI
    expect(finvizSentiment('debtToEquity', 0.13)).toBeNull(); // XOM
    expect(finvizSentiment('debtToEquity', 0.49)).toBeNull(); // COIN
    expect(finvizSentiment('debtToEquity', 0.55)).toBe('negative'); // QCOM
  });
  it('Current Ratio: rojo < 1, verde > 3; Quick: rojo < 0,5, verde > 3', () => {
    expect(finvizSentiment('currentRatio', 0.99)).toBe('negative'); // AMZN
    expect(finvizSentiment('currentRatio', 1.0)).toBeNull(); // AAPL
    expect(finvizSentiment('currentRatio', 2.79)).toBeNull(); // GOOG
    expect(finvizSentiment('currentRatio', 3.31)).toBe('positive'); // MU
    expect(finvizSentiment('quickRatio', 0.36)).toBe('negative'); // TGT
    expect(finvizSentiment('quickRatio', 0.57)).toBeNull(); // LCID
    expect(finvizSentiment('quickRatio', 2.94)).toBeNull(); // MU
    expect(finvizSentiment('quickRatio', 3.85)).toBe('positive'); // NVDA
  });
});

describe('finvizSentiment — propiedad y riesgo', () => {
  it('RSI: verde < 30, rojo > 70', () => {
    expect(finvizSentiment('rsi', 28.59)).toBe('positive'); // BAC
    expect(finvizSentiment('rsi', 30.24)).toBeNull(); // HOOD
    expect(finvizSentiment('rsi', 67.37)).toBeNull(); // KR
    expect(finvizSentiment('rsi', 71.47)).toBe('negative'); // AMGN
  });
  it('Short Float rojo > 20; Insider Own verde > 30; Insider Trans rojo < −20', () => {
    expect(finvizSentiment('shortFloat', 17.41)).toBeNull(); // RIVN
    expect(finvizSentiment('shortFloat', 21.41)).toBe('negative'); // NBIS
    expect(finvizSentiment('insiderOwn', 25.49)).toBeNull(); // NU
    expect(finvizSentiment('insiderOwn', 31.34)).toBe('positive'); // ABNB
    expect(finvizSentiment('insiderTrans', -14.14)).toBeNull(); // ADBE
    expect(finvizSentiment('insiderTrans', -31.72)).toBe('negative'); // CLS
    expect(finvizSentiment('insiderTrans', 14.19)).toBeNull(); // RIVN: compras no se pintan
  });
});
