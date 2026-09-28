import { useState } from 'react';
import { formatDate, formatMetricValue, labelForField } from '../dashboard-display.js';

const SERIES = {
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
  const [activeIndex, setActiveIndex] = useState(0);
  const points = indicator.points ?? [];
  const series =
    indicator.metricId === 'I47' && indicator.unit === 'HOURS'
      ? [{ key: 'completedPoints', label: 'Horas concluídas' }]
      : SERIES[indicator.metricId];
  if (!series || !points.length) return null;

  if (points.length === 1) {
    const point = points[0];
    return (
      <figure className="dashboard-chart dashboard-chart--snapshot">
        <figcaption className="dashboard-chart__snapshot-title">
          {indicator.metricId === 'I47'
            ? 'Última Sprint concluída'
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
  const max = Math.max(1, ...values);
  const x = (index) => LEFT + (index * (RIGHT - LEFT)) / (points.length - 1);
  const y = (value) => BOTTOM - (value / max) * (BOTTOM - TOP);
  const description = `${points.length} pontos. ${series.map((item) => item.label).join(', ')}. Consulte os dados em tabela abaixo.`;
  const selectedIndex = Math.min(activeIndex, points.length - 1);
  const selectedPoint = points[selectedIndex];

  function handlePointerMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * 640;
    const ratio = (svgX - LEFT) / (RIGHT - LEFT);
    setActiveIndex(
      Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))))
    );
  }

  function handleKeyDown(event) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setActiveIndex((current) =>
      event.key === 'ArrowRight'
        ? Math.min(points.length - 1, (current ?? -1) + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, (current ?? 1) - 1)
          : event.key === 'Home'
            ? 0
            : points.length - 1
    );
  }

  return (
    <figure
      className={`dashboard-chart${stacked ? ' dashboard-chart--cumulative' : ''}${!stacked && !bars ? ' dashboard-chart--line' : ''}`}
    >
      <p className="dashboard-chart__hint">
        Passe o cursor, toque ou use as setas para explorar os pontos.
      </p>
      <div className="dashboard-chart__scale" aria-hidden="true">
        <span>Escala: 0 a {formatMetricValue(max, indicator.unit)}</span>
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
      <details className="dashboard-chart__data">
        <summary>Ver dados</summary>
        <div className="dashboard-chart__table-wrap">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {indicator.metricId === 'I25' && (
        <p className="dashboard-chart__note">
          Área empilhada: {series.map((item) => labelForField(item.key)).join(', ')}.
        </p>
      )}
    </figure>
  );
}
