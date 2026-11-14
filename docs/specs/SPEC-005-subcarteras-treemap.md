# SPEC-005 — Subcarteras personalizadas + Treemap en la cabecera del Portafolio Financiero

> Pedido del dueño, 2026-11-13 22:19 (captura desde su Galaxy S22 Ultra).
> Desarrollo guiado por esta spec: ningún paso se publica sin su orden explícita,
> con respaldo previo, tests en verde y verificación en vivo (regla de la casa).

## 1. Pedido, en sus palabras (resumen fiel)

- En la cabecera del Portafolio Financiero (Líquido), en la zona que marcó con
  tres círculos a la izquierda de «HOY (24H)» — hoy espacio vacío — quiere que
  figuren **hasta tres subcarteras personalizadas por fila**.
- Cada activo se **etiqueta** como parte de una subcartera desde un **popup que
  aparece al mantener presionada la fila del activo** (long-press).
- Ejemplos suyos: **Núcleo/Core** (los activos principales, ~70–80% de la
  cartera), **Especulativa** (baja capitalización / menor peso) y **Cripto**.
  En su caso serán esas tres, pero el sistema es genérico: nombre y **color
  característico** elegibles por el usuario.
- Un activo recién agregado puede llegar **sin etiquetar**: tiene que poder
  etiquetarse en el momento, sin fricción.
- Donde marcó los círculos va un **treemap pequeño**: cada subcartera es un
  panel cuyo tamaño refleja su peso, y adentro se identifican los activos más
  preponderantes de esa subcartera. La sección del portafolio **puede alargarse
  hacia arriba** (más alto) para que entren bien las tres y se lea.
- **Colores (su P.D.)**: cada rectángulo del treemap con colores
  característicos: el **fondo de cada subcartera es una capa de color
  translúcida** que tiñe todo su panel, y los segmentos (activos) se colorean
  desde una **paleta que resalte** sobre ese fondo y sobre el fondo por defecto
  de la sección.
- Requisito transversal: **verificar que todo funcione en móvil**, en concreto
  su **Galaxy S22 Ultra**.

## 2. Estado actual verificado (2026-11-13, rama main fc18d3d)

- La zona marcada está **vacía** en `LeftPanel.tsx`: a la derecha del total
  líquido solo vive el bloque «HOY (24H) · N POSICIONES». Los tres círculos de
  la captura son su anotación a mano, no un componente.
- Al **tocar** una fila ya se abre `HoldingActionMenu` (Análisis / Agregar /
  Venta parcial / Venta total, en producción desde el 2026-11-10). No existe
  long-press en ningún lado de la app.
- No existe ningún concepto de subcartera/etiqueta en tipos, store ni servidor.
- La persistencia sincronizada entre dispositivos ya existe para `NwSettings`
  (localStorage `fp.nwSettings.v1` + servidor con `updatedAt`, gana la más
  reciente; sanitizador en `server/db.ts`). Es el vehículo correcto: las
  subcarteras son un ajuste del usuario, no una operación del ledger.

## 3. Decisiones de diseño (con el porqué)

1. **El etiquetado vive en dos entradas, un solo popup.**
   - *Long-press* (≥450 ms sin mover más de 10 px) sobre la fila del activo →
     abre el popup de acciones **directo en la sección «Subcartera»**.
   - *Toque normal* → el mismo popup de siempre, con la sección «Subcartera»
     agregada al final. Motivo: no romper el gesto que el dueño ya usa desde
     el 10-nov, y que la función sea descubrible sin saber el gesto nuevo.
   - En escritorio: long-press con el mouse funciona igual; además clic
     derecho sobre la fila abre el mismo popup en la sección Subcartera
     (sin menú contextual del navegador).
2. **Persistencia dentro de `NwSettings`** (campo nuevo opcional
   `subPortfolios`), para heredar gratis la sincronización entre dispositivos
   y el respaldo durable. Compatibilidad total: bases viejas sin el campo se
   leen como «sin configurar» y el sanitizador del servidor lo valida.
3. **Siembra inicial (solo definiciones, no asignaciones inventadas):** la
   primera vez se ofrecen las tres que el dueño ya nombró — **Núcleo**,
   **Especulativas** (renombrada en la v3, §10) y **Cripto** — creadas pero
   vacías. Única asignación
   automática: los activos de tipo Crypto caen en «Cripto» *mientras no tengan
   asignación manual* (regla derivada, no dato guardado: si el dueño mueve un
   cripto a otra subcartera, manda su elección; y desde la v3 la regla solo
   corre con su OK, ver §10). Núcleo vs. Especulativas es un
   juicio suyo: **ningún activo se clasifica solo** ahí.
