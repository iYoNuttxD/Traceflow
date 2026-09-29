import { lazy, Suspense } from 'react';
import { DashboardHelp } from './DashboardHelp.jsx';
import {
  describeLimitation,
  distributionRows,
  formatDateTime,
  formatMetricValue,
  indicatorHelp,
  indicatorVisualType,
  METRIC_TITLES
} from '../dashboard-display.js';
import { IndicatorProgress } from './IndicatorProgress.jsx';
import { HEALTH_STATUS_LABELS } from '../health-display.js';

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

function IndicatorList({ indicator }) {
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
      aria-label="Lista de registros"
    >
      <table className="indicator-card__table">
        <caption>
          Registros relacionados
          {['I28', 'I34', 'I35'].includes(indicator.metricId) &&
          indicator.value > indicator.items.length
            ? ` · ${indicator.items.length} de ${indicator.value}`
            : ''}
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
                      ? `Prazo: ${formatDateTime(item.deadline)}`
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

function IndicatorDistribution({ indicator }) {
  const rows = distributionRows(indicator);
  const people = indicator.distribution?.people ?? indicator.people ?? [];
  if (!rows.length && !people.length) return null;
  const magnitude = Math.max(
    1,
    ...rows.map(({ value }) => (typeof value === 'number' ? Math.abs(value) : 0))
  );
  return (
    <div className="indicator-card__distribution">
      {rows.map(({ key, label, value, unit }) => (
        <div className="indicator-card__distribution-row" key={key}>
          <span>{label}</span>
          <strong>{formatMetricValue(value, unit)}</strong>
          {typeof value === 'number' && value >= 0 && (
            <span className="indicator-card__bar" aria-hidden="true">
              <span
                style={{ width: `${Math.max(0, Math.min(100, (value / magnitude) * 100))}%` }}
              />
            </span>
          )}
        </div>
      ))}
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

export function IndicatorCard({ indicator, metadata, sharedLimitations = [] }) {
  const title = METRIC_TITLES[indicator.metricId] ?? metadata.title;
  const limitations = (indicator.limitations ?? []).filter(
    (code) => !code.includes('FILTER_') && code !== 'PERIOD_NOT_COMPLETE'
  );
  const individualLimitations = limitations.filter((code) => !sharedLimitations.includes(code));
  const state = STATE_LABELS[indicator.state] ? indicator.state : 'UNKNOWN';
  const visualType = indicatorVisualType(indicator);
  const help = indicatorHelp(indicator, metadata);
  const hasValue = ['AVAILABLE', 'PARTIAL', 'STALE'].includes(state);
  const scalar = hasValue && typeof indicator.value === 'number';
  const hasChart = hasValue && indicator.kind === 'SERIES' && indicator.points?.length > 0;
  const status = STATE_LABELS[state] ?? 'Estado desconhecido';
  const assessment = indicator.assessment;
  const healthBadge = ['HEALTHY', 'ATTENTION', 'CRITICAL'].includes(assessment?.status);

  return (
    <article
      className={`indicator-card indicator-card--${state.toLowerCase()} indicator-card--${visualType}`}
      aria-label={title}
      data-metric-id={indicator.metricId}
    >
      <header className="indicator-card__header">
        <div>
          <h4>{title}</h4>
          {healthBadge && (
            <span
              className={`indicator-card__health indicator-card__health--${assessment.status.toLowerCase()}`}
            >
              {HEALTH_STATUS_LABELS[assessment.status]}
            </span>
          )}
        </div>
        <DashboardHelp title={title}>
          <strong>O que mostra</strong>
          <p>{help.what}</p>
          <strong>Valor atual</strong>
          <p>
            {scalar
              ? formatMetricValue(indicator.value, indicator.unit)
              : hasValue
                ? 'Consulte a distribuição ou os registros apresentados no cartão.'
                : 'Ainda não há valor disponível nesta leitura.'}
          </p>
          <IndicatorReference assessment={assessment} />
          <strong>Como interpretar</strong>
          <p>{help.meaning}</p>
        </DashboardHelp>
      </header>

      {['PARTIAL', 'STALE', 'UNKNOWN'].includes(state) &&
        (state === 'STALE' || individualLimitations.length > 0 || !sharedLimitations.length) && (
          <div className="indicator-card__status-line">
            <span className={`indicator-card__state indicator-card__state--${state.toLowerCase()}`}>
              {status}
            </span>
          </div>
        )}

      {state === 'NO_DATA' && (
        <p className="indicator-card__empty">
          {EMPTY_MESSAGES[indicator.metricId] ?? 'Nenhum dado elegível para este indicador.'}
        </p>
      )}
      {state === 'UNAVAILABLE' &&
        (individualLimitations.length > 0 || sharedLimitations.length === 0) && (
          <p className="indicator-card__empty">
            {individualLimitations.length
              ? describeLimitation(individualLimitations[0])
              : 'Não há dados suficientes para apresentar este indicador.'}
          </p>
        )}
      {state === 'UNKNOWN' && (
        <p className="indicator-card__empty">
          Não foi possível interpretar o estado deste indicador.
        </p>
      )}

      {hasValue && (
        <div className="indicator-card__content">
          {scalar && (
            <strong className="indicator-card__value">
              {indicator.metricId === 'I17'
                ? `${formatMetricValue(indicator.value)} ${indicator.value === 1 ? 'PR aberta' : 'PRs abertas'}`
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
          <IndicatorReference assessment={assessment} />
          {hasChart && (
            <Suspense fallback={<p role="status">Carregando gráfico...</p>}>
              <IndicatorChart indicator={indicator} title={title} />
            </Suspense>
          )}
          {indicator.kind === 'SERIES' && !hasChart && (
            <p className="indicator-card__empty">Ainda não há pontos históricos para exibir.</p>
          )}
          {indicator.kind === 'LIST' && <IndicatorList indicator={indicator} />}
          {indicator.kind !== 'SERIES' && <IndicatorDistribution indicator={indicator} />}
          {!scalar &&
            !hasChart &&
            indicator.kind !== 'LIST' &&
            indicator.kind !== 'SERIES' &&
            !indicator.distribution &&
            (indicator.value == null || typeof indicator.value !== 'object') && (
              <span className="indicator-card__value">—</span>
            )}
        </div>
      )}

      {['PARTIAL', 'STALE'].includes(state) &&
        (state === 'STALE' || individualLimitations.length > 0 || !sharedLimitations.length) && (
          <p className="indicator-card__notice">
            {state === 'STALE'
              ? 'Último valor conhecido; confira a atualização da fonte.'
              : 'O valor considera somente os dados conhecidos.'}{' '}
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
