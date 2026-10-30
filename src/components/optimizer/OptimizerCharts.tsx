import React, { useState } from 'react';
import { fmtPairPct, type AssetScore, type PortfolioMetrics } from '@shared/engine';
import { InfoTip } from './InfoTip';

export const fmtUsd = (n: number) => 'US$ ' + Math.round(n).toLocaleString('es-AR');
export const fmtPct = (n: number) => n.toFixed(1).replace('.', ',') + '%';
export const fmtY = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','));

export const BAND_COLORS = ['#10B981', '#4ADE80', '#A3E635', '#FACC15', '#FB923C', '#F87171'];
export const bandColor = (t: number | null): string => {
  if (t == null) return '#64748B';
  if (t < 3) return BAND_COLORS[0];
  if (t < 5) return BAND_COLORS[1];
  if (t < 7) return BAND_COLORS[2];
  if (t < 10) return BAND_COLORS[3];
  if (t < 15) return BAND_COLORS[4];
  return BAND_COLORS[5];
};

/* ================= Evolución ================= */
const HORIZONS = [1, 3, 5, 10, 20];

export const EvolutionChart: React.FC<{ before: PortfolioMetrics; after: PortfolioMetrics }> = ({
  before,
  after,
}) => {
  const [horizon, setHorizon] = useState(10);
  const [mode, setMode] = useState<'actual' | 'opt' | 'both'>('both');
  const W = 1000;
  const H = 300;
  const P = { l: 58, r: 14, t: 12, b: 26 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const V0 = before.totalValue;
  const year0 = new Date().getFullYear();

  const maxV = Math.max(
    V0 * Math.pow(1 + Math.max(before.expectedReturnGeoPct, after.expectedReturnGeoPct) / 100, horizon) *
      Math.exp(1.2816 * (Math.max(before.volatilityPct, after.volatilityPct) / 100) * Math.sqrt(horizon) * 0.6),
    V0 * 2.2
  );
  const X = (t: number) => P.l + (iw * t) / horizon;
  const Y = (v: number) => P.t + ih * (1 - v / maxV);
  const line = (re: number) => {
    let d = '';
    for (let t = 0; t <= horizon; t += horizon / 40) {
      const v = V0 * Math.pow(1 + re / 100, t);
      d += `${t === 0 ? 'M' : 'L'}${X(t).toFixed(1)} ${Y(v).toFixed(1)} `;
    }
    return d;
  };
  const band = (re: number, vol: number) => {
    let top = '';
    let bot = '';
    const k = 1.2816 * (vol / 100) * 0.6;
    for (let t = 0; t <= horizon; t += horizon / 20) {
      const med = V0 * Math.pow(1 + re / 100, t);
      top += `L${X(t).toFixed(1)} ${Y(med * Math.exp(k * Math.sqrt(t))).toFixed(1)} `;
      bot = `L${X(t).toFixed(1)} ${Y(med * Math.exp(-k * Math.sqrt(t))).toFixed(1)} ` + bot;
    }
    return `M${X(0)} ${Y(V0)} ${top}${bot} Z`;
  };
  const endV = (re: number) => V0 * Math.pow(1 + re / 100, horizon);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));

  return (
    <section className="opt-chart">
      <div className="opt-chart-head">
        <div>
          <h3>
            Evolución del portafolio <InfoTip k="retorno" />
          </h3>
          <div className="opt-hint">Proyección esperada + banda P10–P90 · línea punteada = duplicación (2×)</div>
        </div>
        <div className="opt-controls">
          <div className="opt-pills">
            {HORIZONS.map((h) => (
              <button key={h} type="button" className={'opt-pill' + (horizon === h ? ' on' : '')} onClick={() => setHorizon(h)}>
                {h} año{h > 1 ? 's' : ''}
              </button>
            ))}
          </div>
          <div className="opt-seg">
            <button type="button" className={mode === 'actual' ? 'on' : ''} onClick={() => setMode('actual')}>Actual</button>
            <button type="button" className={mode === 'opt' ? 'on' : ''} onClick={() => setMode('opt')}>Optimizada</button>
            <button type="button" className={mode === 'both' ? 'on' : ''} onClick={() => setMode('both')}>Comparar</button>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="opt-svg" role="img" aria-label="Evolución proyectada del portafolio">
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={P.l} y1={Y(v)} x2={W - P.r} y2={Y(v)} stroke="#16202F" />
            <text x={P.l - 7} y={Y(v) + 4} fill="#64748B" fontSize="10.5" textAnchor="end">
              {v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={X(horizon * f)} y={H - 6} fill="#64748B" fontSize="10.5" textAnchor="middle">
            {year0 + Math.round(horizon * f)}
          </text>
        ))}
        <line x1={P.l} y1={Y(V0 * 2)} x2={W - P.r} y2={Y(V0 * 2)} stroke="#F59E0B" strokeDasharray="5 5" opacity="0.65" />
        <text x={W - P.r - 4} y={Y(V0 * 2) - 6} fill="#F59E0B" fontSize="10.5" textAnchor="end">
          Duplicación · {fmtUsd(V0 * 2)}
        </text>
        {(mode === 'actual' || mode === 'both') && (
          <>
            <path d={band(before.expectedReturnGeoPct, before.volatilityPct)} fill="#38BDF8" opacity="0.07" />
            <path d={line(before.expectedReturnGeoPct)} fill="none" stroke="#38BDF8" strokeWidth="2.2" />
            <text x={X(horizon) - 6} y={Y(endV(before.expectedReturnGeoPct)) - 9} fill="#7DD3FC" fontSize="12.5" fontWeight="700" textAnchor="end">
              {fmtUsd(endV(before.expectedReturnGeoPct))}
            </text>
          </>
        )}
        {(mode === 'opt' || mode === 'both') && (
          <>
            <path d={band(after.expectedReturnGeoPct, after.volatilityPct)} fill="#10B981" opacity="0.08" />
            <path d={line(after.expectedReturnGeoPct)} fill="none" stroke="#10B981" strokeWidth="2.6" />
            <text x={X(horizon) - 6} y={Y(endV(after.expectedReturnGeoPct)) - 9} fill="#4ADE80" fontSize="12.5" fontWeight="700" textAnchor="end">
              {fmtUsd(endV(after.expectedReturnGeoPct))}
            </text>
          </>
        )}
      </svg>
      <div className="opt-avgline">
        <span>— <b>Cartera actual</b> · {fmtUsd(endV(before.expectedReturnGeoPct))} a {horizon} años</span>
        <span>— <b className="opt-green">Cartera optimizada</b> · {fmtUsd(endV(after.expectedReturnGeoPct))}</span>
        <span>
          Diferencia: <b className="opt-green">+{fmtUsd(endV(after.expectedReturnGeoPct) - endV(before.expectedReturnGeoPct))}</b>
        </span>
      </div>
    </section>
  );
};

