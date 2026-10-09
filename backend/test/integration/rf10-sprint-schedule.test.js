import { contendProjectLock } from '../helpers/contended-project-lock.js';
import { spawnSync } from 'node:child_process';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createMilestone, createProject, createSprint, createTask } from '../fixtures/factories.js';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

let prisma;
let sprintRepository;
let milestoneRepository;
let sprintService;
let taskKanbanService;
let testDatabaseUrl;

beforeAll(async () => {
  testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ sprintRepository } =
    await import('../../src/modules/sprints/repositories/sprint.repository.js'));
  ({ milestoneRepository } =
    await import('../../src/modules/sprints/repositories/milestone.repository.js'));
  ({ sprintService } = await import('../../src/modules/sprints/sprint.service.js'));
  ({ taskKanbanService } = await import('../../src/modules/tasks/services/task-kanban.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => {
  vi.restoreAllMocks();
  return cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('migration add_sprint_milestone_schedule', () => {
  it('e idempotente: executa deploy novamente e preserva dados e histórico', async () => {
    const project = await createProject(prisma);
    const milestone = await createMilestone(prisma, project.id);
    const sprint = await createSprint(prisma, project.id, { milestoneId: milestone.id });
    const migrationsBefore = await prisma.$queryRawUnsafe(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name'
    );
    expect(migrationsBefore.length).toBeGreaterThan(0);
    spawnSync.mockClear();
    expect(() => deployTestMigrations(testDatabaseUrl, { force: true })).not.toThrow();
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('prisma'), 'migrate', 'deploy'],
      expect.objectContaining({ env: expect.objectContaining({ DATABASE_URL: testDatabaseUrl }) })
    );
    expect(
      await prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name'
      )
    ).toEqual(migrationsBefore);
    expect(await prisma.sprint.findUnique({ where: { id: sprint.id } })).toEqual(sprint);
    expect(await prisma.milestone.findUnique({ where: { id: milestone.id } })).toEqual(milestone);
  });

  it('moveu o vinculo de Milestone.sprintId para Sprint.milestoneId', async () => {
    const project = await createProject(prisma);
    const marco = await createMilestone(prisma, project.id);
    const sprint = await createSprint(prisma, project.id, { milestoneId: marco.id });
    expect(sprint.milestoneId).toBe(marco.id);

    const colunas = await prisma.$queryRawUnsafe(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS ' +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Milestone'"
    );
    expect(colunas.map((coluna) => coluna.COLUMN_NAME)).not.toContain('sprintId');
  });

  it('preservou os valores existentes do enum TaskHistoryField', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const user = await prisma.user.create({
      data: {
        name: 'Ator',
        username: `ator-${task.id}`,
        email: `ator-${task.id}@example.invalid`,
        passwordHash: 'x'
      }
    });

    for (const field of ['STATUS', 'DEADLINE', 'RESPONSIBLE', 'PRIORITY', 'SPRINT']) {
      await prisma.taskHistoryEntry.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          actorUserId: user.id,
          field,
          fromValue: null,
          toValue: '1'
        }
      });
    }
    const stored = await prisma.taskHistoryEntry.findMany({ select: { field: true } });
    expect(stored.map((entry) => entry.field).sort()).toEqual([
      'DEADLINE',
      'PRIORITY',
      'RESPONSIBLE',
      'SPRINT',
      'STATUS'
    ]);
  });

  it('preserva o instante exato das datas de cronograma', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id, {
      startDate: new Date('2026-08-01T18:45:30.000Z'),
      endDate: new Date('2026-08-14T23:59:59.000Z')
    });
    const stored = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(stored.startDate.toISOString()).toBe('2026-08-01T18:45:30.000Z');
    expect(stored.endDate.toISOString()).toBe('2026-08-14T23:59:59.000Z');
  });
});

