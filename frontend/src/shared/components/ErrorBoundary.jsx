import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error('Falha inesperada de renderização.', error);
  }

  retry = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="page-container">
        <section className="async-state message message-error" role="alert">
          <h1>Não foi possível exibir esta página.</h1>
          <p>Tente novamente. Se o problema continuar, volte à lista de projetos.</p>
          <div className="dialog-actions">
            <button type="button" onClick={this.retry}>Tentar novamente</button>
            <a className="button button-secondary" href="/projects">Voltar aos projetos</a>
          </div>
        </section>
      </main>
    );
  }
}
