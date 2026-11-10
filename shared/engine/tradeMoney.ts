import {
  netSaleProceeds,
  SALE_DESTINATION_ANNOTATIONS,
  type SaleProceedsDestination,
} from './saleProceeds.js';
import {
  purchaseCost,
  PURCHASE_SOURCE_ANNOTATIONS,
  type PurchaseFundsSource,
} from './purchaseFunds.js';
import type { Trade } from './types.js';

/**
 * Efecto monetario de una operación sobre los saldos de efectivo
 * (Cash Comitente / Reserva), leído de la anotación que la pantalla de
 * operación dejó en su comentario.
 *
 * Sirve para que MODIFICAR o ELIMINAR una transacción revierta su efecto
 * exacto (pedido del dueño, 2026-11-10: «por si me equivoco en alguna
 * carga»). Las operaciones sin anotación (cargadas antes de que
 * existieran el destino de venta y el origen de fondos, o la semilla)
 * devuelven null: nunca estuvieron vinculadas a un saldo desde la app y
 * no hay nada que revertir automáticamente.
 */
export type MoneyAccount = 'broker' | 'reserve';

export interface TradeMoneyEffect {
  account: MoneyAccount;
  /** Variación que la operación aplicó al saldo (venta: +, compra: −). */
  delta: number;
}

export function saleDestinationFromComment(
  comment: string | null | undefined
): SaleProceedsDestination | null {
  if (!comment) return null;
  if (comment.includes(SALE_DESTINATION_ANNOTATIONS.broker)) return 'broker';
  if (comment.includes(SALE_DESTINATION_ANNOTATIONS.reserve)) return 'reserve';
  if (comment.includes(SALE_DESTINATION_ANNOTATIONS.exit)) return 'exit';
  return null;
}

export function purchaseSourceFromComment(
  comment: string | null | undefined
): PurchaseFundsSource | null {
  if (!comment) return null;
  if (comment.includes(PURCHASE_SOURCE_ANNOTATIONS.broker)) return 'broker';
  if (comment.includes(PURCHASE_SOURCE_ANNOTATIONS.reserve)) return 'reserve';
  if (comment.includes(PURCHASE_SOURCE_ANNOTATIONS.external)) return 'external';
  return null;
}

/** Quita del comentario la anotación de destino/origen (para mostrar el
 *  texto libre del dueño al editar, sin duplicarla al re-guardar). */
export function stripFundsAnnotation(comment: string | null | undefined): string {
  if (!comment) return '';
  const annotations = [
    ...Object.values(SALE_DESTINATION_ANNOTATIONS),
    ...Object.values(PURCHASE_SOURCE_ANNOTATIONS),
  ];
  let out = comment;
  for (const a of annotations) {
    out = out.split(` · ${a}`).join('').split(a).join('');
  }
  return out.replace(/\s*·\s*$/, '').trim();
}

export function tradeMoneyEffect(trade: Trade): TradeMoneyEffect | null {
  if (trade.isBuy) {
    const source = purchaseSourceFromComment(trade.comment);
    if (source === 'broker' || source === 'reserve') {
      return {
        account: source,
        delta: -purchaseCost(trade.qty, trade.price, trade.commission),
      };
    }
    return null;
  }
  const destination = saleDestinationFromComment(trade.comment);
  if (destination === 'broker' || destination === 'reserve') {
    return {
      account: destination,
      delta: netSaleProceeds(trade.qty, trade.price, trade.commission),
    };
  }
  return null;
}

/** Aplica (o, con el delta ya invertido, revierte) un efecto sobre los
 *  saldos. */
export function applyMoneyDelta(
  settings: { brokerCashUsd: number; cashReserveUsd: number },
  effect: TradeMoneyEffect
): { brokerCashUsd: number; cashReserveUsd: number } {
  if (effect.account === 'broker') {
    return {
      brokerCashUsd: (Number(settings.brokerCashUsd) || 0) + effect.delta,
      cashReserveUsd: Number(settings.cashReserveUsd) || 0,
    };
  }
  return {
    brokerCashUsd: Number(settings.brokerCashUsd) || 0,
    cashReserveUsd: (Number(settings.cashReserveUsd) || 0) + effect.delta,
  };
}
