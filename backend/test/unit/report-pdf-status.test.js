import { describe, expect, it } from 'vitest';
import * as frontendSummary from '../../../frontend/src/features/reports/model/report-summary.js';
import {
  HEALTH_STATUS_LABELS,
  describeHealthReason as frontendReason
} from '../../../frontend/src/features/indicators/health-display.js';
import { buildReportPdfDefinition } from '../../src/modules/reports/report-pdf.document.js';
import {
  describeHealthReason,
  indicatorStatus
} from '../../src/modules/reports/report-pdf.format.js';
import * as summary from '../../src/modules/reports/report-summary.js';
import { reportFixture } from '../fixtures/report-snapshot.js';

function flatten(node) {
  if (node == null || typeof node === 'boolean' || typeof node === 'function') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return ['text', 'stack', 'columns', 'ul', 'table', 'body', 'toc', 'title']
    .map((key) => flatten(node[key]))
    .join(' ');
}

const generatedAt = '2026-10-01T12:00:00.000Z';

describe('S2-06/S2-07 — status das métricas', () => {
  it('mostra o mesmo selo, motivo e referência do cartão do painel', () => {
    expect(
      indicatorStatus({
        metricId: 'I66',
        assessment: {
          status: 'CRITICAL',
          reasonCode: 'STAGE_GAP',
          basis: { current: 25, expected: 70, gapPoints: 45 },
          reference: { label: 'Progresso do projeto', unit: 'PERCENT', value: 70 },
          delta: { unit: 'PERCENTAGE_POINTS', value: -45 }
        }
      })
    ).toEqual({
      status: 'CRITICAL',
      label: 'Crítico',
      tone: 'danger',
      reason:
        'Cobertura observada de 25% frente a 70% no estágio anterior; lacuna de 45 pontos percentuais.',
      reference: 'Progresso do projeto: 70% · Variação: -45 p.p.'
    });
    expect(
      indicatorStatus({
        metricId: 'I28',
        assessment: {
          status: 'HEALTHY',
          reasonCode: 'TASK_SHARE',
          basis: { count: 0, totalTasks: 5 },
          reference: { label: 'Meta', unit: 'PERCENT', value: 10 },
          delta: { unit: 'PERCENTAGE_POINTS', value: 2.5 }
        }
      })
    ).toMatchObject({
      label: 'Saudável',
      tone: 'success',
      reason: '0 de 5 Tasks estão atrasadas.',
      reference: 'Meta: 10% · Variação: +2,5 p.p.'
    });
  });

  it('indicador sem avaliação é informativo e não repete motivo', () => {
    expect(indicatorStatus({ metricId: 'I26' })).toEqual({
      status: 'NEUTRAL',
      label: 'Informativo',
      tone: 'neutral',
      reason: null,
      reference: null
    });
    expect(
      indicatorStatus({
        metricId: 'I26',
        assessment: { status: 'NEUTRAL', reasonCode: 'X', basis: {} }
      }).reason
    ).toBeNull();
    expect(
      indicatorStatus({
        metricId: 'I02',
        assessment: { status: 'NOT_APPLICABLE', reasonCode: 'GITHUB_NOT_CONFIGURED', basis: {} }
      })
    ).toMatchObject({ label: 'Não se aplica', reason: null });
    expect(
      indicatorStatus({
        metricId: 'I20',
        assessment: { status: 'UNASSESSED', reasonCode: 'INSUFFICIENT_BASIS', basis: {} }
      })
    ).toMatchObject({
      label: 'Dados insuficientes',
      reason: 'A amostra ou a base de comparação é insuficiente para pontuação.'
    });
    expect(indicatorStatus({ metricId: 'I01', assessment: { status: 'OUTRO' } }).status).toBe(
      'NEUTRAL'
    );
  });

  it('o PDF traz coluna Status, contagem por visão e o motivo na observação', () => {
    const text = flatten(buildReportPdfDefinition(reportFixture()).content);
    expect(text).toMatch(/Indicador\s+Valor\s+Status\s+Observações/);
    expect(text).toMatch(/Rastreabilidade\s+Crítico: 1\s+·\s+Saudável: 1/);
    expect(text).toMatch(/Cobertura de implementação\s+25%\s+Crítico/);
    expect(text).toContain('Progresso do projeto: 70% · Variação: -45 p.p.');
    expect(text).toContain('1 de 10 Tasks estão atrasadas.');
    expect(text).toContain('Valor observado: 100%.');
    expect(text).not.toContain('Este indicador é informativo e não compõe a Saúde do Projeto.');
  });

  it('o PDF abre com o resumo: progresso, requisitos, saúde, defeitos e contagens', () => {
    const text = flatten(buildReportPdfDefinition(reportFixture()).content);
    for (const expected of [
      'Progresso do projeto',
      '55,56%',
      'Requisitos concluídos',
      '0 de 3',
      'Saúde do projeto',
      '61 / 100',
      'Atenção',
      'Defeitos pendentes',
      'Em aberto',
      'Atrasada: 1',
      'Crítico: 1',
      'Atenção: 1',
      'Saudável: 1',
      'Informativo: 7'
    ])
      expect(text).toContain(expected);
  });

  it('Sprint atrasada e marco atrasado aparecem em vermelho', () => {
    const definition = buildReportPdfDefinition(reportFixture());
    const card = definition.content.find(
      (node) => node.table?.widths?.length === 1 && flatten(node).includes('Sprint 1')
    );
    expect(flatten(card)).toContain('Atrasada');
    expect(card.layout.vLineColor(0)).toBe('#a6333f');
    const concluded = reportFixture();
    concluded.snapshot.planning.sprints[0].status = 'CONCLUIDA';
    concluded.snapshot.planning.milestones[0].status = 'CONCLUIDO';
    const done = buildReportPdfDefinition(concluded);
    const doneCard = done.content.find(
      (node) => node.table?.widths?.length === 1 && flatten(node).includes('Sprint 1')
    );
    expect(flatten(doneCard)).toContain('Concluída');
    expect(doneCard.layout.vLineColor(0)).toBe('#17643b');
    expect(flatten(done.content)).toMatch(/Marco de validação\s+.*?Concluído/);
  });
});

