import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/store';
import { api } from '@/api';
import { Sparkline } from '@/components/ui/Sparkline';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  Search,
  Briefcase,
  ArrowUpRight,
  Calendar,
  Newspaper,
  Layers,
  Sparkles,
  Globe,
} from 'lucide-react';

function useLocalIsMobile(maxWidth = 1023): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= maxWidth : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxWidth]);
  return isMobile;
}

export const MarketView: React.FC = () => {
  const {
    marketData,
    evaluation,
    currency,
    fxRates,
    selectAsset,
    setSearchOpen,
    setRightState,
  } = useAppStore();

  const isMobile = useLocalIsMobile(1023);

  const [regionTab, setRegionTab] = useState<
    'US' | 'Europe' | 'Asia' | 'Latin America' | 'Currencies' | 'Crypto'
  >('US');
  const [searchQ, setSearchQ] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const handleSearchInput = async (val: string) => {
    setSearchQ(val);
    if (val.trim().length >= 1) {
      const res = await api.search(val);
      setSuggestions(res.slice(0, 8));
    } else {
      setSuggestions([]);
    }
  };

  if (!marketData) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Cargando vista principal de mercado (Google Finance Mode)...
        </div>
      </div>
    );
  }

  const regionSummaries: Record<
    typeof regionTab,
    { title: string; body: string; sentiment: string; driver: string }
  > = {
    US: {
      title: 'US Equities Lead on AI Infrastructure & Semiconductor Demand',
      body: 'Los índices norteamericanos (S&P 500 y NASDAQ 100) operan firmes impulsados por el gasto de capital en centros de datos de IA, memorias HBM y redes ópticas (NVDA, MU, TSM, AVGO, CRDO, CLS).',
      sentiment: 'Alcista / Risk-On',
      driver: 'CapEx récord de Hiperscalers en chips aceleradores y servidores de alta densidad.',
    },
    Europe: {
      title: 'European Markets Steady Amid Central Bank Policy Normalization',
      body: 'Las bolsas europeas mantienen flujos selectivos hacia tecnología en la nube e infraestructura de IA como Nebius Group (NBIS) y semiconductores industriales.',
      sentiment: 'Neutral / Selectivo',
      driver: 'Rebalanceo hacia infraestructura tecnológica y data centers soberanos europeos.',
    },
    Asia: {
      title: 'Taiwan Semiconductor & Asian Supply Chain Drive Global Tech',
      body: 'TSM y SIMO lideran la cadena de suministro asiática con fuerte expansión de márgenes en nodos avanzados de 2nm/3nm y controladores NAND empresariales.',
      sentiment: 'Fuerte Crecimiento',
      driver: 'Plena capacidad de empaquetado CoWoS y demanda estructural de fundición avanzada.',
    },
    'Latin America': {
      title: 'Latin America Fintech & Energy Outperform (MELI, NU, VIST, S&P Merval)',
      body: 'El sector fintech y e-commerce regional (MercadoLibre y Nu Holdings) junto con la producción energética en Vaca Muerta (Vista Energy) sostienen el crecimiento en dólares.',
      sentiment: 'Alta Rentabilidad / Expansión',
      driver: 'Penetración bancaria digital, crédito de alta calidad y exportaciones energéticas.',
    },
    Currencies: {
      title: 'Monitor de Divisas Globales y Paridad Cambiaria (USD / ARS / EUR)',
      body: 'El selector superior de FolioProspect convierte instantáneamente todo tu patrimonio, costos y proyecciones entre Dólar (USD), Peso Argentino (ARS) y Euro (EUR).',
      sentiment: 'FX Dinámico',
      driver: 'Arbitraje de tasas reales y cotización MEP / CCL para activos dolarizados (CEDEARs).',
    },
    Crypto: {
      title: 'Digital Assets & Institutional Flows (Bitcoin & Ethereum)',
      body: 'Bitcoin (BTCUSDT) y Ethereum (ETHUSDT) consolidan soporte institucional como reserva de valor digital dentro de portafolios diversificados de largo plazo.',
      sentiment: 'Consolidación Estructural',
      driver: 'Flujos sostenidos en ETFs al contado y maduración del ciclo macroeconómico.',
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: '100%', overflowX: 'hidden' }}>
      {/* 1. CARRUSEL SUPERIOR DE ÍNDICES GLOBALES EN VIVO (Estilo Google Finance) */}
      <div>
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
            <Globe size={14} color="var(--accent-cyan)" />
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
              }}
            >
              Índices Globales en Vivo (Google Finance Layout)
            </span>
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: '4px 11px', fontSize: 11.5 }}
            onClick={() => setRightState('portfolio')}
          >
            <Briefcase size={12} /> Ir al Dashboard de Portafolio (Estado 2)
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(auto-fit, minmax(145px, 1fr))'
              : 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 10,
          }}
        >
          {marketData.indices.map((idx) => {
            const isUp = idx.changePct >= 0;
            return (
              <div
                key={idx.symbol}
                className="card"
                style={{
                  padding: isMobile ? '10px 11px' : '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  minWidth: 0,
                }}
                onClick={() => selectAsset(idx.symbol)}
                title={"Analizar " + idx.name + " (" + idx.symbol + ")"}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    gap: 6,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {idx.ticker}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      {idx.region}
                    </div>
                  </div>
                  <Sparkline
                    points={idx.sparkline}
                    prevClose={idx.prevClose}
                    isPositive={isUp}
                    width={isMobile ? 52 : 64}
                    height={22}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="mono" style={{ fontWeight: 700, fontSize: 13 }}>
                    {formatNumber(idx.price, idx.price >= 100 ? 2 : 2)}
                  </span>
                  <div className={"gf-change-row " + (isUp ? "pos" : "neg")}>
                    <span>{formatPct(idx.changePct)}</span>
                    <span className={"gf-arrow-circle " + (isUp ? "up" : "down")}>
                      {isUp ? '↑' : '↓'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. BUSCADOR CENTRAL PROMINENTE DE ACTIVOS CON AUTOCOMPLETADO INSTANTÁNEO */}
      <div
        className="card"
        style={{
          position: 'relative',
          padding: isMobile ? '14px 14px' : '18px 22px',
          background:
            'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(99,102,241,0.08))',
          borderColor: 'rgba(56,189,248,0.22)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            padding: isMobile ? '9px 12px' : '10px 16px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          }}
        >
          <Search size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
          <input
            className="input"
            style={{
              border: 'none',
              background: 'transparent',
              flex: 1,
              minWidth: 0,
              fontSize: isMobile ? 15 : 14,
              padding: 0,
            }}
            placeholder={
              isMobile
                ? 'Buscar activo (NVDA, MU, TSM, MELI)...'
                : 'Buscar cualquier activo para abrir su Análisis de Fair Value y Proyección 10/20 años (ej. NVDA, MU, TSM, MELI)...'
            }
            value={searchQ}
            onChange={(e) => handleSearchInput(e.target.value)}
          />
          {searchQ ? (
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0 }}
              onClick={() => {
                setSearchQ('');
                setSuggestions([]);
              }}
            >
              Limpiar
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 8px', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}
              onClick={() => setSearchOpen(true)}
              title="Abrir buscador flotante completo"
            >
              Ctrl+K
            </button>
          )}
        </div>

        {/* Autocompletado instantáneo de la búsqueda */}
        {suggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: isMobile ? '62px' : '72px',
              left: isMobile ? '14px' : '22px',
              right: isMobile ? '14px' : '22px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
              zIndex: 30,
              overflow: 'hidden',
            }}
          >
            {suggestions.map((s) => (
              <div
                key={s.symbol}
                onClick={() => {
                  selectAsset(s.symbol);
                  setSuggestions([]);
                  setSearchQ('');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 14px',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                  gap: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span className="ticker-avatar">{s.ticker?.[0] || '•'}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong className="mono">{s.ticker}</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {s.name} ({s.exchange || s.type})
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    color: 'var(--accent-cyan)',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  Fair Value <ArrowUpRight size={13} />
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Accesos rápidos instantáneos a los activos del portafolio del usuario */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 12,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
            Sugerencias de cartera:
          </span>
          {(evaluation?.holdings || []).slice(0, 8).map((h) => (
            <button
              key={h.symbol}
              className="btn"
              style={{ padding: '3px 9px', fontSize: 11.5 }}
              onClick={() => selectAsset(h.symbol)}
              title={"Abrir análisis de " + h.name}
            >
              <span className="mono" style={{ fontWeight: 700 }}>{h.ticker}</span>
              <span className={h.dailyGain.p >= 0 ? 'pos mono' : 'neg mono'} style={{ fontSize: 11 }}>
                {formatPct(h.dailyGain.p)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. PESTAÑAS DE REGIÓN Y TARJETA DE RESUMEN DE MERCADO (Market Summary) */}
      <div className="card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div
            className="seg-group"
            style={{
              maxWidth: '100%',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {(
              ['US', 'Europe', 'Asia', 'Latin America', 'Currencies', 'Crypto'] as const
            ).map((r) => (
              <button
                key={r}
                className={"seg-btn " + (regionTab === r ? "active" : "")}
                style={{ flexShrink: 0 }}
                onClick={() => setRegionTab(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 11.5,
                color: 'var(--accent-cyan)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
              }}
            >
              <Sparkles size={13} /> Resumen de Mercado
            </span>
            <button
              className="btn btn-ghost"
              style={{ padding: '3px 8px', fontSize: 11.5 }}
              onClick={() => setRightState('portfolio')}
            >
              <Briefcase size={12} /> Dashboard Portafolio →
            </button>
          </div>
        </div>

        <div
          style={{
            padding: '14px 16px',
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
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {regionSummaries[regionTab].title}
            </div>
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 4,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--accent-cyan)',
                fontWeight: 600,
              }}
            >
              {regionSummaries[regionTab].sentiment}
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.5, marginBottom: 8 }}>
            {regionSummaries[regionTab].body}
          </p>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <strong style={{ color: 'var(--text-secondary)' }}>Catalizador Principal:</strong>
            <span>{regionSummaries[regionTab].driver}</span>
          </div>
        </div>
      </div>

      {/* 4. BLOQUE AUTO-ADAPTABLE: EQUITY SECTORS + EARNINGS & NOTICIAS */}
      <div
        className="r-grid-2"
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? '1fr'
            : 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 16,
        }}
      >
        {/* Columna Izquierda: Equity Sectors (SIXT, SIXM, SIXV, SIXY, SIXC, SIXI, SIXR, SIXE, SIXU, SIXB) */}
        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-title" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Layers size={15} color="var(--accent-cyan)" /> Equity sectors
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>S&P Sector ETFs</span>
          </div>

          <div
            className="table-scroll"
            style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticker / Sector</th>
                  <th style={{ textAlign: 'center' }}>Intradía</th>
                  <th className="num-col">Price</th>
                  <th className="num-col">24h Change</th>
                </tr>
              </thead>
              <tbody>
                {marketData.sectors.map((s) => {
                  const up = s.changePct >= 0;
                  return (
                    <tr
                      key={s.symbol}
                      onClick={() => selectAsset(s.symbol)}
                      style={{ cursor: 'pointer' }}
                      title={"Ver ETF sectorial " + s.name + " (" + s.symbol + ")"}
                    >
                      <td>
                        <div className="mono" style={{ fontWeight: 700 }}>
                          {s.ticker}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {s.name} <span style={{ color: 'var(--text-muted)' }}>({s.weight})</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', justifyContent: 'center' }}>
                          <Sparkline
                            points={s.sparkline}
                            prevClose={s.price / (1 + s.changePct / 100)}
                            isPositive={up}
                            width={64}
                            height={22}
                          />
                        </div>
                      </td>
                      <td className="num-col">{formatNumber(s.price, 2)}</td>
                      <td className="num-col">
                        <div className={"gf-change-row " + (up ? "pos" : "neg")}>
                          <span>{formatPct(s.changePct)}</span>
                          <span className={"gf-arrow-circle " + (up ? "up" : "down")}>
                            {up ? '↑' : '↓'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Columna Derecha: Upcoming Earnings + Financial News Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Upcoming earnings in your portfolio */}
          <div className="card" style={{ minWidth: 0 }}>
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Calendar size={15} color="var(--accent-amber)" /> Upcoming earnings in your portfolio
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11.5 }}
                onClick={() => setRightState('portfolio')}
              >
                Ver calendario completo <ArrowUpRight size={12} />
              </button>
            </div>
            <div
              className="table-scroll"
              style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Date</th>
                    <th className="num-col">EPS Est.</th>
                    <th className="num-col">Mkt Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {marketData.earnings.map((e: any) => (
                    <tr
                      key={e.symbol}
                      onClick={() => selectAsset(e.symbol.includes(':') ? e.symbol : "NASDAQ:" + e.symbol)}
                      style={{ cursor: 'pointer' }}
                      title={"Analizar " + e.name + " (" + e.symbol + ")"}
                    >
                      <td>
                        <span className="ticker-pill">{e.symbol}</span>{' '}
                        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {e.name}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{e.date}</td>
                      <td className="num-col">
                        {e.estimateEps != null ? "$" + e.estimateEps.toFixed(2) : '—'}
                      </td>
                      <td className="num-col">
                        {formatMoney(e.marketCap, 'USD', fxRates, { compact: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial news feed */}
          <div className="card" style={{ minWidth: 0 }}>
            <div className="card-title" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Newspaper size={15} color="var(--accent-cyan)" /> Financial news feed
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Portfolio & global market updates
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {marketData.news.map((n, idx) => (
                <div
                  key={idx}
                  onClick={() => selectAsset(n.symbol)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  title={"Ver activo " + n.symbol}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 3,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className="ticker-pill">{n.symbol}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {n.provider} · {idx + 1}h ago
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-primary)' }}>
                      {n.headline}
                    </div>
                  </div>
                  <ArrowUpRight size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
