import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let reportService;
let executeProjectReport;
let reportRepository;
let dashboardService;
let serial = 0;
const noSchedule = () => {};

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ reportService, executeProjectReport } =
    await import('../../src/modules/reports/report.service.js'));
  ({ reportRepository } = await import('../../src/modules/reports/report.repository.js'));
  ({ dashboardService } = await import('../../src/modules/indicators/index.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function user(name) {
  const n = ++serial;
  return prisma.user.create({
    data: {
      name: name ?? `Integração ${n}`,
      username: `integ_${n}`,
      email: `integ_${n}@example.invalid`,
      emailVerifiedAt: new Date()
    }
  });
}

async function project(owner) {
  return prisma.project.create({
    data: {
      name: 'Integração de relatórios',
      responsibleTeam: 'QA',
      accessCode: `RINT-${++serial}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
}

async function requested(p, actor, body = {}) {
  const { report } = await reportService.request(
    p.id,
    body,
    { actorUserId: actor.id, requestId: 'test' },
    { schedule: noSchedule }
  );
  return report;
}

const stored = (id) =>
  prisma.projectReport.findUnique({ where: { id }, include: { people: true } });

const reportAudits = (id) =>
  prisma.auditEvent.findMany({
    where: { resourceType: 'ProjectReport', resourceId: String(id), action: 'REPORT_GENERATED' },
    orderBy: { id: 'asc' }
  });

describe('S2-06 — falha nunca vira relatório pronto', () => {
  it('erro com código do módulo fica registrado como FAILED, sem snapshot e auditado', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const error = Object.assign(new Error('Fonte de teste indisponível.'), {
      code: 'REPORT_SOURCE_UNAVAILABLE',
      exposeTechnicalDetails: true
    });
    await executeProjectReport(report.id, { build: () => Promise.reject(error) });
    const row = await stored(report.id);
    expect(row).toMatchObject({
      status: 'FAILED',
      activeProjectId: null,
      snapshot: null,
      errorCode: 'REPORT_SOURCE_UNAVAILABLE',
      errorMessage: 'Fonte de teste indisponível.'
    });
    expect(row.finishedAt).toBeInstanceOf(Date);
    expect(
      (await reportAudits(report.id)).map((event) => [event.result, event.reasonCode])
    ).toEqual([['FAILURE', 'REPORT_SOURCE_UNAVAILABLE']]);
  });

  it('erro inesperado vira mensagem genérica, sem detalhe interno', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    await executeProjectReport(report.id, {
      build: () => Promise.reject(new TypeError('cannot read properties of undefined (x.y)'))
    });
    const row = await stored(report.id);
    expect(row.errorCode).toBe('REPORT_GENERATION_FAILED');
    expect(row.errorMessage).toBe('Não foi possível gerar o relatório. Tente novamente.');
  });

  it('fonte dos indicadores indisponível falha a geração inteira', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const original = dashboardService.read.bind(dashboardService);
    vi.spyOn(dashboardService, 'read').mockImplementation(async (...args) => {
      const result = await original(...args);
      return { ...result, warnings: [{ code: 'SOURCE_UNAVAILABLE', source: 'tasks' }] };
    });
    await executeProjectReport(report.id);
    const row = await stored(report.id);
    expect(row.status).toBe('FAILED');
    expect(row.errorCode).toBe('REPORT_SOURCE_UNAVAILABLE');
    expect(row.snapshot).toBeNull();
  });

  it('geração que excede o tempo máximo termina como FAILED', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    await executeProjectReport(report.id, {
      build: () => new Promise(() => {}),
      maxDurationMs: 50,
      cancelGraceMs: 50
    });
    expect((await stored(report.id)).errorCode).toBe('REPORT_TIMEOUT');
  });

  it('falha ao gravar o resultado não deixa a geração como SUCCEEDED', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    vi.spyOn(reportRepository, 'succeed').mockRejectedValueOnce(new Error('falha de gravação'));
    await executeProjectReport(report.id);
    const row = await stored(report.id);
    expect(row.status).toBe('FAILED');
    expect(row.snapshot).toBeNull();
    expect(row.errorCode).toBe('REPORT_GENERATION_FAILED');
  });

  it('geração que perdeu a reserva no meio não sobrescreve o FAILED com sucesso', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const { buildReportSnapshot } =
      await import('../../src/modules/reports/report-snapshot.service.js');
    await executeProjectReport(report.id, {
      build: async (input, options) => {
        const result = await buildReportSnapshot(input, options);
        // Outra leitura considerou a geração abandonada enquanto ela ainda calculava.
        await prisma.projectReport.update({
          where: { id: report.id },
          data: {
            status: 'FAILED',
            activeProjectId: null,
            errorCode: 'REPORT_GENERATION_STALE',
            finishedAt: new Date()
          }
        });
        return result;
      }
    });
    const row = await stored(report.id);
    expect(row.status).toBe('FAILED');
    expect(row.errorCode).toBe('REPORT_GENERATION_STALE');
    expect(row.snapshot).toBeNull();
    expect(await reportAudits(report.id)).toEqual([]);
  });
});

describe('S2-06 — cancelamento da geração (prazo e reserva perdida)', () => {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Segura a primeira leitura real do painel até `release`, contando as leituras.
  function holdFirstDashboardRead() {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    const original = dashboardService.read.bind(dashboardService);
    const reads = [];
    vi.spyOn(dashboardService, 'read').mockImplementation(async (projectId, query, ...rest) => {
      reads.push(query.view);
      if (reads.length === 1) await held;
      return original(projectId, query, ...rest);
    });
    return { reads, release };
  }

  it('prazo vencido: nenhuma etapa nova começa e a reserva só volta quando a consulta termina', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const { sprintService } = await import('../../src/modules/sprints/index.js');
    const schedule = vi.spyOn(sprintService, 'getSchedule');
    const { reads, release } = holdFirstDashboardRead();
    const execution = executeProjectReport(report.id, { maxDurationMs: 100, cancelGraceMs: 10000 });
    await pause(400);
    // Prazo vencido, mas a consulta ainda está em andamento: a reserva continua ocupada.
    const during = await stored(report.id);
    expect(during).toMatchObject({ status: 'RUNNING', activeProjectId: p.id });
    const retry = await reportService.request(
      p.id,
      {},
      { actorUserId: owner.id, requestId: 'retry' },
      { schedule: noSchedule }
    );
    expect(retry).toMatchObject({ alreadyRunning: true, report: { id: report.id } });
    release();
    const failed = await execution;
    expect(failed).toMatchObject({ status: 'FAILED' });
    const row = await stored(report.id);
    expect(row).toMatchObject({
      status: 'FAILED',
      activeProjectId: null,
      errorCode: 'REPORT_TIMEOUT'
    });
    // Só a visão que já estava em andamento foi lida; agenda e demais visões, nunca.
    expect(reads).toHaveLength(1);
    expect(schedule).not.toHaveBeenCalled();
    const again = await reportService.request(
      p.id,
      {},
      { actorUserId: owner.id, requestId: 'again' },
      { schedule: noSchedule }
    );
    expect(again.alreadyRunning).toBe(false);
    expect(again.report.id).not.toBe(report.id);
  });

  it('consulta que não termina na carência: a geração é encerrada sem iniciar outra etapa', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const { reads, release } = holdFirstDashboardRead();
    await executeProjectReport(report.id, { maxDurationMs: 50, cancelGraceMs: 100 });
    expect(await stored(report.id)).toMatchObject({
      status: 'FAILED',
      activeProjectId: null,
      errorCode: 'REPORT_TIMEOUT'
    });
    release();
    await pause(300);
    expect(reads).toHaveLength(1);
  });

  it('reserva perdida durante a composição interrompe as próximas consultas', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const { reads, release } = holdFirstDashboardRead();
    const execution = executeProjectReport(report.id, { heartbeatMs: 20, cancelGraceMs: 10000 });
    await vi.waitFor(() => expect(reads).toHaveLength(1));
    // Outra leitura considerou a geração abandonada e encerrou a reserva.
    await prisma.projectReport.update({
      where: { id: report.id },
      data: { status: 'FAILED', activeProjectId: null, errorCode: 'REPORT_GENERATION_STALE' }
    });
    await pause(150);
    release();
    expect(await execution).toBeNull();
    expect(reads).toHaveLength(1);
    expect((await stored(report.id)).errorCode).toBe('REPORT_GENERATION_STALE');
  });

  it('gerações de projetos diferentes respeitam o limite de execuções simultâneas', async () => {
    const { createGenerationSlots } = await import('../../src/modules/reports/report.service.js');
    const slots = createGenerationSlots(2);
    const owner = await user();
    const reports = [];
    for (let index = 0; index < 3; index++)
      reports.push(await requested(await project(owner), owner));
    let active = 0;
    let peak = 0;
    const gates = [];
    const build = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => gates.push(resolve));
      active--;
      return { snapshot: { schemaVersion: 1 }, userIds: [], bytes: 20 };
    };
    const executions = reports.map((report) => executeProjectReport(report.id, { build, slots }));
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    await pause(200);
    expect(gates).toHaveLength(2);
    // Quem espera a vaga continua QUEUED, sem reivindicar a geração.
    const statuses = await Promise.all(
      reports.map(async (report) => (await stored(report.id)).status)
    );
    expect(statuses.filter((status) => status === 'QUEUED')).toHaveLength(1);
    gates[0]();
    await vi.waitFor(() => expect(gates).toHaveLength(3));
    gates[1]();
    gates[2]();
    const outcomes = await Promise.all(executions);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'SUCCEEDED',
      'SUCCEEDED',
      'SUCCEEDED'
    ]);
    expect(peak).toBe(2);
  });
});

describe('S2-06 — volume', () => {
  it('percorre todas as páginas da rastreabilidade (mais que um lote e uma página)', async () => {
    const owner = await user();
    const p = await project(owner);
    await prisma.requirement.createMany({
      data: Array.from({ length: 250 }, (_, index) => ({
        projectId: p.id,
        title: `RF${String(index + 1).padStart(3, '0')}`
      }))
    });
    const report = await requested(p, owner);
    await executeProjectReport(report.id);
    const row = await stored(report.id);
    expect(row.status).toBe('SUCCEEDED');
    expect(row.snapshot.traceability.summary.total).toBe(250);
    const ids = row.snapshot.traceability.items.map((item) => item.requirement.id);
    expect(new Set(ids).size).toBe(250);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
  });

  it('acima do teto de requisitos falha com código próprio em vez de recortar', async () => {
    const owner = await user();
    const p = await project(owner);
    await prisma.requirement.createMany({
      data: [1, 2, 3].map((n) => ({ projectId: p.id, title: `RF${n}` }))
    });
    const report = await requested(p, owner);
    const { REPORT_LIMITS } = await import('../../src/modules/reports/report-snapshot.service.js');
    await executeProjectReport(report.id, { limits: { ...REPORT_LIMITS, requirements: 2 } });
    expect((await stored(report.id)).errorCode).toBe('REPORT_VOLUME_LIMIT_EXCEEDED');
  });

  it('snapshot grande demais para armazenar falha com código próprio', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const { REPORT_LIMITS } = await import('../../src/modules/reports/report-snapshot.service.js');
    await executeProjectReport(report.id, { limits: { ...REPORT_LIMITS, snapshotBytes: 512 } });
    expect((await stored(report.id)).errorCode).toBe('REPORT_TOO_LARGE');
  });
});

describe('S2-06 — concorrência', () => {
  it('pedidos simultâneos produzem uma única geração', async () => {
    const owner = await user();
    const p = await project(owner);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        reportService.request(
          p.id,
          {},
          { actorUserId: owner.id, requestId: 'race' },
          { schedule: noSchedule }
        )
      )
    );
    const ids = new Set(results.map((result) => result.report.id));
    expect(ids.size).toBe(1);
    expect(results.filter((result) => !result.alreadyRunning)).toHaveLength(1);
    expect(await prisma.projectReport.count({ where: { projectId: p.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'REPORT_REQUESTED' } })).toBe(1);
  });

  it('duas execuções da mesma geração: só uma reivindica e conclui', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    const outcomes = await Promise.all([
      executeProjectReport(report.id),
      executeProjectReport(report.id)
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect((await stored(report.id)).status).toBe('SUCCEEDED');
    expect((await reportAudits(report.id)).map((event) => event.result)).toEqual(['SUCCESS']);
  });
});

describe('S2-06 — privacidade, retenção e ciclo do projeto', () => {
  it('anonimização neutraliza o nome congelado e preserva números e IDs', async () => {
    const owner = await user('Dona do projeto');
    const member = await user('Pessoa que sai');
    const p = await project(owner);
    await prisma.projectMembership.create({
      data: { projectId: p.id, userId: member.id, role: 'MEMBER' }
    });
    const report = await requested(p, member);
    await executeProjectReport(report.id);
    const before = await stored(report.id);
    expect(before.people).toEqual([
      expect.objectContaining({
        userId: member.id,
        displayNameSnapshot: 'Pessoa que sai',
        usernameSnapshot: member.username
      })
    ]);

    await prisma.privacyRequest.create({
      data: {
        userId: member.id,
        type: 'ACCOUNT_DELETION',
        scheduledFor: new Date(Date.now() - 1000)
      }
    });
    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 1
    });
    const anonymized = await prisma.user.findUnique({ where: { id: member.id } });
    const after = await stored(report.id);
    expect(after.people).toEqual([
      expect.objectContaining({
        userId: member.id,
        displayNameSnapshot: 'Usuário excluído',
        usernameSnapshot: anonymized.username
      })
    ]);
    expect(after.snapshot).toEqual(before.snapshot);
    expect(after.requestedByUserId).toBe(member.id);
  });

  // PR27-01: a conclusão e a anonimização disputam a mesma linha de User. Em qualquer
  // ordem, nenhuma pessoa gravada depois da anonimização pode reter o nome anterior.
  function gate() {
    let open;
    const promise = new Promise((resolve) => (open = resolve));
    return { promise, open };
  }
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function raceSetup(memberName) {
    const owner = await user('Dona do projeto');
    const member = await user(memberName);
    const p = await project(owner);
    await prisma.projectMembership.create({
      data: { projectId: p.id, userId: member.id, role: 'MEMBER' }
    });
    await prisma.privacyRequest.create({
      data: { userId: member.id, type: 'ACCOUNT_DELETION', scheduledFor: new Date(Date.now() - 1) }
    });
    const { buildReportSnapshot } =
      await import('../../src/modules/reports/report-snapshot.service.js');
    // A pessoa entra no snapshot (não só como solicitante): a conclusão insere a linha dela.
    const build = async (input, options) => {
      const result = await buildReportSnapshot(input, options);
      const userIds = [...new Set([...result.userIds, member.id])].sort((a, b) => a - b);
      return { ...result, userIds };
    };
    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    return { owner, member, p, build, privacyService };
  }

  // Pausa a anonimização logo depois de ela ler a conta (lock da transação SERIALIZABLE).
  async function pauseAnonymization() {
    const { auditRepository } = await import('../../src/modules/audit/audit.repository.js');
    const reached = gate();
    const release = gate();
    const original = auditRepository.create.bind(auditRepository);
    vi.spyOn(auditRepository, 'create').mockImplementation(async (data, tx) => {
      if (data.action === 'ACCOUNT_ANONYMIZATION_STARTED') {
        reached.open();
        await release.promise;
      }
      return original(data, tx);
    });
    return { reached: reached.promise, release: release.open };
  }

  async function expectNeutralized({ p, report, owner, member, formerName }) {
    const anonymized = await prisma.user.findUnique({ where: { id: member.id } });
    expect(anonymized.accountStatus).toBe('ANONYMIZED');
    const row = await stored(report.id);
    expect(row.status).toBe('SUCCEEDED');
    expect(row.people.find((person) => person.userId === member.id)).toMatchObject({
      displayNameSnapshot: 'Usuário excluído',
      usernameSnapshot: anonymized.username
    });
    const detail = await reportService.read(p.id, report.id);
    expect(detail.people.map((person) => person.userId)).toContain(member.id);
    expect(JSON.stringify(detail)).not.toContain(formerName);
    const { extractText, getDocumentProxy } = await import('unpdf');
    const { buffer } = await reportService.exportPdf(
      p.id,
      report.id,
      {},
      {
        actorUserId: owner.id,
        requestId: 'race-pdf'
      }
    );
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const text = (await extractText(pdf, { mergePages: true })).text.replace(/\s+/g, ' ');
    expect(text).toContain(`Relatório #${report.id}`);
    expect(text).not.toContain(formerName);
    expect(text).not.toContain(member.username);
  }

  it('anonimização durante a conclusão espera o commit e neutraliza as pessoas gravadas', async () => {
    const { owner, member, p, build, privacyService } = await raceSetup('Pessoa Conclusão Antes');
    const report = await requested(p, owner);
    const reached = gate();
    const release = gate();
    const original = prisma.$transaction.bind(prisma);
    // Segura a conclusão depois de ler e travar as contas, antes de inserir as pessoas.
    vi.spyOn(prisma, '$transaction').mockImplementation((work, options) => {
      if (typeof work !== 'function') return original(work, options);
      return original((tx) => {
        const people = new Proxy(tx.projectReportPerson, {
          get(target, key) {
            if (key !== 'createMany') return Reflect.get(target, key);
            return async (args) => {
              reached.open();
              await release.promise;
              return target.createMany(args);
            };
          }
        });
        return work(
          new Proxy(tx, {
            get(target, key) {
              if (key === 'projectReportPerson') return people;
              const value = Reflect.get(target, key);
              return typeof value === 'function' ? value.bind(target) : value;
            }
          })
        );
      }, options);
    });
    const completion = executeProjectReport(report.id, { build });
    await reached.promise;
    const deletion = privacyService.processDueDeletions({ dryRun: false });
    await pause(300);
    const during = await prisma.user.findUnique({ where: { id: member.id } });
    expect(during.accountStatus).not.toBe('ANONYMIZED');
    release.open();
    expect(await completion).toMatchObject({ status: 'SUCCEEDED' });
    expect(await deletion).toMatchObject({ processed: 1, failed: 0 });
    vi.restoreAllMocks();
    await expectNeutralized({ p, report, owner, member, formerName: 'Pessoa Conclusão Antes' });
  });

  it('conclusão durante a anonimização espera e grava só o nome neutralizado', async () => {
    const { owner, member, p, build, privacyService } = await raceSetup(
      'Pessoa Anonimização Antes'
    );
    const report = await requested(p, owner);
    const anonymization = await pauseAnonymization();
    const deletion = privacyService.processDueDeletions({ dryRun: false });
    await anonymization.reached;
    const completion = executeProjectReport(report.id, { build });
    await pause(300);
    expect((await stored(report.id)).status).toBe('RUNNING');
    anonymization.release();
    expect(await deletion).toMatchObject({ processed: 1, failed: 0 });
    expect(await completion).toMatchObject({ status: 'SUCCEEDED' });
    vi.restoreAllMocks();
    await expectNeutralized({ p, report, owner, member, formerName: 'Pessoa Anonimização Antes' });
  });

  it('solicitante anonimizado durante a solicitação fica só com o nome neutralizado', async () => {
    const { member, p, privacyService } = await raceSetup('Solicitante em Corrida');
    const anonymization = await pauseAnonymization();
    const deletion = privacyService.processDueDeletions({ dryRun: false });
    await anonymization.reached;
    const request = reportService.request(
      p.id,
      {},
      { actorUserId: member.id, requestId: 'race-request' },
      { schedule: noSchedule }
    );
    await pause(80);
    anonymization.release();
    expect(await deletion).toMatchObject({ processed: 1, failed: 0 });
    const { report } = await request;
    vi.restoreAllMocks();
    const row = await stored(report.id);
    expect(row.people).toEqual([
      expect.objectContaining({ userId: member.id, displayNameSnapshot: 'Usuário excluído' })
    ]);
    expect(JSON.stringify(report)).not.toContain('Solicitante em Corrida');
  });

  it('exportação pessoal traz só os metadados dos relatórios solicitados', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner, {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timeZone: 'UTC'
    });
    await executeProjectReport(report.id);
    const { settingsRepository } =
      await import('../../src/modules/settings/settings.repository.js');
    const [exported] = (await settingsRepository.exportData(owner.id)).requestedProjectReports;
    expect(exported).toMatchObject({
      id: report.id,
      projectId: p.id,
      status: 'SUCCEEDED',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timeZone: 'UTC',
      sprintId: null
    });
    expect(exported).not.toHaveProperty('snapshot');
  });

  it('retenção remove só gerações FAILED antigas e encerradas', async () => {
    const owner = await user();
    const p = await project(owner);
    const now = new Date('2026-10-14T12:00:00.000Z');
    const daysAgo = (days) => new Date(now.getTime() - days * 86400000);
    const make = (data) =>
      prisma.projectReport.create({
        data: {
          projectId: p.id,
          requestedByUserId: owner.id,
          people: {
            create: [{ userId: owner.id, displayNameSnapshot: 'X', usernameSnapshot: 'x' }]
          },
          ...data
        }
      });
    const oldFailed = await make({ status: 'FAILED', finishedAt: daysAgo(200), errorCode: 'E' });
    const recentFailed = await make({ status: 'FAILED', finishedAt: daysAgo(10), errorCode: 'E' });
    const oldSucceeded = await make({ status: 'SUCCEEDED', finishedAt: daysAgo(400) });
    const oldRunning = await make({
      status: 'RUNNING',
      activeProjectId: p.id,
      heartbeatAt: daysAgo(300),
      finishedAt: daysAgo(300)
    });
    const { runPrivacyRetention } =
      await import('../../src/shared/maintenance/privacy-retention.js');
    const configuration = {
      privacyRequestRetentionDays: 365,
      auditRetentionDays: 365,
      notificationRetentionDays: 180,
      reportFailedRetentionDays: 180
    };
    const dryRun = await runPrivacyRetention({ client: prisma, now, configuration });
    expect(dryRun.counts.failedProjectReports).toBe(1);
    expect(await prisma.projectReport.count()).toBe(4);
    await runPrivacyRetention({ client: prisma, now, configuration, apply: true });
    const remaining = await prisma.projectReport.findMany({
      select: { id: true },
      orderBy: { id: 'asc' }
    });
    expect(remaining.map((row) => row.id)).toEqual([
      recentFailed.id,
      oldSucceeded.id,
      oldRunning.id
    ]);
    expect(await prisma.projectReportPerson.count({ where: { reportId: oldFailed.id } })).toBe(0);
  });

  it('remoção física do projeto apaga relatórios e pessoas congeladas por cascata', async () => {
    const owner = await user();
    const p = await project(owner);
    const report = await requested(p, owner);
    await executeProjectReport(report.id);
    expect(await prisma.projectReportPerson.count()).toBe(1);
    await prisma.projectMembership.deleteMany({ where: { projectId: p.id } });
    await prisma.project.delete({ where: { id: p.id } });
    expect(await prisma.projectReport.count()).toBe(0);
    expect(await prisma.projectReportPerson.count()).toBe(0);
  });
});

