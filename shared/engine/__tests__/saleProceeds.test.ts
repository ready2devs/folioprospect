import { describe, expect, it } from 'vitest';
import { applySaleProceeds, netSaleProceeds } from '../saleProceeds';

describe('netSaleProceeds', () => {
  it('cantidad × precio − comisión', () => {
    // Venta real del 6-nov: 12,2358 SIMO a US$164,09 con la comisión incluida aparte
    expect(netSaleProceeds(10, 100, 5)).toBe(995);
    expect(netSaleProceeds(8.3546, 169.62, 2.83)).toBeCloseTo(1414.28, 2);
  });
  it('nunca es negativo ni NaN', () => {
    expect(netSaleProceeds(1, 10, 50)).toBe(0);
    expect(netSaleProceeds(NaN as never, NaN as never, NaN as never)).toBe(0);
  });
});

describe('applySaleProceeds', () => {
  const base = { brokerCashUsd: 1000, cashReserveUsd: 10500 };

  it('broker (default): suma al Cash Comitente, reserva intacta', () => {
    expect(applySaleProceeds(base, 'broker', 2003.75)).toEqual({
      brokerCashUsd: 3003.75,
      cashReserveUsd: 10500,
    });
  });

  it('reserve: suma a la Reserva, broker intacto', () => {
    expect(applySaleProceeds(base, 'reserve', 2003.75)).toEqual({
      brokerCashUsd: 1000,
      cashReserveUsd: 12503.75,
    });
  });

  it('exit: no suma a ningún saldo (sale del portafolio)', () => {
    expect(applySaleProceeds(base, 'exit', 2003.75)).toEqual(base);
  });

  it('no muta el objeto original', () => {
    applySaleProceeds(base, 'broker', 100);
    expect(base.brokerCashUsd).toBe(1000);
  });
});
