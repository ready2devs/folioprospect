import React from 'react';
import { useAppStore } from '@/store';
import { useIsMobile } from '@/hooks/useIsMobile';
import { formatMoney, formatPct } from '@shared/engine/format';
import {
  colorForTicker,
  type SubPortfolioPanel,
} from '@shared/engine/subPortfolios';
import type { CurrencyCode, DailyPoint } from '@shared/engine/types';
import { hexToRgba, layoutTiles } from './SubPortfolioTreemap';
import { X } from 'lucide-react';

/**
 * Vista expandida de una subcartera (SPEC-005 §6 bis): pantalla completa en
 * móvil, modal grande en escritorio. Arriba el treemap en grande (tocar un
 * activo abre su popup); abajo, el comparativo de performance contra el
 * S&P 500 con la serie REAL del servidor (buildPortfolioSeries sobre el
 * ledger filtrado). Sin historia suficiente: estado vacío explicado, nunca
 * una línea fabricada.
 */

type PeriodKey = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1A' },
  { key: 'ALL', label: 'Todo' },
];

function periodStartDate(key: PeriodKey, daily: DailyPoint[]): string {
  const lastTime = daily[daily.length - 1]?.time || Date.now();
  const d = new Date(lastTime);
  if (key === '1M') d.setMonth(d.getMonth() - 1);
  else if (key === '3M') d.setMonth(d.getMonth() - 3);
  else if (key === '6M') d.setMonth(d.getMonth() - 6);
  else if (key === 'YTD') {
    d.setMonth(0);
    d.setDate(1);
  } else if (key === '1Y') d.setFullYear(d.getFullYear() - 1);
  else return daily[0]?.date || '1970-01-01';
  return d.toISOString().slice(0, 10);
}

