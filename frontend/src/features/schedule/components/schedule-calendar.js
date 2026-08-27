// Montagem do calendário do cronograma (RF10). Módulo puro: sem React, sem I/O.
//
// Substitui a agenda textual por uma grade mensal. O que a agenda entregava —
// "o que acontece em cada dia" — continua aqui, no painel do dia selecionado e
// na lista de próximos eventos; o que a grade acrescenta é a duração: uma sprint
// de duas semanas vira uma faixa contínua, e o vão entre duas sprints fica
// visível sem ninguém ter que subtrair datas de cabeça.
//
// Toda comparação de dia é feita no dia LOCAL, não em UTC. É o dia do usuário
// que importa: uma sprint que começa 31/07 às 23h em Brasília não pertence a
// 01/08, e ancorar em UTC a jogaria para o quadradinho seguinte. O backend
// continua em UTC no armazenamento e no recorte `from`/`to` — a conversão é de
// apresentação.

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
];

const DIAS_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado'
];

// Iniciais da semana na ordem do calendário brasileiro (domingo primeiro). Duas
// quartas e duas sextas compartilham a letra: o `title` de cada coluna carrega o
// nome inteiro para leitor de tela.
export const INICIAIS_SEMANA = DIAS_SEMANA.map((dia) => dia.charAt(0).toUpperCase());

// Paleta de faixa por sprint. Seis pares fundo/texto que ciclam: acima disso a
// repetição é inevitável, e a legenda — que nomeia cada sprint com o seu período
// — é quem desfaz a ambiguidade. Cores tiradas dos badges de status do produto,
// para o calendário não introduzir um vocabulário visual próprio.
export const CORES_SPRINT = [
  { bg: '#e7edff', fg: '#315bce' },
  { bg: '#dcf4e7', fg: '#17643b' },
  { bg: '#fff0cd', fg: '#875a13' },
  { bg: '#f4f0ff', fg: '#5b21b6' },
  { bg: '#eff9ff', fg: '#075985' },
  { bg: '#ffe1e1', fg: '#9f2d2d' }
];

const pad = (valor) => String(valor).padStart(2, '0');

