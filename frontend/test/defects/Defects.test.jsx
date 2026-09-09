import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DefectForm } from '../../src/features/defects/components/DefectForm.jsx';
import { DefectFlow } from '../../src/features/defects/components/DefectFlow.jsx';
import { CorrectionManager } from '../../src/features/defects/components/CorrectionManager.jsx';
import { DefectHistory } from '../../src/features/defects/components/DefectHistory.jsx';
import {
  TaskCorrectionBadge,
  TaskCorrectionContext
} from '../../src/features/tasks/components/TaskCorrectionContext.jsx';
import { useDefects } from '../../src/features/defects/hooks/useDefects.js';
import { candidate, defect, options, task } from './fixtures.js';
import { deferred, failure } from '../testCases/fixtures.js';
const api = vi.hoisted(() =>
  Object.fromEntries(
    ['list', 'detail', 'candidates', 'history', 'create', 'update', 'correction', 'remove'].map(
      (k) => [k, vi.fn()]
    )
  )
);
vi.mock('../../src/features/defects/api/defects.api.js', () => ({ defectsApi: api }));
beforeEach(() => {
  vi.resetAllMocks();
  window.matchMedia.mockImplementation((media) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  api.candidates.mockResolvedValue({ items: [structuredClone(candidate)] });
  api.detail.mockResolvedValue(structuredClone(defect));
  api.list.mockResolvedValue({
    items: [structuredClone(defect)],
    total: 1,
    page: 1,
    summary: { total: 1, ABERTO: 1 }
  });
  api.update.mockResolvedValue({ ...defect, revision: 2, title: 'Título atualizado' });
});
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const flow = (props = {}) =>
  wrap(
    <DefectFlow
      projectId={1}
      initialId={1}
      options={options}
      canWrite
      onClose={vi.fn()}
      {...props}
    />
  );
async function fill(user) {
  await user.type(await screen.findByLabelText('Título *'), 'Falha nova');
  await user.type(screen.getByLabelText('Descrição *'), 'Descrição da falha');
  await user.selectOptions(screen.getByLabelText('Severidade *'), 'ALTA');
  await user.click(screen.getByRole('combobox', { name: 'Responsável' }));
  await user.click(await screen.findByRole('option', { name: 'Pessoa QA' }));
}
describe('S1-08 creation', () => {
  it('inherits historical links, requires explicit severity and sends immutable detection only', async () => {
    const save = vi.fn(),
      user = userEvent.setup();
    wrap(
      <DefectForm
        projectId={1}
        initialExecutionId={38}
        initialStepId={80}
        options={options}
        onSave={save}
      />
    );
    await screen.findByText('Definição histórica · Caso v3');
    expect(screen.getByLabelText('Severidade *')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Registrar defeito' }));
    expect(screen.getByLabelText('Título *')).toHaveFocus();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Registrar defeito' }));
    expect(save).toHaveBeenCalledWith({
      title: 'Falha nova',
      description: 'Descrição da falha',
      severity: 'ALTA',
      responsibleUserId: 7,
      requirementId: 4,
      originTaskIds: [9],
      detectedExecutionStepId: 80
    });
  });
  it('does not auto-select among multiple failed steps', async () => {
    api.candidates.mockResolvedValue({
      items: [
        candidate,
        {
          ...candidate,
          detectedExecutionStepId: 81,
          failedStep: { ...candidate.failedStep, position: 2 }
        }
      ]
    });
    wrap(<DefectForm projectId={1} initialExecutionId={38} options={options} />);
    expect(await screen.findAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByLabelText('Título *')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar defeito' })).toBeDisabled();
  });
  it('leaves zero-character lookup closed on focus', () => {
    wrap(<DefectForm projectId={1} options={options} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(api.candidates).not.toHaveBeenCalled();
  });
  it('opens an existing defect and still permits another report', async () => {
    const open = vi.fn(),
      user = userEvent.setup();
    api.candidates.mockResolvedValue({ items: [{ ...candidate, existingDefects: [defect] }] });
    wrap(
      <DefectForm
        projectId={1}
        initialExecutionId={38}
        initialStepId={80}
        options={options}
        onOpenDefect={open}
      />
    );
    await user.click(await screen.findByRole('button', { name: 'DEF-1 · Acesso interrompido' }));
    expect(open).toHaveBeenCalledWith(1);
    expect(screen.getByText('Você pode registrar outro defeito nesta falha.')).toBeInTheDocument();
  });
});
describe('S1-08 detail lifecycle', () => {
  it('uses server status and exposes one dialog for correction', async () => {
    const user = userEvent.setup();
    flow();
    await screen.findByText('Falha confirmada');
    await user.click(screen.getAllByRole('button', { name: 'Gerenciar correção' })[0]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Vincular tarefa existente' })).toBeInTheDocument();
  });
  it.each([409, 503])('preserves edit draft and prevents blind retries on %s', async (status) => {
    api.update.mockRejectedValue(failure(status));
    const user = userEvent.setup();
    flow();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const title = screen.getByLabelText('Título *');
    await user.clear(title);
    await user.type(title, 'Rascunho');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    expect(title).toHaveValue('Rascunho');
    if (status === 409)
      expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
  it('locks close and duplicate submissions during persistence', async () => {
    const d = deferred(),
      close = vi.fn(),
      user = userEvent.setup();
    api.update.mockReturnValue(d.promise);
    flow({ onClose: close });
    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await user.keyboard('{Escape}');
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    await act(async () => d.resolve({ ...defect, revision: 2 }));
    expect(api.update).toHaveBeenCalledOnce();
  });
  it('hides all mutations for viewers while preserving history', async () => {
    flow({ canWrite: false });
    await screen.findByText('Falha confirmada');
    for (const name of ['Editar', 'Excluir', 'Gerenciar correção', 'Retestar'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Histórico' })).toBeInTheDocument();
  });
  it('validated defects do not offer correction or retest', async () => {
    api.detail.mockResolvedValue({
      ...defect,
      status: 'VALIDADO',
      statusReason: { ...defect.statusReason, validatedByExecutionId: 39 }
    });
    flow();
    await screen.findByText('Falha confirmada');
    expect(screen.queryByRole('button', { name: 'Gerenciar correção' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retestar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver EXEC-0039' })).toBeInTheDocument();
  });
});
describe('S1-08 correction and historical contexts', () => {
  it('excludes origin tasks but accepts a completed correction task', async () => {
    const user = userEvent.setup(),
      save = vi.fn();
    wrap(<CorrectionManager defect={defect} options={options} onSave={save} />);
    await user.click(screen.getByRole('button', { name: 'Vincular tarefa existente' }));
    await user.type(screen.getByRole('combobox'), 'Cor');
    expect(await screen.findByRole('option', { name: /TASK-9/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.click(screen.getByRole('option', { name: /TASK-10/ }));
    await user.click(screen.getByRole('button', { name: 'Vincular tarefa' }));
    expect(save).toHaveBeenCalledWith({ taskId: 10 });
  });
  it('appends history without duplicating records and opens real executions', async () => {
    const event = { id: 1, action: 'CREATED', occurredAt: '2026-09-08' },
      open = vi.fn(),
      user = userEvent.setup();
    api.history.mockResolvedValueOnce({ items: [event], total: 2, page: 1 }).mockResolvedValueOnce({
      items: [
        event,
        {
          id: 2,
          action: 'RETEST_RECORDED',
          metadataJson: { testExecutionId: 39, result: 'PASS', correctionCycle: 1 }
        }
      ],
      total: 2,
      page: 2
    });
    wrap(<DefectHistory id={1} onExecution={open} />);
    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    await user.click(await screen.findByRole('button', { name: 'EXEC-0039 · PASS' }));
    expect(open).toHaveBeenCalledWith(39);
    expect(screen.getAllByText('Defeito criado')).toHaveLength(1);
  });
  it.each([true, false])('omits corrections in frozen/normal contexts (frozen=%s)', (isFrozen) => {
    const row = {
      ...task,
      isFrozen,
      correctionDefectCount: isFrozen ? 1 : 0,
      correctionDefects: [defect]
    };
    wrap(
      <>
        <TaskCorrectionBadge task={row} />
        <TaskCorrectionContext task={row} />
      </>
    );
    expect(screen.queryByText(/CORREÇÃO/)).not.toBeInTheDocument();
    expect(screen.queryByText('Contexto de correção')).not.toBeInTheDocument();
    expect(api.detail).not.toHaveBeenCalled();
  });
  it('links a correction badge to its real defect', () => {
    wrap(
      <TaskCorrectionBadge
        task={{ ...task, projectId: 1, correctionDefectCount: 1, correctionDefects: [defect] }}
      />
    );
    expect(screen.getByRole('link', { name: 'Abrir DEF-1' })).toHaveAttribute(
      'href',
      '/projects/1/defects?defect=1'
    );
  });
});
describe('S1-08 request ownership', () => {
  it('rejects an earlier list after filters change', async () => {
    const stale = deferred();
    api.list.mockReturnValueOnce(stale.promise);
    const { result } = renderHook(() => useDefects(1));
    await waitFor(() => expect(api.list).toHaveBeenCalledOnce());
    act(() => result.current.changeFilter('status', 'VALIDADO'));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    await act(async () => stale.resolve({ items: [{ id: 999 }], total: 1, page: 1 }));
    expect(result.current.catalog.items.map((d) => d.id)).toEqual([1]);
  });
  it('keeps confirmed deletion despite late reads and failed refresh', async () => {
    const { result } = renderHook(() => useDefects(1));
    await waitFor(() => expect(result.current.catalog.items).toHaveLength(1));
    api.list.mockRejectedValue(failure(503));
    act(() => result.current.confirmed('delete', null, 1));
    await waitFor(() => expect(result.current.warning).toMatch(/Não foi possível/));
    expect(result.current.catalog.items).toEqual([]);
    api.list.mockResolvedValue({ items: [defect], total: 1, page: 1 });
    await act(() => result.current.load());
    expect(result.current.catalog.items).toEqual([]);
  });
});
