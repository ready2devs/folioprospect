import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { api } from '@/api';
import { Donut } from '@/components/ui/Donut';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import type { ProjectionResult } from '@shared/engine/types';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  Trash2,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Upload,
} from 'lucide-react';

export const PortfolioView: React.FC = () => {
  const {
    evaluation,
    currency,
    fxRates,
    portfolioTab,
    setPortfolioTab,
    benchmark,
    setBenchmark,
    netOrGrossMode,
    setNetOrGrossMode,
    selectAsset,
    openAddModal,
    refreshAll,
  } = useAppStore();

  const [tipsOpen, setTipsOpen] = useState(false);
  const [changeMode, setChangeMode] = useState<'value' | 'performance'>('performance');
  const [selectedPeriod, setSelectedPeriod] = useState<'1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'>('3M');
  const [distTab, setDistTab] = useState<'assets' | 'assetTypes' | 'sectors' | 'currency'>('assetTypes');
  const [divFilter, setDivFilter] = useState<'ex' | 'pay'>('ex');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [holdSort, setHoldSort] = useState<'value' | 'allocation' | 'unrealized' | 'daily' | 'ticker'>('value');
  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(1000);

  React.useEffect(() => {
    if (!chartContainerRef.current) return;
    const update = () => {
      if (chartContainerRef.current) {
        const w = chartContainerRef.current.clientWidth;
        if (w > 200) setChartWidth(w);
      }
    };
    update();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 200) {
          setChartWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    ro.observe(chartContainerRef.current);
    return () => ro.disconnect();
  }, [portfolioTab]);

  // Prospectiva 10/20Y interactive state
  const [projHorizon, setProjHorizon] = useState<10 | 20>(20);
  const [projMonthly, setProjMonthly] = useState<number>(1000);
  const [projCagr, setProjCagr] = useState<number>(12.0);
  const [projVol, setProjVol] = useState<number>(21.0);
  const [projInflation, setProjInflation] = useState<number>(3.0);
  const [projConverge, setProjConverge] = useState<boolean>(true);
  const [projShowReal, setProjShowReal] = useState<boolean>(false);
  const [customProj, setCustomProj] = useState<ProjectionResult | null>(null);

  if (!evaluation) {
    return (
      <div className="card">
        Cargando datos reales del portafolio de TradingView...
      </div>
    );
  }

  const {
    portfolio,
    kpis,
    holdings,
    distribution,
    series,
    risk,
    movers,
    calendar,
    tvReference,
    defaultProjection,
  } = evaluation;

  const activeProj = customProj || defaultProjection;

  const recalculateProjection = async (overrides: Partial<{
    horizonYears: 10 | 20;
    monthlyContribution: number;
    baseCagrPct: number;
    annualVolatilityPct: number;
    inflationPct: number;
    convergeToFairValue: boolean;
  }> = {}) => {
    const h = overrides.horizonYears ?? projHorizon;
    const m = overrides.monthlyContribution ?? projMonthly;
    const c = overrides.baseCagrPct ?? projCagr;
    const v = overrides.annualVolatilityPct ?? projVol;
    const inf = overrides.inflationPct ?? projInflation;
    const conv = overrides.convergeToFairValue ?? projConverge;
    const res = await api.runProjection({
      horizonYears: h,
      initialCapital: kpis.totalGrossPatrimony,
      monthlyContribution: m,
      baseCagrPct: c,
      annualVolatilityPct: v,
      inflationPct: inf,
      convergeToFairValue: conv,
      portfolioPriceToFairValue: 0.87,
    });
    setCustomProj(res);
  };

  // Slice daily series according to selectedPeriod
  const periodDaysMap: Record<typeof selectedPeriod, number> = {
    '1M': 22,
    '3M': 65,
    '6M': 130,
    YTD: 205,
    '1Y': 252,
    ALL: series.daily.length,
  };
  const sliceCount = periodDaysMap[selectedPeriod] || series.daily.length;
  const chartDaily = series.daily.slice(-Math.min(series.daily.length, Math.max(10, sliceCount)));

  const firstPt = chartDaily[0];
  const baseCumFactor = 1 + (firstPt?.cumReturnPct || 0) / 100;
  const baseBenchFactor = 1 + (firstPt?.benchmarkPct || 0) / 100;

  const chartSeries = chartDaily.map((pt) => {
    const val =
      netOrGrossMode === 'gross' ? pt.grossValue : pt.portfolioValue;
    const rebasedPortPct =
      baseCumFactor > 0 ? ((1 + pt.cumReturnPct / 100) / baseCumFactor - 1) * 100 : 0;
    const rebasedBenchPct =
      baseBenchFactor > 0 ? ((1 + pt.benchmarkPct / 100) / baseBenchFactor - 1) * 100 : 0;
    return {
      date: pt.date,
      value: val,
      portPct: rebasedPortPct,
      benchPct: rebasedBenchPct,
    };
  });

  // Distribution active rows
  const distRows =
    distTab === 'assets'
      ? distribution.assets
      : distTab === 'sectors'
      ? distribution.sectors
      : distTab === 'currency'
      ? distribution.currency
      : distribution.assetTypes;

  // Render SVG Portfolio Change Chart
  const renderPortfolioChart = () => {
    const W = chartWidth;
    const H = 260;
    const padL = 14;
    const padR = 64;
    const padT = 16;
    const padB = 26;
    const iW = W - padL - padR;
    const iH = H - padT - padB;

    if (chartSeries.length < 2) return null;

    const primaryVals = chartSeries.map((p) =>
      changeMode === 'value' ? p.value : p.portPct
    );
    const benchVals =
      changeMode === 'performance' ? chartSeries.map((p) => p.benchPct) : [];
    const allV = [...primaryVals, ...benchVals];
    const minV = Math.min(...allV);
    const maxV = Math.max(...allV);
    const span = maxV - minV || 1;

    const toX = (i: number) => padL + (i / (chartSeries.length - 1)) * iW;
    const toY = (v: number) => padT + (1 - (v - minV) / span) * iH;

    const mainPath = chartSeries
      .map((p, i) => {
        const v = changeMode === 'value' ? p.value : p.portPct;
        return `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`;
      })
      .join(' ');

    const areaPath = `${mainPath} L${toX(chartSeries.length - 1).toFixed(1)},${(
      padT + iH
    ).toFixed(1)} L${toX(0).toFixed(1)},${(padT + iH).toFixed(1)} Z`;

    const benchPath =
      changeMode === 'performance'
        ? chartSeries
            .map(
              (p, i) =>
                `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.benchPct).toFixed(1)}`
            )
            .join(' ')
        : '';

    const activeIdx = hoverIdx !== null && hoverIdx < chartSeries.length ? hoverIdx : chartSeries.length - 1;
    const activePt = chartSeries[activeIdx];

    return (
      <div ref={chartContainerRef} style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#38BDF8',
                  display: 'inline-block',
                }}
              />
              <strong>Portfolio ({portfolio.title}):</strong>{' '}
              <span className="mono">
                {changeMode === 'value'
                  ? formatMoney(activePt.value, currency, fxRates)
                  : formatPct(activePt.portPct)}
              </span>
            </span>
            {changeMode === 'performance' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#F59E0B',
                    display: 'inline-block',
                  }}
                />
                <strong>Benchmark ({benchmark}):</strong>{' '}
                <span className="mono amber">{formatPct(activePt.benchPct)}</span>
              </span>
            )}
          </div>
          <span className="mono" style={{ color: 'var(--text-secondary)' }}>
            Fecha: {activePt.date}
          </span>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 260, display: 'block', cursor: 'crosshair' }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, (relX - padL) / iW));
            setHoverIdx(Math.round(ratio * (chartSeries.length - 1)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="portChangeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#6366F1" stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padT + t * iH;
            const v = maxV - t * span;
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeDasharray="3,3"
                />
                <text
                  x={W - padR + 6}
                  y={y + 4}
                  fill="var(--text-muted)"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {changeMode === 'value'
                    ? `${(v / 1000).toFixed(1)}k`
                    : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill="url(#portChangeGrad)" />
          {changeMode === 'performance' && benchPath && (
            <path
              d={benchPath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={1.7}
              strokeDasharray="4,3"
            />
          )}
          <path
            d={mainPath}
            fill="none"
            stroke="#38BDF8"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover vertical line & dot */}
          <line
            x1={toX(activeIdx)}
            y1={padT}
            x2={toX(activeIdx)}
            y2={padT + iH}
            stroke="var(--text-secondary)"
            strokeOpacity={0.4}
            strokeDasharray="2,2"
          />
          <circle
            cx={toX(activeIdx)}
            cy={toY(changeMode === 'value' ? activePt.value : activePt.portPct)}
            r={4.5}
            fill="#38BDF8"
            stroke="#fff"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    );
  };

  // Period buttons data (with exact TradingView reference fallback when in REA snapshot mode)
  const periodCards: {
    key: '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';
    label: string;
    pct: number;
  }[] = [
    { key: '1M', label: '1 month', pct: series.periods['1M']?.pct ?? tvReference.periods['1M'] },
    { key: '3M', label: '3 months', pct: series.periods['3M']?.pct ?? tvReference.periods['3M'] },
    { key: '6M', label: '6 months', pct: series.periods['6M']?.pct ?? tvReference.periods['6M'] },
    { key: 'YTD', label: 'Year to date', pct: series.periods.YTD?.pct ?? tvReference.periods.YTD },
    { key: '1Y', label: '1 year', pct: series.periods['1Y']?.pct ?? tvReference.periods['1Y'] },
    { key: 'ALL', label: 'All time', pct: series.periods.ALL?.pct ?? tvReference.periods.ALL },
  ];

  const maxGainerPct = Math.max(...movers.gainers.map((g) => Math.abs(g.dailyGain.p)), 1);
  const maxLoserPct = Math.max(...movers.losers.map((l) => Math.abs(l.dailyGain.p)), 1);

  const todayEarnings = calendar.earnings.filter((e: any) => e.group === 'today');
  const next30Earnings = calendar.earnings.filter((e: any) => e.group === 'next30');

  return (
    <div>
      {/* 1. CABECERA DEL PORTAFOLIO */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Portfolios /</span>
          <select
            className="input"
            style={{ fontSize: 18, fontWeight: 700, padding: '6px 12px' }}
            value={portfolio.id}
            onChange={() => {}}
          >
            <option value={portfolio.id}>{portfolio.title}</option>
          </select>
          <span className="brand-badge">SIN LÍMITES DE HOLDINGS NI TRANSACCIONES</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => openAddModal('trade')}
          >
            <Plus size={14} /> + Add to portfolio
          </button>
          <button
            className="btn"
            onClick={() => openAddModal('csv')}
          >
            <Upload size={13} /> Import CSV
          </button>
          <button
            className="btn"
            onClick={() => setTipsOpen(!tipsOpen)}
          >
            {tipsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Portfolio tips
          </button>
        </div>
      </div>

      {tipsOpen && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: 'var(--bg-elevated)',
            fontSize: 12.5,
            color: 'var(--text-secondary)',
          }}
        >
          <strong style={{ color: 'var(--text-primary)' }}>
            FolioProspect SDD Engine (Réplica Superadora de TradingView Portfolios):
          </strong>{' '}
          Este portafolio contiene las 20 posiciones y las 30 transacciones históricas reales extraídas por REA, pero elimina el límite de operaciones de TradingView. Puedes cargar compras, ventas, dividendos, efectivo (Cash) y activos no líquidos ilimitados, comparar contra cualquier índice y proyectar a 10 y 20 años con simulación Monte Carlo y convergencia a Fair Value.
        </div>
      )}

      {/* 2. FILA DE 4 TARJETAS KPI SUPERIORES */}
      <div className="kpi-grid-4">
        {/* Tarjeta 1 — Portfolio value */}
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Portfolio value</span>
            <button
              onClick={() => setNetOrGrossMode(netOrGrossMode === 'net' ? 'gross' : 'net')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: 10.5,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {netOrGrossMode === 'net' ? 'Ver Bruto (180.7k)' : 'Ver Neto TV (45.8k)'}
            </button>
          </div>
          <div className="kpi-main">
            {formatMoney(
              netOrGrossMode === 'gross' ? kpis.totalGrossPatrimony : kpis.portfolioValue,
              currency,
              fxRates
            )}
          </div>
          <div className="kpi-sub">
            <span>Cash</span>
            <strong className={kpis.freeCash >= 0 ? 'pos' : 'neg'}>
              {formatMoney(kpis.freeCash, currency, fxRates)}
            </strong>
            <span style={{ color: 'var(--text-muted)' }}>
              (Holdings: {formatMoney(kpis.grossHoldingsValue, currency, fxRates)})
            </span>
          </div>
        </div>

        {/* Tarjeta 2 — Unrealized gain */}
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Unrealized gain</span>
          </div>
          <div className="kpi-main">
            <span className={kpis.unrealizedGain.v >= 0 ? 'pos' : 'neg'}>
              {formatMoney(kpis.unrealizedGain.v, currency, fxRates, { signed: true })}
            </span>
            <span
              className={kpis.unrealizedGain.p >= 0 ? 'pos' : 'neg'}
              style={{ fontSize: 13 }}
            >
              {formatPct(kpis.unrealizedGain.p)}
            </span>
          </div>
          <div className="kpi-sub">
            <span>Last day</span>
            <span className={kpis.lastDayGain.v >= 0 ? 'pos' : 'neg'}>
              {formatMoney(kpis.lastDayGain.v, currency, fxRates, { signed: true })} (
              {formatPct(kpis.lastDayGain.p)})
            </span>
          </div>
        </div>

        {/* Tarjeta 3 — Realized gain */}
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Realized gain</span>
          </div>
          <div className="kpi-main">
            <span className={kpis.realizedGain.v >= 0 ? 'pos' : 'neg'}>
              {formatMoney(kpis.realizedGain.v, currency, fxRates, { signed: true })}
            </span>
          </div>
          <div className="kpi-sub">
            <span>Total dividends</span>
            <strong>{formatMoney(kpis.dividendGain, currency, fxRates)}</strong>
          </div>
        </div>

        {/* Tarjeta 4 — Total gain */}
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Total gain</span>
          </div>
          <div className="kpi-main">
            <span className={kpis.totalGain.v >= 0 ? 'pos' : 'neg'}>
              {formatMoney(kpis.totalGain.v, currency, fxRates, { signed: true })}
            </span>
            <span className={kpis.totalGain.p >= 0 ? 'pos' : 'neg'} style={{ fontSize: 13 }}>
              {formatPct(kpis.totalGain.p)}
            </span>
          </div>
          <div className="kpi-sub">
            <span>Annualized yield</span>
            <strong className={kpis.annualizedYield >= 0 ? 'pos' : 'neg'}>
              {formatPct(kpis.annualizedYield, false)}
            </strong>
          </div>
        </div>
      </div>

      {/* 3. BARRA DE PESTAÑAS DEL PORTAFOLIO */}
      <div className="tv-tabs">
        {(
          [
            ['overview', 'Overview'],
            ['holdings', `Holdings (${holdings.length})`],
            ['transactions', `Transactions (${portfolio.trades.length})`],
            ['analysis', 'Analysis & Benchmark'],
            ['prospectiva', 'Prospectiva 10/20 Años ✦'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`tv-tab ${portfolioTab === key ? 'active' : ''}`}
            onClick={() => setPortfolioTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* =====================================================================
          PESTAÑA 1: OVERVIEW (Todos los bloques de TradingView Portfolios)
         ===================================================================== */}
      {portfolioTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 4. SECCIÓN "PORTFOLIO CHANGE" */}
          <div className="card">
            <div className="card-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>Portfolio change</span>
                <div className="seg-group">
                  <button
                    className={`seg-btn ${changeMode === 'value' ? 'active' : ''}`}
                    onClick={() => setChangeMode('value')}
                  >
                    Value
                  </button>
                  <button
                    className={`seg-btn ${changeMode === 'performance' ? 'active' : ''}`}
                    onClick={() => setChangeMode('performance')}
                  >
                    Performance
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Compare / Benchmark:
                </span>
                <select
                  className="input"
                  style={{ padding: '4px 8px', fontSize: 12 }}
                  value={benchmark}
                  onChange={(e) => setBenchmark(e.target.value)}
                >
                  <option value="SP:SPX">S&P 500 (SP:SPX)</option>
                  <option value="NASDAQ:NDX">NASDAQ 100 (NDX)</option>
                  <option value="DJ:DJI">Dow Jones (DJI)</option>
                  <option value="BCBA:IMV">S&P Merval (IMV)</option>
                  <option value="BINANCE:BTCUSDT">Bitcoin (BTCUSDT)</option>
                </select>
              </div>
            </div>

            {renderPortfolioChart()}

            {/* Botonera inferior de 6 períodos con sus rendimientos reales */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: 8,
                marginTop: 12,
              }}
            >
              {periodCards.map((p) => {
                const isAct = selectedPeriod === p.key;
                const up = p.pct >= 0;
                return (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPeriod(p.key)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: isAct
                        ? '1px solid var(--accent-cyan)'
                        : '1px solid var(--border-subtle)',
                      background: isAct ? 'var(--bg-hover)' : 'var(--bg-primary)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {p.label}
                    </div>
                    <div
                      className={`mono ${up ? 'pos' : 'neg'}`}
                      style={{ fontSize: 13.5, fontWeight: 700, marginTop: 2 }}
                    >
                      {formatPct(p.pct)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. SECCIÓN DOBLE "DAILY GAINERS" Y "DAILY LOSERS" */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-title">
                <span>Daily gainers</span>
                <span style={{ fontSize: 11, color: 'var(--pos-bright)' }}>Top 5 Subas</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {movers.gainers.map((g) => {
                  const widthPct = Math.max(12, (Math.abs(g.dailyGain.p) / maxGainerPct) * 100);
                  return (
                    <div
                      key={g.symbol}
                      onClick={() => selectAsset(g.symbol)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '110px 1fr 72px',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="ticker-avatar">{g.ticker[0]}</span>
                        <span className="ticker-pill">{g.ticker}</span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          background: 'var(--bg-primary)',
                          borderRadius: 5,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${widthPct}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #059669, #10B981)',
                            borderRadius: 5,
                          }}
                        />
                      </div>
                      <div className="mono pos" style={{ textAlign: 'right', fontWeight: 700 }}>
                        {formatPct(g.dailyGain.p)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span>Daily losers</span>
                <span style={{ fontSize: 11, color: 'var(--neg-bright)' }}>Top 5 Bajas</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {movers.losers.map((l) => {
                  const widthPct = Math.max(12, (Math.abs(l.dailyGain.p) / maxLoserPct) * 100);
                  return (
                    <div
                      key={l.symbol}
                      onClick={() => selectAsset(l.symbol)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '110px 1fr 72px',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="ticker-avatar">{l.ticker[0]}</span>
                        <span className="ticker-pill">{l.ticker}</span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          background: 'var(--bg-primary)',
                          borderRadius: 5,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${widthPct}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #E11D48, #F43F5E)',
                            borderRadius: 5,
                          }}
                        />
                      </div>
                      <div className="mono neg" style={{ textAlign: 'right', fontWeight: 700 }}>
                        {formatPct(l.dailyGain.p)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 6. SECCIÓN "PORTFOLIO DISTRIBUTION" (Gráfico Donut + Tabla Desglosada) */}
          <div className="card">
            <div className="card-title">
              <span>Portfolio distribution</span>
              <div className="seg-group">
                {(
                  [
                    ['assets', 'Assets'],
                    ['assetTypes', 'Asset types'],
                    ['sectors', 'Sectors'],
                    ['currency', 'Currency'],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    className={`seg-btn ${distTab === k ? 'active' : ''}`}
                    onClick={() => setDistTab(k)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr',
                alignItems: 'center',
                gap: 24,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Donut
                  rows={distRows}
                  totalCount={kpis.totalAssetsCount}
                  centerSubtitle="Total assets"
                />
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      {distTab === 'assets'
                        ? 'Asset'
                        : distTab === 'sectors'
                        ? 'Sector'
                        : distTab === 'currency'
                        ? 'Currency'
                        : 'Asset type'}
                    </th>
                    <th className="num-col">Holding value</th>
                    <th className="num-col">Allocation</th>
                    <th className="num-col">Unrealized gain</th>
                  </tr>
                </thead>
                <tbody>
                  {distRows.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              background: r.color,
                              display: 'inline-block',
                            }}
                          />
                          <strong>{r.label}</strong>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            ({r.count})
                          </span>
                        </span>
                      </td>
                      <td className="num-col">
                        {formatMoney(r.value, currency, fxRates)}
                      </td>
                      <td className="num-col">{r.allocation.toFixed(2)}%</td>
                      <td className={`num-col ${r.unrealizedGain >= 0 ? 'pos' : 'neg'}`}>
                        {formatMoney(r.unrealizedGain, currency, fxRates, { signed: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 7. SECCIÓN "UPCOMING EARNINGS" */}
          <div className="card">
            <div className="card-title">
              <span>Upcoming earnings</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Calendario de Resultados de la Cartera
              </span>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th className="num-col">Estimate EPS</th>
                  <th className="num-col">Actual EPS</th>
                  <th className="num-col">Surprise</th>
                  <th className="num-col">Market cap</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--accent-cyan)',
                      background: 'var(--bg-elevated)',
                      padding: '5px 10px',
                    }}
                  >
                    TODAY & YESTERDAY
                  </td>
                </tr>
                {todayEarnings.map((e: any) => (
                  <tr
                    key={e.symbol}
                    onClick={() => selectAsset(`NASDAQ:${e.symbol}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="ticker-avatar">{e.symbol[0]}</span>
                        <div>
                          <span className="ticker-pill">{e.symbol}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {e.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{e.date}</td>
                    <td className="mono">
                      {e.time ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Moon size={12} color="var(--accent-amber)" /> {e.time}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num-col">
                      {e.estimateEps != null ? `${e.estimateEps.toFixed(2)} USD` : '—'}
                    </td>
                    <td className="num-col">
                      {e.actualEps != null ? `${e.actualEps.toFixed(2)} USD` : '—'}
                    </td>
                    <td
                      className={`num-col ${
                        e.surprise == null ? '' : e.surprise >= 0 ? 'pos' : 'neg'
                      }`}
                    >
                      {e.surprise != null ? formatPct(e.surprise) : '—'}
                    </td>
                    <td className="num-col">
                      {formatMoney(e.marketCap, 'USD', fxRates, { compact: true })}
                    </td>
                  </tr>
                ))}

                <tr>
                  <td
                    colSpan={7}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--accent-cyan)',
                      background: 'var(--bg-elevated)',
                      padding: '5px 10px',
                    }}
                  >
                    NEXT 30 DAYS
                  </td>
                </tr>
                {next30Earnings.map((e: any) => (
                  <tr
                    key={e.symbol}
                    onClick={() => selectAsset(`NASDAQ:${e.symbol}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="ticker-avatar">{e.symbol[0]}</span>
                        <div>
                          <span className="ticker-pill">{e.symbol}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {e.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">{e.date}</td>
                    <td className="mono">
                      <Sun size={12} color="var(--text-muted)" />
                    </td>
                    <td className="num-col">
                      {e.estimateEps != null ? `${e.estimateEps.toFixed(2)} USD` : '—'}
                    </td>
                    <td className="num-col">—</td>
                    <td className="num-col">—</td>
                    <td className="num-col">
                      {formatMoney(e.marketCap, 'USD', fxRates, { compact: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 8. SECCIÓN "UPCOMING DIVIDENDS" */}
          <div className="card">
            <div className="card-title">
              <span>Upcoming dividends</span>
              <div className="seg-group">
                <button
                  className={`seg-btn ${divFilter === 'ex' ? 'active' : ''}`}
                  onClick={() => setDivFilter('ex')}
                >
                  By ex-dividend date
                </button>
                <button
                  className={`seg-btn ${divFilter === 'pay' ? 'active' : ''}`}
                  onClick={() => setDivFilter('pay')}
                >
                  By payment date
                </button>
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="num-col">Amount</th>
                  <th>Ex-dividend date</th>
                  <th>Payment date</th>
                  <th className="num-col">Dividend yield</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--accent-cyan)',
                      background: 'var(--bg-elevated)',
                      padding: '5px 10px',
                    }}
                  >
                    NEXT 30 DAYS
                  </td>
                </tr>
                {calendar.dividends.map((d: any) => (
                  <tr
                    key={d.symbol}
                    onClick={() => selectAsset(`NASDAQ:${d.symbol}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="ticker-avatar">{d.symbol[0]}</span>
                        <div>
                          <span className="ticker-pill">{d.symbol}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {d.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num-col">{d.amount.toFixed(2)} USD</td>
                    <td className="mono">{d.exDate}</td>
                    <td className="mono">{d.payDate}</td>
                    <td className="num-col pos">{d.yield.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 9. SECCIÓN "NEWS" */}
          <div className="card">
            <div className="card-title">
              <span>News</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                Filtrado por activos del portafolio
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Instrument</th>
                  <th>Headline</th>
                  <th>Provider</th>
                </tr>
              </thead>
              <tbody>
                {calendar.news.map((n: any, idx: number) => (
                  <tr
                    key={idx}
                    onClick={() => selectAsset(n.symbol)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="mono" style={{ color: 'var(--text-muted)', width: 90 }}>
                      {idx + 1}h ago
                    </td>
                    <td style={{ width: 110 }}>
                      <span className="ticker-pill">{n.symbol}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{n.headline}</td>
                    <td style={{ color: 'var(--text-secondary)', width: 150 }}>{n.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 2: HOLDINGS (Tabla completa ordenable de las 20+ posiciones)
         ===================================================================== */}
      {portfolioTab === 'holdings' && (
        <div className="card">
          <div className="card-title">
            <span>Holdings Abiertos ({holdings.length} posiciones sin límites)</span>
            <button className="btn btn-primary" onClick={() => openAddModal('trade')}>
              <Plus size={14} /> Agregar Posición
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => setHoldSort('ticker')}>Symbol / Asset</th>
                  <th>Type</th>
                  <th className="num-col">Qty</th>
                  <th className="num-col">Avg Price</th>
                  <th className="num-col">Last Price</th>
                  <th className="num-col">Invested Cost</th>
                  <th className="num-col" onClick={() => setHoldSort('value')}>
                    Holding Value
                  </th>
                  <th className="num-col" onClick={() => setHoldSort('allocation')}>
                    Allocation %
                  </th>
                  <th className="num-col" onClick={() => setHoldSort('unrealized')}>
                    Unrealized Gain
                  </th>
                  <th className="num-col" onClick={() => setHoldSort('daily')}>
                    Daily Gain
                  </th>
                  <th className="num-col">Annualized Yield</th>
                </tr>
              </thead>
              <tbody>
                {[...holdings]
                  .sort((a, b) => {
                    if (holdSort === 'ticker') return a.ticker.localeCompare(b.ticker);
                    if (holdSort === 'allocation') return b.allocation - a.allocation;
                    if (holdSort === 'unrealized') return b.unrealizedGain.v - a.unrealizedGain.v;
                    if (holdSort === 'daily') return b.dailyGain.p - a.dailyGain.p;
                    return b.value - a.value;
                  })
                  .map((h) => (
                    <tr
                      key={h.symbol}
                      onClick={() => selectAsset(h.symbol)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="ticker-avatar">{h.ticker[0]}</span>
                          <div>
                            <div className="mono" style={{ fontWeight: 700 }}>
                              {h.ticker}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              {h.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="ticker-pill">{h.assetType}</span>
                      </td>
                      <td className="num-col">{formatNumber(h.qty, h.qty % 1 === 0 ? 0 : 4)}</td>
                      <td className="num-col">{formatNumber(h.avgPrice, 2)}</td>
                      <td className="num-col">{formatNumber(h.lastPrice, 2)}</td>
                      <td className="num-col">{formatMoney(h.invested, currency, fxRates)}</td>
                      <td className="num-col" style={{ fontWeight: 700 }}>
                        {formatMoney(h.value, currency, fxRates)}
                      </td>
                      <td className="num-col">{h.allocation.toFixed(2)}%</td>
                      <td className={`num-col ${h.unrealizedGain.v >= 0 ? 'pos' : 'neg'}`}>
                        {formatMoney(h.unrealizedGain.v, currency, fxRates, { signed: true })} (
                        {formatPct(h.unrealizedGain.p)})
                      </td>
                      <td className={`num-col ${h.dailyGain.v >= 0 ? 'pos' : 'neg'}`}>
                        {formatMoney(h.dailyGain.v, currency, fxRates, { signed: true })} (
                        {formatPct(h.dailyGain.p)})
                      </td>
                      <td className={`num-col ${h.annualizedYield >= 0 ? 'pos' : 'neg'}`}>
                        {formatPct(h.annualizedYield)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 3: TRANSACTIONS (Libro Mayor Ilimitado de Operaciones)
         ===================================================================== */}
      {portfolioTab === 'transactions' && (
        <div className="card">
          <div className="card-title">
            <span>
              Libro Mayor de Transacciones ({portfolio.trades.length} operaciones registradas)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={() => openAddModal('csv')}>
                <Upload size={13} /> Importar CSV
              </button>
              <button className="btn btn-primary" onClick={() => openAddModal('trade')}>
                <Plus size={14} /> Nueva Transacción
              </button>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="num-col">Qty</th>
                <th className="num-col">Fill Price</th>
                <th className="num-col">Total Value</th>
                <th className="num-col">Commission</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {[...portfolio.trades]
                .sort((a, b) => b.time - a.time)
                .map((t) => (
                  <tr key={t.id}>
                    <td className="mono">
                      {new Date(t.time).toISOString().slice(0, 10)}
                    </td>
                    <td>
                      <span
                        className="ticker-pill"
                        style={{ cursor: 'pointer' }}
                        onClick={() => selectAsset(t.symbol)}
                      >
                        {t.symbol}
                      </span>
                    </td>
                    <td>
                      <span
                        className={t.isBuy ? 'pos mono' : 'neg mono'}
                        style={{ fontWeight: 700 }}
                      >
                        {t.isBuy ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td className="num-col">{formatNumber(t.qty, t.qty % 1 === 0 ? 0 : 6)}</td>
                    <td className="num-col">{formatNumber(t.price, 2)} USD</td>
                    <td className="num-col">
                      {formatMoney(t.qty * t.price, currency, fxRates)}
                    </td>
                    <td className="num-col">{formatNumber(t.commission, 2)} USD</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        onClick={async () => {
                          await api.deleteTrade(portfolio.id, t.id);
                          await refreshAll();
                        }}
                        title="Eliminar transacción"
                      >
                        <Trash2 size={13} color="var(--neg-bright)" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 4: ANALYSIS (Métricas de Riesgo + Comparación Mensual Benchmark)
         ===================================================================== */}
      {portfolioTab === 'analysis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="kpi-grid-4">
            <div className="kpi-card">
              <div className="kpi-label">Sharpe Ratio (Mensual)</div>
              <div className="kpi-main">{risk.sharpeRatio.user.toFixed(2)}</div>
              <div className="kpi-sub">
                Benchmark ({benchmark}): {risk.sharpeRatio.benchmark.toFixed(2)}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Sortino Ratio</div>
              <div className="kpi-main pos">{risk.sortinoRatio.user.toFixed(2)}</div>
              <div className="kpi-sub">
                Benchmark ({benchmark}): {risk.sortinoRatio.benchmark.toFixed(2)}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Beta de Cartera vs {benchmark}</div>
              <div className="kpi-main amber">{risk.beta.toFixed(2)}</div>
              <div className="kpi-sub">
                Volatilidad Anual: {risk.annualizedVolatility.toFixed(2)}%
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Rendimiento TWR / MWR (XIRR)</div>
              <div className="kpi-main pos">{formatPct(kpis.totalGain.p)}</div>
              <div className="kpi-sub">
                MWR/XIRR: {formatPct(risk.mwrIrrPct)} · Max DD: -{risk.maxDrawdownPct.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              <span>
                Evolución Mensual Comparada (Modified Dietz vs {benchmark}) — Paridad REA TradingView
              </span>
              <ShieldAlert size={16} color="var(--accent-cyan)" />
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Mes Calendario</th>
                  <th className="num-col">Ganancia Mensual Portafolio</th>
                  <th className="num-col">Retorno Portafolio (%)</th>
                  <th className="num-col">Retorno Benchmark ({benchmark})</th>
                  <th className="num-col">Alpha Mensual (Exceso)</th>
                </tr>
              </thead>
              <tbody>
                {series.monthly.map((m) => {
                  const alpha = m.userReturnPct - m.benchReturnPct;
                  return (
                    <tr key={m.month}>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        {m.month}
                      </td>
                      <td className={`num-col ${m.userGain >= 0 ? 'pos' : 'neg'}`}>
                        {formatMoney(m.userGain, currency, fxRates, { signed: true })}
                      </td>
                      <td className={`num-col ${m.userReturnPct >= 0 ? 'pos' : 'neg'}`}>
                        {formatPct(m.userReturnPct)}
                      </td>
                      <td className={`num-col ${m.benchReturnPct >= 0 ? 'pos' : 'neg'}`}>
                        {formatPct(m.benchReturnPct)}
                      </td>
                      <td className={`num-col ${alpha >= 0 ? 'pos' : 'neg'}`}>
                        {formatPct(alpha)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          PESTAÑA 5: PROSPECTIVA 10/20 AÑOS (Diferencial FolioProspect Monte Carlo)
         ===================================================================== */}
      {portfolioTab === 'prospectiva' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-title">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="var(--accent-cyan)" />
                Motor de Prospectiva Patrimonial a 10 y 20 Años (Escenarios + Monte Carlo 1,000 Sim.)
              </span>
              <div className="seg-group">
                <button
                  className={`seg-btn ${projHorizon === 10 ? 'active' : ''}`}
                  onClick={() => {
                    setProjHorizon(10);
                    recalculateProjection({ horizonYears: 10 });
                  }}
                >
                  Horizonte 10 Años
                </button>
                <button
                  className={`seg-btn ${projHorizon === 20 ? 'active' : ''}`}
                  onClick={() => {
                    setProjHorizon(20);
                    recalculateProjection({ horizonYears: 20 });
                  }}
                >
                  Horizonte 20 Años
                </button>
              </div>
            </div>

            {/* Controles interactivos de simulación */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 12,
                padding: 12,
                borderRadius: 8,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                marginBottom: 16,
              }}
            >
              <div className="form-field">
                <label>Aporte Mensual (USD)</label>
                <input
                  type="number"
                  className="input mono"
                  value={projMonthly}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setProjMonthly(v);
                    recalculateProjection({ monthlyContribution: v });
                  }}
                />
              </div>
              <div className="form-field">
                <label>CAGR Base Esperado (%)</label>
                <input
                  type="number"
                  step="0.5"
                  className="input mono"
                  value={projCagr}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setProjCagr(v);
                    recalculateProjection({ baseCagrPct: v });
                  }}
                />
              </div>
              <div className="form-field">
                <label>Volatilidad Anual σ (%)</label>
                <input
                  type="number"
                  step="1"
                  className="input mono"
                  value={projVol}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setProjVol(v);
                    recalculateProjection({ annualVolatilityPct: v });
                  }}
                />
              </div>
              <div className="form-field">
                <label>Inflación Anual (%)</label>
                <input
                  type="number"
                  step="0.5"
                  className="input mono"
                  value={projInflation}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setProjInflation(v);
                    recalculateProjection({ inflationPct: v });
                  }}
                />
              </div>
              <div className="form-field">
                <label>Opciones de Valoración</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    className={`btn ${projConverge ? 'btn-primary' : ''}`}
                    style={{ flex: 1, fontSize: 11 }}
                    onClick={() => {
                      const next = !projConverge;
                      setProjConverge(next);
                      recalculateProjection({ convergeToFairValue: next });
                    }}
                  >
                    Conv. Fair Value
                  </button>
                  <button
                    className={`btn ${projShowReal ? 'btn-primary' : ''}`}
                    style={{ flex: 1, fontSize: 11 }}
                    onClick={() => setProjShowReal(!projShowReal)}
                  >
                    {projShowReal ? 'Real (Infl.)' : 'Nominal'}
                  </button>
                </div>
              </div>
            </div>

            {/* Tarjetas resumen a 10 y 20 años */}
            <div className="kpi-grid-4">
              <div className="kpi-card">
                <div className="kpi-label">Capital Inicial (Tenencias Brutas)</div>
                <div className="kpi-main">
                  {formatMoney(activeProj.initialCapital, currency, fxRates)}
                </div>
                <div className="kpi-sub">
                  Aporte anual: {formatMoney(projMonthly * 12, currency, fxRates)}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Proyección Base a 10 Años</div>
                <div className="kpi-main cyan">
                  {formatMoney(
                    projShowReal ? activeProj.summary10Y.realBase : activeProj.summary10Y.base,
                    currency,
                    fxRates,
                    { compact: true }
                  )}
                </div>
                <div className="kpi-sub">
                  MC P10–P90: {formatMoney(activeProj.summary10Y.mcP10, currency, fxRates, { compact: true })} –{' '}
                  {formatMoney(activeProj.summary10Y.mcP90, currency, fxRates, { compact: true })}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Proyección Base a {projHorizon} Años</div>
                <div className="kpi-main pos">
                  {formatMoney(
                    projShowReal
                      ? activeProj.points[activeProj.points.length - 1].realBase
                      : activeProj.points[activeProj.points.length - 1].base,
                    currency,
                    fxRates,
                    { compact: true }
                  )}
                </div>
                <div className="kpi-sub">
                  Escenario Optimista:{' '}
                  {formatMoney(
                    activeProj.points[activeProj.points.length - 1].optimistic,
                    currency,
                    fxRates,
                    { compact: true }
                  )}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Banda Monte Carlo P90 ({projHorizon}Y)</div>
                <div className="kpi-main amber">
                  {formatMoney(
                    activeProj.points[activeProj.points.length - 1].mcP90,
                    currency,
                    fxRates,
                    { compact: true }
                  )}
                </div>
                <div className="kpi-sub">
                  Conservador P10:{' '}
                  {formatMoney(
                    activeProj.points[activeProj.points.length - 1].mcP10,
                    currency,
                    fxRates,
                    { compact: true }
                  )}
                </div>
              </div>
            </div>

            {/* Tabla año por año de la proyección */}
            <table className="data-table">
              <thead>
                <tr>
                  <th>Año</th>
                  <th className="num-col">Capital Aportado Acum.</th>
                  <th className="num-col">Conservador</th>
                  <th className="num-col">Escenario Base</th>
                  <th className="num-col">Escenario Base Real (Infl.)</th>
                  <th className="num-col">Optimista</th>
                  <th className="num-col">Monte Carlo P10 / P50 / P90</th>
                </tr>
              </thead>
              <tbody>
                {activeProj.points
                  .filter((p) => p.year === 0 || p.year % 2 === 0 || p.year === activeProj.horizonYears)
                  .map((p) => (
                    <tr key={p.year}>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        Año {p.year} ({p.calendarYear})
                      </td>
                      <td className="num-col">
                        {formatMoney(p.investedCumulative, currency, fxRates, { decimals: 0 })}
                      </td>
                      <td className="num-col">
                        {formatMoney(p.conservative, currency, fxRates, { decimals: 0 })}
                      </td>
                      <td className="num-col cyan" style={{ fontWeight: 700 }}>
                        {formatMoney(p.base, currency, fxRates, { decimals: 0 })}
                      </td>
                      <td className="num-col">
                        {formatMoney(p.realBase, currency, fxRates, { decimals: 0 })}
                      </td>
                      <td className="num-col pos">
                        {formatMoney(p.optimistic, currency, fxRates, { decimals: 0 })}
                      </td>
                      <td className="num-col" style={{ fontSize: 11.5 }}>
                        {formatMoney(p.mcP10, currency, fxRates, { compact: true })} /{' '}
                        <strong>{formatMoney(p.mcP50, currency, fxRates, { compact: true })}</strong> /{' '}
                        <span className="amber">
                          {formatMoney(p.mcP90, currency, fxRates, { compact: true })}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
