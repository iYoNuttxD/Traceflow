import pdfmake from 'pdfmake';
import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_BUDGET,
  estimateTextHeight,
  splitText
} from '../../src/modules/reports/report-pdf.document.js';
import { renderReportPdf } from '../../src/modules/reports/report-pdf.renderer.js';
import { renderReportPdfInWorker } from '../../src/modules/reports/report-pdf.runner.js';
import { reportFixture } from '../fixtures/report-snapshot.js';

async function pages(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { totalPages, text: text.map((page) => page.replace(/\s+/g, ' ')) };
}

describe('S2-07 — PDF renderizado', () => {
  it('gera PDF com acentuação legível e identificação em todas as páginas', async () => {
    const buffer = await renderReportPdf(reportFixture({ requirements: 120 }));
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const { totalPages, text } = await pages(buffer);
    expect(totalPages).toBeGreaterThan(3);
    text.forEach((page, index) => {
      expect(page).toContain('TraceFlow · Projeto Ação & Validação');
      expect(page).toContain('Período: 01/09/2026 a 30/09/2026');
      expect(page).toContain('Relatório #42 · Gerado em');
      expect(page).toContain(`Página ${index + 1} de ${totalPages}`);
    });
    const all = text.join(' ');
    for (const expected of [
      'RELATÓRIO #42',
      'Entregar relatórios com acentuação: ção, ã, é, ü.',
      'Situação de cada requisito no momento da geração',
      'Requisito número 120 — emissão',
      'Progresso atual do projeto',
      '55,56%',
      'Ajustar ação — João Ação'
    ])
      expect(all).toContain(expected);
    // A tabela de requisitos continua em outras páginas com o cabeçalho repetido.
    expect(text.filter((page) => page.includes('Requisito Situação Progresso')).length).toBe(
      text.filter((page) => page.includes('REQ-')).length
    );
    expect(text.filter((page) => page.includes('REQ-')).length).toBeGreaterThan(1);
  });

  it('o mesmo relatório sempre produz o mesmo conteúdo', async () => {
    const first = await pages(await renderReportPdf(reportFixture()));
    const second = await pages(await renderReportPdf(reportFixture()));
    expect(second.text).toEqual(first.text);
  });

  it('não acessa rede nem arquivos locais além das fontes', async () => {
    await renderReportPdf(reportFixture());
    const tryResource = (image) =>
      pdfmake.createPdf({ content: [{ image, width: 10 }] }).getBuffer();
    await expect(tryResource('https://example.invalid/logo.png')).rejects.toThrow();
    await expect(tryResource('package.json')).rejects.toThrow(/denied by resource access policy/);
  });

  it('na worker thread devolve o mesmo PDF, respeita o limite de concorrência e o prazo', async () => {
    const report = reportFixture();
    const inWorker = await pages(await renderReportPdfInWorker(report, {}));
    const inline = await pages(await renderReportPdf(report, {}));
    expect(inWorker.text).toEqual(inline.text);

    await expect(renderReportPdfInWorker(report, {}, { maxConcurrent: 0 })).rejects.toMatchObject({
      code: 'REPORT_PDF_BUSY',
      statusCode: 503
    });
    await expect(renderReportPdfInWorker(report, {}, { timeoutMs: 1 })).rejects.toMatchObject({
      code: 'REPORT_PDF_TIMEOUT'
    });
    // Um erro dentro da worker volta como falha, sem derrubar o processo.
    await expect(renderReportPdfInWorker({ id: 1 }, {})).rejects.toThrow();
    // Dados que não podem ser copiados para a worker falham antes de criá-la e liberam a vaga.
    await expect(
      renderReportPdfInWorker({ id: 1, invalid: () => {} }, {}, { maxConcurrent: 1 })
    ).rejects.toThrow();
    expect(await renderReportPdfInWorker(report, {}, { maxConcurrent: 1 })).toBeInstanceOf(Buffer);
  });

  it('ignora mensagens que não são o PDF, como os avisos do node --watch', async () => {
    const fixture = (name) => new URL(`../fixtures/report-pdf-workers/${name}`, import.meta.url);
    const pdf = await renderReportPdfInWorker(
      {},
      {},
      { workerUrl: fixture('foreign-message-first.worker.js') }
    );
    expect(pdf.toString('latin1')).toBe('%PDF-1.7 teste');
    // Envelope com conteúdo inválido vira falha da exportação, sem exceção solta no evento.
    await expect(
      renderReportPdfInWorker({}, {}, { workerUrl: fixture('invalid-result.worker.js') })
    ).rejects.toThrow('resultado inválido');
    expect(await renderReportPdfInWorker(reportFixture(), {})).toBeInstanceOf(Buffer);
  });
});
// PR27-02: um bloco indivisível maior que a página sumia do PDF sem erro. Conteúdo no
// limite aceito pela API precisa aparecer inteiro, com cabeçalhos e associação.
describe('S2-07 — conteúdo maior que uma página', () => {
  const markers = (text, prefix) =>
    new Set([...text.join(' ').matchAll(new RegExp(`${prefix}(\\d+)`, 'g'))].map((m) => m[1]));

  function withObjective(objective, sprints = 1) {
    const report = reportFixture({ sprints });
    for (const sprint of report.snapshot.planning.sprints) sprint.objective = objective;
    return report;
  }

  it('objetivo de Sprint com muitas linhas continua na página seguinte, sem perder a Sprint', async () => {
    const objective = Array.from({ length: 120 }, (_, index) => `ObjectiveLine${index}`).join('\n');
    expect(objective.length).toBeLessThanOrEqual(2000);
    const { totalPages, text } = await pages(await renderReportPdf(withObjective(objective)));
    const all = text.join(' ');
    expect(all).toContain('Sprint 1 — Integração');
    expect(all).toContain('Burndown');
    expect(markers(text, 'ObjectiveLine').size).toBe(120);
    expect(all).toContain('ObjectiveLine0');
    expect(all).toContain('ObjectiveLine119');
    const objectivePages = text.filter((page) => page.includes('ObjectiveLine'));
    expect(objectivePages.length).toBeGreaterThan(1);
    // Cabeçalho e rodapé continuam em todas as páginas.
    text.forEach((page, index) => expect(page).toContain(`Página ${index + 1} de ${totalPages}`));
  });

  it('objetivo de 2.000 caracteres sem quebra de linha aparece do início ao fim', async () => {
    const words = Array.from({ length: 400 }, (_, index) => `W${String(index).padStart(3, '0')}`);
    const objective = words.join(' ').slice(0, 2000);
    const report = withObjective(objective, 3);
    const { text } = await pages(await renderReportPdf(report));
    const all = text.join(' ');
    for (const sprint of [1, 2, 3]) expect(all).toContain(`Sprint ${sprint} — Integração`);
    expect(markers(text, 'W').size).toBe(400);
  });

  it('lista de pessoas maior que a página segue em linhas de continuação do indicador', async () => {
    const report = reportFixture();
    const people = Array.from({ length: 80 }, (_, index) => ({
      userId: 100 + index,
      displayName: `PersonMarker${index}`,
      username: `p${index}`
    }));
    report.people.push(...people);
    const i03 = report.snapshot.indicators.views[1].sections[0].indicators[2];
    i03.people = people.map(({ userId }) => ({ userId, completedTasks: 1 }));
    const { text } = await pages(await renderReportPdf(report));
    expect(markers(text, 'PersonMarker').size).toBe(80);
    const all = text.join(' ');
    expect(all).toContain('Tasks concluídas por responsável (continuação)');
    // Toda página com pessoas da lista repete o cabeçalho da tabela de indicadores.
    for (const page of text.filter((item) => item.includes('PersonMarker')))
      expect(page).toContain('Indicador Valor Status Observações');
    // O que vem depois da tabela continua no PDF.
    expect(all).toContain('Requisitos com Tasks');
  });
});

describe('S2-07 — divisão de texto do PDF', () => {
  it('pedaços cabem no orçamento e, juntos, guardam todo o texto visível', () => {
    const text = [
      'curta',
      'x'.repeat(5000),
      Array.from({ length: 300 }, (_, i) => `palavra${i}`).join(' ')
    ].join('\n');
    const pieces = splitText(text, 300, 8);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces)
      expect(estimateTextHeight(piece, 300, 8)).toBeLessThanOrEqual(BLOCK_BUDGET);
    const visible = (value) => value.replace(/\s+/g, '');
    expect(visible(pieces.join(''))).toBe(visible(text));
  });
});
