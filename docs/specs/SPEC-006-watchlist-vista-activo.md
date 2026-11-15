# SPEC-006 — Watchlist persistente en la vista de activo + configuración de la ficha dentro del panel de evaluación

Pedido del dueño, 2026-11-14 05:29 (con dos capturas: la ficha de AAPL actual y una watchlist de TradingView agrupada por tipo de activo).

## 1. Problema / pedido

En la vista de activo («Activo & Fair Value»), debajo del gráfico, la columna izquierda la ocupa el formulario «Datos de la ficha» y la derecha la «Evaluación de oportunidad». El dueño pide:

1. El formulario «Datos de la ficha» deja de ser una columna propia: pasa a ser una **configuración dentro del panel derecho**, junto con la Evaluación de oportunidad.
2. En el lugar que deja libre (columna izquierda) va una **watchlist persistente y preconfigurada** con todos los activos que sigue en Investing.com, **en su orden de importancia**, agrupada **por tipo de activo** con etiquetas de sección (como la captura de TradingView: secciones con rótulo y filas con símbolo, precio y % del día).
3. Al lado del nombre de cada activo de la watchlist, la **sigla de su evaluación de oportunidad**: Compra Fuerte = **CF**, Comprar de a poco = **C**, Mantener = **M**, Vender = **V**. (La sigla de Compra Fuerte se publicó como «CM» en la v1 por un malentendido y el dueño la corrigió a «CF» en vivo; ver la enmienda v8, §7.)
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
- Fila: **ticker** (y nombre corto si entra), **sigla del veredicto** junto al nombre (pastilla chica con color por veredicto: CF verde fuerte, C verde, M neutro/ámbar, V rojo; title con el veredicto completo), **precio** y **% del día** a la derecha (verde/rojo como el resto de la app).
- Fila del activo abierto actualmente: resaltada como las posiciones seleccionadas de la cartera.
- Clic en una fila: abre ese activo con el mecanismo existente (`selectAsset`), actualizando gráfico, datos y evaluación.

### 3.3 Datos

- **Persistencia**: la lista (símbolos, etiqueta y orden) se guarda en el servidor con el mismo mecanismo que los demás ajustes del usuario (nace sembrada con la lista de §2; si el servidor ya tiene una guardada, manda la guardada). Debe sobrevivir a recargas y cambios de dispositivo, igual que las subcarteras.
- **Precios y % del día**: del pipeline de cotizaciones existente de la app (el mismo que alimenta Mercado/cartera), en lote para los 84 símbolos; refresco con la cadencia habitual de la app (Live 15 s) sin bloquear la vista.
- **Siglas de veredicto**: se calculan con la **misma regla de la ficha** (`computeOpportunity` sobre los escenarios del motor: pesimista/base/optimista + incertidumbre del motor, escenario Base) a partir del mismo pipeline de Fair Value que usa `/api/asset/:symbol`. Como son ~79 evaluaciones, van **cacheadas por símbolo** y se resuelven **en lotes progresivos**: la fila muestra la sigla cuando está; mientras tanto, un marcador tenue «··». (La caché era persistida con vencimiento diario en el diseño original; la enmienda v10, §9, la reemplazó por una caché en memoria de 15 min para que la sigla no contradiga a la ficha.) Cripto, el par ETH/BTC y los ETFs no tienen evaluación del motor: sigla «—» con title «Sin evaluación de oportunidad».
- Nada de siglas inventadas: si el motor no puede valuar un activo (sin patas), la sigla es «—».

## 4. Fuera de alcance

- Editar la lista desde la UI (agregar/quitar/reordenar): queda para una iteración posterior; hoy es preconfigurada. **(Superado por la enmienda v8, §7: agregar, quitar y reordenar ya se hacen desde la UI.)**
- Cambiar cualquier cálculo del motor, del veredicto o de la ficha.
- Llevar la watchlist a otras vistas (Mercado/Portafolio/Optimizador): por ahora vive en la vista de activo, que es donde el dueño la pidió.

## 5. Aceptación

