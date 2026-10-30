import React, { useEffect, useRef, useState } from 'react';
import { Info, X } from 'lucide-react';
import { METHODOLOGY } from './methodology';

/** Ícono ⓘ con popover de metodología (SPEC-004: pedido del usuario). */
export const InfoTip: React.FC<{ k: keyof typeof METHODOLOGY; label?: string }> = ({ k, label }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open ]);
  const m = METHODOLOGY[k];
  return (
    <span className="infotip" ref={ref}>
      <button
        type="button"
        className="infotip-btn"
        aria-label={`Metodología: ${m.title}`}
        title={label || m.title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info size={13} />
      </button>
      {open && (
        <span className="infotip-pop" role="dialog">
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
