import { useEffect, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import { indicatorsApi } from '../api/indicators.api.js';
import { HEALTH_STATUS_LABELS } from '../health-display.js';
import './ProjectHealthSummary.css';

export function ProjectHealthSummary({ projectId, refreshVersion = 0 }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(null);
  const identity = `${projectId}|${refreshVersion}|${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    indicatorsApi.dashboard(projectId, { view: 'GENERAL' }, { signal: controller.signal }).then(
      ({ data }) => {
        if (!controller.signal.aborted) setState({ identity, health: data.projectHealth });
      },
      () => {
        if (!controller.signal.aborted) setState({ identity, error: true });
      }
    );
    return () => controller.abort();
  }, [projectId, identity]);
  const current = state?.identity === identity ? state : null;
  const health = current?.health;
  return (
    <section
      className="project-health-summary"
      aria-labelledby="overview-health-title"
      aria-busy={!current}
    >
      <header>
        <h2 id="overview-health-title">
          <TraceFlowIcon name="heart" />
          Saúde do projeto
        </h2>
        {health && (
          <span
            className={`project-health-summary__status project-health-summary__status--${health.status.toLowerCase()}`}
          >
            {HEALTH_STATUS_LABELS[health.status] ?? 'Dados insuficientes'}
          </span>
        )}
      </header>
      {!current ? (
        <p role="status">Carregando saúde do projeto...</p>
      ) : current.error ? (
        <div role="alert">
          <p>Não foi possível carregar a saúde do projeto.</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : health ? (
        <>
          <p className="project-health-summary__score">
            {health.score == null ? (
              '—'
            ) : (
              <>
                {Math.round(health.score)} <small>/ 100</small>
              </>
            )}
          </p>
          {health.score != null && (
            <progress
              className={`project-health-summary__progress--${health.status.toLowerCase()}`}
              max="100"
              value={health.score}
              aria-label="Índice de saúde do projeto"
            />
          )}
          {health.score == null && <p>Dados insuficientes para uma avaliação geral confiável.</p>}
        </>
      ) : (
        <p>A avaliação ainda não está disponível.</p>
      )}
    </section>
  );
}
