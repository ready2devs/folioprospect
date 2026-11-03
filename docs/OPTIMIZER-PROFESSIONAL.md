# Optimizador profesional — cómo propone ahora la sección Optimizador

**Fecha:** 2026-11-03 · **Respaldo previo:** `respaldo-pre-optimizador-profesional-2026-11-03` (→ 5010f79e)
**Pase correctivo de la capa de RE:** §12 (2026-11-03, respaldo
`respaldo-pre-re-conservador-2026-11-03` → a5b8d10).
**Relación con otros docs:** la valuación sigue gobernada por
`docs/VALUATION-RULES.md` (R0–R8); este documento gobierna cómo el
Optimizador *consume* esas valuaciones y cómo decide movimientos.
Supersede las partes de `docs/SPEC-004-optimizer.md` que describen la
fórmula del score, las reglas de salida y la reaplicación.

## Principio rector

La propuesta debe parecerse al análisis de un profesional de portafolios
con años de experiencia: mantiene el núcleo salvo motivo, sale por tesis
y no por ruido, difiere lo que tiene balance en puerta, compra solo lo
que supera un listón explícito y deja caja sin culpa cuando nada lo
supera. **Todo ese juicio está codificado como reglas generales sobre
campos medibles** — ninguna línea del motor conoce un ticker. Los
juicios puntuales del análisis humano que no se pudieron codificar sin
hardcodear están listados al final, con su brecha y su proxy.

## Las reglas

### §1 — Shrinkage por confianza (score y retorno esperado)
El FV que alimenta la convergencia (35% del retorno esperado) y la
oportunidad del score se **encoge hacia el precio** según `fvConfidence`
del motor de valuación: Alta ×1,0 · Media ×0,7 · Baja ×0,4 de la brecha
FV−precio (`shrunkFairValue`). Sin etiqueta se asume Media.
*Juicio del que deriva:* la captura del 2026-11-03 02:26 mostraba a VIST
liderando el ranking (score 86) y recibiendo fondos, con un FV de
US$346 de confianza Baja y rango 97–724 (FV/precio 5,2×): la confianza
existía como etiqueta pero no «mordía» en ningún número.
*Consecuencia adicional:* un activo con FV/precio > 3 queda **inelegible
como destino** (presunción de error de modelo) aunque sigue valuado,
rankeado y puede mantenerse o venderse por las reglas de siempre.

### §2 — Umbral de materialidad
Si las rotaciones **por reglas** (veredicto-vender, score-bajo,
reemplazo sectorial, bajo-retorno) mejoran el retorno geométrico menos
de **0,25 pp**, y no reducen la volatilidad ≥ 1 pp con retorno casi
intacto, se retiran y la salida es «sin mejora» estructural. *Deriva
de:* la misma captura — la propuesta «optimizaba» de 14,45% a 14,52%
(+0,07 pp) sin declararse sin mejora. Las salidas por tesis (§3), las
manuales, las sugerencias aceptadas y los recortes por concentración
(política de riesgo del usuario, no apuesta de retorno) nunca se
retiran por esta vía; el veredicto sigue informando el Δ retorno real.

### §3 — Salidas por tesis deteriorada
Señales medibles (ninguna mira el ticker; `thesisSignalsFor`):
`eps-negativo` (EPS forward usado por el FV ≤ 0) · `ganancias-en-caida`
(consenso espera EPS del próximo año ≤ −5%) · `dilucion-fuerte` (ΔS >
+10% anual, serie de acciones diluidas de EDGAR) · `fcf-negativo-sin-crecimiento`
(mediana de FCF 3–5 años ≤ 0 con ingresos creciendo < 10%) ·
`fv-un-solo-componente` (FV de 1 componente con confianza Baja).
**≥2 señales combinadas ⇒ candidata a salida**: total si ≥3 señales o
si está `eps-negativo`; parcial (50%) si son 2 sin la dura. Defensivas:
parcial salvo deterioro grave (≥3 con EPS negativo → total). Las
salidas por tesis **no consumen el tope de extracción automática del
15%** (no son rebalanceo) y respetan candados, exclusiones del usuario
y el cinturón de balances (§5). Una sola señal ⇒ **vigilancia**
(`watchAlerts`), sin movimiento. Cada salida lleva sus códigos de
motivo legibles en la tarjeta y en la evaluación escrita.
*Juicios que codifica:* NBIS «reducir por prima y dilución del 15–22%
anual» → `dilucion-fuerte` + `eps-negativo`; TMDX/HSAI «mantener
condicionado» → una señal sola no vende; «salir si la tesis se rompe»
como categoría que el motor viejo no tenía (solo sabía recortar por
concentración y swaps de a pares).

