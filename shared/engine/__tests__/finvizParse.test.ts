import { describe, expect, it } from 'vitest';
import {
  parseFinvizPct,
  parseFinvizScaled,
  parseFinvizSnapshot,
} from '../finvizParse.js';

function cell(label: string, value: string): string {
  return `<td class="snapshot-td1" align="left">${label}</td><td class="snapshot-td2" align="left"><b>${value}</b></td>`;
}

// Fixture mínimo con la forma real de la tabla snapshot de Finviz:
// incluye el duplicado «EPS next Y» (1ª absoluto, 2ª %), pares separados
// por espacio y valores «-» (sin dato).
const FIXTURE = `<table class="snapshot-table2"><tr>
${cell('Index', '-')}
${cell('P/E', '28.22')}
${cell('EPS (ttm)', '15.54')}
${cell('Insider Own', '0.08%')}
${cell('Shs Outstand', '5.19B')}
${cell('Perf Week', '1.53%')}
</tr><tr>
${cell('Market Cap', '2274.28B')}
${cell('Forward P/E', '19.03')}
${cell('EPS next Y', '23.05')}
${cell('Insider Trans', '-9.98%')}
${cell('Shs Float', '5.18B')}
${cell('Perf Month', '-4.04%')}
</tr><tr>
${cell('Enterprise Value', '2180.40B')}
${cell('P/S', '14.54')}
${cell('EPS next Q', '5.09')}
${cell('Inst Own', '15.10%')}
${cell('Short Float', '0.57%')}
${cell('Perf Quarter', '8.73%')}
</tr><tr>
${cell('Income', '80.58B')}
${cell('PEG', '0.47')}
${cell('EPS this Y', '64.12%')}
${cell('Inst Trans', '2.19%')}
${cell('Short Ratio', '2.70')}
${cell('Perf Half Y', '11.34%')}
</tr><tr>
${cell('Sales', '156.42B')}
${cell('P/B', '11.26')}
${cell('EPS next Y', '33.81%')}
${cell('ROA', '28.93%')}
${cell('Short Interest', '29.31M')}
${cell('Perf Year', '45.43%')}
</tr><tr>
${cell('Book/sh', '38.93')}
${cell('P/C', '18.02')}
${cell('EPS next 5Y', '40.71%')}
${cell('ROE', '41.98%')}
${cell('52W High', '487.47 -10.04%')}
${cell('Perf YTD', '44.30%')}
</tr><tr>
${cell('Cash/sh', '24.33')}
${cell('P/FCF', '45.60')}
${cell('EPS past 3/5Y', '17.37% 25.67%')}
${cell('ROIC', '33.02%')}
${cell('52W Low', '266.82 64.34%')}
${cell('Perf 3Y', '409.95%')}
</tr><tr>
${cell('Dividend Est.', '4.12 (0.94%)')}
${cell('EV/EBITDA', '19.13')}
${cell('Sales past 3/5Y', '17.20% 21.86%')}
${cell('Gross Margin', '65.07%')}
${cell('Volatility', '2.73% 2.52%')}
${cell('Perf 5Y', '277.99%')}
</tr><tr>
${cell('Dividend TTM', '3.77 (0.86%)')}
${cell('EV/Sales', '13.94')}
${cell('EPS Y/Y TTM', '57.78%')}
${cell('Oper. Margin', '57.79%')}
${cell('ATR (14)', '12.14')}
${cell('Perf 10Y', '1325.10%')}
</tr><tr>
${cell('Dividend Ex-Date', 'Dec 10, 2026')}
${cell('Quick Ratio', '2.37')}
${cell('Sales Y/Y TTM', '35.21%')}
${cell('Profit Margin', '51.52%')}
${cell('RSI (14)', '51.39')}
${cell('Recom', '1.30')}
</tr><tr>
${cell('Dividend Gr. 3/5Y', '25.39% 14.54%')}
${cell('Current Ratio', '2.58')}
${cell('EPS Q/Q', '-0.86%')}
${cell('Payout', '25.98%')}
${cell('Avg Volume', '10.85M')}
${cell('Price', '438.50')}
</tr><tr>
${cell('Employees', '-')}
${cell('Debt/Eq', '0.14')}
${cell('Sales Q/Q', '41.11%')}
${cell('Earnings', 'Oct 15 BMO')}
${cell('Target Price', '553.18')}
${cell('Rel Volume', '0.61')}
</tr><tr>
${cell('IPO Date', 'Oct 08, 1997')}
${cell('LT Debt/Eq', '0.11')}
${cell('EPS/Sales Surpr.', '1.75% 0.86%')}
${cell('Beta', '1.43')}
${cell('SMA20', '-0.86%')}
${cell('SMA50', '0.87%')}
</tr><tr>
${cell('SMA200', '9.83%')}
${cell('Option/Short', 'Yes / Yes')}
</tr></table>`;

