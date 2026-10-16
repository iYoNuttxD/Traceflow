import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let prisma;
let env;
let kanban;
let createNotificationService;
let createNotificationMetricsService;
let notificationMetricsRepository;
let taskRepository;
let privacyService;
let runPrivacyRetention;
let settingsRepository;
let policy;
let sequence = 0;

const TZ = 'America/Sao_Paulo';
const DAY = 86_400_000;
const DECISIONS_MIGRATION = '20261015120000_notification_decisions';
const TOTAL_FORMULA = 'enviadasCorretamente / ocorridos × 100';
const ELIGIBLE_FORMULA = 'enviadasCorretamente / (ocorridos − naoEnviadas − semDestinatario) × 100';
const silent = { info() {}, warn() {}, error() {} };

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ createNotificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ createNotificationMetricsService } =
    await import('../../src/modules/notifications/notification-metrics.service.js'));
  ({ notificationMetricsRepository } =
    await import('../../src/modules/notifications/notification-metrics.repository.js'));
  ({ taskRepository } = await import('../../src/modules/tasks/task.repository.js'));
  ({ privacyService } = await import('../../src/modules/privacy/privacy.service.js'));
  ({ runPrivacyRetention } = await import('../../src/shared/maintenance/privacy-retention.js'));
  ({ settingsRepository } = await import('../../src/modules/settings/settings.repository.js'));
  policy = await import('../../src/modules/notifications/notification.policy.js');
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

const day = (offset) => policy.addDays(policy.localDateOf(new Date(), TZ), offset);
const afternoon = (offset) => new Date(`${day(offset)}T15:00:00.000Z`);
const dueOn = (offset) => new Date(`${day(offset)}T00:00:00.000Z`);
const cutoffOf = (offset) => policy.overdueCutoff(day(offset), TZ);

function completeRegistry(starts) {
  const early = new Date(`${day(-60)}T00:00:00.000Z`);
  return {
    ...notificationMetricsRepository,
    registryStarts: async () => starts ?? { decisions: early, githubEvents: early }
  };
}

const metrics = (repository = completeRegistry()) =>
  createNotificationMetricsService({ repository, log: silent });

const measure = (projectId, { from = day(-5), to = day(1), service = metrics() } = {}) =>
  service.compute({ from, to, projectId, timeZone: TZ });

const runJob = (overrides = {}) =>
  createNotificationService({ log: silent }).notifyOverdueTasks({
    now: new Date(),
    timeZone: TZ,
    dryRun: false,
    ...overrides
  });

const unavailable = (motivo) => ({ valor: null, situacao: 'INDISPONIVEL', motivo });

async function person(projectId, { role = 'MEMBER', isActive = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa métrica ${sequence}`,
      username: `pr26metrica${sequence}`,
      email: `pr26-metrica-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role, isActive } });
  return user;
}

async function scenario() {
  const project = await createProject(prisma);
  await person(project.id, { role: 'OWNER' });
  const actor = await person(project.id, { role: 'MANAGER' });
  const responsible = await person(project.id);
  return { project, actor, responsible };
}

async function excludedPeople(projectId, type) {
  const inactive = await person(projectId, { isActive: false });
  const restricted = await person(projectId);
  await prisma.user.update({
    where: { id: restricted.id },
    data: { accountStatus: 'DEACTIVATED' }
  });
  const optedOut = await person(projectId);
  await prisma.notificationPreference.create({
    data: { userId: optedOut.id, type, enabled: false }
  });
  return { inactive, restricted, optedOut };
}

const move = (task, toStatus, actor) =>
  kanban.moveTask(task.id, { toStatus }, { actor: { id: actor.id, name: actor.name } });

const overdueTask = (projectId, overrides = {}) =>
  createTask(prisma, projectId, { deadline: dueOn(-4), createdAt: afternoon(-10), ...overrides });

async function sentDecisionsMatchNotifications(type) {
  const sent = await prisma.notificationDecision.findMany({ where: { type, outcome: 'SENT' } });
  const delivered = await Promise.all(
    sent.map((decision) =>
      prisma.notification.count({
        where: {
          recipientUserId: decision.recipientUserId,
          dedupeKey: `${type}:${decision.eventKey}`
        }
      })
    )
  );
  return { sent: sent.length, delivered: delivered.filter((count) => count === 1).length };
}

