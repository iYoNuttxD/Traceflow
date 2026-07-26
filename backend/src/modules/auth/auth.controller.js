import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/http/index.js';
import { authService } from './auth.service.js';
import { auditService } from '../audit/audit.service.js';

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: env.sessionCookieSameSite,
  path: '/',
  maxAge: env.sessionTtlMs
});
function establishSession(res, result) {
  res.cookie(env.sessionCookieName, result.token, cookieOptions());
  return res.status(200).json({ user: result.user, csrfToken: result.csrfToken });
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    await auditService.recordOperational({
      actorUserId: result.user.id,
      requestId: req.requestId,
      action: 'AUTH_REGISTER_SUCCESS',
      resourceType: 'User',
      resourceId: result.user.id
    });
    res.cookie(env.sessionCookieName, result.token, cookieOptions());
    return res.status(201).json({ user: result.user, csrfToken: result.csrfToken });
  }),
  login: asyncHandler(async (req, res) => {
    try {
      const result = await authService.login(req.body);
      await auditService.recordOperational({
        actorUserId: result.user.id,
        requestId: req.requestId,
        action: 'AUTH_LOGIN_SUCCESS',
        resourceType: 'User',
        resourceId: result.user.id
      });
      return establishSession(res, result);
    } catch (error) {
      await auditService.recordOperational({
        requestId: req.requestId,
        action: 'AUTH_LOGIN_FAILURE',
        resourceType: 'User',
        result: 'FAILURE',
        reasonCode: error.code || 'INVALID_CREDENTIALS'
      });
      throw error;
    }
  }),
  me: asyncHandler(async (req, res) => res.json({ user: req.auth.user })),
  csrf: asyncHandler(async (req, res) => {
    return res.json({ csrfToken: await authService.rotateCsrf(req.auth.session.id) });
  }),
  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.auth.session.id);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      requestId: req.requestId,
      action: 'AUTH_LOGOUT',
      resourceType: 'Session',
      resourceId: req.auth.session.id
    });
    res.clearCookie(env.sessionCookieName, { ...cookieOptions(), maxAge: undefined });
    return res.status(204).end();
  }),
  forgotPassword: asyncHandler(async (req, res) => {
    const testToken = await authService.forgotPassword(req.body.email);
    await auditService.recordOperational({
      requestId: req.requestId,
      action: 'PASSWORD_RESET_REQUESTED',
      resourceType: 'User'
    });
    return res.json({
      message: 'Se a conta existir, as instruções de recuperação serão enviadas.',
      ...(env.isTest && testToken ? { testToken } : {})
    });
  }),
  resetPassword: asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body);
    await auditService.recordOperational({
      requestId: req.requestId,
      action: 'PASSWORD_RESET_COMPLETED',
      resourceType: 'User'
    });
    return res.json({ message: 'Senha redefinida com sucesso.' });
  }),
  changePassword: asyncHandler(async (req, res) => {
    await authService.changePassword(req.auth.user.id, req.body.currentPassword, req.body.password);
    await auditService.recordOperational({
      actorUserId: req.auth.user.id,
      requestId: req.requestId,
      action: 'PASSWORD_CHANGED',
      resourceType: 'User',
      resourceId: req.auth.user.id
    });
    res.clearCookie(env.sessionCookieName, { ...cookieOptions(), maxAge: undefined });
    return res.json({ message: 'Senha alterada com sucesso. Entre novamente.' });
  })
};
