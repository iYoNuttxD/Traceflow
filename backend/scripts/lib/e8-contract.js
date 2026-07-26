import { resolve } from 'node:path';
import { auditE8Schema } from './e8-reconciliation.js';
import { detectLegacyRuntimeConsumers, legacyTableExists } from './e8-legacy-data.js';

async function dependentRelations(client, tableName) {
  if (!(await legacyTableExists(client, tableName))) return 0;
  const rows = await client.$queryRawUnsafe(
    'SELECT COUNT(*) AS total FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = ? AND TABLE_NAME <> ?',
    tableName,
    tableName
  );
  return Number(rows[0]?.total || 0);
}

function modelDecision({
  tablePresent,
  total,
  reconciled,
  exclusive,
  conflicts,
  consumers,
  dependencies,
  extraBlockers = 0
}) {
  const blockers = [];
  if (exclusive > 0) blockers.push('dados exclusivos');
  if (conflicts > 0) blockers.push('conflitos');
  if (extraBlockers > 0) blockers.push('registros não reconciliados');
  if (consumers > 0) blockers.push('consumidores ativos');
  if (dependencies > 0) blockers.push('relações dependentes');
  return {
    tablePresent,
    removable: !tablePresent || blockers.length === 0,
    totalRecords: total,
    reconciledRecords: reconciled,
    exclusiveRecords: exclusive,
    conflicts,
    activeConsumers: consumers,
    dependentRelations: dependencies,
    blockingReason: blockers.length > 0 ? blockers.join(', ') : null
  };
}

export function buildContractDecision({ audit, consumers, dependencies }) {
  const task = audit.taskPullRequests;
  const artifacts = audit.artifacts;
  const links = audit.traceLinks;
  return {
    taskPullRequest: modelDecision({
      tablePresent: task.tablePresent,
      total: task.totalRecords,
      reconciled: task.reconciled,
      exclusive: task.exclusiveRecords,
      conflicts: task.conflicts,
      consumers: consumers.taskPullRequest,
      dependencies: dependencies.taskPullRequest,
      extraBlockers: task.totalRecords - task.reconciled
    }),
    githubArtifact: modelDecision({
      tablePresent: artifacts.tablePresent,
      total: artifacts.examined,
      reconciled: artifacts.reconciled,
      exclusive: artifacts.exclusiveRecords,
      conflicts: artifacts.ambiguous,
      consumers: consumers.githubArtifact,
      dependencies: dependencies.githubArtifact,
      extraBlockers: artifacts.examined - artifacts.reconciled
    }),
    traceLink: modelDecision({
      tablePresent: links.tablePresent,
      total: links.examined,
      reconciled: links.reconciled,
      exclusive: links.exclusiveRecords,
      conflicts: links.conflicts,
      consumers: consumers.traceLink,
      dependencies: dependencies.traceLink,
      extraBlockers: links.examined - links.reconciled
    })
  };
}

export async function auditE8Contract({
  client,
  sourceRoot = resolve(process.cwd(), 'src'),
  consumers: suppliedConsumers
}) {
  const [audit, dependencyCounts] = await Promise.all([
    auditE8Schema({ client }),
    Promise.all(
      ['TaskPullRequest', 'GithubArtifact', 'TraceLink'].map((table) =>
        dependentRelations(client, table)
      )
    )
  ]);
  const consumers = suppliedConsumers || detectLegacyRuntimeConsumers(sourceRoot);
  const dependencies = {
    taskPullRequest: dependencyCounts[0],
    githubArtifact: dependencyCounts[1],
    traceLink: dependencyCounts[2]
  };
  const models = buildContractDecision({ audit, consumers, dependencies });
  return {
    allowed: Object.values(models).every((model) => model.removable),
    models
  };
}

export async function runE8Contract({ client, apply = false, sourceRoot, consumers }) {
  const before = await auditE8Contract({ client, sourceRoot, consumers });
  if (apply && !before.allowed) {
    const error = new Error(
      'Contract E8 bloqueado: existem dados, conflitos, consumidores ou dependências pendentes.'
    );
    error.code = 'E8_CONTRACT_BLOCKED';
    error.report = before;
    throw error;
  }
  if (apply) {
    await client.$transaction(async (tx) => {
      for (const table of ['TaskPullRequest', 'GithubArtifact', 'TraceLink']) {
        if (await legacyTableExists(tx, table))
          await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }
    });
  }
  return { mode: apply ? 'apply' : 'dry-run', before };
}
