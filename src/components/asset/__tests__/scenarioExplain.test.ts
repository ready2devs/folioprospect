import { describe, it, expect } from 'vitest';
import {
  formatScenarioUpsides,
  lowestFvLeg,
  rankingExplainer,
  scenarioExplainer,
  scenarioUpsides,
  uncertaintyExplainer,
  verdictExplainer,
} from '../scenarioExplain';

/**
 * Explicaciones de la ficha (pedido del dueño 2026-11-14): la línea
 * de escenarios con % y los textos de los popovers ⓘ. El caso NU es
 * el que disparó el pedido: precio 13,22, pesimista 17,94 (el target
 * de analistas, la pata menor), base 21,63, optimista 24,77.
 */
describe('scenarioUpsides — % de cada escenario contra el precio de hoy', () => {
  it('caso NU: los tres escenarios con su upside', () => {
    const items = scenarioUpsides(13.22, 17.94, 21.63, 24.77);
    expect(items.map((i) => i.key)).toEqual(['pesimista', 'base', 'optimista']);
    expect(items[0].pct).toBeCloseTo(35.7, 0);
    expect(items[1].pct).toBeCloseTo(63.6, 0);
    expect(items[2].pct).toBeCloseTo(87.4, 0);
  });

  it('la línea formateada es la que ve el dueño por defecto', () => {
    const line = formatScenarioUpsides(scenarioUpsides(13.22, 17.94, 21.63, 24.77));
    expect(line).toBe('Pesimista US$ 18 (+36%) · Base US$ 22 (+64%) · Optimista US$ 25 (+87%)');
  });

  it('escenario por debajo del precio: % negativo con signo −', () => {
    const items = scenarioUpsides(100, 80, 110, 130);
    expect(items[0].pct).toBeCloseTo(-20, 5);
    expect(formatScenarioUpsides(items)).toContain('Pesimista US$ 80 (−20%)');
  });

  it('omite el escenario sin valor válido sin romper la línea', () => {
    const items = scenarioUpsides(50, NaN, 60, 0);
    expect(items.map((i) => i.key)).toEqual(['base']);
    expect(formatScenarioUpsides(items)).toBe('Base US$ 60 (+20%)');
  });

  it('sin precio válido no hay línea', () => {
    expect(scenarioUpsides(0, 10, 12, 15)).toEqual([]);
    expect(scenarioUpsides(NaN, 10, 12, 15)).toEqual([]);
    expect(formatScenarioUpsides([])).toBe('');
  });
});

describe('lowestFvLeg — qué pata es la menor en este activo', () => {
  it('NU: la menor es el target de analistas', () => {
    expect(lowestFvLeg(17.94, { target: 17.95, multiples: 24.77 })).toBe('target');
    expect(lowestFvLeg(17.94, { target: 24.77, multiples: 17.9 })).toBe('multiples');
  });

  it('una sola pata disponible → single', () => {
    expect(lowestFvLeg(20, { target: 20, multiples: null })).toBe('single');
    expect(lowestFvLeg(20, { target: null, multiples: 20 })).toBe('single');
  });

  it('patas casi coincidentes → tie', () => {
    expect(lowestFvLeg(20, { target: 20, multiples: 20.3 })).toBe('tie');
  });

  it('sin patas o pesimista que no coincide con la menor → null (texto genérico)', () => {
    expect(lowestFvLeg(18, { target: null, multiples: null })).toBeNull();
    expect(lowestFvLeg(10, { target: 18, multiples: 25 })).toBeNull();
  });
});

describe('textos de los popovers — honestidad de las definiciones', () => {
  it('escenarios: pesimista = la menor de las estimaciones, NO crisis', () => {
    const { title, body } = scenarioExplainer('target', 17.95);
    expect(title).toBe('Los tres escenarios del Fair Value');
    expect(body).toContain('la MENOR de las dos estimaciones');
    expect(body).toContain('no un escenario de crisis ni de euforia');
    expect(body).toContain('cuánto tendría que subir el precio de hoy');
    // Frase específica del activo: la pata menor es el target.
    expect(body).toContain('es la mediana de los precios objetivo de los analistas (US$ 18)');
  });

  it('escenarios: con pata de múltiplos menor, la frase nombra las ganancias futuras', () => {
    const { body } = scenarioExplainer('multiples', 30);
    expect(body).toContain('es la valuación por ganancias futuras (US$ 30)');
  });

  it('escenarios: sin identificación de pata, el cuerpo queda genérico (sin frase del activo)', () => {
    const { body } = scenarioExplainer(null);
    expect(body).not.toContain('En este activo');
    expect(body).toContain('la MENOR de las dos estimaciones');
  });

  it('veredicto: la regla completa con sus umbrales', () => {
    const { body } = verdictExplainer();
    expect(body).toContain('COMPRA FUERTE');
    expect(body).toContain('más de +20%');
    expect(body).toContain('COMPRAR DE A POCO');
    expect(body).toContain('+30% o más');
    expect(body).toContain('MANTENER');
    expect(body).toContain('entre −10% y +30%');
    expect(body).toContain('VENDER');
    expect(body).toContain('por encima del valor justo base');
  });

  it('ranking: bandas de la incertidumbre elegida en lenguaje simple', () => {
    const { body } = rankingExplainer('Medium');
    // Bandas Medium: [0.70, 0.90, 1.10, 1.30]
    expect(body).toContain('5★ si el precio es hasta el 70% del valor justo');
    expect(body).toContain('4★ hasta el 90%');
    expect(body).toContain('3★ hasta el 110%');
    expect(body).toContain('2★ hasta el 130%');
    expect(body).toContain('rango posible');
    const low = rankingExplainer('Low').body;
    expect(low).toContain('5★ si el precio es hasta el 80% del valor justo');
  });

  it('incertidumbre: aclara que no toca el Fair Value y que se puede cambiar', () => {
    const { body } = uncertaintyExplainer();
    expect(body).toContain('No cambia el Fair Value');
    expect(body).toContain('Datos de la ficha');
  });
});
