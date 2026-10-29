import React, { useState } from 'react';
import { useAppStore } from '@/store';
import {
  computeNwPatrimony,
  DEFAULT_FX_FORMULA,
  evaluateFxFormula,
} from '@shared/engine/nw';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

/* Arte conceptual de fondo (no son datos): la línea verde de la cartera
   nace en la esquina inferior izquierda y muere en la superior derecha,
   con picos y valles y trazo cónico como el logo A2; debajo, la línea
   azul del índice, más fina. Entre ambas, una banda verde con degradado;
   bajo la azul, un área celeste con degradado. Todo semitransparente. */
const NW_GREEN_PTS: Array<[number, number]> = [
  [0, 220], [52, 178], [86, 191], [138, 137], [176, 153],
  [234, 96], [266, 110], [324, 52], [404, -2],
];
const NW_BLUE_PTS: Array<[number, number]> = [
  [0, 220], [60, 196], [96, 204], [160, 178], [202, 186],
  [276, 158], [310, 166], [404, 113],
];

const nwPathFrom = (pts: Array<[number, number]>) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');

/* Cinta continua de ancho progresivo (como las maquetas): polígono
   calculado por desplazamiento perpendicular en cada vértice.
   Nada de segmentos sueltos: así no aparecen "puntos" en las uniones. */
const nwRibbon = (pts: Array<[number, number]>, w0: number, w1: number) => {
  const n = pts.length;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const pPrev = pts[Math.max(0, i - 1)];
    const pNext = pts[Math.min(n - 1, i + 1)];
    let dx = pNext[0] - pPrev[0];
    let dy = pNext[1] - pPrev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const hw = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push([x - dy * hw, y + dx * hw]);
    right.push([x + dy * hw, y - dx * hw]);
  }
  const poly = [...left, ...right.reverse()];
  return (
    poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
    ' Z'
  );
};

const NwConceptArt: React.FC = () => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 400 218"
    preserveAspectRatio="none"
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    }}
  >
    <defs>
      <linearGradient id="nwGradArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#38BDF8" style={{ stopOpacity: 'var(--nw-area-top)' }} />
        <stop offset="1" stopColor="#7DD3FC" style={{ stopOpacity: 'var(--nw-area-bot)' }} />
      </linearGradient>
      <linearGradient id="nwGradBand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#10B981" style={{ stopOpacity: 'var(--nw-band-top)' }} />
        <stop offset="1" stopColor="#6EE7B7" style={{ stopOpacity: 'var(--nw-band-bot)' }} />
      </linearGradient>
    </defs>
    <path d={`${nwPathFrom(NW_BLUE_PTS)} L404,218 L0,218 Z`} fill="url(#nwGradArea)" />
    <path
      d={`${nwPathFrom(NW_GREEN_PTS)} ${[...NW_BLUE_PTS]
        .reverse()
        .map((p) => `L${p[0]},${p[1]}`)
        .join(' ')} Z`}
      fill="url(#nwGradBand)"
    />
    <path
      d={nwRibbon(NW_BLUE_PTS, 0.7, 4.4)}
      fill="var(--nw-line-blue)"
      fillOpacity="var(--nw-line-blue-opacity)"
    />
    <path
      d={nwRibbon(NW_GREEN_PTS, 1, 10.5)}
      fill="#10B981"
      fillOpacity="var(--nw-line-green-opacity)"
    />
  </svg>
);

