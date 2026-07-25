import { z } from 'zod';
import { email, requiredText, strictObject } from '../../shared/validation/index.js';

const password = z.string().min(12, 'A senha deve possuir ao menos 12 caracteres.').max(128)
  .regex(/[a-z]/, 'A senha deve conter letra minúscula.')
  .regex(/[A-Z]/, 'A senha deve conter letra maiúscula.')
  .regex(/\d/, 'A senha deve conter número.');
export const registerBodySchema = strictObject({ name: requiredText({ field: 'Nome' }), email, password });
export const loginBodySchema = strictObject({ email, password: z.string().min(1).max(128) });
export const forgotBodySchema = strictObject({ email });
export const resetBodySchema = strictObject({ token: z.string().min(32).max(128), password });
export const changePasswordBodySchema = strictObject({ currentPassword: z.string().min(1).max(128), password });
