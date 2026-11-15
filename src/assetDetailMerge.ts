import type { AssetDetailResponse, AssetExtras } from './api';
import type { FinvizFundamentals } from '@shared/engine/finvizParse';

function isMissing(value: unknown): boolean {
  return value === null || value === undefined;
}

function mergeMissingFields<T extends object>(
  previous: T | null | undefined,
  next: T | null | undefined
): T | null | undefined {
  if (isMissing(next)) return previous;
  if (isMissing(previous)) return next;

  const merged: Record<string, unknown> = {
    ...(next as Record<string, unknown>),
  };
  for (const [key, previousValue] of Object.entries(previous as Record<string, unknown>)) {
    if (isMissing(merged[key]) && !isMissing(previousValue)) {
      merged[key] = previousValue;
    }
  }
  return merged as T;
}

/**
 * Fusiona un detalle recién recibido sobre el que ya estaba en pantalla.
 *
 * La ficha puede recibir un payload válido pero degradado (por ejemplo,
 * sin el catálogo de Finviz) en un refresco posterior. Ese payload debe
 * actualizar precio, gráfico y cualquier valor nuevo no nulo, pero nunca
 * borrar ratios que ya se conocían. La preservación se limita a `extras`
 * y a su catálogo `extras.finviz`: son los datos fundamentales que las
 * fuentes devuelven de forma intermitente; el resto del detalle siempre
 * sale de la respuesta nueva.
 */
export function mergeAssetDetailPreservingExtras(
  previous: AssetDetailResponse | null | undefined,
  next: AssetDetailResponse
): AssetDetailResponse {
  if (!previous || previous.symbol !== next.symbol) return next;
  if (next.extras === null || next.extras === undefined) {
    return previous.extras ? { ...next, extras: previous.extras } : next;
  }
  if (previous.extras === null || previous.extras === undefined) return next;

  const previousExtras: AssetExtras = previous.extras;
  const nextExtras: AssetExtras = next.extras;
  const mergedFinviz = mergeMissingFields<FinvizFundamentals>(
    previousExtras.finviz,
    nextExtras.finviz
  );
  const mergedExtras = mergeMissingFields<AssetExtras>(previousExtras, nextExtras);

  if (!mergedExtras) return next;
  return {
    ...next,
    extras: {
      ...mergedExtras,
      finviz: mergedFinviz ?? null,
    },
  };
}