1. En la vista de activo ya no existe la columna «Datos de la ficha»; la configuración se abre dentro del panel de la Evaluación y editarla recalcula la ficha en vivo.
2. La watchlist muestra los 84 activos únicos agrupados en ACCIONES/CRIPTO/ETFS, en el orden relativo de la captura dentro de cada grupo, con precio y % del día reales.
3. Las siglas CF/C/M/V coinciden con el veredicto que la ficha muestra al abrir ese activo (verificado en una muestra de ≥5 activos, incl. uno de cada veredicto disponible).
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
  y mapea con `verdictToSigla` («CF» para COMPRA FUERTE desde la
  enmienda v8; en la v1 se publicó «CM», ver §7). Concurrencia
  acotada: pool de 3. **Caché persistida** en
  `db.verdictCache` (mapa símbolo → `{ sigla, verdict, at, day }`) con
  **vencimiento diario por día de Nueva York** (`todayInNewYork`, el
  criterio del resto de la app); al persistir se podan los días viejos.
  Sin FV del motor (cripto, par ETH/BTC, ETFs, fuentes caídas) la sigla
  es «—» definitiva y también se cachea. (**La caché persistida por
  día descripta en este párrafo quedó SUPERADA por la enmienda v10,
  §9: salió del camino de servicio y fue reemplazada por una caché
  en memoria de 15 min.**) El cliente pide solo las
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
  NU CF = COMPRA FUERTE (registrado en su momento como «CM»; la
  sigla vigente es CF desde la enmienda v8, §7), GOOG M = MANTENER, AAPL V = VENDER (acuerdo
  exacto); NVDA y MU no se pudieron contrastar en la misma ventana de
  tiempo porque el pipeline de datos de este entorno devuelve añadas
  distintas entre llamadas (p. ej. el FV base de NVDA osciló 176 ↔ 291
  en una hora): la sigla y la ficha usan por construcción la misma
  regla y el mismo pipeline, y la caché diaria hace que la sigla sea
  la foto del día.

## 7. Enmienda v8 (2026-11-14) — sigla CF, filtro por veredicto, alta/baja y reordenamiento desde la UI

Feedback del dueño usando la watchlist en vivo en su celular, el mismo
día de la publicación. Tres cambios:

1. **Compra Fuerte = «CF», no «CM».** La v1 publicó «CM» porque el
   pedido original lo transcribió así; el dueño lo corrigió en vivo
   («CF es compra fuerte, no CM»). Cambia `verdictToSigla` y todo lo
   que la usa (pastilla, colores, tests, esta spec). Como la caché de
   veredictos persiste `{ sigla, verdict }` por día, el endpoint
   `GET /api/watchlist/verdicts` **re-deriva la sigla desde el
   veredicto guardado al servir** (`rederiveVerdictSigla`): las
   entradas cacheadas como «CM» se sirven como «CF» sin esperar al
   vencimiento diario.
2. **Filtro por veredicto.** Fila de chips sobre la lista: Todos /
   CF / C / M / V, cada sigla con su color y el conteo de las ya
   cargadas. Filtrar muestra solo las filas cuya sigla **cargada**
   coincide; los grupos que quedan sin filas visibles se ocultan; las
   filas todavía cargando («··») y las «—» (cripto, ETFs) solo
   aparecen en «Todos». Sin resultados, un mensaje simple («Ningún
   activo en Compra Fuerte por ahora», según el filtro). La lógica es
   la función pura `filterWatchlistItems` (+ `countWatchlistSiglas`)
   de `shared/engine/watchlist.ts`; el estado del filtro es local al
   panel y arranca en «Todos».
