import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma, app;
let serial = 0;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const PERIOD = { startDate: '2026-09-01', endDate: '2026-09-30', timeZone: 'America/Sao_Paulo' };
const TERMINAL = ['SUCCEEDED', 'FAILED'];

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
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

async function actor(name) {
  const n = ++serial;
  const user = await prisma.user.create({
    data: {
      name: name ?? `Relator ${n}`,
      username: `relator_${n}`,
      email: `relator_${n}@example.invalid`,
      emailVerifiedAt: new Date()
    }
  });
  const token = `report-${n}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      csrfTokenHash: hash('report-csrf'),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  const { authService } = await import('../../src/modules/auth/auth.service.js');
  return { ...user, token, csrf: authService.csrfToken({ tokenHash: hash(token) }) };
}

async function project(owner, name = 'Projeto do relatório') {
  return prisma.project.create({
    data: {
      name,
      responsibleTeam: 'QA',
      accessCode: `REL-${++serial}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
}

const join = (p, user, role) =>
  prisma.projectMembership.create({ data: { projectId: p.id, userId: user.id, role } });

function call(user, method, path) {
  let req = request(app)[method](`/api${path}`);
  if (user)
    req = req.set('Cookie', `traceflow_session=${user.token}`).set('X-CSRF-Token', user.csrf);
  return req;
}

async function waitForReport(user, projectId, reportId) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await call(user, 'get', `/projects/${projectId}/reports/${reportId}`);
    if (TERMINAL.includes(response.body.report?.status)) return response.body.report;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('A geração não terminou a tempo.');
}

async function seed(p, owner) {
  const requirements = [];
  for (const title of ['RF01 Cadastro', 'RF02 Login', 'RF03 Relatórios'])
    requirements.push(await prisma.requirement.create({ data: { projectId: p.id, title } }));
  const sprint = await prisma.sprint.create({
    data: {
      projectId: p.id,
      name: 'Sprint 1',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      status: 'EM_ANDAMENTO',
      startedAt: new Date('2026-09-01T12:00:00.000Z'),
      planningSnapshotAt: new Date('2026-09-01T12:00:00.000Z')
    }
  });
  const statuses = ['CONCLUIDO', 'CONCLUIDO', 'EM_ANDAMENTO', 'A_FAZER'];
  for (const [index, status] of statuses.entries()) {
    const task = await prisma.task.create({
      data: {
        projectId: p.id,
        title: `Tarefa ${index + 1}`,
        status,
        estimatedEffort: index + 1,
        requirementId: requirements[index % requirements.length].id,
        responsibleUserId: owner.id,
        sprintId: sprint.id
      }
    });
    await prisma.sprintTask.create({
      data: {
        projectId: p.id,
        sprintId: sprint.id,
        taskId: task.id,
        taskTitleSnapshot: task.title,
        addedAt: new Date('2026-09-01T12:00:00.000Z'),
        plannedAtStart: true,
        pointsAtPlanning: index + 1
      }
    });
  }
  return { requirements, sprint };
}

