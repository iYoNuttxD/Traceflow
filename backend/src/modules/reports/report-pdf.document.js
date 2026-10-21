import { burndownChart, CHART_COLORS } from './report-pdf.chart.js';
import {
  formatCivilDate,
  formatDateTime,
  formatMetricValue,
  formatReportPeriod,
  indicatorNotes,
  indicatorStatus,
  indicatorValue,
  pendingDefects,
  percent,
  personLabel,
  withFrozenNames
} from './report-pdf.format.js';
import {
  INDICATOR_STATE_LABELS,
  METRIC_TITLES,
  SITUATION_LABELS,
  SITUATION_TONES,
  VIEW_LABELS
} from './report-pdf.labels.js';
import {
  HEALTH_LABELS,
  HEALTH_STATUSES,
  HEALTH_TONES,
  SPRINT_SITUATIONS,
  healthCounts,
  milestoneSituation,
  progressBar,
  reportOverview,
  sprintSituation
} from './report-summary.js';

// Cores dos tokens claros do site (frontend/src/styles/tokens.css).
export const PDF_COLORS = Object.freeze({
  accent: '#2859c5',
  accentText: '#173d92',
  strong: '#0e1627',
  text: '#172033',
  secondary: '#526078',
  border: '#d9e1ed',
  surface: '#f7f9fc'
});

// `color`/`fill` dos selos e `bar` das barras, como nos tokens de feedback do site.
const TONES = Object.freeze({
  neutral: { color: '#526078', fill: '#e9eef6', bar: '#526078' },
  info: { color: '#173d92', fill: '#e9f0ff', bar: '#2859c5' },
  success: { color: '#17643b', fill: '#e8f7ef', bar: '#17643b' },
  warning: { color: '#8b4d09', fill: '#fff3dc', bar: '#8b4d09' },
  danger: { color: '#a6333f', fill: '#f6ebec', bar: '#a6333f' }
});
const BAR_TRACK = '#e9eef6';
const VALUE_BAR_TONES = Object.freeze({
  HEALTHY: 'success',
  ATTENTION: 'warning',
  CRITICAL: 'danger'
});

// A4 retrato: 595,28 pt de largura menos as margens laterais.
const PAGE_MARGINS = [40, 72, 40, 56];
const CONTENT_WIDTH = 595.28 - PAGE_MARGINS[0] - PAGE_MARGINS[2];
const CARD_PADDING = 12;
const CARD_TEXT_WIDTH = CONTENT_WIDTH - 2 * CARD_PADDING - 3;
const INDICATOR_WIDTHS = [138, 76, 74, '*'];
const NOTES_WIDTH = CONTENT_WIDTH - 138 - 76 - 74 - 4 * 12;
const LIST_INDENT = 10;

// O pdfmake não divide um bloco indivisível (linha com `dontBreakRows`) entre páginas:
// o que passa da primeira página some do arquivo sem erro. Por isso nenhum bloco
// indivisível pode passar deste orçamento, metade da área útil da página (folga para o
// cabeçalho repetido das tabelas e para erro da estimativa); texto maior continua em
// linhas seguintes. A estimativa supõe caracteres largos (0,6 em) e entrelinha de 1,4.
const PAGE_BODY_HEIGHT = 841.89 - PAGE_MARGINS[1] - PAGE_MARGINS[3];
export const BLOCK_BUDGET = PAGE_BODY_HEIGHT / 2;
const LINE_FACTOR = 1.4;
const charsPerLine = (width, fontSize) => Math.max(1, Math.floor(width / (fontSize * 0.6)));
const visualLines = (line, perLine) => Math.max(1, Math.ceil(line.length / perLine));

export function estimateTextHeight(text, width, fontSize) {
  const perLine = charsPerLine(width, fontSize);
  const lines = String(text)
    .split('\n')
    .reduce((sum, line) => sum + visualLines(line, perLine), 0);
  return lines * fontSize * LINE_FACTOR;
}

