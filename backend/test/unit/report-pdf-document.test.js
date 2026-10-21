import { describe, expect, it } from 'vitest';
import { burndownChart } from '../../src/modules/reports/report-pdf.chart.js';
import { buildReportPdfDefinition } from '../../src/modules/reports/report-pdf.document.js';
import {
  formatDateTime,
  indicatorNotes,
  indicatorValue,
  percent,
  shortDate
} from '../../src/modules/reports/report-pdf.format.js';
import { reportFixture } from '../fixtures/report-snapshot.js';

// Achata a árvore do pdfmake em texto, para procurar valores sem depender do layout.
function flatten(node) {
  if (node == null || typeof node === 'boolean' || typeof node === 'function') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  return ['text', 'stack', 'columns', 'ul', 'table', 'body', 'toc', 'title']
    .map((key) => flatten(node[key]))
    .join(' ');
}

function tables(node, found = []) {
  if (Array.isArray(node)) node.forEach((item) => tables(item, found));
  else if (node && typeof node === 'object') {
    if (node.table) found.push(node.table);
    Object.values(node).forEach((value) => tables(value, found));
  }
  return found;
}

describe('S2-07 — definição do PDF', () => {
  it('identifica projeto, período, geração, número do relatório e página em toda página', () => {
    const definition = buildReportPdfDefinition(reportFixture());
    const header = flatten(definition.header(2, 5));
    const footer = flatten(definition.footer(2, 5));
    expect(header).toContain('TraceFlow');
    expect(header).toContain('Projeto Ação & Validação');
    expect(header).toContain('Período: 01/09/2026 a 30/09/2026');
    expect(footer).toContain('Relatório #42');
    expect(footer).toContain(
      `Gerado em ${formatDateTime('2026-10-01T12:00:01.000Z', 'America/Sao_Paulo')} (America/Sao_Paulo)`
    );
    expect(footer).toContain('Página 2 de 5');
    expect(definition.pageSize).toBe('A4');
    expect(definition.defaultStyle.font).toBe('Roboto');
    expect(definition.info.title).toBe('Relatório #42 — Projeto Ação & Validação');
  });

  it('sem período no relatório, formata os instantes no fuso pedido e informa qual é', () => {
    const report = reportFixture();
    report.snapshot.filters = { sprint: null };
    const definition = buildReportPdfDefinition(report, { timeZone: 'Asia/Tokyo' });
    expect(flatten(definition.header(1, 1))).toContain('Período: Todo o histórico');
    expect(flatten(definition.footer(1, 1))).toContain(
      `${formatDateTime('2026-10-01T12:00:01.000Z', 'Asia/Tokyo')} (Asia/Tokyo)`
    );
    expect(flatten(definition.content)).toContain('Asia/Tokyo');
    expect(flatten(buildReportPdfDefinition(report).footer(1, 1))).toContain('(UTC)');
  });

  it('apresenta as três seções com os mesmos dados do snapshot e nomes congelados', () => {
    const report = reportFixture();
    const text = flatten(buildReportPdfDefinition(report).content);
    for (const expected of [
      'RELATÓRIO #42',
      'Solicitado por',
      'Ana Gestão (@ana)',
      'Planejamento',
      '1 Sprint e 1 marco no recorte · 2 tarefas fora de Sprint.',
      'Sprint 1 — Integração',
      'Atrasada',
      '2 de 4 (50%)',
      'Marco de validação',
      'Atrasado',
      'Rastreabilidade',
      'Situação de cada requisito no momento da geração · 3 requisitos.',
      'Em desenvolvimento',
      'Com falha',
      'Validado',
      'REQ-1',
      'Requisito número 1 — emissão',
      '3 de 4',
      'Indicadores',
      'Geral',
      'Tarefas',
      'Rastreabilidade',
      'Progresso atual do projeto',
      'RF15',
      '55,56%',
      'Este indicador representa apenas o estado atual.',
      'Este projeto não possui integração GitHub configurada.',
      'Ajustar ação — João Ação',
      'A fazer: 2',
      'Estado desconhecido: 0',
      'Estimado: 28 h',
      'Realizado: 30,5 h',
      'Desvio: 2,5 h',
      'João Ação: 3 tarefas concluídas',
      'Requisitos com Tasks',
      '2 pontos na série'
    ])
      expect(text).toContain(expected);
    // Filtros não aplicados não viram observação, como na tela.
    expect(text).not.toContain('O filtro de Sprint não foi aplicado a este indicador.');
    // Situações sem requisitos não aparecem no resumo.
    expect(text).not.toContain('Planejado');
  });

  it('nunca mostra zero para indicador indisponível e aplica os títulos do painel', () => {
    const notes = indicatorNotes({ state: 'UNAVAILABLE', value: 0, limitations: [] });
    expect(indicatorValue({ state: 'UNAVAILABLE', value: 0 }, 'PERCENT')).toBe('—');
    expect(indicatorValue({ state: 'NO_DATA', items: [{}] })).toBe('—');
    expect(indicatorValue({ state: 'STALE', items: [{}] })).toBe('1 item');
    expect(indicatorValue({ state: 'PARTIAL', people: [{}, {}] })).toBe('2 pessoas');
    expect(notes).toEqual({ items: [], breakdown: [], limitations: [], people: [] });
    expect(percent(null)).toBe('—');
    expect(percent({ denominator: 3 })).toBe('0 de 3');
    const text = flatten(buildReportPdfDefinition(reportFixture()).content);
    expect(text).not.toContain('Cobertura por Tasks');
    expect(text).toMatch(/Cobertura de implementação\s+—\s+Indisponível/);
  });

  it('tabelas repetem legenda e cabeçalho por página e nunca cortam uma linha', () => {
    const definition = buildReportPdfDefinition(reportFixture({ requirements: 60, sprints: 3 }));
    const found = tables(definition.content).filter((table) => table.headerRows);
    expect(found.length).toBeGreaterThanOrEqual(5);
    for (const table of found) {
      expect(table.headerRows).toBe(2);
      expect(table.keepWithHeaderRows).toBe(1);
      expect(table.dontBreakRows).toBe(true);
      expect(table.body[0][0].colSpan).toBe(table.body[1].length);
    }
    const requirements = found.find((table) => table.body[0][0].text === 'Requisitos');
    expect(requirements.body).toHaveLength(62);
    // Cada Sprint é um cartão; cada parte (cabeçalho, objetivo, gráfico) é uma linha
    // indivisível, e o cartão pode continuar na página seguinte entre as partes.
    const cards = tables(definition.content).filter(
      (table) => table.dontBreakRows && table.widths?.length === 1 && table.body[0][0].stack
    );
    expect(cards).toHaveLength(3);
    expect(cards[0].body.map((row) => row[0].stack.some((node) => node.svg))).toEqual([
      false,
      false,
      true
    ]);
  });

  it('seções de rastreabilidade e indicadores começam em página nova e entram no sumário', () => {
    const { content } = buildReportPdfDefinition(reportFixture());
    const headings = content.filter((node) => node.tocItem);
    expect(headings.map((node) => [node.text, node.pageBreak])).toEqual([
      ['Planejamento', 'before'],
      ['Rastreabilidade', 'before'],
      ['Indicadores', 'before']
    ]);
    expect(content.some((node) => node.toc)).toBe(true);
  });

  it('mostra estados vazios sem inventar dados', () => {
    const report = reportFixture({ requirements: 0, sprints: 0 });
    report.snapshot.planning.milestones = [];
    report.snapshot.planning.unassignedTaskCount = null;
    report.snapshot.traceability.summary = { total: 0, bySituation: {} };
    const text = flatten(buildReportPdfDefinition({ ...report, people: undefined }).content);
    expect(text).toContain('0 Sprints e 0 marcos no recorte.');
    expect(text).toContain('Nenhuma Sprint no recorte.');
    expect(text).toContain('Nenhum requisito cadastrado.');
    expect(text).not.toContain('Marcos');
  });

  it('pessoa sem nome congelado aparece como não identificada', () => {
    const report = reportFixture();
    report.people = [];
    report.requestedBy = null;
    const text = flatten(buildReportPdfDefinition(report).content);
    expect(text).toContain('Ajustar ação — Pessoa não identificada');
    expect(text).toContain('Não informado');
  });
});

