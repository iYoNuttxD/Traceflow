import { Link } from 'react-router';
import { TraceFlowIcon } from '../../../shared/index.js';
import { formatDateTime } from '../../indicators/index.js';
import { formatReportPeriod, personLabel } from '../model/report-display.js';
import { ReportStatusBadge } from './ReportStatusBadge.jsx';

export function ReportCard({ report, projectId, sprintName, onDownloadPdf, downloading = false }) {
  const ready = report.status === 'SUCCEEDED';
  return (
    <article className="sprint-card report-card" aria-label={`Relatório #${report.id}`}>
      <header className="sprint-card__header report-card__header">
        <small>Relatório #{report.id}</small>
        <ReportStatusBadge status={report.status} />
      </header>
      <div className="sprint-card__body report-card__body">
        <h3>{formatReportPeriod(report.filters)}</h3>
        <dl className="report-card__details">
          <div>
            <dt>
              <TraceFlowIcon name="refresh" /> Sprint
            </dt>
            <dd>
              {report.filters.sprintId
                ? (sprintName ?? `Sprint #${report.filters.sprintId}`)
                : 'Todas'}
            </dd>
          </div>
          <div>
            <dt>
              <TraceFlowIcon name="users" /> Solicitado por
            </dt>
            <dd>{personLabel(report.requestedBy)}</dd>
          </div>
          <div>
            <dt>
              <TraceFlowIcon name="calendar" /> {ready ? 'Gerado em' : 'Solicitado em'}
            </dt>
            <dd>{formatDateTime(ready ? report.finishedAt : report.createdAt)}</dd>
          </div>
        </dl>
        {report.status === 'FAILED' && report.error && (
          <p className="report-card__error" role="note">
            {report.error.message}
          </p>
        )}
        {['QUEUED', 'RUNNING'].includes(report.status) && (
          <p className="report-card__progress">
            Reunindo planejamento, rastreabilidade e indicadores do recorte…
          </p>
        )}
      </div>
      {ready && (
        <footer className="report-card__actions">
          <Link
            className="button button-primary link-button"
            to={`/projects/${projectId}/reports/${report.id}`}
          >
            Abrir relatório
          </Link>
          {onDownloadPdf && (
            <button
              className="button button-secondary"
              type="button"
              disabled={downloading}
              aria-busy={downloading || undefined}
              aria-label={`Baixar PDF do relatório #${report.id}`}
              onClick={() => onDownloadPdf(report.id)}
            >
              {downloading ? 'Gerando PDF…' : 'Baixar PDF'}
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
