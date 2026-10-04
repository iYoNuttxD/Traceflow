import { useState } from 'react';
import { formatDate, formatMetricValue, labelForField } from '../dashboard-display.js';

const SERIES = {
  I20: [{ key: 'value', label: 'Mediana diária de Lead Time' }],
  I21: [{ key: 'value', label: 'Mediana diária de Cycle Time' }],
  I22: [{ key: 'value', label: 'Tasks concluídas' }],
  I25: [
    { key: 'todo', label: 'A fazer' },
    { key: 'inProgress', label: 'Em andamento' },
    { key: 'done', label: 'Concluído' }
  ],
  I45: [
    { key: 'remaining', label: 'Trabalho restante' },
    { key: 'ideal', label: 'Linha ideal' }
  ],
  I46: [
    { key: 'scope', label: 'Escopo total' },
    { key: 'completed', label: 'Trabalho concluído' }
  ],
  I47: [{ key: 'completedPoints', label: 'Pontos concluídos' }]
};

const COLORS = [
  'var(--color-accent-primary)',
  'var(--color-warning-text)',
  'var(--color-success-text)'
];
const LEFT = 22;
const RIGHT = 620;
const TOP = 20;
const BOTTOM = 186;

const valid = (value) => typeof value === 'number' && Number.isFinite(value);

function lineSegments(points, key, x, y) {
  const segments = [];
  let segment = [];
  for (const [index, point] of points.entries()) {
    if (valid(point[key])) segment.push(`${x(index)},${y(point[key])}`);
    else if (segment.length) {
      segments.push(segment);
      segment = [];
    }
  }
  if (segment.length) segments.push(segment);
  return segments;
}

function stackedAreas(points, series, x, y) {
  return series.flatMap((item, layer) => {
    const segments = [];
    let segment = [];
    for (const [index, point] of points.entries()) {
      if (series.slice(0, layer + 1).every((row) => valid(point[row.key])))
        segment.push({ index, point });
      else if (segment.length) {
        segments.push(segment);
        segment = [];
      }
    }
    if (segment.length) segments.push(segment);
    return segments
      .filter((run) => run.length > 1)
      .map((run, segmentIndex) => {
        const lower = run.map(({ index, point }) => ({
          x: x(index),
          y: y(series.slice(0, layer).reduce((sum, row) => sum + point[row.key], 0))
        }));
        const upper = run.map(({ index, point }) => ({
          x: x(index),
          y: y(series.slice(0, layer + 1).reduce((sum, row) => sum + point[row.key], 0))
        }));
        return {
          key: `${item.key}-${segmentIndex}`,
          layer,
          points: [...upper, ...lower.reverse()].map(({ x: px, y: py }) => `${px},${py}`).join(' ')
        };
      });
  });
}

