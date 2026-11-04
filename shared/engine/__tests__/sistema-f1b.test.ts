/**
 * ADOPCIÓN F1b (aprobada por el dueño 2026-11-03 22:55) — el
 * score titular es el RATING DE TRANQUILIDAD:
 *   rating = 100 × (certeza)^0,45 × (riesgo)^0,35 × (Q_caja)^0,20
 *   Q: A→100 · B→85 · C→40 · D→20 · NA→75 · sin-dato→75.
 * Tres números, un significado cada uno: estrellas =
 * oportunidad (precio/FV), velocidad/años = potencial y ritmo,
 * score = tranquilidad. Listón de destinos por rating ≥ 65.
 *
 * Testigos: la corrida en sombra de la Fase 2 sobre el dataset
 * congelado validado (research_notes/valuation-forward-simple-
 * 20261103/fase1-inputs-enriched.json, 19 activos con
 * historial): AAPL 89 · MSFT 87 · VIST 78 · NBIS 46 · SIMO 35;
 * destinos elegibles {NVDA, NU, MSFT, META}; GOOG en C; AMZN
 * en D SOLO por el dataset (su ROIC congelado es nulo; en vivo,
 * con el ROIC de Finviz, clasifica B — verificado en el pase
 * de publicación, no en este test).
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  optimizePortfolio,
  scoreAsset,
  tranquilityRatingFor,
  ratingBandFor,
  RATING_CASH_QUALITY,
  type OptimizerAssetInput,
} from '../optimizer.js';
import { computeOpportunity, normalizeUncertainty, starsFor } from '../opportunity.js';

const OPTS = {
  sellCommissionPct: 0.5, riskFreePct: 4, yearsToCorrection: 3, minTradeUsd: 250,
  maxWeightPct: 12, maxExtractionPct: 15, newPositionCapPct: 5, riskTolerancePp: 1,
} as const;

// El dataset de la corrida F2: after-fase2.json guarda los
// inputs EXACTOS de esa corrida (los de la Fase 1 enriquecidos
// con los componentes de caja del plumbing nuevo) y su
// resultado completo — es la fuente de los testigos.
const frozenDoc = JSON.parse(
  readFileSync(
    new URL(
      '../../../../research_notes/valuation-forward-simple-20261103/after-fase2.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  inputs: OptimizerAssetInput[];
  peersByIndustry: Record<string, never>;
  result: { assets: Array<{ ticker: string; fvRaw: number | null; expectedReturnPct: number | null }> };
};
const frozen = { inputs: frozenDoc.inputs };
const frozenAfter = { assets: frozenDoc.result.assets };

const run = () => optimizePortfolio(frozen.inputs, { ...OPTS, peersByIndustry: frozenDoc.peersByIndustry });

describe('F1b · testigos del rating sobre el dataset congelado', () => {
  const r = run();
  const by = (t: string) => r.assets.find((a) => a.ticker === t)!;

  it('AAPL y MSFT en zona 85+ («Tranquilidad alta»); VIST ≥ 70; NBIS < 50; SIMO < 40', () => {
    expect(by('AAPL').score).toBe(89);
    expect(by('AAPL').ratingBand).toBe('tranquilidad-alta');
    expect(by('MSFT').score).toBe(87);
    expect(by('MSFT').ratingBand).toBe('tranquilidad-alta');
    expect(by('VIST').score).toBe(78);
    expect(by('VIST').ratingBand).toBe('buena');
    expect(by('NBIS').score).toBe(46);
    expect(by('NBIS').ratingBand).toBe('especulativo');
    expect(by('SIMO').score).toBe(35);
    expect(by('SIMO').ratingBand).toBe('especulativo');
  });

  it('el rating de cada activo se recompone desde su propio desglose del payload', () => {
    for (const a of r.assets) {
      if (a.isCrypto || a.isCash) {
        expect(a.score).toBeNull();
        expect(a.ratingBand).toBeNull();
        continue;
      }
      const b = a.scoreBreakdown!;
      expect(b.certaintyScore).toBe(a.certaintyScore);
      expect(b.riskSubscale).toBe(a.riskSubscale);
      expect(b.cashQualityQ).toBe(RATING_CASH_QUALITY[a.cashRegime!.regime]);
      expect(b.cashRegime).toBe(a.cashRegime!.regime);
      const recomp = tranquilityRatingFor({
        certaintyScore: a.certaintyScore,
        riskSubscale: a.riskSubscale,
        cashRegime: a.cashRegime?.regime ?? null,
        modelSuspect: a.modelSuspect,
      });
      expect(recomp.rating).toBe(a.score);
      expect(a.ratingBand).toBe(ratingBandFor(a.score));
      // El rating no depende de la vista prudente.
      expect(a.scorePessimistic).toBe(a.score);
      expect(a.score!).toBeGreaterThanOrEqual(0);
      expect(a.score!).toBeLessThanOrEqual(100);
    }
  });

  it('Δ FV = 0 y Δ RE = 0 exactos contra la corrida en sombra de la Fase 2', () => {
    for (const exp of frozenAfter.assets) {
      const a = by(exp.ticker);
      if (exp.fvRaw == null) expect(a.fvRaw).toBeNull();
      else expect(a.fvRaw!).toBeCloseTo(exp.fvRaw, 6);
      if (exp.expectedReturnPct == null) expect(a.expectedReturnPct).toBeNull();
      else expect(a.expectedReturnPct!).toBeCloseTo(exp.expectedReturnPct, 6);
    }
  });

  it('regímenes del congelado: GOOG en C (cascada aprobada); AMZN en D solo por el ROIC nulo del dataset', () => {
    expect(by('GOOG').cashRegime?.regime).toBe('C');
    expect(by('AMZN').cashRegime?.regime).toBe('D');
    expect(by('NBIS').cashRegime?.regime).toBe('D');
    expect(by('SIMO').cashRegime?.regime).toBe('D');
  });
});

describe('F1b · gate de destinos por RATING ≥ 65', () => {
  const r = run();
  const by = (t: string) => r.assets.find((a) => a.ticker === t)!;

  it('el conjunto elegible del congelado, con la regla aprobada (rating ≥ 65 + gates), es {AVGO, META, MSFT, NU, NVDA, TSM}', () => {
    // NOTA (documentada en report-adopcion-f1b.md): la tabla de
    // escenarios de la Fase 2 listaba {NVDA, NU, MSFT, META}
    // porque su réplica intersectaba con el universo que ya
    // pasaba el listón VIEJO de certeza ≥ 65. AVGO (certeza 63,
    // rating 72) y TSM (certeza 64, rating 70) quedaban fuera
    // de ese universo, pero SÍ superan la regla aprobada —
    // rating ≥ 65 y el resto de los gates — y por eso son
    // elegibles. MELI (rating 74) y TMDX (73) quedan fuera por
    // la puerta de balances; VIST y AAPL por defensivos.
    const elig = r.assets
      .filter((a) => a.destinationEligible)
      .map((a) => a.ticker)
      .sort();
    expect(elig).toEqual(['AVGO', 'META', 'MSFT', 'NU', 'NVDA', 'TSM']);
    for (const t of elig) expect(by(t).score!).toBeGreaterThanOrEqual(65);
  });

  it('CRDO sale por su rating (55) sin piso de riesgo; NBIS y SIMO bloqueados (rating y régimen D)', () => {
    const crdo = by('CRDO');
    expect(crdo.certaintyScore!).toBeGreaterThanOrEqual(65); // con el gate viejo entraba
    expect(crdo.score!).toBeLessThan(65);
    expect(crdo.destinationEligible).toBe(false);
    for (const t of ['NBIS', 'SIMO'] as const) {
      expect(by(t).score!).toBeLessThan(65);
      expect(by(t).cashRegime?.destinationBlockedByCash).toBe(true);
      expect(by(t).destinationEligible).toBe(false);
    }
  });
});

describe('F1b · estrellas = OPORTUNIDAD (nunca el rating)', () => {
  const r = run();
  const by = (t: string) => r.assets.find((a) => a.ticker === t)!;
  const inputBy = (t: string) => frozen.inputs.find((a) => a.ticker === t)!;

  it('consistencia ficha↔Optimizador (análogo R13): mismo FV ⇒ mismas estrellas que computeOpportunity', () => {
    for (const inp of frozen.inputs) {
      const a = by(inp.ticker);
      if (inp.fvBase == null) {
        expect(a.stars).toBeNull();
        continue;
      }
      const ficha = computeOpportunity({
        price: inp.price,
        fvPesimista: inp.fvPesimista ?? inp.fvBase,
        fvBase: inp.fvBase,
        fvOptimista: inp.fvOptimista ?? inp.fvBase,
        scenario: 'Base',
        uncertainty: normalizeUncertainty(inp.uncertainty ?? null),
        yearsToCorrection: 3,
      });
      expect(ficha).not.toBeNull();
      expect(a.stars).toBe(ficha!.stars);
      expect(a.stars).toBe(
        starsFor(inp.price / inp.fvBase, normalizeUncertainty(inp.uncertainty ?? null))
      );
    }
  });

  it('VIST: 5 estrellas por su gap (oportunidad alta) con rating 78 — los dos números no se mezclan', () => {
    const v = by('VIST');
    expect(v.stars).toBe(5);
    expect(v.score).toBe(78);
    // Si las estrellas salieran del rating serían round(78/20) = 4.
    expect(v.stars).not.toBe(Math.round(v.score! / 20));
  });

  it('independencia: mismo precio/FV e incertidumbre ⇒ mismas estrellas aunque cambien certeza, riesgo y caja', () => {
    const comun = {
      price: 100, fvBase: 200, fvConfidence: 'Alta' as const, fvComponentCount: 2,
      fvRangeLow: 190, fvRangeHigh: 215, earningsGrowthTotalPct: 10,
      analystTarget: 190, uncertainty: 'Medium',
    };
    const tranquilo = scoreAsset(
      { symbol: 'NASDAQ:AAA', ticker: 'AAA', name: 'A', sector: 'Technology', industry: 'Semiconductors', qty: 10, value: 1000, ...comun, volatilityPct: 15 } as OptimizerAssetInput,
      1000, OPTS
    );
    const nervioso = scoreAsset(
      { symbol: 'NASDAQ:BBB', ticker: 'BBB', name: 'B', sector: 'Technology', industry: 'Semiconductors', qty: 10, value: 1000, ...comun, volatilityPct: 95, fvConfidence: 'Baja' as const, epsSignDisagreement: true } as OptimizerAssetInput,
      1000, OPTS
    );
    expect(tranquilo.stars).toBe(nervioso.stars);
    expect(tranquilo.score!).toBeGreaterThan(nervioso.score!);
  });
});
