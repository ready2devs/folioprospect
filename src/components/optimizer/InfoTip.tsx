import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { METHODOLOGY } from './methodology';
import {
  computePopoverPlacement,
  popoverWidth,
  type PopoverPlacement,
} from './popoverPosition';

/**
 * Ícono ⓘ con popover de metodología (SPEC-004: pedido del usuario).
 *
 * Dos modos de uso:
 *  - por clave (`k`): el texto sale de METHODOLOGY (Optimizador).
 *  - a medida (`title` + `body`): para textos construidos con los
 *    datos del activo en pantalla (ficha de oportunidad), donde la
 *    explicación depende de los números concretos que se están
 *    viendo. Si vienen `title` y `body`, mandan ellos.
 *
 * Render (v11, 2026-11-15): el popover sale en un PORTAL sobre
 * document.body con position:fixed, posicionado desde el rect del botón
 * con computePopoverPlacement. Antes era position:absolute dentro de la
 * sección y en escritorio los ancestros con overflow (panel derecho,
 * app-shell) lo recortaban: el clamp por window.innerWidth «entraba»
 * pero el panel terminaba antes que la ventana y el texto quedaba
 * cortado. En el portal ningún ancestro puede recortarlo. Como la
 * posición fija queda vieja si el botón se mueve, el popover se cierra
 * cuando un scroll DESPLAZA al botón (o ante un resize); un scroll que
 * no lo mueve —otra columna, un evento de asentamiento— no lo cierra,
 * porque el popover sigue bien ubicado.
 */
export const InfoTip: React.FC<{
  k?: keyof typeof METHODOLOGY;
  title?: string;
  body?: string;
  label?: string;
}> = ({ k, title, body, label }) => {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<DOMRect | null>(null);

  // Al abrir, el popover se renderiza oculto con su ancho final; ya
  // montado se mide su alto real y se calcula la posición fija. El
  // layout effect corre antes del paint, así que nunca se ve el salto.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      anchorRef.current = null;
      return;
    }
    if (!btnRef.current || !popRef.current) return;
    const anchor = btnRef.current.getBoundingClientRect();
    anchorRef.current = anchor;
    const popHeight = popRef.current.offsetHeight;
    setPlacement(
      computePopoverPlacement(anchor, popHeight, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [open ]);

  // Cierre: ×, click afuera (botón y popover cuentan como «adentro»,
  // porque el popover vive en el portal, fuera del span), scroll que
  // desplace al botón, y resize.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      // El scroll interno del popover (contenido largo) no lo cierra.
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      // Solo cierra si el scroll movió al botón: si el ancla no se
      // movió (otra columna, asentamiento del panel), el popover sigue
      // bien ubicado y no hay que cerrarlo.
      const anchor = anchorRef.current;
      const btn = btnRef.current;
      if (!anchor || !btn) {
        setOpen(false);
        return;
      }
      const now = btn.getBoundingClientRect();
      if (Math.abs(now.top - anchor.top) > 1 || Math.abs(now.left - anchor.left) > 1) {
        setOpen(false);
      }
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [open ]);

  const m =
    title != null && body != null ? { title, body } : k != null ? METHODOLOGY[k] : null;
  if (!m) return null;

  return (
    <span className="infotip">
      <button
        type="button"
        className="infotip-btn"
        ref={btnRef}
        aria-label={`Metodología: ${m.title}`}
        title={label || m.title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info size={13} />
      </button>
      {open &&
        createPortal(
          <span
            className="infotip-pop infotip-pop-portal"
            role="dialog"
            ref={popRef}
            style={
              placement
                ? {
                    left: placement.left,
                    top: placement.top,
                    width: placement.width,
                    maxHeight: placement.maxHeight,
                  }
                : { left: 0, top: 0, width: popoverWidth(window.innerWidth), visibility: 'hidden' }
            }
          >
            <span className="infotip-pop-head">
              <strong>{m.title}</strong>
              <button type="button" className="infotip-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                <X size={13} />
              </button>
            </span>
            <span className="infotip-pop-body">{m.body}</span>
          </span>,
          document.body,
        )}
    </span>
  );
};
