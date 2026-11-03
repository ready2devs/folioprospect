/**
 * Respaldo de flujos de caja desde SEC EDGAR (fuente primaria, gratuita, sin
 * API key): cuando Yahoo no trae freeCashflow —bancos (NU) o emisores
 * extranjeros con reporte semestral cuyo TTM «cosido» sale negativo o vacío
 * (SIMO)—, se completa con el último flujo ANUAL auditado del balance
 * presentado ante la SEC (20-F / 10-K / 40-F): flujo operativo y capex en USD.
 * Solo rellena huecos: nunca pisa un FCF positivo de Yahoo. Nunca lanza.
 */
const UA = 'FolioProspect/1.0 admin@folioprospect.app';
const DAY = 24 * 3600 * 1000;

/**
 * CIK verificados contra el archivo oficial de la SEC (company_tickers.json).
 * Semilla local para no depender de www.sec.gov en runtime: desde IPs de
 * datacenter ese host puede bloquear el archivo de tickers, mientras que
 * data.sec.gov (los datos) responde. El archivo completo queda de respaldo
 * para cualquier otro ticker.
 */
const KNOWN_CIK: Record<string, string> = {
  SIMO: '1329394', NU: '1691493', TSM: '1046179', MELI: '1099590',
  VIST: '1762506', HSAI: '1861737', NBIS: '1513845', CLS: '1030894',
  GOOG: '1652044', MU: '723125', NVDA: '1045810', MSFT: '789019',
  META: '1326801', AMZN: '1018724', AAPL: '320193', AVGO: '1730168',
  TMDX: '1756262', CRDO: '1807794', ONTO: '704532',
};