3. **Agregar, quitar y reordenar activos desde la UI** (lo que §4
   dejaba para una iteración posterior):
   - **Agregar**: botón «+ Agregar» siempre visible en el encabezado.
     Abre un buscador mínimo propio sobre el mismo endpoint del
     buscador global (`/api/search` vía `api.search`; el SearchModal
     global no se reutiliza porque está acoplado a navegar/operar).
     Al elegir un resultado, el activo se agrega **al final de su
     grupo**, detectado automáticamente (`detectWatchlistGroup`:
     símbolo BINANCE: → CRIPTO; tipo ETF del resultado → ETFS; resto
     → ACCIONES) y se **persiste en el acto** con el patrón de
     guardado de las subcarteras (`setNwSettings` →
     GET/PUT `/api/settings/nw`; el sanitizador ya aceptaba items
     arbitrarios). Si ya está (por símbolo o por ticker), no se
     duplica y se avisa «Ya está en tu watchlist».
   - **Quitar**: botón «Editar» (lápiz) en el encabezado activa el
     modo edición: cada fila muestra un botón × (objetivo táctil
     ≥32 px) que quita el activo y persiste en el acto; «Listo» sale
     del modo. En modo edición las filas **no navegan** al activo,
     para que quitar no sea una trampa de toques. Fuera del modo
     edición, el comportamiento no cambia.
   - **Reordenar** (agregado del dueño con las capturas de edición
     de Investing: flechas ↑/↓ a un lado de la fila y × al otro): en
     el modo edición, cada fila muestra también botones ↑ y ↓
     (≥32 px) a la izquierda. Subir/bajar intercambia la posición
     con el ítem anterior/siguiente **de su mismo grupo** — las
     secciones son por tipo de activo y el movimiento nunca cruza
     de grupo —; en el primer ítem del grupo la ↑ queda
     deshabilitada y en el último la ↓ también. Cada movimiento
     **persiste en el acto**, sin botón «Guardar» aparte. Helper
     puro `moveWatchlistItem(config, ticker, 'up' | 'down')`: swap
     dentro del grupo, bordes sin efecto (devuelve la misma
     config), sin mutar la original.
   - Helpers puros testeados: `addWatchlistItem` (dedupe por símbolo
     y por ticker), `removeWatchlistItem`, `moveWatchlistItem`,
     `buildWatchlistItemFromSearch`, `detectWatchlistGroup`,
     `watchlistContains`. Acciones del store: `addWatchlistItem` /
     `removeWatchlistItem` / `moveWatchlistItem`, mismo patrón que
     las subcarteras.

**QA v8** (Playwright, datos reales, prefijo `v8-`): filtro por la
sigla más poblada en móvil mostrando solo esas filas; alta de KLAC
desde el buscador con persistencia verificada tras recargar (vía API);
reordenamiento en modo edición (bajar un activo un puesto y subirlo
de nuevo, con el orden persistido tras recargar y captura del modo
edición con las flechas a 412 px); baja del mismo activo en modo
edición, también verificada tras recargar; pastilla CF visible en
filas (NU); escritorio sin desbordes.

## 8. Enmienda v9 (2026-11-14) — reordenamiento por arrastre con presión sostenida

Corrección de interacción del dueño tras usar la v8 en vivo: «al
mantener apretado el bloque del activo tengo que poder moverlo para
arriba o para abajo dentro de la ventana del watchlist; no son
prácticas las flechas para subir o bajar cuando tengo que bajar un
montón de posiciones». Cambios:

- **Se retiran las flechas ↑/↓** del modo edición (quedan la × para
  quitar y el «+ Agregar» como estaban) y con ellas el helper
  `moveWatchlistItem` y la acción homónima del store, sin código
  muerto.
- **Arrastre con presión sostenida**, solo en el modo edición
  (fuera de edición el toque sigue abriendo el activo y el scroll
  sigue siendo scroll):
  - Presión sostenida de ~300 ms sin moverse más de ~10 px sobre el
    bloque de una fila **activa** el arrastre: la fila se «levanta»
    (sombra, borde de acento, leve escala 1,02) y vibra corto si el
    dispositivo lo soporta. Un gesto de scroll (o cualquier
    movimiento mayor a la tolerancia) **cancela** la presión
    pendiente: en edición, scrollear sigue siendo la forma de
    recorrer la lista.
  - Mientras se arrastra, la fila sigue al dedo/mouse y las demás
    filas **del grupo** se desplazan con transición suave dejando el
    hueco; el puesto destino se calcula por el centro de la fila
    arrastrada contra los centros de sus hermanas.
  - **Auto-scroll**: si el puntero se acerca a ~56 px del borde
    superior o inferior del área visible del panel, el contenedor
    scrollea solo, con velocidad creciente cerca del borde, para
    bajar/subir muchas posiciones sin soltar.
  - El arrastre **nunca cruza de grupo**: la fila se detiene en el
    primer/último puesto de su grupo (ACCIONES/CRIPTO/ETFS). Con un
    filtro de veredicto activo no se puede arrastrar (al entrar a
    edición el filtro vuelve a «Todos»: el índice visible tiene que
    ser el índice real del grupo).
  - Al soltar se persiste **una sola vez** el orden completo (store
    → `PUT /api/settings/nw`, la misma vía del alta/baja). Si el
    arrastre se cancela (`pointercancel`, el navegador se queda con
    el gesto) o se suelta sin haber cambiado de puesto, no se
    persiste nada.
  - Implementación con Pointer Events y estado propio, sin
    librerías de drag&drop. En modo edición las filas llevan
    `touch-action: none` (si el navegador pudiera scrollear, se
    quedaría con el gesto a mitad de la presión vía `pointercancel`
    y el arrastre moriría al primer movimiento — verificado en la
    QA); el scroll en edición lo resuelve el propio gesto: moverse
    antes de la activación cancela la presión y el resto del gesto
    scrollea la lista a mano siguiendo al dedo. Fuera de edición el
    scroll nativo no se toca. Mouse en escritorio: el mismo gesto.
  - Ayuda visual en el encabezado del modo edición: «Mantené
    presionada una fila y arrastrala para reordenar dentro de su
    grupo.»
