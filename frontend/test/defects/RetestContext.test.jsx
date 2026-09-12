import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { DefectFlow } from '../../src/features/defects/components/DefectFlow.jsx';
import { ContextualTestCaseCreate } from '../../src/features/testCases/components/ContextualTestCaseCreate.jsx';
import { DefectCard } from '../../src/features/defects/DefectsScreen.jsx';
import { defect, options, task, requirement, memberData } from './fixtures.js';
import { testCase, references, failure, deferred } from '../testCases/fixtures.js';
const api = vi.hoisted(() => ({
  detail: vi.fn(),
  record: vi.fn(),
  references: vi.fn(),
  create: vi.fn(),
  defect: vi.fn(),
  members: vi.fn()
}));
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({ testCasesApi: api }));
vi.mock('../../src/features/defects/api/defects.api.js', () => ({
  defectsApi: { detail: api.defect }
}));
vi.mock('../../src/features/members/members.api.js', () => ({ membersApi: { list: api.members } }));
beforeEach(() => {
  vi.resetAllMocks();
  window.matchMedia.mockImplementation((media) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  api.detail.mockResolvedValue({
    ...testCase,
    currentVersion: 4,
    steps: testCase.steps.slice(0, 1)
  });
  api.references.mockResolvedValue({ items: references });
  api.members.mockResolvedValue(memberData);
  api.defect.mockResolvedValue({ ...defect, status: 'AGUARDANDO_RETESTE' });
});
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
async function review(user, result = 'Aprovado') {
  await user.click((await screen.findAllByRole('button', { name: 'Retestar' }))[0]);
  await user.click(await screen.findByRole('combobox', { name: /Versão testada/ }));
  await user.click(await screen.findByRole('option', { name: /PR #42/ }));
  await user.selectOptions(screen.getByLabelText('Ambiente *'), 'LOCAL');
  await user.click(screen.getByRole('button', { name: result, exact: true }));
  if (result !== 'Aprovado')
    fireEvent.change(screen.getByLabelText('Resultado observado *'), {
      target: { value: 'Bloqueio observado' }
    });
  await user.click(screen.getByRole('button', { name: 'Revisar execução' }));
}
it.each([
  ['Aprovado', 'PASS', 'validado'],
  ['Falhou', 'FAIL', 'novo ciclo'],
  ['Bloqueado', 'BLOCKED', 'bloqueado']
])('registers explicit %s retest with current version', async (label, result, feedback) => {
  api.record.mockResolvedValue({ id: 39, displayId: 'EXEC-0039', result });
  const user = userEvent.setup();
  wrap(<DefectFlow projectId={1} initialId={1} options={options} canWrite onClose={vi.fn()} />);
  await review(user, label);
  api.defect.mockResolvedValue({
    ...defect,
    revision: 2,
    status: result === 'PASS' ? 'VALIDADO' : result === 'FAIL' ? 'ABERTO' : 'AGUARDANDO_RETESTE',
    currentCorrectionCycle: result === 'FAIL' ? 2 : 1
  });
  await user.click(screen.getByRole('button', { name: 'Registrar execução' }));
  await waitFor(() => expect(api.record).toHaveBeenCalledOnce());
  const payload = JSON.parse(api.record.mock.calls[0][1].get('payload'));
  expect(payload).toMatchObject({
    testCaseVersion: 4,
    retest: { defectId: 1, correctionCycle: 1, expectedRevision: 1 },
    steps: [{ position: 1, result }]
  });
  expect(await screen.findByText(new RegExp(feedback))).toBeInTheDocument();
  expect(api.references).toHaveBeenCalledWith(15, '', expect.anything(), 1);
});
it('preserves completed wizard and forbids duplicate retry after 409', async () => {
  api.record.mockRejectedValue(failure(409));
  const user = userEvent.setup();
  wrap(<DefectFlow projectId={1} initialId={1} options={options} canWrite onClose={vi.fn()} />);
  await review(user);
  await user.click(screen.getByRole('button', { name: 'Registrar execução' }));
  await screen.findByText(/Seu rascunho foi preservado/);
  expect(screen.getByText('Resumo da execução')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Registrar execução' })).toBeDisabled();
});
it('does not accept an old defect read after a successful retest', async () => {
  api.record.mockResolvedValue({ id: 39, displayId: 'EXEC-0039', result: 'PASS' });
  const user = userEvent.setup();
  wrap(<DefectFlow projectId={1} initialId={1} options={options} canWrite onClose={vi.fn()} />);
  await review(user);
  await user.click(screen.getByRole('button', { name: 'Registrar execução' }));
  await screen.findByText(/leitura recebida está desatualizada/);
  expect(screen.queryByRole('button', { name: 'Retestar' })).not.toBeInTheDocument();
  expect(screen.getByText(/EXEC-0039 · Reteste aprovado/)).toBeInTheDocument();
});
it.each(['task', 'requirement'])('prefills only the %s context', async (kind) => {
  wrap(
    <ContextualTestCaseCreate
      projectId={1}
      {...(kind === 'task' ? { task: { ...task, requirement } } : { requirement })}
      onCreated={vi.fn()}
    />
  );
  expect(await screen.findByText('REQ-4 · Recuperação de acesso')).toBeInTheDocument();
  expect(screen.getByLabelText('Título *')).toHaveFocus();
  if (kind === 'task')
    expect(screen.getByRole('button', { name: 'Remover 9' })).toBeInTheDocument();
  else expect(screen.queryByRole('button', { name: 'Remover 9' })).not.toBeInTheDocument();
});
it('blocks contextual creation for a viewer', async () => {
  api.members.mockResolvedValue({ ...memberData, currentMembership: { role: 'VIEWER' } });
  wrap(<ContextualTestCaseCreate projectId={1} requirement={requirement} />);
  expect(await screen.findByText(/não possui permissão/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Criar caso' })).toBeDisabled();
});
it('rejects a contextual response after project unmount', async () => {
  const d = deferred();
  api.members.mockReturnValue(d.promise);
  const view = wrap(<ContextualTestCaseCreate projectId={1} requirement={requirement} />);
  view.unmount();
  await act(() => d.resolve(memberData));
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});
it.each(['Enter', ' '])('opens card with %s and isolates footer actions', async (key) => {
  const open = vi.fn(),
    user = userEvent.setup();
  wrap(<DefectCard defect={defect} canWrite onOpen={open} />);
  fireEvent.keyDown(screen.getByRole('button', { name: /Abrir DEF/ }), { key });
  expect(open).toHaveBeenCalledOnce();
  open.mockClear();
  await user.click(screen.getByRole('button', { name: 'Histórico' }));
  expect(open).toHaveBeenCalledOnce();
  expect(open.mock.calls[0][0]).toBe('history');
});
