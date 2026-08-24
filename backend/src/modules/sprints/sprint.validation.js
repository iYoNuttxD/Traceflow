// Contrato HTTP do modulo de sprints (RF10). Zod estrito: campo desconhecido e rejeitado.
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

// Mesmo union ja usado em deadline: aceita data de calendario ou ISO-8601 completo.
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
  // Obrigatorio na criacao (ADR-011 D02): o marco e o agrupador, e uma sprint
  // nova sem ele nasceria fora de qualquer entrega.
  milestoneId: positiveInteger('ID do marco inválido.')
});

export const updateSprintBodySchema = strictObject({
  name: requiredText({ message: 'O nome da sprint é obrigatório.' }).optional(),
  objective: optionalText({ field: 'Objetivo', max: 2000 }),
  startDate: scheduleDate('Data de início').optional(),
  endDate: scheduleDate('Data de fim').optional(),
  // `null` aqui e desvinculo explicito, nao ausencia: o service distingue os dois.
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

// Sem `sprintId`: quem declara o vinculo e a sprint (ADR-011 D01). O objeto e
// estrito, entao um cliente antigo que ainda enviar o campo recebe 400 em vez de
// ter o vinculo descartado em silencio.
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

// Janela do cronograma. Sem from/to retorna tudo; com janela exige from <= to.
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

// Evolução por sprint (RF35). `at` é recusado de forma explícita, com motivo:
// sprint aberta não tem série histórica de status — só o estado corrente de cada
// participação —, e sprint encerrada devolve sempre o resultado congelado, que
// não depende do instante da consulta. Nos dois casos, aceitar `at` devolveria
// um número carimbado com uma data que ele não representa. Recusar é honesto;
// ignorar em silêncio seria métrica enganosa.
export const sprintProgressQuerySchema = strictObject({
  at: z
    .never({
      error:
        'Corte no passado não é suportado: sprint aberta não guarda série histórica e sprint encerrada devolve o resultado congelado.'
    })
    .optional()
});

// O limite vem do dominio, e nao de um numero digitado aqui: a associacao
// individual aplica exatamente o mesmo (ADR-010 D14). Dois limites diferentes
// para a mesma capacidade deixariam a sprint chegar a um estado que este
// endpoint nao consegue representar.
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
