/**
 * Posicionamiento de popovers anclados a un botón (lo usa InfoTip).
 *
 * Función pura: dado el rect del botón (getBoundingClientRect), el alto
 * real del popover ya renderizado y el tamaño del viewport, devuelve la
 * posición FIJA (position:fixed, vía portal en document.body) que lo
 * mantiene siempre completo dentro de la ventana:
 *
 *  - Horizontal: nace alineado al borde izquierdo del botón; si no entra,
 *    se corre a la izquierda lo justo (margen mínimo a ambos bordes) y el
 *    ancho se achica si el viewport es más angosto que el ancho deseado.
 *  - Vertical: se abre hacia abajo si el contenido entra; si no, hacia
 *    arriba del botón. Si tampoco entra entero, se elige el lado con más
 *    espacio y el alto se capa a ese espacio (el popover scrollea adentro).
 *
 * Nació en la v11 (2026-11-15): antes el popover era position:absolute
 * dentro de su sección y los ancestros con overflow (panel derecho,
 * app-shell) lo recortaban en escritorio aunque el clamp por
 * window.innerWidth dijera que «entraba».
 */
export interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PopoverPlacement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'below' | 'above';
}

export const POPOVER_MARGIN = 8;
export const POPOVER_GAP = 6;
export const POPOVER_WIDTH = 300;

/** Ancho efectivo del popover: el deseado, sin salirse del viewport. */
export function popoverWidth(viewportWidth: number, margin: number = POPOVER_MARGIN): number {
  return Math.max(0, Math.min(POPOVER_WIDTH, viewportWidth - margin * 2));
}

export function computePopoverPlacement(
  anchor: AnchorRect,
  popHeight: number,
  viewport: ViewportSize,
  opts: { margin?: number; gap?: number; width?: number } = {},
): PopoverPlacement {
  const margin = opts.margin ?? POPOVER_MARGIN;
  const gap = opts.gap ?? POPOVER_GAP;
  const width = opts.width ?? popoverWidth(viewport.width, margin);

  // Horizontal: alineado al botón, corrido a la izquierda si no entra.
  let left = anchor.left;
  if (left + width > viewport.width - margin) left = viewport.width - margin - width;
  if (left < margin) left = margin;

  // Vertical: abajo si entra; si no, arriba; si tampoco, el lado mayor.
  const spaceBelow = viewport.height - margin - (anchor.bottom + gap);
  const spaceAbove = anchor.top - gap - margin;
  const placement: 'below' | 'above' =
    popHeight <= spaceBelow || spaceBelow >= spaceAbove ? 'below' : 'above';
  const space = placement === 'below' ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(0, space);
  const height = Math.min(popHeight, maxHeight);
  const top = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - height;

  return { left, top, width, maxHeight, placement };
}
