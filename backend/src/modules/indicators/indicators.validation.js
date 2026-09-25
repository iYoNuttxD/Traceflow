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
