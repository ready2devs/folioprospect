import { OPPORTUNITY_BANDS, type UncertaintyLevel } from '@shared/engine/opportunity';
import { fmtLocal, fmtSignedPct } from './opportunitySeed';

/**
 * Textos de explicación de la ficha de oportunidad (pedido del dueño,
 * 2026-11-14): que cualquier número de la ficha se pueda entender
 * DENTRO de la app, tocando un ⓘ, sin salir a preguntar afuera.
 *
 * Funciones puras: arman la línea de escenarios con sus porcentajes
 * y los cuerpos de los popovers desde los datos reales de la ficha.
 * NO calculan valuación: describen, con las definiciones reales del
 * motor, lo que los números ya mostrados representan.
 *
 * Definiciones que estos textos reflejan (verificadas en el motor):
 *  - El Fair Value base es el promedio ponderado de las patas que lo
 *    componen: la mediana de los precios objetivo de los analistas y
 *    las ganancias futuras esperadas × múltiplo justificado por sector
 *    (las que apliquen según el activo).
 *  - El escenario pesimista es la MENOR de esas patas y el optimista
 *    la MAYOR (el piso y el techo del rango del motor): no son un
 *    escenario de crisis ni de euforia.
 *  - El veredicto compara precio contra escenarios con umbrales
 *    fijos (ver computeOpportunity en shared/engine/opportunity.ts).
 */

export type ScenarioExplainKey = 'pesimista' | 'base' | 'optimista';

export interface ScenarioUpside {
  key: ScenarioExplainKey;
  label: string;
  value: number;
  /** Upside del escenario contra el precio de hoy, en % (puede ser negativo). */
  pct: number;
}

const SCENARIO_DEFS: { key: ScenarioExplainKey; label: string }[] = [
  { key: 'pesimista', label: 'Pesimista' },
  { key: 'base', label: 'Base' },
  { key: 'optimista', label: 'Optimista' },
];

const validValue = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) && v > 0 ? v : null;

/**
 * Los tres escenarios con su % contra el precio de hoy. Omite el
 * escenario cuyo valor no sea válido; si el precio no es válido,
 * no hay línea (lista vacía).
 */
export function scenarioUpsides(
  price: number,
  fvPesimista: number,
  fvBase: number,
  fvOptimista: number
): ScenarioUpside[] {
  if (validValue(price) == null) return [];
  const values: Record<ScenarioExplainKey, number> = {
    pesimista: fvPesimista,
    base: fvBase,
    optimista: fvOptimista,
  };
  const out: ScenarioUpside[] = [];
  for (const d of SCENARIO_DEFS) {
    const v = validValue(values[d.key]);
    if (v == null) continue;
    out.push({ key: d.key, label: d.label, value: v, pct: (v / price - 1) * 100 });
  }
  return out;
}

/** «Pesimista US$ 18 (+36%) · Base US$ 22 (+64%) · Optimista US$ 25 (+87%)». */
export function formatScenarioUpsides(items: ScenarioUpside[]): string {
  return items
    .map((i) => `${i.label} US$ ${fmtLocal(i.value, 0)} (${fmtSignedPct(i.pct, 0)})`)
    .join(' · ');
}

/**
 * Qué pata del Fair Value es la menor en ESTE activo (la que queda
 * como escenario pesimista):
 *  - 'target': la mediana de los precios objetivo de los analistas.
 *  - 'multiples': las ganancias futuras × múltiplo.
 *  - 'single': el FV salió de una sola pata (la otra no se pudo
 *    calcular), así que pesimista = base = optimista de esa pata.
 *  - 'tie': las dos patas casi coinciden (diferencia ≤ 2%).
 *  - null: no se pudo identificar con los datos disponibles (el
 *    texto del popover queda genérico).
 */
export type LowestFvLeg = 'target' | 'multiples' | 'single' | 'tie';

export function lowestFvLeg(
  fvPesimista: number,
  legs: { target?: number | null; multiples?: number | null }
): LowestFvLeg | null {
  const t = validValue(legs.target);
  const m = validValue(legs.multiples);
  if (t == null && m == null) return null;
  if (t == null || m == null) return 'single';
  const lo = Math.min(t, m);
  const hi = Math.max(t, m);
  if (hi - lo <= hi * 0.02) return 'tie';
  if (validValue(fvPesimista) == null) return null;
  // El pesimista debería ser la pata menor: se acepta una tolerancia
  // del 3% porque el rango del motor usa los valores crudos de las
  // patas y el promedio puede llevar recortes (winsorización).
  if (Math.abs(lo - fvPesimista) > Math.max(hi * 0.03, 0.05)) return null;
  return t <= m ? 'target' : 'multiples';
}

