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
  Check,
  ChevronDown,
  GripVertical,
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
 * del motor, con caché en memoria de 15 min en el servidor
 * (/api/watchlist/verdicts; enmienda v10: mismo snapshot que la
 * ficha): acá se piden en lotes progresivos solo para las ACCIONES;
 * cripto, el par
 * ETH/BTC y los ETFs no tienen evaluación del motor («—» definitivo).
 *
 * Enmienda v8: filtro por veredicto (chips Todos/CF/C/M/V), alta de
 * activos desde el buscador de la app (grupo detectado solo, se
 * persiste en el acto) y baja en el modo edición (× por fila), todo
 * persistido en el acto.
 *
 * Enmienda v9: el reordenamiento del modo edición es por ARRASTRE
 * con presión sostenida (el dueño encontró impracticables las
 * flechas ↑/↓ de la v8 para bajar muchas posiciones): mantener
 * presionada una fila ~300 ms la «levanta» y desde ahí el dedo o el
 * mouse la mueve dentro de su grupo, con auto-scroll del panel
 * cerca de los bordes para recorrer muchas posiciones sin soltar.
 * El arrastre nunca cruza de grupo y el orden nuevo se persiste una
 * sola vez al soltar. Fuera del arrastre, en edición un gesto de
 * scroll sigue recorriendo la lista (cancela la presión pendiente).
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

/** Arrastre con presión sostenida (enmienda v9): tiempos y umbrales. */
const WL_LONG_PRESS_MS = 300;
const WL_PRESS_MOVE_TOLERANCE_PX = 10;
const WL_AUTOSCROLL_EDGE_PX = 56;
const WL_AUTOSCROLL_MAX_STEP_PX = 16;

interface WlDragSession {
  pointerId: number;
  ticker: string;
  group: WatchlistItem['group'];
  fromIndex: number;
  /** Centro vertical de la fila arrastrada en coordenadas del
   *  contenido del panel (con scroll), al activarse el arrastre. */
  originCenter: number;
  /** Extremos del grupo en coordenadas del contenido: la fila
   *  arrastrada no puede salir de acá (nunca cruza de grupo). */
  groupTop: number;
  groupBottom: number;
  rowHeight: number;
  startY: number;
  startScrollTop: number;
  lastClientY: number;
  /** Hermanas del grupo (sin la arrastrada), en orden, con su
   *  centro en coordenadas del contenido al activarse. */
  siblings: { ticker: string; center: number }[];
}

interface WlDragUi {
  ticker: string;
  group: WatchlistItem['group'];
  dy: number;
  targetIndex: number;
  rowHeight: number;
  fromIndex: number;
}

