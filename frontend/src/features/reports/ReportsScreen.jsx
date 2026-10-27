import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ProjectSectionNav, useProjectsCatalog } from '../projects/index.js';
import { membersApi } from '../members/index.js';
import { SprintDialog, scheduleApi } from '../schedule/index.js';
import {
  ContextualErrorPage,
  ErrorState,
  FeedbackRegion,
  LoadingState,
  PAGE_ERROR_TYPES,
  TraceFlowIcon,
  normalizeApiError
} from '../../shared/index.js';
import { ReportCard } from './components/ReportCard.jsx';
import { ReportDocument } from './components/ReportDocument.jsx';
import { ReportFilters } from './components/ReportFilters.jsx';
import { ReportsSummary } from './components/ReportsSummary.jsx';
import { ReportRequestForm } from './components/ReportRequestForm.jsx';
import { ReportStatusBadge } from './components/ReportStatusBadge.jsx';
import { REPORTS_MAX_LISTED, useProjectReports } from './hooks/useProjectReports.js';
import { useReport } from './hooks/useReport.js';
import { useReportPdfDownload } from './hooks/useReportPdfDownload.js';
import {
  REPORT_FILTERS_DEFAULT,
  countReportFilters,
  reportListParams
} from './model/report-filters.js';
import './ReportsScreen.css';

function useProjectContext(projectId) {
  const [context, setContext] = useState({ membership: null, members: [], sprints: [] });
  useEffect(() => {
    const controller = new AbortController();
    setContext({ membership: null, members: [], sprints: [] });
    Promise.allSettled([
      membersApi.list(projectId, { signal: controller.signal, fresh: true }),
      scheduleApi.listSprints(projectId, {}, { signal: controller.signal })
    ]).then(([members, sprints]) => {
      if (controller.signal.aborted) return;
      setContext({
        membership: members.status === 'fulfilled' ? members.value.currentMembership : null,
        members: members.status === 'fulfilled' ? (members.value.members ?? []) : [],
        sprints: sprints.status === 'fulfilled' ? (sprints.value.data.sprints ?? []) : []
      });
    });
    return () => controller.abort();
  }, [projectId]);
  return context;
}

