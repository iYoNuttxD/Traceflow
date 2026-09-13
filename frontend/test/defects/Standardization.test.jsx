import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ResponsibleCombobox } from '../../src/shared/index.js';
import { DefectDetails } from '../../src/features/defects/components/DefectDetails.jsx';
import { DefectForm } from '../../src/features/defects/components/DefectForm.jsx';
import { DefectFlow } from '../../src/features/defects/components/DefectFlow.jsx';
import { TaskCorrectionBadge } from '../../src/features/tasks/components/TaskCorrectionContext.jsx';
import { KanbanFilters } from '../../src/features/tasks/components/KanbanFilters.jsx';
import { defect, options, task, candidate } from './fixtures.js';
const api = vi.hoisted(() => ({ detail: vi.fn(), correction: vi.fn(), candidates: vi.fn() }));
vi.mock('../../src/features/defects/api/defects.api.js', () => ({ defectsApi: api }));
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  window.matchMedia.mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  api.detail.mockResolvedValue(defect);
  api.candidates.mockResolvedValue({ items: [candidate] });
});
it('searches only eligible members and offers one selected representation', async () => {
  const user = userEvent.setup(),
    change = vi.fn();
  const view = wrap(
    <ResponsibleCombobox
      members={[...options.members, { id: 99, isActive: false, user: { id: 99, name: 'Oculto' } }]}
      value=""
      required
      onChange={change}
    />
  );
  const input = screen.getByRole('combobox', { name: 'Responsável' });
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/membro ativo|usuário ativo/)).not.toBeInTheDocument();
  await user.click(input);
  await user.type(input, 'QA');
  await user.click(await screen.findByRole('option', { name: 'Pessoa QA' }));
  expect(change).toHaveBeenCalledWith('7');
  view.rerender(
    <ResponsibleCombobox members={options.members} value="7" required onChange={change} />
  );
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getAllByText('Pessoa QA')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Remover Pessoa QA' }));
  expect(change).toHaveBeenLastCalledWith('');
});
it('does not reserve an action row when Kanban filters are empty', async () => {
  const props = {
    filters: { search: '', responsibleUserId: '', priority: '', startDate: '', endDate: '' },
    members: [],
    activeCount: 0,
    scopedCount: 1,
    visibleCount: 1,
    onChange: vi.fn(),
    onClear: vi.fn()
  };
  const view = wrap(<KanbanFilters {...props} />);
  await userEvent.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
  expect(view.container.querySelector('.kanban-filters__actions')).toBeNull();
  view.rerender(
    <MemoryRouter>
      <KanbanFilters {...props} activeCount={1} />
    </MemoryRouter>
  );
  expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
});
it('shows action, expected and observed snapshots and one severity select in the form', async () => {
  wrap(<DefectForm projectId={1} defect={defect} options={options} onSave={vi.fn()} />);
  for (const label of ['Ação', 'Resultado esperado', 'Resultado observado'])
    expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByText(candidate.failedStep.expectedResult)).toBeInTheDocument();
  expect(screen.getAllByText('Alta')).toHaveLength(1);
  const remove = screen.getByRole('button', { name: `Remover TASK-${task.id}` });
  expect(remove).toHaveAttribute('title', `Remover TASK-${task.id}`);
  expect(remove).not.toHaveTextContent('Remover');
});
it('creates a correction in the same dialog and returns to the updated section', async () => {
  const user = userEvent.setup();
  api.correction.mockResolvedValue({
    ...defect,
    revision: 2,
    correctionCycles: [{ cycle: 1, tasks: [{ ...task, id: 44, title: 'Correção criada' }] }]
  });
  wrap(<DefectFlow projectId={1} initialId={1} options={options} canWrite onClose={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: 'Criar tarefa de correção' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Voltar para DEF-1' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Responsável' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Criar tarefa de correção' }));
  expect(await screen.findByRole('link', { name: /TASK-44/ })).toBeInTheDocument();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(api.correction).toHaveBeenCalledWith(
    1,
    expect.objectContaining({
      expectedRevision: 1,
      correctionCycle: 1,
      task: expect.objectContaining({ requirementId: defect.requirementId })
    })
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Criar tarefa de correção' })).toHaveFocus()
  );
});
it.each(['Criar tarefa de correção', 'Vincular tarefa existente'])(
  'preserves the return focus after cancelling %s and a parent refresh',
  async (action) => {
    const user = userEvent.setup();
    const view = wrap(
      <DefectFlow projectId={1} initialId={1} options={options} canWrite onClose={vi.fn()} />
    );
    await user.click(await screen.findByRole('button', { name: action }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    view.rerender(
      <MemoryRouter>
        <DefectFlow projectId={1} initialId={1} options={options} canWrite onClose={vi.fn()} />
      </MemoryRouter>
    );
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: action })).toHaveFocus();
    expect(api.correction).not.toHaveBeenCalled();
  }
);

it.each(['ABERTO', 'EM_CORRECAO', 'AGUARDANDO_RETESTE', 'VALIDADO'])(
  'structures current validation for %s',
  (status) => {
    const data = {
      ...defect,
      status,
      statusReason: {
        ...defect.statusReason,
        validatedByExecutionId: status === 'VALIDADO' ? 50 : null
      },
      retests: [
        {
          correctionCycle: 1,
          testExecutionId: 50,
          execution: {
            id: 50,
            result: 'PASS',
            environment: 'HOMOLOGACAO',
            executedAt: defect.createdAt,
            executedByDisplayNameSnapshot: 'Executor histórico'
          }
        }
      ]
    };
    wrap(<DefectDetails defect={data} canWrite onView={vi.fn()} onExecution={vi.fn()} />);
    const validation = within(screen.getByRole('region', { name: 'Validação' }));
    expect(
      validation.getByText(
        status === 'VALIDADO'
          ? 'Aprovado'
          : status === 'AGUARDANDO_RETESTE'
            ? 'Aguardando reteste'
            : 'Pendente'
      )
    ).toBeInTheDocument();
    expect(validation.queryByRole('button', { name: 'Retestar' })).not.toBeInTheDocument();
    if (status === 'VALIDADO')
      expect(validation.getByText('Executor histórico')).toBeInTheDocument();
    else expect(validation.queryByText('Executor histórico')).not.toBeInTheDocument();
  }
);
it('keeps correction markers semantic, compact in content and absent for origin-only tasks', () => {
  const view = wrap(
    <TaskCorrectionBadge
      task={{ ...task, projectId: 1, correctionDefectCount: 1, correctionDefects: [defect] }}
    />
  );
  expect(view.container.querySelector('[data-icon="bug"]')).toBeInTheDocument();
  expect(view.container.querySelector('[data-icon="code"]')).toBeNull();
  view.rerender(<TaskCorrectionBadge task={{ ...task, correctionDefectCount: 0 }} />);
  expect(view.container).toBeEmptyDOMElement();
});
