import { z } from 'zod';
import { positiveInteger, requiredText, strictObject } from '../../shared/validation/index.js';

const password = z.string().min(8, 'Senha obrigatória.').max(128);
export const profileBody = strictObject({
  name: requiredText({ field: 'Nome' })
});
export const passwordBody = strictObject({ password });
export const sessionParams = strictObject({ sessionId: z.string().uuid('Sessão inválida.') });
export const exportParams = strictObject({
  exportId: positiveInteger('ID da exportação inválido.')
});
