/**
 * Respaldo de flujos de caja desde SEC EDGAR (fuente primaria, gratuita, sin
 * API key): cuando Yahoo no trae freeCashflow —bancos (NU) o emisores
 * extranjeros con reporte semestral cuyo TTM «cosido» sale negativo o vacío
 * (SIMO)—, se completa con el último flujo ANUAL auditado del balance
 * presentado ante la SEC (20-F / 10-K / 40-F): flujo operativo y capex en USD.
 * Solo rellena huecos: nunca pisa un FCF positivo de Yahoo. Nunca lanza.
 */
const UA = 'FolioProspect/1.0 (folioprospect.vercel.app; research)';
const DAY = 24 * 3600 * 1000;

export interface EdgarCashflow {
  /** Flujo de caja operativo del último año fiscal (USD). */
  operatingCashflow: number | null;
  /** Capex del mismo año fiscal (USD, positivo). */
  capex: number | null;
  /** FCF anual = OCF − capex (solo si están ambos). */
  freeCashflow: number | null;
  /** Fecha de cierre del año fiscal usado (YYYY-MM-DD). */
  fiscalYearEnd: string;
}

interface FactValue {
  end?: string;
  start?: string;
  val?: number;
  form?: string;
  fp?: string;
  filed?: string;
}

const OCF_CONCEPTS = ['NetCashProvidedByUsedInOperatingActivities', 'CashFlowsFromUsedInOperatingActivities'];
const CAPEX_CONCEPTS = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PurchaseOfPropertyAndEquipment'];

/** Último valor anual (período ≥300 días) en USD de un concepto, entre taxonomías. */
function latestAnnualUsd(facts: any, concepts: string[]): { val: number; end: string } | null {
  const taxonomies = ['us-gaap', 'ifrs-full'];
  for (const concept of concepts) {
    let best: { val: number; end: string; filed: string } | null = null;
    for (const tax of taxonomies) {
      const units = facts?.[tax]?.[concept]?.units?.USD;
      if (!Array.isArray(units)) continue;
      for (const v of units as FactValue[]) {
        if (typeof v.val !== 'number' || !v.end) continue;
        // Año fiscal completo: con start/end que abarquen ~un año, o fp FY.
        let fullYear = v.fp === 'FY';
        if (v.start && v.end) {
          const days = (Date.parse(v.end) - Date.parse(v.start)) / 86400000;
          fullYear = days >= 300 && days <= 380;
        }
        if (!fullYear) continue;
        const filed = v.filed || '';
        if (!best || v.end > best.end || (v.end === best.end && filed > best.filed)) {
          best = { val: v.val, end: v.end, filed };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Parser puro (testeable): extrae el flujo anual de un companyfacts de EDGAR. */
export function parseEdgarCashflow(factsJson: any): EdgarCashflow | null {
  const facts = factsJson?.facts;
  if (!facts) return null;
  const ocf = latestAnnualUsd(facts, OCF_CONCEPTS);
  if (!ocf) return null;
  const capexRaw = latestAnnualUsd(facts, CAPEX_CONCEPTS);
  const capex = capexRaw && capexRaw.end === ocf.end ? Math.abs(capexRaw.val) : null;
  return {
    operatingCashflow: ocf.val,
    capex,
    freeCashflow: capex != null ? ocf.val - capex : null,
    fiscalYearEnd: ocf.end,
  };
}

let tickerMapCache: { at: number; map: Map<string, string> } | null = null;
async function cikForTicker(ticker: string): Promise<string | null> {
  try {
    if (!tickerMapCache || Date.now() - tickerMapCache.at > DAY) {
      const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return tickerMapCache?.map.get(ticker) ?? null;
      const j: any = await res.json();
      const map = new Map<string, string>();
      for (const row of Object.values<any>(j)) {
        if (row?.ticker && row?.cik_str != null) {
          map.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, '0'));
        }
      }
      tickerMapCache = { at: Date.now(), map };
    }
    return tickerMapCache.map.get(ticker) ?? null;
  } catch {
    return null;
  }
}

const cfCache = new Map<string, { at: number; value: EdgarCashflow | null }>();

/** Flujo anual auditado (SEC) para un ticker US-listed. Cache 24 h. */
export async function fetchEdgarAnnualCashflow(tickerRaw: string): Promise<EdgarCashflow | null> {
  const ticker = tickerRaw.toUpperCase().replace(/\./g, '-');
  const c = cfCache.get(ticker);
  if (c && Date.now() - c.at < DAY) return c.value;
  let value: EdgarCashflow | null = null;
  try {
    const cik = await cikForTicker(ticker);
    if (cik) {
      const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(9000),
      });
      if (res.ok) value = parseEdgarCashflow(await res.json());
    }
  } catch {
    value = null;
  }
  cfCache.set(ticker, { at: Date.now(), value });
  return value;
}
