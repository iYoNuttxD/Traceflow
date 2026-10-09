import { validateTestDatabaseUrl } from './database-safety.js';

export async function cleanupIndicatorBenchmark(
  prisma,
  { project, user, run, databaseUrl, nodeEnv = process.env.NODE_ENV }
) {
  if (nodeEnv !== 'test') throw new Error('Benchmark cleanup requires NODE_ENV=test.');
  const target = new URL(validateTestDatabaseUrl(databaseUrl));
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(run || '')) {
    throw new Error('Benchmark cleanup requires its invocation identifier.');
  }
  for (const entity of [project, user]) {
    if (entity != null && (!Number.isSafeInteger(entity.id) || entity.id <= 0)) {
      throw new Error('Benchmark cleanup refused an invalid fixture ID.');
    }
  }
  if (project && !user) throw new Error('Benchmark cleanup requires the fixture owner.');
  if (!project && !user) return;

  await prisma.$transaction(async (tx) => {
    const [connection] = await tx.$queryRaw`SELECT DATABASE() AS databaseName`;
    const expectedSchema = decodeURIComponent(target.pathname.slice(1)).toLowerCase();
    if (String(connection?.databaseName || '').toLowerCase() !== expectedSchema) {
      throw new Error('Benchmark cleanup refused the actual database connection.');
    }
    // Verify all ownership before the first delete. An undefined scope must never reach Prisma.
    const ownedUser = await tx.user.findFirst({
      where: { id: user.id, username: `perf_${run}`, email: `perf-${run}@example.invalid` },
      select: { id: true }
    });
    if (!ownedUser) throw new Error('Benchmark cleanup refused a user from another invocation.');
    if (project) {
      const ownedProject = await tx.project.findFirst({
        where: {
          id: project.id,
          accessCode: run,
          memberships: { some: { userId: user.id, role: 'OWNER' } }
        },
        select: { id: true }
      });
      if (!ownedProject) {
        throw new Error('Benchmark cleanup refused a project from another invocation.');
      }
      const where = { projectId: project.id };
      for (const delegate of [
        'taskMovement',
        'task',
        'requirement',
        'pullRequestLifecycleEvent',
        'pullRequest',
        'commit',
        'issue',
        'projectGitHubIntegration',
        'projectMembership'
      ]) {
        await tx[delegate].deleteMany({ where });
      }
      await tx.project.delete({ where: { id: project.id } });
    }
    await tx.user.delete({ where: { id: user.id } });
  });
}
