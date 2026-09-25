import { lazy, Suspense } from 'react';
import {
  describeLimitation,
  formatDateTime,
  formatFieldValue,
  formatMetricValue,
  labelForField,
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
                ? `${formatMetricValue(item.defectCount)} Defects`
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
  const source = indicator.distribution ?? indicator.value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const rows = Object.entries(source).filter(([key, value]) => key !== 'total' && value != null);
  const magnitude = Math.max(
    1,
    ...rows.map(([, value]) => (typeof value === 'number' ? Math.abs(value) : 0))
  );
  return (
    <div className="indicator-card__distribution">
      {rows.map(([key, value]) => (
        <div className="indicator-card__distribution-row" key={key}>
          <span>{labelForField(key)}</span>
          <strong>{formatFieldValue(value, key, indicator.unit)}</strong>
          {typeof value === 'number' && value >= 0 && (
            <span className="indicator-card__bar" aria-hidden="true">
              <span
                style={{ width: `${Math.max(0, Math.min(100, (value / magnitude) * 100))}%` }}
              />
            </span>
          )}
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

export function IndicatorCard({ indicator, metadata, requestedFilters }) {
  const title = METRIC_TITLES[indicator.metricId] ?? metadata.title;
  const limitations = indicator.limitations ?? [];
  const hasValue = indicator.state !== 'NO_DATA' && indicator.state !== 'UNAVAILABLE';
  const scalar = hasValue && typeof indicator.value === 'number';
  const hasChart = hasValue && indicator.kind === 'SERIES' && indicator.points?.length > 0;
  const notApplied = Object.entries({
    period: Boolean(requestedFilters.period),
    sprint: requestedFilters.sprintId != null,
    responsible: requestedFilters.responsibleUserId != null
  }).some(([key, requested]) => requested && !indicator.appliedFilters?.[key]);
  const status = STATE_LABELS[indicator.state] ?? indicator.state;

  return (
    <article
      className={`indicator-card indicator-card--${indicator.state.toLowerCase()}${indicator.kind === 'SERIES' ? ' indicator-card--series' : ''}`}
      aria-label={title}
    >
      <header className="indicator-card__header">
        <div>
          <span className="indicator-card__id">{indicator.metricId}</span>
          <h4>{title}</h4>
        </div>
        <details className="indicator-card__help">
          <summary aria-label={`Informações sobre ${title}`} title="Fórmula, fonte e filtros">
            ?
          </summary>
          <div className="indicator-card__help-content">
            <p>{metadata.description}</p>
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
            {limitations.length > 0 && (
              <>
                <strong>Limitações</strong>
                <ul>
                  {limitations.map((code) => (
                    <li key={code}>{describeLimitation(code)}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </details>
      </header>

      <div className="indicator-card__status-line">
        <span
          className={`indicator-card__state indicator-card__state--${indicator.state.toLowerCase()}`}
        >
          {status}
        </span>
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

      {indicator.state === 'NO_DATA' && (
        <p className="indicator-card__empty">Nenhum dado elegível para este indicador.</p>
      )}
      {indicator.state === 'UNAVAILABLE' && (
        <p className="indicator-card__empty">
          {limitations.length
            ? describeLimitation(limitations[0])
            : 'Não há dados suficientes para apresentar este indicador.'}
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

      {['PARTIAL', 'STALE'].includes(indicator.state) && (
        <p className="indicator-card__notice">
          {indicator.state === 'STALE'
            ? 'Último valor conhecido; confira a atualização da fonte.'
            : 'O valor considera somente os dados conhecidos.'}{' '}
          {limitations[0] ? describeLimitation(limitations[0]) : ''}
        </p>
      )}
      {indicator.metricId === 'I59' &&
        limitations.includes('DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS') && (
          <p className="indicator-card__notice">
            {describeLimitation('DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS')}
          </p>
        )}
      <footer className="indicator-card__footer">
        <span>
          {metadata.temporalType === 'HISTORICAL_SERIES'
            ? 'Série histórica'
            : indicator.period
              ? 'No período selecionado'
              : metadata.temporalType === 'FROZEN'
                ? 'Sprint no corte'
                : 'Estado atual'}
        </span>
        <span>
          {indicator.sourceUpdatedAt
            ? `Fonte: ${formatDateTime(indicator.sourceUpdatedAt)}`
            : `Atualizado: ${formatDateTime(indicator.asOf)}`}
        </span>
      </footer>
    </article>
  );
}