export interface EdgarCashflow {
  /** Flujo de caja operativo del último año fiscal (USD). */
  operatingCashflow: number | null;
  /** Capex del mismo año fiscal (USD, positivo). */
  capex: number | null;
  /** FCF anual = OCF − capex (solo si están ambos). */
  freeCashflow: number | null;
  /** Fecha de cierre del año fiscal usado (YYYY-MM-DD). */
  fiscalYearEnd: string;
  /** Caja al cierre del último balance (USD), si el filer la traduce. */
  totalCash: number | null;
  /**
   * Tasa de traducción moneda de reporte → USD implícita en el propio
   * balance: mismo concepto (caja) y misma fecha en ambas monedas
   * (ej. TWD 2.127,63 B / USD 64,89 B = 32,79 para TSM). Sirve para
   * convertir los absolutos TTM que Yahoo sirve en moneda de reporte.
   */
  fxRate: number | null;
  /** Moneda de reporte detectada (la unidad no-USD del par de caja). */
  reportingCurrency: string | null;
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
const CAPEX_CONCEPTS = [
  'PaymentsToAcquirePropertyPlantAndEquipment',
  'PaymentsToAcquireProductiveAssets',
  'PurchaseOfPropertyAndEquipment',
  // Variantes IFRS (emisores 20-F que reportan en ifrs-full): el mismo
  // concepto con el sufijo de clasificación del estado de flujos. Sin
  // este nombre, la serie de FCF de emisores IFRS (p. ej. petroleras
  // latinoamericanas) salía vacía y el DCF caía a la foto TTM sin
  // normalizar — la serie existe en EDGAR desde 2019 (adenda R9).
  'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',
  'PurchaseOfPropertyAndEquipmentClassifiedAsInvestingActivities',
];
const CASH_CONCEPTS = ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents'];

/** Último instante de balance en USD + tasa implícita contra la otra moneda. */
function latestCashWithFx(facts: any): { usd: number; fxRate: number | null; ccy: string | null } | null {
  const taxonomies = ['us-gaap', 'ifrs-full'];
  for (const concept of CASH_CONCEPTS) {
    for (const tax of taxonomies) {
      const units = facts?.[tax]?.[concept]?.units;
      if (!units?.USD || !Array.isArray(units.USD)) continue;
      let bestUsd: { val: number; end: string } | null = null;
      for (const v of units.USD as FactValue[]) {
        if (typeof v.val !== 'number' || !v.end) continue;
        if (!bestUsd || v.end > bestUsd.end) bestUsd = { val: v.val, end: v.end };
      }
      if (!bestUsd) continue;
      // Misma fecha en otra moneda → tasa de traducción del propio balance.
      let fxRate: number | null = null;
      let ccy: string | null = null;
      for (const [unit, vals] of Object.entries(units)) {
        if (unit === 'USD' || !Array.isArray(vals)) continue;
        const pair = (vals as FactValue[]).find((v) => v.end === bestUsd!.end && typeof v.val === 'number');
        if (pair && bestUsd.val > 0) {
          fxRate = pair.val! / bestUsd.val;
          ccy = unit;
          break;
        }
      }
      return { usd: bestUsd.val, fxRate, ccy };
    }
  }
  return null;
}

interface AnnualPoint {
  end: string;
  val: number;
  filed: string;
}

/**
 * Serie anual en USD de un concepto, ordenada por fecha de cierre
 * descendente y deduplicada por cierre (gana la presentación más
 * reciente). Dos reglas universales de selección:
 * - Dentro de un concepto mandan los puntos de año fiscal verdadero
 *   (fp 'FY'); los períodos móviles de ~1 año que reportan los 10-Q
 *   (TTM con cierre trimestral) solo se usan si el concepto no tiene
 *   ningún punto FY.
 * - Entre conceptos candidatos gana la serie más fresca (con puntos FY,
 *   luego cierre más reciente, luego más puntos): un concepto puede
 *   quedar abandonado por el emisor hace años (p. ej., capex migrado de
 *   'PaymentsToAcquirePropertyPlantAndEquipment' a
 *   'PaymentsToAcquireProductiveAssets') y tomar «el primer concepto con
 *   datos» emparejaba flujos de hace una década.
 */
function annualSeriesUsd(
  facts: any,
  concepts: string[],
  taxonomies: string[] = ['us-gaap', 'ifrs-full'],
  unit: string = 'USD'
): AnnualPoint[] {
  let best: AnnualPoint[] | null = null;
  let bestScore: [number, string, number] | null = null;
  for (const concept of concepts) {
    const fy = new Map<string, AnnualPoint>();
    const dur = new Map<string, AnnualPoint>();
    for (const tax of taxonomies) {
      const units = facts?.[tax]?.[concept]?.units?.[unit];
      if (!Array.isArray(units)) continue;
      for (const v of units as FactValue[]) {
        if (typeof v.val !== 'number' || !v.end) continue;
        let days: number | null = null;
        if (v.start && v.end) {
          days = (Date.parse(v.end) - Date.parse(v.start)) / 86400000;
        }
        const aboutYear = days != null && days >= 300 && days <= 380;
        const map = v.fp === 'FY' && (days == null || aboutYear) ? fy : aboutYear ? dur : null;
        if (!map) continue;
        const filed = v.filed || '';
        const prev = map.get(v.end);
        if (!prev || filed > prev.filed) map.set(v.end, { end: v.end, val: v.val, filed });
      }
    }
    const chosen = fy.size > 0 ? fy : dur;
    if (chosen.size === 0) continue;
    const pts = [...chosen.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
    const score: [number, string, number] = [fy.size > 0 ? 1 : 0, pts[0].end, pts.length];
    if (
      !bestScore ||
      score[0] > bestScore[0] ||
      (score[0] === bestScore[0] &&
        (score[1] > bestScore[1] || (score[1] === bestScore[1] && score[2] > bestScore[2])))
    ) {
      best = pts;
      bestScore = score;
    }
  }
  return best ?? [];
}

/** Variación interanual de acciones EN CIRCULACIÓN desde conteos
 *  reportados (foto instantánea de balance o portada): la fuente
 *  primaria del ΔS desde la reparación 2026-11-03 (server/dilution.ts).
 *  El promedio ponderado (sharesHistory) promedia el año y mezcla
 *  regímenes cuando el conteo cambia de forma escalonada dentro del
 *  período — el caso NBIS: su promedio FY2025/FY2024 dice −13,7%
 *  («recompra») porque el promedio FY2024 todavía arrastra el conteo
 *  previo a la escisión de Yandex, mientras los conteos reportados de
 *  cierre dicen 235,8 M → 253,0 M (+7,3%: emitió, no recompró). */
export interface ReportedSharesYoY {
  /** Variación interanual %: positivo = el conteo creció (dilución). */
  pct: number;
  latestEnd: string;
  priorEnd: string;
  latest: number;
  prior: number;
  gapDays: number;
  /** El par es una ventana interanual limpia: cierres separados por
   *  300–460 días y conteos dentro de un factor [0,4 ; 2,5]. Fuera de
   *  eso hay un artefacto (split sin reexpresar, tageo parcial por
   *  clase, cambio de cierre fiscal) y el par NO puede arbitrar entre
   *  fuentes: solo un par comparable manda (server/dilution.ts). */
  comparable: boolean;
  /** Concepto XBRL que aportó el par. */
  concept: string;
}

export interface EdgarSeries {
  /** FCF anual (OCF − capex, mismo cierre fiscal), más reciente primero, máx 5. */
  fcfHistory: number[];
  /** EPS diluido anual (US-GAAP), más reciente primero, máx 5. */
  epsHistory: number[];
  /** Acciones promedio ponderadas diluidas anuales, más reciente primero,
   *  máx 5: la variación interanual ES la dilución/recompra real (ΔS). */
  sharesHistory: number[];
  /** ΔS desde conteos reportados de acciones en circulación (balance /
   *  portada), o null si el emisor no reporta el concepto utilizable. */
  sharesOutstandingYoY: ReportedSharesYoY | null;
  /** Flujo operativo anual alineado por cierre fiscal con `capexHistory`
   *  (los mismos años que componen `fcfHistory`). */
  ocfHistory: number[];
  /** Capex anual (valor absoluto) alineado con `ocfHistory`. */
  capexHistory: number[];
  /** Ingreso neto anual reportado, más reciente primero, máx 5. */
  netIncomeHistory: number[];
  /** Depreciación y amortización anual reportada, más reciente
   *  primero, máx 5 (vacía si el emisor no la desglosa). */
  depreciationHistory: number[];
}

const SHARES_CONCEPTS: Array<{ concept: string; taxonomies: string[] }> = [
  { concept: 'WeightedAverageNumberOfSharesOutstandingDiluted', taxonomies: ['us-gaap'] },
  { concept: 'WeightedAverageNumberOfSharesOutstandingBasic', taxonomies: ['us-gaap'] },
  { concept: 'EntityCommonStockSharesOutstanding', taxonomies: ['dei'] },
];

/** Serie anual en unidades «shares» de un concepto (misma selección FY que
 *  annualSeriesUsd: mandan los puntos de año fiscal; entre conceptos gana
 *  la serie más fresca). Devuelve [] si el emisor no reporta el concepto
 *  (frecuente en emisores extranjeros 20-F: brecha de cobertura declarada). */
function annualSeriesShares(facts: any): AnnualPoint[] {
  let best: AnnualPoint[] | null = null;
  let bestScore: [number, string, number] | null = null;
  for (const { concept, taxonomies } of SHARES_CONCEPTS) {
    const fy = new Map<string, AnnualPoint>();
    const dur = new Map<string, AnnualPoint>();
    for (const tax of taxonomies) {
      const units = facts?.[tax]?.[concept]?.units?.shares;
      if (!Array.isArray(units)) continue;
      for (const v of units as FactValue[]) {
        if (typeof v.val !== 'number' || !(v.val > 0) || !v.end) continue;
        let days: number | null = null;
        if (v.start && v.end) {
          days = (Date.parse(v.end) - Date.parse(v.start)) / 86400000;
        }
        const aboutYear = days != null && days >= 300 && days <= 380;
        const instant = tax === 'dei'; // shares outstanding es foto instantánea
        const map = v.fp === 'FY' && (days == null || aboutYear || instant) ? fy : aboutYear ? dur : null;
        if (!map) continue;
        const filed = v.filed || '';
        const prev = map.get(v.end);
        if (!prev || filed > prev.filed) map.set(v.end, { end: v.end, val: v.val, filed });
      }
    }
    const chosen = fy.size > 0 ? fy : dur;
    if (chosen.size === 0) continue;
    const pts = [...chosen.values()].sort((a, b) => (a.end < b.end ? 1 : -1));
    const score: [number, string, number] = [fy.size > 0 ? 1 : 0, pts[0].end, pts.length];
    if (
      !bestScore ||
      score[0] > bestScore[0] ||
      (score[0] === bestScore[0] &&
        (score[1] > bestScore[1] || (score[1] === bestScore[1] && score[2] > bestScore[2])))
    ) {
      best = pts;
      bestScore = score;
    }
  }
  return best ?? [];
}

const SHARES_OUTSTANDING_CONCEPTS: Array<{ concept: string; taxonomy: string }> = [
  { concept: 'CommonStockSharesOutstanding', taxonomy: 'us-gaap' },
  { concept: 'EntityCommonStockSharesOutstanding', taxonomy: 'dei' },
];

export const SHARES_YOY_MIN_GAP_DAYS = 300;
export const SHARES_YOY_MAX_GAP_DAYS = 460;

interface SharesPoint {
  end: string;
  val: number;
  filed: string;
}

/** Puntos instantáneos utilizables de un concepto de acciones en
 *  circulación, deduplicados por cierre (gana la presentación más
 *  reciente) y ordenados por cierre descendente. Guarda de ambigüedad:
 *  si al mismo cierre la presentación vigente trae valores distintos
 *  entre sí (tageo POR CLASE — A/B/C por separado, frecuente en
 *  multi-clase), ese cierre es ambiguo y se descarta: un conteo
 *  parcial no es el conteo de la empresa. */
function sharesOutstandingPoints(facts: any, taxonomy: string, concept: string): SharesPoint[] {
  const units = facts?.[taxonomy]?.[concept]?.units?.shares;
  if (!Array.isArray(units)) return [];
  const byEnd = new Map<string, FactValue[]>();
  for (const v of units as FactValue[]) {
    if (typeof v.val !== 'number' || !(v.val > 0) || !v.end) continue;
    const arr = byEnd.get(v.end) ?? [];
    arr.push(v);
    byEnd.set(v.end, arr);
  }
  const pts: SharesPoint[] = [];
  for (const [end, vals] of byEnd) {
    const maxFiled = vals.reduce((m, v) => ((v.filed || '') > m ? (v.filed || '') : m), '');
    const distinct = [
      ...new Set(
        vals
          .filter((v) => (v.filed || '') === maxFiled && typeof v.val === 'number')
          .map((v) => v.val as number)
      ),
    ];
    if (distinct.length === 0) continue;
    const lo = Math.min(...distinct);
    const hi = Math.max(...distinct);
    if (distinct.length > 1 && hi / lo > 1.02) continue; // ambiguo: tageo por clase
    pts.push({ end, val: hi, filed: maxFiled });
  }
  return pts.sort((a, b) => (a.end < b.end ? 1 : -1));
}

/** Par interanual desde los puntos de conteo: el cierre más reciente
 *  contra el primer cierre anterior separado por una ventana de ~1
 *  año (300–460 días). Si ningún cierre cae en la ventana, el «par»
 *  crudo es el cierre inmediato anterior y queda marcado NO
 *  comparable: su dirección existe, pero no es una ventana anual
 *  limpia y no puede arbitrar (server/dilution.ts decide). */
export function sharesOutstandingYoYFromPoints(
  points: SharesPoint[],
  concept: string
): ReportedSharesYoY | null {
  if (points.length < 2) return null;
  const latest = points[0];
  let partner: SharesPoint | null = null;
  for (const p of points.slice(1)) {
    const gap = (Date.parse(latest.end) - Date.parse(p.end)) / 86400000;
    if (gap >= SHARES_YOY_MIN_GAP_DAYS && gap <= SHARES_YOY_MAX_GAP_DAYS) {
      partner = p;
      break;
    }
  }
  const raw = partner ?? points[1];
  const gapDays = (Date.parse(latest.end) - Date.parse(raw.end)) / 86400000;
  const ratio = latest.val / raw.val;
  return {
    pct: (ratio - 1) * 100,
    latestEnd: latest.end,
    priorEnd: raw.end,
    latest: latest.val,
    prior: raw.val,
    gapDays,
    comparable: partner != null && ratio >= 0.4 && ratio <= 2.5,
    concept,
  };
}

/** ΔS reportado: entre conceptos candidatos gana el de cierre más
 *  fresco (a igual cierre, el de más puntos utilizables). */
function reportedSharesYoY(facts: any): ReportedSharesYoY | null {
  let best: { yoy: ReportedSharesYoY; points: number } | null = null;
  for (const { concept, taxonomy } of SHARES_OUTSTANDING_CONCEPTS) {
    const pts = sharesOutstandingPoints(facts, taxonomy, concept);
    if (pts.length < 2) continue;
    const yoy = sharesOutstandingYoYFromPoints(pts, concept);
    if (!yoy) continue;
    if (
      !best ||
      yoy.latestEnd > best.yoy.latestEnd ||
      (yoy.latestEnd === best.yoy.latestEnd && pts.length > best.points)
    ) {
      best = { yoy, points: pts.length };
    }
  }
  return best?.yoy ?? null;
}

/** Parser puro (testeable): series anuales desde un companyfacts de EDGAR. */
export function parseEdgarSeries(factsJson: any): EdgarSeries | null {
  const facts = factsJson?.facts;
  if (!facts) return null;
  const ocf = annualSeriesUsd(facts, OCF_CONCEPTS);
  const capex = annualSeriesUsd(facts, CAPEX_CONCEPTS);
  const capexByEnd = new Map(capex.map((p) => [p.end, Math.abs(p.val)]));
  const fcfHistory: number[] = [];
  const ocfHistory: number[] = [];
  const capexHistory: number[] = [];
  for (const p of ocf) {
    const cx = capexByEnd.get(p.end);
    if (cx == null) continue;
    fcfHistory.push(p.val - cx);
    ocfHistory.push(p.val);
    capexHistory.push(cx);
    if (fcfHistory.length >= 5) break;
  }
  // Ingreso neto y depreciación anuales: insumos de la tasa de
  // reinversión (capex neto / NOPAT) del ancla de crecimiento
  // sustentable del Optimizador (corrección del usuario 2026-11-03).
  // Series independientes: cada concepto aporta su año más reciente.
  const NET_INCOME_CONCEPTS = [
    'NetIncomeLoss',
    'ProfitLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
  ];
  const netIncomeHistory = annualSeriesUsd(facts, NET_INCOME_CONCEPTS)
    .slice(0, 5)
    .map((p) => p.val);
  const DEPRECIATION_CONCEPTS = [
    'DepreciationDepletionAndAmortization',
    'DepreciationAmortizationAndAccretion',
    'Depreciation',
    'DepreciationAndAmortisation',
  ];
  const depreciationHistory = annualSeriesUsd(facts, DEPRECIATION_CONCEPTS)
    .slice(0, 5)
    .map((p) => Math.abs(p.val));
  // El EPS se reporta en unidades «USD/shares», no «USD»: leerlo de la
  // unidad equivocada dejaba la serie vacía para todos los emisores
  // (bug detectado al auditar la normalización cíclica del Optimizador:
  // sin serie de EPS no hay EPS de mitad de ciclo posible).
  // US-GAAP e IFRS: los emisores 20-F nombran el EPS «EarningsLossPerShare»
  // (la taxonomía IFRS no distingue ganancia/pérdida en el nombre corto).
  const EPS_CONCEPTS = [
    'EarningsPerShareDiluted',
    'EarningsPerShareBasic',
    'DilutedEarningsLossPerShare',
    'BasicEarningsLossPerShare',
  ];
  const epsByShare = annualSeriesUsd(facts, EPS_CONCEPTS, ['us-gaap', 'ifrs-full'], 'USD/shares');
  const epsPts =
    epsByShare.length > 0
      ? epsByShare
      : annualSeriesUsd(facts, EPS_CONCEPTS, ['us-gaap', 'ifrs-full'], 'USD');
  const epsHistory = epsPts.slice(0, 5).map((p) => p.val);
  const sharesHistory = annualSeriesShares(facts).slice(0, 5).map((p) => p.val);
  const sharesOutstandingYoY = reportedSharesYoY(facts);
  if (
    fcfHistory.length === 0 &&
    epsHistory.length === 0 &&
    sharesHistory.length === 0 &&
    sharesOutstandingYoY == null
  )
    return null;
  return {
    fcfHistory,
    epsHistory,
    sharesHistory,
    sharesOutstandingYoY,
    ocfHistory,
    capexHistory,
    netIncomeHistory,
    depreciationHistory,
  };
}

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
  const cash = latestCashWithFx(facts);
  return {
    operatingCashflow: ocf.val,
    capex,
    freeCashflow: capex != null ? ocf.val - capex : null,
    fiscalYearEnd: ocf.end,
    totalCash: cash?.usd ?? null,
    fxRate: cash?.fxRate ?? null,
    reportingCurrency: cash?.ccy ?? null,
  };
}

let tickerMapCache: { at: number; map: Map<string, string> } | null = null;
async function cikForTicker(ticker: string): Promise<string | null> {
  const known = KNOWN_CIK[ticker];
  if (known) return known.padStart(10, '0');
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

const factsCache = new Map<string, { at: number; facts: any | null }>();

/** companyfacts crudo de EDGAR con cache 24 h compartida entre parsers. */
async function fetchEdgarFacts(ticker: string): Promise<any | null> {
  const c = factsCache.get(ticker);
  if (c && Date.now() - c.at < DAY) return c.facts;
  let facts: any | null = null;
  try {
    const cik = await cikForTicker(ticker);
    if (cik) {
      const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
      let res = await fetch(url, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) {
        // Un reintento corto: la SEC limita por IP y un 403/429 transitorio
        // desde IPs compartidas no debe matar el respaldo por 24 h.
        await new Promise((r) => setTimeout(r, 600));
        res = await fetch(url, {
          headers: { 'user-agent': UA },
          signal: AbortSignal.timeout(9000),
        });
      }
      if (res.ok) facts = await res.json();
    }
  } catch {
    facts = null;
  }
  factsCache.set(ticker, { at: Date.now(), facts });
  return facts;
}

/** Flujo anual auditado (SEC) para un ticker US-listed. Cache 24 h. */
export async function fetchEdgarAnnualCashflow(tickerRaw: string): Promise<EdgarCashflow | null> {
  const ticker = tickerRaw.toUpperCase().replace(/\./g, '-');
  const facts = await fetchEdgarFacts(ticker);
  return facts ? parseEdgarCashflow(facts) : null;
}

/** Series anuales auditadas (FCF y EPS) para normalización de bases. Cache 24 h. */
export async function fetchEdgarSeries(tickerRaw: string): Promise<EdgarSeries | null> {
  const ticker = tickerRaw.toUpperCase().replace(/\./g, '-');
  const facts = await fetchEdgarFacts(ticker);
  return facts ? parseEdgarSeries(facts) : null;
}

// ─── Derivación TTM desde estados reportados (R12.3) ─────────────────
//
// El ANCLA DE CAJA REAL mide un HECHO reportado — el flujo de caja
// libre de los últimos 12 meses —, así que su fuente primaria son los
// estados reportados y no el campo TTM de un proveedor: esa cifra es
// una derivación opaca que para GOOG devolvía el signo invertido
// respecto de sus balances. Acá la ventana móvil se reconstruye desde
// los puntos reportados, por concepto:
//   · si el emisor publica un punto «rodante» de ~12 meses que termina
//     en su trimestre más reciente (Amazon lo tagea en cada 10-Q), se
//     usa ese punto;
//   · si no, la fórmula clásica FY + YTD − YTDpy: año fiscal cerrado
//     + acumulado del año en curso − el mismo acumulado del año
//     anterior, todo con puntos reportados.
// Si el emisor solo tiene puntos de años fiscales cerrados (filers
// 20-F cuyas presentaciones intermedias no quedan tageadas en los
// company facts), la derivación devuelve windowKind 'fy': mide el
// último año fiscal, NO los últimos 12 meses, y el consumidor decide
// si esa ventana sirve para el ancla (server/cashAnchor.ts).

export interface EdgarTtmCashflow {
  operatingCashflow: number;
  /** Capex como monto positivo. */
  capex: number;
  freeCashflow: number;
  /** Último día de la ventana derivada (ISO). */
  periodEnd: string;
  /** 'ttm' = ventana móvil construida con puntos intermedios
   *  (rodante reportado o FY+YTD−YTDpy); 'fy' = solo el año fiscal
   *  cerrado, sin puntos intermedios. */
  windowKind: 'ttm' | 'fy';
}

interface DurationPoint {
  start: string;
  end: string;
  val: number;
  filed: string;
}

const DAY_MS = 86_400_000;

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

const isAnnualish = (p: DurationPoint): boolean => {
  const d = dayDiff(p.start, p.end);
  return d >= 330 && d <= 400;
};
const isInterim = (p: DurationPoint): boolean => {
  const d = dayDiff(p.start, p.end);
  return d >= 60 && d < 330;
};

/** Puntos con duración (start/end) de UN concepto en una unidad:
 *  ante duplicados por re-presentación gana el filed más reciente. */
function conceptDurationPoints(factsJson: any, concept: string, unit: string): DurationPoint[] {
  const byKey = new Map<string, DurationPoint>();
  for (const ns of ['us-gaap', 'ifrs-full']) {
    const arr = factsJson?.facts?.[ns]?.[concept]?.units?.[unit];
    if (!Array.isArray(arr)) continue;
    for (const p of arr) {
      if (!p || typeof p.val !== 'number' || !Number.isFinite(p.val)) continue;
      if (!p.start || !p.end) continue;
      const dur = dayDiff(p.start, p.end);
      if (dur < 60 || dur > 460) continue;
      const key = `${p.start}|${p.end}`;
      const filed = typeof p.filed === 'string' ? p.filed : '';
      const prev = byKey.get(key);
      if (!prev || filed >= prev.filed) byKey.set(key, { start: p.start, end: p.end, val: p.val, filed });
    }
  }
  return [...byKey.values()];
}

interface FlowDerivation {
  val: number;
  kind: 'rolling' | 'fy-ytd' | 'fy';
  end: string;
}

/** FY + YTD − YTDpy con los puntos dados, para la ventana que termina
 *  en targetEnd. null si falta alguna pata. */
function deriveFormulaAt(points: DurationPoint[], targetEnd: string): number | null {
  const ytds = points
    .filter((p) => isInterim(p) && Math.abs(dayDiff(p.end, targetEnd)) <= 4)
    .sort((a, b) => dayDiff(a.start, a.end) - dayDiff(b.start, b.end));
  const ytd = ytds[ytds.length - 1];
  if (!ytd) return null;
  const ytdDur = dayDiff(ytd.start, ytd.end);
  const fy = points.find(
    (p) => isAnnualish(p) && Math.abs(dayDiff(p.end, ytd.start) - 1) <= 4
  );
  if (!fy) return null;
  const ytdPy = points.find(
    (p) =>
      Math.abs(dayDiff(p.end, targetEnd) - 365) <= 12 &&
      Math.abs(dayDiff(p.start, p.end) - ytdDur) <= 12
  );
  if (!ytdPy) return null;
  return fy.val + ytd.val - ytdPy.val;
}

/** Deriva UN flujo (operativo o capex) para la ventana que termina en
 *  targetEnd, desde los puntos de un concepto. */
function deriveFlowAt(points: DurationPoint[], targetEnd: string): FlowDerivation | null {
  if (points.length === 0) return null;
  const annual = points
    .filter((p) => isAnnualish(p) && Math.abs(dayDiff(p.end, targetEnd)) <= 4)
    .sort((a, b) => (a.filed < b.filed ? 1 : -1))[0];
  // ¿El concepto tiene puntos intermedios recientes? Si los tiene, un
  // punto de ~12 meses que termina en un trimestre ES el rodante
  // reportado; si no los tiene, ese punto es su año fiscal.
  const hasInterim = points.some((p) => isInterim(p) && dayDiff(p.end, targetEnd) <= 400);
  const viaFormula = deriveFormulaAt(points, targetEnd);
  if (viaFormula != null) return { val: viaFormula, kind: 'fy-ytd', end: targetEnd };
  if (annual) return { val: annual.val, kind: hasInterim ? 'rolling' : 'fy', end: targetEnd };
  return null;
}

const KIND_RANK: Record<FlowDerivation['kind'], number> = { 'fy-ytd': 3, rolling: 2, fy: 1 };

/** Mejor derivación de un flujo en targetEnd entre sus conceptos:
 *  manda la construcción más fiel a la ventana móvil (un concepto
 *  abandonado —p. ej. el capex viejo de Amazon, sin puntos desde
 *  2017— nunca le gana al vigente). */
function deriveFlow(factsJson: any, concepts: string[], unit: string, targetEnd: string): FlowDerivation | null {
  let best: FlowDerivation | null = null;
  for (const concept of concepts) {
    const d = deriveFlowAt(conceptDurationPoints(factsJson, concept, unit), targetEnd);
    if (d && (!best || KIND_RANK[d.kind] > KIND_RANK[best.kind])) best = d;
  }
  return best;
}

/** Fines de ventana candidatos: los fines de cualquier punto
 *  utilizable de ambos flujos (más nuevo primero). */
function candidateEnds(factsJson: any, unit: string): string[] {
  const ends = new Set<string>();
  for (const concept of [...OCF_CONCEPTS, ...CAPEX_CONCEPTS]) {
    for (const p of conceptDurationPoints(factsJson, concept, unit)) ends.add(p.end);
  }
  return [...ends].sort().reverse().slice(0, 8);
}

function deriveTtmInUnit(factsJson: any, unit: string): EdgarTtmCashflow | null {
  const ends = candidateEnds(factsJson, unit);
  const freshest = ends[0];
  for (const end of ends) {
    // La ventana del ancla es la ÚLTIMA reportada: se tolera que un
    // flujo rezague al otro un trimestre (≤ 100 días), pero jamás se
    // acepta una ventana vieja como si fuera los últimos 12 meses
    // (si un flujo dejó de tagearse, no hay derivación: respaldo).
    if (freshest && dayDiff(end, freshest) > 100) break;
    const ocf = deriveFlow(factsJson, OCF_CONCEPTS, unit, end);
    const capex = deriveFlow(factsJson, CAPEX_CONCEPTS, unit, end);
    if (!ocf || !capex) continue;
    const windowKind: EdgarTtmCashflow['windowKind'] =
      ocf.kind === 'fy' && capex.kind === 'fy' ? 'fy' : 'ttm';
    return {
      operatingCashflow: ocf.val,
      capex: Math.abs(capex.val),
      freeCashflow: ocf.val - Math.abs(capex.val),
      periodEnd: end,
      windowKind,
    };
  }
  return null;
}

export function parseEdgarTtmCashflow(factsJson: any): EdgarTtmCashflow | null {
  if (!factsJson?.facts) return null;
  const usd = deriveTtmInUnit(factsJson, 'USD');
  if (usd) return usd;
  // Sin unidades USD: derivar en la moneda de reporte y traducir con
  // la tasa implícita en el par de caja (mismo criterio que la serie
  // histórica: latestCashWithFx). Si tampoco se puede, no hay dato.
  const cash = latestCashWithFx(factsJson.facts);
  if (cash && cash.fxRate != null && cash.fxRate > 0 && cash.ccy && cash.ccy !== 'USD') {
    const fx = cash.fxRate;
    const local = deriveTtmInUnit(factsJson, cash.ccy);
    if (local) {
      return {
        operatingCashflow: local.operatingCashflow / fx,
        capex: local.capex / fx,
        freeCashflow: local.freeCashflow / fx,
        periodEnd: local.periodEnd,
        windowKind: local.windowKind,
      };
    }
  }
  return null;
}

export async function fetchEdgarTtmCashflow(tickerRaw: string): Promise<EdgarTtmCashflow | null> {
  const ticker = tickerRaw.toUpperCase().replace(/\./g, '-');
  const facts = await fetchEdgarFacts(ticker);
  return facts ? parseEdgarTtmCashflow(facts) : null;
}
