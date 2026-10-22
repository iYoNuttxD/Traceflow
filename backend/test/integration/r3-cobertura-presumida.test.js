import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createIssue,
  createProject,
  createPullRequest,
  createTask
} from '../fixtures/factories.js';

const TIME_ZONE = 'America/Sao_Paulo';
const REGISTRY_START = new Date('2026-01-01T00:00:00.000Z');
const SECOND = 1000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const SOURCE_RULE =
  'completo até o início da última leitura completa menos a margem; o GitHub não garante a completude da listagem';

let prisma;
let createNotificationMetricsService;
let notificationMetricsRepository;
let serial = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ createNotificationMetricsService } =
    await import('../../src/modules/notifications/notification-metrics.service.js'));
  ({ notificationMetricsRepository } =
    await import('../../src/modules/notifications/notification-metrics.repository.js'));
  await cleanTestDatabase(prisma);
}, 60000);
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

const localDay = (instant) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(instant);
const shifted = (instant, offset) => new Date(instant.getTime() + offset);

async function coveredProject({ coverageFrom = shifted(new Date(), -30 * DAY) } = {}) {
  const project = await createProject(prisma);
  const task = await createTask(prisma, project.id);
  await prisma.gitHubEventCoverage.create({
    data: { projectId: project.id, coverageFrom, completeThrough: shifted(new Date(), 2 * DAY) }
  });
  return { project, task };
}

const link = (project, task, artifact, at) =>
  prisma.taskArtifactLinkPeriod.create({
    data: { projectId: project.id, taskId: task.id, ...artifact, linkedAt: shifted(at, -HOUR) }
  });

async function pullRequestAt(
  project,
  task,
  { mergedAt = null, closedAt = mergedAt, linked = true }
) {
  const pullRequest = await createPullRequest(prisma, project.id, {
    state: 'closed',
    closedAtGithub: closedAt,
    mergedAtGithub: mergedAt
  });
  if (linked) await link(project, task, { pullRequestId: pullRequest.id }, closedAt);
  return pullRequest;
}

async function closedIssueAt(project, task, closedAt) {
  const issue = await createIssue(prisma, project.id, {
    state: 'closed',
    closedAtGithub: closedAt
  });
  await link(project, task, { issueId: issue.id }, closedAt);
  return issue;
}

function lifecycle(table, project, artifact, eventType, occurredAt) {
  serial += 1;
  return prisma[table].create({
    data: {
      projectId: project.id,
      ...artifact,
      eventType,
      occurredAt,
      providerEventId: `r3-cobertura-${serial}`
    }
  });
}

const dispatched = (project, pullRequest, occurredAt) =>
  prisma.gitHubArtifactEvent.create({
    data: {
      projectId: project.id,
      type: 'PULL_REQUEST_MERGED',
      pullRequestId: pullRequest.id,
      artifactNumber: pullRequest.number,
      artifactTitle: pullRequest.title,
      occurredAt,
      detectedAt: occurredAt,
      linkedTaskCount: 1,
      occurrenceKey: `gh:r3-cobertura-${pullRequest.id}`,
      status: 'DISPATCHED',
      outcome: {
        tasks: 1,
        participants: 1,
        eligible: 1,
        created: 1,
        alreadyNotified: 0,
        excluded: {}
      }
    }
  });

const gap = (project, kind, number, expected, occurredAt) => ({
  motivo: 'LACUNA_DE_AQUISICAO',
  projeto: project.id,
  artefato: { tipo: kind, numero: number },
  esperado: expected,
  ocorridoEm: occurredAt.toISOString()
});

async function requirements(projectId, from) {
  const report = await createNotificationMetricsService({
    repository: {
      ...notificationMetricsRepository,
      registryStarts: async () => ({
        decisions: REGISTRY_START,
        githubEvents: REGISTRY_START,
        issueLinks: REGISTRY_START
      })
    }
  }).compute({ from: localDay(from), to: localDay(new Date()), projectId, timeZone: TIME_ZONE });
  return report.requisitos;
}

