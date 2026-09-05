import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: Object.fromEntries(
    [
      'getSchedule',
      'listSprints',
      'listMilestones',
      'createSprint',
      'updateSprint',
      'updateSprintStatus',
      'getSprintImpact',
      'removeSprint',
      'listSprintTasks',
      'replaceSprintTasks',
      'listProjectTasks',
      'getMembership',
      'getSprintProgress',
      'createMilestone',
      'updateMilestone',
      'removeMilestone',
      'updateMilestoneStatus'
    ].map((k) => [k, vi.fn()])
  ),
  projects: { get: vi.fn() }
}));
vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({
  projectsApi: mocks.projects,
  ProjectSectionNav: () => <nav>Projeto navegado</nav>
}));
const { SprintsScreen } = await import('../../src/features/schedule/pages/SprintsScreen.jsx');
const { MilestonesScreen } = await import('../../src/features/schedule/pages/MilestonesScreen.jsx');
const { useScheduleData } = await import('../../src/features/schedule/hooks/useScheduleData.js');
const { ConfirmProvider } = await import('../../src/shared/index.js');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const sprint = (id, name, projectId = 1) => ({
  id,
  name,
  projectId,
  startDate: '2026-10-01T00:00:00Z',
  endDate: '2026-10-05T00:00:00Z',
  status: 'PLANEJADA',
  milestoneId: null
});
const milestone = (id, title, projectId = 1) => ({
  id,
  title,
  projectId,
  dueDate: '2026-10-15T00:00:00Z',
  status: 'PENDENTE'
});
const definitions = [
  {
    resource: 'sprints',
    entity: 'sprint',
    make: sprint,
    list: 'listSprints',
    create: 'createSprint',
    edit: 'updateSprint',
    delete: 'removeSprint',
    field: 'name',
    label: /^Nome/,
    newLabel: 'Nova sprint',
    save: 'Criar sprint',
    menu: 'Mais ações da sprint',
    editLabel: 'Editar a sprint',
    deleteLabel: 'Excluir a sprint',
    confirm: 'Excluir sprint'
  },
  {
    resource: 'milestones',
    entity: 'milestone',
    make: milestone,
    list: 'listMilestones',
    create: 'createMilestone',
    edit: 'updateMilestone',
    delete: 'removeMilestone',
    field: 'title',
    label: /^Título/,
    newLabel: 'Novo marco',
    save: 'Criar marco',
    menu: 'Mais ações do marco',
    editLabel: 'Editar o marco',
    deleteLabel: 'Excluir o marco',
    confirm: 'Excluir marco'
  }
];
let catalogs, navigate;
function Navigation() {
  navigate = useNavigate();
  return null;
}
const snapshot = (id) => ({
  projectId: Number(id),
  sprints: catalogs[id].sprints.map((s) => ({ ...s, tasks: [] })),
  milestones: [...catalogs[id].milestones],
  unassignedTasks: []
});
beforeEach(() => {
  vi.resetAllMocks();
  catalogs = Object.fromEntries(
    [1, 2].map((id) => [
      id,
      {
        sprints: [sprint(id * 100, `Projeto ${id} Sprint`, id)],
        milestones: [milestone(id * 100, `Projeto ${id} Marco`, id)]
      }
    ])
  );
  mocks.projects.get.mockImplementation((id) =>
    Promise.resolve({ data: { project: { id: Number(id), name: `Projeto ${id}` } } })
  );
  mocks.schedule.getMembership.mockResolvedValue({
    data: { currentMembership: { role: 'OWNER' } }
  });
  mocks.schedule.getSchedule.mockImplementation((id) => Promise.resolve({ data: snapshot(id) }));
  for (const d of definitions)
    mocks.schedule[d.list].mockImplementation((id) =>
      Promise.resolve({ data: { [d.resource]: [...catalogs[id][d.resource]] } })
    );
  mocks.schedule.listProjectTasks.mockResolvedValue({ data: { tasks: [] } });
  mocks.schedule.getSprintImpact.mockResolvedValue({
    data: { currentTasks: 0, completion: { pendingTasks: 0 } }
  });
  mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: { tasks: [] } });
});
function mount(d) {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={[`/projects/1/${d.resource}`]}>
        <Navigation />
        <Routes>
          <Route path="/projects/:projectId/sprints" element={<SprintsScreen />} />
          <Route path="/projects/:projectId/milestones" element={<MilestonesScreen />} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>
  );
}
async function submit(d, action, name = 'Alteração de A') {
  const user = userEvent.setup();
  if (action === 'create') {
    await user.click(await screen.findByRole('button', { name: d.newLabel, exact: true }));
    fireEvent.change(screen.getByLabelText(d.label), { target: { value: name } });
    if (d.resource === 'sprints') {
      fireEvent.change(screen.getByLabelText(/^Início/), { target: { value: '2026-11-01T00:00' } });
      fireEvent.change(screen.getByLabelText(/^Fim/), { target: { value: '2026-11-05T00:00' } });
    } else
      fireEvent.change(screen.getByLabelText(/^Prazo/), { target: { value: '2026-11-05T00:00' } });
    await user.click(screen.getByRole('button', { name: d.save, exact: true }));
  } else {
    const original = catalogs[1][d.resource][0][d.field];
    await user.click(await screen.findByRole('button', { name: `${d.menu} ${original}` }));
    await user.click(
      screen.getByRole('menuitem', {
        name: `${d[action === 'edit' ? 'editLabel' : 'deleteLabel']} ${original}`
      })
    );
    if (action === 'edit') {
      fireEvent.change(screen.getByLabelText(d.label), { target: { value: name } });
      await user.click(screen.getByRole('button', { name: 'Salvar alterações', exact: true }));
    } else await user.click(await screen.findByRole('button', { name: d.confirm, exact: true }));
  }
}

