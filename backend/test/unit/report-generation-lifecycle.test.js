import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/reports/report.repository.js', () => ({
  reportRepository: {
    findForExecution: vi.fn(),
    claim: vi.fn(),
    heartbeat: vi.fn(),
    fail: vi.fn(),
    succeed: vi.fn(),
    findActive: vi.fn(),
    create: vi.fn()
  }
}));
vi.mock('../../src/modules/audit/index.js', () => ({
  auditService: { recordOperational: vi.fn() },
  buildAuditEvent: vi.fn(() => ({}))
}));
vi.mock('../../src/shared/logger/index.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../../src/modules/reports/report-snapshot.service.js', () => ({
  REPORT_LIMITS: {},
  REPORT_SNAPSHOT_VERSION: 1,
  buildReportSnapshot: vi.fn(),
  reportGenerationError: (code, message) =>
    Object.assign(new Error(message), { code, exposeTechnicalDetails: true })
}));

import { reportRepository } from '../../src/modules/reports/report.repository.js';
import { logger } from '../../src/shared/logger/index.js';
import {
  createGenerationSlots,
  executeProjectReport,
  reportService
} from '../../src/modules/reports/report.service.js';

beforeEach(() => {
  vi.useFakeTimers();
  reportRepository.findForExecution.mockImplementation(async (id) => ({ id, projectId: id }));
  reportRepository.claim.mockResolvedValue(true);
  reportRepository.heartbeat.mockResolvedValue(true);
  reportRepository.fail.mockImplementation(async (id, projectId, data) => ({
    id,
    projectId,
    status: 'FAILED',
    ...data
  }));
  reportRepository.succeed.mockImplementation(async (id, projectId) => ({
    id,
    projectId,
    status: 'SUCCEEDED'
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('admissão de relatórios durante cancelamento', () => {
  it('mantém as duas vagas após a carência e recupera cada vaga só após conclusão real', async () => {
    const slots = createGenerationSlots(2);
    const releases = [];
    let active = 0;
    let peak = 0;
    const build = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => releases.push(resolve));
      active--;
      return { snapshot: { schemaVersion: 1 }, userIds: [], bytes: 20 };
    });
    const options = { build, slots, maxDurationMs: 100, cancelGraceMs: 50, heartbeatMs: 20 };
    const executions = [1, 2, 3].map((id) => executeProjectReport(id, options));
    await vi.advanceTimersByTimeAsync(500);
    expect(build).toHaveBeenCalledTimes(2);
    expect(active).toBe(2);
    expect(reportRepository.fail).not.toHaveBeenCalled();
    expect(reportRepository.heartbeat).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      event: 'project_report_cancel_overdue',
      reportId: 1
    });
    // Mais retentativas não criam operações órfãs nem ultrapassam o limite.
    executions.push(executeProjectReport(4, options));
    await vi.advanceTimersByTimeAsync(500);
    expect(build).toHaveBeenCalledTimes(2);
    releases[0]();
    await vi.advanceTimersByTimeAsync(0);
    expect(build).toHaveBeenCalledTimes(3);
    expect(reportRepository.succeed).not.toHaveBeenCalled();
    releases[1]();
    await vi.advanceTimersByTimeAsync(0);
    expect(build).toHaveBeenCalledTimes(4);
    releases[2]();
    releases[3]();
    const results = await Promise.all(executions);
    expect(results.map((result) => result.status)).toEqual([
      'FAILED',
      'FAILED',
      'SUCCEEDED',
      'SUCCEEDED'
    ]);
    expect(results.slice(0, 2).map((result) => result.errorCode)).toEqual([
      'REPORT_TIMEOUT',
      'REPORT_TIMEOUT'
    ]);
    expect(peak).toBe(2);
    expect(active).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['resolve', 'reject'])(
    'responde ao pedido e mantém a reserva até o término tardio (%s)',
    async (settlement) => {
      let release;
      let execution;
      const report = { id: 1, projectId: 1, status: 'QUEUED' };
      reportRepository.findActive.mockResolvedValue(null);
      reportRepository.create.mockResolvedValue(report);
      const build = () =>
        new Promise((resolve, reject) => (release = settlement === 'resolve' ? resolve : reject));
      const schedule = (id) => {
        execution = executeProjectReport(id, {
          build,
          maxDurationMs: 100,
          cancelGraceMs: 50,
          heartbeatMs: 20
        });
      };
      const result = await reportService.request(1, {}, { actorUserId: 1 }, { schedule });
      expect(result).toMatchObject({ alreadyRunning: false, report: { id: 1 } });
      await vi.advanceTimersByTimeAsync(500);
      expect(reportRepository.fail).not.toHaveBeenCalled();
      reportRepository.findActive.mockImplementation(async () => ({
        ...report,
        status: 'RUNNING',
        heartbeatAt: new Date()
      }));
      for (let attempt = 0; attempt < 3; attempt++) {
        expect(await reportService.request(1, {}, { actorUserId: 1 }, { schedule })).toMatchObject({
          alreadyRunning: true,
          report: { id: 1 }
        });
      }
      expect(reportRepository.create).toHaveBeenCalledTimes(1);
      release(
        settlement === 'resolve'
          ? { snapshot: {}, userIds: [], bytes: 0 }
          : new Error('Consulta terminou com erro depois do prazo')
      );
      expect(await execution).toMatchObject({ status: 'FAILED', errorCode: 'REPORT_TIMEOUT' });
      expect(reportRepository.succeed).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );
});
