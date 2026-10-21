import { auditService, buildAuditEvent } from '../audit/index.js';
import { resourceNotFoundError } from '../../shared/errors/index.js';
import { logger } from '../../shared/logger/index.js';
import { renderReportPdfInWorker, reportPdfError } from './report-pdf.runner.js';
import { publicReport, publicReportDetail, publicReportSummary } from './report.presenter.js';
import { reportRepository } from './report.repository.js';
import {
  REPORT_LIMITS,
  REPORT_SNAPSHOT_VERSION,
  buildReportSnapshot,
  reportGenerationError
} from './report-snapshot.service.js';

// Reserva/heartbeat no mesmo modelo da sincronização manual do GitHub. A geração é
// curta; um RUNNING sem batimento além do lease perdeu o processo e vira FAILED.
export const REPORT_LEASE_MS = 5 * 60 * 1000;
export const REPORT_HEARTBEAT_MS = 30 * 1000;
export const REPORT_MAX_DURATION_MS = 4 * 60 * 1000;
// Prazo + carência fica abaixo do lease: a reserva não vence enquanto a consulta termina.
export const REPORT_CANCEL_GRACE_MS = 30 * 1000;

const STALE_FAILURE = Object.freeze({
  code: 'REPORT_GENERATION_STALE',
  message: 'A geração foi interrompida antes da conclusão. Gere o relatório novamente.'
});
const GENERIC_FAILURE = Object.freeze({
  code: 'REPORT_GENERATION_FAILED',
  message: 'Não foi possível gerar o relatório. Tente novamente.'
});
const DEPENDENCY_NOT_FOUND = Object.freeze({
  code: 'REPORT_FILTER_RESOURCE_NOT_FOUND',
  message: 'Um item do recorte (como a Sprint escolhida) não existe mais.'
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Tentativas curtas sem esperar dentro de transação; depois disso, 503 controlado.
const REQUEST_ATTEMPTS = 5;

// Só códigos criados por este módulo carregam mensagem própria; qualquer outra falha
// vira mensagem genérica, sem detalhe interno no registro do relatório.
function failureOf(error) {
  if (String(error?.code || '').startsWith('REPORT_') && error.exposeTechnicalDetails)
    return { code: error.code, message: String(error.message).slice(0, 191) };
  if (error?.statusCode === 404) return DEPENDENCY_NOT_FOUND;
  return GENERIC_FAILURE;
}

async function recordAudit(report, action, result = 'SUCCESS', reasonCode) {
  await auditService.recordOperational({
    actorUserId: report.requestedByUserId,
    projectId: report.projectId,
    action,
    resourceType: 'ProjectReport',
    resourceId: report.id,
    result,
    reasonCode
  });
}

async function findActiveReport(projectId, now, leaseMs) {
  const active = await reportRepository.findActive(projectId);
  if (!active) return null;
  const cutoff = new Date(now.getTime() - leaseMs);
  if ((active.heartbeatAt || active.updatedAt) >= cutoff) return active;
  if (await reportRepository.expireIfStillStale(active.id, projectId, cutoff, now, STALE_FAILURE)) {
    await recordAudit(active, 'REPORT_GENERATED', 'FAILURE', STALE_FAILURE.code);
    logger.warn('Geração de relatório interrompida foi encerrada.', {
      event: 'project_report_stale',
      projectId,
      reportId: active.id
    });
    return null;
  }
  return reportRepository.findActive(projectId);
}

const timeoutError = () =>
  reportGenerationError(
    'REPORT_TIMEOUT',
    'A geração excedeu o tempo máximo. Reduza o período ou selecione uma Sprint.'
  );
const leaseLostError = () =>
  reportGenerationError('REPORT_LEASE_LOST', 'A geração perdeu a reserva antes de concluir.');

// Depois do cancelamento nenhuma etapa nova começa, mas a consulta em andamento não pode
// ser interrompida: a reserva só é devolvida quando ela termina. Se ela não terminar
// dentro da carência, a geração é encerrada mesmo assim (no máximo uma consulta sobra).
function settleAfterAbort(work, signal, graceMs, reportId) {
  return new Promise((resolve, reject) => {
    let timer;
    const onAbort = () => {
      timer = setTimeout(() => {
        logger.warn('Consulta da geração de relatório não terminou após o cancelamento.', {
          event: 'project_report_cancel_overdue',
          reportId
        });
        reject(signal.reason);
      }, graceMs);
      timer.unref?.();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    });
  });
}

// Limite de gerações simultâneas por processo, como o das montagens de PDF: a composição
// usa o mesmo pool de banco e a mesma CPU da API. Quem espera continua QUEUED.
export function createGenerationSlots(max) {
  let running = 0;
  const waiting = [];
  return {
    async acquire() {
      if (running < max) running++;
      else await new Promise((resolve) => waiting.push(resolve));
    },
    release() {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}
export const REPORT_MAX_CONCURRENT = 2;
const generationSlots = createGenerationSlots(REPORT_MAX_CONCURRENT);

export async function executeProjectReport(reportId, options = {}) {
  const { slots = generationSlots } = options;
  await slots.acquire();
  try {
    return await executeClaimed(reportId, options);
  } finally {
    slots.release();
  }
}

async function executeClaimed(
  reportId,
  {
    now = () => new Date(),
    build = buildReportSnapshot,
    limits = REPORT_LIMITS,
    heartbeatMs = REPORT_HEARTBEAT_MS,
    maxDurationMs = REPORT_MAX_DURATION_MS,
    cancelGraceMs = REPORT_CANCEL_GRACE_MS,
    leaseMs = REPORT_LEASE_MS
  }
) {
  const report = await reportRepository.findForExecution(reportId);
  if (!report) return null;
  let claimed = null;
  for (let attempt = 0; attempt < 3 && claimed === null; attempt++) {
    claimed = await reportRepository.claim(report.id, report.projectId, now());
    if (claimed === null) await delay(100 * (attempt + 1));
  }
  // Ocupado demais ou já reivindicado: a reserva QUEUED expira pelo lease e a próxima
  // leitura encerra a geração como FAILED, sem duplicar execução.
  if (!claimed) return null;
  const startedAt = now();
  logger.info('Geração de relatório iniciada.', {
    event: 'project_report_started',
    projectId: report.projectId,
    reportId: report.id
  });

  const controller = new AbortController();
  const cancel = (error) => {
    if (!controller.signal.aborted) controller.abort(error);
  };
  const deadline = setTimeout(() => cancel(timeoutError()), maxDurationMs);
  deadline.unref?.();

  let heartbeatTimer;
  let heartbeatWork;
  let finished = false;
  function heartbeat() {
    heartbeatTimer = setTimeout(() => {
      heartbeatWork = reportRepository
        .heartbeat(report.id, report.projectId, now())
        .then((alive) => {
          // Outra leitura já encerrou esta geração (lease vencido): parar de consultar.
          if (!alive) cancel(leaseLostError());
        })
        .catch((error) => {
          logger.warn('Heartbeat do relatório indisponível.', {
            event: 'project_report_heartbeat_failed',
            reportId: report.id,
            errorCode: error.code || 'DATABASE_UNAVAILABLE'
          });
        })
        .finally(() => {
          if (!finished) heartbeat();
        });
    }, heartbeatMs);
    heartbeatTimer.unref?.();
  }
  heartbeat();

  try {
    const { snapshot, userIds, bytes } = await settleAfterAbort(
      build(
        {
          projectId: report.projectId,
          filters: {
            startDate: report.startDate ?? undefined,
            endDate: report.endDate ?? undefined,
            timeZone: report.timeZone ?? undefined,
            sprintId: report.sprintId ?? undefined
          },
          asOf: startedAt,
          requestId: `report-${report.id}`
        },
        { limits, signal: controller.signal }
      ),
      controller.signal,
      cancelGraceMs,
      report.id
    );
    // Composição que terminou depois do prazo não vira sucesso tardio.
    controller.signal.throwIfAborted();
    const finishedAt = now();
    const completed = await reportRepository.succeed(report.id, report.projectId, {
      snapshot,
      snapshotVersion: REPORT_SNAPSHOT_VERSION,
      userIds,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      leaseCutoff: new Date(finishedAt.getTime() - leaseMs)
    });
    if (!completed) {
      logger.warn('Geração de relatório perdeu a reserva antes de concluir.', {
        event: 'project_report_lease_lost',
        projectId: report.projectId,
        reportId: report.id
      });
      return null;
    }
    await recordAudit(completed, 'REPORT_GENERATED');
    logger.info('Geração de relatório concluída.', {
      event: 'project_report_completed',
      projectId: report.projectId,
      reportId: report.id,
      durationMs: completed.durationMs,
      bytes,
      people: userIds.length
    });
    return completed;
  } catch (thrown) {
    // Depois do cancelamento, o motivo é o cancelamento, não o erro da etapa interrompida.
    const error = controller.signal.aborted ? controller.signal.reason : thrown;
    const failure = failureOf(error);
    const finishedAt = now();
    const failed = await reportRepository
      .fail(report.id, report.projectId, {
        errorCode: failure.code,
        errorMessage: failure.message,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime()
      })
      .catch((persistError) => {
        logger.error('Não foi possível registrar a falha da geração de relatório.', {
          event: 'project_report_fail_persist_failed',
          reportId: report.id,
          errorCode: persistError.code || 'DATABASE_UNAVAILABLE'
        });
        return null;
      });
    if (failed) await recordAudit(failed, 'REPORT_GENERATED', 'FAILURE', failure.code);
    logger.warn('Geração de relatório falhou.', {
      event: 'project_report_failed',
      projectId: report.projectId,
      reportId: report.id,
      errorCode: failure.code,
      sourceErrorCode: error?.code || error?.name || 'UNKNOWN'
    });
    return failed;
  } finally {
    finished = true;
    clearTimeout(deadline);
    clearTimeout(heartbeatTimer);
    await heartbeatWork;
  }
}

function scheduleInProcess(reportId) {
  setImmediate(() => {
    void executeProjectReport(reportId).catch((error) => {
      logger.error('Falha inesperada ao executar a geração de relatório.', {
        event: 'project_report_worker_failed',
        reportId,
        errorCode: error.code || 'PROJECT_REPORT_WORKER_FAILED'
      });
    });
  });
}

async function readDetail(projectId, reportId, now, leaseMs) {
  const id = Number(projectId);
  await findActiveReport(id, now, leaseMs);
  const report = await reportRepository.findById(id, Number(reportId));
  if (!report) throw resourceNotFoundError('ProjectReport');
  return publicReportDetail(report);
}

// Nome de arquivo só com ASCII: o nome do projeto perde acentos e símbolos.
export function reportPdfFilename(report) {
  const slug =
    String(report.snapshot?.project?.name ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '') || 'projeto';
  return `traceflow-relatorio-${report.id}-${slug}.pdf`;
}

export const reportService = {
  async request(
    projectId,
    body,
    context,
    { schedule = scheduleInProcess, now = new Date(), leaseMs = REPORT_LEASE_MS } = {}
  ) {
    const id = Number(projectId);
    const filters = {
      startDate: body.startDate,
      endDate: body.endDate,
      timeZone: body.timeZone,
      sprintId: body.sprintId
    };
    if (
      filters.sprintId != null &&
      !(await reportRepository.findActiveSprint(id, filters.sprintId))
    )
      throw resourceNotFoundError('Sprint');
    const active = await findActiveReport(id, now, leaseMs);
    if (active) return { report: publicReport(active), alreadyRunning: true };

    const auditEvent = buildAuditEvent({
      actorUserId: context.actorUserId,
      projectId: id,
      requestId: context.requestId,
      action: 'REPORT_REQUESTED',
      resourceType: 'ProjectReport',
      metadata: {
        scope: filters.startDate ? 'PERIOD' : 'ALL',
        ...(filters.sprintId ? { sprintId: filters.sprintId } : {})
      }
    });
    let report;
    for (let attempt = 0; attempt < REQUEST_ATTEMPTS; attempt++) {
      try {
        report = await reportRepository.create({
          projectId: id,
          requestedByUserId: context.actorUserId,
          filters,
          auditEvent
        });
        break;
      } catch (error) {
        // Conflito na reserva ou projeto ocupado costumam ser outra solicitação do mesmo
        // projeto no meio do commit: se ela já existe, devolvê-la é a resposta correta.
        const retryable =
          reportRepository.isActiveConflict(error) || reportRepository.isBusy(error);
        if (!retryable) throw error;
        const raced = await reportRepository.findActive(id);
        if (raced) return { report: publicReport(raced), alreadyRunning: true };
        if (attempt === REQUEST_ATTEMPTS - 1) throw error;
        await delay(50 * (attempt + 1));
      }
    }
    schedule(report.id);
    return { report: publicReport(report), alreadyRunning: false };
  },

  async list(projectId, query = {}, { now = new Date(), leaseMs = REPORT_LEASE_MS } = {}) {
    const id = Number(projectId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    await findActiveReport(id, now, leaseMs);
    const filters = {
      status: query.status,
      sprintId: query.sprintId,
      requestedByUserId: query.requestedByUserId,
      startDate: query.startDate,
      endDate: query.endDate
    };
    const { total, reports } = await reportRepository.list(id, { page, limit, filters });
    return {
      items: reports.map(publicReport),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: publicReportSummary(await reportRepository.summary(id))
    };
  },

  read(projectId, reportId, { now = new Date(), leaseMs = REPORT_LEASE_MS } = {}) {
    return readDetail(projectId, reportId, now, leaseMs);
  },

  // S2-07: o PDF é montado na hora a partir do snapshot persistido (nenhum arquivo é
  // guardado). Só relatórios prontos são exportados e todo download fica auditado.
  async exportPdf(
    projectId,
    reportId,
    query,
    context,
    { render = renderReportPdfInWorker, now = new Date(), leaseMs = REPORT_LEASE_MS } = {}
  ) {
    const report = await readDetail(projectId, reportId, now, leaseMs);
    if (report.status !== 'SUCCEEDED')
      throw reportPdfError(
        'REPORT_NOT_READY',
        'Só relatórios prontos podem ser exportados em PDF.',
        409
      );
    const audit = {
      actorUserId: context.actorUserId,
      projectId: report.projectId,
      requestId: context.requestId,
      action: 'REPORT_PDF_EXPORTED',
      resourceType: 'ProjectReport',
      resourceId: report.id,
      metadata: { format: 'PDF' }
    };
    let buffer;
    try {
      buffer = await render(report, { timeZone: query.timeZone });
    } catch (error) {
      const busy = error?.code === 'REPORT_PDF_BUSY';
      const reasonCode = busy ? error.code : 'REPORT_PDF_FAILED';
      await auditService.recordOperational({ ...audit, result: 'FAILURE', reasonCode });
      logger.warn('Exportação de relatório em PDF falhou.', {
        event: 'project_report_pdf_failed',
        projectId: report.projectId,
        reportId: report.id,
        errorCode: reasonCode,
        sourceErrorCode: error?.code || error?.name || 'UNKNOWN'
      });
      if (busy) throw error;
      throw reportPdfError(
        'REPORT_PDF_FAILED',
        'Não foi possível gerar o PDF do relatório. Tente novamente.',
        500
      );
    }
    // Sem registro de auditoria, o arquivo não é entregue.
    await auditService.record(audit);
    return { buffer, filename: reportPdfFilename(report) };
  },

  execute: executeProjectReport
};