for (const d of definitions)
  describe(`FIX-04 ${d.resource}`, () => {
    for (const action of ['create', 'edit', 'delete']) {
      it.each(['resolve', 'reject'])(
        `${action} A→B suppresses stale catalog, form and feedback (%s)`,
        async (outcome) => {
          const pending = deferred();
          mocks.schedule[d[action]].mockReturnValue(pending.promise);
          mount(d);
          await submit(d, action);
          expect(mocks.schedule[d[action]]).toHaveBeenCalledTimes(1);
          await act(async () => navigate(`/projects/2/${d.resource}`));
          const b = catalogs[2][d.resource][0][d.field];
          await screen.findByRole('heading', { name: b });
          const before = mocks.schedule[d.list].mock.calls.length;
          // B's new draft is contextual too; A's finally must not close/reset it.
          await userEvent.click(screen.getByRole('button', { name: d.newLabel, exact: true }));
          fireEvent.change(screen.getByLabelText(d.label), { target: { value: 'Draft de B' } });
          await act(async () => {
            if (outcome === 'resolve')
              pending.resolve({ data: { [d.entity]: d.make(101, 'Alteração de A') } });
            else pending.reject(new Error('Erro da mutation A'));
          });
          expect(screen.getByRole('heading', { name: b })).toBeInTheDocument();
          expect(screen.queryByRole('heading', { name: 'Alteração de A' })).not.toBeInTheDocument();
          expect(screen.getByLabelText(d.label)).toHaveValue('Draft de B');
          expect(document.querySelector('.message-success')).toBeNull();
          expect(document.querySelector('.message-error')).toBeNull();
          expect(mocks.schedule[d.list]).toHaveBeenCalledTimes(before);
        }
      );

      it(`${action}: older list and Schedule cannot overwrite confirmed DTO after refresh failure`, async () => {
        const { result } = renderHook(() => useScheduleData(1));
        await waitFor(() => expect(result.current.loading).toBe(false));
        const oldList = deferred(),
          oldSchedule = deferred();
        mocks.schedule[d.list].mockReturnValueOnce(oldList.promise);
        mocks.schedule.getSchedule.mockReturnValueOnce(oldSchedule.promise);
        let reads;
        const oldSnapshot = snapshot(1);
        await act(async () => {
          reads = Promise.all([
            result.current[d.resource === 'sprints' ? 'refreshSprints' : 'refreshMilestones'](),
            result.current.refreshSchedule()
          ]);
        });
        const context = result.current.captureContext();
        const saved = d.make(action === 'create' ? 101 : 100, 'Confirmada');
        if (action === 'delete') saved.deletedAt = '2026-09-05T00:00:00Z';
        let receipt;
        await act(async () => {
          receipt = result.current.confirmMutation(context, d.resource, saved);
        });
        expect(mocks.schedule[d.list].mock.calls.at(-1)[2].signal.aborted).toBe(true);
        await act(async () => {
          await result.current.settle(
            'Mutation confirmada',
            () => Promise.reject(new Error('503')),
            receipt
          );
          oldList.resolve({ data: { [d.resource]: catalogs[1][d.resource] } });
          oldSchedule.resolve({ data: oldSnapshot });
          await reads;
        });
        const items = result.current[d.resource];
        if (action === 'delete') expect(items.some((x) => x.id === 100)).toBe(false);
        else expect(items.find((x) => x.id === saved.id)[d.field]).toBe('Confirmada');
        expect(result.current.schedule).toBeNull();
        expect(result.current.success).toBe('Mutation confirmada');
        expect(result.current.staleWarning).toMatch(/ação foi concluída/);
        // Fresh reads remain authority and keep the confirmed result.
        catalogs[1][d.resource] = items;
        await act(async () => {
          await result.current.loadAll();
        });
        expect(result.current[d.resource]).toEqual(items);
        expect(result.current.schedule[d.resource]).toHaveLength(items.length);
      });

      it(`${action}: confirmed success survives failed reconciliation in the real screen`, async () => {
        const saved = d.make(action === 'create' ? 101 : 100, 'Confirmada');
        mocks.schedule[d[action]].mockResolvedValue({ data: { [d.entity]: saved } });
        mount(d);
        await screen.findByRole('button', { name: d.newLabel, exact: true });
        mocks.schedule[d.list].mockRejectedValue(new Error('GET 503'));
        mocks.schedule.getSchedule.mockRejectedValue(new Error('GET 503'));
        await submit(d, action, 'Confirmada');
        expect(
          await screen.findByText(/A ação foi concluída, mas os dados exibidos/)
        ).toBeInTheDocument();
        if (action === 'delete')
          expect(
            screen.queryByRole('heading', { name: catalogs[1][d.resource][0][d.field] })
          ).not.toBeInTheDocument();
        else expect(screen.getByRole('heading', { name: 'Confirmada' })).toBeInTheDocument();
        expect(document.querySelector('.message-error')).toBeNull();
      });
    }

    it('create A→B→A ignores the first visit even though projectId matches again', async () => {
      const pending = deferred();
      mocks.schedule[d.create].mockReturnValue(pending.promise);
      mount(d);
      await submit(d, 'create');
      await act(async () => navigate(`/projects/2/${d.resource}`));
      await screen.findByRole('button', { name: d.newLabel, exact: true });
      await act(async () => navigate(`/projects/1/${d.resource}`));
      await screen.findByRole('button', { name: d.newLabel, exact: true });
      await act(async () =>
        pending.resolve({ data: { [d.entity]: d.make(101, 'Primeira visita') } })
      );
      expect(screen.queryByRole('heading', { name: 'Primeira visita' })).not.toBeInTheDocument();
      expect(document.querySelector('.message-success')).toBeNull();
    });

    it('creating an unlinked entity does not reload the unrelated catalog', async () => {
      const unrelated = d.resource === 'sprints' ? 'listMilestones' : 'listSprints';
      mocks.schedule[d.create].mockImplementation(async () => {
        const saved = d.make(101, 'Sem associação');
        catalogs[1][d.resource].push(saved);
        return { data: { [d.entity]: saved } };
      });
      mount(d);
      await submit(d, 'create', 'Sem associação');
      await screen.findByRole('heading', { name: 'Sem associação' });
      await waitFor(() => expect(mocks.schedule[d.list]).toHaveBeenCalledTimes(2));
      expect(mocks.schedule[unrelated]).toHaveBeenCalledTimes(1);
    });

    it('a GET started after create cannot resurrect its subsequently deleted card', async () => {
      const pending = deferred();
      mocks.schedule[d.create].mockResolvedValue({
        data: { [d.entity]: d.make(101, 'Criada e excluída') }
      });
      mocks.schedule[d.delete].mockResolvedValue({ data: {} });
      mount(d);
      await screen.findByRole('button', { name: d.newLabel, exact: true });
      mocks.schedule[d.list].mockReturnValueOnce(pending.promise);
      await submit(d, 'create', 'Criada e excluída');
      await screen.findByRole('heading', { name: 'Criada e excluída' });
      await userEvent.click(screen.getByRole('button', { name: `${d.menu} Criada e excluída` }));
      await userEvent.click(
        screen.getByRole('menuitem', { name: `${d.deleteLabel} Criada e excluída` })
      );
      await userEvent.click(await screen.findByRole('button', { name: d.confirm, exact: true }));
      await waitFor(() =>
        expect(screen.queryByRole('heading', { name: 'Criada e excluída' })).not.toBeInTheDocument()
      );
      await act(async () =>
        pending.resolve({ data: { [d.resource]: [d.make(101, 'Criada e excluída')] } })
      );
      expect(screen.queryByRole('heading', { name: 'Criada e excluída' })).not.toBeInTheDocument();
    });

    it.each([
      [2, 0, 1],
      [1, 2, 0],
      [2, 1, 0]
    ])('independent creates merge without loss; delivery order %j', async (...order) => {
      const { result } = renderHook(() => useScheduleData(1));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const contexts = [0, 1, 2].map(() => result.current.captureContext());
      let oldestReceipt;
      await act(async () => {
        order.forEach((index) => {
          const receipt = result.current.confirmMutation(
            contexts[index],
            d.resource,
            d.make(110 + index, `Criada ${index}`)
          );
          oldestReceipt ??= receipt;
        });
        result.current.confirmMutation(contexts[0], d.resource, d.make(100, 'Editada'));
      });
      expect(result.current[d.resource].map((x) => x.id).sort()).toEqual([100, 110, 111, 112]);
      const reads = mocks.schedule[d.list].mock.calls.length;
      await act(async () => {
        await result.current[d.resource === 'sprints' ? 'refreshSprints' : 'refreshMilestones'](
          oldestReceipt
        );
      });
      expect(mocks.schedule[d.list]).toHaveBeenCalledTimes(reads);
      await act(async () =>
        result.current.confirmMutation(contexts[0], d.resource, { id: 100, deletedAt: true })
      );
      expect(result.current[d.resource].map((x) => x.id).sort()).toEqual([110, 111, 112]);
    });
  });