// Linha maior que um bloco inteiro é cortada no último espaço antes do limite.
function splitLongLine(line, maxChars) {
  const parts = [];
  let rest = line;
  while (rest.length > maxChars) {
    const space = rest.lastIndexOf(' ', maxChars);
    const cut = space > 0 ? space : maxChars;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(space > 0 ? cut + 1 : cut);
  }
  parts.push(rest);
  return parts;
}

// Divide o texto em pedaços que cabem no orçamento, sem perder nenhum caractere visível.
export function splitText(text, width, fontSize, budget = BLOCK_BUDGET) {
  const perLine = charsPerLine(width, fontSize);
  const maxLines = Math.max(1, Math.floor(budget / (fontSize * LINE_FACTOR)));
  const pieces = [];
  let current = [];
  let used = 0;
  for (const line of String(text).split('\n')) {
    for (const part of splitLongLine(line, perLine * maxLines)) {
      const cost = visualLines(part, perLine);
      if (current.length && used + cost > maxLines) {
        pieces.push(current.join('\n'));
        current = [];
        used = 0;
      }
      current.push(part);
      used += cost;
    }
  }
  if (current.length) pieces.push(current.join('\n'));
  return pieces;
}

// Agrupa blocos com altura estimada em pedaços dentro do orçamento, na ordem original.
function packBlocks(blocks, budget = BLOCK_BUDGET) {
  const chunks = [];
  let current = [];
  let used = 0;
  for (const block of blocks) {
    if (current.length && used + block.height > budget) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += block.height;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const tone = (name) => TONES[name] ?? TONES.neutral;

const tableLayout = Object.freeze({
  hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0.75 : 0.5),
  vLineWidth: (index, node) => (index === 0 || index === node.table.widths.length ? 0.75 : 0),
  hLineColor: () => PDF_COLORS.border,
  vLineColor: () => PDF_COLORS.border,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4
});

// Cartão com a borda esquerda na cor da situação, como na tela. Cada parte do cartão é
// uma linha da tabela, sem traço entre elas, para o cartão continuar na página seguinte.
const cardLayout = (accent) => ({
  hLineWidth: (index, node) => (index === 0 || index === node.table.body.length ? 0.75 : 0),
  vLineWidth: (index) => (index === 0 ? 3 : 0.75),
  hLineColor: () => PDF_COLORS.border,
  vLineColor: (index) => (index === 0 ? accent : PDF_COLORS.border),
  paddingLeft: () => CARD_PADDING,
  paddingRight: () => CARD_PADDING,
  paddingTop: (index) => (index === 0 ? CARD_PADDING : 0),
  paddingBottom: (index, node) => (index === node.table.body.length - 1 ? CARD_PADDING : 0)
});

function badge(label, toneName = 'neutral') {
  const { color, fill } = tone(toneName);
  return {
    width: 'auto',
    layout: 'noBorders',
    table: {
      body: [
        [{ text: label, color, fillColor: fill, bold: true, fontSize: 8, margin: [5, 1, 5, 1] }]
      ]
    }
  };
}

// Barra de progresso; o número correspondente sempre aparece em texto junto dela.
function bar(value, toneName = 'info', width = 80) {
  const filled = (Math.max(0, Math.min(100, value)) * width) / 100;
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: width, h: 4, r: 2, color: BAR_TRACK },
      ...(filled > 0
        ? [{ type: 'rect', x: 0, y: 0, w: filled, h: 4, r: 2, color: tone(toneName).bar }]
        : [])
    ],
    margin: [0, 3, 0, 0]
  };
}

// Selos lado a lado; só entram as contagens maiores que zero.
function chips(entries) {
  const visible = entries.filter(([, count]) => count > 0);
  if (!visible.length) return { text: '—', style: 'help' };
  return {
    columns: visible.map(([, count, label, toneName]) => badge(`${label}: ${count}`, toneName)),
    columnGap: 4
  };
}

const healthEntries = (counts) =>
  HEALTH_STATUSES.map((status) => [
    status,
    counts[status],
    HEALTH_LABELS[status],
    HEALTH_TONES[status]
  ]);

