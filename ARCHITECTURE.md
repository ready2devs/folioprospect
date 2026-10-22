# ARCHITECTURE.md — FolioProspect v1

## Stack
- **Frontend**: Vite 6 + React 18 + TypeScript (strict), Zustand (estado), SVG propio para sparklines/donut/barras, `lightweight-charts` v4 para gráficos de precio/portfolio. CSS variables (sin framework) — tokens en `src/styles/tokens.css`.
- **Backend**: Node 25 + Express 4 ejecutado con `tsx`, puerto **5174**. Persistencia JSON atómica (`data/db.json`). Proxy/caché de Yahoo (crumb+cookie) con TTL.
- **Motor compartido**: `shared/engine/*.ts` (TS puro, sin dependencias, usado por cliente y servidor; testeado con Vitest).
- Dev: `npm run dev` = concurrently(api, vite). Vite proxy `/api → http://127.0.0.1:5174`.

## Estructura
```
data/seed/            # extracción REA (no editar a mano)
  tradingview_extract.json  asset_meta.json  calendar_snapshot.json
  tv_reference.json   price_history_snapshot.json
data/db.json          # generado en el primer arranque (gitignored)
shared/engine/        # ledger.ts series.ts returns.ts risk.ts fairvalue.ts projection.ts format.ts types.ts index.ts
shared/engine/__tests__/engine.test.ts
server/               # index.ts db.ts yahoo.ts routes.ts
src/                  # main.tsx App.tsx store.ts api.ts
  components/layout/  TopBar.tsx SearchModal.tsx
  components/left/    LeftPanel.tsx PositionRow.tsx Sparkline.tsx AddDialog.tsx
  components/market/  MarketView.tsx IndexCarousel.tsx
  components/portfolio/ PortfolioView.tsx KpiCards.tsx PortfolioChange.tsx Movers.tsx Distribution.tsx Earnings.tsx Dividends.tsx News.tsx HoldingsTab.tsx TransactionsTab.tsx AnalysisTab.tsx ProspectTab.tsx
  components/asset/   AssetView.tsx FairValue.tsx AssetProjector.tsx
  components/ui/      Donut.tsx Tabs.tsx Num.tsx
  styles/             tokens.css app.css
```

## API (REST, JSON)
| Método | Ruta | Descripción |
|---|---|---|
| GET | /api/health | `{ok, cached:boolean}` |
| GET | /api/portfolios | lista `{id,title}` |
| GET | /api/portfolios/:id | Portfolio completo (ledger) |
| POST | /api/portfolios/:id/trades | alta (array o único) |
| PUT/DELETE | /api/portfolios/:id/trades/:txId | edición/baja |
| POST | /api/portfolios/:id/cash | alta CashTx |
| POST | /api/portfolios/:id/dividends | alta DividendTx |
| POST/PUT/DELETE | /api/portfolios/:id/illiquid[/:assetId] | activos ilíquidos |
| POST | /api/portfolios/:id/import | CSV TradingView (text/csv o {csv}) |
| GET | /api/meta?symbols= | AssetMeta (seed + Yahoo assetProfile para nuevos) |
| GET | /api/quotes?symbols=A,B | `{[sym]:{price,prevClose,change,changePct,currency,name,time}}` (acepta formato TV o Yahoo) |
| GET | /api/chart?symbol=&range=1d\|5d\|1mo\|6mo\|ytd\|1y\|5y\|max&interval= | `{points:[t,close][], prevClose}` |
| GET | /api/history?symbols=&from= | cierres diarios para el motor |
| GET | /api/search?q= | autocompletado |
| GET | /api/fundamentals?symbol= | métricas para FV |
| GET | /api/news?symbols= | noticias |
| GET | /api/calendar?symbols= | earnings + dividendos |
| GET | /api/fx | `{USD:1, ARS, EUR}` |

Mapeo de símbolos TV→Yahoo: `EXCH:TICKER` → `TICKER`; `BINANCE:XXXUSDT` → `XXX-USD`; `SP:SPX`→`^GSPC`, `NASDAQ:NDX`→`^NDX`, `DJ:DJI`→`^DJI`, `BCBA:IMV`→`^MERV`.

## Flujo de datos
1. Cliente carga portafolio + meta + historial diario (desde startPoint) + quotes.
2. `shared/engine` construye ledger → serie diaria → KPIs / períodos / riesgo / distribución.
3. Quotes cada 15 s actualizan el último punto (precio vivo) y recalculan KPIs en memoria.
4. Mutaciones del ledger → POST → refetch → recálculo.

## Sistema de diseño "Obsidian Quant"
Tokens (dark/light) exactamente según la especificación del producto: bg #090D16/#F8FAFC, surface #111827/#FFFFFF, hover #1E293B/#F1F5F9, border #1F2937/#E2E8F0, text #F8FAFC/#0F172A, text-2 #94A3B8/#475569; brand gradient #38BDF8→#6366F1; fair value #F59E0B; up #10B981/#4ADE80; down #F43F5E/#F87171. Fuentes Inter (UI) y JetBrains Mono (números, tabular-nums) vía @fontsource.

## Referencias visuales
`docs/reference/google_finance.png`, `docs/reference/tradingview_portfolio.png` (capturadas por REA/CDP).
