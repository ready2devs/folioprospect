import type { AssetDetailResponse } from '@/api';
import {
  normalizeUncertainty,
  type MoatLevel,
  type ScenarioKey,
  type UncertaintyLevel,
} from '@shared/engine/opportunity';

/** Estado editable de la ficha de Evaluación de oportunidad (formulario). */
export interface OpportunityFormState {
  name: string;
  ticker: string;
  price: string;
  years: string;
  fvPes: string;
  fvBase: string;
  fvOpt: string;
  scenario: ScenarioKey;
  uncertainty: UncertaintyLevel;
  moat: MoatLevel;
  moatDesc: string;
  mcap: string;
  divYield: string;
  consAvg: string;
  consMin: string;
  consMax: string;
  consBull: string;
  consNeu: string;
  consBear: string;
  // Resumen de la empresa
  rSymbol: string;
  rExchange: string;
  rFounded: string;
  rIpo: string;
  rCeo: string;
  rEmployees: string;
  rSector: string;
  rIndustry: string;
  rHq: string;
  core: string;
  /** ¿Qué distingue a la empresa? Foso / moat / ventaja competitiva frente al sector (editable). */
  edge: string;
  /** Opcionalidad: negocios o apuestas que todavía no pesan en el precio (editable). */
  optionality: string;
  // Lecturas simples a favor / en contra (editables)
  persp1Title: string;
  persp1Fav: string;
  persp1Con: string;
  persp2Title: string;
  persp2Fav: string;
  persp2Con: string;
  persp3Title: string;
  persp3Fav: string;
  persp3Con: string;
  verdictDetail: string;
  /** Nota de procedencia de los datos precargados (fuente/fecha), visible en la ficha. */
  seedNote: string;
}

const num = (v: number | null | undefined, dec = 2): string =>
  v != null && Number.isFinite(v) && v > 0 ? v.toFixed(dec) : '';

const int = (v: number | null | undefined): string =>
  v != null && Number.isFinite(v) ? String(Math.max(0, Math.round(v))) : '0';

function fmtMcap(mcapUsd: number | null | undefined): string {
  if (mcapUsd == null || !Number.isFinite(mcapUsd) || mcapUsd <= 0) return '';
  if (mcapUsd >= 1e12) return (mcapUsd / 1e12).toFixed(2).replace('.', ',') + ' T';
  if (mcapUsd >= 1e9) return (mcapUsd / 1e9).toFixed(1).replace('.', ',') + ' Bil';
  if (mcapUsd >= 1e6) return (mcapUsd / 1e6).toFixed(0) + ' M';
  return String(Math.round(mcapUsd));
}

const EXCHANGE_FULL: Record<string, string> = {
  NYSE: 'New York Stock Exchange (NYSE)',
  NASDAQ: 'NASDAQ',
  AMEX: 'NYSE American (AMEX)',
  BCBA: 'Bolsa de Comercio de Buenos Aires (BCBA)',
  BINANCE: 'Binance (cripto, 24/7)',
};

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fmtIsoDateEs(iso: string | null | undefined): string {
  if (!iso || typeof iso !== 'string') return '';
  const parts = iso.trim().split('-');
  if (parts.length !== 3) return '';
  const [yyyy, mmStr, ddStr] = parts;
  const mm = parseInt(mmStr, 10);
  const dd = parseInt(ddStr, 10);
  if (!Number.isFinite(mm) || mm < 1 || mm > 12 || !Number.isFinite(dd) || dd < 1 || dd > 31) {
    return '';
  }
  return `${Number(dd)} ${MONTHS_ES[mm - 1]} ${yyyy}`;
}

/**
 * Caso curado ALB: valores exactos del PMV del 21/10/2026 (Fair Value propio
 * por triangulación de 3 métodos: pesimista 94 / base 157 / optimista 225;
 * consenso de la captura compartida por el usuario: 18 analistas).
 * El precio sí se actualiza al precio en vivo.
 */
