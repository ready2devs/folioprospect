import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetCandle } from '@/api';

/**
 * Gráfico de precio estilo Finviz (overview del activo):
 * velas OHLC + volumen, medias móviles SMA 20/50/200 y canal de tendencia
 * (regresión lineal sobre máximos y sobre mínimos del período visible,
 * como las líneas que traza Finviz en la captura de referencia).
 *
 * Es una lectura visual secundaria: el análisis que manda en esta app es el
 * fundamental (la ficha de Evaluación de oportunidad de abajo).
 */

export interface FinvizChartProps {
  candles: AssetCandle[];
  /** Cierres [epochMs, close] por si el backend viejo no manda velas. */
  fallbackPoints?: [number, number][];
  fairValue?: number | null;
  height?: number;
}

function smaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Regresión lineal y = a + b·x sobre una serie (para el canal de tendencia). */
function linReg(values: number[]): { a: number; b: number } {
  const n = values.length;
  if (n === 0) return { a: 0, b: 0 };
  const mx = (n - 1) / 2;
  const my = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (values[i] - my);
    den += (i - mx) * (i - mx);
  }
  const b = den > 0 ? num / den : 0;
  return { a: my - b * mx, b };
}

/** Agrega velas si hay demasiadas (p. ej. MAX) para que el SVG quede liviano. */
function downsample(candles: AssetCandle[], max = 320): AssetCandle[] {
  if (candles.length <= max) return candles;
  const stride = Math.ceil(candles.length / max);
  const out: AssetCandle[] = [];
  for (let i = 0; i < candles.length; i += stride) {
    const chunk = candles.slice(i, i + stride);
    out.push({
      t: chunk[0].t,
      o: chunk[0].o,
      h: Math.max(...chunk.map((c) => c.h)),
      l: Math.min(...chunk.map((c) => c.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, c) => s + c.v, 0),
    });
  }
  return out;
}