function metaGrid(entries, columns = 3) {
  const cells = entries.map(([label, value, extra]) => ({
    stack: [
      { text: label, style: 'metaLabel' },
      { text: value, style: 'metaValue' },
      ...(extra ? [extra] : [])
    ],
    margin: [0, 0, 8, 8]
  }));
  const rows = [];
  for (let index = 0; index < cells.length; index += columns) {
    const row = cells.slice(index, index + columns);
    while (row.length < columns) row.push({ text: '' });
    rows.push(row);
  }
  return {
    layout: 'noBorders',
    table: { widths: Array(columns).fill('*'), body: rows }
  };
}

// Tabela com legenda e cabeçalho repetidos em cada página; linhas nunca se dividem
// (quem monta as linhas mantém cada uma dentro de BLOCK_BUDGET).
function dataTable({ caption, columns, rows, widths }) {
  return {
    layout: tableLayout,
    margin: [0, 0, 0, 14],
    table: {
      widths,
      headerRows: 2,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      body: [
        [
          {
            ...(typeof caption === 'string' ? { text: caption } : caption),
            style: 'caption',
            colSpan: columns.length
          },
          ...columns.slice(1).map(() => ({}))
        ],
        columns.map((column) => ({ text: column, style: 'tableHeader' })),
        ...rows
      ]
    }
  };
}

function sectionHeading(id, title, summary, { pageBreak } = {}) {
  return [
    { text: title, id, style: 'h1', tocItem: true, ...(pageBreak ? { pageBreak } : {}) },
    ...(summary ? [{ text: summary, style: 'lead' }] : [])
  ];
}

function legend(hasIdeal) {
  const swatch = (color, dashed) => ({
    width: 18,
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 5,
        x2: 16,
        y2: 5,
        lineWidth: 2,
        lineColor: color,
        ...(dashed ? { dash: { length: 3, space: 2 } } : {})
      }
    ]
  });
  return {
    columns: [
      swatch(CHART_COLORS.real),
      { text: 'Restante real', width: 'auto', style: 'help' },
      ...(hasIdeal
        ? [
            { text: '', width: 12 },
            swatch(CHART_COLORS.ideal, true),
            { text: 'Linha ideal', width: 'auto', style: 'help' }
          ]
        : [])
    ],
    columnGap: 2,
    margin: [0, 0, 0, 4]
  };
}

// Resumo do topo: os mesmos quatro números e contagens da tela, com barras e selos.
function overviewSection(snapshot) {
  const overview = reportOverview(snapshot);
  const healthTone = overview.health ? HEALTH_TONES[overview.health.status] : 'neutral';
  const tile = (label, value, extras) => ({
    stack: [{ text: label, style: 'metaLabel' }, { text: value, style: 'tileValue' }, ...extras]
  });
  const progress =
    overview.progress == null ? null : progressBar({ percentage: overview.progress });
  const requirements = progressBar(overview.requirements);
  const tiles = [
    tile(
      'Progresso do projeto',
      overview.progress == null ? '—' : formatMetricValue(overview.progress, 'PERCENT'),
      progress ? [bar(progress.value, progress.tone, 100)] : []
    ),
    tile(
      'Requisitos concluídos',
      overview.requirements.total
        ? `${overview.requirements.done} de ${overview.requirements.total}`
        : '—',
      requirements ? [bar(requirements.value, requirements.tone, 100)] : []
    ),
    tile(
      'Saúde do projeto',
      overview.health?.score != null ? `${overview.health.score} / 100` : '—',
      overview.health
        ? [
            badge(HEALTH_LABELS[overview.health.status] ?? 'Dados insuficientes', healthTone),
            ...(overview.health.score != null ? [bar(overview.health.score, healthTone, 100)] : [])
          ]
        : []
    ),
    tile(
      'Defeitos pendentes',
      overview.pendingDefects == null ? '—' : String(overview.pendingDefects),
      overview.pendingDefects == null
        ? []
        : [
            badge(
              overview.pendingDefects ? 'Em aberto' : 'Nenhum',
              overview.pendingDefects ? 'danger' : 'success'
            )
          ]
    )
  ];
  return [
    {
      layout: {
        ...tableLayout,
        vLineWidth: () => 0.75,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 8,
        paddingBottom: () => 8
      },
      margin: [0, 0, 0, 10],
      table: { widths: ['*', '*', '*', '*'], dontBreakRows: true, body: [tiles] }
    },
    { text: 'Sprints', style: 'h4' },
    chips(
      Object.entries(SPRINT_SITUATIONS).map(([key, [label, toneName]]) => [
        key,
        overview.sprints[key],
        label,
        toneName
      ])
    ),
    { text: 'Status dos indicadores', style: 'h4', margin: [0, 8, 0, 4] },
    chips(healthEntries(overview.indicators)),
    { text: '', margin: [0, 0, 0, 14] }
  ];
}

