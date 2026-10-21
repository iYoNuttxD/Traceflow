// Vocabulário do PDF (S2-07). Cópia fiel dos rótulos usados pelo painel de Indicadores,
// pela Rastreabilidade e pelo Cronograma no frontend, para que o PDF diga exatamente o
// mesmo que a tela. A paridade é verificada em test/unit/report-pdf-labels.test.js:
// ao mudar um rótulo no frontend, atualize-o aqui também.

export const VIEW_LABELS = Object.freeze({
  GENERAL: 'Geral',
  PLANNING: 'Planejamento',
  GITHUB: 'GitHub',
  FLOW: 'Fluxo',
  SPRINT: 'Sprint',
  TASK: 'Tarefas',
  QUALITY: 'Qualidade',
  TRACEABILITY: 'Rastreabilidade'
});

export const METRIC_TITLES = Object.freeze({
  I25: 'Fluxo cumulativo',
  I49: 'Taxa de sucesso',
  I50: 'Taxa de falha',
  I51: 'Taxa de bloqueio',
  I47: 'Velocidade das Sprints',
  I52: 'Estado atual dos casos de teste',
  I59: 'Defeitos por requisito',
  I60: 'Defeitos por Task de origem',
  I61: 'Requisitos com Tasks',
  I62: 'Requisitos com evidência técnica',
  I63: 'Requisitos com casos de teste',
  I64: 'Requisitos com defeitos ativos',
  I65: 'Requisitos concluídos',
  I66: 'Cobertura de implementação',
  I67: 'Progresso médio dos requisitos'
});

export const FIELD_LABELS = Object.freeze({
  associated: 'Associados',
  unassociated: 'Não associados',
  unassignedHistoricalCount: 'Registro antigo sem snapshot',
  unassignedCount: 'Sem responsável',
  unknownCount: 'Estado desconhecido',
  completedTasks: 'Tasks concluídas',
  commits: 'Commits',
  people: 'Pessoas',
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CONCLUIDA: 'Concluída',
  PLANEJADA: 'Planejada',
  CANCELADA: 'Cancelada',
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
  completedPoints: 'Pontos concluídos',
  active: 'Ativos'
});

export const LIMITATION_LABELS = Object.freeze({
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
  LEGACY_PLANNING_ESTIMATE_UNKNOWN:
    'Parte das estimativas iniciais não foi registrada de forma distinguível.',
  UNKNOWN_LEGACY_CARRY_OVER: 'O destino de continuidade não foi congelado neste histórico.',
  BURNDOWN_BASELINE_UNAVAILABLE: 'A referência inicial não está disponível; ela não é presumida.',
  BURNUP_ESTIMATE_UNKNOWN: 'Parte das estimativas históricas é desconhecida.',
  BURNUP_HISTORY_NOT_CAPTURED: 'Esta Sprint não possui histórico de Burnup capturado.',
  BURNUP_HISTORY_NOT_LOADED: 'Não foi possível carregar o histórico de Burnup desta Sprint.',
  BURNUP_CUTOFF_UNKNOWN: 'Não foi possível determinar o último dia coberto pelo Burnup.',
  BURNUP_MAX_180_DAYS: 'O Burnup está limitado aos últimos 180 dias.',
  BURNUP_EVENT_SEQUENCE_INCONSISTENT:
    'A sequência de eventos históricos do Burnup apresenta inconsistência.',
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
  EFFORT_SAMPLE_INCOMPLETE:
    'Parte das tarefas está sem estimativa ou esforço realizado. Os valores consideram os registros conhecidos.',
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
  GITHUB_NOT_CONFIGURED: 'Este projeto não possui integração GitHub configurada.',
  GITHUB_SNAPSHOT_NOT_AVAILABLE: 'Ainda não há dados sincronizados do GitHub.',
  GITHUB_SYNC_FAILED: 'A última sincronização com GitHub falhou.',
  GITHUB_SYNC_STALE: 'Os dados GitHub podem estar desatualizados.',
  MAIN_BRANCH_NOT_OBSERVED: 'A branch main ainda não foi observada.',
  MAIN_HEAD_NOT_RECONCILED: 'O estado atual da branch main não foi reconciliado.',
  MAIN_MEMBERSHIP_NOT_CONFIRMED: 'Não foi possível confirmar a presença na branch main.',
  COMMIT_AUTHOR_NOT_ASSOCIATED: 'O autor de alguns commits não está associado a um membro.',
  ISSUE_LIFECYCLE_NOT_COLLECTED: 'O histórico de ciclo de vida das Issues não foi coletado.',
  PR_LIFECYCLE_PERIOD_NOT_COVERED: 'O período não está coberto pelo histórico de Pull Requests.',
  PR_COHORT_CUT_AT_LAST_SYNC:
    'O período observado termina no último sync confirmado do histórico de Pull Requests.',
  SOFT_DELETED_DEFECTS_EXCLUDED: 'Defects excluídos foram retirados do cálculo.',
  VALIDATION_HISTORY_INCOMPLETE_OR_INVALID:
    'O histórico de validação de alguns TestCases está incompleto ou inválido.',
  LEGACY_VALIDATION_WITHOUT_EVENT_UNDATED:
    'Validações antigas sem evento não têm data histórica confiável.',
  DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS:
    'Um defeito pode aparecer em mais de um requisito; as quantidades não formam um total.'
});

