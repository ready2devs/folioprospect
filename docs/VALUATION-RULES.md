# Reglas de valuación de FolioProspect

Cómo calcula la app el Fair Value (valor justo) de cada activo. Las reglas
son **universales**: son las mismas para todos los activos y se disparan
solo por características medibles de los datos. No existe ninguna lógica
por ticker, ningún ajuste a mano y ninguna excepción nombrada.

El Fair Value combina hasta tres componentes independientes:

1. **DCF**: flujo de caja libre reportado, proyectado mecánicamente.
2. **Múltiplos**: EPS forward × múltiplo según el moat (Wide 26, Narrow 20,
   None 15).
3. **Target**: precio objetivo promedio de los analistas.

---

## R0 — Principio rector: en la duda, buscar más fuentes (nunca dejar de valuar)

> En casos dudosos: buscar más fuentes que agreguen información en vez de
> evitar valuar el activo o cuarentenarlo. Todo activo debe poder ser
> valuado de forma sistemática, aun los más difíciles, aun los que no
> cuenten con cierta información o dato por ser un activo poco seguido o
> de baja capitalización.

Consecuencias concretas en el motor:

- Ante un dato malo o faltante, la respuesta es **ampliar la muestra y
  reparar el dato**, no recortar la muestra ni excluir el activo.
- La escalera de respaldo de cada input (sección R2) es exhaustiva y
  ordenada, y llega hasta **derivar el dato de los estados contables
  reportados** (SEC EDGAR) cuando los proveedores de mercado no lo traen.
- La baja cobertura (un target de pocos analistas, un EPS de un solo
  proveedor, un componente derivado de filings) es un hecho de
  **confianza**: baja la etiqueta y ensancha el rango expuesto. Nunca es
  motivo de exclusión.
- Un activo sin valuación (`fairValue = null`) solo puede resultar de una
  imposibilidad matemática tras agotar la escalera (sección R5), y se
  considera un defecto a investigar, no un resultado aceptable.

## R1 — Filosofía de agregación: promediar muchos, winsorizando

El valor justo surge de promediar estimaciones independientes: por la ley
de los grandes números, el promedio de muchas estimaciones se acerca al
valor real. Por eso:

- A nivel **input**, cuando varias fuentes independientes estiman lo mismo
  (EPS forward, target), el valor usado es su promedio (o la mediana de
  las fuentes cuando discrepan sin explicación: la mediana acá elige el
  dato de entrada, no es el Fair Value).
- A nivel **componente**, el Fair Value es el **promedio winsorizado** de
  los componentes válidos (sección R4): lo extremo no se borra, entra
  recortado al borde de la banda.

Esto reemplaza dos diseños anteriores que quedaron descartados: la
mediana de componentes como Fair Value (descarta información) y la
exclusión por higiene de componentes o activos (dejaba activos sin
valuación por un dato corrupto del proveedor).

## R2 — Escalera de reparación por input (antes que cualquier exclusión)

Para cada primitiva, la capa de datos y el motor intentan, en orden:

1. **Valor primario del proveedor** (p. ej., EPS forward de Yahoo,
   `defaultKeyStatistics.forwardEps`).
2. **Recomputación desde otras primitivas**: EPS implícito en el P/E
   forward publicado por otro proveedor (Finviz), promedio de
   estimaciones del próximo año fiscal (Yahoo `earningsTrend` +1y), EPS
   derivado del ratio publicado por el propio proveedor.
3. **Derivación desde fundamentos reportados**: EPS trailing × (1 +
   crecimiento de ganancias reportado).
4. **Derivación desde estados contables (EDGAR)**: último EPS anual
   auditado × (1 + crecimiento reportado), flag `derivedFromFilings`.

Reglas de la escalera:

- **Todo ratio se recomputa desde primitivas**: P/E forward := precio ÷
  EPS forward. Ningún P/E publicado entra como input; se usa solo como
  chequeo. Si el publicado difiere más de 5% del recomputado, se marca
  `providerRatioMismatch` y manda la primitiva.
- **Independencia de fuentes**: dos campos alimentados por el mismo
  proveedor cuentan como UNA fuente (p. ej., el EPS de Yahoo y el
  promedio +1y de Yahoo no son dos confirmaciones independientes).
- **Conflicto entre fuentes > 25%**: el valor de la fuente primaria se
  reemplaza por el valor combinado de las fuentes (promedio si coinciden
  tras normalizar; mediana de fuentes si discrepan), con flag
  `repairedFromSources` y procedencia registrada (valor original, valor
  usado, fuentes).
- **Fuentes con earnings yield forward > 33% conviviendo con fuentes
  plausibles (≤ 33%)**: las implausibles se presumen corruptas (ningún
  consenso real recupera el precio en menos de 3 años de ganancias) y el
  EPS sale de las plausibles. Es una selección entre fuentes, no una
  exclusión del componente.
- **Mezcla de bases (ordinaria vs ADS)**: si dos fuentes directas de EPS
  difieren por un factor próximo a un entero ≥ 2 (2, 3, 4, 5, 8, 10, con
  tolerancia de 10%), se presume mezcla de bases y se normaliza
  expresando la fuente menor en la base del instrumento cotizado (el EPS
  por ADS es el mayor), flag `basisNormalized`. La detección no usa la
  derivación de fundamentos (ruta 3), donde un factor entero suele ser
  ruido.
- **Target de analistas**: promedio de las fuentes disponibles (Yahoo
  `targetMeanPrice`; si falta, la mediana del mismo consenso como
  escalón de respaldo; Finviz "Target Price"). Más fuentes, mejor
  promedio.

## R3 — Zonas de earnings yield: escrutinio, no puertas

Sobre el EPS forward ya reparado, con `ey = EPS / precio`:

- `ey > 33%` (P/E < 3): dispara escrutinio máximo (la escalera completa).
  Si dos grupos de fuentes independientes confirman el EPS, el componente
  entra con `extremeYieldConfirmed`. Si no hay confirmación, entra igual
  con `extremeYieldUnconfirmed` — la winsorización (R4) acota su efecto.
- `12,5% < ey ≤ 33%` (P/E entre 3 y 8): entra con `extremeYieldCaution`.
- P/E forward > 150 con EPS > 0: entra igual, con `extremePeReferenceOnly`
  (informativo).

Ninguna zona rechaza un componente. La única nulidad posible está en R5.

## R4 — Base del DCF normalizada y promedio winsorizado

