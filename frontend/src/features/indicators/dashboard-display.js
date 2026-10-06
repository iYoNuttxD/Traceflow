export const DASHBOARD_VIEWS = [
  ['GENERAL', 'Geral'],
  ['CUSTOM', 'Meu painel'],
  ['PLANNING', 'Planejamento'],
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
  planningReadiness: 'Prontidão do planejamento',
  planningEffort: 'Estimativa e execução',
  sprint: 'Sprint em foco',
  activity: 'Atividade técnica',
  pullRequests: 'Pull Requests',
  issues: 'Issues',
  flow: 'Fluxo de trabalho',
  planning: 'Plano e entrega',
  history: 'Histórico',
  scope: 'Continuidade da Sprint',
  tasks: 'Tarefas',
  tests: 'Testes',
  defects: 'Defeitos',
  concentration: 'Concentração',
  coverage: 'Dimensões de rastreabilidade',
  taskState: 'Estado do trabalho',
  taskEffort: 'Esforço',
  taskAttention: 'Atenção',
  sprintScope: 'Mudanças de escopo',
  sprintEffort: 'Esforço da Sprint'
};

export function presentationSections(view, sections) {
  if (view === 'TASK') {
    const source = sections.find((section) => section.id === 'tasks');
    if (!source) return sections;
    const groups = [
      ['taskState', ['I26', 'I27', 'I29', 'I30']],
      ['taskEffort', ['I31', 'I32', 'I33', 'I34', 'I35']],
      ['taskAttention', ['I28']]
    ];
    const groupedIds = groups.flatMap(([, ids]) => ids);
    const remaining = source.indicators.filter((item) => !groupedIds.includes(item.metricId));
    return [
      ...groups.map(([id, ids]) => ({
        id,
        indicators: source.indicators.filter((item) => ids.includes(item.metricId))
      })),
      ...(remaining.length ? [{ ...source, indicators: remaining }] : []),
      ...sections.filter((section) => section !== source)
    ];
  }
  if (view === 'SPRINT')
    return sections.flatMap((section) => {
      if (section.id !== 'planning') return [section];
      return [
        {
          id: 'planning',
          indicators: section.indicators.filter((indicator) =>
            ['I36', 'I37', 'I38', 'I39', 'I40'].includes(indicator.metricId)
          )
        },
        {
          id: 'sprintScope',
          indicators: ['I41', 'I42', 'I43'].flatMap((id) =>
            section.indicators.filter((indicator) => indicator.metricId === id)
          )
        },
        {
          id: 'sprintEffort',
          indicators: section.indicators.filter(
            (indicator) =>
              !['I36', 'I37', 'I38', 'I39', 'I40', 'I41', 'I42', 'I43'].includes(indicator.metricId)
          )
        }
      ];
    });
  return sections;
}

export const METRIC_TITLES = {
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
};

export const FIELD_LABELS = {
  associated: 'Associados',
  unassociated: 'Não associados',
  unassignedHistoricalCount: 'Histórico sem responsável',
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
};

const COUNT_DISTRIBUTIONS = new Set(['I02', 'I03', 'I27', 'I48', 'I52', 'I53', 'I54', 'I58']);

const FIELD_UNITS = {
  estimatedHours: 'HOURS',
  actualHours: 'HOURS',
  differenceHours: 'HOURS',
  reworkRate: 'PERCENT',
  mergedRate: 'PERCENT'
};

export function distributionRows(indicator) {
  const source = indicator.distribution ?? indicator.value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  return Object.entries(source)
    .filter(([key, value]) => key !== 'total' && key !== 'people' && value != null)
    .filter(([, value]) => typeof value === 'number' || typeof value === 'boolean')
    .map(([key, value]) => ({
      key,
      label: labelForField(key),
      value,
      unit:
        FIELD_UNITS[key] ??
        (COUNT_DISTRIBUTIONS.has(indicator.metricId) ? undefined : indicator.unit)
    }));
}

