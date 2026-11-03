import { describe, expect, it } from 'vitest';
import { planLedgerSync, type LedgerCollections } from '../ledgerSync.js';
import type { Trade } from '../types.js';

const trade = (id: string | number, symbol = 'NYSE:ONTO'): Trade => ({
  id,
  time: 1793284200000,
  symbol,
  isBuy: true,
  qty: 1,
  price: 100,
  commission: 0,
  comment: '',
});

const empty: LedgerCollections = { trades: [], cash: [], dividends: [], illiquid: [] };
const none = new Set<string>();

describe('planLedgerSync', () => {
  it('dispositivo viejo (caso PC/ONTO): el servidor tiene una operación que el cliente no → no se sube nada y no hay purgas', () => {
    const server: LedgerCollections = { ...empty, trades: [trade(1, 'NASDAQ:MU'), trade(1793633561566)] };
    const local: LedgerCollections = { ...empty, trades: [trade(1, 'NASDAQ:MU')] };
    const plan = planLedgerSync(server, local, none);
    expect(plan.hasUploads).toBe(false);
    expect(plan.uploadTrades).toEqual([]);
    expect(plan.purgedIds).toEqual([]);
  });

  it('operación cargada sin conexión: está solo en el cliente → se sube', () => {
    const offline = trade(1794000000000, 'NASDAQ:NVDA');
    const server: LedgerCollections = { ...empty, trades: [trade(1)] };
    const local: LedgerCollections = { ...empty, trades: [trade(1), offline] };
    const plan = planLedgerSync(server, local, none);
    expect(plan.uploadTrades).toEqual([offline]);
    expect(plan.hasUploads).toBe(true);
  });

  it('borrada en otro dispositivo: el id tombstoneado no se resube y se purga', () => {
    const dead = trade(555, 'NASDAQ:TMDX');
    const server: LedgerCollections = { ...empty, trades: [trade(1)] };
    const local: LedgerCollections = { ...empty, trades: [trade(1), dead] };
    const plan = planLedgerSync(server, local, new Set(['555']));
    expect(plan.uploadTrades).toEqual([]);
    expect(plan.purgedIds).toEqual(['555']);
    expect(plan.hasUploads).toBe(false);
  });

  it('ids numéricos y string se comparan igual', () => {
    const server: LedgerCollections = { ...empty, trades: [trade(123)] };
    const local: LedgerCollections = { ...empty, trades: [trade('123')] };
    const plan = planLedgerSync(server, local, none);
    expect(plan.hasUploads).toBe(false);
  });

  it('cash, dividendos e ilíquidos locales también se detectan para subir', () => {
    const server: LedgerCollections = { ...empty };
    const local: LedgerCollections = {
      trades: [],
      cash: [{ id: 'cash_1', time: 1, type: 'deposit', amount: 500, currency: 'USD', comment: '' }],
      dividends: [{ id: 'div_1', time: 1, symbol: 'NASDAQ:MSFT', amount: 12, tax: 0, comment: '' }],
      illiquid: [
        {
          id: 'illiq_1', name: 'Depto', category: 'Real estate', costBasis: 1000,
          currentValue: 1100, currency: 'USD', annualYieldPct: 5, acquiredAt: 1, notes: '',
        },
      ],
    };
    const plan = planLedgerSync(server, local, none);
    expect(plan.uploadCash.length).toBe(1);
    expect(plan.uploadDividends.length).toBe(1);
    expect(plan.uploadIlliquid.length).toBe(1);
    expect(plan.hasUploads).toBe(true);
  });

  it('todo igual: plan vacío', () => {
    const both: LedgerCollections = { ...empty, trades: [trade(1), trade(2)] };
    const plan = planLedgerSync(both, both, none);
    expect(plan.hasUploads).toBe(false);
    expect(plan.purgedIds).toEqual([]);
  });
});
