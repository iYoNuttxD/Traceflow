import { Prisma } from '@prisma/client';
import { ExternalServiceError } from '../../../shared/errors/index.js';

// P2028 also covers API misuse: only acquisition/expiration failures are isolable.
export function isTransientDataSourceError(error) {
  if (error instanceof ExternalServiceError) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (['P2024', 'P2034'].includes(error.code)) return true;
  return (
    error.code === 'P2028' &&
    /unable to start a transaction in the given time|expired transaction|transaction.*timed out/i.test(
      String(error.meta?.error ?? error.message)
    )
  );
}
