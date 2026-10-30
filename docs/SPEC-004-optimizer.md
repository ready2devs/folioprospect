# SPEC-004 — Optimizador de cartera (2026-10-30)

Sección nueva (pensada para monetización futura), aprobada por el usuario tras
mock visual de escritorio y móvil. Principio rector: **minimalista y práctico** —
el usuario ve resultados (score, años para duplicar, montos), no cálculos; la
metodología vive en íconos ⓘ y en la sección plegable «Cómo se calcula».

## Metodología (el mix final)

- **Retorno Esperado (RE) por activo** = 45% Grinold-Kroner (dividendo +
  recompra neta − dilución − crecimiento de ganancias TOTALES con fade
  institucional hacia 6% nominal + repricing del P/E a la mediana de la
  industria, ±5 pp) + 35% convergencia al Fair Value propio (3 años) + 20%
  consenso de analistas a 1 año. Pesos renormalizados si falta un método;
  RE acotado [−15%, +35%]. Gordon (D/P+g) como piso de cordura informativo.
- **Años para duplicar** = ln2/ln(1+RE). A nivel cartera, RE geométrico
  (ponderado − σ²/2).
- **Score 0–100** = 50% velocidad + 25% oportunidad Precio/FV + 15% calidad
  (ROIC/márgenes/moat) + 10% riesgo (volatilidad/deuda).
- **Riesgo**: volatilidad realizada 1 año blend con beta (tope 75%); matriz de
  correlaciones por bloques; descomposición de Euler (MCTR/PCTR) para desempatar
  salidas y validar swaps.
- **Salidas por reglas** (no Markowitz en v1): veredicto vender FV+score,
  reemplazo por par de la misma industria (screener Finviz, score ≥ +15 y
  RE ≥ +3 pp), score bajo, concentración >12%, bajo retorno (<8% y score <55).
  Defensivas (AAPL/VIST): umbral score <30 y solo parcial. Candado: SOL.
  Cripto fuera del score y de las ventas automáticas. Tope de extracción 15%.
  Montos netos de la comisión de venta configurada (0,5%).
- **Reaplicación**: ∝ score² entre pares de reemplazo y posiciones propias con
  score ≥70, topes: posición ≤12%, posición nueva ≤5%.
- **Veredicto visible** (regla del usuario): la estrategia es «válida» solo si
  el beneficio (RE geométrico) sube y el riesgo es similar o menor (+1 pp de
  tolerancia); si no, «evaluar» o «sin mejora» con el texto correspondiente.
- **Evaluación automática**: narrativa generada desde los números (situación,
  concentración sectorial, riesgo por Euler, palancas de mejora, veredicto)
  con tono de asesor, arriba de todo.

## Implementación

- Motor puro `shared/engine/optimizer.ts` (+16 tests; suite total 100/100).
- Servidor: `server/optimizerData.ts` + `GET /api/portfolios/:id/optimizer`
  (Yahoo + Finviz, pares por industria, caché 15 min; devuelve resultado,
  inputs y pares para recalcular en el cliente al desactivar movimientos).
- Cliente: `src/components/optimizer/` (OptimizerView, OptimizerCharts,
  InfoTip, methodology). Estado `rightState: 'optimizer'`; TopBar suma el
  botón «Optimizador»; en móvil el botón **Optimizer reemplaza a +Operar**
  (operar sigue dentro de Cartera) y la vista va por pasos 1 Hoy · 2 Fondos ·
  3 Final.
- Gráficos SVG propios: evolución (horizontes 1/3/5/10/20, banda P10–P90
  lognormal, línea 2×, toggle Actual/Optimizada/Comparar) y burbujas
  riesgo/beneficio (toggle Anterior/Nuevo/Comparar, promedios rombo, veredicto).

## Limitaciones conocidas v1

- ΔS (dilución/recompra) sin fuente gratuita confiable: componente en 0,
  declarado en la metodología. Casos como NBIS (dilución alta) quedan
  sobrevaluados por el motor hasta conseguir esa serie.
- Correlaciones por bloques asumidas (no matriz histórica completa); la
  optimización media-varianza completa (PyPortfolioOpt/Riskfolio-Lib) queda
  para un «modo avanzado» v2.
- La cartera local de desarrollo es la semilla del repo (20 posiciones); en
  producción corre sobre la cartera real sincronizada.

## «Obtener más fondos» (2026-10-30)

La columna de obtención de fondos permite seguir extrayendo más allá de las
reglas automáticas, sin tocar candados ni cripto:

- **Venta manual**: cualquier posición vigente sin candado, por el monto en US$
  que el usuario escriba (acotado al saldo). Es decisión explícita: no consume
  el tope de extracción automática (15%) y reemplaza a las reglas sobre ese
  activo. Opciones del motor: `manualExtractions: {symbol, amountUsd}[]`.
- **Efectivo nuevo**: suma fondos sin vender (tarjeta «EFECTIVO · Fondos
  nuevos», sin comisión; aumenta el total final). Opción: `extraCashUsd`.
- **Sugerencias automáticas**: el motor devuelve `suggestionCandidates` —
  posiciones restantes (no extraídas, no cripto, sin candado) ordenadas por
  menor eficiencia retorno/riesgo (Euler), defensivas al final, score y retorno
  como desempate. La UI ofrece de a una («Usar esta sugerencia» / «Ver otra»);
  aceptar una la convierte en extracción parcial del 50% (opción
  `acceptedSuggestions: ticker[]`).

Las tarjetas manuales/sugeridas se quitan con «Quitar» (sin toggle); las
automáticas conservan el toggle Activo/Desactivado.
