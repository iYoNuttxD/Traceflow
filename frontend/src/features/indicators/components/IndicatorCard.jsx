import { lazy, Suspense, useId, useState } from 'react';
import { IndicatorHeader } from './IndicatorHeader.jsx';
import {
  describeLimitation,
  presentationLimitations,
  distributionRows,
  formatDateTime,
  formatCivilDate,
  formatMetricValue,
  indicatorHelp,
  indicatorVisualType,
  METRIC_TITLES
} from '../dashboard-display.js';
import { IndicatorProgress } from './IndicatorProgress.jsx';
import { describeHealthReason } from '../health-display.js';
import { indicatorAuditDetails } from '../indicator-audit-display.js';

function CalculationRule({ text }) {
  // Keep small mathematical groups together; the full rule still wraps naturally.
  const groups = text.split(/(\S+\s+×\s+100|[÷−]\s+\S+)/g);
  return (
    <p className="dashboard-help__rule">
      {groups.map((group, index) =>
        index % 2 === 1 ? (
          <span className="dashboard-help__rule-group" key={index}>
            {group}
          </span>
        ) : (
          group
        )
      )}
    </p>
  );
}

function IndicatorCalculationDetails({ indicator, metadata }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const details = indicatorAuditDetails(indicator, metadata);
  return (
    <div className="dashboard-help__calculation">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        Detalhes do cálculo <span aria-hidden="true">{expanded ? '⌄' : '›'}</span>
      </button>
      <div id={id} hidden={!expanded}>
        <strong>Como é calculado</strong>
        <CalculationRule text={details.formula} />
        <strong>Fonte</strong>
        <p>
          {details.sources.length
            ? details.sources.join(' · ')
            : (metadata?.source ?? 'Indisponível no momento.')}
        </p>
        <strong>{details.clockLabel}</strong>
        <p>{details.clock}</p>
      </div>
    </div>
  );
}

const IndicatorChart = lazy(() =>
  import('./IndicatorChart.jsx').then((module) => ({ default: module.IndicatorChart }))
);

const STATE_LABELS = {
  AVAILABLE: 'Disponível',
  NO_DATA: 'Sem dados',
  PARTIAL: 'Dados parciais',
  STALE: 'Dados desatualizados',
  UNAVAILABLE: 'Indisponível'
};

const EMPTY_MESSAGES = {
  I15: 'Nenhuma PR mesclada elegível no período.',
  I16: 'Nenhuma PR mesclada elegível no período.',
  I17: 'Nenhuma PR aberta no momento.',
  I20: 'Nenhuma Task concluída elegível no período.',
  I21: 'Nenhum ciclo concluído elegível no período.',
  I24: 'Nenhuma Task em andamento com histórico elegível.',
  I47: 'Nenhuma Sprint concluída com histórico elegível.'
};

function safeGithubUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null;
  } catch {
    return null;
  }
}

function listLabel(item) {
  return item.title ?? item.sprintName ?? item.displayId ?? `Task ${item.taskId ?? item.id ?? ''}`;
}