function sprintCard(sprint, generatedAt) {
  const chart = sprint.progress?.burndown ? burndownChart(sprint.progress.burndown) : null;
  const situation = sprintSituation(sprint, generatedAt);
  const progress = progressBar(sprint.progress?.current);
  const head = [
    {
      columns: [
        { text: sprint.name, style: 'h3', width: '*' },
        badge(situation.label, situation.tone)
      ],
      columnGap: 8,
      margin: [0, 0, 0, 8]
    },
    metaGrid(
      [
        ['Período', `${formatCivilDate(sprint.startDate)} a ${formatCivilDate(sprint.endDate)}`],
        ['Marco', sprint.milestone?.title ?? 'Sem marco'],
        [
          'Tarefas concluídas',
          percent(sprint.progress?.current),
          progress && bar(progress.value, progress.tone, 90)
        ],
        ['Tarefas na Sprint', String(sprint.taskCount ?? '—')]
      ],
      4
    )
  ];
  // Objetivo longo segue em partes; o gráfico (altura fixa) fica inteiro numa parte só.
  const pieces = sprint.objective ? splitText(sprint.objective, CARD_TEXT_WIDTH, 8) : [];
  const objective = pieces.map((piece, index) => [
    { text: piece, style: 'help', margin: [0, 0, 0, index === pieces.length - 1 ? 8 : 0] }
  ]);
  const burndown = [];
  if (chart?.svg)
    burndown.push({ text: 'Burndown', style: 'h4' }, legend(chart.hasIdeal), {
      svg: chart.svg,
      width: CONTENT_WIDTH - 2 * CARD_PADDING,
      margin: [0, 0, 0, 4]
    });
  for (const note of chart?.notes ?? []) burndown.push({ text: note, style: 'help' });
  const parts = [head, ...objective, ...(burndown.length ? [burndown] : [])];
  return {
    layout: cardLayout(situation.tone === 'neutral' ? PDF_COLORS.border : tone(situation.tone).bar),
    margin: [0, 0, 0, 12],
    table: {
      widths: ['*'],
      dontBreakRows: true,
      body: parts.map((stack) => [{ stack }])
    }
  };
}

function planningSection(planning, generatedAt) {
  const summary = `${plural(planning.sprints.length, 'Sprint', 'Sprints')} e ${plural(
    planning.milestones.length,
    'marco',
    'marcos'
  )} no recorte${
    planning.unassignedTaskCount != null
      ? ` · ${plural(planning.unassignedTaskCount, 'tarefa', 'tarefas')} fora de Sprint`
      : ''
  }.`;
  const content = sectionHeading('report-planning', 'Planejamento', summary, {
    pageBreak: 'before'
  });
  if (!planning.sprints.length)
    content.push({ text: 'Nenhuma Sprint no recorte.', style: 'empty' });
  else content.push(...planning.sprints.map((sprint) => sprintCard(sprint, generatedAt)));
  return content;
}

function milestonesTable(planning, timeZone) {
  if (!planning.milestones.length) return [];
  return [
    dataTable({
      caption: 'Marcos',
      columns: ['Marco', 'Prazo', 'Situação', 'Sprints no recorte'],
      widths: ['*', 90, 90, 80],
      rows: planning.milestones.map((milestone) => {
        const situation = milestoneSituation(milestone);
        return [
          { text: milestone.title, bold: true },
          formatDateTime(milestone.dueDate, timeZone),
          badge(situation.label, situation.tone),
          String(milestone.sprintCount ?? 0)
        ];
      })
    })
  ];
}

