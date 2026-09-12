import { describe, it, expect } from 'vitest';
import {
  currentExecution,
  deriveSituation,
  matchesProjection,
  projectRequirement,
  projectionSummary,
  TRACEABILITY_SITUATIONS
} from '../../src/modules/traceability/requirement-traceability.policy.js';
import {
  buildMatrixSummary,
  buildRequirementMetrics,
  getImplementationStatus
} from '../../src/modules/traceability/traceability.calculator.js';
import { parseReconciliationArguments } from '../../scripts/reconcile-requirement-traceability.js';
const task = (status = 'CONCLUIDO', evidence = true) => ({
  id: 1,
  status,
  requirementId: 1,
  pullRequestId: evidence ? 9 : null,
  _count: { commitLinks: 0, issueLinks: 0 }
});
const requirement = (tasks = [task()], status = 'VALIDADO') => ({
  id: 1,
  projectId: 1,
  title: 'Checkout',
  status,
  tasks
});
const execution = (result = 'PASS', extra = {}) => ({
  id: 1,
  testCaseVersion: 1,
  executedAt: new Date('2026-09-10'),
  result,
  steps: result === 'FAIL' ? [{ id: 1, result: 'FAIL', detectedDefects: [] }] : [],
  ...extra
});
const tc = (result, extra = {}) => ({
  id: 1,
  projectId: 1,
  requirementId: 1,
  currentVersion: 1,
  status: 'ATIVO',
  taskLinks: [],
  executions: result ? [execution(result)] : [],
  ...extra
});
const defect = (status, extra = {}) => ({
  id: 1,
  projectId: 1,
  requirementId: 1,
  status,
  currentCorrectionCycle: 1,
  taskLinks: [],
  retests: [],
  ...extra
});
const state = (r, tests, defects) => projectRequirement(r, tests, defects).situation;

