# SPEC-006 — Watchlist persistente en la vista de activo + configuración de la ficha dentro del panel de evaluación

Pedido del dueño, 2026-11-14 05:29 (con dos capturas: la ficha de AAPL actual y una watchlist de TradingView agrupada por tipo de activo).

## 1. Problema / pedido

En la vista de activo («Activo & Fair Value»), debajo del gráfico, la columna izquierda la ocupa el formulario «Datos de la ficha» y la derecha la «Evaluación de oportunidad». El dueño pide:

1. El formulario «Datos de la ficha» deja de ser una columna propia: pasa a ser una **configuración dentro del panel derecho**, junto con la Evaluación de oportunidad.
2. En el lugar que deja libre (columna izquierda) va una **watchlist persistente y preconfigurada** con todos los activos que sigue en Investing.com, **en su orden de importancia**, agrupada **por tipo de activo** con etiquetas de sección (como la captura de TradingView: secciones con rótulo y filas con símbolo, precio y % del día).
3. Al lado del nombre de cada activo de la watchlist, la **sigla de su evaluación de oportunidad**: Compra Fuerte = **CM**, Comprar de a poco = **C**, Mantener = **M**, Vender = **V**.
4. Al tocar un activo de la watchlist, ese activo se **despliega en la ventana principal** (gráfico, datos y evaluación), igual que cuando se lo abre desde la cartera o el buscador.

## 2. La lista (fuente: captura de Investing del dueño, 2026-10-20)

Orden exacto de la captura (88 filas; se deduplica conservando la primera aparición — duplicados: INTU, ASTS, NASA, SPCX — y quedan **84 únicos**):

GOOG, TSM, MU, NVDA, META, MSFT, NU, AMZN, BTC/USD, ETH/USD, MELI, VIST, AAPL, CLS, AVGO, CRDO, TMDX, NBIS, SIMO, HSAI, SOL/USD, BNB/USD, ETH/BTC, SPY, APP, APH, LMB, MRVL, BKNG, ONDS, ASML, JD, PDD, FSLR, BABA, TSLA, AXP, CRM, ACN, AMD, STRL, EEFT, EVER, JBL, EXEL, WRD, AMBA, RMBS, SMCI, FTNT, MCHP, UPST, NVO, APLD, ORCL, QCOM, NOW, SNDK, ADBE, ALAB, IREN, INTU, ASTS, PRIM, TER, EWY, COPX, CBRS, NASA, LITE, GCT, NFLX, SPCX, ONTO, SYM, MOD, HUMN, AAOI, TLN, ACMR, BE, VST, CEG, CDW.

### Etiquetas por tipo de activo (asignación del asistente, por encargo del dueño)

- **ACCIONES**: todas las acciones y ADRs (79 de la lista menos cripto y ETFs). Incluye las que ya no tiene en cartera (NBIS, SIMO, HSAI): son seguimiento, no posición.
- **CRIPTO**: BTC/USD, ETH/USD, SOL/USD, BNB/USD y el par ETH/BTC.
- **ETFS**: SPY, EWY, COPX, NASA, HUMN.

Su lista no contiene CEDEARs ni tickers locales argentinos, por eso no hay secciones CEDEARS/ARGY (si algún día los sigue, se agregan como etiquetas nuevas). Dentro de cada sección se conserva el **orden relativo de la captura** (su orden de importancia).

Símbolos completos de la app: resolver cada ticker a su símbolo con prefijo (NASDAQ:/NYSE:/AMEX:/BINANCE:…) validándolo contra el buscador/cotizaciones de la propia app; cripto como los de su cartera (BINANCE:BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT) y el par BINANCE:ETHBTC. Si un símbolo no resuelve (ej. SPCX), la fila se muestra igual con el ticker y sin precio, marcada como no disponible — nunca se inventa un precio.

## 3. Diseño

### 3.1 Layout de la vista de activo (escritorio)

