import { testCaseRepository } from '../repositories/test-case.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  assertVersion,
  changedDefinitionFields,
  createSchema,
  definitionSnapshot,
  fail,
  missing,
  parse,
  updateSchema
} from '../test-case.schema.js';
import { caseCard, caseDetail } from '../test-case.presenter.js';
import { cursorPage, cursorWhere } from '../test-case.cursor.js';

export async function authorize(repo, projectId, context, write = false) {
  if (!Number.isInteger(context.actorUserId))
    throw fail('Autenticação necessária.', 401, 'UNAUTHENTICATED');
  const membership = await repo.membership(projectId, context.actorUserId);
  if (!membership) throw missing();
  if (write && membership.role === 'VIEWER')
    throw fail('Você não possui permissão para esta operação.', 403, 'FORBIDDEN');
  return membership;
}
export function audit(context, projectId, id, action, metadata) {
  return buildAuditEvent({
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    projectId,
    resourceId: id,
    resourceType: action === 'TEST_EXECUTION_RECORDED' ? 'TestExecution' : 'TestCase',
    action,
    metadata
  });
}
async function resolveLinks(repo, projectId, data) {
  if (!data.requirementId && !data.taskIds.length)
    throw fail(
      'Informe um requisito ou uma tarefa vinculada.',
      400,
      'TEST_CASE_TRACEABILITY_REQUIRED'
    );
  const [responsible, requirement, tasks] = await Promise.all([
    repo.membership(projectId, data.responsibleUserId),
    data.requirementId ? repo.requirement(projectId, data.requirementId) : null,
    repo.tasks(projectId, data.taskIds)
  ]);
  if (!responsible || (data.requirementId && !requirement) || tasks.length !== data.taskIds.length)
    throw missing();
  return { responsible, requirement, tasks };
}
export function createTestCaseService(repo = testCaseRepository) {
  return {
    async create(projectId, input, context) {
      const data = parse(createSchema, input);
      return repo.transaction(
        async (tx) => {
          await tx.lockProject(projectId);
          const membership = await authorize(tx, projectId, context, true);
          if (!(await tx.project(projectId))) throw missing();
          const links = await resolveLinks(tx, projectId, data);
          const { steps, taskIds, ...fields } = data;
          const row = await tx.create({ projectId, ...fields }, steps, taskIds);
          await tx.version({
            testCaseId: row.id,
            version: 1,
            snapshotVersion: 1,
            snapshotJson: definitionSnapshot(data, links.requirement, links.tasks),
            createdByUserId: context.actorUserId
          });
          await tx.history({
            projectId,
            testCaseId: row.id,
            actorUserId: context.actorUserId,
            action: 'CREATED',
            toVersion: 1
          });
          await tx.audit(
            audit(context, projectId, row.id, 'TEST_CASE_CREATED', {
              version: 1,
              stepCount: steps.length,
              taskCount: taskIds.length,
              hasRequirement: Boolean(data.requirementId)
            })
          );
          return caseDetail(row, membership.role);
        },
        {
          projectId,
          reason: 'TESTCASE_CREATED',
          sourceEntityType: 'TestCase',
          createdEntity: 'testCaseIds'
        }
      );
    },
    async update(id, input, context) {
      const parsed = parse(updateSchema, input);
      const owner = await repo.find(id);
      if (!owner) throw missing();
      await authorize(repo, owner.projectId, context, true);
      return repo.transaction(
        async (tx) => {
          await tx.lockProject(owner.projectId);
          const current = await tx.lock(id);
          if (!current) throw missing();
          const membership = await authorize(tx, current.projectId, context, true);
          assertVersion(current, parsed.expectedVersion);
          const original = { ...current, taskIds: current.taskLinks.map((l) => l.taskId) };
          const patch = { ...parsed };
          delete patch.expectedVersion;
          const next = { ...original, ...patch };
          const links = await resolveLinks(tx, current.projectId, next);
          const fields = changedDefinitionFields(original, next);
          const statusChanged = next.status !== current.status;
          const responsibleChanged = next.responsibleUserId !== current.responsibleUserId;
          if (!fields.length && !statusChanged && !responsibleChanged)
            return caseDetail(current, membership.role);
          const version = current.currentVersion + (fields.length ? 1 : 0);
          const row = await tx.update(
            id,
            {
              title: next.title,
              description: next.description,
              preconditions: next.preconditions,
              expectedResult: next.expectedResult,
              requirementId: next.requirementId,
              status: next.status,
              responsibleUserId: next.responsibleUserId,
              currentVersion: version
            },
            fields.includes('steps') ? next.steps : undefined,
            fields.includes('taskIds') ? next.taskIds : undefined
          );
          const base = {
            projectId: current.projectId,
            testCaseId: id,
            actorUserId: context.actorUserId,
            fromVersion: current.currentVersion,
            toVersion: version
          };
          if (fields.length) {
            await tx.version({
              testCaseId: id,
              version,
              snapshotVersion: 1,
              snapshotJson: definitionSnapshot(next, links.requirement, links.tasks),
              createdByUserId: context.actorUserId
            });
            await tx.history({
              ...base,
              action: 'VERSION_CREATED',
              metadataJson: { changedFields: fields }
            });
          }
          if (statusChanged)
            await tx.history({
              ...base,
              action: 'STATUS_CHANGED',
              metadataJson: { from: current.status, to: next.status }
            });
          if (responsibleChanged)
            await tx.history({
              ...base,
              action: 'RESPONSIBLE_CHANGED',
              metadataJson: {
                from: { id: current.responsibleUserId, name: current.responsibleUser.name },
                to: { id: next.responsibleUserId, name: links.responsible.user.name }
              }
            });
          await tx.audit(
            audit(
              context,
              current.projectId,
              id,
              statusChanged && !fields.length && !responsibleChanged
                ? 'TEST_CASE_STATUS_CHANGED'
                : 'TEST_CASE_UPDATED',
              {
                version,
                stepCount: next.steps.length,
                taskCount: next.taskIds.length,
                hasRequirement: Boolean(next.requirementId)
              }
            )
          );
          return caseDetail(row, membership.role);
        },
        {
          projectId: owner.projectId,
          testCaseIds: [id],
          reason: parsed.status ? 'TESTCASE_STATUS_CHANGED' : 'TESTCASE_UPDATED',
          sourceEntityType: 'TestCase',
          sourceEntityId: id
        }
      );
    },
    async delete(id, context) {
      const owner = await repo.find(id);
      if (!owner) throw missing();
      await authorize(repo, owner.projectId, context, true);
      return repo.transaction(
        async (tx) => {
          await tx.lockProject(owner.projectId);
          const current = await tx.lock(id);
          if (!current) throw missing();
          await authorize(tx, current.projectId, context, true);
          await tx.update(id, { deletedAt: new Date(), deletedById: context.actorUserId });
          await tx.history({
            projectId: current.projectId,
            testCaseId: id,
            actorUserId: context.actorUserId,
            action: 'DELETED',
            fromVersion: current.currentVersion,
            toVersion: current.currentVersion
          });
          await tx.audit(
            audit(context, current.projectId, id, 'TEST_CASE_DELETED', {
              version: current.currentVersion
            })
          );
        },
        {
          projectId: owner.projectId,
          testCaseIds: [id],
          reason: 'TESTCASE_DELETED',
          sourceEntityType: 'TestCase',
          sourceEntityId: id
        }
      );
    },
    async read(id, context) {
      const row = await repo.find(id);
      if (!row) throw missing();
      const membership = await authorize(repo, row.projectId, context);
      return caseDetail(row, membership.role);
    },
    async list(projectId, q, context) {
      await authorize(repo, projectId, context);
      const result = await repo.list(projectId, q);
      return { ...result, items: result.items.map(caseCard), page: q.page, limit: q.limit };
    },
    async versions(id, q, context) {
      await this.read(id, context);
      const [items, total] = await repo.versions(id, q);
      return { items, total, page: q.page, limit: q.limit };
    },
    async history(id, q, context) {
      await this.read(id, context);
      const owner = `history:${id}`;
      return cursorPage(
        await repo.historyPage(id, cursorWhere(q.cursor, 'occurredAt', owner), q.limit),
        q.limit,
        'occurredAt',
        owner
      );
    }
  };
}
export const testCaseService = createTestCaseService();
