import { describe, expect, it } from 'vitest';
import { computePopoverPlacement, popoverWidth } from '../popoverPosition';

const VW = { width: 1920, height: 1080 };

describe('computePopoverPlacement', () => {
  it('con lugar de sobra: se abre hacia abajo, alineado al botón', () => {
    const p = computePopoverPlacement({ left: 400, top: 100, right: 420, bottom: 120 }, 200, VW);
    expect(p.placement).toBe('below');
    expect(p.left).toBe(400);
    expect(p.top).toBe(126); // bottom + gap 6
    expect(p.width).toBe(300);
    expect(p.maxHeight).toBeGreaterThanOrEqual(200);
  });

  it('borde derecho: se corre a la izquierda y nunca sale del viewport', () => {
    // Caso real de la v11: el ⓘ de escenarios en el panel derecho.
    const p = computePopoverPlacement({ left: 1750, top: 500, right: 1770, bottom: 520 }, 280, VW);
    expect(p.left + p.width).toBe(VW.width - 8);
    expect(p.left).toBe(1612);
    expect(p.placement).toBe('below');
  });

  it('borde izquierdo: respeta el margen mínimo', () => {
    const p = computePopoverPlacement({ left: 2, top: 100, right: 22, bottom: 120 }, 150, VW);
    expect(p.left).toBe(8);
  });

  it('borde inferior: se abre hacia arriba del botón', () => {
    const vh = { width: 1366, height: 768 };
    const p = computePopoverPlacement({ left: 600, top: 700, right: 620, bottom: 722 }, 250, vh);
    expect(p.placement).toBe('above');
    expect(p.top).toBe(700 - 6 - 250);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + 250).toBeLessThanOrEqual(700 - 6);
  });

  it('contenido más alto que ambos lados: elige el mayor y capa el alto', () => {
    const vh = { width: 1366, height: 768 };
    // Botón centrado verticalmente: abajo hay 768-8-(406+6)=348, arriba 394-6-8=380.
    const p = computePopoverPlacement({ left: 100, top: 394, right: 120, bottom: 406 }, 900, vh);
    expect(p.placement).toBe('above');
    expect(p.maxHeight).toBe(380);
    expect(p.top).toBe(8); // 394 - 6 - 380
  });

  it('viewport angosto: el ancho se achica al viewport menos márgenes', () => {
    expect(popoverWidth(360)).toBe(300); // el ancho deseado ya entra
    expect(popoverWidth(280)).toBe(264); // por debajo de 316 se achica
    const p = computePopoverPlacement(
      { left: 240, top: 100, right: 260, bottom: 120 },
      200,
      { width: 280, height: 740 },
    );
    expect(p.width).toBe(264);
    expect(p.left).toBe(8);
    expect(p.left + p.width).toBe(280 - 8);
  });

  it('si entra justo hacia abajo no voltea', () => {
    const vh = { width: 1280, height: 800 };
    // Abajo: 800-8-(500+6)=286, el popover mide 280 → entra.
    const p = computePopoverPlacement({ left: 100, top: 478, right: 120, bottom: 500 }, 280, vh);
    expect(p.placement).toBe('below');
    expect(p.top + 280).toBeLessThanOrEqual(vh.height - 8);
  });
});
