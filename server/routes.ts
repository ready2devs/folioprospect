import type { Express, Request, Response } from 'express';
import {
  initDatabase,
  saveDatabase,
  hydrateDatabase,
  kvConfigured,
  loadSeedHistory,
  loadSeedCalendar,
  loadTvReference,
  loadSeedExtract,
} from './db.js';
import {
  fetchQuotesWithSparklines,
  fetchAssetChart,
  fetchFundamentals,
  fetchAssetExtras,
  searchSymbols,
  fetchLiveFxRates,
} from './yahoo.js';
import { fetchArgFxRates } from './argFx.js';
import {
  fetchEarningsForTickers,
  fetchEarningsInfoForTicker,
  cacheOnlyEarningsInfo,
  regroupSeedEarnings,
  filterSeedDividends,
  todayInNewYork,
} from './earnings.js';
import {
  evaluateLedger,
  buildPortfolioSeries,
  computeRiskMetrics,
  computeFairValue,
  runPortfolioProjection,
  cleanTicker,
  resolveAssetMeta,
  searchLocalCatalog,
  normalizeTradingViewSymbol,
  findCatalogEntry,
} from '../shared/engine/index.js';
import type {
  CashTx,
  DividendTx,
  IlliquidAsset,
  Trade,
} from '../shared/engine/types.js';


/** Completa `next` (respaldo Yahoo) y lo suma a `events` si no estaba:
 *  sin esto, el próximo balance se veía en la tarjeta pero NO tenía
 *  marcador ni chip en el gráfico (su fecha no entraba a events). */