describe('S2-06 — autorização e escopo', () => {
  it('exige sessão para gerar e ler', async () => {
    const owner = await actor();
    const p = await project(owner);
    expect((await call(null, 'post', `/projects/${p.id}/reports`).send({})).status).toBe(401);
    expect((await call(null, 'get', `/projects/${p.id}/reports`)).status).toBe(401);
  });

  it('não membro recebe 404; VIEWER lê mas não gera; MEMBER gera', async () => {
    const owner = await actor();
    const viewer = await actor();
    const member = await actor();
    const outsider = await actor();
    const p = await project(owner);
    await join(p, viewer, 'VIEWER');
    await join(p, member, 'MEMBER');

    const denied = await call(outsider, 'post', `/projects/${p.id}/reports`).send({});
    expect(denied.status).toBe(404);
    expect(denied.body.code).toBe('RESOURCE_NOT_FOUND');
    expect((await call(outsider, 'get', `/projects/${p.id}/reports`)).status).toBe(404);

    const forbidden = await call(viewer, 'post', `/projects/${p.id}/reports`).send({});
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    expect((await call(viewer, 'get', `/projects/${p.id}/reports`)).status).toBe(200);

    const created = await call(member, 'post', `/projects/${p.id}/reports`).send({});
    expect(created.status).toBe(202);
    const done = await waitForReport(viewer, p.id, created.body.report.id);
    expect(done.status).toBe('SUCCEEDED');
    expect(await prisma.projectReport.count()).toBe(1);
  });

  it('relatório de outro projeto responde o mesmo 404 de um ID inexistente', async () => {
    const owner = await actor();
    const a = await project(owner, 'A');
    const b = await project(owner, 'B');
    const report = await prisma.projectReport.create({
      data: { projectId: b.id, requestedByUserId: owner.id, status: 'FAILED', errorCode: 'X' }
    });
    const foreign = await call(owner, 'get', `/projects/${a.id}/reports/${report.id}`);
    const missing = await call(owner, 'get', `/projects/${a.id}/reports/${report.id + 999}`);
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body.code).toBe(missing.body.code);
    expect(foreign.body.message).toBe(missing.body.message);
  });

  it('projeto excluído logicamente não aceita geração nem leitura', async () => {
    const owner = await actor();
    const p = await project(owner);
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await call(owner, 'post', `/projects/${p.id}/reports`).send({})).status).toBe(404);
    expect((await call(owner, 'get', `/projects/${p.id}/reports`)).status).toBe(404);
  });
});

describe('S2-06 — validação do recorte', () => {
  it('recusa período incompleto, longo demais e Sprint de outro projeto', async () => {
    const owner = await actor();
    const p = await project(owner);
    const other = await project(owner, 'Outro');
    const foreignSprint = await prisma.sprint.create({
      data: {
        projectId: other.id,
        name: 'Alheia',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2026-09-10T00:00:00.000Z')
      }
    });
    const incomplete = await call(owner, 'post', `/projects/${p.id}/reports`).send({
      startDate: '2026-09-01'
    });
    expect(incomplete.status).toBe(400);
    const tooLong = await call(owner, 'post', `/projects/${p.id}/reports`).send({
      startDate: '2025-01-01',
      endDate: '2026-02-01',
      timeZone: 'UTC'
    });
    expect(tooLong.status).toBe(400);
    const sprint = await call(owner, 'post', `/projects/${p.id}/reports`).send({
      sprintId: foreignSprint.id
    });
    expect(sprint.status).toBe(404);
    expect(sprint.body.code).toBe('SPRINT_NOT_FOUND');
    expect(await prisma.projectReport.count()).toBe(0);
  });
});

