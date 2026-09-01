import { Component } from 'react';
import { GenericErrorPage } from './GenericErrorPage.jsx';
import {
  classifyPageError,
  getErrorRequestId,
  resolveErrorPageContext
} from '../services/page-error.js';

export class ErrorBoundary extends Component {
  state = { failed: false, error: null };

  static getDerivedStateFromError(error) {
    return { failed: true, error };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error('Falha inesperada de renderização.', error);
  }

  retry = () => this.setState({ failed: false, error: null });

  render() {
    if (!this.state.failed) return this.props.children;
    const pathname = window.location.pathname;
    const context = resolveErrorPageContext(pathname);
    return (
      <GenericErrorPage
        type={classifyPageError(this.state.error)}
        onRetry={this.retry}
        secondaryAction={context.secondaryAction}
        requestId={getErrorRequestId(this.state.error)}
      />
    );
  }
}
