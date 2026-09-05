import { createRef, useRef, useState } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrozenTaskDetails } from '../../src/features/tasks/components/FrozenTaskDetails.jsx';
import { TaskDetailsPanel } from '../../src/features/tasks/components/TaskDetailsPanel.jsx';
import { KanbanBoard } from '../../src/features/tasks/components/KanbanBoard.jsx';
import { frozenTaskDetailsView } from '../../src/features/tasks/components/frozen-task-details-view.js';
import { ConfirmProvider } from '../../src/shared/index.js';
import { TaskComments } from '../../src/features/tasks/components/TaskComments.jsx';

vi.mock('../../src/features/tasks/components/TaskComments.jsx', () => ({
  TaskComments: vi.fn(() => (
    <aside className="task-comments">
      Comentários<button>Enviar comentário</button>
    </aside>
  ))
}));
const frozen = {
  id: 5,
  currentTaskId: 5,
  sprintId: 1,
  isFrozen: true,
  snapshotAvailable: true,
  snapshotAt: '2026-09-05T08:31:57Z',
  title: 'Tarefa Original',
  priority: 'MEDIA',
  responsibleUserId: 2,
  status: 'EM_ANDAMENTO',
  deadline: '2026-09-10T00:00:00Z',
  estimatedEffort: 5,
  traceabilityCounts: { requirements: 1, pullRequests: 1, commits: 2, issues: 0 }
};
const current = {
  id: 5,
  title: 'Tarefa Atualizada',
  description: 'Descrição atual privada',
  priority: 'CRITICA',
  responsibleUser: { id: 3, name: 'João atual' },
  status: 'CONCLUIDO',
  deadline: '2026-09-20',
  estimatedEffort: 13,
  actualEffort: 8,
  createdAt: '2026-08-01T00:00:00Z',
  pullRequest: {
    id: 3,
    number: 99,
    title: 'PR atual',
    githubUrl: 'https://github.com/example/repo/pull/99'
  },
  commits: Array.from({ length: 5 }, (_, id) => ({
    id,
    hash: `current${id}`,
    message: 'Commit atual'
  })),
  issues: Array.from({ length: 3 }, (_, id) => ({ id, number: id + 1, title: 'Issue atual' }))
};
const showFrozen = (task = frozen, props = {}) =>
  render(
    <FrozenTaskDetails
      task={task}
      sprintName="Sprint 1"
      onClose={vi.fn()}
      onOpenCurrent={vi.fn()}
      {...props}
    />
  );
beforeEach(() => vi.clearAllMocks());
const field = (dialog, label) =>
  within(dialog).getByText(label, { selector: 'dt' }).nextElementSibling;
const sections = (root) => ({
  labels: [...root.querySelectorAll('dt')].map((e) => e.textContent),
  headings: [...root.querySelectorAll('h3')].map((e) => e.textContent),
  trace: [...root.querySelectorAll('.task-detail-artifact-heading > span')].map(
    (e) => e.textContent
  )
});