describe('integridade no banco', () => {
  it('SetNull na FK e rede de seguranca: exclusao direta nao apaga a tarefa', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id, { sprintId: sprint.id });

    await prisma.sprint.delete({ where: { id: sprint.id } });
    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stored).not.toBeNull();
    expect(stored.sprintId).toBeNull();
  });

  it('exclusao de projeto remove sprints e marcos em cascata, mesmo vinculados', async () => {
    const project = await createProject(prisma);
    const marco = await createMilestone(prisma, project.id);
    await createSprint(prisma, project.id, { milestoneId: marco.id });

    await prisma.projectMembership.deleteMany({ where: { projectId: project.id } });
    await expect(prisma.project.delete({ where: { id: project.id } })).resolves.toBeDefined();
    expect(await prisma.sprint.count()).toBe(0);
    expect(await prisma.milestone.count()).toBe(0);
  });

  it('exclusao direta do marco desvincula a sprint em vez de orfanar o ponteiro', async () => {
    const project = await createProject(prisma);
    const marco = await createMilestone(prisma, project.id);
    const sprint = await createSprint(prisma, project.id, { milestoneId: marco.id });

    await prisma.milestone.delete({ where: { id: marco.id } });
    const persistida = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(persistida.milestoneId).toBeNull();
  });
});

describe('transacoes dos repositories', () => {
  const auditEvent = (projectId, sprintId, actorUserId) => ({
    actorUserId,
    actorType: 'USER',
    projectId,
    action: 'SPRINT_TASKS_REPLACED',
    resourceType: 'Sprint',
    resourceId: String(sprintId),
    result: 'SUCCESS',
    retentionUntil: new Date('2027-01-01T00:00:00.000Z')
  });

  const planoDeEntrada = (project, sprint, task, actorUserId) => () => ({
    close: [],
    open: [
      {
        id: null,
        taskId: task.id,
        taskTitleSnapshot: task.title,
        addedAt: new Date('2026-08-02T10:00:00.000Z'),
        addedAfterStart: false,
        carriedFromSprintId: null
      }
    ],
    detachTaskIds: [],
    attachTaskIds: [task.id],
    historyEntries: [
      {
        projectId: project.id,
        taskId: task.id,
        actorUserId,
        field: 'SPRINT',
        fromValue: null,
        toValue: String(sprint.id)
      }
    ],
    auditEvent: auditEvent(project.id, sprint.id, actorUserId)
  });

  it('a mutacao de escopo grava participacao, ponteiro, historico e auditoria juntos', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id);
    const user = await prisma.user.create({
      data: {
        name: 'Ator',
        username: `ator-tx-${task.id}`,
        email: `ator-tx-${task.id}@example.invalid`,
        passwordHash: 'x'
      }
    });

    await sprintRepository.mutateScopeWithinSprintLock(
      sprint.id,
      project.id,
      [task.id],
      planoDeEntrada(project, sprint, task, user.id)
    );

    expect(await prisma.sprintTask.count({ where: { sprintId: sprint.id } })).toBe(1);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).sprintId).toBe(sprint.id);
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'SPRINT_TASKS_REPLACED' } })).toBe(1);
  });

  it('falha na auditoria desfaz participacao, vinculo e historico', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id);

    const actor = await prisma.user.create({
      data: {
        name: 'Audit failure actor',
        username: 'audit-failure-actor',
        email: 'audit-failure@example.invalid'
      }
    });
    const { auditRepository } = await import('../../src/modules/audit/audit.repository.js');
    const failure = vi
      .spyOn(auditRepository, 'create')
      .mockImplementationOnce(async (_event, tx) => {
        expect(await tx.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(1);
        expect(await tx.sprintTask.count({ where: { sprintId: sprint.id } })).toBe(1);
        throw new Error('injected audit-only failure');
      });
    await expect(
      sprintRepository.mutateScopeWithinSprintLock(
        sprint.id,
        project.id,
        [task.id],
        planoDeEntrada(project, sprint, task, actor.id)
      )
    ).rejects.toThrow('injected audit-only failure');
    expect(failure).toHaveBeenCalledOnce();
    failure.mockRestore();

    expect(await prisma.sprintTask.count()).toBe(0);
    expect((await prisma.task.findUnique({ where: { id: task.id } })).sprintId).toBeNull();
    expect(await prisma.taskHistoryEntry.count({ where: { field: 'SPRINT' } })).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('findByIdInProject nao devolve registro de outro projeto', async () => {
    const first = await createProject(prisma);
    const second = await createProject(prisma);
    const sprint = await createSprint(prisma, first.id);
    const milestone = await createMilestone(prisma, first.id);

    expect(await sprintRepository.findByIdInProject(sprint.id, second.id)).toBeNull();
    expect(await sprintRepository.findByIdInProject(sprint.id, first.id)).not.toBeNull();
    expect(await milestoneRepository.findByIdInProject(milestone.id, second.id)).toBeNull();
    expect(await milestoneRepository.findByIdInProject(milestone.id, first.id)).not.toBeNull();
  });
});

