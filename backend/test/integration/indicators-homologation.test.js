import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { configureTestDatabaseEnvironment, cleanTestDatabase } from '../helpers/test-database.js';
import { runHomologationSeed } from '../../scripts/seed-indicators-homologation.js';
import {
  homologationDates,
  installHomologationClock,
  fingerprint
} from '../../scripts/lib/indicators-homologation.js';
let prisma, directory;
beforeAll(async () => {
  configureTestDatabaseEnvironment();
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  directory = await mkdtemp(join(tmpdir(), 'traceflow-p86b-test-'));
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
  await rm(directory, { recursive: true, force: true });
});
it('creates canonical varied history, freezes normally, and reruns without any write', async () => {
  const { sprintService } = await import('../../src/modules/sprints/sprint.service.js');
  const { dashboardService } = await import('../../src/modules/indicators/dashboard.service.js');
  const anchor = '2026-09-28',
    day = homologationDates(anchor);
  const user = await prisma.user.create({
    data: {
      name: 'Seed test',
      username: 'seed_p86b',
      email: 'seed_p86b@example.invalid',
      passwordHash: 'test-only',
      emailVerifiedAt: new Date()
    }
  });
  const project = await prisma.project.create({
    data: {
      name: 'Seed test',
      description: 'Projeto artificial para homologação',
      responsibleTeam: 'QA',
      accessCode: 'P86B',
      memberships: { create: { userId: user.id, role: 'OWNER' } }
    }
  });
  await prisma.commit.create({
    data: {
      projectId: project.id,
      hash: 'a'.repeat(40),
      date: day(-50),
      message: 'Test fixture reference'
    }
  });
  const active = await sprintService.createSprint(
    project.id,
    { name: 'Current', startDate: day(-13).toISOString(), endDate: day(-1).toISOString() },
    { actorUserId: user.id }
  );
  const next = await sprintService.createSprint(
    project.id,
    { name: 'Next', startDate: day(1).toISOString(), endDate: day(14).toISOString() },
    { actorUserId: user.id }
  );
  const clock = installHomologationClock(prisma, Prisma.dmmf.datamodel.models);
  clock.at(day(-12));
  try {
    await sprintService.updateSprintStatus(active.id, 'EM_ANDAMENTO', { actorUserId: user.id });
  } finally {
    clock.restore();
  }
  const options = {
    projectId: project.id,
    actorId: user.id,
    completeSprintId: active.id,
    activateSprintId: next.id,
    projectName: 'Seed test',
    anchor,
    database: new URL(process.env.DATABASE_URL).pathname.slice(1),
    apply: true,
    journalPath: join(directory, 'journal.json')
  };
  const first = await runHomologationSeed(options, { prisma, log: () => {} });
  expect(first.after).toMatchObject({
    tasks: 25,
    requirements: 4,
    sprints: 4,
    cases: 8,
    defects: 4
  });
  expect(first.after.movements).toBeGreaterThan(45);
  const states = await prisma.defect.groupBy({ by: ['status'], where: { projectId: project.id } });
  expect(states.map((r) => r.status).sort()).toEqual([
    'ABERTO',
    'AGUARDANDO_RETESTE',
    'EM_CORRECAO',
    'VALIDADO'
  ]);
  const current = await prisma.sprint.findUnique({ where: { id: next.id } });
  expect(current.status).toBe('EM_ANDAMENTO');
  const dashboard = await dashboardService.read(project.id, {
    view: 'SPRINT',
    sprintId: first.generated.historicSprints[0]
  });
  const metric = Object.fromEntries(
    dashboard.sections.flatMap((s) => s.indicators).map((i) => [i.metricId, i])
  );
  expect(metric.I45.points.length).toBeGreaterThanOrEqual(7);
  expect(metric.I46.points.length).toBeGreaterThanOrEqual(7);
  expect(metric.I47.points.length).toBe(3);
  const flow = await dashboardService.read(project.id, {
    view: 'FLOW',
    startDate: '2026-09-15',
    endDate: '2026-09-28',
    timeZone: 'UTC',
    includeProjectHealth: true
  });
  expect(
    flow.sections.flatMap((s) => s.indicators).find((i) => i.metricId === 'I21').eligibleCount
  ).toBeGreaterThanOrEqual(6);
  const closed = await dashboardService.read(project.id, {
    view: 'FLOW',
    startDate: '2026-09-22',
    endDate: '2026-09-27',
    timeZone: 'UTC',
    includeProjectHealth: true
  });
  const cycle = closed.sections.flatMap((s) => s.indicators).find((i) => i.metricId === 'I21');
  expect(cycle.kind).toBe('SERIES');
  expect(cycle.points).toHaveLength(6);
  expect(cycle.points.reduce((n, point) => n + point.eligibleCount, 0)).toBe(cycle.eligibleCount);
  expect(cycle.assessment.reference).toMatchObject({
    type: 'PROJECT_BASELINE',
    unit: 'DAYS',
    value: 1
  });
  expect(cycle.assessment.delta.value).toBeGreaterThan(0);
  const rows = () =>
    prisma.taskMovement.findMany({ where: { projectId: project.id }, orderBy: { id: 'asc' } });
  const before = fingerprint(await rows());
  const journalBefore = await readFile(options.journalPath, 'utf8');
  const second = await runHomologationSeed(options, { prisma, log: () => {} });
  expect(second.after).toEqual(first.after);
  expect(fingerprint(await rows())).toBe(before);
  expect(await readFile(options.journalPath, 'utf8')).toBe(journalBefore);
}, 60000);
