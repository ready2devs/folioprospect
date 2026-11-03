/** Textos de metodología del Optimizador (íconos ⓘ y sección «Cómo se calcula»). */
export const METHODOLOGY: Record<string, { title: string; body: string }> = {
  score: {
    title: 'Score de inversión (0–100)',
    body: 'Ponderación de cinco factores sin doble conteo: 30% velocidad (retorno esperado: a mayor retorno, menos años para duplicar), 25% oportunidad de precio contra su valor justo ajustado por confianza, 20% calidad (ROIC, márgenes y foso competitivo), 15% confianza de la valuación (cuántos métodos independientes sostienen el valor justo y con qué dispersión) y 10% riesgo (volatilidad y deuda). Las estrellas son el mismo ranking de oportunidad de la ficha.',
  },
  retorno: {
    title: 'Retorno esperado anual',
    body: 'Triangulación de tres métodos, como recomiendan las fuentes institucionales de expectativas de capital (CMA): 45% Grinold-Kroner (rendimiento por dividendos + recompra neta de acciones + crecimiento de ganancias totales + repricing del múltiplo hacia la mediana de su industria), 35% convergencia al Fair Value propio de la app en ~3 años y 20% consenso de analistas a 1 año. La convergencia no usa el valor justo crudo: con confianza Alta o Media la brecha hasta el precio se reconoce en proporción a la confianza (100% / 70%); con confianza Baja no se anualiza un porcentaje del número puntual: se converge al piso del rango de valuación publicado por el propio motor (o a solo el 25% de la brecha si no hay rango), porque una valuación frágil no puede prometer el mismo retorno que una sólida. El retorno final además tiene tope según la confianza: Alta +35%, Media +28%, Baja +18% anual (piso −15%). Y si las fuentes del EPS forward discrepan en el signo (consenso en break-even), la confianza que usa este cálculo baja un escalón más y Grinold-Kroner solo cree el crecimiento de ingresos, no el de ganancias. Si falta un método, los pesos se renormalizan: nunca se rellena un dato. A nivel cartera se usa el retorno geométrico: al promedio ponderado se le resta el arrastre de volatilidad (σ²/2).',
  },
  duplicar: {
    title: 'Años para duplicar inversión',
    body: 'Años = ln(2) / ln(1 + retorno esperado). Es la Regla del 72 exacta: con 10,4% anual duplicás en ~7 años. Si el retorno esperado es cero o negativo, el activo «no duplica». Los colores son bandas de tiempo: verde intenso <3 años, verde 3–5, lima 5–7, amarillo 7–10, naranja 10–15, rojo >15.',
  },
  riesgo: {
    title: 'Riesgo (volatilidad anual)',
    body: 'Volatilidad histórica anualizada de cada activo (serie de precios de 1 año; si falta, se estima desde el beta). La volatilidad de la cartera combina pesos, volatilidades y correlaciones típicas por bloque (misma industria 0,65 · mismo sector 0,55 · entre sectores 0,45 · cripto 0,25–0,70). La descomposición de Euler reparte el riesgo total: cada activo tiene su contribución marginal (MCTR) y su % del riesgo total (PCTR); el ranking retorno excedente por unidad de riesgo ordena qué sale primero.',
  },
  extracciones: {
    title: 'Cómo se eligen las salidas',
    body: 'Criterio profesional, en orden: (0) TESIS DETERIORADA: dos o más señales medibles combinadas (EPS forward ≤ 0, consenso que espera caída de ganancias, dilución neta > 10% anual según EDGAR, flujo de caja libre mediano ≤ 0 sin crecimiento que lo justifique, o valor justo sostenido por un único método con confianza baja) → salida total o parcial según la gravedad, fuera del tope de extracción; una sola señal deja la posición en vigilancia, sin tocarla. Después, las reglas de rebalanceo: (1) precio 10%+ por encima de su valor justo y score bajo → salida total; (2) par de la misma industria con score ≥ +15 y retorno ≥ +3 pp → reemplazo sectorial; (3) score bajo → salida; (4) posición que supera el 12% de la cartera → recorte hasta ese tope (decisión de riesgo, no de retorno); (5) retorno esperado menor a 8% y muy por debajo de la mediana, con score <55 → reducción del 50%. Si el conjunto de rotaciones por reglas mejora el retorno menos de 0,25 pp, se retira y la salida es «sin mejora»: no se opera por ruido. CINTURÓN DE BALANCES: si una posición presenta balance dentro de los próximos 5 días hábiles, no se propone ni su venta ni su compra: la decisión se difiere al examen y queda listada como pendiente. Los fondos liberados solo van a destinos que superan el listón (score ajustado ≥ 65, valor justo de al menos dos métodos, valor justo no mayor a 3× el precio, sin rol defensivo y sin balance próximo); lo que no encuentra destino queda en efectivo deliberado. Las posiciones defensivas nunca reciben fondos de optimización y solo salen parciales salvo deterioro grave; las de candado y la cripto no se tocan. Tope de extracción por reglas: 15% de la cartera (no aplica a tesis ni a tus ventas manuales). Montos netos de tu comisión de venta configurada. Con «Obtener más fondos» podés sumar efectivo nuevo o ventas manuales de cualquier posición sin candado y aceptar sugerencias automáticas.',
  },
  burbujas: {
    title: 'Gráfico riesgo / beneficio',
    body: 'Cada burbuja es una posición: eje X = riesgo (volatilidad anual), eje Y = beneficio (retorno esperado anual), tamaño = peso en la cartera, color = banda de años para duplicar. Los rombos son los promedios de cartera (riesgo = volatilidad combinada, beneficio = retorno geométrico). La estrategia se presenta como válida solo si el beneficio nuevo supera al anterior Y el riesgo nuevo es similar o menor (tolerancia +1 pp).',
  },
  evaluacion: {
    title: 'Evaluación automática',
    body: 'Texto generado por el motor del Optimizador desde códigos de motivo estructurados, con la estructura de la nota de un profesional de portafolios: situación y núcleo que se mantiene (y por qué), salidas y recortes con su motivo en lenguaje llano, destinos con su motivo, caja deliberada si la hay, y exámenes de balance próximos que pueden cambiar el plan, con fechas. Cada afirmación está atada a un dato del motor. Son estimaciones con datos públicos: no es asesoramiento financiero.',
  },
};
