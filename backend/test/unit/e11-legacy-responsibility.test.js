import { describe, expect, it } from 'vitest';
import {
  buildE11Audit,
  buildTaskMappingFile,
  resolveMovementEvidence,
  validateTaskMappings
} from '../../scripts/lib/e11-legacy-responsibility.js';

const task = {
  id: 10,
  projectId: 1,
  responsible: 'Nome legado',
  responsibleUserId: null,
  responsibleUser: null
};
const membership = {
  projectId: 1,
  userId: 7,
  role: 'MEMBER',
  isActive: true,
  user: { name: 'Pessoa', email: 'pessoa@example.invalid' }
};
const movement = {
  id: 20,
  projectId: 1,
  movedBy: 'Snapshot legado',
  projectMemberId: 30,
  movedByUserId: null,
  projectMember: { projectId: 1, email: 'Pessoa@Example.invalid' }
};

describe('E11 reconciliação de identidades legadas', () => {
  it('gera mapa local com PII somente no artefato protegido e preserva seleção manual', () => {
    const mapping = buildTaskMappingFile({
      tasks: [task],
      memberships: [membership],
      previousMappings: [{ taskId: 10, selectedUserId: 7 }]
    });
    expect(mapping.mappings[0]).toMatchObject({
      taskId: 10,
      projectId: 1,
      legacyResponsible: 'Nome legado',
      selectedUserId: 7
    });
    expect(mapping.mappings[0].candidateMemberships[0]).toMatchObject({
      userId: 7,
      name: 'Pessoa'
    });
  });

  it('exige mapeamento manual completo e membership ativa no mesmo projeto', () => {
    expect(
      validateTaskMappings({ tasks: [task], mappings: [], memberships: [membership] })
        .blockedTaskIds
    ).toEqual([10]);
    expect(
      validateTaskMappings({
        tasks: [task],
        mappings: [{ taskId: 10, projectId: 1, selectedUserId: 7 }],
        memberships: [membership]
      })
    ).toEqual({ plan: [{ taskId: 10, projectId: 1, userId: 7 }], blockedTaskIds: [] });
    expect(
      validateTaskMappings({
        tasks: [task],
        mappings: [{ taskId: 10, projectId: 2, selectedUserId: 7 }],
        memberships: [membership]
      }).blockedTaskIds
    ).toEqual([10]);
    expect(
      validateTaskMappings({
        tasks: [task],
        mappings: [{ taskId: 10, projectId: 1, selectedUserId: 7 }],
        memberships: [{ ...membership, isActive: false }]
      }).blockedTaskIds
    ).toEqual([10]);
  });

  it('não sobrescreve responsável canônico divergente', () => {
    const canonical = { ...task, responsibleUserId: 8 };
    expect(
      validateTaskMappings({
        tasks: [canonical],
        mappings: [{ taskId: 10, projectId: 1, selectedUserId: 7 }],
        memberships: [membership]
      }).blockedTaskIds
    ).toEqual([10]);
  });

  it('reconcilia movimento somente pela cadeia member email user membership', () => {
    expect(
      resolveMovementEvidence({
        movement,
        users: [{ id: 7, email: 'pessoa@example.invalid' }],
        memberships: [membership]
      })
    ).toEqual({ status: 'RECONCILABLE', userId: 7 });

    for (const input of [
      { users: [], memberships: [membership] },
      {
        users: [
          { id: 7, email: 'pessoa@example.invalid' },
          { id: 8, email: 'PESSOA@example.invalid' }
        ],
        memberships: [membership]
      },
      {
        users: [{ id: 7, email: 'pessoa@example.invalid' }],
        memberships: [{ ...membership, isActive: false }]
      },
      {
        users: [{ id: 7, email: 'pessoa@example.invalid' }],
        memberships: [{ ...membership, projectId: 2 }]
      }
    ]) {
      expect(resolveMovementEvidence({ movement, ...input })).toEqual({
        status: 'UNRESOLVED_PRESERVED'
      });
    }
  });

  it('preserva movimento já reconciliado e produz auditoria pública sem PII', () => {
    expect(
      resolveMovementEvidence({
        movement: { ...movement, movedByUserId: 7 },
        users: [],
        memberships: []
      })
    ).toEqual({ status: 'ALREADY_RECONCILED', userId: 7 });
    const audit = buildE11Audit({
      tasks: [task],
      movements: [movement],
      users: [],
      memberships: []
    });
    expect(audit.counts).toMatchObject({ tasksTextOnly: 1, movementsUnresolved: 1 });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('Nome legado');
    expect(serialized).not.toContain('Snapshot legado');
    expect(serialized).not.toContain('example.invalid');
  });
});