function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return String(Math.round(v));
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const FinvizChart: React.FC<FinvizChartProps> = ({
  candles: rawCandles,
  fallbackPoints,
  fairValue,
  height = 380,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const w = containerRef.current?.clientWidth;
      if (w && w > 120) setWidth(Math.floor(w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const candles = useMemo(() => {
    let src = rawCandles && rawCandles.length >= 2 ? rawCandles : [];
    if (src.length < 2 && fallbackPoints && fallbackPoints.length >= 2) {
      src = fallbackPoints.map(([t, c], i) => {
        const o = i > 0 ? fallbackPoints[i - 1][1] : c;
        return { t, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 0 };
      });
    }
    return downsample(src);
  }, [rawCandles, fallbackPoints]);

  const closes = useMemo(() => candles.map((c) => c.c), [candles]);
  const sma20 = useMemo(() => smaSeries(closes, 20), [closes]);
  const sma50 = useMemo(() => smaSeries(closes, 50), [closes]);
  const sma200 = useMemo(() => smaSeries(closes, 200), [closes]);
  const hasVolume = useMemo(() => candles.some((c) => c.v > 0), [candles]);

  if (candles.length < 2) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        Sin datos de precio suficientes para graficar este activo en el rango elegido.
      </div>
    );
  }

  const isMobile = width < 640;
  const W = width;
  const H = height;
  const padL = 8;
  const padR = isMobile ? 46 : 58;
  const padT = 30;
  const padB = 20;
  const volH = hasVolume ? Math.round(H * 0.16) : 0;
  const priceH = H - padT - padB - volH;
  const innerW = Math.max(40, W - padL - padR);

  let minP = Infinity;
  let maxP = -Infinity;
  let maxV = 0;
  for (const c of candles) {
    if (c.l < minP) minP = c.l;
    if (c.h > maxP) maxP = c.h;
    if (c.v > maxV) maxV = c.v;
  }
  if (fairValue != null && Number.isFinite(fairValue)) {
    minP = Math.min(minP, fairValue);
    maxP = Math.max(maxP, fairValue);
  }
  const span = maxP - minP || maxP * 0.05 || 1;
  const yMin = Math.max(0, minP - span * 0.04);
  const yMax = maxP + span * 0.04;
  const ySpan = yMax - yMin || 1;

  const x = (i: number) => padL + (i / (candles.length - 1)) * innerW;
  const y = (v: number) => padT + (1 - (v - yMin) / ySpan) * priceH;
  const volY = (v: number) => padT + priceH + volH - (maxV > 0 ? (v / maxV) * volH : 0);

  const candleW = Math.max(1, Math.min(9, (innerW / candles.length) * 0.68));

  const smaPath = (s: (number | null)[]) => {
    let d = '';
    let started = false;
    s.forEach((v, i) => {
      if (v == null) return;
      d += (started ? ' L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1);
      started = true;
    });
    return d;
  };

  // Canal de tendencia: regresión sobre máximos (techo, violeta) y mínimos (piso, azul)
  const regHigh = linReg(candles.map((c) => c.h));
  const regLow = linReg(candles.map((c) => c.l));
  const chanTop = (i: number) => regHigh.a + regHigh.b * i;
  const chanBot = (i: number) => regLow.a + regLow.b * i;

  const active = hover != null && candles[hover] ? hover : candles.length - 1;
  const ac = candles[active];
  const smaAt = (s: (number | null)[], i: number) => {
    for (let j = i; j >= 0; j--) if (s[j] != null) return s[j];
    return null;
  };
  const s20 = smaAt(sma20, active);
  const s50 = smaAt(sma50, active);
  const s200 = smaAt(sma200, active);

  const trendPctPerBar = closes.length > 1 ? regHigh.b : 0;
  const trendLabel =
    Math.abs(trendPctPerBar) < (ySpan / priceH) * 0.02
      ? 'Lateral'
      : regHigh.b < 0
        ? 'Bajista'
        : 'Alcista';

  // Eje de fechas: ~6 marcas
  const dateTicks: { i: number; label: string }[] = [];
  const tickCount = isMobile ? 4 : 6;
  for (let k = 0; k < tickCount; k++) {
    const i = Math.round((k / (tickCount - 1)) * (candles.length - 1));
    const d = new Date(candles[i].t);
    const first = candles[0].t;
    const last = candles[candles.length - 1].t;
    const multiYear = new Date(last).getFullYear() !== new Date(first).getFullYear();
    dateTicks.push({
      i,
      label: multiYear
        ? `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
        : MONTHS[d.getMonth()],
    });
  }
  // Eje de precios: 5 marcas
  const priceTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * ySpan);

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = Math.max(0, Math.min(1, (mx - padL) / innerW));
    setHover(Math.round(ratio * (candles.length - 1)));
  };

  const dLabel = new Date(ac.t).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* Leyenda estilo Finviz: OHLC + Vol + SMAs de la vela activa */}
      <div
        className="mono"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 14px',
          fontSize: 11.5,
          color: 'var(--text-secondary)',
          marginBottom: 4,
          minHeight: 34,
        }}
      >
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{dLabel}</span>
        <span>
          O<span style={{ color: 'var(--text-primary)' }}>{ac.o.toFixed(2)}</span>{' '}
          H<span style={{ color: 'var(--pos-bright, #4ADE80)' }}>{ac.h.toFixed(2)}</span>{' '}
          L<span style={{ color: 'var(--neg-bright, #F87171)' }}>{ac.l.toFixed(2)}</span>{' '}
          C<span style={{ color: 'var(--text-primary)' }}>{ac.c.toFixed(2)}</span>
        </span>
        {hasVolume && (
          <span>
            Vol <span style={{ color: 'var(--text-primary)' }}>{fmtVol(ac.v)}</span>
          </span>
        )}
        {s20 != null && (
          <span style={{ color: '#C084FC' }}>SMA 20 · {s20.toFixed(2)}</span>
        )}
        {s50 != null && (
          <span style={{ color: '#FB923C' }}>SMA 50 · {s50.toFixed(2)}</span>
        )}
        {s200 != null && (
          <span style={{ color: '#A3A34D' }}>SMA 200 · {s200.toFixed(2)}</span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10.5,
            padding: '1px 8px',
            borderRadius: 999,
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
          title="Dirección del canal de tendencia trazado sobre el período visible"
        >
          Canal: {trendLabel}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={handleMove as unknown as React.TouchEventHandler<SVGSVGElement>}
      >
        {/* Grilla horizontal + eje de precios */}
        {priceTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              y1={y(v)}
              x2={W - padR}
              y2={y(v)}
              stroke="var(--border-subtle)"
              strokeDasharray="2,3"
              strokeOpacity={0.7}
            />
            <text
              x={W - padR + 6}
              y={y(v) + 3.5}
              fontSize={10}
              fill="var(--text-muted)"
              fontFamily="JetBrains Mono, monospace"
            >
              {v >= 1000 ? v.toFixed(0) : v >= 100 ? v.toFixed(1) : v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Volumen */}
        {hasVolume &&
          candles.map((c, i) => {
            const top = volY(c.v);
            const up = c.c >= c.o;
            return (
              <rect
                key={'v' + i}
                x={x(i) - candleW / 2}
                y={top}
                width={candleW}
                height={Math.max(0.6, padT + priceH + volH - top)}
                fill={up ? '#16A34A' : '#DC2626'}
                opacity={0.55}
              />
            );
          })}

        {/* Canal de tendencia (debajo de las velas, como en Finviz) */}
        <line
          x1={x(0)}
          y1={y(chanTop(0))}
          x2={x(candles.length - 1)}
          y2={y(chanTop(candles.length - 1))}
          stroke="#A855F7"
          strokeWidth={1.2}
          strokeOpacity={0.75}
        />
        <line
          x1={x(0)}
          y1={y(chanBot(0))}
          x2={x(candles.length - 1)}
          y2={y(chanBot(candles.length - 1))}
          stroke="#38BDF8"
          strokeWidth={1.2}
          strokeOpacity={0.75}
        />

        {/* Fair Value (referencia fundamental, punteada ámbar) */}
        {fairValue != null && Number.isFinite(fairValue) && (
          <g>
            <line
              x1={padL}
              y1={y(fairValue)}
              x2={W - padR}
              y2={y(fairValue)}
              stroke="#F59E0B"
              strokeWidth={1.2}
              strokeDasharray="5,4"
              strokeOpacity={0.8}
            />
            <text
              x={W - padR + 6}
              y={y(fairValue) - 4}
              fontSize={9.5}
              fill="#F59E0B"
              fontFamily="JetBrains Mono, monospace"
              fontWeight={600}
            >
              FV {fairValue.toFixed(fairValue >= 100 ? 0 : 1)}
            </text>
          </g>
        )}

        {/* SMAs */}
        {sma20.some((v) => v != null) && (
          <path d={smaPath(sma20)} fill="none" stroke="#C084FC" strokeWidth={1.3} strokeOpacity={0.9} />
        )}
        {sma50.some((v) => v != null) && (
          <path d={smaPath(sma50)} fill="none" stroke="#FB923C" strokeWidth={1.3} strokeOpacity={0.9} />
        )}
        {sma200.some((v) => v != null) && (
          <path d={smaPath(sma200)} fill="none" stroke="#A3A34D" strokeWidth={1.3} strokeOpacity={0.9} />
        )}

        {/* Velas */}
        {candles.map((c, i) => {
          const up = c.c >= c.o;
          const color = up ? '#22C55E' : '#EF4444';
          const cx = x(i);
          return (
            <g key={i}>
              <line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} stroke={color} strokeWidth={1} />
              <rect
                x={cx - candleW / 2}
                y={y(Math.max(c.o, c.c))}
                width={candleW}
                height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
                fill={color}
              />
            </g>
          );
        })}

        {/* Precio actual: etiqueta a la derecha */}
        <g>
          <rect
            x={W - padR + 2}
            y={y(ac.c) - 8}
            width={padR - 4}
            height={16}
            rx={3}
            fill={ac.c >= ac.o ? '#16A34A' : '#DC2626'}
            opacity={hover != null ? 0.55 : 0.95}
          />
          <text
            x={W - padR + padR / 2}
            y={y(ac.c) + 3.5}
            fontSize={10}
            fill="#fff"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
            fontWeight={700}
          >
            {ac.c.toFixed(2)}
          </text>
        </g>

        {/* Crosshair */}
        {hover != null && candles[hover] && (
          <g>
            <line
              x1={x(hover)}
              y1={padT}
              x2={x(hover)}
              y2={padT + priceH + volH}
              stroke="var(--border-strong)"
              strokeDasharray="3,3"
            />
            <circle cx={x(hover)} cy={y(candles[hover].c)} r={3.5} fill="var(--text-primary)" />
          </g>
        )}

        {/* Eje de fechas */}
        {dateTicks.map(({ i, label }, k) => (
          <text
            key={k}
            x={x(i)}
            y={H - 5}
            fontSize={10}
            fill="var(--text-muted)"
            textAnchor="middle"
            fontFamily="JetBrains Mono, monospace"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
};
