import { z } from 'zod';
import { dateOnly, positiveInteger, strictObject } from '../../shared/validation/index.js';

export const indicatorProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const indicatorPeriodQuerySchema = strictObject({
  startDate: dateOnly('Data inicial'),
  endDate: dateOnly('Data final'),
  timeZone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Fuso IANA inválido.')
}).superRefine((value, context) => {
  if (value.startDate > value.endDate) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'A data inicial não pode ser maior que a data final.'
    });
  }
});

// One point per civil day in I22/I25. Keep the response bounded.
export const flowTaskPeriodQuerySchema = indicatorPeriodQuerySchema.superRefine(
  (value, context) => {
    const days = (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 + 1;
    if (days > 366) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'O período para séries de Tasks deve ter no máximo 366 dias.'
      });
    }
  }
);

export const sprintAnalyticsQuerySchema = strictObject({
  sprintId: positiveInteger('ID da Sprint inválido.').optional(),
  limit: positiveInteger('limit deve ser inteiro entre 1 e 50.')
    .refine((value) => value <= 50, 'limit deve ser inteiro entre 1 e 50.')
    .optional()
});

export const dashboardQuerySchema = strictObject({
  view: z
    .enum(['GENERAL', 'GITHUB', 'FLOW', 'SPRINT', 'TASK', 'QUALITY', 'TRACEABILITY'])
    .optional(),
  startDate: dateOnly('Data inicial').optional(),
  endDate: dateOnly('Data final').optional(),
  timeZone: z.string().min(1).max(100).optional(),
  sprintId: positiveInteger('ID da Sprint inválido.').optional(),
  responsibleUserId: positiveInteger('ID do responsável inválido.').optional()
}).superRefine((value, context) => {
  const supplied = [value.startDate, value.endDate, value.timeZone].filter(
    (item) => item != null
  ).length;
  if (supplied === 0) return;
  if (supplied !== 3) {
    context.addIssue({
      code: 'custom',
      path: ['startDate'],
      message: 'Período exige startDate, endDate e timeZone.'
    });
    return;
  }
  const schema = ['FLOW', 'TASK'].includes(value.view)
    ? flowTaskPeriodQuerySchema
    : indicatorPeriodQuerySchema;
  const result = schema.safeParse({
    startDate: value.startDate,
    endDate: value.endDate,
    timeZone: value.timeZone
  });
  if (!result.success) for (const issue of result.error.issues) context.addIssue(issue);
});