export function indicatorVisualType(indicator) {
  if (indicator.kind === 'SERIES') return 'time-series';
  if (indicator.kind === 'LIST')
    return indicator.items?.length ||
      indicator.distribution ||
      (indicator.value != null && typeof indicator.value === 'object')
      ? 'ranked-list'
      : 'kpi-compact';
  if (indicator.distribution || (indicator.value && typeof indicator.value === 'object'))
    return 'distribution';
  if (indicator.unit === 'PERCENT') return 'kpi-progress';
  return 'kpi-compact';
}

const SUMMARY_COPY = {
  I02: 'Conta os commits distintos confirmados na branch main no período e os agrupa por identidade GitHub.',
  I03: 'Conta as Tasks cuja conclusão ainda era válida no fim do período e as agrupa pelo responsável registrado.',
  I04: 'Divide as PRs fechadas no período que depois reabriram pelo total de PRs fechadas nesse grupo.',
  I05: 'Apresenta separadamente Tasks concluídas e commits na branch main por responsável; as unidades não são somadas.',
  I06: 'Apresenta separadamente a taxa de retrabalho e a proporção de PRs mescladas entre as PRs fechadas no período.',
  I09: 'Conta uma vez cada commit observado no projeto durante o período.',
  I10: 'Conta as Pull Requests abertas no último estado sincronizado do GitHub.',
  I11: 'Conta as Pull Requests com fechamento registrado no período, mesmo quando foram reabertas depois.',
  I12: 'Conta as Pull Requests cujo merge foi confirmado pelo GitHub durante o período.',
  I13: 'Conta as Issues abertas no último estado sincronizado do GitHub.',
  I14: 'Conta as Issues atualmente fechadas cuja data de fechamento está no período.',
  I15: 'Calcula a mediana do tempo entre abertura e merge das Pull Requests elegíveis.',
  I16: 'Calcula a média do tempo entre abertura e merge das Pull Requests elegíveis.',
  I17: 'Total de Pull Requests abertas com data válida e lista das dez mais antigas.',
  I18: 'Calcula a mediana do tempo entre abertura e fechamento das Issues elegíveis.',
  I20: 'Calcula a mediana do tempo entre criação e primeira conclusão verificável de cada Task elegível.',
  I21: 'Calcula a mediana do tempo entre a primeira entrada em andamento e a primeira conclusão de cada Task elegível.',
  I22: 'Conta as Tasks com conclusão ainda válida em cada dia coberto do período.',
  I23: 'Conta as Tasks que estão em andamento agora.',
  I24: 'Mede o tempo desde a última entrada em andamento das Tasks que continuam nesse estado.',
  I25: 'Conta as Tasks de cada status ao fim de cada dia com histórico observável.',
  I26: 'Conta as Tasks existentes no projeto.',
  I27: 'Agrupa as Tasks existentes por status atual.',
  I28: 'Conta as Tasks não concluídas cujo prazo já passou.',
  I29: 'Conta as Tasks sem responsável registrado.',
  I30: 'Conta as Tasks sem estimativa de esforço registrada.',
  I31: 'Soma as estimativas de esforço registradas nas Tasks elegíveis.',
  I32: 'Soma o esforço realizado registrado nas Tasks elegíveis.',
  I33: 'Soma a diferença entre esforço realizado e estimado nas Tasks que têm ambos os valores.',
  I34: 'Conta as Tasks cujo esforço realizado supera a estimativa registrada.',
  I35: 'Conta as Tasks concluídas cujo esforço realizado ficou abaixo da estimativa registrada.',
  I36: 'Esforço estimado conhecido das tarefas no planejamento inicial preservado da Sprint.',
  I37: 'Esforço estimado conhecido das tarefas que integram o escopo da Sprint.',
  I38: 'Esforço estimado conhecido das tarefas concluídas no escopo da Sprint.',
  I39: 'Conta as Tasks que estavam planejadas no início da Sprint.',
  I40: 'Conta as Tasks concluídas no estado preservado para o corte da Sprint.',
  I41: 'Tarefas fora do planejamento inicial que ainda pertencem ao escopo da Sprint.',
  I42: 'Tarefas do planejamento inicial que foram removidas do escopo da Sprint.',
  I43: 'Apresenta separadamente quantas Tasks entraram e saíram da Sprint.',
  I44: 'Compara o esforço estimado e realizado registrado na Sprint.',
  I48: 'Agrupa as execuções de teste por resultado aprovado, falho ou bloqueado.',
  I49: 'Divide as execuções aprovadas pelo total de execuções aprovadas, falhas e bloqueadas.',
  I50: 'Divide as execuções falhas pelo total de execuções aprovadas, falhas e bloqueadas.',
  I51: 'Divide as execuções bloqueadas pelo total de execuções aprovadas, falhas e bloqueadas.',
  I52: 'Considera a última execução da versão atual de cada caso de teste ativo.',
  I53: 'Agrupa os defeitos não excluídos por status.',
  I54: 'Agrupa os defeitos não excluídos por severidade.',
  I55: 'Conta os defeitos não excluídos criados no período.',
  I56: 'Conta uma vez cada defeito com validação registrada no período.',
  I57: 'Calcula a mediana do tempo entre a criação de um defeito e sua primeira validação.',
  I59: 'Conta os defeitos distintos ligados a cada requisito diretamente ou por suas Tasks de origem.',
  I60: 'Conta os defeitos distintos ligados a cada Task de origem.',
  I61: 'Divide os requisitos com Task vinculada pelo total de requisitos.',
  I62: 'Divide os requisitos com PR ou commit vinculado por Task pelo total de requisitos.',
  I63: 'Divide os requisitos com caso de teste ativo relevante pelo total de requisitos.',
  I64: 'Divide os requisitos com defeito ativo relevante pelo total de requisitos.',
  I65: 'Divide os requisitos concluídos pelo total de requisitos.',
  I66: 'Requisitos com todas as tarefas concluídas e evidência técnica vinculada.',
  I67: 'Calcula a média do percentual de progresso de cada requisito.',
  I71: 'Tarefas adicionadas fora do planejamento inicial que permanecem no escopo e tarefas planejadas removidas.',
  I72: 'Tarefas recebidas de outra Sprint que permanecem no escopo, incluindo as concluídas.',
  I73: 'Calcula a média do tempo desde a criação das Pull Requests que continuam abertas.',
  I74: 'Calcula a média do tempo entre abertura e fechamento das Issues elegíveis.'
};