describe('S1-09 canonical policy', () => {
  it.each([
    ['SEM_RASTREABILIDADE', requirement([]), [], []],
    ['PLANEJADO', requirement([task('A_FAZER', false)]), [], []],
    ['EM_DESENVOLVIMENTO', requirement([task('EM_ANDAMENTO', false)]), [], []],
    ['IMPLEMENTADO', requirement(), [], []],
    ['AGUARDANDO_VALIDACAO', requirement(), [tc()], []],
    ['EM_VALIDACAO', requirement(), [tc('BLOCKED')], []],
    ['COM_FALHA', requirement(), [tc('FAIL')], []],
    ['EM_CORRECAO', requirement(), [], [defect('EM_CORRECAO')]],
    ['AGUARDANDO_RETESTE', requirement(), [], [defect('AGUARDANDO_RETESTE')]],
    ['CONCLUIDO', requirement(), [tc('PASS')], []],
    ['CONCLUIDO', requirement([task()], 'CONCLUIDO'), [tc('PASS')], []]
  ])('derives %s', (expected, r, tests, defects) =>
    expect(state(r, tests, defects)).toBe(expected)
  );

  it.each([
    [25, 'EM_CORRECAO', 'EM_CORRECAO'],
    [75, 'ABERTO', 'COM_FALHA'],
    [50, 'AGUARDANDO_RETESTE', 'AGUARDANDO_RETESTE']
  ])(
    'prioritizes quality at %s percent without changing progress',
    (percentage, status, expected) => {
      const tasks = Array.from({ length: 4 }, (_, i) => ({
        ...task(i < percentage / 25 ? 'CONCLUIDO' : 'EM_ANDAMENTO'),
        id: i + 1
      }));
      const projection = projectRequirement(requirement(tasks), [], [defect(status)]);
      expect(projection.situation).toBe(expected);
      expect(projection.progress.percentage).toBe(percentage);
    }
  );
  it('does not hide untreated current failure behind ongoing or absent implementation', () => {
    expect(state(requirement([task('EM_ANDAMENTO')]), [tc('FAIL')])).toBe('COM_FALHA');
    expect(state(requirement([]), [tc('FAIL')])).toBe('COM_FALHA');
    expect(state(requirement([task('EM_ANDAMENTO')]), [tc('PASS')])).toBe('EM_DESENVOLVIMENTO');
  });
  it('summarizes the same quality situations as the requirement list', () => {
    const partial = requirement([task('EM_ANDAMENTO')]);
    const rows = [
      projectRequirement(partial, [], [defect('EM_CORRECAO')]),
      projectRequirement(partial, [], [defect('ABERTO')]),
      projectRequirement(partial),
      projectRequirement(requirement([]))
    ];
    expect(rows.map((r) => r.situation)).toEqual([
      'EM_CORRECAO',
      'COM_FALHA',
      'EM_DESENVOLVIMENTO',
      'SEM_RASTREABILIDADE'
    ]);
    const summary = projectionSummary(rows);
    expect(summary).toMatchObject({
      total: 4,
      withDefect: 2,
      bySituation: { EM_DESENVOLVIMENTO: 1 }
    });
    expect(summary.withDefect).toBe(
      rows.filter((r) => ['COM_FALHA', 'EM_CORRECAO', 'AGUARDANDO_RETESTE'].includes(r.situation))
        .length
    );
  });

  it.each([
    [['VALIDADO', 'EM_CORRECAO'], 'EM_CORRECAO'],
    [['AGUARDANDO_RETESTE', 'EM_CORRECAO'], 'EM_CORRECAO'],
    [['ABERTO', 'EM_CORRECAO'], 'COM_FALHA'],
    [['ABERTO', 'AGUARDANDO_RETESTE'], 'COM_FALHA']
  ])('prioritizes defects %j', (statuses, expected) => {
    expect(
      state(
        requirement(),
        [tc('PASS')],
        statuses.map((status, id) => defect(status, { id: id + 1 }))
      )
    ).toBe(expected);
  });

  it('current execution orders by timestamp then id and never borrows old PASS', () => {
    const row = tc('PASS', { currentVersion: 2 });
    expect(currentExecution(row)).toBeNull();
    expect(state(requirement([task()], 'CONCLUIDO'), [row])).toBe('AGUARDANDO_VALIDACAO');
    row.executions.push(
      execution('PASS', { id: 2, testCaseVersion: 2 }),
      execution('BLOCKED', { id: 3, testCaseVersion: 2 })
    );
    expect(currentExecution(row).result).toBe('BLOCKED');
    row.executions.push(
      execution('FAIL', { id: 4, testCaseVersion: 2, executedAt: new Date('2026-09-09') })
    );
    expect(currentExecution(row).id).toBe(3);
  });
  it('does not approve majority or confuse BLOCKED and FAIL', () => {
    for (const result of [null, 'BLOCKED'])
      expect(state(requirement(), [tc('PASS'), tc(result, { id: 2 })])).toBe(
        result ? 'EM_VALIDACAO' : 'AGUARDANDO_VALIDACAO'
      );
    expect(state(requirement(), [tc('PASS'), tc('FAIL', { id: 2 })])).toBe('COM_FALHA');
  });
  it('matches each failed step; unrelated or deleted defects cannot mask a failure', () => {
    const failure = execution('FAIL', {
      steps: [
        { id: 1, result: 'FAIL', detectedDefects: [{ id: 1, projectId: 1 }] },
        { id: 2, result: 'FAIL', detectedDefects: [] }
      ]
    });
    const row = tc(null, { executions: [failure] });
    const correcting = [defect('EM_CORRECAO')];
    expect(state(requirement(), [row], correcting)).toBe('COM_FALHA');
    failure.steps[1].detectedDefects.push({ id: 2, projectId: 1 });
    expect(state(requirement(), [row], correcting)).toBe('EM_CORRECAO');
    failure.steps[1].detectedDefects[0].deletedAt = new Date();
    expect(state(requirement(), [row], correcting)).toBe('COM_FALHA');
    failure.steps[1].detectedDefects = [{ projectId: 2 }];
    expect(state(requirement(), [row], correcting)).toBe('COM_FALHA');
  });
  it('ordinary PASS does not validate an open defect; validated defect does not hide a new failed step', () => {
    expect(state(requirement(), [tc('PASS')], [defect('ABERTO')])).toBe('COM_FALHA');
    expect(state(requirement(), [tc('FAIL')], [defect('VALIDADO')])).toBe('COM_FALHA');
  });
  it('fully represented FAIL with no pending defect is not approved', () => {
    const row = tc(null, {
      executions: [
        execution('FAIL', { steps: [{ result: 'FAIL', detectedDefects: [{ projectId: 1 }] }] })
      ]
    });
    expect(state(requirement(), [row], [defect('VALIDADO')])).toBe('EM_VALIDACAO');
  });
  it('deduplicates direct and indirect relevance and excludes inactive/deleted/foreign cases', () => {
    const row = tc('PASS', { taskLinks: [{ task: task() }] });
    const result = projectRequirement(requirement(), [
      row,
      row,
      tc('FAIL', { id: 2, status: 'INATIVO' }),
      tc('FAIL', { id: 3, deletedAt: new Date() }),
      tc('FAIL', { id: 4, projectId: 2 }),
      tc('FAIL', { id: 5, requirementId: 8 })
    ]);
    expect(result.validation).toEqual({
      testCasesTotal: 1,
      neverExecuted: 0,
      pass: 1,
      fail: 0,
      blocked: 0
    });
    expect(
      state(requirement(), [tc('PASS', { requirementId: null, taskLinks: [{ task: task() }] })])
    ).toBe('CONCLUIDO');
  });
  it('defect relevance uses ORIGIN, never correction-only or detection case', () => {
    const d = defect('ABERTO', {
      requirementId: null,
      taskLinks: [{ relationType: 'CORRECTION', task: task() }]
    });
    expect(projectRequirement(requirement(), [], [d]).defects.total).toBe(0);
    d.taskLinks[0].relationType = 'ORIGIN';
    expect(projectRequirement(requirement(), [], [d, d]).defects.total).toBe(1);
    expect(
      projectRequirement(
        requirement(),
        [],
        [defect('ABERTO', { deletedAt: new Date() }), defect('ABERTO', { projectId: 2 })]
      ).defects.total
    ).toBe(0);
  });
  it.each(['APROVADO', 'VALIDADO', 'CANCELADO', 'EM_IMPLEMENTACAO'])(
    'legacy %s does not govern automatic conclusion',
    (status) => {
      expect(state(requirement([task()], status), [tc('PASS')], [defect('VALIDADO')])).toBe(
        'CONCLUIDO'
      );
    }
  );
  it('terminal status cannot bypass implementation or lack of tests', () => {
    expect(state(requirement([], 'CONCLUIDO'), [tc('PASS')])).toBe('SEM_RASTREABILIDADE');
    expect(state(requirement([task()], 'CONCLUIDO'), [])).toBe('IMPLEMENTADO');
    expect(getImplementationStatus(requirement([], 'CONCLUIDO'), [], false)).toBe('CONCLUIDO');
  });
  it('preserves progress, link counts, issue-only semantics and unweighted average', () => {
    const r = requirement([
      task(),
      { ...task(), id: 2, _count: { commitLinks: 1, issueLinks: 2 } },
      task('A_FAZER')
    ]);
    const result = projectRequirement(r);
    expect(result.progress).toMatchObject({ percentage: 66.67, tasksTotal: 3, tasksDone: 2 });
    expect(result.artifacts).toEqual({ pullRequests: 3, commits: 1, issues: 2 });
    expect(
      buildMatrixSummary([buildRequirementMetrics(r), buildRequirementMetrics(requirement([]))])
        .averageProgress.percentage
    ).toBe(33.34);
    expect(
      projectRequirement(
        requirement([{ ...task('CONCLUIDO', false), _count: { commitLinks: 0, issueLinks: 4 } }])
      ).evidence.implementation
    ).toBe(false);
  });
  it('separates correction evidence from situation and contextual retest results', () => {
    const d = defect('VALIDADO', {
      taskLinks: [{ relationType: 'CORRECTION', correctionCycle: 1, task: task() }],
      retests: [{ correctionCycle: 1 }]
    });
    expect(projectRequirement(requirement(), [tc('BLOCKED')], [d]).evidence).toEqual({
      implementation: true,
      validation: true,
      correction: 'PRESENT'
    });
    d.retests = [{ correctionCycle: 0 }];
    const result = projectRequirement(requirement([task()], 'CONCLUIDO'), [tc('PASS')], [d]);
    expect(result.evidence.correction).toBe('MISSING');
    expect(result.situation).toBe('CONCLUIDO');
    expect(projectRequirement(requirement()).evidence.correction).toBe('NOT_APPLICABLE');
  });
  it('summary contains all eleven states and filters operate on projected values', () => {
    const rows = [
      projectRequirement(requirement(), [tc('PASS')]),
      projectRequirement({ ...requirement([]), id: 2 })
    ];
    const summary = projectionSummary(rows);
    expect(Object.keys(summary.bySituation)).toEqual(TRACEABILITY_SITUATIONS);
    expect(summary.total).toBe(2);
    expect(
      matchesProjection(rows[0], {
        search: 'req-1',
        hasTests: true,
        hasOpenDefects: false,
        hasTechnicalEvidence: true,
        situation: 'CONCLUIDO',
        requirementStatus: 'CONCLUIDO'
      })
    ).toBe(true);
    for (const q of [
      { search: 'missing' },
      { situation: 'VALIDADO' },
      { requirementStatus: 'EM_VALIDACAO' },
      { hasTests: false },
      { hasOpenDefects: true },
      { hasTechnicalEvidence: false }
    ])
      expect(matchesProjection(rows[0], q)).toBe(false);
    expect(deriveSituation({ legacyStage: 'PLANEJADO' })).toBe('PLANEJADO');
  });
  it('operational reconciliation defaults to dry-run and rejects ambiguous scope', () => {
    expect(parseReconciliationArguments(['--project-id=1'])).toEqual({
      projectId: 1,
      dryRun: true
    });
    expect(parseReconciliationArguments(['--project-id=1', '--apply']).dryRun).toBe(false);
    expect(parseReconciliationArguments(['--project-id=1', '--policy'])).toEqual({
      projectId: 1,
      dryRun: true,
      reason: 'TRACEABILITY_POLICY_RECONCILIATION'
    });
    for (const args of [
      [],
      ['--project-id=0'],
      ['--project-id=1', '--apply', '--dry-run'],
      ['--project-id=1', '--unknown']
    ])
      expect(() => parseReconciliationArguments(args)).toThrow();
  });
});

describe('synchronized lifecycle regression', () => {
  it('concludes automatically without a manual terminal and reopens for new current cases', () => {
    const done = projectRequirement(requirement([task()], 'APROVADO'), [tc('PASS')]);
    expect(done.situation).toBe('CONCLUIDO');
    expect(done.requirement.status).toBe('CONCLUIDO');
    const reopened = projectRequirement(requirement([task()], 'CONCLUIDO'), [
      tc('PASS'),
      tc(null, { id: 2 })
    ]);
    expect(reopened.situation).toBe('AGUARDANDO_VALIDACAO');
    expect(reopened.requirement.status).toBe('EM_VALIDACAO');
  });
  it.each([
    ['ABERTO', 'COM_FALHA'],
    ['EM_CORRECAO', 'EM_CORRECAO'],
    ['AGUARDANDO_RETESTE', 'AGUARDANDO_RETESTE']
  ])('synchronizes %s', (status, situation) => {
    const row = projectRequirement(requirement(), [], [defect(status)]);
    expect(row.situation).toBe(situation);
    expect(row.requirement.status).toBe('EM_CORRECAO');
  });
});
