import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, type CashModalTarget } from '@/store';
import { api } from '@/api';
import { formatNumber } from '@shared/engine/format';
import {
  searchLocalCatalog,
  normalizeTradingViewSymbol,
  findCatalogEntry,
  type CatalogSymbolEntry,
} from '@shared/engine/symbolCatalog';
import type { AssetMeta } from '@shared/engine/types';
import {
  X,
  Plus,
  Upload,
  RotateCcw,
  Wallet,
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
  FileUp,
  CheckCircle2,
} from 'lucide-react';

type SymbolCategory = 'ALL' | 'Stock' | 'Crypto' | 'ETF' | 'Dr' | 'PORTFOLIO';

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const WEEKDAYS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function isoToDisplayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseFlexibleDateToIso(raw: string): string | null {
  const clean = raw.trim();
  const isoMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(clean);
  if (isoMatch) {
    const yyyy = Number(isoMatch[1]);
    const mm = Number(isoMatch[2]);
    const dd = Number(isoMatch[3]);
    if (yyyy >= 1990 && yyyy <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(clean);
  if (dmyMatch) {
    const dd = Number(dmyMatch[1]);
    const mm = Number(dmyMatch[2]);
    const yyyy = Number(dmyMatch[3]);
    if (yyyy >= 1990 && yyyy <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  return null;
}

function formatNumericDateInput(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-/.test(trimmed)) return trimmed.slice(0, 10);
  const digits = trimmed.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
}

interface HybridDatePickerProps {
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
}

const HybridDatePicker: React.FC<HybridDatePickerProps> = ({
  label,
  valueIso,
  onChangeIso,
}) => {
  const [textVal, setTextVal] = useState(() => isoToDisplayDate(valueIso));
  const [pickerOpen, setPickerOpen] = useState(false);
  const nativeDateRef = useRef<HTMLInputElement>(null);

  const parsedYearMonth = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valueIso);
    if (m) {
      return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, [valueIso]);

  const [viewYear, setViewYear] = useState(parsedYearMonth.year);
  const [viewMonth, setViewMonth] = useState(parsedYearMonth.month);

  useEffect(() => {
    setTextVal(isoToDisplayDate(valueIso));
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valueIso);
    if (m) {
      setViewYear(Number(m[1]));
      setViewMonth(Number(m[2]) - 1);
    }
  }, [valueIso]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = raw.includes('-') ? raw : formatNumericDateInput(raw);
    setTextVal(formatted);
    const parsed = parseFlexibleDateToIso(formatted);
    if (parsed) {
      onChangeIso(parsed);
    }
  };

  const handleTextBlur = () => {
    const parsed = parseFlexibleDateToIso(textVal);
    if (parsed) {
      onChangeIso(parsed);
      setTextVal(isoToDisplayDate(parsed));
    } else {
      setTextVal(isoToDisplayDate(valueIso));
    }
  };

  const applyShortcutDaysAgo = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const iso = d.toISOString().slice(0, 10);
    onChangeIso(iso);
    setTextVal(isoToDisplayDate(iso));
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const years: number[] = [];
  for (let y = 2015; y <= 2027; y++) years.push(y);

  return (
    <div className="form-field tv-datepicker-field" style={{ position: 'relative' }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          inputMode="numeric"
          className="input mono"
          placeholder="DD/MM/AAAA o AAAA-MM-DD"
          value={textVal}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className={`btn ${pickerOpen ? 'btn-primary' : ''}`}
          onClick={() => setPickerOpen((v) => !v)}
          title="Abrir calendario interactivo (Móvil / PC)"
          style={{ padding: '7px 10px', flexShrink: 0 }}
        >
          <Calendar size={14} />
        </button>
        <input
          ref={nativeDateRef}
          type="date"
          value={valueIso}
          onChange={(e) => {
            if (e.target.value) {
              onChangeIso(e.target.value);
              setTextVal(isoToDisplayDate(e.target.value));
            }
          }}
          style={{
            position: 'absolute',
            opacity: 0,
            pointerEvents: 'none',
            width: 0,
            height: 0,
          }}
          tabIndex={-1}
        />
      </div>

      {/* Atajos táctiles rápidos */}
      <div className="tv-date-shortcuts">
        {(
          [
            ['Hoy', 0],
            ['Ayer', 1],
            ['Hace 1 sem', 7],
            ['Hace 1 mes', 30],
            ['Hace 1 año', 365],
          ] as [string, number][]
        ).map(([lbl, days]) => (
          <button
            key={lbl}
            type="button"
            className="tv-date-chip"
            onPointerDown={(e) => {
              e.preventDefault();
              applyShortcutDaysAgo(days);
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* Mini Date-Picker Custom Desplegable */}
      {pickerOpen && (
        <div className="tv-calendar-popover" onClick={(e) => e.stopPropagation()}>
          <div className="tv-calendar-header">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '3px 6px' }}
              onClick={() => {
                if (viewMonth === 0) {
                  setViewMonth(11);
                  setViewYear((y) => Math.max(2015, y - 1));
                } else {
                  setViewMonth((m) => m - 1);
                }
              }}
            >
              <ChevronLeft size={14} />
            </button>

            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select
                className="input"
                style={{ padding: '3px 6px', fontSize: 12, fontWeight: 700 }}
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
              >
                {MONTH_NAMES_ES.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>

              <select
                className="input mono"
                style={{ padding: '3px 6px', fontSize: 12, fontWeight: 700 }}
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '3px 6px' }}
              onClick={() => {
                if (viewMonth === 11) {
                  setViewMonth(0);
                  setViewYear((y) => Math.min(2027, y + 1));
                } else {
                  setViewMonth((m) => m + 1);
                }
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="tv-calendar-grid-weekdays">
            {WEEKDAYS_ES.map((w) => (
              <div key={w} className="tv-calendar-wd">
                {w}
              </div>
            ))}
          </div>

          <div className="tv-calendar-grid-days">
            {cells.map((dayNum, idx) => {
              if (!dayNum) {
                return <div key={`empty_${idx}`} className="tv-calendar-day empty" />;
              }
              const cellIso = `${String(viewYear).padStart(4, '0')}-${String(viewMonth + 1).padStart(
                2,
                '0'
              )}-${String(dayNum).padStart(2, '0')}`;
              const isSelected = cellIso === valueIso;
              return (
                <button
                  key={cellIso}
                  type="button"
                  className={`tv-calendar-day mono ${isSelected ? 'selected' : ''}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onChangeIso(cellIso);
                    setTextVal(isoToDisplayDate(cellIso));
                    setPickerOpen(false);
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
              paddingTop: 6,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => {
                try {
                  if (nativeDateRef.current && 'showPicker' in nativeDateRef.current) {
                    (nativeDateRef.current as any).showPicker();
                  }
                } catch {}
              }}
            >
              Selector nativo SO
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '3px 10px' }}
              onClick={() => setPickerOpen(false)}
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface SymbolAutocompleteInputProps {
  label: string;
  value: string;
  onChange: (sym: string, entry?: CatalogSymbolEntry & { inPortfolio?: boolean }) => void;
  portfolioMeta: Record<string, AssetMeta>;
  openSymbolsSet: Set<string>;
}

const SymbolAutocompleteInput: React.FC<SymbolAutocompleteInputProps> = ({
  label,
  value,
  onChange,
  portfolioMeta,
  openSymbolsSet,
}) => {
  const [open, setOpen] = useState(false);
  const [catFilter, setCatFilter] = useState<SymbolCategory>('ALL');
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => {
    return searchLocalCatalog(value, portfolioMeta, openSymbolsSet, catFilter, 25);
  }, [value, portfolioMeta, openSymbolsSet, catFilter]);

  const normalizedPreview = useMemo(() => normalizeTradingViewSymbol(value), [value]);

  const handleSelect = (item: CatalogSymbolEntry & { inPortfolio?: boolean }) => {
    onChange(item.symbol, item);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open && matches[activeIndex]) {
      e.preventDefault();
      handleSelect(matches[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="form-field tv-symbol-autocomplete" style={{ position: 'relative' }}>
      <label>{label}</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search
          size={14}
          color="var(--accent-cyan)"
          style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
        />
        <input
          className="input mono"
          style={{ paddingLeft: 30, width: '100%' }}
          value={value}
          placeholder="Ej. SOL, NVDA, NYSE:TSM, YPF, SPY, BINANCE:BTCUSDT..."
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 180);
            if (value.trim()) {
              const norm = normalizeTradingViewSymbol(value);
              const entry = findCatalogEntry(norm);
              if (norm !== value) {
                onChange(norm, entry);
              }
            }
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          required
        />
        {value && value.toUpperCase() !== normalizedPreview && (
          <span
            className="mono"
            style={{
              position: 'absolute',
              right: 8,
              fontSize: 10,
              padding: '2px 5px',
              borderRadius: 4,
              background: 'rgba(56, 189, 248, 0.14)',
              color: 'var(--accent-cyan)',
              pointerEvents: 'none',
            }}
          >
            → {normalizedPreview}
          </span>
        )}
      </div>

      {open && (
        <div
          className="tv-autocomplete-dropdown"
          onPointerDown={(e) => {
            // Avoid input blur when interacting with category filters or scrollbar
            e.preventDefault();
          }}
        >
          <div className="tv-autocomplete-cats">
            {(
              [
                ['ALL', 'Todos'],
                ['Stock', 'Acciones'],
                ['Crypto', 'Cripto'],
                ['ETF', 'ETF'],
                ['PORTFOLIO', 'En Cartera'],
              ] as [SymbolCategory, string][]
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                className={`tv-cat-pill ${catFilter === k ? 'active' : ''}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setCatFilter(k);
                  setActiveIndex(0);
                }}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="tv-autocomplete-list">
            {matches.length === 0 ? (
              <div
                className="tv-autocomplete-item"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const norm = normalizeTradingViewSymbol(value);
                  onChange(norm, findCatalogEntry(norm));
                  setOpen(false);
                }}
              >
                <div>
                  <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    Usar "{normalizeTradingViewSymbol(value)}"
                  </span>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Símbolo personalizado normalizado (TradingView format)
                  </div>
                </div>
              </div>
            ) : (
              matches.map((item, idx) => (
                <div
                  key={item.symbol}
                  className={`tv-autocomplete-item ${idx === activeIndex ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleSelect(item);
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontWeight: 700, fontSize: 12.5 }}>
                        {item.ticker}
                      </span>
                      <span className="tv-badge-exchange mono">{item.exchange}</span>
                      <span className="tv-badge-type">{item.type}</span>
                      {item.inPortfolio && (
                        <span className="brand-badge" style={{ fontSize: 9 }}>
                          EN CARTERA
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name} · {item.sector}
                    </div>
                  </div>
                  {item.refPrice != null && (
                    <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                      ${formatNumber(item.refPrice, item.refPrice >= 1 ? 2 : 4)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AddDialog: React.FC = () => {
  const {
    addModalOpen,
    addModalTab,
    cashModalTarget,
    addModalSymbol,
    setCashModalTarget,
    openAddModal,
    closeAddModal,
    evaluation,
    assetDetail,
    nwSettings,
    setNwSettings,
    refreshAll,
  } = useAppStore();

  const portfolioId = evaluation?.portfolio.id || '2bb80f7315764422a5347e8d38503f4e';

  const { portfolioMeta, openSymbolsSet, livePricesBySymbol } = useMemo(() => {
    const meta: Record<string, AssetMeta> = {};
    const openSet = new Set<string>();
    const pxMap: Record<string, number> = {};
    for (const h of evaluation?.holdings || []) {
      openSet.add(h.symbol);
      pxMap[h.symbol] = h.lastPrice;
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
    if (assetDetail?.symbol && assetDetail?.quote?.price) {
      pxMap[assetDetail.symbol] = assetDetail.quote.price;
    }
    return { portfolioMeta: meta, openSymbolsSet: openSet, livePricesBySymbol: pxMap };
  }, [evaluation?.holdings, assetDetail]);

  const todayIso = () => new Date().toISOString().slice(0, 10);

  // Trade state
  const [symbol, setSymbol] = useState('NASDAQ:NVDA');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState('5');
  const [price, setPrice] = useState('201.68');
  const [priceManuallyEdited, setPriceManuallyEdited] = useState(false);
  const [commission, setCommission] = useState('0');
  const [dateStr, setDateStr] = useState(todayIso);
  const [comment, setComment] = useState('');

  // Cash state (supports Reserve USD, Broker Cash USD, and TV Ledger movement)
  const [cashActionMode, setCashActionMode] = useState<'set' | 'add' | 'subtract'>('set');
  const [cashType, setCashType] = useState<'deposit' | 'withdrawal' | 'income'>('deposit');
  const [cashAmount, setCashAmount] = useState('10000');
  const [cashDateStr, setCashDateStr] = useState(todayIso);
  const [cashComment, setCashComment] = useState('Aporte de liquidez');

  // Illiquid state
  const [illName, setIllName] = useState('Departamento / Bono Privado');
  const [illCategory, setIllCategory] = useState<
    'Real estate' | 'Private fund' | 'Fixed deposit' | 'Bond'
  >('Real estate');
  const [illCost, setIllCost] = useState('45000');
  const [illValue, setIllValue] = useState('52000');
  const [illYield, setIllYield] = useState('8.5');

  // Dividend state
  const [divSymbol, setDivSymbol] = useState('NASDAQ:MSFT');
  const [divAmount, setDivAmount] = useState('125.50');
  const [divDateStr, setDivDateStr] = useState(todayIso);

  // CSV state
  const [csvText, setCsvText] = useState(
    'Symbol,Side,Qty,Fill Price,Commission,Closing Time\nNASDAQ:NVDA,Buy,10,185.50,0,2026-09-15'
  );
  const [statusMsg, setStatusMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill symbol and suggested price when opening from AssetView or SearchModal
  useEffect(() => {
    if (!addModalOpen) return;
    setStatusMsg('');
    if (addModalSymbol) {
      const norm = normalizeTradingViewSymbol(addModalSymbol);
      setSymbol(norm);
      setDivSymbol(norm);
      const suggested =
        livePricesBySymbol[norm] ?? findCatalogEntry(norm)?.refPrice;
      if (suggested != null) {
        setPrice(String(suggested));
        setPriceManuallyEdited(false);
      }
    }
  }, [addModalOpen, addModalSymbol]);

  useEffect(() => {
    if (!addModalOpen || addModalTab !== 'cash') return;
    if (cashModalTarget === 'reserveUsd') {
      setCashAmount(String(nwSettings.cashReserveUsd || 0));
      setCashActionMode('set');
    } else if (cashModalTarget === 'brokerCash') {
      setCashAmount(String(nwSettings.brokerCashUsd || 0));
      setCashActionMode('set');
    }
  }, [addModalOpen, addModalTab, cashModalTarget]);

  if (!addModalOpen) return null;

  const suggestedMarketPrice = (() => {
    const norm = normalizeTradingViewSymbol(symbol);
    return livePricesBySymbol[norm] ?? findCatalogEntry(norm)?.refPrice;
  })();

  const handleSymbolChange = (
    nextSym: string,
    entry?: CatalogSymbolEntry & { inPortfolio?: boolean }
  ) => {
    setSymbol(nextSym);
    const norm = normalizeTradingViewSymbol(nextSym);
    const refPx = livePricesBySymbol[norm] ?? entry?.refPrice ?? findCatalogEntry(norm)?.refPrice;
    if (refPx != null && (!priceManuallyEdited || entry != null)) {
      setPrice(String(refPx));
      if (entry != null) setPriceManuallyEdited(false);
    }
  };

  const handleAddTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const normSymbol = normalizeTradingViewSymbol(symbol);
    const parsedTime = Date.parse(dateStr + 'T14:30:00Z') || Date.now();
    await api.addTrade(portfolioId, {
      symbol: normSymbol,
      isBuy: side === 'BUY',
      qty: Number(qty),
      price: Number(price),
      commission: Number(commission),
      time: parsedTime,
      comment,
    });
    await refreshAll();
    closeAddModal();
  };

  const handleAddCash = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(cashAmount) || 0;

    if (cashModalTarget === 'reserveUsd') {
      const current = nwSettings.cashReserveUsd || 0;
      const next =
        cashActionMode === 'set'
          ? val
          : cashActionMode === 'add'
          ? current + val
          : Math.max(0, current - val);
      setNwSettings({ cashReserveUsd: next });
      closeAddModal();
      return;
    }

    if (cashModalTarget === 'brokerCash') {
      const current = nwSettings.brokerCashUsd || 0;
      const next =
        cashActionMode === 'set'
          ? val
          : cashActionMode === 'add'
          ? current + val
          : Math.max(0, current - val);
      setNwSettings({ brokerCashUsd: next });
      closeAddModal();
      return;
    }

    const parsedTime = Date.parse(cashDateStr + 'T14:30:00Z') || Date.now();
    await api.addCash(portfolioId, {
      type: cashType,
      amount: val,
      time: parsedTime,
      comment: cashComment,
    });
    await refreshAll();
    closeAddModal();
  };

  const handleAddIlliquid = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.addIlliquid(portfolioId, {
      name: illName,
      category: illCategory,
      costBasis: Number(illCost),
      currentValue: Number(illValue),
      annualYieldPct: Number(illYield),
    });
    await refreshAll();
    closeAddModal();
  };

  const handleAddDividend = async (e: React.FormEvent) => {
    e.preventDefault();
    const normDivSymbol = normalizeTradingViewSymbol(divSymbol);
    const parsedTime = Date.parse(divDateStr + 'T14:30:00Z') || Date.now();
    await api.addDividend(portfolioId, {
      symbol: normDivSymbol,
      amount: Number(divAmount),
      time: parsedTime,
    });
    await refreshAll();
    closeAddModal();
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
        setStatusMsg(`Archivo "${file.name}" cargado (${reader.result.split(/\r?\n/).filter(Boolean).length} líneas).`);
      }
    };
    reader.readAsText(file);
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.importCsv(portfolioId, csvText);
    setStatusMsg(`Se importaron ${res.imported || 0} transacciones normalizadas. Total: ${res.totalTrades}`);
    await refreshAll();
  };

  const handleResetSeed = async () => {
    await api.resetSeed(portfolioId);
    await refreshAll();
    closeAddModal();
  };

  return (
    <div className="modal-backdrop" onClick={closeAddModal}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
            gap: 8,
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>
            Operar / Ajustar Patrimonio y Portafolio Financiero
          </h3>
          <button className="btn btn-ghost" onClick={closeAddModal}>
            <X size={16} />
          </button>
        </div>

        <div
          className="seg-group"
          style={{
            marginBottom: 16,
            width: '100%',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          {(
            [
              ['trade', 'Operación'],
              ['cash', 'Efectivo (+Cash)'],
              ['illiquid', 'No Líquido'],
              ['dividend', 'Dividendo'],
              ['csv', 'Importar CSV'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`seg-btn ${addModalTab === k ? 'active' : ''}`}
              style={{ flex: '1 1 auto' }}
              onClick={() => openAddModal(k, cashModalTarget, symbol)}
            >
              {label}
            </button>
          ))}
        </div>

        {addModalTab === 'trade' && (
          <form onSubmit={handleAddTrade}>
            <div className="form-row">
              <SymbolAutocompleteInput
                label="Símbolo (Autocompletado estilo TradingView)"
                value={symbol}
                onChange={handleSymbolChange}
                portfolioMeta={portfolioMeta}
                openSymbolsSet={openSymbolsSet}
              />
              <div className="form-field">
                <label>Tipo de Operación</label>
                <select
                  className="input"
                  value={side}
                  onChange={(e) => setSide(e.target.value as 'BUY' | 'SELL')}
                >
                  <option value="BUY">COMPRA (BUY)</option>
                  <option value="SELL">VENTA (SELL)</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Cantidad (Qty)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>Precio de Ejecución (USD)</label>
                  {suggestedMarketPrice != null && (
                    <button
                      type="button"
                      className="tv-price-suggest-btn mono"
                      onClick={() => {
                        setPrice(String(suggestedMarketPrice));
                        setPriceManuallyEdited(false);
                      }}
                    >
                      Usar ref: ${formatNumber(suggestedMarketPrice, suggestedMarketPrice >= 1 ? 2 : 4)}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setPriceManuallyEdited(true);
                  }}
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Comisión (USD)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                />
              </div>
              <HybridDatePicker
                label="Fecha de Ejecución"
                valueIso={dateStr}
                onChangeIso={setDateStr}
              />
            </div>
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label>Nota / Comentario</label>
              <input
                className="input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <button type="button" className="btn" onClick={handleResetSeed}>
                <RotateCcw size={13} /> Restaurar Semilla TV (30 trades)
              </button>
              <button type="submit" className="btn btn-primary">
                <Plus size={14} /> Guardar Transacción
              </button>
            </div>
          </form>
        )}

        {addModalTab === 'cash' && (
          <form onSubmit={handleAddCash}>
            {/* Selector del destino del efectivo: Reserva USD, Cash Comitente o Ledger TV */}
            <div className="form-field" style={{ marginBottom: 12 }}>
              <label>Destino del Efectivo</label>
              <div
                className="seg-group"
                style={{ display: 'flex', flexWrap: 'wrap', width: '100%', gap: 2 }}
              >
                {(
                  [
                    ['reserveUsd', 'Reserva de Efectivo USD (NW Líquido)'],
                    ['brokerCash', 'Cash Comitente Líquido (USD)'],
                    ['ledger', 'Movimiento Ledger Portafolio TV'],
                  ] as [CashModalTarget, string][]
                ).map(([targetKey, targetLabel]) => (
                  <button
                    key={targetKey}
                    type="button"
                    className={`seg-btn ${cashModalTarget === targetKey ? 'active' : ''}`}
                    style={{ flex: '1 1 auto' }}
                    onClick={() => {
                      setCashModalTarget(targetKey);
                      if (targetKey === 'reserveUsd') {
                        setCashAmount(String(nwSettings.cashReserveUsd || 0));
                      } else if (targetKey === 'brokerCash') {
                        setCashAmount(String(nwSettings.brokerCashUsd || 0));
                      } else {
                        setCashAmount('10000');
                      }
                    }}
                  >
                    {targetLabel}
                  </button>
                ))}
              </div>
            </div>

            {cashModalTarget === 'ledger' ? (
              <>
                <div className="form-row">
                  <div className="form-field">
                    <label>Movimiento de Caja (Ledger TV)</label>
                    <select
                      className="input"
                      value={cashType}
                      onChange={(e) => setCashType(e.target.value as any)}
                    >
                      <option value="deposit">Depósito de Efectivo (+Cash)</option>
                      <option value="withdrawal">Retiro de Efectivo (-Cash)</option>
                      <option value="income">Ingreso de Liquidez / Intereses</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Monto en USD</label>
                    <input
                      type="number"
                      step="any"
                      className="input mono"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="form-row" style={{ marginBottom: 14 }}>
                  <HybridDatePicker
                    label="Fecha del Movimiento"
                    valueIso={cashDateStr}
                    onChangeIso={setCashDateStr}
                  />
                  <div className="form-field">
                    <label>Concepto</label>
                    <input
                      className="input"
                      value={cashComment}
                      onChange={(e) => setCashComment(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    padding: '8px 10px',
                    marginBottom: 12,
                    borderRadius: 8,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {cashModalTarget === 'reserveUsd' ? (
                    <span>
                      <strong>Reserva de Efectivo USD</strong> (fuera del broker): se suma
                      directamente al <strong>NW líquido</strong> sin alterar las métricas de
                      riesgo del Portafolio Financiero. Saldo actual:{' '}
                      <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                        ${formatNumber(nwSettings.cashReserveUsd || 0, 2)} USD
                      </strong>
                    </span>
                  ) : (
                    <span>
                      <strong>Cash Comitente Líquido (USD)</strong>: efectivo disponible en
                      la cuenta comitente del broker; forma parte del{' '}
                      <strong>Portafolio Financiero Líquido</strong> y del{' '}
                      <strong>NW líquido</strong>. Saldo actual:{' '}
                      <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                        ${formatNumber(nwSettings.brokerCashUsd || 0, 2)} USD
                      </strong>
                    </span>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>Acción sobre el saldo</label>
                    <select
                      className="input"
                      value={cashActionMode}
                      onChange={(e) => setCashActionMode(e.target.value as any)}
                    >
                      <option value="set">Fijar saldo total exacto (=)</option>
                      <option value="add">Sumar al saldo actual (+)</option>
                      <option value="subtract">Restar del saldo actual (-)</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Monto en USD</label>
                    <input
                      type="number"
                      step="any"
                      className="input mono"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                <Wallet size={14} />{' '}
                {cashModalTarget === 'reserveUsd'
                  ? 'Guardar Reserva de Efectivo USD'
                  : cashModalTarget === 'brokerCash'
                  ? 'Guardar Cash Comitente Líquido'
                  : 'Registrar Movimiento en Ledger'}
              </button>
            </div>
          </form>
        )}

        {addModalTab === 'illiquid' && (
          <form onSubmit={handleAddIlliquid}>
            <div className="form-row">
              <div className="form-field">
                <label>Nombre del Activo No Líquido (Fuera del Portafolio Financiero)</label>
                <input
                  className="input"
                  value={illName}
                  onChange={(e) => setIllName(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label>Categoría</label>
                <select
                  className="input"
                  value={illCategory}
                  onChange={(e) => setIllCategory(e.target.value as any)}
                >
                  <option value="Real estate">Inmueble (Real Estate)</option>
                  <option value="Private fund">Fondo Privado / Private Equity</option>
                  <option value="Fixed deposit">Plazo Fijo / Caución</option>
                  <option value="Bond">Bono / Obligación Negociable</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Costo Invertido (USD)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={illCost}
                  onChange={(e) => setIllCost(e.target.value)}
                  required
                />
              </div>
              <div className="form-field">
                <label>Valor Actual Estimado (USD)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={illValue}
                  onChange={(e) => setIllValue(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label>Rendimiento / Renta Anual Estimada (%)</label>
              <input
                type="number"
                step="any"
                className="input mono"
                value={illYield}
                onChange={(e) => setIllYield(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                <Plus size={14} /> Incorporar a Activos No Líquidos
              </button>
            </div>
          </form>
        )}

        {addModalTab === 'dividend' && (
          <form onSubmit={handleAddDividend}>
            <div className="form-row">
              <SymbolAutocompleteInput
                label="Símbolo Pagador del Dividendo"
                value={divSymbol}
                onChange={(sym) => setDivSymbol(sym)}
                portfolioMeta={portfolioMeta}
                openSymbolsSet={openSymbolsSet}
              />
              <div className="form-field">
                <label>Dividendo Neto Cobrado (USD)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={divAmount}
                  onChange={(e) => setDivAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 14 }}>
              <HybridDatePicker
                label="Fecha de Cobro / Acreditación"
                valueIso={divDateStr}
                onChangeIso={setDivDateStr}
              />
              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '6px 0' }}>
                  Se acredita en el efectivo del portafolio y en el retorno del activo{' '}
                  <strong className="mono">{normalizeTradingViewSymbol(divSymbol)}</strong>.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                <Plus size={14} /> Registrar Dividendo
              </button>
            </div>
          </form>
        )}

        {addModalTab === 'csv' && (
          <form onSubmit={handleImportCsv}>
            <div className="form-field" style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <label style={{ margin: 0 }}>
                  Pega tu CSV de TradingView o sube un archivo .csv (Symbol,Side,Qty,Fill Price,Commission,Closing Time)
                </label>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '4px 10px', fontSize: 11.5 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp size={13} /> Subir archivo .CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvFileUpload}
                  style={{ display: 'none' }}
                />
              </div>
              <textarea
                className="input mono"
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>
            {statusMsg && (
              <div
                style={{
                  marginBottom: 10,
                  color: 'var(--pos-bright)',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <CheckCircle2 size={14} /> {statusMsg}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                <Upload size={14} /> Importar Transacciones Ilimitadas
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