function situationBadge(value) {
  return badge(SITUATION_LABELS[value] ?? 'Situação indisponível', SITUATION_TONES[value]);
}

function traceabilitySection(traceability) {
  const total = traceability.summary?.total ?? traceability.items.length;
  const content = sectionHeading(
    'report-traceability',
    'Rastreabilidade',
    `Situação de cada requisito no momento da geração · ${plural(total, 'requisito', 'requisitos')}.`,
    { pageBreak: 'before' }
  );
  const counts = Object.entries(traceability.summary?.bySituation ?? {}).filter(
    ([, count]) => count > 0
  );
  if (counts.length) {
    const rows = [];
    for (let index = 0; index < counts.length; index += 2) {
      const row = counts
        .slice(index, index + 2)
        .flatMap(([situation, count]) => [
          situationBadge(situation),
          { text: String(count), bold: true }
        ]);
      while (row.length < 4) row.push({ text: '' });
      rows.push(row);
    }
    content.push(
      dataTable({
        caption: 'Requisitos por situação',
        columns: ['Situação', 'Quantidade', 'Situação', 'Quantidade'],
        widths: ['*', 60, '*', 60],
        rows
      })
    );
  }
  if (!traceability.items.length) {
    content.push({ text: 'Nenhum requisito cadastrado.', style: 'empty' });
    return content;
  }
  content.push(
    dataTable({
      caption: 'Requisitos',
      columns: ['Requisito', 'Situação', 'Progresso', 'Testes aprovados', 'Defeitos pendentes'],
      widths: ['*', 96, 72, 56, 56],
      rows: traceability.items.map((item) => {
        const progress = progressBar(item.progress);
        const pending = pendingDefects(item.defects);
        return [
          {
            text: [
              { text: `${item.requirement.displayId} `, style: 'idLabel' },
              item.requirement.title
            ]
          },
          situationBadge(item.situation),
          {
            stack: [
              { text: percent(item.progress) },
              ...(progress ? [bar(progress.value, progress.tone, 60)] : [])
            ]
          },
          item.validation?.testCasesTotal
            ? `${item.validation.pass} de ${item.validation.testCasesTotal}`
            : '—',
          pending ? badge(String(pending), 'danger') : '0'
        ];
      })
    })
  );
  return content;
}

// Observações em pedaços dentro de BLOCK_BUDGET: a lista de pessoas não tem limite.
// Itens consecutivos do mesmo grupo voltam a formar uma única lista em cada pedaço.
function notesCells(indicator, status) {
  const notes = indicatorNotes(indicator);
  const blocks = [];
  if (status.reason || status.reference)
    blocks.push({
      height:
        estimateTextHeight(`${status.reason ?? ''} ${status.reference ?? ''}`, NOTES_WIDTH, 8) + 2,
      node: {
        text: [
          ...(status.reason ? [{ text: status.reason }] : []),
          ...(status.reason && status.reference ? [' '] : []),
          ...(status.reference ? [{ text: status.reference, color: PDF_COLORS.secondary }] : [])
        ],
        margin: [0, 0, 0, 2]
      }
    });
  const lists = [
    ['items', notes.items, {}],
    ['breakdown', notes.breakdown, {}],
    ['limitations', notes.limitations, { color: PDF_COLORS.secondary, fontSize: 7.5 }],
    ['people', notes.people, {}]
  ];
  for (const [group, items, style] of lists)
    for (const item of items)
      blocks.push({
        group,
        style,
        item,
        height: estimateTextHeight(item, NOTES_WIDTH - LIST_INDENT, style.fontSize ?? 8)
      });
  if (!blocks.length) return [{ text: '—' }];
  return packBlocks(blocks).map((chunk) => {
    const stack = [];
    for (const block of chunk) {
      if (block.node) stack.push(block.node);
      else if (stack.at(-1)?.group === block.group) stack.at(-1).ul.push(block.item);
      else stack.push({ ul: [block.item], ...block.style, group: block.group });
    }
    return { stack: stack.map(({ group: _group, ...node }) => node), fontSize: 8 };
  });
}

