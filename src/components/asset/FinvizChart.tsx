import React, { useEffect, useMemo, useRef } from 'react';
import type { AssetCandle } from '@/api';
import { createChart, ColorType, LineStyle, CrosshairMode } from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  CandlestickData,
  LineData,
  HistogramData,
  SeriesMarker,
  Time,
} from 'lightweight-charts';

/**
 * Gráfico de precio interactivo estilo TradingView:
 * velas OHLC + volumen, medias móviles SMA 20/50/200 y línea de Fair Value.
 * Usa lightweight-charts (TradingView) para zoom, scroll y crosshair nativos.
 *
 * Es una lectura visual secundaria: el análisis que manda en esta app es el
 * fundamental (la ficha de Evaluación de oportunidad de abajo).
 */

export interface FinvizChartProps {
  candles: AssetCandle[];
  /** Cierres [epochMs, close] por si el backend viejo no manda velas. */
  fallbackPoints?: [number, number][];
  fairValue?: number | null;
  /** Fechas de balances (YYYY-MM-DD) a marcar con un círculo ámbar «E». */
  earningsDates?: string[];
  /** Dividendos ex-date a marcar con un círculo azul «D» sobre el eje temporal. */
  dividendEvents?: { date: string; amount: number }[];
  height?: number;
}

/* ─── Helpers ─────────────────────────────────────────────────── */

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

/** Elimina velas degeneradas del final (Yahoo a veces envía una vela en curso con O=H=L=C, v=0). */
function cleanCandles(src: AssetCandle[]): AssetCandle[] {
  const out = [...src];
  while (
    out.length > 1 &&
    (out[out.length - 1].v || 0) === 0 &&
    out[out.length - 1].o === out[out.length - 1].h &&
    out[out.length - 1].h === out[out.length - 1].l &&
    out[out.length - 1].l === out[out.length - 1].c
  ) {
    out.pop();
  }
  return out;
}