describe('concorrencia sob lock (ADR-010 D17)', () => {
  const inicio = new Date('2026-08-01T00:00:00.000Z');
  const fim = new Date('2026-08-30T00:00:00.000Z');

  let sequencia = 0;
  const comAtor = async () => {
    sequencia += 1;
    const user = await prisma.user.create({
      data: {
        name: 'Ator',
        username: `ator-concorrencia-${sequencia}`,
        email: `ator-concorrencia-${sequencia}@example.invalid`,
        passwordHash: 'x'
      }
    });
    return { actorUserId: user.id };
  };

  async function sprintDeTeste(overrides = {}) {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id, {
      startDate: inicio,
      endDate: fim,
      ...overrides
    });
    return { project, sprint };
  }

  it('duas atualizacoes parciais complementares nunca gravam janela invertida', async () => {
    const { sprint } = await sprintDeTeste();

    const gate = contendProjectLock(prisma);
    const resultados = await Promise.allSettled([
      sprintService.updateSprint(sprint.id, { endDate: '2026-08-15' }),
      sprintService.updateSprint(sprint.id, { startDate: '2026-08-20' })
    ]);
    expect(gate.attempts()).toBe(2);
    gate.restore();

    const persistida = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(persistida.startDate.getTime()).toBeLessThan(persistida.endDate.getTime());

    const recusadas = resultados.filter((resultado) => resultado.status === 'rejected');
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0].reason).toMatchObject({ code: 'SPRINT_DATE_RANGE_INVALID' });

    const vencedora = [
      { startDate: inicio.getTime(), endDate: new Date('2026-08-15T00:00:00.000Z').getTime() },
      { startDate: new Date('2026-08-20T00:00:00.000Z').getTime(), endDate: fim.getTime() }
    ];
    expect(vencedora).toContainEqual({
      startDate: persistida.startDate.getTime(),
      endDate: persistida.endDate.getTime()
    });
  });

  it('duas sprints nao entram em andamento ao mesmo tempo', async () => {
    {
      const project = await createProject(prisma);
      const primeira = await createSprint(prisma, project.id, {
        name: 'Sprint A',
        startDate: inicio,
        endDate: new Date('2026-08-15T00:00:00.000Z')
      });
      const segunda = await createSprint(prisma, project.id, {
        name: 'Sprint B',
        startDate: new Date('2026-08-15T00:00:00.000Z'),
        endDate: fim
      });

      const gate = contendProjectLock(prisma);
      const resultados = await Promise.allSettled([
        sprintService.updateSprintStatus(primeira.id, 'EM_ANDAMENTO'),
        sprintService.updateSprintStatus(segunda.id, 'EM_ANDAMENTO')
      ]);
      expect(gate.attempts()).toBe(2);
      gate.restore();

      const emAndamento = await prisma.sprint.count({
        where: { projectId: project.id, status: 'EM_ANDAMENTO' }
      });
      expect(emAndamento).toBe(1);
      const recusadas = resultados.filter((resultado) => resultado.status === 'rejected');
      expect(recusadas).toHaveLength(1);
      expect(recusadas[0].reason).toMatchObject({ code: 'SPRINT_ALREADY_ACTIVE' });
      await cleanTestDatabase(prisma);
    }
  });

  it('encerrar devolve a tarefa pendente ao backlog e congela a participacao', async () => {
    const contexto = await comAtor();
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id, {
      startDate: inicio,
      endDate: fim,
      status: 'EM_ANDAMENTO',
      startedAt: inicio
    });
    const pendente = await createTask(prisma, project.id, { status: 'A_FAZER' });
    const pronta = await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await sprintService.replaceTasks(sprint.id, [pendente.id, pronta.id], contexto);

    const resultado = await sprintService.updateSprintStatus(sprint.id, 'CONCLUIDA', contexto);

    expect(resultado.returnedToBacklog).toBe(1);
    expect((await prisma.task.findUnique({ where: { id: pendente.id } })).sprintId).toBeNull();
    expect((await prisma.task.findUnique({ where: { id: pronta.id } })).sprintId).toBe(sprint.id);

    const participacoes = await prisma.sprintTask.findMany({ where: { sprintId: sprint.id } });
    expect(participacoes).toHaveLength(2);
    for (const participacao of participacoes) {
      expect(participacao.removedAt).toBeNull();
      expect(participacao.closedAt).not.toBeNull();
    }
    const congelada = participacoes.find((item) => item.taskId === pendente.id);
    expect(congelada.exitStatus).toBe('A_FAZER');

    const historico = await prisma.taskHistoryEntry.findMany({
      where: { taskId: pendente.id, field: 'SPRINT' },
      orderBy: { id: 'asc' }
    });
    expect(historico[historico.length - 1]).toMatchObject({
      fromValue: String(sprint.id),
      toValue: null
    });
  });

  it('a ultima sprint conclui o marco na mesma transacao', async () => {
    const project = await createProject(prisma);
    const marco = await createMilestone(prisma, project.id);
    await createSprint(prisma, project.id, {
      name: 'Sprint A',
      milestoneId: marco.id,
      startDate: inicio,
      endDate: new Date('2026-08-15T00:00:00.000Z'),
      status: 'CONCLUIDA'
    });
    const ultima = await createSprint(prisma, project.id, {
      name: 'Sprint B',
      milestoneId: marco.id,
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: fim,
      status: 'EM_ANDAMENTO'
    });

    const beforeSprint = await prisma.sprint.findUnique({ where: { id: ultima.id } });
    const beforeMilestone = await prisma.milestone.findUnique({ where: { id: marco.id } });
    const transaction = prisma.$transaction.bind(prisma);
    const failure = vi.fn(async () => {
      throw new Error('injected milestone failure');
    });
    const transactionSpy = vi
      .spyOn(prisma, '$transaction')
      .mockImplementation((callback, options) =>
        transaction(
          (tx) =>
            callback(
              new Proxy(tx, {
                get(target, property) {
                  if (property !== 'milestone') return target[property];
                  return new Proxy(target[property], {
                    get(model, method) {
                      if (method !== 'update') return model[method];
                      return async () => {
                        expect(
                          await tx.sprint.findUnique({ where: { id: ultima.id } })
                        ).toMatchObject({ status: 'CONCLUIDA' });
                        return failure();
                      };
                    }
                  });
                }
              })
            ),
          options
        )
      );
    await expect(sprintService.updateSprintStatus(ultima.id, 'CONCLUIDA')).rejects.toThrow(
      'injected milestone failure'
    );
    expect(failure).toHaveBeenCalledOnce();
    transactionSpy.mockRestore();
    expect(await prisma.sprint.findUnique({ where: { id: ultima.id } })).toEqual(beforeSprint);
    expect(await prisma.milestone.findUnique({ where: { id: marco.id } })).toEqual(beforeMilestone);
    const resultado = await sprintService.updateSprintStatus(ultima.id, 'CONCLUIDA');

    expect(resultado.milestoneCompleted).toMatchObject({ id: marco.id, status: 'CONCLUIDO' });
    expect((await prisma.milestone.findUnique({ where: { id: marco.id } })).status).toBe(
      'CONCLUIDO'
    );
  });

  it('marco com sprint ainda aberta nao e concluido', async () => {
    const project = await createProject(prisma);
    const marco = await createMilestone(prisma, project.id);
    const primeira = await createSprint(prisma, project.id, {
      name: 'Sprint A',
      milestoneId: marco.id,
      startDate: inicio,
      endDate: new Date('2026-08-15T00:00:00.000Z'),
      status: 'EM_ANDAMENTO'
    });
    await createSprint(prisma, project.id, {
      name: 'Sprint B',
      milestoneId: marco.id,
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: fim,
      status: 'PLANEJADA'
    });

    const resultado = await sprintService.updateSprintStatus(primeira.id, 'CONCLUIDA');

    expect(resultado.milestoneCompleted).toBeNull();
    expect((await prisma.milestone.findUnique({ where: { id: marco.id } })).status).toBe(
      'PENDENTE'
    );
  });

  it('serializa exclusão lógica do Marco e criação da Sprint, preservando a referência se criada primeiro', async () => {
    {
      const project = await createProject(prisma);
      const marco = await createMilestone(prisma, project.id);

      const gate = contendProjectLock(prisma);
      const resultados = await Promise.allSettled([
        sprintService.deleteMilestone(marco.id),
        sprintService.createSprint(project.id, {
          name: 'Sprint nova',
          startDate: '2026-08-01',
          endDate: '2026-08-30',
          milestoneId: marco.id
        })
      ]);
      expect(gate.attempts()).toBe(2);
      gate.restore();
      expect(resultados[0].status).toBe('fulfilled');
      expect(await prisma.milestone.findUnique({ where: { id: marco.id } })).toMatchObject({
        deletedAt: expect.any(Date)
      });

      const sprints = await prisma.sprint.findMany({ where: { projectId: project.id } });
      expect(sprints).toHaveLength(resultados[1].status === 'fulfilled' ? 1 : 0);
      if (resultados[1].status === 'fulfilled')
        expect(sprints[0]).toMatchObject({ id: resultados[1].value.id, milestoneId: marco.id });
      const marcos = await prisma.milestone.count({ where: { id: marco.id } });
      for (const sprint of sprints) {
        if (sprint.milestoneId !== null) expect(marcos).toBe(1);
      }
      const recusadas = resultados.filter((resultado) => resultado.status === 'rejected');
      for (const recusada of recusadas) {
        expect(recusada.reason.code).toBe('MILESTONE_NOT_FOUND');
      }
      await cleanTestDatabase(prisma);
    }
  });
});

