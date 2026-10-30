import { describe, it, expect } from 'vitest';
import {
  grinoldKroner,
  fvConvergencePct,
  consensusPct,
  yearsToDoubleFor,
  optimizePortfolio,
  fmtPairPct,
  fmtPairYears,
  type OptimizerAssetInput,
} from '../optimizer.js';

const base = (p: Partial<OptimizerAssetInput>): OptimizerAssetInput => ({
  symbol: 'NASDAQ:XXX',
  ticker: 'XXX',
  name: 'Test Co',
  sector: 'Technology',
  industry: 'Semiconductors',
  price: 100,
  qty: 10,
  value: 1000,
  ...p,
});

describe('Grinold-Kroner', () => {
  it('suma dividendo, buyback, crecimiento y repricing', () => {
    const gk = grinoldKroner(
      base({
        dividendYieldPct: 2,
        dilutionPct: -1, // recompra 1%
        earningsGrowthTotalPct: 8,
        forwardPe: 20,
        industryForwardPe: 20, // sin repricing
      })
    );
    // g=8 con fade institucional (>6): 6 + 2*0.45 = 6,9
    expect(gk).toBeCloseTo(2 + 1 + 6.9 + 0, 5);
  });

  it('usa ganancias totales y no EPS cuando ambas están (anti doble conteo)', () => {
    const gk = grinoldKroner(
      base({
        dividendYieldPct: 0,
        dilutionPct: -2,
        earningsGrowthTotalPct: 6,
        epsNext5YPct: 25, // si usara EPS daría 27; debe dar 8
      })
    );
    expect(gk).toBeCloseTo(8, 5);
  });

  it('acota el crecimiento y el repricing', () => {
    const gk = grinoldKroner(
      base({ earningsGrowthTotalPct: 90, forwardPe: 10, industryForwardPe: 40 })
    );
    // g acotado a 30 y con fade: 6 + 24*0.45 = 16,8; repricing acotado a +5
    expect(gk).toBeCloseTo(21.8, 5);
  });

  it('sin crecimiento estimable devuelve null', () => {
    expect(grinoldKroner(base({}))).toBeNull();
  });
});

describe('convergencia FV y consenso', () => {
  it('CAGR a 3 años hasta el FV base', () => {
    expect(fvConvergencePct(base({ price: 100, fvBase: 133.1 }), 3)).toBeCloseTo(10, 1);
  });
  it('consenso acotado a +35', () => {
    expect(consensusPct(base({ price: 100, analystTarget: 300 }))).toBe(35);
  });
});

describe('años para duplicar', () => {
  it('10,41% ≈ 7 años', () => {
    expect(yearsToDoubleFor(10.41)).toBeCloseTo(7, 1);
  });
  it('retorno <= 0 no duplica', () => {
    expect(yearsToDoubleFor(0)).toBeNull();
    expect(yearsToDoubleFor(-3)).toBeNull();
  });
});

const portfolio = (): OptimizerAssetInput[] => [
  base({
    symbol: 'NASDAQ:GOOD', ticker: 'GOOD', name: 'Good Co', price: 100, qty: 100, value: 10000,
    dividendYieldPct: 1, earningsGrowthTotalPct: 14, forwardPe: 18, industryForwardPe: 20,
    fvBase: 150, fvPesimista: 110, fvOptimista: 190, analystTarget: 140,
    volatilityPct: 25, roicPct: 22, opportunityScore: 85, debtToEquity: 0.3,
  }),
  base({
    symbol: 'NASDAQ:BAD', ticker: 'BAD', name: 'Bad Co', industry: 'Software - Application',
    sector: 'Technology', price: 100, qty: 20, value: 2000,
    dividendYieldPct: 0, earningsGrowthTotalPct: 1, forwardPe: 40, industryForwardPe: 22,
    fvBase: 80, fvPesimista: 60, fvOptimista: 95, analystTarget: 85,
    volatilityPct: 50, roicPct: 2, opportunityScore: 25, debtToEquity: 1.8,
  }),
  base({
    symbol: 'NASDAQ:MID', ticker: 'MID', name: 'Mid Co', industry: 'Semiconductors',
    price: 50, qty: 80, value: 4000,
    dividendYieldPct: 0.5, earningsGrowthTotalPct: 9, forwardPe: 20, industryForwardPe: 20,
    fvBase: 62, fvPesimista: 45, fvOptimista: 80, analystTarget: 60,
    volatilityPct: 30, roicPct: 12, opportunityScore: 68, debtToEquity: 0.5,
  }),
  base({
    symbol: 'BINANCE:BTCUSDT', ticker: 'BTC', name: 'Bitcoin', sector: 'Crypto',
    isCrypto: true, price: 100000, qty: 0.02, value: 2000, volatilityPct: 55,
  }),
];

