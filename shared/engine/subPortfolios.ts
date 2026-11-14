import type {
  AssetType,
  NwSettings,
  SubPortfolioConfig,
  SubPortfolioDef,
} from './types.js';

/**
 * Subcarteras personalizadas (SPEC-005) — lógica pura, sin React ni store.
 *
 * El etiquetado vive en `NwSettings.subPortfolios` (defs + asignaciones
 * manuales por símbolo). Dos reglas derivadas, nunca datos guardados:
 *  - Si el campo no existe, se siembran las tres definiciones que el dueño
 *    nombró (Núcleo / Especulativa / Cripto), vacías.
 *  - Un holding cripto sin asignación manual cae en la def «Cripto» si
 *    existe; la asignación manual siempre gana.
 */

/** Paleta de subcarteras (8 colores pensados para fondo oscuro). */
export const SUBPORTFOLIO_COLORS: readonly string[] = [
  '#10b981', // esmeralda
  '#8b5cf6', // violeta
  '#f59e0b', // naranja
  '#38bdf8', // celeste
  '#f472b6', // rosa
  '#a3e635', // lima
  '#fb7185', // rojo suave
  '#94a3b8', // gris azulado
];

/** Paleta de segmentos del treemap (12 categóricos de alto contraste). */
export const SEGMENT_COLORS: readonly string[] = [
  '#38bdf8',
  '#f472b6',
  '#a3e635',
  '#fbbf24',
  '#818cf8',
  '#34d399',
  '#fb923c',
  '#f87171',
  '#22d3ee',
  '#e879f9',
  '#facc15',
  '#4ade80',
];

/**
 * Id reservado del pseudo-panel «General» (corrección del dueño 23:57): no
 * es una def — agrupa los activos sin etiquetar. Es también el id especial
 * que soporta el filtro de la lista de posiciones.
 */
export const GENERAL_PANEL_ID = '__general__';

/** Alias histórico del panel derivado (hoy «General»). */
export const UNTAGGED_PANEL_ID = GENERAL_PANEL_ID;

/** Color del pseudo-panel «General» (gris azulado). */
export const GENERAL_PANEL_COLOR = '#94a3b8';

/** Id de la def sembrada que recibe la regla derivada de cripto. */
export const CRYPTO_DEF_ID = 'cripto';

export const MAX_SUBPORTFOLIO_DEFS = 8;
export const MAX_SUBPORTFOLIO_NAME = 24;
export const MAX_SUBPORTFOLIO_ASSIGNMENTS = 300;

/** Definiciones sembradas la primera vez (solo definiciones, sin
 *  asignaciones inventadas). */
export function seedSubPortfolioDefs(): SubPortfolioDef[] {
  return [
    { id: 'nucleo', name: 'Núcleo', color: SUBPORTFOLIO_COLORS[0] },
    { id: 'especulativa', name: 'Especulativa', color: SUBPORTFOLIO_COLORS[1] },
    { id: CRYPTO_DEF_ID, name: 'Cripto', color: SUBPORTFOLIO_COLORS[2] },
  ];
}

export function emptySubPortfolioConfig(): SubPortfolioConfig {
  return { defs: [], assignments: {} };
}

/**
 * Resuelve la config efectiva a partir de los settings guardados.
 * - `subPortfolios === undefined` → siembra de definiciones (sin asignaciones).
 * - Config presente (aunque `defs` sea []) → se respeta tal cual: si el
 *   usuario borró todas las defs a propósito, no se vuelve a sembrar.
 * Las asignaciones que apuntan a defs inexistentes se descartan al leer.
 */
export function resolveSubPortfolioConfig(
  settings?: Pick<NwSettings, 'subPortfolios'> | null
): SubPortfolioConfig {
  const raw = settings?.subPortfolios;
  if (raw === undefined || raw === null) {
    return { defs: seedSubPortfolioDefs(), assignments: {} };
  }
  const defs = Array.isArray(raw.defs) ? raw.defs.filter(isValidDefShape) : [];
  const defIds = new Set(defs.map((d) => d.id));
  const assignments: Record<string, string> = {};
  if (raw.assignments && typeof raw.assignments === 'object') {
    for (const [symbol, defId] of Object.entries(raw.assignments)) {
      if (typeof defId === 'string' && defIds.has(defId)) {
        assignments[symbol] = defId;
      }
    }
  }
  return { defs, assignments };
}

