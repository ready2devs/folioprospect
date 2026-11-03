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
