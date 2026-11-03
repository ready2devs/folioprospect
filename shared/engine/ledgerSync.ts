import type { CashTx, DividendTx, IlliquidAsset, Trade } from './types.js';

/**
 * Convergencia del ledger entre el servidor (fuente de verdad) y la copia
 * local que cada navegador guarda en localStorage (`fp.ledger.v1`).
 *
 * Regla: el servidor manda.
 * - Lo que está solo en el servidor se adopta tal cual (otra pantalla cargó
 *   una operación y este dispositivo quedó viejo).
 * - Lo que está solo en el cliente (una operación cargada sin conexión, cuyo
 *   POST nunca llegó) se SUBE al servidor: nadie pierde una carga.
 * - Lo que el servidor marcó como borrado en otro dispositivo (tombstones)
 *   se purga del cliente y jamás se resube.
 *
 * Esta función es pura: decide el plan; `src/api.ts` lo ejecuta (subidas,
 * relectura del servidor y reemplazo de la copia local).
 */
export interface LedgerCollections {
  trades: Trade[];
  cash: CashTx[];
  dividends: DividendTx[];
  illiquid: IlliquidAsset[];
}

export interface LedgerSyncPlan {
  uploadTrades: Trade[];
  uploadCash: CashTx[];
  uploadDividends: DividendTx[];
  uploadIlliquid: IlliquidAsset[];
  /** Ids locales borrados en otro dispositivo: se purgan, no se suben. */
  purgedIds: string[];
  hasUploads: boolean;
}

const idOf = (x: { id: string | number }): string => String(x.id);

function localOnly<T extends { id: string | number }>(
  local: T[],
  serverIds: Set<string>,
  tombstones: ReadonlySet<string>,
  purged: string[]
): T[] {
  const out: T[] = [];
  for (const item of local) {
    const id = idOf(item);
    if (tombstones.has(id)) {
      purged.push(id);
      continue;
    }
    if (!serverIds.has(id)) out.push(item);
  }
  return out;
}

export function planLedgerSync(
  server: LedgerCollections,
  local: LedgerCollections,
  tombstones: ReadonlySet<string>
): LedgerSyncPlan {
  const purgedIds: string[] = [];
  const idsOf = <T extends { id: string | number }>(arr: T[]): Set<string> =>
    new Set(arr.map(idOf));
  const uploadTrades = localOnly(local.trades, idsOf(server.trades), tombstones, purgedIds);
  const uploadCash = localOnly(local.cash, idsOf(server.cash), tombstones, purgedIds);
  const uploadDividends = localOnly(local.dividends, idsOf(server.dividends), tombstones, purgedIds);
  const uploadIlliquid = localOnly(local.illiquid, idsOf(server.illiquid), tombstones, purgedIds);
  return {
    uploadTrades,
    uploadCash,
    uploadDividends,
    uploadIlliquid,
    purgedIds,
    hasUploads:
      uploadTrades.length + uploadCash.length + uploadDividends.length + uploadIlliquid.length > 0,
  };
}