describe('TF-REV-002 — cobertura presumida e conferência da aquisição (ADR-023 D7, D8)', () => {
  it('C-01 o RF60 e o RF61 declaram a cobertura presumida, a margem e a regra; os demais não', async () => {
    const { project } = await coveredProject();

    const requisitos = await requirements(project.id, new Date());

    for (const rf of ['RF60', 'RF61'])
      expect(requisitos[rf].coberturaDaFonte, rf).toEqual({
        tipo: 'PRESUMIDA',
        margemMinutos: 5,
        regra: SOURCE_RULE
      });
    for (const rf of ['RF30', 'RF59', 'RF60_ASSOCIACAO'])
      expect(requisitos[rf], rf).not.toHaveProperty('coberturaDaFonte');
  });

  it('C-02 retrato no trecho coberto sem o evento gravado vira lacuna de aquisição do RF do artefato', async () => {
    const { project, task } = await coveredProject();
    const closedAt = shifted(new Date(), -3 * HOUR);
    const mergedAt = shifted(new Date(), -2 * HOUR);
    const closed = await pullRequestAt(project, task, { closedAt });
    const merged = await pullRequestAt(project, task, { mergedAt });
    const issue = await closedIssueAt(project, task, closedAt);
    await lifecycle(
      'pullRequestLifecycleEvent',
      project,
      { pullRequestId: merged.id },
      'MERGED',
      shifted(mergedAt, 5 * SECOND + 1)
    );

    const requisitos = await requirements(project.id, closedAt);

    expect(requisitos.RF61.lacunas).toEqual([
      gap(project, 'PULL_REQUEST', closed.number, 'CLOSED', closedAt),
      gap(project, 'PULL_REQUEST', merged.number, 'MERGED', mergedAt)
    ]);
    expect(requisitos.RF60.lacunas).toEqual([
      gap(project, 'ISSUE', issue.number, 'CLOSED', closedAt)
    ]);
    expect(requisitos.RF60_ASSOCIACAO.lacunas).toEqual([]);
  });

  it('C-03 a lacuna tira a cobertura total do RF61, e as contagens continuam', async () => {
    const { project, task } = await coveredProject();
    const mergedAt = shifted(new Date(), -2 * HOUR);
    const observed = await pullRequestAt(project, task, { mergedAt });
    await lifecycle(
      'pullRequestLifecycleEvent',
      project,
      { pullRequestId: observed.id },
      'MERGED',
      mergedAt
    );
    await dispatched(project, observed, mergedAt);
    const missing = await pullRequestAt(project, task, { mergedAt: shifted(mergedAt, HOUR) });

    const { RF61 } = await requirements(project.id, mergedAt);

    expect(RF61).toMatchObject({ eventos: 1, ocorridos: 1, enviadasCorretamente: 1 });
    expect(RF61.lacunas.map((item) => item.artefato.numero)).toEqual([missing.number]);
    expect(RF61.coberturaTotal).toMatchObject({
      valor: null,
      situacao: 'INDISPONIVEL',
      motivo: 'LACUNA_DE_AQUISICAO'
    });
  });

  it('C-04 sem lacuna nada muda: evento a até 5 s, artefato sem vínculo e retrato antes da cobertura não contam', async () => {
    const coverageFrom = shifted(new Date(), -4 * HOUR);
    const { project, task } = await coveredProject({ coverageFrom });
    const mergedAt = shifted(new Date(), -2 * HOUR);
    const observed = await pullRequestAt(project, task, { mergedAt });
    await lifecycle(
      'pullRequestLifecycleEvent',
      project,
      { pullRequestId: observed.id },
      'MERGED',
      shifted(mergedAt, 5 * SECOND)
    );
    await dispatched(project, observed, mergedAt);
    await pullRequestAt(project, task, { mergedAt: shifted(mergedAt, HOUR), linked: false });
    await pullRequestAt(project, task, { mergedAt: shifted(coverageFrom, -HOUR) });
    const issue = await closedIssueAt(project, task, mergedAt);
    await lifecycle(
      'issueLifecycleEvent',
      project,
      { issueId: issue.id },
      'CLOSED',
      shifted(mergedAt, -2 * SECOND)
    );

    const { RF60, RF61 } = await requirements(project.id, shifted(coverageFrom, -HOUR));

    expect(RF60.lacunas).toEqual([]);
    expect(RF61.lacunas).toEqual([]);
    expect(RF61.coberturaTotal).toMatchObject({ valor: 100, situacao: 'CALCULADA' });
  });
});