/** Convierte timestamp en milisegundos a segundos como UTCTimestamp. */
function toUTC(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

/* ─── Detección de patrón técnico (herencia del SVG original) ── */

interface Pivot { i: number; v: number; kind: 'H' | 'L' }
interface TrendLine { i0: number; v0: number; slope: number }
const lineAt = (l: TrendLine, i: number) => l.v0 + l.slope * (i - l.i0);

function zigzagPivots(candles: AssetCandle[], rev: number): Pivot[] {
  const pivots: Pivot[] = [];
  if (candles.length < 3) return pivots;
  let trend: 'up' | 'down' | null = null;
  let candH = { i: 0, v: candles[0].h };
  let candL = { i: 0, v: candles[0].l };
  for (let i = 1; i < candles.length; i++) {
    const { h, l } = candles[i];
    if (trend === null) {
      if (h > candH.v) candH = { i, v: h };
      if (l < candL.v) candL = { i, v: l };
      if (l <= candH.v * (1 - rev) && candH.i < i) {
        pivots.push({ ...candH, kind: 'H' }); trend = 'down'; candL = { i, v: l };
      } else if (h >= candL.v * (1 + rev) && candL.i < i) {
        pivots.push({ ...candL, kind: 'L' }); trend = 'up'; candH = { i, v: h };
      }
      continue;
    }
    if (trend === 'up') {
      if (h > candH.v) candH = { i, v: h };
      if (l <= candH.v * (1 - rev)) { pivots.push({ ...candH, kind: 'H' }); trend = 'down'; candL = { i, v: l }; }
    } else {
      if (l < candL.v) candL = { i, v: l };
      if (h >= candL.v * (1 + rev)) { pivots.push({ ...candL, kind: 'L' }); trend = 'up'; candH = { i, v: h }; }
    }
  }
  if (trend === 'up') pivots.push({ ...candH, kind: 'H' });
  else if (trend === 'down') pivots.push({ ...candL, kind: 'L' });
  return pivots;
}

function bestAnchoredLine(pivots: Pivot[], candles: AssetCandle[], side: 'H' | 'L'): TrendLine | null {
  const n = candles.length;
  const sidePivots = pivots.filter(p => p.kind === side);
  if (sidePivots.length < 2) return null;
  const usable = sidePivots.filter(p => p.i <= n * 0.85);
  const pool = usable.length >= 2 ? usable : sidePivots;
  const anchor1 = side === 'H'
    ? pool.reduce((a, b) => (b.v > a.v ? b : a))
    : pool.reduce((a, b) => (b.v < a.v ? b : a));
  const minGap = Math.max(5, Math.round(n * 0.08));
  const later = sidePivots.filter(p => p.i >= anchor1.i + minGap);
  if (later.length === 0) return null;
  let best: { line: TrendLine; score: number } | null = null;
  for (const q of later) {
    const slope = (q.v - anchor1.v) / (q.i - anchor1.i);
    const line: TrendLine = { i0: anchor1.i, v0: anchor1.v, slope };
    const endVal = lineAt(line, n - 1);
    const lastClose = candles[n - 1].c;
    if (endVal <= 0 || endVal > lastClose * 2.4 || endVal < lastClose * 0.35) continue;
    let touches = 0; let pivotBreaks = 0;
    for (const pv of sidePivots) {
      if (pv.i < anchor1.i) continue;
      const lv = lineAt(line, pv.i);
      const rel = (pv.v - lv) / lv;
      if (Math.abs(rel) <= 0.015) touches++;
      if (side === 'H' && rel > 0.025) pivotBreaks++;
      if (side === 'L' && rel < -0.025) pivotBreaks++;
    }
    let closeBreaks = 0;
    for (let i = q.i; i < n; i++) {
      const lv = lineAt(line, i);
      if (side === 'H' && candles[i].c > lv * 1.015) closeBreaks++;
      if (side === 'L' && candles[i].c < lv * 0.985) closeBreaks++;
    }
    const score = touches * 2 + (q.i / n) * 2 + (q.i - anchor1.i) / n - pivotBreaks * 3 - closeBreaks * 0.35;
    if (!best || score > best.score) best = { line, score };
  }
  if (best) return best.line;
  const q = later[later.length - 1];
  return { i0: anchor1.i, v0: anchor1.v, slope: (q.v - anchor1.v) / (q.i - anchor1.i) };
}

export interface TechnicalTrendResult {
  topLine: TrendLine | null;
  botLine: TrendLine | null;
  label: string;
}

function computeTrendPattern(candles: AssetCandle[]): TechnicalTrendResult {
  if (candles.length < 10) return { topLine: null, botLine: null, label: '' };
  const medianRangePct = (() => {
    const rs = candles
      .map(c => (c.c > 0 ? (c.h - c.l) / c.c : 0))
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    return rs.length ? rs[Math.floor(rs.length / 2)] : 0.02;
  })();
  const revThreshold = candles.length <= 70
    ? Math.min(0.03, Math.max(0.008, medianRangePct * 1.6))
    : Math.min(0.11, Math.max(0.035, medianRangePct * 1.9));
  const pivots = zigzagPivots(candles, revThreshold);
  const topLine = bestAnchoredLine(pivots, candles, 'H');
  const botLine = bestAnchoredLine(pivots, candles, 'L');
  const closes = candles.map(c => c.c);
  const midPrice = closes[Math.floor(closes.length / 2)] || 1;
  const linReg = (values: number[]) => {
    const n = values.length;
    if (n === 0) return { a: 0, b: 0 };
    const mx = (n - 1) / 2;
    const my = values.reduce((s, v) => s + v, 0) / n;
    let num = 0; let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - mx) * (values[i] - my);
      den += (i - mx) * (i - mx);
    }
    const b = den > 0 ? num / den : 0;
    return { a: my - b * mx, b };
  };
  const regHigh = linReg(candles.map(c => c.h));
  const regLow = linReg(candles.map(c => c.l));
  const driftOf = (l: TrendLine | null, regB: number) =>
    (((l ? l.slope : regB) * Math.max(1, candles.length - 1)) / midPrice) * 100;
  const driftR = driftOf(topLine, regHigh.b);
  const driftS = driftOf(botLine, regLow.b);
  const FLAT = 4;
  const rDown = driftR < -FLAT; const rUp = driftR > FLAT;
  const sDown = driftS < -FLAT; const sUp = driftS > FLAT;
  let label = 'Canal lateral';
  if (rDown && sUp) label = 'Cuña convergente';
  else if (rUp && sDown) label = 'Cuña expansiva';
  else if (rDown && sDown) label = Math.abs(driftR - driftS) < 6 ? 'Canal bajista' : 'Cuña bajista';
  else if (rUp && sUp) label = Math.abs(driftR - driftS) < 6 ? 'Canal alcista' : 'Cuña alcista';
  else if (!rDown && !rUp && sUp) label = 'Triángulo ascendente';
  else if (rDown && !sDown && !sUp) label = 'Triángulo descendente';
  else if (rUp && !sDown && !sUp) label = 'Soporte roto al alza';
  else if (sDown && !rDown && !rUp) label = 'Resistencia en caída';

  return { topLine, botLine, label };
}

