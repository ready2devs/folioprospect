import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { api } from '@/api';
import { Search, X, ArrowUpRight } from 'lucide-react';

export const SearchModal: React.FC = () => {
  const { searchOpen, setSearchOpen, selectAsset } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

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
    let active = true;
    api.search(query).then((res) => {
      if (active) setResults(res);
    });
    return () => {
      active = false;
    };
  }, [query, searchOpen]);

  if (!searchOpen) return null;

  return (
    <div className="modal-backdrop" onClick={() => setSearchOpen(false)}>
      <div
        className="modal-card"
        style={{ width: 620, padding: 0, overflow: 'hidden' }}
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
          <Search size={16} color="var(--accent-cyan)" />
          <input
            autoFocus
            className="input"
            style={{ border: 'none', flex: 1, background: 'transparent', fontSize: 14 }}
            placeholder="Escribe un ticker o empresa (ej. NVDA, MELI, TSM, MSFT, BTC, AAPL, VIST)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn btn-ghost" onClick={() => setSearchOpen(false)}>
            <X size={15} />
          </button>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 0' }}>
          {results.map((item) => (
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
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="ticker-avatar">{item.ticker.slice(0, 1)}</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontWeight: 700 }}>
                      {item.ticker}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {item.exchange} · {item.type}
                    </span>
                    {item.inPortfolio && (
                      <span className="brand-badge" style={{ fontSize: 9.5 }}>
                        EN CARTERA
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {item.name} — {item.sector}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11.5,
                  color: 'var(--accent-cyan)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Analizar Fair Value <ArrowUpRight size={13} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
