import { INDICATORS } from './indicators.catalog.js';

// Presentation approval is independent of the Health scoring role.
// I03/I05 need a dedicated multi-unit/person presenter before standalone approval.
const excluded = new Set(['I03', 'I05']);
const full = new Set([
  'I02',
  'I17',
  'I24',
  'I25',
  'I28',
  'I34',
  'I35',
  'I41',
  'I42',
  'I43',
  'I59',
  'I60',
  'I72'
]);
const wide = new Set(['I20', 'I21', 'I22', 'I45', 'I46', 'I47']);
const standard = new Set(['I06', 'I27', 'I44', 'I48', 'I52', 'I53', 'I54', 'I58', 'I71']);

export const DASHBOARD_CONFIGURATION_VERSION = 1;
export const DASHBOARD_WIDGET_LIMIT = 12;
export const DEFAULT_DASHBOARD_WIDGETS = Object.freeze(['I01', 'I23', 'I49', 'I66', 'I21', 'I28']);

const descriptions = {
  I01: 'Parcela das tarefas do projeto que já foi concluída.',
  I02: 'Commits na main, com associação aos responsáveis disponíveis.',
  I04: 'Proporção de Pull Requests reabertas após o fechamento.',
  I06: 'Retrabalho e integração das Pull Requests fechadas.',
  I09: 'Commits observados em todas as branches no período.',
  I10: 'Pull Requests que estão abertas na última sincronização.',
  I11: 'Pull Requests encerradas no período.',
  I12: 'Pull Requests integradas no período.',
  I13: 'Issues abertas na última sincronização.',
  I14: 'Issues encerradas no período.',
  I15: 'Mediana do tempo entre abertura e integração das Pull Requests.',
  I16: 'Tempo médio entre abertura e integração das Pull Requests.',
  I17: 'Pull Requests abertas há mais tempo.',
  I18: 'Tempo até o fechamento das Issues elegíveis.',
  I20: 'Tempo entre criação e conclusão das tarefas, com evolução diária.',
  I21: 'Tempo entre início e conclusão das tarefas, com evolução diária.',
  I22: 'Conclusões de tarefas ao longo do período.',
  I23: 'Quantidade de tarefas atualmente em andamento.',
  I24: 'Tempo em andamento das tarefas ainda não concluídas.',
  I25: 'Distribuição histórica do trabalho por estado.',
  I26: 'Quantidade total de tarefas atuais do projeto.',
  I27: 'Distribuição das tarefas entre a fazer, em andamento e concluídas.',
  I28: 'Tarefas pendentes cujo prazo já passou.',
  I29: 'Tarefas que ainda não possuem responsável.',
  I30: 'Tarefas que ainda não possuem estimativa.',
  I31: 'Soma das estimativas conhecidas das tarefas.',
  I32: 'Esforço realizado e registrado nas tarefas.',
  I33: 'Diferença entre esforço realizado e estimado nas tarefas comparáveis.',
  I34: 'Tarefas cujo esforço realizado ultrapassou a estimativa.',
  I35: 'Tarefas cujo esforço realizado ficou abaixo da estimativa.',
  I36: 'Esforço previsto na abertura da Sprint.',
  I37: 'Esforço do escopo atual da Sprint.',
  I38: 'Esforço entregue na Sprint.',
  I39: 'Quantidade de tarefas planejadas para a Sprint.',
  I40: 'Quantidade de tarefas entregues na Sprint.',
  I41: 'Tarefas adicionadas depois da abertura da Sprint.',
  I42: 'Tarefas removidas depois da abertura da Sprint.',
  I43: 'Transferências de tarefas entre Sprints.',
  I44: 'Estimativa, realizado e desvio de esforço da Sprint.',
  I45: 'Evolução do trabalho restante e comparação com a linha ideal.',
  I46: 'Evolução do escopo e do trabalho concluído da Sprint.',
  I47: 'Esforço entregue em Sprints concluídas.',
  I48: 'Distribuição dos resultados das execuções de teste no período.',
  I49: 'Parcela das execuções de teste aprovadas no período.',
  I50: 'Parcela das execuções de teste com falha no período.',
  I51: 'Parcela das execuções de teste bloqueadas no período.',
  I52: 'Resultado atual dos casos de teste, incluindo os nunca executados.',
  I53: 'Distribuição dos defeitos por etapa de correção.',
  I54: 'Distribuição dos defeitos por severidade.',
  I55: 'Defeitos criados no período.',
  I56: 'Defeitos validados no período.',
  I57: 'Tempo entre a detecção e a validação dos defeitos.',
  I58: 'Resultados das tentativas de reteste.',
  I59: 'Requisitos com maior concentração de defeitos.',
  I60: 'Tarefas de origem com maior concentração de defeitos.',
  I61: 'Requisitos vinculados a pelo menos uma tarefa.',
  I62: 'Requisitos com evidências técnicas associadas.',
  I63: 'Requisitos cobertos por casos de teste.',
  I64: 'Requisitos com defeitos ativos relacionados.',
  I65: 'Requisitos em situação concluída.',
  I66: 'Requisitos cuja implementação possui evidência suficiente.',
  I67: 'Progresso médio das tarefas vinculadas aos requisitos.',
  I71: 'Identifica mudanças de escopo e suas adições e remoções.',
  I72: 'Tarefas herdadas que ainda pertencem à Sprint atual.',
  I73: 'Idade média das Pull Requests atualmente abertas.',
  I74: 'Tempo médio até o fechamento das Issues elegíveis.'
};

export function isCustomizable(metricId) {
  return Boolean(INDICATORS[metricId] && descriptions[metricId] && !excluded.has(metricId));
}

export function customizationMetadata(metricId) {
  const customizable = isCustomizable(metricId);
  return {
    customizable,
    reason: customizable ? 'APPROVED_STANDALONE_PRESENTER' : 'STANDALONE_PRESENTER_NOT_APPROVED',
    defaultSelected: DEFAULT_DASHBOARD_WIDGETS.includes(metricId),
    sizeClass: full.has(metricId)
      ? 'full'
      : wide.has(metricId)
        ? 'wide'
        : standard.has(metricId)
          ? 'standard'
          : 'compact',
    description: descriptions[metricId] ?? null
  };
}

export function defaultDashboardPreference() {
  return {
    configurationVersion: DASHBOARD_CONFIGURATION_VERSION,
    widgets: [...DEFAULT_DASHBOARD_WIDGETS],
    isDefault: true,
    updatedAt: null
  };
}
