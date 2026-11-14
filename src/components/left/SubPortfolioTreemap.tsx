import React from 'react';
import { useAppStore } from '@/store';
import { formatMoney } from '@shared/engine/format';
import {
  GENERAL_PANEL_ID,
  SUBPORTFOLIO_COLORS,
  colorForTicker,
  countDerivedCrypto,
  groupHoldingsBySubPortfolio,
  resolveSubPortfolioConfig,
  selectTreemapPanels,
  type SubPortfolioPanel,
} from '@shared/engine/subPortfolios';
import { squarifiedTreemap, type TreemapRect } from '@shared/engine/treemap';
import type { CurrencyCode } from '@shared/engine/types';
import { SubPortfolioExpanded } from './SubPortfolioExpanded';
import { Settings2, X } from 'lucide-react';

/**
 * Mini-treemaps de subcarteras (SPEC-005 §6, corrección del dueño 23:57):
 * NO es un único treemap combinado — es una fila de mini-treemaps
 * INDEPENDIENTES, uno por cada subcartera con activos, hasta 3 por fila y
 * cada uno de como máximo 1/3 del ancho (no se estiran si hay menos de
 * tres). Cada mini-treemap contiene SOLO los activos de su subcartera
 * (squarified por valor dentro de ella); el fondo es una capa translúcida
 * de su color y los segmentos salen de una paleta estable por hash del
 * ticker. Los activos sin etiquetar forman el pseudo-panel «General»; si
 * no hay nada etiquetado, «General» es el único mini-treemap y reúne a
 * todos los activos. Tocar un mini-treemap abre su vista expandida
 * (§6 bis: treemap grande + performance vs S&P 500, con «Filtrar lista» y
 * «Gestionar» adentro); ⚙ (o long-press en la franja) abre el gestor —
 * solo en subcarteras reales, nunca en «General».
 */

