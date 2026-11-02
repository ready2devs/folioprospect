import { describe, it, expect } from 'vitest';
import { mapYahooSearchResults } from '../yahoo.js';

// Respuesta cruda real de Yahoo Search para "ONTO" (capturada el 2026-11-02):
// mezcla la acción principal (NYSE) con listados secundarios extranjeros,
// un ETF apalancado en BATS y opciones OPR. El buscador solo debe quedarse
// con instrumentos operables en bolsas soportadas.
const YAHOO_ONTO = [
  { symbol: 'ONTO', exchange: 'NYQ', exchDisp: 'NYSE', quoteType: 'EQUITY', longname: 'Onto Innovation Inc.', sectorDisp: 'Technology' },
  { symbol: 'ONTX', exchange: 'BTS', exchDisp: 'BATS Trading', quoteType: 'ETF', longname: 'Corgi ONTO 2x Daily ETF' },
  { symbol: 'NNM.MU', exchange: 'MUN', exchDisp: 'Munich', quoteType: 'EQUITY', longname: 'Onto Innovation Inc' },
  { symbol: 'NNM.F', exchange: 'FRA', exchDisp: 'Frankfurt', quoteType: 'EQUITY', longname: 'Onto Innovation Inc.' },
  { symbol: 'US6833441057.SG', exchange: 'STU', exchDisp: 'Stuttgart', quoteType: 'EQUITY', longname: 'Onto Innovation Inc.' },
  { symbol: 'ONTO261120P00155000', exchange: 'OPR', exchDisp: 'OPR', quoteType: 'OPTION', longname: 'ONTO Nov 2026 155.000 put' },
  { symbol: 'ONTO261218C00195000', exchange: 'OPR', exchDisp: 'OPR', quoteType: 'OPTION', longname: 'ONTO Dec 2026 195.000 call' },
];

describe('mapYahooSearchResults', () => {
  it('ONTO: deja la acción NYSE y el ETF de BATS (como AMEX); filtra extranjeros y opciones', () => {
    const out = mapYahooSearchResults(YAHOO_ONTO);
    expect(out.map((r: any) => r.symbol)).toEqual(['NYSE:ONTO', 'AMEX:ONTX']);
    expect(out[0].name).toBe('Onto Innovation Inc.');
    expect(out[0].exchange).toBe('NYSE');
    expect(out[0].type).toBe('Stock');
  });

  it('normaliza por código de exchange (NMS -> NASDAQ) y no por el nombre visible', () => {
    const out = mapYahooSearchResults([
      { symbol: 'ZZZZ', exchange: 'NMS', exchDisp: 'NASDAQ', quoteType: 'EQUITY', longname: 'Test Co' },
    ]);
    expect(out[0].symbol).toBe('NASDAQ:ZZZZ');
  });

  it('cripto de Yahoo (BTC-USD, CCC) se convierte a BINANCE:BTCUSDT', () => {
    const out = mapYahooSearchResults([
      { symbol: 'BTC-USD', exchange: 'CCC', exchDisp: 'CCC', quoteType: 'CRYPTOCURRENCY', longname: 'Bitcoin USD' },
    ]);
    expect(out[0].symbol).toBe('BINANCE:BTCUSDT');
    expect(out[0].type).toBe('Crypto');
  });

  it('descarta códigos de fondos mutuos que empiezan con dígito', () => {
    const out = mapYahooSearchResults([
      { symbol: '0P000103FC.L', exchange: 'LSE', exchDisp: 'LSE', quoteType: 'MUTUALFUND', longname: 'Wellington Fund' },
    ]);
    expect(out).toEqual([]);
  });

  it('descarta tipos no operables aunque la bolsa sea válida', () => {
    const out = mapYahooSearchResults([
      { symbol: 'ES=F', exchange: 'CME', exchDisp: 'CME', quoteType: 'FUTURE', longname: 'S&P 500 Future' },
      { symbol: 'XXXX261120C00010000', exchange: 'OPR', exchDisp: 'OPR', quoteType: 'OPTION', longname: 'Call' },
    ]);
    expect(out).toEqual([]);
  });
});
