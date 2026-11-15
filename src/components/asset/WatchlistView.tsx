import React from 'react';
import { WatchlistPanel } from './WatchlistPanel';

/**
 * Vista Watchlist a pantalla completa (SPEC-006, enmienda v11):
 * tercera opción del selector inicial, junto a «Portafolio
 * Financiero» y «Vista General Consolidada». Muestra SOLO la
 * watchlist en el panel principal (en el celular, el lugar donde se
 * abre el Portafolio; en escritorio, el panel derecho), reutilizando
 * el WatchlistPanel en su variante 'view' — la tarjeta que vive al
 * fondo de la ficha del activo queda como estaba. La variante 'view'
 * suma el orden «▼ Caídas hoy», las marcas de cambio de veredicto
 * contra la última sigla vista y las alertas de precio dentro de la
 * app.
 */
export const WatchlistView: React.FC<{ isMobile: boolean }> = ({ isMobile }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <WatchlistPanel isMobile={isMobile} variant="view" />
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0, padding: '0 2px' }}>
        Tu lista de seguimiento, estilo TradingView: cotizaciones cada 15 segundos
        con la app abierta, veredicto de oportunidad por activo, cambios de
        veredicto desde tu última marca y alertas de precio (baja de un valor o
        caída del día) que se evalúan acá mismo.
      </p>
    </div>
  );
};