const DESCRIPTION_COPY = {
  I04: 'Parcela de Pull Requests fechadas no período que foram reabertas depois.',
  I06: 'Retrabalho e proporção de Pull Requests mescladas entre as fechadas no período.',
  I11: 'Pull Requests que tiveram um fechamento registrado no período.',
  I12: 'Pull Requests cujo merge foi confirmado pelo GitHub no período.',
  I14: 'Issues atualmente fechadas com data de fechamento no período.',
  I16: 'Tempo médio entre a abertura e o merge das Pull Requests elegíveis.',
  I20: 'Mediana do tempo decorrido entre a criação e a primeira conclusão das Tasks no período.',
  I21: 'Mediana do tempo decorrido entre o primeiro andamento e a primeira conclusão das Tasks no período.',
  I25: 'Evolução diária da quantidade observável de Tasks em cada status.',
  I28: 'Tasks ainda não concluídas cujo prazo já passou.',
  I29: 'Tasks que não têm responsável registrado.',
  I30: 'Tasks que não têm estimativa registrada; estimativa zero é um valor conhecido.',
  I32: 'Esforço realizado registrado nas Tasks elegíveis.',
  I39: 'Tasks planejadas no início da Sprint.',
  I44: 'Esforço estimado e realizado da Sprint.',
  I48: 'Quantidade de execuções de teste por resultado.',
  I49: 'Parcela das execuções de teste que foram aprovadas.',
  I50: 'Parcela das execuções de teste que falharam.',
  I51: 'Parcela das execuções de teste que ficaram bloqueadas.',
  I52: 'Resultado mais recente dos casos de teste ativos na versão atual.',
  I57: 'Tempo entre criação e primeira validação dos defeitos elegíveis.',
  I59: 'Defeitos ligados a cada requisito, diretamente ou por uma Task de origem.',
  I60: 'Defeitos ligados a cada Task de origem.',
  I61: 'Parcela dos requisitos que têm alguma Task vinculada.',
  I62: 'Parcela dos requisitos com Pull Request ou commit vinculado por Task.',
  I63: 'Parcela dos requisitos com caso de teste ativo relevante.',
  I64: 'Parcela dos requisitos com defeito ativo relevante.',
  I65: 'Parcela dos requisitos concluídos.',
  I66: 'Parcela dos requisitos com tarefas concluídas e evidência técnica vinculada.',
  I67: 'Média do progresso registrado em cada requisito.',
  I74: 'Tempo médio entre abertura e fechamento das Issues elegíveis.'
};

