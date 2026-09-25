export const DASHBOARD_VIEWS = [
  ['GENERAL', 'Geral'],
  ['GITHUB', 'GitHub'],
  ['FLOW', 'Fluxo'],
  ['SPRINT', 'Sprint'],
  ['TASK', 'Tarefas'],
  ['QUALITY', 'Qualidade'],
  ['TRACEABILITY', 'Rastreabilidade']
];

export const VIEW_LABELS = Object.fromEntries(DASHBOARD_VIEWS);

export const SECTION_LABELS = {
  summary: 'Panorama',
  sprint: 'Sprint em foco',
  activity: 'Atividade técnica',
  pullRequests: 'Pull Requests',
  issues: 'Issues',
  flow: 'Fluxo de trabalho',
  planning: 'Plano e entrega',
  history: 'Histórico',
  scope: 'Mudanças de escopo',
  tasks: 'Tarefas',
  tests: 'Testes',
  defects: 'Defeitos',
  concentration: 'Concentração',
  coverage: 'Dimensões de rastreabilidade'
};

export const METRIC_TITLES = {
  I49: 'Taxa de sucesso',
  I50: 'Taxa de falha',
  I51: 'Taxa de bloqueio'
};

export const FIELD_LABELS = {
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  ABERTO: 'Aberto',
  EM_CORRECAO: 'Em correção',
  AGUARDANDO_RETESTE: 'Aguardando reteste',
  VALIDADO: 'Validado',
  PASS: 'Aprovado',
  FAIL: 'Falhou',
  BLOCKED: 'Bloqueado',
  NEVER_EXECUTED: 'Nunca executado',
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
  reworkRate: 'Retrabalho',
  mergedRate: 'Mescladas',
  incoming: 'Entrada',
  outgoing: 'Saída',
  estimatedHours: 'Estimado',
  actualHours: 'Realizado',
  differenceHours: 'Desvio',
  addedCount: 'Adicionadas',
  removedCount: 'Removidas',
  changed: 'Houve alteração',
  todo: 'A fazer',
  inProgress: 'Em andamento',
  done: 'Concluído',
  remaining: 'Restante',
  ideal: 'Ideal',
  scope: 'Escopo total',
  completed: 'Trabalho concluído',
  value: 'Valor',
  completedPoints: 'Pontos concluídos'
};

