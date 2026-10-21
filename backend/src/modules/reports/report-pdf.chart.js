import { shortDate } from './report-pdf.format.js';

// Burndown do PDF: mesma geometria e mesmas regras do SprintBurndownChart do
// Cronograma, com as cores dos tokens do site escritas por extenso (não há CSS no PDF).
const VIEW_WIDTH = 1100;
const VIEW_HEIGHT = 300;
const LEFT = 60;
const RIGHT = 1080;
const TOP = 26;
const BASE = 258;
const FONT = 13;
const CUT_FONT = 12;
const CUT_Y = 18;
const MARKS_Y = 284;
const RADIUS = 5;

export const CHART_COLORS = Object.freeze({
  axis: '#d9e1ed',
  text: '#526078',
  ideal: '#526078',
  real: '#2859c5'
});

const round = (value) => Math.round(value * 10) / 10;
const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const escapeXml = (value) =>
  String(value).replace(
    /[<>&'"]/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]
  );

function text(x, y, value, { size = FONT, anchor = 'middle' } = {}) {
  return `<text x="${x}" y="${y}" fill="${CHART_COLORS.text}" font-family="Roboto" font-size="${size}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

// Devolve o SVG (ou null quando não há o que desenhar) e as mesmas notas da tela.
export function burndownChart(burndown) {
  const days = Array.isArray(burndown?.days)
    ? burndown.days.filter((day) => !Number.isNaN(Date.parse(day.date)))
    : [];
  const scaleValues = days.flatMap((day) => [day.remaining, day.ideal]).filter(finite);
  const chartMax = Math.max(
    0,
    ...(finite(burndown?.chartMax) ? [burndown.chartMax] : []),
    ...scaleValues
  );
  const limitations = burndown?.historicalLimitations ?? [];
  const estimateMissing = limitations.some((code) =>
    ['TASK_ESTIMATE_MISSING', 'BURNUP_ESTIMATE_UNKNOWN'].includes(code)
  );
  if (!burndown?.hasData || chartMax <= 0 || !scaleValues.length) {
    return {
      svg: null,
      hasIdeal: false,
      notes: [
        estimateMissing || burndown?.historicalState === 'PARTIAL'
          ? 'Dados parciais. Não é possível calcular completamente o Burndown porque parte das tarefas não possui estimativa ou o histórico está incompleto.'
          : 'Sem tarefas pontuadas nesta sprint — o burndown aparece quando houver tarefas associadas com estimativa.'
      ]
    };
  }

  const { totalPoints, frozen, cutoffDate } = burndown;
  const baselineKnown = finite(totalPoints);
  const last = days.length - 1;
  const x = (index) =>
    last === 0 ? round((LEFT + RIGHT) / 2) : round(LEFT + (index * (RIGHT - LEFT)) / last);
  const y = (value) => round(TOP + (1 - value / chartMax) * (BASE - TOP));

  const ideals = days.map((day, index) => ({ ...day, index })).filter((day) => finite(day.ideal));
  const measured = days
    .map((day, index) => ({ ...day, index }))
    .filter((day) => finite(day.remaining));
  const segments = [];
  for (const day of measured) {
    if (!segments.length || day.index !== segments.at(-1).at(-1).index + 1) segments.push([]);
    segments.at(-1).push(day);
  }
  const tip = measured.at(-1) ?? null;
  const cutIndex = cutoffDate ? days.findIndex((day) => day.date === cutoffDate) : -1;
  const marks = [...new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last])];

  const remaining = tip ? tip.remaining : totalPoints;
  const expected = tip ? days[tip.index].ideal : totalPoints;
  const note = frozen
    ? `Sprint encerrada com ${remaining}${baselineKnown ? ` de ${totalPoints}` : ''} ponto(s) restante(s) — gráfico congelado.`
    : tip
      ? `Restam ${remaining}${baselineKnown ? ` de ${totalPoints}` : ''} pontos.${finite(expected) ? ` A linha ideal previa ${expected} para este dia.` : ' A referência inicial está indisponível.'}`
      : estimateMissing
        ? 'Dados parciais: o trabalho restante é desconhecido porque há tarefas sem estimativa.'
        : 'Ainda não há medições de trabalho restante disponíveis.';

  const parts = [
    `<line x1="${LEFT}" y1="${TOP}" x2="${LEFT}" y2="${BASE}" stroke="${CHART_COLORS.axis}" stroke-width="1.5"/>`,
    `<line x1="${LEFT}" y1="${BASE}" x2="${RIGHT}" y2="${BASE}" stroke="${CHART_COLORS.axis}" stroke-width="1.5"/>`,
    text(LEFT - 6, TOP + 5, chartMax, { anchor: 'end' }),
    text(LEFT - 6, BASE + 4, 0, { anchor: 'end' })
  ];
  if (cutIndex >= 0)
    parts.push(
      `<line x1="${x(cutIndex)}" y1="${TOP}" x2="${x(cutIndex)}" y2="${BASE}" stroke="${CHART_COLORS.ideal}" stroke-width="1" stroke-dasharray="3 4"/>`,
      text(x(cutIndex), CUT_Y, frozen ? 'fim' : 'hoje', { size: CUT_FONT })
    );
  if (ideals.length)
    parts.push(
      last === 0
        ? `<circle cx="${x(0)}" cy="${y(ideals[0].ideal)}" r="${RADIUS}" fill="${CHART_COLORS.ideal}"/>`
        : `<polyline points="${ideals.map((day) => `${x(day.index)},${y(day.ideal)}`).join(' ')}" fill="none" stroke="${CHART_COLORS.ideal}" stroke-width="2" stroke-dasharray="6 6"/>`
    );
  for (const segment of segments.filter((item) => item.length > 1))
    parts.push(
      `<polyline points="${segment.map((day) => `${x(day.index)},${y(day.remaining)}`).join(' ')}" fill="none" stroke="${CHART_COLORS.real}" stroke-width="2.5"/>`
    );
  if (tip)
    parts.push(
      `<circle cx="${x(tip.index)}" cy="${y(tip.remaining)}" r="${RADIUS}" fill="${CHART_COLORS.real}"/>`
    );
  for (const index of marks)
    parts.push(
      text(x(index), MARKS_Y, shortDate(days[index].date), {
        anchor: index === 0 ? 'start' : index === last ? 'end' : 'middle'
      })
    );

  const notes = [note];
  if (burndown.historicalState === 'PARTIAL')
    notes.push(
      estimateMissing
        ? 'Dados parciais: há tarefas sem estimativa em parte do histórico.'
        : 'Histórico parcial; a referência inicial não é presumida.'
    );
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}">${parts.join('')}</svg>`,
    hasIdeal: ideals.length > 0,
    notes
  };
}
