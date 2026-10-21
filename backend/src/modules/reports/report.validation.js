import { z } from 'zod';
import {
  dateOnly,
  paginationSchema,
  positiveInteger,
  strictObject
} from '../../shared/validation/index.js';

// Mesmo teto das visões FLOW/TASK/QUALITY do painel: o relatório lê todas as visões
// com um único recorte, então o período precisa ser aceito por todas elas.
export const REPORT_MAX_PERIOD_DAYS = 366;

export const reportProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const reportParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.'),
  reportId: positiveInteger('ID do relatório inválido.')
});

export const REPORT_LIST_STATUSES = Object.freeze(['SUCCEEDED', 'FAILED', 'ACTIVE']);

// Filtros da lista: situação (ACTIVE = na fila ou gerando), Sprint do recorte ("none" =
// relatórios sem Sprint), quem pediu e período, que seleciona relatórios cujo recorte
// tem interseção com as datas informadas.
export const reportListQuerySchema = strictObject({
  ...paginationSchema,
  status: z.enum(REPORT_LIST_STATUSES, { error: 'Situação inválida.' }).optional(),
  sprintId: z.union([z.literal('none'), positiveInteger('ID da Sprint inválido.')]).optional(),
  requestedByUserId: positiveInteger('ID do solicitante inválido.').optional(),
  startDate: dateOnly('Data inicial').optional(),
  endDate: dateOnly('Data final').optional()
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate)
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'A data inicial não pode ser maior que a data final.'
    });
});

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// S2-07: fuso usado só para exibir instantes no PDF quando o relatório não tem período.
export const reportPdfQuerySchema = strictObject({
  timeZone: z
    .string()
    .min(1)
    .max(100)
    .refine(validTimeZone, { message: 'Fuso IANA inválido.' })
    .optional()
});

export const createReportBodySchema = strictObject({
  startDate: dateOnly('Data inicial').optional(),
  endDate: dateOnly('Data final').optional(),
  timeZone: z.string().min(1).max(100).optional(),
  sprintId: positiveInteger('ID da Sprint inválido.').optional()
}).superRefine((value, context) => {
  if (value.timeZone != null && !validTimeZone(value.timeZone)) {
    context.addIssue({ code: 'custom', path: ['timeZone'], message: 'Fuso IANA inválido.' });
    return;
  }
  if (value.startDate == null && value.endDate == null) {
    if (value.timeZone != null)
      context.addIssue({
        code: 'custom',
        path: ['startDate'],
        message: 'Período exige startDate, endDate e timeZone.'
      });
    return;
  }
  if (value.startDate == null || value.endDate == null || value.timeZone == null) {
    context.addIssue({
      code: 'custom',
      path: ['startDate'],
      message: 'Período exige startDate, endDate e timeZone.'
    });
    return;
  }
  if (value.startDate > value.endDate) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'A data inicial não pode ser maior que a data final.'
    });
    return;
  }
  const days = (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86400000 + 1;
  if (days > REPORT_MAX_PERIOD_DAYS) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: `O período informado deve ter no máximo ${REPORT_MAX_PERIOD_DAYS} dias.`
    });
  }
});
