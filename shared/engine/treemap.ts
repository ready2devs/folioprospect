/**
 * Layout squarified de treemap (SPEC-005) — lógica pura, sin DOM.
 * Dado un rectángulo marco y una lista de {key, value}, devuelve un
 * rectángulo por ítem: sin solapes, dentro del marco y con áreas
 * proporcionales al valor (salvo redondeo de punto flotante).
 * Sirve para los dos niveles: subcarteras y activos dentro de cada panel.
 */

export interface TreemapItem {
  key: string;
  value: number;
}

export interface TreemapFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapRect extends TreemapFrame {
  key: string;
}

interface ScaledItem {
  key: string;
  area: number;
}

/** Peor relación de aspecto de una fila contra un lado dado. */
function worstAspect(row: ScaledItem[], side: number): number {
  if (row.length === 0 || side <= 0) return Infinity;
  let sum = 0;
  let max = 0;
  let min = Infinity;
  for (const it of row) {
    sum += it.area;
    if (it.area > max) max = it.area;
    if (it.area < min) min = it.area;
  }
  if (sum <= 0 || min <= 0) return Infinity;
  const s2 = side * side;
  return Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
}

function layoutRow(
  items: ScaledItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  out: TreemapRect[]
): void {
  if (items.length === 0) return;
  if (items.length === 1 || width <= 0 || height <= 0) {
    // El último ítem llena exactamente el rectángulo restante.
    out.push({ key: items[0].key, x, y, width, height });
    for (let i = 1; i < items.length; i++) {
      out.push({ key: items[i].key, x, y, width: 0, height: 0 });
    }
    return;
  }

  // Armar la mejor fila contra el lado más corto (algoritmo squarified).
  const side = Math.min(width, height);
  let row: ScaledItem[] = [items[0]];
  let rest = items.slice(1);
  while (rest.length > 0) {
    const candidate = [...row, rest[0]];
    if (worstAspect(candidate, side) <= worstAspect(row, side)) {
      row = candidate;
      rest = rest.slice(1);
    } else {
      break;
    }
  }

  const rowArea = row.reduce((s, it) => s + it.area, 0);
  if (width >= height) {
    // Franja vertical a la izquierda; los ítems se apilan en vertical.
    const stripWidth = height > 0 ? rowArea / height : 0;
    let cy = y;
    row.forEach((it, idx) => {
      const ih =
        idx === row.length - 1 ? y + height - cy : stripWidth > 0 ? it.area / stripWidth : 0;
      out.push({ key: it.key, x, y: cy, width: stripWidth, height: Math.max(0, ih) });
      cy += Math.max(0, ih);
    });
    layoutRow(rest, x + stripWidth, y, Math.max(0, width - stripWidth), height, out);
  } else {
    // Franja horizontal arriba; los ítems se colocan en horizontal.
    const stripHeight = width > 0 ? rowArea / width : 0;
    let cx = x;
    row.forEach((it, idx) => {
      const iw =
        idx === row.length - 1 ? x + width - cx : stripHeight > 0 ? it.area / stripHeight : 0;
      out.push({ key: it.key, x: cx, y, width: Math.max(0, iw), height: stripHeight });
      cx += Math.max(0, iw);
    });
    layoutRow(rest, x, y + stripHeight, width, Math.max(0, height - stripHeight), out);
  }
}

/**
 * Calcula el treemap. Los ítems con valor <= 0 o no finito reciben un
 * rectángulo de área cero dentro del marco. El orden de salida sigue el
 * orden de entrada (el layout interno ordena por valor desc.).
 */
export function squarifiedTreemap(
  items: TreemapItem[],
  frame: TreemapFrame
): TreemapRect[] {
  const { x, y, width, height } = frame;
  const zeroRect = (key: string): TreemapRect => ({ key, x, y, width: 0, height: 0 });
  if (!(width > 0) || !(height > 0)) return items.map((it) => zeroRect(it.key));

  const valid = items.filter((it) => Number.isFinite(it.value) && it.value > 0);
  if (valid.length === 0) return items.map((it) => zeroRect(it.key));

  const totalValue = valid.reduce((s, it) => s + it.value, 0);
  const scale = (width * height) / totalValue;
  const scaled: ScaledItem[] = valid
    .map((it) => ({ key: it.key, area: it.value * scale }))
    .sort((a, b) => b.area - a.area);

  const laidOut: TreemapRect[] = [];
  layoutRow(scaled, x, y, width, height, laidOut);
  const byKey = new Map(laidOut.map((r) => [r.key, r]));
  return items.map((it) => byKey.get(it.key) || zeroRect(it.key));
}
