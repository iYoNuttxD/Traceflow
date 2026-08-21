// Parse, normalizacao e erros de dominio do modulo de sprints (RF10).
// Sem Prisma, sem Express: apenas regras de forma e vocabulario do dominio.
import { DomainError, ERROR_CODES, resourceNotFoundError } from '../../shared/errors/index.js';

export class SprintServiceError extends DomainError {
  constructor(message, statusCode = 400, code) {
    super(message, statusCode, code, { exposeTechnicalDetails: true });
    this.name = 'SprintServiceError';
  }
}

export const SPRINT_STATUSES = Object.freeze([
  'PLANEJADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'CANCELADA'
]);
export const MILESTONE_STATUSES = Object.freeze(['PENDENTE', 'CONCLUIDO']);
export const TERMINAL_SPRINT_STATUSES = Object.freeze(['CONCLUIDA', 'CANCELADA']);

// Transicoes permitidas da sprint. Estados terminais nao transicionam.
export const SPRINT_TRANSITIONS = Object.freeze({
  PLANEJADA: Object.freeze(['EM_ANDAMENTO', 'CANCELADA']),
  EM_ANDAMENTO: Object.freeze(['CONCLUIDA', 'CANCELADA']),
  CONCLUIDA: Object.freeze([]),
  CANCELADA: Object.freeze([])
});

export const isTerminalSprintStatus = (status) => TERMINAL_SPRINT_STATUSES.includes(status);

// Limite unico de dominio (ADR-010 D14), aplicado tanto na substituicao em lote
// quanto na associacao individual. Dois limites diferentes para a mesma
// capacidade deixariam a sprint chegar a um estado que o editor nao consegue
// representar: com 101 tarefas, nenhum salvamento do painel passaria.
export const SPRINT_MAX_TASKS = 100;

// Motivos de saida de uma participacao. Espelham SprintTaskRemovalReason.
export const REMOVAL_REASONS = Object.freeze({
  MOVIDA: 'MOVIDA',
  REMOVIDA: 'REMOVIDA',
  TAREFA_EXCLUIDA: 'TAREFA_EXCLUIDA'
});

function parsePositiveInteger(value, entityName, code) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new SprintServiceError(`ID ${entityName} inválido.`, 400, code);
  }
  return parsedValue;
}

export const parseProjectId = (value) =>
  parsePositiveInteger(value, 'do projeto', ERROR_CODES.VALIDATION_ERROR);
export const parseSprintId = (value) =>
  parsePositiveInteger(value, 'da sprint', ERROR_CODES.VALIDATION_ERROR);
export const parseMilestoneId = (value) =>
  parsePositiveInteger(value, 'do marco', ERROR_CODES.VALIDATION_ERROR);
export const parseTaskId = (value) =>
  parsePositiveInteger(value, 'da tarefa', ERROR_CODES.VALIDATION_ERROR);

export function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return String(value);
  return value.trim() || null;
}