function indicatorRows(indicator, definition) {
  const title = METRIC_TITLES[indicator.metricId] ?? definition?.title ?? indicator.metricId;
  const status = indicatorStatus(indicator);
  const value = indicatorValue(indicator, definition?.unit);
  const progress =
    definition?.unit === 'PERCENT' && value !== '—'
      ? progressBar({ percentage: indicator.value })
      : null;
  const [notes, ...continued] = notesCells(indicator, status);
  const first = [
    {
      text: [
        { text: title, bold: true },
        ...(definition?.rf ? [{ text: ` ${definition.rf}`, style: 'idLabel' }] : [])
      ]
    },
    {
      stack: [
        { text: value, bold: true },
        ...(progress ? [bar(progress.value, VALUE_BAR_TONES[status.status] ?? 'info', 62)] : []),
        ...(indicator.state !== 'AVAILABLE'
          ? [
              {
                text: INDICATOR_STATE_LABELS[indicator.state] ?? 'Estado desconhecido',
                style: 'help',
                margin: [0, 2, 0, 0]
              }
            ]
          : [])
      ]
    },
    badge(status.label, status.tone),
    notes
  ];
  // Continuação: o nome do indicador se repete para a observação não perder a associação.
  return [
    first,
    ...continued.map((cell) => [
      {
        text: [
          { text: title, bold: true },
          { text: ' (continuação)', style: 'help' }
        ]
      },
      { text: '' },
      { text: '' },
      cell
    ])
  ];
}

function indicatorsSection(indicators) {
  const catalog = new Map(indicators.catalog.map((entry) => [entry.metricId, entry]));
  const content = sectionHeading(
    'report-indicators',
    'Indicadores',
    'Os mesmos valores do painel de Indicadores para o recorte do relatório. O status segue a avaliação da Saúde do Projeto: verde está saudável, amarelo pede atenção e vermelho é crítico.',
    { pageBreak: 'before' }
  );
  for (const view of indicators.views) {
    const rows = view.sections.flatMap((section) => section.indicators);
    const counts = healthEntries(healthCounts([view])).filter(
      ([status, count]) => status !== 'NEUTRAL' && count > 0
    );
    content.push(
      dataTable({
        caption: {
          text: [
            VIEW_LABELS[view.view] ?? view.view,
            ...counts.flatMap(([, count, label, toneName], index) => [
              { text: index ? '  ·  ' : '     ', color: PDF_COLORS.secondary },
              { text: `${label}: ${count}`, color: tone(toneName).color, fontSize: 8 }
            ])
          ]
        },
        columns: ['Indicador', 'Valor', 'Status', 'Observações'],
        widths: INDICATOR_WIDTHS,
        rows: rows.flatMap((indicator) => indicatorRows(indicator, catalog.get(indicator.metricId)))
      })
    );
  }
  return content;
}