function albPreset(detail: AssetDetailResponse): OpportunityFormState {
  const price = detail.quote?.price ?? 93.77;
  return {
    name: 'Albemarle Corp',
    ticker: 'ALB',
    price: num(price),
    years: '3',
    fvPes: '94',
    fvBase: '157',
    fvOpt: '225',
    scenario: 'Base',
    uncertainty: 'Very High',
    moat: 'Narrow',
    moatDesc: 'Ventaja de costos: salmuera de Atacama entre las más baratas del mundo.',
    mcap: '13,0 Bil',
    divYield: '1,49',
    consAvg: '178,33',
    consMin: '129',
    consMax: '250',
    consBull: '12',
    consNeu: '6',
    consBear: '0',
    rSymbol: 'ALB',
    rExchange: 'New York Stock Exchange (NYSE)',
    rFounded: '1887',
    rIpo: '22 feb 1994',
    rCeo: 'Kent Masters (presidente y CEO desde 2020)',
    rEmployees: '7.800 (7,8 mil)',
    rSector: 'Materiales básicos',
    rIndustry: 'Químicos especiales (Specialty Chemicals)',
    rHq: 'Estados Unidos · Charlotte, Carolina del Norte',
    core: 'Albemarle es una empresa global de químicos especiales y materiales para baterías, y uno de los mayores productores de litio del mundo. Trabaja en tres segmentos: Energy Storage (litio para vehículos eléctricos y para guardar energía en la red), Specialties (bromo y retardantes de llama, y especialidades de litio para farmacéuticas y seguridad) y Ketjen (catalizadores para refinerías). Su modelo combina recursos propios de salmuera y roca dura con plantas de conversión y refinación, y contratos con clientes en unos 70 países. Con unos 7.800 empleados y un valor de mercado cercano a los US$11 mil millones, su desempeño depende en buena medida del precio del litio y de la demanda de vehículos eléctricos y de almacenamiento de energía.',
    edge: 'Foso estrecho por ventaja de costos: sus salmueras de Atacama (Chile) y Silver Peak (EE.UU.) están entre las fuentes de litio más baratas del mundo, y suma minas de roca dura de alta ley (Greenbushes, Australia) y plantas de conversión propias. Cuando el precio del litio cae, los productores caros cierran primero y Albemarle sigue ganando.',
    optionality: 'Litio para almacenamiento de energía en la red (más allá del auto eléctrico), proyectos de refinación en EE.UU. que se benefician de incentivos locales, y el negocio de catalizadores Ketjen como activo separable.',
    persp1Title: 'El litio y las baterías: ¿hay demanda?',
    persp1Fav:
      'Las baterías gigantes que guardan energía (para autos eléctricos y para la red eléctrica) piden cada vez más litio. Hay analistas (Mizuho) que subieron los precios que esperan para el litio en 2027 y 2028, porque la oferta no crece tan rápido: eso juega a favor de las ganancias de Albemarle.',
    persp1Con:
      'Hoy sobra litio en el mundo y su precio de mercado está bajo. Si sigue sobrando, las ganancias de Albemarle sufren, porque casi todo lo que gana depende de ese precio.',
    persp2Title: 'Las ganancias que vienen (2026–2027)',
    persp2Fav:
      'En el último trimestre presentado, las ganancias operativas se más que duplicaron (llegaron a US$858 millones) y superaron lo esperado; la empresa mantuvo su guía para el año. Mizuho espera ganancias operativas de US$3.200 millones en 2027.',
    persp2Con:
      'Otros bancos (RBC) recortaron lo que esperan para este trimestre y para 2026–2027. Las ganancias de esta empresa suben y bajan mucho con el precio del litio: por eso son difíciles de predecir.',
    persp3Title: 'Precio y momento: ¿conviene comprar ahora?',
    persp3Fav:
      'La acción cotiza muy lejos de su máximo de US$221. Los analistas apuntan en promedio a US$158–182 dentro de 1 año, varias casas recomiendan comprar y la empresa tiene poca deuda.',
    persp3Con:
      'Viene cayendo fuerte en 3 meses y cotiza debajo de sus precios promedio de 50 y 200 días (la tendencia todavía es para abajo). Varias firmas recortaron sus precios esperados, y en nuestro escenario pesimista el valor justo es US$94: si el litio cae, no hay colchón.',
    verdictDetail:
      'Cómo se pondera este caso: a favor pesan el upside hasta nuestro valor justo base, que el estimado de los analistas coincide con ese valor, y un balance sano (deuda neta de apenas ~0,5 veces las ganancias operativas y sin vencimientos grandes hasta fines de 2028). En contra pesan el momento bajista de la acción y que en el escenario malo no hay margen de seguridad.',
    seedNote:
      'Precarga ALB del PMV (21/10/2026): Fair Value propio por triangulación de 3 métodos y consenso de la captura compartida (18 analistas). El precio es el de hoy; el resto es editable.',
  };
}

