import { testCaseRepository } from '../repositories/test-case.repository.js';
import { testExecutionRepository } from '../repositories/test-execution.repository.js';
import { testEvidenceStorage } from '../storage/local-test-evidence.storage.js';
import {
  assertVersion,
  calculateResult,
  executionSchema,
  executionSteps,
  fail,
  missing,
  parse,
  referenceSnapshot
} from '../test-case.schema.js';
import { authorize, audit } from './test-case.service.js';
import { executionDetail, executionSummary } from '../test-case.presenter.js';
import { cursorPage, cursorWhere } from '../test-case.cursor.js';
import { logger } from '../../../shared/logger/index.js';

async function cleanupAttempt(storage, attempt, committed) {
  try {
    await storage.cleanup(attempt, { committed });
  } catch (error) {
    if (!committed) throw error;
    logger.error('Falha ao limpar staging de evidência confirmada.', {
      event: 'test_evidence_cleanup_failed',
      errorCode: 'TEST_EVIDENCE_STORAGE_UNAVAILABLE'
    });
  }
}

export function createTestExecutionService({
  cases = testCaseRepository,
  executions = testExecutionRepository,
  storage = testEvidenceStorage
} = {}) {
  return {
    async record(id, input, attempt, context) {
      let committed = false;
      try {
        const data = parse(executionSchema, input);
        const current = await cases.find(id);
        if (!current) throw missing();
        await authorize(cases, current.projectId, context, true);
        const evidence = await storage.prepare(
          attempt,
          data.steps.map((s) => s.position)
        );
        const recorded = await cases.transaction(async (tx) => {
          const row = await tx.lock(id);
          if (!row) throw missing();
          const membership = await authorize(tx, row.projectId, context, true);
          assertVersion(row, data.testCaseVersion);
          if (row.status !== 'ATIVO')
            throw fail('Caso de teste inativo não pode ser executado.', 409, 'TEST_CASE_INACTIVE');
          const version = await tx.currentVersion(id, row.currentVersion);
          const steps = executionSteps(version.snapshotJson, data.steps);
          const ref = await tx.executions.reference(
            row.projectId,
            data.testedReference.type,
            data.testedReference.id
          );
          if (!ref) throw missing();
          const result = calculateResult(steps);
          const execution = await tx.executions.create(
            {
              projectId: row.projectId,
              testCaseId: id,
              testCaseVersionId: version.id,
              testCaseVersion: row.currentVersion,
              environment: data.environment,
              result,
              testedReferenceType: data.testedReference.type,
              testedPullRequestId: data.testedReference.type === 'PULL_REQUEST' ? ref.id : null,
              testedCommitId: data.testedReference.type === 'COMMIT' ? ref.id : null,
              testedReferenceSnapshot: referenceSnapshot(data.testedReference.type, ref),
              executedByUserId: context.actorUserId,
              executedByDisplayNameSnapshot: membership.user.name
            },
            steps
          );
          if (evidence.length)
            await tx.executions.addEvidence(
              evidence.map(({ position, ...item }) => ({
                ...item,
                projectId: row.projectId,
                executionId: execution.id,
                executionStepId: position
                  ? execution.steps.find((s) => s.position === position).id
                  : null,
                uploadedByUserId: context.actorUserId
              }))
            );
          await tx.audit(
            audit(context, row.projectId, execution.id, 'TEST_EXECUTION_RECORDED', {
              version: row.currentVersion,
              result,
              stepCount: steps.length,
              evidenceCount: evidence.length
            })
          );
          return executionDetail(await tx.executions.find(execution.id));
        });
        committed = true;
        return recorded;
      } finally {
        await cleanupAttempt(storage, attempt, committed);
      }
    },
    async detail(id, context) {
      const row = await executions.find(id);
      if (!row) throw missing();
      await authorize(cases, row.projectId, context);
      return executionDetail(row);
    },
    async list(id, q, context) {
      const row = await cases.find(id);
      if (!row) throw missing();
      await authorize(cases, row.projectId, context);
      const owner = `executions:${id}`;
      const page = cursorPage(
        await executions.page(id, cursorWhere(q.cursor, 'executedAt', owner), q.limit),
        q.limit,
        'executedAt',
        owner
      );
      return { ...page, items: page.items.map(executionSummary) };
    },
    async references(id, q, context) {
      const row = await cases.find(id);
      if (!row) throw missing();
      await authorize(cases, row.projectId, context);
      return {
        items: (await executions.candidates(id, row.projectId, q.search, q.limit)).map(
          ({ type, ref, relatedTaskIds }) => ({ ...referenceSnapshot(type, ref), relatedTaskIds })
        ),
        limit: q.limit
      };
    },
    async content(id, context) {
      const row = await executions.evidence(id);
      if (!row) throw missing();
      await authorize(cases, row.projectId, context);
      return {
        stream: await storage.content(row.storageKey, row.sizeBytes),
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        originalName: row.originalName
      };
    }
  };
}
export const testExecutionService = createTestExecutionService();
