import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';
import { TaskDetailsPanel } from '../../src/features/tasks/components/TaskDetailsPanel.jsx';
import { GraphEntityDetails } from '../../src/features/traceability/components/GraphEntityDetails.jsx';
import { KanbanDialog } from '../../src/features/tasks/components/KanbanDialog.jsx';
import { TraceabilityInspector } from '../../src/features/traceability/components/TraceabilityInspector.jsx';
import { fixture } from '../helpers/expanded-graph.js';
const task = {
  id: 16,
  projectId: 2,
  title: 'Paridade da tarefa',
  description: 'Descrição canônica',
  priority: 'MEDIA',
  status: 'EM_ANDAMENTO',
  estimatedEffort: 5,
  actualEffort: 4,
  commits: [],
  issues: []
};
vi.mock('../../src/features/tasks/hooks/useTaskEffort.js', () => ({
  useTaskEffort: () => ({
    running: null,
    entries: [],
    effort: null,
    permissions: { canOperate: false },
    loading: false,
    busy: false,
    error: '',
    liveSeconds: 0
  })
}));
vi.mock('../../src/features/tasks/api/tasks.api.js', async (original) => ({
  ...(await original()),
  tasksApi: { get: async () => ({ data: { task } }) },
  getTaskEffortHistory: async () => ({
    items: [],
    pagination: { page: 1, total: 0, totalPages: 0 }
  })
}));
vi.mock('../../src/features/tasks/components/TaskComments.jsx', () => ({
  TaskComments: () => <aside aria-label="Comentários">Comentários</aside>
}));
vi.mock('../../src/features/tasks/components/TaskQuality.jsx', () => ({
  TaskQuality: () => <section aria-label="Qualidade">Qualidade</section>
}));
function wrap(child) {
  return render(
    <MemoryRouter>
      <ConfirmProvider>{child}</ConfirmProvider>
    </MemoryRouter>
  );
}
function essential() {
  expect(screen.getByRole('heading', { name: 'Descrição' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Informações' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Rastreabilidade' })).toBeVisible();
  expect(screen.getByRole('complementary', { name: 'Comentários' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Esforço (horas)' })).toHaveTextContent(
    '4h de 5h estimadas'
  );
  expect(screen.getByText('80%')).toBeVisible();
}
describe('Task Details graph parity', () => {
  it('shares description, information, effort, traceability and comments across both entry points', async () => {
    const normal = wrap(<TaskDetailsPanel task={task} projectId={2} onClose={() => {}} />);
    essential();
    normal.unmount();
    wrap(
      <KanbanDialog title="Workspace" onClose={() => {}}>
        <GraphEntityDetails
          node={{ id: 'task:16', type: 'TASK', data: { id: 16 } }}
          projectId={2}
          onClose={() => {}}
        />
      </KanbanDialog>
    );
    await screen.findByText('Descrição canônica');
    essential();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fechar workspace' })).toHaveFocus()
    );
    await user.click(screen.getByRole('button', { name: 'Ver sessões registradas' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const history = screen.getByRole('region', { name: 'Sessões — #16 Paridade da tarefa' });
    expect(within(history).getByLabelText('Evento')).toBeEnabled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Sessões — #16 Paridade da tarefa' })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ver sessões registradas' })).toHaveFocus()
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
  it.each([
    'REQUIREMENT',
    'TASK',
    'COMMIT',
    'TEST_CASE',
    'TEST_EXECUTION',
    'DEFECT',
    'PULL_REQUEST',
    'ISSUE'
  ])('uses the same section surface for %s', (type) => {
    const contract = fixture();
    const node = contract.nodes.find((n) => n.type === type) || {
      id: type + ':30',
      type,
      data: { id: 30, title: 'Artefato', number: 8 }
    };
    wrap(
      <TraceabilityInspector
        node={node}
        contract={contract}
        onClose={() => {}}
        onSelect={() => {}}
        onDetails={() => {}}
      />
    );
    expect(screen.getByRole('region', { name: 'Informações' })).toHaveClass('detail-surface');
    expect(screen.getByRole('region', { name: 'Relações na cadeia' })).toHaveClass(
      'detail-surface'
    );
  });
});
