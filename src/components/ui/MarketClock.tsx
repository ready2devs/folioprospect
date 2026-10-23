import React from 'react';
import type { MarketState } from '@shared/engine/types';

export interface MarketClockProps {
  marketState?: MarketState | string;
  isCrypto?: boolean;
  assetType?: string;
  symbol?: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const MarketClock: React.FC<MarketClockProps> = ({
  marketState,
  isCrypto,
  assetType,
  symbol,
  size = 12,
  showLabel = false,
  className,
  style,
}) => {
  const crypto = Boolean(
    isCrypto ||
      assetType === 'Crypto' ||
      (symbol && (symbol.startsWith('BINANCE:') || symbol.endsWith('USDT')))
  );
  const isOpen = crypto || marketState === 'open';
  const strokeColor = isOpen ? '#10B981' : '#EF4444';
  const fillBg = isOpen ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)';
  const titleText = isOpen
    ? crypto
      ? 'Mercado abierto en vivo (Cripto 24/7)'
      : 'Mercado abierto en vivo'
    : 'Mercado cerrado';

  return (
    <span
      className={className}
      title={titleText}
      aria-label={titleText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        verticalAlign: 'middle',
        lineHeight: 1,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', flexShrink: 0 }}
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill={fillBg}
          stroke={strokeColor}
          strokeWidth="1.75"
        />
        <path
          d="M8 4.4V8.1L10.5 9.6"
          stroke={strokeColor}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: strokeColor,
            letterSpacing: '0.01em',
          }}
        >
          {isOpen ? 'Abierto' : 'Cerrado'}
        </span>
      )}
    </span>
  );
};

export default MarketClock;
