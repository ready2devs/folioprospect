/**
 * Destino del producido de una venta (pedido del dueño, 2026-11-10).
 *
 * Al guardar una VENTA, la app pregunta dónde queda el dinero:
 *  - 'broker': efectivo líquido dentro del broker (Cash Comitente,
 *    `nwSettings.brokerCashUsd`). Es el destino por defecto: las ventas
 *    que el dueño carga quedan como líquido en el broker, así no tiene
 *    que sumar el dinero a mano con el diálogo de +Cash.
 *  - 'reserve': Reserva de efectivo USD fuera del broker
 *    (`nwSettings.cashReserveUsd`), que suma al NW líquido.
 *  - 'exit': el dinero sale del portafolio — no se suma a ningún saldo.
 *
 * El producido neto es cantidad × precio − comisión, nunca negativo.
 */
export type SaleProceedsDestination = 'broker' | 'reserve' | 'exit';

export function netSaleProceeds(qty: number, price: number, commission: number): number {
  const net = (Number(qty) || 0) * (Number(price) || 0) - (Number(commission) || 0);
  return Math.max(0, net);
}

/** Aplica el producido neto al saldo que corresponda según el destino. */
export function applySaleProceeds(
  settings: { brokerCashUsd: number; cashReserveUsd: number },
  destination: SaleProceedsDestination,
  netProceeds: number
): { brokerCashUsd: number; cashReserveUsd: number } {
  const amount = Math.max(0, Number(netProceeds) || 0);
  if (destination === 'broker') {
    return {
      brokerCashUsd: (Number(settings.brokerCashUsd) || 0) + amount,
      cashReserveUsd: Number(settings.cashReserveUsd) || 0,
    };
  }
  if (destination === 'reserve') {
    return {
      brokerCashUsd: Number(settings.brokerCashUsd) || 0,
      cashReserveUsd: (Number(settings.cashReserveUsd) || 0) + amount,
    };
  }
  // 'exit': sale del portafolio, no suma en ningún saldo.
  return {
    brokerCashUsd: Number(settings.brokerCashUsd) || 0,
    cashReserveUsd: Number(settings.cashReserveUsd) || 0,
  };
}