describe('PR #26 métrica oficial do RF30 (TF-REV-002)', () => {
  it('M-01 dez mudanças: 6 enviadas, 3 por motivo autorizado e 1 sem responsável dão 60% total e 100% elegível', async () => {
    const { project, actor, responsible } = await scenario();
    const { inactive, restricted, optedOut } = await excludedPeople(
      project.id,
      'TASK_STATUS_CHANGED'
    );
    const movements = [];
    for (let index = 0; index < 5; index += 1) {
      const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
      movements.push((await move(task, 'EM_ANDAMENTO', actor)).movement);
    }
    const own = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    movements.push((await move(own, 'EM_ANDAMENTO', responsible)).movement);
    for (const responsibleUserId of [null, inactive.id, restricted.id, optedOut.id]) {
      const task = await createTask(prisma, project.id, { responsibleUserId });
      movements.push((await move(task, 'EM_ANDAMENTO', actor)).movement);
    }

    const decisions = await prisma.notificationDecision.findMany({ orderBy: { id: 'asc' } });
    const report = await measure(project.id);

    expect(
      decisions.map(({ eventKey, outcome, recipientKey, occurredAt }) => ({
        eventKey,
        outcome,
        recipientKey,
        occurredAt
      }))
    ).toEqual(
      movements.map((movement, index) => ({
        eventKey: `movement:${movement.id}`,
        outcome: [
          'SENT',
          'SENT',
          'SENT',
          'SENT',
          'SENT',
          'SENT',
          'NO_RESPONSIBLE',
          'INACTIVE_MEMBER',
          'INACTIVE_ACCOUNT',
          'PREFERENCE_OFF'
        ][index],
        recipientKey: [
          ...Array(6).fill(responsible.id),
          0,
          inactive.id,
          restricted.id,
          optedOut.id
        ][index],
        occurredAt: movement.movedAt
      }))
    );
    expect(await sentDecisionsMatchNotifications('TASK_STATUS_CHANGED')).toEqual({
      sent: 6,
      delivered: 6
    });
    expect(report.requisitos.RF30).toEqual({
      unidade: 'EVENTO',
      ocorridos: 10,
      enviadasCorretamente: 6,
      naoEnviadas: { total: 3, PREFERENCE_OFF: 1, INACTIVE_ACCOUNT: 1, INACTIVE_MEMBER: 1 },
      semDestinatario: { total: 1, NO_RESPONSIBLE: 1 },
      naoEnviadasSemMotivoAutorizado: { total: 0 },
      naoObservados: 0,
      lacunas: [],
      coberturaTotal: { valor: 60, situacao: 'CALCULADA', motivo: null, formula: TOTAL_FORMULA },
      coberturaElegivel: {
        valor: 100,
        situacao: 'CALCULADA',
        motivo: null,
        formula: ELIGIBLE_FORMULA,
        auxiliar: true
      }
    });
  });

  it('M-02 mudança sem decisão deixa a cobertura indisponível; a decisão da tarefa excluída continua no total', async () => {
    const { project, actor, responsible } = await scenario();
    const kept = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    await move(kept, 'EM_ANDAMENTO', actor);
    const doomed = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    const { movement } = await move(doomed, 'EM_ANDAMENTO', actor);
    await taskRepository.deleteTask(doomed.id);
    await prisma.taskMovement.create({
      data: {
        projectId: project.id,
        taskId: kept.id,
        fromStatus: 'EM_ANDAMENTO',
        toStatus: 'CONCLUIDO',
        movedBy: actor.name,
        movedByUserId: actor.id,
        responsibleUserIdSnapshot: responsible.id,
        responsibilitySnapshotState: 'ASSIGNED'
      }
    });

    const orphan = await prisma.notificationDecision.findFirst({
      where: { eventKey: `movement:${movement.id}` }
    });
    const report = await measure(project.id);

    expect(orphan).toMatchObject({ projectId: project.id, outcome: 'SENT' });
    expect(await prisma.taskMovement.count({ where: { id: movement.id } })).toBe(0);
    expect(report.requisitos.RF30).toMatchObject({
      ocorridos: 3,
      enviadasCorretamente: 2,
      naoObservados: 1,
      coberturaTotal: unavailable('EVENTOS_NAO_OBSERVADOS'),
      coberturaElegivel: unavailable('EVENTOS_NAO_OBSERVADOS')
    });
  });
});

