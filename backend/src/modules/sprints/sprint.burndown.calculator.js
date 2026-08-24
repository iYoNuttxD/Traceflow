// Burndown da sprint (RF35). Funcao pura: sem Prisma, sem Express, sem I/O.
// O instante de corte e SEMPRE injetado por parametro; nunca chamar new Date()
// aqui dentro, pela mesma razao de sprint.calculator.js — o resultado precisa ser
// identico em qualquer fuso e reproduzivel entre execucoes.
//
// A serie tem duas linhas:
//
//   ideal    — reta de `totalPoints` no primeiro dia a zero no ultimo. E o
//              planejamento, nao uma previsao: ela nao reage ao que aconteceu.
//   remaining — pontos que ainda faltavam ao FIM de cada dia.
//
// `remaining` e `null` para os dias posteriores ao corte. Zero e nulo sao
// estados diferentes: "nao sobrou nada" nao e "esse dia ainda nao chegou", e
// desenhar a linha real ate o fim da janela afirmaria um futuro que ninguem
// mediu.
//
// A janela e semiaberta `[startDate, endDate)` (ADR-010 D03) e os dias sao de
// calendario em UTC, a mesma convencao de D15. O ultimo dia da serie e o dia
// anterior a `endDate`: o dia do fim ja pertence a sprint seguinte.

const MS_PER_DAY = 86400000;
const CONCLUIDO = 'CONCLUIDO';
const TERMINAL = ['CONCLUIDA', 'CANCELADA'];
// Uma sprint longa nao deve virar uma serie que nenhuma tela desenha nem nenhum
// payload carrega. O limite e generoso — 180 dias de sprint ja e sintoma de outro
// problema — e serve so como teto de seguranca.
const MAX_DAYS = 180;

function toUtcDay(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function toInstant(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

const iso = (day) => new Date(day).toISOString().slice(0, 10);

// Dias de calendario cobertos pela janela. `endDate` e exclusivo, entao um fim em
// 21/08 00:00 nao gera o dia 21. Uma sprint que termina 21/08 as 18h gera, porque
// aquele dia teve trabalho.
function enumerateDays(startDate, endDate) {
  const first = toUtcDay(startDate);
  const end = toInstant(endDate);
  if (first === null || end === null) return [];
  const days = [];
  for (let day = first; day < end && days.length < MAX_DAYS; day += MS_PER_DAY) {
    days.push(day);
  }
  return days;
}

// Status que vale PARA ESTA SPRINT, na mesma definicao do calculador de evolucao:
// `exitStatus` congela o que foi observado aqui, e so na falta dele o status
// atual entra.
const effectiveStatus = (participation) => participation.exitStatus ?? participation.currentStatus;

// Instante em que a tarefa deixou de pesar NESTA sprint.
//
// `completedAt` e a primeira conclusao registrada DENTRO do intervalo da
// participacao — o service ja faz esse recorte, porque uma conclusao ocorrida
// enquanto a tarefa estava em outra sprint nao queimou escopo desta.
//
// Sem evento e com status efetivo concluido, a tarefa entrou ja pronta: ela nunca
// esteve pendente aqui, e o instante que a descreve e a propria entrada. Datar
// isso no inicio da sprint criaria trabalho que a sprint nao recebeu.
function burnInstant(participation) {
  const completed = toInstant(participation.completedAt);
  if (completed !== null) return completed;
  if (effectiveStatus(participation) === CONCLUIDO) return toInstant(participation.addedAt);
  return null;
}

export function buildSprintBurndown({ sprint, participations = [], cutoff }) {
  const vazio = {
    hasData: false,
    totalPoints: 0,
    frozen: TERMINAL.includes(sprint.status),
    cutoffDate: null,
    days: []
  };

  const days = enumerateDays(sprint.startDate, sprint.endDate);
  if (days.length < 2) return vazio;

  // Escopo do grafico: participacoes que nao sairam. Quem saiu levou o escopo
  // embora — mante-la no denominador desenharia uma linha que nunca chega a zero
  // por causa de trabalho que a sprint deixou de ter.
  const dentro = participations.filter((participation) => participation.removedAt === null);
  const totalPoints = dentro.reduce(
    (soma, participation) => soma + (Number(participation.points) || 0),
    0
  );
  if (totalPoints <= 0) return vazio;

  // Sprint encerrada devolve sempre o mesmo grafico, entao o corte e o
  // encerramento — nao o momento em que alguem consultou (mesma regra do
  // `progress`).
  const frozen = TERMINAL.includes(sprint.status);
  const corte = frozen ? (toInstant(sprint.completedAt) ?? toInstant(cutoff)) : toInstant(cutoff);
  const diaDoCorte = toUtcDay(new Date(corte));

  // Instante e pontos no mesmo objeto: separar em dois arrays e depois filtrar um
  // deles desalinharia os indices, e cada tarefa passaria a queimar os pontos de
  // outra.
  const queimas = dentro
    .map((participation) => ({
      at: burnInstant(participation),
      points: Number(participation.points) || 0
    }))
    .filter((queima) => queima.at !== null);

  const ultimo = days.length - 1;
  return {
    hasData: true,
    totalPoints,
    frozen,
    // O corte pode cair fora da janela: sprint que ainda nao comecou, ou que
    // venceu ha dias. `null` aqui significa "nenhum dia da serie foi medido".
    cutoffDate:
      diaDoCorte >= days[0] && diaDoCorte <= days[ultimo]
        ? iso(diaDoCorte)
        : diaDoCorte > days[ultimo]
          ? iso(days[ultimo])
          : null,
    days: days.map((day, indice) => {
      // Fim do dia: tudo que foi concluido ATE 23:59:59.999 daquele dia ja
      // queimou. Comparar contra o inicio do dia jogaria a conclusao de hoje para
      // o degrau de amanha.
      const fimDoDia = day + MS_PER_DAY;
      const medido = day <= diaDoCorte;
      const queimado = medido
        ? queimas.reduce((soma, queima) => (queima.at < fimDoDia ? soma + queima.points : soma), 0)
        : 0;
      return {
        date: iso(day),
        // Arredondado para uma casa: a reta ideal so existe para ser desenhada, e
        // um denominador impar nao precisa de dezesseis digitos de fracao.
        ideal: Math.round(totalPoints * (1 - indice / ultimo) * 10) / 10,
        remaining: medido ? Math.max(0, totalPoints - queimado) : null
      };
    })
  };
}