**Base del DCF.** Con 3 o más años de FCF anual reportado disponibles
(serie de EDGAR —estados auditados— o, en su defecto, estados de Yahoo;
gana la fuente con más años), la base es la **mediana de los últimos 3–5
años**. La serie de EDGAR se construye con dos cuidados universales:
mandan los puntos de año fiscal verdadero (`fp = FY`) sobre los períodos
móviles TTM de los informes trimestrales, y entre conceptos contables
candidatos para el mismo flujo gana la serie más fresca — un emisor
puede abandonar un concepto (p. ej., migrar su capex a otro rubro) y una
serie vieja no debe emparejarse con flujos actuales.
Nunca un año valle ni un año pico. Si el último año se aparta de
la mediana por más de 3× en cualquier dirección, se usa igual la mediana
y se marca `normalizedBase`. Si el último año es menor que 0,5× la
mediana (o el último EPS anual es menor que 0,5× su mediana), el
componente se marca `troughAdjusted` (valle cíclico: divergencia
esperada). Sin serie suficiente, rige la misma regla uniforme de
respaldo: la base TTM (que a su vez puede venir de EDGAR si el proveedor
no traía FCF, flag `derivedFromFilings`). Los caps mecánicos de
crecimiento (4%–26%, con fade a 3,2% en 10 años) y el WACC (8,8% / 9,6%
según beta) no cambian, y se aplican sobre la base normalizada. El DCF
sigue trabajando solo con flujos pasados reportados, sin previsiones de
consenso (decisión vigente del producto).

**Agregación.** Con los componentes válidos (DCF, múltiplos, target):

- Cada componente se **recorta (winsoriza)** a la banda de credibilidad
  `[0,25×, 3,5×]` de su referencia, donde la referencia es el **promedio
  de los otros componentes**. El recorte queda registrado en
  `fvWinsorized` (valor original y valor recortado) con flag `winsorized`.
- El Fair Value es el **promedio de los componentes winsorizados**.
- Los escenarios del Optimizador (pesimista/optimista) se construyen con
  el mismo conjunto final de componentes winsorizados (`fvComponents`).
- El Fair Value **nunca depende del precio**: ningún componente se
  calcula desde el precio salvo la recomputación de ratios (que no
  alimenta valores), y está prohibido fabricar un FV desde el precio
  (el viejo fallback `precio × 1,05` fue eliminado).

## R5 — Nulidad solo por imposibilidad matemática; ningún activo sin valuación

Un componente es `null` únicamente cuando su input es imposible o
inexistente tras agotar la escalera de R2:

- EPS forward resultante ≤ 0 → múltiplos `null` (`notMeaningful`): un
  múltiplo negativo no es una valuación; jamás se usa el valor absoluto.
- Mediana de FCF ≤ 0 (o sin flujo positivo de ninguna fuente) → DCF
  `null` (`medianFcfNonPositive`): no hay flujo positivo que descontar.
- Ninguna fuente publica target → target `null`.

Y a nivel activo:

- Con **1 solo componente válido**, el Fair Value es ese componente, con
  flag `singleComponent` y confianza Baja.
- Con **0 componentes**, `fairValue = null` con motivo
  `noValidComponents`. Tras la escalera de reparación debería ser
  inalcanzable: si aparece en producción, es un defecto de la cadena de
  datos a investigar, no un estado aceptable.

## R6 — Confianza y trazabilidad

Cada resultado expone, además del Fair Value:

- `fvConfidence`: **Alta** si la dispersión final entre componentes
  `(máx − mín) / promedio` es < 30% y no hay flags; **Media** si es < 80%
  o hay un flag menor; **Baja** si es ≥ 80%, si hay varios flags menores
  (cada uno baja un nivel), si el FV es de un único componente, o si el
  FV/precio sale de `[1/3, 3]`.
- `fvRange`: rango `[mín, máx]` de los componentes crudos válidos.
- `fvWinsorized`: componentes recortados, con valor original y recortado.
- `fvExcluded`: componentes `null` por imposibilidad, con motivo.
- `fvProvenance`: por componente, el valor crudo de la fuente primaria,
  el valor efectivamente usado, las fuentes que lo alimentaron y sus
  flags. Para el DCF los valores son la base de FCF; para múltiplos, el
  EPS; para el target, el precio objetivo.
- `fvFlags`: todos los flags disparados (`repairedFromSources`,
  `basisNormalized`, `providerRatioMismatch`, `unconfirmedEps`,
  `singleSource`, `derivedFromFilings`, `normalizedBase`,
  `troughAdjusted`, `extremeYieldCaution`, `extremeYieldConfirmed`,
  `extremeYieldUnconfirmed`, `extremePeReferenceOnly`, `winsorized`,
  `singleComponent`, `notMeaningful`).

Las flags y la procedencia viven en la API y en este documento; la ficha
del activo no tiene hoy una superficie de metodología capaz de
mostrarlas sin rediseño, así que no se agregaron a la UI en esta pasada.

## R7 — Alcance: ruteo por tipo de activo (fuera de esta pasada)

- **Financieras y REITs**: el modelo completo que les corresponde
  (retorno excedente sobre el capital —excess returns— para bancos,
  AFFO para REITs) **no** se construyó en esta pasada porque esos datos
  no están canalizados al motor. Hoy rigen para ellas las mismas reglas
  universales de R2–R5. Próximo paso documentado: el codebase ya expone
  ROE (input del motor) y P/B (Yahoo `priceToBook` y Finviz), con lo que
  el valor libro por acción es derivable (precio ÷ P/B); un componente
  P/B × ROE es el candidato natural a sumar a la muestra de las
  financieras, sin excepciones por ticker.
- **Empresas pre-ganancias**: el sustituto por ventas (P/S) **no** se
  construyó en esta pasada. El comportamiento vigente es el de R5: sin
  EPS positivo no hay componente de múltiplos, y el activo se valúa con
  DCF y/o target.

## Limitaciones conocidas

- La segunda fuente de EPS forward es el EPS implícito en el P/E de
  Finviz; cuando Finviz no cubre el activo, se usa el promedio +1y de
  Yahoo `earningsTrend`, que es el mismo proveedor que la primitiva (no
  suma independencia, aunque sí otro horizonte: año fiscal vs NTM).
- La serie anual de FCF de Yahoo puede venir en moneda local en emisoras
  extranjeras; la de EDGAR es en USD. Gana la fuente con más años, y la
  procedencia (`fcfHistorySource`) queda registrada.
- La capa de datos conserva un perfil fundamental genérico de respaldo
  para cuando la API de Yahoo falla por completo (modo offline); ese
  perfil no pasa por estas reglas y es anterior a este rediseño.
- El target de analistas puede estar desactualizado en la fuente; no hay
  en esta pasada un control de antigüedad del target.

## R8 — Adenda 2026-11-03 (Optimizador profesional): calidad, emergentes y jerarquía de fuente

Cambios posteriores a la primera publicación de este reglamento, todos
con la misma doctrina (reglas universales disparadas por datos medibles;
nada por ticker):

- **Ponderación por calidad medible del dato.** El promedio winsorizado
  de componentes deja de ser igualitario cuando la calidad difiere: el
  peso de cada componente es ∝ su calidad, acotado a [0,5×, 2×] el peso
  igualitario y renormalizado. Calidad del DCF: serie EDGAR de 5 años =
  1 · 3–4 años = 0,85 · TTM = 0,6 · TTM desde filings = 0,55 · base
  emergente = 0,30 (piso del sistema desde el pase correctivo RE:
  antes 0,45). Calidad de múltiplos: EPS confirmado por ≥2
  proveedores independientes = 1 · una fuente directa = 0,75 · solo
  derivado = 0,55. Calidad del target: 2 fuentes = 1 · 1 fuente = 0,8.
  Sin información de calidad, los pesos son los igualitarios históricos.
  Justificación: promediar muchos (R1) no obliga a fingir que todos los
  datos valen lo mismo; la ponderación está acotada para que ningún
  componente mande por calidad como antes mandaba por error.