describe('parseFinvizSnapshot', () => {
  it('parsea el catálogo completo de TSM (fixture)', () => {
    const f = parseFinvizSnapshot(FIXTURE);
    expect(f).not.toBeNull();
    expect(f!.marketCap).toBeCloseTo(2274.28e9, 0);
    expect(f!.enterpriseValue).toBeCloseTo(2180.4e9, 0);
    expect(f!.income).toBeCloseTo(80.58e9, 0);
    expect(f!.sales).toBeCloseTo(156.42e9, 0);
    expect(f!.pe).toBe(28.22);
    expect(f!.forwardPe).toBe(19.03);
    expect(f!.peg).toBe(0.47);
    expect(f!.priceToSales).toBe(14.54);
    expect(f!.priceToBook).toBe(11.26);
    expect(f!.priceToCash).toBe(18.02);
    expect(f!.priceToFcf).toBe(45.6);
    expect(f!.evToEbitda).toBe(19.13);
    expect(f!.evToSales).toBe(13.94);
    expect(f!.roicPct).toBe(33.02);
    expect(f!.roePct).toBe(41.98);
    expect(f!.roaPct).toBe(28.93);
    expect(f!.targetPrice).toBe(553.18);
    expect(f!.price).toBe(438.5);
  });

  it('desambigua el duplicado «EPS next Y»: 1ª absoluto, 2ª porcentaje', () => {
    const f = parseFinvizSnapshot(FIXTURE)!;
    expect(f.epsNextYearAbs).toBe(23.05);
    expect(f.epsNextYearPct).toBe(33.81);
    expect(f.epsNextQuarterAbs).toBe(5.09);
    expect(f.epsThisYearPct).toBe(64.12);
    expect(f.epsNext5YPct).toBe(40.71);
  });

  it('parsea pares separados por espacio', () => {
    const f = parseFinvizSnapshot(FIXTURE)!;
    expect(f.epsPast3YPct).toBe(17.37);
    expect(f.epsPast5YPct).toBe(25.67);
    expect(f.salesPast3YPct).toBe(17.2);
    expect(f.salesPast5YPct).toBe(21.86);
    expect(f.dividendGrowth3Y).toBe(25.39);
    expect(f.dividendGrowth5Y).toBe(14.54);
    expect(f.high52w).toBe(487.47);
    expect(f.high52wDistPct).toBe(-10.04);
    expect(f.low52w).toBe(266.82);
    expect(f.low52wDistPct).toBe(64.34);
    expect(f.volatilityWeekPct).toBe(2.73);
    expect(f.volatilityMonthPct).toBe(2.52);
    expect(f.epsSurprisePct).toBe(1.75);
    expect(f.salesSurprisePct).toBe(0.86);
  });

  it('extrae el % entre paréntesis de los dividendos y el texto de earnings', () => {
    const f = parseFinvizSnapshot(FIXTURE)!;
    expect(f.dividendEstPct).toBe(0.94);
    expect(f.dividendTtmPct).toBe(0.86);
    expect(f.dividendExDateText).toBe('Dec 10, 2026');
    expect(f.earningsDateText).toBe('Oct 15 BMO');
    expect(f.payoutPct).toBe(25.98);
  });

  it('escalados, ownership, short y técnicos', () => {
    const f = parseFinvizSnapshot(FIXTURE)!;
    expect(f.sharesOutstanding).toBeCloseTo(5.19e9, 0);
    expect(f.sharesFloat).toBeCloseTo(5.18e9, 0);
    expect(f.shortInterest).toBeCloseTo(29.31e6, 0);
    expect(f.avgVolume).toBeCloseTo(10.85e6, 0);
    expect(f.insiderOwnPct).toBe(0.08);
    expect(f.insiderTransPct).toBe(-9.98);
    expect(f.instOwnPct).toBe(15.1);
    expect(f.shortFloatPct).toBe(0.57);
    expect(f.shortRatio).toBe(2.7);
    expect(f.rsi14).toBe(51.39);
    expect(f.atr14).toBe(12.14);
    expect(f.beta).toBe(1.43);
    expect(f.sma20DistPct).toBe(-0.86);
    expect(f.sma200DistPct).toBe(9.83);
    expect(f.debtToEquity).toBe(0.14);
    expect(f.ltDebtToEquity).toBe(0.11);
    expect(f.quickRatio).toBe(2.37);
    expect(f.currentRatio).toBe(2.58);
    expect(f.bookPerShare).toBe(38.93);
    expect(f.cashPerShare).toBe(24.33);
    expect(f.epsTtm).toBe(15.54);
    expect(f.epsYoyTtmPct).toBe(57.78);
    expect(f.salesYoyTtmPct).toBe(35.21);
    expect(f.epsQqPct).toBe(-0.86);
    expect(f.salesQqPct).toBe(41.11);
    expect(f.perfYtdPct).toBe(44.3);
    expect(f.perfYearPct).toBe(45.43);
    expect(f.recom).toBe(1.3);
    expect(f.relVolume).toBe(0.61);
  });

  it('soporta el layout nuevo de Finviz (etiqueta y valor ambos td2, alternados)', () => {
    const altLayout = FIXTURE.replaceAll('snapshot-td1', 'snapshot-td2');
    const f = parseFinvizSnapshot(altLayout);
    expect(f).not.toBeNull();
    expect(f!.epsNext5YPct).toBe(40.71);
    expect(f!.priceToSales).toBe(14.54);
    expect(f!.epsNextYearAbs).toBe(23.05);
    expect(f!.epsNextYearPct).toBe(33.81);
  });

  it('devuelve null sin tabla snapshot o con muy pocos pares', () => {
    expect(parseFinvizSnapshot('<html><body>nada</body></html>')).toBeNull();
    expect(parseFinvizSnapshot(cell('P/E', '28.22'))).toBeNull();
    expect(parseFinvizSnapshot('')).toBeNull();
  });
});

describe('parsers sueltos', () => {
  it('pct / scaled tratan «-» como null', () => {
    expect(parseFinvizPct('-')).toBeNull();
    expect(parseFinvizPct('-10.04%')).toBe(-10.04);
    expect(parseFinvizScaled('-')).toBeNull();
    expect(parseFinvizScaled('1,234.56')).toBe(1234.56);
    expect(parseFinvizScaled('2.5T')).toBe(2.5e12);
    expect(parseFinvizScaled('900K')).toBe(900000);
  });
});
