import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskForm, emptyTaskForm, taskFormToPayload } from '../../src/features/tasks/index.js';

function TaskFormHarness({
  onSubmit,
  editing = false,
  submitting = false,
  members = [],
  ...props
}) {
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

  it('usa o usuário de uma membership ativa como responsável canônico', async () => {
    const user = userEvent.setup();
    render(
      <TaskFormHarness
        onSubmit={vi.fn((event) => event.preventDefault())}
        members={[
          { id: 10, isActive: true, userId: 42, user: { id: 42, name: 'Pessoa ativa' } },
          { id: 11, isActive: false, userId: 57, user: { id: 57, name: 'Pessoa inativa' } }
        ]}
      />
    );

    const responsible = screen.getByRole('combobox', { name: /Responsável/ });
    await user.selectOptions(responsible, '42');

    expect(responsible).toHaveValue('42');
    expect(screen.queryByRole('option', { name: 'Pessoa inativa' })).not.toBeInTheDocument();
    expect(taskFormToPayload({ ...emptyTaskForm, responsibleUserId: '42' })).toMatchObject({
      responsibleUserId: 42
    });
    expect(taskFormToPayload({ ...emptyTaskForm, responsible: 'Nome legado' })).not.toHaveProperty(
      'responsible'
    );
  });

  it('separa busca manual e commits vinculados, filtrando por SHA ou mensagem', async () => {
    const user = userEvent.setup();
    const onCommitSearchClear = vi.fn();
    render(
      <TaskFormHarness
        onSubmit={vi.fn((event) => event.preventDefault())}
        commitResults={[
          { id: 1, hash: 'abc123456', message: 'Implementa cadastro' },
          { id: 2, hash: 'def987654', message: 'Corrige relatório' }
        ]}
        onCommitSearch={vi.fn()}
        onCommitSearchClear={onCommitSearchClear}
      />
    );

    expect(screen.getByText('Buscar commits do projeto')).toBeInTheDocument();
    expect(screen.getByText('Sugestões automáticas')).toBeInTheDocument();
    expect(screen.getByText('Commits vinculados')).toBeInTheDocument();
    expect(screen.getByText(/Após salvar a tarefa/)).toBeInTheDocument();

    const searchInput = screen.getByRole('searchbox', { name: 'Buscar commits do projeto' });
    await user.type(searchInput, 'abc');
    expect(screen.getByRole('button', { name: /abc1234/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /def9876/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpar busca de commits' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Limpar busca de commits' }));
    expect(searchInput).toHaveValue('');
    expect(searchInput).toHaveFocus();
    expect(onCommitSearchClear).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /abc1234/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Limpar busca de commits' })
    ).not.toBeInTheDocument();
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
