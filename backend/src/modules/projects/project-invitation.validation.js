import { z } from 'zod';
import { email, positiveInteger, strictObject } from '../../shared/validation/index.js';
export const invitationParams = strictObject({ projectId: positiveInteger(), invitationId: positiveInteger() });
export const invitationProjectParams = strictObject({ projectId: positiveInteger() });
export const createInvitationBody = strictObject({ email, role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER') });
export const acceptInvitationBody = strictObject({ token: z.string().min(32).max(128) });
