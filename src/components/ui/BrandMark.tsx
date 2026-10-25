import React, { useId } from 'react';

/**
 * Marca A2 · Trayectoria Prospect
 * Línea de cartera con trazo cónico (fina → gruesa) que termina en un
 * target, sobre una línea de índice azul más fina. Fondo navy redondeado.
 */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 28 }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bgId = `a2bg-${uid}`;
  const trajId = `a2traj-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="FolioProspect"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12263F" />
          <stop offset="1" stopColor="#070B14" />
        </linearGradient>
        <linearGradient id={trajId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#10B981" />
          <stop offset="1" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${bgId})`} />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="14.25"
        fill="none"
        stroke="#2DD4BF"
        strokeOpacity="0.22"
        strokeWidth="1.5"
      />
      <path
        d="M14.0,49.9 L25.0,49.0 L36.1,49.6 L52.2,46.8 L51.8,44.8 L35.9,48.0 L25.0,47.8 L14.0,49.1 Z"
        fill="#60A5FA"
        opacity="0.55"
      />
      <path
        d="M14.5,44.7 L24.3,38.3 L31.6,41.5 L39.6,32.4 L47.8,24.8 L44.2,21.2 L36.4,29.6 L30.4,38.5 L23.7,35.7 L13.5,43.3 Z"
        fill={`url(#${trajId})`}
      />
      <circle cx="46" cy="23" r="10.5" fill="none" stroke="#34D399" strokeOpacity="0.18" strokeWidth="2" />
      <circle cx="46" cy="23" r="6.8" fill="none" stroke="#34D399" strokeOpacity="0.55" strokeWidth="1.8" />
      <circle cx="46" cy="23" r="3.4" fill="#34D399" />
    </svg>
  );
};

export default BrandMark;