// Converte data de calendario (YYYY-MM-DD) ou ISO-8601 completo no INSTANTE que
// ele representa (ADR-010 D05). A versao anterior truncava para a meia-noite UTC,
// o que nao era arredondamento: era descarte silencioso de hora, minuto, segundo
// e fuso. `2026-08-14T23:59:59-03:00` virava `2026-08-15T00:00:00Z`, mudando ate
// o dia percebido pelo usuario.
//
// `YYYY-MM-DD` continua aceito e significa o inicio daquele dia em UTC — um
// atalho documentado para quem so tem data, nao uma normalizacao de quem tem hora.
export function parseInstant(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
    }
    return value;
  }
  if (typeof value !== 'string') {
    throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return parseUtcDay(dateOnly, label);

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new SprintServiceError(`${label} inválida.`, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  return parsed;
}

function parseUtcDay([, yearText, monthText, dayText], label) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Data civil real: 2026-02-30 nao pode virar 02 de marco em silencio.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new SprintServiceError(
      `${label} inválida. Use o formato YYYY-MM-DD.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  return date;
}

// A janela do cronograma continua sendo dia de calendario, interpretado em UTC
// (ADR-010 D15). `to` e convertido para o INICIO DO DIA SEGUINTE: o usuario que
// filtra "até 14/08" espera o dia 14 inteiro, e comparar contra a meia-noite do
// dia 14 excluiria tudo o que acontece nele.
export function parseWindowDay(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!dateOnly) {
    throw new SprintServiceError(
      `${label} inválida. Use o formato YYYY-MM-DD.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  return parseUtcDay(dateOnly, label);
}

export function nextUtcDay(date) {
  return date ? new Date(date.getTime() + 86400000) : null;
}

// Janela semiaberta [startDate, endDate): duracao zero nao e sprint, e a
// comparacao estrita e o que permite a sprint seguinte comecar exatamente no
// instante em que esta termina, sem sobreposicao (ADR-010 D03).
export function ensureDateRange(startDate, endDate) {
  if (startDate && endDate && startDate.getTime() >= endDate.getTime()) {
    throw new SprintServiceError(
      'A data de início precisa ser anterior à data de fim.',
      400,
      ERROR_CODES.SPRINT_DATE_RANGE_INVALID
    );
  }
}

// Duas janelas semiabertas se cruzam quando cada uma comeca antes do fim da
// outra. Fim == inicio nao e cruzamento: e emenda.
export function sprintsOverlap(a, b) {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

// Sprints do mesmo projeto sao sequenciais (ADR-010 D03). A verificacao roda
// dentro da transacao com o projeto travado: consultar e depois inserir, sem
// lock, deixa duas criacoes simultaneas passarem pela mesma checagem.
export function ensureNoOverlap(candidate, sprints, ignoreId = null) {
  const conflito = sprints.find(
    (sprint) => sprint.id !== ignoreId && sprintsOverlap(candidate, sprint)
  );
  if (conflito) {
    throw new SprintServiceError(
      `O período informado conflita com a sprint "${conflito.name}". As sprints do projeto não podem se sobrepor.`,
      409,
      ERROR_CODES.SPRINT_OVERLAP
    );
  }
  return candidate;
}

// Pertencimento a janela semiaberta, na mesma convencao de D03: vencer no
// instante final ja e a sprint seguinte. Uma unica definicao para as duas regras
// que dependem dela — a do marco e a da janela — porque duas comparacoes
// separadas podem divergir na borda sem que nenhum teste perceba.
export function isWithinWindow(instant, window) {
  return instant >= window.startDate && instant < window.endDate;
}

// A data prevista do marco precisa cair na janela da sprint (ADR-010 D11).
export function ensureMilestoneWithinSprint(dueDate, sprint) {
  if (!dueDate) return;
  if (!isWithinWindow(dueDate, sprint)) {
    throw new SprintServiceError(
      'A data prevista do marco precisa estar dentro do período da sprint.',
      400,
      ERROR_CODES.MILESTONE_DUE_DATE_OUTSIDE_SPRINT
    );
  }
}

// A outra ponta de D11: mover a janela nao pode EMPURRAR PARA FORA um marco que
// estava dentro dela. Validar so na escrita do marco deixava a regra valer por um
// instante — bastava encolher a sprint depois para o marco passar a vencer fora
// do periodo que ele deveria ancorar.
//
// O criterio e "estava dentro", e nao "a janela veio no corpo". Dois motivos:
// o formulario do painel reenvia as quatro chaves a cada salvamento, entao a
// presenca das datas nao distingue um rename de uma mudanca de periodo; e o
// backfill da migration s104 vinculou a ultima sprint do projeto os marcos que
// nao cabiam em janela nenhuma, de modo que cobrar o conjunto inteiro trancaria
// a sprint por um legado que quem renomeia nao criou.
export function ensureMilestonesStayWithinWindow(milestones, currentWindow, nextWindow) {
  const empurrado = milestones.find(
    (milestone) =>
      isWithinWindow(milestone.dueDate, currentWindow) &&
      !isWithinWindow(milestone.dueDate, nextWindow)
  );
  if (empurrado) {
    throw new SprintServiceError(
      `O período informado deixaria o marco "${empurrado.title}" fora da sprint. Ajuste o marco antes de alterar a janela.`,
      409,
      ERROR_CODES.SPRINT_WINDOW_MILESTONE_CONFLICT
    );
  }
  return milestones;
}

export function ensureSprintStatus(status) {
  if (!SPRINT_STATUSES.includes(status)) {
    throw new SprintServiceError(
      `Status inválido. Use ${SPRINT_STATUSES.join(', ')}.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  return status;
}

export function ensureMilestoneStatus(status) {
  if (!MILESTONE_STATUSES.includes(status)) {
    throw new SprintServiceError(
      `Status inválido. Use ${MILESTONE_STATUSES.join(' ou ')}.`,
      400,
      ERROR_CODES.VALIDATION_ERROR
    );
  }
  return status;
}

export function ensureTransitionAllowed(currentStatus, nextStatus) {
  ensureSprintStatus(nextStatus);
  const allowed = SPRINT_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new SprintServiceError(
      'Transição de status não permitida para esta sprint.',
      409,
      ERROR_CODES.SPRINT_INVALID_TRANSITION
    );
  }
  return nextStatus;
}

export function ensureSprintEditable(sprint) {
  if (isTerminalSprintStatus(sprint.status)) {
    throw new SprintServiceError(
      'Sprint concluída ou cancelada não pode ser editada.',
      409,
      ERROR_CODES.SPRINT_LOCKED
    );
  }
  return sprint;
}

// Escopo de sprint encerrada e imutavel (ADR-010 D04): nem acrescenta nem
// remove. A versao anterior permitia remover, para nao "prender" a sprint antes
// da exclusao — mas a exclusao deixou de existir (D06), e o impasse com ela.
export function ensureSprintScopeMutable(sprint) {
  if (isTerminalSprintStatus(sprint.status)) {
    throw new SprintServiceError(
      'Sprint concluída ou cancelada é registro histórico: seu escopo não pode ser alterado.',
      409,
      ERROR_CODES.SPRINT_SCOPE_LOCKED
    );
  }
  return sprint;
}

export function ensureWithinTaskLimit(total) {
  if (total > SPRINT_MAX_TASKS) {
    throw new SprintServiceError(
      `Uma sprint aceita no máximo ${SPRINT_MAX_TASKS} tarefas.`,
      409,
      ERROR_CODES.SPRINT_TASK_LIMIT_REACHED
    );
  }
  return total;
}

export function sprintDeleteNotSupportedError() {
  return new SprintServiceError(
    'Sprint não pode ser excluída: o cronograma é registro histórico do projeto.',
    405,
    ERROR_CODES.SPRINT_DELETE_NOT_SUPPORTED
  );
}

// A sprint a travar sai do marco lido ANTES da transacao. Se outra requisicao o
// moveu nesse intervalo, travamos a sprint errada e nao ha como validar com
// honestidade: recusar e pedir nova tentativa e melhor do que decidir sobre uma
// sprint que ja nao e a dele.
export function milestoneSprintChangedError() {
  return new SprintServiceError(
    'O marco mudou de sprint durante a operação. Recarregue e tente novamente.',
    409,
    ERROR_CODES.MILESTONE_SPRINT_CHANGED
  );
}

export function taskNotFoundError() {
  return new SprintServiceError('Tarefa não encontrada.', 404, ERROR_CODES.TASK_NOT_FOUND);
}

// Constroi o payload de escrita da sprint a partir da entrada ja validada no HTTP.
export function buildSprintData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};
  const sprintData = {};

  if (isCreate || payload.name !== undefined) {
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
      throw new SprintServiceError(
        'O nome da sprint é obrigatório.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    sprintData.name = payload.name.trim();
  }
  if (payload.objective !== undefined) {
    sprintData.objective = normalizeOptionalText(payload.objective);
  }
  if (isCreate || payload.startDate !== undefined) {
    const startDate = parseInstant(payload.startDate, 'Data de início');
    if (!startDate) {
      throw new SprintServiceError(
        'A data de início da sprint é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    sprintData.startDate = startDate;
  }
  if (isCreate || payload.endDate !== undefined) {
    const endDate = parseInstant(payload.endDate, 'Data de fim');
    if (!endDate) {
      throw new SprintServiceError(
        'A data de fim da sprint é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    sprintData.endDate = endDate;
  }
  return sprintData;
}

export function buildMilestoneData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};
  const milestoneData = {};

  if (isCreate || payload.title !== undefined) {
    if (typeof payload.title !== 'string' || !payload.title.trim()) {
      throw new SprintServiceError(
        'O título do marco é obrigatório.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    milestoneData.title = payload.title.trim();
  }
  if (payload.description !== undefined) {
    milestoneData.description = normalizeOptionalText(payload.description);
  }
  if (isCreate || payload.dueDate !== undefined) {
    const dueDate = parseInstant(payload.dueDate, 'Data prevista');
    if (!dueDate) {
      throw new SprintServiceError(
        'A data prevista do marco é obrigatória.',
        400,
        ERROR_CODES.VALIDATION_ERROR
      );
    }
    milestoneData.dueDate = dueDate;
  }
  // Todo marco pertence a uma sprint: a conclusao fica ancorada no periodo de
  // desenvolvimento que a produziu, e nao numa data solta do projeto (ADR-010 D02).
  if (isCreate || payload.sprintId !== undefined) {
    if (payload.sprintId === undefined || payload.sprintId === null) {
      throw new SprintServiceError(
        'A sprint do marco é obrigatória.',
        400,
        ERROR_CODES.MILESTONE_SPRINT_REQUIRED
      );
    }
    milestoneData.sprintId = parseSprintId(payload.sprintId);
  }
  return milestoneData;
}

export function ensureAtLeastOneField(data, message) {
  if (!data || Object.keys(data).length === 0) {
    throw new SprintServiceError(message, 400, ERROR_CODES.VALIDATION_ERROR);
  }
  return data;
}

// Erro de unicidade do Prisma (P2002) na chave [projectId, name].
export function isUniqueNameViolation(error) {
  return error?.code === 'P2002';
}

export function sprintNameConflictError() {
  return new SprintServiceError(
    'Já existe uma sprint com este nome neste projeto.',
    409,
    ERROR_CODES.SPRINT_NAME_IN_USE
  );
}

// Delegam à fábrica compartilhada para não poderem divergir do 404 que o
// middleware emite ao barrar um recurso de projeto alheio.
export function sprintNotFoundError() {
  return resourceNotFoundError('Sprint');
}

export function milestoneNotFoundError() {
  return resourceNotFoundError('Milestone');
}