function isValidDefShape(d: any): d is SubPortfolioDef {
  return (
    d &&
    typeof d === 'object' &&
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    typeof d.name === 'string' &&
    d.name.trim().length > 0 &&
    typeof d.color === 'string' &&
    d.color.length > 0
  );
}

/** Mismo criterio de «es cripto» que usa LeftPanel para el reloj de mercado. */
export function isCryptoHolding(h: {
  assetType?: AssetType | string;
  symbol: string;
}): boolean {
  return (
    h.assetType === 'Crypto' ||
    h.symbol.startsWith('BINANCE:') ||
    h.symbol.endsWith('USDT')
  );
}

export function findDef(
  config: SubPortfolioConfig,
  defId: string | null | undefined
): SubPortfolioDef | undefined {
  if (!defId) return undefined;
  return config.defs.find((d) => d.id === defId);
}

/**
 * Def efectiva de un holding: la asignación manual manda; sin ella, un
 * cripto cae en la def «Cripto» si existe; si no, queda sin etiquetar (null).
 */
export function effectiveDefId(
  h: { assetType?: AssetType | string; symbol: string },
  config: SubPortfolioConfig
): string | null {
  const manual = config.assignments[h.symbol];
  if (manual && findDef(config, manual)) return manual;
  if (isCryptoHolding(h) && findDef(config, CRYPTO_DEF_ID)) return CRYPTO_DEF_ID;
  return null;
}

/** Asigna (o desasigna con defId null) un símbolo. Devuelve config nueva. */
export function setAssignment(
  config: SubPortfolioConfig,
  symbol: string,
  defId: string | null
): SubPortfolioConfig {
  const assignments = { ...config.assignments };
  if (defId === null || !findDef(config, defId)) {
    delete assignments[symbol];
  } else {
    assignments[symbol] = defId;
  }
  return { defs: config.defs, assignments };
}

/** Crea o actualiza una def (por id). Respeta el tope de 8 defs. */
export function upsertDef(
  config: SubPortfolioConfig,
  def: SubPortfolioDef
): SubPortfolioConfig {
  const exists = config.defs.some((d) => d.id === def.id);
  if (exists) {
    return {
      defs: config.defs.map((d) => (d.id === def.id ? { ...def } : d)),
      assignments: config.assignments,
    };
  }
  if (config.defs.length >= MAX_SUBPORTFOLIO_DEFS) return config;
  return { defs: [...config.defs, { ...def }], assignments: config.assignments };
}

/** Borra una def: sus activos quedan sin etiquetar (nunca toca posiciones). */
export function removeDef(
  config: SubPortfolioConfig,
  defId: string
): SubPortfolioConfig {
  const assignments: Record<string, string> = {};
  for (const [symbol, id] of Object.entries(config.assignments)) {
    if (id !== defId) assignments[symbol] = id;
  }
  return { defs: config.defs.filter((d) => d.id !== defId), assignments };
}

