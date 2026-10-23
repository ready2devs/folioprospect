import React, { useEffect, useState } from 'react';
import { useAppStore, type CashModalTarget } from '@/store';
import { api } from '@/api';
import { formatNumber } from '@shared/engine/format';
import { X, Plus, Upload, RotateCcw, Wallet } from 'lucide-react';

export const AddDialog: React.FC = () => {
  const {
    addModalOpen,
    addModalTab,
    cashModalTarget,
    setCashModalTarget,
    openAddModal,
    closeAddModal,
    evaluation,
    nwSettings,
    setNwSettings,
    refreshAll,
  } = useAppStore();

  const portfolioId = evaluation?.portfolio.id || '2bb80f7315764422a5347e8d38503f4e';

  // Trade state
  const [symbol, setSymbol] = useState('NASDAQ:NVDA');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qty, setQty] = useState('5');
  const [price, setPrice] = useState('221.97');
  const [commission, setCommission] = useState('0');
  const [dateStr, setDateStr] = useState('2026-10-22');
  const [comment, setComment] = useState('');

  // Cash state (supports Reserve USD, Broker Cash USD, and TV Ledger movement)
  const [cashActionMode, setCashActionMode] = useState<'set' | 'add' | 'subtract'>('set');
  const [cashType, setCashType] = useState<'deposit' | 'withdrawal' | 'income'>('deposit');
  const [cashAmount, setCashAmount] = useState('10000');
  const [cashComment, setCashComment] = useState('Aporte de liquidez');

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

  // CSV state
  const [csvText, setCsvText] = useState(
    'Symbol,Side,Qty,Fill Price,Commission,Closing Time\nNASDAQ:NVDA,Buy,10,185.50,0,2026-09-15'
  );
  const [statusMsg, setStatusMsg] = useState('');

  if (!addModalOpen) return null;

  const handleAddTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.addTrade(portfolioId, {
      symbol,
      isBuy: side === 'BUY',
      qty: Number(qty),
      price: Number(price),
      commission: Number(commission),
      time: Date.parse(dateStr + 'T14:30:00Z') || Date.now(),
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

    await api.addCash(portfolioId, {
      type: cashType,
      amount: val,
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
    await api.addDividend(portfolioId, {
      symbol: divSymbol,
      amount: Number(divAmount),
    });
    await refreshAll();
    closeAddModal();
  };

  const handleImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.importCsv(portfolioId, csvText);
    setStatusMsg(`Se importaron ${res.imported || 0} transacciones. Total: ${res.totalTrades}`);
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
              onClick={() => openAddModal(k, cashModalTarget)}
            >
              {label}
            </button>
          ))}
        </div>

        {addModalTab === 'trade' && (
          <form onSubmit={handleAddTrade}>
            <div className="form-row">
              <div className="form-field">
                <label>Símbolo (ej. NASDAQ:NVDA, NYSE:TSM, BINANCE:BTCUSDT)</label>
                <input
                  className="input mono"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  required
                />
              </div>
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
                <label>Precio de Ejecución (USD)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
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
              <div className="form-field">
                <label>Fecha de Ejecución</label>
                <input
                  type="date"
                  className="input mono"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                />
              </div>
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
                <div className="form-field" style={{ marginBottom: 14 }}>
                  <label>Concepto</label>
                  <input
                    className="input"
                    value={cashComment}
                    onChange={(e) => setCashComment(e.target.value)}
                  />
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
              <div className="form-field">
                <label>Símbolo</label>
                <input
                  className="input mono"
                  value={divSymbol}
                  onChange={(e) => setDivSymbol(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Dividendo Neto Cobrado (USD)</label>
                <input
                  type="number"
                  step="any"
                  className="input mono"
                  value={divAmount}
                  onChange={(e) => setDivAmount(e.target.value)}
                />
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
              <label>
                Pega tu CSV de TradingView o formato Symbol,Side,Qty,Fill Price,Commission,Closing Time
              </label>
              <textarea
                className="input mono"
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
            </div>
            {statusMsg && (
              <div style={{ marginBottom: 10, color: 'var(--pos-bright)', fontSize: 12 }}>
                {statusMsg}
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