describe('PR #26 métrica oficial do RF59 (TF-REV-002)', () => {
  it('M-03 o job grava uma decisão por vencimento; o vencimento resolvido antes do job fica não observado', async () => {
    const { project, responsible } = await scenario();
    const { inactive, restricted, optedOut } = await excludedPeople(project.id, 'TASK_OVERDUE');
    for (let index = 0; index < 3; index += 1)
      await overdueTask(project.id, { responsibleUserId: responsible.id });
    for (const responsibleUserId of [null, inactive.id, restricted.id, optedOut.id])
      await overdueTask(project.id, { responsibleUserId });
    const resolvedLate = await overdueTask(project.id, {
      responsibleUserId: responsible.id,
      status: 'CONCLUIDO'
    });
    const resolvedEarly = await overdueTask(project.id, {
      responsibleUserId: responsible.id,
      status: 'CONCLUIDO'
    });
    await prisma.taskHistoryEntry.createMany({
      data: [
        [resolvedLate, afternoon(-2)],
        [resolvedEarly, new Date(`${day(-4)}T12:00:00.000Z`)]
      ].map(([task, occurredAt]) => ({
        projectId: project.id,
        taskId: task.id,
        actorUserId: responsible.id,
        field: 'STATUS',
        fromValue: 'A_FAZER',
        toValue: 'CONCLUIDO',
        occurredAt
      }))
    });
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      deadline: dueOn(3)
    });

    await runJob({ dryRun: true });
    expect(await prisma.notificationDecision.count()).toBe(0);
    await runJob();

    const decisions = await prisma.notificationDecision.findMany({ orderBy: { id: 'asc' } });
    expect(new Set(decisions.map((decision) => decision.occurredAt.toISOString()))).toEqual(
      new Set([cutoffOf(-4).toISOString()])
    );
    expect(decisions.map((decision) => decision.outcome).sort()).toEqual([
      'INACTIVE_ACCOUNT',
      'INACTIVE_MEMBER',
      'NO_RESPONSIBLE',
      'PREFERENCE_OFF',
      'SENT',
      'SENT',
      'SENT'
    ]);
    expect(await sentDecisionsMatchNotifications('TASK_OVERDUE')).toEqual({
      sent: 3,
      delivered: 3
    });
    expect((await measure(project.id)).requisitos.RF59).toEqual({
      unidade: 'EVENTO',
      ocorridos: 8,
      enviadasCorretamente: 3,
      naoEnviadas: { total: 3, PREFERENCE_OFF: 1, INACTIVE_ACCOUNT: 1, INACTIVE_MEMBER: 1 },
      semDestinatario: { total: 1, NO_RESPONSIBLE: 1 },
      naoEnviadasSemMotivoAutorizado: { total: 0 },
      naoObservados: 1,
      lacunas: [],
      coberturaTotal: { ...unavailable('EVENTOS_NAO_OBSERVADOS'), formula: TOTAL_FORMULA },
      coberturaElegivel: {
        ...unavailable('EVENTOS_NAO_OBSERVADOS'),
        formula: ELIGIBLE_FORMULA,
        auxiliar: true
      }
    });

    await prisma.task.delete({ where: { id: resolvedLate.id } });

    expect((await measure(project.id)).requisitos.RF59).toMatchObject({
      ocorridos: 7,
      naoObservados: 0,
      coberturaTotal: { valor: 42.86, situacao: 'CALCULADA' },
      coberturaElegivel: { valor: 100, situacao: 'CALCULADA', auxiliar: true }
    });
  });

  it('M-04 a reavaliação troca o motivo, o envio prevalece e a execução sem mudança não grava', async () => {
    const { project, responsible } = await scenario();
    const other = await person(project.id);
    await prisma.notificationPreference.create({
      data: { userId: other.id, type: 'TASK_OVERDUE', enabled: false }
    });
    const unassigned = await overdueTask(project.id);
    const optedOut = await overdueTask(project.id, { responsibleUserId: other.id });

    await runJob();
    await prisma.task.update({
      where: { id: unassigned.id },
      data: { responsibleUserId: responsible.id }
    });
    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: other.id },
      data: { isActive: false }
    });
    await runJob();
    const settled = await prisma.notificationDecision.findMany({ orderBy: { id: 'asc' } });
    await prisma.user.update({
      where: { id: responsible.id },
      data: { accountStatus: 'DEACTIVATED' }
    });
    await runJob();

    const rows = await prisma.notificationDecision.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => [row.eventKey, row.recipientKey, row.outcome])).toEqual([
      [`${unassigned.id}:${day(-4)}`, 0, 'NO_RESPONSIBLE'],
      [`${optedOut.id}:${day(-4)}`, other.id, 'INACTIVE_MEMBER'],
      [`${unassigned.id}:${day(-4)}`, responsible.id, 'SENT']
    ]);
    expect(rows.map((row) => row.decidedAt)).toEqual(settled.map((row) => row.decidedAt));
    expect((await measure(project.id)).requisitos.RF59).toMatchObject({
      ocorridos: 2,
      enviadasCorretamente: 1,
      naoEnviadas: { total: 1, INACTIVE_MEMBER: 1 },
      semDestinatario: { total: 0 },
      naoObservados: 0,
      coberturaTotal: { valor: 50, situacao: 'CALCULADA' },
      coberturaElegivel: { valor: 100, situacao: 'CALCULADA' }
    });
  });
});