- **Regla de emergente (amplía R5).** Si la mediana de FCF de 3–5 años
  es ≤ 0 pero el FCF TTM es > 0 y el crecimiento de ingresos supera
  +15%, el DCF se computa sobre la base TTM con flag `ttmBaseEmerging`
  y confianza reducida, en vez de quedar null. La mediana histórica de
  una empresa que ya genera caja describe su pasado, no su imposibilidad
  de ser valuada por flujo. Si el TTM también es ≤ 0, o no hay
  crecimiento que lo explique, rige la nulidad de R5. **Castigo (pase
  correctivo RE, 2026-11-03):** esa base TTM puede estar inflada por
  prepagos de clientes con el capex en expansión, así que entra con
  haircut ×0,75 y calidad 0,30 (el piso): el componente se castiga, no
  se elimina.
- **Jerarquía única de fuente para la serie de FCF.** EDGAR manda
  siempre que tenga ≥3 años (o al menos tantos como Yahoo); Yahoo solo
  entra si la serie auditada no alcanza. La regla anterior («gana la
  serie más larga») alternaba de fuente entre capturas cuando Yahoo
  variaba su cobertura, y el FV de algunos activos (MELI) oscilaba sin
  que cambiara ningún fundamento.

## R9 — Adenda 2026-11-03 (tarde): anclajes de realidad y ponderación

Disparador: la auditoría del usuario sobre VIST. Sus datos eran reales
(EPS forward reparado 10,40 ≈ consenso publicado 9,2–12,5; target del
motor 95,46 ≈ consenso 95,40 de 12 analistas) y sin embargo el FV
salía 346,24. Tres defectos generales, ninguno del dato:

1. **Múltiplo ciego al sector.** El componente era EPS × 26 (tabla por
   moat «Wide») para una petrolera E&P que el mercado paga 5–7×.
   Regla: el múltiplo aplicado queda acotado por una referencia
   sectorial — el P/E forward de la industria/pares si la capa de
   datos lo provee (`industryForwardPe`, hoy sin plomería: brecha
   documentada); si no, el P/E forward RECOMPUTADO del propio activo
   (precio ÷ EPS reparado). Sobre la referencia se admite una prima
   por moat (Wide ×1,5 · Narrow ×1,25 · None ×1,0) y una prima por
   crecimiento documentada en el propio cálculo (crecimiento de
   ganancias por encima de 10% anual suma hasta +40%). El tope solo
   baja el múltiplo de tabla, nunca lo sube. Flag
   `sectorCappedMultiple`; la evaluación expone `multipleUsed` y
   `multipleCap`. Efecto tipo: VIST ≈ 10,40 × 9,7 ≈ US$100 (antes 270).
2. **Winsorización que fabricaba valor hacia arriba.** El target de
   VIST fue recortado HACIA ARRIBA de 97,48 a 124,35 — por encima del
   máximo de cualquier analista (95) — porque el piso de la banda lo
   medía contra el promedio de dos componentes fantasía. Doble
   corrección: (a) el componente target vive SIEMPRE dentro del rango
   publicado del consenso [low, high] (se recorta en la construcción,
   flag `targetClampedToConsensus`) y la agregación respeta un techo
   duro (`clipCeiling` = máximo del consenso): ningún recorte lo
   levanta por encima de la estimación más optimista que lo compone;
   (b) la referencia de la banda es ROBUSTA: un componente extremo
   contra la mediana del pool (>3,5× o <0,25×) sigue entrando al
   promedio winsorizado como siempre, pero deja de arrastrar el
   piso/techo que recorta a los demás (flag `referenceOutlierExcluded`
   y campo `referenceOutliers`). Es el espejo del caso MELI, donde un
   DCF gigante levantaba el piso y expulsaba a los múltiplos sanos.
   Nota de doctrina: con estas dos cotas (y el haircut del punto 3)
   dos componentes pasan a ser relativos al mercado de forma
   CONTINUA — no hay saltos al cruzar umbrales; la banda en sí sigue
   midiéndose contra los otros componentes, nunca contra el precio.
3. **DCF sobre FCF de pico sin normalizar.** El DCF de VIST (724,30)
   extrapolaba un FCF TTM con yield ~23%. Regla: la normalización
   cíclica aplica también a la BASE — con serie ≥3 años ya manda la
   mediana; sin serie, la base TTM entra con haircut progresivo y
   continuo según su yield: factor = min(1, 12/yield) con piso 0,40
   (a yield 20% ⇒ 0,60; a 30% ⇒ 0,40), flag `cyclicalBaseHaircut`.
   Además se encontró la causa de que la serie de VIST saliera vacía:
   Vista reporta 20-F en IFRS y su capex se etiqueta
   `PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities`,
   un nombre de concepto que el parser no conocía (idem la variante
   sin «Plant»; y el EPS IFRS `DilutedEarningsLossPerShare` /
   `BasicEarningsLossPerShare`). Agregados como conceptos generales:
   la serie auditada de VIST es [−93,5 · +23,6 · +210,7 · +80,1 ·
   −59,5] US$M (2024→2020) y su DCF pasa a anclarse en la mediana real
   — chica, porque la empresa reinvirtió todo su flujo hasta 2024: el
   DCF cumple así su rol de contrapeso conservador (ver ponderación).
4. **Tripwire de plausibilidad `modelSuspect`.** Si el FV final supera
   2× el target de consenso del pool o 2,5× el precio: flag
   `modelSuspect`, confianza forzada a Baja y constancia en la
   procedencia del componente que domina la desviación
   (`dominantDeviation`, campo `modelSuspectDominant`). No cambia el
   número: lo señala. La capa de RE lo consume convergiendo al piso
   del rango (único caso en que el piso gobierna: ver
   OPTIMIZER-PROFESSIONAL.md §13).

**Ponderación (directivas del usuario, 2026-11-03).** «Dale más bola
al estimado promedio de analistas, que tan malos no son»: el TARGET es
el componente de mayor peso cuando su cobertura es razonable, porque
es el promedio de muchas estimaciones independientes — la misma
doctrina R0 de ampliar la muestra aplicada a la ponderación. Escala de
calidades vigente: target ≥5 analistas y dispersión (high−low)/media
≤ 0,6 ⇒ 1,0 (dispersión alta ⇒ 0,85); 3–4 analistas ⇒ 0,8; 1–2
analistas o fuente única sin conteo ⇒ 0,45 (nunca dominante); 2+
fuentes sin conteo ⇒ 0,8. DCF (contrapeso conservador designado:
flujos de períodos reportados, base mediana, sin consenso): serie
≥5 años ⇒ 0,65; 3–4 ⇒ 0,55; foto TTM ⇒ 0,40; derivado de estados
anuales ⇒ 0,35; emergente ⇒ 0,30. Múltiplos (el insumo más
exuberante: EPS forward × múltiplo): 2 proveedores directos ⇒ 0,45;
1 ⇒ 0,35; solo derivado ⇒ 0,30. Caso típico de cobertura completa:
~50% target / ~30% DCF / ~20% múltiplos. Sin target en ninguna
fuente, DCF y múltiplos se reparten el total como siempre (R0).
La frescura del target no está disponible en las fuentes actuales:
escala por cobertura y dispersión solamente (brecha documentada).
**(Esta ponderación fue SUPERADA el mismo día por R10: ver la regla
siguiente. La referencia vigente es target ~45% / múltiplos ~30% /
DCF sobre ganancias ~25%, y el contrapeso conservador pasó al ancla
histórica fuera del promedio.)**