### §4 — La caja como destino legítimo
Los fondos liberados se asignan solo a destinos que superan **el
listón**: score ajustado ≥ 65, FV de ≥2 componentes (o desconocido en
inputs legados), FV/precio ≤ 3, no defensivo, sin examen próximo, con
cupo de peso disponible. Lo que no encuentra destino queda como
`cashHeldUsd` explícito con su motivo, y la cartera final lo muestra
como «Efectivo sin asignar». *Deriva de:* el motor anterior obligaba a
redesplegar todo (24 → 24 posiciones) aunque el destino fuera «lo menos
malo».

### §5 — Cinturón de balances (event gating)
Si el próximo balance de un activo está a **≤ 5 días hábiles**, no se
propone ni su compra ni su venta: aparece en `pendingExams` con su
fecha (y sus señales de deterioro, si las tiene: la salida también se
difiere). La capa de datos escanea el calendario Nasdaq de los próximos
14 días en una sola pasada. *Codifica:* el sistema de exámenes del
usuario (nada se rota en caliente antes de su balance: MELI 4-nov,
TMDX 5-nov, ONTO 9-nov, HSAI 10-nov quedan diferidos en la semana del
3-nov; NBIS, 12-nov, queda fuera de la ventana por 2 días hábiles).

### §6 — EPS de mitad de ciclo para cíclicas medibles
Disparador objetivo (capa de datos, sobre campos del motor de FV):
yield forward implícito (EPS usado ÷ precio) > 20%. Ambos términos son
del instrumento cotizado, así que el disparador es inmune a mezclas de
base (acción ordinaria vs ADS). Si dispara, el EPS forward se
re-escala por la razón **mediana/último año de la misma serie anual de
EPS reportado (EDGAR)** — la razón cancela la base de reporte, por lo
que la normalización es invariante a ella (comparar niveles de EPS
entre la serie reportada y el forward habría mezclado bases: el caso
SIMO, que reporta por acción ordinaria y cotiza por ADS) — y el
componente de múltiplos se reagrega con la misma `aggregateFairValue`
y las mismas calidades, con flag `cyclicalNormalized`. *Deriva de:* MU
rankeaba con EPS forward de pico de ciclo (209, yield implícito 25%)
tratado como permanente mientras su DCF usaba la mediana histórica
(el valle): dos extremos promediados no dan el centro. El FV de la
ficha no cambia; cambia el FV que el Optimizador usa para puntuar (y
queda trazado en el input como `midCycleEps`). Requiere ≥3 años de
serie reportada con último año y mediana positivos; sin eso, no se
normaliza (la winsorización y el shrinkage siguen acotando el daño).
*Bug raíz encontrado al implementar:* la serie de EPS de EDGAR venía
vacía para todos los emisores porque `parseEdgarSeries` leía la unidad
`USD` y el EPS se reporta en `USD/shares`; corregido, con test.

### §7 — Score sin doble conteo
Nueva fórmula: **30% velocidad, 25% oportunidad (contra el FV
encogido), 20% calidad, 15% confianza de la valuación (Alta 90 / Media
65 / Baja 35 / sin dato 55), 10% riesgo**. Antes la velocidad pesaba
50%: el score era el retorno esperado con otro nombre y apenas agregaba
información. El orden de la columna 1 sigue siendo por tiempo a
duplicar (preferencia del usuario); el score mostrado es el nuevo.

