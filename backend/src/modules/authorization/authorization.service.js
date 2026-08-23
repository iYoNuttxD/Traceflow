import { authorizationRepository } from './authorization.repository.js';

const levels = Object.freeze({ VIEWER: 0, MEMBER: 1, MANAGER: 2, OWNER: 3 });
const matchId = (path, pattern) => {
  const value = Number(pattern.exec(path)?.[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

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
  isProjectScoped(path) {
    return (
      /^\/projects\/\d+(?:\/|$)/.test(path) ||
      /^\/requirements\/\d+(?:\/|$)/.test(path) ||
      /^\/tasks\/\d+(?:\/|$)/.test(path)
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
  }
};
