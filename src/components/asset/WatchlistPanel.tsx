import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { api, type WatchlistQuote, type WatchlistVerdictEntry } from '@/api';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  groupWatchlistItems,
  resolveWatchlistConfig,
} from '@shared/engine/watchlist';
import type { WatchlistItem } from '@shared/engine/types';
import { ChevronDown, ListChecks } from 'lucide-react';

/**
 * Watchlist persistente de la vista de activo (SPEC-006).
 *
 * Vive en AssetView, FUERA del OpportunitySheet (que se monta con
 * `key` por símbolo): no se remonta al cambiar de activo y conserva
 * su scroll. Los precios vienen del pipeline de cotizaciones del
 * servidor (/api/quotes, el mismo de Mercado/cartera) con la cadencia
 * Live de la app (15 s). Las siglas de veredicto las calcula el
 * servidor con la regla de la ficha sobre el pipeline de Fair Value
 * del motor y las cachea por día (/api/watchlist/verdicts): acá se
 * piden en lotes progresivos solo para las ACCIONES; cripto, el par
 * ETH/BTC y los ETFs no tienen evaluación del motor («—» definitivo).
 */

const SIGLA_STYLE: Record<string, React.CSSProperties> = {
  CM: {
    background: 'rgba(16, 185, 129, 0.22)',
    color: '#34D399',
    border: '1px solid rgba(16, 185, 129, 0.55)',
  },
  C: {
    background: 'rgba(16, 185, 129, 0.10)',
    color: 'var(--pos-bright)',
    border: '1px solid rgba(16, 185, 129, 0.30)',
  },
  M: {
    background: 'rgba(245, 158, 11, 0.12)',
    color: '#FBBF24',
    border: '1px solid rgba(245, 158, 11, 0.35)',
  },
  V: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: 'var(--neg-bright)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
  },
};

const SiglaPill: React.FC<{ sigla: string | null; verdict: string | null }> = ({
  sigla,
  verdict,
}) => {
  if (sigla === null) {
    // Todavía resolviendo en el servidor: marcador tenue.
    return (
      <span
        title="Calculando la evaluación de oportunidad…"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          padding: '0 4px',
          letterSpacing: '0.08em',
        }}
      >
        ··
      </span>
    );
  }
  const style = SIGLA_STYLE[sigla];
  return (
    <span
      title={verdict || 'Sin evaluación de oportunidad'}
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: '0.04em',
        padding: '1px 5px',
        borderRadius: 999,
        lineHeight: 1.5,
        flexShrink: 0,
        ...(style || {
          color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle)',
        }),
      }}
    >
      {sigla}
    </span>
  );
};