/** Título y cuerpo del ⓘ de la línea de escenarios. */
export function scenarioExplainer(
  leg: LowestFvLeg | null,
  legValue?: number | null
): { title: string; body: string } {
  const legUsd = legValue != null && Number.isFinite(legValue) && legValue > 0
    ? ` (US$ ${fmtLocal(legValue, 0)})`
    : '';
  let legSentence = '';
  if (leg === 'target') {
    legSentence = ` En este activo, la estimación menor —la que queda como escenario pesimista— es la mediana de los precios objetivo de los analistas${legUsd}.`;
  } else if (leg === 'multiples') {
    legSentence = ` En este activo, la estimación menor —la que queda como escenario pesimista— es la valuación por ganancias futuras${legUsd}.`;
  } else if (leg === 'single') {
    legSentence =
      ' En este activo el valor justo sale de una sola estimación (la otra no se pudo calcular), por eso los escenarios quedan pegados entre sí.';
  } else if (leg === 'tie') {
    legSentence =
      ' En este activo las dos estimaciones casi coinciden, por eso los tres escenarios quedan muy cerca entre sí.';
  }
  return {
    title: 'Los tres escenarios del Fair Value',
    body:
      'El valor justo sale de promediar dos estimaciones independientes que miran hacia adelante: ' +
      '(1) la mediana de los precios objetivo de los analistas y (2) las ganancias futuras que espera el ' +
      'consenso, multiplicadas por el múltiplo que la empresa se merece. El escenario BASE es ese ' +
      'promedio. El PESIMISTA es simplemente la MENOR de las dos estimaciones y el OPTIMISTA, la ' +
      'MAYOR: son el piso y el techo del rango, no un escenario de crisis ni de euforia. El ' +
      'porcentaje junto a cada escenario es cuánto tendría que subir el precio de hoy para llegar ' +
      'a ese valor (si es negativo, cuánto tendría que bajar).' +
      legSentence,
  };
}

/** Título y cuerpo del ⓘ del veredicto: la regla textual completa. */
export function verdictExplainer(): { title: string; body: string } {
  return {
    title: 'Cómo se decide el veredicto',
    body:
      'Es una regla mecánica que compara el precio de hoy con los escenarios del valor justo ' +
      '(no mira noticias ni el resto de tu cartera): COMPRA FUERTE si hasta el escenario ' +
      'pesimista supera al precio por más de +20% —hay colchón aun con la estimación más baja—. ' +
      'COMPRAR DE A POCO si el escenario base deja +30% o más de recorrido, pero el pesimista no ' +
      'deja ese colchón. MANTENER si el recorrido hasta el base es chico (entre −10% y +30%): no ' +
      'alcanza para comprar con convicción, pero tampoco sobran motivos para vender. VENDER si ' +
      'el precio ya está por encima del valor justo base.',
  };
}

/** Título y cuerpo del ⓘ del ranking, con las bandas de la incertidumbre elegida. */
export function rankingExplainer(uncertainty: UncertaintyLevel): { title: string; body: string } {
  const b = OPPORTUNITY_BANDS[uncertainty];
  const pct = (r: number) => fmtLocal(r * 100, 0) + '%';
  return {
    title: 'Ranking de oportunidad: qué mide',
    body:
      'Compara el precio de hoy con el Fair Value del escenario elegido: cuanto más barato está ' +
      'el precio frente a ese valor, más estrellas y más puntaje (0 a 100). La exigencia depende ' +
      `de la incertidumbre elegida (${uncertainty}): 5★ si el precio es hasta el ${pct(b[0])} del ` +
      `valor justo; 4★ hasta el ${pct(b[1])}; 3★ hasta el ${pct(b[2])}; 2★ hasta el ${pct(b[3])}; ` +
      'por encima de eso, 1★. A mayor incertidumbre, más descuento se exige para dar las mismas ' +
      'estrellas. El «rango posible» recalcula las estrellas y el puntaje con los escenarios ' +
      'pesimista y optimista: cuánto cambiaría el ranking si mandara la estimación más baja o ' +
      'la más alta.',
  };
}

/** Título y cuerpo del ⓘ de la incertidumbre (complementa el texto fijo visible). */
export function uncertaintyExplainer(): { title: string; body: string } {
  return {
    title: 'Incertidumbre: la vara del ranking',
    body:
      'No cambia el Fair Value: cambia cuánto descuento exige el ranking antes de dar ' +
      'estrellas. La estima el motor según cuánto se mueve la acción frente al mercado (su ' +
      'beta): Low = se mueve poco y es predecible; Medium = intermedia; High = se mueve mucho; ' +
      'Very High y Extreme = muy volátil o impredecible. Podés cambiarla en «Datos de la ' +
      'ficha»: el ranking se recalcula en vivo, sin tocar el valor justo.',
  };
}
