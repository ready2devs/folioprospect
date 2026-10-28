/**
 * Parser puro de la tabla «snapshot» de Finviz (finviz.com/quote.ashx).
 *
 * Finviz publica en una sola página el catálogo completo de fundamentales
 * que Yahoo quoteSummary no trae (EPS next 5Y, ROIC real, EV/Sales, P/C,
 * deuda de largo plazo, crecimientos históricos 3/5Y, ownership, short…).
 * Esta función es pura (HTML string → objeto) para poder testearla sin red;
 * el fetch con caché vive en server/finviz.ts.
 */

export interface FinvizFundamentals {
  marketCap: number | null;
  enterpriseValue: number | null;
  income: number | null;
  sales: number | null;
  bookPerShare: number | null;
  cashPerShare: number | null;
  dividendEstPct: number | null;
  dividendTtmPct: number | null;
  dividendGrowth3Y: number | null;
  dividendGrowth5Y: number | null;
  payoutPct: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  priceToCash: number | null;
  priceToFcf: number | null;
  evToEbitda: number | null;
  evToSales: number | null;
  quickRatio: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  ltDebtToEquity: number | null;
  epsTtm: number | null;
  epsNextYearAbs: number | null;
  epsNextQuarterAbs: number | null;
  epsThisYearPct: number | null;
  epsNextYearPct: number | null;
  epsNext5YPct: number | null;
  epsPast3YPct: number | null;
  epsPast5YPct: number | null;
  salesPast3YPct: number | null;
  salesPast5YPct: number | null;
  epsYoyTtmPct: number | null;
  salesYoyTtmPct: number | null;
  epsQqPct: number | null;
  salesQqPct: number | null;
  earningsDateText: string;
  /** Texto crudo de «Dividend Ex-Date» de Finviz, ej. «Dec 10, 2026». */
  dividendExDateText: string;
  epsSurprisePct: number | null;
  salesSurprisePct: number | null;
  insiderOwnPct: number | null;
  insiderTransPct: number | null;
  instOwnPct: number | null;
  instTransPct: number | null;
  roaPct: number | null;
  roePct: number | null;
  roicPct: number | null;
  grossMarginPct: number | null;
  operatingMarginPct: number | null;
  profitMarginPct: number | null;
  sma20DistPct: number | null;
  sma50DistPct: number | null;
  sma200DistPct: number | null;
  sharesOutstanding: number | null;
  sharesFloat: number | null;
  shortFloatPct: number | null;
  shortRatio: number | null;
  shortInterest: number | null;
  high52w: number | null;
  high52wDistPct: number | null;
  low52w: number | null;
  low52wDistPct: number | null;
  volatilityWeekPct: number | null;
  volatilityMonthPct: number | null;
  atr14: number | null;
  rsi14: number | null;
  beta: number | null;
  relVolume: number | null;
  avgVolume: number | null;
  perfYtdPct: number | null;
  perfYearPct: number | null;
  recom: number | null;
  targetPrice: number | null;
  price: number | null;
}

export const EMPTY_FINVIZ: FinvizFundamentals = {
  marketCap: null,
  enterpriseValue: null,
  income: null,
  sales: null,
  bookPerShare: null,
  cashPerShare: null,
  dividendEstPct: null,
  dividendTtmPct: null,
  dividendGrowth3Y: null,
  dividendGrowth5Y: null,
  payoutPct: null,
  pe: null,
  forwardPe: null,
  peg: null,
  priceToSales: null,
  priceToBook: null,
  priceToCash: null,
  priceToFcf: null,
  evToEbitda: null,
  evToSales: null,
  quickRatio: null,
  currentRatio: null,
  debtToEquity: null,
  ltDebtToEquity: null,
  epsTtm: null,
  epsNextYearAbs: null,
  epsNextQuarterAbs: null,
  epsThisYearPct: null,
  epsNextYearPct: null,
  epsNext5YPct: null,
  epsPast3YPct: null,
  epsPast5YPct: null,
  salesPast3YPct: null,
  salesPast5YPct: null,
  epsYoyTtmPct: null,
  salesYoyTtmPct: null,
  epsQqPct: null,
  salesQqPct: null,
  earningsDateText: '',
  dividendExDateText: '',
  epsSurprisePct: null,
  salesSurprisePct: null,
  insiderOwnPct: null,
  insiderTransPct: null,
  instOwnPct: null,
  instTransPct: null,
  roaPct: null,
  roePct: null,
  roicPct: null,
  grossMarginPct: null,
  operatingMarginPct: null,
  profitMarginPct: null,
  sma20DistPct: null,
  sma50DistPct: null,
  sma200DistPct: null,
  sharesOutstanding: null,
  sharesFloat: null,
  shortFloatPct: null,
  shortRatio: null,
  shortInterest: null,
  high52w: null,
  high52wDistPct: null,
  low52w: null,
  low52wDistPct: null,
  volatilityWeekPct: null,
  volatilityMonthPct: null,
  atr14: null,
  rsi14: null,
  beta: null,
  relVolume: null,
  avgVolume: null,
  perfYtdPct: null,
  perfYearPct: null,
  recom: null,
  targetPrice: null,
  price: null,
};