const HEADER_H = 18;
const MIN_TILE_W = 30;
const MIN_TILE_H = 16;
const MORE_KEY = '__more__';
const PANEL_GAP = 9;

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(100, 116, 139, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface TileLayout {
  rects: TreemapRect[];
  groupedTickers: string[];
}

export function layoutTiles(panel: SubPortfolioPanel, frame: { width: number; height: number }): TileLayout {
  let items = panel.holdings.map((h) => ({ key: h.symbol, value: h.value }));
  let groupedTickers: string[] = [];
  let groupedValue = 0;
  const f = { x: 0, y: 0, width: frame.width, height: frame.height };
  for (let iter = 0; iter < 3; iter++) {
    const test = groupedValue > 0 ? [...items, { key: MORE_KEY, value: groupedValue }] : items;
    const rects = squarifiedTreemap(test, f);
    const small = rects.filter(
      (r) => r.key !== MORE_KEY && (r.width < MIN_TILE_W || r.height < MIN_TILE_H)
    );
    if (small.length === 0 || items.length === 0) return { rects, groupedTickers };
    const smallKeys = new Set(small.map((r) => r.key));
    const removed = panel.holdings.filter((h) => smallKeys.has(h.symbol));
    groupedTickers = [...groupedTickers, ...removed.map((h) => h.ticker)];
    groupedValue += removed.reduce((s, h) => s + h.value, 0);
    items = items.filter((i) => !smallKeys.has(i.key));
  }
  const finalItems = groupedValue > 0 ? [...items, { key: MORE_KEY, value: groupedValue }] : items;
  return { rects: squarifiedTreemap(finalItems, f), groupedTickers };
}

export const SubPortfolioTreemap: React.FC<{
  holdings: any[];
  height: number;
}> = ({ holdings, height }) => {
  const {
    nwSettings,
    currency,
    fxRates,
    subPortfolioFilter,
    setSubPortfolioFilter,
    upsertSubPortfolioDef,
    removeSubPortfolioDef,
    setSubPortfolioDefaults,
  } = useAppStore();

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [managerId, setManagerId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [mgrName, setMgrName] = React.useState('');
  const [mgrColor, setMgrColor] = React.useState<string>(SUBPORTFOLIO_COLORS[0]);
  const [mgrConfirm, setMgrConfirm] = React.useState(false);
  const suppressHeaderClick = React.useRef(false);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const config = resolveSubPortfolioConfig(nwSettings);
  // v3: contenido derivado = activos que «Cripto» recibe solo por la regla
  // automática. Si hay al menos uno y el usuario todavía no dio su OK a la
  // distribución por defecto, se le pide la decisión una única vez (la
  // persistencia en NwSettings manda: confirmado, no vuelve a aparecer).
  const derivedCryptoCount = countDerivedCrypto(holdings as any, config);
  const showDefaultsPrompt =
    derivedCryptoCount > 0 && config.defaultsConfirmed !== true;
  const grouping = groupHoldingsBySubPortfolio(holdings as any, config);
  const panels = grouping.panels;
  // Mini-treemaps a renderizar: defs con activos + «General» (o solo
  // «General» con todo, si todavía no hay ninguna asignación manual).
  const renderPanels = selectTreemapPanels(grouping, config);
  const nothingTagged = Object.keys(config.assignments).length === 0;

  const managerDef = managerId ? config.defs.find((d) => d.id === managerId) : undefined;
  const managerPanel = managerId ? panels.find((p) => p.id === managerId) : undefined;

  React.useEffect(() => {
    if (managerDef) {
      setMgrName(managerDef.name);
      setMgrColor(managerDef.color);
      setMgrConfirm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerId]);

  // Tocar un mini-treemap (o cualquiera de sus tiles) abre la vista
  // expandida de ese grupo (SPEC-005 §6 bis), incluido «General»; el
  // filtro de la lista vive dentro de esa vista.
  const expandedPanel = expandedId
    ? renderPanels.find((p) => p.id === expandedId)
    : undefined;

  const filterName =
    subPortfolioFilter === GENERAL_PANEL_ID
      ? 'General'
      : config.defs.find((d) => d.id === subPortfolioFilter)?.name;

  const renderPanel = (panel: SubPortfolioPanel, panelWidth: number) => {
    // Panel muy angosto (<56px): la franja horizontal es ilegible; se usa
    // etiqueta vertical y los tiles aprovechan todo el alto.
    const narrowPanel = panelWidth < 56;
    const contentH = Math.max(0, height - (narrowPanel ? 0 : HEADER_H));
    const { rects: tileRects, groupedTickers } = layoutTiles(panel, {
      width: panelWidth,
      height: contentH,
    });
    const holdingBySymbol = new Map(panel.holdings.map((h) => [h.symbol, h]));
    const isFiltered = subPortfolioFilter === panel.id;

    const headerPress = panel.isUntagged
      ? {}
      : {
          onPointerDown: () => {
            suppressHeaderClick.current = false;
            (headerPress as any)._t = window.setTimeout(() => {
              suppressHeaderClick.current = true;
              try {
                navigator.vibrate?.(10);
              } catch {}
              setManagerId(panel.id);
            }, 600);
          },
          onPointerUp: () => window.clearTimeout((headerPress as any)._t),
          onPointerLeave: () => window.clearTimeout((headerPress as any)._t),
        };

    return (
      <div
        key={panel.id}
        data-testid={`treemap-panel-${panel.id}`}
        onClick={() => {
          if (suppressHeaderClick.current) {
            suppressHeaderClick.current = false;
            return;
          }
          setExpandedId(panel.id);
        }}
        style={{
          position: 'relative',
          flex: `0 0 ${panelWidth}px`,
          width: panelWidth,
          height,
          borderRadius: 8,
          overflow: 'hidden',
          background: hexToRgba(panel.color, panel.isUntagged ? 0.1 : 0.18),
          border: panel.isUntagged
            ? '1px dashed rgba(148, 163, 184, 0.55)'
            : `1px solid ${hexToRgba(panel.color, isFiltered ? 0.95 : 0.45)}`,
          boxSizing: 'border-box',
          cursor: 'pointer',
        }}
      >
        {/* Franja superior: nombre + % + total (paneles angostos: etiqueta vertical) */}
        {!narrowPanel && (
        <div
          {...headerPress}
          title={
            panel.isUntagged
              ? 'General (activos sin etiquetar): tocar para abrir la vista expandida'
              : `${panel.name}: tocar para abrir la vista expandida · mantener presionado para gestionar`
          }
          style={{
            height: HEADER_H,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '0 4px 0 6px',
            background: hexToRgba(panel.color, panel.isUntagged ? 0.16 : 0.32),
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {panel.isUntagged ? `General · ${panel.count} activos` : panel.name}
          </span>
          <span className="mono" style={{ fontWeight: 600, opacity: 0.85, flexShrink: 0 }}>
            {panel.pctOfGross.toFixed(panel.pctOfGross >= 10 ? 0 : 1)}%
          </span>
          {/* El total solo se muestra si la franja es lo bastante ancha:
              en paneles angostos estrangulaba el nombre y se cortaba. */}
          {panelWidth >= 150 && (
            <span className="mono" style={{ fontWeight: 600, opacity: 0.85, flexShrink: 0 }}>
              {formatMoney(panel.total, currency as CurrencyCode, fxRates, { decimals: 0 })}
            </span>
          )}
        </div>
        )}

        {/* Etiqueta vertical para paneles angostos */}
        {narrowPanel && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              writingMode: 'vertical-rl',
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--text-primary)',
              textShadow: '0 1px 3px rgba(0,0,0,0.65)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {panel.isUntagged
              ? `General · ${panel.pctOfGross.toFixed(0)}%`
              : `${panel.name} · ${panel.pctOfGross.toFixed(panel.pctOfGross >= 10 ? 0 : 1)}%`}
          </div>
        )}

        {/* ⚙ de gestión: esquina del panel, fuera del flujo de la franja
            (en paneles angostos competía con el nombre y se cortaba). */}
        {!panel.isUntagged && (
          <button
            type="button"
            aria-label={`Gestionar subcartera ${panel.name}`}
            data-testid={`treemap-manage-${panel.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setManagerId(panel.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: 1,
              right: 1,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 17,
              height: 16,
              padding: 0,
              border: 'none',
              borderRadius: 4,
              background: 'rgba(2, 6, 17, 0.38)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              opacity: 0.9,
            }}
          >
            <Settings2 size={11} />
          </button>
        )}

        {/* Tiles de activos */}
        <div style={{ position: 'relative', height: contentH }}>
          {tileRects.map((r) => {
            if (r.key === MORE_KEY) {
              return (
                <div
                  key={MORE_KEY}
                  title={groupedTickers.join(', ')}
                  onClick={() => setExpandedId(panel.id)}
                  style={{
                    position: 'absolute',
                    left: r.x,
                    top: r.y,
                    width: r.width,
                    height: r.height,
                    background: 'rgba(148, 163, 184, 0.35)',
                    boxShadow: 'inset 0 0 0 1px rgba(2, 6, 17, 0.55)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                >
                  {r.width >= 30 && r.height >= 16 ? `+${groupedTickers.length}` : ''}
                </div>
              );
            }
            const h = holdingBySymbol.get(r.key);
            if (!h) return null;
            const showFull = r.width >= 56 && r.height >= 30;
            const showTicker = !showFull && r.width >= 40 && r.height >= 22;
            return (
              <div
                key={r.key}
                data-testid={`treemap-tile-${h.ticker}`}
                title={`${h.name || h.ticker} · ${formatMoney(h.value, currency as CurrencyCode, fxRates, { decimals: 0 })} · ${h.pctOfPanel.toFixed(1)}% de ${panel.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedId(panel.id);
                }}
                style={{
                  position: 'absolute',
                  left: r.x,
                  top: r.y,
                  width: r.width,
                  height: r.height,
                  background: colorForTicker(h.ticker),
                  boxShadow: 'inset 0 0 0 1px rgba(2, 6, 17, 0.55)',
                  color: '#0f172a',
                  padding: '2px 4px',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  lineHeight: 1.15,
                }}
              >
                {showFull ? (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 800 }}>{h.ticker}</div>
                    <div style={{ fontSize: 9, fontWeight: 600 }}>
                      {h.pctOfPanel.toFixed(0)}%
                    </div>
                  </>
                ) : showTicker ? (
                  <div style={{ fontSize: 10, fontWeight: 800 }}>{h.ticker}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTreemapArea = () => {
    if (size.w <= 0) return null;
    if (holdings.length === 0) {
      return (
        <div
          style={{
            height,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
            fontSize: 11.5,
            textAlign: 'left',
          }}
        >
          Sin posiciones para mostrar en el treemap.
        </div>
      );
    }
    // Cada mini-treemap mide como máximo 1/3 del ancho del contenedor y NO
    // se estira si hay menos de tres; si hay más de tres paneles, la fila
    // envuelve (wrap) a la siguiente.
    const panelWidth = Math.max(0, Math.floor((size.w - PANEL_GAP * 2) / 3));
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: PANEL_GAP,
          alignItems: 'flex-start',
        }}
      >
        {renderPanels.map((p) => renderPanel(p, panelWidth))}
        {/* Sin nada etiquetado todavía: junto al único «General», un hint
            corto y discreto en el espacio restante de la fila (sin caja). */}
        {nothingTagged && (
          <div
            data-testid="treemap-hint"
            style={{
              flex: '1 1 140px',
              minWidth: 120,
              height,
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              lineHeight: 1.45,
              color: 'var(--text-muted)',
              padding: '0 2px',
            }}
          >
            Mantené presionado un activo para crear tu primera subcartera.
          </div>
        )}
      </div>
    );
  };

  return (
    <div data-testid="subportfolio-treemap">
      {/* Margen inferior (v3, pedido del dueño): ~14px de aire bajo la fila
          de mini-treemaps antes del bloque «Tenencias Brutas…». */}
      <div ref={wrapRef} style={{ width: '100%', marginTop: 8, marginBottom: 14 }}>
        {renderTreemapArea()}
      </div>

      {subPortfolioFilter && filterName && (
        <div style={{ marginTop: 6 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-primary)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 999,
              padding: '3px 6px 3px 10px',
            }}
          >
            Filtro: {filterName}
            <button
              type="button"
              aria-label="Quitar filtro de subcartera"
              onClick={() => setSubPortfolioFilter(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                border: 'none',
                borderRadius: '50%',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {/* Vista expandida de la subcartera (SPEC-005 §6 bis) */}
      {expandedPanel && (
        <SubPortfolioExpanded
          panel={expandedPanel}
          onClose={() => setExpandedId(null)}
          onFilterList={() => {
            setSubPortfolioFilter(expandedPanel.id);
            setExpandedId(null);
          }}
          onManage={
            expandedPanel.isUntagged
              ? undefined
              : () => {
                  setExpandedId(null);
                  setManagerId(expandedPanel.id);
                }
          }
        />
      )}

      {/* Modal «Distribución por defecto» (v3): una sola vez, cuando el
          treemap va a mostrar contenido derivado (cripto agrupado por la
          regla automática) y el usuario todavía no confirmó. Su elección se
          persiste en NwSettings.subPortfolios vía setSubPortfolioDefaults. */}
      {showDefaultsPrompt && (
        <div className="modal-backdrop" style={{ zIndex: 130 }}>
          <div
            className="modal-card"
            style={{ width: 420 }}
            role="dialog"
            aria-label="Distribución por defecto de subcarteras"
            data-testid="subportfolio-defaults-modal"
          >
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
              Distribución por defecto
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              Tus activos cripto se agrupan solos en la subcartera{' '}
              <strong style={{ color: 'var(--text-primary)' }}>«Cripto»</strong>{' '}
              (hoy, {derivedCryptoCount}{' '}
              {derivedCryptoCount === 1 ? 'activo' : 'activos'}), sin que tengas
              que etiquetarlos uno por uno. Además ya tenés listas{' '}
              <strong style={{ color: 'var(--text-primary)' }}>«Núcleo»</strong> y{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                «Especulativas»
              </strong>{' '}
              para etiquetar el resto a mano, manteniendo presionado cada activo.
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: 'var(--text-secondary)',
                marginBottom: 16,
              }}
            >
              ¿Usamos esta distribución por defecto, o preferís etiquetar todo a
              mano, sin ningún agrupamiento automático?
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="defaults-accept"
                style={{ minHeight: 44, padding: '8px 16px', fontSize: 13 }}
                onClick={() => setSubPortfolioDefaults(true, true)}
              >
                Usar esta distribución
              </button>
              <button
                type="button"
                className="btn"
                data-testid="defaults-manual"
                style={{ minHeight: 44, padding: '8px 16px', fontSize: 13 }}
                onClick={() => setSubPortfolioDefaults(true, false)}
              >
                No, etiqueto todo a mano
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gestor de subcartera: renombrar, recolorear, borrar */}
      {managerDef && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 120 }}
          onClick={() => setManagerId(null)}
        >
          <div
            className="modal-card"
            style={{ width: 400 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Gestionar subcartera ${managerDef.name}`}
            data-testid="subportfolio-manager"
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800 }}>Subcartera</div>
              <button
                className="btn btn-ghost"
                onClick={() => setManagerId(null)}
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {managerPanel
                ? `${managerPanel.count} activos · ${formatMoney(managerPanel.total, currency as CurrencyCode, fxRates, { decimals: 0 })}`
                : 'Sin activos asignados todavía'}
            </div>

            <label
              style={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 5,
              }}
            >
              Nombre
            </label>
            <input
              className="input"
              data-testid="subportfolio-manager-name"
              style={{ width: '100%', padding: '9px 10px', fontSize: 13.5, minHeight: 44 }}
              value={mgrName}
              maxLength={24}
              onChange={(e) => setMgrName(e.target.value)}
            />

            <label
              style={{
                display: 'block',
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                margin: '12px 0 5px',
              }}
            >
              Color
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SUBPORTFOLIO_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${color}`}
                  data-testid={`subportfolio-manager-color-${color}`}
                  onClick={() => setMgrColor(color)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: color,
                    border:
                      mgrColor === color
                        ? '3px solid var(--text-primary)'
                        : '2px solid transparent',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>

            {!mgrConfirm ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ minHeight: 44, padding: '8px 16px', fontSize: 13 }}
                  disabled={!mgrName.trim()}
                  onClick={() => {
                    upsertSubPortfolioDef({
                      id: managerDef.id,
                      name: mgrName.trim().slice(0, 24),
                      color: mgrColor,
                    });
                    setManagerId(null);
                  }}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{
                    minHeight: 44,
                    padding: '8px 16px',
                    fontSize: 13,
                    borderColor: 'rgba(244, 63, 94, 0.45)',
                    color: 'var(--neg-bright)',
                    marginLeft: 'auto',
                  }}
                  onClick={() => setMgrConfirm(true)}
                >
                  Borrar
                </button>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(244, 63, 94, 0.45)',
                  background: 'rgba(244, 63, 94, 0.08)',
                }}
              >
                <div style={{ fontSize: 12.5, marginBottom: 10 }}>
                  ¿Borrar «{managerDef.name}»?{' '}
                  {managerPanel && managerPanel.count > 0
                    ? `${managerPanel.count} activos quedarán sin etiquetar.`
                    : 'No tiene activos asignados.'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      minHeight: 44,
                      padding: '8px 14px',
                      fontSize: 13,
                      background: 'rgba(244, 63, 94, 0.85)',
                      borderColor: 'transparent',
                      color: '#fff',
                      fontWeight: 700,
                    }}
                    onClick={() => {
                      removeSubPortfolioDef(managerDef.id);
                      setManagerId(null);
                    }}
                  >
                    Confirmar borrado
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: 44, padding: '8px 14px', fontSize: 13 }}
                    onClick={() => setMgrConfirm(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
