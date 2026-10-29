# SPEC-003 — Detalle de activo v1: overview estilo Finviz + ficha de Evaluación de oportunidad

> Implementada el 27/10/2026 a pedido del usuario, sobre el Estado 3 (FP-050..053).
> Reemplaza el gráfico de línea y el módulo «Fair Value estilo Morningstar» previos.

## Problema que resuelve
- Al seleccionar un activo (panel izquierdo o buscador) la vista quedaba en
  **pantalla negra**. Causa raíz confirmada por reproducción (27/10/2026):
  `AssetView` llamaba los `useMemo` del mini-proyector **después** del return
  temprano `if (!assetDetail)`; al llegar el detalle, React detectaba «más
  hooks que en el render anterior» y desmontaba toda la app. Se sumaban dos
  vectores latentes: desreferencias sin guardas de `quote`/`fairValue` y la
  ausencia de cualquier límite de error, y un posible 500 del servidor al
  desreferenciar `quote.price` cuando Yahoo no devolvía cotización.
- La función de seguimiento/valuación por activo no estaba desarrollada con el
  formato que el usuario definió en el PMV «Evaluación de oportunidad»
  (21/10/2026, caso ALB).

## Layout (panel principal; el panel izquierdo sigue visible en escritorio)
1. **Cabecera del activo** (sin cambios): ticker, nombre, estado de sesión,
   precio en vivo, fila posmercado y selector de temporalidad.
2. **Overview de precio estilo Finviz** — ancho completo del panel principal:
   - Velas OHLC + volumen (datos reales: `chart.candles` desde Yahoo v8).
   - SMA 20 / 50 / 200 sobre cierres, con leyenda OHLC + Vol + SMAs de la vela
     activa (hover/touch), igual a la captura de referencia de Finviz.
   - Canal de tendencia: regresión lineal sobre máximos (techo, violeta) y
     sobre mínimos (piso, azul) del período visible + etiqueta de canal.
   - Línea punteada de Fair Value como referencia fundamental.
   - Es una lectura visual secundaria: manda el análisis fundamental.
3. **Ficha de Evaluación de oportunidad** (lógica exacta del PMV):
   - Escritorio: dos columnas con la proporción de la captura de referencia —
     formulario editable (370px) a la izquierda, ficha a la derecha.
   - Móvil: gráfico → ficha → formulario plegado («Editar datos de la ficha»).
   - Ficha: % hasta el Fair Value (única métrica grande), Ranking de
     oportunidad (estrellas + puntaje 0–100 + etiqueta + rango por escenarios),
     precio/FV con CAGR explicado en simple, moat + incertidumbre, market cap,
     dividend yield, Consenso de analistas (barra, conteo, % hasta el promedio
     y escala mínimo/promedio/máximo), core del negocio, 3 lecturas
     a favor/en contra editables, veredicto ponderado y múltiplos en vivo.
   - Lógica pura en `shared/engine/opportunity.ts` (bandas por incertidumbre
     incl. «Very High», puntaje, veredicto) con tests que reproducen los casos
     validados del PMV (ALB US$93,77 → +67,4%, 4★, 74/100, «Comprar de a poco»).
   - Precarga: ALB usa el preset curado del PMV (FV 94/157/225, consenso de la
     captura); el resto se precarga desde datos en vivo (escenarios desde la
     dispersión DCF/target/FV; consenso y perfil desde `extras` de Yahoo:
     targets mín/prom/máx, conteo por recomendación, CEO, empleados, sede,
     descripción). Todo editable.
4. **Tu posición en cartera** e historial (sin cambios) y **mini-proyector**
   10/20 años (sin cambios) quedan debajo de la ficha.

## Robustez (anti pantalla negra)
- El store valida la respuesta de `/api/asset` antes de guardarla y expone
  `assetError`; un refresh en segundo plano inválido no pisa un detalle bueno.
- `AssetView` muestra estado de error recuperable (Reintentar / Volver) si el
  payload viene incompleto, y usa valores seguros si falta `fairValue`.
- El servidor ya no desreferencia `quote` sin guarda y suma `extras`
  best-effort (nunca lanza).
- `ErrorBoundary` envuelve el panel principal en `App.tsx`: un error de render
  muestra una tarjeta recuperable, no desmonta la app.

## Pendientes para v2
- Marcadores de balances (E) sobre el gráfico y pestañas tipo Finviz
  (Financials / Short Interest) si el usuario las pide.
- Persistir las ediciones de la ficha por activo (hoy viven en la sesión).
- Fair Value propio por triangulación completa dentro del motor (hoy la
  precarga genérica usa la dispersión DCF/target/FV del motor actual).

## v1.1 — Pulido tras la prueba del usuario en producción (2026-10-27)

- **Cambio de la cabecera según el marco temporal**: 1D muestra el cambio oficial del
  día; el resto (5D/1M/6M/YTD/1Y/5Y/MAX) calcula el cambio del período contra el
  primer cierre del gráfico, con etiqueta ("Cambio en 1 año", etc.).
- **Gráfico 1D**: se descartan las velas finales degeneradas de Yahoo (placeholder
  O=H=L=C, volumen 0) y el Fair Value solo extiende la escala hasta un 60% del
  recorrido del precio; si queda fuera, se anota "FV … (fuera de escala)" en la
  leyenda en vez de aplastar el gráfico.
