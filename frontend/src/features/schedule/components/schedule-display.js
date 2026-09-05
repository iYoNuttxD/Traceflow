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

export const isTerminalTransition = (status) => TERMINAL_SPRINT_STATUSES.includes(status);

export const isTerminalSprint = (status) => TERMINAL_SPRINT_STATUSES.includes(status);

export const allowedSprintTransitions = {
  PLANEJADA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: [],
  CANCELADA: []
};

const pad = (value) => String(value).padStart(2, '0');

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

export function formatInstant(value) {
  if (!value) return 'Não informado';
  const dia = formatCalendarDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return dia;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dia;
  if (date.getHours() === 0 && date.getMinutes() === 0) return dia;
  return `${dia} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
}

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

export function isMilestoneOverdue(milestone, today = new Date()) {
  if (!milestone || milestone.status !== 'PENDENTE') return false;
  const due = new Date(milestone.dueDate || '');
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < today.getTime();
}

export function formatSprintPeriod(sprint) {
  return `${formatInstant(sprint.startDate)} a ${formatInstant(sprint.endDate)}`;
}

export function formatSprintCardPeriod(sprint) {
  const compact = (value) => {
    const formatted = formatCalendarDate(value);
    return formatted === 'Não informado' ? formatted : formatted.slice(0, 5);
  };
  return `${compact(sprint.startDate)} – ${compact(sprint.endDate)}`;
}

export function sprintTerminalConfirm(sprint, status, pendentes, impact = null) {
  if (status === 'CONCLUIDA') {
    return {
      title: 'Concluir sprint?',
      description:
        `A sprint "${sprint.name}" será marcada como concluída e congelada: ela não poderá ` +
        'ser editada, reaberta nem receber novas tarefas. ' +
        (impact
          ? `${impact.completedTasks} tarefa(s) concluída(s) permanecerão no registro. ` +
            (impact.pendingTasks
              ? impact.destination
                ? `${impact.pendingTasks} tarefa(s) pendente(s) seguirão para a sprint "${impact.destination.name}".`
                : `${impact.pendingTasks} tarefa(s) pendente(s) voltarão ao backlog; não há próxima Sprint planejada válida.`
              : 'Não há tarefas pendentes para transferir.')
          : pendentes
            ? `${pendentes} tarefa(s) não concluída(s) seguirão para a próxima sprint planejada válida. Se não houver uma próxima sprint, voltarão ao backlog.`
            : 'Todas as tarefas da sprint foram concluídas.'),
      cancelLabel: 'Voltar',
      confirmLabel: 'Concluir e congelar',
      destructive: false
    };
  }
  return {
    title: 'Cancelar sprint?',
    description:
      `A sprint "${sprint.name}" será marcada como cancelada e deixa de ocupar o cronograma: ` +
      'ela não poderá ser editada, reaberta nem receber novas tarefas. ' +
      (pendentes
        ? `${pendentes} tarefa(s) pendente(s) voltarão ao backlog.`
        : 'As tarefas concluídas permanecem registradas.'),
    cancelLabel: 'Voltar',
    confirmLabel: 'Cancelar sprint',
    destructive: true
  };
}

export function sprintStatusKey(sprint, today = new Date()) {
  if (sprint.status !== 'EM_ANDAMENTO') return sprint.status;
  const fim = new Date(sprint.endDate || '');
  if (Number.isNaN(fim.getTime())) return sprint.status;
  return fim.getTime() < today.getTime() ? 'ATRASADA' : 'EM_ANDAMENTO';
}

export const sprintStatusKeyLabels = {
  ...sprintStatusLabels,
  ATRASADA: 'Atrasada'
};

export const statusBadgeClass = (key) => `status-badge status-${String(key).toLowerCase()}`;

export function summarizeSprintTasks(scheduleSprint) {
  const tasks = scheduleSprint?.tasks || [];
  const pontos = (list) =>
    list.reduce((soma, task) => soma + (Number(task.estimatedEffort) || 0), 0);
  const concluidas = tasks.filter((task) => task.status === 'CONCLUIDO');
  const total = pontos(tasks);
  const feitos = pontos(concluidas);
  return {
    total: tasks.length,
    done: concluidas.length,
    points: total,
    donePoints: feitos,
    percent: total > 0 ? Math.round((feitos / total) * 100) : null
  };
}

export function getSprintDisplayMetrics(sprint, scheduleSprint = sprint) {
  if (!isTerminalSprint(sprint?.status))
    return { ...summarizeSprintTasks(scheduleSprint), unavailable: false };
  const frozen = sprint?.historicalSummary ?? scheduleSprint?.historicalSummary;
  return {
    total: frozen?.totalTasks ?? null,
    done: frozen?.completedTasks ?? null,
    points: frozen?.totalPoints ?? null,
    donePoints: frozen?.completedPoints ?? null,
    percent: frozen?.percentage ?? null,
    unavailable:
      !frozen ||
      frozen.completedTasks == null ||
      frozen.totalPoints == null ||
      frozen.completedPoints == null
  };
}

export function milestoneProgress(milestoneId, sprints) {
  const doMarco = sprints.filter((sprint) => sprint.milestoneId === milestoneId);
  const consideradas = doMarco.filter((sprint) => sprint.status !== 'CANCELADA');
  const done = consideradas.filter((sprint) => sprint.status === 'CONCLUIDA').length;
  return {
    sprints: doMarco,
    total: consideradas.length,
    done,
    percent: consideradas.length ? Math.round((done / consideradas.length) * 100) : 0,
    allConcluded: consideradas.length > 0 && done === consideradas.length
  };
}

export function formatDuration(durationInDays) {
  if (!durationInDays && durationInDays !== 0) return 'Não informado';
  return durationInDays === 1 ? '1 dia' : `${durationInDays} dias`;
}

export function sprintDeleteConfirm(sprint, currentTasks) {
  return {
    title: 'Excluir sprint?',
    description:
      `A sprint "${sprint.name}" será removida das visões atuais do projeto. Seu histórico e snapshots serão preservados. ` +
      (currentTasks
        ? `${currentTasks} tarefa(s) atualmente associada(s) voltarão ao backlog. `
        : 'Nenhuma tarefa atual será movimentada. ') +
      'Esta ação não conclui a Sprint nem transfere tarefas para outra Sprint.',
    confirmLabel: 'Excluir sprint',
    cancelLabel: 'Voltar',
    destructive: true
  };
}
