import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { Sparkline } from '@/components/ui/Sparkline';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  Plus,
  Wallet,
  Building2,
  Globe,
  Briefcase,
  ArrowUpDown,
  ChevronRight,
} from 'lucide-react';

export const LeftPanel: React.FC = () => {
  const {
    evaluation,
    currency,
    fxRates,
    portfolioScope,
    setPortfolioScope,
    rightState,
    setRightState,
    selectedSymbol,
    selectAsset,
    openAddModal,
    netOrGrossMode,
    setNetOrGrossMode,
  } = useAppStore();

  const [sortBy, setSortBy] = useState<'value' | 'allocation' | 'daily' | 'ticker'>('value');
  const [filterText, setFilterText] = useState('');

  if (!evaluation) {
    return (
      <aside className="left-panel">
        <div style={{ padding: 20, color: 'var(--text-secondary)' }}>
          Cargando patrimonio y posiciones reales...
        </div>
      </aside>
    );
  }

  const { kpis, holdings, sparklines, portfolio } = evaluation;
  const displayedPatrimony =
    netOrGrossMode === 'gross' ? kpis.totalGrossPatrimony : kpis.portfolioValue;
  const dayPositive = kpis.lastDayGain.v >= 0;

  const filteredHoldings = [...holdings]
    .filter(
      (h) =>
        !filterText ||
        h.ticker.toLowerCase().includes(filterText.toLowerCase()) ||
        h.name.toLowerCase().includes(filterText.toLowerCase()) ||
        h.sector.toLowerCase().includes(filterText.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'ticker') return a.ticker.localeCompare(b.ticker);
      if (sortBy === 'daily') return b.dailyGain.p - a.dailyGain.p;
      if (sortBy === 'allocation') return b.allocation - a.allocation;
      return b.value - a.value;
    });

  return (
    <aside className="left-panel" aria-label="Portfolio Dashboard One-Pager Patrimonial">
      {/* 1. CABECERA PATRIMONIAL EN VIVO */}
      <div className="lp-header">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 6,
          }}
        >
          {/* Selector de Portafolio (clic abre Estado 2 en Panel Derecho) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              aria-label="Selector de Portafolio"
              className="input"
              style={{
                padding: '5px 8px',
                fontWeight: 700,
                fontSize: 12.5,
                cursor: 'pointer',
              }}
              value={portfolioScope}
              onChange={(e) => {
                setPortfolioScope(e.target.value as 'personal' | 'overview');
                setRightState('portfolio');
              }}
              onClick={() => setRightState('portfolio')}
            >
              <option value="personal">Personal largo plazo (TV)</option>
              <option value="overview">Vista General Consolidada</option>
            </select>

            <button
              className={`btn ${rightState === 'portfolio' ? 'btn-primary' : ''}`}
              style={{ padding: '5px 8px' }}
              onClick={() => setRightState('portfolio')}
              title="Abrir Dashboard Completo de Portafolio de TradingView (Estado 2)"
            >
              <Briefcase size={12} /> Panel TV <ChevronRight size={12} />
            </button>

            <button
              className={`btn ${rightState === 'market' ? 'btn-primary' : ''}`}
              style={{ padding: '5px 8px' }}
              onClick={() => setRightState('market')}
              title="Ver Inicio / Mercado estilo Google Finance (Estado 1)"
            >
              <Globe size={12} /> Mercado
            </button>
          </div>
        </div>

        {/* Valor Patrimonial Total en Vivo + Variación del día */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 6,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>
                {netOrGrossMode === 'gross'
                  ? 'VALOR BRUTO DE TENENCIAS'
                  : 'PATRIMONIO NETO (PORTFOLIO VALUE)'}
              </span>
              <button
                onClick={() =>
                  setNetOrGrossMode(netOrGrossMode === 'net' ? 'gross' : 'net')
                }
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  fontSize: 10.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {netOrGrossMode === 'net' ? 'Ver Tenencias Brutas' : 'Ver Neto TV'}
              </button>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                marginTop: 2,
                cursor: 'pointer',
              }}
              onClick={() => setRightState('portfolio')}
              title="Haz clic para abrir el Dashboard completo del portafolio"
            >
              {formatMoney(displayedPatrimony, currency, fxRates)}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>HOY (24H)</div>
            <div className={`gf-change-row ${dayPositive ? 'pos' : 'neg'}`}>
              <span>
                {formatMoney(kpis.lastDayGain.v, currency, fxRates, { signed: true })} (
                {formatPct(kpis.lastDayGain.p)})
              </span>
              <span className={`gf-arrow-circle ${dayPositive ? 'up' : 'down'}`}>
                {dayPositive ? '↑' : '↓'}
              </span>
            </div>
          </div>
        </div>

        {/* Sub-resumen de Liquidez, Ganancia Total y Botones Rápidos sin límites */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--text-secondary)',
            paddingTop: 6,
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <span className="mono">
            Tenencias: <strong>{formatMoney(kpis.grossHoldingsValue, currency, fxRates)}</strong> ·
            Cash: <span>{formatMoney(kpis.freeCash, currency, fxRates)}</span>
          </span>
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              className="btn"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => openAddModal('trade')}
              title="Agregar compra o venta sin límites"
            >
              <Plus size={11} /> Posición
            </button>
            <button
              className="btn"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => openAddModal('cash')}
              title="Sumar o retirar efectivo (Cash)"
            >
              <Wallet size={11} /> +Cash
            </button>
            <button
              className="btn"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => openAddModal('illiquid')}
              title="Sumar activo no líquido (Inmueble, Bono, Plazo Fijo, Fondo Privado)"
            >
              <Building2 size={11} /> +No Líquido
            </button>
          </div>
        </div>

        {/* Filtro rápido y ordenamiento de la lista */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            className="input"
            style={{ flex: 1, padding: '4px 8px', fontSize: 11.5 }}
            placeholder={`Filtrar ${holdings.length} posiciones (ej. NVDA, MU, TSM, BTC)...`}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <button
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11 }}
            onClick={() =>
              setSortBy(
                sortBy === 'value'
                  ? 'daily'
                  : sortBy === 'daily'
                  ? 'ticker'
                  : 'value'
              )
            }
            title="Cambiar orden de filas"
          >
            <ArrowUpDown size={11} />{' '}
            {sortBy === 'value' ? 'Valor' : sortBy === 'daily' ? '% Día' : 'Ticker'}
          </button>
        </div>
      </div>

      {/* 2. CABECERA DE LAS 5 COLUMNAS EXACTAS */}
      <div className="lp-col-headers">
        <div>Posición</div>
        <div style={{ textAlign: 'center' }}>Intradía</div>
        <div style={{ textAlign: 'right' }}>Precio / 24h</div>
        <div style={{ textAlign: 'right' }}>Alloc</div>
        <div style={{ textAlign: 'right' }}>Valor</div>
      </div>

      {/* 3. LISTADO COMPACTO DE POSICIONES REALES (5 COLUMNAS EXACTAS) */}
      <div className="lp-list">
        {filteredHoldings.map((h) => {
          const isUp = h.dailyGain.p >= 0;
          const sp = sparklines[h.symbol] || {
            prevClose: h.prevClose,
            points: [h.prevClose, h.lastPrice],
          };
          const isSelected =
            rightState === 'asset' &&
            (selectedSymbol === h.symbol || selectedSymbol.endsWith(':' + h.ticker));

          return (
            <div
              key={h.symbol}
              className={`lp-row ${isSelected ? 'selected' : ''}`}
              onClick={() => selectAsset(h.symbol)}
              title={`Ver análisis de ${h.name}, Fair Value y Proyección 10/20 años`}
            >
              {/* COLUMNA 1 — Posición (Estilo Google Finance: Ticker arriba, Nombre/Sector abajo) */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      fontSize: 11.5,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {h.ticker}
                  </span>
                  <span
                    style={{
                      fontSize: 9.5,
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {h.assetType}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                  }}
                  title={`${h.name} (${h.sector})`}
                >
                  {h.name}
                </div>
              </div>

              {/* COLUMNA 2 — Mini-Gráfico de Evolución Diaria (Sparkline Vectorial Estilo Google Finance) */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Sparkline
                  points={sp.points}
                  prevClose={sp.prevClose}
                  isPositive={isUp}
                  width={52}
                  height={18}
                />
              </div>

              {/* COLUMNA 3 — Precio y Variación Diaria Apilados + Icono Circular ↑/↓ (Estilo Google Finance) */}
              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div
                  className="mono"
                  style={{
                    fontWeight: 600,
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {formatNumber(h.lastPrice, 2)}
                </div>
                <div className={`gf-change-row ${isUp ? 'pos' : 'neg'}`}>
                  <span className="mono" style={{ fontSize: 9.5 }}>{formatPct(h.dailyGain.p)}</span>
                  <span className={`gf-arrow-circle ${isUp ? 'up' : 'down'}`}>
                    {isUp ? '↑' : '↓'}
                  </span>
                </div>
              </div>

              {/* COLUMNA 4 — Allocation (%) */}
              <div
                className="mono"
                style={{
                  textAlign: 'right',
                  fontWeight: 500,
                  fontSize: 10.5,
                  color: 'var(--text-secondary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {h.allocation.toFixed(1)}%
              </div>

              {/* COLUMNA 5 — Value (Valor Total de la Posición + P&L latente debajo) */}
              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div
                  className="mono"
                  style={{
                    fontWeight: 600,
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {formatMoney(h.value, currency, fxRates, { decimals: 0 }).replace(
                    ' ' + currency,
                    ''
                  )}
                </div>
                <div
                  className={`mono ${h.unrealizedGain.v >= 0 ? 'pos' : 'neg'}`}
                  style={{ fontSize: 9.5, fontWeight: 500 }}
                >
                  {formatPct(h.unrealizedGain.p)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Filas adicionales de Activos No Líquidos si el usuario cargó alguno */}
        {(portfolio.illiquid || []).map((ill) => (
          <div
            key={ill.id}
            className="lp-row"
            onClick={() => setRightState('portfolio')}
          >
            <div>
              <div className="mono" style={{ fontWeight: 700, fontSize: 12.5 }}>
                {ill.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {ill.category} · No Líquido ({ill.annualYieldPct}% TIR)
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--accent-amber)' }}>
              ILÍQUIDO
            </div>
            <div className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
              {formatNumber(ill.currentValue, 0)}
            </div>
            <div className="mono" style={{ textAlign: 'right' }}>
              {((ill.currentValue / (kpis.totalGrossPatrimony || 1)) * 100).toFixed(2)}%
            </div>
            <div className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
              {formatMoney(ill.currentValue, currency, fxRates)}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
