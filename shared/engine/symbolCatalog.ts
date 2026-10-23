import type { AssetMeta, AssetType } from './types.js';

export interface CatalogSymbolEntry {
  symbol: string;
  ticker: string;
  name: string;
  exchange: string;
  type: AssetType;
  sector: string;
  industry?: string;
  country?: string;
  yahoo: string;
  refPrice?: number;
}

const EXCHANGE_TYPO_MAP: Record<string, string> = {
  BINANE: 'BINANCE',
  BINACE: 'BINANCE',
  BINANC: 'BINANCE',
  BIANANCE: 'BINANCE',
  BINNANCE: 'BINANCE',
  CRYPTO: 'BINANCE',
  COINBASE: 'BINANCE',
  NASDA: 'NASDAQ',
  NASDQ: 'NASDAQ',
  NSDQ: 'NASDAQ',
  NASD: 'NASDAQ',
  NMS: 'NASDAQ',
  NGM: 'NASDAQ',
  NCM: 'NASDAQ',
  NASDAQGS: 'NASDAQ',
  NASDAQGM: 'NASDAQ',
  NASDAQCM: 'NASDAQ',
  NYS: 'NYSE',
  NYE: 'NYSE',
  NYQ: 'NYSE',
  NYSEARCA: 'AMEX',
  ARCA: 'AMEX',
  PCX: 'AMEX',
  ASE: 'AMEX',
  BATS: 'AMEX',
  BYMA: 'BCBA',
  BCBA: 'BCBA',
  BUE: 'BCBA',
};

