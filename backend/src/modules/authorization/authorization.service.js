import { authorizationRepository } from './authorization.repository.js';

const levels = Object.freeze({ VIEWER: 0, MEMBER: 1, MANAGER: 2, OWNER: 3 });
const matchId = (path, pattern) => Number(pattern.exec(path)?.[1]) || null;

export const authorizationService = {
  async resolveProjectId(path) {
    const direct = matchId(path, /^\/projects\/(\d+)(?:\/|$)/);
    if (direct) return direct;
    const requirementId = matchId(path, /^\/requirements\/(\d+)(?:\/|$)/);
    if (requirementId)
      return (
        (await authorizationRepository.projectForRequirement(requirementId))?.projectId ?? null
      );
    const taskId = matchId(path, /^\/tasks\/(\d+)(?:\/|$)/);
    if (taskId) return (await authorizationRepository.projectForTask(taskId))?.projectId ?? null;
    const sprintId = matchId(path, /^\/sprints\/(\d+)(?:\/|$)/);
    if (sprintId)
      return (await authorizationRepository.projectForSprint(sprintId))?.projectId ?? null;
    const milestoneId = matchId(path, /^\/milestones\/(\d+)(?:\/|$)/);
    if (milestoneId)
      return (await authorizationRepository.projectForMilestone(milestoneId))?.projectId ?? null;
    return null;
  },
  requiredRole(req) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return 'VIEWER';
    if (req.method === 'DELETE' && /\/members\/me$/.test(req.path)) return 'VIEWER';
    if (req.method === 'PUT' && /^\/projects\/\d+$/.test(req.path)) return 'OWNER';
    if (
      /\/members(?:\/|$)|\/invitations(?:\/|$)|\/ownership\/transfer$|\/github\/sync-settings/.test(
        req.path
      )
    )
      return 'OWNER';
    if (/\/github\/sync(?:\/|$)/.test(req.path)) return 'MANAGER';
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
  },
  projectExists(projectId) {
    return authorizationRepository.projectExists(projectId);
  }
};