4. **Colores de activos: «aleatorios» pero estables.** La paleta de segmentos
   se asigna por hash estable del ticker: cada activo tiene siempre el mismo
   color entre sesiones y dispositivos (un color que cambia en cada carga
   destruye la lectura del treemap). La capa translúcida de la subcartera
   (su color al ~16–20% de opacidad + franja de título más intensa) tiñe el
   panel completo, como pidió.
5. **Un mini-treemap squarified por subcartera** (corrección 23:57): cada
   mini-treemap contiene solo los activos de su subcartera, área ∝ valor
   dentro de ella; el peso de la subcartera en el portafolio se lee en su
   franja (nombre + %). En la vista expandida el mismo treemap se ve en
   grande. Así cada subcartera es una pieza independiente, hasta 3 por fila.
6. **Sin librerías nuevas**: el layout squarified son ~80 líneas de lógica pura
   testeable en `shared/engine/treemap.ts`. La app no suma dependencias por un
   gráfico.

## 4. Modelo de datos

```ts
// shared/engine/types.ts — dentro de NwSettings (opcional, retrocompatible)
export interface SubPortfolioDef {
  id: string;      // slug estable, ej. 'nucleo', 'especulativa', 'cripto', o 'sp-<hash>'
  name: string;    // 1..24 caracteres
  color: string;   // uno de la paleta SUBPORTFOLIO_COLORS (hex)
}
export interface SubPortfolioConfig {
  defs: SubPortfolioDef[];                    // máx. 8
  assignments: Record<string, string>;        // symbol completo (ej. 'NASDAQ:GOOG') -> defId
}
// NwSettings.subPortfolios?: SubPortfolioConfig
```

- Paleta de subcarteras (8, pensada para fondo oscuro): esmeralda `#10b981`,
  violeta `#8b5cf6`, naranja `#f59e0b`, celeste `#38bdf8`, rosa `#f472b6`,
  lima `#a3e635`, rojo suave `#fb7185`, gris azulado `#94a3b8`.
- Paleta de segmentos (12 colores categóricos de alto contraste sobre panel
  teñido oscuro); asignación `palette[hash(ticker) % 12]`.
- Sanitizador servidor (`sanitizeNwSettings`): descarta defs sin nombre o con
  color fuera de paleta/hex válido, ids duplicados, asignaciones a defs
  inexistentes y símbolos que no sean string; topes: 8 defs, 300 asignaciones,
  nombre ≤24. Nunca lanza: ante basura devuelve config vacía.
- Lógica pura en `shared/engine/subPortfolios.ts`:
  `resolveSubPortfolioConfig(settings)` (siembra + regla cripto derivada),
  `groupHoldingsBySubPortfolio(holdings, config)` → paneles ordenados por
  valor desc. con totales, % sobre tenencias brutas y activos ordenados desc.,
  `setAssignment(config, symbol, defId | null)`, `upsertDef`, `removeDef`
  (al borrar una def, sus activos quedan sin etiquetar; jamás toca posiciones).

## 5. UX — Popup de etiquetado

- Sección nueva al final de `HoldingActionMenu`: título «Subcartera», fila de
  chips: una por def (punto de color + nombre + ✓ si es la actual), chip
  «Sin etiquetar» y chip «＋ Nueva».
- Tocar un chip asigna y cierra con confirmación visual breve (el chip queda
  marcado; el treemap y la fila se actualizan al instante vía store).
- «＋ Nueva»: inline en el mismo popup — input de nombre + 8 muestras de color
  → «Crear y asignar». Sin salir del flujo.
- La fila del activo muestra, **a la derecha del nombre de la empresa**, una
  **píldora** con el nombre de su subcartera (agregado del dueño, 22:25):
  óvalo/rectángulo transparente de bordes bien redondeados, fondo teñido con
  el color de la subcartera (~15% de opacidad), borde de 1 px de ese color y
  texto en ese color. Si el nombre no entra, va **abreviado** (completo si
  tiene ≤10 caracteres; si no, truncado ~9 + «…», nombre completo en el
  tooltip): en la fila manda que se lea algo de la etiqueta sin romper el
  layout — el nombre de la empresa se trunca primero, la píldora no empuja
  (ancho máx. ~76 px en móvil). Sin subcartera, no se dibuja nada.
- Gestión completa (renombrar, cambiar color, borrar, ver cuántos activos y
  cuánto valor tiene cada una): desde el treemap — long-press o botón ⚙ sobre
  el encabezado de un panel abre el gestor. Borrar pide confirmación y avisa
  cuántos activos quedan sin etiquetar.

## 6. UX — Treemap

