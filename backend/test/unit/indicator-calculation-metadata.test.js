import { describe, expect, it } from 'vitest';
import { INDICATORS } from '../../src/modules/indicators/indicators.catalog.js';
import { indicatorResult } from '../../src/modules/indicators/indicators.mapper.js';
import {
  DASHBOARD_VIEWS,
  publicDashboardCatalog
} from '../../src/modules/indicators/dashboard-view.catalog.js';
import {
  projectRequirementSummary,
  projectIndicatorCoverage
} from '../../src/modules/traceability/requirement-traceability.policy.js';

describe('User-facing calculation metadata', () => {
  it('covers every published and exposed indicator without placeholders or pseudocode', () => {
    const exposed = new Set([
      ...Object.values(DASHBOARD_VIEWS).flatMap((sections) =>
        sections.flatMap((section) => section.metricIds)
      ),
      ...publicDashboardCatalog()
        .filter((row) => row.customization.customizable)
        .map((row) => row.metricId)
    ]);
    for (const definition of Object.values(INDICATORS)) {
      expect(definition.formula.trim(), definition.id).not.toBe('');
      expect(definition.formula, definition.id).not.toMatch(
        /status\s*=|===|\b(?:COUNT|SUM|AVG|MEDIAN|MEAN|WHERE|TaskMovement|null|TODO|TBD|I\d\d)\b|[A-Za-z]+\.[A-Za-z]+|\//
      );
      expect(definition.sources.length, definition.id).toBeGreaterThan(0);
    }
    expect([...exposed].every((id) => INDICATORS[id]?.formula)).toBe(true);
  });

  it('carries the same catalog rule through every data state without changing clocks or values', () => {
    const asOf = '2026-10-05T12:00:00.000Z';
    const sourceUpdatedAt = '2026-10-04T12:00:00.000Z';
    for (const definition of Object.values(INDICATORS)) {
      for (const state of ['AVAILABLE', 'PARTIAL', 'STALE', 'NO_DATA', 'UNAVAILABLE']) {
        const data = { state, value: state === 'AVAILABLE' ? 12 : null, sourceUpdatedAt };
        expect(indicatorResult(definition.id, 1, data, asOf)).toMatchObject({
          formula: definition.formula,
          sources: definition.sources,
          asOf,
          sourceUpdatedAt,
          value: data.value,
          state
        });
      }
    }
  });

  it('describes percentage, count, sum, difference, time and historical eligibility explicitly', () => {
    expect(INDICATORS.I01.formula).toBe('(Tarefas concluídas ÷ Total de tarefas) × 100');
    expect(INDICATORS.I23.formula).toBe('Quantidade de tarefas atualmente em andamento.');
    expect(INDICATORS.I31.formula).toContain('estimativas de esforço conhecidas');
    expect(INDICATORS.I33.formula).toContain('(Esforço realizado − Esforço estimado)');
    expect(INDICATORS.I21.formula).toContain('primeira entrada em “Em andamento”');
    expect(INDICATORS.I21.formula).toContain('Reentradas não reiniciam');
    expect(INDICATORS.I15.formula).toContain('Mediana do tempo entre a abertura e o merge');
    expect(INDICATORS.I16.formula).toContain('Média do tempo entre a abertura e o merge');
    expect(INDICATORS.I47.formula).toContain('Somente Sprints com histórico íntegro');
    expect(INDICATORS.I49.formula).toContain('aprovadas, com falha ou bloqueadas');
    expect(INDICATORS.I67.formula).toContain('Requisitos sem tarefas contribuem com zero');
  });

  it('keeps implementation distinct from evidence alone, progress and quality', () => {
    const rows = [
      projectRequirementSummary(
        { id: 1, title: 'Done with evidence' },
        { tasksTotal: 2, tasksDone: 2, technicalEvidence: 1, openDefects: 1 }
      ),
      projectRequirementSummary(
        { id: 2, title: 'Done without evidence' },
        { tasksTotal: 1, tasksDone: 1 }
      ),
      projectRequirementSummary(
        { id: 3, title: 'Evidence without completion' },
        { tasksTotal: 1, tasksDone: 0, technicalEvidence: 1 }
      ),
      projectRequirementSummary({ id: 4, title: 'No tasks' }, {})
    ];
    const coverage = projectIndicatorCoverage(rows);
    expect(coverage).toMatchObject({
      totalRequirements: 4,
      requirementsWithTasks: 3,
      implementedRequirements: 1,
      requirementsWithTechnicalEvidence: 2
    });
    expect(rows[0]).toMatchObject({
      implementation: { implemented: true },
      situation: 'COM_FALHA'
    });
    expect(INDICATORS.I61.formula).toContain('ao menos uma tarefa vinculada');
    expect(INDICATORS.I66.formula).toContain(
      'todas as tarefas concluídas e ao menos um Commit ou Pull Request'
    );
    expect(INDICATORS.I66.formula).toContain('Falhas em testes e defeitos não apagam');
  });
});