/* ================= Burbujas riesgo/beneficio ================= */
export const BubbleChart: React.FC<{
  beforeAssets: AssetScore[];
  afterAssets: AssetScore[];
  before: PortfolioMetrics;
  after: PortfolioMetrics;
  verdict: 'valida' | 'evaluar' | 'sin-mejora';
  verdictText: string;
}> = ({ beforeAssets, afterAssets, before, after, verdict, verdictText }) => {
  const [mode, setMode] = useState<'prev' | 'new' | 'both'>('both');
  const W = 1000;
  const H = 330;
  const P = { l: 52, r: 16, t: 14, b: 34 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const pts = [...beforeAssets, ...afterAssets].filter((a) => !a.isCash && a.expectedReturnPct != null);
  const xMax = Math.min(85, Math.max(45, ...pts.map((a) => a.volatilityPct)) * 1.12);
  const yMax = Math.max(18, ...pts.map((a) => a.expectedReturnPct ?? 0)) * 1.18;
  const yMin = Math.min(-3, ...pts.map((a) => a.expectedReturnPct ?? 0)) * 1.2;
  const X = (v: number) => P.l + (iw * (v - 5)) / (xMax - 5);
  const Y = (v: number) => P.t + ih * (1 - (v - yMin) / (yMax - yMin));
  const R = (w: number) => 8 + Math.sqrt(Math.max(w, 0.4)) * 4.6;

  const renderBubbles = (list: AssetScore[], ghost: boolean) =>
    list
      .filter((a) => !a.isCash && a.expectedReturnPct != null)
      .map((a) => {
        const c = bandColor(a.yearsToDouble);
        const r = R(a.weightPct);
        return (
          <g key={(ghost ? 'g' : 'n') + a.symbol}>
            <circle
              cx={X(a.volatilityPct)}
              cy={Y(a.expectedReturnPct!)}
              r={r}
              fill={ghost ? 'none' : c}
              fillOpacity={ghost ? 0 : 0.34}
              stroke={c}
              strokeOpacity={ghost ? 0.55 : 0.9}
              strokeWidth={ghost ? 1.2 : 1}
              strokeDasharray={ghost ? '3 3' : undefined}
            >
              <title>{`${a.ticker} · riesgo ${fmtPct(a.volatilityPct)} · beneficio ${fmtPct(a.expectedReturnPct!)} · peso ${fmtPct(a.weightPct)}${a.score != null ? ` · score ${a.score}` : ''}`}</title>
            </circle>
            {r >= 12 && (
              <text x={X(a.volatilityPct)} y={Y(a.expectedReturnPct!) + 3.5} fill="#E2E8F0" fontSize="9.5" fontWeight="700" textAnchor="middle" opacity={ghost ? 0.55 : 1}>
                {a.ticker}
              </text>
            )}
          </g>
        );
      });

  const avgMark = (m: PortfolioMetrics, color: string, filled: boolean, label: string, dy: number) => (
    <g>
      <line x1={X(m.volatilityPct)} y1={P.t} x2={X(m.volatilityPct)} y2={H - P.b} stroke={color} strokeDasharray="4 5" opacity="0.5" />
      <line x1={P.l} y1={Y(m.expectedReturnGeoPct)} x2={W - P.r} y2={Y(m.expectedReturnGeoPct)} stroke={color} strokeDasharray="4 5" opacity="0.5" />
      <path
        d={`M ${X(m.volatilityPct)} ${Y(m.expectedReturnGeoPct) - 9} L ${X(m.volatilityPct) + 9} ${Y(m.expectedReturnGeoPct)} L ${X(m.volatilityPct)} ${Y(m.expectedReturnGeoPct) + 9} L ${X(m.volatilityPct) - 9} ${Y(m.expectedReturnGeoPct)} Z`}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth="2"
      />
      <text x={X(m.volatilityPct) + 13} y={Y(m.expectedReturnGeoPct) + dy} fill={color} fontSize="11.5" fontWeight="700">
        {label}
      </text>
    </g>
  );

  return (
    <section className="opt-chart">
      <div className="opt-chart-head">
        <div>
          <h3>
            Riesgo / Beneficio por posición <InfoTip k="burbujas" />
          </h3>
          <div className="opt-hint">Cada burbuja es un activo · tamaño = peso · color = años para duplicar</div>
        </div>
        <div className="opt-seg">
          <button type="button" className={mode === 'prev' ? 'on' : ''} onClick={() => setMode('prev')}>Anterior</button>
          <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>Nuevo</button>
          <button type="button" className={mode === 'both' ? 'on' : ''} onClick={() => setMode('both')}>Comparar</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="opt-svg" role="img" aria-label="Burbujas de riesgo y beneficio por posición">
        <rect x={X(5)} y={Y(yMax)} width={Math.max(0, X(Math.min(28, xMax)) - X(5))} height={Math.max(0, Y(yMax * 0.52) - Y(yMax))} fill="#10B981" opacity="0.05" />
        {[10, 20, 30, 40, 50, 60, 70, 80].filter((v) => v < xMax).map((v) => (
          <g key={'x' + v}>
            <line x1={X(v)} y1={P.t} x2={X(v)} y2={H - P.b} stroke="#111A29" />
            <text x={X(v)} y={H - 16} fill="#64748B" fontSize="10" textAnchor="middle">{v}%</text>
          </g>
        ))}
        {[0, 3, 6, 9, 12, 15, 18].filter((v) => v >= yMin && v <= yMax).map((v) => (
          <g key={'y' + v}>
            <line x1={P.l} y1={Y(v)} x2={W - P.r} y2={Y(v)} stroke="#111A29" />
            <text x={P.l - 7} y={Y(v) + 4} fill="#64748B" fontSize="10" textAnchor="end">{v}%</text>
          </g>
        ))}
        <text x={P.l + iw / 2} y={H - 1} fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="600">Riesgo · volatilidad anual</text>
        <text x={13} y={P.t + ih / 2} fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="600" transform={`rotate(-90 13 ${P.t + ih / 2})`}>
          Beneficio · retorno esperado anual
        </text>
        {(mode === 'prev' || mode === 'both') && renderBubbles(beforeAssets, mode === 'both')}
        {(mode === 'new' || mode === 'both') && renderBubbles(afterAssets, false)}
        {(mode === 'prev' || mode === 'both') && avgMark(before, '#94A3B8', false, 'Promedio anterior', 15)}
        {(mode === 'new' || mode === 'both') && avgMark(after, '#10B981', true, 'Promedio nuevo', -13)}
      </svg>
      <div className="opt-avgline">
        <span>◆ <b>Promedio anterior:</b> riesgo {fmtPairPct(before.volatilityPct, after.volatilityPct)[0]} · beneficio {fmtPairPct(before.expectedReturnGeoPct, after.expectedReturnGeoPct)[0]}</span>
        <span className="opt-green">● <b>Promedio nuevo:</b> riesgo {fmtPairPct(before.volatilityPct, after.volatilityPct)[1]} · beneficio {fmtPairPct(before.expectedReturnGeoPct, after.expectedReturnGeoPct)[1]}</span>
        {mode === 'both' && <span>Burbuja punteada = posición anterior · llena = nueva</span>}
      </div>
      <div className={`opt-verdict ${verdict}`}>
        <span className="opt-verdict-ic">{verdict === 'valida' ? '✓' : verdict === 'evaluar' ? '!' : '—'}</span>
        <span>{verdictText}</span>
      </div>
    </section>
  );
};