> **CORRECCIÓN DEL DUEÑO (2026-11-13 23:57, supersede el diseño de un único
> treemap combinado):** no es UN treemap arriba dividido en paneles, sino
> **un mini-treemap independiente por cada subcartera**, en fila, **hasta 3
> por fila**. Cada mini-treemap ocupa como máximo **1/3 del ancho** (del panel
> en escritorio, del dispositivo en móvil) y **no se estira** para llenar la
> fila si hay menos de tres. Si no hay nada etiquetado, se muestra **un solo
> mini-treemap llamado «General»** con todos los activos, también de 1/3 de
> ancho; los activos sin etiquetar forman ese «General» también cuando ya hay
> subcarteras con activos. Las subcarteras definidas pero vacías no dibujan
> mini-treemap (siguen disponibles en el menú de etiquetado).

- **Ubicación**: la marcada por el dueño con el rectángulo amarillo en su
  captura de escritorio — en la cabecera del Portafolio Financiero, **en la
  misma línea del bloque «HOY (24H)» que sigue al monto total**, aprovechando
  ese espacio a la derecha del total y encima del desglose «Tenencias Brutas ·
  Cash Comitente». Alto compacto (~104 px), no la franja alta anterior.
- **Mini-treemap de subcartera**: fondo = su color en capa translúcida; franja
  superior con nombre + % del portafolio; adentro, SOLO los activos de esa
  subcartera como rectángulos (squarified por valor desc.).
- **Etiquetas de activo** según espacio: ancho ≥56 px y alto ≥30 px → ticker +
  % dentro de la subcartera; ≥40×22 → solo ticker; menos → sin texto (el color
  y el `title`/tooltip identifican; en el gestor y en la lista siempre está el
  dato). Los activos que no caben con mínimo legible se agrupan en un
  rectángulo «+N» al final del panel (N y valor en el tooltip; tocarlo filtra
  la lista por esa subcartera).
- **Mini-treemap «General»** (reemplaza al panel «Sin etiquetar»): agrupa los
  activos sin etiquetar; fondo gris translúcido, borde punteado, título
  «General». No es una subcartera real: no se renombra, no se borra y no
  genera píldora en las filas; su vista expandida funciona como la de una
  subcartera, con los símbolos sin asignar. Si no hay nada sin etiquetar, no
  aparece.
- **Interacciones**: tocar un panel abre su **vista expandida** (sección 6 bis);
  el filtro de la lista por subcartera vive como acción dentro de esa vista
  (chip de filtro activo con ✕ para limpiar, convive con el filtro de texto).

## 6 bis. Vista expandida de una subcartera (agregado del dueño, 22:29)

- Al **seleccionar un treemap** (tocar su panel) se abre a **pantalla completa**
  en móvil (hoja completa; en escritorio, modal grande ~94vw × 88vh).
- **Arriba a la derecha**, como pidió: el **tamaño de la subcartera** (total en
  USD) y **la proporción del portafolio general que representa** (% sobre las
  tenencias brutas). A la izquierda, el nombre con su punto de color; la ✕ de
  cierre queda en la esquina sin pisar esos datos.
- **Arriba**: el treemap en grande — mismos colores y tinte, rectángulos con
  ticker + % dentro de la subcartera + valor en USD cuando el tamaño lo
  permite. Tocar un activo acá sí abre su popup de acciones.
- **Abajo**: el **comparativo de performance** de esa subcartera contra el
  índice de referencia **S&P 500**: dos líneas (la subcartera en su color, el
  SPY en gris) con selector de período (1M / 3M / 6M / YTD / 1A / Todo) y la
  lectura del período: subcartera +X% vs. SPY +Y% (diferencia en puntos).
- **Metodología (sin inventar datos)**: la serie se calcula en el servidor con
  el mismo motor de la serie del portafolio (`buildPortfolioSeries`),
  filtrando el ledger a las operaciones de los símbolos de esa subcartera, con
  el benchmark `SP:SPX` que ya usa la app. Es el retorno encadenado de sus
  operaciones reales en esos activos, no una simulación con la composición
  actual; la vista lo aclara en una línea al pie del gráfico. Endpoint nuevo:
  `GET /api/portfolios/overview/subportfolio-series?def=<id>` resolviendo los
  símbolos desde la config guardada (para «Sin etiquetar», los no asignados);
  si una subcartera no tiene operaciones con historia, el gráfico muestra el
  estado vacío explicado, nunca una línea fabricada.
- Acciones dentro de la vista: «Filtrar lista» (cierra y filtra las posiciones
  por esa subcartera) y «Gestionar» (renombrar / color / borrar).
- **Estados**: sin ninguna asignación todavía → solo el mini-treemap
  «General» de 1/3 de ancho con todos los activos y un hint corto para
  etiquetar («mantené presionado un activo»); nunca un hueco en blanco ni
  spinners, y nunca tres cajas vacías con las subcarteras sembradas.

## 7. Móvil — Galaxy S22 Ultra (requisito del dueño)

