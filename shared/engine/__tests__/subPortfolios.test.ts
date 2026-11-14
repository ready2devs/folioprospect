import { describe, it, expect } from 'vitest';
import {
  GENERAL_PANEL_ID,
  SUBPORTFOLIO_COLORS,
  SEGMENT_COLORS,
  UNTAGGED_PANEL_ID,
  colorForTicker,
  effectiveDefId,
  groupHoldingsBySubPortfolio,
  isCryptoHolding,
  makeDefId,
  removeDef,
  resolveSubPortfolioConfig,
  seedSubPortfolioDefs,
  selectTreemapPanels,
  setAssignment,
  stableHash,
  upsertDef,
  type SubPortfolioHoldingLike,
} from '../subPortfolios.js';
import type { SubPortfolioConfig } from '../types.js';

const H = (
  symbol: string,
  value: number,
  assetType: string = 'Stock'
): SubPortfolioHoldingLike => ({
  symbol,
  ticker: symbol.split(':').pop() || symbol,
  assetType,
  value,
});

describe('SPEC-005 · siembra y resolución de config', () => {
  it('sin campo guardado siembra Núcleo / Especulativa / Cripto con los colores de la spec', () => {
    const cfg = resolveSubPortfolioConfig({});
    expect(cfg.defs.map((d) => d.id)).toEqual(['nucleo', 'especulativa', 'cripto']);
    expect(cfg.defs.map((d) => d.name)).toEqual(['Núcleo', 'Especulativa', 'Cripto']);
    expect(cfg.defs[0].color).toBe('#10b981');
    expect(cfg.defs[1].color).toBe('#8b5cf6');
    expect(cfg.defs[2].color).toBe('#f59e0b');
    expect(cfg.assignments).toEqual({});
    expect(resolveSubPortfolioConfig(null).defs).toHaveLength(3);
    expect(resolveSubPortfolioConfig(undefined).defs).toHaveLength(3);
  });

  it('una config guardada con defs vacías se respeta (no se vuelve a sembrar)', () => {
    const cfg = resolveSubPortfolioConfig({
      subPortfolios: { defs: [], assignments: {} },
    });
    expect(cfg.defs).toEqual([]);
  });

  it('descarta asignaciones a defs inexistentes al resolver', () => {
    const cfg = resolveSubPortfolioConfig({
      subPortfolios: {
        defs: seedSubPortfolioDefs(),
        assignments: { 'NASDAQ:GOOG': 'nucleo', 'NASDAQ:FAKE': 'no-existe' },
      },
    });
    expect(cfg.assignments).toEqual({ 'NASDAQ:GOOG': 'nucleo' });
  });
});

describe('SPEC-005 · regla derivada de cripto', () => {
  const cfg = resolveSubPortfolioConfig({});

  it('detecta cripto por assetType, prefijo BINANCE: y sufijo USDT (criterio LeftPanel)', () => {
    expect(isCryptoHolding({ symbol: 'BINANCE:ETHUSDT', assetType: 'Stock' })).toBe(true);
    expect(isCryptoHolding({ symbol: 'OTRO:BTCUSDT', assetType: 'Stock' })).toBe(true);
    expect(isCryptoHolding({ symbol: 'NASDAQ:COIN', assetType: 'Crypto' })).toBe(true);
    expect(isCryptoHolding({ symbol: 'NASDAQ:GOOG', assetType: 'Stock' })).toBe(false);
  });

  it('un cripto sin asignación manual cae en Cripto; un no-cripto queda sin etiquetar', () => {
    expect(effectiveDefId(H('BINANCE:BTCUSDT', 100, 'Crypto'), cfg)).toBe('cripto');
    expect(effectiveDefId(H('NASDAQ:GOOG', 100), cfg)).toBeNull();
  });

  it('la asignación manual gana a la regla derivada', () => {
    const manual = setAssignment(cfg, 'BINANCE:BTCUSDT', 'nucleo');
    expect(effectiveDefId(H('BINANCE:BTCUSDT', 100, 'Crypto'), manual)).toBe('nucleo');
  });

  it('si la def Cripto no existe, el cripto queda sin etiquetar', () => {
    const sinCripto = removeDef(cfg, 'cripto');
    expect(effectiveDefId(H('BINANCE:BTCUSDT', 100, 'Crypto'), sinCripto)).toBeNull();
  });
});

