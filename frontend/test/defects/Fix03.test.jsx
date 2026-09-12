import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { DefectCard } from '../../src/features/defects/DefectsScreen.jsx';
import { DefectFlow } from '../../src/features/defects/components/DefectFlow.jsx';
import { TaskQuality } from '../../src/features/tasks/components/TaskQuality.jsx';
import { TaskTraceability } from '../../src/features/tasks/components/TaskTraceability.jsx';
import { defect, options, task } from './fixtures.js';
const api = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn(), cases: vi.fn() }));
vi.mock('../../src/features/defects/api/defects.api.js', () => ({ defectsApi: api }));
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: { list: api.cases }
}));
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  window.matchMedia.mockImplementation(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  api.detail.mockResolvedValue(defect);
  api.cases.mockResolvedValue({ items: [], total: 0 });
  api.list.mockImplementation((_id, query) =>
    Promise.resolve({
      items: query.correctionTaskId ? [defect] : [],
      total: query.correctionTaskId ? 1 : 0
    })
  );
});
it.each([
  ['ABERTO', 0, 'Adicionar correção', false],
  ['ABERTO', 1, 'Acessar correções', false],
  ['EM_CORRECAO', 1, 'Acessar correções', false],
  ['AGUARDANDO_RETESTE', 1, 'Acessar correções', true],
  ['VALIDADO', 1, 'Acessar correções', false]
])('offers the next action for %s with %s corrections', async (status, count, label, retest) => {
  const onOpen = vi.fn(),
    user = userEvent.setup();
  wrap(
    <DefectCard
      defect={{ ...defect, status, correctionTaskCount: count }}
      canWrite
      onOpen={onOpen}
    />
  );
  expect(Boolean(screen.queryByRole('button', { name: 'Retestar', exact: true }))).toBe(retest);
  await user.click(screen.getByRole('button', { name: label, exact: true }));
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledWith(
    'correction',
    expect.objectContaining({ status }),
    expect.any(HTMLElement)
  );
  expect(api.detail).not.toHaveBeenCalled();
});
it('retains correction reading for VIEWER without offering mutations', () => {
  wrap(
    <DefectCard
      defect={{ ...defect, status: 'AGUARDANDO_RETESTE', correctionTaskCount: 1 }}
      canWrite={false}
      onOpen={vi.fn()}
    />
  );
  expect(screen.getByRole('button', { name: 'Acessar correções' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retestar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Adicionar correção' })).not.toBeInTheDocument();
});
it('uses list metadata for one task, aggregates and requirement without per-card reads', () => {
  const view = wrap(
    <DefectCard
      defect={{
        ...defect,
        correctionSummary: { total: 1, singleTask: { id: 17, status: 'CONCLUIDO' } }
      }}
      onOpen={vi.fn()}
    />
  );
  expect(screen.getByText('TASK-17 · Concluída')).toBeInTheDocument();
  expect(screen.getByText('Detectado em')).toBeInTheDocument();
  expect(screen.getByText('TC-15 · EXEC-0038 · Passo 1')).toBeInTheDocument();
  expect(screen.getByText('Ciclo 1')).toBeInTheDocument();
  expect(screen.getByText('Alta')).toBeInTheDocument();
  expect(screen.getByLabelText('Detecção: Atual')).toBeInTheDocument();
  expect(screen.getByText('Pessoa QA')).toBeInTheDocument();
  expect(screen.getByText('Requisito')).toBeInTheDocument();
  view.rerender(
    <MemoryRouter>
      <DefectCard
        defect={{
          ...defect,
          requirement: null,
          correctionSummary: { total: 3, done: 1, inProgress: 1, todo: 1, singleTask: null }
        }}
        onOpen={vi.fn()}
      />
    </MemoryRouter>
  );
  expect(screen.getByText('1 concluída · 1 em andamento · 1 a fazer')).toBeInTheDocument();
  expect(view.container.querySelector('.defect-card-requirement')).toBeNull();
  expect(api.detail).not.toHaveBeenCalled();
});
it('focuses Correção after async detail loading and returns to its create/link action', async () => {
  const user = userEvent.setup();
  wrap(
    <DefectFlow
      projectId={1}
      initialId={1}
      initialSection="correction"
      canWrite
      options={options}
      onClose={vi.fn()}
    />
  );
  const region = await screen.findByRole('region', { name: 'Correção' });
  await waitFor(() => expect(region).toHaveFocus());
  await user.click(within(region).getByRole('button', { name: 'Criar tarefa de correção' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Criar tarefa de correção', exact: true })
    ).toHaveFocus()
  );
});
it('keeps a correction task as a route link without closing away the defect return context', async () => {
  api.detail.mockResolvedValue({
    ...defect,
    correctionCycles: [{ cycle: 1, tasks: [{ ...task, id: 17 }] }]
  });
  const close = vi.fn();
  wrap(
    <DefectFlow
      projectId={1}
      initialId={1}
      initialSection="correction"
      options={options}
      onClose={close}
    />
  );
  const region = await screen.findByRole('region', { name: 'Correção' });
  const link = within(region).getByRole('link', { name: /TASK-17/ });
  expect(link).toHaveAttribute('href', '/projects/1/kanban?task=17');
  await userEvent.setup().click(link);
  expect(close).not.toHaveBeenCalled();
});
it.each([false, true])(
  'shares six shells and keeps the create action in the footer (populated=%s)',
  async (populated) => {
    if (populated)
      api.cases.mockResolvedValue({
        items: [
          {
            id: 5,
            title: 'Título longo '.repeat(15),
            status: 'ATIVO',
            latestExecution: { result: 'FAIL' }
          }
        ],
        total: 1
      });
    const view = wrap(
      <>
        <TaskTraceability task={{ ...task, commits: [], issues: [] }} projectId={1} />
        <TaskQuality task={task} projectId={1} canCreate onCreate={vi.fn()} />
      </>
    );
    await screen.findByText('CORREÇÃO');
    if (!populated)
      expect(screen.getByText('Nenhum caso de teste relacionado.')).toBeInTheDocument();
    const shells = view.container.querySelectorAll('.task-detail-relation-card');
    expect(shells).toHaveLength(6);
    for (const shell of shells) {
      expect(shell.querySelector('.task-detail-artifact-heading')).toBeInTheDocument();
      expect(shell.querySelector('.task-detail-artifact-body')).toBeInTheDocument();
    }
    const action = screen.getByRole('button', { name: 'Criar caso de teste' });
    expect(action.closest('footer')).toHaveClass('task-detail-artifact-footer');
    expect(action.closest('.task-detail-artifact-body')).toBeNull();
    const quality = screen.getByRole('region', { name: 'Qualidade' });
    expect(quality.querySelectorAll('.task-detail-relation-list')).toHaveLength(populated ? 2 : 1);
    const rows = quality.querySelectorAll('.entity-row');
    for (const row of rows) {
      expect(row.querySelector('.entity-row__content > strong')).toBeInTheDocument();
      expect(row.querySelector('.entity-row__metadata')).toBeInTheDocument();
      expect(row.querySelector(':scope > .traceflow-icon')).toBeInTheDocument();
    }
  }
);
