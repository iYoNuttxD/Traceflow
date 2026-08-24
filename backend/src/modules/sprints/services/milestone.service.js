// Casos de uso de marcos do cronograma (RF10).
//
// Marco AGRUPA sprints (ADR-011 D01): e a entrega de medio prazo, com prazo
// proprio, e as sprints sao os periodos que a produzem. Quem declara o vinculo e
// a sprint, entao aqui nao ha nada de sprint na escrita — nem sprintId no corpo,
// nem janela a conferir (D03), nem congelamento herdado (D04).
import { milestoneRepository } from '../repositories/milestone.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  buildMilestoneData,
  ensureAtLeastOneField,
  ensureMilestoneStatus,
  milestoneHasSprintsError,
  milestoneNotFoundError,
  parseMilestoneId,
  parseProjectId
} from '../sprint.schema.js';
import { ensureProjectExists } from './sprint-crud.service.js';

export async function ensureMilestoneExists(milestoneId) {
  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw milestoneNotFoundError();
  return milestone;
}

export const milestoneService = {
  async createMilestone(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const milestoneData = buildMilestoneData(data, true);

    return milestoneRepository.createWithinProjectLock(
      parsedProjectId,
      milestoneData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: parsedProjectId,
        requestId: context.requestId,
        action: 'MILESTONE_CREATED',
        resourceType: 'Milestone'
      }),
      // Nada a revalidar sob lock na criacao: o marco nasce sem sprints, e titulo,
      // descricao e prazo nao dependem de nenhum outro registro. O lock do projeto
      // permanece porque e ele que serializa o cronograma inteiro.
      () => {}
    );
  },

  async findMilestonesByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    return milestoneRepository.findByProject(parsedProjectId, { status: query.status });
  },

  async getMilestoneById(milestoneId) {
    return ensureMilestoneExists(parseMilestoneId(milestoneId));
  },

  async updateMilestone(milestoneId, data, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);
    const milestoneData = ensureAtLeastOneField(
      buildMilestoneData(data),
      'Informe ao menos um campo para atualizar o marco.'
    );

    const milestone = await milestoneRepository.updateWithinProjectLock(
      id,
      current.projectId,
      milestoneData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_UPDATED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      }),
      () => {}
    );

    if (milestone === null) throw milestoneNotFoundError();
    return milestone;
  },

  // A conclusao manual continua existindo ao lado da automatica (ADR-011 D05): a
  // automacao antecipa o caso comum, nao retira a decisao de quem gerencia.
  async updateMilestoneStatus(milestoneId, status, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);
    const nextStatus = ensureMilestoneStatus(status);

    const milestone = await milestoneRepository.updateWithinProjectLock(
      id,
      current.projectId,
      { status: nextStatus },
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_STATUS_CHANGED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      }),
      () => {}
    );

    if (milestone === null) throw milestoneNotFoundError();
    return milestone;
  },

  async deleteMilestone(milestoneId, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);

    const removido = await milestoneRepository.deleteWithinProjectLock(
      id,
      current.projectId,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_DELETED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      }),
      // A contagem vem do retrato travado, e nao de uma leitura anterior: entre
      // uma e outra, uma sprint pode ter passado a apontar para este marco.
      ({ sprintCount }) => {
        if (sprintCount > 0) throw milestoneHasSprintsError(sprintCount);
      }
    );

    if (removido === null) throw milestoneNotFoundError();
    return removido;
  }
};
