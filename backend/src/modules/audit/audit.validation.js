import { z } from 'zod';
import {
  dateOnly,
  paginationSchema,
  positiveInteger,
  strictObject
} from '../../shared/validation/index.js';

export const auditProjectParams = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});
export const auditQuery = strictObject({
  ...paginationSchema,
  action: z.string().trim().min(1).max(191).optional(),
  result: z.enum(['SUCCESS', 'FAILURE']).optional(),
  startDate: dateOnly('Data inicial').optional(),
  endDate: dateOnly('Data final').optional()
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate)
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'A data inicial não pode ser maior que a data final.'
    });
  if (
    value.startDate &&
    value.endDate &&
    (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 > 366
  )
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'O intervalo máximo de auditoria é 366 dias.'
    });
});
