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
