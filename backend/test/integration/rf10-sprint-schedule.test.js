// RF10: migration e repositories contra MySQL real.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createMilestone, createProject, createSprint, createTask } from '../fixtures/factories.js';

let prisma;
let sprintRepository;
let milestoneRepository;
let sprintService;
let testDatabaseUrl;

beforeAll(async () => {
  testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ sprintRepository } =
    await import('../../src/modules/sprints/repositories/sprint.repository.js'));
  ({ milestoneRepository } =
    await import('../../src/modules/sprints/repositories/milestone.repository.js'));
  // O service entra aqui porque a invariante de janela nasce da combinacao entre
  // regra e lock: exercitar so o repository provaria a transacao, nao a decisao.
  ({ sprintService } = await import('../../src/modules/sprints/sprint.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('migration add_sprint_milestone_schedule', () => {
  it('e idempotente: reaplicar em banco ja migrado nao falha', () => {
    expect(() => deployTestMigrations(testDatabaseUrl)).not.toThrow();
  });

  it('criou as tabelas Sprint e Milestone', async () => {
    await expect(prisma.sprint.count()).resolves.toBe(0);
    await expect(prisma.milestone.count()).resolves.toBe(0);
  });

  it('preservou os valores existentes do enum TaskHistoryField', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const user = await prisma.user.create({
      data: { name: 'Ator', email: `ator-${task.id}@example.invalid`, passwordHash: 'x' }
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

  // Antes deste ajuste o teste fixava o comportamento oposto: `@db.Date` truncava
  // a hora e a assercao guardava essa perda como se fosse contrato. Preservar o
  // instante e a regra (ADR-010 D05) — 23:59:59 do dia 14 nao e meia-noite do 14.
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
  it('aplica a unicidade de nome por projeto', async () => {
    const project = await createProject(prisma);
    await createSprint(prisma, project.id, { name: 'Sprint 1' });
    await expect(createSprint(prisma, project.id, { name: 'Sprint 1' })).rejects.toMatchObject({
      code: 'P2002'
    });
  });

  it('aceita o mesmo nome em projetos diferentes', async () => {
    const first = await createProject(prisma);
    const second = await createProject(prisma);
    await createSprint(prisma, first.id, { name: 'Sprint 1' });
    await expect(createSprint(prisma, second.id, { name: 'Sprint 1' })).resolves.toBeDefined();
  });

  it('SetNull na FK e rede de seguranca: exclusao direta nao apaga a tarefa', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id, { sprintId: sprint.id });

    await prisma.sprint.delete({ where: { id: sprint.id } });
    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stored).not.toBeNull();
    expect(stored.sprintId).toBeNull();
  });

  it('exclusao de projeto remove sprints e marcos em cascata', async () => {
    const project = await createProject(prisma);
    await createSprint(prisma, project.id);
    await createMilestone(prisma, project.id);

    await prisma.projectMembership.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
    expect(await prisma.sprint.count()).toBe(0);
    expect(await prisma.milestone.count()).toBe(0);
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
      data: { name: 'Ator', email: `ator-tx-${task.id}@example.invalid`, passwordHash: 'x' }
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

  // A participacao entra na mesma transacao do vinculo: se a auditoria falhar,
  // nao pode sobrar registro historico de uma associacao que nunca existiu.
  it('falha na auditoria desfaz participacao, vinculo e historico', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id);
    const task = await createTask(prisma, project.id);

    await expect(
      sprintRepository.mutateScopeWithinSprintLock(
        sprint.id,
        project.id,
        [task.id],
        // actorUserId inexistente viola a FK e deve derrubar a transacao inteira.
        planoDeEntrada(project, sprint, task, 999999)
      )
    ).rejects.toBeDefined();

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

// O lock so vale se a decisao vier DEPOIS dele. Estes testes afirmam sobre o
// estado final do banco, nunca sobre qual requisicao venceu: sob concorrencia
// real a ordem nao e do teste, e depender dela seria testar o escalonador.
describe('concorrencia sob lock (ADR-010 D17)', () => {
  const inicio = new Date('2026-08-01T00:00:00.000Z');
  const fim = new Date('2026-08-30T00:00:00.000Z');

  async function sprintDeTeste(overrides = {}) {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id, {
      startDate: inicio,
      endDate: fim,
      ...overrides
    });
    return { project, sprint };
  }

  // Partindo de [01, 30], uma requisicao move so o fim para 15 e outra so o
  // inicio para 20. Completar o lado ausente com o registro lido ANTES da
  // transacao deixava as duas passarem pela mesma validacao, e o banco terminava
  // com [20, 15] — janela invertida, que nenhuma das duas requisicoes pediu.
  it('duas atualizacoes parciais complementares nunca gravam janela invertida', async () => {
    const { sprint } = await sprintDeTeste();

    const resultados = await Promise.allSettled([
      sprintService.updateSprint(sprint.id, { endDate: '2026-08-15' }),
      sprintService.updateSprint(sprint.id, { startDate: '2026-08-20' })
    ]);

    const persistida = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(persistida.startDate.getTime()).toBeLessThan(persistida.endDate.getTime());

    // Uma das duas precisa ter sido recusada: as duas juntas sao contraditorias.
    const recusadas = resultados.filter((resultado) => resultado.status === 'rejected');
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0].reason).toMatchObject({ code: 'SPRINT_DATE_RANGE_INVALID' });

    // A janela final e exatamente a de quem venceu, sem mistura das duas.
    const vencedora = [
      { startDate: inicio.getTime(), endDate: new Date('2026-08-15T00:00:00.000Z').getTime() },
      { startDate: new Date('2026-08-20T00:00:00.000Z').getTime(), endDate: fim.getTime() }
    ];
    expect(vencedora).toContainEqual({
      startDate: persistida.startDate.getTime(),
      endDate: persistida.endDate.getTime()
    });
  });

  // Encolher a janela e recusado DENTRO da transacao: nem a sprint muda, nem
  // sobra evento de auditoria de uma atualizacao que nao aconteceu.
  it('recusar por marco fora da janela nao deixa escrita parcial', async () => {
    const { project, sprint } = await sprintDeTeste();
    await createMilestone(prisma, project.id, {
      sprintId: sprint.id,
      dueDate: new Date('2026-08-20T00:00:00.000Z')
    });

    await expect(
      sprintService.updateSprint(sprint.id, { endDate: '2026-08-10' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'SPRINT_WINDOW_MILESTONE_CONFLICT' });

    const persistida = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(persistida.endDate.getTime()).toBe(fim.getTime());
    expect(await prisma.auditEvent.count({ where: { action: 'SPRINT_UPDATED' } })).toBe(0);
  });

  // A leitura dos marcos acontece depois do lock, entao ela enxerga o que ja foi
  // confirmado. Recusar a criacao que perde a corrida para a reducao ainda depende
  // do lock nas mutacoes de marco (Fase 4).
  it('a reducao de janela enxerga marco criado imediatamente antes dela', async () => {
    const { project, sprint } = await sprintDeTeste();
    await createMilestone(prisma, project.id, {
      sprintId: sprint.id,
      dueDate: new Date('2026-08-25T00:00:00.000Z')
    });

    await expect(
      sprintService.updateSprint(sprint.id, { startDate: '2026-08-02', endDate: '2026-08-20' })
    ).rejects.toMatchObject({ code: 'SPRINT_WINDOW_MILESTONE_CONFLICT' });
  });

  // Duas transicoes terminais partindo de EM_ANDAMENTO. Validar antes da
  // transacao deixava as duas passarem, e a sprint recebia DOIS encerramentos:
  // a segunda escrita sobrepunha status e `completedAt` de um periodo que a
  // primeira ja tinha fechado, e `freezeParticipations` rodava de novo, movendo
  // o `closedAt` das participacoes para depois do encerramento real.
  it('duas transicoes terminais concorrentes: exatamente uma acontece', async () => {
    const { project, sprint } = await sprintDeTeste({ status: 'EM_ANDAMENTO' });
    const task = await createTask(prisma, project.id);
    await prisma.sprintTask.create({
      data: {
        projectId: project.id,
        sprintId: sprint.id,
        taskId: task.id,
        taskTitleSnapshot: task.title
      }
    });

    const resultados = await Promise.allSettled([
      sprintService.updateSprintStatus(sprint.id, 'CONCLUIDA'),
      sprintService.updateSprintStatus(sprint.id, 'CANCELADA')
    ]);

    const recusadas = resultados.filter((resultado) => resultado.status === 'rejected');
    expect(recusadas).toHaveLength(1);
    expect(recusadas[0].reason).toMatchObject({ code: 'SPRINT_INVALID_TRANSITION' });
    // Uma transicao, um evento. Dois eventos significariam que a sprint foi
    // encerrada duas vezes.
    expect(await prisma.auditEvent.count({ where: { action: 'SPRINT_STATUS_CHANGED' } })).toBe(1);

    const persistida = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(['CONCLUIDA', 'CANCELADA']).toContain(persistida.status);
    // Sprint cancelada nao carrega instante de conclusao: seria o carimbo da
    // transicao que perdeu a corrida sobrevivendo na que venceu.
    if (persistida.status === 'CANCELADA') expect(persistida.completedAt).toBeNull();
    else expect(persistida.completedAt).toBeInstanceOf(Date);

    const participacao = await prisma.sprintTask.findFirst({ where: { sprintId: sprint.id } });
    expect(participacao.closedAt).toBeInstanceOf(Date);
  });

  // Cancelar e iniciar ao mesmo tempo uma sprint PLANEJADA. As duas ordens de
  // commit convergem para CANCELADA: se o cancelamento vem primeiro, o inicio e
  // recusado sobre o registro terminal; se o inicio vem primeiro, o cancelamento
  // e uma transicao valida a partir de EM_ANDAMENTO.
  //
  // Detecta o defeito em uma das duas ordens — a invariante que ele afirma, essa
  // sim, vale sempre: status e congelamento nao podem discordar.
  it('cancelar e iniciar ao mesmo tempo nao deixa sprint aberta com escopo congelado', async () => {
    const { project, sprint } = await sprintDeTeste();
    const task = await createTask(prisma, project.id);
    await prisma.sprintTask.create({
      data: {
        projectId: project.id,
        sprintId: sprint.id,
        taskId: task.id,
        taskTitleSnapshot: task.title
      }
    });

    await Promise.allSettled([
      sprintService.updateSprintStatus(sprint.id, 'CANCELADA'),
      sprintService.updateSprintStatus(sprint.id, 'EM_ANDAMENTO')
    ]);

    const persistida = await prisma.sprint.findUnique({ where: { id: sprint.id } });
    expect(persistida.status).toBe('CANCELADA');

    const participacao = await prisma.sprintTask.findFirst({ where: { sprintId: sprint.id } });
    const terminal = ['CONCLUIDA', 'CANCELADA'].includes(persistida.status);
    expect(participacao.closedAt === null).toBe(!terminal);
  });

  // Ordem global de locks (D17 Regra 2), verificada onde ela de fato vale: entre
  // caminhos DIFERENTES.
  //
  // Todo caminho de cronograma grava um AuditEvent com `projectId`, e a FK dessa
  // coluna pede lock compartilhado na linha do projeto no fim da transacao. Um
  // caminho que travasse a sprint primeiro pediria o projeto por ultimo, em ordem
  // oposta a de quem trava o projeto na entrada — e o par fechava ciclo de espera
  // de forma reproduzivel, nao esporadica. Erro de infraestrutura (P2010, P2034,
  // P2024) e a assinatura disso; erro de dominio (409) e resultado legitimo.
  const cruzaCaminhos = async (rotulo, operacoes) => {
    const resultados = await Promise.allSettled(operacoes);
    const infraestrutura = resultados.filter(
      (resultado) =>
        resultado.status === 'rejected' && /^P\d{4}$/.test(String(resultado.reason?.code ?? ''))
    );
    expect(infraestrutura.map((resultado) => `${rotulo}: ${resultado.reason.code}`)).toStrictEqual(
      []
    );
  };

  it('escopo contra transicao de status nao fecha ciclo de espera', async () => {
    for (let rodada = 0; rodada < 5; rodada += 1) {
      const { project, sprint } = await sprintDeTeste({ status: 'EM_ANDAMENTO' });
      const task = await createTask(prisma, project.id);
      await cruzaCaminhos('escopo x status', [
        sprintService.replaceTasks(sprint.id, [task.id]),
        sprintService.updateSprintStatus(sprint.id, 'CONCLUIDA')
      ]);
      await cleanTestDatabase(prisma);
    }
  });

  it('escopo contra atualizacao de janela nao fecha ciclo de espera', async () => {
    for (let rodada = 0; rodada < 5; rodada += 1) {
      const { project, sprint } = await sprintDeTeste();
      const task = await createTask(prisma, project.id);
      await cruzaCaminhos('escopo x janela', [
        sprintService.replaceTasks(sprint.id, [task.id]),
        sprintService.updateSprint(sprint.id, { endDate: '2026-08-25' })
      ]);
      await cleanTestDatabase(prisma);
    }
  });

  it('janela contra transicao de status nao fecha ciclo de espera', async () => {
    for (let rodada = 0; rodada < 5; rodada += 1) {
      const { sprint } = await sprintDeTeste();
      await cruzaCaminhos('janela x status', [
        sprintService.updateSprint(sprint.id, { endDate: '2026-08-25' }),
        sprintService.updateSprintStatus(sprint.id, 'EM_ANDAMENTO')
      ]);
      await cleanTestDatabase(prisma);
    }
  });

  // Estado que so o backfill da migration s104 produz: marco vinculado a uma
  // sprint cuja janela nunca o conteve. Ele nao pode trancar a sprint — nem para
  // renomear, nem para reajustar o periodo.
  it('marco legado fora da janela nao tranca a sprint', async () => {
    const { project, sprint } = await sprintDeTeste();
    await createMilestone(prisma, project.id, {
      sprintId: sprint.id,
      dueDate: new Date('2026-10-15T00:00:00.000Z')
    });

    await expect(
      sprintService.updateSprint(sprint.id, {
        name: 'Sprint renomeada',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-30T00:00:00.000Z'
      })
    ).resolves.toMatchObject({ name: 'Sprint renomeada' });

    await expect(
      sprintService.updateSprint(sprint.id, { endDate: '2026-08-20' })
    ).resolves.toBeDefined();
  });
});