describe('SPEC-005 · agrupado por subcartera', () => {
  const cfg: SubPortfolioConfig = {
    defs: seedSubPortfolioDefs(),
    assignments: { 'NASDAQ:GOOG': 'nucleo', 'NASDAQ:TSM': 'nucleo', 'NASDAQ:XYZ': 'especulativa' },
  };
  const holdings = [
    H('NASDAQ:GOOG', 20000),
    H('NASDAQ:TSM', 10000),
    H('NASDAQ:XYZ', 5000),
    H('BINANCE:BTCUSDT', 3000, 'Crypto'),
    H('NASDAQ:NEW', 2000),
  ];

  it('agrupa con totales, % sobre tenencias brutas y activos ordenados desc.', () => {
    const { panels, grossTotal } = groupHoldingsBySubPortfolio(holdings, cfg);
    expect(grossTotal).toBe(40000);
    // Orden: Núcleo (30000) > Especulativa (5000) > Cripto (3000) > Sin etiquetar al final
    expect(panels.map((p) => p.id)).toEqual([
      'nucleo',
      'especulativa',
      'cripto',
      UNTAGGED_PANEL_ID,
    ]);
    const nucleo = panels[0];
    expect(nucleo.total).toBe(30000);
    expect(nucleo.pctOfGross).toBeCloseTo(75, 6);
    expect(nucleo.count).toBe(2);
    expect(nucleo.holdings.map((h) => h.ticker)).toEqual(['GOOG', 'TSM']);
    expect(nucleo.holdings[0].pctOfPanel).toBeCloseTo((20000 / 30000) * 100, 6);
    const sin = panels[panels.length - 1];
    expect(sin.isUntagged).toBe(true);
    expect(sin.id).toBe(GENERAL_PANEL_ID);
    expect(sin.name).toBe('General');
    expect(sin.total).toBe(2000);
    expect(sin.holdings.map((h) => h.ticker)).toEqual(['NEW']);
    // La suma de paneles cubre exactamente las tenencias brutas
    expect(panels.reduce((s, p) => s + p.total, 0)).toBe(grossTotal);
  });

  it('sin nada sin etiquetar no aparece el panel derivado; defs vacías no aparecen', () => {
    const { panels } = groupHoldingsBySubPortfolio(
      [H('NASDAQ:GOOG', 100), H('BINANCE:BTCUSDT', 50, 'Crypto')],
      { defs: seedSubPortfolioDefs(), assignments: { 'NASDAQ:GOOG': 'nucleo' } }
    );
    expect(panels.map((p) => p.id)).toEqual(['nucleo', 'cripto']);
  });

  it('sin holdings no hay paneles', () => {
    expect(groupHoldingsBySubPortfolio([], cfg).panels).toEqual([]);
  });
});

describe('SPEC-005 v2 · selección de mini-treemaps (corrección 23:57)', () => {
  const seeded = resolveSubPortfolioConfig({});

  it('(a) nada etiquetado → solo «General» con TODOS los activos (incluso el cripto derivado)', () => {
    const holdings = [
      H('NASDAQ:GOOG', 20000),
      H('NASDAQ:TSM', 10000),
      H('BINANCE:BTCUSDT', 3000, 'Crypto'),
    ];
    const grouping = groupHoldingsBySubPortfolio(holdings, seeded);
    const panels = selectTreemapPanels(grouping, seeded);
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe(GENERAL_PANEL_ID);
    expect(panels[0].name).toBe('General');
    expect(panels[0].color).toBe('#94a3b8');
    expect(panels[0].isUntagged).toBe(true);
    expect(panels[0].total).toBe(33000);
    expect(panels[0].pctOfGross).toBeCloseTo(100, 6);
    expect(panels[0].holdings.map((h) => h.ticker)).toEqual(['GOOG', 'TSM', 'BTCUSDT']);
    expect(panels[0].holdings[0].pctOfPanel).toBeCloseTo((20000 / 33000) * 100, 6);
  });

  it('(b) una def con activos + resto sin etiquetar → [def, General]', () => {
    const cfg: SubPortfolioConfig = {
      defs: seedSubPortfolioDefs(),
      assignments: { 'NASDAQ:GOOG': 'nucleo' },
    };
    const holdings = [H('NASDAQ:GOOG', 20000), H('NASDAQ:TSM', 10000), H('NASDAQ:NEW', 2000)];
    const panels = selectTreemapPanels(groupHoldingsBySubPortfolio(holdings, cfg), cfg);
    expect(panels.map((p) => p.id)).toEqual(['nucleo', GENERAL_PANEL_ID]);
    expect(panels[0].total).toBe(20000);
    expect(panels[1].holdings.map((h) => h.ticker)).toEqual(['TSM', 'NEW']);
    expect(panels[1].total).toBe(12000);
  });

  it('(c) todo etiquetado → sin «General»', () => {
    const cfg: SubPortfolioConfig = {
      defs: seedSubPortfolioDefs(),
      assignments: { 'NASDAQ:GOOG': 'nucleo', 'BINANCE:BTCUSDT': 'cripto' },
    };
    const holdings = [H('NASDAQ:GOOG', 20000), H('BINANCE:BTCUSDT', 3000, 'Crypto')];
    const panels = selectTreemapPanels(groupHoldingsBySubPortfolio(holdings, cfg), cfg);
    expect(panels.map((p) => p.id)).toEqual(['nucleo', 'cripto']);
    expect(panels.some((p) => p.isUntagged)).toBe(false);
  });

  it('(d) las defs definidas pero vacías quedan excluidas', () => {
    const cfg: SubPortfolioConfig = {
      defs: seedSubPortfolioDefs(),
      assignments: { 'NASDAQ:GOOG': 'nucleo' },
    };
    const holdings = [H('NASDAQ:GOOG', 20000)];
    const panels = selectTreemapPanels(groupHoldingsBySubPortfolio(holdings, cfg), cfg);
    // Especulativa y Cripto están definidas pero sin activos: no aparecen.
    expect(panels.map((p) => p.id)).toEqual(['nucleo']);
  });

  it('sin holdings no se renderiza ningún mini-treemap', () => {
    expect(selectTreemapPanels(groupHoldingsBySubPortfolio([], seeded), seeded)).toEqual([]);
  });
});