const INTERPRETATION_COPY = {
  I02: 'Mostra a distribuição da atividade registrada por identidade; volume de commits não mede desempenho individual.',
  I05: 'As duas medidas mostram tipos distintos de atividade e não formam um placar de pessoas.',
  I09: 'Mostra o volume de commits observados no período; não mede desempenho individual.',
  I20: 'Valores maiores indicam mais tempo entre a criação e a primeira conclusão das Tasks elegíveis.',
  I21: 'Valores maiores indicam mais tempo entre começar e concluir as Tasks elegíveis.',
  I22: 'A série mostra como a quantidade de Tasks concluídas varia entre os dias cobertos.',
  I23: 'Valores maiores indicam mais Tasks simultaneamente em andamento.',
  I24: 'Valores maiores indicam Tasks que permanecem em andamento há mais tempo.',
  I25: 'As faixas mostram a composição do trabalho ao longo do tempo; lacunas significam histórico não observável.',
  I28: 'Valores maiores indicam mais Tasks com prazo vencido e conclusão ainda pendente.',
  I29: 'O valor mostra quantas Tasks ainda não têm um responsável registrado.',
  I30: 'O valor mostra quantas Tasks ainda não têm uma estimativa registrada.',
  I33: 'Valor positivo indica esforço realizado acima do estimado; negativo indica abaixo, entre Tasks comparáveis.',
  I49: 'O percentual mostra a parcela aprovada entre execuções com resultado conhecido.',
  I50: 'O percentual mostra a parcela falha entre execuções com resultado conhecido.',
  I51: 'O percentual mostra a parcela bloqueada entre execuções com resultado conhecido.',
  I59: 'Um mesmo defeito pode aparecer em mais de um requisito; as linhas não devem ser somadas como total.',
  I60: 'As linhas mostram onde há mais defeitos vinculados a Tasks de origem.',
  I61: 'O percentual mostra quanto do catálogo de requisitos está ligado a Tasks.',
  I62: 'O percentual mostra quanto do catálogo de requisitos possui evidência técnica vinculada por Task.',
  I63: 'O percentual mostra quanto do catálogo de requisitos possui caso de teste ativo relevante.',
  I64: 'O percentual mostra quanto do catálogo de requisitos possui defeito ativo relevante.',
  I65: 'O percentual mostra quanto do catálogo de requisitos está concluído.',
  I66: 'O percentual mostra quanto do catálogo de requisitos atingiu a implementação técnica, independentemente da validação de qualidade.'
};

