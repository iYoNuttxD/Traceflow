import { z } from 'zod';
import {
  emptyBodySchema,
  paginationSchema,
  positiveInteger,
  strictObject
} from '../../shared/validation/index.js';

const MAX_ID = 2147483647;
const idMessage = 'ID da notificação inválido.';
const preferenceMessage = 'Cada preferência deve ser verdadeira ou falsa.';

function hasPrototypeKey(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.hasOwn(value, '__proto__') || Object.values(value).some(hasPrototypeKey);
}

const withoutPrototypeKeys = (schema) =>
  z.preprocess((value, context) => {
    if (hasPrototypeKey(value))
      context.addIssue({ code: 'custom', message: 'O corpo contém uma chave não permitida.' });
    return value;
  }, schema);

export const emptyQuerySchema = strictObject({});
export const emptyNotificationBodySchema = emptyBodySchema;

export const notificationListQuerySchema = strictObject({
  status: z
    .enum(['UNREAD', 'ALL'], { error: 'Situação de leitura inválida. Use UNREAD ou ALL.' })
    .optional()
    .default('UNREAD'),
  ...paginationSchema
});

export const notificationParamsSchema = strictObject({
  notificationId: positiveInteger(idMessage).refine((value) => value <= MAX_ID, idMessage)
});

export const notificationReadBodySchema = withoutPrototypeKeys(
  strictObject({
    read: z.boolean({ error: 'Informe read como verdadeiro ou falso.' })
  })
);

export const notificationPreferencesBodySchema = withoutPrototypeKeys(
  strictObject({
    preferences: strictObject({
      TASK_STATUS_CHANGED: z.boolean({ error: preferenceMessage }),
      TASK_OVERDUE: z.boolean({ error: preferenceMessage })
    })
  })
);
