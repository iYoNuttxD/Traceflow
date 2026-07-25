import { describe, expect, it } from 'vitest';
import {
  canonicalProjectPatch,
  checksumIds,
  mapLegacyRole,
  mapProjectMemberToMembership,
  normalizeArtifactType,
  reconcileArtifactRecords,
  resolveUniqueUserByName
} from '../../scripts/lib/e8-reconciliation.js';
import { assertMaintenanceDatabase } from '../../scripts/lib/database-safety.js';

describe('E8 reconciliação canônica', () => {
  it('normaliza tipos e reconcilia artefatos sem expor conteúdo', () => {
    expect(normalizeArtifactType('pull-request')).toBe('PULL_REQUEST');
    expect(normalizeArtifactType('desconhecido')).toBe('UNKNOWN');
    expect(reconcileArtifactRecords({
      artifacts: [
        { id: 1, projectId: 1, type: 'COMMIT', sha: 'abc' },
        { id: 2, projectId: 1, type: 'PR', externalId: '22' },
        { id: 3, projectId: 1, type: 'ISSUE', externalId: 'sem-correspondencia' }
      ],
      commits: [{ hash: 'abc' }],
      pullRequests: [{ number: 22 }],
      issues: []
    })).toEqual({ examined: 3, matchedCommit: 1, matchedPullRequest: 1, matchedIssue: 0, unmatched: 1, duplicates: 0, unknownType: 0 });
  });

  it('produz checksum determinístico de IDs técnicos', () => {
    expect(checksumIds([3, 1, 3, 2])).toBe(checksumIds([1, 2, 3]));
    expect(checksumIds([1, 2])).not.toBe(checksumIds([1, 3]));
  });

  it('mapeia papel legado conhecido e preserva desconhecido para decisão manual', () => {
    expect(mapLegacyRole('dono')).toBe('OWNER');
    expect(mapLegacyRole('membro')).toBe('MEMBER');
    expect(mapLegacyRole('papel-historico')).toBeNull();
  });

  it('resolve responsável textual somente quando há identidade única e ativa', () => {
    const memberships = [
      { userId: 7, isActive: true, user: { name: 'Pessoa Artificial' } },
      { userId: 8, isActive: false, user: { name: 'Pessoa Artificial' } }
    ];
    expect(resolveUniqueUserByName(' pessoa artificial ', memberships)).toEqual({ status: 'MATCHED', userId: 7 });
    expect(resolveUniqueUserByName('Sem cadastro', memberships).status).toBe('UNMATCHED');
    expect(resolveUniqueUserByName('Pessoa', [
      { userId: 1, isActive: true, user: { name: 'Pessoa' } },
      { userId: 2, isActive: true, user: { name: 'Pessoa' } }
    ]).status).toBe('AMBIGUOUS');
  });

  it('mapeia ProjectMember por e-mail sem devolver o valor pessoal', () => {
    const memberships = [{ userId: 4, user: { email: 'pessoa@example.invalid' } }];
    expect(mapProjectMemberToMembership({ email: 'PESSOA@example.invalid' }, memberships)).toEqual({ status: 'MATCHED', userId: 4 });
    expect(mapProjectMemberToMembership({ email: null }, memberships).status).toBe('MISSING_OR_INVALID_EMAIL');
  });

  it('expande campos canônicos de projeto sem apagar aliases', () => {
    expect(canonicalProjectPatch({ githubOwner: 'owner', githubRepo: 'repo', githubUrl: 'https://github.com/owner/repo' })).toEqual({
      githubRepositoryName: 'repo',
      githubRepositoryFullName: 'owner/repo',
      githubRepositoryUrl: 'https://github.com/owner/repo'
    });
  });

  it('protege apply em desenvolvimento e produção, liberando banco de teste', () => {
    expect(assertMaintenanceDatabase({ databaseUrl: 'mysql://u:p@localhost/traceflow_test', developmentDatabaseUrl: 'mysql://u:p@localhost/traceflow', apply: true })).toContain('traceflow_test');
    expect(() => assertMaintenanceDatabase({ databaseUrl: 'mysql://u:p@localhost/traceflow', apply: true })).toThrow(/confirm-development/);
    expect(() => assertMaintenanceDatabase({ databaseUrl: 'mysql://u:p@localhost/traceflow_production', apply: true })).toThrow(/confirm-production/);
  });
});