## R10 — Adenda 2026-11-03 (noche): arquitectura simplificada de tres patas y ancla histórica

> **SUPERADA por R11 (más abajo, mismo día).** La arquitectura de
> tres patas duró unas horas: el usuario detectó que la pata de DCF
> sobre ganancias contaba el crecimiento dos veces y que la tabla
> ordenaba por duplicación con scores que no la acompañaban. R10
> queda como historial; el sistema vigente es R11.

**Decisión del usuario (2026-11-03), que REVIERTE su decisión del
2-nov («el DCF de FCF histórico déjalo como está»).** Motivo declarado:
el DCF sobre flujos reportados distorsiona ante cambios de paradigma
— castiga a la empresa que está invirtiendo en su inflexión (SIMO con
su FCF pre-inflexión, NVDA en pleno capex de IA, NBIS en valle de FCF
por construcción de datacenters) y premia picos de ciclo (VIST). El FV
central pasa a ser una triangulación de tres operaciones transparentes
y todas mirando hacia adelante:

1. **Target de analistas (~45%).** Como en R9: multifuente reparado
   (Yahoo + TradingView, ver abajo), jamás recortado hacia arriba ni
   por encima del máximo del consenso. Calidad: ≥5 analistas y
   dispersión ≤ 0,6 ⇒ 1,0 (dispersión alta ⇒ 0,85); 3–4 ⇒ 0,8; 1–2 o
   fuente única sin conteo ⇒ 0,45 (nunca dominante); 2+ fuentes sin
   conteo ⇒ 0,8.
2. **Múltiplos sobre ganancias futuras (~30%).** EPS forward reparado
   multifuente × múltiplo acotado por el sector (el anclaje de R9 es
   el corazón de esta pata: múltiplo aplicado = mínimo entre la tabla
   por moat y la referencia sectorial con prima de moat y de
   crecimiento). Calidad: ≥2 grupos directos de EPS ⇒ 0,67; 1 grupo
   ⇒ 0,55; solo derivado ⇒ 0,45.
3. **DCF CORTO SOBRE GANANCIAS (~25%).** Nuevo. Sendero de EPS de
   consenso: año +1 (el EPS reparado de la pata 2), año +2 con el
   crecimiento del año siguiente de la tendencia de ganancias (o
   Finviz «próximo año»), desvanecimiento en 5 años hacia el
   crecimiento de EPS a 5 años de consenso (acotado a [−10%, +35%];
   el primer año a [−30%, +60%]) y tasa terminal = ese crecimiento
   acotado a [−5%, +6%]. Descuento a UNA tasa única para todos: **10%
   anual** (simplicidad deliberada; no hay CAPM por activo en esta
   pata). Conversión ganancia→flujo: **×0,85** único y documentado,
   aplicado a los flujos y a la base del terminal. Valor terminal =
   EPS del año 5 × el MISMO múltiplo de sector de la pata 2,
   descontado. Chequeo de cordura con ventas: el crecimiento de
   ganancias usado no supera el crecimiento de INGRESOS de consenso
   (tendencia de ingresos de Yahoo y/o estimación de TradingView
   contra su TTM) por más de 15 pp (`earningsDcfRevenueCapped`).
   N/m SOLO ante imposibilidad (R5): EPS de consenso ≤ 0 o desacuerdo
   de signo irresoluble entre fuentes; el activo se valúa con las
   patas restantes (R0 intacta). Calidad: crecimiento de consenso
   completo ⇒ 0,56; parcial ⇒ 0,48; respaldo (crecimiento de
   ingresos/ganancia contable o 5% por defecto) ⇒ 0,40.

**Ponderación resultante (referencia con cobertura completa):
target ~45% / múltiplos ~30% / DCF-ganancias ~25%**, modulada por la
calidad de cada pata como siempre. Esto SUSTITUYE la directiva previa
«el DCF pesa más que los múltiplos»: esa directiva suponía al DCF de
historia reportada dentro del promedio como contrapeso; en la
arquitectura nueva el rol de contrapeso conservador lo cumple el
**ancla histórica** en el escenario pesimista (abajo), y dentro del
promedio las tres patas son estimaciones hacia adelante de naturaleza
comparable.

**El ancla histórica (ex DCF de FCF).** Se sigue computando con la
misma matemática de siempre (base mediana de FCF 3–5 años de EDGAR,
con la normalización cíclica de R9-3 y el castigo al emergente de
R8/§12 — haircut ×0,75 a la base TTM — ahora INTERNOS del ancla), se
expone en la procedencia/API como `historicalAnchorValue` («valor
según historia reportada») y alimenta el escenario pesimista SOLO si
no es un outlier contra las patas vigentes: entra como valor mínimo
del pesimista únicamente si supera la mediana de las patas / 1,8 (y
queda por debajo de la menor de las patas, dentro de una banda de
cordura contra el precio): un ancla pre-inflexión no debe condenar
el escenario. **La confianza se mide sobre las tres
patas vigentes, nunca sobre el ancla**: que el DCF viejo de SIMO dé
~52 no baja su confianza si sus tres patas convergen. Consecuencia
sectorial: como la pata 3 es sobre ganancias (lógica FCFE), SÍ
aplica a financieras — un banco conserva sus tres patas; el error de
categoría era del DCF de FCF, no de un DCF de ganancias.

**TradingView como fuente adicional (directiva del usuario
2026-11-03: «de ahí los tomo yo cuando analizo»).** Se ingesta vía su
endpoint interno de scanner (`scanner.tradingview.com/america/scan`,
sin autenticación, JSON estructurado — NO es una API pública oficial:
es la ruta menos frágil disponible frente a scrapear HTML). Campos
efectivamente ingestados: EPS estimado del próximo año fiscal
(`earnings_per_share_forecast_next_fy`, fuente directa más en la
cadena de reparación del EPS — patas 2 y 3), target promedio/alto/
bajo (suma a las fuentes del target de la pata 1; la cota de no
recorte usa la UNIÓN de rangos Yahoo+TV) y estimación de ingresos del
próximo año fiscal contra el TTM reportado (chequeo de crecimiento
de la pata 3 — la app no ingería estimaciones de ingresos en ningún
cálculo hasta esta pasada). La independencia es PARCIAL (los
universos de analistas se solapan entre proveedores) y el horizonte
de TV es el próximo año fiscal según su proveedor, cercano al NTM de
Yahoo pero no idéntico: suma como fuente para promediar según la
doctrina de ampliar la muestra, sin fingir independencia total.
Degradación elegante (R0): caché 30 min, timeout corto, nunca lanza;
si TV no responde, la cadena Yahoo/Finviz valúa igual sin esa fuente.
Kill-switch: `TRADINGVIEW_ESTIMATES=off`. Brecha de campos: las
variantes de ingresos `*_fy`/`*_curr_fy` del scanner devuelven null
de forma consistente; el campo operativo es
`revenue_forecast_next_fy`.

