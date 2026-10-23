import React from 'react';
import { useAppStore } from '@/store';
import type { CurrencyCode } from '@shared/engine/types';
import { Search, Sun, Moon, RefreshCw } from 'lucide-react';

export const MobileHeader: React.FC = () => {
  const {
    theme,
    toggleTheme,
    currency,
    setCurrency,
    pricingMode,
    setPricingMode,
    setMobileTab,
    setSearchOpen,
    refreshAll,
    loading,
  } = useAppStore();

  return (
    <header
      className="mobile-header"
      aria-label="Cabecera Móvil FolioProspect"
      style={{ padding: '0 8px', gap: 4 }}
    >
      {/* Marca / Ir a Cartera */}
      <div
        className="brand"
        onClick={() => setMobileTab('holdings')}
        title="Ver Cartera y Posiciones"
        style={{ gap: 6, minWidth: 0, flexShrink: 0 }}
      >
        <div
          className="brand-mark"
          style={{ width: 24, height: 24, fontSize: 11.5, borderRadius: 6, flexShrink: 0 }}
        >
          FP
        </div>
        <span
          className="brand-title"
          style={{
            fontSize: 13.5,
            whiteSpace: 'nowrap',
          }}
        >
          FolioProspect
        </span>
      </div>

      {/* Controles compactos sin desborde */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        {/* Buscador rápido */}
        <button
          type="button"
          className="btn"
          onClick={() => setSearchOpen(true)}
          title="Buscar acciones, CEDEARs, cripto..."
          aria-label="Buscar activo"
          style={{ padding: '4px 6px' }}
        >
          <Search size={12} color="var(--accent-cyan)" />
        </button>

        {/* Selector compacto USD / ARS / EUR */}
        <div className="seg-group" aria-label="Selector de divisa base">
          {(['USD', 'ARS', 'EUR'] as CurrencyCode[]).map((c) => (
            <button
              key={c}
              type="button"
              className={'seg-btn mono ' + (currency === c ? 'active' : '')}
              onClick={() => setCurrency(c)}
              style={{ padding: '3px 4px', fontSize: 9.5 }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Botón Live / REA */}
        <button
          type="button"
          className="btn"
          onClick={() => setPricingMode(pricingMode === 'live' ? 'tv_snapshot' : 'live')}
          title={
            pricingMode === 'live'
              ? 'Modo Live activo (clic para cambiar a REA Snapshot)'
              : 'Modo REA Snapshot activo (clic para cambiar a Live)'
          }
          style={{
            padding: '4px 6px',
            fontSize: 10,
            fontWeight: 700,
            gap: 3,
            color: pricingMode === 'live' ? 'var(--pos-bright)' : 'var(--text-secondary)',
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: pricingMode === 'live' ? '#10B981' : '#64748B',
              boxShadow: pricingMode === 'live' ? '0 0 6px #10B981' : 'none',
              flexShrink: 0,
            }}
          />
          {pricingMode === 'live' ? 'Live' : 'REA'}
        </button>

        {/* Botón Refrescar */}
        <button
          type="button"
          className="btn"
          onClick={() => refreshAll()}
          title="Actualizar cotizaciones en vivo"
          aria-label="Actualizar cotizaciones"
          style={{ padding: '4px 6px' }}
        >
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
        </button>

        {/* Botón Tema */}
        <button
          type="button"
          className="btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}
          aria-label="Cambiar tema"
          style={{ padding: '4px 6px' }}
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
      </div>
    </header>
  );
};