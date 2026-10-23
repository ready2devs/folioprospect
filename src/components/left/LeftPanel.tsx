import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Sparkline } from '@/components/ui/Sparkline';
import { MarketClock } from '@/components/ui/MarketClock';
import { PriceSessionCell } from '@/components/left/PriceSessionCell';
import { NwLiquidCard } from '@/components/left/NwLiquidCard';
import { computeNwPatrimony } from '@shared/engine/nw';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  Plus,
  Wallet,
  Building2,
  Globe,
  Briefcase,
  ArrowUpDown,
  ChevronRight,
  Landmark,
} from 'lucide-react';

export const LeftPanel: React.FC = () => {
  const {
    evaluation,
    currency,
    fxRates,
    argFx,
    nwSettings,
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

  const isMobile = useIsMobile(1023);
  const isCompactRow = useIsMobile(440);

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
  const illiquidAssets = portfolio.illiquid || [];
  const illiquidTotalUsd = illiquidAssets.reduce(
    (sum, item) => sum + (item.currentValue || 0),
    0
  );

  const nw = computeNwPatrimony({
    holdings,
    grossHoldingsUsd: kpis.grossHoldingsValue,
    illiquidTotalUsd,
    cclLive: argFx?.cclRate ?? 1637.9,
    mepLive: argFx?.mepRate ?? 1553.6,
    settings: nwSettings,
  });

  const isTvLabel = nwSettings?.labelStyle === 'tv';
  const financialLedgerNetUsd = kpis.grossHoldingsValue + kpis.freeCash;
  const activeFinancialValue =
    netOrGrossMode === 'gross' ? financialLedgerNetUsd : nw.financialPortfolioLiquidUsd;

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

  // 4 columnas limpias en escritorio/tablet y 3 en teléfonos angostos (<=440px)
  const gridTemplate = isCompactRow
    ? 'minmax(110px, 1.2fr) minmax(135px, 1.4fr) minmax(80px, 0.9fr)'
    : 'minmax(108px, 1.08fr) 44px minmax(146px, 1.55fr) minmax(84px, 0.92fr)';

  return (
    <aside
      className="left-panel"
      aria-label="Portfolio Dashboard One-Pager Patrimonial"
      style={
        isMobile
          ? { height: 'auto', maxHeight: 'none', overflow: 'visible' }
          : undefined
      }
    >
      {/* 0. TARJETA MINIMALISTA NW LÍQUIDO (CON EDITOR DE FÓRMULA FX CCL/MEP Y RESERVA USD) */}
      <NwLiquidCard />

      {/* 1. CABECERA DEL PORTAFOLIO FINANCIERO (LÍQUIDO) */}
      <div className="lp-header">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
              width: '100%',
            }}
          >
            <select
              aria-label="Selector de Portafolio"
              className="input"
              style={{
                padding: '4px 8px',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                flex: '1 1 150px',
                width: isMobile ? '100%' : undefined,
                minWidth: 0,
              }}
              value={portfolioScope}
              onChange={(e) => {
                setPortfolioScope(e.target.value as 'personal' | 'overview');
                setRightState('portfolio');
              }}
            >
              <option value="personal">
                {isTvLabel ? 'Portafolio Financiero (TV)' : 'Portafolio Financiero'}
              </option>
              <option value="overview">Vista General Consolidada</option>
            </select>

            {!isMobile && (
              <>
                <button
                  type="button"
                  className={`btn ${rightState === 'portfolio' ? 'btn-primary' : ''}`}
                  style={{ padding: '4px 8px', fontSize: 11.5 }}
                  onClick={() => setRightState('portfolio')}
                  title="Abrir Dashboard Completo del Portafolio Financiero (Estado 2)"
                >
                  <Briefcase size={12} /> {isTvLabel ? 'Panel TV' : 'Panel Principal'}{' '}
                  <ChevronRight size={12} />
                </button>

                <button
                  type="button"
                  className={`btn ${rightState === 'market' ? 'btn-primary' : ''}`}
                  style={{ padding: '4px 8px', fontSize: 11.5 }}
                  onClick={() => setRightState('market')}
                  title="Ver Inicio / Mercado estilo Google Finance (Estado 1)"
                >
                  <Globe size={12} /> Mercado
                </button>
              </>
            )}
          </div>
        </div>

        {/* Valor del Portafolio Financiero Líquido + Variación del día HOY (24H) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <span>
                {netOrGrossMode === 'gross'
                  ? isTvLabel
                    ? 'PORTAFOLIO FINANCIERO (NETO LEDGER TV)'
                    : 'PORTAFOLIO FINANCIERO (NETO CONTABLE)'
                  : 'PORTAFOLIO FINANCIERO (LÍQUIDO)'}
              </span>
              <button
                type="button"
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
                {netOrGrossMode === 'gross'
                  ? 'Ver Líquido (Tenencias + Cash Comitente)'
                  : isTvLabel
                  ? 'Alternar Neto Ledger TV'
                  : 'Alternar Neto Contable'}
              </button>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                marginTop: 2,
                cursor: 'pointer',
              }}
              onClick={() => setRightState('portfolio')}
              title="Haz clic para abrir el Dashboard completo del Portafolio Financiero"
            >
              {formatMoney(activeFinancialValue, currency, fxRates)}
            </div>
          </div>

          <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              HOY (24H) · {holdings.length} POSICIONES
            </div>
            <div className={`gf-change-row ${dayPositive ? 'pos' : 'neg'}`}>
              <span className="mono">
                {formatMoney(kpis.lastDayGain.v, currency, fxRates, { signed: true })} (
                {formatPct(kpis.lastDayGain.p)})
              </span>
              <span className={`gf-arrow-circle ${dayPositive ? 'up' : 'down'}`}>
                {dayPositive ? '↑' : '↓'}
              </span>
            </div>
          </div>
        </div>

        {/* Desglose Tenencias Brutas · Cash Comitente · Neto Contable + Botones Rápidos */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10.5,
            color: 'var(--text-secondary)',
            paddingTop: 6,
            borderTop: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <div
            className="mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '2px 6px',
            }}
          >
            <span>
              Tenencias Brutas:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {formatMoney(kpis.grossHoldingsValue, currency, fxRates, {
                  decimals: 0,
                })}
              </strong>
            </span>
            <span>·</span>
            <span
              style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
              onClick={() => openAddModal('cash', 'brokerCash')}
              title="Clic para ajustar el Cash Comitente líquido en el broker"
            >
              Cash Comitente:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {formatMoney(nw.brokerCashUsd, currency, fxRates, { decimals: 0 })}
              </strong>
            </span>
            <span>·</span>
            <span title="Saldo contable de caja en el registro histórico de operaciones">
              {isTvLabel ? 'Ledger TV:' : 'Caja Contable:'}{' '}
              <span>
                {formatMoney(kpis.freeCash, currency, fxRates, { decimals: 0 })}
              </span>
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            <button
              type="button"
              className="btn"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => openAddModal('trade')}
              title="Agregar compra o venta al Portafolio Financiero"
            >
              <Plus size={11} /> Posición
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => openAddModal('cash', 'reserveUsd')}
              title="Actualizar Reserva de Efectivo USD, Cash Comitente o movimiento de caja"
            >
              <Wallet size={11} /> +Cash / Reserva
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => openAddModal('illiquid')}
              title="Sumar activo no líquido fuera del portafolio financiero"
            >
              <Building2 size={11} /> +No Líquido
            </button>
          </div>
        </div>

        {/* Filtro rápido y ordenamiento de las posiciones líquidas */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 0, padding: '4px 8px', fontSize: 11.5 }}
            placeholder={`Filtrar ${holdings.length} posiciones líquidas (ej. GOOG, NVDA, TSM, BTC)...`}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <button
            type="button"
            className="btn"
            style={{ padding: '4px 8px', fontSize: 11, flexShrink: 0 }}
            onClick={() =>
              setSortBy(
                sortBy === 'value'
                  ? 'daily'
                  : sortBy === 'daily'
                  ? 'ticker'
                  : 'value'
              )
            }
            title="Cambiar orden de posiciones"
          >
            <ArrowUpDown size={11} />{' '}
            {sortBy === 'value' ? 'Valor' : sortBy === 'daily' ? '% Día' : 'Ticker'}
          </button>
        </div>
      </div>

      {/* 2. CABECERA DE 4 COLUMNAS DEL PORTAFOLIO FINANCIERO (SIN COLUMNA ALLOC SEPARADA) */}
      <div
        className={`lp-col-headers ${isCompactRow ? 'cols-3' : 'cols-4'}`}
        style={{
          gridTemplateColumns: gridTemplate,
          padding: isCompactRow ? '6px 10px' : '6px 12px',
        }}
      >
        <div>Posición</div>
        {!isCompactRow && <div style={{ textAlign: 'center' }}>Intradía</div>}
        <div style={{ textAlign: 'right' }}>Precio / 24h</div>
        <div style={{ textAlign: 'right' }}>Valor</div>
      </div>

      {/* 3. LISTADO DE POSICIONES DEL PORTAFOLIO FINANCIERO (4 COLUMNAS EN PC, 3 EN MÓVIL) */}
      <div
        className="lp-list"
        style={
          isMobile
            ? { overflow: 'visible', height: 'auto', maxHeight: 'none', flex: 'none' }
            : undefined
        }
      >
        {filteredHoldings.map((h) => {
          const isUp = h.dailyGain.p >= 0;
          const isCrypto =
            h.assetType === 'Crypto' ||
            h.symbol.startsWith('BINANCE:') ||
            h.symbol.endsWith('USDT');
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
              className={`lp-row ${isCompactRow ? 'cols-3' : 'cols-4'} ${isSelected ? 'selected' : ''}`}
              style={{
                gridTemplateColumns: gridTemplate,
                padding: isCompactRow ? '8px 10px' : '7px 12px',
              }}
              onClick={() => selectAsset(h.symbol)}
              title={`Ver análisis de ${h.name}, Fair Value y Proyección 10/20 años`}
            >
              {/* COLUMNA 1 — Posición: Fila 1 = Ticker + badge AssetType. Fila 2 = MarketClock + Nombre */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexWrap: 'nowrap',
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {h.ticker}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {h.assetType}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 2,
                    minWidth: 0,
                  }}
                  title={`${h.name} (${h.sector})`}
                >
                  <MarketClock
                    marketState={h.marketState}
                    isCrypto={isCrypto}
                    assetType={h.assetType}
                    symbol={h.symbol}
                    size={12}
                  />
                  <span
                    style={{
                      fontSize: 10.5,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.2,
                    }}
                  >
                    {h.name}
                  </span>
                </div>
              </div>

              {/* COLUMNA 2 — Intradía (Sparkline en pantallas >440px) */}
              {!isCompactRow && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Sparkline
                    points={sp.points}
                    prevClose={sp.prevClose}
                    isPositive={isUp}
                    width={44}
                    height={18}
                  />
                </div>
              )}

              {/* COLUMNA 3 — Precio / 24h + Posmercado con Luna estilo Investing */}
              <PriceSessionCell holding={h} align="right" />

              {/* COLUMNA 4 — VALOR: 3 filas apiladas (Fila 1: Valor USD, Fila 2: P&L %, Fila 3: Alloc % cartera) */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  textAlign: 'right',
                  minWidth: 0,
                  lineHeight: 1.2,
                  gap: 1.5,
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontWeight: 700,
                    fontSize: 11.5,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatMoney(h.value, currency, fxRates, { decimals: 0 })}
                </div>
                <div
                  className={`mono ${h.unrealizedGain.v >= 0 ? 'pos' : 'neg'}`}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatPct(h.unrealizedGain.p)}
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Participación en el Portafolio Financiero"
                >
                  {h.allocation.toFixed(1)}% cartera
                </div>
              </div>
            </div>
          );
        })}

        {/* 4. SECCIÓN SEPARADA: ACTIVOS NO LÍQUIDOS / FUERA DEL PORTAFOLIO FINANCIERO */}
        <div
          style={{
            margin: '12px 10px 16px 10px',
            borderRadius: 10,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '9px 12px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Landmark size={13} color="var(--accent-amber)" />
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-amber)',
                }}
              >
                ACTIVOS NO LÍQUIDOS / FUERA DEL PORTAFOLIO FINANCIERO
              </span>
            </div>

            <button
              type="button"
              className="btn"
              style={{ padding: '3px 8px', fontSize: 10.5 }}
              onClick={() => openAddModal('illiquid')}
            >
              <Plus size={11} /> Sumar Activo No Líquido
            </button>
          </div>

          {illiquidAssets.length === 0 ? (
            <div
              style={{
                padding: '10px 12px',
                fontSize: 11,
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <span>
                Sin activos ilíquidos registrados (inmuebles, fondos privados, plazos fijos).
              </span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {formatMoney(0, currency, fxRates, { decimals: 0 })}
              </span>
            </div>
          ) : (
            <div>
              {illiquidAssets.map((ill) => {
                const gainUsd = (ill.currentValue || 0) - (ill.costBasis || 0);
                const gainPct =
                  ill.costBasis > 0 ? (gainUsd / ill.costBasis) * 100 : 0;
                return (
                  <div
                    key={ill.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border-subtle)',
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {ill.name}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {ill.category} · Costo: $
                        {formatNumber(ill.costBasis, 0)} USD · Renta est.{' '}
                        {ill.annualYieldPct}% anual
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        className="mono"
                        style={{ fontWeight: 700, fontSize: 12 }}
                      >
                        {formatMoney(ill.currentValue, currency, fxRates, {
                          decimals: 0,
                        })}
                      </div>
                      <div
                        className={`mono ${gainUsd >= 0 ? 'pos' : 'neg'}`}
                        style={{ fontSize: 9.5, fontWeight: 600 }}
                      >
                        {formatPct(gainPct)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Barra inferior de cierre: PATRIMONIO NETO TOTAL (NW Líquido + No Líquidos) */}
          <div
            style={{
              padding: '9px 12px',
              background: 'rgba(56, 189, 248, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '0.03em',
                  color: 'var(--text-primary)',
                }}
              >
                PATRIMONIO NETO TOTAL (NW Líquido + No Líquidos)
              </div>
              <div
                className="mono"
                style={{ fontSize: 10, color: 'var(--text-secondary)' }}
              >
                NW Líquido{' '}
                {formatMoney(nw.nwLiquidUsd, currency, fxRates, { decimals: 0 })}{' '}
                + No Líquidos{' '}
                {formatMoney(illiquidTotalUsd, currency, fxRates, { decimals: 0 })}
              </div>
            </div>
            <div
              className="mono"
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: 'var(--accent-cyan)',
              }}
            >
              {formatMoney(nw.nwTotalUsd, currency, fxRates)}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};