function trendLineToSeriesData(line: TrendLine | null, candles: AssetCandle[]): LineData<Time>[] {
  if (!line || candles.length < 2) return [];
  const points: LineData<Time>[] = [];
  const startIdx = Math.max(0, Math.min(line.i0, candles.length - 2));
  for (let i = startIdx; i < candles.length; i++) {
    const val = lineAt(line, i);
    if (val > 0 && Number.isFinite(val)) {
      points.push({
        time: toUTC(candles[i].t) as Time,
        value: Number(val.toFixed(2)),
      });
    }
  }
  return points;
}

/* ─── Fallback simple (sin velas) ────────────────────────────── */

const SimpleFallback: React.FC<{ points: [number, number][]; height: number }> = ({ points, height }) => {
  if (points.length < 2) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        Sin datos de precio suficientes para graficar este activo en el rango elegido.
      </div>
    );
  }
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(42,46,57,0.3)' },
        horzLines: { color: 'rgba(42,46,57,0.3)' },
      },
      timeScale: { borderColor: '#1F2937' },
      rightPriceScale: { borderColor: '#1F2937' },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const lineSeries = chart.addLineSeries({
      color: '#38BDF8',
      lineWidth: 2,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#38BDF8',
      crosshairMarkerBackgroundColor: '#38BDF8',
    });

    const lineData: LineData<Time>[] = points.map(([t, v]) => ({
      time: toUTC(t) as Time,
      value: v,
    }));
    lineSeries.setData(lineData);
    chart.timeScale().fitContent();

    return () => { chart.remove(); };
  }, [points, height]);

  return <div ref={containerRef} style={{ width: '100%' }} />;
};

/* ─── Componente principal ───────────────────────────────────── */

