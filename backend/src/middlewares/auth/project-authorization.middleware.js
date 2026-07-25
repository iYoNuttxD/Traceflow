import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { authorizationService } from '../../modules/authorization/authorization.service.js';

export function createProjectAuthorizationMiddleware({ service = authorizationService } = {}) {
  return async function authorize(req, res, next) {
    try {
      if ((req.method === 'DELETE' && /^\/projects\/[^/]+$/.test(req.path)) || /^\/projects\/[^/]+\/trace-links$|^\/requirements\/[^/]+\/traceability$|^\/tasks\/[^/]+\/traceability$|^\/github-artifacts\/[^/]+\/traceability$|^\/trace-links\/[^/]+$/.test(req.path)) return next();
      if ((req.method === 'POST' && req.path === '/projects') || req.path.startsWith('/github/')) return next();
      if (req.method === 'GET' && req.path === '/projects') return next();
      const projectId = await service.resolveProjectId(req.path);
      if (!projectId) return next();
      const membership = await service.membership(projectId, req.auth.user.id);
      if (!membership) {
        if (!(await service.projectExists(projectId))) return next();
        return next(new AppError({ message: 'Recurso não encontrado.', statusCode: 404, code: ERROR_CODES.RESOURCE_NOT_FOUND, exposeTechnicalDetails: true }));
      }
      const required = service.requiredRole(req);
      if (!service.permits(membership.role, required)) {
        return next(new AppError({ message: 'Você não possui permissão para esta operação.', statusCode: 403, code: ERROR_CODES.FORBIDDEN, exposeTechnicalDetails: true }));
      }
      req.projectMembership = membership;
      req.authorizedProjectId = projectId;
      return next();
    } catch (error) { return next(error); }
  };
}