export const WatchlistPanel: React.FC<{ isMobile: boolean }> = ({ isMobile }) => {
  const {
    nwSettings,
    selectedSymbol,
    selectAsset,
    currency,
    fxRates,
    addWatchlistItem,
    removeWatchlistItem,
    reorderWatchlistItem,
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

  // ===== Arrastre con presión sostenida (enmienda v9) =====
  // Solo en modo edición y con el filtro en «Todos» (con un filtro
  // de veredicto activo, el índice visible no es el del grupo).
  const [dragUi, setDragUi] = useState<WlDragUi | null>(null);
  // Espejo del estado en un ref: los listeners de ventana se
  // registran al pointerdown y tienen que leer el destino vigente
  // al soltar, no el del render de ese momento.
  const dragUiRef = useRef<WlDragUi | null>(null);
  const applyDragUi = (ui: WlDragUi | null) => {
    dragUiRef.current = ui;
    setDragUi(ui);
  };
  const dragSessionRef = useRef<WlDragSession | null>(null);
  const pressRef = useRef<{
    pointerId: number;
    pointerType: string;
    ticker: string;
    group: WatchlistItem['group'];
    indexInGroup: number;
    startX: number;
    startY: number;
    startScrollTop: number;
    /** 'press': esperando la activación. 'scroll': el gesto resultó
     *  ser un scroll táctil y el resto del gesto scrollea a mano. */
    mode: 'press' | 'scroll';
    rowEl: HTMLElement;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const endDragSession = (persist: boolean) => {
    const session = dragSessionRef.current;
    const ui = dragUiRef.current;
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
    dragSessionRef.current = null;
    applyDragUi(null);
    if (persist && session && ui && ui.targetIndex !== session.fromIndex) {
      reorderWatchlistItem(session.ticker, ui.targetIndex);
    }
  };

  const cancelPress = () => {
    if (pressRef.current) {
      clearTimeout(pressRef.current.timer);
      pressRef.current = null;
    }
    if (dragCleanupRef.current) {
      dragCleanupRef.current();
      dragCleanupRef.current = null;
    }
  };

  /** Recalcula dy y puesto destino desde la última posición del
   *  puntero (teniendo en cuenta cuánto scrolleó el contenedor,
   *  a mano o por auto-scroll, desde la activación). */
  const updateDragFromPointer = () => {
    const session = dragSessionRef.current;
    const box = scrollRef.current;
    if (!session || !box) return;
    const rawDy =
      session.lastClientY - session.startY + (box.scrollTop - session.startScrollTop);
    const half = session.rowHeight / 2;
    // La fila no sale de su grupo: se clampea el desplazamiento a
    // los extremos del grupo medidos al activarse.
    const minDy = session.groupTop - (session.originCenter - half);
    const maxDy = session.groupBottom - (session.originCenter + half);
    const dy = Math.max(minDy, Math.min(maxDy, rawDy));
    const center = session.originCenter + dy;
    let targetIndex = 0;
    for (const sib of session.siblings) {
      if (sib.center < center) targetIndex += 1;
    }
    targetIndex = Math.max(
      0,
      Math.min(session.siblings.length, targetIndex)
    );
    const prev = dragUiRef.current;
    if (!prev || prev.dy !== dy || prev.targetIndex !== targetIndex) {
      applyDragUi({
        ticker: session.ticker,
        group: session.group,
        dy,
        targetIndex,
        rowHeight: session.rowHeight,
        fromIndex: session.fromIndex,
      });
    }
  };

  const scheduleDragUpdate = () => {
    if (dragRafRef.current !== null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      updateDragFromPointer();
    });
  };

  /** Auto-scroll del contenedor mientras se arrastra: si el puntero
   *  está cerca del borde visible, el panel scrollea solo (más
   *  rápido cuanto más cerca del borde) para poder recorrer muchas
   *  posiciones sin soltar. */
  const runAutoScrollLoop = () => {
    const step = () => {
      autoScrollRafRef.current = null;
      const session = dragSessionRef.current;
      const box = scrollRef.current;
      if (!session || !box) return;
      const rect = box.getBoundingClientRect();
      const distTop = session.lastClientY - rect.top;
      const distBottom = rect.bottom - session.lastClientY;
      let delta = 0;
      if (distTop < WL_AUTOSCROLL_EDGE_PX) {
        const f = 1 - Math.max(0, distTop) / WL_AUTOSCROLL_EDGE_PX;
        delta = -Math.max(2, Math.round(f * WL_AUTOSCROLL_MAX_STEP_PX));
      } else if (distBottom < WL_AUTOSCROLL_EDGE_PX) {
        const f = 1 - Math.max(0, distBottom) / WL_AUTOSCROLL_EDGE_PX;
        delta = Math.max(2, Math.round(f * WL_AUTOSCROLL_MAX_STEP_PX));
      }
      if (delta !== 0) {
        box.scrollTop += delta;
        updateDragFromPointer();
      }
      autoScrollRafRef.current = requestAnimationFrame(step);
    };
    if (autoScrollRafRef.current === null) {
      autoScrollRafRef.current = requestAnimationFrame(step);
    }
  };

  const activateDrag = () => {
    const press = pressRef.current;
    const box = scrollRef.current;
    if (!press || !box || press.mode !== 'press') return;
    pressRef.current = null;
    const containerRect = box.getBoundingClientRect();
    const toContentY = (clientRectTop: number) =>
      clientRectTop - containerRect.top + box.scrollTop;
    const rowRect = press.rowEl.getBoundingClientRect();
    const rowTop = toContentY(rowRect.top);
    const rowHeight = rowRect.height;
    // Geometría de las filas del mismo grupo (visibles: en edición
    // el filtro está en «Todos», así que son todas las del grupo).
    const rowEls = box.querySelectorAll<HTMLElement>(
      `[data-wl-group="${press.group}"]`
    );
    let groupTop = rowTop;
    let groupBottom = rowTop + rowHeight;
    const siblings: { ticker: string; center: number }[] = [];
    rowEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      const top = toContentY(r.top);
      groupTop = Math.min(groupTop, top);
      groupBottom = Math.max(groupBottom, top + r.height);
      const t = el.getAttribute('data-wl-row');
      if (t && t !== press.ticker) {
        siblings.push({ ticker: t, center: top + r.height / 2 });
      }
    });
    dragSessionRef.current = {
      pointerId: press.pointerId,
      ticker: press.ticker,
      group: press.group,
      fromIndex: press.indexInGroup,
      originCenter: rowTop + rowHeight / 2,
      groupTop,
      groupBottom,
      rowHeight,
      startY: press.startY,
      startScrollTop: box.scrollTop,
      lastClientY: press.startY,
      siblings,
    };
    try {
      navigator.vibrate?.(12);
    } catch {
      /* vibración no disponible: no es crítica */
    }
    try {
      press.rowEl.setPointerCapture(press.pointerId);
    } catch {
      /* la captura es una ayuda; los listeners de ventana alcanzan */
    }
    applyDragUi({
      ticker: press.ticker,
      group: press.group,
      dy: 0,
      targetIndex: press.indexInGroup,
      rowHeight,
      fromIndex: press.indexInGroup,
    });
    runAutoScrollLoop();
  };

  const handleRowPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    item: WatchlistItem,
    indexInGroup: number
  ) => {
    if (!editing || filter !== 'TODOS') return;
    if (e.button !== undefined && e.button !== 0) return;
    // La presión tiene que nacer sobre la fila, no sobre un botón
    // (la × de quitar tiene su propio toque).
    if ((e.target as HTMLElement).closest('button')) return;
    cancelPress();
    const rowEl = e.currentTarget;
    const onMove = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (session) {
        if (ev.pointerId !== session.pointerId) return;
        session.lastClientY = ev.clientY;
        scheduleDragUpdate();
        return;
      }
      const press = pressRef.current;
      if (!press || ev.pointerId !== press.pointerId) return;
      if (press.mode === 'scroll') {
        // El resto de un gesto de scroll táctil: la lista sigue al
        // dedo a mano (en edición las filas llevan touch-action:
        // none, así que el navegador no scrollea por su cuenta).
        const box = scrollRef.current;
        if (box) box.scrollTop = press.startScrollTop - (ev.clientY - press.startY);
        return;
      }
      // Antes de activarse, moverse más que la tolerancia es un
      // gesto de scroll (o un arrastre apurado): se cancela la
      // presión pendiente. Con mouse alcanza con cancelar; con el
      // dedo, el gesto pasa a scrollear la lista a mano.
      if (
        Math.abs(ev.clientX - press.startX) > WL_PRESS_MOVE_TOLERANCE_PX ||
        Math.abs(ev.clientY - press.startY) > WL_PRESS_MOVE_TOLERANCE_PX
      ) {
        if (press.pointerType === 'mouse') {
          cancelPress();
          return;
        }
        clearTimeout(press.timer);
        press.mode = 'scroll';
        const box = scrollRef.current;
        if (box) box.scrollTop = press.startScrollTop - (ev.clientY - press.startY);
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (dragSessionRef.current) {
        if (ev.pointerId !== dragSessionRef.current.pointerId) return;
        endDragSession(true);
      } else {
        cancelPress();
      }
    };
    const onCancel = (ev: PointerEvent) => {
      const activeId = dragSessionRef.current?.pointerId ?? pressRef.current?.pointerId;
      if (activeId !== undefined && ev.pointerId !== activeId) return;
      // pointercancel (el navegador se quedó con el gesto, p. ej.
      // para scrollear): no se persiste nada.
      if (dragSessionRef.current) endDragSession(false);
      else cancelPress();
    };
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      if (autoScrollRafRef.current !== null) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    pressRef.current = {
      pointerId: e.pointerId,
      pointerType: e.pointerType || 'touch',
      ticker: item.ticker,
      group: item.group,
      indexInGroup,
      startX: e.clientX,
      startY: e.clientY,
      startScrollTop: scrollRef.current?.scrollTop ?? 0,
      mode: 'press',
      rowEl,
      timer: setTimeout(activateDrag, WL_LONG_PRESS_MS),
    };
  };

  // Si se sale del modo edición (o el panel se desmonta) en medio de
  // una presión/arrastre, se cancela sin persistir.
  useEffect(() => {
    if (!editing) {
      if (dragSessionRef.current) endDragSession(false);
      else cancelPress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  useEffect(
    () => () => {
      if (pressRef.current) clearTimeout(pressRef.current.timer);
      if (dragCleanupRef.current) dragCleanupRef.current();
    },
    []
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

  const renderRow = (item: WatchlistItem, indexInGroup: number) => {
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
    // Arrastre (enmienda v9): la fila arrastrada sigue al dedo/mouse
    // y las hermanas del grupo se desplazan dejando el hueco.
    const isDragged = dragUi?.ticker === item.ticker;
    let shiftY = 0;
    if (dragUi && !isDragged && dragUi.group === item.group) {
      if (
        dragUi.fromIndex < dragUi.targetIndex &&
        indexInGroup > dragUi.fromIndex &&
        indexInGroup <= dragUi.targetIndex
      ) {
        shiftY = -dragUi.rowHeight;
      } else if (
        dragUi.targetIndex < dragUi.fromIndex &&
        indexInGroup >= dragUi.targetIndex &&
        indexInGroup < dragUi.fromIndex
      ) {
        shiftY = dragUi.rowHeight;
      }
    }
    return (
      <div
        key={item.ticker}
        data-wl-row={item.ticker}
        data-wl-group={item.group}
        data-wl-active={isActive ? 'true' : undefined}
        data-wl-dragging={isDragged ? 'true' : undefined}
        onClick={
          !editing && item.symbol
            ? () => void selectAsset(item.symbol as string)
            : undefined
        }
        onPointerDown={
          editing ? (e) => handleRowPointerDown(e, item, indexInGroup) : undefined
        }
        onContextMenu={editing ? (e) => e.preventDefault() : undefined}
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
          borderLeft:
            isActive || isDragged
              ? '3px solid var(--accent-cyan)'
              : '3px solid transparent',
          background: isDragged
            ? 'var(--bg-elevated)'
            : isActive
              ? 'var(--bg-hover)'
              : undefined,
          cursor: editing ? 'grab' : !editing && item.symbol ? 'pointer' : 'default',
          opacity: unavailable ? 0.55 : 1,
          transform: isDragged
            ? `translateY(${dragUi.dy}px) scale(1.02)`
            : shiftY !== 0
              ? `translateY(${shiftY}px)`
              : undefined,
          transition: isDragged ? 'none' : 'transform 0.18s ease',
          position: isDragged ? 'relative' : undefined,
          zIndex: isDragged ? 6 : undefined,
          boxShadow: isDragged ? '0 10px 28px rgba(0, 0, 0, 0.55)' : undefined,
          // En edición las filas capturan el gesto (touch-action:
          // none): si el navegador pudiera scrollear, se quedaría
          // con el gesto a mitad de la presión (pointercancel) y el
          // arrastre moriría al primer movimiento. El scroll en
          // edición lo resuelve el propio gesto: moverse antes de
          // la activación scrollea la lista a mano siguiendo al
          // dedo. Fuera de edición, el scroll nativo no se toca.
          touchAction: editing ? 'none' : undefined,
          userSelect: editing ? 'none' : undefined,
          WebkitTouchCallout: editing ? 'none' : undefined,
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
          onClick={() => {
            const next = !editing;
            setEditing(next);
            // Al entrar a edición se ve la lista completa: el
            // arrastre reordena por índice dentro del grupo y con un
            // filtro de veredicto activo ese índice no sería el real.
            if (next) setFilter('TODOS');
          }}
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

      {editing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            fontSize: 11.5,
            color: 'var(--text-muted)',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <GripVertical size={13} style={{ flexShrink: 0 }} />
          <span>
            Mantené presionada una fila y arrastrala para reordenar dentro de su
            grupo.
          </span>
        </div>
      )}

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
              {!isCollapsed && items.map((item, idx) => renderRow(item, idx))}
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