export const TRADINGVIEW_CATALOG: CatalogSymbolEntry[] = [
  // 20 Portfolio Seed Assets
  { symbol: 'NASDAQ:NVDA', ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'NVDA', refPrice: 201.68 },
  { symbol: 'NYSE:TSM', ticker: 'TSM', name: 'Taiwan Semiconductor Manufacturing Co.', exchange: 'NYSE', type: 'Dr', sector: 'Technology', yahoo: 'TSM', refPrice: 294.52 },
  { symbol: 'NASDAQ:MU', ticker: 'MU', name: 'Micron Technology, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'MU', refPrice: 221.97 },
  { symbol: 'NASDAQ:GOOG', ticker: 'GOOG', name: 'Alphabet Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Communication Services', yahoo: 'GOOG', refPrice: 268.43 },
  { symbol: 'NASDAQ:MSFT', ticker: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'MSFT', refPrice: 541.55 },
  { symbol: 'NASDAQ:META', ticker: 'META', name: 'Meta Platforms, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Communication Services', yahoo: 'META', refPrice: 751.63 },
  { symbol: 'NYSE:NU', ticker: 'NU', name: 'Nu Holdings Ltd.', exchange: 'NYSE', type: 'Stock', sector: 'Financial Services', yahoo: 'NU', refPrice: 15.86 },
  { symbol: 'NASDAQ:AMZN', ticker: 'AMZN', name: 'Amazon.com, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Consumer Cyclical', yahoo: 'AMZN', refPrice: 230.30 },
  { symbol: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', name: 'Bitcoin / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'BTC-USD', refPrice: 112582.0 },
  { symbol: 'NYSE:VIST', ticker: 'VIST', name: 'Vista Energy, S.A.B. de C.V.', exchange: 'NYSE', type: 'Dr', sector: 'Energy', yahoo: 'VIST', refPrice: 50.82 },
  { symbol: 'BINANCE:ETHUSDT', ticker: 'ETHUSDT', name: 'Ethereum / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'ETH-USD', refPrice: 4012.5 },
  { symbol: 'NASDAQ:MELI', ticker: 'MELI', name: 'MercadoLibre, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Consumer Cyclical', yahoo: 'MELI', refPrice: 2389.0 },
  { symbol: 'NASDAQ:AAPL', ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'AAPL', refPrice: 269.0 },
  { symbol: 'NYSE:CLS', ticker: 'CLS', name: 'Celestica Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Technology', yahoo: 'CLS', refPrice: 302.38 },
  { symbol: 'NASDAQ:AVGO', ticker: 'AVGO', name: 'Broadcom Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'AVGO', refPrice: 386.0 },
  { symbol: 'NASDAQ:NBIS', ticker: 'NBIS', name: 'Nebius Group N.V.', exchange: 'NASDAQ', type: 'Stock', sector: 'Communication Services', yahoo: 'NBIS', refPrice: 117.65 },
  { symbol: 'NASDAQ:TMDX', ticker: 'TMDX', name: 'TransMedics Group, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Healthcare', yahoo: 'TMDX', refPrice: 125.9 },
  { symbol: 'NASDAQ:CRDO', ticker: 'CRDO', name: 'Credo Technology Group Holding Ltd', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'CRDO', refPrice: 158.4 },
  { symbol: 'NASDAQ:SIMO', ticker: 'SIMO', name: 'Silicon Motion Technology Corp.', exchange: 'NASDAQ', type: 'Dr', sector: 'Technology', yahoo: 'SIMO', refPrice: 97.4 },
  { symbol: 'NASDAQ:HSAI', ticker: 'HSAI', name: 'Hesai Group', exchange: 'NASDAQ', type: 'Dr', sector: 'Consumer Cyclical', yahoo: 'HSAI', refPrice: 23.8 },

  // Major Crypto on BINANCE
  { symbol: 'BINANCE:SOLUSDT', ticker: 'SOLUSDT', name: 'Solana / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'SOL-USD', refPrice: 200.0 },
  { symbol: 'BINANCE:BNBUSDT', ticker: 'BNBUSDT', name: 'BNB / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'BNB-USD', refPrice: 660.0 },
  { symbol: 'BINANCE:XRPUSDT', ticker: 'XRPUSDT', name: 'XRP / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'XRP-USD', refPrice: 2.45 },
  { symbol: 'BINANCE:ADAUSDT', ticker: 'ADAUSDT', name: 'Cardano / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'ADA-USD', refPrice: 0.82 },
  { symbol: 'BINANCE:DOGEUSDT', ticker: 'DOGEUSDT', name: 'Dogecoin / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'DOGE-USD', refPrice: 0.24 },
  { symbol: 'BINANCE:AVAXUSDT', ticker: 'AVAXUSDT', name: 'Avalanche / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'AVAX-USD', refPrice: 28.5 },
  { symbol: 'BINANCE:LINKUSDT', ticker: 'LINKUSDT', name: 'Chainlink / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'LINK-USD', refPrice: 18.2 },
  { symbol: 'BINANCE:DOTUSDT', ticker: 'DOTUSDT', name: 'Polkadot / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'DOT-USD', refPrice: 6.4 },
  { symbol: 'BINANCE:SUIUSDT', ticker: 'SUIUSDT', name: 'Sui / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'SUI20947-USD', refPrice: 3.15 },
  { symbol: 'BINANCE:TONUSDT', ticker: 'TONUSDT', name: 'Toncoin / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'TON11419-USD', refPrice: 5.1 },
  { symbol: 'BINANCE:NEARUSDT', ticker: 'NEARUSDT', name: 'NEAR Protocol / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'NEAR-USD', refPrice: 5.4 },
  { symbol: 'BINANCE:RENDERUSDT', ticker: 'RENDERUSDT', name: 'Render / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'RENDER-USD', refPrice: 7.2 },
  { symbol: 'BINANCE:FETUSDT', ticker: 'FETUSDT', name: 'Artificial Superintelligence / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'FET-USD', refPrice: 1.35 },
  { symbol: 'BINANCE:PEPEUSDT', ticker: 'PEPEUSDT', name: 'Pepe / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'PEPE24478-USD', refPrice: 0.000012 },
  { symbol: 'BINANCE:POLUSDT', ticker: 'POLUSDT', name: 'Polygon / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'POL28321-USD', refPrice: 0.45 },
  { symbol: 'BINANCE:UNIUSD', ticker: 'UNIUSDT', name: 'Uniswap / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'UNI7083-USD', refPrice: 9.8 },
  { symbol: 'BINANCE:LTCUSDT', ticker: 'LTCUSDT', name: 'Litecoin / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'LTC-USD', refPrice: 95.0 },
  { symbol: 'BINANCE:AAVEUSDT', ticker: 'AAVEUSDT', name: 'Aave / TetherUS', exchange: 'BINANCE', type: 'Crypto', sector: 'Crypto', yahoo: 'AAVE-USD', refPrice: 245.0 },

  // Major US Tech & Growth (NASDAQ / NYSE)
  { symbol: 'NASDAQ:TSLA', ticker: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Consumer Cyclical', yahoo: 'TSLA', refPrice: 295.0 },
  { symbol: 'NASDAQ:AMD', ticker: 'AMD', name: 'Advanced Micro Devices, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'AMD', refPrice: 158.0 },
  { symbol: 'NASDAQ:PLTR', ticker: 'PLTR', name: 'Palantir Technologies Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'PLTR', refPrice: 82.5 },
  { symbol: 'NASDAQ:NFLX', ticker: 'NFLX', name: 'Netflix, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Communication Services', yahoo: 'NFLX', refPrice: 920.0 },
  { symbol: 'NASDAQ:ASML', ticker: 'ASML', name: 'ASML Holding N.V.', exchange: 'NASDAQ', type: 'Dr', sector: 'Technology', yahoo: 'ASML', refPrice: 740.0 },
  { symbol: 'NASDAQ:ARM', ticker: 'ARM', name: 'Arm Holdings plc', exchange: 'NASDAQ', type: 'Dr', sector: 'Technology', yahoo: 'ARM', refPrice: 148.0 },
  { symbol: 'NASDAQ:COIN', ticker: 'COIN', name: 'Coinbase Global, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Financial Services', yahoo: 'COIN', refPrice: 265.0 },
  { symbol: 'NASDAQ:MSTR', ticker: 'MSTR', name: 'Strategy (MicroStrategy Inc.)', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'MSTR', refPrice: 340.0 },
  { symbol: 'NASDAQ:GOOGL', ticker: 'GOOGL', name: 'Alphabet Inc. Class A', exchange: 'NASDAQ', type: 'Stock', sector: 'Communication Services', yahoo: 'GOOGL', refPrice: 266.8 },
  { symbol: 'NYSE:ORCL', ticker: 'ORCL', name: 'Oracle Corporation', exchange: 'NYSE', type: 'Stock', sector: 'Technology', yahoo: 'ORCL', refPrice: 178.0 },
  { symbol: 'NYSE:CRM', ticker: 'CRM', name: 'Salesforce, Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Technology', yahoo: 'CRM', refPrice: 315.0 },
  { symbol: 'NYSE:UBER', ticker: 'UBER', name: 'Uber Technologies, Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Technology', yahoo: 'UBER', refPrice: 76.0 },
  { symbol: 'NYSE:SHOP', ticker: 'SHOP', name: 'Shopify Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Technology', yahoo: 'SHOP', refPrice: 108.0 },
  { symbol: 'NYSE:SPOT', ticker: 'SPOT', name: 'Spotify Technology S.A.', exchange: 'NYSE', type: 'Stock', sector: 'Communication Services', yahoo: 'SPOT', refPrice: 540.0 },
  { symbol: 'NASDAQ:SNOW', ticker: 'SNOW', name: 'Snowflake Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'SNOW', refPrice: 165.0 },
  { symbol: 'NASDAQ:PANW', ticker: 'PANW', name: 'Palo Alto Networks, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'PANW', refPrice: 192.0 },
  { symbol: 'NASDAQ:CRWD', ticker: 'CRWD', name: 'CrowdStrike Holdings, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'CRWD', refPrice: 375.0 },
  { symbol: 'NASDAQ:INTC', ticker: 'INTC', name: 'Intel Corporation', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'INTC', refPrice: 24.5 },
  { symbol: 'NASDAQ:QCOM', ticker: 'QCOM', name: 'QUALCOMM Incorporated', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'QCOM', refPrice: 168.0 },
  { symbol: 'NASDAQ:AMAT', ticker: 'AMAT', name: 'Applied Materials, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'AMAT', refPrice: 185.0 },
  { symbol: 'NASDAQ:LRCX', ticker: 'LRCX', name: 'Lam Research Corporation', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'LRCX', refPrice: 82.0 },
  { symbol: 'NASDAQ:KLAC', ticker: 'KLAC', name: 'KLA Corporation', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'KLAC', refPrice: 730.0 },
  { symbol: 'NASDAQ:MRVL', ticker: 'MRVL', name: 'Marvell Technology, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'MRVL', refPrice: 105.0 },
  { symbol: 'NASDAQ:SMCI', ticker: 'SMCI', name: 'Super Micro Computer, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Technology', yahoo: 'SMCI', refPrice: 42.0 },
  { symbol: 'NYSE:ANET', ticker: 'ANET', name: 'Arista Networks, Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Technology', yahoo: 'ANET', refPrice: 102.0 },
  { symbol: 'NYSE:VST', ticker: 'VST', name: 'Vistra Corp.', exchange: 'NYSE', type: 'Stock', sector: 'Utilities', yahoo: 'VST', refPrice: 155.0 },
  { symbol: 'NASDAQ:CEG', ticker: 'CEG', name: 'Constellation Energy Corporation', exchange: 'NASDAQ', type: 'Stock', sector: 'Utilities', yahoo: 'CEG', refPrice: 280.0 },
  { symbol: 'NASDAQ:ISRG', ticker: 'ISRG', name: 'Intuitive Surgical, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Healthcare', yahoo: 'ISRG', refPrice: 560.0 },
  { symbol: 'NYSE:LLY', ticker: 'LLY', name: 'Eli Lilly and Company', exchange: 'NYSE', type: 'Stock', sector: 'Healthcare', yahoo: 'LLY', refPrice: 840.0 },
  { symbol: 'NYSE:NVO', ticker: 'NVO', name: 'Novo Nordisk A/S', exchange: 'NYSE', type: 'Dr', sector: 'Healthcare', yahoo: 'NVO', refPrice: 92.0 },
  { symbol: 'NYSE:UNH', ticker: 'UNH', name: 'UnitedHealth Group Incorporated', exchange: 'NYSE', type: 'Stock', sector: 'Healthcare', yahoo: 'UNH', refPrice: 525.0 },
  { symbol: 'NYSE:BRK.B', ticker: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', exchange: 'NYSE', type: 'Stock', sector: 'Financial Services', yahoo: 'BRK-B', refPrice: 465.0 },
  { symbol: 'NYSE:JPM', ticker: 'JPM', name: 'JPMorgan Chase & Co.', exchange: 'NYSE', type: 'Stock', sector: 'Financial Services', yahoo: 'JPM', refPrice: 245.0 },
  { symbol: 'NYSE:V', ticker: 'V', name: 'Visa Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Financial Services', yahoo: 'V', refPrice: 318.0 },
  { symbol: 'NYSE:MA', ticker: 'MA', name: 'Mastercard Incorporated', exchange: 'NYSE', type: 'Stock', sector: 'Financial Services', yahoo: 'MA', refPrice: 530.0 },
  { symbol: 'NASDAQ:PYPL', ticker: 'PYPL', name: 'PayPal Holdings, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Financial Services', yahoo: 'PYPL', refPrice: 84.0 },
  { symbol: 'NASDAQ:SOFI', ticker: 'SOFI', name: 'SoFi Technologies, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Financial Services', yahoo: 'SOFI', refPrice: 15.2 },
  { symbol: 'NASDAQ:HOOD', ticker: 'HOOD', name: 'Robinhood Markets, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Financial Services', yahoo: 'HOOD', refPrice: 48.0 },
  { symbol: 'NYSE:WMT', ticker: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Consumer Defensive', yahoo: 'WMT', refPrice: 94.0 },
  { symbol: 'NASDAQ:COST', ticker: 'COST', name: 'Costco Wholesale Corporation', exchange: 'NASDAQ', type: 'Stock', sector: 'Consumer Defensive', yahoo: 'COST', refPrice: 960.0 },
  { symbol: 'NYSE:KO', ticker: 'KO', name: 'The Coca-Cola Company', exchange: 'NYSE', type: 'Stock', sector: 'Consumer Defensive', yahoo: 'KO', refPrice: 64.0 },
  { symbol: 'NASDAQ:PEP', ticker: 'PEP', name: 'PepsiCo, Inc.', exchange: 'NASDAQ', type: 'Stock', sector: 'Consumer Defensive', yahoo: 'PEP', refPrice: 156.0 },
  { symbol: 'NYSE:XOM', ticker: 'XOM', name: 'Exxon Mobil Corporation', exchange: 'NYSE', type: 'Stock', sector: 'Energy', yahoo: 'XOM', refPrice: 112.0 },
  { symbol: 'NYSE:CVX', ticker: 'CVX', name: 'Chevron Corporation', exchange: 'NYSE', type: 'Stock', sector: 'Energy', yahoo: 'CVX', refPrice: 154.0 },
  { symbol: 'NYSE:DIS', ticker: 'DIS', name: 'The Walt Disney Company', exchange: 'NYSE', type: 'Stock', sector: 'Communication Services', yahoo: 'DIS', refPrice: 110.0 },
  { symbol: 'NYSE:NKE', ticker: 'NKE', name: 'NIKE, Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Consumer Cyclical', yahoo: 'NKE', refPrice: 76.0 },
  { symbol: 'NYSE:BA', ticker: 'BA', name: 'The Boeing Company', exchange: 'NYSE', type: 'Stock', sector: 'Industrials', yahoo: 'BA', refPrice: 175.0 },
  { symbol: 'NYSE:CAT', ticker: 'CAT', name: 'Caterpillar Inc.', exchange: 'NYSE', type: 'Stock', sector: 'Industrials', yahoo: 'CAT', refPrice: 380.0 },
  { symbol: 'NYSE:GE', ticker: 'GE', name: 'GE Aerospace', exchange: 'NYSE', type: 'Stock', sector: 'Industrials', yahoo: 'GE', refPrice: 195.0 },

  // Argentina & LATAM ADRs + China ADRs (NYSE / NASDAQ)
  { symbol: 'NYSE:YPF', ticker: 'YPF', name: 'YPF Sociedad Anónima (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Energy', yahoo: 'YPF', refPrice: 38.5 },
  { symbol: 'NASDAQ:GGAL', ticker: 'GGAL', name: 'Grupo Financiero Galicia S.A. (ADR)', exchange: 'NASDAQ', type: 'Dr', sector: 'Financial Services', yahoo: 'GGAL', refPrice: 58.0 },
  { symbol: 'NYSE:BMA', ticker: 'BMA', name: 'Banco Macro S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Financial Services', yahoo: 'BMA', refPrice: 84.0 },
  { symbol: 'NYSE:PAM', ticker: 'PAM', name: 'Pampa Energía S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Utilities', yahoo: 'PAM', refPrice: 78.0 },
  { symbol: 'NYSE:TGS', ticker: 'TGS', name: 'Transportadora de Gas del Sur S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Energy', yahoo: 'TGS', refPrice: 28.5 },
  { symbol: 'NYSE:CEPU', ticker: 'CEPU', name: 'Central Puerto S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Utilities', yahoo: 'CEPU', refPrice: 14.8 },
  { symbol: 'NYSE:EDN', ticker: 'EDN', name: 'Empresa Distribuidora y Comercializadora Norte (Edenor)', exchange: 'NYSE', type: 'Dr', sector: 'Utilities', yahoo: 'EDN', refPrice: 36.0 },
  { symbol: 'NYSE:BBAR', ticker: 'BBAR', name: 'BBVA Argentina S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Financial Services', yahoo: 'BBAR', refPrice: 18.5 },
  { symbol: 'NYSE:SUPV', ticker: 'SUPV', name: 'Grupo Supervielle S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Financial Services', yahoo: 'SUPV', refPrice: 12.4 },
  { symbol: 'NYSE:LOMA', ticker: 'LOMA', name: 'Loma Negra Compañía Industrial Argentina (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Basic Materials', yahoo: 'LOMA', refPrice: 11.2 },
  { symbol: 'NASDAQ:CRESY', ticker: 'CRESY', name: 'Cresud S.A.C.I.F. y A. (ADR)', exchange: 'NASDAQ', type: 'Dr', sector: 'Real Estate', yahoo: 'CRESY', refPrice: 13.5 },
  { symbol: 'NYSE:IRS', ticker: 'IRS', name: 'IRSA Inversiones y Representaciones S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Real Estate', yahoo: 'IRS', refPrice: 15.0 },
  { symbol: 'NYSE:TEO', ticker: 'TEO', name: 'Telecom Argentina S.A. (ADR)', exchange: 'NYSE', type: 'Dr', sector: 'Communication Services', yahoo: 'TEO', refPrice: 11.8 },
  { symbol: 'NYSE:GLOB', ticker: 'GLOB', name: 'Globant S.A.', exchange: 'NYSE', type: 'Stock', sector: 'Technology', yahoo: 'GLOB', refPrice: 215.0 },
  { symbol: 'NYSE:DESP', ticker: 'DESP', name: 'Despegar.com, Corp.', exchange: 'NYSE', type: 'Stock', sector: 'Consumer Cyclical', yahoo: 'DESP', refPrice: 19.2 },
  { symbol: 'NASDAQ:BIOX', ticker: 'BIOX', name: 'Bioceres Crop Solutions Corp.', exchange: 'NASDAQ', type: 'Stock', sector: 'Basic Materials', yahoo: 'BIOX', refPrice: 6.8 },
  { symbol: 'NYSE:PBR', ticker: 'PBR', name: 'Petróleo Brasileiro S.A. - Petrobras', exchange: 'NYSE', type: 'Dr', sector: 'Energy', yahoo: 'PBR', refPrice: 14.2 },
  { symbol: 'NYSE:VALE', ticker: 'VALE', name: 'Vale S.A.', exchange: 'NYSE', type: 'Dr', sector: 'Basic Materials', yahoo: 'VALE', refPrice: 9.8 },
  { symbol: 'NYSE:ITUB', ticker: 'ITUB', name: 'Itaú Unibanco Holding S.A.', exchange: 'NYSE', type: 'Dr', sector: 'Financial Services', yahoo: 'ITUB', refPrice: 5.9 },
  { symbol: 'NYSE:BABA', ticker: 'BABA', name: 'Alibaba Group Holding Limited', exchange: 'NYSE', type: 'Dr', sector: 'Consumer Cyclical', yahoo: 'BABA', refPrice: 115.0 },
  { symbol: 'NASDAQ:PDD', ticker: 'PDD', name: 'PDD Holdings Inc.', exchange: 'NASDAQ', type: 'Dr', sector: 'Consumer Cyclical', yahoo: 'PDD', refPrice: 118.0 },
  { symbol: 'NASDAQ:JD', ticker: 'JD', name: 'JD.com, Inc.', exchange: 'NASDAQ', type: 'Dr', sector: 'Consumer Cyclical', yahoo: 'JD', refPrice: 41.0 },
  { symbol: 'NYSE:NIO', ticker: 'NIO', name: 'NIO Inc.', exchange: 'NYSE', type: 'Dr', sector: 'Consumer Cyclical', yahoo: 'NIO', refPrice: 4.8 },
  { symbol: 'NASDAQ:BIDU', ticker: 'BIDU', name: 'Baidu, Inc.', exchange: 'NASDAQ', type: 'Dr', sector: 'Communication Services', yahoo: 'BIDU', refPrice: 95.0 },

  // Major ETFs (AMEX / NASDAQ)
  { symbol: 'AMEX:SPY', ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', exchange: 'AMEX', type: 'ETF', sector: 'Broad Market ETF', yahoo: 'SPY', refPrice: 585.0 },
  { symbol: 'NASDAQ:QQQ', ticker: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', exchange: 'NASDAQ', type: 'ETF', sector: 'Technology ETF', yahoo: 'QQQ', refPrice: 505.0 },
  { symbol: 'AMEX:IWM', ticker: 'IWM', name: 'iShares Russell 2000 ETF', exchange: 'AMEX', type: 'ETF', sector: 'Small Cap ETF', yahoo: 'IWM', refPrice: 222.0 },
  { symbol: 'AMEX:DIA', ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', exchange: 'AMEX', type: 'ETF', sector: 'Broad Market ETF', yahoo: 'DIA', refPrice: 432.0 },
  { symbol: 'AMEX:VOO', ticker: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'AMEX', type: 'ETF', sector: 'Broad Market ETF', yahoo: 'VOO', refPrice: 538.0 },
  { symbol: 'AMEX:VTI', ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', exchange: 'AMEX', type: 'ETF', sector: 'Broad Market ETF', yahoo: 'VTI', refPrice: 292.0 },
  { symbol: 'NASDAQ:SMH', ticker: 'SMH', name: 'VanEck Semiconductor ETF', exchange: 'NASDAQ', type: 'ETF', sector: 'Semiconductors ETF', yahoo: 'SMH', refPrice: 255.0 },
  { symbol: 'NASDAQ:SOXX', ticker: 'SOXX', name: 'iShares Semiconductor ETF', exchange: 'NASDAQ', type: 'ETF', sector: 'Semiconductors ETF', yahoo: 'SOXX', refPrice: 225.0 },
  { symbol: 'AMEX:ARKK', ticker: 'ARKK', name: 'ARK Innovation ETF', exchange: 'AMEX', type: 'ETF', sector: 'Innovation ETF', yahoo: 'ARKK', refPrice: 58.0 },
  { symbol: 'AMEX:GLD', ticker: 'GLD', name: 'SPDR Gold Shares (Oro)', exchange: 'AMEX', type: 'ETF', sector: 'Commodities ETF', yahoo: 'GLD', refPrice: 255.0 },
  { symbol: 'AMEX:SLV', ticker: 'SLV', name: 'iShares Silver Trust (Plata)', exchange: 'AMEX', type: 'ETF', sector: 'Commodities ETF', yahoo: 'SLV', refPrice: 29.5 },
  { symbol: 'NASDAQ:TLT', ticker: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', exchange: 'NASDAQ', type: 'ETF', sector: 'Treasury Bonds ETF', yahoo: 'TLT', refPrice: 91.0 },
  { symbol: 'AMEX:EEM', ticker: 'EEM', name: 'iShares MSCI Emerging Markets ETF', exchange: 'AMEX', type: 'ETF', sector: 'Emerging Markets ETF', yahoo: 'EEM', refPrice: 44.5 },
  { symbol: 'AMEX:EWZ', ticker: 'EWZ', name: 'iShares MSCI Brazil ETF', exchange: 'AMEX', type: 'ETF', sector: 'LatAm ETF', yahoo: 'EWZ', refPrice: 26.5 },
  { symbol: 'AMEX:ARGT', ticker: 'ARGT', name: 'Global X MSCI Argentina ETF', exchange: 'AMEX', type: 'ETF', sector: 'LatAm ETF', yahoo: 'ARGT', refPrice: 82.0 },
  { symbol: 'NASDAQ:IBIT', ticker: 'IBIT', name: 'iShares Bitcoin Trust ETF', exchange: 'NASDAQ', type: 'ETF', sector: 'Crypto ETF', yahoo: 'IBIT', refPrice: 54.0 },
  { symbol: 'AMEX:XLK', ticker: 'XLK', name: 'Technology Select Sector SPDR Fund', exchange: 'AMEX', type: 'ETF', sector: 'Technology ETF', yahoo: 'XLK', refPrice: 232.0 },
  { symbol: 'AMEX:XLF', ticker: 'XLF', name: 'Financial Select Sector SPDR Fund', exchange: 'AMEX', type: 'ETF', sector: 'Financial ETF', yahoo: 'XLF', refPrice: 49.5 },
  { symbol: 'AMEX:XLE', ticker: 'XLE', name: 'Energy Select Sector SPDR Fund', exchange: 'AMEX', type: 'ETF', sector: 'Energy ETF', yahoo: 'XLE', refPrice: 91.0 },
  { symbol: 'AMEX:XLV', ticker: 'XLV', name: 'Health Care Select Sector SPDR Fund', exchange: 'AMEX', type: 'ETF', sector: 'Healthcare ETF', yahoo: 'XLV', refPrice: 146.0 },
];

const CATALOG_BY_SYMBOL = new Map<string, CatalogSymbolEntry>();
const CATALOG_BY_TICKER = new Map<string, CatalogSymbolEntry>();

for (const item of TRADINGVIEW_CATALOG) {
  CATALOG_BY_SYMBOL.set(item.symbol.toUpperCase(), item);
  if (!CATALOG_BY_TICKER.has(item.ticker.toUpperCase())) {
    CATALOG_BY_TICKER.set(item.ticker.toUpperCase(), item);
  }
}

const SHORT_CRYPTO_ALIAS: Record<string, string> = {
  BTC: 'BINANCE:BTCUSDT',
  ETH: 'BINANCE:ETHUSDT',
  SOL: 'BINANCE:SOLUSDT',
  BNB: 'BINANCE:BNBUSDT',
  XRP: 'BINANCE:XRPUSDT',
  ADA: 'BINANCE:ADAUSDT',
  DOGE: 'BINANCE:DOGEUSDT',
  AVAX: 'BINANCE:AVAXUSDT',
  LINK: 'BINANCE:LINKUSDT',
  DOT: 'BINANCE:DOTUSDT',
  SUI: 'BINANCE:SUIUSDT',
  TON: 'BINANCE:TONUSDT',
  NEAR: 'BINANCE:NEARUSDT',
  RENDER: 'BINANCE:RENDERUSDT',
  FET: 'BINANCE:FETUSDT',
  PEPE: 'BINANCE:PEPEUSDT',
  LTC: 'BINANCE:LTCUSDT',
  AAVE: 'BINANCE:AAVEUSDT',
};

/**
 * Normaliza cualquier símbolo ingresado por el usuario (ej. "BINANE:SOLUSDT", "SOLUSDT", "NVDA", "YPF")
 * al formato canónico EXCHANGE:TICKER de TradingView.
 */
export function normalizeTradingViewSymbol(rawInput: string): string {
  const cleaned = String(rawInput || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!cleaned) return 'NASDAQ:NVDA';

  if (cleaned.includes(':')) {
    const [rawEx, rawTicker] = cleaned.split(':');
    const fixedEx = EXCHANGE_TYPO_MAP[rawEx] || rawEx || 'NASDAQ';
    let fixedTicker = rawTicker || 'NVDA';
    if (fixedEx === 'BINANCE' && !fixedTicker.endsWith('USDT') && !fixedTicker.endsWith('USD')) {
      fixedTicker = fixedTicker + 'USDT';
    }
    const candidate = `${fixedEx}:${fixedTicker}`;
    const exact = CATALOG_BY_SYMBOL.get(candidate);
    if (exact) return exact.symbol;
    return candidate;
  }

  // Sin prefijo de mercado: revisar alias cripto corto (SOL -> BINANCE:SOLUSDT si no colisiona)
  if (SHORT_CRYPTO_ALIAS[cleaned]) {
    return SHORT_CRYPTO_ALIAS[cleaned];
  }

  // Si termina en USDT o -USD, es cripto en BINANCE
  if (cleaned.endsWith('USDT')) {
    return `BINANCE:${cleaned}`;
  }
  if (cleaned.endsWith('-USD')) {
    return `BINANCE:${cleaned.replace(/-USD$/, 'USDT')}`;
  }

  // Buscar en el catálogo por ticker exacto (ej. TSM -> NYSE:TSM, YPF -> NYSE:YPF, SPY -> AMEX:SPY)
  const byTicker = CATALOG_BY_TICKER.get(cleaned);
  if (byTicker) return byTicker.symbol;

  return `NASDAQ:${cleaned}`;
}

export function findCatalogEntry(symbolOrTicker: string): CatalogSymbolEntry | undefined {
  const norm = normalizeTradingViewSymbol(symbolOrTicker);
  return (
    CATALOG_BY_SYMBOL.get(norm) ||
    CATALOG_BY_TICKER.get(symbolOrTicker.trim().toUpperCase())
  );
}

/**
 * Búsqueda instantánea local estilo TradingView sobre el catálogo + metadatos del portafolio.
 * Soporta búsqueda por ticker, nombre de empresa, exchange, sector y typos de exchange (ej. "BINANE:SOL").
 */
export function searchLocalCatalog(
  query: string,
  portfolioMeta: Record<string, AssetMeta> = {},
  openPortfolioSymbols: Set<string> = new Set(),
  categoryFilter: 'ALL' | 'Stock' | 'Crypto' | 'ETF' | 'Dr' | 'PORTFOLIO' = 'ALL',
  limit = 25
): (CatalogSymbolEntry & { inPortfolio: boolean })[] {
  const rawQ = String(query || '').trim();
  const upperQ = rawQ.toUpperCase();

  // Si el usuario escribió "BINANE:SOLUSDT", extraer partes con corrección de typo
  let exFilter = '';
  let term = rawQ.toLowerCase();
  if (upperQ.includes(':')) {
    const [rawEx, rest] = upperQ.split(':');
    exFilter = (EXCHANGE_TYPO_MAP[rawEx] || rawEx).toUpperCase();
    term = (rest || '').toLowerCase();
  }

  const combinedMap = new Map<string, CatalogSymbolEntry & { inPortfolio: boolean }>();

  // 1. Incluir todos los activos del portafolio del usuario primero
  for (const m of Object.values(portfolioMeta)) {
    const cat = CATALOG_BY_SYMBOL.get(m.symbol.toUpperCase());
    const inPort = openPortfolioSymbols.size > 0 ? openPortfolioSymbols.has(m.symbol) : true;
    combinedMap.set(m.symbol.toUpperCase(), {
      symbol: m.symbol,
      ticker: m.ticker,
      name: m.name || cat?.name || m.ticker,
      exchange: m.exchange || cat?.exchange || 'NASDAQ',
      type: m.assetType || cat?.type || 'Stock',
      sector: m.sector || cat?.sector || 'Technology',
      yahoo: m.yahoo || cat?.yahoo || m.ticker,
      refPrice: cat?.refPrice,
      inPortfolio: inPort,
    });
  }

  // 2. Añadir todo el catálogo TradingView
  for (const item of TRADINGVIEW_CATALOG) {
    const key = item.symbol.toUpperCase();
    if (!combinedMap.has(key)) {
      combinedMap.set(key, {
        ...item,
        inPortfolio: openPortfolioSymbols.has(item.symbol),
      });
    } else {
      const existing = combinedMap.get(key)!;
      if (!existing.refPrice && item.refPrice) existing.refPrice = item.refPrice;
    }
  }

  const allItems = Array.from(combinedMap.values());

  const scored: { entry: CatalogSymbolEntry & { inPortfolio: boolean }; score: number }[] = [];

  for (const item of allItems) {
    if (categoryFilter === 'PORTFOLIO' && !item.inPortfolio) continue;
    if (
      categoryFilter !== 'ALL' &&
      categoryFilter !== 'PORTFOLIO' &&
      item.type !== categoryFilter
    ) {
      continue;
    }

    if (exFilter && !item.exchange.toUpperCase().startsWith(exFilter)) {
      continue;
    }

    if (!term) {
      scored.push({
        entry: item,
        score: (item.inPortfolio ? 1000 : 0) + (item.refPrice ? 10 : 0),
      });
      continue;
    }

    const tLower = item.ticker.toLowerCase();
    const sLower = item.symbol.toLowerCase();
    const nLower = item.name.toLowerCase();
    const secLower = item.sector.toLowerCase();
    const exLower = item.exchange.toLowerCase();

    let matchScore = 0;
    if (tLower === term || sLower === term) matchScore = 500;
    else if (tLower === term + 'usdt') matchScore = 480;
    else if (tLower.startsWith(term)) matchScore = 350;
    else if (nLower.startsWith(term)) matchScore = 260;
    else if (tLower.includes(term)) matchScore = 200;
    else if (nLower.includes(term)) matchScore = 150;
    else if (sLower.includes(term)) matchScore = 120;
    else if (secLower.includes(term) || exLower.includes(term)) matchScore = 80;

    if (matchScore > 0) {
      if (item.inPortfolio) matchScore += 40;
      scored.push({ entry: item, score: matchScore });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.entry.ticker.localeCompare(b.entry.ticker));
  return scored.slice(0, limit).map((s) => s.entry);
}
