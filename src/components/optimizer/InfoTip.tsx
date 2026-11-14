import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { METHODOLOGY } from './methodology';

/**
 * Ícono ⓘ con popover de metodología (SPEC-004: pedido del usuario).
 *
 * Dos modos de uso:
 *  - por clave (`k`): el texto sale de METHODOLOGY (Optimizador).
 *  - a medida (`title` + `body`): para textos construidos con los
 *    datos del activo en pantalla (ficha de oportunidad), donde la
 *    explicación depende de los números concretos que se están
 *    viendo. Si vienen `title` y `body`, mandan ellos.
 */
export const InfoTip: React.FC<{
  k?: keyof typeof METHODOLOGY;
  title?: string;
  body?: string;
  label?: string;
}> = ({ k, title, body, label }) => {
  const [open, setOpen] = useState(false);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open ]);
  const m =
    title != null && body != null ? { title, body } : k != null ? METHODOLOGY[k] : null;
  if (!m) return null;

  // Al abrir, medir el botón y desplazar el popover lo justo para que nunca
  // quede cortado por el borde de la pantalla (pasaba en el celular con los
  // ⓘ cercanos al margen derecho: el popover nace hacia la derecha con
  // ancho fijo de 300px y se salía del display).
  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const popW = Math.min(300, vw - 24);
      let left = 0;
      if (rect.left + popW > vw - 8) left = vw - 8 - (rect.left + popW);
      if (rect.left + left < 8) left = 8 - rect.left;
      setPopStyle({ left, width: popW });
    }
    setOpen((v) => !v);
  };

  return (
    <span className="infotip" ref={ref}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={`Metodología: ${m.title}`}
        title={label || m.title}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        <Info size={13} />
      </button>
      {open && (
        <span className="infotip-pop" role="dialog" style={popStyle}>
          <span className="infotip-pop-head">
            <strong>{m.title}</strong>
            <button type="button" className="infotip-close" onClick={() => setOpen(false)} aria-label="Cerrar">
              <X size={13} />
            </button>
          </span>
          <span className="infotip-pop-body">{m.body}</span>
        </span>
      )}
    </span>
  );
};