export const LIMITATION_LABELS = {
  PERIOD_REQUIRED: 'Escolha um período para consultar este indicador.',
  PERIOD_REQUIRED_FOR_EVENT_INDICATORS: 'Escolha um período para consultar eventos históricos.',
  SOURCE_UNAVAILABLE: 'A fonte deste indicador está temporariamente indisponível.',
  PERIOD_NOT_COMPLETE: 'O período selecionado ainda não terminou.',
  NO_COMPLETED_CIVIL_DAYS: 'Ainda não há dias civis completos no período selecionado.',
  NO_ACTIVE_SPRINT: 'Não há Sprint ativa. Selecione uma Sprint histórica.',
  MULTIPLE_ACTIVE_SPRINTS: 'Há mais de uma Sprint ativa. Selecione uma Sprint.',
  SPRINT_NOT_STARTED: 'A Sprint ainda não começou.',
  BURNDOWN_DATA_UNAVAILABLE: 'Não há histórico suficiente para desenhar o Burndown.',
  BURNDOWN_MAX_180_DAYS: 'O Burndown está limitado a 180 dias.',
  BURNUP_COVERAGE_STARTED_MID_SPRINT: 'Histórico disponível apenas a partir de parte da Sprint.',
  BURNUP_ESTIMATE_UNKNOWN: 'Parte das estimativas históricas é desconhecida.',
  CARRY_OVER_REENTRY_HISTORY_MAY_BE_COLLAPSED:
    'Reentradas de tarefas entre Sprints podem estar agrupadas no histórico.',
  SCOPE_REENTRY_EVENTS_COLLAPSED: 'Reentradas no escopo podem estar agrupadas.',
  INITIAL_STATE_NOT_GLOBALLY_PROVEN:
    'O estado inicial anterior ao histórico disponível é desconhecido.',
  TASK_HISTORY_CHAIN_INCOMPLETE: 'O histórico de algumas tarefas está incompleto.',
  HARD_DELETED_TASK_HISTORY_NOT_RECOVERABLE:
    'O histórico de tarefas excluídas permanentemente não pode ser recuperado.',
  HARD_DELETED_TASKS_EXCLUDED: 'Tarefas excluídas permanentemente não entram no cálculo.',
  INCOMPLETE_OR_INVALID_COMPLETION_HISTORY:
    'Algumas conclusões têm histórico incompleto ou inválido.',
  UNOBSERVED_COMPLETION_HISTORY: 'Parte do histórico de conclusão não foi observada.',
  INCOMPLETE_TERMINAL_SNAPSHOT_EXCLUDED:
    'Sprints concluídas sem registro final completo foram excluídas.',
  LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE: 'O registro histórico de planejamento não está disponível.',
  INVALID_OR_MISSING_TIMESTAMPS_EXCLUDED: 'Eventos sem data válida foram excluídos.',
  UNKNOWN_TASK_STATUS_EXCLUDED: 'Tarefas com status desconhecido foram excluídas.',
  WIP_ENTRY_HISTORY_NOT_VERIFIABLE:
    'A entrada histórica de algumas tarefas em andamento não pôde ser verificada.',
  MISSING_FIRST_IN_PROGRESS_OR_COMPLETION:
    'Falta o primeiro evento em andamento ou a conclusão de algumas tarefas.',
  TASK_ESTIMATE_MISSING: 'Algumas tarefas não têm estimativa registrada.',
  TASK_ACTUAL_EFFORT_MISSING: 'Algumas tarefas não têm esforço realizado registrado.',
  COMPLETED_TASK_ACTUAL_EFFORT_MISSING:
    'Algumas tarefas concluídas não têm esforço realizado registrado.',
  SPRINT_EFFORT_INCOMPLETE: 'O registro de esforço da Sprint está incompleto.',
  ACTUAL_EFFORT_ALREADY_INCLUDES_SESSIONS_AND_LEGACY:
    'O esforço realizado já inclui sessões e registros legados.',
  VELOCITY_LIMIT_APPLIED: 'A série de velocidade foi limitada ao número máximo de Sprints.',
  CURRENT_STATE_ONLY: 'Este indicador representa apenas o estado atual.',
  CURRENT_STATE_NOT_APPLICABLE_TO_TERMINAL_SPRINT:
    'O estado atual não representa uma Sprint encerrada.',
  CURRENT_MEMBERSHIP_ONLY: 'A associação de membros reflete apenas o estado atual.',
  ACTIVITY_IS_NOT_PERFORMANCE: 'Atividade registrada não mede desempenho individual.',
  RESPONSIBLE_NOT_RESOLVABLE: 'Não foi possível identificar o responsável em todos os registros.',
  LEGACY_RESPONSIBLE_SNAPSHOT_MISSING:
    'Alguns registros antigos não têm responsável preservado no histórico.',
  RESPONSIBLE_FILTER_UNSAFE_NOT_APPLIED: 'O filtro por responsável não foi aplicado com segurança.',
  SPRINT_FILTER_UNSAFE_NOT_APPLIED: 'O filtro de Sprint não foi aplicado a este indicador.',
  PERIOD_FILTER_UNSAFE_NOT_APPLIED: 'O filtro de período não foi aplicado a este indicador.',
  RESPONSIBLE_FILTER_NOT_APPLIED_TO_VIEW: 'O filtro por responsável não se aplica a esta visão.',
  SPRINT_FILTER_NOT_APPLIED_TO_VIEW: 'O filtro de Sprint não se aplica a esta visão.',
  PERIOD_FILTER_NOT_APPLIED_TO_VIEW: 'O filtro de período não se aplica a esta visão.',
  COMPARISON_SAMPLE_INCOMPLETE: 'A amostra disponível para comparação está incompleta.',
  GITHUB_INTEGRATION_NOT_ACTIVE: 'A integração com GitHub não está ativa neste projeto.',
  GITHUB_SNAPSHOT_NOT_AVAILABLE: 'Ainda não há dados sincronizados do GitHub.',
  GITHUB_SYNC_FAILED: 'A última sincronização com GitHub falhou.',
  GITHUB_SYNC_STALE: 'Os dados GitHub podem estar desatualizados.',
  MAIN_BRANCH_NOT_OBSERVED: 'A branch principal ainda não foi observada.',
  MAIN_HEAD_NOT_RECONCILED: 'O estado atual da branch principal não foi reconciliado.',
  MAIN_MEMBERSHIP_NOT_CONFIRMED: 'Não foi possível confirmar a presença na branch principal.',
  COMMIT_AUTHOR_NOT_ASSOCIATED: 'O autor de alguns commits não está associado a um membro.',
  ISSUE_LIFECYCLE_NOT_COLLECTED: 'O histórico de ciclo de vida das Issues não foi coletado.',
  PR_LIFECYCLE_PERIOD_NOT_COVERED: 'O período não está coberto pelo histórico de Pull Requests.',
  SOFT_DELETED_DEFECTS_EXCLUDED: 'Defects excluídos foram retirados do cálculo.',
  VALIDATION_HISTORY_INCOMPLETE_OR_INVALID:
    'O histórico de validação de alguns TestCases está incompleto ou inválido.',
  LEGACY_VALIDATION_WITHOUT_EVENT_UNDATED:
    'Validações antigas sem evento não têm data histórica confiável.',
  DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS:
    'Um Defect pode aparecer em mais de um Requirement; as barras não formam um total.'
};

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function formatNumber(value) {
  return numberFormat.format(value);
}

export function formatDateTime(value) {
  if (!value) return 'Não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  }).format(date);
}

export function formatMetricValue(value, unit) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (unit === 'PERCENT') return `${formatNumber(value)}%`;
  if (unit === 'HOURS') return `${formatNumber(value)} h`;
  if (unit === 'DAYS') return `${formatNumber(value)} dias`;
  return formatNumber(value);
}

export function formatFieldValue(value, key, unit) {
  if (key.toLowerCase().includes('hours')) return formatMetricValue(value, 'HOURS');
  if (key.toLowerCase().includes('rate')) return formatMetricValue(value, 'PERCENT');
  return formatMetricValue(value, unit === 'RATE_VECTOR' ? undefined : unit);
}

export function labelForField(key) {
  return FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ');
}

export function describeLimitation(code) {
  return (
    LIMITATION_LABELS[code] ?? `Limitação da fonte: ${code.replaceAll('_', ' ').toLowerCase()}.`
  );
}

export function dashboardTimeZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && zone.includes('/') ? zone : 'UTC';
}
