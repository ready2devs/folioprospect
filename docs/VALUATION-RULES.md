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