export const WatchlistPanel: React.FC<{ isMobile: boolean }> = ({ isMobile }) => {
  const { nwSettings, selectedSymbol, selectAsset, currency, fxRates } = useAppStore();
  const config = useMemo(() => resolveWatchlistConfig(nwSettings), [nwSettings]);
  const groups = useMemo(() => groupWatchlistItems(config.items), [config]);

  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
  const [verdicts, setVerdicts] = useState<Record<string, WatchlistVerdictEntry>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const resolvedRef = useRef<Set<string>>(new Set());
  const loopGenRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);

  const symbolsKey = useMemo(
    () =>
      config.items
        .map((it) => it.symbol)
        .filter((s): s is string => Boolean(s))
        .join(','),
    [config]
  );

  // Precios en lote + refresco con la cadencia Live de la app (15 s).
  useEffect(() => {
    const symbols = symbolsKey ? symbolsKey.split(',') : [];
    if (symbols.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const fresh = await api.getQuotes(symbols);
      if (!cancelled && Object.keys(fresh).length > 0) {
        setQuotes((prev) => ({ ...prev, ...fresh }));
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbolsKey]);

  // Siglas en lotes progresivos: solo ACCIONES con símbolo. Lo ya
  // RESUELTO en la sesión no se vuelve a pedir (el servidor cachea por
  // día). Generación por corrida: si el efecto se re-ejecuta (p. ej.
  // el doble montaje de StrictMode en desarrollo), la corrida vieja
  // aborta en el próximo await y la nueva retoma desde lo no resuelto
  // — ninguna tanda queda marcada sin haberse aplicado.
  useEffect(() => {
    const pending = config.items
      .filter(
        (it) =>
          it.group === 'ACCIONES' && it.symbol && !resolvedRef.current.has(it.symbol)
      )
      .map((it) => it.symbol as string);
    if (pending.length === 0) return;
    const gen = ++loopGenRef.current;
    (async () => {
      for (let i = 0; i < pending.length; i += 6) {
        if (gen !== loopGenRef.current) return;
        const batch = pending.slice(i, i + 6);
        const res = await api.getWatchlistVerdicts(batch);
        if (gen !== loopGenRef.current) return;
        batch.forEach((s) => resolvedRef.current.add(s));
        if (Object.keys(res).length > 0) {
          setVerdicts((prev) => ({ ...prev, ...res }));
        }
      }
    })();
  }, [config]);

  // Al montar, dejar visible la fila del activo abierto (una sola vez,
  // sin tocar el scroll en navegaciones posteriores).
  useEffect(() => {
    if (didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;
    const t = setTimeout(() => {
      const box = scrollRef.current;
      if (!box) return;
      const row = box.querySelector('[data-wl-active="true"]') as HTMLElement | null;
      if (row) box.scrollTop = Math.max(0, row.offsetTop - 48);
    }, 350);
    return () => clearTimeout(t);
  }, []);

  const toggleGroup = (group: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const renderRow = (item: WatchlistItem) => {
    const q = item.symbol ? quotes[item.symbol] : undefined;
    const isActive = Boolean(item.symbol) && item.symbol === selectedSymbol;
    const unavailable = item.symbol === null;
    // Sigla: las ACCIONES con símbolo la resuelven contra el servidor;
    // el resto (cripto, par, ETFs, sin símbolo) es «—» definitivo.
    let sigla: string | null = '—';
    let verdict: string | null = null;
    if (item.group === 'ACCIONES' && item.symbol) {
      const entry = verdicts[item.symbol];
      if (entry) {
        sigla = entry.sigla;
        verdict = entry.verdict;
      } else {
        sigla = null;
      }
    }
    const up = (q?.changePct ?? 0) >= 0;
    const priceText = !q
      ? null
      : item.symbol === 'BINANCE:ETHBTC'
        ? formatNumber(q.price, 4)
        : formatMoney(q.price, currency, fxRates, {
            decimals: q.price >= 1 ? 2 : 4,
          });
    return (
      <div
        key={item.ticker}
        data-wl-active={isActive ? 'true' : undefined}
        onClick={item.symbol ? () => void selectAsset(item.symbol as string) : undefined}
        title={
          unavailable
            ? 'Activo no disponible en las fuentes de la app'
            : item.symbol || undefined
        }
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 8,
          padding: isActive ? '6px 10px 6px 7px' : '6px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          borderLeft: isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent',
          background: isActive ? 'var(--bg-hover)' : undefined,
          cursor: item.symbol ? 'pointer' : 'default',
          opacity: unavailable ? 0.55 : 1,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              className="mono"
              style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}
            >
              {item.ticker}
            </span>
            <SiglaPill sigla={sigla} verdict={verdict} />
          </div>
          {q?.name && (
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 1,
              }}
            >
              {q.name}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {unavailable ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>s/d</span>
          ) : q ? (
            <>
              <div className="mono tabular" style={{ fontSize: 12.5, fontWeight: 600 }}>
                {priceText}
              </div>
              <div
                className="mono tabular"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: up ? 'var(--pos-bright)' : 'var(--neg-bright)',
                }}
              >
                {formatPct(q.changePct)}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        alignSelf: 'start',
        width: '100%',
        ...(isMobile ? {} : { position: 'sticky', top: 12 }),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '11px 12px 9px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <ListChecks size={15} color="var(--accent-cyan)" />
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>Watchlist</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {config.items.length} activos · tu orden de importancia
        </span>
      </div>
      <div
        ref={scrollRef}
        style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          maxHeight: isMobile ? 360 : 'calc(100vh - 140px)',
          minHeight: 120,
        }}
      >
        {groups.map(({ group, items }) => {
          const isCollapsed = collapsed.has(group);
          return (
            <div key={group}>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                aria-expanded={!isCollapsed}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  background: 'var(--bg-primary)',
                  border: 'none',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  color: 'var(--text-secondary)',
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.07em',
                  }}
                >
                  {group} · {items.length}
                </span>
                <ChevronDown
                  size={13}
                  style={{
                    transform: isCollapsed ? 'rotate(-90deg)' : undefined,
                    transition: 'transform 0.15s',
                  }}
                />
              </button>
              {!isCollapsed && items.map(renderRow)}
            </div>
          );
        })}
        {groups.length === 0 && (
          <div style={{ padding: 14, fontSize: 12.5, color: 'var(--text-muted)' }}>
            La watchlist está vacía.
          </div>
        )}
      </div>
    </div>
  );
};
