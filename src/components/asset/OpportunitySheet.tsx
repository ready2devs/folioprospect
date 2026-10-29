import React, { useMemo, useRef, useState } from 'react';
import type { AssetDetailResponse } from '@/api';
import {
  computeOpportunity,
  consensusTag,
  UNCERTAINTY_LEVELS,
  type ScenarioKey,
} from '@shared/engine/opportunity';
import {
  fmtLocal,
  fmtSignedPct,
  parseLocalNum,
  seedOpportunityForm,
  type OpportunityFormState,
} from './opportunitySeed';
import { ChevronDown, Pencil, Star } from 'lucide-react';

/**
 * Ficha de «Evaluación de oportunidad» embebida en el detalle del activo.
 *
 * Réplica de la lógica y la disposición del PMV del 21/10/2026 (captura de
 * referencia: dos columnas — formulario a la izquierda, ficha a la derecha).
 * En móvil la ficha va primero y el formulario queda plegado debajo.
 */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  margin: '11px 0 4px',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 9px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 7,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  font: 'inherit',
  fontSize: 12.5,
};
const fldLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
};
const fldVal: React.CSSProperties = { fontSize: 19, fontWeight: 700, marginTop: 2 };
const fldSub: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 };

export const OpportunitySheet: React.FC<{
  detail: AssetDetailResponse;
  isMobile: boolean;
}> = ({ detail, isMobile }) => {
  const [form, setForm] = useState<OpportunityFormState>(() => seedOpportunityForm(detail));
  const [formOpen, setFormOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(!isMobile);
  const [editingPersp, setEditingPersp] = useState<number | null>(null);
  const [editingVerdict, setEditingVerdict] = useState(false);
  const [coreExpanded, setCoreExpanded] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  // Activación/desactivación de marcadores del consenso, a prueba de la
  // secuencia de eventos táctil (mouseenter/focus sintetizados → click).
  const lastMarkerActivationRef = useRef(0);
  const activateMarker = (key: string) => {
    lastMarkerActivationRef.current = Date.now();
    setHoveredMarker(key);
  };
  const deactivateMarker = (key: string) => {
    const t = lastMarkerActivationRef.current;
    setTimeout(() => {
      if (lastMarkerActivationRef.current === t) {
        setHoveredMarker((cur) => (cur === key ? null : cur));
      }
    }, 80);
  };

  const set = (k: keyof OpportunityFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const price = parseLocalNum(form.price);
  const fvPes = parseLocalNum(form.fvPes);
  const fvBase = parseLocalNum(form.fvBase);
  const fvOpt = parseLocalNum(form.fvOpt);
  const years = parseLocalNum(form.years);

  const result = useMemo(
    () =>
      computeOpportunity({
        price,
        fvPesimista: fvPes,
        fvBase,
        fvOptimista: fvOpt,
        scenario: form.scenario,
        uncertainty: form.uncertainty,
        yearsToCorrection: years,
      }),
    [price, fvPes, fvBase, fvOpt, form.scenario, form.uncertainty, years]
  );

  // Consenso
  const cAvg = parseLocalNum(form.consAvg);
  const cMin = parseLocalNum(form.consMin);
  const cMax = parseLocalNum(form.consMax);
  const cBull = Math.max(0, Math.round(parseLocalNum(form.consBull) || 0));
  const cNeu = Math.max(0, Math.round(parseLocalNum(form.consNeu) || 0));
  const cBear = Math.max(0, Math.round(parseLocalNum(form.consBear) || 0));
  const cTotal = cBull + cNeu + cBear;
  const consPct = cAvg > 0 && price > 0 ? (cAvg / price - 1) * 100 : null;
  const scaleMax = Math.max(
    cMax > 0 ? cMax * 1.08 : 0,
    cAvg > 0 ? cAvg * 1.25 : 0,
    price > 0 ? price * 1.3 : 0,
    1
  );
  // Escala del consenso, limpia: etiqueta de valor solo en el punto clave
  // (el promedio); el resto lleva solo el nombre, en fuente chica. Los
  // marcadores de los extremos se anclan hacia adentro y, si dos nombres
  // quedan cerca, el segundo baja un nivel para que no se pisen.
  const scaleMarkers = [
    { key: 'price', val: price, name: 'Actual', color: 'var(--text-primary)', showValue: false },
    { key: 'min', val: cMin, name: 'Mínimo', color: 'var(--text-muted)', showValue: false },
    { key: 'avg', val: cAvg, name: 'Promedio', color: 'var(--pos-bright)', showValue: true },
    { key: 'max', val: cMax, name: 'Máximo', color: 'var(--text-muted)', showValue: false },
  ]
    .filter((m) => m.val > 0)
    .map((m) => ({ ...m, pct: Math.max(2, Math.min(98, (m.val / scaleMax) * 100)), nameLow: false }))
    .sort((a, b) => a.pct - b.pct);
  for (let i = 1; i < scaleMarkers.length; i++) {
    if (scaleMarkers[i].pct - scaleMarkers[i - 1].pct < 12) {
      scaleMarkers[i].nameLow = !scaleMarkers[i - 1].nameLow;
    }
  }
  const marker = (m: (typeof scaleMarkers)[number]) => {
    const shift = m.pct <= 10 ? '-12%' : m.pct >= 90 ? '-88%' : '-50%';
    const valueText = 'US$ ' + fmtLocal(m.val, m.val % 1 === 0 ? 0 : 2);
    const hovered = hoveredMarker === m.key;
    // UNA sola burbuja visible a la vez: si hay un punto activo (hover,
    // toque o foco) se muestra la suya y la permanente del Promedio se
    // oculta — antes ambas píldoras se pisaban cuando los puntos quedaban
    // cerca (captura del usuario en TSM). Sin interacción, el Promedio
    // muestra su valor siempre.
    const showBubble = hoveredMarker ? hovered : m.showValue;
    // Capas globales (sin stacking context por marcador): botón-punto
    // zIndex 1, nombre 3, burbuja 5. Así, cuando dos marcadores caen casi
    // en el mismo X (TSM: Actual 439,51 vs Mínimo 440), el NOMBRE siempre
    // le gana el tap al botón del vecino y ambos valores quedan
    // alcanzables; antes el marcador «activo» (zIndex de raíz) tapaba
    // con todo su contenido a los demás.
    // El marcador cuelga de un ancla de ancho 0 en left: pct%. El punto,
    // la burbuja y el nombre son absolutos centrados sobre esa ancla con
    // anchos propios CONSTANTES: nada entra en el flujo, así que al
    // aparecer la burbuja el punto NO se mueve (antes el contenedor
    // cambiaba de ancho con la burbuja y el translateX porcentual
    // corría el punto en el eje).
    // Interacción por tipo de puntero (medido en QA real): en táctil,
    // Chromium sintetiza mouseenter/focus ANTES del click y un
    // mouseleave DESPUÉS del click, así que (a) un toggle en onClick se
    // cancelaba solo y (b) desactivar por mouseleave revertía el tap.
    // Reglas: el tap/click ACTIVA siempre; entrar/salir solo cuenta con
    // puntero fino (mouse/pen) vía pointer events con pointerType; el
    // blur desactiva diferido y con guarda de última activación.
    const handlers = {
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') activateMarker(m.key);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') deactivateMarker(m.key);
      },
      onClick: () => activateMarker(m.key),
      onFocus: () => activateMarker(m.key),
      onBlur: () => deactivateMarker(m.key),
    };
    return (
      <div
        key={m.key}
        style={{
          position: 'absolute',
          left: m.pct + '%',
          top: 0,
          width: 0,
          height: 66,
        }}
      >
        {showBubble && (
          <span
            className="mono"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translateX(${shift})`,
              fontSize: 10.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 999,
              padding: '1px 7px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            {valueText}
          </span>
        )}
        <div
          role="button"
          tabIndex={0}
          aria-label={`${m.name}: ${valueText}`}
          {...handlers}
          style={{
            position: 'absolute',
            top: 13,
            left: 0,
            width: 32,
            height: 32,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            cursor: 'pointer',
            outline: 'none',
            zIndex: 1,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: m.color,
              border: '2px solid var(--bg-surface)',
              marginTop: 6,
              flexShrink: 0,
              boxShadow: hovered ? '0 0 0 3px rgba(148, 163, 184, 0.35)' : 'none',
            }}
          />
        </div>
        <div
          role="button"
          tabIndex={-1}
          aria-hidden="true"
          {...handlers}
          style={{
            position: 'absolute',
            top: m.nameLow ? 46 : 35,
            left: 0,
            transform: `translateX(${shift})`,
            fontSize: 10,
            color: hovered ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: hovered ? 700 : 400,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            padding: '1px 3px',
            zIndex: 3,
          }}
        >
          {m.name}
        </div>
      </div>
    );
  };

  const divY = parseLocalNum(form.divYield);
  const multiples = detail.fairValue?.multiples;
  const extras = detail.extras;
  const fz = extras?.finviz;
  const roicReal = fz?.roicPct ?? extras?.roicPct ?? null;
  const roicLabel = roicReal != null ? 'ROIC' : 'ROIC (proxy)';
  const divGrowthVal = (() => {
    const parts = [fz?.dividendGrowth3Y, fz?.dividendGrowth5Y]
      .filter((v): v is number => v != null && Number.isFinite(v))
      .map((v) => fmtLocal(v, 1) + '%');
    return parts.length > 0 ? parts.join(' / ') : '—';
  })();

  const fmtRatio = (v: number | null | undefined, suffix = 'x', dec = 2): string =>
    v != null && Number.isFinite(v) ? fmtLocal(v, dec) + suffix : '—';
  const fmtPct = (v: number | null | undefined, dec = 1): string =>
    v != null && Number.isFinite(v) ? fmtLocal(v, dec) + '%' : '—';
  const fmtNum = (v: number | null | undefined, dec = 2): string =>
    v != null && Number.isFinite(v) ? fmtLocal(v, dec) : '—';
  const fmtUsd = (v: number | null | undefined, dec = 2): string =>
    v != null && Number.isFinite(v) ? 'US$ ' + fmtLocal(v, dec) : '—';
  const fmtBig = (v: number | null | undefined): string => {
    if (v == null || !Number.isFinite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e12) return 'US$ ' + fmtLocal(v / 1e12) + ' T';
    if (abs >= 1e9) return 'US$ ' + fmtLocal(v / 1e9) + ' B';
    if (abs >= 1e6) return 'US$ ' + fmtLocal(v / 1e6) + ' M';
    return 'US$ ' + fmtLocal(v, 0);
  };

  const formCard = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <div className="card form" style={{ padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>Datos de la ficha</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Editables: la ficha de la derecha se recalcula en vivo.
        </div>
        <label style={{ ...labelStyle, marginTop: 10 }}>Empresa</label>
        <input style={inputStyle} value={form.name} onChange={set('name')} />
        <label style={labelStyle}>Ticker</label>
        <input style={inputStyle} value={form.ticker} onChange={set('ticker')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Precio hoy (US$)</label>
            <input style={inputStyle} inputMode="decimal" value={form.price} onChange={set('price')} />
          </div>
          <div>
            <label style={labelStyle}>Años hasta la corrección</label>
            <input style={inputStyle} inputMode="decimal" value={form.years} onChange={set('years')} />
          </div>
        </div>
        <label style={labelStyle}>Fair Value propio por escenario (US$)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Pesimista</label>
            <input style={inputStyle} inputMode="decimal" value={form.fvPes} onChange={set('fvPes')} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Base</label>
            <input style={inputStyle} inputMode="decimal" value={form.fvBase} onChange={set('fvBase')} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Optimista</label>
            <input style={inputStyle} inputMode="decimal" value={form.fvOpt} onChange={set('fvOpt')} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Escenario usado en la ficha</label>
            <select style={inputStyle} value={form.scenario} onChange={set('scenario')}>
              <option>Pesimista</option>
              <option>Base</option>
              <option>Optimista</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Incertidumbre</label>
            <select style={inputStyle} value={form.uncertainty} onChange={set('uncertainty')}>
              {UNCERTAINTY_LEVELS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Moat (ventaja competitiva)</label>
            <select style={inputStyle} value={form.moat} onChange={set('moat')}>
              <option>None</option>
              <option>Narrow</option>
              <option>Wide</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Market Cap</label>
            <input style={inputStyle} value={form.mcap} onChange={set('mcap')} />
          </div>
        </div>
        <label style={labelStyle}>Moat en una línea</label>
        <input style={inputStyle} value={form.moatDesc} onChange={set('moatDesc')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Forward Div. Yield (%)</label>
            <input style={inputStyle} inputMode="decimal" value={form.divYield} onChange={set('divYield')} />
          </div>
          <div>
            <label style={labelStyle}>Promedio de analistas (US$)</label>
            <input style={inputStyle} inputMode="decimal" value={form.consAvg} onChange={set('consAvg')} />
          </div>
        </div>
        <label style={labelStyle}>Consenso · rango de precios (US$) y conteo</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Mínimo</label>
            <input style={inputStyle} inputMode="decimal" value={form.consMin} onChange={set('consMin')} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Máximo</label>
            <input style={inputStyle} inputMode="decimal" value={form.consMax} onChange={set('consMax')} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Alcista</label>
            <input style={inputStyle} inputMode="numeric" value={form.consBull} onChange={set('consBull')} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Neutral</label>
            <input style={inputStyle} inputMode="numeric" value={form.consNeu} onChange={set('consNeu')} />
          </div>
          <div>
            <label style={{ ...labelStyle, marginTop: 0 }}>Bajista</label>
            <input style={inputStyle} inputMode="numeric" value={form.consBear} onChange={set('consBear')} />
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>{form.seedNote}</p>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <button
          type="button"
          onClick={() => setResumeOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--text-primary)',
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 14 }}>Resumen de la empresa</span>
          <ChevronDown
            size={16}
            color="var(--text-muted)"
            style={{ transition: 'transform 0.2s', transform: resumeOpen ? 'rotate(180deg)' : undefined }}
          />
        </button>
        {resumeOpen && (
          <div style={{ marginTop: 8 }}>
            {(
              [
                ['Símbolo', 'rSymbol'],
                ['Bolsa', 'rExchange'],
                ['Fundación', 'rFounded'],
                ['Salida a bolsa', 'rIpo'],
                ['CEO', 'rCeo'],
                ['Empleados', 'rEmployees'],
                ['Sector', 'rSector'],
                ['Industria', 'rIndustry'],
                ['País / sede', 'rHq'],
              ] as [string, keyof OpportunityFormState][]
            ).map(([label, key]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 10,
                  borderBottom: '1px solid var(--border-subtle)',
                  padding: '6px 0',
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {label}
                </span>
                <input
                  value={form[key]}
                  onChange={set(key)}
                  aria-label={label}
                  placeholder="—"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    font: 'inherit',
                    fontSize: 13.5,
                    fontWeight: 600,
                    textAlign: 'right',
                    flex: 1,
                    minWidth: 0,
                    padding: '1px 3px',
                  }}
                />
              </div>
            ))}
            <label style={labelStyle}>Qué hace la empresa (un párrafo, en simple)</label>
            <textarea
              style={{ ...inputStyle, minHeight: 150, resize: 'vertical', lineHeight: 1.55 }}
              value={form.core}
              onChange={set('core')}
              placeholder="Descripción simple del negocio: qué vende, a quién, y de qué depende su resultado."
            />
          </div>
        )}
      </div>
    </div>
  );

  const persp = (
    perspIdx: number,
    titleKey: keyof OpportunityFormState,
    favKey: keyof OpportunityFormState,
    conKey: keyof OpportunityFormState,
  ) => {
    const title = form[titleKey] as string;
    const fav = form[favKey] as string;
    const con = form[conKey] as string;
    const isEditing = editingPersp === perspIdx;
    return (
      <div key={titleKey} style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 14, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {isEditing ? (
            <input
              style={{ ...inputStyle, fontSize: 15.5, fontWeight: 700, flex: 1 }}
              value={title}
              onChange={set(titleKey)}
              autoFocus
            />
          ) : (
            <span style={{ fontSize: 15.5, fontWeight: 700, flex: 1 }}>{title}</span>
          )}
          <button
            type="button"
            onClick={() => setEditingPersp(isEditing ? null : perspIdx)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              color: isEditing ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              borderRadius: 4,
              flexShrink: 0,
            }}
            title={isEditing ? 'Listo' : 'Editar lectura'}
          >
            <Pencil size={12} /> {isEditing ? '✓' : ''}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <div style={{ borderRadius: 8, padding: '10px 12px', fontSize: 13.5, background: 'var(--pos-bg)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--pos-bright)', marginBottom: 4 }}>
              A FAVOR
            </div>
            {isEditing ? (
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical', background: 'transparent', border: '1px solid var(--pos-primary)' }}
                value={fav}
                onChange={set(favKey)}
              />
            ) : (
              <p style={{ margin: 0 }}>{fav}</p>
            )}
          </div>
          <div style={{ borderRadius: 8, padding: '10px 12px', fontSize: 13.5, background: 'var(--neg-bg)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--neg-bright)', marginBottom: 4 }}>
              EN CONTRA
            </div>
            {isEditing ? (
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical', background: 'transparent', border: '1px solid var(--neg-primary)' }}
                value={con}
                onChange={set(conKey)}
              />
            ) : (
              <p style={{ margin: 0 }}>{con}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ficha = (
    <div
      className="card"
      aria-live="polite"
      style={{ padding: isMobile ? 16 : 22, minWidth: 0, alignSelf: 'start' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
          borderBottom: '2px solid var(--text-primary)',
          paddingBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span style={{ fontSize: 22, fontWeight: 800 }}>{form.name || '—'}</span>{' '}
          <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}>{form.ticker}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Evaluación de oportunidad
        </div>
      </div>

      {form.core && (
        <div style={{ paddingTop: 10, position: 'relative' }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              overflow: coreExpanded ? undefined : 'hidden',
              maxHeight: coreExpanded ? undefined : '2.95em',
            }}
          >
            {form.core}
          </p>
          {form.core.length > 120 && !coreExpanded && (
            <button
              type="button"
              onClick={() => setCoreExpanded(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 0',
                marginTop: 2,
              }}
            >
              ver más ▾
            </button>
          )}
          {coreExpanded && (
            <button
              type="button"
              onClick={() => setCoreExpanded(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '2px 0',
                marginTop: 2,
              }}
            >
              ver menos ▴
            </button>
          )}
        </div>
      )}

      <div style={{ padding: '14px 0 4px' }}>
        <div style={fldLabel}>% hasta el Fair Value (upside) — lo que ganarías si el precio converge</div>
        <div
          className="mono"
          style={{
            fontSize: 'clamp(42px, 7vw, 60px)',
            fontWeight: 800,
            lineHeight: 1.05,
            color: result && result.upsidePct < 0 ? 'var(--neg-bright)' : 'var(--pos-bright)',
            letterSpacing: '-0.02em',
          }}
        >
          {result ? fmtSignedPct(result.upsidePct, 1) : '—'}
        </div>
      </div>

      <div style={{ padding: '12px 0 6px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={fldLabel}>Ranking de oportunidad de inversión</div>
        <div style={{ display: 'flex', gap: 3, marginTop: 6 }} aria-label={result ? `${result.stars} de 5 estrellas` : undefined}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={26}
              color={result && i <= result.stars ? '#E8A33D' : 'var(--border-strong)'}
              fill={result && i <= result.stars ? '#E8A33D' : 'transparent'}
            />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <span className="mono" style={{ fontSize: 27, fontWeight: 800 }}>
            {result ? result.score : '–'}
            <small style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 600 }}> / 100</small>
          </span>
          <span
            style={{
              padding: '3px 11px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              background: result && result.score >= 41 ? 'var(--pos-bg)' : 'var(--neg-bg)',
              color: result && result.score >= 41 ? 'var(--pos-bright)' : 'var(--neg-bright)',
            }}
          >
            {result ? result.label : 'Completá precio y Fair Value'}
          </span>
        </div>
        {result && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 5 }}>
            {result.starsRange[0] === result.starsRange[1]
              ? `Rango posible: ${result.starsRange[0]}★ en todos los escenarios (puntaje ${result.scoreRange[0]}–${result.scoreRange[1]})`
              : `Rango posible: ${result.starsRange[0]}★ a ${result.starsRange[1]}★ según el escenario de Fair Value (puntaje ${result.scoreRange[0]}–${result.scoreRange[1]})`}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderTop: '1px solid var(--border-subtle)',
          marginTop: 10,
        }}
      >
        <div style={{ padding: '11px 12px 11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={fldLabel}>Precio hoy</div>
          <div className="mono" style={fldVal}>{price > 0 ? 'US$ ' + fmtLocal(price) : '—'}</div>
        </div>
        <div style={{ padding: '11px 0 11px 12px', borderBottom: '1px solid var(--border-subtle)', borderLeft: '1px solid var(--border-subtle)' }}>
          <div style={fldLabel}>Fair Value propio · escenario {form.scenario.toLowerCase()}</div>
          <div className="mono" style={fldVal}>{result ? 'US$ ' + fmtLocal(result.fv) : '—'}</div>
          {result && result.annualizedPct != null && (
            <div style={fldSub}>
              Corrección esperada en ~{fmtLocal(years, years % 1 === 0 ? 0 : 1)} años. Si llega a US${' '}
              {fmtLocal(result.fv, 0)} en ese plazo, sería ganar {fmtSignedPct(result.annualizedPct, 1)} por
              año, cada año. Eso es la rentabilidad anual compuesta (también llamada CAGR): no es dividir
              el total entre los años, porque cada año la ganancia se suma a lo ya ganado.
            </div>
          )}
        </div>
        <div style={{ padding: '11px 12px 11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={fldLabel}>Moat (ventaja competitiva)</div>
          <div style={fldVal}>{form.moat}</div>
          <div style={fldSub}>{form.moatDesc}</div>
        </div>
        <div style={{ padding: '11px 0 11px 12px', borderBottom: '1px solid var(--border-subtle)', borderLeft: '1px solid var(--border-subtle)' }}>
          <div style={fldLabel}>Incertidumbre</div>
          <div style={fldVal}>{form.uncertainty}</div>
          <div style={fldSub}>
            Qué tan predecibles son los resultados: cuanto más alta, más descuento exige el ranking antes
            de dar muchas estrellas.
          </div>
        </div>
        <div style={{ padding: '11px 12px 11px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={fldLabel}>Market Cap</div>
          <div className="mono" style={fldVal}>{form.mcap || '—'}</div>
        </div>
        <div style={{ padding: '11px 0 11px 12px', borderBottom: '1px solid var(--border-subtle)', borderLeft: '1px solid var(--border-subtle)' }}>
          <div style={fldLabel}>Forward Dividend Yield</div>
          <div className="mono" style={fldVal}>{Number.isFinite(divY) && form.divYield !== '' ? fmtLocal(divY) + '%' : '—'}</div>
          <div style={fldSub}>
            Lo que pagaría en dividendos en un año por cada US$100 invertidos, si mantiene el dividendo
            actual.
          </div>
        </div>
      </div>

      {/* Consenso de analistas */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={fldLabel}>Consenso de analistas</div>
          <span
            style={{
              padding: '3px 11px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: 'var(--pos-bg)',
              color: 'var(--pos-bright)',
            }}
          >
            {consensusTag(cBull, cNeu, cBear)}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
          {cTotal} {cTotal === 1 ? 'analista' : 'analistas'} · targets a ~1 año
        </div>
        <div style={{ display: 'flex', gap: 2, height: 13, marginTop: 10 }}>
          {cBear > 0 && <span style={{ flexGrow: cBear, background: 'var(--neg-bright)', borderRadius: 3, minWidth: 4 }} />}
          {cNeu > 0 && <span style={{ flexGrow: cNeu, background: 'var(--text-muted)', borderRadius: 3, minWidth: 4 }} />}
          {cBull > 0 && <span style={{ flexGrow: cBull, background: 'var(--pos-bright)', borderRadius: 3, minWidth: 4 }} />}
          {cTotal === 0 && <span style={{ flexGrow: 1, background: 'var(--border-subtle)', borderRadius: 3 }} />}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6, fontSize: 13 }}>
          <span>
            <b style={{ color: 'var(--neg-bright)' }}>{cBear}</b> Bajista
          </span>
          <span>
            <b style={{ color: 'var(--text-secondary)' }}>{cNeu}</b> Neutral
          </span>
          <span>
            <b style={{ color: 'var(--pos-bright)' }}>{cBull}</b> Alcista
          </span>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 'clamp(34px, 6vw, 48px)',
            fontWeight: 800,
            lineHeight: 1.05,
            color: consPct != null && consPct < 0 ? 'var(--neg-bright)' : 'var(--pos-bright)',
            marginTop: 10,
          }}
        >
          {consPct != null ? fmtSignedPct(consPct, 1) : '—'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {cAvg > 0
            ? `hasta el promedio de analistas (US$ ${fmtLocal(cAvg)}) — el precio que esperan, en promedio, para dentro de ~1 año`
            : 'hasta el promedio de analistas'}
        </div>
        <div style={{ position: 'relative', height: 66, marginTop: 14 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 25, height: 2, background: 'var(--border-subtle)' }} />
          {scaleMarkers.map(marker)}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
          Cada panel de analistas da un promedio distinto; por eso el Fair Value propio promedia varias
          fuentes en vez de copiar un solo número. Este promedio es una expectativa a ~1 año, no el valor
          de largo plazo de la empresa.
        </p>
      </div>

      {/* Indicadores fundamentales y valuación (método estilo Finviz) */}
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 14, marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={fldLabel}>Indicadores fundamentales y valuación</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Métricas clave de valuación, crecimiento y calidad del negocio (método estilo Finviz).
            </div>
          </div>
          <span
            style={{
              padding: '3px 9px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {detail.meta.ticker}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Valuación */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Valuación
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
              {[
                { label: 'P/E (TTM)', val: fmtRatio(fz?.pe ?? extras?.trailingPE ?? multiples?.pe), tip: 'Precio sobre ganancias pasadas de 12 meses' },
                { label: 'Forward P/E', val: fmtRatio(fz?.forwardPe ?? extras?.forwardPE ?? multiples?.forwardPe), tip: 'Precio sobre ganancias estimadas a 1 año' },
                { label: 'PEG', val: fmtNum(fz?.peg ?? extras?.pegRatio), tip: 'P/E dividido crecimiento esperado (menor a 1 suele indicar buen precio)' },
                { label: 'P/S', val: fmtRatio(fz?.priceToSales ?? extras?.priceToSales), tip: 'Precio sobre ventas (Price to Sales)' },
                { label: 'P/B', val: fmtRatio(fz?.priceToBook ?? extras?.priceToBook), tip: 'Precio sobre valor libros contable (Price to Book)' },
                { label: 'P/C', val: fmtRatio(fz?.priceToCash), tip: 'Precio sobre el efectivo por acción (Price to Cash)' },
                { label: 'P/FCF', val: fmtRatio(fz?.priceToFcf ?? extras?.priceToFreeCashFlow), tip: 'Precio sobre flujo de caja libre (Price to Free Cash Flow)' },
                { label: 'EV/EBITDA', val: fmtRatio(fz?.evToEbitda ?? extras?.evToEbitda ?? multiples?.evToEbitda), tip: 'Enterprise Value sobre EBITDA' },
                { label: 'EV/Sales', val: fmtRatio(fz?.evToSales), tip: 'Enterprise Value sobre ventas: cuánto vale toda la empresa por cada dólar que vende' },
              ].map((m) => (
                <div
                  key={m.label}
                  title={m.tip}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Crecimiento */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Crecimiento
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
              {[
                { label: 'EPS próx. 5 años (CAGR)', val: fmtPct(fz?.epsNext5YPct ?? extras?.epsNext5YGrowthPct), tip: 'Crecimiento anual compuesto esperado del beneficio por acción (EPS) según los analistas para los próximos 5 años (fuente: Finviz). Es el dato clave para valorar una empresa de crecimiento: con él se juzga si el P/E de hoy está caro o barato.' },
                { label: 'EPS este año', val: fmtPct(fz?.epsThisYearPct), tip: 'Crecimiento del beneficio por acción esperado para este año' },
                { label: 'EPS próx. año', val: fmtPct(fz?.epsNextYearPct ?? extras?.epsNextYearGrowthPct), tip: 'Crecimiento de beneficio por acción estimado para el próximo año' },
                { label: 'EPS Y/Y TTM', val: fmtPct(fz?.epsYoyTtmPct ?? extras?.earningsGrowthPct), tip: 'Crecimiento interanual del beneficio por acción de los últimos 12 meses (TTM)' },
                { label: 'EPS Q/Q', val: fmtPct(fz?.epsQqPct), tip: 'Crecimiento del beneficio por acción del último trimestre contra el mismo trimestre del año anterior' },
                { label: 'EPS pasado 5 años', val: fmtPct(fz?.epsPast5YPct), tip: 'Crecimiento anual promedio del beneficio por acción en los últimos 5 años (histórico)' },
                { label: 'EPS pasado 3 años', val: fmtPct(fz?.epsPast3YPct), tip: 'Crecimiento anual promedio del beneficio por acción en los últimos 3 años (histórico)' },
                { label: 'Crec. ingresos Y/Y TTM', val: fmtPct(fz?.salesYoyTtmPct ?? extras?.revenueGrowthPct ?? multiples?.revenueGrowthPct), tip: 'Crecimiento interanual de ingresos de los últimos 12 meses (Revenue Growth TTM)' },
                { label: 'Ventas Q/Q', val: fmtPct(fz?.salesQqPct), tip: 'Crecimiento de ventas del último trimestre contra el mismo trimestre del año anterior' },
                { label: 'Ventas pasadas 5 años', val: fmtPct(fz?.salesPast5YPct), tip: 'Crecimiento anual promedio de las ventas en los últimos 5 años (histórico)' },
                { label: 'Ventas pasadas 3 años', val: fmtPct(fz?.salesPast3YPct), tip: 'Crecimiento anual promedio de las ventas en los últimos 3 años (histórico)' },
              ].map((m) => (
                <div
                  key={m.label}
                  title={m.tip}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rentabilidad & Calidad */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Rentabilidad y Calidad
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
              {[
                { label: roicLabel, val: fmtPct(roicReal ?? extras?.roicProxyPct ?? multiples?.roicProxyPct), tip: roicReal != null ? 'Retorno sobre el capital invertido real (Finviz): cuánto gana la empresa por cada dólar invertido en el negocio' : 'Retorno sobre el capital invertido estimado (proxy): cuánto gana la empresa por cada dólar invertido en el negocio' },
                { label: 'ROE', val: fmtPct(fz?.roePct ?? extras?.roePct ?? multiples?.roePct), tip: 'Rentabilidad sobre el patrimonio neto (Return on Equity)' },
                { label: 'ROA', val: fmtPct(fz?.roaPct ?? extras?.roaPct), tip: 'Rentabilidad sobre los activos totales (Return on Assets)' },
                { label: 'Margen bruto', val: fmtPct(fz?.grossMarginPct ?? extras?.grossMarginPct ?? multiples?.grossMarginPct), tip: 'Ganancia bruta sobre ingresos' },
                { label: 'Margen operativo', val: fmtPct(fz?.operatingMarginPct ?? extras?.operatingMarginPct ?? multiples?.operatingMarginPct), tip: 'Margen antes de intereses e impuestos (EBIT / Ventas)' },
                { label: 'Margen neto', val: fmtPct(fz?.profitMarginPct ?? extras?.profitMarginPct), tip: 'Porcentaje de ventas que queda como ganancia limpia después de todos los gastos e impuestos' },
                { label: 'FCF Yield', val: fmtPct(extras?.fcfYieldPct ?? multiples?.fcfYieldPct), tip: 'Rendimiento de flujo de caja libre sobre capitalización' },
                { label: 'Payout', val: fmtPct(fz?.payoutPct), tip: 'Porcentaje de las ganancias que se reparte como dividendos' },
                { label: 'Dividend Yield (TTM)', val: fmtPct(fz?.dividendTtmPct ?? extras?.dividendYieldPct), tip: 'Dividendo de los últimos 12 meses por cada US$100 invertidos' },
                { label: 'Crec. dividendo 3/5 años', val: divGrowthVal, tip: 'Crecimiento anual promedio del dividendo: últimos 3 años / últimos 5 años' },
              ].map((m) => (
                <div
                  key={m.label}
                  title={m.tip}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Solvencia y Balance */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Solvencia y Balance
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
              {[
                { label: 'Deuda / Patrimonio', val: fmtNum(fz?.debtToEquity ?? extras?.debtToEquity ?? multiples?.debtToEquity), tip: 'Ratio de deuda total sobre patrimonio neto (Debt to Equity)' },
                { label: 'Deuda LP / Patrimonio', val: fmtNum(fz?.ltDebtToEquity), tip: 'Deuda de largo plazo sobre patrimonio neto: el apalancamiento que no vence en el corto plazo' },
                { label: 'Current Ratio', val: fmtNum(fz?.currentRatio ?? extras?.currentRatio), tip: 'Capacidad de cubrir deudas a corto plazo con activos corrientes (mayor a 1 indica solvencia)' },
                { label: 'Quick Ratio', val: fmtNum(fz?.quickRatio ?? extras?.quickRatio), tip: 'Prueba ácida: solvencia de corto plazo sin depender de inventarios' },
                { label: 'Cash por acción', val: fmtUsd(fz?.cashPerShare), tip: 'Efectivo de la empresa por cada acción en circulación' },
                { label: 'Valor libro por acción', val: fmtUsd(fz?.bookPerShare), tip: 'Valor contable (patrimonio neto) por cada acción' },
                { label: 'Market Cap', val: fmtBig(fz?.marketCap ?? extras?.marketCap), tip: 'Valor total de mercado de la empresa (precio × acciones)' },
                { label: 'Enterprise Value', val: fmtBig(fz?.enterpriseValue), tip: 'Valor total de la empresa: capitalización más deuda menos efectivo' },
                { label: 'Ventas TTM', val: fmtBig(fz?.sales), tip: 'Ventas de los últimos 12 meses' },
                { label: 'Ingreso neto TTM', val: fmtBig(fz?.income), tip: 'Ganancia neta de los últimos 12 meses' },
              ].map((m) => (
                <div
                  key={m.label}
                  title={m.tip}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Propiedad y Riesgo */}
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Propiedad y Riesgo
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
              {[
                { label: 'Insider Own', val: fmtPct(fz?.insiderOwnPct), tip: 'Porcentaje de acciones en manos de directivos y fundadores (insiders)' },
                { label: 'Insider Trans', val: fmtPct(fz?.insiderTransPct), tip: 'Variación reciente de la tenencia de insiders: positivo = compraron, negativo = vendieron' },
                { label: 'Inst. Own', val: fmtPct(fz?.instOwnPct), tip: 'Porcentaje de acciones en manos de inversores institucionales (fondos)' },
                { label: 'Inst. Trans', val: fmtPct(fz?.instTransPct), tip: 'Variación reciente de la tenencia institucional' },
                { label: 'Short Float', val: fmtPct(fz?.shortFloatPct ?? extras?.shortFloatPct), tip: 'Porcentaje de acciones en circulación apostadas a la baja (short interest)' },
                { label: 'Short Ratio', val: fmtNum(fz?.shortRatio), tip: 'Días que tardarían los vendidos en corto en recomprar todo (days to cover)' },
                { label: 'Beta', val: fmtNum(fz?.beta ?? extras?.beta), tip: 'Sensibilidad frente a la volatilidad del mercado general (S&P 500 = 1.0)' },
                { label: 'RSI (14)', val: fmtNum(fz?.rsi14), tip: 'Índice de fuerza relativa: sobre 70 suele indicar sobrecompra, bajo 30 sobreventa' },
                { label: 'Volatilidad (mes)', val: fmtPct(fz?.volatilityMonthPct), tip: 'Cuánto se mueve típicamente el precio en un mes' },
              ].map((m) => (
                <div
                  key={m.label}
                  title={m.tip}
                  style={{
                    padding: '7px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{m.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '12px 0 0', borderTop: '1px solid var(--border-subtle)', paddingTop: 9 }}>
          Fuentes: Finviz (foto del día) y Yahoo Finance en vivo. Si una fuente no publica un dato,
          queda «—»: no se estima ni se completa con valores de ejemplo.
        </p>
      </div>

      {persp(1, 'persp1Title', 'persp1Fav', 'persp1Con')}
      {persp(2, 'persp2Title', 'persp2Fav', 'persp2Con')}
      {persp(3, 'persp3Title', 'persp3Fav', 'persp3Con')}

      <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 16, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...fldLabel, flex: 1 }}>Veredicto: ¿comprar, mantener o vender?</div>
          <button
            type="button"
            onClick={() => setEditingVerdict(v => !v)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 4px',
              color: editingVerdict ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              borderRadius: 4,
              flexShrink: 0,
            }}
            title={editingVerdict ? 'Listo' : 'Editar veredicto'}
          >
            <Pencil size={12} /> {editingVerdict ? '✓' : ''}
          </button>
        </div>
        <div style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 800, lineHeight: 1.15, margin: '4px 0 6px' }}>
          {result ? result.verdict : '—'}
        </div>
        {result && (
          <>
            <p style={{ fontSize: 14, margin: '0 0 6px' }}>{result.verdictWhy}</p>
            <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 8px' }}>{result.verdictNote}</p>
          </>
        )}
        {editingVerdict ? (
          <textarea
            style={{ ...inputStyle, minHeight: 60, resize: 'vertical', marginTop: 4 }}
            value={form.verdictDetail}
            onChange={set('verdictDetail')}
            placeholder="Tu análisis personal del veredicto..."
          />
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{form.verdictDetail}</p>
        )}
      </div>



      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 9 }}>
        Ranking y Fair Value propios de este modelo: bandas de exigencia Precio/Fair Value según la
        incertidumbre elegida, y Fair Value por escenarios. No es una recomendación de compra.
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ficha}
        <button
          className="btn btn-ghost"
          onClick={() => setFormOpen((o) => !o)}
          style={{ alignSelf: 'flex-start', fontSize: 12.5 }}
          aria-expanded={formOpen}
        >
          <Pencil size={13} /> {formOpen ? 'Ocultar' : 'Editar'} datos de la ficha
          <ChevronDown size={13} style={{ transform: formOpen ? 'rotate(180deg)' : undefined }} />
        </button>
        {formOpen && formCard}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 320px) minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}
    >
      {formCard}
      {ficha}
    </div>
  );
};
