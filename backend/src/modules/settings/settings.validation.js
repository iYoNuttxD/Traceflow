import { z } from 'zod';
import {
  email,
  publicCapabilityToken,
  requiredText,
  strictObject
} from '../../shared/validation/index.js';

const password = z.string().min(8, 'Senha obrigatória.').max(128);
const optionalPassword = z.string().max(128).optional();
const token = publicCapabilityToken();

export const profileBody = strictObject({ name: requiredText({ field: 'Nome' }).max(120) });
export const usernameBody = strictObject({ username: z.string().min(3).max(39) });
export const emailChangeBody = strictObject({ newEmail: email, currentPassword: optionalPassword });
export const passwordChangeBody = strictObject({
  currentPassword: password,
  newPassword: password,
  confirmation: password
});
export const passwordConfirmationBody = strictObject({
  currentPassword: optionalPassword,
  confirmation: z.literal(true, { error: 'Confirmação explícita obrigatória.' })
});
export const reactivationStartBody = strictObject({});
export const tokenQuery = strictObject({ token });
export const sessionParams = strictObject({ sessionId: z.string().uuid('Sessão inválida.') });
export const githubAuthorizationParams = strictObject({
  authorizationId: z.coerce.number().int().positive('Autorização inválida.')
});
export const githubIdentityLinkBody = strictObject({ password });
export const passwordInitializeBody = strictObject({
  newPassword: z.string().min(12, 'A senha deve possuir ao menos 12 caracteres.').max(128),
  confirmation: z.string().min(12).max(128)
});
