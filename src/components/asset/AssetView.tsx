import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  ArrowLeft,
  BarChart3,
  Briefcase,
  Moon,
  Plus,
} from 'lucide-react';
import { FinvizChart } from './FinvizChart';
import { OpportunitySheet } from './OpportunitySheet';

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
    assetError,
    selectedSymbol,
    selectedAssetRange,
    selectAsset,
    currency,
    fxRates,
    openAddModal,
    setRightState,
  } = useAppStore();

  const isMobile = useLocalIsMobile(1023);

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

  if (!assetDetail) {
    if (assetError) {
      return (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            No se pudo cargar el detalle de {selectedSymbol}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginBottom: 16 }}>
            {assetError} El resto de la app sigue funcionando.
          </div>
          <button
            className="btn btn-primary"
            onClick={() => selectAsset(selectedSymbol, selectedAssetRange || '1Y')}
          >
            Reintentar
          </button>{' '}
          <button className="btn btn-ghost" onClick={() => setRightState('portfolio')}>
            Volver al portafolio
          </button>
        </div>
      );
    }
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>
          Cargando análisis detallado de {selectedSymbol}...
        </div>
      </div>
    );
  }

  // Respuesta malformada (p. ej. error 500 del servidor): antes esto rompía
  // el render completo y dejaba la pantalla negra. Ahora se muestra un
  // estado de error recuperable.
  if (
    !assetDetail.meta ||
    !assetDetail.quote ||
    typeof assetDetail.quote.price !== 'number' ||
    !Number.isFinite(assetDetail.quote.price)
  ) {
    return (
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
          No se pudo cargar el detalle de {selectedSymbol}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginBottom: 16 }}>
          La fuente de datos no devolvió la información completa de este activo. El resto de la app
          sigue funcionando.
        </div>
        <button
          className="btn btn-primary"
          onClick={() => selectAsset(selectedSymbol, selectedAssetRange || '1Y')}
        >
          Reintentar
        </button>{' '}
        <button className="btn btn-ghost" onClick={() => setRightState('portfolio')}>
          Volver al portafolio
        </button>
      </div>
    );
  }

  const { meta, quote, holding, trades, chart } = assetDetail;
  // Fair Value puede faltar (cripto / sin fundamentales): valores seguros.
  const fairValue = assetDetail.fairValue ?? {
    symbol: assetDetail.symbol,
    currentPrice: quote.price,
    fairValue: null,
    dcfValue: null,
    analystTarget: null,
    priceToFairValue: null,
    status: 'N/A' as const,
    upsidePct: null,
    moat: 'None' as const,
    moatScore: 0,
    uncertainty: 'Extreme' as const,
    multiples: {
      pe: null,
      forwardPe: null,
      evToEbitda: null,
      fcfYieldPct: null,
      roicProxyPct: null,
      grossMarginPct: null,
      operatingMarginPct: null,
      roePct: null,
      revenueGrowthPct: null,
      debtToEquity: null,
    },
    implied10YReturnCagrPct: 11.5,
  };
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

  const chartPoints: [number, number][] =
    chart?.points && chart.points.length >= 2
      ? chart.points
      : [
          [Date.now() - 86400000 * 30, quote.prevClose || quote.price * 0.98],
          [Date.now(), quote.price],
        ];

  const initialCap = holding ? holding.value : (quote.price * 10);
  const rMonthly = Math.pow(1 + projCagr / 100, 1 / 12) - 1;

  // NOTA: cálculos planos, sin useMemo — ningún hook puede ir después de los
  // returns tempranos de carga/error (reglas de hooks).
  const proj10Years = (() => {
    let v = initialCap;
    for (let m = 0; m < 120; m++) {
      v = v * (1 + rMonthly) + projMonthly;
    }
    return v;
  })();

  const proj20Years = (() => {
    let v = initialCap;
    for (let m = 0; m < 240; m++) {
      v = v * (1 + rMonthly) + projMonthly;
    }
    return v;
  })();

  const totalInvested10Y = initialCap + projMonthly * 120;
  const totalInvested20Y = initialCap + projMonthly * 240;

  const projCurvePoints = (() => {
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
  })();

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

      {/* 2. OVERVIEW DE PRECIO ESTILO FINVIZ (ancho completo) + FICHA DE EVALUACIÓN DE OPORTUNIDAD */}
      <div className="card" style={{ padding: isMobile ? '12px 10px' : '16px 18px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 6,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Evolución del precio ({selectedAssetRange}) · velas, SMA 20/50/200, volumen y canal de tendencia
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Lectura visual (estilo Finviz): manda el análisis fundamental de la ficha, no el gráfico.
          </span>
        </div>
        <FinvizChart
          candles={chart?.candles || []}
          fallbackPoints={chartPoints}
          fairValue={fairValue.fairValue}
          height={isMobile ? 300 : 400}
        />
      </div>

      <OpportunitySheet key={assetDetail.symbol} detail={assetDetail} isMobile={isMobile} />

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

      {/* 4. (La valuación vive ahora en la ficha de Evaluación de oportunidad, sección 2.) */}

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