describe('SPEC-005 · CRUD de definiciones y asignaciones', () => {
  const base = resolveSubPortfolioConfig({});

  it('setAssignment asigna, reasigna y desasigna sin mutar la config original', () => {
    const a = setAssignment(base, 'NASDAQ:GOOG', 'nucleo');
    expect(a.assignments).toEqual({ 'NASDAQ:GOOG': 'nucleo' });
    expect(base.assignments).toEqual({});
    const b = setAssignment(a, 'NASDAQ:GOOG', 'especulativa');
    expect(b.assignments['NASDAQ:GOOG']).toBe('especulativa');
    const c = setAssignment(b, 'NASDAQ:GOOG', null);
    expect(c.assignments).toEqual({});
    // Asignar a una def inexistente equivale a desasignar
    expect(setAssignment(base, 'NASDAQ:GOOG', 'fantasma').assignments).toEqual({});
  });

  it('upsertDef crea y actualiza; respeta el tope de 8 defs', () => {
    const creada = upsertDef(base, { id: 'renta', name: 'Renta', color: '#38bdf8' });
    expect(creada.defs).toHaveLength(4);
    const editada = upsertDef(creada, { id: 'renta', name: 'Renta fija', color: '#f472b6' });
    expect(editada.defs.find((d) => d.id === 'renta')?.name).toBe('Renta fija');
    let llena: SubPortfolioConfig = base;
    for (let i = 0; i < 10; i++) {
      llena = upsertDef(llena, { id: `d${i}`, name: `D${i}`, color: '#38bdf8' });
    }
    expect(llena.defs).toHaveLength(8);
  });

  it('removeDef borra la def y deja sus activos sin etiquetar', () => {
    const cfg = setAssignment(base, 'NASDAQ:GOOG', 'nucleo');
    const sin = removeDef(cfg, 'nucleo');
    expect(sin.defs.map((d) => d.id)).toEqual(['especulativa', 'cripto']);
    expect(sin.assignments).toEqual({});
    expect(effectiveDefId(H('NASDAQ:GOOG', 1), sin)).toBeNull();
  });

  it('makeDefId genera slugs sin acentos y sin colisiones', () => {
    expect(makeDefId('Núcleo', [])).toBe('nucleo');
    expect(makeDefId('Caja Fuerte', ['caja-fuerte'])).toBe('caja-fuerte-2');
    expect(makeDefId('!!!', [])).toBe('cartera');
  });
});

describe('SPEC-005 · color de segmento por hash estable', () => {
  it('el mismo ticker siempre da el mismo color, dentro de la paleta de 12', () => {
    const c1 = colorForTicker('GOOG');
    expect(colorForTicker('GOOG')).toBe(c1);
    expect(colorForTicker('NASDAQ:GOOG')).toBe(c1);
    expect(SEGMENT_COLORS).toContain(c1);
    expect(SEGMENT_COLORS).toHaveLength(12);
    expect(SUBPORTFOLIO_COLORS).toHaveLength(8);
    expect(stableHash('GOOG')).toBe(stableHash('GOOG'));
    expect(stableHash('GOOG')).not.toBe(stableHash('TSM'));
  });
});
