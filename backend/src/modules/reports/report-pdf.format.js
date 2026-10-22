import {
  COUNT_DISTRIBUTIONS,
  FIELD_LABELS,
  FIELD_UNITS,
  LIMITATION_LABELS
} from './report-pdf.labels.js';
import { HEALTH_LABELS, HEALTH_TONES, indicatorHealth } from './report-summary.js';

// Mesmas regras de formatação do painel (dashboard-display.js) e da tela do relatório
// (report-display.js): o PDF não recalcula nada, apenas apresenta o snapshot.

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const formatNumber = (value) => numberFormat.format(value);

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

export function formatCivilDate(value) {
  if (!value) return 'Não informada';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(date);
}

// No navegador o instante usa o fuso local; no PDF, o fuso informado explicitamente.
export function formatDateTime(value, timeZone = 'UTC') {
  if (!value) return 'Não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone
  }).format(date);
}

export function shortDate(isoDay) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(isoDay ?? ''))) return '';
  const [, month, day] = String(isoDay).slice(0, 10).split('-');
  return `${day}/${month}`;
}

export const labelForField = (key) => FIELD_LABELS[key] ?? 'Outros registros';

export const describeLimitation = (code) =>
  LIMITATION_LABELS[code] ?? 'Parte dos dados possui limitações para esta leitura.';

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

// Só há valor exibível nesses estados; sem dados ou indisponível nunca aparece como zero.
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

export function indicatorItems(indicator, limit = 10) {
  if (!VALUE_STATES.has(indicator.state) || !Array.isArray(indicator.items)) return [];
  return indicator.items.slice(0, limit).map((item, index) => {
    const label =
      item.title ?? item.name ?? item.displayId ?? (item.number ? `#${item.number}` : null);
    const responsible = item.responsible?.displayName ?? item.responsible?.name ?? null;
    return [label ?? `Item ${index + 1}`, responsible].filter(Boolean).join(' — ');
  });
}

// Observações de um indicador, na mesma ordem e com os mesmos filtros da tela.
export function indicatorNotes(indicator) {
  const codes = [...new Set(indicator.limitations ?? [])].filter(
    (code) => !code.includes('FILTER_') && code !== 'PERIOD_NOT_COMPLETE'
  );
  const breakdown =
    indicator.value && typeof indicator.value === 'object' ? distributionRows(indicator) : [];
  return {
    items: indicatorItems(indicator),
    breakdown: breakdown.map((row) => `${row.label}: ${formatMetricValue(row.value, row.unit)}`),
    limitations: [...new Set(codes.map(describeLimitation))],
    people: (indicator.people ?? []).map(
      (person) =>
        `${person.displayName}: ${[
          person.completedTasks != null &&
            `${person.completedTasks} ${person.completedTasks === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`,
          person.commits != null &&
            `${person.commits} ${person.commits === 1 ? 'commit' : 'commits'}`,
          person.count != null && `${person.count}`
        ]
          .filter(Boolean)
          .join(' · ')}`
    )
  };
}

export function pendingDefects(defects) {
  if (!defects) return 0;
  return (defects.open ?? 0) + (defects.inCorrection ?? 0) + (defects.waitingRetest ?? 0);
}

// Motivo da avaliação de saúde, igual ao texto do cartão do painel (health-display.js).
const healthNumber = (value) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);

export function describeHealthReason(assessment, metricId) {
  const { reasonCode, basis } = assessment ?? {};
  if (reasonCode === 'GITHUB_NOT_CONFIGURED')
    return 'A avaliação depende de uma integração GitHub configurada.';
  if (reasonCode === 'TASK_SHARE')
    return `${healthNumber(basis.count)} de ${healthNumber(basis.totalTasks)} Tasks ${
      metricId === 'I28'
        ? 'estão atrasadas'
        : metricId === 'I29'
          ? 'estão sem responsável'
          : 'estão sem estimativa'
    }.`;
  if (reasonCode === 'BASELINE_REGRESSION') {
    const unit = metricId === 'I15' ? 'h' : 'dias';
    return `${healthNumber(basis.current)} ${unit} no período atual e ${healthNumber(basis.previous)} ${unit} no anterior; ${basis.regressionPercent ? `aumento de ${healthNumber(basis.regressionPercent)}%` : 'sem regressão'} (${basis.currentSample} e ${basis.previousSample} amostras).`;
  }
  if (reasonCode === 'EFFORT_DEVIATION')
    return `${healthNumber(basis.actualHours)} h realizadas para ${healthNumber(basis.estimatedHours)} h estimadas.`;
  if (reasonCode === 'BURNDOWN_GAP')
    return `${healthNumber(basis.actualRemaining)} h restantes frente a ${healthNumber(basis.idealRemaining)} h ideais; escopo base de ${healthNumber(basis.baselineScope)} h.`;
  if (reasonCode === 'SCOPE_CHANGE')
    return `${healthNumber(basis.addedCount)} Tasks adicionadas e ${healthNumber(basis.removedCount)} removidas de ${healthNumber(basis.plannedTasks)} planejadas.`;
  if (reasonCode === 'INVERSE_PERCENT' || reasonCode === 'DIRECT_PERCENT')
    return `Valor observado: ${healthNumber(basis.value)}%.`;
  if (reasonCode === 'CURRENT_TEST_PASS')
    return `${healthNumber(basis.pass)} de ${healthNumber(basis.total)} casos ativos estão aprovados na versão atual.`;
  if (reasonCode === 'STAGE_GAP')
    return `Cobertura observada de ${healthNumber(basis.current)}% frente a ${healthNumber(basis.expected)}% no estágio anterior; lacuna de ${healthNumber(basis.gapPoints)} pontos percentuais.`;
  if (reasonCode === 'NO_OPEN_PRS') return 'Não há PRs abertas na fila atual.';
  if (reasonCode === 'OPEN_PR_AGE')
    return `${healthNumber(basis.averageOpenAgeDays)} dias de idade média das PRs abertas; mediana de merge de ${healthNumber(basis.medianMergeHours)} h.`;
  if (reasonCode?.startsWith('DATA_'))
    return 'A fonte não está plenamente disponível para pontuação.';
  if (reasonCode === 'INSUFFICIENT_BASIS')
    return 'A amostra ou a base de comparação é insuficiente para pontuação.';
  return 'Este indicador é informativo e não compõe a Saúde do Projeto.';
}

// Referência e variação exibidas abaixo do valor no painel.
export function healthReference(assessment) {
  const { reference, delta } = assessment ?? {};
  if (!reference) return null;
  const parts = [`${reference.label}: ${formatMetricValue(reference.value, reference.unit)}`];
  if (delta)
    parts.push(
      `Variação: ${delta.value > 0 ? '+' : ''}${formatMetricValue(delta.value, delta.unit)}`
    );
  return parts.join(' · ');
}

// Status da métrica como no cartão do painel: selo, motivo e referência. O motivo só aparece
// quando há avaliação; indicador informativo não repete a mesma frase em cada linha.
export function indicatorStatus(indicator) {
  const status = indicatorHealth(indicator);
  const assessment = indicator.assessment;
  const assessed = status !== 'NEUTRAL' && status !== 'NOT_APPLICABLE';
  return {
    status,
    label: HEALTH_LABELS[status],
    tone: HEALTH_TONES[status],
    reason:
      assessed && assessment?.reasonCode && assessment?.basis
        ? describeHealthReason(assessment, indicator.metricId)
        : null,
    reference: assessed ? healthReference(assessment) : null
  };
}
