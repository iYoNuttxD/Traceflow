import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicPageShell, StatusSurface } from '../../src/shared/index.js';

describe('surfaces públicas Focused', () => {
  it('mantém marca única e conteúdo dentro da composição pública', () => {
    const { container } = render(
      <PublicPageShell>
        <p>Conteúdo público</p>
      </PublicPageShell>
    );

    const brandName = screen.getByText('TRACEFLOW');
    const decorativeMark = container.querySelector('.public-page-brand__mark');

    expect(brandName).toBeVisible();
    expect(brandName).not.toHaveAttribute('aria-hidden');
    expect(screen.getAllByText('TRACEFLOW')).toHaveLength(1);
    expect(screen.queryByLabelText('TRACEFLOW')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'TRACEFLOW' })).not.toBeInTheDocument();
    expect(decorativeMark).toHaveAttribute('aria-hidden', 'true');
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
