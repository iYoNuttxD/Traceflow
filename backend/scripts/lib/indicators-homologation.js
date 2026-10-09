import { createHash } from 'node:crypto';
import {
  canonicalizeLocalDatabaseHost,
  isProductionDatabase,
  sanitizedDatabaseTarget,
  validateTestDatabaseUrl
} from './database-safety.js';

export const HOMOLOGATION_PREFIX = '[P8.6B]';
export const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validateHomologationEnvironment(env, options) {
  if (!['development', 'test'].includes(env.NODE_ENV))
    throw Error('Exige NODE_ENV=development ou test explícito.');
  const target = sanitizedDatabaseTarget(env.DATABASE_URL);
  if (
    canonicalizeLocalDatabaseHost(target.host) !== 'local' ||
    isProductionDatabase(env.DATABASE_URL)
  )
    throw Error('Seed permitido somente em MySQL local não produtivo.');
  if (target.database !== options.database) throw Error('Schema diverge de --database.');
  if (env.NODE_ENV === 'development')
    validateTestDatabaseUrl(env.TEST_DATABASE_URL, env.DATABASE_URL);
  for (const field of ['projectId', 'actorId', 'completeSprintId', 'activateSprintId'])
    if (!Number.isSafeInteger(options[field]) || options[field] <= 0)
      throw Error(`ID explícito obrigatório: ${field}.`);
  if (options.completeSprintId === options.activateSprintId)
    throw Error('Sprints de conclusão e ativação devem ser distintas.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(options.anchor) ||
    Number.isNaN(Date.parse(options.anchor)) ||
    new Date(options.anchor).toISOString().slice(0, 10) !== options.anchor
  )
    throw Error('Anchor deve ser data civil ISO.');
  if (Date.parse(`${options.anchor}T15:00:00.000Z`) > Date.now())
    throw Error('Anchor não pode estar no futuro.');
  return target;
}

export function validateHomologationProject(project, options, membership) {
  if (
    !project ||
    project.deletedAt ||
    project.status !== 'ATIVO' ||
    project.name !== options.projectName ||
    !/artificial.*homologa|homologa.*artificial/i.test(project.description || '')
  )
    throw Error('Project não corresponde à identidade artificial de homologação confirmada.');
  if (
    !membership?.isActive ||
    membership.role !== 'OWNER' ||
    !membership.user?.isActive ||
    membership.user.accountStatus !== 'ACTIVE'
  )
    throw Error('Actor precisa ser OWNER ativo do projeto.');
}

// Clock belongs only to this standalone seed process. Facts are born through the
// domain at simulation time; no UPDATE backfill of createdAt/movedAt is performed.
export function installHomologationClock(prisma, models) {
  const NativeDate = globalThis.Date;
  let instant = null;
  class SeedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [instant ?? NativeDate.now()]));
    }
    static now() {
      return instant ?? NativeDate.now();
    }
  }
  const fields = new Map(
    models.map((model) => [
      model.name,
      model.fields
        .filter((f) => f.type === 'DateTime' && (f.isUpdatedAt || f.default?.name === 'now'))
        .map((f) => f.name)
    ])
  );
  prisma.$use(async (params, next) => {
    if (instant !== null && ['create', 'createMany'].includes(params.action)) {
      for (const row of [params.args.data].flat())
        for (const field of fields.get(params.model) ?? [])
          if (row[field] === undefined) row[field] = new NativeDate(instant);
    }
    return next(params);
  });
  globalThis.Date = SeedDate;
  return {
    at(value) {
      const next = new NativeDate(value).getTime();
      if (!Number.isFinite(next) || next > NativeDate.now())
        throw Error('O relógio de homologação não permite fatos futuros.');
      instant = next;
    },
    restore() {
      instant = null;
      globalThis.Date = NativeDate;
    }
  };
}

export function homologationDates(anchor) {
  const base = Date.parse(`${anchor}T15:00:00.000Z`);
  return (offset) => new Date(base + offset * 86400000);
}
