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
    return null;
  },
  requiredRole(req) {
    if (req.method === 'GET' && /^\/projects\/\d+\/invitations(?:\/|$)/.test(req.path))
      return 'OWNER';
    if (/\/access-code(?:\/|$)/.test(req.path)) return 'OWNER';
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return 'VIEWER';
    if (req.method === 'DELETE' && /\/members\/me$/.test(req.path)) return 'VIEWER';
    if (req.method === 'PUT' && /^\/projects\/\d+$/.test(req.path)) return 'OWNER';
    if (
      /\/members(?:\/|$)|\/invitations(?:\/|$)|\/ownership\/transfer$|\/github\/(?:sync-settings|integration)/.test(
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
  projectExists(projectId) {
    return authorizationRepository.projectExists(projectId);
  }
};
