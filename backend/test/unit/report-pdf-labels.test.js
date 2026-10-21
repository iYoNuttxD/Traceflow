import { describe, expect, it } from 'vitest';
import * as dashboard from '../../../frontend/src/features/indicators/dashboard-display.js';
import { situations } from '../../../frontend/src/features/traceability/model/requirement-view.js';
import {
  milestoneStatusLabels,
  sprintStatusLabels
} from '../../../frontend/src/features/schedule/components/schedule-display.js';
import { reportPdfFilename as frontendFilename } from '../../../frontend/src/features/reports/model/report-file.js';
import {
  describeLimitation,
  distributionRows,
  formatCivilDate,
  formatMetricValue,
  labelForField
} from '../../src/modules/reports/report-pdf.format.js';
import {
  FIELD_LABELS,
  LIMITATION_LABELS,
  METRIC_TITLES,
  MILESTONE_STATUS_LABELS,
  SITUATION_LABELS,
  SITUATION_TONES,
  SPRINT_STATUS_LABELS,
  VIEW_LABELS
} from '../../src/modules/reports/report-pdf.labels.js';
import { reportPdfFilename } from '../../src/modules/reports/report.service.js';

// O PDF precisa dizer exatamente o mesmo que a tela: estes testes falham se um rótulo
// ou uma regra de formatação do frontend mudar sem a cópia correspondente no backend.
describe('S2-07 — paridade de vocabulário entre PDF e tela', () => {
  it('usa os mesmos rótulos de visões, indicadores, campos e limitações do painel', () => {
    for (const [view, label] of Object.entries(VIEW_LABELS))
      expect(label).toBe(dashboard.VIEW_LABELS[view]);
    expect(METRIC_TITLES).toEqual(dashboard.METRIC_TITLES);
    expect(FIELD_LABELS).toEqual(dashboard.FIELD_LABELS);
    expect(LIMITATION_LABELS).toEqual(dashboard.LIMITATION_LABELS);
  });

  it('usa os mesmos rótulos e tons de situação, Sprint e marco', () => {
    expect(SITUATION_LABELS).toEqual(
      Object.fromEntries(Object.entries(situations).map(([key, [label]]) => [key, label]))
    );
    expect(SITUATION_TONES).toEqual(
      Object.fromEntries(Object.entries(situations).map(([key, [, tone]]) => [key, tone]))
    );
    expect(SPRINT_STATUS_LABELS).toEqual(sprintStatusLabels);
    expect(MILESTONE_STATUS_LABELS).toEqual(milestoneStatusLabels);
  });

  it('formata valores, datas e distribuições exatamente como o painel', () => {
    const values = [0, 1, 2.5, 55.555, 1234.5, -3, true, false, null, undefined, Number.NaN];
    for (const unit of [undefined, 'PERCENT', 'HOURS', 'DAYS', 'PERCENTAGE_POINTS', 'TASKS'])
      for (const value of values)
        expect(formatMetricValue(value, unit)).toBe(dashboard.formatMetricValue(value, unit));
    for (const value of ['2026-09-01', '2026-02-28T03:00:00.000Z', '', 'inválida'])
      expect(formatCivilDate(value)).toBe(dashboard.formatCivilDate(value));
    for (const code of ['GITHUB_NOT_CONFIGURED', 'CODIGO_DESCONHECIDO'])
      expect(describeLimitation(code)).toBe(dashboard.describeLimitation(code));
    for (const key of ['A_FAZER', 'estimatedHours', 'campoNovo'])
      expect(labelForField(key)).toBe(dashboard.labelForField(key));

    const indicators = [
      { metricId: 'I27', unit: 'TASKS', distribution: { A_FAZER: 2, unknownCount: 0 } },
      { metricId: 'I44', unit: 'HOURS', value: { estimatedHours: 3, differenceHours: -1 } },
      { metricId: 'I06', unit: 'RATE_VECTOR', value: { reworkRate: 12.5, mergedRate: 80 } },
      { metricId: 'I53', unit: 'DEFECTS', value: { total: 3, ABERTO: 1, active: 2 } },
      { metricId: 'I71', unit: 'TASKS', value: { changed: true, addedCount: 1 } },
      { metricId: 'I01', unit: 'PERCENT', value: 50 }
    ];
    for (const indicator of indicators)
      expect(distributionRows(indicator)).toEqual(dashboard.distributionRows(indicator));
  });

  it('gera o mesmo nome de arquivo no download da tela e no Content-Disposition', () => {
    for (const name of ['Projeto Ação & Validação', '  ', 'TCC — TraceFlow 2026!', 'x'.repeat(90)])
      expect(reportPdfFilename({ id: 9, snapshot: { project: { name } } })).toBe(
        frontendFilename(9, name)
      );
    expect(reportPdfFilename({ id: 9, snapshot: { project: { name: 'Ação' } } })).toBe(
      'traceflow-relatorio-9-acao.pdf'
    );
    expect(reportPdfFilename({ id: 9, snapshot: {} })).toBe('traceflow-relatorio-9-projeto.pdf');
  });
});
