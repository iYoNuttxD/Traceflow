import { z } from 'zod';
import {
  dateOnly,
  isoDateTime,
  optionalDateOnly,
  optionalText,
  positiveInteger,
  requiredText,
  searchText,
  strictObject
} from '../../shared/validation/index.js';
import { SPRINT_MAX_TASKS } from './sprint.schema.js';

const scheduleDate = (label) => z.union([dateOnly(label), isoDateTime(label)]);

const sprintStatus = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z.enum(['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'], {
      error: 'Status inválido. Use PLANEJADA, EM_ANDAMENTO, CONCLUIDA ou CANCELADA.'
    })
  );

const milestoneStatus = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z.enum(['PENDENTE', 'CONCLUIDO'], {
      error: 'Status inválido. Use PENDENTE ou CONCLUIDO.'
    })
  );

export const sprintProjectParamsSchema = strictObject({
  projectId: positiveInteger('ID do projeto inválido.')
});

export const sprintIdParamsSchema = strictObject({
  id: positiveInteger('ID da sprint inválido.')
});

export const milestoneIdParamsSchema = strictObject({
  id: positiveInteger('ID do marco inválido.')
});

export const createSprintBodySchema = strictObject({
  name: requiredText({ message: 'O nome da sprint é obrigatório.' }),
  objective: optionalText({ field: 'Objetivo', max: 2000 }),
  startDate: scheduleDate('Data de início'),
  endDate: scheduleDate('Data de fim'),
  milestoneId: positiveInteger('ID do marco inválido.')
});

export const updateSprintBodySchema = strictObject({
  name: requiredText({ message: 'O nome da sprint é obrigatório.' }).optional(),
  objective: optionalText({ field: 'Objetivo', max: 2000 }),
  startDate: scheduleDate('Data de início').optional(),
  endDate: scheduleDate('Data de fim').optional(),
  milestoneId: positiveInteger('ID do marco inválido.').nullable().optional()
}).refine(
  (value) => Object.keys(value).length > 0,
  'Informe ao menos um campo para atualizar a sprint.'
);

export const sprintStatusBodySchema = strictObject({ status: sprintStatus });

export const sprintSearchQuerySchema = strictObject({
  status: sprintStatus.optional(),
  search: searchText
});

export const createMilestoneBodySchema = strictObject({
  title: requiredText({ message: 'O título do marco é obrigatório.' }),
  description: optionalText({ field: 'Descrição', max: 2000 }),
  dueDate: scheduleDate('Data prevista')
});

export const updateMilestoneBodySchema = strictObject({
  title: requiredText({ message: 'O título do marco é obrigatório.' }).optional(),
  description: optionalText({ field: 'Descrição', max: 2000 }),
  dueDate: scheduleDate('Data prevista').optional()
}).refine(
  (value) => Object.keys(value).length > 0,
  'Informe ao menos um campo para atualizar o marco.'
);

export const milestoneStatusBodySchema = strictObject({ status: milestoneStatus });

export const milestoneSearchQuerySchema = strictObject({
  status: milestoneStatus.optional()
});

export const scheduleQuerySchema = strictObject({
  from: optionalDateOnly('Data inicial'),
  to: optionalDateOnly('Data final')
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: 'custom',
      path: ['to'],
      message: 'A data inicial não pode ser maior que a data final.'
    });
  }
});

export const sprintProgressQuerySchema = strictObject({
  at: z
    .never({
      error:
        'Corte no passado não é suportado: sprint aberta não guarda série histórica e sprint encerrada devolve o resultado congelado.'
    })
    .optional()
});

export const replaceSprintTasksBodySchema = strictObject({
  taskIds: z
    .array(positiveInteger('ID da tarefa inválido.'))
    .max(
      SPRINT_MAX_TASKS,
      `No máximo ${SPRINT_MAX_TASKS} tarefas podem ser atualizadas por operação.`
    )
    .refine(
      (taskIds) => new Set(taskIds).size === taskIds.length,
      'A lista de tarefas não pode conter IDs duplicados.'
    )
});
