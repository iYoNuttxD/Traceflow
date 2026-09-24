import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const suggestionApiMocks = vi.hoisted(() => ({
  getCommitSuggestions: vi.fn(),
  confirmCommitSuggestion: vi.fn(),
  rejectCommitSuggestion: vi.fn(),
  scanCommitSuggestions: vi.fn()
}));

vi.mock('../../src/features/traceability/api/traceability.api.js', () => suggestionApiMocks);
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
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    suggestionApiMocks.getCommitSuggestions.mockResolvedValue({
      suggestions: [],
      permissions: { canReview: true },
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
    });
  });

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

  it.each([
    ['Pesquisar requisito', 'onRequirementSearch'],
    ['Pesquisar pull request', 'onPullRequestSearch'],
    ['Buscar commits do projeto', 'onCommitSearch'],
    ['Pesquisar issues', 'onIssueSearch']
  ])('não repete a busca de %s após rerender do formulário', async (label, searchProp) => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue([]);
    const props = { onSubmit: vi.fn(), [searchProp]: search };
    const { rerender } = render(<TaskFormHarness {...props} />);
    const input = screen.getByRole('combobox', { name: label });

    fireEvent.change(input, { target: { value: 'ab' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(search).toHaveBeenCalledTimes(1);
    rerender(<TaskFormHarness {...props} />);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(input).toHaveValue('ab');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('não expõe campo editável de esforço realizado em edição e mantém o submit desabilitado', () => {
    render(<TaskFormHarness onSubmit={vi.fn()} editing submitting />);

    expect(screen.queryByLabelText('Esforço realizado')).toBeNull();
    expect(screen.getByText(/Calculado pelo cronômetro/)).toBeInTheDocument();
    expect(screen.getByLabelText('Esforço estimado (horas)')).toBeInTheDocument();
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
    await user.click(responsible);
    await user.click(await screen.findByRole('option', { name: 'Pessoa ativa' }));

    expect(screen.getByRole('group', { name: 'Responsável' })).toHaveTextContent('Pessoa ativa');
    expect(screen.queryByRole('option', { name: 'Pessoa inativa' })).not.toBeInTheDocument();
    expect(taskFormToPayload({ ...emptyTaskForm, responsibleUserId: '42' })).toMatchObject({
      responsibleUserId: 42
    });
    expect(taskFormToPayload({ ...emptyTaskForm, responsible: 'Nome legado' })).not.toHaveProperty(
      'responsible'
    );
  });

  it('pesquisa sprints elegíveis e preserva a sprint encerrada já vinculada', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const sprints = [
      { id: 1, name: 'Sprint encerrada', status: 'CONCLUIDA' },
      { id: 2, name: 'Sprint disponível', status: 'PLANEJADA' }
    ];
    const props = {
      formData: { ...emptyTaskForm, sprintId: '1' },
      sprints,
      onChange,
      onSubmit: vi.fn()
    };
    const { rerender } = render(<TaskForm {...props} />);
    expect(screen.getByRole('group', { name: 'Sprint' })).toHaveTextContent('Sprint encerrada');
    await user.click(screen.getByRole('button', { name: 'Remover Sprint encerrada' }));
    expect(onChange).toHaveBeenCalledWith('sprintId', '');
    rerender(<TaskForm {...props} formData={emptyTaskForm} />);
    await user.click(screen.getByRole('combobox', { name: 'Sprint' }));
    await user.click(await screen.findByRole('option', { name: 'Sprint disponível' }));
    expect(screen.queryByRole('option', { name: 'Sprint encerrada' })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith('sprintId', '2');
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
    expect(screen.getByText('Sugestões de commits')).toBeInTheDocument();
    expect(screen.getByText('Commits vinculados')).toBeInTheDocument();
    expect(
      screen.getByText('Sugestões de commits ficam disponíveis após salvar a tarefa.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sugerir commits' })).not.toBeInTheDocument();

    const searchInput = screen.getByRole('combobox', { name: 'Buscar commits do projeto' });
    await user.type(searchInput, 'abc');
    expect(await screen.findByRole('option', { name: /abc1234/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /def9876/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpar busca de commits' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Limpar busca de commits' }));
    expect(searchInput).toHaveValue('');
    expect(searchInput).toHaveFocus();
    expect(onCommitSearchClear).toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: /abc1234/ })).not.toBeInTheDocument();
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
    await user.type(screen.getByRole('combobox', { name: 'Buscar commits do projeto' }), 'xyz');
    expect(await screen.findByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });

  it('abre todos os pickers de rastreabilidade em overlay sem resultados no fluxo do form', async () => {
    const user = userEvent.setup();
    render(
      <TaskFormHarness
        onSubmit={vi.fn((event) => event.preventDefault())}
        requirements={[{ id: 1, title: 'Gestão de acesso', type: 'FUNCIONAL', status: 'APROVADO' }]}
        pullRequests={[{ id: 2, number: 42, title: 'Gestão de acesso' }]}
        commitResults={[{ id: 3, hash: 'abc123456', message: 'Gestão de acesso' }]}
        issueResults={[{ id: 4, number: 9, title: 'Gestão de acesso' }]}
      />
    );

    for (const name of [
      'Pesquisar requisito',
      'Pesquisar pull request',
      'Buscar commits do projeto',
      'Pesquisar issues'
    ]) {
      const input = screen.getByRole('combobox', { name });
      await user.type(input, 'ges');
      expect((await screen.findByRole('listbox')).parentElement).toBe(document.body);
      expect(document.querySelector('.traceability-results')).toBeNull();
      await user.keyboard('{Escape}');
      await user.clear(input);
    }
  });

  it('reutiliza o controle compacto de sugestões na edição persistida', async () => {
    render(
      <TaskFormHarness
        onSubmit={vi.fn((event) => event.preventDefault())}
        editing
        projectId="3"
        taskId="42"
      />
    );

    expect(await screen.findByRole('button', { name: 'Sugerir commits' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Como funcionam as sugestões de commits' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Sugestões de commits ficam disponíveis após salvar a tarefa.')
    ).not.toBeInTheDocument();
  });
});