describe('S2-06 — geração em segundo plano', () => {
  it('gera as três seções, congela o solicitante e audita pedido e conclusão', async () => {
    const owner = await actor('Gabriel Original');
    const p = await project(owner);
    const { sprint } = await seed(p, owner);
    const created = await call(owner, 'post', `/projects/${p.id}/reports`).send({
      ...PERIOD,
      sprintId: sprint.id
    });
    expect(created.status).toBe(202);
    expect(created.body.alreadyRunning).toBe(false);
    expect(created.body.report).toMatchObject({
      status: 'QUEUED',
      filters: { ...PERIOD, sprintId: sprint.id },
      requestedBy: { userId: owner.id, displayName: 'Gabriel Original', username: owner.username }
    });

    const report = await waitForReport(owner, p.id, created.body.report.id);
    expect(report.status).toBe('SUCCEEDED');
    expect(report.error).toBeNull();
    expect(report.snapshot.schemaVersion).toBe(1);
    expect(report.snapshot.project).toEqual({ id: p.id, name: p.name });
    expect(report.snapshot.filters).toMatchObject({ ...PERIOD, sprintId: sprint.id });
    expect(report.snapshot.filters.sprint).toMatchObject({ id: sprint.id, name: 'Sprint 1' });
    expect(report.snapshot.planning.sprints.map((item) => item.id)).toEqual([sprint.id]);
    expect(report.snapshot.planning.sprints[0].progress.burndown).toBeDefined();
    expect(report.snapshot.traceability.items).toHaveLength(3);
    expect(report.snapshot.indicators.views.map((view) => view.view)).toEqual([
      'GENERAL',
      'PLANNING',
      'GITHUB',
      'FLOW',
      'SPRINT',
      'TASK',
      'QUALITY',
      'TRACEABILITY'
    ]);
    expect(report.snapshot.indicators.catalog.length).toBeGreaterThan(10);
    expect(JSON.stringify(report.snapshot)).not.toContain('Gabriel Original');
    expect(report.people).toEqual([
      { userId: owner.id, displayName: 'Gabriel Original', username: owner.username }
    ]);

    const audits = await prisma.auditEvent.findMany({
      where: { resourceType: 'ProjectReport', resourceId: String(report.id) },
      orderBy: { id: 'asc' }
    });
    expect(audits.map((event) => [event.action, event.result, event.actorUserId])).toEqual([
      ['REPORT_REQUESTED', 'SUCCESS', owner.id],
      ['REPORT_GENERATED', 'SUCCESS', owner.id]
    ]);
    expect(audits[0].metadataJson).toEqual({ scope: 'PERIOD', sprintId: sprint.id });
  });

  it('nome trocado depois não altera o relatório: o nome da geração fica congelado', async () => {
    const owner = await actor('Nome Antigo');
    const p = await project(owner);
    await seed(p, owner);
    const created = await call(owner, 'post', `/projects/${p.id}/reports`).send({});
    const report = await waitForReport(owner, p.id, created.body.report.id);
    await prisma.user.update({ where: { id: owner.id }, data: { name: 'Nome Fraudado' } });

    const again = await call(owner, 'get', `/projects/${p.id}/reports/${report.id}`);
    expect(again.body.report.requestedBy.displayName).toBe('Nome Antigo');
    expect(again.body.report.people[0].displayName).toBe('Nome Antigo');
    const list = await call(owner, 'get', `/projects/${p.id}/reports`);
    expect(list.body.items[0].requestedBy.displayName).toBe('Nome Antigo');
  });

  it('pedido durante uma geração ativa devolve a mesma geração, sem criar outra', async () => {
    const owner = await actor();
    const p = await project(owner);
    const active = await prisma.projectReport.create({
      data: {
        projectId: p.id,
        requestedByUserId: owner.id,
        activeProjectId: p.id,
        status: 'RUNNING',
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    });
    const response = await call(owner, 'post', `/projects/${p.id}/reports`).send({});
    expect(response.status).toBe(202);
    expect(response.body.alreadyRunning).toBe(true);
    expect(response.body.report.id).toBe(active.id);
    expect(await prisma.projectReport.count()).toBe(1);
  });

  it('geração abandonada sem batimento vira FAILED ao consultar, e libera um novo pedido', async () => {
    const owner = await actor();
    const p = await project(owner);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const abandoned = await prisma.projectReport.create({
      data: {
        projectId: p.id,
        requestedByUserId: owner.id,
        activeProjectId: p.id,
        status: 'RUNNING',
        startedAt: old,
        heartbeatAt: old
      }
    });
    const list = await call(owner, 'get', `/projects/${p.id}/reports`);
    expect(list.body.items[0]).toMatchObject({
      id: abandoned.id,
      status: 'FAILED',
      error: { code: 'REPORT_GENERATION_STALE' }
    });
    const detail = await call(owner, 'get', `/projects/${p.id}/reports/${abandoned.id}`);
    expect(detail.body.report.snapshot).toBeNull();

    const created = await call(owner, 'post', `/projects/${p.id}/reports`).send({});
    expect(created.body.alreadyRunning).toBe(false);
    expect(created.body.report.id).not.toBe(abandoned.id);
    await waitForReport(owner, p.id, created.body.report.id);
    const failure = await prisma.auditEvent.findFirst({
      where: { resourceId: String(abandoned.id), action: 'REPORT_GENERATED' }
    });
    expect(failure).toMatchObject({ result: 'FAILURE', reasonCode: 'REPORT_GENERATION_STALE' });
  });

  it('lista paginada do mais recente para o mais antigo', async () => {
    const owner = await actor();
    const p = await project(owner);
    for (let index = 0; index < 3; index++)
      await prisma.projectReport.create({
        data: {
          projectId: p.id,
          requestedByUserId: owner.id,
          status: 'FAILED',
          errorCode: 'REPORT_GENERATION_FAILED',
          createdAt: new Date(Date.UTC(2026, 8, 1 + index))
        }
      });
    const first = await call(owner, 'get', `/projects/${p.id}/reports?page=1&limit=2`);
    expect(first.body.pagination).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(first.body.items.map((item) => item.createdAt.slice(0, 10))).toEqual([
      '2026-09-03',
      '2026-09-02'
    ]);
    const second = await call(owner, 'get', `/projects/${p.id}/reports?page=2&limit=2`);
    expect(second.body.items).toHaveLength(1);
  });
});

describe('S2-06 — números iguais aos das APIs para o mesmo recorte', () => {
  it('cada indicador do relatório coincide com o painel e a rastreabilidade com a aba', async () => {
    const owner = await actor();
    const p = await project(owner);
    const { sprint } = await seed(p, owner);
    const created = await call(owner, 'post', `/projects/${p.id}/reports`).send({ ...PERIOD });
    const report = await waitForReport(owner, p.id, created.body.report.id);
    expect(report.status).toBe('SUCCEEDED');

    const comparable = (indicator) => ({
      metricId: indicator.metricId,
      value: indicator.value,
      numerator: indicator.numerator,
      denominator: indicator.denominator,
      state: indicator.state,
      limitations: indicator.limitations,
      period: indicator.period
    });
    for (const view of report.snapshot.indicators.views) {
      const query = new URLSearchParams({ view: view.view, ...PERIOD });
      const api = await call(owner, 'get', `/projects/${p.id}/indicators/dashboard?${query}`);
      expect(api.status).toBe(200);
      const fromApi = api.body.sections.flatMap((section) => section.indicators.map(comparable));
      const fromReport = view.sections.flatMap((section) => section.indicators.map(comparable));
      expect(fromReport).toEqual(fromApi);
    }

    const traceability = await call(
      owner,
      'get',
      `/projects/${p.id}/traceability/requirements?limit=100`
    );
    expect(report.snapshot.traceability.summary).toEqual(traceability.body.summary);
    expect(report.snapshot.traceability.items).toEqual(traceability.body.items);

    const schedule = await call(
      owner,
      'get',
      `/projects/${p.id}/schedule?from=${PERIOD.startDate}&to=${PERIOD.endDate}`
    );
    expect(report.snapshot.planning.sprints.map((item) => item.id)).toEqual(
      schedule.body.sprints.map((item) => item.id)
    );
    const progress = await call(owner, 'get', `/sprints/${sprint.id}/progress`);
    expect(report.snapshot.planning.sprints[0].progress.burndown.days).toEqual(
      progress.body.burndown.days
    );
  });
});

describe('S2-06 — filtros da lista de relatórios', () => {
  async function seedReports() {
    const owner = await actor();
    const member = await actor();
    const p = await project(owner);
    await join(p, member, 'MEMBER');
    const { sprint } = await seed(p, owner);
    const make = (data) =>
      prisma.projectReport.create({
        data: { projectId: p.id, requestedByUserId: owner.id, status: 'SUCCEEDED', ...data }
      });
    const reports = {
      september: await make({ startDate: '2026-09-01', endDate: '2026-09-30', timeZone: 'UTC' }),
      october: await make({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        timeZone: 'UTC',
        sprintId: sprint.id,
        requestedByUserId: member.id
      }),
      allHistory: await make({ status: 'FAILED', errorCode: 'REPORT_TIMEOUT' }),
      running: await make({ status: 'RUNNING', activeProjectId: p.id, heartbeatAt: new Date() })
    };
    return { owner, member, p, sprint, reports };
  }

  async function ids(user, projectId, query) {
    const response = await call(user, 'get', `/projects/${projectId}/reports?${query}`);
    expect(response.status).toBe(200);
    return response.body.items.map((item) => item.id).sort((a, b) => a - b);
  }

  it('filtra por situação, Sprint, solicitante e período, com total do recorte filtrado', async () => {
    const { owner, member, p, sprint, reports } = await seedReports();
    const { september, october, allHistory, running } = reports;
    expect(await ids(owner, p.id, 'status=SUCCEEDED')).toEqual([september.id, october.id]);
    expect(await ids(owner, p.id, 'status=FAILED')).toEqual([allHistory.id]);
    expect(await ids(owner, p.id, 'status=ACTIVE')).toEqual([running.id]);
    expect(await ids(owner, p.id, `sprintId=${sprint.id}`)).toEqual([october.id]);
    expect(await ids(owner, p.id, 'sprintId=none')).toEqual([
      september.id,
      allHistory.id,
      running.id
    ]);
    expect(await ids(owner, p.id, `requestedByUserId=${member.id}`)).toEqual([october.id]);
    // Período: recortes com interseção; relatório sem período não entra.
    expect(await ids(owner, p.id, 'startDate=2026-09-15&endDate=2026-10-05')).toEqual([
      september.id,
      october.id
    ]);
    expect(await ids(owner, p.id, 'startDate=2026-10-10')).toEqual([october.id]);
    expect(await ids(owner, p.id, 'endDate=2026-09-01')).toEqual([september.id]);
    expect(await ids(owner, p.id, 'startDate=2026-11-01')).toEqual([]);
    const combined = await call(
      owner,
      'get',
      `/projects/${p.id}/reports?status=SUCCEEDED&startDate=2026-09-01&limit=1`
    );
    expect(combined.body.pagination).toMatchObject({ total: 2, limit: 1, totalPages: 2 });
    // O resumo descreve o projeto inteiro e não muda com os filtros da lista.
    const finishedAt = new Date('2026-10-02T10:00:00.000Z');
    await prisma.projectReport.update({ where: { id: september.id }, data: { finishedAt } });
    const expectedSummary = {
      total: 4,
      succeeded: 2,
      active: 1,
      failed: 1,
      latestSucceeded: { id: september.id, finishedAt: finishedAt.toISOString() }
    };
    expect(combined.body.summary).toMatchObject({ total: 4, succeeded: 2, active: 1, failed: 1 });
    for (const query of ['', 'status=FAILED', `sprintId=${sprint.id}`])
      expect((await call(owner, 'get', `/projects/${p.id}/reports?${query}`)).body.summary).toEqual(
        expectedSummary
      );
    const empty = await project(owner, 'Sem relatórios');
    expect((await call(owner, 'get', `/projects/${empty.id}/reports`)).body.summary).toEqual({
      total: 0,
      succeeded: 0,
      active: 0,
      failed: 0,
      latestSucceeded: null
    });
  });

  it('recusa filtros inválidos', async () => {
    const owner = await actor();
    const p = await project(owner);
    for (const query of [
      'status=RUNNING',
      'sprintId=abc',
      'requestedByUserId=0',
      'startDate=2026-13-01',
      'startDate=2026-09-30&endDate=2026-09-01',
      'responsavel=1'
    ])
      expect((await call(owner, 'get', `/projects/${p.id}/reports?${query}`)).status).toBe(400);
  });
});

const binary = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

function downloadPdf(user, projectId, reportId, query = '') {
  return call(user, 'get', `/projects/${projectId}/reports/${reportId}/pdf${query}`)
    .buffer(true)
    .parse(binary);
}

async function pdfText(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { totalPages, pages: text.map((page) => page.replace(/\s+/g, ' ')) };
}

describe('S2-07 — exportação do relatório em PDF', () => {
  it('VIEWER baixa o PDF do relatório pronto com os mesmos dados, e o download é auditado', async () => {
    const owner = await actor('Gestora Ação');
    const viewer = await actor();
    const p = await project(owner, 'Projeto Exportação Ágil');
    await join(p, viewer, 'VIEWER');
    await seed(p, owner);
    const created = await call(owner, 'post', `/projects/${p.id}/reports`).send({ ...PERIOD });
    const report = await waitForReport(owner, p.id, created.body.report.id);
    expect(report.status).toBe('SUCCEEDED');

    const response = await downloadPdf(viewer, p.id, report.id, '?timeZone=America/Sao_Paulo');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="traceflow-relatorio-${report.id}-projeto-exportacao-agil.pdf"`
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(response.headers['content-length'])).toBe(response.body.length);
    expect(response.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const { totalPages, pages } = await pdfText(response.body);
    pages.forEach((page, index) => {
      expect(page).toContain('TraceFlow · Projeto Exportação Ágil');
      expect(page).toContain('Período: 01/09/2026 a 30/09/2026');
      expect(page).toContain(`Relatório #${report.id} · Gerado em`);
      expect(page).toContain(`Página ${index + 1} de ${totalPages}`);
    });
    const text = pages.join(' ');
    expect(text).toContain('Gestora Ação (@');
    expect(text).toContain('Sprint 1');
    for (const item of report.snapshot.traceability.items) {
      expect(text).toContain(item.requirement.displayId);
      expect(text).toContain(item.requirement.title);
    }
    const progress = report.snapshot.indicators.views
      .find((view) => view.view === 'GENERAL')
      .sections.flatMap((section) => section.indicators)
      .find((indicator) => indicator.metricId === 'I01');
    expect(progress.state).toBe('AVAILABLE');
    expect(text).toContain(
      `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(progress.value)}%`
    );

    const audits = await prisma.auditEvent.findMany({
      where: { action: 'REPORT_PDF_EXPORTED', resourceId: String(report.id) }
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorUserId: viewer.id,
      projectId: p.id,
      result: 'SUCCESS',
      resourceType: 'ProjectReport',
      metadataJson: { format: 'PDF' }
    });
  });

  it('relatório na fila ou que falhou responde 409, sem arquivo nem auditoria de download', async () => {
    const owner = await actor();
    const p = await project(owner);
    for (const status of ['QUEUED', 'FAILED']) {
      const report = await prisma.projectReport.create({
        data: {
          projectId: p.id,
          requestedByUserId: owner.id,
          status,
          ...(status === 'QUEUED' ? { activeProjectId: p.id } : { errorCode: 'X' })
        }
      });
      const response = await downloadPdf(owner, p.id, report.id);
      expect(response.status).toBe(409);
      expect(JSON.parse(response.body.toString('utf8')).code).toBe('REPORT_NOT_READY');
      await prisma.projectReport.update({
        where: { id: report.id },
        data: { activeProjectId: null, status: 'FAILED' }
      });
    }
    expect(await prisma.auditEvent.count({ where: { action: 'REPORT_PDF_EXPORTED' } })).toBe(0);
  });

  it('sem sessão 401; não membro e relatório de outro projeto recebem o mesmo 404', async () => {
    const owner = await actor();
    const outsider = await actor();
    const a = await project(owner, 'A');
    const b = await project(owner, 'B');
    const report = await prisma.projectReport.create({
      data: { projectId: b.id, requestedByUserId: owner.id, status: 'SUCCEEDED', snapshot: {} }
    });
    expect((await downloadPdf(null, b.id, report.id)).status).toBe(401);
    const outside = await downloadPdf(outsider, b.id, report.id);
    const foreign = await downloadPdf(owner, a.id, report.id);
    const missing = await downloadPdf(owner, a.id, report.id + 999);
    expect([outside.status, foreign.status, missing.status]).toEqual([404, 404, 404]);
    const body = (response) => JSON.parse(response.body.toString('utf8'));
    expect(body(foreign).code).toBe(body(missing).code);
    expect(body(foreign).message).toBe(body(missing).message);
    expect(await prisma.auditEvent.count({ where: { action: 'REPORT_PDF_EXPORTED' } })).toBe(0);
  });

  it('recusa fuso inválido e parâmetros desconhecidos', async () => {
    const owner = await actor();
    const p = await project(owner);
    const report = await prisma.projectReport.create({
      data: { projectId: p.id, requestedByUserId: owner.id, status: 'FAILED', errorCode: 'X' }
    });
    expect((await downloadPdf(owner, p.id, report.id, '?timeZone=Marte/Base')).status).toBe(400);
    expect((await downloadPdf(owner, p.id, report.id, '?format=docx')).status).toBe(400);
  });
});
