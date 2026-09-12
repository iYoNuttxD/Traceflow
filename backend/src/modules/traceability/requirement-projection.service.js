import { DomainError } from '../../shared/errors/index.js';
import { cursorPage, cursorWhere } from '../testCases/test-case.cursor.js';
import { requirementProjectionRepository as repo } from './requirement-projection.repository.js';

export const requirementProjectionService = {
  async list(projectId, query = {}) {
    const q = { ...query, page: query.page ?? 1, limit: query.limit ?? 20 };
    return { projectId, ...(await repo.readPage(projectId, q)) };
  },
  async current(projectId, requirementId) {
    const [row] = await repo.read(projectId, [requirementId]);
    if (!row) throw new DomainError('Requisito não encontrado neste projeto.', 404);
    return row;
  },
  async history(projectId, requirementId, q) {
    if (!(await repo.exists(projectId, requirementId)))
      throw new DomainError('Requisito não encontrado neste projeto.', 404);
    const owner = `requirement-traceability:${projectId}:${requirementId}`;
    return cursorPage(
      await repo.history(
        projectId,
        requirementId,
        cursorWhere(q.cursor, 'occurredAt', owner),
        q.limit
      ),
      q.limit,
      'occurredAt',
      owner
    );
  }
};