### §8 — Coherencia de roles
Los activos con rol defensivo **nunca son destino** de fondos de
optimización (son lastre, no vehículo de retorno): solo pueden ser
fuente en los términos vigentes (parcial extrema por reglas, o salida
por deterioro grave de §3). *Deriva de:* VIST figuraba como «rol
defensivo» y a la vez recibía los fondos de la venta de GOOG.

### §9 — Fiabilidad por componente y jerarquía de fuente
Ver `docs/VALUATION-RULES.md` R8: ponderación del FV por calidad
medible con ratio acotado, y jerarquía única EDGAR-primero para la
serie histórica de FCF (termina la alternancia Yahoo/EDGAR que volvía
inestable el FV de MELI entre capturas).

### §10 — DCF emergente
Ver R8: mediana de FCF ≤ 0 con TTM > 0 e ingresos creciendo > 15% ⇒
DCF sobre base TTM (`ttmBaseEmerging`, calidad 0,45), no null. *Caso
que lo motivó:* NBIS quedaba valuada por un solo componente (el target)
pese a tener flujo TTM positivo de ~US$4,1 mil M.

### §11 — Evaluación escrita profesional
`buildNarrative` se genera desde los códigos de motivo con estructura
fija: (1) situación y núcleo — si las tres mayores posiciones no tienen
motivo de salida, lo dice («el núcleo se mantiene intacto»); (2)
concentración sectorial; (3) riesgo por Euler; (4) salidas agrupadas
por tipo (tesis con sus motivos en lenguaje llano / reglas / propias
del usuario); (5) destinos con su motivo y caja deliberada con monto y
motivo; (6) exámenes próximos con fechas y vigilancias abiertas; (7)
veredicto y disclaimer. Ninguna afirmación se escribe sin un dato del
motor detrás.

## §12 — Pase correctivo de la capa de retorno esperado (2026-11-03)

**Diagnóstico (captura del usuario, 2026-11-03 03:19).** Con el pase
profesional ya en producción, la columna 1 (ordenada por tiempo a
duplicar) quedó encabezada por NBIS (RE 24,9%, duplica en 3,1 años) y
VIST (RE 22,9%, 3,4 años): justamente las dos valuaciones de confianza
Baja menos confiables de la cartera. El score sí se comportaba (TSM 81
primero; NBIS 59), pero el RE puntual de los nombres Baja seguía siendo
falsa precisión. Cuatro defectos, todos de la capa de RE — el FV
titular no se toca (R0):

1. **El shrinkage lineal era insuficiente para brechas extremas.**
   VIST, con FV a 4,5× el precio, conservaba +139% de brecha tras el
   encogido ×0,4: un % de un número increíble sigue siendo increíble.
2. **La regla de DCF emergente (§10) regalaba base.** El DCF de NBIS
   se computaba sobre un FCF TTM positivo por prepagos de clientes con
   el capex explotando, a calidad 0,45: ese componente inflaba su FV y
   su convergencia.
3. **Los tres componentes del RE no son independientes en
   hipercrecimiento** (GK, convergencia y consenso comparten el mismo
   optimismo de crecimiento). Sin rehacer la arquitectura, la
   mitigación profesional es acotar el resultado por confianza.
4. **El EPS forward de NBIS cambia de signo entre refrescos**
   (−4,88 / +1,83 según qué fuente responda): un input cara o cruz no
   puede sostener el RE más alto de la cartera.

**Las correcciones (reglas generales, ningún ticker):**

- **A · Convergencia conservadora por confianza** (`convergenceTargetFor`).
  El destino del componente de convergencia es: Alta → FV encogido
  (k=1,0); Media → FV encogido (k=0,7); **Baja → el menor entre el FV
  encogido (k=0,4) y el piso del rango `fvRange`** que el motor de
  valuación ya publica (respaldo sin rango: k=0,25). Un profesional,
  ante confianza Baja, no anualiza un % del número puntual: converge
  al escenario conservador del propio rango. Para VIST eso es converger
  a ~97 (su piso) y no a 160 (su encogido): +46% total en vez de +139%.
  El activo expone `conservativeConvergence` cuando gobierna esta regla.
