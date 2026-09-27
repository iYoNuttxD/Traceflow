import { DashboardHelp } from './DashboardHelp.jsx';
import { formatDateTime, METRIC_TITLES } from '../dashboard-display.js';
import {
  describeHealthReason,
  HEALTH_DIMENSION_LABELS,
  HEALTH_STATUS_LABELS
} from '../health-display.js';

function DriverList({ title, drivers, catalogById }) {
  if (!drivers?.length) return null;
  return (
    <div className="project-health__drivers">
      <h4>{title}</h4>
      <ul>
        {drivers.map((driver) => (
          <li key={driver.metricId}>
            <strong>
              {METRIC_TITLES[driver.metricId] ??
                catalogById.get(driver.metricId)?.title ??
                driver.metricId}
            </strong>
            <span>{describeHealthReason(driver, driver.metricId)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectHealth({ health, catalogById = new Map() }) {
  if (!health) return null;
  const status = HEALTH_STATUS_LABELS[health.status] ?? HEALTH_STATUS_LABELS.UNASSESSED;
  return (
    <section className="project-health" aria-labelledby="project-health-heading">
      <div className="project-health__heading">
        <div>
          <span className="dashboard-panel__eyebrow">Visão consolidada</span>
          <h3 id="project-health-heading">Saúde do projeto</h3>
        </div>
        <DashboardHelp title="Saúde do projeto">
          <p>
            A Saúde do Projeto combina sinais de planejamento, fluxo, Sprint, qualidade,
            rastreabilidade e integração técnica. É uma ferramenta de apoio à gestão e depende dos
            dados disponíveis no TraceFlow.
          </p>
          <p>
            Os sinais elegíveis recebem notas de 0 a 100 conforme regras documentadas. As dimensões
            têm pesos fixos; a cobertura informa quanto dos dados aplicáveis pôde ser avaliado. Sem
            cobertura de 60% e quatro dimensões avaliadas, não há nota geral.
          </p>
          <p>
            O índice descreve condições observadas do projeto. Não mede desempenho de pessoas nem
            garante resultado futuro. Modelo versão {health.healthModelVersion}.
          </p>
          <strong>Pesos e cobertura nesta leitura</strong>
          <ul>
            {health.dimensions.map((dimension) => (
              <li key={dimension.id}>
                {HEALTH_DIMENSION_LABELS[dimension.id] ?? dimension.id}: peso {dimension.weight}%
                {dimension.applicable ? `, cobertura ${dimension.coverage}%` : ', não aplicável'}.
              </li>
            ))}
          </ul>
          {health.window && (
            <p>
              Janela atual: {formatDateTime(health.window.current.startInclusive)} até{' '}
              {formatDateTime(health.window.current.endExclusive)}. Comparação:{' '}
              {formatDateTime(health.window.previous.startInclusive)} até{' '}
              {formatDateTime(health.window.previous.endExclusive)}.
            </p>
          )}
        </DashboardHelp>
      </div>
      <div className="project-health__summary">
        <p className="project-health__score">
          {health.score == null ? (
            '—'
          ) : (
            <>
              {Math.round(health.score)} <small>/ 100</small>
            </>
          )}
        </p>
        <span
          className={`project-health__status project-health__status--${health.status.toLowerCase()}`}
        >
          {status}
        </span>
      </div>
      {health.score == null ? (
        <p className="project-health__empty">
          Dados insuficientes para uma avaliação geral confiável.
        </p>
      ) : (
        <div
          className="project-health__track"
          role="meter"
          aria-label="Índice de saúde do projeto"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={health.score}
          aria-valuetext={`${Math.round(health.score)} de 100, ${status}`}
        >
          <span
            className={`project-health__fill project-health__fill--${health.status.toLowerCase()}`}
            style={{ width: `${health.score}%` }}
          />
        </div>
      )}
      <p className="project-health__coverage">
        Cobertura da avaliação: {Math.round(health.coverage)}%
        {health.applicableSignals != null && (
          <>
            {' '}
            · {health.assessedSignals} de {health.applicableSignals} sinais
          </>
        )}
        {' · '}
        {health.assessedDimensions} dimensões avaliadas
      </p>
      <div className="project-health__dimensions">
        {health.dimensions.map((dimension) => (
          <div key={dimension.id} className="project-health__dimension">
            <span>{HEALTH_DIMENSION_LABELS[dimension.id] ?? dimension.id}</span>
            <strong>{dimension.score == null ? '—' : Math.round(dimension.score)}</strong>
            <small>{HEALTH_STATUS_LABELS[dimension.status] ?? dimension.status}</small>
          </div>
        ))}
      </div>
      {health.score != null && (
        <div className="project-health__driver-grid">
          <DriverList
            title="Pontos de atenção"
            drivers={health.drivers?.negative}
            catalogById={catalogById}
          />
          <DriverList
            title="Pontos positivos"
            drivers={health.drivers?.positive}
            catalogById={catalogById}
          />
        </div>
      )}
    </section>
  );
}
