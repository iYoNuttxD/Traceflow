import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskForm, emptyTaskForm } from '../../src/components/TaskForm.jsx';

function TaskFormHarness({ onSubmit, editing = false, submitting = false, members = [], ...props }) {
  const [formData, setFormData] = useState(emptyTaskForm);

  return (
    <TaskForm
      formData={formData}
      onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      submitting={submitting}
      editing={editing}
      projectMembers={members}
      {...props}
    />
  );
}

describe('TaskForm', () => {
  it('renderiza, preenche o título e submete o formulário atual', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<TaskFormHarness onSubmit={onSubmit} />);

    expect(screen.getByLabelText('Título da tarefa')).toBeRequired();
    expect(screen.getByRole('combobox', { name: /Responsável/ })).toBeDisabled();
    expect(screen.getByText(/Cadastre membros no projeto/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Título da tarefa'), 'Tarefa artificial');
    await user.selectOptions(screen.getByLabelText('Prioridade'), 'ALTA');
    await user.click(screen.getByRole('button', { name: 'Cadastrar tarefa' }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Título da tarefa')).toHaveValue('Tarefa artificial');
    expect(screen.getByLabelText('Prioridade')).toHaveValue('ALTA');
  });

  it('exibe esforço realizado em edição e mantém o submit desabilitado', () => {
    render(<TaskFormHarness onSubmit={vi.fn()} editing submitting />);

    expect(screen.getByLabelText('Esforço realizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
  });

  it('separa busca manual e commits vinculados, filtrando por SHA ou mensagem', async () => {
    const user = userEvent.setup();
    render(
      <TaskFormHarness
        onSubmit={vi.fn((event) => event.preventDefault())}
        commitResults={[
          { id: 1, hash: 'abc123456', message: 'Implementa cadastro' },
          { id: 2, hash: 'def987654', message: 'Corrige relatório' }
        ]}
        onCommitSearch={vi.fn()}
      />
    );

    expect(screen.getByText('Buscar commits do projeto')).toBeInTheDocument();
    expect(screen.getByText('Sugestões automáticas')).toBeInTheDocument();
    expect(screen.getByText('Commits vinculados')).toBeInTheDocument();
    expect(screen.getByText(/Após salvar a tarefa/)).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Buscar commits do projeto' }), 'abc');
    expect(screen.getByRole('button', { name: /abc1234/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /def9876/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByRole('searchbox', { name: 'Buscar commits do projeto' })).toHaveValue('');
  });

  it('informa quando a busca manual não encontra commit compatível', async () => {
    const user = userEvent.setup();
    render(
      <TaskFormHarness
        onSubmit={vi.fn((event) => event.preventDefault())}
        commitResults={[{ id: 1, hash: 'abc123456', message: 'Implementa cadastro' }]}
        onCommitSearch={vi.fn()}
      />
    );
    await user.type(screen.getByRole('searchbox', { name: 'Buscar commits do projeto' }), 'xyz');
    expect(screen.getByText('Nenhum commit encontrado.')).toBeInTheDocument();
  });
});
