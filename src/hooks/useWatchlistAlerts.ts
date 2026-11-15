import { useEffect } from 'react';
import { useAppStore } from '@/store';
import { api } from '@/api';
import {
  evaluateWatchlistAlerts,
  resolveWatchlistConfig,
} from '@shared/engine/watchlist';

/**
 * Alertas de precio de la watchlist dentro de la app (SPEC-006,
 * enmienda v11): con la app abierta, cada 15 s pide cotizaciones
 * SOLO de los activos con alerta activa (todavía no disparada) y
 * las evalúa con la función pura del motor. Si alguna se dispara,
 * la lista evaluada se persiste (la alerta queda registrada con
 * hora y precio, y no vuelve a disparar hasta re-activarla); el
 * aviso se ve en la vista Watchlist y como distintivo en el
 * selector. Sin alertas activas no se hace ningún pedido. El aviso
 * con la app cerrada (push) es una etapa posterior, fuera de esta
 * enmienda.
 */
export function useWatchlistAlerts(): void {
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const state = useAppStore.getState();
      const config = resolveWatchlistConfig(state.nwSettings);
      const alerts = config.alerts ?? [];
      const active = alerts.filter((a) => !a.triggeredAt);
      if (active.length === 0) return;
      const activeTickers = new Set(active.map((a) => a.ticker));
      const symbols = config.items
        .filter((it) => activeTickers.has(it.ticker) && it.symbol)
        .map((it) => it.symbol as string);
      if (symbols.length === 0) return;
      const quotes = await api.getQuotes(symbols);
      if (cancelled || Object.keys(quotes).length === 0) return;
      // Releer el estado: la config pudo cambiar mientras el pedido
      // estaba en vuelo (el dueño editó o re-activó una alerta).
      const fresh = resolveWatchlistConfig(useAppStore.getState().nwSettings);
      const { fired, alerts: next } = evaluateWatchlistAlerts(
        fresh,
        fresh.items,
        quotes,
        new Date().toISOString()
      );
      if (fired.length > 0) {
        useAppStore.getState().saveWatchlistAlerts(next);
      }
    };
    void tick();
    const id = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
}