// Dia local de um instante ou de um dia de calendário puro.
export function toIsoDay(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayIsoDay = (hoje = new Date()) => toIsoDay(hoje);

export const monthLabel = (ano, mes) => `${MESES[mes]} de ${ano}`;

// "sexta-feira, 21 de agosto". Dia por extenso porque é cabeçalho, não rótulo de
// coluna: aqui há espaço, e "sex" lido isolado é fragmento.
export function longDayLabel(isoDay) {
  if (!isoDay) return '';
  const [ano, mes, dia] = isoDay.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  return `${DIAS_SEMANA[data.getDay()]}, ${data.getDate()} de ${MESES[data.getMonth()]}`;
}

export function shortDayLabel(isoDay) {
  if (!isoDay) return '';
  const [ano, mes, dia] = isoDay.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  return `${DIAS_SEMANA[data.getDay()].slice(0, 3)}, ${pad(dia)}/${pad(mes)}`;
}

export function shortDate(isoDay) {
  if (!isoDay) return '';
  const [, mes, dia] = isoDay.split('-');
  return `${dia}/${mes}`;
}

export function fullDate(isoDay) {
  if (!isoDay) return '';
  const [ano, mes, dia] = isoDay.split('-');
  return `${dia}/${mes}/${ano}`;
}

// A faixa de uma sprint no calendário cobre o dia do início até o dia ANTERIOR
// ao fim quando o fim cai exatamente na meia-noite — a janela é semiaberta, e
// aquele dia já pertence à sprint seguinte. Com hora no fim, o dia conta.
export function sprintDayRange(sprint) {
  const inicio = toIsoDay(sprint.startDate);
  const fim = new Date(sprint.endDate);
  if (Number.isNaN(fim.getTime())) return { inicio, fim: inicio };
  const meiaNoite = fim.getHours() === 0 && fim.getMinutes() === 0 && fim.getSeconds() === 0;
  const ultimo = meiaNoite ? new Date(fim.getTime() - 86400000) : fim;
  const fimIso = toIsoDay(ultimo);
  // Sprint que começa e termina no mesmo instante de meia-noite recuaria para
  // antes do próprio início. Um dia é o mínimo que a faixa pode representar.
  return { inicio, fim: fimIso && fimIso >= inicio ? fimIso : inicio };
}

export function sprintColors(sprints) {
  const cores = {};
  sprints.forEach((sprint, indice) => {
    cores[sprint.id] = CORES_SPRINT[indice % CORES_SPRINT.length];
  });
  return cores;
}

// Grade de 42 células — seis semanas —, sempre do mesmo tamanho: um mês que
// ocupa cinco linhas e outro que ocupa seis fariam o painel abaixo pular de
// altura ao navegar entre eles.
export function buildMonthGrid({
  ano,
  mes,
  sprints = [],
  milestones = [],
  hojeIso,
  selecionadoIso
}) {
  const janelas = sprints.map((sprint) => ({ sprint, ...sprintDayRange(sprint) }));
  const prazos = new Set(milestones.map((milestone) => toIsoDay(milestone.dueDate)));
  const primeiro = new Date(ano, mes, 1);
  const deslocamento = primeiro.getDay();

  const celulas = [];
  for (let i = 0; i < 42; i += 1) {
    const data = new Date(ano, mes, 1 - deslocamento + i);
    const iso = toIsoDay(data);
    // A primeira sprint que cobre o dia. Sprints do mesmo projeto não se
    // sobrepõem (ADR-010 D03), então "a primeira" é "a única" — a busca só não
    // assume isso para não quebrar diante de dado legado.
    const janela = janelas.find((item) => iso >= item.inicio && iso <= item.fim) || null;
    const coluna = i % 7;
    celulas.push({
      iso,
      numero: data.getDate(),
      noMes: data.getMonth() === mes,
      hoje: iso === hojeIso,
      selecionado: iso === selecionadoIso,
      sprintId: janela?.sprint.id ?? null,
      sprintNome: janela?.sprint.name ?? null,
      // Pontas arredondadas só onde a faixa realmente começa ou termina — e no
      // limite da semana, senão a faixa vazaria visualmente para a linha
      // seguinte, sugerindo continuidade onde a grade quebra.
      inicioDaFaixa: janela ? iso === janela.inicio || coluna === 0 : false,
      fimDaFaixa: janela ? iso === janela.fim || coluna === 6 : false,
      temPrazoDeMarco: prazos.has(iso)
    });
  }
  return celulas;
}

// Eventos pontuais do cronograma: início e fim de cada sprint, prazo de cada
// marco. É o mesmo conteúdo que a agenda textual listava, agora indexado por dia.
export function buildEvents({ sprints = [], milestones = [], milestoneNames = {}, hojeIso }) {
  const eventos = [];

  for (const sprint of sprints) {
    const marco = milestoneNames[sprint.milestoneId] || 'Sem marco';
    const { inicio, fim } = sprintDayRange(sprint);
    const atrasada = sprint.status === 'EM_ANDAMENTO' && fim < hojeIso;
    const rotulo = atrasada ? 'Atrasada' : null;
    eventos.push({
      dia: inicio,
      tipo: 'SPRINT',
      kind: 'Sprint',
      titulo: `Início — ${sprint.name}`,
      meta: `${marco} · ${rotulo || statusTexto(sprint.status)}`,
      aviso: ''
    });
    eventos.push({
      dia: fim,
      tipo: 'SPRINT',
      kind: 'Sprint',
      titulo: `Fim — ${sprint.name}`,
      meta: `${marco} · ${rotulo || statusTexto(sprint.status)}`,
      aviso: atrasada ? 'Sprint atrasada — conclua para liberar a próxima.' : ''
    });
  }

  for (const milestone of milestones) {
    const dia = toIsoDay(milestone.dueDate);
    const concluido = milestone.status === 'CONCLUIDO';
    // `overdue` vem calculado do backend no agregado; a derivação local é o
    // fallback para a lista completa, que não passa por lá.
    const atrasado = milestone.overdue ?? (!concluido && dia < hojeIso);
    eventos.push({
      dia,
      tipo: 'MARCO',
      kind: 'Marco',
      titulo: milestone.title,
      meta: `Prazo do marco · ${concluido ? 'Concluído' : atrasado ? 'Atrasado' : 'Pendente'}`,
      aviso: atrasado ? 'Marco vencido com sprints pendentes.' : ''
    });
  }

  return eventos.filter((evento) => evento.dia).sort((a, b) => (a.dia < b.dia ? -1 : 1));
}

function statusTexto(status) {
  return (
    {
      PLANEJADA: 'Planejada',
      EM_ANDAMENTO: 'Em andamento',
      CONCLUIDA: 'Concluída',
      CANCELADA: 'Cancelada'
    }[status] || status
  );
}

export const eventsForDay = (eventos, dia) => eventos.filter((evento) => evento.dia === dia);

export const upcomingEvents = (eventos, hojeIso, limite = 6) =>
  eventos.filter((evento) => evento.dia >= hojeIso).slice(0, limite);

// Os três cartões de "Agora". Cada um responde uma pergunta que a grade não
// responde sozinha: o que está aberto, o que está atrasado e o que vem depois.
export function nowTiles({ sprints = [], milestones = [], hojeIso }) {
  const ativa = sprints.find((sprint) => sprint.status === 'EM_ANDAMENTO') || null;
  const atrasadas = sprints.filter(
    (sprint) => sprint.status === 'EM_ANDAMENTO' && sprintDayRange(sprint).fim < hojeIso
  );
  // Marco pendente mais próximo. Um marco concluído não é "o próximo", mesmo que
  // o prazo dele ainda esteja no futuro.
  const proximoMarco = milestones
    .filter((milestone) => milestone.status !== 'CONCLUIDO')
    .sort((a, b) => (toIsoDay(a.dueDate) < toIsoDay(b.dueDate) ? -1 : 1))[0];

  return [
    {
      label: 'Sprint ativa',
      value: ativa ? ativa.name : 'Nenhuma',
      note: ativa
        ? `Termina ${shortDate(sprintDayRange(ativa).fim)}`
        : 'Inicie uma sprint planejada'
    },
    {
      label: 'Atenção',
      value: atrasadas.length
        ? `${atrasadas.length} ${atrasadas.length === 1 ? 'sprint atrasada' : 'sprints atrasadas'}`
        : 'Nada atrasado',
      note: atrasadas.length ? 'Conclua para liberar a próxima' : 'Tudo dentro do prazo'
    },
    {
      label: 'Próximo marco',
      value: proximoMarco ? proximoMarco.title : '—',
      note: proximoMarco
        ? `Prazo ${fullDate(toIsoDay(proximoMarco.dueDate))}`
        : 'Todos os marcos concluídos'
    }
  ];
}

// Dias inteiros entre dois dias locais. Ancorado em UTC de propósito: a
// subtração acontece entre datas já normalizadas para dia, e usar o fuso local
// aqui faria a diferença variar em uma unidade nas semanas de horário de verão.
export function diffDaysIso(deIso, ateIso) {
  if (!deIso || !ateIso) return null;
  const [a1, m1, d1] = deIso.split('-').map(Number);
  const [a2, m2, d2] = ateIso.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

export function previousMonth(ano, mes) {
  return mes === 0 ? { ano: ano - 1, mes: 11 } : { ano, mes: mes - 1 };
}

export function nextMonth(ano, mes) {
  return mes === 11 ? { ano: ano + 1, mes: 0 } : { ano, mes: mes + 1 };
}

// Mês (0-based, o vocabulário de previousMonth/nextMonth) do dia ISO.
const monthOfDay = (iso) => {
  const [ano, mes] = iso.split('-').map(Number);
  return { ano, mes: mes - 1 };
};

// Meses navegáveis do calendário: do mês do primeiro dia pintado ao mês do
// último. Pintado é o que a grade desenha — faixa de sprint (a janela de
// sprintDayRange, a mesma que resolve o fim à meia-noite) e prazo de marco; o
// prazo entra porque ele é livre (ADR-011 D03) e pode cair fora de toda janela
// de sprint — um ponto pintado num mês inalcançável seria informação que a
// tela afirma ter e não deixa ver.
//
// A função não filtra status: opera sobre o que recebe. Quem exclui a
// CANCELADA é o chamador, que já faz isso para pintar — uma regra, um dono.
// Devolve null quando não há nada pintado: quem chama decide o mês de descanso.
export function calendarBounds({ sprints = [], milestones = [] }) {
  const dias = [];
  for (const sprint of sprints) {
    const { inicio, fim } = sprintDayRange(sprint);
    if (inicio) dias.push(inicio, fim);
  }
  for (const milestone of milestones) {
    const dia = toIsoDay(milestone.dueDate);
    if (dia) dias.push(dia);
  }
  if (!dias.length) return null;
  let menor = dias[0];
  let maior = dias[0];
  for (const dia of dias) {
    if (dia < menor) menor = dia;
    if (dia > maior) maior = dia;
  }
  return { min: monthOfDay(menor), max: monthOfDay(maior) };
}

// Prende um {ano, mes} ao intervalo navegável. A comparação é por índice
// absoluto de mês — ano e mês juntos, senão dezembro/2026 pareceria depois de
// janeiro/2027. Sem limites (null), devolve como veio.
export function clampMonth(limites, { ano, mes }) {
  if (!limites) return { ano, mes };
  const indice = ano * 12 + mes;
  if (indice < limites.min.ano * 12 + limites.min.mes) return { ...limites.min };
  if (indice > limites.max.ano * 12 + limites.max.mes) return { ...limites.max };
  return { ano, mes };
}