export const SITUATION_LABELS = Object.freeze({
  SEM_RASTREABILIDADE: 'Sem rastreabilidade',
  PLANEJADO: 'Planejado',
  EM_DESENVOLVIMENTO: 'Em desenvolvimento',
  IMPLEMENTADO: 'Implementado',
  AGUARDANDO_VALIDACAO: 'Aguardando validação',
  EM_VALIDACAO: 'Em validação',
  COM_FALHA: 'Com falha',
  EM_CORRECAO: 'Em correção',
  AGUARDANDO_RETESTE: 'Aguardando reteste',
  VALIDADO: 'Validado',
  CONCLUIDO: 'Concluído'
});

// Tons dos selos de situação, os mesmos da tela de Rastreabilidade.
export const SITUATION_TONES = Object.freeze({
  SEM_RASTREABILIDADE: 'neutral',
  PLANEJADO: 'neutral',
  EM_DESENVOLVIMENTO: 'info',
  IMPLEMENTADO: 'info',
  AGUARDANDO_VALIDACAO: 'warning',
  EM_VALIDACAO: 'info',
  COM_FALHA: 'danger',
  EM_CORRECAO: 'warning',
  AGUARDANDO_RETESTE: 'warning',
  VALIDADO: 'success',
  CONCLUIDO: 'success'
});

export const SPRINT_STATUS_LABELS = Object.freeze({
  PLANEJADA: 'Planejada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada'
});

export const MILESTONE_STATUS_LABELS = Object.freeze({
  PENDENTE: 'Pendente',
  CONCLUIDO: 'Concluído'
});

export const INDICATOR_STATE_LABELS = Object.freeze({
  AVAILABLE: 'Disponível',
  NO_DATA: 'Sem dados',
  PARTIAL: 'Dados parciais',
  STALE: 'Dados desatualizados',
  UNAVAILABLE: 'Indisponível'
});

// Distribuições cujos valores são contagens, mesmo quando o indicador tem outra unidade.
export const COUNT_DISTRIBUTIONS = new Set([
  'I02',
  'I03',
  'I27',
  'I48',
  'I52',
  'I53',
  'I54',
  'I58'
]);

export const FIELD_UNITS = Object.freeze({
  estimatedHours: 'HOURS',
  actualHours: 'HOURS',
  differenceHours: 'HOURS',
  reworkRate: 'PERCENT',
  mergedRate: 'PERCENT'
});