**Corrección de la normalización de base (misma pasada).** La cadena
de reparación del EPS armoniza fuentes en distinta base (ordinaria
vs ADS) con factores enteros. La regla anterior escalaba hacia el
valor MAYOR asumiendo que era la base ADS; al sumar TradingView como
tercera fuente directa, eso escalaba la mayoría (Yahoo 10 + Finviz
10,2) hacia el outlier (TV 30). Regla vigente: la base de referencia
es la primitiva primaria (el EPS forward de Yahoo, del que se
recomputa todo ratio) y las demás fuentes se expresan en esa base en
cualquier dirección; sin primitiva primaria rige el criterio legado.

## R11 — Adenda 2026-11-03 (madrugada): el sistema forward simple — dos estimaciones y el múltiplo justificado

**Doctrina del usuario (2026-11-03 04:29, tras cinco horas de
correcciones al sistema anterior):** «para evaluar una empresa es
más importante el futuro que el pasado… aplica algo sistémico y que
no esté sujeto a subjetividades; lo más relevante son las ventas
futuras, los EPS futuros y cómo hace rendir una empresa esos
ingresos (el ROIC, ROE o similar)». Y su ejemplo rector: Micron
tiene su capacidad vendida por los próximos ~2 años — cualquier
«normalización» del EPS forward que reemplace al consenso por una
historia de ciclo queda prohibida: si el consenso forward está mal,
es problema del consenso, no licencia para que el modelo lo
reemplace. **Método elegido por el usuario (04:40): «múltiplo
forward justificado, promediado con el consenso»**, fundamentado en
la investigación guardada en
`~/workspace/research_notes/valuation-forward-simple-20261103/research.md`.

### El sistema en cinco líneas

1. El valor justo (FV) es el **promedio de dos estimaciones
   independientes, ambas 100% hacia adelante**: el target de
   consenso de los analistas y una fórmula propia.
2. La fórmula es **EPS forward de consenso × múltiplo justificado**:
   el múltiplo parte del P/E forward del sector y se ajusta por el
   crecimiento y el ROIC de la empresa contra los de su sector, con
   la fórmula del múltiplo justificado de Damodaran.
3. **Sin overrides**: nada normaliza el EPS, nada encoge el FV por
   confianza, nada converge a pisos, nada penaliza desacuerdos de
   signo. La confianza, la sospecha del modelo y el PEG son
   **etiquetas** que no tocan ningún número.
4. La cadena de reparación multifuente (R0) sigue vigente: ningún
   activo sin valuación; exclusión solo por imposibilidad
   matemática (sin EPS futuro positivo no hay fórmula: FV = target).
5. El DCF sobre ganancias **salió del promedio** (contaba el
   crecimiento dos veces) y el DCF de FCF histórico sigue fuera,
   como referencia («valor según la historia reportada»).

### Pata 1 — Target de consenso

Promedio de los targets que publican las fuentes (Yahoo —media o,
en su defecto, mediana del mismo consenso—, Finviz y TradingView):
cada fuente entra con la agregación que ella misma publica (FactSet
agrega por mediana bottom-up; Simply Wall St y Yahoo publican
promedio a 12 meses) y entre fuentes se promedia, por la doctrina
del usuario de ampliar la muestra. El componente vive **siempre
dentro del rango [low, high] de la unión de fuentes** y está
**exento de la winsorización entre patas en ambas direcciones**: la
banda anti-basura [0,25×, 3,5×] contra el promedio de las demás
patas sigue existiendo para la pata de fórmula, pero jamás puede
levantar el target sobre su máximo de consenso ni hundirlo bajo su
mínimo (era el defecto que en fase 3 dejó el target de NBIS en
86,64 contra un consenso de 283,86, y que volvía a aparecer contra
MELI cuando su fórmula colapsaba).

### Pata 2 — La fórmula: EPS forward × múltiplo justificado

El EPS es el de consenso, reparado entre fuentes (R2), jamás
reemplazado por un juicio del modelo. El múltiplo se construye con
esta escalera (la primera que computa, manda):

1. **Sector ajustado**: `M = P/E_sector × clamp(J_empresa / J_sector; 0,6; 1,6)`, donde `J` es el múltiplo justificado de
   Damodaran en su forma leading (derivación algebraica de dos
   fórmulas con fuente: el P/E justificado del modelo de Gordon,
   `P/E = Payout / (ke − g)`, con el payout implicado por el
   crecimiento sustentable, `Payout = 1 − g/R`, de la identidad
   `g = b × R`):
   `J = (1 − g/R) / (ke − g)`, con `R` = ROIC (respaldo: ROE),
   `ke` = 10% único, y `g` = crecimiento de largo plazo acotado al
   techo de estado estable de 5% (la fórmula es un objeto de estado
   estable: con `g` de corto plazo el denominador `ke − g` explota;
   Damodaran exige además `g` terminal ≤ tasa libre de riesgo).
   El lado empresa y el lado sector usan la MISMA fórmula y la
   misma fuente de datos (Finviz): del sector se toman las medianas
   de los pares grandes de su industria (P/E forward, ROIC y
   crecimiento a 5 años). Descubrimiento de pares: el screener de
   Finviz; si esa página no responde en el hosting (observado en
   producción: Finviz no la sirve a las IP del hosting aunque sí
   sirve las fichas individuales), el scanner de TradingView
   descubre los pares (industria y capitalización) y las medianas
   se siguen calculando con las fichas de Finviz — cambia quién
   nombra a los pares, no la base de medición.
2. **Sector pelado**: si el ajuste no es computable (falta ROIC o
   crecimiento de algún lado), manda el P/E forward del sector.
3. **Justificado por fundamentos propios**: sin sector, `J` de la
   empresa acotado a [3×, 45×].
4. **P/E propio recomputado** (precio ÷ EPS reparado).
5. **Tabla histórica por moat** (26/20/15): último recurso; ninguna
   fuente relevada la avala como estándar — queda solo para el modo
   degradado sin ningún dato de mercado ni de fundamentos.

**Regla de comparabilidad del sector (anti-basura, de un solo
lado):** si el P/E del sector más que **duplica** al P/E forward
propio, importar ese múltiplo inflaría la fórmula con un régimen
ajeno al activo (una memoria que cotiza a ~4× dentro del sector
amplio de semiconductores a ~21×; una madura a ~21× dentro de una
industria de software a ~52×): el sector se descarta como conjunto
comparable y la fórmula cae al peldaño 3. Cuando el sector es más
barato que el activo, su múltiplo entra igual: es la referencia
conservadora estándar de la valuación relativa y la brecha es
información, no error. Factor 2: decisión de diseño simple.

