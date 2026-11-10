/**
 * Origen de fondos de una compra (pedido del dueño, 2026-11-10).
 *
 * Espejo del destino del producido de una venta (saleProceeds.ts): al
 * guardar una COMPRA, la app pregunta de dónde sale el dinero:
 *  - 'broker': efectivo líquido dentro del broker (Cash Comitente,
 *    `nwSettings.brokerCashUsd`). Es el origen precargado por defecto:
 *    la compra de NVDA del 10-nov salió de ahí y hubo que descontarla a
 *    mano porque la app no lo hacía.
 *  - 'reserve': Reserva de efectivo USD (`nwSettings.cashReserveUsd`).
 *  - 'external': fondos que ingresan de fuera del portafolio — no se
 *    descuenta de ningún saldo (el broker nunca tuvo ese dinero como
 *    líquido registrado).
 *
 * El costo total de la compra es cantidad × precio + comisión.
 */
export type PurchaseFundsSource = 'broker' | 'reserve' | 'external';

export function purchaseCost(qty: number, price: number, commission: number): number {
  const cost = (Number(qty) || 0) * (Number(price) || 0) + (Number(commission) || 0);
  return Math.max(0, cost);
}

/** Descuenta el costo del saldo que corresponda según el origen. El saldo
 *  puede quedar negativo (compra mayor que el líquido registrado): es un
 *  dato real para el dueño, no se capa en silencio. */
export function applyPurchaseFunds(
  settings: { brokerCashUsd: number; cashReserveUsd: number },
  source: PurchaseFundsSource,
  cost: number
): { brokerCashUsd: number; cashReserveUsd: number } {
  const amount = Math.max(0, Number(cost) || 0);
  if (source === 'broker') {
    return {
      brokerCashUsd: (Number(settings.brokerCashUsd) || 0) - amount,
      cashReserveUsd: Number(settings.cashReserveUsd) || 0,
    };
  }
  if (source === 'reserve') {
    return {
      brokerCashUsd: Number(settings.brokerCashUsd) || 0,
      cashReserveUsd: (Number(settings.cashReserveUsd) || 0) - amount,
    };
  }
  // 'external': no descuenta de ningún saldo.
  return {
    brokerCashUsd: Number(settings.brokerCashUsd) || 0,
    cashReserveUsd: Number(settings.cashReserveUsd) || 0,
  };
}

/** Anotación que la pantalla de operación deja en el comentario de una
 *  compra para que editarla o eliminarla después pueda revertir el
 *  descuento exacto (tradeMoney.ts la lee). */
export const PURCHASE_SOURCE_ANNOTATIONS: Record<PurchaseFundsSource, string> = {
  broker: 'Origen compra: efectivo líquido en el broker',
  reserve: 'Origen compra: reserva de efectivo',
  external: 'Origen compra: fondos de fuera del portafolio',
};
