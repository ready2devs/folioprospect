# SPEC.md — FolioProspect v1 (Specification-Driven Development)

> Fuente de verdad funcional y técnica. Todo el código debe trazarse a un requisito `FP-xxx`.
> Datos reales extraídos por REA/CDP con sesión autenticada desde
> `portfolio.tradingview.com/portfolio/v1/portfolios/2bb80f7315764422a5347e8d38503f4e` (ver `data/seed/`).

## 0. Glosario
- **Ledger**: libro mayor ilimitado de transacciones (trade, cash, dividend, split, illiquid valuation).
- **Holding**: posición derivada del ledger (nunca se persiste como fuente de verdad, salvo activos ilíquidos manuales).
- **H(t)**: valor de mercado de tenencias en el día t. **C(t)**: caja. **PV(t) = H(t) + C(t)** (Portfolio value TV).

## 1. Contrato de datos (persistido en `data/db.json`, generado desde `data/seed/` en el primer arranque)

```ts
type AssetType = 'Stock' | 'Dr' | 'Crypto' | 'ETF' | 'Index' | 'Cash' | 'Illiquid';
interface Portfolio { id: string; title: string; currency: 'USD'; benchmark: string; riskFreeRate: number; // % anual
  startPoint: number; // epoch ms (TV start_point)
  trades: Trade[]; cash: CashTx[]; dividends: DividendTx[]; splits: SplitTx[]; illiquid: IlliquidAsset[]; }
interface Trade { id: string|number; time: number; symbol: string; // formato TV "NASDAQ:NVDA", "BINANCE:BTCUSDT"
  isBuy: boolean; qty: number; price: number; commission: number; comment?: string; }
interface CashTx { id: string; time: number; type: 'deposit'|'withdrawal'|'taxes_and_fees'|'income'; amount: number; currency: string; comment?: string; }
interface DividendTx { id: string; time: number; symbol: string; amount: number; /* total neto USD */ tax?: number; }
interface SplitTx { id: string; time: number; symbol: string; ratio: number; }
interface IlliquidAsset { id: string; name: string; category: 'Real estate'|'Private fund'|'Fixed deposit'|'Bond'|'Other';
  valuations: { time: number; value: number }[]; costBasis: number; currency: string; annualYield?: number; }
interface AssetMeta { symbol: string; ticker: string; exchange: string; yahoo: string; name: string; sector: string;
  industry: string; country: string; assetType: AssetType; currency: string; }
```
- Una "Vista General" (id `overview`) agrega todos los portafolios + ilíquidos.
- **Sin límites**: no existe tope de holdings ni transacciones (FP-010).

## 2. Requisitos funcionales

### Layout global
- **FP-001** Workspace pantalla completa: barra superior (logo FolioProspect, buscador global Ctrl+K, selector de divisa USD/ARS/EUR, toggle tema) + 2 paneles persistentes **1/3 izquierdo – 2/3 derecho**. Sin tercera columna "Investigar".
- **FP-002** Tema Oscuro por defecto, conmutación instantánea a Claro, persistido en localStorage.
- **FP-003** Divisa base: todos los importes se convierten con FX en vivo (USD→ARS `ARS=X`, USD→EUR vía `EURUSD=X`).

### Panel izquierdo — Portfolio Dashboard
- **FP-010** Cabecera: selector de portafolio (Vista General / Personal largo plazo), botón "+" (agregar transacción/posición, efectivo, activo ilíquido) — formularios funcionales que persisten en el backend.
- **FP-011** Valor patrimonial total en vivo + variación diaria ($ y %).
- **FP-012** Lista de posiciones con 5 columnas exactas: (1) Ticker negrita + nombre/sector gris; (2) Sparkline intradía con línea punteada del cierre previo, curva suavizada, relleno degradado verde/rojo y punto luminoso final; (3) Precio arriba + % diario abajo con icono circular ↑/↓; (4) Allocation %; (5) Value (+ P&L opcional en tooltip/segunda línea).
- **FP-013** Clic en título del portafolio → Estado 2. Clic en "Inicio / Mercado" → Estado 1. Clic en una fila → Estado 3.
- **FP-014** Efectivo e ilíquidos aparecen como filas propias (tipo Cash / Illiquid) sin sparkline de mercado.

