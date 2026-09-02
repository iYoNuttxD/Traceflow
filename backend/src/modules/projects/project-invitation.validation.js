import { z } from 'zod';
import {
  email,
  positiveInteger,
  publicCapabilityToken,
  strictObject
} from '../../shared/validation/index.js';
export const invitationParams = strictObject({
  projectId: positiveInteger(),
  invitationId: positiveInteger()
});

export const personalInvitationParams = strictObject({
  invitationId: positiveInteger('ID do convite inválido.')
});
export const invitationProjectParams = strictObject({ projectId: positiveInteger() });
export const createInvitationBody = strictObject({
  email,
  role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER')
});
export const acceptInvitationBody = strictObject({
  token: publicCapabilityToken({ message: 'Convite inválido.', max: 128 })
});