function IndicatorList({ indicator, title }) {
  if (!indicator.items?.length) return null;
  const showResponsible = indicator.items.some((item) => 'responsible' in item);
  const showDetails = indicator.items.some((item) => item.deadline || item.direction);
  const showValue = indicator.items.some((item) =>
    [item.defectCount, item.age, item.agingDuration, item.difference].some((value) => value != null)
  );
  const valueLabel = indicator.items.some((item) => item.defectCount != null)
    ? 'Defeitos'
    : indicator.items.some((item) => item.difference != null)
      ? 'Desvio'
      : 'Idade';
  return (
    <div
      className="indicator-card__table-scroll"
      tabIndex={0}
      role="region"
      aria-label={`Registros de ${title}`}
    >
      <table className="indicator-card__table">
        <caption className="indicator-card__list-count">
          {indicator.items.length} de{' '}
          {indicator.kind === 'LIST' && ['I28', 'I34', 'I35', 'I17'].includes(indicator.metricId)
            ? (indicator.value ?? indicator.items.length)
            : (indicator.eligibleCount ?? indicator.items.length)}{' '}
          registros
        </caption>
        <thead>
          <tr>
            <th scope="col">Registro</th>
            {showResponsible && <th scope="col">Responsável</th>}
            {showDetails && <th scope="col">Detalhes</th>}
            {showValue && <th scope="col">{valueLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {indicator.items.map((item, index) => {
            const url = safeGithubUrl(item.githubUrl);
            const value =
              item.defectCount != null
                ? `${formatMetricValue(item.defectCount)} ${item.defectCount === 1 ? 'defeito' : 'defeitos'}`
                : item.age != null
                  ? formatMetricValue(item.age, 'DAYS')
                  : item.agingDuration != null
                    ? formatMetricValue(item.agingDuration, 'DAYS')
                    : item.difference != null
                      ? formatMetricValue(item.difference, 'HOURS')
                      : '—';
            return (
              <tr
                key={`${item.requirementId ?? item.taskId ?? item.pullRequestId ?? index}-${item.direction ?? index}`}
              >
                <th scope="row">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {listLabel(item)}
                    </a>
                  ) : (
                    listLabel(item)
                  )}
                  {item.displayId && <small>{item.displayId}</small>}
                </th>
                {showResponsible && <td>{item.responsible?.name ?? 'Não informado'}</td>}
                {showDetails && (
                  <td>
                    {item.deadline
                      ? `Prazo: ${formatCivilDate(item.deadline)}`
                      : item.direction === 'INCOMING'
                        ? 'Recebida de outra Sprint'
                        : item.direction === 'OUTGOING'
                          ? 'Transferida para outra Sprint'
                          : '—'}
                  </td>
                )}
                {showValue && <td>{value}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IndicatorReference({ assessment }) {
  const { reference, delta } = assessment ?? {};
  if (!reference) return null;
  return (
    <div className="indicator-card__reference">
      <span>
        {reference.label}: <strong>{formatMetricValue(reference.value, reference.unit)}</strong>
      </span>
      {delta && (
        <span>
          Variação:{' '}
          <strong>
            {delta.value > 0 ? '+' : ''}
            {formatMetricValue(delta.value, delta.unit)}
          </strong>
        </span>
      )}
    </div>
  );
}

function DistributionRows({ rows }) {
  const magnitude = Math.max(
    1,
    ...rows.map(({ value }) => (typeof value === 'number' ? Math.abs(value) : 0))
  );
  return rows.map(({ key, label, value, unit }) => (
    <div className="indicator-card__distribution-row" key={key}>
      <span>{label}</span>
      <strong>{formatMetricValue(value, unit)}</strong>
      {typeof value === 'number' && value >= 0 && (
        <span className="indicator-card__bar" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, (value / magnitude) * 100))}%` }} />
        </span>
      )}
    </div>
  ));
}

function CommitDistribution({ rows, people }) {
  return (
    <div className="indicator-card__distribution-groups">
      <section aria-label="Associação" className="indicator-card__distribution">
        <h5>Associação</h5>
        <DistributionRows rows={rows} />
      </section>
      <section aria-label="Por responsável" className="indicator-card__distribution">
        <h5>Por responsável</h5>
        {people.length ? (
          <DistributionRows
            rows={people.map((person) => ({
              key: person.userId,
              label: person.displayName,
              value: person.count ?? person.commits
            }))}
          />
        ) : (
          <p className="indicator-card__empty">Nenhum responsável associado neste período.</p>
        )}
      </section>
    </div>
  );
}

function CarryOverSummary({ value }) {
  if (!value || typeof value !== 'object') return null;
  const incoming = value.incoming ?? 0;
  const outgoing = value.outgoing ?? 0;
  const text = [
    incoming > 0 ? `${incoming} ${incoming === 1 ? 'entrada' : 'entradas'}` : '',
    outgoing > 0 ? `${outgoing} ${outgoing === 1 ? 'saída' : 'saídas'}` : ''
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <strong className="indicator-card__value indicator-card__value--scope">
      {text || '0 transferências'}
    </strong>
  );
}

function IndicatorDistribution({ indicator }) {
  const rows = distributionRows(indicator);
  const people = indicator.distribution?.people ?? indicator.people ?? [];
  if (!rows.length && !people.length) return null;
  if (indicator.metricId === 'I02') return <CommitDistribution rows={rows} people={people} />;
  return (
    <div className="indicator-card__distribution">
      <DistributionRows rows={rows} />
      {people.map((person) => (
        <div className="indicator-card__distribution-row" key={person.userId}>
          <span>{person.displayName}</span>
          <strong>
            {formatMetricValue(person.count ?? person.completedTasks ?? person.commits)}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function IndicatorCard({
  indicator,
  metadata,
  sharedLimitations = [],
  presentation,
  style
}) {
  const title =
    presentation === 'trend'
      ? 'Throughput no período'
      : (METRIC_TITLES[indicator.metricId] ?? metadata.title);
  const limitations = presentationLimitations(indicator).filter(
    (code) => !code.includes('FILTER_') && code !== 'PERIOD_NOT_COMPLETE'
  );
  const individualLimitations = limitations.filter((code) => !sharedLimitations.includes(code));
  const state = STATE_LABELS[indicator.state] ? indicator.state : 'UNKNOWN';
  const visualType = presentation === 'summary' ? 'kpi-compact' : indicatorVisualType(indicator);
  const help = indicatorHelp(indicator, metadata);
  const hasValue = ['AVAILABLE', 'PARTIAL', 'STALE'].includes(state);
  const scalar = hasValue && typeof indicator.value === 'number';
  const hasChart =
    presentation !== 'summary' &&
    hasValue &&
    indicator.kind === 'SERIES' &&
    indicator.points?.length > 0;
  const status = STATE_LABELS[state] ?? 'Estado desconhecido';
  const dataState = ['PARTIAL', 'STALE', 'UNAVAILABLE', 'UNKNOWN'].includes(state)
    ? { state, label: status }
    : null;
  const assessment = indicator.assessment;
  const noOpenPrs =
    indicator.metricId === 'I73' &&
    assessment?.status === 'HEALTHY' &&
    assessment?.reasonCode === 'NO_OPEN_PRS';

  return (
    <article
      className={`indicator-card indicator-card--${state.toLowerCase()} indicator-card--${visualType}`}
      aria-label={title}
      data-metric-id={indicator.metricId}
      style={style}
    >
      <IndicatorHeader title={title} assessment={assessment} dataState={dataState}>
        <strong>O que mostra</strong>
        <p>{help.what}</p>
        <strong>Valor atual</strong>
        <p>
          {scalar
            ? formatMetricValue(indicator.value, indicator.unit)
            : hasValue
              ? 'Consulte a distribuição ou os registros apresentados no cartão.'
              : noOpenPrs
                ? 'Nenhuma PR aberta.'
                : 'Ainda não há valor disponível nesta leitura.'}
        </p>
        <IndicatorReference assessment={assessment} />
        <strong>Como interpretar</strong>
        <p>{help.meaning}</p>
        {assessment?.reasonCode && assessment?.basis && (
          <p>{describeHealthReason(assessment, indicator.metricId)}</p>
        )}
        <IndicatorCalculationDetails indicator={indicator} metadata={metadata} />
      </IndicatorHeader>

      {['NO_DATA', 'UNAVAILABLE'].includes(state) && (
        <div className="indicator-card__content">
          <strong className="indicator-card__value">—</strong>
          {state === 'NO_DATA' && (
            <p className="indicator-card__empty">
              {noOpenPrs
                ? 'Nenhuma PR aberta.'
                : state === 'NO_DATA'
                  ? (EMPTY_MESSAGES[indicator.metricId] ?? 'Nenhum dado elegível neste período.')
                  : 'Indisponível'}
            </p>
          )}
          {state === 'UNAVAILABLE' && individualLimitations.length > 0 && (
            <p className="indicator-card__notice">{describeLimitation(individualLimitations[0])}</p>
          )}
        </div>
      )}
      {state === 'UNKNOWN' && (
        <p className="indicator-card__empty">
          Não foi possível interpretar o estado deste indicador.
        </p>
      )}

      {hasValue && (
        <div className="indicator-card__content">
          <div className="indicator-card__headline">
            {!scalar &&
              !hasChart &&
              !indicator.items?.length &&
              !indicator.distribution &&
              (indicator.value == null || typeof indicator.value !== 'object') && (
                <span className="indicator-card__value">—</span>
              )}
            {scalar && ['I20', 'I21'].includes(indicator.metricId) && (
              <span className="indicator-card__stat-label">Mediana do período</span>
            )}
            {scalar && presentation !== 'trend' && (
              <strong className="indicator-card__value">
                {indicator.metricId === 'I17'
                  ? `${formatMetricValue(indicator.value)} ${indicator.value === 1 ? 'PR aberta' : 'PRs abertas'}`
                  : ['I41', 'I42'].includes(indicator.metricId)
                    ? `${formatMetricValue(indicator.value)} ${indicator.value === 1 ? 'Task' : 'Tasks'}`
                    : formatMetricValue(indicator.value, indicator.unit)}
              </strong>
            )}
            {scalar &&
              indicator.unit === 'PERCENT' &&
              indicator.value >= 0 &&
              indicator.value <= 100 && (
                <IndicatorProgress
                  value={indicator.value}
                  label={title}
                  referenceValue={
                    ['I62', 'I63', 'I65', 'I66'].includes(indicator.metricId) &&
                    assessment?.reference?.unit === 'PERCENT'
                      ? assessment.reference.value
                      : undefined
                  }
                  referenceLabel={assessment?.reference?.label}
                  health={assessment?.status}
                />
              )}
            {indicator.metricId === 'I43' && <CarryOverSummary value={indicator.value} />}
            {indicator.metricId !== 'I44' && <IndicatorReference assessment={assessment} />}
          </div>
          <div className="indicator-card__visualization">
            {hasChart && (
              <Suspense fallback={<p role="status">Carregando gráfico...</p>}>
                <IndicatorChart indicator={indicator} title={title} />
              </Suspense>
            )}
            {presentation !== 'summary' && indicator.kind === 'SERIES' && !hasChart && (
              <p className="indicator-card__empty">Ainda não há pontos históricos para exibir.</p>
            )}
            {indicator.kind === 'LIST' && <IndicatorList indicator={indicator} title={title} />}
            {indicator.kind !== 'SERIES' && indicator.metricId !== 'I43' && (
              <IndicatorDistribution indicator={indicator} />
            )}
          </div>
        </div>
      )}

      {['PARTIAL', 'STALE'].includes(state) &&
        (state === 'STALE' ||
          individualLimitations.length > 0 ||
          (!sharedLimitations.length &&
            indicator.value == null &&
            !indicator.points?.length &&
            !indicator.items?.length)) && (
          <p className="indicator-card__notice">
            {state === 'STALE'
              ? 'Último valor conhecido; confira a atualização da fonte.'
              : indicator.value == null && !indicator.points?.length && !indicator.items?.length
                ? 'Sem valor conhecido nesta leitura.'
                : ''}{' '}
            {individualLimitations[0] ? describeLimitation(individualLimitations[0]) : ''}
          </p>
        )}
      {state === 'AVAILABLE' &&
        individualLimitations
          .filter((code) => code === 'DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS')
          .map((code) => (
            <p className="indicator-card__notice" key={code}>
              {describeLimitation(code)}
            </p>
          ))}
      {state === 'STALE' && indicator.sourceUpdatedAt && (
        <footer className="indicator-card__footer">
          Fonte atualizada em {formatDateTime(indicator.sourceUpdatedAt)}
        </footer>
      )}
    </article>
  );
}