- **B · Tope de RE por confianza** (`RE_CONFIDENCE_CAP_PCT`). El RE
  final se acota a Alta +35% (el techo histórico), Media +28%, **Baja
  +18%**. Calibración: conservadurismo creciente con la incertidumbre;
  +18% sigue siendo un retorno accionarial alto — lo que se elimina es
  la cola imposible (25–35%) sostenida por valuaciones frágiles.
- **C · Castigo al DCF emergente** (en el motor de FV). Si el
  componente DCF lleva `ttmBaseEmerging`, su base TTM se multiplica por
  **0,75** (`EMERGING_DCF_HAIRCUT`) y su calidad de ponderación baja de
  0,45 al **piso del sistema, 0,30** (`EMERGING_DCF_QUALITY`). Se
  castiga, no se elimina: R0 sigue vigente y NBIS conserva su DCF, más
  chico. La procedencia lo muestra (valor usado = 75% del original).
- **D · Desacuerdo de signo en el EPS** (`signDisagreement` en la
  cadena de reparación del motor de FV). Si las fuentes **directas**
  del EPS forward discrepan en el signo en el mismo refresco, el motor
  de valuación lo registra (flag + `epsSignDisagreement`) **sin bajar
  la etiqueta pública** — no integra los flags que degradan la
  confianza del FV — y la capa de RE reacciona: (i) la confianza que
  usa el RE baja un escalón adicional (`reConfidenceFor`: gobierna el
  destino de convergencia de A, el tope de B y el subpuntaje de
  confianza del score); (ii) Grinold-Kroner no puede usar crecimiento
  de EPS ni de ganancias totales: solo crecimiento de **ingresos**; si
  no hay, el subcomponente vale 0 (GK sigue computando dividendos,
  recompra y repricing).

**Efecto buscado y criterio de aceptación:** con A–D, NBIS y VIST
salen de los dos primeros puestos por duplicación por efecto de las
reglas, sin tocar sus FV titulares (salvo el achique del DCF emergente
de C, que es un parámetro del FV documentado arriba).

## Juicios documentados NO codificables (brechas honestas)

