import { z } from 'zod';
import { email, positiveInteger, requiredText, strictObject } from '../../shared/validation/index.js';

const password = z.string().min(8, 'Senha obrigatória.').max(128);
export const profileBody = strictObject({ name: requiredText({ field: 'Nome' }), email, currentPassword: password });
export const passwordBody = strictObject({ password });
export const sessionParams = strictObject({ sessionId: positiveInteger('ID da sessão inválido.') });
export const exportParams = strictObject({ exportId: positiveInteger('ID da exportação inválido.') });