export function IndicatorChart({ indicator, title }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const points = indicator.points ?? [];
  const series =
    indicator.metricId === 'I47' && indicator.unit === 'HOURS'
      ? [{ key: 'completedPoints', label: 'Horas concluídas' }]
      : SERIES[indicator.metricId];
  if (!series || !points.length) return null;

  const duration = ['I20', 'I21'].includes(indicator.metricId);
  const usefulPoints = points.filter((point) => series.some((item) => valid(point[item.key])));
  if (!usefulPoints.length)
    return (
      <>
        <strong className="indicator-card__value">—</strong>
        <p className="indicator-card__empty">Sem amostras no período.</p>
      </>
    );
  if ((duration ? usefulPoints.length : points.length) === 1) {
    const point = usefulPoints[0];
    return (
      <figure className="dashboard-chart dashboard-chart--snapshot">
        <figcaption className="dashboard-chart__snapshot-title">
          {indicator.metricId === 'I47'
            ? 'Última Sprint concluída'
            : duration
              ? `Amostra em ${formatDate(point.date)}`
              : `Histórico iniciado em ${formatDate(point.date)}`}
        </figcaption>
        {point.sprintName && <p className="dashboard-chart__sprint-name">{point.sprintName}</p>}
        <dl className="dashboard-chart__snapshot-values">
          {series.map((item) => (
            <div key={item.key}>
              <dt>{item.label}</dt>
              <dd>{formatMetricValue(point[item.key], indicator.unit)}</dd>
            </div>
          ))}
        </dl>
        {duration && (
          <p className="dashboard-chart__note">
            {point.eligibleCount} {point.eligibleCount === 1 ? 'Task' : 'Tasks'} na amostra.
          </p>
        )}
        {indicator.metricId !== 'I47' && (
          <p className="dashboard-chart__note">
            Ainda não há dias suficientes para formar uma tendência.
          </p>
        )}
      </figure>
    );
  }

  const stacked = indicator.metricId === 'I25';
  const bars = indicator.metricId === 'I47';
  const values = stacked
    ? points
        .filter((point) => series.every((item) => valid(point[item.key])))
        .map((point) => series.reduce((sum, item) => sum + point[item.key], 0))
    : points.flatMap((point) => series.map((item) => point[item.key]).filter(valid));
  const candidate = indicator.assessment?.reference;
  const reference =
    ['I20', 'I21'].includes(indicator.metricId) &&
    candidate?.type === 'PROJECT_BASELINE' &&
    candidate.unit === indicator.unit &&
    valid(candidate.value) &&
    candidate.value >= 0
      ? candidate
      : null;
  const max = Math.max(1, ...values, reference?.value ?? 0);
  const x = (index) => LEFT + (index * (RIGHT - LEFT)) / (points.length - 1);
  const y = (value) => BOTTOM - (value / max) * (BOTTOM - TOP);
  const description = `${duration ? `${usefulPoints.length} dias com amostra` : `${points.length} pontos`}. ${series.map((item) => item.label).join(', ')}. Consulte os dados em tabela abaixo.`;
  const selectable = points.flatMap((point, index) =>
    !duration || valid(point.value) ? [index] : []
  );
  const selectedIndex = selectable.includes(activeIndex) ? activeIndex : selectable[0];
  const selectedPoint = points[selectedIndex];

  function handlePointerMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * 640;
    const ratio = (svgX - LEFT) / (RIGHT - LEFT);
    const index = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    // An empty calendar bucket is a gap, never an interactive observation.
    if (selectable.includes(index)) setActiveIndex(index);
  }

  function handleKeyDown(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = selectable.indexOf(selectedIndex);
    setActiveIndex(
      event.key === 'ArrowRight'
        ? selectable[Math.min(selectable.length - 1, current + 1)]
        : event.key === 'ArrowLeft'
          ? selectable[Math.max(0, current - 1)]
          : event.key === 'Home'
            ? selectable[0]
            : selectable.at(-1)
    );
  }

  return (
    <figure
      className={`dashboard-chart${stacked ? ' dashboard-chart--cumulative' : ''}${!stacked && !bars ? ' dashboard-chart--line' : ''}`}
    >
      <p className="sr-only">Passe o cursor, toque ou use as setas para explorar os pontos.</p>
      <div className="dashboard-chart__scale">
        <span className="sr-only">Escala: 0 a </span>
        <span>{formatMetricValue(max, indicator.unit)}</span>
      </div>
      <svg
        viewBox="0 0 640 206"
        preserveAspectRatio="none"
        role="img"
        tabIndex="0"
        aria-label={`${title}: ${description} Use as setas para explorar os pontos.`}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerMove}
        onKeyDown={handleKeyDown}
      >
        <line x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} className="dashboard-chart__axis" />
        <line x1={LEFT} x2={RIGHT} y1={TOP} y2={TOP} className="dashboard-chart__guide" />
        <line
          x1={x(selectedIndex)}
          x2={x(selectedIndex)}
          y1={TOP}
          y2={BOTTOM}
          className="dashboard-chart__crosshair"
        />
        {reference && (
          <line
            x1={LEFT}
            x2={RIGHT}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke="var(--color-text-secondary)"
            strokeWidth="2"
            strokeDasharray="7 5"
            vectorEffect="non-scaling-stroke"
            data-reference-line="true"
          />
        )}
        {stacked
          ? stackedAreas(points, series, x, y).map((area) => (
              <polygon
                key={area.key}
                points={area.points}
                fill={COLORS[area.layer]}
                fillOpacity={0.22 + area.layer * 0.1}
                stroke={COLORS[area.layer]}
                strokeWidth="1.5"
              />
            ))
          : bars
            ? points.map((point, index) =>
                valid(point.completedPoints) ? (
                  <rect
                    key={point.sprintId ?? index}
                    x={x(index) - Math.min(18, (RIGHT - LEFT) / (points.length * 3))}
                    y={y(point.completedPoints)}
                    width={Math.min(36, (RIGHT - LEFT) / (points.length * 1.5))}
                    height={BOTTOM - y(point.completedPoints)}
                    rx="3"
                    fill={COLORS[0]}
                  />
                ) : null
              )
            : series.flatMap((item, index) =>
                lineSegments(points, item.key, x, y).map((segment, segmentIndex) =>
                  segment.length === 1 ? (
                    <circle
                      key={`${item.key}-${segmentIndex}`}
                      cx={Number(segment[0].split(',')[0])}
                      cy={Number(segment[0].split(',')[1])}
                      r="4"
                      fill={COLORS[index]}
                    />
                  ) : (
                    <polyline
                      key={`${item.key}-${segmentIndex}`}
                      points={segment.join(' ')}
                      fill="none"
                      stroke={COLORS[index]}
                      strokeWidth="3"
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={index === 1 ? '7 5' : undefined}
                    />
                  )
                )
              )}
        {series.map(
          (item, index) =>
            valid(selectedPoint[item.key]) &&
            (!stacked ||
              series.slice(0, index + 1).every((row) => valid(selectedPoint[row.key]))) &&
            !bars && (
              <circle
                key={`selected-${item.key}`}
                cx={x(selectedIndex)}
                cy={y(
                  stacked
                    ? series
                        .slice(0, index + 1)
                        .reduce((sum, row) => sum + selectedPoint[row.key], 0)
                    : selectedPoint[item.key]
                )}
                r="6"
                fill={COLORS[index]}
                className="dashboard-chart__selected-marker"
              />
            )
        )}
      </svg>
      <div className="dashboard-chart__range" aria-hidden="true">
        <span>{points[0].sprintName ?? formatDate(points[0].date)}</span>
        <span>{points.at(-1).sprintName ?? formatDate(points.at(-1).date)}</span>
      </div>
      {selectedPoint && (
        <div className="dashboard-chart__tooltip" role="status">
          <strong>{selectedPoint.sprintName ?? formatDate(selectedPoint.date)}</strong>
          {duration && (
            <span>
              Amostra: {selectedPoint.eligibleCount ?? 0}{' '}
              {selectedPoint.eligibleCount === 1 ? 'Task' : 'Tasks'}
            </span>
          )}
          {series.map((item) => (
            <span key={item.key}>
              {item.label}: {formatMetricValue(selectedPoint[item.key], indicator.unit)}
            </span>
          ))}
        </div>
      )}
      <figcaption className="dashboard-chart__legend">
        {series.map((item, index) => (
          <span key={item.key}>
            <i style={{ '--series-color': COLORS[index] }} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </figcaption>
      {reference && (
        <p className="dashboard-chart__note">
          {reference.label}: {formatMetricValue(reference.value, reference.unit)}. Linha tracejada.
        </p>
      )}
      {['I20', 'I21'].includes(indicator.metricId) && (
        <p className="sr-only">
          Mediana das primeiras conclusões de cada dia. Dias sem amostra permanecem em branco.
        </p>
      )}
      <details className="dashboard-chart__data">
        <summary>Ver dados</summary>
        <div
          className="dashboard-chart__table-wrap"
          role="region"
          aria-label={`Dados de ${title}`}
          tabIndex={0}
        >
          <table>
            <caption>{title}: dados do gráfico</caption>
            <thead>
              <tr>
                <th scope="col">{bars ? 'Sprint' : 'Data'}</th>
                {series.map((item) => (
                  <th scope="col" key={item.key}>
                    {item.label}
                  </th>
                ))}
                {['I20', 'I21'].includes(indicator.metricId) && <th scope="col">Amostra</th>}
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={point.date ?? point.sprintId ?? index}>
                  <th scope="row">
                    {point.sprintName ??
                      (point.date ? formatDate(point.date) : `Ponto ${index + 1}`)}
                  </th>
                  {series.map((item) => (
                    <td key={item.key}>
                      {valid(point[item.key])
                        ? formatMetricValue(point[item.key], indicator.unit)
                        : '—'}
                    </td>
                  ))}
                  {['I20', 'I21'].includes(indicator.metricId) && (
                    <td>{point.eligibleCount ?? '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {indicator.metricId === 'I25' && (
        <p className="sr-only">
          Área empilhada: {series.map((item) => labelForField(item.key)).join(', ')}.
        </p>
      )}
    </figure>
  );
}