### Panel derecho — Estado 1 (Mercado, estilo Google Finance)
- **FP-020** Carrusel de índices en vivo: S&P 500 (^GSPC), Nasdaq (^IXIC), Dow Jones (^DJI), VIX (^VIX), Merval (^MERV), Bitcoin (BTC-USD), Oro (GC=F).
- **FP-021** Buscador prominente con autocompletado (Yahoo search); seleccionar → Estado 3.
- **FP-022** Resumen de mercado por región (US / Europe / Asia / Latin America / Currencies / Crypto), sectores (ETFs XLK…XLU), noticias financieras generales, más activos y "Upcoming earnings" de la cartera.

### Panel derecho — Estado 2 (Portafolio, réplica TradingView + expansión)
- **FP-030** Cabecera: dropdown "Personal largo plazo", botón "+ Add to portfolio", acordeón "Portfolio tips".
- **FP-031** 4 tarjetas KPI calculadas por el motor (§3): Portfolio value (subtítulo Cash, toggle Neto/Bruto), Unrealized gain (subtítulo Last day), Realized gain (subtítulo Total dividends), Total gain (subtítulo Annualized yield).
- **FP-032** Pestañas: Overview | Holdings | Transactions | Analysis | Prospectiva 10/20 años.
- **FP-033** Portfolio change: Value vs Performance, Compare con benchmark seleccionable (SPX, NDX, DJI, MERV, BTC), botonera 1M/3M/6M/YTD/1Y/All con el rendimiento de cada período; 3 meses activo por defecto.
- **FP-034** Daily gainers / Daily losers (top 5 c/u) con barras proporcionales, avatar con inicial, badge ticker y %.
- **FP-035** Portfolio distribution: sub-pestañas Assets | Asset types (activa) | Sectors | Currency; donut con "N Total assets" + tabla (Holding value, Allocation, Unrealized gain). Incluye Cash e Illiquid cuando existan.
- **FP-036** Upcoming earnings agrupado "TODAY & YESTERDAY" / "NEXT 30 DAYS" (Symbol, Date, Time sol/luna, Estimate EPS, Actual EPS, Surprise, Market cap). Fuente: Yahoo calendarEvents en vivo, fallback `calendar_snapshot.json`.
- **FP-037** Upcoming dividends con filtro By ex-dividend date / By payment date.
- **FP-038** News: tabla Time | Instrument | Headline | Provider filtrada por los símbolos del portafolio.
- **FP-039** Holdings: tabla ordenable (qty, avg price, costo, valor, P&L $ y %, allocation, cambio diario, total gain, annualized).
- **FP-040** Transactions: tabla completa (30 trades reales extraídos) + alta/edición/borrado + importación CSV formato TradingView (`Symbol,Side,Qty,Fill Price,Commission,Closing Time`) sin límite.
- **FP-041** Analysis: rendimiento mensual vs benchmark (barras), Sharpe, Sortino, Beta, volatilidad anualizada, max drawdown, TWR, MWR/XIRR, valoración intrínseca agregada (Σ qty·FV vs valor de mercado).
- **FP-042** Prospectiva 10/20 años: escenarios Conservador/Base/Optimista, Monte Carlo (≥1000 trayectorias, percentiles P10/P50/P90), aporte periódico mensual, inflación (valores reales vs nominales), convergencia a Fair Value (ajuste inicial por P/FV en N años).

### Panel derecho — Estado 3 (Activo individual)
- **FP-050** Cabecera con precio en vivo, cambio diario, gráfico interactivo 1D/5D/1M/6M/YTD/1Y/5Y/MAX con tooltip.
- **FP-051** Tenencia del usuario (qty, costo, valor, P&L) e historial de transacciones del activo.
- **FP-052** Fair Value estilo Morningstar: barra Precio vs FV con bandas Subvaluado / Precio justo / Sobrevaluado, ratio P/FV, Economic Moat (Wide/Narrow/None), múltiplos P/E, Forward P/E, EV/EBITDA, FCF Yield, ROIC (proxy), objetivo analistas.
- **FP-053** Mini-proyector 10/20 años: CAGR editable (default = derivado de FV), aporte mensual, resultado y contribución al portafolio.

### Transversales
- **FP-060** Buscador global Ctrl+K (modal) disponible en todos los estados.
- **FP-061** Precios refrescados cada 15 s (quotes) — "en vivo"; sparklines cada 60 s.
- **FP-062** Resiliencia: si la red falla, el backend sirve el último snapshot (`price_history_snapshot.json`) y la UI muestra un indicador "datos en caché".
- **FP-063** Tipografía numérica mono con `font-variant-numeric: tabular-nums`.

## 3. Motor de cálculo (replicado por REA del backend de TradingView — validado numéricamente)