export const FinvizChart: React.FC<FinvizChartProps> = ({
  candles: rawCandles,
  fallbackPoints,
  fairValue,
  earningsDates,
  dividendEvents,
  height = 380,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Preparar velas limpias
  const candles = useMemo(() => {
    let src = rawCandles && rawCandles.length >= 2 ? [...rawCandles] : [];
    if (src.length < 2 && fallbackPoints && fallbackPoints.length >= 2) {
      src = fallbackPoints.map(([t, c], i) => {
        const o = i > 0 ? fallbackPoints[i - 1][1] : c;
        return { t, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 0 };
      });
    }
    return cleanCandles(src);
  }, [rawCandles, fallbackPoints]);

  // Calcular SMAs
  const closes = useMemo(() => candles.map(c => c.c), [candles]);
  const sma20Data = useMemo(() => smaSeries(closes, 20), [closes]);
  const sma50Data = useMemo(() => smaSeries(closes, 50), [closes]);
  const sma200Data = useMemo(() => smaSeries(closes, 200), [closes]);
  const hasVolume = useMemo(() => candles.some(c => c.v > 0), [candles]);

  // Marcadores de balances: anclados a la vela de la fecha del earning,
  // pegados al eje temporal (belowBar), en ámbar y con la fecha corta en el
  // propio texto del marcador («E 15/10») para que se lea sobre el eje X.
  // Si la fecha cae fin de semana/feriado, se usa la primera vela posterior
  // dentro de los 4 días siguientes. El PRÓXIMO earning solo se puede
  // marcar si su fecha tiene vela (está dentro del rango de velas
  // disponibles); si cae a futuro sin vela, queda cubierto por la tarjeta
  // de balances de AssetView (respaldo obligatorio).
  const earningsMarks = useMemo<{ candle: AssetCandle; earnDate: string }[]>(() => {
    if (!earningsDates || earningsDates.length === 0 || candles.length === 0) return [];
    const byDate = new Map<string, AssetCandle>();
    for (const c of candles) byDate.set(new Date(c.t).toISOString().slice(0, 10), c);
    // Ajuste a vela: exacta, o la primera posterior dentro de 4 días si la
    // fecha cae en un día no hábil (fin de semana / feriado).
    const findCandle = (d: string): AssetCandle | undefined => {
      const exact = byDate.get(d);
      if (exact) return exact;
      const base = Date.parse(d + 'T00:00:00Z');
      for (const c of candles) {
        const cd = new Date(c.t).toISOString().slice(0, 10);
        const diff = (Date.parse(cd + 'T00:00:00Z') - base) / 86400000;
        if (diff > 0 && diff <= 4) return c;
      }
      return undefined;
    };
    const used = new Set<number>();
    const marks: { candle: AssetCandle; earnDate: string }[] = [];
    for (const d of earningsDates) {
      const target = findCandle(d);
      if (target && !used.has(target.t)) {
        used.add(target.t);
        marks.push({ candle: target, earnDate: d });
      }
    }
    return marks.sort((a, b) => a.candle.t - b.candle.t);
  }, [earningsDates, candles]);

  // Dividendos ex-date: misma regla de ajuste a la vela de su fecha.
  const dividendMarks = useMemo<{ candle: AssetCandle; divDate: string; amount: number }[]>(() => {
    if (!dividendEvents || dividendEvents.length === 0 || candles.length === 0) return [];
    const byDate = new Map<string, AssetCandle>();
    for (const c of candles) byDate.set(new Date(c.t).toISOString().slice(0, 10), c);
    const findCandle = (d: string): AssetCandle | undefined => {
      const exact = byDate.get(d);
      if (exact) return exact;
      const base = Date.parse(d + 'T00:00:00Z');
      for (const c of candles) {
        const cd = new Date(c.t).toISOString().slice(0, 10);
        const diff = (Date.parse(cd + 'T00:00:00Z') - base) / 86400000;
        if (diff > 0 && diff <= 4) return c;
      }
      return undefined;
    };
    const used = new Set<number>();
    const marks: { candle: AssetCandle; divDate: string; amount: number }[] = [];
    for (const ev of dividendEvents) {
      const target = findCandle(ev.date);
      if (target && !used.has(target.t)) {
        used.add(target.t);
        marks.push({ candle: target, divDate: ev.date, amount: ev.amount });
      }
    }
    return marks.sort((a, b) => a.candle.t - b.candle.t);
  }, [dividendEvents, candles]);

  // UNA sola llamada a setMarkers con el arreglo combinado y ordenado:
  // «E» ámbar para balances y «D» azul para dividendos ex-date, ambos
  // belowBar pegados al eje temporal, con la fecha corta en el texto.
  const allMarkers = useMemo<SeriesMarker<Time>[]>(() => {
    // En los bordes del gráfico (primeras/últimas 2 velas) el texto con
    // fecha se corta contra el eje: ahí va solo la letra y la fecha
    // completa queda en el chip de la leyenda.
    const edgeShort = (candle: AssetCandle): boolean => {
      const idx = candles.indexOf(candle);
      return idx >= 0 && (idx <= 1 || idx >= candles.length - 2);
    };
    const ms: SeriesMarker<Time>[] = [
      ...earningsMarks.map(({ candle, earnDate }) => ({
        time: toUTC(candle.t) as Time,
        position: 'belowBar' as const,
        shape: 'circle' as const,
        color: '#F59E0B',
        text: edgeShort(candle) ? 'E' : `E ${earnDate.slice(8, 10)}/${earnDate.slice(5, 7)}`,
      })),
      ...dividendMarks.map(({ candle, divDate }) => ({
        time: toUTC(candle.t) as Time,
        position: 'belowBar' as const,
        shape: 'circle' as const,
        color: '#3B82F6',
        text: edgeShort(candle) ? 'D' : `D ${divDate.slice(8, 10)}/${divDate.slice(5, 7)}`,
      })),
    ];
    return ms.sort((a, b) => (a.time as number) - (b.time as number));
  }, [earningsMarks, dividendMarks]);

  // Análisis técnico estilo Finviz (pivotes, líneas ancladas y patrón)
  const trendPattern = useMemo(() => computeTrendPattern(candles), [candles]);
  const topTrendData = useMemo(() => trendLineToSeriesData(trendPattern.topLine, candles), [trendPattern.topLine, candles]);
  const botTrendData = useMemo(() => trendLineToSeriesData(trendPattern.botLine, candles), [trendPattern.botLine, candles]);

  // Si no hay velas suficientes, mostrar fallback
  if (candles.length < 2) {
    if (fallbackPoints && fallbackPoints.length >= 2) {
      return <SimpleFallback points={fallbackPoints} height={height} />;
    }
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        Sin datos de precio suficientes para graficar este activo en el rango elegido.
      </div>
    );
  }

  // Crear chart con lightweight-charts
  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length < 2) return;

    // Limpiar chart anterior
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(el, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94A3B8',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(42,46,57,0.3)' },
        horzLines: { color: 'rgba(42,46,57,0.3)' },
      },
      timeScale: {
        borderColor: '#1F2937',
        timeVisible: false,
        rightOffset: 5,
        barSpacing: Math.max(4, Math.min(12, 800 / candles.length)),
        minBarSpacing: 1,
      },
      rightPriceScale: {
        borderColor: '#1F2937',
        scaleMargins: { top: 0.05, bottom: hasVolume ? 0.2 : 0.05 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(148, 163, 184, 0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1F2937',
        },
        horzLine: {
          color: 'rgba(148, 163, 184, 0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1F2937',
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    // ── 1. Serie de velas ──
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#F43F5E',
      borderUpColor: '#10B981',
      borderDownColor: '#F43F5E',
      wickUpColor: '#10B981',
      wickDownColor: '#F43F5E',
    });

    // Convertir datos al formato lightweight-charts
    const candleData: CandlestickData<Time>[] = candles.map(c => ({
      time: toUTC(c.t) as Time,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));
    candleSeries.setData(candleData);

    // ── 1b. Marcadores sobre el eje temporal: balances «E» + dividendos «D» ──
    if (allMarkers.length > 0) {
      candleSeries.setMarkers(allMarkers);
    }

    // ── 2. Fair Value como PriceLine ──
    if (fairValue != null && Number.isFinite(fairValue) && fairValue > 0) {
      candleSeries.createPriceLine({
        price: fairValue,
        color: '#F59E0B',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `FV US$ ${fairValue >= 100 ? fairValue.toFixed(0) : fairValue.toFixed(2)}`,
      });
    }

    // ── 3. SMA 20 ──
    if (sma20Data.some(v => v != null)) {
      const sma20Series = chart.addLineSeries({
        color: '#E8A33D',
        lineWidth: 1,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const data20: LineData<Time>[] = [];
      candles.forEach((c, i) => {
        if (sma20Data[i] != null) {
          data20.push({ time: toUTC(c.t) as Time, value: sma20Data[i]! });
        }
      });
      sma20Series.setData(data20);
    }

    // ── 4. SMA 50 ──
    if (sma50Data.some(v => v != null)) {
      const sma50Series = chart.addLineSeries({
        color: '#38BDF8',
        lineWidth: 1,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const data50: LineData<Time>[] = [];
      candles.forEach((c, i) => {
        if (sma50Data[i] != null) {
          data50.push({ time: toUTC(c.t) as Time, value: sma50Data[i]! });
        }
      });
      sma50Series.setData(data50);
    }

    // ── 5. SMA 200 ──
    if (sma200Data.some(v => v != null)) {
      const sma200Series = chart.addLineSeries({
        color: '#A78BFA',
        lineWidth: 1,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const data200: LineData<Time>[] = [];
      candles.forEach((c, i) => {
        if (sma200Data[i] != null) {
          data200.push({ time: toUTC(c.t) as Time, value: sma200Data[i]! });
        }
      });
      sma200Series.setData(data200);
    }

    // ── 6. Volumen como HistogramSeries ──
    if (hasVolume) {
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
      const volData: HistogramData<Time>[] = candles.map(c => ({
        time: toUTC(c.t) as Time,
        value: c.v,
        color: c.c >= c.o ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)',
      }));
      volumeSeries.setData(volData);
    }

    // ── 7. Línea de resistencia técnica superior (estilo Finviz: magenta/fucsia #EC4899) ──
    if (topTrendData.length >= 2) {
      const topSeries = chart.addLineSeries({
        color: '#EC4899',
        lineWidth: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        lineStyle: LineStyle.Solid,
        title: 'Resistencia',
      });
      topSeries.setData(topTrendData);
    }

    // ── 8. Línea de soporte técnico inferior (estilo Finviz: amarillo/oro #EAB308) ──
    if (botTrendData.length >= 2) {
      const botSeries = chart.addLineSeries({
        color: '#EAB308',
        lineWidth: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        lineStyle: LineStyle.Solid,
        title: 'Soporte',
      });
      botSeries.setData(botTrendData);
    }

    // Ajustar vista para mostrar todo el contenido
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, fairValue, sma20Data, sma50Data, sma200Data, topTrendData, botTrendData, hasVolume, height, allMarkers]);

  // Leyenda de SMAs (valores del último cierre)
  const lastIdx = candles.length - 1;
  const lastCandle = candles[lastIdx];
  const smaAt = (s: (number | null)[], i: number) => {
    for (let j = i; j >= 0; j--) if (s[j] != null) return s[j];
    return null;
  };
  const s20 = smaAt(sma20Data, lastIdx);
  const s50 = smaAt(sma50Data, lastIdx);
  const s200 = smaAt(sma200Data, lastIdx);
  const fvValid = fairValue != null && Number.isFinite(fairValue) && fairValue > 0;

  const dLabel = new Date(lastCandle.t).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div style={{ width: '100%' }}>
      {/* Leyenda superior: OHLC + SMAs + patrón técnico */}
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
          O<span style={{ color: 'var(--text-primary)' }}>{lastCandle.o.toFixed(2)}</span>{' '}
          H<span style={{ color: 'var(--pos-bright, #4ADE80)' }}>{lastCandle.h.toFixed(2)}</span>{' '}
          L<span style={{ color: 'var(--neg-bright, #F87171)' }}>{lastCandle.l.toFixed(2)}</span>{' '}
          C<span style={{ color: 'var(--text-primary)' }}>{lastCandle.c.toFixed(2)}</span>
        </span>
        {s20 != null && (
          <span style={{ color: '#E8A33D' }}>SMA 20 · {s20.toFixed(2)}</span>
        )}
        {s50 != null && (
          <span style={{ color: '#38BDF8' }}>SMA 50 · {s50.toFixed(2)}</span>
        )}
        {s200 != null && (
          <span style={{ color: '#A78BFA' }}>SMA 200 · {s200.toFixed(2)}</span>
        )}
        {fvValid && fairValue != null && (
          <span style={{ color: '#F59E0B' }}>
            FV US$ {fairValue.toFixed(fairValue >= 100 ? 0 : 2)}
          </span>
        )}
        {earningsMarks.map(({ earnDate }) => {
          const dObj = new Date(earnDate + 'T12:00:00');
          const lbl =
            dObj.getDate() +
            '-' +
            dObj.toLocaleDateString('es-AR', { month: 'short' }).replace(/\./g, '');
          return (
            <span
              key={earnDate}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#F59E0B', fontWeight: 600 }}
              title={`Balance (earnings) del ${earnDate}: marcador ámbar sobre el eje temporal`}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  background: '#F59E0B',
                  color: '#111827',
                  fontSize: 9,
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                E
              </span>
              E · Balance {lbl}
            </span>
          );
        })}
        {dividendMarks.map(({ divDate, amount }) => {
          const dObj = new Date(divDate + 'T12:00:00');
          const lbl =
            dObj.getDate() +
            '-' +
            dObj.toLocaleDateString('es-AR', { month: 'short' }).replace(/\./g, '');
          return (
            <span
              key={'div-' + divDate}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#3B82F6', fontWeight: 600 }}
              title={`Dividendo ex-date del ${divDate}: US$ ${amount.toFixed(4)} por acción — marcador azul sobre el eje temporal`}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  background: '#3B82F6',
                  color: '#FFFFFF',
                  fontSize: 9,
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                D
              </span>
              D · Dividendo {lbl}
            </span>
          );
        })}
        {topTrendData.length >= 2 && (
          <span style={{ color: '#EC4899', fontWeight: 600 }}>
            Resistencia · {topTrendData[topTrendData.length - 1].value.toFixed(2)}
          </span>
        )}
        {botTrendData.length >= 2 && (
          <span style={{ color: '#EAB308', fontWeight: 600 }}>
            Soporte · {botTrendData[botTrendData.length - 1].value.toFixed(2)}
          </span>
        )}
        {trendPattern.label && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10.5,
              padding: '1px 8px',
              borderRadius: 999,
              border: '1px solid var(--border-subtle)',
              color: 'var(--accent-cyan)',
              fontWeight: 600,
              background: 'rgba(56, 189, 248, 0.08)',
            }}
            title="Formación técnica detectada por pivotes (método estilo Finviz)"
          >
            {trendPattern.label}
          </span>
        )}
      </div>

      {/* Contenedor del gráfico interactivo */}
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
};