/** Slug estable para una def nueva a partir de su nombre. */
export function makeDefId(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'cartera';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Hash estable (FNV-1a) de una cadena: mismo input, mismo resultado
 *  entre sesiones y dispositivos. */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Color de segmento «aleatorio pero estable»: paleta por hash del ticker. */
export function colorForTicker(tickerOrSymbol: string): string {
  const ticker = tickerOrSymbol.includes(':')
    ? tickerOrSymbol.split(':').pop() || tickerOrSymbol
    : tickerOrSymbol;
  return SEGMENT_COLORS[stableHash(ticker.toUpperCase()) % SEGMENT_COLORS.length];
}

/** Vista mínima de un holding para agrupar (la evaluación ya trae estos campos). */
export interface SubPortfolioHoldingLike {
  symbol: string;
  ticker: string;
  name?: string;
  assetType?: AssetType | string;
  value: number;
}

export interface SubPortfolioPanelHolding extends SubPortfolioHoldingLike {
  /** Participación dentro de su panel (0..100). */
  pctOfPanel: number;
}

export interface SubPortfolioPanel {
  /** defId, o GENERAL_PANEL_ID para el pseudo-panel «General». */
  id: string;
  name: string;
  color: string;
  isUntagged: boolean;
  total: number;
  /** % sobre las tenencias brutas (0..100). */
  pctOfGross: number;
  count: number;
  holdings: SubPortfolioPanelHolding[];
}

export interface SubPortfolioGrouping {
  panels: SubPortfolioPanel[];
  grossTotal: number;
}

/**
 * Agrupa los holdings por subcartera efectiva. Paneles de defs con al menos
 * un activo, ordenados por valor desc.; el pseudo-panel «General» (activos
 * sin etiquetar) va siempre al final y solo aparece si agrupa algún activo.
 * El % es sobre el total de tenencias brutas pasadas (suma de `value` de
 * todos los holdings).
 */
export function groupHoldingsBySubPortfolio(
  holdings: SubPortfolioHoldingLike[],
  config: SubPortfolioConfig
): SubPortfolioGrouping {
  const grossTotal = holdings.reduce((s, h) => s + (h.value || 0), 0);
  const byDef = new Map<string, SubPortfolioHoldingLike[]>();
  const untagged: SubPortfolioHoldingLike[] = [];
  for (const h of holdings) {
    const defId = effectiveDefId(h, config);
    if (defId) {
      const arr = byDef.get(defId) || [];
      arr.push(h);
      byDef.set(defId, arr);
    } else {
      untagged.push(h);
    }
  }

  const toPanelHoldings = (
    list: SubPortfolioHoldingLike[],
    total: number
  ): SubPortfolioPanelHolding[] =>
    [...list]
      .sort((a, b) => b.value - a.value)
      .map((h) => ({
        ...h,
        pctOfPanel: total > 0 ? (h.value / total) * 100 : 0,
      }));

  const panels: SubPortfolioPanel[] = [];
  for (const def of config.defs) {
    const list = byDef.get(def.id);
    if (!list || list.length === 0) continue;
    const total = list.reduce((s, h) => s + (h.value || 0), 0);
    panels.push({
      id: def.id,
      name: def.name,
      color: def.color,
      isUntagged: false,
      total,
      pctOfGross: grossTotal > 0 ? (total / grossTotal) * 100 : 0,
      count: list.length,
      holdings: toPanelHoldings(list, total),
    });
  }
  panels.sort((a, b) => b.total - a.total);

  if (untagged.length > 0) {
    const total = untagged.reduce((s, h) => s + (h.value || 0), 0);
    panels.push({
      id: GENERAL_PANEL_ID,
      name: 'General',
      color: GENERAL_PANEL_COLOR,
      isUntagged: true,
      total,
      pctOfGross: grossTotal > 0 ? (total / grossTotal) * 100 : 0,
      count: untagged.length,
      holdings: toPanelHoldings(untagged, total),
    });
  }

  return { panels, grossTotal };
}

/**
 * Paneles que se renderizan como mini-treemaps independientes (corrección
 * del dueño 23:57, SPEC-005 §6): uno por subcartera CON activos, hasta
 * llenar filas de tres; las defs definidas pero vacías no dibujan nada.
 *
 * - Sin NINGUNA asignación manual, hay un único mini-treemap «General» con
 *   TODOS los activos (incluidos los que la regla derivada pondría en
 *   Cripto): es el treemap por defecto hasta que el dueño etiqueta algo.
 * - Con asignaciones, van las defs con ≥1 activo ordenadas por valor desc.
 *   y «General» al final, solo si quedan activos sin etiquetar.
 */
export function selectTreemapPanels(
  grouping: SubPortfolioGrouping,
  config: SubPortfolioConfig
): SubPortfolioPanel[] {
  const withAssets = grouping.panels.filter((p) => p.count > 0);
  if (withAssets.length === 0) return [];

  const hasManualAssignments = Object.keys(config.assignments).length > 0;
  if (!hasManualAssignments) {
    const total = grouping.grossTotal;
    const all = withAssets
      .flatMap((p) => p.holdings)
      .sort((a, b) => b.value - a.value)
      .map((h) => ({
        ...h,
        pctOfPanel: total > 0 ? (h.value / total) * 100 : 0,
      }));
    return [
      {
        id: GENERAL_PANEL_ID,
        name: 'General',
        color: GENERAL_PANEL_COLOR,
        isUntagged: true,
        total,
        pctOfGross: total > 0 ? 100 : 0,
        count: all.length,
        holdings: all,
      },
    ];
  }

  const defs = withAssets
    .filter((p) => !p.isUntagged)
    .sort((a, b) => b.total - a.total);
  const general = withAssets.find((p) => p.isUntagged);
  return general ? [...defs, general] : defs;
}
