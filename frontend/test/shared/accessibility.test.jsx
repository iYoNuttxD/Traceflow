import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ConfirmProvider,
  ErrorBoundary,
  ErrorState,
  FeedbackRegion,
  ForbiddenState,
  FormInput,
  LoadingState,
  useConfirm
} from '../../src/shared/index.js';

function ConfirmFixture() {
  const confirm = useConfirm();
  const [result, setResult] = useState('');
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          setResult(
            (await confirm({
              title: 'Excluir registro',
              description: 'A ação é permanente.',
              confirmLabel: 'Excluir'
            }))
              ? 'confirmado'
              : 'cancelado'
          )
        }
      >
        Abrir confirmação
      </button>
      <output>{result}</output>
    </>
  );
}

describe('infraestrutura acessível compartilhada', () => {
  it('distingue loading, erro e acesso proibido semanticamente', () => {
    const { rerender } = render(<LoadingState message="Carregando dados" />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando dados');
    rerender(<ErrorState message="Falha segura" onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Falha segura');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    rerender(<ForbiddenState />);
    expect(screen.getByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
  });

  it('associa erro ao campo e anuncia feedback sem depender de cor', () => {
    render(
      <>
        <FormInput id="title" label="Título" required error="Campo obrigatório." />
        <FeedbackRegion success="Salvo com sucesso." />
      </>
    );
    const input = screen.getByLabelText(/Título/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Campo obrigatório.');
    expect(screen.getByRole('status')).toHaveTextContent('Salvo com sucesso.');
  });

  it('cancela por Escape e restaura o foco no acionador', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <ConfirmFixture />
      </ConfirmProvider>
    );
    const trigger = screen.getByRole('button', { name: 'Abrir confirmação' });
    trigger.focus();
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Excluir registro' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(await screen.findByText('cancelado')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('confirma por teclado dentro do dialog', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <ConfirmFixture />
      </ConfirmProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Abrir confirmação' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('confirmado')).toBeInTheDocument();
  });

  it('isola falha de renderização sem expor stack ou mensagem interna', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    function BrokenView() {
      throw new Error('segredo-interno');
    }
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>
    );
    expect(
      screen.getByRole('heading', { name: 'Não foi possível exibir esta página.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText(/segredo-interno/)).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