describe('S2-07 — gráfico de Burndown do PDF', () => {
  const base = reportFixture().snapshot.planning.sprints[0].progress.burndown;

  it('desenha eixos, linha ideal, restante real, corte e datas como na tela', () => {
    const chart = burndownChart(base);
    expect(chart.hasIdeal).toBe(true);
    expect(chart.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1100"/);
    expect(chart.svg).toContain('stroke-dasharray="6 6"');
    expect(chart.svg).toContain('stroke="#2859c5"');
    expect(chart.svg).toContain('>hoje</text>');
    expect(chart.svg).toContain('>01/09</text>');
    expect(chart.svg).toContain('>05/09</text>');
    expect(chart.notes).toEqual(['Restam 4 de 10 pontos. A linha ideal previa 5 para este dia.']);
  });

  it('interrompe a linha real em lacunas e congela a Sprint encerrada', () => {
    const days = [
      { date: '2026-09-01', ideal: null, remaining: 6 },
      { date: '2026-09-02', ideal: null, remaining: 5 },
      { date: '2026-09-03', ideal: null, remaining: null },
      { date: '2026-09-04', ideal: null, remaining: 3 },
      { date: '2026-09-05', ideal: null, remaining: 2 }
    ];
    const chart = burndownChart({
      ...base,
      days,
      totalPoints: null,
      frozen: true,
      cutoffDate: '2026-09-05',
      historicalState: 'PARTIAL'
    });
    expect(chart.hasIdeal).toBe(false);
    expect(chart.svg.match(/<polyline/g)).toHaveLength(2);
    expect(chart.svg).toContain('>fim</text>');
    expect(chart.notes).toEqual([
      'Sprint encerrada com 2 ponto(s) restante(s) — gráfico congelado.',
      'Histórico parcial; a referência inicial não é presumida.'
    ]);
  });

  it('com um único dia, mostra a referência como ponto', () => {
    const chart = burndownChart({
      ...base,
      cutoffDate: null,
      days: [{ date: '2026-09-01', ideal: 4, remaining: null }]
    });
    expect(chart.svg).toContain('<circle cx="570" cy="165.2" r="5" fill="#526078"/>');
    expect(chart.notes).toEqual(['Ainda não há medições de trabalho restante disponíveis.']);
  });

  it('sem dados, explica o motivo em vez de desenhar', () => {
    expect(burndownChart({ hasData: false })).toEqual({
      svg: null,
      hasIdeal: false,
      notes: [
        'Sem tarefas pontuadas nesta sprint — o burndown aparece quando houver tarefas associadas com estimativa.'
      ]
    });
    expect(
      burndownChart({ hasData: true, days: [], historicalLimitations: ['TASK_ESTIMATE_MISSING'] })
        .notes[0]
    ).toMatch(/^Dados parciais/);
    expect(
      burndownChart({
        ...base,
        historicalState: 'PARTIAL',
        historicalLimitations: ['TASK_ESTIMATE_MISSING'],
        days: [{ date: '2026-09-01', ideal: 3, remaining: null }],
        cutoffDate: null
      }).notes
    ).toEqual([
      'Dados parciais: o trabalho restante é desconhecido porque há tarefas sem estimativa.',
      'Dados parciais: há tarefas sem estimativa em parte do histórico.'
    ]);
  });

  it('escapa o texto do SVG e ignora datas inválidas', () => {
    const chart = burndownChart({
      ...base,
      chartMax: 10,
      days: [
        { date: 'nao-e-data', ideal: 1, remaining: 1 },
        { date: '2026-09-01', ideal: 10, remaining: 10 },
        { date: '2026-09-02', ideal: 0, remaining: 9 }
      ]
    });
    expect(chart.svg).not.toContain('nao-e-data');
    expect(shortDate('<script>')).toBe('');
    expect(shortDate('2026-09-02')).toBe('02/09');
  });
});
