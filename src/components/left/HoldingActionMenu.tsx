import React from 'react';
import { useAppStore } from '@/store';
import { formatMoney, formatNumber } from '@shared/engine/format';
import {
  MAX_SUBPORTFOLIO_DEFS,
  SUBPORTFOLIO_COLORS,
  effectiveDefId,
  makeDefId,
  resolveSubPortfolioConfig,
} from '@shared/engine/subPortfolios';
import { X, LineChart, PlusCircle, Scissors, LogOut, Check, Plus } from 'lucide-react';

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
    holdingMenuFocusTag,
    closeHoldingMenu,
    evaluation,
    selectAsset,
    openAddModal,
    currency,
    fxRates,
    nwSettings,
    setHoldingSubPortfolio,
    upsertSubPortfolioDef,
  } = useAppStore();

  // --- Subcartera (SPEC-005): estado del alta inline y foco por long-press ---
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newColor, setNewColor] = React.useState<string>(SUBPORTFOLIO_COLORS[3]);
  const [justAssigned, setJustAssigned] = React.useState<string | null | undefined>(
    undefined
  );
  const sectionRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setCreating(false);
    setNewName('');
    setJustAssigned(undefined);
  }, [holdingMenuSymbol]);

  // Abierto por long-press / clic derecho: mostrar la sección Subcartera.
  React.useEffect(() => {
    if (!holdingMenuFocusTag || !holdingMenuSymbol) return;
    const t = setTimeout(() => {
      sectionRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 90);
    return () => clearTimeout(t);
  }, [holdingMenuFocusTag, holdingMenuSymbol]);

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

  // --- Subcartera (SPEC-005) ---
  const spConfig = resolveSubPortfolioConfig(nwSettings);
  const currentDefId = effectiveDefId(holding, spConfig);
  const NONE_KEY = '__none__';
  const markedKey =
    justAssigned !== undefined ? (justAssigned ?? NONE_KEY) : (currentDefId ?? NONE_KEY);

  const assignAndClose = (defId: string | null) => {
    setHoldingSubPortfolio(holding.symbol, defId);
    setJustAssigned(defId);
    window.setTimeout(() => closeHoldingMenu(), 450);
  };

  const createAndAssign = () => {
    const name = newName.trim().slice(0, 24);
    if (!name) return;
    const id = makeDefId(
      name,
      spConfig.defs.map((d) => d.id)
    );
    upsertSubPortfolioDef({ id, name, color: newColor });
    // El store ya tiene la def nueva: la asignación la encuentra al resolver.
    setHoldingSubPortfolio(holding.symbol, id);
    setJustAssigned(id);
    window.setTimeout(() => closeHoldingMenu(), 450);
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
    background: active ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  });

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

        {/* Sección Subcartera (SPEC-005): etiquetado del activo */}
        <div
          ref={sectionRef}
          data-testid="subportfolio-section"
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginBottom: 8,
            }}
          >
            Subcartera
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {spConfig.defs.map((def) => {
              const active = markedKey === def.id;
              return (
                <button
                  key={def.id}
                  type="button"
                  style={chipStyle(active)}
                  onClick={() => assignAndClose(def.id)}
                  aria-pressed={active}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: def.color,
                      flexShrink: 0,
                    }}
                  />
                  {def.name}
                  {active && <Check size={15} style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
            <button
              type="button"
              style={chipStyle(markedKey === NONE_KEY)}
              onClick={() => assignAndClose(null)}
              aria-pressed={markedKey === NONE_KEY}
            >
              Sin etiquetar
              {markedKey === NONE_KEY && <Check size={15} style={{ flexShrink: 0 }} />}
            </button>
            <button
              type="button"
              style={{
                ...chipStyle(false),
                borderStyle: 'dashed',
                color: 'var(--text-secondary)',
              }}
              onClick={() => setCreating((c) => !c)}
              disabled={spConfig.defs.length >= MAX_SUBPORTFOLIO_DEFS}
              title={
                spConfig.defs.length >= MAX_SUBPORTFOLIO_DEFS
                  ? `Máximo de ${MAX_SUBPORTFOLIO_DEFS} subcarteras`
                  : 'Crear una subcartera nueva y asignarla'
              }
            >
              <Plus size={15} style={{ flexShrink: 0 }} /> Nueva
            </button>
          </div>

          {creating && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
              }}
            >
              <input
                className="input"
                data-testid="subportfolio-new-name"
                style={{ width: '100%', padding: '9px 10px', fontSize: 13.5, minHeight: 44 }}
                placeholder="Nombre de la subcartera (ej. Renta)"
                value={newName}
                maxLength={24}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  marginTop: 10,
                  flexWrap: 'wrap',
                }}
              >
                {SUBPORTFOLIO_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Color ${color}`}
                    onClick={() => setNewColor(color)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: color,
                      border:
                        newColor === color
                          ? '3px solid var(--text-primary)'
                          : '2px solid transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 12, minHeight: 44, padding: '8px 16px', fontSize: 13 }}
                disabled={!newName.trim()}
                onClick={createAndAssign}
              >
                Crear y asignar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