describe('S2-06/S2-07 — regras visuais iguais na tela e no PDF', () => {
  const sprints = [
    { status: 'EM_ANDAMENTO', endDate: '2026-09-30T00:00:00.000Z' },
    { status: 'EM_ANDAMENTO', endDate: '2026-10-05T00:00:00.000Z' },
    { status: 'CONCLUIDA', endDate: '2026-09-01T00:00:00.000Z' },
    { status: 'PLANEJADA', endDate: '2026-11-01T00:00:00.000Z' },
    { status: 'CANCELADA', endDate: '2026-09-01T00:00:00.000Z' },
    { status: 'EM_ANDAMENTO', endDate: 'sem data' },
    { status: 'DESCONHECIDO', endDate: null }
  ];

  it('situação de Sprint e marco, barra e contagens', () => {
    expect(sprints.map((sprint) => summary.sprintSituation(sprint, generatedAt).key)).toEqual([
      'ATRASADA',
      'EM_ANDAMENTO',
      'CONCLUIDA',
      'PLANEJADA',
      'CANCELADA',
      'EM_ANDAMENTO',
      'DESCONHECIDO'
    ]);
    expect(summary.sprintSituation(sprints[6], generatedAt)).toEqual({
      key: 'DESCONHECIDO',
      label: 'DESCONHECIDO',
      tone: 'neutral'
    });
    expect(summary.milestoneSituation({ status: 'PENDENTE', overdue: true }).label).toBe(
      'Atrasado'
    );
    expect(summary.milestoneSituation({ status: 'CONCLUIDO', overdue: true }).label).toBe(
      'Concluído'
    );
    expect(summary.progressBar({ percentage: 150 })).toEqual({ value: 100, tone: 'success' });
    expect(summary.progressBar({ percentage: -5 })).toEqual({ value: 0, tone: 'info' });
    expect(summary.progressBar({ percentage: null })).toBeNull();
    expect(summary.progressBar(undefined)).toBeNull();
    const view = (status) => ({
      sections: [{ indicators: [{ metricId: 'I1', assessment: { status } }] }]
    });
    expect(summary.healthCounts([view('CRITICAL'), view('HEALTHY')])).toMatchObject({
      CRITICAL: 1,
      HEALTHY: 0
    });
  });

  it('resumo sem dados não inventa números', () => {
    expect(summary.reportOverview({ generatedAt, planning: { sprints: [] } })).toEqual({
      progress: null,
      requirements: { done: 0, total: 0, percentage: null },
      pendingDefects: null,
      health: null,
      sprints: { CONCLUIDA: 0, EM_ANDAMENTO: 0, ATRASADA: 0, PLANEJADA: 0, CANCELADA: 0 },
      indicators: {
        CRITICAL: 0,
        ATTENTION: 0,
        HEALTHY: 0,
        UNASSESSED: 0,
        NOT_APPLICABLE: 0,
        NEUTRAL: 0
      }
    });
    const insufficient = reportFixture().snapshot;
    insufficient.indicators.views[0].projectHealth = { score: null, status: 'UNASSESSED' };
    expect(summary.reportOverview(insufficient).health).toEqual({
      score: null,
      status: 'UNASSESSED'
    });
    const insufficientReport = reportFixture();
    insufficientReport.snapshot = insufficient;
    expect(flatten(buildReportPdfDefinition(insufficientReport).content)).toMatch(
      /Saúde do projeto\s+—\s+Dados insuficientes/
    );
    const unavailable = reportFixture().snapshot;
    unavailable.indicators.views[0].sections[0].indicators[0].state = 'UNAVAILABLE';
    expect(summary.reportOverview(unavailable).progress).toBeNull();
  });

  it('a cópia do backend responde igual ao modelo da tela', () => {
    const snapshots = [
      reportFixture().snapshot,
      reportFixture({ requirements: 0, sprints: 0 }).snapshot
    ];
    for (const snapshot of snapshots)
      expect(summary.reportOverview(snapshot)).toEqual(frontendSummary.reportOverview(snapshot));
    for (const sprint of sprints)
      expect(summary.sprintSituation(sprint, generatedAt)).toEqual(
        frontendSummary.sprintSituation(sprint, generatedAt)
      );
    for (const milestone of [
      { status: 'PENDENTE', overdue: true },
      { status: 'PENDENTE', overdue: false },
      { status: 'CONCLUIDO' }
    ])
      expect(summary.milestoneSituation(milestone)).toEqual(
        frontendSummary.milestoneSituation(milestone)
      );
    for (const percentage of [0, 33.3, 100, 140, null])
      expect(summary.progressBar({ percentage })).toEqual(
        frontendSummary.progressBar({ percentage })
      );
    for (const key of [
      'HEALTH_STATUSES',
      'HEALTH_LABELS',
      'HEALTH_TONES',
      'SPRINT_SITUATIONS',
      'MILESTONE_SITUATIONS'
    ])
      expect(summary[key]).toEqual(frontendSummary[key]);
    for (const [status, label] of Object.entries(HEALTH_STATUS_LABELS))
      expect(summary.HEALTH_LABELS[status]).toBe(label);
  });

  it('o motivo da avaliação é o mesmo texto do painel', () => {
    const cases = [
      ['GITHUB_NOT_CONFIGURED', {}, 'I02'],
      ['TASK_SHARE', { count: 2, totalTasks: 9 }, 'I28'],
      ['TASK_SHARE', { count: 2, totalTasks: 9 }, 'I29'],
      ['TASK_SHARE', { count: 2, totalTasks: 9 }, 'I30'],
      [
        'BASELINE_REGRESSION',
        { current: 5, previous: 4, regressionPercent: 25, currentSample: 3, previousSample: 4 },
        'I15'
      ],
      [
        'BASELINE_REGRESSION',
        { current: 5, previous: 6, regressionPercent: 0, currentSample: 3, previousSample: 4 },
        'I20'
      ],
      ['EFFORT_DEVIATION', { actualHours: 30.5, estimatedHours: 28 }, 'I44'],
      ['BURNDOWN_GAP', { actualRemaining: 19, idealRemaining: 0, baselineScope: 32 }, 'I45'],
      ['SCOPE_CHANGE', { addedCount: 2, removedCount: 1, plannedTasks: 7 }, 'I71'],
      ['INVERSE_PERCENT', { value: 12.5 }, 'I50'],
      ['DIRECT_PERCENT', { value: 87.5 }, 'I61'],
      ['CURRENT_TEST_PASS', { pass: 6, total: 11 }, 'I52'],
      ['STAGE_GAP', { current: 50, expected: 70, gapPoints: 20 }, 'I66'],
      ['NO_OPEN_PRS', {}, 'I73'],
      ['OPEN_PR_AGE', { averageOpenAgeDays: 3.3, medianMergeHours: 64.8 }, 'I73'],
      ['DATA_SOURCE_UNAVAILABLE', {}, 'I09'],
      ['INSUFFICIENT_BASIS', {}, 'I20'],
      ['OUTRO', {}, 'I01'],
      [undefined, undefined, 'I01']
    ];
    for (const [reasonCode, basis, metricId] of cases)
      expect(describeHealthReason({ reasonCode, basis }, metricId)).toBe(
        frontendReason({ reasonCode, basis }, metricId)
      );
  });
});
