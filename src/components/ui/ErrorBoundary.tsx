import React from 'react';

/**
 * Límite de error del panel principal: si una vista rompe al renderizar,
 * muestra un estado recuperable en vez de desmontar toda la app
 * (la «pantalla negra» que aparecía al abrir el detalle de un activo).
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; resetKey?: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey?: string }): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
            Esta vista tuvo un problema al mostrarse
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginBottom: 16 }}>
            El panel lateral y el resto de la app siguen funcionando. Probá recargar la vista.
          </div>
          <button className="btn btn-primary" onClick={() => this.setState({ hasError: false })}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
