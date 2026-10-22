import type { CurrencyCode } from './types.js';

export function tvToYahooSymbol(tvSymbol: string): string {
  if (!tvSymbol) return 'NVDA';
  const upper = tvSymbol.trim().toUpperCase();
  const specialMap: Record<string, string> = {
    'SP:SPX': '^GSPC',
    'SP_DLY:SPX': '^GSPC',
    'NASDAQ:NDX': '^NDX',
    'NASDAQ:IXIC': '^IXIC',
    'DJ:DJI': '^DJI',
    'CBOE:VIX': '^VIX',
    'BCBA:IMV': '^MERV',
    'INDEX:MERV': '^MERV',
    'COMEX:GC1!': 'GC=F',
    'TVC:GOLD': 'GC=F',
  };
  if (specialMap[upper]) return specialMap[upper];
  if (upper.includes(':')) {
    const [ex, ticker] = upper.split(':');
    if (ex === 'BINANCE' || ex === 'COINBASE' || ex === 'CRYPTO') {
      if (ticker.endsWith('USDT')) return ticker.replace(/USDT$/, '-USD');
      if (ticker.endsWith('USD') && !ticker.includes('-')) return ticker.replace(/USD$/, '-USD');
    }
    return ticker;
  }
  return upper;
}

export function cleanTicker(tvSymbol: string): string {
  if (!tvSymbol) return '';
  return tvSymbol.includes(':') ? tvSymbol.split(':')[1] : tvSymbol;
}

export function convertCurrency(
  amountUsd: number,
  currency: CurrencyCode,
  fxRates: Record<CurrencyCode, number>
): number {
  const rate = fxRates[currency] ?? 1;
  return amountUsd * rate;
}

export function formatMoney(
  amountUsd: number,
  currency: CurrencyCode = 'USD',
  fxRates: Record<CurrencyCode, number> = { USD: 1, ARS: 1180, EUR: 0.92 },
  options: { compact?: boolean; signed?: boolean; decimals?: number } = {}
): string {
  const val = convertCurrency(amountUsd, currency, fxRates);
  const abs = Math.abs(val);
  const sign = val < -0.0001 ? '−' : options.signed && val > 0.0001 ? '+' : '';

  if (options.compact) {
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T ${currency}`;
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} B ${currency}`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)} M ${currency}`;
  }

  const decimals = options.decimals ?? (currency === 'ARS' && abs >= 1000 ? 0 : 2);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}${formatted} ${currency}`;
}

export function formatNumber(
  num: number,
  decimals = 2,
  signed = false
): string {
  if (!Number.isFinite(num)) return '—';
  const abs = Math.abs(num);
  const sign = num < -1e-6 ? '−' : signed && num > 1e-6 ? '+' : '';
  return `${sign}${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatPct(pct: number, signed = true, decimals = 2): string {
  if (!Number.isFinite(pct)) return '—';
  const abs = Math.abs(pct);
  const sign = pct < -1e-5 ? '−' : signed && pct > 1e-5 ? '+' : '';
  return `${sign}${abs.toFixed(decimals)}%`;
}
