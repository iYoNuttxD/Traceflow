import { z } from 'zod';
import { positiveInteger, strictObject } from '../../shared/validation/index.js';

export const membershipProjectParams = strictObject({ projectId: positiveInteger('ID do projeto inválido.') });
export const membershipParams = strictObject({ projectId: positiveInteger('ID do projeto inválido.'), membershipId: positiveInteger('ID do membro inválido.') });
export const membershipRoleBody = strictObject({ role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']) });
export const ownershipTransferBody = strictObject({ membershipId: positiveInteger('ID do membro inválido.') });
