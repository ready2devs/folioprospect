/** Textos de metodología del Optimizador (íconos ⓘ y sección «Cómo se calcula»). */
export const METHODOLOGY: Record<string, { title: string; body: string }> = {
  score: {
    title: 'Score de inversión (0–100)',
    body: 'Ponderación de cuatro factores: 50% velocidad (retorno esperado: a mayor retorno, menos años para duplicar), 25% oportunidad de precio contra su valor justo (las bandas de la ficha del activo), 15% calidad (ROIC, márgenes y foso competitivo) y 10% riesgo (volatilidad y deuda). Las estrellas son el mismo ranking de oportunidad de la ficha.',
  },
  retorno: {
    title: 'Retorno esperado anual',
    body: 'Triangulación de tres métodos, como recomiendan las fuentes institucionales de expectativas de capital (CMA): 45% Grinold-Kroner (rendimiento por dividendos + recompra neta de acciones + crecimiento de ganancias totales + repricing del múltiplo hacia la mediana de su industria), 35% convergencia al Fair Value propio de la app en ~3 años y 20% consenso de analistas a 1 año. Si falta un método, los pesos se renormalizan: nunca se rellena un dato. El rango final se acota entre −15% y +35% anual. A nivel cartera se usa el retorno geométrico: al promedio ponderado se le resta el arrastre de volatilidad (σ²/2).',
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
    body: 'Reglas, en orden: (1) precio 10%+ por encima de su valor justo y score bajo → salida total; (2) existe un par de la misma industria con score ≥ +15 y retorno ≥ +3 pp → reemplazo sectorial; (3) score bajo → salida; (4) una posición que supera el 12% de la cartera se recorta hasta ese tope; (5) retorno esperado menor a 8% y muy por debajo de la mediana, con score <55 → reducción del 50%. Las posiciones defensivas (contrapeso de la cartera) tienen umbral más exigente (score <30) y solo salen parciales; las de candado y la cripto no se tocan. Tope total de extracción: 15% de la cartera. Montos netos de tu comisión de venta configurada.',
  },
  burbujas: {
    title: 'Gráfico riesgo / beneficio',
    body: 'Cada burbuja es una posición: eje X = riesgo (volatilidad anual), eje Y = beneficio (retorno esperado anual), tamaño = peso en la cartera, color = banda de años para duplicar. Los rombos son los promedios de cartera (riesgo = volatilidad combinada, beneficio = retorno geométrico). La estrategia se presenta como válida solo si el beneficio nuevo supera al anterior Y el riesgo nuevo es similar o menor (tolerancia +1 pp).',
  },
  evaluacion: {
    title: 'Evaluación automática',
    body: 'Texto generado por el motor del Optimizador a partir de los números de tu cartera (concentración, riesgo por Euler, scores y rotaciones propuestas), con el criterio de un asesor: situación actual, concentración sectorial, si se puede bajar el riesgo manteniendo el beneficio y palancas de mejora. Son estimaciones con datos públicos: no es asesoramiento financiero.',
  },
};
