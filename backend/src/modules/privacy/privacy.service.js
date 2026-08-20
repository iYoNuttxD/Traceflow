import { randomUUID } from 'node:crypto';
import { buildAuditEvent } from '../audit/audit.service.js';
import { privacyRepository } from './privacy.repository.js';

// O módulo de privacidade retém apenas o worker de anonimização. Os casos de uso HTTP
// canônicos de conta, sessões, exportação e exclusão pertencem ao módulo Settings.
export const privacyService = {
  async processDueDeletions({ now = new Date(), dryRun = true } = {}) {
    const due = await privacyRepository.dueDeletionRequests(now);
    if (dryRun) return { mode: 'dry-run', count: due.length };
    let processed = 0;
    for (const request of due) {
      if ((await privacyRepository.lastOwnedProjects(request.userId)).length) continue;
      const suffix = randomUUID();
      try {
        const result = await privacyRepository.anonymize(
          request.id,
          {
            name: 'Usuário excluído',
            username: `anonymous_${suffix.replaceAll('-', '').slice(0, 24)}`,
            email: `anonymous_${suffix}@deleted.traceflow.invalid`
          },
          buildAuditEvent({
            actorUserId: request.userId,
            actorType: 'SYSTEM',
            action: 'ACCOUNT_ANONYMIZATION_STARTED',
            resourceType: 'User',
            resourceId: request.userId
          }),
          buildAuditEvent({
            actorUserId: request.userId,
            actorType: 'SYSTEM',
            action: 'ACCOUNT_ANONYMIZED',
            resourceType: 'User',
            resourceId: request.userId
          }),
          now
        );
        if (result && !result.blocked) processed += 1;
      } catch (error) {
        await privacyRepository.markDeletionFailure(
          request.id,
          typeof error?.code === 'string' ? error.code : 'ANONYMIZATION_FAILED',
          now
        );
      }
    }
    return { mode: 'apply', count: due.length, processed };
  }
};
