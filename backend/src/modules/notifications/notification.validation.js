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
const cursorMessage = 'Cursor de paginação inválido.';
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CURSOR_CONTENT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\|([1-9]\d{0,9})$/;

function decodeCursor(value, context) {
  const match = CURSOR_PATTERN.test(value)
    ? CURSOR_CONTENT.exec(Buffer.from(value, 'base64url').toString('utf8'))
    : null;
  const createdAt = match ? new Date(match[1]) : null;
  const id = match ? Number(match[2]) : null;
  if (
    !match ||
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== match[1] ||
    id > MAX_ID
  ) {
    context.addIssue({ code: 'custom', message: cursorMessage });
    return z.NEVER;
  }
  return { createdAt, id };
}

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
  cursor: z.string({ error: cursorMessage }).transform(decodeCursor).optional(),
  ...paginationSchema
}).refine((query) => !(query.cursor && query.page), {
  message: 'Use cursor ou page, não os dois.',
  path: ['cursor']
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
