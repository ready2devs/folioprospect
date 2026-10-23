# SPEC-002 — FolioProspect Mobile-First + Sesión estilo Investing + Arquitectura Patrimonial (NW Líquido, Portafolio Financiero & Activos No Líquidos)

> Diseño y planificación: Lead Architect. Ejecución: Teammates (`gemini-3.8-flash-high` vía Agent Teams).
> Extiende `SPEC.md` (v1). Todo cambio de código se traza a un requisito `FP-1xx`.
> Dispositivo móvil de referencia: Samsung S22 Ultra (Chrome Android, viewport CSS ≈ **384 × 824 px** / **412 × 915 px**).

## 0. Diagnóstico (causa raíz del bug en móvil)
1. `html, body, #root { overflow: hidden }` + `.app-shell { height: 100vh; width: 100vw }` bloquea el scroll nativo del documento.
2. `.workspace-grid { grid-template-columns: 440px 1fr }` fuerza un panel izquierdo de 440 px en pantallas de 384–412 px, recortando botones y ocultando el panel derecho.
3. `.lp-row` usa 5 columnas fijas (`120px 60px 78px 46px 86px` = 414 px + gaps), cortando la columna `Valor`.
4. `.lp-list` intenta scrollear dentro de un contenedor de `100vh - 52px` atrapado por `overflow: hidden` y por la barra de direcciones móvil, impidiendo bajar más allá del ticker `SIMO`.
5. `TopBar` tiene 3 bloques `flex-shrink: 0` (>1050 px totales) que se desbordan en móvil.
6. Grillas inline en vistas derechas (`repeat(6,1fr)`, `repeat(5,1fr)`, `1fr 1fr`, `220px 1fr`) desbordan el ancho móvil.

## 1. Arquitectura Conceptual Patrimonial (Clarificación del Usuario)
FolioProspect separa estrictamente **3 capas patrimoniales**:

1. **Portafolio Financiero (Cuenta Comitente / Broker)**:
   - Compuesto por las **Posiciones Líquidas de Mercado** (Acciones, CEDEARs/ADRs, ETFs, Cripto) + **Cash Comitente** (efectivo líquido disponible en la cuenta comitente / broker, editable como saldo líquido comitente además del ledger de TradingView).
   - **Todas las métricas de evaluación, análisis (Sharpe, Sortino, Beta, TWR, Drawdown, Fair Value) y las Prospecciones 10/20 años operan exclusivamente sobre la evolución del Portafolio Financiero**.
2. **NW Líquido (Net Worth Líquido en USD)**:
   - Tarjeta minimalista ubicada **arriba de todo** en el panel izquierdo.
   - Fórmula: `NW Líquido = Portafolio Financiero (Tenencias Brutas + Cash Comitente líquido) + Reserva de Efectivo (USD fuera del broker) + Diferencia de Cambio (Celda Excel CCL → MEP)`.
   - La **Diferencia de Cambio** funciona como una **celda calculable estilo Excel**, preajustada automáticamente con las cotizaciones en tiempo real de **Dólar CCL** y **Dólar MEP** sobre el valor bruto del portafolio financiero valuado en CCL (descontando comisión de venta ~0.5% y comisión de operatoria de bonos MEP ~1% total = 2 × 0.5%), pero permitiendo editar cualquier parámetro o sobrescribir la celda manualmente.
3. **Activos No Líquidos / No Financieros (Separados del Portafolio Financiero)**:
   - Inmuebles, fondos privados, plazos fijos, bonos/activos fuera del portafolio financiero.
   - **Ya no se mezclan dentro de las filas de posiciones del Portafolio Financiero**. Se visualizan en una sección/bloque propio e independiente ("Activos No Líquidos / Fuera del Portafolio") y se suman para mostrar el **Patrimonio Neto Total (NW Total = NW Líquido + Activos No Líquidos)**.
   - En la pestaña de Prospectiva 10/20 años, el motor proyecta la evolución del **Portafolio Financiero** con sus métricas y permite sumar opcionalmente como base patrimonial las Reservas de Efectivo y los Activos No Líquidos valuados en USD.