function ProjectReports({ project }) {
  const [filters, setFilters] = useState(REPORT_FILTERS_DEFAULT);
  const filtered = countReportFilters(filters) > 0;
  const reports = useProjectReports(project.id, { params: reportListParams(filters) });
  const pdf = useReportPdfDownload(project.id, project.name);
  const { membership, members, sprints } = useProjectContext(project.id);
  const canWrite = Boolean(membership && membership.role !== 'VIEWER');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [feedback, setFeedback] = useState('');
  const returnFocusRef = useRef(null);
  const sprintNames = new Map(sprints.map((sprint) => [sprint.id, sprint.name]));

  async function submit(body) {
    setSubmitting(true);
    setRequestError(null);
    try {
      const result = await reports.create(body);
      setDialogOpen(false);
      setFeedback(
        `${
          result.alreadyRunning
            ? `Já existe uma geração em andamento (relatório #${result.report.id}). Acompanhe o andamento abaixo.`
            : `Relatório #${result.report.id} solicitado. A geração continua mesmo se você sair desta tela.`
        }${filtered ? ' Os filtros ativos podem ocultá-lo da lista.' : ''}`
      );
    } catch (error) {
      setRequestError(normalizeApiError(error, 'Não foi possível solicitar o relatório.'));
    } finally {
      setSubmitting(false);
    }
  }

  const { pagination } = reports;
  const listed = reports.items.length;
  return (
    <>
      <FeedbackRegion
        error={pdf.error?.status === 429 ? undefined : pdf.error?.message}
        rateLimit={pdf.error?.status === 429 ? pdf.error.message : undefined}
        retryAfterSeconds={pdf.error?.retryAfterSeconds ?? 0}
        success={feedback}
        transient
      />
      <ReportsSummary summary={reports.summary} loading={reports.loading && !reports.summary} />
      <ReportFilters
        filters={filters}
        sprints={sprints}
        members={members}
        total={pagination?.total}
        onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
        onClear={() => setFilters(REPORT_FILTERS_DEFAULT)}
      />
      {reports.loading && !listed && <LoadingState message="Carregando relatórios…" />}
      {reports.error && (
        <ErrorState message={reports.error.message} onRetry={() => reports.load()} />
      )}
      <section className="sprint-grid-section">
        <header className="sprint-grid-section__heading">
          <h2>Relatórios do projeto</h2>
        </header>
        <div className="reports-grid" role="list" aria-label="Relatórios do projeto">
          {canWrite && (
            <div role="listitem">
              <button
                ref={returnFocusRef}
                className="new-milestone-card"
                type="button"
                onClick={() => {
                  setRequestError(null);
                  setDialogOpen(true);
                }}
              >
                <span className="new-milestone-card__icon">
                  <TraceFlowIcon name="plus" />
                </span>
                <strong>Gerar relatório</strong>
                <small>Planejamento, rastreabilidade e indicadores do recorte escolhido.</small>
              </button>
            </div>
          )}
          {reports.items.map((report) => (
            <div role="listitem" key={report.id}>
              <ReportCard
                report={report}
                projectId={project.id}
                sprintName={sprintNames.get(report.filters.sprintId)}
                onDownloadPdf={pdf.download}
                downloading={pdf.downloadingId === report.id}
              />
            </div>
          ))}
        </div>
      </section>
      {!reports.loading && !reports.error && listed === 0 && filtered && (
        <section className="report-empty-panel">
          <p role="status">Nenhum relatório encontrado com esses filtros.</p>
          <p>Ajuste os filtros ou use Limpar filtros para ver todos os relatórios.</p>
        </section>
      )}
      {pagination && listed < pagination.total && listed < REPORTS_MAX_LISTED && (
        <button
          className="button button-secondary report-load-more"
          type="button"
          onClick={reports.loadMore}
        >
          Mostrar mais relatórios
        </button>
      )}
      {pagination && listed >= REPORTS_MAX_LISTED && pagination.total > listed && (
        <p className="field-help report-load-more">
          Mostrando os {REPORTS_MAX_LISTED} relatórios mais recentes de {pagination.total}.
        </p>
      )}
      <SprintDialog
        open={dialogOpen}
        title="Gerar relatório"
        description="Escolha o recorte. O relatório congela os números do momento da geração."
        initialFocusSelector="#report-startDate"
        returnFocusRef={returnFocusRef}
        busy={submitting}
        onClose={() => setDialogOpen(false)}
      >
        {requestError && <ErrorState message={requestError.message} />}
        <ReportRequestForm
          sprints={sprints}
          submitting={submitting}
          serverErrors={requestError?.fieldErrors ?? {}}
          onSubmit={submit}
          onCancel={() => setDialogOpen(false)}
        />
      </SprintDialog>
    </>
  );
}

function ProjectReport({ project, reportId }) {
  const { report, loading, error, polling, reload } = useReport(project.id, reportId);
  const pdf = useReportPdfDownload(project.id, project.name);
  const downloading = pdf.downloadingId === report?.id;
  return (
    <>
      <div className="report-detail__toolbar">
        <Link className="back-link" to={`/projects/${project.id}/reports`}>
          <TraceFlowIcon name="arrowLeft" /> Voltar para relatórios
        </Link>
        {report?.status === 'SUCCEEDED' && (
          <button
            className="button button-primary"
            type="button"
            disabled={downloading}
            aria-busy={downloading || undefined}
            onClick={() => pdf.download(report.id)}
          >
            {downloading ? 'Gerando PDF…' : 'Baixar PDF'}
          </button>
        )}
      </div>
      <FeedbackRegion
        error={pdf.error?.status === 429 ? undefined : pdf.error?.message}
        rateLimit={pdf.error?.status === 429 ? pdf.error.message : undefined}
        retryAfterSeconds={pdf.error?.retryAfterSeconds ?? 0}
      />
      {loading && !report && <LoadingState message="Carregando relatório…" />}
      {error && !report && <ContextualErrorPage embedded error={error} onRetry={() => reload()} />}
      {error && report && (
        <ErrorState
          message={
            polling
              ? `${error.message} Tentando atualizar novamente…`
              : `Não foi possível atualizar o relatório. ${error.message}`
          }
          retryAfterSeconds={error.retryAfterSeconds ?? 0}
          onRetry={() => reload()}
        />
      )}
      {report && report.status !== 'SUCCEEDED' && (
        <section className="report-empty-panel" aria-live="polite">
          <h2>
            Relatório #{report.id} <ReportStatusBadge status={report.status} />
          </h2>
          <p>
            {report.status === 'FAILED'
              ? (report.error?.message ?? 'O relatório não foi gerado.')
              : polling
                ? 'A geração está em andamento. Esta tela é atualizada automaticamente.'
                : 'A geração está em andamento, mas a atualização automática parou. Use "Tentar novamente" para ver o resultado.'}
          </p>
        </section>
      )}
      {report?.status === 'SUCCEEDED' && <ReportDocument report={report} />}
    </>
  );
}

export function ReportsScreen() {
  const { projectId, reportId } = useParams();
  const { projects, loading, error, refreshProjects } = useProjectsCatalog();
  const project = projects.find((item) => String(item.id) === projectId);
  return (
    <main className="page-container reports-screen">
      <header className="page-header reports-screen__header">
        <div>
          <span className="eyebrow">Relatórios</span>
          <h1>Relatórios</h1>
          <p>Retratos reproduzíveis do planejamento, da rastreabilidade e dos indicadores.</p>
        </div>
      </header>
      <ProjectSectionNav projectId={projectId} activeSection="reports" />
      {loading ? (
        <LoadingState message="Carregando contexto do projeto..." />
      ) : error ? (
        <ContextualErrorPage embedded error={error} onRetry={refreshProjects} />
      ) : !project ? (
        <ContextualErrorPage embedded type={PAGE_ERROR_TYPES.NOT_FOUND} showRetry={false} />
      ) : reportId ? (
        <ProjectReport key={`${projectId}:${reportId}`} project={project} reportId={reportId} />
      ) : (
        <ProjectReports key={projectId} project={project} />
      )}
    </main>
  );
}
