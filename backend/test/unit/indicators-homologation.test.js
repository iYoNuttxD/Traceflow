import { describe, it, expect, vi } from 'vitest';
import {
  validateHomologationEnvironment,
  validateHomologationProject,
  installHomologationClock
} from '../../scripts/lib/indicators-homologation.js';
const options = {
  database: 'traceflow',
  projectId: 2,
  actorId: 1,
  completeSprintId: 14,
  activateSprintId: 15,
  anchor: '2026-09-28',
  projectName: 'TraceFlow'
};
const env = {
  NODE_ENV: 'development',
  DATABASE_URL: 'mysql://local@localhost:3306/traceflow',
  TEST_DATABASE_URL: 'mysql://local@localhost:3306/traceflow_test'
};
describe('homologation safety', () => {
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: undefined },
    { DATABASE_URL: 'mysql://local@remote:3306/traceflow' },
    { DATABASE_URL: 'mysql://local@localhost/production' },
    { TEST_DATABASE_URL: env.DATABASE_URL }
  ])('rejects unsafe environment %j', (patch) =>
    expect(() => validateHomologationEnvironment({ ...env, ...patch }, options)).toThrow()
  );
  it('requires explicit target IDs and schema', () => {
    expect(() => validateHomologationEnvironment(env, { ...options, database: 'other' })).toThrow();
    expect(() => validateHomologationEnvironment(env, { ...options, projectId: NaN })).toThrow();
  });
  it('requires the exact artificial project and an active owner', () => {
    const p = {
      name: 'TraceFlow',
      description: 'Projeto artificial para homologação',
      status: 'ATIVO'
    };
    const m = { role: 'OWNER', isActive: true, user: { isActive: true, accountStatus: 'ACTIVE' } };
    expect(() => validateHomologationProject(p, options, m)).not.toThrow();
    expect(() =>
      validateHomologationProject({ ...p, description: 'Real project' }, options, m)
    ).toThrow();
    expect(() => validateHomologationProject(p, options, { ...m, role: 'MEMBER' })).toThrow();
  });
});

it('rejects a same-day anchor whose 15:00Z facts are still in the future', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T11:00:00Z'));
  try {
    expect(() =>
      validateHomologationEnvironment(env, { ...options, anchor: '2026-10-09' })
    ).toThrow('futuro');
    expect(() =>
      validateHomologationEnvironment(env, { ...options, anchor: '2026-10-08' })
    ).not.toThrow();
    const clock = installHomologationClock({ $use() {} }, []);
    try {
      expect(() => clock.at('2026-10-09T15:00:00Z')).toThrow('futuros');
      clock.at('2026-10-08T15:00:00Z');
      expect(new Date().toISOString()).toBe('2026-10-08T15:00:00.000Z');
      expect(() => clock.at('invalid')).toThrow('futuros');
    } finally {
      clock.restore();
    }
  } finally {
    vi.useRealTimers();
  }
});
