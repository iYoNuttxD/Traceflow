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
import { PasswordField } from '../../src/features/auth/index.js';

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

  it('desabilita retry durante o prazo informado pelo backend', () => {
    render(<ErrorState message="Muitas requisições." onRetry={vi.fn()} retryAfterSeconds={18} />);
    const button = screen.getByRole('button', { name: 'Tentar novamente em 18s' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('button-secondary', 'button-compact');
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

  it('distingue success, warning e rate limit por semântica, ícone e texto', () => {
    const { rerender } = render(<FeedbackRegion success="E-mail enviado com sucesso." />);
    expect(screen.getByRole('status')).toHaveClass('message-success');
    expect(screen.getByRole('status')).toHaveTextContent('✓');
    rerender(<FeedbackRegion warning="Verifique seu e-mail." />);
    expect(screen.getByRole('alert')).toHaveClass('message-warning');
    expect(screen.getByRole('alert')).toHaveTextContent('⚠');
    rerender(<FeedbackRegion rateLimit="Muitas tentativas realizadas." retryAfterSeconds={58} />);
    expect(screen.getByRole('alert')).toHaveClass('message-rate-limit');
    expect(screen.getByRole('alert')).toHaveTextContent('Tente novamente em 58s.');
  });

  it('permite mostrar senha e informa força somente quando solicitado', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <PasswordField
        id="new-password"
        value="Senha artificial 123!"
        onChange={vi.fn()}
        showRequirements
      />
    );
    expect(screen.getByLabelText(/Força da senha/)).toBeInTheDocument();
    const input = screen.getByLabelText(/^Senha/);
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input).toHaveAttribute('type', 'text');
    rerender(
      <PasswordField
        id="current-password"
        label="Senha atual"
        value="artificial"
        onChange={vi.fn()}
        autoComplete="current-password"
      />
    );
    expect(screen.queryByLabelText(/Força da senha/)).not.toBeInTheDocument();
  });

  it('mantém indicador obrigatório condicional e controle de visibilidade no mesmo campo', () => {
    const { rerender } = render(
      <PasswordField id="required-password" label="Senha atual" value="" onChange={vi.fn()} />
    );
    const requiredInput = screen.getByLabelText('Senha atual *');
    const requiredLabel = document.querySelector('label[for="required-password"]');
    expect(requiredInput).toBeRequired();
    expect(requiredLabel).toHaveTextContent('Senha atual *');
    expect(requiredLabel.querySelector('[aria-hidden="true"]')).toHaveTextContent('*');
    expect(screen.getByRole('button', { name: 'Mostrar senha' }).parentElement).toHaveClass(
      'password-control'
    );

    rerender(
      <PasswordField
        id="optional-password"
        label="Senha atual"
        value=""
        onChange={vi.fn()}
        required={false}
      />
    );
    const optionalInput = screen.getByLabelText('Senha atual');
    expect(optionalInput).not.toBeRequired();
    expect(document.querySelector('label[for="optional-password"]')).not.toHaveTextContent('*');
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

  it('inicia na ação segura, mantém o foco contido e o restaura ao cancelar', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <ConfirmFixture />
      </ConfirmProvider>
    );
    const trigger = screen.getByRole('button', { name: 'Abrir confirmação' });
    await user.click(trigger);
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Excluir' });

    expect(cancel).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();

    await user.click(cancel);
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