- **Canales estilo Finviz por pivotes** (reemplaza la regresión sobre todos los
  máximos/mínimos, que daba canales cerrados sin estructura): zigzag con umbral
  según volatilidad (mediana del rango diario), resistencia anclada en el techo
  mayor del período y soporte en el piso mayor, segundo ancla = el pivote que
  deja la línea viva (tolerancia de ruptura ~2,5% en pivotes, cierres más
  estrictos) con más toques. Etiqueta de patrón: cuña convergente/expansiva,
  canal alcista/bajista/lateral, cuña alcista/bajista, triángulo
  ascendente/descendente. Las líneas de Finviz son automáticas (su detector de
  patrones es server-side; REA no aplica: no hay artefacto cliente que analizar).
- **Descripción de la empresa en español**: el servidor traduce `longBusinessSummary`
  (best-effort, fallback al original, cacheado con los extras).
- **Escala de consenso**: solo el Promedio lleva valor numérico encima; nombres de
  marcadores chicos con anclaje hacia adentro en los extremos y doble nivel si se
  acercan (antes los valores se pisaban: "US$ 317,5US$ 422").
- **Formulario "Datos de la ficha"**: etiquetas 9,5px e inputs 12,5px con menos
  padding (en escritorio se veía amontonado; en móvil ya estaba bien).
- **Seed de escenarios**: con 3+ métodos se descarta un extremo outlier
  (>1,8× la mediana) — el DCF de GOOG (US$1.153) fijaba un optimista absurdo;
  ahora GOOG precarga 267/411/422.

## v1.2 — Consenso interactivo, indicadores Finviz completos y balances en vivo (2026-10-28)

- **Escala de consenso**: todos los puntos (Actual, Mínimo, Promedio, Máximo)
  muestran su valor al pasar el mouse, tocar o enfocar con teclado (burbuja
  «US$ …»); el Promedio lo mantiene siempre visible.
- **Indicadores fundamentales**: nuevo `server/finviz.ts` +
  `shared/engine/finvizParse.ts` que traen la ficha snapshot completa de Finviz
  (84 campos) y la fusionan con Yahoo en `fetchAssetExtras` (Finviz manda en su
  catálogo; Yahoo completa targets/perfil). Motivo: Yahoo no publica EPS next 5Y
  (su `earningsTrend` llega hasta +1y) y devolvía ratios erróneos (P/S de TSM
  0,46 vs 14,54 real). Panel reorganizado en 5 grupos (Valuación, Crecimiento —
  con «EPS próx. 5 años (CAGR)» destacado —, Rentabilidad y Calidad con ROIC
  real, Solvencia y Balance, Propiedad y Riesgo). Dato no publicado → «—», sin
  valores de relleno.
- **Earnings en vivo** (`server/earnings.ts`): el calendario dejó de ser la foto
  seed del 22-oct con grupos congelados. Fuente: API pública de calendario de
  Nasdaq por fecha (con EPS real y sorpresa en fechas pasadas), caché por fecha
  de 6 h compartida, grupos recalculados contra hoy en America/New_York
  (recientes 14 días / hoy y mañana / próximos 30 días) y fallback = seed
  regroupado dinámicamente. `/api/market` usa la misma fuente.
- **Detalle del activo**: tarjeta «Balances y dividendos» entre el gráfico y la
  ficha (próximo balance con EPS estimado de consenso, último con real vs
  esperado y sorpresa, próximo dividendo con ex-date/pago/monto) y marcadores
  sobre el eje temporal del gráfico: «E» ámbar por balance y «D» azul por
  ex-dividendo (eventos de dividendos del chart de Yahoo), con chips en la
  leyenda; en los bordes del gráfico el marcador lleva solo la letra para que
  no se corte. Las fechas futuras sin vela no se pueden marcar: las cubre la
  tarjeta.
- **Latencia**: `/api/asset` no hace pedidos por earnings (responde con la
  caché de fechas + el próximo balance de Yahoo `calendarEvents`); el endpoint
  separado `GET /api/asset/:symbol/earnings` completa el detalle con escaneo
  priorizado de Nasdaq (deadline 9 s) y la vía rápida
  `api/company/{ticker}/earnings-surprise` para los últimos 4 trimestres. La
  vista pide ese endpoint sin bloquear la ficha.

## v1.2.1 — Corrección tras la prueba del usuario en su celular (2026-10-28)

- **Etiquetas E/D**: los markers nativos de lightweight-charts (`belowBar`)
  seguían al precio y quedaban sobre las velas. Reemplazados por un overlay
  HTML fijo sobre el eje X (posición con `timeToCoordinate`, recalculado con
  scroll/zoom/resize; si dos etiquetas se pisan, la segunda sube una fila;
  en los bordes se clampea para que no se corten). Como en Finviz.
- **Consenso, interacción**: (1) el punto se movía al mostrar la burbuja
  porque el contenedor cambiaba de ancho y el centrado era porcentual —
  ahora todo cuelga de un ancla de ancho 0 con elementos absolutos de
  ancho constante; (2) en táctil el navegador sintetiza mouseenter/focus
  antes del click y un mouseleave después: el toggle de onClick se
  cancelaba solo — ahora el click activa siempre y entrar/salir usa
  pointer events filtrados por `pointerType` (touch no desactiva), con
  desactivación por blur diferida y con guarda; (3) se ve UNA sola burbuja
  a la vez (la del punto activo; la del Promedio solo sin interacción);
  (4) capas globales (botón z1, nombre z3, burbuja z5, sin stacking
  context por marcador) para que, cuando dos puntos caen casi en el
  mismo X (TSM: Actual 439,51 vs Mínimo 440), el nombre reciba su tap y
  no el botón del vecino.