describe('PR #26 métrica oficial do RF60 e do RF61 (TF-REV-002)', () => {
  it('M-05 pares do outcome por requisito; a cobertura fica indisponível enquanto a fonte for a comparação de estado', async () => {
    const { project } = await scenario();
    const elsewhere = await createProject(prisma);
    const zero = {
      NO_TASK: 0,
      NO_PARTICIPANT: 0,
      INACTIVE_ACCOUNT: 0,
      INACTIVE_MEMBER: 0,
      PREFERENCE_OFF: 0
    };
    const event = (projectId, data) => {
      sequence += 1;
      return prisma.gitHubArtifactEvent.create({
        data: {
          projectId,
          artifactNumber: sequence,
          artifactTitle: `Artefato ${sequence}`,
          linkedTaskCount: 1,
          occurrenceKey: `pr26-metrica-${sequence}`,
          occurredAt: afternoon(-1),
          ...data
        }
      });
    };
    await event(project.id, {
      type: 'ISSUE_CLOSED',
      status: 'DISPATCHED',
      outcome: {
        tasks: 2,
        participants: 3,
        eligible: 2,
        created: 1,
        alreadyNotified: 1,
        excluded: { ...zero, NO_PARTICIPANT: 1, PREFERENCE_OFF: 1 }
      }
    });
    await event(project.id, {
      type: 'ISSUE_REOPENED',
      status: 'DISPATCHED',
      occurredAt: null,
      detectedAt: afternoon(-1),
      outcome: {
        tasks: 1,
        participants: 1,
        eligible: 0,
        created: 0,
        alreadyNotified: 0,
        excluded: { ...zero, OUTSIDE_WINDOW: 1 }
      }
    });
    await event(project.id, { type: 'ISSUE_CLOSED' });
    await event(project.id, {
      type: 'ISSUE_CLOSED',
      status: 'DISPATCHED',
      occurredAt: afternoon(-20),
      outcome: {
        tasks: 1,
        participants: 1,
        eligible: 1,
        created: 1,
        alreadyNotified: 0,
        excluded: zero
      }
    });
    await event(project.id, {
      type: 'PULL_REQUEST_MERGED',
      status: 'DISPATCHED',
      occurredAt: afternoon(-2),
      outcome: {
        tasks: 1,
        participants: 2,
        eligible: 2,
        created: 2,
        alreadyNotified: 0,
        excluded: zero
      }
    });
    await event(project.id, {
      type: 'PULL_REQUEST_CLOSED',
      status: 'DISPATCHED',
      occurredAt: afternoon(-2),
      outcome: {
        tasks: 0,
        participants: 0,
        eligible: 0,
        created: 0,
        alreadyNotified: 0,
        excluded: { ...zero, NO_TASK: 1 }
      }
    });
    await event(elsewhere.id, { type: 'PULL_REQUEST_MERGED' });

    const { RF60, RF61 } = (await measure(project.id)).requisitos;
    const source = [{ motivo: 'FONTE_POR_COMPARACAO_DE_ESTADO' }];

    expect(RF60).toEqual({
      unidade: 'PAR_EVENTO_PARTICIPANTE',
      eventos: 3,
      ocorridos: 6,
      enviadasCorretamente: 2,
      naoEnviadas: { total: 1, PREFERENCE_OFF: 1, INACTIVE_ACCOUNT: 0, INACTIVE_MEMBER: 0 },
      semDestinatario: { total: 1, NO_PARTICIPANT: 1, NO_TASK: 0 },
      naoEnviadasSemMotivoAutorizado: { total: 1, OUTSIDE_WINDOW: 1 },
      naoObservados: 1,
      lacunas: source,
      coberturaTotal: { ...unavailable('FONTE_POR_COMPARACAO_DE_ESTADO'), formula: TOTAL_FORMULA },
      coberturaElegivel: {
        ...unavailable('FONTE_POR_COMPARACAO_DE_ESTADO'),
        formula: ELIGIBLE_FORMULA,
        auxiliar: true
      }
    });
    expect(RF61).toMatchObject({
      unidade: 'PAR_EVENTO_PARTICIPANTE',
      eventos: 2,
      ocorridos: 3,
      enviadasCorretamente: 2,
      naoEnviadas: { total: 0 },
      semDestinatario: { total: 1, NO_PARTICIPANT: 0, NO_TASK: 1 },
      naoEnviadasSemMotivoAutorizado: { total: 0 },
      naoObservados: 0,
      lacunas: source,
      coberturaTotal: unavailable('FONTE_POR_COMPARACAO_DE_ESTADO'),
      coberturaElegivel: unavailable('FONTE_POR_COMPARACAO_DE_ESTADO')
    });
  });
});

