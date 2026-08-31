import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicPageShell, StatusSurface } from '../../src/shared/index.js';

describe('surfaces públicas Focused', () => {
  it('mantém marca única e conteúdo dentro da composição pública', () => {
    render(
      <PublicPageShell>
        <p>Conteúdo público</p>
      </PublicPageShell>
    );

    expect(screen.getByLabelText('TRACEFLOW')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo público')).toBeInTheDocument();
  });

  it('move foco para o título quando o estado da surface muda', () => {
    const view = render(
      <StatusSurface title="Validando" description="Aguarde." focusKey="loading" />
    );

    expect(screen.getByRole('heading', { name: 'Validando' })).toHaveFocus();

    view.rerender(
      <StatusSurface
        title="Operação concluída"
        description="Você pode continuar."
        tone="success"
        icon="check"
        focusKey="success"
      />
    );

    expect(screen.getByRole('heading', { name: 'Operação concluída' })).toHaveFocus();
  });
});
