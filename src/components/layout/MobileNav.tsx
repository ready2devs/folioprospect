import React from 'react';
import { useAppStore } from '@/store';
import { Wallet, Globe, Briefcase, LineChart, Plus } from 'lucide-react';

export const MobileNav: React.FC = () => {
  const {
    mobileTab,
    setMobileTab,
    rightState,
    setRightState,
    openAddModal,
  } = useAppStore();

  const isHoldings = mobileTab === 'holdings';
  const isMarket = mobileTab === 'right' && rightState === 'market';
  const isPortfolio = mobileTab === 'right' && rightState === 'portfolio';
  const isAsset = mobileTab === 'right' && rightState === 'asset';

  return (
    <nav className="mobile-nav" aria-label="Navegación Principal Móvil">
      <button
        type="button"
        className={'mobile-nav-btn ' + (isHoldings ? 'active' : '')}
        onClick={() => setMobileTab('holdings')}
      >
        <Wallet size={18} />
        <span>Cartera</span>
      </button>

      <button
        type="button"
        className={'mobile-nav-btn ' + (isMarket ? 'active' : '')}
        onClick={() => {
          setRightState('market');
          setMobileTab('right');
        }}
      >
        <Globe size={18} />
        <span>Mercado</span>
      </button>

      <button
        type="button"
        className={'mobile-nav-btn ' + (isPortfolio ? 'active' : '')}
        onClick={() => {
          setRightState('portfolio');
          setMobileTab('right');
        }}
      >
        <Briefcase size={18} />
        <span>Portafolio</span>
      </button>

      <button
        type="button"
        className={'mobile-nav-btn ' + (isAsset ? 'active' : '')}
        onClick={() => {
          setRightState('asset');
          setMobileTab('right');
        }}
      >
        <LineChart size={18} />
        <span>Activo</span>
      </button>

      <button
        type="button"
        className="mobile-nav-btn mobile-nav-btn-action"
        onClick={() => openAddModal('trade')}
      >
        <div className="mobile-nav-plus-pill">
          <Plus size={16} />
        </div>
        <span>+Operar</span>
      </button>
    </nav>
  );
};
