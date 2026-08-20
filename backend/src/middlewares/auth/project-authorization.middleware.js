import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { authorizationService } from '../../modules/authorization/authorization.service.js';

export function createProjectAuthorizationMiddleware({ service = authorizationService } = {}) {
  return async function authorize(req, res, next) {
    try {
      const method = req.method.toUpperCase();
      const path = req.path.toLowerCase();
      if (method === 'DELETE' && /^\/projects\/[^/]+$/.test(path)) return next();
      if ((method === 'POST' && path === '/projects') || path.startsWith('/github/')) return next();
      if (method === 'GET' && path === '/projects') return next();
      const projectScoped = service.isProjectScoped(path);
      if (!projectScoped) return next();
      const projectId = await service.resolveProjectId(path);
      if (!projectId) {
        return next(
          new AppError({
            message: 'Recurso não encontrado.',
            statusCode: 404,
            code: ERROR_CODES.RESOURCE_NOT_FOUND,
            exposeTechnicalDetails: true
          })
        );
      }
      const membership = await service.membership(projectId, req.auth.user.id);
      if (!membership) {
        return next(
          new AppError({
            message: 'Recurso não encontrado.',
            statusCode: 404,
            code: ERROR_CODES.RESOURCE_NOT_FOUND,
            exposeTechnicalDetails: true
          })
        );
      }
      const required = service.requiredRole({ method, path });
      if (!service.permits(membership.role, required)) {
        return next(
          new AppError({
            message: 'Você não possui permissão para esta operação.',
            statusCode: 403,
            code: ERROR_CODES.FORBIDDEN,
            exposeTechnicalDetails: true
          })
        );
      }
      req.projectMembership = membership;
      req.authorizedProjectId = projectId;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