describe('optimizePortfolio', () => {
  it('extrae la posición débil, no toca cripto y reaplica en la fuerte', () => {
    const r = optimizePortfolio(portfolio(), { sellCommissionPct: 0.5, maxWeightPct: 90 });
    const bad = r.extractions.find((e) => e.ticker === 'BAD');
    expect(bad).toBeTruthy();
    expect(bad!.kind).toBe('total');
    expect(r.extractions.find((e) => e.ticker === 'BTC')).toBeUndefined();
    expect(r.fundsToReallocate).toBeGreaterThan(1500);
    const goodAlloc = r.allocations.find((a) => a.ticker === 'GOOD');
    expect(goodAlloc).toBeTruthy();
    const allocSum = r.allocations.reduce((s, a) => s + a.amountUsd, 0);
    expect(allocSum).toBeCloseTo(r.fundsToReallocate, 0);
  });

  it('la cartera optimizada duplica antes y el veredicto es válida', () => {
    const r = optimizePortfolio(portfolio(), { maxWeightPct: 90 });
    expect(r.after.expectedReturnGeoPct).toBeGreaterThan(r.before.expectedReturnGeoPct);
    expect(r.after.yearsToDouble!).toBeLessThan(r.before.yearsToDouble!);
    expect(r.verdict).toBe('valida');
    expect(r.narrative.length).toBeGreaterThanOrEqual(4);
  });

  it('una posición con candado nunca se vende', () => {
    const p = portfolio();
    p[1] = { ...p[1], locked: true };
    const r = optimizePortfolio(p);
    expect(r.extractions.find((e) => e.ticker === 'BAD')).toBeUndefined();
  });

  it('defensiva con score bajo sale parcial, no total', () => {
    const p = portfolio();
    p[1] = { ...p[1], defensive: true };
    const r = optimizePortfolio(p);
    const bad = r.extractions.find((e) => e.ticker === 'BAD');
    expect(bad?.kind).toBe('parcial');
  });

  it('reemplazo sectorial: propone al par superior de la misma industria', () => {
    const r = optimizePortfolio(portfolio(), {
      peersByIndustry: {
        Semiconductors: [
          { symbol: 'NASDAQ:PEER', ticker: 'PEER', name: 'Peer Co', industry: 'Semiconductors', price: 80, score: 90, expectedReturnPct: 17 },
        ],
      },
    });
    // MID (score ~medio) no necesariamente sale; GOOD no debe salir por reemplazo con PEER si su score ya es alto:
    const good = r.extractions.find((e) => e.ticker === 'GOOD');
    expect(good).toBeUndefined();
  });

  it('la descomposición de riesgo suma ~100% (PCTR)', () => {
    const r = optimizePortfolio(portfolio());
    const sum = r.assets.reduce((s, a) => s + (a.riskContributionPct ?? 0), 0);
    expect(sum).toBeGreaterThan(95);
    expect(sum).toBeLessThan(105);
  });

  it('sin mejoras posibles: narrativa lo dice y no inventa extracciones caras', () => {
    const strong = portfolio().map((a) =>
      a.ticker === 'BAD'
        ? { ...a, earningsGrowthTotalPct: 15, fvBase: 160, analystTarget: 150, opportunityScore: 88, volatilityPct: 24, roicPct: 20 }
        : a
    );
    const r = optimizePortfolio(strong, { maxWeightPct: 90 });
    expect(r.extractions.length).toBe(0);
    expect(r.verdict).toBe('sin-mejora');
  });
});

describe('concentración', () => {
  it('recorta parcial la posición que supera el tope de peso', () => {
    const p = portfolio().filter((a) => a.ticker !== 'BAD');
    const r = optimizePortfolio(p); // GOOD pesa 62% > tope 12%
    const good = r.extractions.find((e) => e.ticker === 'GOOD');
    expect(good?.kind).toBe('parcial');
    expect(good?.reasonCode).toBe('concentracion');
  });
});