- Debajo del gráfico y las franjas de balances/dividendos, la grilla pasa a: **columna izquierda = Watchlist** (ancho similar al que hoy tiene el formulario, ~300–340 px, con scroll propio) y **columna derecha = Evaluación de oportunidad** (como hoy).
- El formulario «Datos de la ficha» se integra en la columna derecha como **sección de configuración colapsable**: un botón «Configurar ficha» (o engranaje) en el encabezado de la Evaluación que despliega el formulario **dentro del mismo panel**, sobre la evaluación. Colapsado por defecto; al editar, la evaluación se recalcula en vivo como hoy. Ningún campo cambia de comportamiento.
- La watchlist **no se remonta al cambiar de activo** (vive en AssetView, fuera del componente con `key` por símbolo): conserva su scroll y su estado mientras se navega entre activos.
- En móvil: la watchlist va como bloque de ancho completo entre el gráfico y la evaluación, con alto máximo y scroll interno; las secciones se pueden colapsar.

### 3.2 Filas de la watchlist

- Encabezado de sección con la etiqueta (ACCIONES / CRIPTO / ETFS) y la cantidad.
- Fila: **ticker** (y nombre corto si entra), **sigla del veredicto** junto al nombre (pastilla chica con color por veredicto: CM verde fuerte, C verde, M neutro/ámbar, V rojo; title con el veredicto completo), **precio** y **% del día** a la derecha (verde/rojo como el resto de la app).
- Fila del activo abierto actualmente: resaltada como las posiciones seleccionadas de la cartera.
- Clic en una fila: abre ese activo con el mecanismo existente (`selectAsset`), actualizando gráfico, datos y evaluación.

### 3.3 Datos

- **Persistencia**: la lista (símbolos, etiqueta y orden) se guarda en el servidor con el mismo mecanismo que los demás ajustes del usuario (nace sembrada con la lista de §2; si el servidor ya tiene una guardada, manda la guardada). Debe sobrevivir a recargas y cambios de dispositivo, igual que las subcarteras.
- **Precios y % del día**: del pipeline de cotizaciones existente de la app (el mismo que alimenta Mercado/cartera), en lote para los 84 símbolos; refresco con la cadencia habitual de la app (Live 15 s) sin bloquear la vista.
- **Siglas de veredicto**: se calculan con la **misma regla de la ficha** (`computeOpportunity` sobre los escenarios del motor: pesimista/base/optimista + incertidumbre del motor, escenario Base) a partir del mismo pipeline de Fair Value que usa `/api/asset/:symbol`. Como son ~79 evaluaciones, van **cacheadas por símbolo con vencimiento diario** (persistidas en el servidor) y se resuelven **en lotes progresivos**: la fila muestra la sigla cuando está; mientras tanto, un marcador tenue «··». Cripto, el par ETH/BTC y los ETFs no tienen evaluación del motor: sigla «—» con title «Sin evaluación de oportunidad».
- Nada de siglas inventadas: si el motor no puede valuar un activo (sin patas), la sigla es «—».

## 4. Fuera de alcance

- Editar la lista desde la UI (agregar/quitar/reordenar): queda para una iteración posterior; hoy es preconfigurada.
- Cambiar cualquier cálculo del motor, del veredicto o de la ficha.
- Llevar la watchlist a otras vistas (Mercado/Portafolio/Optimizador): por ahora vive en la vista de activo, que es donde el dueño la pidió.

## 5. Aceptación

1. En la vista de activo ya no existe la columna «Datos de la ficha»; la configuración se abre dentro del panel de la Evaluación y editarla recalcula la ficha en vivo.
2. La watchlist muestra los 84 activos únicos agrupados en ACCIONES/CRIPTO/ETFS, en el orden relativo de la captura dentro de cada grupo, con precio y % del día reales.
3. Las siglas CM/C/M/V coinciden con el veredicto que la ficha muestra al abrir ese activo (verificado en una muestra de ≥5 activos, incl. uno de cada veredicto disponible).
4. Tocar una fila abre el activo en toda la ventana principal; la watchlist conserva su scroll.
5. Recargar la página (y abrir desde otro dispositivo) mantiene la watchlist tal cual.
6. QA en 412×915 y 1440 sin desbordes; suite de tests en verde (con tests nuevos para: deduplicación y agrupado de la lista semilla, mapeo veredicto→sigla, y sanitización de la config persistida) y build OK.

## 6. Nota de implementación (2026-11-14)

