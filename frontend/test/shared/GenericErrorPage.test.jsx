import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContextualErrorPage, GenericErrorPage, PAGE_ERROR_TYPES } from '../../src/shared/index.js';

describe('GenericErrorPage', () => {
  it('foca o título, usa botões do design system e só tenta novamente por ação explícita', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <GenericErrorPage type={PAGE_ERROR_TYPES.SERVER} onRetry={retry} />
      </MemoryRouter>
    );

    const heading = screen.getByRole('heading', { name: 'O TRACEFLOW encontrou um problema.' });
    const button = screen.getByRole('button', { name: 'Tentar novamente' });
    expect(heading).toHaveFocus();
    expect(button).toHaveClass('button', 'button-primary');
    expect(retry).not.toHaveBeenCalled();
    await user.click(button);
    expect(retry).toHaveBeenCalledOnce();
  });

  it('não sugere projetos no contexto de login', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <ContextualErrorPage type={PAGE_ERROR_TYPES.NETWORK} onRetry={vi.fn()} />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Não foi possível conectar ao TRACEFLOW.' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Voltar aos projetos')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('usa retorno ao projeto em uma subseção e retorno seguro em contexto desconhecido', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/projects/42/tasks']}>
        <ContextualErrorPage type={PAGE_ERROR_TYPES.SERVER} onRetry={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Voltar ao projeto' })).toHaveAttribute(
      'href',
      '/projects/42'
    );

    unmount();
    render(
      <MemoryRouter initialEntries={['/contexto-desconhecido']}>
        <ContextualErrorPage type={PAGE_ERROR_TYPES.UNKNOWN} onRetry={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
  });

  it('bloqueia retry durante o cooldown de rate limit', () => {
    render(
      <MemoryRouter>
        <GenericErrorPage
          type={PAGE_ERROR_TYPES.RATE_LIMIT}
          retryAfterSeconds={12}
          onRetry={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Muitas solicitações em pouco tempo.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente em 12s' })).toBeDisabled();
  });
});
