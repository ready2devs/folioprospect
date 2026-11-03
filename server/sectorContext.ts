/**
 * Contexto del sector para el múltiplo justificado (R11,
 * docs/VALUATION-RULES.md): las medianas de la industria de Finviz
 * (los pares más grandes por capitalización) — P/E forward, ROIC y
 * crecimiento de EPS a 5 años. Es la concesión «por sector» del
 * sistema: lo que el sector vale lo pone el mercado, y la empresa se
 * compara contra esas medianas con la fórmula justificada.
 *
 * Una sola fuente (Finviz: el screener da los pares y la ficha de
 * cada par trae los tres datos), caché de 6 h por industria. Nunca
 * lanza: sin contexto, el motor cae por su escalera de respaldo
 * documentada (justificado propio → P/E propio → tabla).
 */
import { cleanTicker } from '../shared/engine/format.js';
import { fetchFinvizFundamentals } from './finviz.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface SectorContext {
  /** Mediana del P/E forward de los pares (sin el propio activo). */
  forwardPe: number | null;
  /** Mediana del ROIC % de los pares. */
  roicPct: number | null;
  /** Mediana del crecimiento de EPS a 5 años % de los pares. */
  growth5yPct: number | null;
  /** Cantidad de pares que aportaron al menos un dato. */
  peersUsed: number;
  /** Slug de industria de Finviz (ind_...) del que salen las medianas. */
  industrySlug: string;
}

const medianOf = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const slugCache = new Map<string, { slug: string | null; at: number }>();
const ctxCache = new Map<string, { ctx: SectorContext | null; at: number }>();
const SLUG_TTL_MS = 6 * 3600 * 1000;
const CTX_TTL_MS = 6 * 3600 * 1000;

/** Slug de industria de Finviz (ind_...) desde la página de la acción. */
export async function finvizIndustrySlug(ticker: string): Promise<string | null> {
  const t = (ticker || '').toUpperCase();
  const c = slugCache.get(t);
  if (c && Date.now() - c.at < SLUG_TTL_MS) return c.slug;
  let slug: string | null = null;
  try {
    const res = await fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(t)}&p=d`, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/f=ind_([a-z0-9_]+)/i);
      slug = m ? m[1] : null;
    }
  } catch {
    slug = null;
  }
  slugCache.set(t, { slug, at: Date.now() });
  return slug;
}

/**
 * Medianas sectoriales para un ticker: screener de su industria
 * ordenado por capitalización, hasta 8 pares (sin el propio activo),
 * con los fundamentales de Finviz de cada uno. Con menos de 2 pares
 * con P/E forward válido, el P/E sectorial queda null (la escalera
 * del motor decide); las demás medianas se devuelven si existen.
 */
export async function fetchSectorContext(ticker: string): Promise<SectorContext | null> {
  const t = cleanTicker((ticker || '').toUpperCase()).toUpperCase();
  if (!t) return null;
  const slug = await finvizIndustrySlug(t);
  if (!slug) return null;
  const cached = ctxCache.get(slug);
  if (cached && Date.now() - cached.at < CTX_TTL_MS) return cached.ctx;

  let ctx: SectorContext | null = null;
  try {
    // Finviz rediseñó el screener: la URL canónica pasó a
    // /screener/stocks con f=industry_<slug> y los tickers vienen en
    // un JSON embebido ("ticker":"NVDA") en orden de capitalización;
    // los enlaces pasaron a /quote?t=. Se prueban ambos formatos.
    const res = await fetch(
      `https://finviz.com/screener/stocks?v=111&f=industry_${slug}&o=-marketcap`,
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) {
      const html = await res.text();
      const tickers: string[] = [];
      const reJson = /"ticker":"([A-Z0-9.\-]{1,12})"/g;
      let m: RegExpExecArray | null;
      while ((m = reJson.exec(html)) && tickers.length < 12) {
        const tk = m[1].toUpperCase();
        if (tk !== t && !tickers.includes(tk)) tickers.push(tk);
      }
      if (tickers.length < 2) {
        const reLink = /\/quote\?t=([A-Z0-9.\-]{1,12})/g;
        while ((m = reLink.exec(html)) && tickers.length < 12) {
          const tk = m[1].toUpperCase();
          if (tk !== t && !tickers.includes(tk)) tickers.push(tk);
        }
      }
      const peerFunds = await Promise.all(
        tickers.slice(0, 8).map((tk) => fetchFinvizFundamentals(tk).catch(() => null))
      );
      const pes: number[] = [];
      const roics: number[] = [];
      const growths: number[] = [];
      let used = 0;
      for (const f of peerFunds) {
        if (!f) continue;
        let any = false;
        if (f.forwardPe != null && f.forwardPe > 0) { pes.push(f.forwardPe); any = true; }
        if (f.roicPct != null && Number.isFinite(f.roicPct)) { roics.push(f.roicPct); any = true; }
        if (f.epsNext5YPct != null && Number.isFinite(f.epsNext5YPct)) { growths.push(f.epsNext5YPct); any = true; }
        if (any) used++;
      }
      ctx = {
        forwardPe: pes.length >= 2 ? medianOf(pes) : null,
        roicPct: medianOf(roics),
        growth5yPct: medianOf(growths),
        peersUsed: used,
        industrySlug: slug,
      };
    }
  } catch {
    ctx = null;
  }
  ctxCache.set(slug, { ctx, at: Date.now() });
  return ctx;
}
