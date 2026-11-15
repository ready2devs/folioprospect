import { describe, expect, it } from 'vitest';
import {
  assetBackLabel,
  computeAssetOrigin,
  resolveAssetBackTarget,
  type NavSnapshot,
} from '../backNavigation';

const snap = (over: Partial<NavSnapshot>): NavSnapshot => ({
  rightState: 'market',
  mobileTab: 'right',
  assetOrigin: 'market',
  ...over,
});

describe('computeAssetOrigin', () => {
  it('escritorio, sesión fresca desde Mercado: el origen es Mercado aunque mobileTab arranque en holdings (el defecto v12)', () => {
    // Estado inicial del store: rightState 'market', mobileTab 'holdings'.
    // En escritorio mobileTab es residual: la vista visible es Mercado.
    expect(
      computeAssetOrigin(snap({ rightState: 'market', mobileTab: 'holdings' }), false)
    ).toBe('market');
  });

  it('escritorio desde Portafolio u Optimizer con mobileTab residual en holdings', () => {
    expect(
      computeAssetOrigin(snap({ rightState: 'portfolio', mobileTab: 'holdings' }), false)
    ).toBe('portfolio');
    expect(
      computeAssetOrigin(snap({ rightState: 'optimizer', mobileTab: 'holdings' }), false)
    ).toBe('optimizer');
  });

  it('móvil desde la pestaña Cartera (lista de posiciones): origen holdings', () => {
    expect(
      computeAssetOrigin(snap({ rightState: 'market', mobileTab: 'holdings' }), true)
    ).toBe('holdings');
  });

  it('móvil desde una vista principal (pestaña no-Cartera): manda rightState', () => {
    expect(
      computeAssetOrigin(snap({ rightState: 'optimizer', mobileTab: 'right' }), true)
    ).toBe('optimizer');
    expect(
      computeAssetOrigin(snap({ rightState: 'portfolio', mobileTab: 'right' }), true)
    ).toBe('portfolio');
  });

  it('cadena activo → activo: conserva el origen original en ambos formatos', () => {
    for (const isMobile of [false, true]) {
      expect(
        computeAssetOrigin(
          snap({ rightState: 'asset', mobileTab: 'right', assetOrigin: 'optimizer' }),
          isMobile
        )
      ).toBe('optimizer');
      expect(
        computeAssetOrigin(
          snap({ rightState: 'asset', mobileTab: 'right', assetOrigin: 'holdings' }),
          isMobile
        )
      ).toBe('holdings');
    }
  });
});

describe('resolveAssetBackTarget', () => {
  it('origen holdings en móvil: vuelve a la lista de posiciones', () => {
    expect(resolveAssetBackTarget('holdings', 'market', true)).toEqual({ kind: 'holdings' });
  });

  it('origen holdings en escritorio: nunca es no-op, va a la última vista principal', () => {
    expect(resolveAssetBackTarget('holdings', 'market', false)).toEqual({
      kind: 'view',
      view: 'market',
    });
    expect(resolveAssetBackTarget('holdings', 'portfolio', false)).toEqual({
      kind: 'view',
      view: 'portfolio',
    });
    expect(resolveAssetBackTarget('holdings', 'optimizer', false)).toEqual({
      kind: 'view',
      view: 'optimizer',
    });
  });

  it('orígenes de vista pasan directos en escritorio y en móvil', () => {
    for (const isMobile of [false, true]) {
      for (const view of ['market', 'portfolio', 'optimizer'] as const) {
        expect(resolveAssetBackTarget(view, 'market', isMobile)).toEqual({
          kind: 'view',
          view,
        });
      }
    }
  });
});

describe('assetBackLabel', () => {
  it('nombra el destino real en cada combinación', () => {
    expect(assetBackLabel('market', 'portfolio', false)).toBe('Volver a Mercado');
    expect(assetBackLabel('portfolio', 'market', false)).toBe('Volver al Portafolio');
    expect(assetBackLabel('optimizer', 'market', true)).toBe('Volver al Optimizer');
    expect(assetBackLabel('holdings', 'market', true)).toBe('Volver a Cartera (Posiciones)');
    // En escritorio con origen holdings la etiqueta nombra la vista
    // principal destino, no la lista (que ya está visible a la izquierda).
    expect(assetBackLabel('holdings', 'market', false)).toBe('Volver a Mercado');
    expect(assetBackLabel('holdings', 'portfolio', false)).toBe('Volver al Portafolio');
    expect(assetBackLabel('holdings', 'optimizer', false)).toBe('Volver al Optimizer');
  });
});

describe('vista Watchlist (SPEC-006, enmienda v11)', () => {
  it('abrir una ficha desde la Watchlist registra ese origen y el «Volver» regresa ahí', () => {
    for (const isMobile of [false, true]) {
      expect(
        computeAssetOrigin(snap({ rightState: 'watchlist', mobileTab: 'right' }), isMobile)
      ).toBe('watchlist');
    }
    expect(resolveAssetBackTarget('watchlist', 'market', false)).toEqual({
      kind: 'view',
      view: 'watchlist',
    });
    expect(resolveAssetBackTarget('watchlist', 'portfolio', true)).toEqual({
      kind: 'view',
      view: 'watchlist',
    });
    expect(assetBackLabel('watchlist', 'market', false)).toBe('Volver a la Watchlist');
    expect(assetBackLabel('watchlist', 'market', true)).toBe('Volver a la Watchlist');
  });

  it('la cadena activo → activo conserva el origen Watchlist', () => {
    expect(
      computeAssetOrigin(
        snap({ rightState: 'asset', mobileTab: 'right', assetOrigin: 'watchlist' }),
        true
      )
    ).toBe('watchlist');
  });
});