describe('encerramento de sprint versus movimento de tarefa', () => {
  const inicio = new Date('2026-08-01T00:00:00.000Z');
  const fim = new Date('2026-08-30T00:00:00.000Z');

  let sequencia = 0;
  async function cenario(statusDaTarefa) {
    sequencia += 1;
    const user = await prisma.user.create({
      data: {
        name: 'Ator',
        username: `ator-movimento-${sequencia}`,
        email: `ator-movimento-${sequencia}@example.invalid`,
        passwordHash: 'x'
      }
    });
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id, {
      startDate: inicio,
      endDate: fim,
      status: 'EM_ANDAMENTO',
      startedAt: inicio
    });
    const task = await createTask(prisma, project.id, { status: statusDaTarefa });
    await sprintService.replaceTasks(sprint.id, [task.id], { actorUserId: user.id });
    return {
      sprint,
      task,
      contextoSprint: { actorUserId: user.id },
      contextoTask: { actor: { id: user.id, name: user.name } }
    };
  }

  async function estadoFinal(sprint, task) {
    return {
      tarefa: await prisma.task.findUnique({ where: { id: task.id } }),
      participacao: await prisma.sprintTask.findFirst({
        where: { sprintId: sprint.id, taskId: task.id }
      }),
      movimentos: await prisma.taskMovement.findMany({ where: { taskId: task.id } }),
      historico: await prisma.taskHistoryEntry.findMany({
        where: { taskId: task.id, field: 'STATUS' }
      })
    };
  }

  it('recusa mover tarefa de sprint ja encerrada', async () => {
    const { sprint, task, contextoSprint, contextoTask } = await cenario('CONCLUIDO');
    await sprintService.updateSprintStatus(sprint.id, 'CONCLUIDA', contextoSprint);

    await expect(
      taskKanbanService.moveTask(task.id, { toStatus: 'EM_ANDAMENTO' }, contextoTask)
    ).rejects.toMatchObject({ code: 'TASK_SPRINT_LOCKED' });

    const { tarefa, participacao, movimentos } = await estadoFinal(sprint, task);
    expect(tarefa.status).toBe('CONCLUIDO');
    expect(participacao.exitStatus).toBe('CONCLUIDO');
    expect(movimentos).toHaveLength(0);
  });

  it('o snapshot terminal nunca congela status diferente do que a tarefa termina', async () => {
    {
      const { sprint, task, contextoSprint, contextoTask } = await cenario('CONCLUIDO');

      const gate = contendProjectLock(prisma);
      const [encerramento, movimento] = await Promise.allSettled([
        sprintService.updateSprintStatus(sprint.id, 'CONCLUIDA', contextoSprint),
        taskKanbanService.moveTask(task.id, { toStatus: 'EM_ANDAMENTO' }, contextoTask)
      ]);
      expect(gate.attempts()).toBe(2);
      gate.restore();

      expect(encerramento.status).toBe('fulfilled');
      const { tarefa, participacao, movimentos, historico } = await estadoFinal(sprint, task);
      expect(participacao.exitStatus).toBe(tarefa.status);

      if (movimento.status === 'fulfilled') {
        expect(tarefa.status).toBe('EM_ANDAMENTO');
        expect(movimentos).toHaveLength(1);
        expect(movimentos[0].fromStatus).toBe('CONCLUIDO');
        expect(movimentos[0].sprintId).toBe(sprint.id);
        expect(historico).toHaveLength(1);
      } else {
        expect(movimento.reason).toMatchObject({ code: 'TASK_SPRINT_LOCKED' });
        expect(tarefa.status).toBe('CONCLUIDO');
        expect(movimentos).toHaveLength(0);
        expect(historico).toHaveLength(0);
      }
      await cleanTestDatabase(prisma);
    }
  });

  it('movimento posterior ao backlog nao registra a sprint encerrada', async () => {
    {
      const { sprint, task, contextoSprint, contextoTask } = await cenario('A_FAZER');

      const gate = contendProjectLock(prisma);
      const [encerramento, movimento] = await Promise.allSettled([
        sprintService.updateSprintStatus(sprint.id, 'CONCLUIDA', contextoSprint),
        taskKanbanService.moveTask(task.id, { toStatus: 'EM_ANDAMENTO' }, contextoTask)
      ]);
      expect(gate.attempts()).toBe(2);
      gate.restore();

      expect(encerramento.status).toBe('fulfilled');
      expect(movimento.status).toBe('fulfilled');

      const { tarefa, participacao, movimentos } = await estadoFinal(sprint, task);
      expect(tarefa.status).toBe('EM_ANDAMENTO');
      expect(tarefa.sprintId).toBeNull();
      expect(movimentos).toHaveLength(1);

      if (participacao.exitStatus === 'EM_ANDAMENTO') {
        expect(movimentos[0].sprintId).toBe(sprint.id);
      } else {
        expect(participacao.exitStatus).toBe('A_FAZER');
        expect(movimentos[0].sprintId).toBeNull();
      }
      await cleanTestDatabase(prisma);
    }
  });
});
