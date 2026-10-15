import { randomUUID } from 'node:crypto';
import { evidenceUploadRepository } from '../repositories/evidence-upload.repository.js';
import { testExecutionService } from './test-execution.service.js';
import { resumableEvidenceStorage } from '../storage/resumable-evidence.storage.js';
import {
  manifest,
  partContract,
  progress,
  uploadLimits,
  uploadError,
  busy,
  digest,
  UUID
} from '../uploads/upload-contract.js';
import { executionSchema, parse, assertVersion, missing } from '../test-case.schema.js';
import { logger } from '../../../shared/logger/index.js';

const clearLease = { leaseToken: null, leaseUntil: null };
function belongs(row, id, context) {
  if (!row || row.testCaseId !== id || row.userId !== context.actorUserId) throw missing();
}
async function authorized(repo, projectId, context, lockProject = true) {
  if (!Number.isInteger(context.actorUserId))
    throw uploadError('Autenticação necessária.', 401, 'AUTHENTICATION_REQUIRED');
  if (lockProject) await repo.lockProject(projectId);
  const { user, member, session } = await repo.actor(
    projectId,
    context.actorUserId,
    context.sessionId
  );
  const now = await repo.now();
  if (!member) throw missing();
  if (member.role === 'VIEWER')
    throw uploadError('Sem permissão para enviar evidências.', 403, 'FORBIDDEN');
  if (!user?.isActive || user.accountStatus !== 'ACTIVE')
    throw uploadError('Conta indisponível.', 403, 'ACCOUNT_DEACTIVATED');
  if (
    context.sessionId &&
    (!session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.sessionVersion !== user.sessionVersion)
  )
    throw uploadError('Sua sessão expirou.', 401, 'SESSION_EXPIRED');
}
function open(row, now) {
  if (row.status === 'CANCELLED' || row.status === 'EXPIRED' || row.expiresAt <= now)
    throw uploadError(
      'O upload expirou ou foi cancelado. Inicie um novo envio.',
      410,
      'UPLOAD_GONE'
    );
  if (row.status === 'COMPLETED')
    throw uploadError('Upload já confirmado.', 409, 'UPLOAD_ALREADY_COMPLETED');
  if (row.leaseUntil > now) throw busy();
}
function quota(rows, current, limits, now, { creating = false, transferring = false } = {}) {
  const pending = rows.filter((row) => !row.cleanedAt);
  const user = pending.filter((row) => row.userId === current.userId);
  const sum = (values) => values.reduce((n, value) => n + value.reservedBytes, 0);
  if (
    creating &&
    (user.length >= limits.ACTIVE_USER ||
      pending.length >= limits.ACTIVE_GLOBAL ||
      pending.filter((row) => row.projectId === current.projectId).length >=
        limits.ACTIVE_PROJECT ||
      sum(user) + current.reservedBytes > limits.TEMP_USER_BYTES ||
      sum(pending) + current.reservedBytes > limits.TEMP_GLOBAL_BYTES)
  )
    throw uploadError(
      'Limite de uploads temporários atingido. Cancele envios pendentes ou aguarde a limpeza.',
      429,
      'UPLOAD_QUOTA_EXCEEDED'
    );
  if (
    transferring &&
    (pending.filter((row) => row.leaseUntil > now).length >= limits.CONCURRENT_GLOBAL ||
      user.filter((row) => row.leaseUntil > now).length >= limits.CONCURRENT_USER)
  )
    throw busy();
  return sum(pending);
}
export function createEvidenceUploadService({
  repository = evidenceUploadRepository,
  storage = resumableEvidenceStorage,
  executions = testExecutionService,
  limits = uploadLimits(),
  log = logger
} = {}) {
  async function contextFor(repo, id, context) {
    const row = await repo.case(id);
    if (!row) throw missing();
    await authorized(repo, row.projectId, context);
    return row;
  }
  async function release(id, token) {
    await repository
      .transaction(async (repo) => {
        const row = await repo.lock(id);
        if (row?.leaseToken === token && row.status !== 'COMPLETED')
          await repo.update(id, {
            ...clearLease,
            status: row.status === 'FINALIZING' ? 'OPEN' : row.status
          });
      })
      .catch(() =>
        log.warn('Lease preservado para recuperação.', {
          event: 'upload_recovery_pending',
          uploadId: id
        })
      );
  }
  async function lease(id, uploadId, context, work) {
    if (!UUID.test(uploadId)) throw missing();
    return repository.transaction(async (repo) => {
      await repo.budget();
      await contextFor(repo, id, context);
      const row = await repo.lock(uploadId);
      const now = await repo.now();
      belongs(row, id, context);
      return work(repo, row, now);
    });
  }
  async function claim(repo, row, now, status) {
    open(row, now);
    quota(await repo.active(), row, limits, now, { transferring: true });
    if ((await storage.freeBytes()) < limits.MIN_FREE_BYTES + row.reservedBytes)
      throw uploadError('Espaço temporário insuficiente.', 507, 'UPLOAD_DISK_FULL');
    return repo.update(row.id, {
      status,
      leaseToken: randomUUID(),
      leaseUntil: new Date(now.getTime() + limits.leaseMs)
    });
  }
  const service = {
    async initiate(id, input, context) {
      const data = manifest(input, storage.storage.limits, limits.maxParts);
      return repository.transaction(async (repo) => {
        await repo.budget();
        const current = await contextFor(repo, id, context);
        const now = await repo.now();
        const previous = await repo.byKey(context.actorUserId, data.idempotencyKey);
        if (previous) {
          belongs(previous, id, context);
          if (previous.manifestHash !== data.manifestHash)
            throw uploadError('Chave já usada para arquivos diferentes.');
          if (previous.status !== 'COMPLETED') {
            if (previous.expiresAt <= now || ['CANCELLED', 'EXPIRED'].includes(previous.status))
              throw uploadError('Upload encerrado.', 410, 'UPLOAD_GONE');
          }
          return progress(previous);
        }
        assertVersion(current, data.testCaseVersion);
        if (current.status !== 'ATIVO')
          throw uploadError('Caso de teste inativo.', 409, 'TEST_CASE_INACTIVE');
        if (
          data.files.some(
            (file) =>
              file.position && !current.steps.some((step) => step.position === file.position)
          )
        )
          throw uploadError('Passo de evidência inválido.', 400, 'UPLOAD_CONTEXT_INVALID');
        const row = {
          id: randomUUID(),
          userId: context.actorUserId,
          projectId: current.projectId,
          testCaseId: id,
          testCaseVersion: data.testCaseVersion,
          idempotencyKey: data.idempotencyKey,
          manifestHash: data.manifestHash,
          filesJson: data.files,
          totalBytes: data.totalBytes,
          reservedBytes: data.totalBytes * 2 + 8 * 1024 * 1024,
          expiresAt: new Date(now.getTime() + limits.TTL_SECONDS * 1000)
        };
        const reserved = quota(await repo.active(), row, limits, now, { creating: true });
        if ((await storage.freeBytes()) < limits.MIN_FREE_BYTES + reserved + row.reservedBytes)
          throw uploadError('Espaço temporário insuficiente.', 507, 'UPLOAD_DISK_FULL');
        const created = await repo.create(row);
        log.info('Sessão de upload criada.', {
          event: 'upload_created',
          uploadId: row.id,
          fileCount: data.files.length,
          bytes: data.totalBytes
        });
        return progress(created);
      });
    },
    async list(id, context) {
      return repository.transaction(async (repo) => {
        await contextFor(repo, id, context);
        return { uploads: (await repo.list(id, context.actorUserId)).map(progress) };
      });
    },
    async status(id, uploadId, context) {
      return lease(id, uploadId, context, (_repo, row) => {
        log.info('Progresso consultado.', {
          event: 'upload_progress_read',
          uploadId,
          status: row.status
        });
        return progress(row);
      });
    },
    async part(id, uploadId, fileId, index, stream, headers, context) {
      const row = await lease(id, uploadId, context, async (repo, current, now) => {
        const spec = partContract(current, fileId, index, headers.sha256, headers.offset);
        if (spec.prior && spec.prior.sha256 !== headers.sha256)
          throw uploadError('Parte já recebida com outro conteúdo.', 409, 'UPLOAD_PART_CONFLICT');
        return claim(repo, current, now, 'OPEN');
      });
      const token = row.leaseToken;
      try {
        await storage.prune(row);
        const spec = partContract(row, fileId, index, headers.sha256, headers.offset);
        const received = await storage.receive(row, token, stream, {
          size: spec.size,
          checksum: headers.sha256,
          timeoutMs: limits.chunkMs
        });
        const saved = await lease(id, uploadId, context, async (repo, current, now) => {
          if (
            current.leaseToken !== token ||
            current.leaseUntil <= now ||
            current.status !== 'OPEN' ||
            current.expiresAt <= now
          )
            throw uploadError(
              'O envio perdeu sua reserva. Consulte o progresso.',
              409,
              'UPLOAD_LEASE_LOST'
            );
          const file = current.filesJson.find((item) => item.id === fileId);
          if (!file.parts[index]) file.parts[index] = received;
          return repo.update(uploadId, { filesJson: current.filesJson, ...clearLease });
        });
        if (spec.prior) await storage.discardPart(row, received);
        log.info('Parte de upload confirmada.', {
          event: 'upload_part_received',
          uploadId,
          part: index,
          bytes: received.sizeBytes
        });
        return progress(saved);
      } finally {
        await release(uploadId, token);
      }
    },
    async complete(id, uploadId, input, context) {
      const data = parse(executionSchema, input);
      const payloadHash = digest(JSON.stringify(data));
      const row = await lease(id, uploadId, context, async (repo, current, now) => {
        if (current.payloadHash && current.payloadHash !== payloadHash)
          throw uploadError(
            'A confirmação original tem outros dados.',
            409,
            'UPLOAD_PAYLOAD_CONFLICT'
          );
        if (current.status === 'COMPLETED') return current;
        open(current, now);
        if (data.testCaseVersion !== current.testCaseVersion)
          throw uploadError('Versão do caso incompatível.', 409, 'UPLOAD_CONTEXT_INVALID');
        for (const file of current.filesJson)
          for (let i = 0; i < Math.ceil(file.sizeBytes / (8 * 1024 * 1024)); i++)
            if (!file.parts[i])
              throw uploadError('Há partes ausentes.', 409, 'UPLOAD_PARTS_MISSING');
        const claimed = await claim(repo, current, now, 'FINALIZING');
        return repo.update(claimed.id, { payloadHash });
      });
      if (row.status === 'COMPLETED') return executions.detail(row.executionId, context);
      const token = row.leaseToken;
      try {
        await storage.prune(row);
        const attempt = await storage.assemble(row, token, Date.now() + limits.completeMs);
        const receipt = {
          validate(evidence) {
            if (
              evidence.length !== row.filesJson.length ||
              evidence.some((item) => {
                const file = row.filesJson.find((file) => file.storageKey === item.storageKey);
                return !file || file.sha256 !== item.sha256 || file.sizeBytes !== item.sizeBytes;
              })
            )
              throw uploadError(
                'Integridade do arquivo alterada.',
                422,
                'UPLOAD_FILE_CHECKSUM_MISMATCH'
              );
          },
          async assert(repo) {
            await authorized(repo, row.projectId, context, false);
            const current = await repo.lock(uploadId);
            const now = await repo.now();
            if (
              current?.status !== 'FINALIZING' ||
              current.leaseToken !== token ||
              current.leaseUntil <= now
            )
              throw uploadError('A confirmação perdeu sua reserva.', 409, 'UPLOAD_LEASE_LOST');
          },
          promote: () => storage.promote(attempt, row),
          commit: (repo, executionId) =>
            repo.update(uploadId, { status: 'COMPLETED', executionId, ...clearLease })
        };
        const result = await executions.record(id, data, attempt, context, receipt);
        log.info('Upload confirmado na execução.', {
          event: 'upload_completed',
          uploadId,
          executionId: result.id,
          bytes: row.totalBytes
        });
        await service
          .cleanupOne(uploadId)
          .catch(() =>
            log.warn('Limpeza pendente.', { event: 'upload_cleanup_pending', uploadId })
          );
        return result;
      } finally {
        await release(uploadId, token);
      }
    },
    async cancel(id, uploadId, context) {
      const result = await lease(id, uploadId, context, async (repo, row) => {
        if (row.status === 'COMPLETED')
          throw uploadError(
            'Execução já confirmada. Evidências preservadas.',
            409,
            'UPLOAD_ALREADY_COMPLETED'
          );
        // Preserve the deadline: cleanup waits until any writer whose token was fenced has stopped.
        return repo.update(uploadId, { status: 'CANCELLED', leaseToken: null });
      });
      log.info('Upload cancelado.', { event: 'upload_cancelled', uploadId });
      await service.cleanupOne(uploadId);
      return progress(result);
    },
    async cleanupOne(uploadId, { dryRun = false } = {}) {
      return repository.transaction(async (repo) => {
        await repo.budget();
        const row = await repo.lock(uploadId);
        const now = await repo.now();
        if (!row || row.leaseUntil > now) return 'BUSY';
        if (!['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(row.status) && row.expiresAt > now)
          return 'ACTIVE';
        if (dryRun) return 'ELIGIBLE';
        if (!row.cleanedAt) {
          const protectedKeys = (
            await repo.evidence(row.filesJson.map((file) => file.storageKey))
          ).map((file) => file.storageKey);
          await storage.prune(row, { all: true, protectedKeys });
          await repo.update(uploadId, {
            cleanedAt: now,
            ...clearLease,
            ...(row.status === 'OPEN' || row.status === 'FINALIZING' ? { status: 'EXPIRED' } : {})
          });
        }
        if (now.getTime() - row.expiresAt.getTime() > limits.retentionMs)
          await repo.remove(uploadId);
        log.info('Temporários de upload limpos.', {
          event:
            row.status === 'OPEN' || row.status === 'FINALIZING'
              ? 'upload_expired'
              : 'upload_cleaned',
          uploadId,
          bytes: row.totalBytes
        });
        return 'CLEANED';
      });
    },
    async cleanup({ dryRun = true, limit = 50 } = {}) {
      const now = await repository.now();
      const rows = await repository.candidates(
        now,
        Math.min(50, limit),
        new Date(now.getTime() - limits.retentionMs)
      );
      const result = { inspected: rows.length, cleaned: 0, eligible: 0, failed: 0, busy: 0 };
      for (const row of rows) {
        try {
          const status = await service.cleanupOne(row.id, { dryRun });
          if (status === 'CLEANED') result.cleaned++;
          else if (status === 'ELIGIBLE') result.eligible++;
          else result.busy++;
        } catch {
          result.failed++;
          log.warn('Limpeza recusada ou indisponível.', {
            event: 'upload_cleanup_failed',
            uploadId: row.id
          });
        }
      }
      return result;
    }
  };
  return service;
}
export const evidenceUploadService = createEvidenceUploadService();
