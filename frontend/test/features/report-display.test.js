import { describe, expect, it } from 'vitest';
import {
  formatReportPeriod,
  indicatorItems,
  indicatorStatus,
  indicatorValue,
  personLabel,
  withFrozenNames
} from '../../src/features/reports/model/report-display.js';
import { reportPdfFilename } from '../../src/features/reports/model/report-file.js';
import {
  buildReportRequest,
  validateReportRequest
} from '../../src/features/reports/components/ReportRequestForm.jsx';

describe('S2-06 — apresentação do relatório', () => {
  it('recoloca o nome congelado em toda referência por userId', () => {
    const people = new Map([[7, { userId: 7, displayName: 'Ana', username: 'ana' }]]);
    expect(
      withFrozenNames(
        { a: [{ userId: 7, count: 2 }], b: { responsible: { userId: 9 } }, c: { id: 1 } },
        people
      )
    ).toEqual({
      a: [{ userId: 7, count: 2, displayName: 'Ana', name: 'Ana' }],
      b: {
        responsible: {
          userId: 9,
          displayName: 'Pessoa não identificada',
          name: 'Pessoa não identificada'
        }
      },
      c: { id: 1 }
    });
  });

  it('formata período, solicitante e valores como o painel', () => {
    expect(formatReportPeriod({})).toBe('Todo o histórico');
    expect(formatReportPeriod({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe(
      '01/09/2026 a 30/09/2026'
    );
    expect(personLabel({ displayName: 'Ana', username: 'ana' })).toBe('Ana (@ana)');
    expect(personLabel(null)).toBe('Não informado');
    expect(indicatorValue({ state: 'AVAILABLE', value: 12.5 }, 'PERCENT')).toBe('12,5%');
    expect(indicatorValue({ state: 'AVAILABLE', value: { total: 3 } })).toBe('3');
    expect(indicatorValue({ state: 'PARTIAL', points: [{}, {}] })).toBe('2 pontos na série');
    expect(indicatorValue({ state: 'UNAVAILABLE', value: 0 })).toBe('—');
    expect(indicatorValue({ state: 'NO_DATA', points: [{}] })).toBe('—');
  });

  it('lista itens com responsável apenas em estados com valor', () => {
    const indicator = {
      state: 'AVAILABLE',
      items: [
        { taskId: 1, title: 'A', responsible: { userId: 7, displayName: 'Ana' } },
        { taskId: 2, title: 'B' }
      ]
    };
    expect(indicatorItems(indicator).map((item) => item.text)).toEqual(['A — Ana', 'B']);
    expect(indicatorItems({ ...indicator, state: 'UNAVAILABLE' })).toEqual([]);
  });

  it('valida e monta o pedido com as mesmas regras do backend', () => {
    expect(validateReportRequest({ startDate: '', endDate: '' })).toEqual({});
    expect(validateReportRequest({ startDate: '2026-09-02', endDate: '2026-09-01' })).toEqual({
      endDate: 'A data final deve ser igual ou posterior à inicial.'
    });
    expect(validateReportRequest({ startDate: '2025-01-01', endDate: '2026-01-02' })).toEqual({
      endDate: 'O período deve ter no máximo 366 dias.'
    });
    expect(buildReportRequest({ startDate: '', endDate: '', sprintId: '' })).toEqual({});
    expect(
      buildReportRequest({ startDate: '2026-09-01', endDate: '2026-09-30', sprintId: '4' })
    ).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timeZone: expect.any(String),
      sprintId: 4
    });
  });
});

describe('S2-07 — nome do arquivo PDF', () => {
  it('usa só ASCII, sem acentos nem símbolos, e tem nome padrão', () => {
    expect(reportPdfFilename(3, 'Projeto Ação & Validação')).toBe(
      'traceflow-relatorio-3-projeto-acao-validacao.pdf'
    );
    expect(reportPdfFilename(3, '  ')).toBe('traceflow-relatorio-3-projeto.pdf');
    expect(reportPdfFilename(3, 'x'.repeat(90))).toBe(
      `traceflow-relatorio-3-${'x'.repeat(60)}.pdf`
    );
  });
});

describe('S2-06 — status da métrica', () => {
  it('usa o selo e o texto do painel; informativo fica sem motivo', () => {
    expect(
      indicatorStatus({
        metricId: 'I28',
        assessment: {
          status: 'ATTENTION',
          reasonCode: 'TASK_SHARE',
          basis: { count: 3, totalTasks: 12 },
          reference: { label: 'Limite', unit: 'PERCENT', value: 20 },
          delta: { unit: 'PERCENTAGE_POINTS', value: 5 }
        }
      })
    ).toEqual({
      status: 'ATTENTION',
      label: 'Atenção',
      tone: 'warning',
      reason: '3 de 12 Tasks estão atrasadas.',
      reference: 'Limite: 20% · Variação: +5 p.p.'
    });
    expect(indicatorStatus({ metricId: 'I26' })).toMatchObject({
      label: 'Informativo',
      tone: 'neutral',
      reason: null,
      reference: null
    });
  });
});