**La `g` de la fórmula** es el crecimiento de EPS a 5 años del
consenso (la fórmula la acota sola al 5% de estado estable). No se
le aplica el ancla por régimen de Grinold-Kroner: esa ancla madura
(ROIC × reinversión, con reinversión = (capex − depreciación) /
ingreso neto) subestima sistemáticamente la reinversión de las
empresas livianas en activos, cuyo gasto real de crecimiento es el
I+D que va por resultados (Damodaran: para medir esa reinversión
hay que capitalizar el I+D; sin ese ajuste, la `g` de un AAPL cae a
~0,7% y su múltiplo se deprime sin fundamento en los datos
forward). El ancla por régimen sigue gobernando el crecimiento de
Grinold-Kroner en la capa de retorno y queda como respaldo de la
fórmula cuando no hay consenso a 5 años.

### Pesos: pie de igualdad modulado por calidad medible

Target y fórmula pesan **50/50 cuando ambas descansan en datos
firmes**. La calidad de cada pata es medible, no opinada: target —
cobertura de analistas y dispersión de su rango (≥5 analistas y
dispersión ≤ 0,6 ⇒ 1,0; 3–4 ⇒ 0,8; 1–2 o fuente única sin conteo ⇒
0,45; 2+ fuentes sin conteo ⇒ 0,8); fórmula — factor EPS (≥2
proveedores directos ⇒ 1,0; 1 ⇒ 0,75; solo derivado ⇒ 0,55) ×
firmeza del múltiplo (sector ajustado ⇒ 1,0; sector pelado ⇒ 0,85;
justificado propio ⇒ 0,7; P/E propio ⇒ 0,55; tabla ⇒ 0,45). Si la
fórmula depende de datos débiles, su peso baja y el target manda.
La agregación conserva el ratio acotado [0,5×, 2×] del peso
igualitario ya desplegado.

### PEG: orientador, nunca valuador

Directiva textual del usuario: el PEG «no sirve para valuar en sí,
sino como orientador». El motor calcula y expone tres PEG (P/E ÷
crecimiento de largo plazo del consenso): al precio actual, el de
la fórmula (múltiplo justificado ÷ crecimiento) y el del sector.
Un PEG de fórmula fuera de [0,5×, 2×] el del sector levanta el flag
`pegFormulaOutlierVsSector`: marca la estimación para **revisión de
datos** y no ajusta ningún número (Easton 2004: el PEG es una
heurística sesgada a la baja, útil para mirar, no para construir
valor; la regla «PEG ≈ 1» de Lynch es práctica, no fórmula).

### Qué salió del motor con R11 (y por qué)

- **Normalización de EPS de mitad de ciclo** (disparador: yield
  forward implícito > 20%): juicio narrativo codificado; contradice
  la visibilidad forward. Eliminada por completo.
- **Shrinkage del FV por confianza** (Alta ×1,0 / Media ×0,7 / Baja
  ×0,4) en la capa de retorno: reescalaba el número por una
  etiqueta. La convergencia usa el FV tal como se publica.
- **Convergencia al piso del rango bajo `modelSuspect`**: el
  tripwire queda como flag y etiqueta de confianza, sin tocar el
  número.
- **Penalizaciones por desacuerdo de signo del EPS** (exclusión de
  la pata de ganancias, baja de escalón de confianza en RE, GK sin
  crecimiento de EPS): la reparación ya resuelve el EPS; el flag
  queda como información.
- **Haircut ×0,75 al DCF emergente y haircut de base cíclica del
  ancla**: castigos sobre la historia; el ancla usa la mediana de
  3–5 años si es positiva y si no el TTM, pelados.
- **Tope sectorial R9 y prima de moat sobre el múltiplo**: la tabla
  por moat dejó de construir el múltiplo; lo construye la fórmula
  justificada contra el sector.
- **El clamp de crecimiento de Grinold-Kroner subió de +60 a +100**:
  ataba en 7 de 19 activos reales (más de un tercio) y rankeaba él
  en vez del ancla por régimen; a +100 solo corta basura numérica.

### Parámetros y su estado

| Parámetro | Valor | Estado |
|---|---|---|
| Fórmula del múltiplo justificado `J = (1 − g/R)/(ke − g)` | Damodaran/CFA | **Con fuente** (derivación algebraica de fórmulas con fuente) |
| `ke` único | 10% | Decisión de diseño simple (la alternativa CAPM por empresa de Simply Wall St se descartó por simpleza; el promedio histórico de Morningstar, 10,5% en un documento de 2004, no es una tasa vigente) |
| Techo de `g` en la fórmula | 5% | Criterio de estado estable con fuente en el concepto (Damodaran: `g` terminal ≤ libre de riesgo); el número es decisión de diseño simple |
| Ajuste sectorial acotado | [0,6×, 1,6×] | Decisión de diseño simple (anti-basura) |
| Comparabilidad del sector | P/E sector > 2× P/E propio ⇒ no comparable | Decisión de diseño simple (anti-basura) |
| Justificado absoluto acotado | [3×, 45×] | Decisión de diseño simple |
| Pesos target/fórmula | 50/50 según calidad medible | Decisión de diseño simple (ninguna valuadora relevada promedia target con fórmula: Morningstar y Simply Wall St dan peso 0 al target dentro de su FV; aquí manda la doctrina del usuario de promediar estimaciones independientes) |
| Banda entre patas | [0,25×, 3,5×] vs promedio de las demás; target exento | Banda: mecanismo ya desplegado (R1/R9); exención del target: directiva del usuario (el target entra en su rango real, jamás recortado por las otras patas) |
| Agregación del target | La de cada fuente; promedio entre fuentes | Intra-fuente con fuente (FactSet: mediana bottom-up; SWS/Yahoo: promedio); entre fuentes: decisión de diseño simple |
| Clamp de crecimiento GK | [−30%, +100%]; clamp de RE [−50%, +80%] | Decisión de diseño simple (anti-basura; el de RE es la corrección del usuario de §15) |
| PEG outlier | Fuera de [0,5×, 2×] el del sector ⇒ flag | Decisión de diseño simple; el rol de orientador, con fuente (Easton 2004) |

### Fuentes principales (investigación completa en el research.md citado)

- Damodaran, materiales de Stern — P/E justificado desde el modelo
  de Gordon y determinantes de múltiplos (V/EBIT(1−t) en función de
  g, reinversión/ROIC y WACC): pages.stern.nyu.edu/~adamodar
  (session25slides.pdf; valpacket2and3spr19.pdf).
- FactSet / J.P. Morgan Guide to the Markets — forward P/E =
  precio ÷ EPS de consenso de los próximos 12 meses, bottom-up.
- LSEG I/B/E/S — agregación de consenso (media simple; mediana en
  FactSet).
- Simply Wall St, modelo público (GitHub: Company-Analysis-Model) —
  DCF en dos etapas con CAPM y g terminal = promedio del bono a 10
  años; el target de consenso es un chequeo separado, con peso cero
  en su FV.
