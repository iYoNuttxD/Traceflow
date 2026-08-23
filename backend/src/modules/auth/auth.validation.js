import { z } from 'zod';
import {
  email,
  publicCapabilityToken,
  requiredText,
  strictObject
} from '../../shared/validation/index.js';
import { normalizeUsername, passwordPolicyErrors, validateUsername } from './identity-policy.js';

const password = z.string().min(12, 'A senha deve possuir ao menos 12 caracteres.').max(128);
const verificationToken = publicCapabilityToken({
  message: 'Link de verificação inválido ou expirado.',
  max: 128
});
const passwordResetToken = publicCapabilityToken({
  message: 'Link de redefinição de senha inválido ou expirado.',
  max: 128
});
const username = z
  .string()
  .transform(normalizeUsername)
  .superRefine((value, context) => {
    const result = validateUsername(value);
    if (!result.valid) context.addIssue({ code: 'custom', message: result.message });
  });
export const registerBodySchema = strictObject({
  name: requiredText({ field: 'Nome' }),
  username,
  email,
  password
}).superRefine((value, context) => {
  for (const message of passwordPolicyErrors(value.password, value)) {
    context.addIssue({ code: 'custom', path: ['password'], message });
  }
});
export const loginBodySchema = strictObject({
  identifier: z.string().trim().min(1, 'Informe o nome de usuário ou e-mail.').max(191),
  password: z.string().min(1).max(128),
  rememberMe: z.boolean().optional().default(false)
});
export const forgotBodySchema = strictObject({ email });
export const resetBodySchema = strictObject({ token: passwordResetToken, password });
export const changePasswordBodySchema = strictObject({
  currentPassword: z.string().min(1).max(128),
  password
});
export const verifyEmailBodySchema = strictObject({ token: verificationToken });
export const emptyAuthBodySchema = strictObject({});
export const githubLoginStartBodySchema = strictObject({
  rememberMe: z.boolean().optional().default(false),
  returnTo: z.string().max(191).optional()
});
export const githubSensitiveReauthenticationBodySchema = strictObject({
  returnTo: z.string().max(191).optional()
});
export const githubRepositoryAuthorizationBodySchema = strictObject({
  returnTo: z.string().max(191).optional()
});
export const usernameBodySchema = strictObject({ username });
