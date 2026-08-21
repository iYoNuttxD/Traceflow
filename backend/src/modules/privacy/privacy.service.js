import { randomUUID } from 'node:crypto';
import { buildAuditEvent } from '../audit/audit.service.js';
import { fingerprintGithubUserId } from '../../shared/security/pseudonymization.js';
import { privacyRepository } from './privacy.repository.js';

function safeFailureCode(error) {
  const code = typeof error?.code === 'string' ? error.code : error?.message;
  return typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'ANONYMIZATION_FAILED';
}

// O módulo de privacidade retém apenas o worker de anonimização. Os casos de uso HTTP
// canônicos de conta, sessões, exportação e exclusão pertencem ao módulo Settings.
export const privacyService = {
  async processDueDeletions({ now = new Date(), dryRun = true } = {}) {
    const due = await privacyRepository.dueDeletionRequests(now);
    if (dryRun) return { mode: 'dry-run', count: due.length };
    let processed = 0;
    let blocked = 0;
    let failed = 0;
    for (const request of due) {
      const suffix = randomUUID();
      const auditBase = {
        actorUserId: request.userId,
        actorType: 'SYSTEM',
        resourceType: 'User',
        resourceId: request.userId
      };
      try {
        const result = await privacyRepository.anonymize(
          request.id,
          {
            name: 'Usuário excluído',
            username: `anonymous_${suffix.replaceAll('-', '').slice(0, 24)}`,
            email: `anonymous_${suffix}@deleted.traceflow.invalid`,
            githubUserFingerprint: request.user.githubIdentity
              ? fingerprintGithubUserId(request.user.githubIdentity.githubUserId)
              : null
          },
          {
            startedAuditData: buildAuditEvent({
              ...auditBase,
              action: 'ACCOUNT_ANONYMIZATION_STARTED'
            }),
            blockedAuditData: buildAuditEvent({
              ...auditBase,
              action: 'ACCOUNT_ANONYMIZATION_BLOCKED',
              result: 'FAILURE',
              reasonCode: 'SOLE_PROJECT_OWNER'
            }),
            returnedActiveAuditData: buildAuditEvent({
              ...auditBase,
              action: 'ACCOUNT_RETURNED_ACTIVE',
              reasonCode: 'SOLE_PROJECT_OWNER'
            }),
            completedAuditData: buildAuditEvent({
              ...auditBase,
              action: 'ACCOUNT_ANONYMIZED'
            })
          },
          now
        );
        if (result?.blocked) blocked += 1;
        else if (result) processed += 1;
      } catch (error) {
        failed += 1;
        const failureCode = safeFailureCode(error);
        await privacyRepository.markDeletionFailure(
          request.id,
          failureCode,
          buildAuditEvent({
            ...auditBase,
            action: 'ACCOUNT_ANONYMIZATION_FAILED',
            result: 'FAILURE',
            reasonCode: failureCode
          }),
          now
        );
      }
    }
    return { mode: 'apply', count: due.length, processed, blocked, failed };
  }
};