export const NwLiquidCard: React.FC = () => {
  const {
    evaluation,
    currency,
    fxRates,
    argFx,
    nwSettings,
    setNwSettings,
    resetNwSettings,
    openAddModal,
  } = useAppStore();

  const [expanded, setExpanded] = useState(false);

  if (!evaluation) return null;

  const { kpis, holdings, portfolio } = evaluation;
  const illiquidTotalUsd = (portfolio.illiquid || []).reduce(
    (sum, item) => sum + (item.currentValue || 0),
    0
  );

  const cclLive = argFx?.cclRate ?? 1637.9;
  const mepLive = argFx?.mepRate ?? 1553.6;

  const nw = computeNwPatrimony({
    holdings,
    grossHoldingsUsd: kpis.grossHoldingsValue,
    illiquidTotalUsd,
    cclLive,
    mepLive,
    settings: nwSettings,
  });

  const currentFormula = nwSettings.fxFormulaExpr ?? DEFAULT_FX_FORMULA;
  const liveEval = evaluateFxFormula(currentFormula, {
    Base_CCL: nw.cclBaseUsd,
    CCL: nw.cclRate,
    MEP: nw.mepRate,
    c_venta: (nwSettings.sellCommPct ?? 0.5) / 100,
    c_mep_c: (nwSettings.mepBuyCommPct ?? 0.5) / 100,
    c_mep_v: (nwSettings.mepSellCommPct ?? 0.5) / 100,
  });

  const fxDiffPositive = nw.fxDiffUsd >= 0;
  const mepBondTotalComm =
    (nwSettings.mepBuyCommPct ?? 0.5) + (nwSettings.mepSellCommPct ?? 0.5);
  const labelStyle = nwSettings.labelStyle ?? 'clean';

  const fmtUsdCompact = (v: number, signed = false) => {
    const sign = v < -0.005 ? '-$' : signed && v > 0.005 ? '+$' : '$';
    return `${sign}${formatNumber(Math.abs(v), 0)}`;
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        padding: '14px 16px 12px',
        background: 'var(--nw-bg)',
        /* Sin borde inferior: el negro profundo de la NW fluye directo al
           inicio del degradado de la cabecera del Portafolio Financiero,
           que arranca en este mismo color. */
        borderBottom: 'none',
      }}
    >
      <NwConceptArt />
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Cabecera minimalista de NW LÍQUIDO */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#10B981',
            }}
          >
            <Sparkles size={11} />
            <span>NW LÍQUIDO</span>
          </div>

          <div
            className="mono"
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              marginTop: 2,
              lineHeight: 1.2,
            }}
          >
            {formatMoney(nw.nwLiquidUsd, currency, fxRates)}
          </div>
        </div>

      </div>

      {/* Desglose: Portafolio Fin. · Reserva · Dif. Cambio
          (el NW Líquido es la suma de los tres; sin signos +) */}
      <div
        className="mono"
        style={{
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '3px 12px',
          fontSize: 10.5,
          color: 'var(--text-secondary)',
        }}
      >
        <span>
          Portafolio Fin.{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {fmtUsdCompact(nw.financialPortfolioLiquidUsd)}
          </strong>
        </span>
        <span
          style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
          onClick={() => openAddModal('cash', 'reserveUsd')}
          title="Clic para ajustar Reserva de Efectivo USD"
        >
          Reserva{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {fmtUsdCompact(nw.cashReserveUsd)}
          </strong>
        </span>
        <span
          style={{ cursor: 'pointer' }}
          onClick={() => setExpanded((v) => !v)}
          title={`CCL $${formatNumber(nw.cclRate, 0)} · MEP $${formatNumber(nw.mepRate, 0)} (${formatPct(nw.gapPct, true, 1)})`}
        >
          Dif. Cambio{' '}
          <strong className={fxDiffPositive ? 'pos' : 'neg'}>
            {fmtUsdCompact(nw.fxDiffUsd)}
          </strong>
        </span>
      </div>

      {/* Fila inferior: CCL · MEP a la izquierda, fx discreto a la derecha */}
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          CCL ${formatNumber(nw.cclRate, 0)} · MEP ${formatNumber(nw.mepRate, 0)}
        </span>

        <button
          type="button"
          className="btn"
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: '3px 9px',
            fontSize: 10.5,
            fontWeight: 600,
            borderRadius: 999,
            border: '1px solid var(--border-subtle)',
            background: 'var(--nw-bg)',
            color: expanded ? 'var(--accent-cyan)' : 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            flexShrink: 0,
          }}
          title="Desplegar editor de fórmula fx de Diferencia de Cambio CCL/MEP, Reserva USD y nomenclatura"
        >
          <span className="mono" style={{ fontStyle: 'italic', fontWeight: 800 }}>
            fx
          </span>
          <span>Fórmula / Ajustar</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Panel desplegable: Editor de Fórmula Matemática fx + Parámetros CCL/MEP + Nomenclatura */}
      {expanded && (
        <div
          style={{
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-strong)',
            fontSize: 11,
          }}
        >
          {/* Editor interactivo de la FÓRMULA DE DIFERENCIA DE CAMBIO */}
          <div
            style={{
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              padding: 8,
              marginBottom: 8,
              borderRadius: 6,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
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
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)' }}>
                FÓRMULA DIF. CAMBIO (EDITABLE)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '2px 6px', fontSize: 9.5 }}
                  onClick={() => setNwSettings({ fxFormulaExpr: DEFAULT_FX_FORMULA })}
                  title="Restaurar la ecuación original de Diferencia de Cambio"
                >
                  <RotateCcw size={10} /> Restaurar fórmula
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ padding: '2px 6px', fontSize: 9.5 }}
                  onClick={resetNwSettings}
                  title="Restaurar todos los parámetros por defecto"
                >
                  Reset
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, width: '100%' }}>
              <span
                className="mono"
                style={{
                  fontWeight: 800,
                  color: '#10B981',
                  fontSize: 11,
                  flexShrink: 0,
                  paddingTop: 5,
                }}
              >
                fx =
              </span>
              <textarea
                rows={2}
                aria-label="Fórmula de Diferencia de Cambio"
                className="input mono"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '5px 7px',
                  fontSize: 11,
                  lineHeight: 1.35,
                  wordBreak: 'break-word',
                  resize: 'vertical',
                  borderColor: liveEval.error ? '#EF4444' : 'var(--border-subtle)',
                }}
                value={currentFormula}
                onChange={(e) => setNwSettings({ fxFormulaExpr: e.target.value })}
              />
            </div>

            <div
              className="mono"
              style={{
                marginTop: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 4,
                fontSize: 9.5,
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ wordBreak: 'break-word' }}>
                Vars: <strong>Base_CCL</strong>, <strong>CCL</strong>, <strong>MEP</strong>,{' '}
                <strong>c_venta</strong>, <strong>c_mep_c</strong>, <strong>c_mep_v</strong>
              </span>
              {liveEval.error ? (
                <span
                  style={{
                    color: '#EF4444',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: 600,
                  }}
                >
                  <AlertCircle size={11} /> {liveEval.error}
                </span>
              ) : (
                <span
                  style={{
                    color: '#10B981',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={11} /> = {(liveEval.value ?? 0) >= 0 ? '+' : ''}
                  {formatNumber(liveEval.value ?? 0, 2)} USD
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 6,
              width: '100%',
              maxWidth: '100%',
            }}
          >
            {/* Fila Base Portafolio en CCL */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 6,
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 160px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 10.5 }}>
                  <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                    Base_CCL
                  </strong>{' '}
                  Base Portafolio CCL (USD)
                </span>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 9.5,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={nwSettings.includeCryptoInCcl}
                    onChange={(e) =>
                      setNwSettings({
                        includeCryptoInCcl: e.target.checked,
                        cclBaseOverride: null,
                      })
                    }
                  />
                  Incluir Cripto (auto: ${formatNumber(nw.cclBaseAutoUsd, 0)})
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 120px', maxWidth: '100%' }}>
                <input
                  type="number"
                  step="any"
                  aria-label="Base Portafolio en CCL"
                  className="input mono"
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: '4px 6px',
                    fontSize: 11,
                    textAlign: 'right',
                  }}
                  value={
                    nwSettings.cclBaseOverride != null
                      ? nwSettings.cclBaseOverride
                      : Number(nw.cclBaseAutoUsd.toFixed(2))
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setNwSettings({
                      cclBaseOverride: val === '' ? null : Number(val),
                    });
                  }}
                />
                {nwSettings.cclBaseOverride != null && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '2px 5px', fontSize: 10, flexShrink: 0 }}
                    onClick={() => setNwSettings({ cclBaseOverride: null })}
                    title="Volver a suma automática de tenencias"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>

            {/* Cotización Dólar CCL y Dólar MEP */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                gap: 8,
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 4,
                  }}
                >
                  <span>
                    <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                      CCL
                    </strong>{' '}
                    (ARS)
                  </span>
                  <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 9.5 }}>
                    vivo: ${formatNumber(cclLive, 0)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    step="any"
                    aria-label="Cotización Dólar CCL"
                    className="input mono"
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '4px 6px',
                      fontSize: 11,
                      textAlign: 'right',
                    }}
                    value={nwSettings.cclOverride ?? nw.cclRate}
                    onChange={(e) =>
                      setNwSettings({
                        cclOverride:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                  {nwSettings.cclOverride != null && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '2px 5px', fontSize: 10, flexShrink: 0 }}
                      onClick={() => setNwSettings({ cclOverride: null })}
                      title="Restaurar cotización CCL en vivo"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 4,
                  }}
                >
                  <span>
                    <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                      MEP
                    </strong>{' '}
                    (ARS)
                  </span>
                  <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 9.5 }}>
                    vivo: ${formatNumber(mepLive, 0)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    step="any"
                    aria-label="Cotización Dólar MEP"
                    className="input mono"
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '4px 6px',
                      fontSize: 11,
                      textAlign: 'right',
                    }}
                    value={nwSettings.mepOverride ?? nw.mepRate}
                    onChange={(e) =>
                      setNwSettings({
                        mepOverride:
                          e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                  />
                  {nwSettings.mepOverride != null && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '2px 5px', fontSize: 10, flexShrink: 0 }}
                      onClick={() => setNwSettings({ mepOverride: null })}
                      title="Restaurar cotización MEP en vivo"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Comisiones c_venta, c_mep_c, c_mep_v */}
            <div
              style={{
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 4,
                }}
              >
                <span>
                  Comisiones CCL/MEP (Total:{' '}
                  <strong className="mono">
                    {nw.totalCommPct.toFixed(2)}%
                  </strong>
                  )
                </span>
                <span className="mono" style={{ color: 'var(--text-muted)' }}>
                  Bonos MEP: {mepBondTotalComm.toFixed(2)}%
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
                  gap: 6,
                  width: '100%',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9.5,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                    }}
                  >
                    c_venta %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Comisión venta posiciones CCL %"
                    className="input mono"
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '4px 5px',
                      fontSize: 11,
                      textAlign: 'right',
                    }}
                    value={nwSettings.sellCommPct}
                    onChange={(e) =>
                      setNwSettings({
                        sellCommPct: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9.5,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                    }}
                  >
                    c_mep_c %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Comisión compra bono MEP %"
                    className="input mono"
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '4px 5px',
                      fontSize: 11,
                      textAlign: 'right',
                    }}
                    value={nwSettings.mepBuyCommPct}
                    onChange={(e) =>
                      setNwSettings({
                        mepBuyCommPct: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9.5,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                    }}
                  >
                    c_mep_v %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Comisión venta bono MEP %"
                    className="input mono"
                    style={{
                      width: '100%',
                      minWidth: 0,
                      padding: '4px 5px',
                      fontSize: 11,
                      textAlign: 'right',
                    }}
                    value={nwSettings.mepSellCommPct}
                    onChange={(e) =>
                      setNwSettings({
                        mepSellCommPct: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Resultado = Diferencia de Cambio (USD) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 6,
                padding: '6px 8px',
                borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 10.5 }}>
                  <Calculator
                    size={11}
                    style={{ display: 'inline', marginRight: 4 }}
                  />
                  = Diferencia de Cambio (USD)
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 9.5, color: 'var(--text-muted)' }}
                >
                  Auto: {nw.fxDiffAutoUsd >= 0 ? '+' : ''}
                  {formatNumber(nw.fxDiffAutoUsd, 2)} USD (MEP: $
                  {formatNumber(nw.usdMepObtained, 0)})
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 120px', maxWidth: '100%' }}>
                <input
                  type="number"
                  step="any"
                  aria-label="Diferencia de Cambio (USD)"
                  className="input mono"
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: '4px 6px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    textAlign: 'right',
                    color: fxDiffPositive ? '#10B981' : '#EF4444',
                  }}
                  value={
                    nwSettings.fxDiffOverride != null
                      ? nwSettings.fxDiffOverride
                      : Number(nw.fxDiffAutoUsd.toFixed(2))
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setNwSettings({
                      fxDiffOverride: val === '' ? null : Number(val),
                    });
                  }}
                />
                {nwSettings.fxDiffOverride != null && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '2px 5px', fontSize: 10, flexShrink: 0 }}
                    onClick={() => setNwSettings({ fxDiffOverride: null })}
                    title="Volver al cálculo automático de la fórmula"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>

            {/* Cash Comitente y Reserva de Efectivo USD */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                gap: 8,
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                  }}
                >
                  + Cash Comitente (USD)
                </label>
                <input
                  type="number"
                  step="any"
                  aria-label="Cash Comitente (USD líquido en broker)"
                  className="input mono"
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: '4px 6px',
                    fontSize: 11,
                    textAlign: 'right',
                  }}
                  value={nwSettings.brokerCashUsd}
                  onChange={(e) =>
                    setNwSettings({
                      brokerCashUsd: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                  }}
                >
                  + Reserva Efectivo (USD)
                </label>
                <input
                  type="number"
                  step="any"
                  aria-label="Reserva de Efectivo (USD fuera del broker)"
                  className="input mono"
                  style={{
                    width: '100%',
                    minWidth: 0,
                    padding: '4px 6px',
                    fontSize: 11,
                    textAlign: 'right',
                  }}
                  value={nwSettings.cashReserveUsd}
                  onChange={(e) =>
                    setNwSettings({
                      cashReserveUsd: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            {/* Selector de Nomenclatura: Limpia (Sin TV) vs Con sigla TV */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '4px 6px 2px 6px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                Estilo de etiquetas del sistema:
              </span>
              <div
                className="seg-group"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <button
                  type="button"
                  className={`seg-btn ${labelStyle === 'clean' ? 'active' : ''}`}
                  style={{ padding: '4px 6px', fontSize: 10, textAlign: 'center' }}
                  onClick={() => setNwSettings({ labelStyle: 'clean' })}
                >
                  Limpia (Sin TV)
                </button>
                <button
                  type="button"
                  className={`seg-btn ${labelStyle === 'tv' ? 'active' : ''}`}
                  style={{ padding: '4px 6px', fontSize: 10, textAlign: 'center' }}
                  onClick={() => setNwSettings({ labelStyle: 'tv' })}
                >
                  Con sigla TV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default NwLiquidCard;