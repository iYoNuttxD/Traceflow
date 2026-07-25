import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/http/index.js';
import { authService } from './auth.service.js';

const cookieOptions = () => ({
  httpOnly: true, secure: env.isProduction, sameSite: env.sessionCookieSameSite,
  path: '/', maxAge: env.sessionTtlMs
});
function establishSession(res, result) {
  res.cookie(env.sessionCookieName, result.token, cookieOptions());
  return res.status(200).json({ user: result.user, csrfToken: result.csrfToken });
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    res.cookie(env.sessionCookieName, result.token, cookieOptions());
    return res.status(201).json({ user: result.user, csrfToken: result.csrfToken });
  }),
  login: asyncHandler(async (req, res) => establishSession(res, await authService.login(req.body))),
  me: asyncHandler(async (req, res) => res.json({ user: req.auth.user })),
  csrf: asyncHandler(async (req, res) => {
    return res.json({ csrfToken: await authService.rotateCsrf(req.auth.session.id) });
  }),
  logout: asyncHandler(async (req, res) => {
    await authService.logout(req.auth.session.id);
    res.clearCookie(env.sessionCookieName, { ...cookieOptions(), maxAge: undefined });
    return res.status(204).end();
  }),
  forgotPassword: asyncHandler(async (req, res) => {
    const testToken = await authService.forgotPassword(req.body.email);
    return res.json({ message: 'Se a conta existir, as instruções de recuperação serão enviadas.', ...(env.isTest && testToken ? { testToken } : {}) });
  }),
  resetPassword: asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body);
    return res.json({ message: 'Senha redefinida com sucesso.' });
  }),
  changePassword: asyncHandler(async (req, res) => {
    await authService.changePassword(req.auth.user.id, req.body.currentPassword, req.body.password);
    res.clearCookie(env.sessionCookieName, { ...cookieOptions(), maxAge: undefined });
    return res.json({ message: 'Senha alterada com sucesso. Entre novamente.' });
  })
};