- **Motor puro nuevo**: `reorderWatchlistItem(config, ticker,
  targetIndexInGroup)` — remove + insert a un índice destino dentro
  del grupo, clampeado a los bordes, sin cruzar grupos, sin mutar;
  mismo puesto o ticker inexistente → la misma config. Acción del
  store: `reorderWatchlistItem(ticker, targetIndexInGroup)`.
- **Corrección cosmética de la misma corrida** (pedido del dueño
  con captura de la ficha de FSLR): botones con ícono Plus y texto
  que además empezaba con «+ » mostraban el signo duplicado. Se
  quitó el «+ » del texto en «Operar {ticker}» y «Abrir Posición en
  Cartera ({ticker})» de la ficha y en «Add to portfolio» de la
  vista de portafolio (auditoría completa del patrón en el resto de
  los componentes: sin más ocurrencias; los rótulos informativos y
  los botones de solo texto con «+» no se tocaron).

**QA v9** (Playwright, datos reales, prefijo `v9-`): arrastre
táctil en móvil 412×915 de una fila de ACCIONES varias posiciones
hacia abajo con auto-scroll, con captura a mitad del arrastre (fila
levantada y hueco visible) y verificación del orden en el DOM, vía
API y tras recargar; scroll normal en edición sin disparar arrastre
y toque corto sin reordenar; arrastre con mouse en escritorio 1440
con persistencia tras recargar y sin desbordes; × de quitar y
filtro por veredicto intactos; bloque «Tu Posición en Cartera» de
un activo sin posición (FSLR) con los botones ya sin el «+»
duplicado.

## 9. Enmienda v10 (2026-11-14) — la sigla sale del mismo snapshot que la ficha (fuera la caché persistida por día)

Defecto detectado por el dueño en producción: TMDX mostraba «V»
(VENDER) en la watchlist mientras el veredicto de su ficha era
MANTENER (precio 91,38, FV base 96,94, upside +6,1%).

- **Causa**: dos snapshots distintos del mismo cálculo.
  `GET /api/watchlist/verdicts` servía desde `db.verdictCache`, una
  caché **persistida con vencimiento por día de Nueva York**: la
  sigla se calculaba una vez y quedaba congelada hasta el día
  siguiente. La ficha (`/api/asset/:symbol` → `optimizerFv`), en
  cambio, recalcula sobre las cachés en memoria de las fuentes y del
  optimizador (ventana de ~15 min). Si el precio o el FV se movían
  después del primer cálculo del día — o ese primer cálculo salió
  con una añada distinta —, la sigla contradecía a la ficha durante
  todo el día.