- Viewport de referencia: **412 × 915 CSS px** (S22 Ultra). QA también a
  360 px (angosto) y 1440 px (escritorio).
- Long-press: `pointerdown` con temporizador 450 ms; se cancela si el dedo se
  mueve >10 px (scroll) o al soltar; al disparar, vibración corta si el
  navegador la permite (`navigator.vibrate?.(10)`) y se suprime el toque que
  sigue, para no abrir dos veces. `contextmenu` prevenido solo sobre las
  filas. Sin esto, el long-press en Android Chrome dispara selección de texto
  o el gesto de scroll: es el punto que más se audita.
- El popup en móvil es bottom-sheet a ancho completo (patrón ya usado por los
  modales de la app); chips de subcartera con altura táctil ≥44 px.
- Sin desborde horizontal, etiquetas del treemap sin cortar a 412 px con las
  21 posiciones reales y las tres subcarteras.

## 8. Archivos (plan de implementación)

| Archivo | Cambio |
|---|---|
| `shared/engine/types.ts` | `SubPortfolioDef/Config`, `NwSettings.subPortfolios?` |
| `shared/engine/subPortfolios.ts` | **Nuevo**: lógica pura (siembra, regla cripto, agrupar, CRUD) |
| `shared/engine/treemap.ts` | **Nuevo**: layout squarified puro |
| `shared/engine/__tests__/subPortfolios.test.ts` | **Nuevo**: tests de agrupado, regla cripto, CRUD, hash de color |
| `shared/engine/__tests__/treemap.test.ts` | **Nuevo**: tests de layout (áreas ∝ valor, sin solapes, dentro del marco) |
| `server/db.ts` | Sanitizar `subPortfolios` en `sanitizeNwSettings` |
| `src/store.ts` | Defaults + siembra al cargar; acciones `setHoldingSubPortfolio`, `upsertSubPortfolio`, `removeSubPortfolio` reutilizando `updateNwSettings` |
| `src/components/left/HoldingActionMenu.tsx` | Sección «Subcartera» + crear nueva inline |
| `src/components/left/SubPortfolioTreemap.tsx` | **Nuevo**: treemap de dos niveles + gestor |
| `src/components/left/LeftPanel.tsx` | Inserta el treemap, long-press/clic derecho en filas, chip de subcartera en la fila, filtro por subcartera |

## 9. Criterios de aceptación (auditables)

1. Tests nuevos en verde + suite completa en verde + `npm run build` OK.
2. Long-press sobre GOOG en móvil (412×915) abre el popup en la sección
    Subcartera; asignar «Núcleo» persiste tras recargar y se ve en el treemap.
3. El treemap con datos reales muestra Núcleo/Especulativa/Cripto + Sin
   etiquetar, con áreas proporcionales al valor (verificación numérica en el
   test de layout, no a ojo).
4. Un activo nuevo (sin asignación) aparece en «Sin etiquetar» y, si es
   cripto, en «Cripto» por regla derivada.
5. Capturas QA: móvil 412×915 (treemap, popup, long-press, gestor), 360 px y
   escritorio 1440 px. Sin desbordes ni etiquetas cortadas.
6. Nada se publica a producción sin la orden explícita del dueño sobre esta
   spec + las capturas.

## 10. Nota v3 (feedback del dueño en vivo, 2026-11-14 00:20)

El dueño etiquetó GOOG a Núcleo y vio aparecer sola la división en Núcleo y
Cripto: le gustó, **pero el usuario tiene que poder elegir** esa distribución
«por defecto». Tres cambios:

1. **Confirmación de la distribución por defecto.** Nuevos campos opcionales
   en `SubPortfolioConfig`: `defaultsConfirmed` y `autoDefaults` (ausente =
   `true`). Cuando el treemap va a mostrar contenido derivado (al menos un
   activo que «Cripto» recibe solo por la regla automática) y
   `defaultsConfirmed !== true`, se muestra **una sola vez** el modal
   «Distribución por defecto»: «Usar esta distribución»
   (`defaultsConfirmed=true, autoDefaults=true`) o «No, etiqueto todo a mano»
   (`defaultsConfirmed=true, autoDefaults=false`; con `autoDefaults=false` la
   regla derivada no corre y los cripto quedan sin etiquetar, en «General»,
   hasta que el usuario los asigne). La decisión se persiste en `NwSettings`
   como el resto de la config (el sanitizador del servidor solo preserva los
   campos si son boolean) y el modal no vuelve a aparecer.
2. **Renombre de siembra:** la def `especulativa` pasa a llamarse
   **«Especulativas»** (el id no cambia; las configs ya guardadas no se
   tocan desde el código).
3. **Margen inferior:** la fila de mini-treemaps gana ~14 px de aire bajo los
   treemaps, antes del bloque «Tenencias Brutas…», que se veía pegado.
