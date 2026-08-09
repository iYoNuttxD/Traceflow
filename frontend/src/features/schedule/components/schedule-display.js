// Rotulos e helpers puros de apresentacao do cronograma (RF10).
// Sem React, sem I/O: facil de testar isoladamente.

export const sprintStatusLabels = {
  PLANEJADA: 'Planejada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada'
};

export const milestoneStatusLabels = {
  PENDENTE: 'Pendente',
  CONCLUIDO: 'Concluído'
};

export const taskStatusLabels = {
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído'
};

export const taskPriorityLabels = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

export const TERMINAL_SPRINT_STATUSES = ['CONCLUIDA', 'CANCELADA'];

// Botao de transicao usa VERBO, nao o nome do estado de destino: "Concluir",
// e nao "Concluída", que se confunde com rotulo de status.
export const transitionLabels = {
  EM_ANDAMENTO: 'Iniciar',
  CONCLUIDA: 'Concluir',
  CANCELADA: 'Cancelar sprint'
};

export const transitionHints = {
  EM_ANDAMENTO: 'Marca o início real da sprint. Registra a data e hora de início.',
  CONCLUIDA:
    'Encerra a sprint e registra a data de conclusão. Ação definitiva: depois disso ela não pode ser editada, reaberta nem receber novas tarefas.',
  CANCELADA:
    'Encerra a sprint sem concluí-la. Ação definitiva: depois disso ela não pode ser editada, reaberta nem receber novas tarefas.'
};

// Transicoes que levam a estado terminal exigem confirmacao: nao ha volta.
export const isTerminalTransition = (status) => TERMINAL_SPRINT_STATUSES.includes(status);

export const isTerminalSprint = (status) => TERMINAL_SPRINT_STATUSES.includes(status);

// Transicoes oferecidas na interface. O backend continua sendo a fonte de verdade.
export const allowedSprintTransitions = {
  PLANEJADA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: []
};

// Datas de calendario chegam como YYYY-MM-DD e sao exibidas sem conversao de fuso,
// para nao deslocar o dia. Instantes reais usam o fuso local do navegador.
export function formatCalendarDate(value) {
  if (!value) return 'Não informado';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return 'Não informado';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
}

// Derivacao de atraso apenas para exibicao na lista de marcos, que e sempre
// completa e portanto nao vem do agregado (esse e filtrado por periodo).
// O backend continua sendo a fonte de verdade: no cronograma, `overdue` vem
// calculado de la. Vencer hoje nao e atraso, mesma regra do servidor.
export function isMilestoneOverdue(milestone, today = new Date()) {
  if (!milestone || milestone.status !== 'PENDENTE') return false;
  const due = /^(\d{4})-(\d{2})-(\d{2})/.exec(milestone.dueDate || '');
  if (!due) return false;
  const [, year, month, day] = due;
  const dueDay = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const reference = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return dueDay < reference;
}

export function formatSprintPeriod(sprint) {
  return `${formatCalendarDate(sprint.startDate)} a ${formatCalendarDate(sprint.endDate)}`;
}

export function formatDuration(durationInDays) {
  if (!durationInDays && durationInDays !== 0) return 'Não informado';
  return durationInDays === 1 ? '1 dia' : `${durationInDays} dias`;
}
