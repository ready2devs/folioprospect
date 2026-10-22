import React, { useState } from 'react';
import { useAppStore } from '@/store';
import { api } from '@/api';
import { X, Plus, Upload, RotateCcw } from 'lucide-react';

export const AddDialog: React.FC = () => {
  const {
    addModalOpen,
    addModalTab,
    openAddModal,
    closeAddModal,
    evaluation,
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

  // Cash state
  const [cashType, setCashType] = useState<'deposit' | 'withdrawal' | 'income'>('deposit');
  const [cashAmount, setCashAmount] = useState('10000');
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
    await api.addCash(portfolioId, {
      type: cashType,
      amount: Number(cashAmount),
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
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>
            Agregar al Portafolio (Sin límites de Holdings ni Transacciones)
          </h3>
          <button className="btn btn-ghost" onClick={closeAddModal}>
            <X size={16} />
          </button>
        </div>

        <div className="seg-group" style={{ marginBottom: 16, width: '100%' }}>
          {(
            [
              ['trade', 'Operación (Compra/Venta)'],
              ['cash', 'Efectivo (Cash)'],
              ['illiquid', 'Activo No Líquido'],
              ['dividend', 'Dividendo'],
              ['csv', 'Importar CSV'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className={`seg-btn ${addModalTab === k ? 'active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => openAddModal(k)}
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
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={handleResetSeed}>
                <RotateCcw size={13} /> Restaurar Semilla Original TV (30 trades)
              </button>
              <button type="submit" className="btn btn-primary">
                <Plus size={14} /> Guardar Transacción
              </button>
            </div>
          </form>
        )}

        {addModalTab === 'cash' && (
          <form onSubmit={handleAddCash}>
            <div className="form-row">
              <div className="form-field">
                <label>Movimiento de Caja</label>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                <Plus size={14} /> Registrar Efectivo
              </button>
            </div>
          </form>
        )}

        {addModalTab === 'illiquid' && (
          <form onSubmit={handleAddIlliquid}>
            <div className="form-row">
              <div className="form-field">
                <label>Nombre del Activo No Líquido</label>
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
                <Plus size={14} /> Incorporar al Patrimonio
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