- **Configuración**: `NwSettings.watchlist` (`{ items: [{ symbol, ticker, group }] }`),
  mismo patrón que `subPortfolios`: viaja en GET/PUT `/api/settings/nw` y la
  sanea `sanitizeWatchlist` en `server/db.ts` (ausente → `undefined` y el
  cliente siembra; basura → `{ items: [] }`; tope 200 items; dedupe por
  ticker). La lógica pura (semilla, agrupado, resolución, mapeo de siglas)
  vive en `shared/engine/watchlist.ts`; sin campo guardado se siembra la
  lista del §2 con `resolveWatchlistConfig`.
- **Resolución de símbolos**: validada el 2026-11-14 contra `/api/search`
  (buscador de la app) y `/api/quotes` para los 84 rótulos: **todos
  resuelven con cotización real**, incluido SPCX (`NASDAQ:SPCX`, «Space
  Exploration Technologies Corp.» — la spec lo daba como ejemplo de
  posible no-resolución, pero manda su propia regla de validación).
  Correcciones que dejó la validación: LMB→NASDAQ, NASA→AMEX (ETF Tema
  Space), GCT→NASDAQ, HUMN→AMEX (ETF Roundhill Humanoid Robotics).
  `symbol: null` queda soportado en el tipo y en la UI («s/d», fila no
  clicable) para activos que dejen de resolver.
- **Precios**: `GET /api/quotes?symbols=` reutiliza
  `fetchQuotesWithSparklines` (el pipeline de Mercado/cartera) y solo
  devuelve símbolos con precio real finito > 0. Refresco del cliente
  cada 15 s (cadencia Live).
- **Siglas**: `GET /api/watchlist/verdicts?symbols=` (tope 24 por pedido)
  calcula con la MISMA regla de la ficha — `buildAssetOptimizerFv` (el
  pipeline de Fair Value de `/api/asset/:symbol`) + `computeOpportunity`
  con `scenariosFromMotorFv`, escenario Base, incertidumbre del motor —
  y mapea con `verdictToSigla` («CM» para COMPRA FUERTE, literal del
  dueño). Concurrencia acotada: pool de 3. **Caché persistida** en
  `db.verdictCache` (mapa símbolo → `{ sigla, verdict, at, day }`) con
  **vencimiento diario por día de Nueva York** (`todayInNewYork`, el
  criterio del resto de la app); al persistir se podan los días viejos.
  Sin FV del motor (cripto, par ETH/BTC, ETFs, fuentes caídas) la sigla
  es «—» definitiva y también se cachea. El cliente pide solo las
  ACCIONES, en lotes progresivos de 6 con control de generación (una
  tanda cancelada nunca marca símbolos como resueltos).
- **Layout**: la grilla vive en `AssetView` (izquierda `WatchlistPanel`
  300–340 px con `position: sticky` y scroll propio; derecha la
  evaluación). `WatchlistPanel` queda fuera del `OpportunitySheet` con
  `key` por símbolo: no se remonta al navegar y conserva el scroll
  (verificado en QA: scrollTop 864 → 864 tras clicar una fila visible).
  `OpportunitySheet` devuelve solo la ficha; el formulario «Datos de la
  ficha» + resumen se renderizan dentro de ella tras el botón
  «Configurar ficha» del encabezado (colapsado por defecto, mismo
  estado `formOpen`, sin cambios de campos ni de comportamiento). En
  móvil la watchlist es un bloque de ancho completo (alto máximo
  360 px, scroll interno) entre el gráfico y la evaluación.
- **QA** (Playwright, datos reales, carpeta `qa-subcarteras-2026-11-13`,
  prefijo `v7-`): escritorio con grupos y configuración colapsada;
  configuración desplegada en el panel derecho con recálculo en vivo
  (precio 330,95 → 413,69: upside +1,7% → −18,7%); clic en fila que
  navega la ventana principal conservando el scroll; móvil 412×915 sin
  desborde (scrollWidth 412) y orden gráfico → watchlist → evaluación.
  Siglas contrastadas contra el titular del veredicto de la ficha:
  NU CM = COMPRA FUERTE, GOOG M = MANTENER, AAPL V = VENDER (acuerdo
  exacto); NVDA y MU no se pudieron contrastar en la misma ventana de
  tiempo porque el pipeline de datos de este entorno devuelve añadas
  distintas entre llamadas (p. ej. el FV base de NVDA osciló 176 ↔ 291
  en una hora): la sigla y la ficha usan por construcción la misma
  regla y el mismo pipeline, y la caché diaria hace que la sigla sea
  la foto del día.
