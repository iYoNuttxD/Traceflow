import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: {
    getSchedule: vi.fn(),
    listSprints: vi.fn(),
    listMilestones: vi.fn(),
    getMembership: vi.fn()
  },
  projects: { get: vi.fn() }
}));

vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({ projectsApi: mocks.projects }));

const { useScheduleData } = await import('../../src/features/schedule/hooks/useScheduleData.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolver, rejeitar) => {
    resolve = resolver;
    reject = rejeitar;
  });
  return { promise, resolve, reject };
}

let api;

function Harness({ projectId }) {
  api = useScheduleData(projectId);
  return (
    <dl>
      <dd data-testid="project">{api.project?.name ?? ''}</dd>
      <dd data-testid="sprints">{api.sprints.map((sprint) => sprint.name).join(',')}</dd>
      <dd data-testid="loading">{String(api.loading)}</dd>
      <dd data-testid="somenteLeitura">{String(api.somenteLeitura)}</dd>
      <dd data-testid="stale">{api.staleWarning}</dd>
    </dl>
  );
}

function respostasDoProjeto(nome, { sprints = [], role = 'OWNER' } = {}) {
  return {
    project: { data: { project: { id: 1, name: nome } } },
    schedule: { data: { sprints: [], milestones: [], unassignedTasks: [] } },
    sprints: { data: { total: sprints.length, sprints } },
    milestones: { data: { total: 0, milestones: [] } },
    membership: { data: { currentMembership: { role } } }
  };
}

function responderCom(respostas) {
  mocks.projects.get.mockResolvedValue(respostas.project);
  mocks.schedule.getSchedule.mockResolvedValue(respostas.schedule);
  mocks.schedule.listSprints.mockResolvedValue(respostas.sprints);
  mocks.schedule.listMilestones.mockResolvedValue(respostas.milestones);
  mocks.schedule.getMembership.mockResolvedValue(respostas.membership);
}

function segurarCargaCom(adiado) {
  mocks.projects.get.mockReturnValue(adiado.promise.then((r) => r.project));
  mocks.schedule.getSchedule.mockReturnValue(adiado.promise.then((r) => r.schedule));
  mocks.schedule.listSprints.mockReturnValue(adiado.promise.then((r) => r.sprints));
  mocks.schedule.listMilestones.mockReturnValue(adiado.promise.then((r) => r.milestones));
  mocks.schedule.getMembership.mockReturnValue(adiado.promise.then((r) => r.membership));
}

const liberar = async (adiado, respostas) => {
  await act(async () => {
    adiado.resolve(respostas);
    await adiado.promise;
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  api = undefined;
});

describe('current-context-wins na troca de projeto', () => {
  it('nao mantem dados do projeto anterior sob a rota nova', async () => {
    responderCom(respostasDoProjeto('Projeto A'));
    const { rerender } = render(<Harness projectId={1} />);
    await act(async () => {});
    expect(screen.getByTestId('project')).toHaveTextContent('Projeto A');

    const b = deferred();
    segurarCargaCom(b);
    rerender(<Harness projectId={2} />);
    await act(async () => {});

    expect(screen.getByTestId('project')).toHaveTextContent('');
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await liberar(b, respostasDoProjeto('Projeto B'));
    expect(screen.getByTestId('project')).toHaveTextContent('Projeto B');
  });

  it('resposta antiga que chega depois nao sobrescreve o projeto atual', async () => {
    const a = deferred();
    segurarCargaCom(a);
    const { rerender } = render(<Harness projectId={1} />);
    await act(async () => {});

    const b = deferred();
    segurarCargaCom(b);
    rerender(<Harness projectId={2} />);
    await act(async () => {});

    await liberar(b, respostasDoProjeto('Projeto B'));
    await liberar(a, respostasDoProjeto('Projeto A'));

    expect(screen.getByTestId('project')).toHaveTextContent('Projeto B');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('carga abortada nao derruba o loading da carga corrente', async () => {
    const a = deferred();
    segurarCargaCom(a);
    const { rerender } = render(<Harness projectId={1} />);
    await act(async () => {});

    const b = deferred();
    segurarCargaCom(b);
    rerender(<Harness projectId={2} />);
    await act(async () => {});

    await liberar(a, respostasDoProjeto('Projeto A'));

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(screen.getByTestId('project')).toHaveTextContent('');
  });

  it('o papel do projeto anterior nao vale sob a rota nova', async () => {
    responderCom(respostasDoProjeto('Projeto A', { role: 'OWNER' }));
    const { rerender } = render(<Harness projectId={1} />);
    await act(async () => {});
    expect(screen.getByTestId('somenteLeitura')).toHaveTextContent('false');

    const b = deferred();
    segurarCargaCom(b);
    rerender(<Harness projectId={2} />);
    await act(async () => {});

    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await liberar(b, respostasDoProjeto('Projeto B', { role: 'VIEWER' }));
    expect(screen.getByTestId('somenteLeitura')).toHaveTextContent('true');
  });
});

describe('refresh fora de contexto', () => {
  it('refresh iniciado no projeto anterior nao escreve na lista do atual', async () => {
    responderCom(respostasDoProjeto('Projeto A', { sprints: [{ id: 1, name: 'Sprint de A' }] }));
    const { rerender } = render(<Harness projectId={1} />);
    await act(async () => {});
    expect(screen.getByTestId('sprints')).toHaveTextContent('Sprint de A');

    const refreshAntigo = deferred();
    mocks.schedule.listSprints.mockReturnValue(refreshAntigo.promise);
    let pendente;
    act(() => {
      pendente = api.refreshSprints();
    });

    responderCom(respostasDoProjeto('Projeto B', { sprints: [{ id: 2, name: 'Sprint de B' }] }));
    rerender(<Harness projectId={2} />);
    await act(async () => {});
    expect(screen.getByTestId('sprints')).toHaveTextContent('Sprint de B');

    await act(async () => {
      refreshAntigo.resolve({ data: { total: 1, sprints: [{ id: 1, name: 'Sprint de A' }] } });
      await pendente;
    });

    expect(screen.getByTestId('sprints')).toHaveTextContent('Sprint de B');
  });

  it('refresh cancelado pela troca de projeto nao vira aviso de desatualizacao', async () => {
    responderCom(respostasDoProjeto('Projeto A'));
    const { rerender } = render(<Harness projectId={1} />);
    await act(async () => {});

    const refreshAntigo = deferred();
    mocks.schedule.listSprints.mockReturnValue(refreshAntigo.promise);
    const refreshSprints = api.refreshSprints;
    let concluido;
    act(() => {
      concluido = api.settle('Sprint salva com sucesso.', refreshSprints);
    });

    responderCom(respostasDoProjeto('Projeto B'));
    rerender(<Harness projectId={2} />);
    await act(async () => {});

    await act(async () => {
      refreshAntigo.resolve({ data: { total: 0, sprints: [] } });
      await concluido;
    });

    expect(screen.getByTestId('stale')).toHaveTextContent('');
  });
});