| Juicio | Por qué no se codificó | Proxy más cercano en el motor |
|---|---|---|
| Vender ONTO completo → SIMO (paso 1 ya aprobado por el usuario) | Es una decisión discrecional ya tomada por el usuario, entre industrias distintas; el motor no tiene regla general de «swap cross-industry por convicción» que no sea un override con nombre propio. Además ONTO cae dentro del cinturón (§5) hasta su balance del 9-nov. | SIMO compite como destino por el listón (§4) cuando haya fondos liberados por reglas/tesis; ONTO queda diferido a examen (§5), que es lo que un profesional haría sin la orden expresa del usuario. |
| ETH completo → BTC (consolidación cripto) | El motor trata la cripto fuera del score y sin ventas automáticas por diseño (SPEC-004); «consolidar duplicados del mismo factor» exigiría una noción de equivalencia entre activos cripto que ningún campo actual expresa. | Ninguno: queda como decisión manual del usuario (la UI de «Obtener más fondos» la permite). |
| MELI sale si el balance del 4-nov no recupera margen | El examen es posterior al balance y depende del margen reportado ese día: es exactamente el cinturón de §5 (diferir), no una regla previa posible sin inventar el resultado. | `pendingExams` con fecha; post-balance, si el margen/EPS deteriora los campos, §3 puede disparar en la próxima corrida. |
| Techo del bloque memoria MU+SIMO (~14%) y SIMO hasta ~3–3,5% | Son parámetros de ESTA cartera y de un par de tickers concreto; un «bloque» no es un campo general del motor (las industrias Finviz de MU y SIMO ni siquiera coinciden). | Tope por posición (12%) + concentración sectorial en la narrativa. Un techo por grupo correlacionado sería el desarrollo general correcto (la matriz de correlaciones por bloques ya existe para riesgo). |
| Prima de valuación de NBIS «cara contra CoreWeave» y su backlog/RPO de US$37.500 M | No hay fuente conectada de múltiplos de pares no tenidos ni de backlog/RPO; el motor solo ve los campos de Yahoo/Finviz/EDGAR del propio activo. | `eps-negativo` + `dilucion-fuerte` (§3) capturan la parte medible del deterioro; su FV de un componente dejó de ser tal con §10. |
| Ventas de insiders (NBIS −US$421 M en 2 años, etc.) | Ninguna fuente integrada trae transacciones de insiders. | Ninguno. |
| Dilución *esperada* de NBIS (+15–22% anual por SBC/compensación) | El ΔS de EDGAR es *trailing* (acciones promedio reportadas): en emisores reestructurados (NBIS ex-Yandex) la serie refleja la reestructuración y recompras — su lectura en vivo fue −13,7% interanual, que contradice la expectativa forward. El motor usa el dato reportado y la discrepancia queda declarada acá; la señal de dilución simplemente no dispara para ese caso. | `eps-negativo` + `ganancias-en-caida` capturaron a NBIS igual (salida por tesis en la verificación en vivo). |
| Estabilidad de `eps-negativo` en nombres con EPS ≈ 0 | Cuando el consenso está en break-even (NBIS: las fuentes oscilan entre −4,88 y +1,83 según el refresco), el signo del EPS usado puede alternar entre corridas y con él la salida por tesis (en la verificación: salida total en una lectura, vigilancia en las dos siguientes, ya estables entre sí). Es ruido de medición en torno a cero, no un cambio de tesis. Mitigaciones vigentes: la salida exige una segunda señal independiente y la caché de 15 min estabiliza lo que ve el usuario; una confirmación entre dos corridas consecutivas sería el refinamiento correcto y requiere estado que el motor hoy no guarda. | La señal `ganancias-en-caida` (estable en todas las lecturas) mantiene a NBIS en vigilancia cuando la dura no confirma. |
| «SIMO ya aprobó su examen» (balance del 28-oct superó) como mérito acumulativo | El motor no guarda historial de exámenes aprobados por activo; sería estado nuevo, no una regla sobre campos actuales. | El score ajustado y el listón de destino (§4) lo tratan como a cualquier activo con números sólidos. |
| Calidad de franquicia/monopolio (TMDX: única plataforma multi-órgano FDA) | Juicio cualitativo sin campo medible en las fuentes actuales (el moat score es heurística de márgenes/ROE). | `moatScore` dentro de la calidad del score (§7). |

## Calibración (umbrales y su justificación)

- Shrinkage 1,0/0,7/0,4: la confianza Baja del motor de FV ya implica
  dispersión ≥ 80% entre métodos o FV/precio fuera de [1/3, 3]; creerle
  menos de la mitad de la brecha es el descuento estándar de un
  profesional ante una valuación que él mismo marcó como frágil.
- Materialidad 0,25 pp: por debajo, el Δ queda dentro del ruido de
  refresco de inputs entre corridas (observado: oscilaciones de pocos
  puntos de score y décimas de RE entre lecturas del mismo día).
- Dilución > 10%: es el doble de lo que una empresa madura emite por
  compensación en acciones (~2–5%); por encima, el accionista financia
  el crecimiento con su propio porcentaje.
- Listón de destino (score ≥ 65, ≥2 componentes, FV/precio ≤ 3): con el
  score recalibrado (§7), 65 separa el tercio superior típico de una
  cartera concentrada; FV/precio > 3 es la misma cota que el motor de
  FV usa para bajar la confianza a Baja por sospecha de error.
- Ventana de examen de 5 días hábiles: una semana de trading; es el
  horizonte en el que «esperar el número» no cuesta casi nada y
  comprarlo/venderlo antes es pura apuesta al resultado.