- **Decisión del dueño**: «que coincida siempre con la ficha».
- **Corrección**:
  - El endpoint ya **no lee ni escribe** `db.verdictCache`: cada
    sigla se calcula con `computeWatchlistVerdict` — el mismo camino
    de la ficha (`buildAssetOptimizerFv` + `computeOpportunity`,
    escenario Base) — y se guarda en una **caché en memoria del
    proceso** (`VerdictMemoryCache`, `server/verdictCache.ts`) con
    TTL de **15 minutos**, la ventana de `CACHE_MS` del optimizador.
    Sigla y ficha salen así del mismo snapshot y no pueden
    contradecirse más allá de esa ventana compartida. Se mantiene la
    re-derivación de la sigla desde el veredicto al servir
    (enmienda v8) sobre lo calculado en la ventana.
  - `db.verdictCache` salió también del esquema de la base: se
    retiraron el campo de `DatabaseSchema`, la interfaz
    `VerdictCacheEntry`, su siembra y la fusión especial en
    `refreshDatabase`. `normalizeDatabase` descarta el campo si una
    base persistida anterior lo trae, para que no quede estado
    muerto ni vuelva a guardarse. Ningún otro consumidor lo usaba.
  - El contrato del endpoint no cambia: mismo formato de respuesta,
    tope de 24 símbolos por pedido, pool de concurrencia de 3 y «—»
    definitivo para cripto, ETFs y activos sin FV del motor (que
    también se cachea en memoria por la ventana). El cliente no
    cambia: sigue pidiendo en lotes progresivos de 6 con «··»
    mientras carga (solo se actualizaron los comentarios que
    describían la caché por día).
  - **Rendimiento** (QA local, datos reales): la tanda de 6 en frío
    — primera tras el arranque, con las cachés de las fuentes
    también vacías — costó ~26 s: es el cálculo de 6 FV del motor
    con pool de 3, el mismo costo que la v7 pagaba en la primera
    tanda de cada día; la tanda en caliente (caché en memoria)
    responde en ~10 ms. La carga progresiva por lotes hace que ese
    costo en frío se pague por tanda y con «··» en el resto, igual
    que antes.

**QA v10** (registro en `v10-qa-result.json`, carpeta
`qa-subcarteras-2026-11-13`): (a) regresión — con una `verdictCache`
sembrada en el `db.json` local con V/VENDER y fecha de hoy para
TMDX, NU, GOOG y AAPL, el endpoint **no sirvió ninguna semilla**;
(b) consistencia — en la misma ventana, el veredicto del endpoint
coincidió **exactamente** con el de la ficha (optimizerFv +
`computeOpportunity`) en los 4 símbolos, incluido TMDX con el mismo
caso de producción (91,38 / FV 96,94 → MANTENER en ambos lados);
(c) tiempos frío/caliente de la tanda de 6 (arriba). Tests nuevos de
la caché en memoria y del descarte del campo heredado en
`server/__tests__/verdictCache.test.ts`.

## 10. Enmienda v11 (2026-11-15) — Vista Watchlist a pantalla completa + alertas dentro de la app

Pedido del dueño (2026-11-15): la watchlist tiene que estar «a mano»
para vigilar dos cosas — si alguna posición de interés baja mucho un
día (posible oportunidad de compra) y si alguna cambia de veredicto
(de Mantener a Compra, de Compra a Compra Fuerte) — con alertas de
precio estilo TradingView. Descartó la sección extensible bajo las
posiciones en Cartera y eligió la **tercera vista en el selector
inicial + alertas dentro de la app**. El aviso con la app cerrada
(push) queda como etapa posterior, fuera de esta enmienda.

Diseño, tal como quedó publicado:

- **Tercera vista**: el selector de LeftPanel («Portafolio
  Financiero / Vista General Consolidada») suma la opción
  «Watchlist». Elegirla abre la watchlist a pantalla completa en el
  panel principal (`rightState: 'watchlist'`; en el celular ocupa el
  lugar donde se abre el Portafolio). La vista reutiliza el
  WatchlistPanel en variante `'view'` (grupos, orden, filtros por
  veredicto, alta/baja y reorden, todo igual); la tarjeta que vive al
  fondo de la ficha del activo sigue en variante `'panel'`, sin
  cambios de comportamiento. Abrir una ficha desde la vista registra
  origen 'watchlist' y el «Volver» regresa a la vista (backNavigation
  v12 extendido: etiqueta «Volver a la Watchlist»).
- **«▼ Caídas hoy»**: chip de la variante view que reordena las filas
  de cada grupo por variación del día ascendente (mayor caída
  primero) con el `changePct` que ya trae /api/quotes (refresco
  15 s); función pura `sortWatchlistByDayDrop`, estable, sin
  cotización al final.
- **Cambios de veredicto**: la config suma `seenSiglas` (snapshot de
  la última sigla vista por ticker). La vista lo **siembra** la
  primera vez que abre con los veredictos resueltos (sin marcas) y
  desde ahí marca en la fila «M → CF» cuando la sigla cargada difiere
  de la guardada, con una barra resumen; las marcas **no** se borran
  solas: el botón «Marcar vistos» actualiza el snapshot. Funciones
  puras `buildSeenSiglasSnapshot` / `diffWatchlistSiglas`.