/* ─── Parsers de valores sueltos ─────────────────────────────────── */

function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFinvizPct(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s || s === '-' || s === '—') return null;
  const n = Number(s.replace('%', '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function parseFinvizNum(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s || s === '-' || s === '—') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Dinero / conteos escalados de Finviz: «2274.32B» → 2.27432e12, «29.31M» → 2.931e7. */
export function parseFinvizScaled(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/,/g, '');
  if (!s || s === '-' || s === '—') return null;
  const m = s.match(/^(-?[\d.]+)\s*([BMKT])?$/i);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult: Record<string, number> = { B: 1e9, M: 1e6, K: 1e3, T: 1e12 };
  return base * (m[2] ? mult[m[2].toUpperCase()] : 1);
}

function pctPair(raw: string): [number | null, number | null] {
  const toks = raw.split(/\s+/).filter(Boolean);
  return [parseFinvizPct(toks[0]), parseFinvizPct(toks[1])];
}

/** «4.12 (0.94%)» → 0.94 (el % entre paréntesis). */
function parenPct(raw: string): number | null {
  const m = raw.match(/\((-?[\d.]+)%\)/);
  return m ? Number(m[1]) : null;
}

/* ─── Parser principal ───────────────────────────────────────────── */

/**
 * Extrae los pares etiqueta/valor de la tabla snapshot en orden de
 * aparición. OJO con los duplicados reales de Finviz: «EPS next Y» aparece
 * dos veces (1ª = valor absoluto en US$, 2ª = % de crecimiento) y por eso
 * el mapeo se hace por etiqueta + índice de ocurrencia.
 */
export function parseFinvizSnapshot(html: string): FinvizFundamentals | null {
  if (!html || !html.includes('snapshot-td')) return null;

  // Dos layouts conviven: el clásico (etiqueta td1 / valor td2) y el nuevo
  // de Finviz (etiqueta y valor AMBOS td2, estrictamente alternados).
  const cells: { kind: string; text: string }[] = [];
  const cellRe = /<td[^>]*class="[^"]*snapshot-td([12])[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  let match: RegExpExecArray | null;
  while ((match = cellRe.exec(html)) !== null) {
    cells.push({ kind: match[1], text: cleanText(match[2]) });
  }

  const pairs: { label: string; value: string }[] = [];
  if (cells.some((c) => c.kind === '1')) {
    let pendingLabel: string | null = null;
    for (const c of cells) {
      if (c.kind === '1') {
        pendingLabel = c.text;
      } else if (pendingLabel !== null) {
        pairs.push({ label: pendingLabel, value: c.text });
        pendingLabel = null;
      }
    }
  } else {
    for (let i = 0; i + 1 < cells.length; i += 2) {
      pairs.push({ label: cells[i].text, value: cells[i + 1].text });
    }
  }
  if (pairs.length < 20) return null;

  const out: FinvizFundamentals = { ...EMPTY_FINVIZ };
  const occurrence = new Map<string, number>();

  for (const { label, value } of pairs) {
    const occ = occurrence.get(label) ?? 0;
    occurrence.set(label, occ + 1);

    switch (label) {
      case 'Market Cap': out.marketCap = parseFinvizScaled(value); break;
      case 'Enterprise Value': out.enterpriseValue = parseFinvizScaled(value); break;
      case 'Income': out.income = parseFinvizScaled(value); break;
      case 'Sales': out.sales = parseFinvizScaled(value); break;
      case 'Book/sh': out.bookPerShare = parseFinvizNum(value); break;
      case 'Cash/sh': out.cashPerShare = parseFinvizNum(value); break;
      case 'Dividend Est.': out.dividendEstPct = parenPct(value); break;
      case 'Dividend TTM': out.dividendTtmPct = parenPct(value); break;
      case 'Dividend Gr. 3/5Y': {
        const [a, b] = pctPair(value);
        out.dividendGrowth3Y = a; out.dividendGrowth5Y = b;
        break;
      }
      case 'Payout': out.payoutPct = parseFinvizPct(value); break;
      case 'P/E': out.pe = parseFinvizNum(value); break;
      case 'Forward P/E': out.forwardPe = parseFinvizNum(value); break;
      case 'PEG': out.peg = parseFinvizNum(value); break;
      case 'P/S': out.priceToSales = parseFinvizNum(value); break;
      case 'P/B': out.priceToBook = parseFinvizNum(value); break;
      case 'P/C': out.priceToCash = parseFinvizNum(value); break;
      case 'P/FCF': out.priceToFcf = parseFinvizNum(value); break;
      case 'EV/EBITDA': out.evToEbitda = parseFinvizNum(value); break;
      case 'EV/Sales': out.evToSales = parseFinvizNum(value); break;
      case 'Quick Ratio': out.quickRatio = parseFinvizNum(value); break;
      case 'Current Ratio': out.currentRatio = parseFinvizNum(value); break;
      case 'Debt/Eq': out.debtToEquity = parseFinvizNum(value); break;
      case 'LT Debt/Eq': out.ltDebtToEquity = parseFinvizNum(value); break;
      case 'EPS (ttm)': out.epsTtm = parseFinvizNum(value); break;
      case 'EPS next Y':
        if (occ === 0) out.epsNextYearAbs = parseFinvizNum(value);
        else out.epsNextYearPct = parseFinvizPct(value);
        break;
      case 'EPS next Q': out.epsNextQuarterAbs = parseFinvizNum(value); break;
      case 'EPS this Y': out.epsThisYearPct = parseFinvizPct(value); break;
      case 'EPS next 5Y': out.epsNext5YPct = parseFinvizPct(value); break;
      case 'EPS past 3/5Y': {
        const [a, b] = pctPair(value);
        out.epsPast3YPct = a; out.epsPast5YPct = b;
        break;
      }
      case 'EPS past 5Y': out.epsPast5YPct = parseFinvizPct(value); break;
      case 'Sales past 3/5Y': {
        const [a, b] = pctPair(value);
        out.salesPast3YPct = a; out.salesPast5YPct = b;
        break;
      }
      case 'Sales past 5Y': out.salesPast5YPct = parseFinvizPct(value); break;
      case 'EPS Y/Y TTM': out.epsYoyTtmPct = parseFinvizPct(value); break;
      case 'Sales Y/Y TTM': out.salesYoyTtmPct = parseFinvizPct(value); break;
      case 'EPS Q/Q': out.epsQqPct = parseFinvizPct(value); break;
      case 'Sales Q/Q': out.salesQqPct = parseFinvizPct(value); break;
      case 'Earnings': out.earningsDateText = value === '-' ? '' : value; break;
      case 'Dividend Ex-Date': out.dividendExDateText = value === '-' ? '' : value; break;
      case 'EPS/Sales Surpr.': {
        const [a, b] = pctPair(value);
        out.epsSurprisePct = a; out.salesSurprisePct = b;
        break;
      }
      case 'Insider Own': out.insiderOwnPct = parseFinvizPct(value); break;
      case 'Insider Trans': out.insiderTransPct = parseFinvizPct(value); break;
      case 'Inst Own': out.instOwnPct = parseFinvizPct(value); break;
      case 'Inst Trans': out.instTransPct = parseFinvizPct(value); break;
      case 'ROA': out.roaPct = parseFinvizPct(value); break;
      case 'ROE': out.roePct = parseFinvizPct(value); break;
      case 'ROIC': out.roicPct = parseFinvizPct(value); break;
      case 'Gross Margin': out.grossMarginPct = parseFinvizPct(value); break;
      case 'Oper. Margin': out.operatingMarginPct = parseFinvizPct(value); break;
      case 'Profit Margin': out.profitMarginPct = parseFinvizPct(value); break;
      case 'SMA20': out.sma20DistPct = parseFinvizPct(value); break;
      case 'SMA50': out.sma50DistPct = parseFinvizPct(value); break;
      case 'SMA200': out.sma200DistPct = parseFinvizPct(value); break;
      case 'Shs Outstand': out.sharesOutstanding = parseFinvizScaled(value); break;
      case 'Shs Float': out.sharesFloat = parseFinvizScaled(value); break;
      case 'Short Float': out.shortFloatPct = parseFinvizPct(value); break;
      case 'Short Ratio': out.shortRatio = parseFinvizNum(value); break;
      case 'Short Interest': out.shortInterest = parseFinvizScaled(value); break;
      case '52W High': {
        const toks = value.split(/\s+/).filter(Boolean);
        out.high52w = parseFinvizNum(toks[0]);
        out.high52wDistPct = parseFinvizPct(toks[1]);
        break;
      }
      case '52W Low': {
        const toks = value.split(/\s+/).filter(Boolean);
        out.low52w = parseFinvizNum(toks[0]);
        out.low52wDistPct = parseFinvizPct(toks[1]);
        break;
      }
      case 'Volatility': {
        const [a, b] = pctPair(value);
        out.volatilityWeekPct = a; out.volatilityMonthPct = b;
        break;
      }
      case 'ATR (14)': out.atr14 = parseFinvizNum(value); break;
      case 'RSI (14)': out.rsi14 = parseFinvizNum(value); break;
      case 'Beta': out.beta = parseFinvizNum(value); break;
      case 'Rel Volume': out.relVolume = parseFinvizNum(value); break;
      case 'Avg Volume': out.avgVolume = parseFinvizScaled(value); break;
      case 'Perf YTD': out.perfYtdPct = parseFinvizPct(value); break;
      case 'Perf Year': out.perfYearPct = parseFinvizPct(value); break;
      case 'Recom': out.recom = parseFinvizNum(value); break;
      case 'Target Price': out.targetPrice = parseFinvizNum(value); break;
      case 'Price': out.price = parseFinvizNum(value); break;
      default: break;
    }
  }

  return out;
}
