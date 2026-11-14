import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { api, type WatchlistQuote, type WatchlistVerdictEntry } from '@/api';
import { formatMoney, formatNumber, formatPct } from '@shared/engine/format';
import {
  buildWatchlistItemFromSearch,
  countWatchlistSiglas,
  filterWatchlistItems,
  groupWatchlistItems,
  resolveWatchlistConfig,
  siglaFilterName,
  watchlistItemSigla,
  WATCHLIST_SIGLA_FILTERS,
  type WatchlistSiglaFilter,
} from '@shared/engine/watchlist';
import type { WatchlistItem } from '@shared/engine/types';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ListChecks,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';

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
 *
 * Enmienda v8: filtro por veredicto (chips Todos/CF/C/M/V), alta de
 * activos desde el buscador de la app (grupo detectado solo, se
 * persiste en el acto) y, en el modo edición, baja (× por fila) y
 * reordenamiento con ↑/↓ dentro del grupo — como la vista de
 * edición de Investing que mandó el dueño —, todo persistido en el
 * acto.
 */

const SIGLA_STYLE: Record<string, React.CSSProperties> = {
  CF: {
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

const moveBtnStyle = (disabled: boolean): React.CSSProperties => ({
  width: 32,
  height: 32,
  minWidth: 32,
  minHeight: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.3 : 1,
  flexShrink: 0,
});

const headerBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  minHeight: 32,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  flexShrink: 0,
};

export const WatchlistPanel: React.FC<{ isMobile: boolean }> = ({ isMobile }) => {
  const {
    nwSettings,
    selectedSymbol,
    selectAsset,
    currency,
    fxRates,
    addWatchlistItem,
    removeWatchlistItem,
    moveWatchlistItem,
  } = useAppStore();
  const config = useMemo(() => resolveWatchlistConfig(nwSettings), [nwSettings]);
  const groups = useMemo(() => groupWatchlistItems(config.items), [config]);

  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
  const [verdicts, setVerdicts] = useState<Record<string, WatchlistVerdictEntry>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Enmienda v8: filtro por veredicto, modo edición y buscador de alta.
  const [filter, setFilter] = useState<WatchlistSiglaFilter>('TODOS');
  const [editing, setEditing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const siglaCounts = useMemo(
    () => countWatchlistSiglas(config.items, verdicts),
    [config, verdicts]
  );

  // Bordes de cada grupo (para deshabilitar ↑ en el primer ítem y ↓
  // en el último en el modo edición): se calculan sobre la lista
  // completa, no sobre lo filtrado.
  const groupEdges = useMemo(() => {
    const first = new Set<string>();
    const last = new Set<string>();
    for (const g of groups) {
      if (g.items.length > 0) {
        first.add(g.items[0].ticker);
        last.add(g.items[g.items.length - 1].ticker);
      }
    }
    return { first, last };
  }, [groups]);

  // Grupos visibles según el filtro: los grupos que quedan sin filas
  // visibles se ocultan enteros.
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          group: g.group,
          total: g.items.length,
          items: filterWatchlistItems(g.items, verdicts, filter),
        }))
        .filter((g) => g.items.length > 0),
    [groups, verdicts, filter]
  );

  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

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

  // Buscador del alta (enmienda v8): mismo endpoint que el buscador
  // global de la app (/api/search vía api.search), con debounce.
  useEffect(() => {
    if (!searchOpen) return;
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let active = true;
    const id = setTimeout(() => {
      api
        .search(q)
        .then((res) => {
          if (!active) return;
          setResults(Array.isArray(res) ? res.slice(0, 10) : []);
          setSearching(false);
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
          setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query, searchOpen]);

  const toggleGroup = (group: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });

  const handleAddResult = (result: any) => {
    const item = buildWatchlistItemFromSearch(result);
    if (!item) return;
    const added = addWatchlistItem(item);
    if (!added) {
      // Ya estaba (por símbolo o por ticker): no se duplica.
      showNotice('Ya está en tu watchlist');
      return;
    }
    showNotice(`${item.ticker} se agregó a tu watchlist`);
    setSearchOpen(false);
    setQuery('');
    setResults([]);
  };

  const renderRow = (item: WatchlistItem) => {
    const q = item.symbol ? quotes[item.symbol] : undefined;
    const isActive = Boolean(item.symbol) && item.symbol === selectedSymbol;
    const unavailable = item.symbol === null;
    // Sigla: las ACCIONES con símbolo la resuelven contra el servidor;
    // el resto (cripto, par, ETFs, sin símbolo) es «—» definitivo.
    const sigla = watchlistItemSigla(item, verdicts);
    const verdict = item.symbol ? verdicts[item.symbol]?.verdict ?? null : null;
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
        data-wl-row={item.ticker}
        data-wl-active={isActive ? 'true' : undefined}
        onClick={
          !editing && item.symbol
            ? () => void selectAsset(item.symbol as string)
            : undefined
        }
        title={
          unavailable
            ? 'Activo no disponible en las fuentes de la app'
            : item.symbol || undefined
        }
        style={{
          display: 'grid',
          gridTemplateColumns: editing ? 'auto minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 8,
          padding: isActive ? '6px 10px 6px 7px' : '6px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          borderLeft: isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent',
          background: isActive ? 'var(--bg-hover)' : undefined,
          cursor: !editing && item.symbol ? 'pointer' : 'default',
          opacity: unavailable ? 0.55 : 1,
        }}
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              aria-label={`Subir ${item.ticker} en su grupo`}
              data-wl-up={item.ticker}
              disabled={groupEdges.first.has(item.ticker)}
              onClick={(e) => {
                e.stopPropagation();
                moveWatchlistItem(item.ticker, 'up');
              }}
              style={moveBtnStyle(groupEdges.first.has(item.ticker))}
            >
              <ArrowUp size={15} />
            </button>
            <button
              type="button"
              aria-label={`Bajar ${item.ticker} en su grupo`}
              data-wl-down={item.ticker}
              disabled={groupEdges.last.has(item.ticker)}
              onClick={(e) => {
                e.stopPropagation();
                moveWatchlistItem(item.ticker, 'down');
              }}
              style={moveBtnStyle(groupEdges.last.has(item.ticker))}
            >
              <ArrowDown size={15} />
            </button>
          </div>
        )}
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
        {editing ? (
          <button
            type="button"
            aria-label={`Quitar ${item.ticker} de la watchlist`}
            data-wl-remove={item.ticker}
            onClick={(e) => {
              e.stopPropagation();
              removeWatchlistItem(item.ticker);
            }}
            style={{
              width: 32,
              height: 32,
              minWidth: 32,
              minHeight: 32,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: '1px solid rgba(239, 68, 68, 0.40)',
              background: 'rgba(239, 68, 68, 0.10)',
              color: 'var(--neg-bright)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        ) : (
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
        )}
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
          flexWrap: 'wrap',
        }}
      >
        <ListChecks size={15} color="var(--accent-cyan)" />
        <span style={{ fontWeight: 800, fontSize: 13.5 }}>Watchlist</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {config.items.length} activos · tu orden de importancia
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          style={headerBtnStyle}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Plus size={13} /> Agregar
        </button>
        <button
          type="button"
          style={headerBtnStyle}
          aria-pressed={editing}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? (
            <>
              <Check size={13} /> Listo
            </>
          ) : (
            <>
              <Pencil size={13} /> Editar
            </>
          )}
        </button>
      </div>

      {notice && (
        <div
          role="status"
          style={{
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--accent-cyan)',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {notice}
        </div>
      )}

      {searchOpen && (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
            }}
          >
            <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <input
              autoFocus
              className="input"
              style={{
                border: 'none',
                flex: 1,
                background: 'transparent',
                fontSize: 14,
                minWidth: 0,
                minHeight: 32,
              }}
              placeholder="Buscar símbolo o empresa (ej. KLAC)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px 6px', minHeight: 32 }}
              aria-label="Cerrar buscador"
              onClick={() => {
                setSearchOpen(false);
                setQuery('');
                setResults([]);
              }}
            >
              <X size={14} />
            </button>
          </div>
          {query.trim().length >= 1 && (
            <div style={{ maxHeight: 264, overflowY: 'auto' }}>
              {searching && results.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Buscando…
                </div>
              ) : results.length === 0 ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                  Sin resultados para «{query.trim()}».
                </div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    data-wl-search-result={r.ticker}
                    onClick={() => handleAddResult(r)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      minHeight: 40,
                      padding: '7px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderTop: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 700 }}>
                      {r.ticker}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'var(--bg-elevated)',
                        color: 'var(--accent-cyan)',
                        border: '1px solid var(--border-subtle)',
                        flexShrink: 0,
                      }}
                    >
                      {r.exchange}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {r.type}
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        minWidth: 0,
                      }}
                    >
                      {r.name}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Filtro por veredicto (enmienda v8): los conteos son de las
          siglas ya cargadas en la sesión. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          background: 'var(--bg-elevated)',
        }}
      >
        {WATCHLIST_SIGLA_FILTERS.map((f) => {
          const active = filter === f;
          const style = f !== 'TODOS' ? SIGLA_STYLE[f] : undefined;
          const count = f !== 'TODOS' ? siglaCounts[f] : null;
          return (
            <button
              key={f}
              type="button"
              data-wl-filter={f}
              aria-pressed={active}
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 10px',
                minHeight: 30,
                fontSize: 11.5,
                fontWeight: active ? 800 : 600,
                borderRadius: 999,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                border: style?.border ?? '1px solid var(--border-subtle)',
                background:
                  active && f === 'TODOS'
                    ? 'var(--bg-hover)'
                    : style?.background ?? 'transparent',
                color: style?.color ?? 'var(--text-secondary)',
                boxShadow: active ? 'inset 0 0 0 1px currentColor' : undefined,
                opacity: active ? 1 : 0.75,
              }}
            >
              {f === 'TODOS' ? 'Todos' : f}
              {count !== null && count > 0 ? ` · ${count}` : ''}
            </button>
          );
        })}
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
        {visibleGroups.map(({ group, total, items }) => {
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
                  {group} · {filter === 'TODOS' ? total : `${items.length} de ${total}`}
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
        {config.items.length === 0 && (
          <div style={{ padding: 14, fontSize: 12.5, color: 'var(--text-muted)' }}>
            La watchlist está vacía.
          </div>
        )}
        {config.items.length > 0 && visibleGroups.length === 0 && filter !== 'TODOS' && (
          <div style={{ padding: 14, fontSize: 12.5, color: 'var(--text-muted)' }}>
            Ningún activo en {siglaFilterName(filter)} por ahora.
          </div>
        )}
      </div>
    </div>
  );
};
