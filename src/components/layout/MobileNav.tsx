import React from 'react';
import { useAppStore } from '@/store';
import { Wallet, Globe, Briefcase, LineChart, Sparkles } from 'lucide-react';

export const MobileNav: React.FC = () => {
  const {
    mobileTab,
    setMobileTab,
    rightState,
    setRightState,
  } = useAppStore();

  const isHoldings = mobileTab === 'holdings';
  const isMarket = mobileTab === 'right' && rightState === 'market';
  const isPortfolio = mobileTab === 'right' && rightState === 'portfolio';
  const isAsset = mobileTab === 'right' && rightState === 'asset';
  const isOptimizer = mobileTab === 'right' && rightState === 'optimizer';

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
        className={'mobile-nav-btn ' + (isOptimizer ? 'active' : '')}
        onClick={() => {
          setRightState('optimizer');
          setMobileTab('right');
        }}
      >
        <div className="mobile-nav-plus-pill">
          <Sparkles size={16} />
        </div>
        <span>Optimizer</span>
      </button>
    </nav>
  );
};
