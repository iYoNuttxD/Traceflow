import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { DefectFlow } from '../../src/features/defects/components/DefectFlow.jsx';
import { DefectBadge } from '../../src/features/defects/components/DefectDetails.jsx';
import { CorrectionManager } from '../../src/features/defects/components/CorrectionManager.jsx';
import { DefectCard } from '../../src/features/defects/DefectsScreen.jsx';
import { SearchCombobox } from '../../src/shared/components/SearchCombobox.jsx';
import { TaskQuality } from '../../src/features/tasks/components/TaskQuality.jsx';
import { defect, options, task } from './fixtures.js';
import { deferred } from '../testCases/fixtures.js';

const api = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn(), remove: vi.fn(), cases: vi.fn() }));
vi.mock('../../src/features/defects/api/defects.api.js', () => ({ defectsApi: api }));
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({
  testCasesApi: { list: api.cases }
}));
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  window.matchMedia.mockImplementation((media) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  api.detail.mockResolvedValue(structuredClone(defect));
  api.cases.mockResolvedValue({ items: [], total: 0 });
  api.list.mockResolvedValue({ items: [], total: 0 });
});

it('uses shared compact confirmation without a navigation arrow and cancels without deleting', async () => {
  const user = userEvent.setup();
  wrap(<DefectFlow projectId={1} initialId={1} options={options} canWrite onClose={vi.fn()} />);
  const remove = await screen.findByRole('button', { name: 'Excluir', exact: true });
  expect(remove).toHaveClass('button-danger');
  await user.click(remove);
  const dialog = screen.getByRole('dialog', { name: 'Excluir defeito?' });
  expect(dialog).toHaveClass('confirm-dialog');
  expect(within(dialog).queryByRole('button', { name: /Voltar/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(api.remove).not.toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: 'Excluir', exact: true })).toHaveFocus();
});

it('shows existing corrections before create/link actions, with an honest empty state', () => {
  const data = {
    ...defect,
    correctionCycles: [{ cycle: 1, tasks: [{ ...task, id: 44, status: 'EM_ANDAMENTO' }] }]
  };
  const view = wrap(<CorrectionManager defect={data} options={options} onSave={vi.fn()} />);
  expect(screen.getByRole('link', { name: /TASK-44/ })).toHaveAttribute(
    'href',
    '/projects/1/kanban?task=44'
  );
  expect(screen.queryByText('Nenhuma tarefa de correção neste ciclo.')).not.toBeInTheDocument();
  view.rerender(
    <MemoryRouter>
      <CorrectionManager defect={defect} options={options} onSave={vi.fn()} />
    </MemoryRouter>
  );
  expect(screen.getByText('Nenhuma tarefa de correção neste ciclo.')).toBeInTheDocument();
});

it('routes View correction to the details section rather than the manager', async () => {
  const open = vi.fn(),
    user = userEvent.setup();
  wrap(<DefectCard defect={{ ...defect, status: 'EM_CORRECAO' }} canWrite onOpen={open} />);
  await user.click(screen.getByRole('button', { name: 'Ver correção' }));
  expect(open.mock.calls[0][0]).toBe('correction-details');
});

it.each(['inline', 'fixed'])(
  'closes %s selectors by outside, Escape, selection and unmount',
  async (placement) => {
    const user = userEvent.setup(),
      select = vi.fn();
    const view = wrap(
      <>
        <SearchCombobox
          label="Responsável"
          required
          options={[{ id: 1, name: 'Pessoa' }]}
          minQueryLength={0}
          openOnFocus={false}
          popoverPlacement={placement}
          onSelect={select}
        />
        <button>Fora</button>
      </>
    );
    const input = screen.getByRole('combobox', { name: 'Responsável' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input.closest('.sprint-combobox-field').querySelector('label').textContent).toBe(
      'Responsável *'
    );
    await user.click(input);
    await screen.findByRole('option');
    await user.click(screen.getByRole('button', { name: 'Fora' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('option');
    await user.click(screen.getByRole('option'));
    expect(select).toHaveBeenCalledWith({ id: 1, name: 'Pessoa' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(input);
    await screen.findByRole('option');
    view.unmount();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  }
);

it.each([
  ['BAIXA', 'Baixa'],
  ['MEDIA', 'Média'],
  ['ALTA', 'Alta'],
  ['CRITICA', 'Crítica']
])('keeps severity %s explicit and independently styled', (value, label) => {
  wrap(<DefectBadge value={value} />);
  expect(screen.getByText(label)).toHaveClass(`defect-badge--${value.toLowerCase()}`);
});

it('loads task quality through three filtered catalogs and distinguishes origin/correction', async () => {
  api.cases.mockResolvedValue({
    items: [
      {
        id: 5,
        displayId: 'TC-5',
        title: 'Teste relacionado',
        status: 'ATIVO',
        latestExecution: { result: 'FAIL' }
      }
    ],
    total: 1
  });
  api.list.mockImplementation((_id, q) =>
    Promise.resolve({
      items: [
        { ...defect, id: q.originTaskId ? 2 : 3, displayId: q.originTaskId ? 'DEF-2' : 'DEF-3' }
      ],
      total: 1
    })
  );
  wrap(<TaskQuality task={task} projectId={1} canCreate onCreate={vi.fn()} />);
  expect(await screen.findByRole('link', { name: 'TC-5 · Teste relacionado' })).toBeInTheDocument();
  expect(await screen.findByText('ORIGEM')).toBeInTheDocument();
  expect(await screen.findByText('CORREÇÃO')).toBeInTheDocument();
  expect(screen.getByText('Última execução: Falhou')).toBeInTheDocument();
  expect(api.cases).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ taskId: task.id }),
    expect.anything()
  );
  expect(api.list).toHaveBeenCalledTimes(2);
  expect(
    within(screen.getByRole('region', { name: 'Qualidade' })).getByRole('button', {
      name: 'Criar caso de teste'
    })
  ).toBeInTheDocument();
});

it('does not expose create to viewers and rejects late data from another task', async () => {
  const pending = deferred();
  api.cases.mockReturnValueOnce(pending.promise);
  const view = wrap(<TaskQuality task={task} projectId={1} canCreate={false} />);
  view.rerender(
    <MemoryRouter>
      <TaskQuality task={{ ...task, id: 99 }} projectId={1} canCreate={false} />
    </MemoryRouter>
  );
  await waitFor(() => expect(api.cases).toHaveBeenCalledTimes(2));
  await act(async () => pending.resolve({ items: [{ id: 1, title: 'Obsoleto' }], total: 1 }));
  expect(screen.queryByText(/Obsoleto/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Criar caso de teste' })).not.toBeInTheDocument();
});

it('retains committed quality rows when next-page loading fails and allows retry', async () => {
  api.cases
    .mockResolvedValueOnce({ items: [{ id: 5, title: 'Primeiro', status: 'ATIVO' }], total: 2 })
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({ items: [{ id: 6, title: 'Segundo', status: 'ATIVO' }], total: 2 });
  wrap(<TaskQuality task={task} projectId={1} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais casos' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'TC-5 · Primeiro' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Tentar/ }));
  expect(await screen.findByRole('link', { name: 'TC-6 · Segundo' })).toBeInTheDocument();
});
