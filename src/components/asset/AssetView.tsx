import React, { useState, useEffect, useId, useMemo, useRef } from 'react';
import { useAppStore } from '@/store';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Briefcase,
  Moon,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const TIMEFRAMES = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as const;

function useLocalIsMobile(maxWidth = 1023): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= maxWidth : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: ' + maxWidth + 'px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxWidth]);
  return isMobile;
}

const InlineMarketClock: React.FC<{ isOpen: boolean; label?: string }> = ({ isOpen, label }) => {
  const color = isOpen ? '#10B981' : '#EF4444';
  return (
    <span
      title={label || (isOpen ? 'Mercado Abierto' : 'Mercado Cerrado')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11.5,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        background: isOpen ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
        border: '1px solid ' + (isOpen ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'),
        color,
      }}
    >
      <svg width={12} height={12} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.6" />
        <path d="M8 4.5V8L10.4 9.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label || (isOpen ? 'Mercado Abierto' : 'Mercado Cerrado')}</span>
    </span>
  );
};

export const AssetView: React.FC = () => {
  const {
    assetDetail,
    selectedSymbol,
    selectedAssetRange,
    selectAsset,
    currency,
    fxRates,
    openAddModal,
    setRightState,
  } = useAppStore();

  const isMobile = useLocalIsMobile(1023);
  const chartGradId = useId();

  useEffect(() => {
    if (!assetDetail && selectedSymbol) {
      selectAsset(selectedSymbol, selectedAssetRange || '1Y');
    }
  }, [assetDetail, selectedSymbol, selectedAssetRange, selectAsset]);

  const initialCagr = assetDetail?.fairValue?.implied10YReturnCagrPct ?? 11.5;
  const [projCagr, setProjCagr] = useState<number>(initialCagr);
  const [projMonthly, setProjMonthly] = useState<number>(250);
  const [projHorizon, setProjHorizon] = useState<10 | 20>(20);

  useEffect(() => {
    if (assetDetail?.fairValue?.implied10YReturnCagrPct != null) {
      setProjCagr(assetDetail.fairValue.implied10YReturnCagrPct);
    }
  }, [assetDetail?.symbol]);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(1000);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const update = () => {
      if (chartContainerRef.current) {
        const w = chartContainerRef.current.clientWidth;
        if (w > 120) setChartWidth(w);
      }
    };
    update();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 120) {
          setChartWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, [assetDetail?.symbol, selectedAssetRange]);

  if (!assetDetail) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>
          Cargando análisis detallado de {selectedSymbol}...
        </div>
      </div>
    );
  }

  const { meta, quote, fairValue, holding, trades, chart } = assetDetail;
  const isUp = (quote?.changePct ?? 0) >= 0;

  // Determine market state & post-market session info (FP-120 / FP-121 / FP-122)
  const isCrypto =
    meta.assetType === 'Crypto' ||
    meta.symbol.startsWith('BINANCE:') ||
    meta.ticker.endsWith('USDT');
  const qAny = quote as any;
  const hAny = holding as any;
  const rawMarketState: string =
    isCrypto
      ? 'open'
      : qAny?.marketState || hAny?.marketState || (() => {
          const now = new Date();
          const nyStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
          const ny = new Date(nyStr);
          const day = ny.getDay();
          const mins = ny.getHours() * 60 + ny.getMinutes();
          if (day >= 1 && day <= 5 && mins >= 9 * 60 + 30 && mins < 16 * 60) return 'open';
          return 'closed';
        })();

  const isMarketOpen = isCrypto || rawMarketState === 'open';
  const extPrice: number | undefined = !isMarketOpen
    ? (qAny?.extPrice ?? hAny?.extPrice)
    : undefined;
  const extChange: number =
    extPrice != null
      ? (qAny?.extChange ?? hAny?.extChange ?? extPrice - quote.price)
      : 0;
  const extChangePct: number =
    extPrice != null
      ? (qAny?.extChangePct ?? hAny?.extChangePct ?? (quote.price > 0 ? (extChange / quote.price) * 100 : 0))
      : 0;
  const extIsUp = extChange >= 0;

  const chartPoints = chart?.points && chart.points.length >= 2
    ? chart.points
    : ([
        [Date.now() - 86400000 * 30, quote.prevClose || quote.price * 0.98],
        [Date.now(), quote.price],
      ] as [number, number][]);

  const prices = chartPoints.map((p) => p[1]);
  const minP = Math.min(...prices, fairValue?.fairValue ?? Infinity);
  const maxP = Math.max(...prices, fairValue?.fairValue ?? -Infinity);
  const spanP = (maxP - minP) || (quote.price * 0.05) || 1;
  const paddedMinP = Math.max(0, minP - spanP * 0.05);
  const paddedMaxP = maxP + spanP * 0.05;
  const paddedSpanP = paddedMaxP - paddedMinP || 1;

  const svgW = chartWidth;
  const svgH = 260;
  const padL = isMobile ? 10 : 20;
  const padR = isMobile ? 68 : 85;
  const padT = 20;
  const padB = 30;
  const innerW = Math.max(40, svgW - padL - padR);
  const innerH = svgH - padT - padB;

  const getX = (idx: number) => padL + (idx / (chartPoints.length - 1)) * innerW;
  const getY = (val: number) => padT + (1 - (val - paddedMinP) / paddedSpanP) * innerH;

  const svgCoords = chartPoints.map(([t, p], i) => [getX(i), getY(p)] as const);
  const lineD = svgCoords
    .map(([x, y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1))
    .join(' ');
  const areaD =
    lineD +
    ' L' +
    svgCoords[svgCoords.length - 1][0].toFixed(1) +
    ',' +
    (svgH - padB).toFixed(1) +
    ' L' +
    svgCoords[0][0].toFixed(1) +
    ',' +
    (svgH - padB).toFixed(1) +
    ' Z';

  const strokeColor = isUp ? 'var(--pos-bright, #10B981)' : 'var(--neg-bright, #F43F5E)';
  const currentY = getY(quote.price);
  const fvY = fairValue?.fairValue != null ? getY(fairValue.fairValue) : null;

  const activePoint = hoverIndex !== null && chartPoints[hoverIndex]
    ? {
        time: chartPoints[hoverIndex][0],
        price: chartPoints[hoverIndex][1],
        x: getX(hoverIndex),
        y: getY(chartPoints[hoverIndex][1]),
      }
    : null;

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normX = (mouseX / rect.width) * svgW;
    const ratio = Math.max(0, Math.min(1, (normX - padL) / innerW));
    const idx = Math.round(ratio * (chartPoints.length - 1));
    setHoverIndex(idx);
  };

  const initialCap = holding ? holding.value : (quote.price * 10);
  const rMonthly = Math.pow(1 + projCagr / 100, 1 / 12) - 1;

  const proj10Years = useMemo(() => {
    let v = initialCap;
    for (let m = 0; m < 120; m++) {
      v = v * (1 + rMonthly) + projMonthly;
    }
    return v;
  }, [initialCap, rMonthly, projMonthly]);

  const proj20Years = useMemo(() => {
    let v = initialCap;
    for (let m = 0; m < 240; m++) {
      v = v * (1 + rMonthly) + projMonthly;
    }
    return v;
  }, [initialCap, rMonthly, projMonthly]);

  const totalInvested10Y = initialCap + projMonthly * 120;
  const totalInvested20Y = initialCap + projMonthly * 240;

  const projCurvePoints = useMemo(() => {
    const pts = [{ yr: 0, val: initialCap, inv: initialCap }];
    let curVal = initialCap;
    for (let y = 1; y <= projHorizon; y++) {
      for (let m = 0; m < 12; m++) {
        curVal = curVal * (1 + rMonthly) + projMonthly;
      }
      pts.push({
        yr: y,
        val: curVal,
        inv: initialCap + projMonthly * 12 * y,
      });
    }
    return pts;
  }, [initialCap, rMonthly, projMonthly, projHorizon]);

  const fvStatusMap: Record<string, { label: string; color: string; bg: string }> = {
    Undervalued: { label: 'Subvaluado', color: '#10B981', bg: 'rgba(16, 185, 129, 0.16)' },
    'Fairly Valued': { label: 'En Precio Justo', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.16)' },
    Overvalued: { label: 'Sobrevaluado', color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.16)' },
    'N/A': { label: 'N/A (Cripto / Sin Flujos)', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.16)' },
  };
  const fvStatus = fvStatusMap[fairValue.status] || fvStatusMap['N/A'];

  const moatLabelMap: Record<string, string> = {
    Wide: 'Wide (Ventaja Amplia)',
    Narrow: 'Narrow (Ventaja Estrecha)',
    None: 'None (Sin Ventaja)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: '100%', overflowX: 'hidden' }}>
      {/* 1. CABECERA DEL ACTIVO: TICKER, NOMBRE, BADGES, ESTADO DE SESIÓN, PRECIO EN VIVO & POSMERCADO */}
      <div className="card" style={{ padding: isMobile ? '14px 14px' : '20px 22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 14,
          }}
        >
          {/* Identidad del activo */}
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                flexWrap: 'wrap',
              }}
            >
              <button
                className="btn btn-ghost"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => setRightState('market')}
                title="Volver a la vista de mercado Google Finance"
              >
                <ArrowLeft size={13} /> Volver
              </button>
              <h1 className="mono" style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, margin: 0 }}>
                {meta.ticker}
              </h1>
              <InlineMarketClock
                isOpen={isMarketOpen}
                label={isCrypto ? 'Mercado Abierto (24/7)' : isMarketOpen ? 'Mercado Abierto' : 'Mercado Cerrado'}
              />
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--accent-cyan)',
                  fontWeight: 600,
                }}
              >
                {meta.exchange}
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                }}
              >
                {meta.assetType}
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                {meta.sector}
              </span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span>{meta.name} · {meta.industry} ({meta.country})</span>
            </div>
          </div>

          {/* Botonera de Temporalidad Google Finance */}
          <div
            className="seg-group"
            aria-label="Rango temporal del gráfico"
            style={{
              maxWidth: '100%',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {TIMEFRAMES.map((rng) => (
              <button
                key={rng}
                className={'seg-btn ' + (selectedAssetRange === rng ? 'active' : '')}
                style={{ flexShrink: 0 }}
                onClick={() => selectAsset(assetDetail.symbol, rng)}
              >
                {rng}
              </button>
            ))}
          </div>
        </div>

        {/* Precio en vivo grande tabular & Variación diaria + Fila Posmercado con Luna */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div
              className="mono tabular"
              style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: 'var(--text-primary)' }}
            >
              {formatMoney(quote.price, currency, fxRates, { decimals: quote.price >= 100 ? 2 : 4 })}
            </div>
            <div
              className={'gf-change-row ' + (isUp ? 'pos' : 'neg')}
              style={{ fontSize: isMobile ? 13.5 : 15, fontWeight: 700 }}
            >
              <span className="mono">
                {isUp ? '+' : '−'}
                {formatMoney(Math.abs(quote.change), currency, fxRates, { decimals: 2 })} (
                {formatPct(quote.changePct)})
              </span>
              <span
                className={'gf-arrow-circle ' + (isUp ? 'up' : 'down')}
                style={{ width: 18, height: 18, fontSize: 11 }}
              >
                {isUp ? '↑' : '↓'}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 400 }}>
                {isMarketOpen ? 'En rueda activa' : 'Al cierre regular'}
              </span>
            </div>
          </div>

          {/* Fila 3 estilo Investing: Precio Posmercado con icono de Luna (SOLO mercado cerrado y no cripto) */}
          {!isMarketOpen && !isCrypto && extPrice != null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                padding: '5px 10px',
                borderRadius: 6,
                background: 'rgba(96, 165, 250, 0.08)',
                border: '1px solid rgba(96, 165, 250, 0.22)',
                alignSelf: 'flex-start',
                fontSize: 12.5,
              }}
            >
              <Moon size={13} color="#60A5FA" style={{ flexShrink: 0 }} />
              <span style={{ color: '#60A5FA', fontWeight: 600, fontSize: 11.5 }}>
                Posmercado:
              </span>
              <span className="mono tabular" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatMoney(extPrice, currency, fxRates, { decimals: 2 })}
              </span>
              <span
                className={'mono tabular ' + (extIsUp ? 'pos' : 'neg')}
                style={{ fontWeight: 600 }}
              >
                {extIsUp ? '+' : '−'}
                {formatMoney(Math.abs(extChange), currency, fxRates, { decimals: 2 })} (
                {formatPct(extChangePct)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. GRÁFICO INTERACTIVO SVG DE EVOLUCIÓN DE PRECIO CON FAIR VALUE & TOOLTIP */}
      <div
        ref={chartContainerRef}
        className="card"
        style={{ padding: isMobile ? '14px 12px' : '16px 18px', position: 'relative' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={15} color="var(--accent-cyan)" />
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              Evolución de Precio ({selectedAssetRange}) & Referencia Fair Value
            </span>
          </div>
          {fairValue.fairValue != null && (
            <div
              style={{
                fontSize: 11.5,
                color: '#F59E0B',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 0,
                  borderTop: '2px dashed #F59E0B',
                  display: 'inline-block',
                }}
              />
              Fair Value Estimado: {formatMoney(fairValue.fairValue, currency, fxRates)}
            </div>
          )}
        </div>

        {/* Floating Tooltip info bar */}
        <div
          style={{
            minHeight: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            marginBottom: 6,
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
          }}
        >
          {activePoint ? (
            <>
              <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                📅 {new Date(activePoint.time).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <span className="mono" style={{ color: strokeColor, fontWeight: 700, fontSize: 13 }}>
                Precio: {formatMoney(activePoint.price, currency, fxRates)}
              </span>
              <span className="mono" style={{ color: 'var(--text-muted)' }}>
                Var vs Inicio:{' '}
                {formatPct(((activePoint.price - chartPoints[0][1]) / chartPoints[0][1]) * 100)}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
              Desliza el cursor o toca sobre el gráfico para inspeccionar precio y fecha.
            </span>
          )}
        </div>

        {/* SVG Graphic */}
        <div style={{ width: '100%', overflow: 'hidden' }}>
          <svg
            viewBox={'0 0 ' + svgW + ' ' + svgH}
            style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient id={chartGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={strokeColor} stopOpacity={0.32} />
                <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* Grid horizontal lines */}
            {[0.25, 0.5, 0.75].map((pct, idx) => {
              const yVal = padT + pct * innerH;
              return (
                <line
                  key={idx}
                  x1={padL}
                  y1={yVal}
                  x2={svgW - padR}
                  y2={yVal}
                  stroke="var(--border-subtle)"
                  strokeDasharray="2,2"
                />
              );
            })}

            {/* Área degradada */}
            <path d={areaD} fill={'url(#' + chartGradId + ')'} />

            {/* Línea horizontal punteada de Fair Value si existe */}
            {fvY !== null && (
              <>
                <line
                  x1={padL}
                  y1={fvY}
                  x2={svgW - padR}
                  y2={fvY}
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  strokeDasharray="4,4"
                />
                <text
                  x={svgW - padR + 5}
                  y={fvY + 4}
                  fill="#F59E0B"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono"
                  fontWeight="600"
                >
                  {'FV $' + (fairValue.fairValue?.toFixed(1) ?? '')}
                </text>
              </>
            )}

            {/* Línea horizontal tenue del precio actual */}
            <line
              x1={padL}
              y1={currentY}
              x2={svgW - padR}
              y2={currentY}
              stroke="var(--text-muted)"
              strokeOpacity={0.3}
              strokeDasharray="2,2"
            />
            <text
              x={svgW - padR + 5}
              y={currentY + 4}
              fill="var(--text-secondary)"
              fontSize="9.5"
              fontFamily="JetBrains Mono"
              fontWeight="600"
            >
              {'$' + quote.price.toFixed(1)}
            </text>

            {/* Curva principal */}
            <path
              d={lineD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover Crosshair & Dot */}
            {activePoint && (
              <>
                <line
                  x1={activePoint.x}
                  y1={padT}
                  x2={activePoint.x}
                  y2={svgH - padB}
                  stroke="var(--border-strong)"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                <circle cx={activePoint.x} cy={activePoint.y} r={6} fill={strokeColor} fillOpacity={0.3} />
                <circle cx={activePoint.x} cy={activePoint.y} r={3.5} fill={strokeColor} />
              </>
            )}
          </svg>
        </div>
      </div>

      {/* 3. BLOQUE 'TU POSICIÓN EN CARTERA & HISTORIAL DE TRANSACCIONES' */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Briefcase size={16} color="var(--accent-cyan)" /> Tu Posición en Cartera & Historial de Transacciones
          </span>
          <button
            className="btn btn-primary"
            style={{ padding: '5px 12px', fontSize: 12 }}
            onClick={() => openAddModal('trade', 'ledger', assetDetail.symbol)}
          >
            <Plus size={13} /> + Operar {meta.ticker}
          </button>
        </div>

        {holding ? (
          <div>
            {/* Grilla de Métricas de la Posición */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Cantidad (Shares)
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>
                  {formatNumber(holding.qty, holding.qty % 1 === 0 ? 0 : 4)}
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Precio Promedio
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>
                  {formatMoney(holding.avgPrice, currency, fxRates)}
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Costo Invertido
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>
                  {formatMoney(holding.invested, currency, fxRates)}
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Valor Actual
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>
                  {formatMoney(holding.value, currency, fxRates)}
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  P&L no realizado
                </div>
                <div
                  className={'mono ' + (holding.unrealizedGain.v >= 0 ? 'pos' : 'neg')}
                  style={{ fontWeight: 700, fontSize: 13 }}
                >
                  {formatMoney(holding.unrealizedGain.v, currency, fxRates, { signed: true })} (
                  {formatPct(holding.unrealizedGain.p)})
                </div>
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Allocation en Cartera
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-cyan)' }}>
                  {holding.allocation.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Tabla de Historial de Transacciones */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>
                Historial de Operaciones ({trades.length} registradas)
              </div>
              {trades.length > 0 ? (
                <div
                  className="table-scroll"
                  style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
                >
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th className="num-col">Cantidad</th>
                        <th className="num-col">Precio</th>
                        <th className="num-col">Comisión</th>
                        <th className="num-col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t: any) => {
                        const totalVal = t.qty * t.price;
                        return (
                          <tr key={t.id}>
                            <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              {new Date(t.time).toLocaleDateString('es-AR', {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                              })}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  background: t.isBuy ? 'var(--pos-bg)' : 'var(--neg-bg)',
                                  color: t.isBuy ? 'var(--pos-bright)' : 'var(--neg-bright)',
                                }}
                              >
                                {t.isBuy ? 'COMPRA' : 'VENTA'}
                              </span>
                            </td>
                            <td className="num-col">{formatNumber(t.qty, t.qty % 1 === 0 ? 0 : 4)}</td>
                            <td className="num-col">{formatMoney(t.price, currency, fxRates)}</td>
                            <td className="num-col">
                              {t.commission > 0 ? formatMoney(t.commission, currency, fxRates) : '$0.00'}
                            </td>
                            <td className="num-col mono" style={{ fontWeight: 600 }}>
                              {formatMoney(totalVal, currency, fxRates)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: 8 }}>
                  No hay transacciones registradas para este activo.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '24px 20px',
              textAlign: 'center',
              borderRadius: 8,
              background: 'var(--bg-primary)',
              border: '1px dashed var(--border-strong)',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Actualmente no tienes posiciones abiertas ni historial de transacciones para{' '}
              <strong>{meta.ticker}</strong> en este portafolio.
            </div>
            <button
              className="btn btn-primary"
              onClick={() => openAddModal('trade', 'ledger', assetDetail.symbol)}
            >
              <Plus size={13} /> + Abrir Posición en Cartera ({meta.ticker})
            </button>
          </div>
        )}
      </div>

      {/* 4. MÓDULO DE FAIR VALUE EN VIVO (ESTILO MORNINGSTAR) */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Sparkles size={16} color="var(--accent-amber)" /> Fair Value en Vivo (Estilo Morningstar)
          </span>
          <span
            style={{
              fontSize: 11.5,
              padding: '3px 10px',
              borderRadius: 6,
              background: fvStatus.bg,
              color: fvStatus.color,
              fontWeight: 700,
            }}
          >
            {fvStatus.label}
          </span>
        </div>

        {/* Comparativa Visual Horizontal: Precio Actual vs Fair Value */}
        <div
          style={{
            padding: isMobile ? '12px 12px' : '16px 18px',
            borderRadius: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Precio Actual de Mercado
              </div>
              <div className="mono" style={{ fontSize: isMobile ? 17 : 22, fontWeight: 800 }}>
                {formatMoney(quote.price, currency, fxRates)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Fair Value Estimado (Intrínseco)
              </div>
              <div className="mono" style={{ fontSize: isMobile ? 17 : 22, fontWeight: 800, color: '#F59E0B' }}>
                {fairValue.fairValue != null
                  ? formatMoney(fairValue.fairValue, currency, fxRates)
                  : 'N/A'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Price / Fair Value (P/FV)
              </div>
              <div
                className="mono"
                style={{
                  fontSize: isMobile ? 17 : 22,
                  fontWeight: 800,
                  color:
                    fairValue.priceToFairValue == null
                      ? 'var(--text-muted)'
                      : fairValue.priceToFairValue < 0.9
                      ? 'var(--pos-bright)'
                      : fairValue.priceToFairValue > 1.1
                      ? 'var(--neg-bright)'
                      : 'var(--accent-amber)',
                }}
              >
                {fairValue.priceToFairValue != null
                  ? fairValue.priceToFairValue.toFixed(2) + 'x'
                  : 'N/A'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Potencial Upside / Descuento
              </div>
              <div
                className="mono"
                style={{
                  fontSize: isMobile ? 17 : 22,
                  fontWeight: 800,
                  color: (fairValue.upsidePct ?? 0) >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)',
                }}
              >
                {fairValue.upsidePct != null ? formatPct(fairValue.upsidePct) : 'N/A'}
              </div>
            </div>
          </div>

          {/* Barra visual horizontal de Posición de Precio vs Fair Value */}
          {fairValue.priceToFairValue != null && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                  flexWrap: 'wrap',
                  gap: 4,
                }}
              >
                <span>Subvaluado (&lt; 0.90x)</span>
                <span>Precio Justo (0.90x – 1.10x)</span>
                <span>Sobrevaluado (&gt; 1.10x)</span>
              </div>
              <div
                style={{
                  position: 'relative',
                  height: 12,
                  borderRadius: 6,
                  background:
                    'linear-gradient(90deg, #10B981 0%, #10B981 40%, #F59E0B 45%, #F59E0B 55%, #F43F5E 60%, #F43F5E 100%)',
                  opacity: 0.85,
                }}
              >
                {(() => {
                  const clamped = Math.max(0.5, Math.min(1.5, fairValue.priceToFairValue));
                  const markerLeftPct = ((clamped - 0.5) / 1.0) * 100;
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        top: -4,
                        bottom: -4,
                        left: markerLeftPct + '%',
                        width: 4,
                        borderRadius: 2,
                        background: '#ffffff',
                        boxShadow: '0 0 6px rgba(0,0,0,0.8), 0 0 10px #ffffff',
                        transform: 'translateX(-50%)',
                      }}
                      title={'P/FV: ' + fairValue.priceToFairValue.toFixed(2) + 'x'}
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* Desglose de Valoración: DCF + Consenso Analistas */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 10,
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Modelo DCF 10 Años: </span>
              <strong className="mono">
                {fairValue.dcfValue != null ? formatMoney(fairValue.dcfValue, currency, fxRates) : '—'}
              </strong>
            </div>
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Target Consenso Analistas: </span>
              <strong className="mono">
                {fairValue.analystTarget != null
                  ? formatMoney(fairValue.analystTarget, currency, fxRates)
                  : '—'}
              </strong>
            </div>
          </div>
        </div>

        {/* Economic Moat & Incertidumbre */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 14,
            marginBottom: 16,
          }}
        >
          {/* Economic Moat */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                <ShieldCheck size={14} color="var(--accent-cyan)" /> Economic Moat (Ventaja Competitiva)
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {moatLabelMap[fairValue.moat] || fairValue.moat}
              </span>
            </div>
            {/* Moat Score Progress Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--border-subtle)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: fairValue.moatScore + '%',
                    borderRadius: 3,
                    background:
                      fairValue.moat === 'Wide'
                        ? 'var(--accent-cyan)'
                        : fairValue.moat === 'Narrow'
                        ? 'var(--accent-amber)'
                        : 'var(--text-muted)',
                  }}
                />
              </div>
              <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>
                {fairValue.moatScore}/100
              </span>
            </div>
          </div>

          {/* Incertidumbre del Fair Value */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                <ShieldAlert size={14} color="var(--accent-amber)" /> Incertidumbre (Uncertainty)
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  background:
                    fairValue.uncertainty === 'Low'
                      ? 'var(--pos-bg)'
                      : fairValue.uncertainty === 'Medium'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'var(--neg-bg)',
                  color:
                    fairValue.uncertainty === 'Low'
                      ? 'var(--pos-bright)'
                      : fairValue.uncertainty === 'Medium'
                      ? 'var(--accent-amber)'
                      : 'var(--neg-bright)',
                }}
              >
                {fairValue.uncertainty}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              Riesgo de flujos futuros, ciclicidad operativa y volatilidad de márgenes.
            </div>
          </div>
        </div>

        {/* Grilla de 10 Múltiplos Clave */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Múltiplos Clave de Valoración & Rentabilidad
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
              gap: 8,
            }}
          >
            {[
              { label: 'P/E Trailing', val: fairValue.multiples.pe ? fairValue.multiples.pe.toFixed(1) + 'x' : '—' },
              { label: 'Forward P/E', val: fairValue.multiples.forwardPe ? fairValue.multiples.forwardPe.toFixed(1) + 'x' : '—' },
              { label: 'EV/EBITDA', val: fairValue.multiples.evToEbitda ? fairValue.multiples.evToEbitda.toFixed(1) + 'x' : '—' },
              { label: 'FCF Yield', val: fairValue.multiples.fcfYieldPct != null ? formatPct(fairValue.multiples.fcfYieldPct, false) : '—' },
              { label: 'ROIC (Proxy)', val: fairValue.multiples.roicProxyPct != null ? formatPct(fairValue.multiples.roicProxyPct, false) : '—' },
              { label: 'Gross Margin', val: fairValue.multiples.grossMarginPct != null ? formatPct(fairValue.multiples.grossMarginPct, false) : '—' },
              { label: 'Operating Margin', val: fairValue.multiples.operatingMarginPct != null ? formatPct(fairValue.multiples.operatingMarginPct, false) : '—' },
              { label: 'ROE', val: fairValue.multiples.roePct != null ? formatPct(fairValue.multiples.roePct, false) : '—' },
              { label: 'Revenue Growth', val: fairValue.multiples.revenueGrowthPct != null ? formatPct(fairValue.multiples.revenueGrowthPct, true) : '—' },
              { label: 'Debt / Equity', val: fairValue.multiples.debtToEquity != null ? fairValue.multiples.debtToEquity.toFixed(2) : '—' },
            ].map((m, idx) => (
              <div
                key={idx}
                style={{
                  padding: '9px 10px',
                  borderRadius: 6,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 2 }}>
                  {m.label}
                </div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                  {m.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. MINI-PROYECTOR A 10 / 20 AÑOS DEL ACTIVO */}
      <div className="card">
        <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <BarChart3 size={16} color="var(--accent-cyan)" /> Mini-Proyector a 10 / 20 años del Activo
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Capital Inicial: {formatMoney(initialCap, currency, fxRates)}
          </span>
        </div>

        {/* Controles Interactivos */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            padding: '14px 16px',
            borderRadius: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            marginBottom: 16,
          }}
        >
          {/* CAGR Slider & Input */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11.5,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              <span>CAGR Esperado (% anual)</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
                {projCagr.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={35}
              step={0.5}
              value={projCagr}
              onChange={(e) => setProjCagr(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>

          {/* Aporte Mensual USD */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11.5,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              <span>Aporte Mensual</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
                {formatMoney(projMonthly, 'USD', fxRates)}/mes
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2000}
              step={25}
              value={projMonthly}
              onChange={(e) => setProjMonthly(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>

          {/* Horizonte 10 o 20 años */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>
              Horizonte de Proyección
            </div>
            <div className="seg-group" style={{ width: '100%', display: 'flex' }}>
              <button
                className={'seg-btn ' + (projHorizon === 10 ? 'active' : '')}
                style={{ flex: 1 }}
                onClick={() => setProjHorizon(10)}
              >
                10 Años
              </button>
              <button
                className={'seg-btn ' + (projHorizon === 20 ? 'active' : '')}
                style={{ flex: 1 }}
                onClick={() => setProjHorizon(20)}
              >
                20 Años
              </button>
            </div>
          </div>
        </div>

        {/* Resultados del Proyector en 10 y 20 años */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {/* Valor a 10 Años */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Valor Proyectado a 10 Años
            </div>
            <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: 'var(--accent-cyan)' }}>
              {formatMoney(proj10Years, currency, fxRates, { compact: true })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Aportes: {formatMoney(totalInvested10Y, currency, fxRates, { compact: true })} · Interés:{' '}
              {formatMoney(proj10Years - totalInvested10Y, currency, fxRates, { compact: true })}
            </div>
          </div>

          {/* Valor a 20 Años */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Valor Proyectado a 20 Años
            </div>
            <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: '#10B981' }}>
              {formatMoney(proj20Years, currency, fxRates, { compact: true })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Aportes: {formatMoney(totalInvested20Y, currency, fxRates, { compact: true })} · Interés:{' '}
              {formatMoney(proj20Years - totalInvested20Y, currency, fxRates, { compact: true })}
            </div>
          </div>

          {/* Retorno Compuesto Multiplicador */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 4 }}>
              Multiplicador a {projHorizon} Años
            </div>
            <div className="mono" style={{ fontSize: 19, fontWeight: 800, color: '#F59E0B' }}>
              {((projHorizon === 10 ? proj10Years : proj20Years) / (projHorizon === 10 ? totalInvested10Y : totalInvested20Y)).toFixed(2)}x
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Aporte futuro estimado al portafolio patrimonial
            </div>
          </div>
        </div>

        {/* Curva SVG Vectorial de la Proyección Determinística */}
        <div style={{ width: '100%', overflow: 'hidden' }}>
          {(() => {
            const pW = 800;
            const pH = 180;
            const maxVal = projHorizon === 10 ? proj10Years : proj20Years;
            const scaleYProj = (v: number) => pH - 24 - (v / (maxVal * 1.05)) * (pH - 40);
            const scaleXProj = (yr: number) => 30 + (yr / projHorizon) * (pW - 60);

            const curveD = projCurvePoints
              .map((p, i) => (i === 0 ? 'M' : 'L') + scaleXProj(p.yr).toFixed(1) + ',' + scaleYProj(p.val).toFixed(1))
              .join(' ');

            const invD = projCurvePoints
              .map((p, i) => (i === 0 ? 'M' : 'L') + scaleXProj(p.yr).toFixed(1) + ',' + scaleYProj(p.inv).toFixed(1))
              .join(' ');

            return (
              <svg viewBox={'0 0 ' + pW + ' ' + pH} style={{ width: '100%', height: 'auto', display: 'block' }}>
                {/* Baseline grid */}
                <line x1={30} y1={pH - 24} x2={pW - 30} y2={pH - 24} stroke="var(--border-subtle)" />
                {/* Invested capital dashed curve */}
                <path d={invD} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="3,3" />
                {/* Total compound curve */}
                <path d={curveD} fill="none" stroke="var(--accent-cyan)" strokeWidth={2.5} strokeLinecap="round" />
                {/* Points */}
                {projCurvePoints.map((p) => {
                  if (p.yr === 0 || p.yr === 10 || p.yr === 20) {
                    return (
                      <g key={p.yr}>
                        <circle cx={scaleXProj(p.yr)} cy={scaleYProj(p.val)} r={4} fill="var(--accent-cyan)" />
                        <text
                          x={scaleXProj(p.yr)}
                          y={pH - 8}
                          fontSize={10}
                          fill="var(--text-muted)"
                          textAnchor="middle"
                          fontFamily="JetBrains Mono"
                        >
                          Año {p.yr}
                        </text>
                      </g>
                    );
                  }
                  return null;
                })}
              </svg>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
