import React, { useEffect } from 'react';
import { useAppStore } from './store';
import { assetBackLabel } from './backNavigation';
import { useIsMobile } from './hooks/useIsMobile';
import { TopBar } from './components/layout/TopBar';
import { MobileHeader } from './components/layout/MobileHeader';
import { MobileNav } from './components/layout/MobileNav';
import { SearchModal } from './components/layout/SearchModal';
import { LeftPanel } from './components/left/LeftPanel';
import { AddDialog } from './components/left/AddDialog';
import { HoldingActionMenu } from './components/left/HoldingActionMenu';
import { MarketView } from './components/market/MarketView';
import { PortfolioView } from './components/portfolio/PortfolioView';
import { AssetView } from './components/asset/AssetView';
import { WatchlistView } from './components/asset/WatchlistView';
import { OptimizerView } from './components/optimizer/OptimizerView';
import { useWatchlistAlerts } from './hooks/useWatchlistAlerts';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ArrowLeft } from 'lucide-react';

export const App: React.FC = () => {
  const {
    rightState,
    mobileTab,
    setMobileTab,
    assetOrigin,
    lastMainView,
    goBackFromAsset,
    selectedSymbol,
    refreshAll,
    pricingMode,
  } = useAppStore();
  const isMobile = useIsMobile(1023);

  // En la ficha de un activo, la barra «Volver» regresa a la vista
  // previa a la cadena de activos, con la misma lógica y la misma
  // etiqueta que el botón de la ficha (backNavigation, v12); en el
  // resto de las vistas, a la lista de posiciones.
  const assetBackText = assetBackLabel(assetOrigin, lastMainView, true);
  const onMobileBack = () => {
    if (rightState === 'asset') {
      goBackFromAsset(true);
    } else {
      setMobileTab('holdings');
    }
  };

  useEffect(() => {
    refreshAll();
    void useAppStore.getState().hydrateNwSettings();
  }, []);

  // Alertas de precio de la watchlist (SPEC-006 v11): evaluación
  // global cada 15 s con la app abierta.
  useWatchlistAlerts();

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
                  onClick={onMobileBack}
                >
                  <ArrowLeft size={14} />
                  <span>{rightState === 'asset' ? assetBackText : 'Volver a Cartera (Posiciones)'}</span>
                </button>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {rightState === 'market'
                    ? 'Mercado Global'
                    : rightState === 'portfolio'
                    ? 'Portafolio Financiero'
                    : rightState === 'optimizer'
                    ? 'Optimizador de cartera'
                    : rightState === 'watchlist'
                    ? 'Watchlist'
                    : selectedSymbol}
                </span>
              </div>
              <ErrorBoundary resetKey={rightState + ':' + (selectedSymbol || '')}>
                {rightState === 'market' && <MarketView />}
                {rightState === 'portfolio' && <PortfolioView />}
                {rightState === 'asset' && <AssetView />}
                {rightState === 'watchlist' && <WatchlistView isMobile={true} />}
                {rightState === 'optimizer' && <OptimizerView />}
              </ErrorBoundary>
            </main>
          )}
        </div>
        <MobileNav />
        <SearchModal />
        <AddDialog />
        <HoldingActionMenu />
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
            {rightState === 'watchlist' && <WatchlistView isMobile={false} />}
            {rightState === 'optimizer' && <OptimizerView />}
          </ErrorBoundary>
        </main>
      </div>
      <SearchModal />
      <AddDialog />
      <HoldingActionMenu />
    </div>
  );
};
