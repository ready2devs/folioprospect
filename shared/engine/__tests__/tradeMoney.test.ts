import { describe, it, expect } from 'vitest';
import {
  purchaseCost,
  applyPurchaseFunds,
  tradeMoneyEffect,
  applyMoneyDelta,
  saleDestinationFromComment,
  purchaseSourceFromComment,
  stripFundsAnnotation,
} from '../index.js';
import type { Trade } from '../types.js';

const settings = { brokerCashUsd: 5681.11, cashReserveUsd: 10000 };

function trade(partial: Partial<Trade>): Trade {
  return {
    id: 1,
    time: 0,
    symbol: 'NASDAQ:NVDA',
    isBuy: true,
    qty: 0,
    price: 0,
    commission: 0,
    comment: '',
    ...partial,
  };
}

describe('purchaseFunds — origen de fondos de una compra', () => {
  it('costo total = cantidad × precio + comisión (caso NVDA 10-nov)', () => {
    // 8,354635224 × 169,62 + 2,83 = 1.419,94 (el comprobante de ARQ
    // redondea el total a 1.419,99 por el precio real con más decimales).
    expect(purchaseCost(8.354635224, 169.62, 2.83)).toBeCloseTo(1419.94, 2);
  });

  it('broker (default): descuenta del Cash Comitente, Reserva intacta', () => {
    const next = applyPurchaseFunds(settings, 'broker', 1419.94);
    expect(next.brokerCashUsd).toBeCloseTo(4261.17, 2);
    expect(next.cashReserveUsd).toBe(10000);
  });

  it('reserve: descuenta de la Reserva, Comitente intacto', () => {
    const next = applyPurchaseFunds(settings, 'reserve', 500);
    expect(next.brokerCashUsd).toBe(5681.11);
    expect(next.cashReserveUsd).toBe(9500);
  });

  it('external: no descuenta de ningún saldo', () => {
    expect(applyPurchaseFunds(settings, 'external', 500)).toEqual(settings);
  });

  it('el saldo puede quedar negativo (sin capeo silencioso)', () => {
    const next = applyPurchaseFunds(settings, 'broker', 6000);
    expect(next.brokerCashUsd).toBeCloseTo(-318.89, 2);
  });
});

describe('tradeMoney — efecto monetario y reversión al editar/eliminar', () => {
  it('lee las anotaciones de destino y origen', () => {
    expect(
      saleDestinationFromComment('nota · Destino venta: efectivo líquido en el broker')
    ).toBe('broker');
    expect(saleDestinationFromComment('Destino venta: reserva de efectivo')).toBe('reserve');
    expect(saleDestinationFromComment('Destino venta: sale del portafolio')).toBe('exit');
    expect(purchaseSourceFromComment('Origen compra: efectivo líquido en el broker')).toBe('broker');
    expect(purchaseSourceFromComment('Origen compra: reserva de efectivo')).toBe('reserve');
    expect(purchaseSourceFromComment('Origen compra: fondos de fuera del portafolio')).toBe('external');
    expect(saleDestinationFromComment('sin anotación')).toBeNull();
    expect(purchaseSourceFromComment('')).toBeNull();
  });

  it('stripFundsAnnotation deja solo el texto libre del dueño', () => {
    expect(
      stripFundsAnnotation('mi nota · Destino venta: efectivo líquido en el broker')
    ).toBe('mi nota');
    expect(stripFundsAnnotation('Destino venta: reserva de efectivo')).toBe('');
    expect(stripFundsAnnotation('sin anotación')).toBe('sin anotación');
  });

  it('venta al broker: efecto +neto; revertirlo restaura el saldo', () => {
    const t = trade({
      isBuy: false,
      qty: 10,
      price: 100,
      commission: 5,
      comment: 'Destino venta: efectivo líquido en el broker',
    });
    const eff = tradeMoneyEffect(t);
    expect(eff).toEqual({ account: 'broker', delta: 995 });
    const after = applyMoneyDelta(settings, eff!);
    expect(after.brokerCashUsd).toBeCloseTo(6676.11, 2);
    const reverted = applyMoneyDelta(after, { account: eff!.account, delta: -eff!.delta });
    expect(reverted.brokerCashUsd).toBeCloseTo(5681.11, 2);
  });

  it('compra con origen comitente: efecto −costo; revertirlo restaura el saldo', () => {
    const t = trade({
      isBuy: true,
      qty: 8.354635224,
      price: 169.62,
      commission: 2.83,
      comment: 'Origen compra: efectivo líquido en el broker',
    });
    const eff = tradeMoneyEffect(t);
    expect(eff!.account).toBe('broker');
    expect(eff!.delta).toBeCloseTo(-1419.94, 2);
    const after = applyMoneyDelta(settings, eff!);
    expect(after.brokerCashUsd).toBeCloseTo(4261.17, 2);
    const reverted = applyMoneyDelta(after, { account: eff!.account, delta: -eff!.delta });
    expect(reverted.brokerCashUsd).toBeCloseTo(5681.11, 2);
  });

  it('sin anotación (o salida/fondos externos): sin efecto automático', () => {
    expect(tradeMoneyEffect(trade({ isBuy: true, qty: 1, price: 10 }))).toBeNull();
    expect(
      tradeMoneyEffect(
        trade({ isBuy: false, qty: 1, price: 10, comment: 'Destino venta: sale del portafolio' })
      )
    ).toBeNull();
    expect(
      tradeMoneyEffect(
        trade({ isBuy: true, qty: 1, price: 10, comment: 'Origen compra: fondos de fuera del portafolio' })
      )
    ).toBeNull();
  });
});
