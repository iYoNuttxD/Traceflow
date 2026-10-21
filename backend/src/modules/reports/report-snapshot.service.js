import { AppError } from '../../shared/errors/index.js';
import {
  dashboardService,
  publicDashboardCatalog,
  publicDashboardViews
} from '../indicators/index.js';
import { sprintService } from '../sprints/index.js';
import { requirementProjectionService } from '../traceability/index.js';
import { stripPeople } from './report-people.js';

export const REPORT_SNAPSHOT_VERSION = 1;

// Tetos explícitos: acima deles a geração falha com código próprio em vez de produzir
// um relatório recortado silenciosamente ou um JSON grande demais para o banco.
export const REPORT_LIMITS = Object.freeze({
  sprints: 100,
  requirements: 2000,
  requirementPageSize: 100,
  snapshotBytes: 16 * 1024 * 1024
});

export function reportGenerationError(code, message) {
  return new AppError({ message, code, statusCode: 422, exposeTechnicalDetails: true });
}

function volumeExceeded(subject, limit) {
  return reportGenerationError(
    'REPORT_VOLUME_LIMIT_EXCEEDED',
    `O recorte tem mais de ${limit} ${subject}. Reduza o período ou selecione uma Sprint.`
  );
}

// Cópia JSON: datas viram ISO e nada mutável dos serviços de origem vai para o snapshot.
const plain = (value) => JSON.parse(JSON.stringify(value));

// Cancelamento (prazo ou reserva perdida): nenhuma consulta nova começa depois dele.
// A consulta já em andamento termina normalmente; quem chama espera por ela.
const checkpoint = (signal) => signal?.throwIfAborted();

async function readPlanning(projectId, filters, limits, signal) {
  // Com Sprint escolhida, ela entra mesmo fora do período, como no filtro do painel.
  const windowed = filters.startDate && !filters.sprintId;
  checkpoint(signal);
  const schedule = await sprintService.getSchedule(projectId, {
    ...(windowed ? { from: filters.startDate, to: filters.endDate } : {})
  });
  const scheduled = filters.sprintId
    ? schedule.sprints.filter((sprint) => sprint.id === filters.sprintId)
    : schedule.sprints;
  if (scheduled.length > limits.sprints) throw volumeExceeded('Sprints', limits.sprints);
  const sprints = [];
  for (const sprint of scheduled) {
    // A lista de tarefas da agenda fica fora: o relatório é resumido por Sprint.
    const summary = { ...sprint };
    delete summary.tasks;
    checkpoint(signal);
    sprints.push({
      ...summary,
      progress: await sprintService.getSprintProgress(sprint.id)
    });
  }
  const milestoneIds = new Set(sprints.map((sprint) => sprint.milestoneId).filter(Boolean));
  const milestones = filters.sprintId
    ? schedule.milestones.filter((milestone) => milestoneIds.has(milestone.id))
    : schedule.milestones;
  return {
    range: schedule.range,
    sprints,
    milestones: milestones.map((milestone) => ({
      ...milestone,
      sprintCount: sprints.filter((sprint) => sprint.milestoneId === milestone.id).length
    })),
    unassignedTaskCount: filters.sprintId ? null : schedule.unassignedTasks.length
  };
}

async function readTraceability(projectId, limits, signal) {
  const pageSize = limits.requirementPageSize;
  checkpoint(signal);
  const first = await requirementProjectionService.list(projectId, { page: 1, limit: pageSize });
  if (first.summary.total > limits.requirements)
    throw volumeExceeded('requisitos', limits.requirements);
  const items = new Map(first.items.map((item) => [item.requirement.id, item]));
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    checkpoint(signal);
    const next = await requirementProjectionService.list(projectId, { page, limit: pageSize });
    for (const item of next.items) items.set(item.requirement.id, item);
  }
  return {
    scope: 'CURRENT',
    summary: first.summary,
    items: [...items.values()].sort((a, b) => b.requirement.id - a.requirement.id)
  };
}

function sourceUnavailable(view) {
  return reportGenerationError(
    'REPORT_SOURCE_UNAVAILABLE',
    `Uma fonte de dados dos indicadores (${view}) ficou indisponível. Gere o relatório novamente.`
  );
}

async function readIndicators(projectId, filters, asOf, requestId, signal) {
  const query = {
    ...(filters.startDate
      ? { startDate: filters.startDate, endDate: filters.endDate, timeZone: filters.timeZone }
      : {}),
    ...(filters.sprintId ? { sprintId: filters.sprintId } : {})
  };
  const views = [];
  let project = null;
  // Sequencial de propósito: cada visão já paraleliza as próprias fontes, e o relatório
  // roda em segundo plano sem disputar o pool com as telas abertas.
  for (const { view } of publicDashboardViews()) {
    checkpoint(signal);
    const dashboard = await dashboardService.read(projectId, { view, ...query }, () => asOf, {
      requestId
    });
    // O painel mostra fonte indisponível como estado da tela; no relatório isso seria
    // um retrato incompleto marcado como pronto, então a geração inteira falha.
    if (dashboard.warnings.some((warning) => warning.code === 'SOURCE_UNAVAILABLE'))
      throw sourceUnavailable(view);
    project ??= dashboard.context.project;
    views.push({
      view,
      viewState: dashboard.viewState,
      requestedFilters: dashboard.requestedFilters,
      sprint: dashboard.context.sprint ?? null,
      freshness: dashboard.freshness,
      warnings: dashboard.warnings,
      ...(dashboard.projectHealth !== undefined ? { projectHealth: dashboard.projectHealth } : {}),
      sections: dashboard.sections
    });
  }
  const metricIds = new Set(
    views.flatMap((view) =>
      view.sections.flatMap((section) => section.indicators.map((indicator) => indicator.metricId))
    )
  );
  const catalog = publicDashboardCatalog()
    .filter((definition) => metricIds.has(definition.metricId))
    .map(({ metricId, title, description, unit, rf, category }) => ({
      metricId,
      title,
      description,
      unit,
      rf,
      category
    }));
  return { project, indicators: { views, catalog } };
}

// Compõe o snapshot exclusivamente a partir dos serviços que alimentam as abas
// Cronograma, Sprints, Rastreabilidade e Indicadores, com o mesmo recorte.
export async function buildReportSnapshot(
  { projectId, filters, asOf, requestId },
  { limits = REPORT_LIMITS, signal } = {}
) {
  const { project, indicators } = await readIndicators(projectId, filters, asOf, requestId, signal);
  const planning = await readPlanning(projectId, filters, limits, signal);
  const traceability = await readTraceability(projectId, limits, signal);
  checkpoint(signal);
  const sprint = filters.sprintId
    ? (planning.sprints.find((item) => item.id === filters.sprintId) ?? null)
    : null;
  const raw = plain({
    schemaVersion: REPORT_SNAPSHOT_VERSION,
    generatedAt: asOf.toISOString(),
    project: project ? { id: project.id, name: project.name } : { id: projectId, name: null },
    filters: {
      startDate: filters.startDate ?? null,
      endDate: filters.endDate ?? null,
      timeZone: filters.timeZone ?? null,
      sprintId: filters.sprintId ?? null,
      sprint: sprint ? { id: sprint.id, name: sprint.name, status: sprint.status } : null
    },
    planning,
    traceability,
    indicators
  });
  const { snapshot, userIds } = stripPeople(raw);
  const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  if (bytes > limits.snapshotBytes)
    throw reportGenerationError(
      'REPORT_TOO_LARGE',
      'O relatório ficou grande demais para ser armazenado. Reduza o período ou selecione uma Sprint.'
    );
  return { snapshot, userIds, bytes };
}