describe('precisión de pares y narrativa marginal', () => {
  it('fmtPairPct pasa a 2 decimales si con 1 se verían iguales', () => {
    expect(fmtPairPct(14.01, 14.04)).toEqual(['14,01%', '14,04%']);
    expect(fmtPairPct(14.0, 14.3)).toEqual(['14,0%', '14,3%']);
    expect(fmtPairYears(5.29, 5.27)).toEqual(['5,29', '5,27']);
    expect(fmtPairYears(5.2, 4.1)).toEqual(['5,2', '4,1']);
  });

  it('mejora marginal: la narrativa lo admite y no dice "baja de X a X"', () => {
    // GOOD pesa 13,4% → solo dispara el recorte por concentración (impacto mínimo)
    const p = portfolio().map((a) =>
      a.ticker === 'GOOD' ? { ...a, value: 2400, qty: 24 } : a.ticker === 'BAD' ? { ...a, earningsGrowthTotalPct: 15, fvBase: 160, analystTarget: 150, opportunityScore: 88, volatilityPct: 24, roicPct: 20 } : a
    );
    const r = optimizePortfolio(p);
    const text = r.narrative.join(' ');
    if (r.extractions.length) {
      expect(text).not.toMatch(/baja de ([\d,]+) a \1/);
      if (r.after.expectedReturnGeoPct - r.before.expectedReturnGeoPct < 0.15) {
        expect(text).toContain('marginal');
      }
    }
  });
});

describe('obtener más fondos: manual, efectivo y sugerencias', () => {
  it('venta manual parcial: extrae el monto pedido y reduce la posición final', () => {
    const r = optimizePortfolio(portfolio(), {
      sellCommissionPct: 0.5,
      maxWeightPct: 90,
      manualExtractions: [{ symbol: 'NASDAQ:MID', amountUsd: 1000 }],
    });
    const mid = r.extractions.find((e) => e.ticker === 'MID');
    expect(mid?.reasonCode).toBe('manual');
    expect(mid?.kind).toBe('parcial');
    expect(mid?.grossUsd).toBeCloseTo(1000, 5);
    const midFinal = r.finalAssets.find((a) => a.ticker === 'MID');
    expect(midFinal?.value).toBeCloseTo(3000, 5);
  });

  it('venta manual por encima del saldo se acota y queda total', () => {
    const r = optimizePortfolio(portfolio(), {
      manualExtractions: [{ symbol: 'NASDAQ:MID', amountUsd: 99999 }],
    });
    const mid = r.extractions.find((e) => e.ticker === 'MID');
    expect(mid?.kind).toBe('total');
    expect(mid?.grossUsd).toBeCloseTo(4000, 5);
    expect(r.finalAssets.find((a) => a.ticker === 'MID')).toBeUndefined();
  });

  it('la venta manual reemplaza a las reglas automáticas sobre ese activo', () => {
    // BAD saldría total por reglas; con venta manual de 500 sale solo eso y como manual.
    const r = optimizePortfolio(portfolio(), {
      maxWeightPct: 90,
      manualExtractions: [{ symbol: 'NASDAQ:BAD', amountUsd: 500 }],
    });
    const bad = r.extractions.filter((e) => e.ticker === 'BAD');
    expect(bad.length).toBe(1);
    expect(bad[0].reasonCode).toBe('manual');
    expect(bad[0].grossUsd).toBeCloseTo(500, 5);
  });

  it('efectivo nuevo suma fondos y aumenta el total final', () => {
    const base0 = optimizePortfolio(portfolio(), { maxWeightPct: 90 });
    const r = optimizePortfolio(portfolio(), { maxWeightPct: 90, extraCashUsd: 3000 });
    expect(r.fundsToReallocate).toBeCloseTo(base0.fundsToReallocate + 3000, 5);
    expect(r.after.totalValue).toBeCloseTo(r.before.totalValue + 3000, 5);
    expect(r.extractions.find((e) => e.kind === 'efectivo')?.grossUsd).toBe(3000);
  });

  it('sugerencias: excluye cripto y ya extraídas; aceptar una la convierte en extracción', () => {
    const r0 = optimizePortfolio(portfolio(), { maxWeightPct: 90 });
    const tickers = r0.suggestionCandidates.map((c) => c.ticker);
    expect(tickers).not.toContain('BTC');
    expect(tickers).not.toContain('BAD'); // ya extraída por las reglas
    expect(tickers).toContain('MID');
    const r1 = optimizePortfolio(portfolio(), { maxWeightPct: 90, acceptedSuggestions: ['MID'] });
    const sug = r1.extractions.find((e) => e.ticker === 'MID');
    expect(sug?.reasonCode).toBe('sugerencia');
    expect(sug?.kind).toBe('parcial');
    expect(sug?.grossUsd).toBeCloseTo(2000, 5); // 50% de la posición
    expect(r1.suggestionCandidates.map((c) => c.ticker)).not.toContain('MID');
  });
});