it('hook rejects a refresh callback invoked only after navigation and suppresses its failure feedback', async () => {
  const { result, rerender } = renderHook(({ id }) => useScheduleData(id), {
    initialProps: { id: 1 }
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  const old = result.current,
    token = old.captureContext();
  rerender({ id: 2 });
  await waitFor(() => expect(result.current.project?.id).toBe(2));
  const count = mocks.schedule.listSprints.mock.calls.length;
  await act(async () => {
    await old.refreshSprints();
    old.confirmMutation(token, 'sprints', sprint(101, 'Antiga'));
    old.handleFailure(new Error('A falhou'), 'Erro de A', token);
    await old.settle('A salva', () => Promise.reject(new Error('503')), token);
  });
  expect(mocks.schedule.listSprints).toHaveBeenCalledTimes(count);
  expect(result.current.sprints).toEqual(catalogs[2].sprints);
  expect(result.current.error + result.current.success + result.current.staleWarning).toBe('');
});

it('same-resource reads are latest-wins and a late warning cannot replace newer feedback', async () => {
  const { result } = renderHook(() => useScheduleData(1));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const older = deferred(),
    latest = deferred();
  mocks.schedule.listSprints.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
  let first, second;
  await act(async () => {
    first = result.current.settle('Primeira', result.current.refreshSprints);
    second = result.current.settle('Segunda', result.current.refreshSprints);
  });
  await act(async () => {
    latest.resolve({ data: { sprints: [sprint(102, 'Atual')] } });
    await second;
  });
  await act(async () => {
    older.reject(new Error('503 antigo'));
    await first;
  });
  expect(result.current.sprints[0].name).toBe('Atual');
  expect(result.current.success).toBe('Segunda');
  expect(result.current.staleWarning).toBe('');
});

it('BR-SPRINT-021: same-name replacement keeps the new ID after old GET, DELETE and EDIT responses', async () => {
  const { result } = renderHook(() => useScheduleData(1));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const old = catalogs[1].sprints[0];
  const token = result.current.captureContext();
  const pending = deferred();
  mocks.schedule.listSprints.mockReturnValueOnce(pending.promise);
  let read;
  await act(async () => {
    read = result.current.refreshSprints();
  });
  await act(async () => {
    result.current.confirmMutation(token, 'sprints', { id: old.id, deletedAt: true });
    result.current.confirmMutation(token, 'sprints', sprint(101, old.name));
  });
  await act(async () => {
    pending.resolve({ data: { sprints: [old] } });
    await read;
    result.current.confirmMutation(token, 'sprints', { id: old.id, deletedAt: true });
    result.current.confirmMutation(token, 'sprints', {
      ...old,
      objective: 'Edit confirmed before deletion, delivered late'
    });
  });
  expect(result.current.sprints).toEqual([sprint(101, old.name)]);
});

it('BR-SPRINT-021: delete then create the same name reconciles the real screen by new ID', async () => {
  const d = definitions[0];
  const original = catalogs[1].sprints[0];
  const newSprint = sprint(101, original.name);
  mocks.schedule.removeSprint.mockImplementation(async () => {
    catalogs[1].sprints = [];
    return { data: {} };
  });
  mocks.schedule.createSprint.mockImplementation(async () => {
    catalogs[1].sprints = [newSprint];
    return { data: { sprint: newSprint } };
  });
  mount(d);
  await submit(d, 'delete');
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: original.name })).not.toBeInTheDocument()
  );
  await submit(d, 'create', original.name);
  await screen.findByRole('heading', { name: original.name });
  await userEvent.click(screen.getByRole('button', { name: `${d.menu} ${original.name}` }));
  await userEvent.click(
    screen.getByRole('menuitem', { name: `${d.deleteLabel} ${original.name}` })
  );
  await waitFor(() => expect(mocks.schedule.getSprintImpact).toHaveBeenLastCalledWith(101));
});

it('independent resource invalidation preserves an unrelated Sprint read', async () => {
  const { result } = renderHook(() => useScheduleData(1));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const pending = deferred();
  mocks.schedule.listSprints.mockReturnValueOnce(pending.promise);
  let read;
  await act(async () => {
    read = result.current.refreshSprints();
  });
  await act(async () =>
    result.current.confirmMutation(
      result.current.captureContext(),
      'milestones',
      milestone(100, 'Reaberto')
    )
  );
  expect(mocks.schedule.listSprints.mock.calls.at(-1)[2].signal.aborted).toBe(false);
  await act(async () => {
    pending.resolve({ data: { sprints: [sprint(102, 'Leitura independente')] } });
    await read;
  });
  expect(result.current.sprints[0].id).toBe(102);
});
