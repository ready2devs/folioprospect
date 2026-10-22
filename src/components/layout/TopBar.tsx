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
      <div className="topbar-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          className="brand"
          onClick={() => setRightState('market')}
          title="Ir a Inicio / Mercado (Estado 1)"
        >
          <div className="brand-mark">FP</div>
          <span className="brand-title">FolioProspect</span>
          <span className="brand-badge">OBSIDIAN QUANT v1</span>
        </div>

        {/* Conmutador rápido de los 3 estados del Panel Derecho */}
        <nav className="seg-group" aria-label="Modo de vista principal">
          <button
            className={`seg-btn ${rightState === 'market' ? 'active' : ''}`}
            onClick={() => setRightState('market')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Globe size={13} /> Inicio / Mercado
            </span>
          </button>
          <button
            className={`seg-btn ${rightState === 'portfolio' ? 'active' : ''}`}
            onClick={() => setRightState('portfolio')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Briefcase size={13} /> Portafolio TradingView
            </span>
          </button>
          <button
            className={`seg-btn ${rightState === 'asset' ? 'active' : ''}`}
            onClick={() => setRightState('asset')}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <LineChart size={13} /> Activo & Fair Value
            </span>
          </button>
        </nav>
      </div>

      {/* Buscador Global de Activos Ctrl+K */}
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
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <Search size={14} /> Buscar acciones, CEDEARs/DRs, cripto o índices...
        </span>
        <kbd
          className="mono"
          style={{
            fontSize: 10.5,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          Ctrl+K
        </kbd>
      </div>

      {/* Controles derechos: Fuente de Precios, Divisa Base, + Add, Tema */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="seg-group" title="Alternar entre Snapshot REA TradingView y Cotizaciones Yahoo en Vivo">
          <button
            className={`seg-btn ${pricingMode === 'tv_snapshot' ? 'active' : ''}`}
            onClick={() => setPricingMode('tv_snapshot')}
          >
            REA Exacto
          </button>
          <button
            className={`seg-btn ${pricingMode === 'live' ? 'active' : ''}`}
            onClick={() => setPricingMode('live')}
          >
            ● Live (15s)
          </button>
        </div>

        {/* Selector de Divisa Base: USD / ARS / EUR */}
        <div className="seg-group" aria-label="Selector de divisa base">
          {(['USD', 'ARS', 'EUR'] as CurrencyCode[]).map((c) => (
            <button
              key={c}
              className={`seg-btn mono ${currency === c ? 'active' : ''}`}
              onClick={() => setCurrency(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={() => openAddModal('trade')}>
          <Plus size={14} /> Operación / Activo
        </button>

        <button
          className="btn"
          onClick={() => refreshAll()}
          title="Actualizar cotizaciones y recalcular motor"
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>

        <button
          className="btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}
          aria-label="Cambiar tema"
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        </div>
      </div>
    </header>
  );
};