export function indicatorHelp(indicator) {
  const specific = {
    I01: {
      what: 'Quanto das Tasks cadastradas já foi concluído.',
      meaning: 'O percentual mostra a parcela do trabalho registrado que já foi finalizada.'
    },
    I45: {
      what: 'Como o trabalho restante da Sprint mudou nos dias cobertos pelo histórico.',
      meaning:
        'A distância entre as linhas ajuda a comparar o restante registrado com a referência ideal.'
    },
    I46: {
      what: 'Como o escopo total e o trabalho concluído evoluíram na Sprint.',
      meaning:
        'As duas linhas permitem ver mudanças de escopo junto à entrega; lacunas não representam zero.'
    },
    I47: {
      what: 'Trabalho concluído nas Sprints encerradas com registro elegível.',
      meaning: 'As barras mostram a variação entre Sprints, sem comparar desempenho individual.'
    },
    I58: {
      what: 'Parcela dos retestes executados que foi aprovada.',
      meaning: 'O percentual é uma proporção; a distribuição abaixo mostra quantidades de retestes.'
    }
  }[indicator.metricId];
  return (
    specific ?? {
      what:
        DESCRIPTION_COPY[indicator.metricId] ??
        SUMMARY_COPY[indicator.metricId] ??
        'Dados registrados para este aspecto do projeto.',
      meaning:
        INTERPRETATION_COPY[indicator.metricId] ??
        (indicator.unit === 'PERCENT'
          ? 'O percentual mostra a parcela descrita acima no conjunto elegível; compare recortes equivalentes.'
          : 'O valor mostra a quantidade ou duração registrada no recorte; compare recortes equivalentes.')
    }
  );
}

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
  GITHUB_SNAPSHOT_NOT_AVAILABLE: 'Ainda não há dados sincronizados do GitHub.',
  GITHUB_SYNC_FAILED: 'A última sincronização com GitHub falhou.',
  GITHUB_SYNC_STALE: 'Os dados GitHub podem estar desatualizados.',
  MAIN_BRANCH_NOT_OBSERVED: 'A branch main ainda não foi observada.',
  MAIN_HEAD_NOT_RECONCILED: 'O estado atual da branch main não foi reconciliado.',
  MAIN_MEMBERSHIP_NOT_CONFIRMED: 'Não foi possível confirmar a presença na branch main.',
  COMMIT_AUTHOR_NOT_ASSOCIATED: 'O autor de alguns commits não está associado a um membro.',
  ISSUE_LIFECYCLE_NOT_COLLECTED: 'O histórico de ciclo de vida das Issues não foi coletado.',
  PR_LIFECYCLE_PERIOD_NOT_COVERED: 'O período não está coberto pelo histórico de Pull Requests.',
  SOFT_DELETED_DEFECTS_EXCLUDED: 'Defects excluídos foram retirados do cálculo.',
  VALIDATION_HISTORY_INCOMPLETE_OR_INVALID:
    'O histórico de validação de alguns TestCases está incompleto ou inválido.',
  LEGACY_VALIDATION_WITHOUT_EVENT_UNDATED:
    'Validações antigas sem evento não têm data histórica confiável.',
  DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS:
    'Um defeito pode aparecer em mais de um requisito; as quantidades não formam um total.'
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
  if (unit === 'PERCENTAGE_POINTS') return `${formatNumber(value)} p.p.`;
  if (unit === 'PERCENT') return `${formatNumber(value)}%`;
  if (unit === 'HOURS') return `${formatNumber(value)} h`;
  if (unit === 'DAYS') return `${formatNumber(value)} ${value === 1 ? 'dia' : 'dias'}`;
  return formatNumber(value);
}

export function labelForField(key) {
  return FIELD_LABELS[key] ?? 'Outros registros';
}

export function describeLimitation(code) {
  return LIMITATION_LABELS[code] ?? 'Parte dos dados possui limitações para esta leitura.';
}

export function dashboardTimeZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && zone.includes('/') ? zone : 'UTC';
}

const EFFORT_LIMITATIONS = new Set([
  'TASK_ESTIMATE_MISSING',
  'TASK_ACTUAL_EFFORT_MISSING',
  'COMPARISON_SAMPLE_INCOMPLETE',
  'COMPLETED_TASK_ACTUAL_EFFORT_MISSING'
]);
export function presentationLimitations(indicator) {
  return [
    ...new Set(
      (indicator.limitations ?? [])
        .filter((code) => code !== 'ACTUAL_EFFORT_ALREADY_INCLUDES_SESSIONS_AND_LEGACY')
        .map((code) => (EFFORT_LIMITATIONS.has(code) ? 'EFFORT_SAMPLE_INCOMPLETE' : code))
    )
  ];
}
