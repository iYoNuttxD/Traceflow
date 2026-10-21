// Leituras visuais do relatório (resumo, status e situações). Arquivo sem imports para que
// o PDF (backend/src/modules/reports/report-summary.js) seja conferido contra ele em teste.

// Mesmos status da Saúde do Projeto exibidos nos cartões do painel. Indicador sem avaliação
// é informativo: mostra o número, mas não entra no julgamento de saúde.
export const HEALTH_STATUSES = Object.freeze([
  'CRITICAL',
  'ATTENTION',
  'HEALTHY',
  'UNASSESSED',
  'NOT_APPLICABLE',
  'NEUTRAL'
]);

export const HEALTH_LABELS = Object.freeze({
  HEALTHY: 'Saudável',
  ATTENTION: 'Atenção',
  CRITICAL: 'Crítico',
  UNASSESSED: 'Dados insuficientes',
  NOT_APPLICABLE: 'Não se aplica',
  NEUTRAL: 'Informativo'
});

export const HEALTH_TONES = Object.freeze({
  HEALTHY: 'success',
  ATTENTION: 'warning',
  CRITICAL: 'danger',
  UNASSESSED: 'neutral',
  NOT_APPLICABLE: 'neutral',
  NEUTRAL: 'neutral'
});

export function indicatorHealth(indicator) {
  const status = indicator?.assessment?.status;
  return Object.hasOwn(HEALTH_LABELS, status) ? status : 'NEUTRAL';
}

// Um indicador pode aparecer em mais de uma visão; no resumo ele conta uma vez.
export function healthCounts(views) {
  const seen = new Map();
  for (const view of views ?? [])
    for (const section of view.sections ?? [])
      for (const indicator of section.indicators ?? [])
        if (!seen.has(indicator.metricId)) seen.set(indicator.metricId, indicatorHealth(indicator));
  const counts = Object.fromEntries(HEALTH_STATUSES.map((status) => [status, 0]));
  for (const status of seen.values()) counts[status] += 1;
  return counts;
}

export const SPRINT_SITUATIONS = Object.freeze({
  CONCLUIDA: ['Concluída', 'success'],
  EM_ANDAMENTO: ['Em andamento', 'info'],
  ATRASADA: ['Atrasada', 'danger'],
  PLANEJADA: ['Planejada', 'neutral'],
  CANCELADA: ['Cancelada', 'neutral']
});

// Mesma regra do Cronograma (sprintStatusKey): em andamento depois do fim é atrasada.
// A referência de "hoje" é o momento da geração, porque o relatório é um retrato.
export function sprintSituation(sprint, generatedAt) {
  const key =
    sprint.status === 'EM_ANDAMENTO' &&
    !Number.isNaN(Date.parse(sprint.endDate)) &&
    Date.parse(sprint.endDate) < Date.parse(generatedAt)
      ? 'ATRASADA'
      : sprint.status;
  const [label, tone] = SPRINT_SITUATIONS[key] ?? [sprint.status ?? 'Sem status', 'neutral'];
  return { key, label, tone };
}

export const MILESTONE_SITUATIONS = Object.freeze({
  CONCLUIDO: ['Concluído', 'success'],
  ATRASADO: ['Atrasado', 'danger'],
  PENDENTE: ['Pendente', 'neutral']
});

export function milestoneSituation(milestone) {
  const key =
    milestone.status === 'CONCLUIDO' ? 'CONCLUIDO' : milestone.overdue ? 'ATRASADO' : 'PENDENTE';
  const [label, tone] = MILESTONE_SITUATIONS[key];
  return { key, label, tone };
}

// Barra de progresso: completa em verde; em andamento em azul; sem base, sem barra.
export function progressBar(metric) {
  const percentage = metric?.percentage;
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) return null;
  const value = Math.max(0, Math.min(100, percentage));
  return { value, tone: value >= 100 ? 'success' : 'info' };
}

const VALUE_STATES = new Set(['AVAILABLE', 'PARTIAL', 'STALE']);

function findIndicator(views, metricId) {
  for (const view of views ?? [])
    for (const section of view.sections ?? [])
      for (const indicator of section.indicators ?? [])
        if (indicator.metricId === metricId) return indicator;
  return null;
}

// Números do topo do relatório, todos tirados do próprio snapshot.
export function reportOverview(snapshot) {
  const views = snapshot?.indicators?.views ?? [];
  const progress = findIndicator(views, 'I01');
  const defects = findIndicator(views, 'I53');
  const items = snapshot?.traceability?.items ?? [];
  const done = items.filter((item) => item.situation === 'CONCLUIDO').length;
  const health = views.find((view) => view.projectHealth)?.projectHealth ?? null;
  const sprints = Object.fromEntries(Object.keys(SPRINT_SITUATIONS).map((key) => [key, 0]));
  for (const sprint of snapshot?.planning?.sprints ?? []) {
    const { key } = sprintSituation(sprint, snapshot.generatedAt);
    if (Object.hasOwn(sprints, key)) sprints[key] += 1;
  }
  return {
    progress:
      progress && VALUE_STATES.has(progress.state) && typeof progress.value === 'number'
        ? progress.value
        : null,
    requirements: {
      done,
      total: items.length,
      percentage: items.length ? Math.round((done / items.length) * 10000) / 100 : null
    },
    pendingDefects:
      defects && VALUE_STATES.has(defects.state) && typeof defects.value?.active === 'number'
        ? defects.value.active
        : null,
    // Sem nota (amostra insuficiente), o status continua visível, como no painel.
    health: health?.status
      ? {
          score: typeof health.score === 'number' ? Math.round(health.score) : null,
          status: health.status
        }
      : null,
    sprints,
    indicators: healthCounts(views)
  };
}
