import { describe, it, expect } from 'vitest';
import {
  grinoldKroner,
  fvConvergencePct,
  consensusPct,
  yearsToDoubleFor,
  optimizePortfolio,
  scoreAsset,
  thesisSignalsFor,
  fmtPairPct,
  fmtPairYears,
  type OptimizerAssetInput,
} from '../optimizer.js';

const SCORE_OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

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
    // Sin fade (retirado por la corrección 2026-11-03) y sin datos
    // para el ancla por régimen: el crecimiento entra a valor facial.
    expect(gk).toBeCloseTo(2 + 1 + 8 + 0, 5);
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

  it('acota el crecimiento (clamp anti-basura de la tasa) y el repricing', () => {
    const gk = grinoldKroner(
      base({ earningsGrowthTotalPct: 90, forwardPe: 10, industryForwardPe: 40 })
    );
    // Crecimiento acotado a +100 (protección numérica anti-basura,
    // R11: el tope de +60 ataba en más de un tercio de la cartera y
    // rankeaba él en vez del ancla); repricing acotado a +5.
    expect(gk).toBeCloseTo(95, 5);
  });

  it('sin crecimiento estimable devuelve null', () => {
    expect(grinoldKroner(base({}))).toBeNull();
  });
});

describe('convergencia FV y consenso', () => {
  it('CAGR a 3 años hasta el FV base', () => {
    expect(fvConvergencePct(base({ price: 100, fvBase: 133.1 }), 3)).toBeCloseTo(10, 1);
  });
  it('consenso SIN tope: la suba implícita en el target entra a valor facial', () => {
    // Corrección del usuario 2026-11-03: el clamp [−20, +35] era una
    // calibración del asistente del 30-oct, nunca ordenada; si el
    // número diferencia, que diferencie.
    expect(consensusPct(base({ price: 100, analystTarget: 300 }))).toBe(200);
    expect(consensusPct(base({ price: 100, analystTarget: 40 }))).toBe(-60);
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
    // FASE 1 (migración vF1): todo input de producción trae la
    // etiqueta del FV y su conteo — sin ellos la certeza vF1 es
    // null (la pata de riesgo ya no la garantiza) y ningún
    // activo sería destino elegible.
    fvConfidence: 'Alta', fvComponentCount: 2, fvRangeLow: 120, fvRangeHigh: 190,
  }),
  base({
    symbol: 'NASDAQ:BAD', ticker: 'BAD', name: 'Bad Co', industry: 'Software - Application',
    sector: 'Technology', price: 100, qty: 20, value: 2000,
    dividendYieldPct: 0, earningsGrowthTotalPct: 1, forwardPe: 40, industryForwardPe: 22,
    fvBase: 80, fvPesimista: 60, fvOptimista: 95, analystTarget: 85,
    volatilityPct: 50, roicPct: 2, opportunityScore: 25, debtToEquity: 1.8,
    fvConfidence: 'Baja', fvComponentCount: 2, epsSignDisagreement: true,
  }),
  base({
    symbol: 'NASDAQ:MID', ticker: 'MID', name: 'Mid Co', industry: 'Semiconductors',
    price: 50, qty: 80, value: 4000,
    dividendYieldPct: 0.5, earningsGrowthTotalPct: 9, forwardPe: 20, industryForwardPe: 20,
    fvBase: 62, fvPesimista: 45, fvOptimista: 80, analystTarget: 60,
    volatilityPct: 30, roicPct: 12, opportunityScore: 68, debtToEquity: 0.5,
    fvConfidence: 'Media', fvComponentCount: 2,
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
    // Con el score de CONFIANZA (R12.1 + consolidación de riesgo),
    // MID supera el listón de destinos (su volatilidad medida y su
    // aporte proporcional al riesgo le dan confianza ≥ 65), así que
    // parte de lo liberado puede volver a MID como destino: el
    // invariante del test es venta − recompra del motor, no un
    // número fijo heredado del score viejo.
    const midAlloc = r.allocations.find((a) => a.ticker === 'MID');
    expect(midFinal?.value).toBeCloseTo(3000 + (midAlloc?.amountUsd ?? 0), 5);
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

describe('sin shrinkage por confianza (R11: la confianza es etiqueta, no reescala)', () => {
  it('el FV efectivo es el FV publicado para Alta, Media, Baja o sin etiqueta', () => {
    const mk = (fvConfidence: 'Alta' | 'Media' | 'Baja' | null) =>
      base({
        price: 100, qty: 10, value: 1000, fvBase: 200, fvConfidence,
        fvComponentCount: 2, earningsGrowthTotalPct: 10, analystTarget: 150,
        volatilityPct: 30, roicPct: 15,
      });
    for (const c of ['Alta', 'Media', 'Baja', null] as const) {
      const a = scoreAsset(mk(c), 1000, SCORE_OPTS);
      expect(a.fvEffective).toBe(200);
      expect(a.conservativeConvergence).toBe(false);
    }
  });

  it('misma valuación con etiqueta Alta o Baja: MISMA convergencia y MISMO RE; el score de confianza SÍ difiere (la etiqueta es insumo del score, no de la valuación)', () => {
    const mk = (fvConfidence: 'Alta' | 'Baja') =>
      base({
        price: 100, qty: 10, value: 1000, fvBase: 200, fvConfidence,
        fvComponentCount: 2, earningsGrowthTotalPct: 10, analystTarget: 150,
        volatilityPct: 30, roicPct: 15,
      });
    const alta = scoreAsset(mk('Alta'), 1000, SCORE_OPTS);
    const baja = scoreAsset(mk('Baja'), 1000, SCORE_OPTS);
    expect(baja.fvConvergencePct!).toBeCloseTo(alta.fvConvergencePct!, 6);
    expect(baja.expectedReturnPct!).toBeCloseTo(alta.expectedReturnPct!, 6);
    // Redefinición del score (2026-11-03; R14): la valuación NO se
    // reescala por la etiqueta (eso sigue prohibido), pero el
    // SUB-ÍNDICE DE CERTEZA sí la usa como insumo — es, literalmente,
    // el acuerdo entre las patas que la etiqueta resume — y el
    // score titular la cobra vía su restricción de incertidumbre.
    // La velocidad de la predicción, en cambio, no se entera.
    expect(alta.certaintyScore!).toBeGreaterThan(baja.certaintyScore!);
    expect(alta.certaintyBand).toBe('alta');
    // FASE 1 (migración vF1): sin la pata de riesgo que la
    // levantaba (la volatilidad 30 daba ~64 y el índice viejo
    // la promediaba), la etiqueta Baja sola deja la certeza en
    // 35: banda «a revisar». La etiqueta Alta queda en 90.
    expect(baja.certaintyBand).toBe('a-revisar');
    expect(alta.score!).toBeGreaterThan(baja.score!);
    expect(baja.scoreVelocity!).toBeCloseTo(alta.scoreVelocity!, 6);
  });

  it('FV/precio > 3: sigue valuado y rankeado, pero NO es destino de fondos', () => {
    const a = scoreAsset(
      base({
        price: 100, qty: 10, value: 1000, fvBase: 520, fvConfidence: 'Baja',
        fvComponentCount: 3, earningsGrowthTotalPct: 12, analystTarget: 200,
        volatilityPct: 30, roicPct: 15,
      }),
      1000, SCORE_OPTS
    );
    expect(a.fvRaw).toBe(520);
    expect(a.destinationEligible).toBe(false);
  });

  it('un FV de un solo componente tampoco es destino, aunque el score alcance', () => {
    const a = scoreAsset(
      base({
        price: 100, qty: 10, value: 1000, fvBase: 160, fvConfidence: 'Media',
        fvComponentCount: 1, earningsGrowthTotalPct: 12, analystTarget: 150,
        volatilityPct: 25, roicPct: 20,
      }),
      1000, SCORE_OPTS
    );
    expect(a.destinationEligible).toBe(false);
  });
});

describe('tesis deteriorada (§3)', () => {
  it('thesisSignalsFor combina solo campos medibles', () => {
    expect(thesisSignalsFor(base({ forwardEpsUsed: -1 }))).toContain('eps-negativo');
    expect(thesisSignalsFor(base({ dilutionPct: 18 }))).toContain('dilucion-fuerte');
    expect(thesisSignalsFor(base({ dilutionPct: 9 }))).not.toContain('dilucion-fuerte');
    expect(
      thesisSignalsFor(base({ fcfMedianNonPositive: true, revenueGrowthPct: 4 }))
    ).toContain('fcf-negativo-sin-crecimiento');
    // Con crecimiento fuerte de ingresos, FCF mediano ≤ 0 no es señal:
    // es el perfil de una emergente, no de una tesis rota.
    expect(
      thesisSignalsFor(base({ fcfMedianNonPositive: true, revenueGrowthPct: 60 }))
    ).not.toContain('fcf-negativo-sin-crecimiento');
    expect(
      thesisSignalsFor(base({ fvComponentCount: 1, fvConfidence: 'Baja' }))
    ).toContain('fv-un-solo-componente');
  });

  const withSick = (extra: Partial<OptimizerAssetInput>): OptimizerAssetInput[] => [
    base({
      symbol: 'NASDAQ:CORE', ticker: 'CORE', name: 'Core Co', price: 100, qty: 100, value: 10000,
      earningsGrowthTotalPct: 12, fvBase: 130, fvConfidence: 'Alta', fvComponentCount: 3,
      analystTarget: 125, volatilityPct: 25, roicPct: 20,
    }),
    base({
      symbol: 'NASDAQ:SICK', ticker: 'SICK', name: 'Sick Co', price: 50, qty: 120, value: 6000,
      earningsGrowthTotalPct: 2, fvBase: 60, fvConfidence: 'Media', fvComponentCount: 3,
      analystTarget: 55, volatilityPct: 40, roicPct: 5,
      ...extra,
    }),
  ];

  it('dos señales con EPS negativo: salida total por tesis, fuera del tope de extracción', () => {
    const r = optimizePortfolio(withSick({ forwardEpsUsed: -2, dilutionPct: 16 }), {
      maxWeightPct: 90,
    });
    const sick = r.extractions.find((e) => e.ticker === 'SICK');
    expect(sick?.reasonCode).toBe('tesis-deteriorada');
    expect(sick?.kind).toBe('total');
    // 6.000 sobre un total de 16.000 = 37,5% > tope automático del 15%:
    // la salida por tesis no se acota con el tope de rebalanceo.
    expect(sick!.grossUsd).toBeCloseTo(6000, 5);
    expect(sick!.thesisSignals).toEqual(expect.arrayContaining(['eps-negativo', 'dilucion-fuerte']));
  });

  it('defensiva con dos señales sale parcial; con tres y EPS negativo, total', () => {
    const parcial = optimizePortfolio(
      withSick({ forwardEpsUsed: -2, dilutionPct: 16, defensive: true }),
      { maxWeightPct: 90 }
    );
    expect(parcial.extractions.find((e) => e.ticker === 'SICK')?.kind).toBe('parcial');
    const total = optimizePortfolio(
      withSick({
        forwardEpsUsed: -2, dilutionPct: 16, epsNextYearPct: -20, defensive: true,
      }),
      { maxWeightPct: 90 }
    );
    expect(total.extractions.find((e) => e.ticker === 'SICK')?.kind).toBe('total');
  });

  it('una sola señal: no se vende, queda en vigilancia', () => {
    // Activo fuerte en todo menos en UNA señal (EPS forward ≤ 0): las
    // reglas de siempre no lo tocan y la tesis exige dos señales.
    const p = [
      base({
        symbol: 'NASDAQ:CORE', ticker: 'CORE', name: 'Core Co', price: 100, qty: 100, value: 10000,
        earningsGrowthTotalPct: 12, fvBase: 130, fvConfidence: 'Alta', fvComponentCount: 3,
        analystTarget: 125, volatilityPct: 25, roicPct: 20,
      }),
      base({
        symbol: 'NASDAQ:WATCH', ticker: 'WATCH', name: 'Watch Co', price: 50, qty: 40, value: 2000,
        earningsGrowthTotalPct: 14, fvBase: 90, fvConfidence: 'Media', fvComponentCount: 3,
        analystTarget: 80, volatilityPct: 28, roicPct: 20,
        forwardEpsUsed: -1,
      }),
    ];
    const r = optimizePortfolio(p, { maxWeightPct: 90 });
    expect(r.extractions.find((e) => e.ticker === 'WATCH')).toBeUndefined();
    expect(r.watchAlerts.map((w) => w.ticker)).toContain('WATCH');
    expect(r.watchAlerts.find((w) => w.ticker === 'WATCH')?.thesisSignals).toEqual(['eps-negativo']);
  });
});

describe('cinturón de balances (§5)', () => {
  it('con balance a ≤5 días hábiles no se propone venta ni siquiera por tesis, y queda como examen pendiente', () => {
    const p = [
      base({
        symbol: 'NASDAQ:CORE', ticker: 'CORE', name: 'Core Co', price: 100, qty: 100, value: 10000,
        earningsGrowthTotalPct: 12, fvBase: 130, fvConfidence: 'Alta', fvComponentCount: 3,
        analystTarget: 125, volatilityPct: 25, roicPct: 20,
      }),
      base({
        symbol: 'NASDAQ:EXAM', ticker: 'EXAM', name: 'Exam Co', price: 50, qty: 40, value: 2000,
        earningsGrowthTotalPct: 2, fvBase: 60, analystTarget: 55, volatilityPct: 40,
        forwardEpsUsed: -2, dilutionPct: 16,
        nextEarningsDate: '2026-11-05', earningsBusinessDays: 2,
      }),
    ];
    const r = optimizePortfolio(p, { maxWeightPct: 90 });
    expect(r.extractions.find((e) => e.ticker === 'EXAM')).toBeUndefined();
    const exam = r.pendingExams.find((x) => x.ticker === 'EXAM');
    expect(exam?.date).toBe('2026-11-05');
    expect(exam?.thesisSignals).toContain('eps-negativo');
    // Y tampoco es destino de fondos mientras dura la ventana.
    const scoredExam = r.assets.find((a) => a.ticker === 'EXAM');
    expect(scoredExam?.destinationEligible).toBe(false);
  });
});

describe('materialidad y caja deliberada (§2 y §4)', () => {
  it('una rotación por reglas con mejora < 0,25 pp se retira: salida «sin mejora» estructural', () => {
    const p = [
      base({
        symbol: 'NASDAQ:CORE', ticker: 'CORE', name: 'Core Co', price: 100, qty: 190, value: 19000,
        earningsGrowthTotalPct: 12, fvBase: 135, fvConfidence: 'Alta', fvComponentCount: 3,
        analystTarget: 128, volatilityPct: 24, roicPct: 22, opportunityScore: 85,
      }),
      base({
        symbol: 'NASDAQ:TINY', ticker: 'TINY', name: 'Tiny Bad Co', price: 100, qty: 4, value: 400,
        earningsGrowthTotalPct: 0, fvBase: 50, fvConfidence: 'Media', fvComponentCount: 3,
        analystTarget: 60, volatilityPct: 45, roicPct: 1, opportunityScore: 20,
      }),
    ];
    const r = optimizePortfolio(p, { maxWeightPct: 90 });
    expect(r.extractions.find((e) => e.ticker === 'TINY')).toBeUndefined();
    expect(r.verdict).toBe('sin-mejora');
  });

  it('sin destino que supere el listón, los fondos de una salida por tesis quedan en efectivo', () => {
    const p = [
      base({
        symbol: 'NASDAQ:WEAK', ticker: 'WEAK', name: 'Weak Co', price: 100, qty: 50, value: 5000,
        earningsGrowthTotalPct: 3, fvBase: 110, fvConfidence: 'Media', fvComponentCount: 3,
        analystTarget: 105, volatilityPct: 35, roicPct: 4, opportunityScore: 40,
      }),
      base({
        symbol: 'NASDAQ:SICK', ticker: 'SICK', name: 'Sick Co', price: 50, qty: 60, value: 3000,
        earningsGrowthTotalPct: 1, fvBase: 55, analystTarget: 52, volatilityPct: 40,
        forwardEpsUsed: -1, dilutionPct: 20,
      }),
    ];
    const r = optimizePortfolio(p, { maxWeightPct: 90 });
    expect(r.extractions.find((e) => e.ticker === 'SICK')?.reasonCode).toBe('tesis-deteriorada');
    expect(r.allocations.length).toBe(0);
    expect(r.cashHeldUsd).toBeGreaterThan(2500);
    expect(r.cashNote).toBeTruthy();
    expect(r.finalAssets.find((a) => a.isCash && a.symbol === 'CASH:USD')).toBeTruthy();
    expect(r.narrative.join(' ')).toContain('efectivo de forma deliberada');
  });
});