export const SubPortfolioExpanded: React.FC<{
  panel: SubPortfolioPanel;
  onClose: () => void;
  onFilterList: () => void;
  onManage?: () => void;
}> = ({ panel, onClose, onFilterList, onManage }) => {
  const { currency, fxRates, openHoldingMenu } = useAppStore();
  const isMobile = useIsMobile(640);

  const [period, setPeriod] = React.useState<PeriodKey>('6M');
  const [daily, setDaily] = React.useState<DailyPoint[] | null>(null);
  const [loadError, setLoadError] = React.useState(false);

  const tmRef = React.useRef<HTMLDivElement | null>(null);
  const [tmSize, setTmSize] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = tmRef.current;
    if (!el) return;
    const update = () => setTmSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const symbolsKey = panel.holdings
    .map((h) => h.symbol)
    .slice()
    .sort()
    .join(',');
  React.useEffect(() => {
    let cancelled = false;
    setDaily(null);
    setLoadError(false);
    fetch(
      `/api/portfolios/overview/subportfolio-series?symbols=${encodeURIComponent(symbolsKey)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setDaily(Array.isArray(data?.daily) ? data.daily : []);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [symbolsKey]);

  // Serie rebaseada al inicio del período (mismo criterio que PortfolioView).
  const chart = React.useMemo(() => {
    if (!daily || daily.length < 2) return null;
    const start = periodStartDate(period, daily);
    let win = daily.filter((p) => p.date >= start);
    if (win.length < 2) win = daily.slice(-Math.min(daily.length, 10));
    if (win.length < 2) return null;
    const baseCum = 1 + (win[0].cumReturnPct || 0) / 100;
    const baseBench = 1 + (win[0].benchmarkPct || 0) / 100;
    const points = win.map((pt) => ({
      date: pt.date,
      port: baseCum > 0 ? ((1 + pt.cumReturnPct / 100) / baseCum - 1) * 100 : 0,
      bench: baseBench > 0 ? ((1 + pt.benchmarkPct / 100) / baseBench - 1) * 100 : 0,
    }));
    const last = points[points.length - 1];
    return { points, portPct: last.port, benchPct: last.bench, diff: last.port - last.bench };
  }, [daily, period]);

  const polyline = (values: number[], min: number, max: number): string => {
    const W = 300;
    const H = 100;
    const PAD = 5;
    const span = max - min || 1;
    return values
      .map((v, i) => {
        const x = PAD + (i / Math.max(1, values.length - 1)) * (W - 2 * PAD);
        const y = H - PAD - ((v - min) / span) * (H - 2 * PAD);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const { rects: tileRects, groupedTickers } =
    tmSize.w > 0
      ? layoutTiles(panel, { width: tmSize.w, height: tmSize.h })
      : { rects: [], groupedTickers: [] };
  const holdingBySymbol = new Map(panel.holdings.map((h) => [h.symbol, h]));

  const cardStyle: React.CSSProperties = isMobile
    ? {
        width: '100vw',
        height: '100dvh',
        maxWidth: '100vw',
        maxHeight: '100dvh',
        borderRadius: 0,
        padding: '14px 14px calc(14px + env(safe-area-inset-bottom, 0px))',
      }
    : { width: '94vw', height: '88vh', maxWidth: 1060, maxHeight: '88vh', padding: 20 };

  return (
    <div className="modal-backdrop" style={{ zIndex: 105 }} onClick={onClose}>
      {/* zIndex 105: por debajo del menú de acciones del activo (110), que se
          abre al tocar un tile de esta vista. */}
      <div
        className="modal-card"
        style={{ ...cardStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Vista expandida de ${panel.name}`}
        data-testid="subportfolio-expanded"
      >
        {/* Header: nombre a la izquierda; tamaño y proporción arriba a la derecha */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
              paddingTop: 3,
            }}
          >
            <span
              style={{
                width: 13,
                height: 13,
                borderRadius: '50%',
                background: panel.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 17,
                fontWeight: 800,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {panel.name}
            </span>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 800 }} data-testid="expanded-total">
              {formatMoney(panel.total, currency as CurrencyCode, fxRates, { decimals: 0 })}
            </div>
            <div
              style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}
              data-testid="expanded-pct"
            >
              {panel.pctOfGross.toFixed(1)}% del portafolio · {panel.count} activos
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Cerrar vista expandida"
            style={{ flexShrink: 0 }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Treemap en grande */}
        <div
          ref={tmRef}
          style={{
            position: 'relative',
            flex: '0 0 34%',
            minHeight: 170,
            borderRadius: 10,
            overflow: 'hidden',
            background: hexToRgba(panel.color, panel.isUntagged ? 0.1 : 0.16),
            border: panel.isUntagged
              ? '1px dashed rgba(148, 163, 184, 0.55)'
              : `1px solid ${hexToRgba(panel.color, 0.45)}`,
          }}
        >
          {tileRects.map((r) => {
            if (r.key === '__more__') {
              return (
                <div
                  key="__more__"
                  title={groupedTickers.join(', ')}
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
                    fontSize: 12,
                    fontWeight: 700,
                    overflow: 'hidden',
                  }}
                >
                  {r.width >= 30 && r.height >= 16 ? `+${groupedTickers.length}` : ''}
                </div>
              );
            }
            const h = holdingBySymbol.get(r.key);
            if (!h) return null;
            const showValue = r.width >= 84 && r.height >= 44;
            const showPct = !showValue && r.width >= 56 && r.height >= 30;
            const showTicker = showValue || showPct || (r.width >= 40 && r.height >= 22);
            return (
              <div
                key={r.key}
                data-testid={`expanded-tile-${h.ticker}`}
                title={`${h.name || h.ticker} · ${formatMoney(h.value, currency as CurrencyCode, fxRates, { decimals: 0 })} · ${h.pctOfPanel.toFixed(1)}% de ${panel.name}`}
                onClick={() => openHoldingMenu(h.symbol)}
                style={{
                  position: 'absolute',
                  left: r.x,
                  top: r.y,
                  width: r.width,
                  height: r.height,
                  background: colorForTicker(h.ticker),
                  boxShadow: 'inset 0 0 0 1px rgba(2, 6, 17, 0.55)',
                  color: '#0f172a',
                  padding: '4px 6px',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  lineHeight: 1.2,
                }}
              >
                {showTicker && (
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{h.ticker}</div>
                )}
                {showPct && (
                  <div style={{ fontSize: 10.5, fontWeight: 600 }}>
                    {h.pctOfPanel.toFixed(1)}%
                  </div>
                )}
                {showValue && (
                  <>
                    <div style={{ fontSize: 10.5, fontWeight: 600 }}>
                      {h.pctOfPanel.toFixed(1)}% de la subcartera
                    </div>
                    <div className="mono" style={{ fontSize: 11, fontWeight: 700 }}>
                      {formatMoney(h.value, currency as CurrencyCode, fxRates, { decimals: 0 })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Comparativo de performance vs S&P 500 */}
        <div style={{ marginTop: 14, flex: '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Performance vs S&P 500</span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  style={{
                    padding: '5px 9px',
                    minHeight: 30,
                    borderRadius: 999,
                    border: `1px solid ${period === p.key ? panel.color : 'var(--border-subtle)'}`,
                    background: period === p.key ? hexToRgba(panel.color, 0.18) : 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 11.5,
                    fontWeight: period === p.key ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {daily === null && !loadError ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '18px 0' }}>
              Cargando la serie real de operaciones…
            </div>
          ) : loadError ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '18px 0' }}>
              No se pudo cargar la serie de performance. Probá de nuevo en unos segundos.
            </div>
          ) : !chart ? (
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                padding: '16px 12px',
                border: '1px dashed rgba(148, 163, 184, 0.4)',
                borderRadius: 10,
              }}
              data-testid="expanded-series-empty"
            >
              Esta subcartera todavía no tiene operaciones con historia suficiente para
              graficar su performance. El gráfico se construye solo con operaciones
              reales registradas; no se estima ni se interpola.
            </div>
          ) : (
            <>
              <div
                className="mono"
                style={{ fontSize: 12.5, marginBottom: 6 }}
                data-testid="expanded-reading"
              >
                <span style={{ color: panel.color, fontWeight: 700 }}>{panel.name}</span>{' '}
                <strong>{formatPct(chart.portPct)}</strong>
                {' · '}S&P 500 <strong>{formatPct(chart.benchPct)}</strong>
                {' · '}Diferencia{' '}
                <strong style={{ color: chart.diff >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>
                  {formatPct(chart.diff)} pp
                </strong>
              </div>
              <div style={{ flex: '1 1 auto', minHeight: 90 }}>
                {(() => {
                  const all = [...chart.points.map((p) => p.port), ...chart.points.map((p) => p.bench)];
                  const min = Math.min(...all, 0);
                  const max = Math.max(...all, 0);
                  return (
                    <svg
                      viewBox="0 0 300 100"
                      preserveAspectRatio="none"
                      style={{ width: '100%', height: '100%', display: 'block' }}
                      data-testid="expanded-chart"
                    >
                      <polyline
                        points={polyline(chart.points.map((p) => p.bench), min, max)}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth={1.6}
                        vectorEffect="non-scaling-stroke"
                      />
                      <polyline
                        points={polyline(chart.points.map((p) => p.port), min, max)}
                        fill="none"
                        stroke={panel.color}
                        strokeWidth={1.8}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                <span>
                  <span style={{ color: panel.color, fontWeight: 800 }}>—</span> {panel.name}
                </span>
                <span>
                  <span style={{ color: '#94a3b8', fontWeight: 800 }}>—</span> S&P 500 (SPX)
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  {chart.points[0].date} → {chart.points[chart.points.length - 1].date}
                </span>
              </div>
            </>
          )}
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Metodología: retorno encadenado (TWR) de las operaciones reales de estos
            activos según el libro de operaciones, contra el S&P 500. No es una
            simulación con la composición actual.
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 44, padding: '8px 16px', fontSize: 13 }}
            onClick={onFilterList}
            data-testid="expanded-filter"
          >
            Filtrar lista
          </button>
          {onManage && (
            <button
              type="button"
              className="btn"
              style={{ minHeight: 44, padding: '8px 16px', fontSize: 13 }}
              onClick={onManage}
              data-testid="expanded-manage"
            >
              Gestionar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
