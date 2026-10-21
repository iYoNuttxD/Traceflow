import {
  describeHealthReason,
  formatCivilDate,
  formatMetricValue
} from '../../indicators/index.js';
import { HEALTH_LABELS, HEALTH_TONES, indicatorHealth } from './report-summary.js';

export const REPORT_STATUS = Object.freeze({
  QUEUED: { label: 'Na fila', tone: 'neutral' },
  RUNNING: { label: 'Gerando', tone: 'info' },
  SUCCEEDED: { label: 'Pronto', tone: 'success' },
  FAILED: { label: 'Falhou', tone: 'danger' }
});

export const isReportActive = (report) => ['QUEUED', 'RUNNING'].includes(report?.status);

export const reportStatus = (status) =>
  REPORT_STATUS[status] ?? { label: 'Estado desconhecido', tone: 'neutral' };

// Mesmo vocabulário dos estados exibidos nos cartões do painel de Indicadores.
export const INDICATOR_STATE_LABELS = Object.freeze({
  AVAILABLE: 'Disponível',
  NO_DATA: 'Sem dados',
  PARTIAL: 'Dados parciais',
  STALE: 'Dados desatualizados',
  UNAVAILABLE: 'Indisponível'
});

export function formatReportPeriod(filters) {
  if (!filters?.startDate || !filters?.endDate) return 'Todo o histórico';
  return `${formatCivilDate(filters.startDate)} a ${formatCivilDate(filters.endDate)}`;
}

export function personLabel(person) {
  if (!person) return 'Não informado';
  return person.username ? `${person.displayName} (@${person.username})` : person.displayName;
}

// O snapshot guarda só o userId; o nome exibido é sempre o congelado na geração.
export function withFrozenNames(value, peopleById) {
  if (Array.isArray(value)) return value.map((item) => withFrozenNames(item, peopleById));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = withFrozenNames(item, peopleById);
  if (Number.isInteger(value.userId) && value.userId > 0) {
    const person = peopleById.get(value.userId);
    const name = person?.displayName ?? 'Pessoa não identificada';
    result.displayName = name;
    result.name = name;
  }
  return result;
}

// Mesma regra do cartão do painel: só há valor exibível nesses estados; os demais
// (sem dados, indisponível) nunca aparecem como zero.
const VALUE_STATES = new Set(['AVAILABLE', 'PARTIAL', 'STALE']);

export function indicatorValue(indicator, unit) {
  if (!VALUE_STATES.has(indicator.state)) return '—';
  if (typeof indicator.value === 'number') return formatMetricValue(indicator.value, unit);
  if (typeof indicator.value?.total === 'number') return formatMetricValue(indicator.value.total);
  if (indicator.points?.length)
    return `${indicator.points.length} ${indicator.points.length === 1 ? 'ponto' : 'pontos'} na série`;
  if (indicator.items?.length)
    return `${indicator.items.length} ${indicator.items.length === 1 ? 'item' : 'itens'}`;
  if (indicator.people?.length)
    return `${indicator.people.length} ${indicator.people.length === 1 ? 'pessoa' : 'pessoas'}`;
  return '—';
}

export function percent(metric) {
  if (!metric || metric.denominator == null) return '—';
  const percentage = metric.percentage ?? null;
  return `${metric.numerator ?? 0} de ${metric.denominator}${percentage == null ? '' : ` (${formatMetricValue(percentage, 'PERCENT')})`}`;
}

// Itens de indicadores em lista (tarefas, requisitos, PRs): título e responsável congelado.
export function indicatorItems(indicator, limit = 10) {
  if (!VALUE_STATES.has(indicator.state) || !Array.isArray(indicator.items)) return [];
  return indicator.items.slice(0, limit).map((item, index) => {
    const label =
      item.title ?? item.name ?? item.displayId ?? (item.number ? `#${item.number}` : null);
    const responsible = item.responsible?.displayName ?? item.responsible?.name ?? null;
    return {
      key: `${item.taskId ?? item.requirementId ?? item.id ?? item.number ?? 'item'}:${index}`,
      text: [label ?? `Item ${index + 1}`, responsible].filter(Boolean).join(' — ')
    };
  });
}

// Status da métrica como no cartão do painel: selo, motivo e referência. O motivo só aparece
// quando há avaliação; indicador informativo não repete a mesma frase em cada linha.
export function indicatorStatus(indicator) {
  const status = indicatorHealth(indicator);
  const assessment = indicator.assessment;
  const assessed = status !== 'NEUTRAL' && status !== 'NOT_APPLICABLE';
  const reference = assessment?.reference
    ? [
        `${assessment.reference.label}: ${formatMetricValue(assessment.reference.value, assessment.reference.unit)}`,
        assessment.delta
          ? `Variação: ${assessment.delta.value > 0 ? '+' : ''}${formatMetricValue(assessment.delta.value, assessment.delta.unit)}`
          : null
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return {
    status,
    label: HEALTH_LABELS[status],
    tone: HEALTH_TONES[status],
    reason:
      assessed && assessment?.reasonCode && assessment?.basis
        ? describeHealthReason(assessment, indicator.metricId)
        : null,
    reference: assessed ? reference : null
  };
}
