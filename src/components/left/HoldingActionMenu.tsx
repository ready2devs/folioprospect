import React from 'react';
import { useAppStore } from '@/store';
import { formatMoney, formatNumber } from '@shared/engine/format';
import { X, LineChart, PlusCircle, Scissors, LogOut } from 'lucide-react';

/**
 * Menú de acciones al tocar un activo que YA está en el portafolio
 * (pedido del dueño, 2026-11-10): en vez de ir directo a la ficha,
 * ofrece Análisis del activo, Agregar (comprar más), Venta parcial y
 * Venta total. Comprar/vender abre la pantalla de operación con el
 * activo, el lado y —en venta total— la cantidad total precargados.
 */
export const HoldingActionMenu: React.FC = () => {
  const {
    holdingMenuSymbol,
    closeHoldingMenu,
    evaluation,
    selectAsset,
    openAddModal,
    currency,
    fxRates,
  } = useAppStore();

  const holding = holdingMenuSymbol
    ? (evaluation?.holdings || []).find(
        (h: any) =>
          h.symbol === holdingMenuSymbol ||
          h.symbol.endsWith(':' + holdingMenuSymbol.split(':').pop())
      )
    : undefined;

  // Si el símbolo no es una posición abierta (no debería pasar desde el
  // portafolio), se va directo al análisis en vez de mostrar un menú vacío.
  React.useEffect(() => {
    if (holdingMenuSymbol && evaluation && !holding) {
      const sym = holdingMenuSymbol;
      closeHoldingMenu();
      void selectAsset(sym);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingMenuSymbol, evaluation, holding]);

  if (!holdingMenuSymbol || !holding) return null;

  const qtyLabel = formatNumber(holding.qty, holding.qty % 1 === 0 ? 0 : 4);

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    textAlign: 'left',
    padding: '13px 14px',
    borderRadius: 10,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  const titleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700 };
  const subStyle: React.CSSProperties = {
    fontSize: 11.5,
    color: 'var(--text-secondary)',
    marginTop: 1,
  };

  return (
    <div className="modal-backdrop" onClick={closeHoldingMenu} style={{ zIndex: 110 }}>
      <div
        className="modal-card"
        style={{ width: 440 }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
        aria-label={`Acciones sobre ${holding.ticker}`}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 17, fontWeight: 800 }}>
                {holding.ticker}
              </span>
              <span className="brand-badge">EN TU PORTAFOLIO</span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {holding.name}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={closeHoldingMenu} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div
          className="mono"
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            padding: '8px 10px',
            marginBottom: 14,
            borderRadius: 8,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          Posición: <strong style={{ color: 'var(--text-primary)' }}>{qtyLabel}</strong>
          {' · '}Precio prom. ${formatNumber(holding.avgPrice, 2)}
          {' · '}Valor{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {formatMoney(holding.value, currency, fxRates, { decimals: 0 })}
          </strong>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            style={itemStyle}
            onClick={() => {
              closeHoldingMenu();
              void selectAsset(holding.symbol);
            }}
          >
            <LineChart size={19} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
            <span>
              <span style={titleStyle}>Análisis del activo</span>
              <div style={subStyle}>Ficha completa, Fair Value y proyección</div>
            </span>
          </button>

          <button
            type="button"
            style={itemStyle}
            onClick={() => openAddModal('trade', 'ledger', holding.symbol, { side: 'BUY' })}
          >
            <PlusCircle size={19} color="var(--pos-bright)" style={{ flexShrink: 0 }} />
            <span>
              <span style={titleStyle}>Agregar</span>
              <div style={subStyle}>Comprar más, con el activo y la compra precargados</div>
            </span>
          </button>

          <button
            type="button"
            style={itemStyle}
            onClick={() => openAddModal('trade', 'ledger', holding.symbol, { side: 'SELL' })}
          >
            <Scissors size={19} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
            <span>
              <span style={titleStyle}>Venta parcial</span>
              <div style={subStyle}>Vender una parte: elegís la cantidad en la operación</div>
            </span>
          </button>

          <button
            type="button"
            style={{ ...itemStyle, borderColor: 'rgba(244, 63, 94, 0.4)' }}
            onClick={() =>
              openAddModal('trade', 'ledger', holding.symbol, {
                side: 'SELL',
                qty: holding.qty,
              })
            }
          >
            <LogOut size={19} color="var(--neg-bright)" style={{ flexShrink: 0 }} />
            <span>
              <span style={titleStyle}>Venta total</span>
              <div style={subStyle}>
                Vender las {qtyLabel} unidades de la posición, ya precargadas
              </div>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
