import { defectRepository } from './repositories/defect.repository.js';
import {
  createSchema,
  updateSchema,
  correctionSchema,
  parse,
  requireTraceability,
  missing,
  fail,
  conflict
} from './defect.schema.js';
import { defectCard, defectDetail, detectionCandidate } from './defect.presenter.js';
import { authorize } from '../testCases/services/test-case.service.js';
import { buildAuditEvent } from '../audit/audit.service.js';
import { prepareTaskCreation } from '../tasks/services/task-crud.service.js';
import { calculateRequirementStatus } from '../requirements/requirement.schema.js';

export async function recordDefectEvent(tx, row, context, action, metadataJson = {}) {
  await tx.history({
    projectId: row.projectId,
    defectId: row.id,
    actorUserId: context.actorUserId,
    action,
    metadataJson
  });
  await tx.audit(
    buildAuditEvent({
      ...context,
      projectId: row.projectId,
      resourceId: row.id,
      resourceType: 'Defect',
      action: `DEFECT_${action}`,
      metadata: metadataJson
    })
  );
}
async function links(tx, projectId, data) {
  requireTraceability(data.requirementId, data.originTaskIds);
  const [member, requirement, tasks] = await Promise.all([
    tx.membership(projectId, data.responsibleUserId),
    data.requirementId ? tx.requirement(projectId, data.requirementId) : null,
    tx.tasks(projectId, data.originTaskIds)
  ]);
  if (!member || (data.requirementId && !requirement) || tasks.length !== data.originTaskIds.length)
    throw missing();
}
export function assertDefectRevision(row, input) {
  if (
    row.revision !== input.expectedRevision ||
    (input.correctionCycle && row.currentCorrectionCycle !== input.correctionCycle)
  )
    throw conflict();
}
export function createDefectService(repo = defectRepository) {
  async function read(id, context, write = false) {
    const row = await repo.find(id);
    if (!row) throw missing();
    await authorize(repo, row.projectId, context, write);
    return row;
  }
  async function mutate(id, context, work) {
    const current = await read(id, context, true);
    return repo.transaction(async (tx) => {
      await tx.lockProject(current.projectId);
      const row = await tx.lock(id);
      if (!row) throw missing();
      await authorize(tx, row.projectId, context, true);
      return work(tx, row);
    });
  }
  return {
    async create(projectId, input, context) {
      const data = parse(createSchema, input);
      return repo.transaction(async (tx) => {
        await tx.lockProject(projectId);
        await authorize(tx, projectId, context, true);
        if (!(await tx.project(projectId))) throw missing();
        const detection = await tx.detection(data.detectedExecutionStepId);
        if (
          !detection ||
          detection.execution.projectId !== projectId ||
          detection.execution.testCase.projectId !== projectId
        )
          throw missing();
        if (detection.result !== 'FAIL')
          throw fail(
            'O passo de detecção deve ter resultado FAIL.',
            'DEFECT_DETECTION_REQUIRES_FAIL'
          );
        await links(tx, projectId, data);
        const { originTaskIds, ...fields } = data;
        const row = await tx.create({ ...fields, projectId }, originTaskIds);
        await recordDefectEvent(tx, row, context, 'CREATED', {
          detectedExecutionStepId: data.detectedExecutionStepId,
          requirementId: data.requirementId,
          originTaskIds,
          severity: data.severity,
          responsibleUserId: data.responsibleUserId
        });
        return defectDetail(await tx.find(row.id));
      });
    },
    async read(id, context) {
      return defectDetail(await read(id, context));
    },
    async list(projectId, q, context) {
      await authorize(repo, projectId, context);
      const page = await repo.list(projectId, q);
      return { ...page, items: page.items.map(defectCard) };
    },
    async candidates(projectId, q, context) {
      await authorize(repo, projectId, context);
      const page = await repo.candidates(projectId, q);
      return { ...page, items: page.items.map(detectionCandidate) };
    },
    async history(id, q, context) {
      await read(id, context);
      return repo.historyPage(id, q);
    },
    async retests(id, q, context) {
      await read(id, context);
      return repo.retestsPage(id, q);
    },
    async update(id, input, context) {
      const data = parse(updateSchema, input);
      return mutate(id, context, async (tx, row) => {
        assertDefectRevision(row, data);
        const currentOrigins = row.taskLinks
          .filter((l) => l.relationType === 'ORIGIN')
          .map((l) => l.taskId)
          .sort((a, b) => a - b);
        const merged = { ...row, originTaskIds: currentOrigins, ...data };
        await links(tx, row.projectId, merged);
        if (
          row.taskLinks.some(
            (l) => l.relationType === 'CORRECTION' && merged.originTaskIds.includes(l.taskId)
          )
        )
          throw fail(
            'Uma tarefa não pode ser origem e correção do mesmo defeito.',
            'DEFECT_TASK_ROLE_CONFLICT',
            409
          );
        const { originTaskIds, ...fields } = data;
        delete fields.expectedRevision;
        const updated = await tx.update(id, fields, originTaskIds);
        const changes = Object.keys(fields)
          .filter((k) => row[k] !== fields[k])
          .map((field) => ({ field, from: row[field], to: fields[field] }));
        if (originTaskIds && JSON.stringify(originTaskIds) !== JSON.stringify(currentOrigins))
          changes.push({ field: 'originTaskIds', from: currentOrigins, to: originTaskIds });
        for (const change of changes) {
          const action =
            change.field === 'severity'
              ? 'SEVERITY_CHANGED'
              : change.field === 'responsibleUserId'
                ? 'RESPONSIBLE_CHANGED'
                : ['originTaskIds', 'requirementId'].includes(change.field)
                  ? 'TRACEABILITY_CHANGED'
                  : 'UPDATED';
          await recordDefectEvent(tx, row, context, action, change);
        }
        return defectDetail({
          ...updated,
          _count: { history: row._count.history + changes.length }
        });
      });
    },
    async delete(id, context) {
      return mutate(id, context, async (tx, row) => {
        await tx.update(id, { deletedAt: new Date() });
        await recordDefectEvent(tx, row, context, 'DELETED');
      });
    },
    async correction(id, input, context) {
      const data = parse(correctionSchema, input);
      return mutate(id, context, async (tx, row) => {
        assertDefectRevision(row, data);
        if (row.status === 'VALIDADO')
          throw fail(
            'Defeito validado não aceita novas correções.',
            'DEFECT_ALREADY_VALIDATED',
            409
          );
        let taskId = data.taskId;
        if (taskId) {
          if (!(await tx.tasks(row.projectId, [taskId])).length) throw missing();
          if (row.taskLinks.some((l) => l.taskId === taskId && l.relationType === 'ORIGIN'))
            throw fail(
              'Uma tarefa não pode ser origem e correção do mesmo defeito.',
              'DEFECT_TASK_ROLE_CONFLICT',
              409
            );
          if (
            row.taskLinks.some(
              (l) =>
                l.taskId === taskId &&
                l.relationType === 'CORRECTION' &&
                l.correctionCycle === row.currentCorrectionCycle
            )
          )
            throw fail('Tarefa já vinculada neste ciclo.', 'DEFECT_CORRECTION_ALREADY_LINKED', 409);
        } else {
          const inputTask = {
            ...data.task,
            requirementId:
              data.task.requirementId === undefined ? row.requirementId : data.task.requirementId
          };
          if (
            inputTask.requirementId &&
            !(await tx.requirement(row.projectId, Number(inputTask.requirementId)))
          )
            throw missing();
          if (
            inputTask.responsibleUserId &&
            !(await tx.membership(row.projectId, Number(inputTask.responsibleUserId)))
          )
            throw missing();
          const taskData = await prepareTaskCreation(row.projectId, inputTask, tx.taskLookup);
          const task = await tx.createTask(
            row.projectId,
            taskData,
            buildAuditEvent({
              ...context,
              projectId: row.projectId,
              resourceType: 'Task',
              action: 'TASK_CREATED'
            }),
            calculateRequirementStatus
          );
          taskId = task.id;
        }
        await tx.link(id, taskId, row.currentCorrectionCycle);
        await tx.update(id, {});
        await recordDefectEvent(
          tx,
          row,
          context,
          data.task ? 'CORRECTION_TASK_CREATED' : 'CORRECTION_TASK_LINKED',
          { taskId, correctionCycle: row.currentCorrectionCycle }
        );
        await tx.reconcile(id, context.actorUserId, 'CORRECTION_TASK_LINKED');
        return defectDetail(await tx.find(id));
      });
    }
  };
}
export const defectService = createDefectService();