describe('PR #26 métrica oficial: períodos sem evento e lacunas (TF-REV-002)', () => {
  it('M-06 período sem evento dá "indisponível", nunca 0 nem 100', async () => {
    const { project } = await scenario();

    const report = await measure(project.id, { from: day(-3), to: day(-2) });

    expect(report).toMatchObject({
      periodo: {
        de: day(-3),
        ate: day(-2),
        fuso: TZ,
        inicio: policy.startOfLocalDay(day(-3), TZ).toISOString(),
        fim: policy.startOfLocalDay(day(-1), TZ).toISOString()
      },
      projetos: 1
    });
    for (const rf of ['RF30', 'RF59']) {
      expect(report.requisitos[rf], rf).toMatchObject({
        ocorridos: 0,
        lacunas: [],
        coberturaTotal: unavailable('SEM_EVENTOS'),
        coberturaElegivel: unavailable('SEM_EVENTOS')
      });
    }
    for (const rf of ['RF60', 'RF61'])
      expect(report.requisitos[rf].coberturaTotal, rf).toMatchObject(
        unavailable('FONTE_POR_COMPARACAO_DE_ESTADO')
      );
    expect((await measure(2147483000)).projetos).toBe(0);
  });

  it('M-07 período anterior ao registro de decisões ou à retenção sai como registro incompleto', async () => {
    const { project, actor, responsible } = await scenario();
    await move(
      await createTask(prisma, project.id, { responsibleUserId: responsible.id }),
      'EM_ANDAMENTO',
      actor
    );
    const [{ finishedAt }] = await prisma.$queryRaw`
      SELECT finished_at AS finishedAt FROM _prisma_migrations
      WHERE migration_name = ${DECISIONS_MIGRATION}`;

    const before = await measure(project.id, {
      from: day(-400),
      to: day(-390),
      service: createNotificationMetricsService({ log: silent })
    });
    const ancient = new Date(`${day(-400)}T00:00:00.000Z`);
    const retained = await measure(project.id, {
      from: day(-200),
      to: day(1),
      service: metrics(completeRegistry({ decisions: ancient, githubEvents: ancient }))
    });
    const unknown = await measure(project.id, {
      service: metrics(completeRegistry({ decisions: null, githubEvents: null }))
    });

    const [gap] = before.requisitos.RF30.lacunas;
    expect(gap.motivo).toBe('REGISTRO_INCOMPLETO');
    expect(new Date(gap.completoDesde).getTime()).toBeGreaterThanOrEqual(finishedAt.getTime());
    expect(before.requisitos.RF30.coberturaTotal).toMatchObject(unavailable('REGISTRO_INCOMPLETO'));
    expect(before.requisitos.RF59.coberturaElegivel).toMatchObject(
      unavailable('REGISTRO_INCOMPLETO')
    );
    expect(before.requisitos.RF60.lacunas.map((item) => item.motivo)).toEqual([
      'REGISTRO_INCOMPLETO',
      'FONTE_POR_COMPARACAO_DE_ESTADO'
    ]);
    const horizon = new Date(retained.requisitos.RF30.lacunas[0].completoDesde).getTime();
    expect(Math.abs(horizon - (Date.now() - env.notificationRetentionDays * DAY))).toBeLessThan(
      60_000
    );
    expect(retained.requisitos.RF30).toMatchObject({
      ocorridos: 1,
      enviadasCorretamente: 1,
      coberturaTotal: unavailable('REGISTRO_INCOMPLETO')
    });
    expect(unknown.requisitos.RF59.lacunas).toEqual([
      { motivo: 'REGISTRO_INCOMPLETO', completoDesde: null }
    ]);
  });
});

