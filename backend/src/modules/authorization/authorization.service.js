import { authorizationRepository } from './authorization.repository.js';

const levels = Object.freeze({ VIEWER: 0, MEMBER: 1, MANAGER: 2, OWNER: 3 });
const matchId = (path, pattern) => {
  const value = Number(pattern.exec(path)?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

export const authorizationService = {
  // Resolve o projeto DONO do recurso endereçado e diz de que recurso se trata.
  // O tipo importa para o 404: a resposta de "não existe" e a de "existe em
  // projeto alheio" precisam ser idênticas, e para isso o middleware tem que
  // falar o mesmo vocabulário que o service falaria.
  async resolveResource(path) {
    const direct = matchId(path, /^\/projects\/(\d+)(?:\/|$)/);
    if (direct) return { projectId: direct, resourceType: 'Project' };

    const requirementId = matchId(path, /^\/requirements\/(\d+)(?:\/|$)/);
    if (requirementId) {
      const owner = await authorizationRepository.projectForRequirement(requirementId);
      return { projectId: owner?.projectId ?? null, resourceType: 'Requirement' };
    }
    const taskId = matchId(path, /^\/tasks\/(\d+)(?:\/|$)/);
    if (taskId) {
      const owner = await authorizationRepository.projectForTask(taskId);
      return { projectId: owner?.projectId ?? null, resourceType: 'Task' };
    }
    const sprintId = matchId(path, /^\/sprints\/(\d+)(?:\/|$)/);
    if (sprintId) {
      const owner = await authorizationRepository.projectForSprint(sprintId);
      return { projectId: owner?.projectId ?? null, resourceType: 'Sprint' };
    }
    const milestoneId = matchId(path, /^\/milestones\/(\d+)(?:\/|$)/);
    if (milestoneId) {
      const owner = await authorizationRepository.projectForMilestone(milestoneId);
      return { projectId: owner?.projectId ?? null, resourceType: 'Milestone' };
    }
    return { projectId: null, resourceType: null };
  },

  async resolveProjectId(path) {
    return (await this.resolveResource(path)).projectId;
  },
  isProjectScoped(path) {
    return (
      /^\/projects\/\d+(?:\/|$)/.test(path) ||
      /^\/requirements\/\d+(?:\/|$)/.test(path) ||
      /^\/tasks\/\d+(?:\/|$)/.test(path) ||
      /^\/sprints\/\d+(?:\/|$)/.test(path) ||
      /^\/milestones\/\d+(?:\/|$)/.test(path)
    );
  },
  requiredRole({ method, path }) {
    if (method === 'GET' && /^\/projects\/\d+\/invitations(?:\/|$)/.test(path)) return 'OWNER';
    if (/\/access-code(?:\/|$)/.test(path)) return 'OWNER';
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return 'VIEWER';
    if (method === 'DELETE' && /\/members\/me$/.test(path)) return 'VIEWER';
    if (method === 'PUT' && /^\/projects\/\d+$/.test(path)) return 'OWNER';
    if (
      /\/members(?:\/|$)|\/invitations(?:\/|$)|\/ownership\/transfer$|\/github\/(?:sync-settings|integration)/.test(
        path
      )
    )
      return 'OWNER';
    if (/\/github\/sync(?:\/|$)/.test(path)) return 'MANAGER';
    return 'MEMBER';
  },
  permits(role, required) {
    return levels[role] >= levels[required];
  },
  membership(projectId, userId) {
    return authorizationRepository.membership(projectId, userId);
  },
  // O ator enxerga o projeto? Usado para decidir se um erro pode ser informativo ou
  // se precisa ser indistinguível de "não existe".
  // Falha fechado de propósito: `userId` undefined faria o Prisma ignorar o filtro no
  // where e casar qualquer membro ativo do projeto, invertendo a resposta.
  async actorSeesProject(projectId, userId) {
    if (!Number.isInteger(projectId) || !Number.isInteger(userId)) return false;
    return Boolean(await authorizationRepository.membership(projectId, userId));
  }
};
