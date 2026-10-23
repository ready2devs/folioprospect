import React from 'react';
import { useAppStore } from '@/store';
import type { CurrencyCode } from '@shared/engine/types';
import {
  Sun,
  Moon,
  Plus,
  Globe,
  Briefcase,
  LineChart,
  RefreshCw,
  Search,
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
    nwSettings,
  } = useAppStore();

  const isTvLabel = nwSettings?.labelStyle === 'tv';

  return (
    <header
      className="topbar"
      style={{
        gap: 10,
        overflow: 'hidden',
      }}
    >
      {/* 1. GRUPO IZQUIERDO: MARCA + NAVEGACIÓN DE ESTADOS MINIMALISTA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          className="brand"
          onClick={() => setRightState('market')}
          title="Ir a Inicio / Mercado (Estado 1)"
          style={{ flexShrink: 0 }}
        >
          <div className="brand-mark">FP</div>
          <span className="brand-title">FolioProspect</span>
          <span className="brand-badge">QUANT</span>
        </div>

        {/* Conmutador rápido de los 3 estados del Panel Derecho */}
        <nav className="seg-group" aria-label="Modo de vista principal" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className={`seg-btn ${rightState === 'market' ? 'active' : ''}`}
            onClick={() => setRightState('market')}
            style={{ padding: '4px 9px', fontSize: 11.5 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Globe size={12} /> Mercado
            </span>
          </button>
          <button
            type="button"
            className={`seg-btn ${rightState === 'portfolio' ? 'active' : ''}`}
            onClick={() => setRightState('portfolio')}
            style={{ padding: '4px 9px', fontSize: 11.5 }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Briefcase size={12} /> {isTvLabel ? 'Portafolio TV' : 'Portafolio'}
            </span>
          </button>
          <button
            type="button"
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

      {/* 2. GRUPO DERECHO: MODO DE PRECIOS, DIVISA, +OPERACIÓN, ACTUALIZAR, TEMA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <button
          type="button"
          className="btn"
          onClick={() => setSearchOpen(true)}
          title="Buscar activo (Ctrl+K)"
          aria-label="Buscar activo"
          style={{ padding: '5px 8px' }}
        >
          <Search size={13} />
        </button>

        {/* Toggle Live vs Snapshot con punto verde pulsante */}
        <div className="seg-group" title="Mercado en vivo cada 15s vs Snapshot estático original">
          <button
            type="button"
            className={`seg-btn ${pricingMode === 'live' ? 'active' : ''}`}
            onClick={() => setPricingMode('live')}
            style={{
              padding: '4px 8px',
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
            type="button"
            className={`seg-btn ${pricingMode === 'tv_snapshot' ? 'active' : ''}`}
            onClick={() => setPricingMode('tv_snapshot')}
            style={{ padding: '4px 8px', fontSize: 11 }}
          >
            Snapshot
          </button>
        </div>

        {/* Selector de Divisa Base: USD / ARS / EUR */}
        <div className="seg-group" aria-label="Selector de divisa base">
          {(['USD', 'ARS', 'EUR'] as CurrencyCode[]).map((c) => (
            <button
              key={c}
              type="button"
              className={`seg-btn mono ${currency === c ? 'active' : ''}`}
              onClick={() => setCurrency(c)}
              style={{ padding: '4px 7px', fontSize: 11 }}
            >
              {c}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openAddModal('trade')}
          style={{ padding: '5px 10px', fontSize: 11.5 }}
        >
          <Plus size={13} /> Operación
        </button>

        <button
          type="button"
          className="btn"
          onClick={() => refreshAll()}
          title="Actualizar cotizaciones en vivo"
          style={{ padding: '5px 8px' }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
        </button>

        <button
          type="button"
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