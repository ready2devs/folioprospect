import React, { useMemo, useState } from 'react';
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
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  margin: '13px 0 5px',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 7,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  font: 'inherit',
  fontSize: 14,
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
  // Marcadores de la escala del consenso. Si dos quedan a menos de ~11% de
  // distancia, el segundo va en «nivel alto»: valor corrido hacia arriba y
  // nombre corrido hacia abajo, para que las etiquetas no se pisen.
  const markerData = [
    { val: price, name: 'Actual', color: 'var(--text-primary)', bold: true },
    { val: cMin, name: 'Mínimo', color: 'var(--text-muted)', bold: false },
    { val: cAvg, name: 'Promedio', color: 'var(--pos-bright)', bold: true },
    { val: cMax, name: 'Máximo', color: 'var(--text-muted)', bold: false },
  ]
    .filter((m) => m.val > 0)
    .map((m) => ({ ...m, pct: Math.max(3, Math.min(97, (m.val / scaleMax) * 100)) }))
    .sort((a, b) => a.pct - b.pct);
  {
    let lastPct = -100;
    let lastAlt = false;
    for (const m of markerData) {
      const close = m.pct - lastPct < 11;
      (m as { alt?: boolean }).alt = close ? !lastAlt : false;
      lastAlt = (m as { alt?: boolean }).alt ?? false;
      lastPct = m.pct;
    }
  }
  const marker = (m: (typeof markerData)[number]) => {
    const alt = (m as { alt?: boolean }).alt ?? false;
    return (
      <div
        key={m.name}
        style={{ position: 'absolute', left: m.pct + '%', top: 0, transform: 'translateX(-50%)', textAlign: 'center' }}
      >
        <div
          className="mono"
          style={{
            fontSize: 11,
            fontWeight: m.bold ? 800 : 600,
            whiteSpace: 'nowrap',
            transform: alt ? 'translateY(-13px)' : undefined,
          }}
        >
          US$ {fmtLocal(m.val, m.val % 1 === 0 ? 0 : 2)}
        </div>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: m.color,
            margin: '2px auto 1px',
            border: '2px solid var(--bg-surface)',
          }}
        />
        <div
          style={{
            fontSize: 10.5,
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            marginTop: alt ? 13 : undefined,
          }}
        >
          {m.name}
        </div>
      </div>
    );
  };

  const divY = parseLocalNum(form.divYield);
  const multiples = detail.fairValue?.multiples;

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

        <label style={labelStyle}>Lectura 1 · título</label>
        <input style={inputStyle} value={form.persp1Title} onChange={set('persp1Title')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 8 }}>
          <textarea style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={form.persp1Fav} onChange={set('persp1Fav')} aria-label="Lectura 1 a favor" />
          <textarea style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={form.persp1Con} onChange={set('persp1Con')} aria-label="Lectura 1 en contra" />
        </div>
        <label style={labelStyle}>Lectura 2 · título</label>
        <input style={inputStyle} value={form.persp2Title} onChange={set('persp2Title')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 8 }}>
          <textarea style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={form.persp2Fav} onChange={set('persp2Fav')} aria-label="Lectura 2 a favor" />
          <textarea style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={form.persp2Con} onChange={set('persp2Con')} aria-label="Lectura 2 en contra" />
        </div>
        <label style={labelStyle}>Lectura 3 · título</label>
        <input style={inputStyle} value={form.persp3Title} onChange={set('persp3Title')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 8 }}>
          <textarea style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={form.persp3Fav} onChange={set('persp3Fav')} aria-label="Lectura 3 a favor" />
          <textarea style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} value={form.persp3Con} onChange={set('persp3Con')} aria-label="Lectura 3 en contra" />
        </div>
        <label style={labelStyle}>Veredicto · cómo se pondera este caso</label>
        <textarea
          style={{ ...inputStyle, minHeight: 74, resize: 'vertical' }}
          value={form.verdictDetail}
          onChange={set('verdictDetail')}
        />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>{form.seedNote}</p>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Resumen de la empresa</div>
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
    </div>
  );

  const persp = (title: string, fav: string, con: string) => (
    <div key={title} style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 14, paddingTop: 12 }}>
      <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
        <div style={{ borderRadius: 8, padding: '10px 12px', fontSize: 13.5, background: 'var(--pos-bg)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--pos-bright)', marginBottom: 4 }}>
            A FAVOR
          </div>
          <p style={{ margin: 0 }}>{fav}</p>
        </div>
        <div style={{ borderRadius: 8, padding: '10px 12px', fontSize: 13.5, background: 'var(--neg-bg)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--neg-bright)', marginBottom: 4 }}>
            EN CONTRA
          </div>
          <p style={{ margin: 0 }}>{con}</p>
        </div>
      </div>
    </div>
  );

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
        <div style={{ position: 'relative', height: 66, marginTop: 30 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 2, background: 'var(--border-subtle)' }} />
          {markerData.map(marker)}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
          Cada panel de analistas da un promedio distinto; por eso el Fair Value propio promedia varias
          fuentes en vez de copiar un solo número. Este promedio es una expectativa a ~1 año, no el valor
          de largo plazo de la empresa.
        </p>
      </div>

      {form.core && <p style={{ paddingTop: 14, fontSize: 14.5, margin: 0 }}>{form.core}</p>}

      {persp(form.persp1Title, form.persp1Fav, form.persp1Con)}
      {persp(form.persp2Title, form.persp2Fav, form.persp2Con)}
      {persp(form.persp3Title, form.persp3Fav, form.persp3Con)}

      <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 16, paddingTop: 12 }}>
        <div style={fldLabel}>Veredicto: ¿comprar, mantener o vender?</div>
        <div style={{ fontSize: 'clamp(20px, 3.5vw, 26px)', fontWeight: 800, lineHeight: 1.15, margin: '4px 0 6px' }}>
          {result ? result.verdict : '—'}
        </div>
        {result && (
          <>
            <p style={{ fontSize: 14, margin: '0 0 6px' }}>{result.verdictWhy}</p>
            <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 8px' }}>{result.verdictNote}</p>
          </>
        )}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{form.verdictDetail}</p>
      </div>

      {multiples && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 14, paddingTop: 12 }}>
          <div style={{ ...fldLabel, marginBottom: 8 }}>Múltiplos clave (en vivo)</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: 7 }}>
            {[
              { label: 'P/E', val: multiples.pe ? multiples.pe.toFixed(1) + 'x' : '—' },
              { label: 'Forward P/E', val: multiples.forwardPe ? multiples.forwardPe.toFixed(1) + 'x' : '—' },
              { label: 'EV/EBITDA', val: multiples.evToEbitda ? multiples.evToEbitda.toFixed(1) + 'x' : '—' },
              { label: 'FCF Yield', val: multiples.fcfYieldPct != null ? multiples.fcfYieldPct.toFixed(1) + '%' : '—' },
              { label: 'ROIC (proxy)', val: multiples.roicProxyPct != null ? multiples.roicProxyPct.toFixed(1) + '%' : '—' },
              { label: 'Margen bruto', val: multiples.grossMarginPct != null ? multiples.grossMarginPct.toFixed(1) + '%' : '—' },
              { label: 'Margen operativo', val: multiples.operatingMarginPct != null ? multiples.operatingMarginPct.toFixed(1) + '%' : '—' },
              { label: 'ROE', val: multiples.roePct != null ? multiples.roePct.toFixed(1) + '%' : '—' },
              { label: 'Crec. ventas', val: multiples.revenueGrowthPct != null ? multiples.revenueGrowthPct.toFixed(1) + '%' : '—' },
              { label: 'Deuda/Patrimonio', val: multiples.debtToEquity != null ? multiples.debtToEquity.toFixed(2) : '—' },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  padding: '8px 9px',
                  borderRadius: 6,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{m.label}</div>
                <div className="mono" style={{ fontWeight: 700, fontSize: 12.5 }}>{m.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
        gridTemplateColumns: 'minmax(290px, 370px) minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}
    >
      {formCard}
      {ficha}
    </div>
  );
};
