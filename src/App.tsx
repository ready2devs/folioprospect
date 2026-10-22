import React, { useEffect } from 'react';
import { useAppStore } from './store';
import { TopBar } from './components/layout/TopBar';
import { SearchModal } from './components/layout/SearchModal';
import { LeftPanel } from './components/left/LeftPanel';
import { AddDialog } from './components/left/AddDialog';
import { MarketView } from './components/market/MarketView';
import { PortfolioView } from './components/portfolio/PortfolioView';
import { AssetView } from './components/asset/AssetView';

export const App: React.FC = () => {
  const { rightState, refreshAll, pricingMode } = useAppStore();

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

  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace-grid">
        <LeftPanel />
        <main className="right-panel" aria-label="Panel Dinámico Multi-Estado">
          {rightState === 'market' && <MarketView />}
          {rightState === 'portfolio' && <PortfolioView />}
          {rightState === 'asset' && <AssetView />}
        </main>
      </div>
      <SearchModal />
      <AddDialog />
    </div>
  );
};
