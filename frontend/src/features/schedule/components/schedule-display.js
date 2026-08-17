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

const pad = (value) => String(value).padStart(2, '0');

// Duas formas convivem no cronograma, e confundi-las desloca o dia:
//
// - dia de calendario puro (YYYY-MM-DD), usado pela janela do filtro e pelo eixo
//   da agenda: exibido sem conversao, senao 2026-08-08 viraria 07/08 no Brasil;
// - instante (ISO-8601 com hora), usado por sprint, marco e prazo: exibido no
//   fuso local, senao a tela mostraria o dia de Greenwich e nao o do usuario.
export function formatCalendarDate(value) {
  if (!value) return 'Não informado';
  const texto = String(value);
  const diaPuro = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (diaPuro) {
    const [, year, month, day] = diaPuro;
    return `${day}/${month}/${year}`;
  }
  const date = new Date(texto);
  if (Number.isNaN(date.getTime())) return 'Não informado';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// Instante com hora, quando ela existe. Meia-noite local costuma vir de quem
// informou apenas a data: exibir "00:00" sugeriria uma precisao que o usuario
// nao escolheu.
export function formatInstant(value) {
  if (!value) return 'Não informado';
  const dia = formatCalendarDate(value);
  // Dia de calendario puro nao tem hora para mostrar: converte-lo para instante
  // acrescentaria um "21:00" que ninguem informou, vindo do fuso local.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return dia;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dia;
  if (date.getHours() === 0 && date.getMinutes() === 0) return dia;
  return `${dia} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
}

// <input type="datetime-local"> fala no fuso local e sem offset. Converter nas
// duas pontas e o que faz o instante sobreviver a ida e volta do formulario.
export function toDateTimeLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Derivacao de atraso apenas para exibicao na lista de marcos, que e sempre
// completa e portanto nao vem do agregado (esse e filtrado por periodo).
// O backend continua sendo a fonte de verdade: no cronograma, `overdue` vem
// calculado de la. Vencer hoje nao e atraso, mesma regra do servidor.
export function isMilestoneOverdue(milestone, today = new Date()) {
  if (!milestone || milestone.status !== 'PENDENTE') return false;
  // Comparacao entre instantes, como no servidor: o marco vence numa hora, e
  // nao no fim de um dia inteiro.
  const due = new Date(milestone.dueDate || '');
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < today.getTime();
}

export function formatSprintPeriod(sprint) {
  return `${formatInstant(sprint.startDate)} a ${formatInstant(sprint.endDate)}`;
}

export function formatDuration(durationInDays) {
  if (!durationInDays && durationInDays !== 0) return 'Não informado';
  return durationInDays === 1 ? '1 dia' : `${durationInDays} dias`;
}