- Morningstar — FV propio por DCF con fade de RONIC hacia el costo
  de capital según moat; el target no integra su FV.
- Easton (2004), «PE Ratios, PEG Ratios, and Estimating the
  Implied Expected Rate of Return on Equity Capital» (SSRN
  439764) — el PEG como heurística sesgada.

### Score (puntero)

La composición del score cambió en el mismo pase por directiva del
usuario (04:34): la capacidad de duplicar es la base del puntaje y
las demás dimensiones son ajustes acotados a ±15 puntos. Detalle en
docs/OPTIMIZER-PROFESSIONAL.md §16 y en los textos de metodología
de la app.

## R12 — Adenda 2026-11-03 (mediodía): escala honesta, vista prudente, frontera de regímenes suave y ancla de caja real

Pase aprobado por el usuario el 2026-11-03 (10:58, con agregados
del mismo día: ancla de caja 11:06, ventana TTM 11:07, ubicaciones
UI 11:13 y visibilidad de `modelSuspect` 11:14). Respaldo previo:
`respaldo-pre-vista-prudente-regimen-2026-11-03`. Tests: 284/284.
Ninguna regla de este pase cambia el valor justo; dos son de
presentación (escala y vista), una corrige la capa de retorno
(frontera de regímenes) y una agrega un reparo acotado al score
(ancla de caja). El FV de R11 queda intacto.

### 1. Escala de velocidad del score (presentación)

La recta anterior, `((RE + 5) / 40) × 100`, saturaba en 100 para
todo RE ≥ 35%: en la tabla real 7–8 activos compartían el score
máximo y el puntaje no discriminaba la parte alta. Nueva recta,
por dos anclas:

```
velocidad = clamp(((RE + 45) / 120) × 100, 0, 100)
```

RE 15% ⇒ 50 (un retorno sólido es la mitad de la escala, ancla del
usuario) y RE 75% ⇒ 100 (el máximo es excepcional). El usuario
pidió el 100 «del orden de ≥60% anual»; el segundo ancla se fijó
en 75% y no en 60% porque con 60% la banda de ajuste (±15) todavía
dejaba **tres** activos de la tabla R11 en ≥95 (MU, SIMO, NVDA) y
la aceptación del pase era «a lo sumo 1–2»: con 75% quedan 2 y
solo los retornos pegados al techo anti-basura del RE (+80%)
llegan a la zona del 100. Es calibración de presentación: no
cambia ningún RE ni ningún FV, y la propiedad anti-inversión se
mantiene (el ajuste total sigue acotado a ±15; una brecha de
velocidad > 30 puntos — ahora ≳ 36 pp de RE — no se cruza).

### 2. Vista prudente (presentación)

El Optimizador suma un conmutador «Vista: Esperada | Prudente».
En la vista prudente, cada activo se ordena y se muestra por su
escenario pesimista: el MISMO retorno triangulado de siempre,
pero con la pata de convergencia apuntando al piso de su rango
(`fvPesimista`, el escenario pesimista que el motor ya computa:
el mínimo de los componentes que formaron el FV) en vez del FV
base; GK y consenso no dependen del FV y no cambian. Pesos,
horizonte y clamp anti-basura son los mismos. El score prudente
es la velocidad del retorno prudente con el MISMO ajuste acotado.
La cartera expone su lectura prudente (`beforePessimistic`:
geométrico con el mismo arrastre de volatilidad). Si un activo
no tiene escenario pesimista válido, su retorno prudente cae al
esperado y la UI lo marca («Sin rango válido: se muestra su
retorno esperado»). La propuesta de optimización (salidas,
destinos, cartera final) sigue siendo un objeto de la vista
esperada: la prudente es otra lectura de los mismos escenarios,
no otro cálculo. Texto ⓘ: «la vista prudente ordena por lo que
pasaría si cada empresa vale lo que dice el piso de su rango;
sirve para ver qué tan bien parado queda cada activo si el
consenso está inflado». La marca de los activos sin rango
válido vive en el pie de la columna 1 en vista prudente (línea
de la vista, no de la tarjeta): «Sin rango válido (se muestran
a su retorno esperado): …» con los tickers afectados.

### 3. Frontera de regímenes suave y hacia adelante (capa de RE)

Defecto que lo motivó (crudos after-r11-4 vs after-r11-5): SIMO
pasó de régimen «crecimiento» (ancla 114,47; RE 72,6%) a «madura»
(ancla 21,97; RE 34,6%) entre dos lecturas porque el clasificador
comparaba el crecimiento de ventas TRAILING contra un interruptor
duro en +12,5% y un refresco de estimaciones lo cruzó. Dos
arreglos:

- **(a) La serie que clasifica es el crecimiento de ventas FUTURO
  de consenso** —el mismo que la pata de ganancias del motor de FV
  ya ingesta para su chequeo de ingresos: promedio de la tendencia
  de ingresos de Yahoo (earningsTrend, próximo año vs actual) y
  del pronóstico del próximo año fiscal de TradingView contra su
  TTM—. El futuro manda también acá (doctrina sistémica
  2026-11-03). Si el dato forward no está disponible para un
  activo, respaldo documentado al trailing TTM (Finviz); el
  payload expone qué serie clasificó (`growthRegimeBasis`).
- **(b) La frontera es una banda de mezcla, no un interruptor**:
  en ±5 pp alrededor del umbral de +12,5% (banda [7,5%, 17,5%]),
  el ancla mezcla linealmente el ancla de crecimiento (ventas +
  10 pp) y la sustentable (ROIC × reinversión, con su respaldo
  equity): `w = clamp((ventas − 7,5) / 10, 0, 1)`;
  `ancla = w × (ventas + 10) + (1 − w) × sustentable`. Fuera de la
  banda manda el régimen correspondiente; la etiqueta de régimen
  es «crecimiento» si w ≥ 0,5. Si no hay ancla sustentable
  calculable, rige el interruptor clásico (sin mezcla posible).
  La regla de siempre sigue: si el consenso de EPS implica menos
  crecimiento que el ancla, manda el consenso (el ancla es techo,
  nunca piso). Con esto, un refresco que mueva el input ±2 pp
  dentro de la banda mueve el RE unos pocos puntos, no decenas
  (test de estabilidad con fixtures a ambos lados del umbral
  viejo).

### 4. Ancla de caja real (reparo en el score, jamás en la valuación)

Motivación del usuario: puntuar por la evolución futura estimada
no debe desligar el score del precio y la realidad; pidió «una
pequeña ancla en base a la generación de flujos del último año».

- **Dato**: flujo de caja libre de los **últimos 12 meses
  reportados (TTM)** —precisión del usuario 11:07: su frase fue
  «del último año» y la lectura fiel es la ventana móvil, que
  captura los trimestres recientes; la ventana de año fiscal
  cerrado se descartó porque SIMO la pasaría de largo (su último
  fiscal cerró apenas positivo, ~+US$6 M, mientras su TTM quema
  caja por la acumulación de inventarios)—. Es un hecho reportado:
  no se mueve con refrescos de estimaciones. Fuente: el FCF TTM
  tal cual lo sirve Yahoo (financialData), preservado por la capa
  de datos en `freeCashflowTtmRaw` ANTES de la reparación que
  completa un TTM faltante/negativo con el flujo anual auditado
  de EDGAR (esa reparación sirve al ancla histórica del FV; acá
  pisaría exactamente el hecho que se quiere medir).
