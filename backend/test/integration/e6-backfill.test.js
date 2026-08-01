import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { runMembershipBackfill } from '../../scripts/lib/membership-backfill.js';

let prisma;
beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('backfill E6', () => {
  it('trata base vazia, casos ambíguos, projeto sem owner e execução idempotente', async () => {
    expect((await runMembershipBackfill({ client: prisma })).examined).toBe(0);
    const [owned, manual, ambiguous, partial] = await Promise.all([
      prisma.project.create({ data: { name: 'Projeto owner', responsibleTeam: 'Equipe' } }),
      prisma.project.create({ data: { name: 'Projeto manual', responsibleTeam: 'Equipe' } }),
      prisma.project.create({ data: { name: 'Projeto ambíguo', responsibleTeam: 'Equipe' } }),
      prisma.project.create({ data: { name: 'Projeto parcial', responsibleTeam: 'Equipe' } })
    ]);
    const canonicalOwner = await prisma.user.create({
      data: {
        name: 'Owner canônico',
        username: 'owner-canonico',
        email: 'canonical@example.invalid',
        passwordHash: null
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: partial.id, userId: canonicalOwner.id, role: 'OWNER' }
    });
    await prisma.projectMember.createMany({
      data: [
        {
          projectId: owned.id,
          name: 'Owner artificial',
          email: 'owner@example.invalid',
          role: 'DONO'
        },
        { projectId: owned.id, name: 'Sem e-mail', email: null, role: 'MEMBRO' },
        {
          projectId: manual.id,
          name: 'Member artificial',
          email: 'member@example.invalid',
          role: 'MEMBRO'
        },
        {
          projectId: manual.id,
          name: 'Identidade A',
          email: 'shared@example.invalid',
          role: 'MEMBRO'
        },
        {
          projectId: ambiguous.id,
          name: 'Identidade B',
          email: 'shared@example.invalid',
          role: 'MEMBRO'
        },
        {
          projectId: ambiguous.id,
          name: 'Papel inválido',
          email: 'role@example.invalid',
          role: 'UNKNOWN'
        },
        {
          projectId: partial.id,
          name: 'Membro parcial',
          email: 'partial@example.invalid',
          role: 'MEMRO'
        }
      ]
    });
    const dryRun = await runMembershipBackfill({ client: prisma });
    expect(dryRun).toMatchObject({
      mode: 'dry-run',
      skippedMissingOrInvalidEmail: 1,
      skippedAmbiguousIdentity: 2,
      skippedUnknownRole: 2
    });
    expect(dryRun.projectsWithoutEligibleOwner).toEqual(
      expect.arrayContaining([manual.id, ambiguous.id])
    );
    expect(dryRun.projectsWithoutEligibleOwner).not.toContain(partial.id);
    expect(await prisma.projectMembership.count()).toBe(1);
    const applied = await runMembershipBackfill({ client: prisma, apply: true });
    expect(applied.migrated).toBe(2);
    expect(await prisma.projectMember.count()).toBe(7);
    const repeated = await runMembershipBackfill({ client: prisma, apply: true });
    expect(repeated).toMatchObject({ migrated: 0, alreadyMigrated: 2 });
    expect(
      await prisma.user.findUnique({ where: { email: 'owner@example.invalid' } })
    ).toMatchObject({ passwordHash: null, mustSetPassword: true });
  });
});