## 2. Requisitos — Diseño Responsive & Shell Móvil (FP-100 … FP-109)
- **FP-100** `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />` y `<meta name="theme-color" content="#090D16" />`.
- **FP-101** Breakpoints: Desktop `≥ 1024px` (layout 2 paneles `420px 1fr` en 1024–1279px y `450px 1fr` en `≥ 1280px`). Mobile/Tablet `≤ 1023px`: 1 sola columna fluida (`width: 100%`, `max-width: 100vw`, `overflow-x: hidden`), con scroll nativo de página (`html, body, #root, .app-shell { height: auto; min-height: 100dvh; overflow-y: auto; overflow-x: hidden }`).
- **FP-102** Hook `src/hooks/useIsMobile.ts`: `useIsMobile(maxWidth = 1023)` con `window.matchMedia`.
- **FP-103** `MobileHeader.tsx` (visible en `≤ 1023px`): barra superior compacta sticky (`height: 52px`), logo FP + título, botón Buscar (`SearchModal`), selector rápido `USD/ARS/EUR`, botón Refrescar, toggle Tema y toggle `Live / REA`.
- **FP-104** `MobileNav.tsx` (visible en `≤ 1023px`): barra de navegación inferior fija (`height: 60px + env(safe-area-inset-bottom)`), inspirada en la captura 3 de Investing, con 5 accesos:
  1. **Cartera** (`Wallet`) → muestra el Panel Patrimonial y todas las posiciones (`mobileTab = 'holdings'`).
  2. **Mercado** (`Globe`) → abre Estado 1 (`mobileTab = 'right'`, `rightState = 'market'`).
  3. **Portafolio** (`Briefcase`) → abre Estado 2 (`mobileTab = 'right'`, `rightState = 'portfolio'`).
  4. **Activo / FV** (`LineChart`) → abre Estado 3 (`mobileTab = 'right'`, `rightState = 'asset'`).
  5. **+ Operar** (`Plus`) → abre el modal de carga (`openAddModal('trade')`).
- **FP-105** En móvil (`≤ 1023px`), `.lp-list` tiene `overflow: visible; height: auto; flex: none` para que **las 20 posiciones líquidas completas (desde GOOG hasta SIMO y el resto) y la sección de Activos No Líquidos se recorran de punta a punta con el dedo** sin ningún recorte.
- **FP-106** Modales (`AddDialog`, `SearchModal`) adaptados a móvil como **bottom sheets** de ancho completo (`width: 100%`, `max-width: 100vw`, `max-height: 90dvh`), inputs con `font-size: 16px` (evita auto-zoom en móvil) y grillas `.form-row` de 1 columna en `≤ 640px`.

## 3. Requisitos — Columna Precio / 24h y Reloj de Mercado estilo Investing (FP-120 … FP-126)
- **FP-120** Backend (`server/yahoo.ts` + `shared/engine/session.ts`):
  - Consulta Yahoo v8 chart con `interval=5m&range=1d&includePrePost=true`.
  - Calcula `prevClose = meta.previousClose ?? meta.chartPreviousClose`, `price = meta.regularMarketPrice`, `change = price - prevClose`, `changePct = (change / prevClose) * 100`.
  - Determina el estado de sesión en vivo (`marketState: 'open' | 'pre' | 'post' | 'closed'`) comparando el timestamp actual con `meta.currentTradingPeriod.regular` (y verificando horario de NY Lun-Vie 09:30–16:00 ET).
  - Para **Cripto** (`BINANCE:*` / `*USDT`): `marketState = 'open'` siempre (24/7), sin fila posmercado.
  - Cuando `marketState !== 'open'` en acciones/CEDEARs/ADRs/ETFs, extrae la cotización extendida (post-market / pre-market) de las velas posteriores al cierre regular (`timestamp > regularMarketTime` o última vela extendida disponible) o variación extendida, generando `extPrice`, `extChange = extPrice - price`, `extChangePct = (extChange / price) * 100` y `extTime`.
- **FP-121** Icono de Reloj de Estado de Mercado (`src/components/ui/MarketClock.tsx`):
  - Ubicado en la **segunda fila de la columna Posición, inmediatamente antes del nombre completo del activo** (tal como en la captura 3 de Investing).
  - Reloj circular bordeado en **rojo** (`#EF4444`) cuando el mercado está cerrado (`marketState !== 'open'`) y bordeado en **verde** (`#10B981`) cuando el mercado está abierto (`marketState === 'open'`, incluyendo cripto 24/7).
- **FP-122** Celda `PriceSessionCell.tsx` en la columna **PRECIO / 24H**:
  - **Fila 1**: Precio al cierre / actual en tipografía mono blanca/primaria (`320.76`).
  - **Fila 2**: Variación nominal + porcentual entre paréntesis al estilo Investing: `-10.19 (-3.08%)` o `+1.51 (+0.71%)` en color semántico verde/rojo.
  - **Fila 3 (Exclusiva para Mercado Cerrado en activos no cripto)**: Símbolo de **Luna** (`Moon` en azul/celeste `#60A5FA`) + precio post-market (`320.65`) + variación post-market nominal y porcentual (`-0.11 (-0.03%)`).
  - **Regla de mercado abierto / cripto**: Cuando `marketState === 'open'` o el activo es Cripto, la Fila 3 con la luna **no existe**.

