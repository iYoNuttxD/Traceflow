import { describe, expect, it } from 'vitest';
import {
  projectRequirement,
  projectRequirementSummary,
  projectIndicatorCoverage
} from '../../src/modules/traceability/requirement-traceability.policy.js';
import { buildRequirementMetrics } from '../../src/modules/traceability/traceability.calculator.js';

const task = (status = 'CONCLUIDO', extra = {}) => ({
  id: 1,
  requirementId: 1,
  status,
  pullRequestId: null,
  _count: { commitLinks: 0, issueLinks: 0 },
  ...extra
});
const req = (extra = {}) => ({
  id: 1,
  projectId: 1,
  title: 'Local',
  lifecycleBasis: 'LOCAL',
  tasks: [task()],
  ...extra
});
const tc = (result = 'PASS', extra = {}) => ({
  id: 1,
  projectId: 1,
  requirementId: 1,
  status: 'ATIVO',
  currentVersion: 1,
  taskLinks: [],
  executions: result
    ? [
        {
          id: 1,
          testCaseVersion: 1,
          result,
          executedAt: new Date('2026-10-13'),
          steps: result === 'FAIL' ? [{ result: 'FAIL', detectedDefects: [] }] : []
        }
      ]
    : [],
  ...extra
});

describe('immutable local requirement lifecycle', () => {
  it('concludes locally without representing completed tasks as technical evidence', () => {
    const row = projectRequirement(req(), [tc()]);
    expect(row).toMatchObject({
      requirement: { status: 'CONCLUIDO', lifecycleBasis: 'LOCAL' },
      situation: 'CONCLUIDO',
      implementation: {
        basis: 'LOCAL',
        implemented: true,
        technicalImplemented: false,
        technicalEvidence: false
      },
      evidence: { implementation: false, correctionBasis: 'LOCAL' },
      progress: { percentage: 100 }
    });
    expect(buildRequirementMetrics(req()).implementationStatus).toBe('IMPLEMENTADO');
    // Current integration is deliberately irrelevant to an immutable requirement basis.
    expect(
      projectRequirement(req({ project: { githubIntegration: { status: 'ACTIVE' } } }), [tc()])
    ).toEqual(row);
  });
  it.each([
    [[], [], 'SEM_RASTREABILIDADE'],
    [[task('A_FAZER')], [], 'PLANEJADO'],
    [[task('EM_ANDAMENTO')], [], 'EM_DESENVOLVIMENTO'],
    [[task()], [], 'IMPLEMENTADO'],
    [[task()], [tc(null)], 'AGUARDANDO_VALIDACAO'],
    [[task()], [tc('BLOCKED')], 'EM_VALIDACAO'],
    [[task()], [tc('FAIL')], 'COM_FALHA'],
    [[task()], [tc('PASS', { currentVersion: 2 })], 'AGUARDANDO_VALIDACAO'],
    [[task(), task('A_FAZER', { id: 2 })], [tc()], 'EM_DESENVOLVIMENTO']
  ])('keeps prerequisites and genuine regressions: %s / %s', (tasks, tests, situation) => {
    expect(projectRequirement(req({ tasks }), tests).situation).toBe(situation);
  });
  it('uses relevant active current-version cases, including task-only links', () => {
    const indirect = tc('PASS', { requirementId: null, taskLinks: [{ task: task() }] });
    expect(
      projectRequirement(req(), [
        indirect,
        indirect,
        tc('FAIL', { id: 2, status: 'INATIVO' }),
        tc('FAIL', { id: 3, deletedAt: new Date() }),
        tc('FAIL', { id: 4, projectId: 9 }),
        tc('FAIL', { id: 5, requirementId: 9 })
      ])
    ).toMatchObject({ situation: 'CONCLUIDO', validation: { testCasesTotal: 1, pass: 1 } });
  });
  it('preserves GitHub and legacy criteria even if a current execution is manual', () => {
    for (const lifecycleBasis of ['GITHUB', undefined]) {
      expect(projectRequirement(req({ lifecycleBasis }), [tc()]).situation).toBe(
        'EM_DESENVOLVIMENTO'
      );
      expect(
        projectRequirement(
          req({ lifecycleBasis, tasks: [task('CONCLUIDO', { pullRequestId: 8 })] }),
          [tc()]
        ).situation
      ).toBe('CONCLUIDO');
    }
  });
  it('keeps defect precedence and labels local correction proof without fabricating code', () => {
    const defect = {
      id: 1,
      projectId: 1,
      requirementId: 1,
      status: 'VALIDADO',
      currentCorrectionCycle: 1,
      taskLinks: [{ relationType: 'CORRECTION', correctionCycle: 1, task: task() }],
      retests: [{ correctionCycle: 1 }]
    };
    expect(projectRequirement(req(), [tc()], [defect])).toMatchObject({
      situation: 'CONCLUIDO',
      evidence: { implementation: false, correction: 'PRESENT', correctionBasis: 'LOCAL' }
    });
    expect(
      projectRequirement(req({ lifecycleBasis: 'GITHUB' }), [tc()], [defect]).evidence.correction
    ).toBe('MISSING');
    expect(projectRequirement(req(), [tc()], [{ ...defect, status: 'ABERTO' }]).situation).toBe(
      'COM_FALHA'
    );
    expect(
      projectRequirement(req(), [tc()], [{ ...defect, status: 'AGUARDANDO_RETESTE' }]).situation
    ).toBe('AGUARDANDO_RETESTE');
  });
  it('keeps summary parity and technical indicator counts separate from local implementation', () => {
    const counts = { tasksTotal: 1, tasksDone: 1, testCasesTotal: 1, passed: 1 };
    const local = projectRequirementSummary(req(), counts);
    const github = projectRequirementSummary(req({ id: 2, lifecycleBasis: 'GITHUB' }), counts);
    const technical = projectRequirementSummary(req({ id: 3, lifecycleBasis: 'GITHUB' }), {
      ...counts,
      technicalEvidence: 1
    });
    expect(local.situation).toBe(projectRequirement(req(), [tc()]).situation);
    expect(projectIndicatorCoverage([local, github, technical])).toMatchObject({
      totalRequirements: 3,
      implementedRequirements: 1,
      validatedRequirements: 2,
      requirementsWithTechnicalEvidence: 1,
      lifecycleBasis: { local: 1, github: 2 },
      githubCohort: {
        totalRequirements: 2,
        tasksTotal: 2,
        tasksDone: 2,
        implementedRequirements: 1,
        validatedRequirements: 1
      }
    });
  });
});
