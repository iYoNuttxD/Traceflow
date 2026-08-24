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

  // O lado do vinculo inverteu (ADR-011 D01). As duas asserces juntas provam a
  // migration do ADR-011: a coluna nova responde, e a antiga nao existe mais.
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

  // Sprint e Milestone sao os dois filhos de Project em cascata, e a sprint ainda
  // aponta para o marco. Com FK `Restrict` no lugar de `SetNull`, esta exclusao
  // falharia sempre que o InnoDB processasse Milestone primeiro — e a ordem entre
  // FKs irmas nao e garantida (ADR-011 D01).
  it('exclusao de projeto remove sprints e marcos em cascata, mesmo vinculados', async () => {
    const project = await createProject(prisma);
    const marco = await createMilestone(prisma, project.id);
    await createSprint(prisma, project.id, { milestoneId: marco.id });

    await prisma.projectMembership.deleteMany({ where: { projectId: project.id } });
    await expect(prisma.project.delete({ where: { id: project.id } })).resolves.toBeDefined();
    expect(await prisma.sprint.count()).toBe(0);
    expect(await prisma.milestone.count()).toBe(0);
  });

  // SetNull na FK e rede de seguranca, nao a regra: quem protege o agrupamento e
  // a recusa do service. Apagar o marco por fora deixa a sprint sem marco, e nao
  // um ponteiro orfao.
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

  // `TaskHistoryEntry.actorUserId` e obrigatorio: sem ator, a mutacao de escopo
  // aborta na escrita do historico e o teste passa a exercitar um caminho que nao
  // chega ao fim.
  let sequencia = 0;
  const comAtor = async () => {
    sequencia += 1;
    const user = await prisma.user.create({
      data: {
        name: 'Ator',
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

  // ADR-011 D06: duas requisicoes tentam iniciar sprints diferentes do mesmo
  // projeto. Validar fora do lock deixaria as duas partirem do mesmo retrato,
  // e o projeto terminaria com duas sprints em andamento.
  it('duas sprints nao entram em andamento ao mesmo tempo', async () => {
    for (let rodada = 0; rodada < 5; rodada += 1) {
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

      const resultados = await Promise.allSettled([
        sprintService.updateSprintStatus(primeira.id, 'EM_ANDAMENTO'),
        sprintService.updateSprintStatus(segunda.id, 'EM_ANDAMENTO')
      ]);

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

  // ADR-011 D07: o encerramento devolve ao backlog o que nao foi concluido, na
  // MESMA transacao que congela as participacoes. Metade disso deixaria a tarefa
  // presa numa sprint congelada, ou o registro sem o que havia nela.
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
    // A concluida fica: ela terminou aqui, e o ponteiro registra isso.
    expect((await prisma.task.findUnique({ where: { id: pronta.id } })).sprintId).toBe(sprint.id);

    // A participacao NAO e removida: ela guarda o que aconteceu no periodo.
    const participacoes = await prisma.sprintTask.findMany({ where: { sprintId: sprint.id } });
    expect(participacoes).toHaveLength(2);
    for (const participacao of participacoes) {
      expect(participacao.removedAt).toBeNull();
      expect(participacao.closedAt).not.toBeNull();
    }
    const congelada = participacoes.find((item) => item.taskId === pendente.id);
    expect(congelada.exitStatus).toBe('A_FAZER');

    // A saida vira historico, com `toValue` nulo — mesma convencao da mutacao
    // de escopo.
    const historico = await prisma.taskHistoryEntry.findMany({
      where: { taskId: pendente.id, field: 'SPRINT' },
      orderBy: { id: 'asc' }
    });
    expect(historico[historico.length - 1]).toMatchObject({
      fromValue: String(sprint.id),
      toValue: null
    });
  });

  // ADR-011 D05: o marco fecha na mesma transacao da ultima sprint. Fora dela,
  // uma falha depois do encerramento deixaria o marco eternamente pendente com
  // todas as sprints concluidas.
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

  // Exclusao de marco contra a criacao de uma sprint que o escolhe. Sem a
  // revalidacao sob lock, a sprint confirmaria apontando para uma linha apagada
  // e a FK estouraria uma violacao que a interface nao sabe traduzir.
  it('exclusao de marco e criacao de sprint nao confirmam uma fora da outra', async () => {
    for (let rodada = 0; rodada < 5; rodada += 1) {
      const project = await createProject(prisma);
      const marco = await createMilestone(prisma, project.id);

      const resultados = await Promise.allSettled([
        sprintService.deleteMilestone(marco.id),
        sprintService.createSprint(project.id, {
          name: 'Sprint nova',
          startDate: '2026-08-01',
          endDate: '2026-08-30',
          milestoneId: marco.id
        })
      ]);

      const sprints = await prisma.sprint.findMany({ where: { projectId: project.id } });
      const marcos = await prisma.milestone.count({ where: { id: marco.id } });
      // Ou a sprint entrou e o marco sobreviveu (a exclusao foi recusada), ou o
      // marco sumiu e a sprint nao existe. Nunca sprint apontando para o vazio.
      for (const sprint of sprints) {
        if (sprint.milestoneId !== null) expect(marcos).toBe(1);
      }
      const recusadas = resultados.filter((resultado) => resultado.status === 'rejected');
      for (const recusada of recusadas) {
        expect(['MILESTONE_HAS_SPRINTS', 'MILESTONE_NOT_FOUND']).toContain(recusada.reason.code);
      }
      await cleanTestDatabase(prisma);
    }
  });
});