Fuente: `data/seed/tv_reference.json#formulas`.
1. **Posiciones**: costo promedio ponderado. Compra: invested += qty·price + commission; qty += q. Venta: realized += (qty·price − commission) − avg·qty; invested −= avg·qty.
2. **Caja**: C = Σdepósitos − Σretiros + Σingresos − Σcompras(qty·price+com) + Σventas(qty·price−com) + Σdividendos. El portafolio real no tiene depósitos → C = −134,853.81 (TV `free_cash`).
3. **PV(t) = H(t) + C(t)**, con H(t) = Σ qty_s(t) · close_s(t) (forward-fill de precios no hábiles; cripto cotiza 7d).
4. **Unrealized** = Σ(value − invested); % = unrealized / Σinvested. **Last day** = Σ qty·(last − prevClose); % sobre H(ayer).
5. **Total gain** = unrealized + realized + dividends.
6. **Retorno mensual (TWR TradingView)** = Modified Dietz por mes calendario: r = (H_fin − H_ini − F) / (H_ini + Σ F_i·w_i), w_i = (T − k_i)/T con k_i índice del día dentro del mes, T días del mes en la serie. Flujos F = compras − ventas del día.
   Validado: abr-2026 20.48% (TV 20.48), may-2026 10.65% (TV 10.65), sep-2026 4.08% (TV 4.07).
7. **Períodos**: encadenado geométrico de meses calendario: 1M = mes en curso; 3M = últimos 3 meses calendario incl. actual; 6M; YTD = desde enero; 1Y = últimos 12 meses; All = desde start_point. (Validado: 3M 4.70 vs TV 4.71; 6M 10.04 vs 10.05.)
8. **Annualized yield** = (1+TWR_all)^(365/días desde startPoint) − 1.
9. **Sharpe** = (mean(r_m) − rf/12) / σ_pob(r_m); **Sortino** = (mean(r_m) − rf/12) / sqrt(Σ min(0, r_m − rf/12)² / N); **Beta** = cov(r_m,b_m)/var(b_m). (Validados: 0.3150 / 0.8066 / 1.7997 idénticos a TV.)
10. **Volatilidad** = σ(retornos diarios TWR)·√252; **Max drawdown** sobre índice TWR diario; **MWR/XIRR** sobre flujos (compras negativas, ventas positivas, valor final positivo).
11. **Benchmark**: índice rebasado a 0% al inicio del período; mensual = cierre de mes / cierre mes previo − 1.
12. **Fair Value** (FP-052): FV = 0.5·DCF + 0.5·targetMeanPrice (si existe uno solo, se usa ése). DCF: FCF/acción, crecimiento g0 = clamp(earningsGrowth|revenueGrowth, −5%, 25%) decayendo linealmente a 3% en 10 años, tasa 9% (+1% si beta>1.5), terminal 3%. Cripto: sin FV (muestra "N/A — activo sin flujos").
   Bandas: P/FV < 0.85 Subvaluado; 0.85–1.10 Precio justo; > 1.10 Sobrevaluado. Moat: Wide si margen bruto > 50% y ROE > 20% y margen operativo > 25%; Narrow si ROE > 12% y margen operativo > 10%; si no None.
13. **Proyección**: determinística V_{m+1} = V_m·(1+μ/12) + aporte; escenarios μ_cons = μ_base − 4pp, μ_opt = μ_base + 4pp, μ_base default 9% nominal; Monte Carlo log-normal mensual con σ anual (default = volatilidad realizada, acotada 10–45%), semilla fija reproducible; convergencia a FV: factor (FV/P)^(1/N) aplicado los primeros N años; inflación descuenta a valores reales.

## 4. Criterios de aceptación (gatekeeper)
- AC-1 `npm run dev` levanta API (:5174) y web (:5173) sin errores de compilación ni de consola.
- AC-2 `npm test` pasa: el motor reproduce sobre el seed + snapshot de precios: TWR mensual abr-2026 = 20.48% ± 0.05, Sharpe 0.315 ± 0.005, Sortino 0.807 ± 0.01, Beta 1.80 ± 0.01, realized = 10,168–10,176, cash = −134,851 ± 5, 20 holdings abiertos.
- AC-3 Los 3 estados del panel derecho conmutan desde el panel izquierdo y el buscador.
- AC-4 Agregar una transacción/efectivo/ilíquido persiste (sobrevive a recargar) y recalcula KPIs.
- AC-5 `npm run build` (tsc + vite build) termina sin errores.
