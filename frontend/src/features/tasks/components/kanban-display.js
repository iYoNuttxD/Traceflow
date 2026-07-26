export const KANBAN_COLUMNS = [
  { status: 'A_FAZER', label: 'A Fazer' },
  { status: 'EM_ANDAMENTO', label: 'Em Andamento' },
  { status: 'CONCLUIDO', label: 'Concluído' }
];

export const statusLabels = {
  A_FAZER: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído'
};

export const requirementStatusLabels = {
  CADASTRADO: 'Cadastrado',
  APROVADO: 'Aprovado',
  EM_IMPLEMENTACAO: 'Em implementação',
  VALIDADO: 'Validado',
  CONCLUIDO: 'Concluído',
  PENDENTE: 'Pendente',
  CANCELADO: 'Cancelado'
};

export const priorityLabels = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

export const historyFieldLabels = {
  STATUS: 'Status',
  DEADLINE: 'Prazo',
  RESPONSIBLE: 'Responsável',
  PRIORITY: 'Prioridade'
};

export function formatDate(value) {
  return value
    ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : 'Não informado';
}

export function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
}

export function formatHistoryValue(field, value, members) {
  if (value === null || value === undefined || value === '') return 'Não informado';
  if (field === 'STATUS') return statusLabels[value] || value;
  if (field === 'PRIORITY') return priorityLabels[value] || value;
  if (field === 'DEADLINE') return formatDate(value);
  if (field === 'RESPONSIBLE') {
    const membership = members.find((item) => String(item.user?.id || item.userId) === String(value));
    return membership?.user?.name || `Usuário #${value}`;
  }
  return value;
}

export function formatCommitLabel(commit) {
  const shortHash = commit.shortHash || commit.hash?.slice(0, 7) || `#${commit.id}`;
  return `${shortHash} — ${commit.message || 'Sem mensagem'}`;
}

export function formatRequirementLabel(requirement) {
  return requirement?.title || 'Requisito vinculado';
}

export function formatIssueLabel(issue) {
  return `#${issue.number} — ${issue.title}`;
}

export function formatIssueLabels(labels) {
  if (Array.isArray(labels)) return labels.length > 0 ? labels.join(', ') : 'sem labels';
  return typeof labels === 'string' && labels ? labels : 'sem labels';
}

export function getTraceabilitySummary(task) {
  const commitsCount = task.commits?.length || 0;
  const issuesCount = task.issues?.length || 0;
  const values = [
    task.requirement ? formatRequirementLabel(task.requirement) : '',
    task.pullRequest ? `PR #${task.pullRequest.number}` : '',
    commitsCount > 0 ? `${commitsCount} ${commitsCount === 1 ? 'commit' : 'commits'}` : '',
    issuesCount > 0 ? `${issuesCount} ${issuesCount === 1 ? 'issue' : 'issues'}` : ''
  ];
  return values.filter(Boolean).join(' · ') || 'Sem rastreabilidade';
}