## 4. Requisitos — Tarjeta NW Líquido, Celda Excel CCL/MEP, Cash Comitente y Separación de No Líquidos (FP-130 … FP-138)
- **FP-130** Tarjeta minimalista **`NW líquido`** (`src/components/left/NwLiquidCard.tsx`) arriba de todo en el panel izquierdo:
  - Muestra `NW líquido` + el valor total en USD (ej. `~180,040.49 USD` = Tenencias Brutas `173,361.55` + Cash Comitente líquido + Reserva de Efectivo USD + Diferencia de Cambio CCL/MEP).
  - Muestra píldoras resumen: `Portafolio Fin.` · `Reserva USD` · `Dif. Cambio (CCL/MEP)` con badge interactivo tipo celda `fx` para abrir/desplegar la calculadora estilo Excel.
- **FP-131** **Celda Excel de Diferencia de Cambio (`shared/engine/nw.ts`)**:
  - Obtiene en tiempo real `/api/fx/ar` (`server/argFx.ts`) desde `dolarapi.com/v1/dolares/contadoconliqui` (CCL) y `dolarapi.com/v1/dolares/bolsa` (MEP), con fallback a `criptoya.com/api/dolar` y fallback seguro `{ ccl: 1640, mep: 1550 }`.
  - Base CCL por defecto: suma de posiciones del portafolio financiero valuadas en CCL (Stocks/ADRs/CEDEARs/ETFs, con opción de incluir/excluir Cripto o ajustar la base manualmente).
  - Comisiones editables preajustadas según indicación del usuario:
    - Comisión de venta de posiciones en CCL: `sellCommPct = 0.5%` (editable, ej. 0.5% o 0.05%).
    - Comisión operatoria compra/venta bonos MEP: 2 comisiones de `0.5%` cada una = `1.0%` total (`mepBuyCommPct = 0.5%`, `mepSellCommPct = 0.5%`, editables).
  - Fórmula estilo Excel:
    - `factorComisiones = (1 - sellCommPct/100) * (1 - mepBuyCommPct/100) * (1 - mepSellCommPct/100)`
    - `usdMepObtenidos = baseCclUsd * (cclRate / mepRate) * factorComisiones`
    - `fxDiffUsd = usdMepObtenidos - baseCclUsd`
  - Permite al usuario editar en vivo: `CCL`, `MEP`, `% comisiones`, `Base CCL`, o escribir un override directo en la celda `Diferencia de Cambio (USD)`.
- **FP-132** **Reserva de Efectivo USD vs Cash Comitente (Portafolio Financiero)**:
  - El usuario puede sumar/editar desde la tarjeta y desde el modal `+Cash` distinguiendo:
    1. **Cash Comitente (Portafolio Financiero)**: efectivo líquido dejado en la cuenta comitente (se suma al valor líquido del Portafolio Financiero).
    2. **Reserva de Efectivo (USD fuera del comitente)**: reserva líquida personal en dólares que se suma directamente al `NW líquido`.
- **FP-133** **Separación del bloque Portafolio Financiero y del bloque Activos No Líquidos**:
  - Debajo de `NW líquido`, el bloque principal se titula **`PORTAFOLIO FINANCIERO (LÍQUIDO)`** (con toggle entre *Tenencias Brutas + Cash Comitente* vs *Neto Ledger TV*).
  - Las posiciones de la tabla principal son **únicamente las posiciones financieras líquidas**.
  - Los **Activos No Líquidos** (`portfolio.illiquid`) se renderizan en una tarjeta/sección separada al final del panel (`Activos No Líquidos / Patrimoniales Fijos`) con su subtotal en USD y el indicador de `Patrimonio Neto Total (NW Líquido + No Líquidos)`, sin contaminar las filas ni los KPIs de riesgo/retorno del Portafolio Financiero.
- **FP-134** En `PortfolioView.tsx` (Estado 2 — Pestaña Prospectiva 10/20 años):
  - La proyección compound/Monte Carlo se calcula **exclusivamente sobre el Portafolio Financiero**, y ofrece un switch/detalle claro que suma al patrimonio proyectado los valores fijos inmutables de `Reserva de Efectivo USD` + `Activos No Líquidos USD` para visualizar tanto el Portafolio Financiero proyectado como el NW Total futuro.