describe('S2-07 — exportação em PDF: falhas, auditoria e privacidade', () => {
  const pdfAudits = (id) =>
    prisma.auditEvent.findMany({
      where: { resourceId: String(id), action: 'REPORT_PDF_EXPORTED' },
      orderBy: { id: 'asc' }
    });
  const context = (actor) => ({ actorUserId: actor.id, requestId: 'pdf-test' });

  async function ready(owner) {
    const p = await project(owner);
    const report = await requested(p, owner);
    await executeProjectReport(report.id);
    expect((await stored(report.id)).status).toBe('SUCCEEDED');
    return { p, report };
  }

  it('falha ao montar o PDF não entrega arquivo, não expõe detalhe e fica auditada', async () => {
    const owner = await user();
    const { p, report } = await ready(owner);
    const render = vi.fn().mockRejectedValue(new Error('detalhe interno do pdfkit'));
    const failure = await reportService
      .exportPdf(p.id, report.id, {}, context(owner), { render })
      .catch((error) => error);
    expect(failure).toMatchObject({ code: 'REPORT_PDF_FAILED', statusCode: 500 });
    expect(failure.message).not.toContain('pdfkit');
    expect(render).toHaveBeenCalledOnce();
    expect((await pdfAudits(report.id)).map((event) => [event.result, event.reasonCode])).toEqual([
      ['FAILURE', 'REPORT_PDF_FAILED']
    ]);
  });

  it('servidor ocupado devolve 503 controlado e audita a tentativa', async () => {
    const owner = await user();
    const { p, report } = await ready(owner);
    const busy = Object.assign(new Error('ocupado'), { code: 'REPORT_PDF_BUSY', statusCode: 503 });
    await expect(
      reportService.exportPdf(p.id, report.id, {}, context(owner), {
        render: vi.fn().mockRejectedValue(busy)
      })
    ).rejects.toBe(busy);
    expect((await pdfAudits(report.id)).map((event) => event.reasonCode)).toEqual([
      'REPORT_PDF_BUSY'
    ]);
  });

  it('sem registro de auditoria o arquivo não é entregue', async () => {
    const owner = await user();
    const { p, report } = await ready(owner);
    const { auditService } = await import('../../src/modules/audit/index.js');
    vi.spyOn(auditService, 'record').mockRejectedValue(new Error('auditoria indisponível'));
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7'));
    await expect(
      reportService.exportPdf(p.id, report.id, {}, context(owner), { render })
    ).rejects.toThrow('auditoria indisponível');
    expect(render).toHaveBeenCalledOnce();
  });

  it('o PDF usa o nome congelado e, após anonimização, só o nome neutralizado', async () => {
    const owner = await user('Dona do projeto');
    const member = await user('Pessoa Exportada');
    const p = await project(owner);
    await prisma.projectMembership.create({
      data: { projectId: p.id, userId: member.id, role: 'MEMBER' }
    });
    const report = await requested(p, member);
    await executeProjectReport(report.id);
    const { extractText, getDocumentProxy } = await import('unpdf');
    const text = async () => {
      const { buffer } = await reportService.exportPdf(p.id, report.id, {}, context(owner));
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      return (await extractText(pdf, { mergePages: true })).text.replace(/\s+/g, ' ');
    };
    await prisma.user.update({ where: { id: member.id }, data: { name: 'Nome Trocado' } });
    const before = await text();
    expect(before).toContain('Pessoa Exportada');
    expect(before).not.toContain('Nome Trocado');

    await prisma.privacyRequest.create({
      data: { userId: member.id, type: 'ACCOUNT_DELETION', scheduledFor: new Date(Date.now() - 1) }
    });
    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    await privacyService.processDueDeletions({ dryRun: false });
    const after = await text();
    expect(after).toContain('Usuário excluído');
    expect(after).not.toContain('Pessoa Exportada');
    expect(after).not.toContain(member.username);
  });

  it('relatório apagado junto com o projeto não pode mais ser exportado', async () => {
    const owner = await user();
    const { p, report } = await ready(owner);
    await prisma.project.delete({ where: { id: p.id } });
    await expect(
      reportService.exportPdf(p.id, report.id, {}, context(owner))
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