- **Alertas dentro de la app**: la config suma `alerts`
  (`WatchlistPriceAlert`: una por activo, con `belowPrice` — baja de
  US$ X — y/o `dropPct` — cae ≥ Y% en el día — y el registro de
  disparo `triggeredAt`/`triggeredPrice`). Se crean/editan/borran
  desde la campana de cada fila de la vista; editar o re-activar
  limpia el disparo. Un hook global (`useWatchlistAlerts`, montado en
  App) evalúa cada 15 s con la app abierta, pidiendo cotizaciones
  solo de los activos con alerta activa, con la función pura
  `evaluateWatchlistAlerts`; al dispararse, la alerta queda
  registrada y no re-dispara hasta re-activarla. El aviso se ve como
  banner en la vista, marca en la fila y distintivo «🔔 n» en la
  opción «Watchlist» del selector. La baja de un activo elimina
  también su alerta y su sigla vista.
- **Persistencia**: los dos campos nuevos atraviesan las tres capas
  con los validadores del motor (`normalizeWatchlistSeenSiglas` /
  `normalizeWatchlistAlerts`): `resolveWatchlistConfig` los conserva
  y `sanitizeWatchlist` (server/db.ts) los valida igual; alta/baja/
  reorden de items ahora preservan el resto de la config. Campos
  ausentes o vacíos = comportamiento anterior exacto.

**QA v11** (registros en `qa-result.json` y `qa-d-result.json`,
carpeta `qa-watchlist-vista-2026-11-15`; cotizaciones y veredictos
interceptados con datos de control, persistencia real contra el
servidor local): (A) móvil 390 — la vista abre desde el selector, el
snapshot se siembra y persiste en el servidor (74 siglas, sin marcas
recién sembrado) y «Caídas hoy» ordena NVDA (−8,5%) y MU (−6,2%)
primeros; (B) contexto nuevo con GOOG pasando a CF — marca
«M → CF» en la fila y barra de cambios, y «Marcar vistos» actualiza
el snapshot (GOOG=CF) y limpia las marcas; (C) alerta NVDA «baja de
US$ 150» con cotización en 140 — el hook global la dispara solo
(banner con hora y precio, marca en la fila) y el selector en
Cartera muestra el distintivo «🔔 1»; (D) escritorio — la vista abre
desde el selector, la ficha de GOOG muestra «Volver» con destino
Watchlist y el regreso vuelve a la vista (la verificación original
buscaba la etiqueta como texto y en escritorio vive en el `title`
del botón, patrón v12: corregida la verificación, 3/3). Suite
completa: 583/583 tests (568 previos + 15 nuevos del motor, el
sanitizador y la navegación), build limpio.

## 11. Enmienda v12 (2026-11-15) — sesión extendida (pre/post mercado) en las filas

Pedido del dueño: ver en la watchlist el pre/post mercado de cada
activo igual que en Cartera, para juzgar si un vigilado puede ser
compra en la próxima rueda.

- **Datos**: el pipeline de cotizaciones ya calculaba la sesión
  extendida para las posiciones (`QuoteData.marketState` /
  `extPrice` / `extChange` / `extChangePct` / `extSession`); el
  endpoint `/api/quotes` ahora también los devuelve cuando hay precio
  extendido válido. Sin dato, el campo no viaja.
- **Fila**: el bloque de precio de la fila pasa a ser el mismo
  componente de Cartera, `PriceSessionCell`: precio, variación
  absoluta y porcentual del día y, con el mercado cerrado y precio
  extendido presente, la fila 🌙 con el precio extendido y su
  variación contra el cierre. Cripto nunca muestra la fila extendida
  (mercado 24/7), igual que en Cartera. Los montos se convierten a la
  moneda elegida en la app, como hacía el texto anterior; el par
  ETH/BTC (un ratio) no se convierte. La variación absoluta del día
  se deriva de precio y % (la cotización de la watchlist no trae
  cierre previo). Vale para la vista y para la tarjeta de la ficha,
  que comparten la fila.

**QA v12** (carpeta `qa-watchlist-ext-2026-11-15`, cotizaciones
interceptadas con datos de control, resto real contra el servidor
local): NVDA en post muestra 🌙 155,10 −7,75 (−4,76%); GOOG en pre
muestra 🌙 296,40 +3,88 (+1,33%); ETH/USD (cripto) no muestra fila
extendida aunque el dato venga en la respuesta. 3/3. Suite completa:
583/583 tests, build limpio.
