import { useMemo } from 'react';
import {
  METRIC_TITLES,
  VIEW_LABELS,
  describeLimitation,
  distributionRows,
  formatCivilDate,
  formatMetricValue,
  formatDateTime
} from '../../indicators/index.js';
import { SprintBurndownChart } from '../../schedule/index.js';
import { situationLabel, situations } from '../../traceability/index.js';
import {
  INDICATOR_STATE_LABELS,
  formatReportPeriod,
  indicatorItems,
  indicatorStatus,
  indicatorValue,
  percent,
  personLabel,
  withFrozenNames
} from '../model/report-display.js';
import {
  HEALTH_LABELS,
  HEALTH_STATUSES,
  HEALTH_TONES,
  SPRINT_SITUATIONS,
  healthCounts,
  milestoneSituation,
  progressBar,
  reportOverview,
  sprintSituation
} from '../model/report-summary.js';

function Badge({ tone = 'neutral', children }) {
  return <span className={`report-badge report-badge--${tone}`}>{children}</span>;
}

function SituationBadge({ value }) {
  return <Badge tone={situations[value]?.[1]}>{situationLabel(value)}</Badge>;
}

// Barra decorativa: o número correspondente sempre aparece em texto ao lado.
function Bar({ value, tone = 'info' }) {
  return (
    <span className="report-bar" aria-hidden="true">
      <span
        className={`report-bar__fill report-bar__fill--${tone}`}
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

function CountChips({ entries, label }) {
  const visible = entries.filter(([, count]) => count > 0);
  if (!visible.length) return null;
  return (
    <ul className="report-chips report-chips--compact" aria-label={label}>
      {visible.map(([key, count, text, tone]) => (
        <li key={key}>
          <Badge tone={tone}>
            {text}: {count}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

const healthEntries = (counts) =>
  HEALTH_STATUSES.map((status) => [
    status,
    counts[status],
    HEALTH_LABELS[status],
    HEALTH_TONES[status]
  ]);

function ReportOverview({ snapshot }) {
  const overview = useMemo(() => reportOverview(snapshot), [snapshot]);
  const healthTone = overview.health ? HEALTH_TONES[overview.health.status] : 'neutral';
  const tiles = [
    {
      key: 'progress',
      label: 'Progresso do projeto',
      value: overview.progress == null ? '—' : formatMetricValue(overview.progress, 'PERCENT'),
      bar: overview.progress == null ? null : progressBar({ percentage: overview.progress })
    },
    {
      key: 'requirements',
      label: 'Requisitos concluídos',
      value: overview.requirements.total
        ? `${overview.requirements.done} de ${overview.requirements.total}`
        : '—',
      bar: progressBar(overview.requirements)
    },
    {
      key: 'health',
      label: 'Saúde do projeto',
      value: overview.health?.score != null ? `${overview.health.score} / 100` : '—',
      badge: overview.health && (
        <Badge tone={healthTone}>
          {HEALTH_LABELS[overview.health.status] ?? 'Dados insuficientes'}
        </Badge>
      ),
      bar: overview.health?.score != null && { value: overview.health.score, tone: healthTone }
    },
    {
      key: 'defects',
      label: 'Defeitos pendentes',
      value: overview.pendingDefects == null ? '—' : String(overview.pendingDefects),
      badge: overview.pendingDefects != null && (
        <Badge tone={overview.pendingDefects ? 'danger' : 'success'}>
          {overview.pendingDefects ? 'Em aberto' : 'Nenhum'}
        </Badge>
      )
    }
  ];
  return (
    <section className="report-overview" aria-label="Resumo do relatório">
      <ul className="report-overview__tiles">
        {tiles.map((tile) => (
          <li key={tile.key} className="report-tile">
            <span className="report-tile__label">{tile.label}</span>
            <span className="report-tile__value">
              {tile.value}
              {tile.badge}
            </span>
            {tile.bar && <Bar value={tile.bar.value} tone={tile.bar.tone} />}
          </li>
        ))}
      </ul>
      <div className="report-overview__groups">
        <div>
          <h3>Sprints</h3>
          <CountChips
            label="Sprints por situação"
            entries={Object.entries(SPRINT_SITUATIONS).map(([key, [text, tone]]) => [
              key,
              overview.sprints[key],
              text,
              tone
            ])}
          />
          {!snapshot.planning.sprints.length && <p className="report-empty">Nenhuma no recorte.</p>}
        </div>
        <div>
          <h3>Status dos indicadores</h3>
          <CountChips label="Indicadores por status" entries={healthEntries(overview.indicators)} />
        </div>
      </div>
    </section>
  );
}

function ReportPlanning({ planning, generatedAt }) {
  return (
    <section className="report-section" aria-labelledby="report-planning">
      <header className="report-section__heading">
        <h2 id="report-planning">Planejamento</h2>
        <p>
          {planning.sprints.length} {planning.sprints.length === 1 ? 'Sprint' : 'Sprints'} e{' '}
          {planning.milestones.length} {planning.milestones.length === 1 ? 'marco' : 'marcos'} no
          recorte
          {planning.unassignedTaskCount != null &&
            ` · ${planning.unassignedTaskCount} ${planning.unassignedTaskCount === 1 ? 'tarefa' : 'tarefas'} fora de Sprint`}
          .
        </p>
      </header>
      {planning.sprints.length === 0 ? (
        <p className="report-empty">Nenhuma Sprint no recorte.</p>
      ) : (
        <div className="report-sprints">
          {planning.sprints.map((sprint) => {
            const situation = sprintSituation(sprint, generatedAt);
            const bar = progressBar(sprint.progress?.current);
            return (
              <article
                className={`report-sprint report-sprint--${situation.tone}`}
                key={sprint.id}
                aria-label={sprint.name}
              >
                <header className="report-sprint__header">
                  <h3>{sprint.name}</h3>
                  <Badge tone={situation.tone}>{situation.label}</Badge>
                </header>
                <dl className="report-meta report-meta--compact">
                  <div>
                    <dt>Período</dt>
                    <dd>
                      {formatCivilDate(sprint.startDate)} a {formatCivilDate(sprint.endDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>Marco</dt>
                    <dd>{sprint.milestone?.title ?? 'Sem marco'}</dd>
                  </div>
                  <div>
                    <dt>Tarefas concluídas</dt>
                    <dd>
                      {percent(sprint.progress?.current)}
                      {bar && <Bar value={bar.value} tone={bar.tone} />}
                    </dd>
                  </div>
                  <div>
                    <dt>Tarefas na Sprint</dt>
                    <dd>{sprint.taskCount}</dd>
                  </div>
                </dl>
                {sprint.objective && <p className="report-sprint__objective">{sprint.objective}</p>}
                {sprint.progress?.burndown && (
                  <SprintBurndownChart burndown={sprint.progress.burndown} />
                )}
              </article>
            );
          })}
        </div>
      )}
      {planning.milestones.length > 0 && (
        <div className="report-table-wrapper">
          <table className="report-table">
            <caption>Marcos</caption>
            <thead>
              <tr>
                <th scope="col">Marco</th>
                <th scope="col">Prazo</th>
                <th scope="col">Situação</th>
                <th scope="col">Sprints no recorte</th>
              </tr>
            </thead>
            <tbody>
              {planning.milestones.map((milestone) => {
                const situation = milestoneSituation(milestone);
                return (
                  <tr key={milestone.id}>
                    <th scope="row">{milestone.title}</th>
                    <td>{formatDateTime(milestone.dueDate)}</td>
                    <td>
                      <Badge tone={situation.tone}>{situation.label}</Badge>
                    </td>
                    <td>{milestone.sprintCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function pendingDefects(defects) {
  if (!defects) return 0;
  return (defects.open ?? 0) + (defects.inCorrection ?? 0) + (defects.waitingRetest ?? 0);
}

function ReportTraceability({ traceability }) {
  const counts = Object.entries(traceability.summary?.bySituation ?? {}).filter(
    ([, count]) => count > 0
  );
  return (
    <section className="report-section" aria-labelledby="report-traceability">
      <header className="report-section__heading">
        <h2 id="report-traceability">Rastreabilidade</h2>
        <p>
          Situação de cada requisito no momento da geração ·{' '}
          {traceability.summary?.total ?? traceability.items.length}{' '}
          {(traceability.summary?.total ?? traceability.items.length) === 1
            ? 'requisito'
            : 'requisitos'}
          .
        </p>
      </header>
      {counts.length > 0 && (
        <ul className="report-chips" aria-label="Requisitos por situação">
          {counts.map(([situation, count]) => (
            <li key={situation}>
              <SituationBadge value={situation} /> <strong>{count}</strong>
            </li>
          ))}
        </ul>
      )}
      {traceability.items.length === 0 ? (
        <p className="report-empty">Nenhum requisito cadastrado.</p>
      ) : (
        <div className="report-table-wrapper">
          <table className="report-table">
            <caption>Requisitos</caption>
            <thead>
              <tr>
                <th scope="col">Requisito</th>
                <th scope="col">Situação</th>
                <th scope="col">Progresso</th>
                <th scope="col">Testes aprovados</th>
                <th scope="col">Defeitos pendentes</th>
              </tr>
            </thead>
            <tbody>
              {traceability.items.map((item) => {
                const bar = progressBar(item.progress);
                const pending = pendingDefects(item.defects);
                return (
                  <tr key={item.requirement.id}>
                    <th scope="row">
                      <span className="report-table__id">{item.requirement.displayId}</span>{' '}
                      {item.requirement.title}
                    </th>
                    <td>
                      <SituationBadge value={item.situation} />
                    </td>
                    <td>
                      <span className="report-progress">
                        {percent(item.progress)}
                        {bar && <Bar value={bar.value} tone={bar.tone} />}
                      </span>
                    </td>
                    <td>
                      {item.validation?.testCasesTotal
                        ? `${item.validation.pass} de ${item.validation.testCasesTotal}`
                        : '—'}
                    </td>
                    <td>{pending ? <Badge tone="danger">{pending}</Badge> : pending}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function IndicatorNotes({ indicator, status }) {
  const codes = [...new Set(indicator.limitations ?? [])].filter(
    (code) => !code.includes('FILTER_') && code !== 'PERIOD_NOT_COMPLETE'
  );
  const breakdown =
    indicator.value && typeof indicator.value === 'object' ? distributionRows(indicator) : [];
  const items = indicatorItems(indicator);
  if (
    !status.reason &&
    !status.reference &&
    !codes.length &&
    !indicator.people?.length &&
    !breakdown.length &&
    !items.length
  )
    return '—';
  return (
    <>
      {(status.reason || status.reference) && (
        <p className={`report-status-reason report-status-reason--${status.tone}`}>
          {status.reason}
          {status.reason && status.reference && ' '}
          {status.reference && <span>{status.reference}</span>}
        </p>
      )}
      {items.length > 0 && (
        <ul className="report-people" aria-label="Itens">
          {items.map((item) => (
            <li key={item.key}>{item.text}</li>
          ))}
        </ul>
      )}
      {breakdown.length > 0 && (
        <ul className="report-people" aria-label="Detalhamento">
          {breakdown.map((row) => (
            <li key={row.key}>
              {row.label}: {formatMetricValue(row.value, row.unit)}
            </li>
          ))}
        </ul>
      )}
      {codes.length > 0 && (
        <ul className="report-notes">
          {[...new Set(codes.map(describeLimitation))].map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {indicator.people?.length > 0 && (
        <ul className="report-people" aria-label="Por pessoa">
          {indicator.people.map((person) => (
            <li key={person.userId}>
              {person.displayName}:{' '}
              {[
                person.completedTasks != null &&
                  `${person.completedTasks} ${person.completedTasks === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`,
                person.commits != null &&
                  `${person.commits} ${person.commits === 1 ? 'commit' : 'commits'}`,
                person.count != null && `${person.count}`
              ]
                .filter(Boolean)
                .join(' · ')}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const VALUE_BAR_TONES = { HEALTHY: 'success', ATTENTION: 'warning', CRITICAL: 'danger' };

function ReportIndicators({ indicators }) {
  const catalog = useMemo(
    () => new Map(indicators.catalog.map((entry) => [entry.metricId, entry])),
    [indicators.catalog]
  );
  return (
    <section className="report-section" aria-labelledby="report-indicators">
      <header className="report-section__heading">
        <h2 id="report-indicators">Indicadores</h2>
        <p>
          Os mesmos valores do painel de Indicadores para o recorte do relatório. O status segue a
          avaliação da Saúde do Projeto: verde está saudável, amarelo pede atenção e vermelho é
          crítico.
        </p>
      </header>
      {indicators.views.map((view) => {
        const rows = view.sections.flatMap((section) => section.indicators);
        return (
          <div className="report-table-wrapper" key={view.view}>
            <table className="report-table report-table--indicators">
              <caption>
                <div className="report-caption">
                  <span>{VIEW_LABELS[view.view] ?? view.view}</span>
                  <CountChips
                    label={`Status na visão ${VIEW_LABELS[view.view] ?? view.view}`}
                    entries={healthEntries(healthCounts([view])).filter(
                      ([status]) => status !== 'NEUTRAL'
                    )}
                  />
                </div>
              </caption>
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Status</th>
                  <th scope="col">Observações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((indicator) => {
                  const definition = catalog.get(indicator.metricId);
                  const status = indicatorStatus(indicator);
                  const value = indicatorValue(indicator, definition?.unit);
                  const bar =
                    definition?.unit === 'PERCENT' && value !== '—'
                      ? progressBar({ percentage: indicator.value })
                      : null;
                  return (
                    <tr
                      key={`${view.view}:${indicator.metricId}`}
                      className={`report-indicator report-indicator--${status.tone}`}
                    >
                      <th scope="row">
                        {METRIC_TITLES[indicator.metricId] ??
                          definition?.title ??
                          indicator.metricId}
                        {definition?.rf && (
                          <span className="report-table__id"> {definition.rf}</span>
                        )}
                      </th>
                      <td className="report-table__value">
                        {value}
                        {bar && (
                          <Bar value={bar.value} tone={VALUE_BAR_TONES[status.status] ?? 'info'} />
                        )}
                        {indicator.state !== 'AVAILABLE' && (
                          <span className="report-table__state">
                            {INDICATOR_STATE_LABELS[indicator.state] ?? 'Estado desconhecido'}
                          </span>
                        )}
                      </td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        <IndicatorNotes indicator={indicator} status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}

export function ReportDocument({ report }) {
  const snapshot = useMemo(
    () =>
      withFrozenNames(
        report.snapshot,
        new Map(report.people.map((person) => [person.userId, person]))
      ),
    [report]
  );
  return (
    <article className="report-document" aria-labelledby="report-title">
      <header className="report-document__header">
        <span className="eyebrow">Relatório #{report.id}</span>
        <h2 id="report-title">{snapshot.project.name ?? 'Projeto'}</h2>
        <dl className="report-meta">
          <div>
            <dt>Período</dt>
            <dd>{formatReportPeriod(snapshot.filters)}</dd>
          </div>
          {snapshot.filters.timeZone && (
            <div>
              <dt>Fuso horário</dt>
              <dd>{snapshot.filters.timeZone}</dd>
            </div>
          )}
          <div>
            <dt>Sprint</dt>
            <dd>{snapshot.filters.sprint?.name ?? 'Todas do recorte'}</dd>
          </div>
          <div>
            <dt>Gerado em</dt>
            <dd>{formatDateTime(snapshot.generatedAt)}</dd>
          </div>
          <div>
            <dt>Solicitado por</dt>
            <dd>{personLabel(report.requestedBy)}</dd>
          </div>
        </dl>
        <p className="field-help">
          Retrato congelado no momento da geração: alterações posteriores no projeto não mudam este
          relatório.
        </p>
      </header>
      <ReportOverview snapshot={snapshot} />
      <nav className="report-document__toc" aria-label="Seções do relatório">
        <a href="#report-planning">Planejamento</a>
        <a href="#report-traceability">Rastreabilidade</a>
        <a href="#report-indicators">Indicadores</a>
      </nav>
      <ReportPlanning planning={snapshot.planning} generatedAt={snapshot.generatedAt} />
      <ReportTraceability traceability={snapshot.traceability} />
      <ReportIndicators indicators={snapshot.indicators} />
    </article>
  );
}