describe('PR #26 decisões: retenção, anonimização e exportação (TF-REV-002)', () => {
  it('M-08 a exportação traz as decisões do titular; a anonimização apaga o destinatário e mantém a métrica; a retenção apaga as antigas', async () => {
    const { project, actor, responsible } = await scenario();
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    await move(task, 'EM_ANDAMENTO', actor);
    const [decision] = await prisma.notificationDecision.findMany();

    expect((await settingsRepository.exportData(responsible.id)).notificationDecisions).toEqual([
      {
        type: 'TASK_STATUS_CHANGED',
        eventKey: decision.eventKey,
        projectId: project.id,
        outcome: 'SENT',
        occurredAt: decision.occurredAt,
        decidedAt: decision.decidedAt
      }
    ]);
    expect((await settingsRepository.exportData(actor.id)).notificationDecisions).toEqual([]);

    await prisma.privacyRequest.create({
      data: {
        userId: responsible.id,
        type: 'ACCOUNT_DELETION',
        scheduledFor: new Date(Date.now() - 1000)
      }
    });
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 1
    });

    expect(
      await prisma.notificationDecision.findUnique({ where: { id: decision.id } })
    ).toMatchObject({ recipientUserId: null, recipientKey: -decision.id, outcome: 'SENT' });
    expect((await measure(project.id)).requisitos.RF30).toMatchObject({
      ocorridos: 1,
      enviadasCorretamente: 1,
      coberturaTotal: { valor: 100, situacao: 'CALCULADA' }
    });

    const now = new Date();
    const stale = await prisma.notificationDecision.create({
      data: {
        type: 'TASK_OVERDUE',
        eventKey: `${task.id}:${day(-200)}`,
        projectId: project.id,
        recipientKey: 0,
        outcome: 'NO_RESPONSIBLE',
        occurredAt: new Date(now.getTime() - 200 * DAY),
        decidedAt: new Date(now.getTime() - 181 * DAY)
      }
    });
    const options = { client: prisma, now, configuration: env };

    expect((await runPrivacyRetention(options)).counts.notificationDecisions).toBe(1);
    expect(
      (await runPrivacyRetention({ ...options, apply: true })).counts.notificationDecisions
    ).toBe(1);
    expect(await prisma.notificationDecision.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await prisma.notificationDecision.count()).toBe(1);
  });
});
