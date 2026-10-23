import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { computeNwPatrimony } from '@shared/engine/nw';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

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

  const fxDiffPositive = nw.fxDiffUsd >= 0;
  const mepBondTotalComm =
    (nwSettings.mepBuyCommPct ?? 0.5) + (nwSettings.mepSellCommPct ?? 0.5);

  return (
    <div
      style={{
        padding: '10px 14px',
        background:
          'linear-gradient(180deg, rgba(16, 185, 129, 0.07) 0%, rgba(15, 23, 42, 0.45) 100%)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Cabecera minimalista de NW líquido */}
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
              gap: 6,
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#10B981',
            }}
          >
            <Sparkles size={11} />
            <span>NW líquido</span>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 500,
                textTransform: 'none',
                color: 'var(--text-muted)',
              }}
            >
              (Portafolio Fin. + Reserva + FX CCL/MEP)
            </span>
          </div>

          <div
            className="mono"
            style={{
              fontSize: 21,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
              marginTop: 1,
              lineHeight: 1.2,
            }}
          >
            {formatMoney(nw.nwLiquidUsd, currency, fxRates)}
          </div>
        </div>

        {/* Botón / Chip interactivo Celda Excel */}
        <button
          type="button"
          className="btn"
          onClick={() => setExpanded((v) => !v)}
          style={{
            padding: '4px 8px',
            fontSize: 10.5,
            fontWeight: 700,
            borderRadius: 6,
            borderColor: expanded
              ? 'var(--accent-cyan)'
              : 'rgba(16, 185, 129, 0.35)',
            background: expanded
              ? 'rgba(56, 189, 248, 0.14)'
              : 'rgba(16, 185, 129, 0.1)',
            color: expanded ? 'var(--accent-cyan)' : '#10B981',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
          }}
          title="Abrir o cerrar calculadora tipo celda de Excel para Diferencia de Cambio CCL/MEP, Cash Comitente y Reserva USD"
        >
          <span
            className="mono"
            style={{
              fontStyle: 'italic',
              fontWeight: 800,
              padding: '0 3px',
              borderRadius: 3,
              background: 'rgba(0,0,0,0.25)',
            }}
          >
            fx
          </span>
          <span>Celda Excel / Ajustar</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Línea sutil de desglose + cotizaciones CCL y MEP en vivo */}
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '4px 10px',
          fontSize: 10.5,
          color: 'var(--text-secondary)',
        }}
      >
        <div
          className="mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '3px 7px',
          }}
        >
          <span title="Portafolio Financiero Líquido = Tenencias Brutas + Cash Comitente">
            Portafolio Fin.:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {formatMoney(nw.financialPortfolioLiquidUsd, currency, fxRates, {
                decimals: 0,
              })}
            </strong>
          </span>
          <span>·</span>
          <span
            style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
            onClick={() => openAddModal('cash', 'reserveUsd')}
            title="Clic para editar Reserva de Efectivo USD fuera del broker"
          >
            Reserva USD:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {formatMoney(nw.cashReserveUsd, currency, fxRates, {
                decimals: 0,
              })}
            </strong>
          </span>
          <span>·</span>
          <span
            style={{ cursor: 'pointer' }}
            onClick={() => setExpanded((v) => !v)}
            title="Diferencia de Cambio CCL → MEP neta de comisiones (Celda Excel)"
          >
            Dif. Cambio CCL/MEP:{' '}
            <strong className={fxDiffPositive ? 'pos' : 'neg'}>
              {formatMoney(nw.fxDiffUsd, currency, fxRates, {
                signed: true,
                decimals: 0,
              })}
            </strong>
          </span>
        </div>

        <div
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span>
            CCL <strong>${formatNumber(nw.cclRate, 0)}</strong>
          </span>
          <span>·</span>
          <span>
            MEP <strong>${formatNumber(nw.mepRate, 0)}</strong>
          </span>
          <span
            style={{
              color: nw.gapPct >= 0 ? 'var(--accent-cyan)' : 'var(--neg-bright)',
            }}
          >
            ({formatPct(nw.gapPct, true, 1)})
          </span>
        </div>
      </div>

      {/* Tabla compacta interactiva estilo Excel */}
      {expanded && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-strong)',
            fontSize: 11,
          }}
        >
          {/* Barra de fórmula estilo Excel */}
          <div
            className="mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
              padding: '5px 8px',
              marginBottom: 8,
              borderRadius: 5,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 10,
              color: 'var(--text-secondary)',
              overflowX: 'auto',
            }}
          >
            <div>
              <strong style={{ color: '#10B981', marginRight: 6 }}>fx</strong>
              <span>
                =Base_CCL * ((CCL / MEP) * (1 - c_venta) * (1 - c_mep_c) * (1 -
                c_mep_v) - 1)
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
              onClick={resetNwSettings}
              title="Restaurar parámetros automáticos de la celda Excel"
            >
              <RotateCcw size={10} /> Reset
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 6,
            }}
          >
            {/* Fila A1: Tenencias Brutas Portafolio Financiero (auto) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                  A1
                </strong>{' '}
                Tenencias Brutas Portafolio Financiero (auto)
              </span>
              <span className="mono" style={{ fontWeight: 700 }}>
                ${formatNumber(nw.grossHoldingsUsd, 2)} USD
              </span>
            </div>

            {/* Fila A2: Base Portafolio valuada en CCL */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 6,
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                    A2
                  </strong>{' '}
                  Base Portafolio en CCL (USD)
                </span>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 10,
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
                  Incluir Cripto en base CCL (auto: $
                  {formatNumber(nw.cclBaseAutoUsd, 0)})
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  step="any"
                  aria-label="Base Portafolio en CCL"
                  className="input mono"
                  style={{
                    width: 112,
                    padding: '3px 6px',
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
                    style={{ padding: '2px 5px', fontSize: 10 }}
                    onClick={() => setNwSettings({ cclBaseOverride: null })}
                    title="Volver a suma automática de tenencias"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>

            {/* Fila B1 & B2: Cotización Dólar CCL y Dólar MEP */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                gap: 8,
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                      B1
                    </strong>{' '}
                    Dólar CCL (ARS)
                  </span>
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>
                    vivo: ${formatNumber(cclLive, 1)}
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
                      padding: '3px 6px',
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
                      style={{ padding: '2px 5px', fontSize: 10 }}
                      onClick={() => setNwSettings({ cclOverride: null })}
                      title="Restaurar cotización CCL en vivo"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                      B2
                    </strong>{' '}
                    Dólar MEP (ARS)
                  </span>
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>
                    vivo: ${formatNumber(mepLive, 1)}
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
                      padding: '3px 6px',
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
                      style={{ padding: '2px 5px', fontSize: 10 }}
                      onClick={() => setNwSettings({ mepOverride: null })}
                      title="Restaurar cotización MEP en vivo"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Fila C1..C3: Comisiones venta CCL (0.5%) + compra/venta bonos MEP (0.5% + 0.5% = 1.0%) */}
            <div
              style={{
                padding: '4px 6px',
                borderBottom: '1px dashed var(--border-subtle)',
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
                }}
              >
                <span>
                  <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                    C1:C3
                  </strong>{' '}
                  Comisiones venta CCL + operatoria bonos MEP (Total:{' '}
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
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 6,
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9.5,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                    }}
                  >
                    Venta CCL (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Comisión venta posiciones CCL %"
                    className="input mono"
                    style={{
                      width: '100%',
                      padding: '3px 5px',
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
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9.5,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                    }}
                  >
                    Compra Bono MEP (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Comisión compra bono MEP %"
                    className="input mono"
                    style={{
                      width: '100%',
                      padding: '3px 5px',
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
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 9.5,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                    }}
                  >
                    Venta Bono MEP (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Comisión venta bono MEP %"
                    className="input mono"
                    style={{
                      width: '100%',
                      padding: '3px 5px',
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

            {/* Fila D1: Celda calculada = Diferencia de Cambio (USD) */}
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
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
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
                  {formatNumber(nw.fxDiffAutoUsd, 2)} USD (obtenidos MEP: $
                  {formatNumber(nw.usdMepObtained, 0)})
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  step="any"
                  aria-label="Diferencia de Cambio (USD)"
                  className="input mono"
                  style={{
                    width: 112,
                    padding: '3px 6px',
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
                    style={{ padding: '2px 5px', fontSize: 10 }}
                    onClick={() => setNwSettings({ fxDiffOverride: null })}
                    title="Volver al cálculo automático de la fórmula Excel"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>

            {/* Filas E1 y E2: Cash Comitente y Reserva de Efectivo USD */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
                gap: 8,
                padding: '4px 6px 2px 6px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                  }}
                >
                  <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                    E1
                  </strong>{' '}
                  + Cash Comitente (USD en broker)
                </label>
                <input
                  type="number"
                  step="any"
                  aria-label="Cash Comitente (USD líquido en broker)"
                  className="input mono"
                  style={{
                    width: '100%',
                    padding: '3px 6px',
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

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    marginBottom: 3,
                  }}
                >
                  <strong className="mono" style={{ color: 'var(--text-muted)' }}>
                    E2
                  </strong>{' '}
                  + Reserva de Efectivo (USD fuera broker)
                </label>
                <input
                  type="number"
                  step="any"
                  aria-label="Reserva de Efectivo (USD fuera del broker)"
                  className="input mono"
                  style={{
                    width: '100%',
                    padding: '3px 6px',
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
          </div>
        </div>
      )}
    </div>
  );
};

export default NwLiquidCard;