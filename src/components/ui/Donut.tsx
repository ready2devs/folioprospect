import React from 'react';
import type { DistributionRow } from '@shared/engine/types';

interface DonutProps {
  rows: DistributionRow[];
  totalCount: number;
  centerSubtitle?: string;
  size?: number;
}

export const Donut: React.FC<DonutProps> = ({
  rows,
  totalCount,
  centerSubtitle = 'Total assets',
  size = 186,
}) => {
  const strokeWidth = 24;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let accumPct = 0;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
        />
        {rows.map((row) => {
          const pct = Math.max(0, row.allocation) / 100;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const offset = -accumPct * circumference;
          accumPct += pct;
          return (
            <circle
              key={row.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={row.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${Math.max(0, dash - 1.5)} ${gap + 1.5}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div className="mono" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>
          {totalCount}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          {centerSubtitle}
        </div>
      </div>
    </div>
  );
};
