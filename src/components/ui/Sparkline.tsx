import React, { useId } from 'react';

interface SparklineProps {
  points: number[];
  prevClose: number;
  isPositive: boolean;
  width?: number;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  points,
  prevClose,
  isPositive,
  width = 78,
  height = 28,
}) => {
  const gradId = useId();
  const data = points && points.length >= 2 ? points : [prevClose, prevClose];
  const allVals = [...data, prevClose];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const span = maxVal - minVal || Math.abs(prevClose) * 0.01 || 1;

  const padX = 3;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const toX = (idx: number) => padX + (idx / (data.length - 1)) * innerW;
  const toY = (val: number) => padY + (1 - (val - minVal) / span) * innerH;

  const coords = data.map((v, i) => [toX(i), toY(v)] as const);
  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${(
    height - 1
  ).toFixed(1)} L${coords[0][0].toFixed(1)},${(height - 1).toFixed(1)} Z`;

  const prevY = toY(prevClose);
  const [lastX, lastY] = coords[coords.length - 1];
  const strokeColor = isPositive ? '#10B981' : '#F43F5E';
  const dotColor = isPositive ? '#4ADE80' : '#F87171';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Evolución intradía"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.34} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      {/* Línea horizontal punteada de referencia del cierre previo */}
      <line
        x1={padX}
        y1={prevY}
        x2={width - padX}
        y2={prevY}
        stroke="currentColor"
        strokeOpacity={0.28}
        strokeWidth={1}
        strokeDasharray="2,2"
      />
      {/* Área degradada semitransparente */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* Curva principal */}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Halo y punto luminoso en el extremo derecho indicando precio actual */}
      <circle cx={lastX} cy={lastY} r={4.2} fill={dotColor} fillOpacity={0.25} />
      <circle cx={lastX} cy={lastY} r={2.2} fill={dotColor} />
    </svg>
  );
};
