import React, { useEffect } from 'react';
import { useAppStore } from './store';
import { useIsMobile } from './hooks/useIsMobile';
import { TopBar } from './components/layout/TopBar';
import { MobileHeader } from './components/layout/MobileHeader';
import { MobileNav } from './components/layout/MobileNav';
import { SearchModal } from './components/layout/SearchModal';
import { LeftPanel } from './components/left/LeftPanel';
import { AddDialog } from './components/left/AddDialog';
import { MarketView } from './components/market/MarketView';
import { PortfolioView } from './components/portfolio/PortfolioView';
import { AssetView } from './components/asset/AssetView';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ArrowLeft } from 'lucide-react';

export const App: React.FC = () => {
  const {
    rightState,
    mobileTab,
    setMobileTab,
    selectedSymbol,
    refreshAll,
    pricingMode,
  } = useAppStore();
  const isMobile = useIsMobile(1023);

  useEffect(() => {
    refreshAll();
  }, []);

  // Poll live quotes every 15 seconds when in live mode
  useEffect(() => {
    if (pricingMode !== 'live') return;
    const id = setInterval(() => {
      refreshAll(true);
    }, 15000);
    return () => clearInterval(id);
  }, [pricingMode, refreshAll]);

  if (isMobile) {
    return (
      <div className="app-shell is-mobile">
        <MobileHeader />
        <div className="workspace-grid">
          {mobileTab === 'holdings' ? (
            <LeftPanel />
          ) : (
            <main className="right-panel" aria-label="Panel Dinámico Multi-Estado">
              <div className="mobile-back-bar">
                <button
                  type="button"
                  className="btn mobile-back-btn"
                  onClick={() => setMobileTab('holdings')}
                >
                  <ArrowLeft size={14} />
                  <span>← Volver a Cartera (Posiciones)</span>
                </button>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {rightState === 'market'
                    ? 'Mercado Global'
                    : rightState === 'portfolio'
                    ? 'Portafolio Financiero'
                    : selectedSymbol}
                </span>
              </div>
              <ErrorBoundary resetKey={rightState + ':' + (selectedSymbol || '')}>
                {rightState === 'market' && <MarketView />}
                {rightState === 'portfolio' && <PortfolioView />}
                {rightState === 'asset' && <AssetView />}
              </ErrorBoundary>
            </main>
          )}
        </div>
        <MobileNav />
        <SearchModal />
        <AddDialog />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace-grid">
        <LeftPanel />
        <main className="right-panel" aria-label="Panel Dinámico Multi-Estado">
          <ErrorBoundary resetKey={rightState + ':' + (selectedSymbol || '')}>
            {rightState === 'market' && <MarketView />}
            {rightState === 'portfolio' && <PortfolioView />}
            {rightState === 'asset' && <AssetView />}
          </ErrorBoundary>
        </main>
      </div>
      <SearchModal />
      <AddDialog />
    </div>
  );
};
