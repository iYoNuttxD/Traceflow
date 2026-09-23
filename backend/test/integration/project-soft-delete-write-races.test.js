import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let deletionService;
let accessCodes;
let invitations;
let projects;

function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

async function fixture() {
  const owner = await prisma.user.create({
    data: {
      name: 'Owner artificial',
      username: 'softwriteowner',
      email: 'softwriteowner@example.invalid'
    }
  });
  const project = await prisma.project.create({
    data: {
      name: 'Projeto ativo',
      responsibleTeam: 'Equipe artificial',
      accessCode: 'TRC-SOFT-WRITE-BEFORE',
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
  return { owner, project };
}

async function continueAfterDeletion({ project, owner, read, write }) {
  const readFinished = deferred();
  const resume = deferred();
  const request = (async () => {
    await read();
    readFinished.resolve();
    await resume.promise;
    return write();
  })();
  await readFinished.promise;
  await deletionService.requestDeletion(project.id, owner.id);
  resume.resolve();
  return request;
}

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ projectDeletionService: deletionService } =
    await import('../../src/modules/projects/services/project-deletion.service.js'));
  ({ projectAccessCodeRepository: accessCodes } =
    await import('../../src/modules/projects/project-access-code.repository.js'));
  ({ projectInvitationRepository: invitations } =
    await import('../../src/modules/projects/project-invitation.repository.js'));
  ({ projectRepository: projects } =
    await import('../../src/modules/projects/project.repository.js'));
  await cleanTestDatabase(prisma);
});

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('writes de projeto versus soft delete confirmado (MySQL real)', () => {
  it('não regenera access code depois do delete, mesmo com leitura ativa anterior', async () => {
    const { project, owner } = await fixture();
    await expect(
      continueAfterDeletion({
        project,
        owner,
        read: () => accessCodes.findConfiguration(project.id),
        write: () => accessCodes.regenerate(project.id, 'TRC-SOFT-WRITE-AFTER')
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toMatchObject({
      accessCode: 'TRC-SOFT-WRITE-BEFORE',
      deletedAt: expect.any(Date)
    });
  });

  it('não altera accessCodeRole depois do delete', async () => {
    const { project, owner } = await fixture();
    await expect(
      continueAfterDeletion({
        project,
        owner,
        read: () => accessCodes.findConfiguration(project.id),
        write: () => accessCodes.updateRole(project.id, 'VIEWER')
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toMatchObject({
      accessCodeRole: 'MEMBER',
      deletedAt: expect.any(Date)
    });
  });

  it('não cria convite pendente depois do delete', async () => {
    const { project, owner } = await fixture();
    const result = await continueAfterDeletion({
      project,
      owner,
      read: () => invitations.findProjectById(project.id),
      write: () =>
        invitations.createUnlessPending({
          projectId: project.id,
          createdById: owner.id,
          email: 'invitee@example.invalid',
          role: 'MEMBER',
          tokenHash: 'artificial-token-hash',
          expiresAt: new Date(Date.now() + 86_400_000)
        })
    });
    expect(result).toEqual({ projectUnavailable: true });
    expect(await prisma.projectInvitation.count({ where: { projectId: project.id } })).toBe(0);
  });

  it('não atualiza campos editáveis depois do delete', async () => {
    const { project, owner } = await fixture();
    await expect(
      continueAfterDeletion({
        project,
        owner,
        read: () => projects.findById(project.id),
        write: () =>
          projects.updateProject(project.id, {
            name: 'Nome tardio',
            description: 'Descrição tardia',
            status: 'INATIVO'
          })
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toMatchObject({
      name: 'Projeto ativo',
      description: null,
      status: 'ATIVO',
      deletedAt: expect.any(Date)
    });
  });

  it('mantém os writes normais enquanto o projeto está ativo', async () => {
    const { project, owner } = await fixture();
    await accessCodes.regenerate(project.id, 'TRC-ACTIVE-NEW');
    await accessCodes.updateRole(project.id, 'VIEWER');
    await projects.updateProject(project.id, { name: 'Projeto editado', status: 'INATIVO' });
    const result = await invitations.createUnlessPending({
      projectId: project.id,
      createdById: owner.id,
      email: 'active-invitee@example.invalid',
      role: 'MEMBER',
      tokenHash: 'active-artificial-token',
      expiresAt: new Date(Date.now() + 86_400_000)
    });
    expect(result.invitation).toMatchObject({ projectId: project.id, revokedAt: null });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toMatchObject({
      accessCode: 'TRC-ACTIVE-NEW',
      accessCodeRole: 'VIEWER',
      name: 'Projeto editado',
      status: 'INATIVO',
      deletedAt: null
    });
  });

  it('join por código não cria membership após soft delete', async () => {
    const { project, owner } = await fixture();
    const joiner = await prisma.user.create({
      data: {
        name: 'Joiner artificial',
        username: 'softwritejoiner',
        email: 'softwritejoiner@example.invalid'
      }
    });
    expect(await accessCodes.findByCode(project.accessCode)).toMatchObject({ id: project.id });
    await deletionService.requestDeletion(project.id, owner.id);
    expect(await accessCodes.join(project.accessCode, joiner.id)).toEqual({ invalidCode: true });
    expect(
      await prisma.projectMembership.count({ where: { projectId: project.id, userId: joiner.id } })
    ).toBe(0);
  });
});
