import type { AssetOrigin, MobileTab, RightPanelState } from './store';

/**
 * Navegación de regreso desde la ficha del activo (v12).
 *
 * El «Volver» de la ficha tiene que regresar SIEMPRE a la vista en la
 * que estaba el usuario inmediatamente antes de abrir el primer activo
 * de la cadena, desde cualquier entrada (Mercado, Portafolio,
 * Optimizer, buscador, watchlist, lista de posiciones). Estas funciones
 * puras son la única fuente de verdad de esa lógica: las usan el store
 * (para registrar el origen y ejecutar la vuelta) y los componentes
 * (para nombrar en la etiqueta el destino real).
 */

/** Vista principal del panel derecho que no es la ficha. */
export type MainView = Exclude<RightPanelState, 'asset'>;

/** Foto mínima del estado de navegación al momento de abrir una ficha. */
export interface NavSnapshot {
  rightState: RightPanelState;
  mobileTab: MobileTab;
  assetOrigin: AssetOrigin;
}

/**
 * Origen real de la navegación a una ficha.
 *
 * - Si ya hay una ficha abierta (cadena activo → activo), se conserva
 *   el origen registrado: «Volver» sigue yendo a la vista inicial, no
 *   al activo anterior.
 * - En móvil, si el usuario está en la pestaña Cartera (la lista de
 *   posiciones ES su vista actual), el origen es 'holdings'.
 * - En cualquier otro caso manda `rightState`: es la vista principal
 *   efectivamente visible. En escritorio `mobileTab` es un estado
 *   residual sin significado visual (arranca en 'holdings'), así que
 *   NO puede decidir el origen — ese era el defecto v12: la primera
 *   ficha de la sesión quedaba con origen 'holdings' viniera de donde
 *   viniera, y su «Volver» no hacía nada visible en escritorio.
 */
export function computeAssetOrigin(cur: NavSnapshot, isMobile: boolean): AssetOrigin {
  if (cur.rightState === 'asset') return cur.assetOrigin;
  if (isMobile && cur.mobileTab === 'holdings') return 'holdings';
  return cur.rightState;
}

/** Destino concreto del «Volver»: la lista de posiciones (solo tiene
 *  sentido como pantalla en móvil) o una vista principal. */
export type AssetBackTarget = { kind: 'holdings' } | { kind: 'view'; view: MainView };

/**
 * Resuelve a dónde va el «Volver» según el origen registrado.
 *
 * El origen 'holdings' en escritorio NO puede ser destino: la lista de
 * posiciones es el panel izquierdo, siempre visible, y el panel
 * principal tiene que salir de la ficha sí o sí. En ese caso el
 * destino es la última vista principal previa a la ficha
 * (`lastMainView`), así el botón nunca es un no-op.
 */
export function resolveAssetBackTarget(
  origin: AssetOrigin,
  lastMainView: MainView,
  isMobile: boolean
): AssetBackTarget {
  if (origin === 'holdings') {
    return isMobile ? { kind: 'holdings' } : { kind: 'view', view: lastMainView };
  }
  return { kind: 'view', view: origin };
}

/** Etiqueta del botón «Volver»: nombra siempre el destino real que
 *  resuelve `resolveAssetBackTarget` con los mismos datos. */
export function assetBackLabel(
  origin: AssetOrigin,
  lastMainView: MainView,
  isMobile: boolean
): string {
  const target = resolveAssetBackTarget(origin, lastMainView, isMobile);
  if (target.kind === 'holdings') return 'Volver a Cartera (Posiciones)';
  if (target.view === 'optimizer') return 'Volver al Optimizer';
  if (target.view === 'portfolio') return 'Volver al Portafolio';
  return 'Volver a Mercado';
}