- **Marca visible** en la ficha del activo (análisis), junto a
  su resumen de valuación, con tres estados en lenguaje simple:
  «Genera caja»
  (FCF TTM > 0), «Todavía no genera caja» (FCF TTM < 0) y
  «Sin dato» / «No aplica». El FCF no aplica como métrica en
  financieras (sector o industria financieros: su materia prima
  es el dinero; caso NU) ni en cripto/caja: sin reparo y sin
  marca negativa.
- **Efecto**: si quemó caja, el ajuste del score resta
  **−6 puntos DENTRO de la banda existente de ±15** — el ajuste
  total se acota a la banda con el reparo incluido, así la
  propiedad anti-inversión se mantiene intacta (verificado por
  test con el peor índice posible + reparo: total −15, no −21)—.
  Si genera caja: 0. Sin bonus positivo jamás: el ancla solo
  resta. **No toca** el FV, ni el RE, ni el orden por duplicación
  (test de recomposición: FV y RE idénticos con y sin el ancla).
  La ausencia de dato tampoco castiga (R0).
- **Explicación**: el reparo compite como driver del ajuste con
  su empuje equivalente (−6 pts de score = −20 en unidades de
  índice); cuando es el mayor empuje y el ajuste es notable, la
  evaluación escrita lo cita, y el análisis del activo muestra
  la marca con su efecto («En el Optimizador, esta ancla le
  resta 6 puntos al score»). Texto ⓘ del score: «Si la empresa quemó
  caja en los últimos 12 meses reportados, el score le resta
  unos puntos: es un ancla en la realidad frente a las promesas
  de crecimiento. No cambia su valor justo ni su retorno
  estimado.»

### 5. Visibilidad de señales que el sistema ya computaba

Agregado del usuario tras verificarlo contra el código (11:13 y
11:14): la bandera **`modelSuspect`** existía en el motor y en el
payload desde R9, pero la UI no la renderizaba en ningún lado.
Desde este pase, el análisis del activo muestra la advertencia
«Estimación a revisar» cuando la bandera está activa, con su
motivo junto a la marca: «las fuentes de este activo se
contradicen entre sí». Sin cambio de cálculo: es hacer visible
una señal existente.

**Corrección de superficies (usuario, 11:21) — SUPERSEDE las
ubicaciones pedidas a las 11:13 y 11:19.** Textual: «Esas
explicaciones deberían estar en el análisis del activo, no
sobrecargues la tarjeta en el optimizador. La idea es que vea
ese ranking y haga clic en el activo si lo quiero analizar en
profundidad.» Diseño vigente: la tarjeta del Optimizador no
suma ninguna línea ni marca nueva (queda con su contenido de
siempre: nombre, sector, peso, score, estrellas y chip de
duplicación; las tarjetas ya navegan al análisis, comportamiento
existente); TODAS las marcas y explicaciones nuevas de este
pase —ancla de caja con su efecto en el score, estimación a
revisar con su motivo, nota de confianza y medidor de
expectativas— viven en el análisis del activo, junto a su
resumen de valuación. Los datos viajan igual en el payload del
Optimizador para la metodología y la ficha.

### 6. Capa de información visible (agregados del usuario, 11:19)

Dos piezas que solo MUESTRAN datos que el sistema ya tiene, sin
alimentar ningún cálculo (la misma disciplina que el PEG
orientador):

- **Nota de confianza junto al tiempo del activo**: la etiqueta
  de confianza de la valuación (Alta/Media/Baja, que el motor
  computa por la dispersión entre las patas del FV) se muestra
  en el análisis del activo, junto a su figura de tiempo y
  retorno anualizado de la ficha («Confianza de esta valuación:
  … — es la fe que el propio sistema le tiene a este tiempo de
  corrección»). Nada nuevo se computa: la etiqueta existente,
  donde se analiza en profundidad. (La ubicación original en el
  chip de duplicación de la tarjeta quedó supersedida por la
  corrección de superficies de §5.)
- **Medidor de expectativas (ficha del activo)**: el par «PER
  actual: X× (ganancias reportadas, últimos 12 meses) · PER
  futuro: Y× (ganancias que el consenso espera)», ambos
  recomputados desde primitivas — precio ÷ EPS trailing
  reportado (TTM, Yahoo `trailingEps`) y precio ÷ EPS forward de
  consenso (el mismo que usó la pata de fórmula del FV, expuesto
  por su procedencia) — nunca del P/E publicado por el proveedor.
  Si el EPS trailing es ≤ 0, el estado honesto es «sin ganancias
  todavía» y no se muestra PER actual. **Brecha extrema**: PER
  futuro < 40% del PER actual, con PER actual > 15× (umbral:
  ejemplo del usuario adoptado como decisión de diseño simple)
  ⇒ marca breve «Mucho futuro ya está en el precio». Texto ⓘ:
  «Si el PER futuro es mucho más bajo que el actual, el precio
  de hoy ya está pagando un salto de ganancias que la empresa
  todavía tiene que ejecutar: vender más, facturar más y operar
  con eficiencia. Cuanto más grande es la brecha, más de ese
  futuro ya está dado por hecho en el precio.» El medidor vive
  solo en la ficha: por la corrección de superficies de §5, la
  tarjeta del Optimizador no suma líneas (brecha resuelta por
  diseño, no omisión silenciosa).

### Parámetros de R12 y su procedencia

| Parámetro | Valor | Procedencia |
|---|---|---|
| Ancla baja de velocidad | RE 15% ⇒ 50 pts | Directiva del usuario (2026-11-03) |
| Ancla alta de velocidad | RE 75% ⇒ 100 pts | Decisión de diseño simple (el usuario pidió «del orden de ≥60%»; con 60% la aceptación de ≤2 activos ≥95 no se cumplía sobre la tabla R11) |
| Banda de mezcla de regímenes | ±5 pp sobre 12,5% | Ejemplo del usuario («p. ej. ±5 pp»), adoptado |
| Serie clasificadora del régimen | Ventas futuras de consenso; respaldo trailing | Directiva del usuario (el futuro manda) + R0 para el respaldo |
| Ventana del ancla de caja | Últimos 12 meses reportados (TTM) | Precisión del usuario (2026-11-03 11:07) |
| Reparo del ancla de caja | −6 pts, dentro de la banda ±15 | Diseño aprobado por el usuario (2026-11-03 11:06) |
| Texto de la advertencia de fuentes | «Estimación a revisar» | Elección de redacción del pase, aprobada como familia por el usuario (11:14) |
| Umbral de brecha extrema del medidor PER | forward < 40% del actual y actual > 15× | Ejemplo del usuario (11:19), adoptado como decisión de diseño simple |

