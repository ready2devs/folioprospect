import type { ArgFxResponse } from '../shared/engine/types.js';

let cachedArgFx: { value: ArgFxResponse; expiresAt: number } | null = null;

const FALLBACK_ARG_FX: Omit<ArgFxResponse, 'fetchedAt'> = {
  ccl: { compra: 1637.9, venta: 1639.5 },
  mep: { compra: 1546.9, venta: 1553.6 },
  cclRate: 1637.9,
  mepRate: 1553.6,
  source: 'fallback',
};

export async function fetchArgFxRates(): Promise<ArgFxResponse> {
  const now = Date.now();
  if (cachedArgFx && cachedArgFx.expiresAt > now) {
    return cachedArgFx.value;
  }

  // Primary source: DolarApi (CCL + MEP in parallel)
  try {
    const [cclRes, mepRes] = await Promise.all([
      fetch('https://dolarapi.com/v1/dolares/contadoconliqui', {
        signal: AbortSignal.timeout(3500),
      }),
      fetch('https://dolarapi.com/v1/dolares/bolsa', {
        signal: AbortSignal.timeout(3500),
      }),
    ]);

    if (cclRes.ok && mepRes.ok) {
      const [cclJson, mepJson]: [any, any] = await Promise.all([
        cclRes.json(),
        mepRes.json(),
      ]);

      const cclCompra = Number(cclJson?.compra || cclJson?.venta);
      const cclVenta = Number(cclJson?.venta || cclJson?.compra);
      const mepCompra = Number(mepJson?.compra || mepJson?.venta);
      const mepVenta = Number(mepJson?.venta || mepJson?.compra);

      if (cclCompra > 100 && mepVenta > 100) {
        const result: ArgFxResponse = {
          ccl: {
            compra: cclCompra,
            venta: cclVenta,
            updatedAt: cclJson?.fechaActualizacion,
          },
          mep: {
            compra: mepCompra,
            venta: mepVenta,
            updatedAt: mepJson?.fechaActualizacion,
          },
          cclRate: cclCompra,
          mepRate: mepVenta,
          source: 'dolarapi',
          fetchedAt: now,
        };
        cachedArgFx = { value: result, expiresAt: now + 60_000 };
        return result;
      }
    }
  } catch {
    // Fallback to CriptoYa below
  }

  // Secondary source: CriptoYa
  try {
    const cyRes = await fetch('https://criptoya.com/api/dolar', {
      signal: AbortSignal.timeout(3500),
    });
    if (cyRes.ok) {
      const cyJson: any = await cyRes.json();
      const cclPrice = Number(
        cyJson?.ccl?.al30?.ci?.price ||
          cyJson?.ccl?.gd30?.ci?.price ||
          cyJson?.ccl?.al30?.['24hs']?.price ||
          cyJson?.ccl?.price ||
          cyJson?.ccl
      );
      const mepPrice = Number(
        cyJson?.mep?.al30?.ci?.price ||
          cyJson?.mep?.gd30?.ci?.price ||
          cyJson?.mep?.al30?.['24hs']?.price ||
          cyJson?.mep?.price ||
          cyJson?.mep
      );

      if (cclPrice > 100 && mepPrice > 100) {
        const result: ArgFxResponse = {
          ccl: { compra: cclPrice, venta: cclPrice },
          mep: { compra: mepPrice, venta: mepPrice },
          cclRate: cclPrice,
          mepRate: mepPrice,
          source: 'criptoya',
          fetchedAt: now,
        };
        cachedArgFx = { value: result, expiresAt: now + 60_000 };
        return result;
      }
    }
  } catch {
    // Final deterministic fallback below
  }

  const fallback: ArgFxResponse = {
    ...FALLBACK_ARG_FX,
    fetchedAt: now,
  };
  cachedArgFx = { value: fallback, expiresAt: now + 30_000 };
  return fallback;
}