function withNextEvent(info: any, next: any): any {
  const events = Array.isArray(info?.events) ? [...info.events] : [];
  if (next && !events.some((e: any) => e.date === next.date)) {
    events.push({
      date: next.date,
      actualEps: null,
      estimateEps: next.estimateEps ?? null,
      surprise: null,
    });
    events.sort((a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return info
    ? { ...info, next, events }
    : { next, last: null, events };
}

export async function registerRoutes(app: Express): Promise<void> {
  // On Vercel, hydrate the durable database from KV before serving requests;
  // if KV is empty (first run), prime it with the locally built database.
  const hydrated = await hydrateDatabase();
  const db = initDatabase();
  if (!hydrated && kvConfigured()) saveDatabase(db);
  const seedHistory = loadSeedHistory();
  const seedCalendar = loadSeedCalendar();
  const tvReference = loadTvReference();
  const seedExtract = loadSeedExtract();

  const fallbackPrices: Record<string, { last: number; prev: number }> = {};
  for (const h of seedExtract.holdings?.opened || []) {
    const prev = h.last_price - (h.daily_gain?.v || 0) / (h.qty || 1);
    fallbackPrices[h.symbol] = { last: h.last_price, prev };
  }

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'FolioProspect SDD API',
      portfoliosCount: db.portfolios.length,
      updatedAt: db.updatedAt,
    });
  });

  app.get('/api/fx', async (_req: Request, res: Response) => {
    const rates = await fetchLiveFxRates();
    res.json(rates);
  });

  app.get('/api/fx/ar', async (_req: Request, res: Response) => {
    const argFx = await fetchArgFxRates();
    res.json(argFx);
  });

  app.get('/api/portfolios', (_req: Request, res: Response) => {
    res.json(
      db.portfolios.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        currency: p.currency,
        benchmark: p.benchmark,
        tradesCount: p.trades.length,
        illiquidCount: p.illiquid.length,
      }))
    );
  });

  // Full portfolio evaluation (Left Panel + State 2 TradingView Dashboard + 10/20Y Prospectiva)
  app.get('/api/portfolios/:id/evaluate', async (req: Request, res: Response) => {
    const { id } = req.params;
    const benchmark = (req.query.benchmark as string) || 'SP:SPX';
    const mode = (req.query.mode as string) || 'live'; // 'live' | 'tv_snapshot'
    const portfolio =
      id === 'overview'
        ? db.portfolios[0]
        : db.portfolios.find((p) => p.id === id) || db.portfolios[0];

    const symbols = Array.from(new Set(portfolio.trades.map((t) => t.symbol)));
    let quotesMap: Record<string, any> = {};
    let sparklinesMap: Record<string, { prevClose: number; points: number[] }> = {};
    let cached = false;

    if (mode === 'tv_snapshot') {
      const { quotes: liveQuotes, sparklines } = await fetchQuotesWithSparklines(symbols);
      sparklinesMap = sparklines;
      for (const h of seedExtract.holdings?.opened || []) {
        const prev = h.last_price - h.daily_gain.v / h.qty;
        const lq = liveQuotes[h.symbol];
        const isCrypto = h.symbol.startsWith('BINANCE:') || h.symbol.endsWith('USDT');
        quotesMap[h.symbol] = {
          symbol: h.symbol,
          price: h.last_price,
          prevClose: prev,
          change: h.last_price - prev,
          changePct: h.daily_gain.p,
          currency: 'USD',
          marketState: isCrypto ? 'open' : (lq?.marketState ?? 'closed'),
          regularMarketTime: isCrypto ? undefined : lq?.regularMarketTime,
          extPrice: isCrypto ? undefined : lq?.extPrice,
          extChange: isCrypto ? undefined : lq?.extChange,
          extChangePct: isCrypto ? undefined : lq?.extChangePct,
          extTime: isCrypto ? undefined : lq?.extTime,
          extSession: isCrypto ? undefined : lq?.extSession,
        };
      }
      for (const s of symbols) {
        if (!quotesMap[s] && liveQuotes[s]) {
          quotesMap[s] = liveQuotes[s];
        }
      }
    } else {
      const qRes = await fetchQuotesWithSparklines(symbols);
      quotesMap = qRes.quotes;
      sparklinesMap = qRes.sparklines;
      cached = qRes.cached;
    }

    const ledger = evaluateLedger(portfolio, db.assetMeta, quotesMap, fallbackPrices);

    // Ensure history includes benchmark if different from SP:SPX
    const historyForSeries = { ...seedHistory };
    if (!historyForSeries[benchmark]) {
      const benchChart = await fetchAssetChart(benchmark, '1Y');
      if (benchChart.points.length > 0) {
        historyForSeries[benchmark] = benchChart.points.map(([ms, c]) => [
          Math.floor(ms / 1000),
          c,
        ]);
      }
    }

    const series = buildPortfolioSeries(portfolio, historyForSeries, quotesMap, benchmark);
    const risk = computeRiskMetrics(
      portfolio,
      series.monthly,
      series.daily,
      series.dailyReturns
    );

    // Fill totalGain.p & annualizedYield from series TWR
    ledger.kpis.totalGain.p = series.twrAllPct;
    ledger.kpis.annualizedYield = series.annualizedYieldPct;

    // Daily gainers & losers (top 5 each)
    const sortedByDayPct = [...ledger.holdings].sort(
      (a, b) => b.dailyGain.p - a.dailyGain.p
    );
    const dailyGainers = sortedByDayPct.filter((h) => h.dailyGain.p >= 0).slice(0, 5);
    const dailyLosers = [...ledger.holdings]
      .sort((a, b) => a.dailyGain.p - b.dailyGain.p)
      .filter((h) => h.dailyGain.p < 0)
      .slice(0, 5);

    const defaultProjection = runPortfolioProjection({
      horizonYears: 20,
      initialCapital: ledger.kpis.totalGrossPatrimony,
      monthlyContribution: 1000,
      baseCagrPct: 12.0,
      annualVolatilityPct: Math.max(12, Math.min(35, risk.annualizedVolatility || 21)),
      inflationPct: 3.0,
      convergeToFairValue: true,
      portfolioPriceToFairValue: 0.87,
    });

    // Earnings EN VIVO desde Nasdaq (la foto seed del 2026-10-22 quedaba
    // congelada: mostraba balances ya pasados como «today»/futuros).
    // Deadline interno de 8s en el escaneo; si Nasdaq no trae nada de la
    // cartera, fallback a la foto seed con grupos recalculados contra hoy.
    const earningsTickers = new Set<string>(
      portfolio.trades
        .map((t) => t.symbol)
        .filter((s) => !s.startsWith('BINANCE:') && !cleanTicker(s).endsWith('USDT'))
        .map((s) => cleanTicker(s).toUpperCase())
        .filter(Boolean)
    );
    let liveEarnings: Awaited<ReturnType<typeof fetchEarningsForTickers>> = [];
    try {
      // Deadline interno: devuelve lo juntado (parcial pero en vivo) en
      // vez de descartar todo por timeout; la caché por fecha hace que la
      // próxima llamada complete la ventana.
      liveEarnings = await fetchEarningsForTickers(earningsTickers, 14, 30, {
        deadlineMs: 8000,
      });
    } catch {
      liveEarnings = [];
    }
    const useLiveEarnings = liveEarnings.length > 0;
    const calendar = {
      ...seedCalendar,
      earnings: useLiveEarnings
        ? liveEarnings
        : regroupSeedEarnings(seedCalendar.earnings),
      dividends: filterSeedDividends(seedCalendar.dividends),
      earningsSource: useLiveEarnings ? 'nasdaq' : 'snapshot',
      earningsUpdatedAt: new Date().toISOString(),
    };

    res.json({
      portfolio,
      quotes: quotesMap,
      kpis: ledger.kpis,
      holdings: ledger.holdings,
      closedHoldings: ledger.closedHoldings,
      sparklines: sparklinesMap,
      distribution: {
        assets: ledger.distributionByAsset,
        assetTypes: ledger.distributionByType,
        sectors: ledger.distributionBySector,
        currency: ledger.distributionByCurrency,
      },
      series: {
        daily: series.daily,
        monthly: series.monthly,
        periods: series.periods,
        benchmarkSymbol: benchmark,
      },
      risk,
      movers: {
        gainers: dailyGainers,
        losers: dailyLosers,
      },
      calendar,
      tvReference,
      defaultProjection,
      cached,
    });
  });

  // Custom projection simulation endpoint
  app.post('/api/projection', (req: Request, res: Response) => {
    const body = req.body || {};
    const result = runPortfolioProjection({
      horizonYears: Number(body.horizonYears ?? 20),
      initialCapital: Number(body.initialCapital ?? 180719.71),
      monthlyContribution: Number(body.monthlyContribution ?? 1000),
      baseCagrPct: Number(body.baseCagrPct ?? 12.0),
      annualVolatilityPct: Number(body.annualVolatilityPct ?? 21.0),
      inflationPct: Number(body.inflationPct ?? 3.0),
      convergeToFairValue: Boolean(body.convergeToFairValue ?? true),
      portfolioPriceToFairValue: Number(body.portfolioPriceToFairValue ?? 0.88),
    });
    res.json(result);
  });

  // Add unlimited trade transaction(s)
  app.post('/api/portfolios/:id/trades', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    const items = Array.isArray(req.body) ? req.body : [req.body];

    const added: Trade[] = [];
    for (const raw of items) {
      const sym = String(raw.symbol || 'NASDAQ:NVDA').toUpperCase();
      const fullSym = sym.includes(':') ? sym : `NASDAQ:${sym}`;
      const tx: Trade = {
        id: raw.id || Date.now() + Math.floor(Math.random() * 10000),
        time: raw.time ? Number(raw.time) : Date.now(),
        symbol: fullSym,
        isBuy: raw.isBuy !== undefined ? Boolean(raw.isBuy) : String(raw.side || 'BUY').toUpperCase() !== 'SELL',
        qty: Math.max(0.000001, Number(raw.qty || 1)),
        price: Math.max(0.0001, Number(raw.price || 100)),
        commission: Math.max(0, Number(raw.commission || 0)),
        comment: raw.comment || '',
      };
      portfolio.trades.push(tx);
      if (!db.assetMeta[fullSym]) {
        db.assetMeta[fullSym] = resolveAssetMeta(fullSym, db.assetMeta);
        if (raw.name) db.assetMeta[fullSym].name = raw.name;
        if (raw.sector) db.assetMeta[fullSym].sector = raw.sector;
        if (raw.assetType) db.assetMeta[fullSym].assetType = raw.assetType;
      }
      added.push(tx);
    }
    portfolio.trades.sort((a, b) => b.time - a.time);
    saveDatabase(db);
    res.json({ ok: true, added, totalTrades: portfolio.trades.length });
  });

  // Delete trade transaction
  app.delete('/api/portfolios/:id/trades/:txId', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    const { txId } = req.params;
    portfolio.trades = portfolio.trades.filter((t) => String(t.id) !== String(txId));
    saveDatabase(db);
    res.json({ ok: true, totalTrades: portfolio.trades.length });
  });

  // Add cash transaction (deposit / withdrawal / income / taxes)
  app.post('/api/portfolios/:id/cash', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    const raw = req.body || {};
    const tx: CashTx = {
      id: 'cash_' + Date.now(),
      time: raw.time ? Number(raw.time) : Date.now(),
      type: raw.type || 'deposit',
      amount: Math.max(0, Number(raw.amount || 0)),
      currency: raw.currency || 'USD',
      comment: raw.comment || '',
    };
    portfolio.cash.push(tx);
    saveDatabase(db);
    res.json({ ok: true, tx, cashCount: portfolio.cash.length });
  });

  app.delete('/api/portfolios/:id/cash/:cashId', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    portfolio.cash = portfolio.cash.filter((c) => c.id !== req.params.cashId);
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Add dividend transaction
  app.post('/api/portfolios/:id/dividends', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    const raw = req.body || {};
    const tx: DividendTx = {
      id: 'div_' + Date.now(),
      time: raw.time ? Number(raw.time) : Date.now(),
      symbol: String(raw.symbol || 'NASDAQ:MSFT').toUpperCase(),
      amount: Math.max(0, Number(raw.amount || 0)),
      tax: Math.max(0, Number(raw.tax || 0)),
      comment: raw.comment || '',
    };
    portfolio.dividends.push(tx);
    saveDatabase(db);
    res.json({ ok: true, tx });
  });

  // Add illiquid asset (inmuebles, fondos privados, plazos fijos, bonos)
  app.post('/api/portfolios/:id/illiquid', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    const raw = req.body || {};
    const asset: IlliquidAsset = {
      id: 'illiq_' + Date.now(),
      name: String(raw.name || 'Inmueble / Bono Privado'),
      category: raw.category || 'Real estate',
      costBasis: Math.max(0, Number(raw.costBasis || raw.currentValue || 0)),
      currentValue: Math.max(0, Number(raw.currentValue || 0)),
      currency: raw.currency || 'USD',
      annualYieldPct: Number(raw.annualYieldPct ?? 7.5),
      acquiredAt: raw.acquiredAt ? Number(raw.acquiredAt) : Date.now(),
      notes: raw.notes || '',
    };
    portfolio.illiquid.push(asset);
    saveDatabase(db);
    res.json({ ok: true, asset, illiquidCount: portfolio.illiquid.length });
  });

  app.delete('/api/portfolios/:id/illiquid/:assetId', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    portfolio.illiquid = portfolio.illiquid.filter((a) => a.id !== req.params.assetId);
    saveDatabase(db);
    res.json({ ok: true });
  });

  // Import CSV (TradingView export format or generic Symbol,Side,Qty,Price,Commission,Date)
  app.post('/api/portfolios/:id/import', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    const csvText = String(req.body?.csv || '');
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV vacío o sin filas de datos' });
      return;
    }
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idxSym = headers.findIndex((h) => h.includes('symbol') || h.includes('ticker'));
    const idxSide = headers.findIndex((h) => h.includes('side') || h.includes('type'));
    const idxQty = headers.findIndex((h) => h.includes('qty') || h.includes('quantity'));
    const idxPrice = headers.findIndex((h) => h.includes('price'));
    const idxComm = headers.findIndex((h) => h.includes('comm') || h.includes('fee'));
    const idxTime = headers.findIndex((h) => h.includes('time') || h.includes('date'));

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const symRaw = (cols[idxSym >= 0 ? idxSym : 0] || '').toUpperCase();
      if (!symRaw) continue;
      const symbol = symRaw.includes(':') ? symRaw : `NASDAQ:${symRaw}`;
      const sideRaw = (cols[idxSide >= 0 ? idxSide : 1] || 'BUY').toUpperCase();
      const isBuy = !sideRaw.includes('SELL');
      const qty = Number(cols[idxQty >= 0 ? idxQty : 2]);
      const price = Number(cols[idxPrice >= 0 ? idxPrice : 3]);
      const commission = idxComm >= 0 ? Number(cols[idxComm] || 0) : 0;
      const timeStr = idxTime >= 0 ? cols[idxTime] : '';
      const parsedTime = timeStr ? Date.parse(timeStr) : Date.now();
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) continue;

      portfolio.trades.push({
        id: 'csv_' + Date.now() + '_' + i,
        time: Number.isFinite(parsedTime) ? parsedTime : Date.now(),
        symbol,
        isBuy,
        qty,
        price,
        commission: Number.isFinite(commission) ? commission : 0,
        comment: 'Importado vía CSV',
      });
      if (!db.assetMeta[symbol]) {
        db.assetMeta[symbol] = resolveAssetMeta(symbol, db.assetMeta);
      }
      imported++;
    }
    portfolio.trades.sort((a, b) => b.time - a.time);
    saveDatabase(db);
    res.json({ ok: true, imported, totalTrades: portfolio.trades.length });
  });

  // Reset portfolio to clean REA TradingView seed
  app.post('/api/portfolios/:id/reset', (req: Request, res: Response) => {
    const portfolio =
      db.portfolios.find((p) => p.id === req.params.id) || db.portfolios[0];
    portfolio.trades = (seedExtract.trades || []).map((t: any) => ({
      id: t.id,
      time: t.time,
      symbol: t.symbol,
      isBuy: Boolean(t.is_buy),
      qty: Number(t.qty),
      price: Number(t.price),
      commission: Number(t.commission || 0),
      comment: t.comment || '',
    }));
    portfolio.cash = [];
    portfolio.dividends = [];
    portfolio.illiquid = [];
    saveDatabase(db);
    res.json({ ok: true });
  });

  // State 1 — Google Finance Market Overview (Left + Center 2/3, no 3rd column)
  app.get('/api/market', async (_req: Request, res: Response) => {
    const indexDefs = [
      { symbol: 'SP:SPX', ticker: 'S&P 500', name: 'Standard & Poor’s 500', region: 'US' },
      { symbol: 'NASDAQ:NDX', ticker: 'NASDAQ 100', name: 'Nasdaq-100 Index', region: 'US' },
      { symbol: 'DJ:DJI', ticker: 'Dow Jones', name: 'Dow Jones Industrial Average', region: 'US' },
      { symbol: 'CBOE:VIX', ticker: 'VIX', name: 'CBOE Volatility Index', region: 'US' },
      { symbol: 'BCBA:IMV', ticker: 'S&P Merval', name: 'Índice S&P Merval Argentina', region: 'LATAM' },
      { symbol: 'BINANCE:BTCUSDT', ticker: 'Bitcoin', name: 'Bitcoin / USD', region: 'Crypto' },
      { symbol: 'TVC:GOLD', ticker: 'Oro (Gold)', name: 'Gold Futures COMEX', region: 'Commodities' },
    ];
    const sectorDefs = [
      { symbol: 'AMEX:XLK', ticker: 'SIXT', name: 'Technology', weight: '31.8%' },
      { symbol: 'AMEX:XLF', ticker: 'SIXM', name: 'Financials', weight: '13.6%' },
      { symbol: 'AMEX:XLV', ticker: 'SIXV', name: 'Health care', weight: '11.4%' },
      { symbol: 'AMEX:XLY', ticker: 'SIXY', name: 'Discretionary', weight: '10.7%' },
      { symbol: 'AMEX:XLC', ticker: 'SIXC', name: 'Communications', weight: '9.2%' },
      { symbol: 'AMEX:XLI', ticker: 'SIXI', name: 'Industrials', weight: '8.5%' },
      { symbol: 'AMEX:XLP', ticker: 'SIXR', name: 'Staples', weight: '5.8%' },
      { symbol: 'AMEX:XLE', ticker: 'SIXE', name: 'Energy', weight: '3.6%' },
      { symbol: 'AMEX:XLU', ticker: 'SIXU', name: 'Utilities', weight: '2.5%' },
      { symbol: 'AMEX:XLB', ticker: 'SIXB', name: 'Materials', weight: '2.0%' },
    ];

    const allSyms = [
      ...indexDefs.map((d) => d.symbol),
      ...sectorDefs.map((d) => d.symbol),
    ];
    const { quotes, sparklines } = await fetchQuotesWithSparklines(allSyms);

    const indices = indexDefs.map((d) => {
      const q = quotes[d.symbol];
      return {
        ...d,
        price: q?.price ?? 5800,
        prevClose: q?.prevClose ?? 5780,
        change: q?.change ?? 20,
        changePct: q?.changePct ?? 0.35,
        sparkline: sparklines[d.symbol]?.points || [],
      };
    });

    const sectors = sectorDefs.map((s) => {
      const q = quotes[s.symbol];
      return {
        ...s,
        price: q?.price ?? 220,
        changePct: q?.changePct ?? 0.45,
        sparkline: sparklines[s.symbol]?.points || [],
      };
    });

    // Próximos balances de la cartera (hoy en adelante, máx 6), en vivo.
    const marketPortfolio = db.portfolios[0];
    const marketTickers = new Set<string>(
      (marketPortfolio?.trades || [])
        .map((t) => t.symbol)
        .filter((s) => !s.startsWith('BINANCE:') && !cleanTicker(s).endsWith('USDT'))
        .map((s) => cleanTicker(s).toUpperCase())
        .filter(Boolean)
    );
    let marketEarnings: any[] = [];
    try {
      const all = await fetchEarningsForTickers(marketTickers, 0, 45, {
        deadlineMs: 8000,
      });
      const todayStr = todayInNewYork();
      marketEarnings = all.filter((e) => e.date >= todayStr).slice(0, 6);
    } catch {
      marketEarnings = [];
    }
    if (marketEarnings.length === 0) {
      const todayStr = todayInNewYork();
      marketEarnings = regroupSeedEarnings(seedCalendar.earnings)
        .filter((e) => e.date >= todayStr)
        .slice(0, 6);
    }

    res.json({
      indices,
      sectors,
      news: seedCalendar.news,
      earnings: marketEarnings,
    });
  });

  // State 3 — Individual Asset Analysis, Live Fair Value & 10/20Y Asset Projector
  app.get('/api/asset/:symbol', async (req: Request, res: Response) => {
    const rawSym = decodeURIComponent(String(req.params.symbol)).toUpperCase();
    const range = (req.query.range as string) || '1Y';
    const portfolio = db.portfolios[0];

    // Match against existing meta or create one
    const matchedKey =
      Object.keys(db.assetMeta).find(
        (k) => k === rawSym || cleanTicker(k) === cleanTicker(rawSym)
      ) || (rawSym.includes(':') ? rawSym : `NASDAQ:${rawSym}`);

    const meta = resolveAssetMeta(matchedKey, db.assetMeta);
    const [{ quotes, sparklines }, chart] = await Promise.all([
      fetchQuotesWithSparklines([matchedKey]),
      fetchAssetChart(matchedKey, range),
    ]);

    // Defensive: never dereference a missing quote (this used to throw a 500
    // whose HTML error page crashed the client into a black screen).
    const quote =
      quotes[matchedKey] ||
      ({
        symbol: matchedKey,
        price: chart.points[chart.points.length - 1]?.[1] ?? 100,
        prevClose: chart.prevClose,
        change: 0,
        changePct: 0,
        currency: 'USD',
        marketState: 'closed',
      } as any);
    const [fundInput, extras] = await Promise.all([
      fetchFundamentals(matchedKey, quote.price),
      fetchAssetExtras(matchedKey, quote.price),
    ]);
    const fairValue = computeFairValue(fundInput);

    // User's current position and transactions for this symbol
    const ledger = evaluateLedger(portfolio, db.assetMeta, quotes, fallbackPrices);
    const holding =
      ledger.holdings.find(
        (h) => h.symbol === matchedKey || h.ticker === cleanTicker(matchedKey)
      ) || null;
    const assetTrades = portfolio.trades.filter(
      (t) => t.symbol === matchedKey || cleanTicker(t.symbol) === cleanTicker(matchedKey)
    );

    // Balances de este activo: SOLO caché (cero red nueva en este handler).
    // El escaneo inline de 155 días tardaba ~65 s en frío y bloqueaba toda
    // la ficha; el escaneo vivo vive en GET /api/asset/:symbol/earnings y
    // la vista lo pide aparte. Acá respondemos al instante con lo que la
    // caché por fecha ya tenga (evaluate/market la calientan) y, si falta
    // el próximo balance, lo completamos con el calendarEvents de Yahoo
    // que ya vino en `extras` (sin costo extra).
    const tickerClean = cleanTicker(matchedKey).toUpperCase();
    let earningsInfo: any = null;
    if (!matchedKey.startsWith('BINANCE:') && !tickerClean.endsWith('USDT')) {
      earningsInfo = cacheOnlyEarningsInfo(tickerClean);
      if ((!earningsInfo || !earningsInfo.next) && extras.nextEarningsDate) {
        const yahooNext = {
          date: extras.nextEarningsDate,
          session: null,
          estimateEps: extras.nextEarningsEstimate ?? null,
          fiscalQuarterEnding: '',
        };
        earningsInfo = withNextEvent(earningsInfo, yahooNext);
      }
    }

    const initialForAsset = holding ? holding.value : quote.price * 10;
    const assetProjection = runPortfolioProjection({
      horizonYears: 20,
      initialCapital: initialForAsset,
      monthlyContribution: 250,
      baseCagrPct: fairValue.implied10YReturnCagrPct,
      annualVolatilityPct: 24,
      inflationPct: 3.0,
      convergeToFairValue: true,
      portfolioPriceToFairValue: fairValue.priceToFairValue ?? 0.92,
    });

    res.json({
      symbol: matchedKey,
      meta,
      quote,
      sparkline: sparklines[matchedKey],
      chart,
      fairValue,
      extras,
      earningsInfo,
      holding,
      trades: assetTrades,
      projection: assetProjection,
    });
  });

  // Balances de un activo (escaneo Nasdaq priorizado con deadline de 9 s).
  // Endpoint separado para que /api/asset nunca se bloquee: la vista lo
  // pide después de renderizar y actualiza tarjeta y marcadores al llegar.
  app.get('/api/asset/:symbol/earnings', async (req: Request, res: Response) => {
    const rawSym = decodeURIComponent(String(req.params.symbol)).toUpperCase();
    const matchedKey =
      Object.keys(db.assetMeta).find(
        (k) => k === rawSym || cleanTicker(k) === cleanTicker(rawSym)
      ) || (rawSym.includes(':') ? rawSym : `NASDAQ:${rawSym}`);
    const tickerClean = cleanTicker(matchedKey).toUpperCase();

    if (matchedKey.startsWith('BINANCE:') || tickerClean.endsWith('USDT')) {
      res.json(null);
      return;
    }

    // El respaldo de Yahoo (extras) se dispara EN PARALELO con el escaneo
    // y solo se espera si el escaneo no encontró próximo balance: la
    // respuesta es la misma, pero su latencia no se suma al total.
    const extrasPromise: Promise<any> = (async () => {
      try {
        const { quotes } = await fetchQuotesWithSparklines([matchedKey]);
        return await fetchAssetExtras(matchedKey, quotes[matchedKey]?.price ?? 0);
      } catch {
        return null;
      }
    })();

    let info: any = null;
    try {
      info = await fetchEarningsInfoForTicker(tickerClean, { deadlineMs: 9000 });
    } catch {
      info = null;
    }

    // Si el escaneo no encontró próximo balance, respaldo con el
    // calendarEvents de Yahoo vía extras (cacheado 10 min: es barato;
    // con timeout de 3 s para no colgar el endpoint).
    if (!info || !info.next) {
      try {
        const extras = await Promise.race([
          extrasPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (extras && extras.nextEarningsDate) {
          const yahooNext = {
            date: extras.nextEarningsDate,
            session: null,
            estimateEps: extras.nextEarningsEstimate ?? null,
            fiscalQuarterEnding: '',
          };
          info = withNextEvent(info, yahooNext);
        }
      } catch {
        // sin respaldo: se responde lo que haya (o null)
      }
    }

    res.json(info ?? null);
  });

  app.get('/api/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || 'ALL') as any;

    // 1. Portfolio symbols set
    const portfolioSymbols = new Set(
      db.portfolios.flatMap((p) => p.trades.map((t) => t.symbol))
    );

    // 2. Instant offline catalog search (always works, including typo correction)
    const catalogResults = searchLocalCatalog(
      q,
      db.assetMeta,
      portfolioSymbols,
      category,
      20
    );

    // 3. If query is long enough, also try Yahoo Finance remote search
    const results: any[] = catalogResults.map((c) => ({
      symbol: c.symbol,
      ticker: c.ticker,
      name: c.name,
      exchange: c.exchange,
      type: c.type,
      sector: c.sector,
      inPortfolio: c.inPortfolio,
      refPrice: c.refPrice,
    }));

    if (q.length >= 2) {
      try {
        const remote = await searchSymbols(q);
        const seen = new Set(results.map((m) => m.symbol));
        for (const r of remote) {
          if (!seen.has(r.symbol)) {
            seen.add(r.symbol);
            results.push({
              ...r,
              inPortfolio: portfolioSymbols.has(r.symbol),
            });
          }
        }
      } catch {
        // Yahoo unavailable — catalog results are sufficient
      }
    }
    res.json(results.slice(0, 25));
  });
}
