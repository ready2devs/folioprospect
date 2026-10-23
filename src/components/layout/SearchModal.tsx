import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { api } from '@/api';
import { searchLocalCatalog, normalizeTradingViewSymbol } from '@shared/engine/symbolCatalog';
import type { AssetMeta } from '@shared/engine/types';
import { formatNumber } from '@shared/engine/format';
import { Search, X, ArrowUpRight, Plus } from 'lucide-react';

type SearchCategory = 'ALL' | 'Stock' | 'Crypto' | 'ETF' | 'Dr' | 'PORTFOLIO';

export const SearchModal: React.FC = () => {
  const { searchOpen, setSearchOpen, selectAsset, evaluation, openAddModal } = useAppStore();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('ALL');
  const [remoteResults, setRemoteResults] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const { portfolioMeta, openSymbolsSet } = useMemo(() => {
    const meta: Record<string, AssetMeta> = {};
    const openSet = new Set<string>();
    for (const h of evaluation?.holdings || []) {
      openSet.add(h.symbol);
      meta[h.symbol] = {
        symbol: h.symbol,
        ticker: h.ticker,
        exchange: h.exchange,
        yahoo: h.ticker,
        name: h.name,
        sector: h.sector,
        industry: '',
        country: 'United States',
        assetType: h.assetType,
        currency: 'USD',
      };
    }
    return { portfolioMeta: meta, openSymbolsSet: openSet };
  }, [evaluation?.holdings]);

  const localMatches = useMemo(() => {
    return searchLocalCatalog(query, portfolioMeta, openSymbolsSet, category, 30);
  }, [query, portfolioMeta, openSymbolsSet, category]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen, setSearchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    setActiveIdx(0);
    if (query.trim().length < 2) {
      setRemoteResults([]);
      return;
    }
    let active = true;
    api
      .search(query)
      .then((res) => {
        if (active && Array.isArray(res)) setRemoteResults(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [query, searchOpen]);

  const mergedResults = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of localMatches) {
      seen.add(item.symbol);
      out.push(item);
    }
    for (const rem of remoteResults) {
      const sym = normalizeTradingViewSymbol(rem.symbol || rem.ticker || '');
      if (!seen.has(sym)) {
        if (category === 'PORTFOLIO' && !openSymbolsSet.has(sym)) continue;
        if (category !== 'ALL' && category !== 'PORTFOLIO' && rem.type !== category) continue;
        seen.add(sym);
        out.push({
          ...rem,
          symbol: sym,
          inPortfolio: openSymbolsSet.has(sym),
        });
      }
    }
    return out.slice(0, 30);
  }, [localMatches, remoteResults, category, openSymbolsSet]);

  if (!searchOpen) return null;

  const categories: [SearchCategory, string][] = [
    ['ALL', 'Todos'],
    ['Stock', 'Acciones'],
    ['Crypto', 'Cripto'],
    ['Dr', 'ADRs / CEDEAR'],
    ['ETF', 'ETFs'],
    ['PORTFOLIO', 'En Cartera'],
  ];

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(mergedResults.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && mergedResults[activeIdx]) {
      e.preventDefault();
      selectAsset(mergedResults[activeIdx].symbol);
      setSearchOpen(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setSearchOpen(false)}>
      <div
        className="modal-card search-modal-card"
        style={{ width: 'min(660px, 100%)', padding: 0, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <Search size={16} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            className="input"
            style={{
              border: 'none',
              flex: 1,
              background: 'transparent',
              fontSize: 16,
              minWidth: 0,
            }}
            placeholder="Buscar ticker, empresa o mercado (ej. SOL, NVDA, YPF, SPY, BINANCE:BTCUSDT)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDownInput}
          />
          {query && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => setQuery('')}
            >
              Limpiar
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setSearchOpen(false)}>
            <X size={15} />
          </button>
        </div>

        {/* Pestañas de Categoría estilo TradingView */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto',
            background: 'var(--bg-elevated)',
          }}
        >
          {categories.map(([catKey, catLabel]) => (
            <button
              key={catKey}
              type="button"
              className={`seg-btn ${category === catKey ? 'active' : ''}`}
              style={{
                padding: '4px 10px',
                fontSize: 11.5,
                borderRadius: 999,
                whiteSpace: 'nowrap',
              }}
              onClick={() => {
                setCategory(catKey);
                setActiveIdx(0);
              }}
            >
              {catLabel}
            </button>
          ))}
        </div>

        <div style={{ maxHeight: '62dvh', overflowY: 'auto', padding: '6px 0' }}>
          {mergedResults.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No se encontraron símbolos para "{query}". Puedes cargarlo directamente como{' '}
              <strong className="mono">{normalizeTradingViewSymbol(query)}</strong>.
            </div>
          ) : (
            mergedResults.map((item, idx) => (
              <div
                key={item.symbol}
                onClick={() => {
                  selectAsset(item.symbol);
                  setSearchOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: idx === activeIdx ? 'var(--bg-hover)' : 'transparent',
                }}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div className="ticker-avatar">{(item.ticker || 'A').slice(0, 1)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {item.ticker}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: 'var(--bg-elevated)',
                          color: 'var(--accent-cyan)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {item.exchange}
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                        {item.type}
                      </span>
                      {item.inPortfolio && (
                        <span className="brand-badge" style={{ fontSize: 9.5 }}>
                          EN CARTERA
                        </span>
                      )}
                      {item.refPrice != null && (
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          ~${formatNumber(item.refPrice, item.refPrice >= 1 ? 2 : 4)}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name} — {item.sector}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: 11 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSearchOpen(false);
                      openAddModal('trade', 'ledger', item.symbol);
                    }}
                    title={`Cargar compra o venta de ${item.symbol}`}
                  >
                    <Plus size={12} /> Operar
                  </button>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: 'var(--accent-cyan)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    Fair Value <ArrowUpRight size={13} />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
