import React from 'react';
import { Moon } from 'lucide-react';
import type { ComputedHolding, MarketState } from '@shared/engine/types';

export interface PriceSessionCellProps {
  holding?: Partial<ComputedHolding> & {
    lastPrice: number;
    prevClose?: number;
  };
  price?: number;
  prevClose?: number;
  change?: number;
  changePct?: number;
  marketState?: MarketState | string;
  isCrypto?: boolean;
  assetType?: string;
  symbol?: string;
  extPrice?: number;
  extChange?: number;
  extChangePct?: number;
  align?: 'right' | 'left';
  className?: string;
  style?: React.CSSProperties;
}

function fmtPrice(val: number): string {
  if (!Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  const decimals = abs > 0 && abs < 1 ? 4 : 2;
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtSigned(val: number, decimals = 2): string {
  if (!Number.isFinite(val)) return '0.00';
  const abs = Math.abs(val);
  const sign = val < -1e-6 ? '-' : '+';
  return `${sign}${abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export const PriceSessionCell: React.FC<PriceSessionCellProps> = ({
  holding,
  price: propPrice,
  prevClose: propPrevClose,
  change: propChange,
  changePct: propChangePct,
  marketState: propMarketState,
  isCrypto: propIsCrypto,
  assetType: propAssetType,
  symbol: propSymbol,
  extPrice: propExtPrice,
  extChange: propExtChange,
  extChangePct: propExtChangePct,
  align = 'right',
  className,
  style,
}) => {
  const symbol = propSymbol ?? holding?.symbol ?? '';
  const assetType = propAssetType ?? holding?.assetType ?? '';
  const isCrypto = Boolean(
    propIsCrypto ||
      assetType === 'Crypto' ||
      symbol.startsWith('BINANCE:') ||
      symbol.endsWith('USDT')
  );

  const lastPrice = propPrice ?? holding?.lastPrice ?? 0;
  const prevClose = propPrevClose ?? holding?.prevClose ?? lastPrice;
  const rawChange =
    propChange ??
    holding?.dailyChangeAbs ??
    (Number.isFinite(lastPrice) && Number.isFinite(prevClose) ? lastPrice - prevClose : 0);
  const rawChangePct =
    propChangePct ??
    holding?.dailyGain?.p ??
    (prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0);

  const marketState = isCrypto
    ? 'open'
    : (propMarketState ?? holding?.marketState ?? 'closed');

  const extPrice = propExtPrice ?? holding?.extPrice;
  const extChange =
    propExtChange ??
    holding?.extChange ??
    (extPrice != null ? extPrice - lastPrice : undefined);
  const extChangePct =
    propExtChangePct ??
    holding?.extChangePct ??
    (extPrice != null && lastPrice > 0
      ? ((extPrice - lastPrice) / lastPrice) * 100
      : undefined);

  const priceDecimals = Math.abs(lastPrice) > 0 && Math.abs(lastPrice) < 1 ? 4 : 2;
  const isDayUp = rawChangePct >= -1e-6 && rawChange >= -1e-6;
  const dayColor = isDayUp ? '#10B981' : '#EF4444';

  const showPostMarket =
    marketState !== 'open' &&
    !isCrypto &&
    extPrice != null &&
    Number.isFinite(extPrice);

  const isExtUp = (extChange ?? 0) >= -1e-6;
  const extColor = isExtUp ? '#10B981' : '#EF4444';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align,
        minWidth: 0,
        lineHeight: 1.2,
        gap: 1.5,
        ...style,
      }}
    >
      {/* Fila 1: Precio de cierre / actual en mono bold */}
      <div
        className="mono"
        style={{
          fontWeight: 700,
          fontSize: 12,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {fmtPrice(lastPrice)}
      </div>

      {/* Fila 2: Variación nominal + porcentual entre paréntesis en verde/rojo */}
      <div
        className="mono"
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: dayColor,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {fmtSigned(rawChange, priceDecimals)} ({fmtSigned(rawChangePct, 2)}%)
      </div>

      {/* Fila 3: SOLO cuando el mercado está cerrado y no es cripto y hay extPrice */}
      {showPostMarket && (
        <div
          className="mono"
          title="Cotización y variación posmercado / extendida"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
            gap: 3,
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
            marginTop: 0.5,
          }}
        >
          <Moon
            size={9.5}
            color="#60A5FA"
            fill="#60A5FA"
            style={{ flexShrink: 0 }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>
            {fmtPrice(extPrice!)}
          </span>
          <span style={{ color: extColor }}>
            {fmtSigned(extChange ?? 0, priceDecimals)} (
            {fmtSigned(extChangePct ?? 0, 2)}%)
          </span>
        </div>
      )}
    </div>
  );
};

export default PriceSessionCell;
