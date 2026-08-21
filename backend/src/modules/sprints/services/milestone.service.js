// Casos de uso de marcos do cronograma (RF10).
// Marco pertence a uma sprint do mesmo projeto (ADR-010 D02): a conclusao de um
// marco fica ancorada no periodo de desenvolvimento que a produziu.
import { milestoneRepository } from '../repositories/milestone.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import { authorizationService } from '../../authorization/index.js';
import { ERROR_CODES } from '../../../shared/errors/index.js';
import {
  SprintServiceError,
  buildMilestoneData,
  ensureAtLeastOneField,
  ensureMilestoneStatus,
  ensureMilestoneWithinSprint,
  ensureSprintEditable,
  milestoneNotFoundError,
  milestoneSprintChangedError,
  parseMilestoneId,
  parseProjectId,
  sprintNotFoundError
} from '../sprint.schema.js';
import { ensureProjectExists, ensureSprintExists } from './sprint-crud.service.js';

export async function ensureMilestoneExists(milestoneId) {
  const milestone = await milestoneRepository.findById(milestoneId);
  if (!milestone) throw milestoneNotFoundError();
  return milestone;
}

// A sprint informada precisa existir e pertencer ao mesmo projeto do marco.
// O par 400/404 sem esta guarda seria oraculo: iterando o sprintId, um membro de
// um unico projeto descobriria quais sprints existem em projetos alheios. Quem
// nao enxerga o outro projeto recebe exatamente a resposta de sprint inexistente.
//
// Roda FORA da transacao de proposito: ela faz I/O de autorizacao, e prolongar o
// lock do cronograma por isso trocaria um defeito por outro. Dentro do lock ficam
// apenas as invariantes de dominio.
async function ensureMilestoneSprint(sprintId, projectId, context = {}) {
  const sprint = await ensureSprintExists(sprintId);
  if (sprint.projectId !== projectId) {
    if (!(await authorizationService.actorSeesProject(sprint.projectId, context.actorUserId))) {
      throw sprintNotFoundError();
    }
    throw new SprintServiceError(
      'A sprint informada não pertence ao mesmo projeto do marco.',
      400,
      ERROR_CODES.MILESTONE_SPRINT_PROJECT_MISMATCH
    );
  }
  return sprint;
}

// Marco de sprint encerrada acompanha a imutabilidade dela (ADR-010 D12): o
// periodo virou registro, e mexer no marco reescreveria o que ficou registrado.
//
// Recusa cedo, antes de abrir transacao. A decisao que vale, porem, e a refeita
// sobre a sprint relida sob lock: entre esta leitura e a escrita, outra
// requisicao pode encerrar a sprint.
async function ensureMilestoneMutable(milestone) {
  const sprint = await ensureSprintExists(milestone.sprintId);
  ensureSprintEditable(sprint);
  return sprint;
}

// Retrato travado -> a sprint pedida, ja conferida contra o projeto do marco.
function lockedSprint(sprints, sprintId, projectId) {
  const sprint = sprints.find((item) => item.id === sprintId);
  if (!sprint || sprint.projectId !== projectId) throw sprintNotFoundError();
  return sprint;
}

export const milestoneService = {
  async createMilestone(projectId, data, context = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);
    const milestoneData = buildMilestoneData(data, true);
    const sprint = await ensureMilestoneSprint(milestoneData.sprintId, parsedProjectId, context);
    ensureSprintEditable(sprint);
    ensureMilestoneWithinSprint(milestoneData.dueDate, sprint);

    return milestoneRepository.createWithinSprintLock(
      parsedProjectId,
      milestoneData,
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: parsedProjectId,
        requestId: context.requestId,
        action: 'MILESTONE_CREATED',
        resourceType: 'Milestone'
      }),
      ({ sprints }) => {
        // Revalidado sobre o registro travado: a sprint pode ter sido encerrada,
        // ou ter tido a janela encolhida, entre a checagem acima e esta escrita.
        const travada = lockedSprint(sprints, milestoneData.sprintId, parsedProjectId);
        ensureSprintEditable(travada);
        ensureMilestoneWithinSprint(milestoneData.dueDate, travada);
      }
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
    // A sprint atual precisa estar aberta ANTES da troca: mover um marco para
    // fora de uma sprint encerrada mudaria a composicao do periodo fechado.
    const sprintAtual = await ensureMilestoneMutable(current);
    const destinoId = milestoneData.sprintId ?? current.sprintId;
    const destino =
      milestoneData.sprintId !== undefined
        ? await ensureMilestoneSprint(destinoId, current.projectId, context)
        : sprintAtual;
    ensureSprintEditable(destino);
    ensureMilestoneWithinSprint(milestoneData.dueDate ?? current.dueDate, destino);

    const milestone = await milestoneRepository.updateWithinSprintLock(
      id,
      current.projectId,
      [current.sprintId, destinoId],
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
      ({ sprints, milestone: travado }) => {
        if (travado.sprintId !== current.sprintId) throw milestoneSprintChangedError();
        ensureSprintEditable(lockedSprint(sprints, travado.sprintId, current.projectId));
        const destino = lockedSprint(sprints, destinoId, current.projectId);
        ensureSprintEditable(destino);
        ensureMilestoneWithinSprint(milestoneData.dueDate ?? travado.dueDate, destino);
      }
    );

    if (milestone === null) throw milestoneNotFoundError();
    return milestone;
  },

  async updateMilestoneStatus(milestoneId, status, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);
    await ensureMilestoneMutable(current);
    const nextStatus = ensureMilestoneStatus(status);

    const milestone = await milestoneRepository.updateWithinSprintLock(
      id,
      current.projectId,
      [current.sprintId],
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
      ({ sprints, milestone: travado }) => {
        if (travado.sprintId !== current.sprintId) throw milestoneSprintChangedError();
        ensureSprintEditable(lockedSprint(sprints, travado.sprintId, current.projectId));
      }
    );

    if (milestone === null) throw milestoneNotFoundError();
    return milestone;
  },

  async deleteMilestone(milestoneId, context = {}) {
    const id = parseMilestoneId(milestoneId);
    const current = await ensureMilestoneExists(id);
    await ensureMilestoneMutable(current);

    const removido = await milestoneRepository.deleteWithinSprintLock(
      id,
      current.projectId,
      [current.sprintId],
      buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: current.projectId,
        requestId: context.requestId,
        action: 'MILESTONE_DELETED',
        resourceType: 'Milestone',
        resourceId: id,
        metadata: { milestoneId: id }
      }),
      ({ sprints, milestone: travado }) => {
        if (travado.sprintId !== current.sprintId) throw milestoneSprintChangedError();
        ensureSprintEditable(lockedSprint(sprints, travado.sprintId, current.projectId));
      }
    );

    if (removido === null) throw milestoneNotFoundError();
    return removido;
  }
};
