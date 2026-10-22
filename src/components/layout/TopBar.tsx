import React from 'react';
import { useAppStore } from '@/store';
import type { CurrencyCode } from '@shared/engine/types';
import {
  Search,
  Sun,
  Moon,
  Plus,
  Globe,
  Briefcase,
  LineChart,
  RefreshCw,
} from 'lucide-react';

export const TopBar: React.FC = () => {
  const {
    theme,
    toggleTheme,
    currency,
    setCurrency,
    pricingMode,
    setPricingMode,
    rightState,
    setRightState,
    setSearchOpen,
    openAddModal,
    refreshAll,
    loading,
  } = useAppStore();

  return (
    <header className="topbar">
      {/* 1. GRUPO IZQUIERDO: MARCA + NAVEGACIÓN DE ESTADOS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div
          className="brand"
          onClick={() => setRightState('market')}
          title="Ir a Inicio / Mercado (Estado 1)"
        >
          <div className="brand-mark">FP</div>
          <span className="brand-title">FolioProspect</span>
          <span className="brand-badge">QUANT</span>
        </div>

        {/* Conmutador rápido de los 3 estados del Panel Derecho */}
        <nav className="seg-group" aria-label="Modo de vista principal">
          <button
            className={`seg-btn ${rightState === 'market' ? 'active' : ''}`}
            onClick={() => setRightState('market')}
            style={{ padding: '4px 9px', fontSize: 11.5 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Globe size={12} /> Mercado
            </span>
          </button>
          <button
            className={`seg-btn ${rightState === 'portfolio' ? 'active' : ''}`}
            onClick={() => setRightState('portfolio')}
            style={{ padding: '4px 9px', fontSize: 11.5 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Briefcase size={12} /> Portafolio TV
            </span>
          </button>
          <button
            className={`seg-btn ${rightState === 'asset' ? 'active' : ''}`}
            onClick={() => setRightState('asset')}
            style={{ padding: '4px 9px', fontSize: 11.5 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <LineChart size={12} /> Activo & Fair Value
            </span>
          </button>
        </nav>
      </div>

      {/* 2. GRUPO CENTRAL: BUSCADOR GLOBAL CTRL+K */}
      <div
        onClick={() => setSearchOpen(true)}
        style={{
          flex: '0 1 360px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderRadius: 8,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          margin: '0 12px',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <Search size={13} color="var(--accent-cyan)" />
          <span>Buscar acciones, DRs, cripto...</span>
        </span>
        <kbd
          className="mono"
          style={{
            fontSize: 10,
            padding: '2px 5px',
            borderRadius: 4,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          Ctrl+K
        </kbd>
      </div>

      {/* 3. GRUPO DERECHO: MODO DE PRECIOS, DIVISA, +OPERACIÓN, THEME */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Toggle Live vs REA Snapshot con punto verde pulsante */}
        <div className="seg-group" title="Mercado en vivo cada 15s vs Snapshot estático original">
          <button
            className={`seg-btn ${pricingMode === 'live' ? 'active' : ''}`}
            onClick={() => setPricingMode('live')}
            style={{
              padding: '4px 9px',
              fontSize: 11,
              fontWeight: 600,
              color: pricingMode === 'live' ? 'var(--pos-bright)' : undefined,
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: pricingMode === 'live' ? '#10B981' : '#64748B',
                  boxShadow: pricingMode === 'live' ? '0 0 6px #10B981' : 'none',
                }}
              />
              Live (15s)
            </span>
          </button>
          <button
            className={`seg-btn ${pricingMode === 'tv_snapshot' ? 'active' : ''}`}
            onClick={() => setPricingMode('tv_snapshot')}
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            REA Exacto
          </button>
        </div>

        {/* Selector de Divisa Base: USD / ARS / EUR */}
        <div className="seg-group" aria-label="Selector de divisa base">
          {(['USD', 'ARS', 'EUR'] as CurrencyCode[]).map((c) => (
            <button
              key={c}
              className={`seg-btn mono ${currency === c ? 'active' : ''}`}
              onClick={() => setCurrency(c)}
              style={{ padding: '4px 7px', fontSize: 11 }}
            >
              {c}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary"
          onClick={() => openAddModal('trade')}
          style={{ padding: '5px 10px', fontSize: 11.5 }}
        >
          <Plus size={13} /> Operación
        </button>

        <button
          className="btn"
          onClick={() => refreshAll()}
          title="Actualizar cotizaciones en vivo"
          style={{ padding: '5px 8px' }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>

        <button
          className="btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}
          aria-label="Cambiar tema"
          style={{ padding: '5px 8px' }}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>
    </header>
  );
};