// Monta a definição do pdfmake a partir do relatório já persistido. Não consulta
// nada: o mesmo relatório sempre gera o mesmo conteúdo.
export function buildReportPdfDefinition(report, { timeZone = 'UTC' } = {}) {
  const snapshot = withFrozenNames(
    report.snapshot,
    new Map((report.people ?? []).map((person) => [person.userId, person]))
  );
  const zone = snapshot.filters?.timeZone ?? timeZone;
  const projectName = snapshot.project?.name ?? 'Projeto';
  const period = formatReportPeriod(snapshot.filters);
  const generatedAt = `${formatDateTime(snapshot.generatedAt, zone)} (${zone})`;

  return {
    info: {
      title: `Relatório #${report.id} — ${projectName}`,
      author: 'TraceFlow',
      subject: `Relatório do projeto · ${period}`,
      creator: 'TraceFlow',
      producer: 'TraceFlow'
    },
    pageSize: 'A4',
    pageMargins: PAGE_MARGINS,
    header: () => ({
      margin: [PAGE_MARGINS[0], 28, PAGE_MARGINS[2], 0],
      stack: [
        {
          columns: [
            {
              width: '*',
              text: [
                { text: 'TraceFlow', bold: true, color: PDF_COLORS.accent },
                { text: `  ·  ${projectName}`, color: PDF_COLORS.text }
              ]
            },
            { width: 'auto', text: `Período: ${period}`, color: PDF_COLORS.secondary }
          ],
          columnGap: 12,
          fontSize: 8.5
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 6,
              x2: CONTENT_WIDTH,
              y2: 6,
              lineWidth: 0.75,
              lineColor: PDF_COLORS.border
            }
          ]
        }
      ]
    }),
    footer: (currentPage, pageCount) => ({
      margin: [PAGE_MARGINS[0], 20, PAGE_MARGINS[2], 0],
      columns: [
        { width: '*', text: `Relatório #${report.id} · Gerado em ${generatedAt}` },
        { width: 'auto', text: `Página ${currentPage} de ${pageCount}` }
      ],
      columnGap: 12,
      fontSize: 8,
      color: PDF_COLORS.secondary
    }),
    content: [
      { text: `RELATÓRIO #${report.id}`, style: 'eyebrow' },
      { text: projectName, style: 'title' },
      metaGrid([
        ['Período', period],
        ['Fuso horário', zone],
        ['Sprint', snapshot.filters?.sprint?.name ?? 'Todas do recorte'],
        ['Gerado em', generatedAt],
        ['Solicitado por', personLabel(report.requestedBy)]
      ]),
      {
        text: 'Retrato congelado no momento da geração: alterações posteriores no projeto não mudam este relatório.',
        style: 'help',
        margin: [0, 0, 0, 12]
      },
      ...overviewSection(snapshot),
      {
        toc: { title: { text: 'Sumário', style: 'h2' } },
        margin: [0, 0, 0, 20]
      },
      ...planningSection(snapshot.planning, snapshot.generatedAt),
      ...milestonesTable(snapshot.planning, zone),
      ...traceabilitySection(snapshot.traceability),
      ...indicatorsSection(snapshot.indicators)
    ],
    defaultStyle: { font: 'Roboto', fontSize: 9, color: PDF_COLORS.text, lineHeight: 1.15 },
    styles: {
      eyebrow: {
        fontSize: 8,
        bold: true,
        color: PDF_COLORS.accent,
        margin: [0, 0, 0, 4]
      },
      title: { fontSize: 20, bold: true, color: PDF_COLORS.strong, margin: [0, 0, 0, 14] },
      h1: { fontSize: 15, bold: true, color: PDF_COLORS.strong, margin: [0, 4, 0, 4] },
      h2: { fontSize: 12, bold: true, color: PDF_COLORS.strong, margin: [0, 0, 0, 6] },
      h3: { fontSize: 11, bold: true, color: PDF_COLORS.strong },
      h4: { fontSize: 9.5, bold: true, color: PDF_COLORS.strong, margin: [0, 4, 0, 4] },
      lead: { color: PDF_COLORS.secondary, margin: [0, 0, 0, 12] },
      help: { fontSize: 8, color: PDF_COLORS.secondary },
      empty: { color: PDF_COLORS.secondary, margin: [0, 0, 0, 12] },
      metaLabel: { fontSize: 7.5, color: PDF_COLORS.secondary, margin: [0, 0, 0, 2] },
      metaValue: { bold: true, color: PDF_COLORS.text },
      tileValue: { fontSize: 14, bold: true, color: PDF_COLORS.strong, margin: [0, 0, 0, 4] },
      caption: { fontSize: 10, bold: true, color: PDF_COLORS.strong, margin: [0, 2, 0, 2] },
      tableHeader: {
        fontSize: 7.5,
        bold: true,
        color: PDF_COLORS.secondary,
        fillColor: PDF_COLORS.surface
      },
      idLabel: { fontSize: 7.5, bold: true, color: PDF_COLORS.secondary }
    }
  };
}
