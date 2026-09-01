import { describe, expect, it } from 'vitest';
import { buildLr2LegacyRecoveryPlan } from '../../scripts/lib/lr2-legacy-recovery.js';

const member = {
  id: 11,
  projectId: 3,
  email: 'Person@Example.invalid',
  role: 'GERENTE',
  isActive: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z')
};
const user = { id: 7, email: 'person@example.invalid' };
const movement = {
  id: 21,
  projectId: 3,
  projectMemberId: 11,
  movedByUserId: null
};

describe('LR.2.1 recovery de ProjectMember', () => {
  it('planeja associação ausente, ator canônico, nulificação e remoção', () => {
    const plan = buildLr2LegacyRecoveryPlan({
      members: [member],
      users: [user],
      memberships: [],
      movements: [movement]
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.membershipCreates[0]).toMatchObject({
      projectId: 3,
      userId: 7,
      role: 'MANAGER',
      isActive: true
    });
    expect(plan.movementUpdates).toEqual([
      {
        movementId: 21,
        projectMemberId: 11,
        userId: 7,
        setCanonicalActor: true
      }
    ]);
    expect(plan.memberDeletes).toEqual([{ memberId: 11 }]);
    expect(plan.counts).toMatchObject({
      membershipsToCreate: 1,
      movementActorsToSet: 1,
      movementReferencesToNull: 1,
      projectMembersToDelete: 1,
      unresolved: 0
    });
  });

  it('aceita associação equivalente e preserva ator canônico já resolvido', () => {
    const plan = buildLr2LegacyRecoveryPlan({
      members: [{ ...member, role: 'MANAGER', isActive: 1 }],
      users: [user],
      memberships: [{ projectId: 3, userId: 7, role: 'MANAGER', isActive: 1 }],
      movements: [{ ...movement, movedByUserId: 7 }]
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.membershipCreates).toEqual([]);
    expect(plan.movementUpdates[0].setCanonicalActor).toBe(false);
  });

  it.each([
    ['CANONICAL_USER_NOT_FOUND', { users: [], memberships: [], movements: [movement] }],
    [
      'CANONICAL_MEMBERSHIP_CONFLICT',
      {
        users: [user],
        memberships: [{ projectId: 3, userId: 7, role: 'VIEWER', isActive: true }],
        movements: [movement]
      }
    ],
    [
      'MOVEMENT_CANONICAL_ACTOR_CONFLICT',
      {
        users: [user],
        memberships: [],
        movements: [{ ...movement, movedByUserId: 99 }]
      }
    ],
    [
      'MOVEMENT_ACTIVE_MEMBERSHIP_REQUIRED',
      {
        users: [user],
        memberships: [],
        movements: [movement],
        member: { ...member, isActive: false }
      }
    ]
  ])('bloqueia %s sem planejar remoção', (reason, input) => {
    const plan = buildLr2LegacyRecoveryPlan({
      members: [input.member || member],
      users: input.users,
      memberships: input.memberships,
      movements: input.movements
    });
    expect(plan.blockers.some((blocker) => blocker.reason === reason)).toBe(true);
    expect(plan.memberDeletes).toEqual([]);
    expect(plan.counts.unresolved).toBeGreaterThan(0);
  });

  it('não expõe e-mail nem nome nas contagens públicas do plano', () => {
    const plan = buildLr2LegacyRecoveryPlan({
      members: [{ ...member, name: 'Pessoa sigilosa' }],
      users: [],
      memberships: [],
      movements: []
    });
    expect(JSON.stringify(plan.counts)).not.toContain('example.invalid');
    expect(JSON.stringify(plan.counts)).not.toContain('Pessoa sigilosa');
  });
});
