import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainError, ValidationError } from '../../src/shared/errors/index.js';
import { isTransientDataSourceError } from '../../src/modules/indicators/policies/data-source-error.policy.js';
import { createIndicatorReadContext } from '../../src/modules/indicators/indicator-read-context.js';
import { planDashboardReads } from '../../src/modules/indicators/dashboard-read.plan.js';
import { DASHBOARD_VIEWS } from '../../src/modules/indicators/dashboard-view.catalog.js';
import { indicatorsRepository } from '../../src/modules/indicators/indicators.repository.js';
import { prisma } from '../../src/database/prismaClient.js';

afterEach(() => vi.restoreAllMocks());

const prismaError = (code, message = 'Infrastructure failure') =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: '6.12.0' });

describe('isolable source failures', () => {
  it.each(['P2024', 'P2034'])('accepts real Prisma %s failures', (code) => {
    expect(isTransientDataSourceError(prismaError(code))).toBe(true);
  });
  it('isolates P2028 expiration/acquisition, but preserves transaction API misuse', () => {
    for (const message of [
      'Unable to start a transaction in the given time.',
      'A query cannot be executed on an expired transaction.'
    ])
      expect(isTransientDataSourceError(prismaError('P2028', message))).toBe(true);
    expect(
      isTransientDataSourceError(
        prismaError('P2028', 'Transaction not found. Invalid transaction ID.')
      )
    ).toBe(false);
  });
  it.each([
    new TypeError('bug'),
    new Error('unknown'),
    new DomainError('domain'),
    new ValidationError('validation'),
    prismaError('P2002'),
    Object.assign(new Error('spoof'), { code: 'P2024' })
  ])('does not hide functional errors: %s', (error) => {
    expect(isTransientDataSourceError(error)).toBe(false);
  });
});

describe('request-owned reads and calculations', () => {
  it('shares the same promise/result; a new request reads again', async () => {
    const load = vi.fn().mockResolvedValue({ tasks: [1] });
    const context = createIndicatorReadContext();
    const first = context.read('taskHistory', load);
    expect(context.read('taskHistory', load)).toBe(first);
    await expect(first).resolves.toEqual({ tasks: [1] });
    expect(load).toHaveBeenCalledOnce();
    await createIndicatorReadContext().read('taskHistory', load);
    expect(load).toHaveBeenCalledTimes(2);
    const calculate = vi.fn(() => ({ value: 10 }));
    expect(context.calculate('coverage', calculate)).toBe(context.calculate('coverage', calculate));
    expect(calculate).toHaveBeenCalledOnce();
  });
  it('retains a rejection and deduplicates warnings without retrying', async () => {
    const error = prismaError('P2024');
    const load = vi.fn().mockRejectedValue(error);
    const context = createIndicatorReadContext();
    await expect(context.read('history', load)).rejects.toBe(error);
    await expect(context.read('history', load)).rejects.toBe(error);
    context.unavailable(error, 'taskHistory');
    context.unavailable(error, 'taskHistory');
    expect(load).toHaveBeenCalledOnce();
    expect(context.warnings()).toEqual([{ source: 'taskHistory', code: 'SOURCE_UNAVAILABLE' }]);
    expect(() => context.unavailable(new TypeError('bug'), 'taskHistory')).toThrow(TypeError);
  });
  it('shares a capability alias without scheduling another read, including rejection', async () => {
    const context = createIndicatorReadContext({ concurrency: 1 });
    const error = prismaError('P2024');
    const loader = vi.fn().mockRejectedValue(error);
    const facts = context.read('quality:window', loader);
    expect(context.shareRead('qualityCaseHealth', facts)).toBe(facts);
    await expect(facts).rejects.toBe(error);
    const fallback = vi.fn();
    await expect(context.read('qualityCaseHealth', fallback)).rejects.toBe(error);
    expect(loader).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(context.existingRead('qualityCaseHealth')).toBe(facts);
  });
  it('limits active source loaders to two', async () => {
    const context = createIndicatorReadContext();
    let active = 0,
      peak = 0;
    const releases = [];
    const requests = Array.from({ length: 5 }, (_, i) =>
      context.read(`source${i}`, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => releases.push(resolve));
        active--;
      })
    );
    for (let i = 0; i < 5; i++) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()();
    }
    await Promise.all(requests);
    expect(peak).toBe(2);
  });
});

describe('capability dependency plan', () => {
  const options = { period: {}, includeHealth: false, githubApplicable: true };
  it.each(['TASK', 'PLANNING'])('skips TaskMovement for %s without full Health', (view) => {
    const plan = planDashboardReads(DASHBOARD_VIEWS[view], options);
    expect(plan.has('taskHistory')).toBe(false);
    expect(plan.has('tasks')).toBe(true);
  });
  it('separates current count from history and avoids PERIOD_REQUIRED work', () => {
    const plan = planDashboardReads(DASHBOARD_VIEWS.FLOW, { ...options, period: null });
    expect([...plan.get('tasks')]).toEqual(['I23']);
    expect([...plan.get('taskHistory')]).toEqual(['I24']);
    expect(planDashboardReads([{ metricIds: ['I20'] }], { ...options, period: null }).size).toBe(0);
  });
  it('selects actual Health signals, excludes General-only widgets and inapplicable sources', () => {
    const plan = planDashboardReads([], {
      ...options,
      includeHealth: true,
      githubApplicable: false,
      sprintApplicable: false
    });
    const ids = [...plan.values()].flatMap((set) => [...set]);
    expect(ids).toContain('I26');
    expect(ids).toContain('I64');
    expect(ids).not.toEqual(expect.arrayContaining(['I23', 'I53', 'I46']));
    expect(plan.has('github')).toBe(false);
    expect(plan.has('sprints')).toBe(false);
    expect(ids).not.toContain('I66');
    expect(
      planDashboardReads([{ metricIds: ['I02'] }], {
        ...options,
        githubApplicable: false
      }).size
    ).toBe(0);
  });
});

describe('activity capability reads', () => {
  const period = { startInclusive: new Date('2026-09-01'), endExclusive: new Date('2026-10-01') };
  const transaction = () => {
    const tx = {
      project: { findFirst: vi.fn().mockResolvedValue({ id: 1 }) },
      gitBranch: { findFirst: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn().mockResolvedValue([])
    };
    vi.spyOn(prisma, '$transaction').mockImplementation((read) => read(tx));
    return tx;
  };
  it('does not read task completion history for commit-only activity', async () => {
    const tx = transaction();
    const facts = await indicatorsRepository.readActivity(1, period, ['I02']);
    expect(tx.gitBranch.findFirst).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(facts.taskRows).toEqual([]);
  });
  it('does not read GitHub branch membership for task-only activity', async () => {
    const tx = transaction();
    const facts = await indicatorsRepository.readActivity(1, period, ['I03']);
    expect(tx.gitBranch.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(facts.branch).toBeNull();
  });
});
