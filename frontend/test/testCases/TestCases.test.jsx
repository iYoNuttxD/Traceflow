import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';
import { AppRoutes } from '../../src/app/routes/AppRoutes.jsx';
import { ThemeProvider } from '../../src/app/theme/ThemeProvider.jsx';
import {
  testCase,
  listing,
  memberData,
  requirement,
  task,
  references,
  execution,
  executionSummary,
  deferred,
  failure
} from './fixtures.js';
const mocks = vi.hoisted(() => ({
  projects: vi.fn(),
  members: vi.fn(),
  requirements: vi.fn(),
  tasks: vi.fn(),
  api: Object.fromEntries(
    [
      'list',
      'detail',
      'create',
      'update',
      'remove',
      'history',
      'executions',
      'references',
      'execution',
      'record',
      'content'
    ].map((key) => [key, vi.fn()])
  ),
  user: { id: 7, name: 'Pessoa QA', emailVerifiedAt: '2026-09-01', accountStatus: 'ACTIVE' }
}));
vi.mock('../../src/features/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mocks.user, loading: false, logout: vi.fn() })
}));
vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { list: mocks.projects }
}));
vi.mock('../../src/features/members/members.api.js', () => ({
  membersApi: { list: mocks.members }
}));
vi.mock('../../src/features/requirements/api/requirements.api.js', () => ({
  requirementsApi: { listByProject: mocks.requirements }
}));
vi.mock('../../src/features/tasks/api/tasks.api.js', async (original) => ({
  ...(await original()),
  tasksApi: { list: mocks.tasks }
}));
vi.mock('../../src/features/testCases/api/test-cases.api.js', () => ({ testCasesApi: mocks.api }));
let errors, warnings;
beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks.api).forEach((fn) => fn.mockReset());
  mocks.projects.mockResolvedValue({
    data: {
      projects: [
        { id: 1, name: 'Projeto QA' },
        { id: 2, name: 'Segundo projeto' }
      ]
    }
  });
  mocks.members.mockResolvedValue(structuredClone(memberData));
  mocks.requirements.mockResolvedValue({ data: { requirements: [requirement] } });
  mocks.tasks.mockResolvedValue({ data: { tasks: [task] } });
  mocks.api.list.mockResolvedValue(structuredClone(listing));
  mocks.api.detail.mockResolvedValue(structuredClone(testCase));
  mocks.api.create.mockResolvedValue({
    ...testCase,
    id: 20,
    displayId: 'TC-20',
    currentVersion: 1
  });
  mocks.api.update.mockResolvedValue({
    ...testCase,
    title: 'Definição atualizada',
    currentVersion: 4
  });
  mocks.api.remove.mockResolvedValue({ status: 204 });
  mocks.api.references.mockResolvedValue({ items: references });
  mocks.api.executions.mockResolvedValue({ items: [executionSummary], nextCursor: null });
  mocks.api.history.mockResolvedValue({
    items: [
      {
        id: 1,
        action: 'VERSION_CREATED',
        actorUserId: 7,
        fromVersion: 2,
        toVersion: 3,
        occurredAt: '2026-09-07',
        metadataJson: { changedFields: ['steps'] }
      }
    ],
    nextCursor: null
  });
  mocks.api.execution.mockResolvedValue(structuredClone(execution));
  mocks.api.record.mockResolvedValue(structuredClone(execution));
  errors = vi.spyOn(console, 'error');
  warnings = vi.spyOn(console, 'warn');
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:test-preview'),
      revokeObjectURL: vi.fn()
    })
  );
});
afterEach(() => {
  expect(errors).not.toHaveBeenCalled();
  expect(warnings).not.toHaveBeenCalled();
  errors.mockRestore();
  warnings.mockRestore();
  vi.unstubAllGlobals();
});
async function setup() {
  const user = userEvent.setup({ applyAccept: false });
  render(
    <MemoryRouter initialEntries={['/projects/1/test-cases']}>
      <ThemeProvider>
        <ConfirmProvider>
          <AppRoutes />
        </ConfirmProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
  await screen.findByRole('article', { name: /^TC-15/ });
  await waitFor(() => expect(mocks.members).toHaveBeenCalled());
  return user;
}
const card = () => within(screen.getByRole('article', { name: /^TC-15/ }));
const dialog = () => within(screen.getByRole('dialog'));
async function openForm(user) {
  await user.click(screen.getByRole('button', { name: /Novo caso de teste/ }));
}
async function fillForm() {
  for (const [label, value] of [
    ['Título *', 'Criar cenário real'],
    ['Pré-condições *', 'Conta disponível'],
    ['Ação — passo 1 *', 'Solicitar acesso'],
    ['Resultado esperado — passo 1 *', 'Acesso concedido'],
    ['Resultado esperado do caso *', 'Validado']
  ])
    fireEvent.change(dialog().getByLabelText(label), { target: { value } });
  fireEvent.change(dialog().getByLabelText('Responsável *'), { target: { value: '7' } });
}
async function edit(user) {
  await user.click(card().getByRole('button', { name: /Mais ações/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Editar' }));
  await dialog().findByLabelText('Título *');
}
async function start(user) {
  await user.click(card().getByRole('button', { name: 'Executar', exact: true }));
  await dialog().findByRole('heading', { name: 'Passo 1 de 5' });
}
async function context(user) {
  await user.click(await dialog().findByRole('option', { name: /PR #42/ }));
  await user.selectOptions(dialog().getByLabelText('Ambiente *'), 'HOMOLOGACAO');
}
async function finish(user, result = 'Aprovado') {
  await user.click(dialog().getByRole('button', { name: result, exact: true }));
  if (result !== 'Aprovado')
    fireEvent.change(dialog().getByLabelText('Resultado observado *'), {
      target: { value: 'Falha observada' }
    });
  await user.click(dialog().getByRole('button', { name: /^(Próximo|Revisar execução)$/ }));
}
async function review(user) {
  await start(user);
  await context(user);
  for (let i = 0; i < 5; i++) await finish(user);
}

describe('S1-07 integrated case flows', () => {
  it('uses the project route, real API, server summary and no prototype controls', async () => {
    await setup();
    expect(screen.getByLabelText('Navegação global')).toBeInTheDocument();
    expect(screen.queryByText('PROTÓTIPO')).not.toBeInTheDocument();
    expect(screen.queryByText('Controles do protótipo')).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Resumo dos casos de teste')).getByText('25')
    ).toBeInTheDocument();
    expect(mocks.api.list).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ page: 1, limit: 20 }),
      expect.anything()
    );
  });
  it('validates mandatory fields, first-invalid focus, optional links and active members', async () => {
    const user = await setup();
    await openForm(user);
    await user.click(dialog().getByRole('button', { name: 'Criar caso' }));
    expect(dialog().getByLabelText('Título *')).toHaveFocus();
    expect(mocks.api.create).not.toHaveBeenCalled();
    expect(dialog().queryByRole('option', { name: 'Membro inativo' })).not.toBeInTheDocument();
    await fillForm();
    await user.click(dialog().getByRole('button', { name: 'Criar caso' }));
    await waitFor(() =>
      expect(mocks.api.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          responsibleUserId: 7,
          requirementId: null,
          taskIds: [],
          steps: [{ action: 'Solicitar acesso', expectedResult: 'Acesso concedido' }]
        })
      )
    );
    expect(await screen.findByText(/TC-20 · Caso salvo \(v1\)/)).toBeInTheDocument();
  });
  it('searches requirements/tasks on the server and sends the selected IDs atomically', async () => {
    const user = await setup();
    await openForm(user);
    await fillForm();
    await user.type(dialog().getByRole('combobox', { name: 'Requisito verificado' }), 'rec');
    await user.click(await dialog().findByRole('option', { name: /REQ-4/ }));
    await user.type(dialog().getByRole('combobox', { name: 'Pesquisar tarefas' }), 'val');
    await user.click(await dialog().findByRole('option', { name: /TASK-9/ }));
    expect(mocks.requirements).toHaveBeenCalledWith(
      1,
      { search: 'rec' },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mocks.tasks).toHaveBeenCalledWith(1, { search: 'val' }, expect.anything());
    await user.click(dialog().getByRole('button', { name: 'Criar caso' }));
    await waitFor(() =>
      expect(mocks.api.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ requirementId: 4, taskIds: [9] })
      )
    );
  });
  it('starts with one step and requires one after removing it', async () => {
    const user = await setup();
    await openForm(user);
    expect(dialog().getAllByRole('group', { name: /^Passo/ })).toHaveLength(1);
    await user.click(dialog().getByRole('button', { name: 'Remover passo 1' }));
    await user.click(dialog().getByRole('button', { name: 'Criar caso' }));
    expect(dialog().getByText('Informe de 1 a 100 passos.')).toBeInTheDocument();
  });
  it('keeps ten step drafts in order after removing a middle step', async () => {
    const user = await setup();
    await openForm(user);
    for (let i = 1; i < 10; i++)
      await user.click(dialog().getByRole('button', { name: 'Adicionar passo' }));
    fireEvent.change(dialog().getByLabelText('Ação — passo 10 *'), {
      target: { value: 'Última ação' }
    });
    await user.click(dialog().getByRole('button', { name: 'Remover passo 4' }));
    expect(dialog().getByLabelText('Ação — passo 9 *')).toHaveValue('Última ação');
  });
  it('opens details from keyboard and returns focus on Escape', async () => {
    const user = await setup();
    const article = screen.getByRole('article', { name: /^TC-15/ });
    article.focus();
    await user.keyboard('{Enter}');
    expect(await dialog().findByText('Conta disponível')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(article).toHaveFocus());
  });
  it('preloads edit, sends expectedVersion and status in one PUT', async () => {
    const user = await setup();
    await edit(user);
    expect(dialog().getByLabelText('Título *')).toHaveValue(testCase.title);
    await user.selectOptions(dialog().getByLabelText('Status *'), 'INATIVO');
    await user.click(dialog().getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() =>
      expect(mocks.api.update).toHaveBeenCalledWith(
        15,
        expect.objectContaining({ expectedVersion: 3, status: 'INATIVO', taskIds: [9] })
      )
    );
  });
  it('preserves edit draft on version conflict and prevents retry against the old version', async () => {
    mocks.api.update.mockRejectedValue(failure(409, 'TEST_CASE_VERSION_CONFLICT'));
    const user = await setup();
    await edit(user);
    fireEvent.change(dialog().getByLabelText('Título *'), { target: { value: 'Meu rascunho' } });
    await user.click(dialog().getByRole('button', { name: 'Salvar alterações' }));
    expect(await dialog().findByText(/Seu rascunho foi preservado/)).toBeInTheDocument();
    expect(dialog().getByLabelText('Título *')).toHaveValue('Meu rascunho');
    expect(dialog().getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    expect(mocks.api.update).toHaveBeenCalledTimes(1);
  });
  it.each(['VIEWER', 'MEMBER', 'MANAGER', 'OWNER'])(
    'uses real %s membership independent of responsible user',
    async (role) => {
      mocks.members.mockResolvedValue({ ...memberData, currentMembership: { role } });
      await setup();
      expect(screen.queryByRole('button', { name: /Novo caso/ }) !== null).toBe(role !== 'VIEWER');
      expect(card().queryByRole('button', { name: 'Executar', exact: true }) !== null).toBe(
        role !== 'VIEWER'
      );
      expect(card().getByRole('button', { name: 'Histórico' })).toBeEnabled();
    }
  );
  it('keeps inactive case visible with execution disabled', async () => {
    mocks.api.list.mockResolvedValue({ ...listing, items: [{ ...testCase, status: 'INATIVO' }] });
    await setup();
    expect(card().getByRole('button', { name: 'Executar' })).toBeDisabled();
  });
  it('blocks pending steps and validates FAIL observations', async () => {
    const user = await setup();
    await start(user);
    await user.click(dialog().getByRole('button', { name: 'Próximo' }));
    expect(dialog().getByText('Informe o resultado do passo.')).toBeInTheDocument();
    await user.click(dialog().getByRole('button', { name: 'Falhou', exact: true }));
    await user.click(dialog().getByRole('button', { name: 'Próximo' }));
    expect(dialog().getByText('Informe o resultado observado.')).toBeInTheDocument();
  });
  it('uses unique PR/commit choices with colliding numeric IDs', async () => {
    const user = await setup();
    await start(user);
    expect(await dialog().findByRole('option', { name: /PR #42/ })).toBeInTheDocument();
    await user.click(dialog().getByRole('option', { name: /abcdef1/ }));
    await user.selectOptions(dialog().getByLabelText('Ambiente *'), 'LOCAL');
    for (let i = 0; i < 5; i++) await finish(user);
    await user.click(dialog().getByRole('button', { name: 'Registrar execução' }));
    await waitFor(() => expect(mocks.api.record).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(mocks.api.record.mock.calls[0][1].get('payload'));
    expect(payload.testedReference).toEqual({ type: 'COMMIT', id: 91 });
    expect(payload.testCaseVersion).toBe(3);
    expect(payload).not.toHaveProperty('result');
    expect(payload).not.toHaveProperty('executedByUserId');
  });
  it('requires context even after all steps passed', async () => {
    mocks.api.references.mockResolvedValue({ items: [] });
    const user = await setup();
    await start(user);
    for (let i = 0; i < 5; i++) await finish(user);
    expect(dialog().getByRole('button', { name: 'Registrar execução' })).toBeDisabled();
    expect(dialog().getByText('Pendentes')).toBeInTheDocument();
    expect(mocks.api.record).not.toHaveBeenCalled();
  });
  it('keeps observations and files across navigation and records all destinations once', async () => {
    const user = await setup();
    await start(user);
    await context(user);
    await finish(user);
    await finish(user, 'Bloqueado');
    await user.upload(
      dialog().getByLabelText('Adicionar foto ou vídeo'),
      new File(['png'], 'passo3.png', { type: 'image/png' })
    );
    await finish(user);
    await finish(user);
    await user.upload(
      dialog().getByLabelText('Adicionar foto ou vídeo'),
      new File(['video'], 'passo5.mp4', { type: 'video/mp4' })
    );
    await finish(user, 'Falhou');
    await user.upload(
      dialog().getByLabelText('Adicionar evidência'),
      new File(['{}'], 'resultado.json', { type: 'application/json' })
    );
    await user.click(dialog().getByRole('button', { name: 'Registrar execução' }));
    await waitFor(() => expect(mocks.api.record).toHaveBeenCalledTimes(1));
    const body = mocks.api.record.mock.calls[0][1];
    expect([...body.keys()]).toEqual(['payload', 'evidence', 'stepEvidence.3', 'stepEvidence.5']);
    const payload = JSON.parse(body.get('payload'));
    expect(payload.steps).toHaveLength(5);
    expect(payload.steps[1]).toMatchObject({
      position: 2,
      result: 'BLOCKED',
      observedResult: 'Falha observada'
    });
    expect(await screen.findByText('EXEC-0038 · Execução registrada: PASS.')).toBeInTheDocument();
  });
  it('blocks close/Escape and double submit while recording', async () => {
    const pending = deferred();
    mocks.api.record.mockReturnValue(pending.promise);
    const user = await setup();
    await review(user);
    await user.click(dialog().getByRole('button', { name: 'Registrar execução' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(dialog().getByRole('button', { name: 'Registrar execução' })).toBeDisabled();
    expect(dialog().getByRole('button', { name: /Fechar executar/ })).toBeDisabled();
    await act(async () => pending.resolve(execution));
    expect(mocks.api.record).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it.each([
    [409, 'TEST_CASE_VERSION_CONFLICT'],
    [0, 'NETWORK']
  ])('keeps execution draft after %s without retry', async (status, code) => {
    mocks.api.record.mockRejectedValue(status ? failure(status, code) : new Error('network'));
    const user = await setup();
    await review(user);
    await user.upload(
      dialog().getByLabelText('Adicionar evidência'),
      new File(['{}'], 'rascunho.json', { type: 'application/json' })
    );
    await user.click(dialog().getByRole('button', { name: 'Registrar execução' }));
    await dialog().findByRole('alert');
    expect(dialog().getByText('rascunho.json')).toBeInTheDocument();
    expect(dialog().getByRole('button', { name: 'Registrar execução' })).toBeDisabled();
    expect(mocks.api.record).toHaveBeenCalledTimes(1);
  });
  it('loads history tabs and historical execution exclusively from its v3 DTO', async () => {
    mocks.api.detail.mockResolvedValue({
      ...testCase,
      currentVersion: 4,
      preconditions: 'Pré-condição v4'
    });
    const user = await setup();
    await user.click(card().getByRole('button', { name: 'Histórico' }));
    await user.click(await dialog().findByRole('button', { name: 'Ver execução EXEC-0038' }));
    expect(await dialog().findByText('Pessoa QA histórica')).toBeInTheDocument();
    expect(dialog().getByText('Caso v3')).toBeInTheDocument();
    expect(dialog().queryByText('Pré-condição v4')).not.toBeInTheDocument();
    expect(dialog().getByText('passo3.png').closest('.tc-step-result')).toHaveTextContent(
      'Passo 3'
    );
    expect(dialog().getByText('passo5.mp4').closest('.tc-step-result')).toHaveTextContent(
      'Passo 5'
    );
    expect(dialog().getByText('resultado.json').closest('.tc-step-result')).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(dialog().getByRole('button', { name: 'Voltar ao histórico' }));
    await user.click(dialog().getByRole('tab', { name: 'Alterações' }));
    expect(await dialog().findByText(/Usuário #7/)).toBeInTheDocument();
    expect(mocks.api.detail).not.toHaveBeenCalled();
  });
  it('deletes only after confirmation and removes card even when refresh fails', async () => {
    const user = await setup();
    await user.click(card().getByRole('button', { name: /Mais ações/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir caso' }));
    expect(
      dialog().getByText(/histórico de execuções e as evidências serão preservados/)
    ).toBeInTheDocument();
    await user.click(dialog().getByRole('button', { name: 'Cancelar' }));
    expect(mocks.api.remove).not.toHaveBeenCalled();
    await user.click(card().getByRole('button', { name: /Mais ações/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir caso' }));
    mocks.api.list.mockRejectedValue(failure(503));
    await user.click(dialog().getByRole('button', { name: 'Excluir caso', exact: true }));
    expect(
      await screen.findByText('Caso excluído. Histórico e evidências preservados.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /^TC-15/ })).not.toBeInTheDocument();
    expect(
      await screen.findByText(/Não foi possível atualizar a lista e os indicadores/)
    ).toBeInTheDocument();
  });
  it('restores details after canceling confirmation without stacked dialogs', async () => {
    const user = await setup();
    await user.click(screen.getByRole('article', { name: /^TC-15/ }));
    await user.click(await dialog().findByRole('button', { name: 'Excluir caso' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(dialog().getByRole('button', { name: 'Cancelar' }));
    expect(await dialog().findByText('Conta disponível')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
  it.each(['create', 'edit', 'execute'])(
    'keeps confirmed %s success separate from a failed refresh',
    async (kind) => {
      const user = await setup();
      if (kind === 'create') {
        await openForm(user);
        await fillForm();
      } else if (kind === 'edit') await edit(user);
      else await review(user);
      mocks.api.list.mockRejectedValue(failure(503));
      await user.click(
        dialog().getByRole('button', {
          name:
            kind === 'create'
              ? 'Criar caso'
              : kind === 'edit'
                ? 'Salvar alterações'
                : 'Registrar execução'
        })
      );
      expect(
        await screen.findByText(/Não foi possível atualizar a lista e os indicadores/)
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        screen.getByText(kind === 'execute' ? /Execução registrada/ : /Caso salvo/)
      ).toBeInTheDocument();
    }
  );
});