describe('FIX-04 Frozen Task Details parity', () => {
  it('shares current information/secondary/traceability structure without mounting Comments or mutable actions', () => {
    const first = render(
      <ConfirmProvider>
        <TaskDetailsPanel task={current} canEdit canDelete onClose={vi.fn()} />
      </ConfirmProvider>
    );
    const currentDialog = screen.getByRole('dialog');
    const shape = sections(currentDialog);
    expect(
      within(currentDialog).getByRole('button', { name: 'Editar tarefa' })
    ).toBeInTheDocument();
    expect(
      within(currentDialog).getByRole('button', { name: 'Excluir tarefa' })
    ).toBeInTheDocument();
    expect(TaskComments).toHaveBeenCalled();
    first.unmount();
    vi.clearAllMocks();
    showFrozen();
    const dialog = screen.getByRole('dialog', { name: '#5 Tarefa Original' });
    expect(sections(dialog)).toEqual(shape);
    expect(dialog.querySelector('.task-detail-description')).toHaveTextContent(
      'Descrição indisponível no snapshot.'
    );
    expect(dialog.querySelector('.task-detail-layout--single')).toBeInTheDocument();
    expect(dialog.querySelector('.task-detail-layout').children).toHaveLength(1);
    expect(TaskComments).not.toHaveBeenCalled();
    expect(within(dialog).queryByText(/Comentários/)).toBeNull();
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: /Editar|Excluir|Sugerir|Comentar|Enviar/ })
    ).toBeNull();
  });

  it('uses only the supported closing projection, even if current-only fields are accidentally attached', () => {
    showFrozen({ ...current, ...frozen });
    const dialog = screen.getByRole('dialog');
    expect(field(dialog, 'Prioridade')).toHaveTextContent('Média');
    expect(field(dialog, 'Prioridade').querySelector('.priority-media')).toBeInTheDocument();
    expect(field(dialog, 'Responsável')).toHaveTextContent('Responsável #2');
    expect(field(dialog, 'Responsável')).toHaveTextContent('nome indisponível no snapshot');
    expect(field(dialog, 'Prazo')).toHaveTextContent('10/09/2026');
    expect(field(dialog, 'Status')).toHaveTextContent('Em Andamento');
    expect(field(dialog, 'Esforço estimado')).toHaveTextContent('5');
    expect(field(dialog, 'Esforço realizado')).toHaveTextContent('Indisponível no snapshot');
    expect(field(dialog, 'Criado em')).toHaveTextContent('Indisponível no snapshot');
    expect(within(dialog).getByText('Estado no encerramento da Sprint 1')).toBeInTheDocument();
    expect(within(dialog).getByText(/Congelado em/)).toBeInTheDocument();
    for (const text of [
      'Descrição atual privada',
      'João atual',
      'PR atual',
      'Commit atual',
      'Issue atual',
      'Atrasada'
    ])
      expect(within(dialog).queryByText(text)).toBeNull();
    expect(within(dialog).queryByRole('link')).toBeNull();
    const categories = [...dialog.querySelectorAll('.task-detail-traceability-grid article')];
    expect(categories.map((e) => e.textContent)).toEqual([
      'Requisito11 vínculo no encerramento',
      'Pull request11 vínculo no encerramento',
      'Commits22 vínculos no encerramento',
      'Issues0Nenhum vínculo no encerramento'
    ]);
  });

  it('distinguishes captured empty data from unknown legacy fields and preserves known status/effort', () => {
    const view = frozenTaskDetailsView({ ...frozen, responsibleUserId: null, deadline: null });
    expect(view.responsible.label).toBe('Não informado');
    expect(view.deadline.label).toBe('Sem prazo');
    showFrozen(
      { ...frozen, snapshotAvailable: false, currentTaskId: null },
      { historicalLimitations: ['LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE'] }
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Snapshot detalhado indisponível');
    for (const label of ['Prioridade', 'Responsável', 'Prazo'])
      expect(field(dialog, label)).toHaveTextContent('Indisponível no snapshot');
    expect(field(dialog, 'Status')).toHaveTextContent('Em Andamento');
    expect(field(dialog, 'Esforço estimado')).toHaveTextContent('5');
    expect(within(dialog).queryByRole('button', { name: 'Abrir tarefa atual' })).toBeNull();
    expect(within(dialog).getByText('Tarefa atual indisponível.')).toBeInTheDocument();
    expect(dialog.querySelectorAll('.task-detail-artifact-heading strong')[0]).toHaveTextContent(
      '—'
    );
  });

  it('handles absent fields/cutoff without converting unknown values into empty historical values', () => {
    const view = frozenTaskDetailsView({
      ...frozen,
      snapshotAt: null,
      priority: null,
      responsibleUserId: undefined,
      deadline: undefined,
      estimatedEffort: null,
      status: null,
      traceabilityCounts: { commits: 0 }
    });
    expect(view.cutoff).toContain('indisponível');
    for (const item of [view.priority, view.responsible, view.deadline, view.status])
      expect(item.label).toBe('Indisponível no snapshot');
    expect(view.traceability.find((x) => x.key === 'commits').text).toBe(
      'Nenhum vínculo no encerramento'
    );
    expect(view.traceability.find((x) => x.key === 'issues').text).toBe('Indisponível no snapshot');
  });

  it('keeps long historical titles and large captured counts without inventing artifact content', () => {
    showFrozen({
      ...frozen,
      title: 'Título histórico longo '.repeat(20),
      traceabilityCounts: { requirements: 1, pullRequests: 1, commits: 120, issues: 90 }
    });
    expect(screen.getByText('120 vínculos no encerramento')).toBeInTheDocument();
    expect(screen.getByText('90 vínculos no encerramento')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it.each(['{Enter}', ' '])(
    'opens with %s, keeps column/detail status identical, traps focus and returns it on Escape',
    async (key) => {
      function Harness() {
        const [selected, setSelected] = useState(null);
        const ref = useRef(null);
        return (
          <>
            <KanbanBoard
              board={{
                columns: { A_FAZER: [], EM_ANDAMENTO: [frozen], CONCLUIDO: [] },
                totals: { total: 1 }
              }}
              onSelectTask={(task, trigger) => {
                ref.current = trigger;
                setSelected(task);
              }}
            />
            {selected && (
              <FrozenTaskDetails
                task={selected}
                sprintName="Sprint 1"
                returnFocusRef={ref}
                onClose={() => setSelected(null)}
                onOpenCurrent={vi.fn()}
              />
            )}
          </>
        );
      }
      const user = userEvent.setup();
      render(<Harness />);
      const card = screen.getByRole('button', { name: 'Abrir detalhes de Tarefa Original' });
      card.focus();
      await user.keyboard(key);
      const dialog = screen.getByRole('dialog');
      expect(field(dialog, 'Status')).toHaveTextContent('Em Andamento');
      const close = within(dialog).getByRole('button', { name: /Fechar/ });
      const open = within(dialog).getByRole('button', { name: 'Abrir tarefa atual' });
      await waitFor(() => expect(close).toHaveFocus());
      await user.tab({ shift: true });
      expect(open).toHaveFocus();
      await user.tab();
      expect(close).toHaveFocus();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(card).toHaveFocus();
    }
  );

  it('disables a known unavailable current Task while preserving the frozen details and feedback', () => {
    const ref = createRef();
    showFrozen(frozen, {
      unavailable: true,
      error: 'Tarefa atual indisponível. O snapshot histórico foi preservado.',
      returnFocusRef: ref
    });
    expect(screen.getByRole('button', { name: 'Abrir tarefa atual' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('snapshot histórico foi preservado');
  });
});

it('renders complete v2 historical information and artifact cards without current reads or Comments', () => {
  const request = vi.spyOn(globalThis, 'fetch');
  const complete = {
    ...frozen,
    snapshotVersion: 2,
    description: 'Descrição original da tarefa',
    responsibleDisplayName: 'Daniel',
    actualEffort: 3,
    createdAt: '2026-08-01T12:00:00Z',
    requirement: { id: 1, title: 'R1', status: 'EM_ANDAMENTO' },
    pullRequest: {
      id: 10,
      number: 10,
      title: 'PR histórico',
      state: 'open',
      githubUrl: 'https://github.com/example/repo/pull/10'
    },
    commits: [
      {
        id: 1,
        hash: 'abcdef123456',
        message: 'Commit A',
        authorName: 'Autor histórico',
        date: '2026-08-01T12:00:00Z',
        githubUrl: 'https://github.com/example/repo/commit/abcdef123456'
      }
    ],
    issues: [
      {
        id: 5,
        number: 5,
        title: 'Issue histórica',
        state: 'open',
        labels: ['bug'],
        githubUrl: 'https://github.com/example/repo/issues/5'
      }
    ]
  };
  showFrozen(complete, { historicalLimitations: ['LEGACY_CLOSING_TASK_DETAILS_PARTIAL'] });
  const dialog = screen.getByRole('dialog', { name: '#5 Tarefa Original' });
  expect(screen.getByText(complete.description)).toBeInTheDocument();
  for (const [label, value] of [
    ['Prioridade', 'Média'],
    ['Responsável', 'Daniel'],
    ['Prazo', '10/09/2026'],
    ['Status', 'Em Andamento'],
    ['Esforço estimado', '5'],
    ['Esforço realizado', '3'],
    ['Criado em', '01/08/2026']
  ])
    expect(field(dialog, label)).toHaveTextContent(value);
  for (const text of [
    /R1/,
    /PR histórico/,
    /Commit A/,
    /Autor histórico/,
    /Issue histórica/,
    /bug/
  ])
    expect(within(dialog).getByText(text)).toBeInTheDocument();
  expect(
    within(dialog)
      .getAllByRole('link', { name: /Abrir no GitHub/ })
      .map((a) => a.href)
  ).toEqual([
    complete.pullRequest.githubUrl,
    complete.commits[0].githubUrl,
    complete.issues[0].githubUrl
  ]);
  expect(dialog.querySelectorAll('.task-detail-external-link')).toHaveLength(3);
  expect(screen.queryByText(/Indisponível no snapshot/)).toBeNull();
  expect(within(dialog).queryByRole('status')).toBeNull();
  expect(TaskComments).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  request.mockRestore();
});
