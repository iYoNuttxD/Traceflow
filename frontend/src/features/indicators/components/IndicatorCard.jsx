import { lazy, Suspense } from 'react';
import {
  describeLimitation,
  distributionRows,
  formatDateTime,
  formatMetricValue,
  indicatorHelp,
  indicatorVisualType,
  METRIC_TITLES
} from '../dashboard-display.js';

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
  return (
    <ol className="indicator-card__list">
      {indicator.items.map((item, index) => {
        const url = safeGithubUrl(item.githubUrl);
        return (
          <li key={item.requirementId ?? item.taskId ?? item.pullRequestId ?? index}>
            <span>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {listLabel(item)}
                </a>
              ) : (
                listLabel(item)
              )}
              {item.displayId && <small>{item.displayId}</small>}
              {item.deadline && <small>Prazo: {formatDateTime(item.deadline)}</small>}
            </span>
            <strong>
              {item.defectCount != null
                ? `${formatMetricValue(item.defectCount)} ${item.defectCount === 1 ? 'defeito' : 'defeitos'}`
                : item.age != null
                  ? formatMetricValue(item.age, 'DAYS')
                  : item.agingDuration != null
                    ? formatMetricValue(item.agingDuration, 'DAYS')
                    : item.difference != null
                      ? formatMetricValue(item.difference, 'HOURS')
                      : ''}
            </strong>
          </li>
        );
      })}
    </ol>
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

function FilterDetails({ indicator, requestedFilters }) {
  const requested = {
    period: Boolean(requestedFilters.period),
    sprint: requestedFilters.sprintId != null,
    responsible: requestedFilters.responsibleUserId != null
  };
  const labels = { period: 'Período', sprint: 'Sprint', responsible: 'Responsável' };
  return (
    <ul>
      {Object.entries(requested).map(([key, active]) => (
        <li key={key}>
          {labels[key]}:{' '}
          {active
            ? indicator.appliedFilters?.[key]
              ? 'aplicado'
              : indicator.filterCompatibility?.[key] === 'UNSAFE'
                ? 'não aplicado: recorte sem suporte seguro'
                : 'não se aplica a este indicador'
            : 'não solicitado'}
        </li>
      ))}
    </ul>
  );
}

export function IndicatorCard({
  indicator,
  metadata,
  requestedFilters,
  sharedLimitations = [],
  sharedUnappliedFilters = []
}) {
  const title = METRIC_TITLES[indicator.metricId] ?? metadata.title;
  const limitations = indicator.limitations ?? [];
  const individualLimitations = limitations.filter((code) => !sharedLimitations.includes(code));
  const state = STATE_LABELS[indicator.state] ? indicator.state : 'UNKNOWN';
  const visualType = indicatorVisualType(indicator);
  const help = indicatorHelp(indicator, metadata);
  const hasValue = ['AVAILABLE', 'PARTIAL', 'STALE'].includes(state);
  const scalar = hasValue && typeof indicator.value === 'number';
  const hasChart = hasValue && indicator.kind === 'SERIES' && indicator.points?.length > 0;
  const notApplied = Object.entries({
    period: Boolean(requestedFilters.period),
    sprint: requestedFilters.sprintId != null,
    responsible: requestedFilters.responsibleUserId != null
  }).some(
    ([key, requested]) =>
      requested && !indicator.appliedFilters?.[key] && !sharedUnappliedFilters.includes(key)
  );
  const status = STATE_LABELS[state] ?? 'Estado desconhecido';

  return (
    <article
      className={`indicator-card indicator-card--${state.toLowerCase()} indicator-card--${visualType}`}
      aria-label={title}
    >
      <header className="indicator-card__header">
        <div>
          <h4>{title}</h4>
        </div>
        <details className="indicator-card__help">
          <summary aria-label={`Informações sobre ${title}`} title="Entenda este indicador">
            ?
          </summary>
          <div className="indicator-card__help-content">
            <strong>O que mostra</strong>
            <p>{help.what}</p>
            <strong>Como é calculado</strong>
            <p>{help.how}</p>
            <strong>Como interpretar</strong>
            <p>{help.meaning}</p>
            {limitations.length > 0 && (
              <>
                <strong>Limitações dos dados</strong>
                <ul>
                  {limitations.map((code) => (
                    <li key={code}>{describeLimitation(code)}</li>
                  ))}
                </ul>
              </>
            )}
            <details className="indicator-card__technical">
              <summary>Detalhes técnicos</summary>
              <p>
                <strong>Indicador:</strong> {indicator.metricId}
              </p>
              <p>
                <strong>Fórmula:</strong> {indicator.formula}
              </p>
              <p>
                <strong>Fonte:</strong> {(indicator.sources ?? []).join(', ') || metadata.source}
              </p>
              {indicator.eventClock && (
                <p>
                  <strong>Relógio:</strong> {indicator.eventClock}
                </p>
              )}
              <p>
                <strong>Calculado em:</strong> {formatDateTime(indicator.asOf)}
              </p>
              {indicator.sourceUpdatedAt && (
                <p>
                  <strong>Fonte atualizada em:</strong> {formatDateTime(indicator.sourceUpdatedAt)}
                </p>
              )}
              <p>
                <strong>Versão da definição:</strong> {indicator.definitionVersion}
              </p>
              {indicator.rf && (
                <p>
                  <strong>Requisito:</strong> {indicator.rf}
                </p>
              )}
              <strong>Filtros</strong>
              <FilterDetails indicator={indicator} requestedFilters={requestedFilters} />
            </details>
          </div>
        </details>
      </header>

      {(state !== 'AVAILABLE' || notApplied) && (
        <div className="indicator-card__status-line">
          {state !== 'AVAILABLE' && (
            <span className={`indicator-card__state indicator-card__state--${state.toLowerCase()}`}>
              {status}
            </span>
          )}
          {notApplied && (
            <span
              className="indicator-card__filter-mark"
              title="Há filtro solicitado que não se aplica a este indicador"
              aria-label="Há filtro solicitado não aplicado; consulte as informações do indicador"
            >
              ⓘ
            </span>
          )}
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
              {formatMetricValue(indicator.value, indicator.unit)}
            </strong>
          )}
          {scalar &&
            indicator.unit === 'PERCENT' &&
            indicator.value >= 0 &&
            indicator.value <= 100 && (
              <progress
                value={indicator.value}
                max="100"
                aria-label={`${title}: ${formatMetricValue(indicator.value, 'PERCENT')}`}
              />
            )}
          {hasChart && (
            <Suspense fallback={<p role="status">Carregando gráfico...</p>}>
              <IndicatorChart indicator={indicator} title={title} />
            </Suspense>
          )}
          {indicator.kind === 'LIST' && <IndicatorList indicator={indicator} />}
          {indicator.kind !== 'SERIES' && <IndicatorDistribution indicator={indicator} />}
          {!scalar &&
            !hasChart &&
            indicator.kind !== 'LIST' &&
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
      {indicator.metricId === 'I59' &&
        limitations.includes('DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS') && (
          <p className="indicator-card__notice">
            {describeLimitation('DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS')}
          </p>
        )}
      {state === 'STALE' && indicator.sourceUpdatedAt && (
        <footer className="indicator-card__footer">
          Fonte atualizada em {formatDateTime(indicator.sourceUpdatedAt)}
        </footer>
      )}
    </article>
  );
}