/** Precarga genérica desde los datos en vivo del detalle del activo. */
export function seedOpportunityForm(detail: AssetDetailResponse): OpportunityFormState {
  if ((detail.meta?.ticker || '').toUpperCase() === 'ALB') return albPreset(detail);

  const { meta, quote, fairValue, extras } = detail as AssetDetailResponse & {
    extras?: AssetDetailResponse['extras'];
  };
  const price = quote?.price ?? 0;
  const fv = fairValue?.fairValue ?? null;
  const dcf = fairValue?.dcfValue ?? null;
  const analyst = extras?.targetMean ?? fairValue?.analystTarget ?? null;

  // Escenarios desde la dispersión de métodos (DCF / target de analistas / FV):
  // pesimista = el método más bajo, optimista = el más alto, base = FV del motor.
  // Con 3+ métodos se descarta un extremo si es un outlier (>1,8× la mediana):
  // un DCF disparado no tiene que fijar el escenario optimista.
  const methods = [dcf, analyst, fv].filter(
    (v): v is number => v != null && Number.isFinite(v) && v > price * 0.2 && v < price * 4
  );
  let fvBase = fv ?? (price > 0 ? price * 1.05 : 0);
  let fvPes = methods.length ? Math.min(...methods) : fvBase * 0.6;
  let fvOpt = methods.length ? Math.max(...methods) : fvBase * 1.45;
  if (methods.length >= 3) {
    const sorted = [...methods].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (fvOpt > median * 1.8) fvOpt = sorted[sorted.length - 2];
    if (fvPes < median / 1.8) fvPes = sorted[1];
  }
  if (fvPes >= fvBase) fvPes = fvBase * 0.65;
  if (fvOpt <= fvBase) fvOpt = fvBase * 1.4;

  const m = fairValue?.multiples;
  const revG = m?.revenueGrowthPct;
  const grossM = m?.grossMarginPct;
  const trendTxt = (() => {
    const pts = detail.chart?.points || [];
    if (pts.length < 30) return null;
    const closes = pts.map((p) => p[1]);
    const sma = (arr: number[], n: number) =>
      arr.length >= n ? arr.slice(-n).reduce((s, x) => s + x, 0) / n : null;
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    return { s50, s200 };
  })();

  const moatDesc =
    fairValue?.moat === 'Wide'
      ? 'Ventaja amplia estimada por márgenes y rentabilidad del capital (ver múltiplos).'
      : fairValue?.moat === 'Narrow'
        ? 'Ventaja estrecha estimada por márgenes y rentabilidad del capital (ver múltiplos).'
        : 'Sin ventaja clara según márgenes y rentabilidad actuales (ver múltiplos).';

  const fz = extras?.finviz;
  const gross = fz?.grossMarginPct ?? extras?.grossMarginPct ?? m?.grossMarginPct;
  const opm = fz?.operatingMarginPct ?? extras?.operatingMarginPct ?? m?.operatingMarginPct;
  const roic = fz?.roicPct ?? extras?.roicPct ?? null;
  const roe = fz?.roePct ?? extras?.roePct ?? m?.roePct;

  const signals: string[] = [];
  if (gross != null && Number.isFinite(gross)) {
    const grossComment =
      gross >= 60
        ? ' (poder de precio: cobra bastante más de lo que le cuesta producir)'
        : gross >= 40
          ? ' (margen sano)'
          : ' (margen ajustado: compite más por costo)';
    signals.push(`margen bruto de ${gross.toFixed(1).replace('.', ',')}%${grossComment}`);
  }
  if (opm != null && Number.isFinite(opm)) {
    signals.push(`margen operativo de ${opm.toFixed(1).replace('.', ',')}%`);
  }
  if (roic != null && Number.isFinite(roic)) {
    const roicComment =
      roic >= 20
        ? ' (cada dólar invertido rinde muy por encima del costo del capital)'
        : roic >= 10
          ? ' (rinde por encima del costo del capital)'
          : ' (rinde poco sobre lo invertido)';
    signals.push(`ROIC de ${roic.toFixed(1).replace('.', ',')}%${roicComment}`);
  } else if (roe != null && Number.isFinite(roe)) {
    signals.push(`ROE de ${roe.toFixed(1).replace('.', ',')}%`);
  }

  const moatPrefix =
    fairValue?.moat === 'Wide'
      ? 'Foso amplio (estimado): '
      : fairValue?.moat === 'Narrow'
        ? 'Foso estrecho (estimado): '
        : 'Sin foso claro (estimado): ';
  // Sin señales (cripto, ETF o fuente caída): vacío, así se ve el placeholder
  // en vez de un texto genérico que no aporta.
  const edge = signals.length === 0 ? '' : `${moatPrefix}${signals.join('; ')}. Completá con lo cualitativo: marca, efecto red, costos de cambio para el cliente, escala o patentes que la separan de sus competidores dentro de ${meta?.industry || 'su industria'}.`;

  const eps5Y = fz?.epsNext5YPct ?? extras?.epsNext5YGrowthPct;
  const epsPast5Y = fz?.epsPast5YPct;
  const salesYoy = fz?.salesYoyTtmPct ?? extras?.revenueGrowthPct ?? m?.revenueGrowthPct;
  const fcfY = extras?.fcfYieldPct ?? m?.fcfYieldPct;

  const optParts: string[] = [];
  if (eps5Y != null && Number.isFinite(eps5Y)) {
    let s = `crecimiento esperado de EPS a 5 años de ${eps5Y.toFixed(1).replace('.', ',')}% anual`;
    if (epsPast5Y != null && Number.isFinite(epsPast5Y)) {
      const accel = eps5Y >= epsPast5Y ? 'acelera frente al' : 'modera frente al';
      s += ` (${accel} ${epsPast5Y.toFixed(1).replace('.', ',')}% histórico)`;
    }
    optParts.push(s);
  }
  if (salesYoy != null && Number.isFinite(salesYoy)) {
    optParts.push(`ventas creciendo ${salesYoy.toFixed(1).replace('.', ',')}% interanual`);
  }
  if (fcfY != null && Number.isFinite(fcfY) && fcfY > 0) {
    optParts.push(`FCF Yield de ${fcfY.toFixed(1).replace('.', ',')}% para financiar nuevas apuestas sin endeudarse`);
  }

  const optionality =
    optParts.length === 0
      ? ''
      : `Base cuantitativa: ${optParts.join('; ')}. Sumá acá las apuestas cualitativas que el precio todavía no descuenta del todo (nuevas líneas de producto, expansión geográfica, IA/software, escisiones o recompras).`;

  return {
    name: (quote?.name && quote.name !== meta?.ticker ? quote.name : meta?.name) || meta?.ticker || '',
    ticker: meta?.ticker || '',
    price: num(price),
    years: '3',
    fvPes: num(fvPes),
    fvBase: num(fvBase),
    fvOpt: num(fvOpt),
    scenario: 'Base',
    uncertainty: normalizeUncertainty(fairValue?.uncertainty),
    moat: (fairValue?.moat as MoatLevel) || 'None',
    moatDesc,
    mcap: fmtMcap(extras?.marketCap ?? quote?.marketCap),
    divYield:
      extras?.forwardDividendYieldPct != null
        ? extras.forwardDividendYieldPct.toFixed(2).replace('.', ',')
        : extras?.dividendYieldPct != null
          ? extras.dividendYieldPct.toFixed(2).replace('.', ',')
          : '',
    consAvg: num(extras?.targetMean ?? analyst),
    consMin: num(extras?.targetLow),
    consMax: num(extras?.targetHigh),
    consBull: int((extras?.buy ?? 0) + (extras?.strongBuy ?? 0)),
    consNeu: int(extras?.hold),
    consBear: int((extras?.sell ?? 0) + (extras?.strongSell ?? 0)),
    rSymbol: meta?.ticker || '',
    rExchange: EXCHANGE_FULL[meta?.exchange || ''] || meta?.exchange || '',
    rFounded: extras?.foundedYear != null ? String(extras.foundedYear) : '',
    rIpo: fmtIsoDateEs(extras?.ipoDate),
    rCeo: extras?.ceo || '',
    rEmployees: extras?.employees != null ? extras.employees.toLocaleString('es-AR') : '',
    rSector: meta?.sector || '',
    rIndustry: meta?.industry || '',
    rHq: extras?.hq || meta?.country || '',
    core: extras?.businessSummary || '',
    edge,
    optionality,
    persp1Title: 'Demanda: ¿el negocio crece?',
    persp1Fav:
      revG != null && revG > 0
        ? `Las ventas vienen creciendo ${revG.toFixed(1).replace('.', ',')}% anual según los últimos datos: la demanda del negocio acompaña.`
        : 'Completá esta lectura con tu análisis: qué está pasando con la demanda de lo que vende la empresa.',
    persp1Con:
      revG != null && revG < 0
        ? `Las ventas vienen cayendo ${Math.abs(revG).toFixed(1).replace('.', ',')}% anual: si la demanda no repunta, las ganancias sufren.`
        : 'El riesgo de demanda siempre está: si el sector se enfría, esta empresa lo siente en ventas y márgenes.',
    persp2Title: 'Las ganancias que vienen',
    persp2Fav:
      grossM != null
        ? `El margen bruto es ${grossM.toFixed(1).replace('.', ',')}%: cada venta deja una porción sana antes de gastos, lo que sostiene las ganancias si el volumen acompaña.`
        : 'Completá esta lectura con las expectativas de ganancias (consenso y guía de la empresa).',
    persp2Con:
      'Las ganancias futuras dependen de supuestos (precios, volúmenes, costos): por eso la ficha trabaja con 3 escenarios de Fair Value y no con un solo número.',
    persp3Title: 'Precio y momento: ¿conviene comprar ahora?',
    persp3Fav:
      fv != null && price > 0
        ? `Frente al Fair Value del motor (US$ ${fv.toFixed(2)}), el precio de hoy deja un upside que la ficha calcula arriba.`
        : 'Completá el Fair Value por escenarios para ver el upside.',
    persp3Con:
      trendTxt?.s50 && trendTxt?.s200
        ? `Momento: el precio está ${price >= trendTxt.s50 ? 'sobre' : 'debajo de'} su promedio de 50 días (US$ ${trendTxt.s50.toFixed(2)}) y ${price >= trendTxt.s200 ? 'sobre' : 'debajo de'} el de 200 días (US$ ${trendTxt.s200.toFixed(2)}). La tendencia manda en el corto plazo, el valor manda en el largo.`
        : 'Revisá la tendencia en el gráfico de arriba: el momento puede jugar en contra aunque el valor acompañe.',
    verdictDetail:
      'Veredicto calculado con la regla de la ficha: compra fuerte si hasta el escenario pesimista deja más de +20% de upside; comprar de a poco si el upside al base es de +30% o más pero el pesimista no deja colchón; mantener si el upside base es chico (entre −10% y +30%); vender si el precio ya supera al valor justo base.',
    seedNote:
      'Precarga automática: precio y múltiplos en vivo; Fair Value y escenarios desde el motor (DCF + target de analistas). Todo es editable: el juicio del analista manda.',
  };
}

/** Parsea un número tipeado en formato es-AR («93,77» / «1.234,56») o en-US. */
export function parseLocalNum(v: string): number {
  if (v == null) return NaN;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s);
}

export function fmtLocal(n: number, dec = 2): string {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function fmtSignedPct(x: number, dec = 1): string {
  return (x >= 0 ? '+' : '−') + fmtLocal(Math.abs(x), dec) + '%';
}
