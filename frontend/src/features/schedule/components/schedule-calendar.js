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

export const INICIAIS_SEMANA = DIAS_SEMANA.map((dia) => dia.charAt(0).toUpperCase());

export const CORES_SPRINT = [
  { bg: '#e7edff', fg: '#315bce' },
  { bg: '#dcf4e7', fg: '#17643b' },
  { bg: '#fff0cd', fg: '#875a13' },
  { bg: '#f4f0ff', fg: '#5b21b6' },
  { bg: '#eff9ff', fg: '#075985' },
  { bg: '#ffe1e1', fg: '#9f2d2d' }
];

const pad = (valor) => String(valor).padStart(2, '0');

export function toIsoDay(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayIsoDay = (hoje = new Date()) => toIsoDay(hoje);

export const monthLabel = (ano, mes) => `${MESES[mes]} de ${ano}`;

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

export function sprintDayRange(sprint) {
  const inicio = toIsoDay(sprint.startDate);
  const fim = new Date(sprint.endDate);
  if (Number.isNaN(fim.getTime())) return { inicio, fim: inicio };
  const meiaNoite = fim.getHours() === 0 && fim.getMinutes() === 0 && fim.getSeconds() === 0;
  const ultimo = meiaNoite ? new Date(fim.getTime() - 86400000) : fim;
  const fimIso = toIsoDay(ultimo);
  return { inicio, fim: fimIso && fimIso >= inicio ? fimIso : inicio };
}

export function sprintColors(sprints) {
  const cores = {};
  sprints.forEach((sprint, indice) => {
    cores[sprint.id] = CORES_SPRINT[indice % CORES_SPRINT.length];
  });
  return cores;
}

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
      inicioDaFaixa: janela ? iso === janela.inicio || coluna === 0 : false,
      fimDaFaixa: janela ? iso === janela.fim || coluna === 6 : false,
      temPrazoDeMarco: prazos.has(iso)
    });
  }
  return celulas;
}

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

export function nowTiles({ sprints = [], milestones = [], hojeIso }) {
  const ativa = sprints.find((sprint) => sprint.status === 'EM_ANDAMENTO') || null;
  const atrasadas = sprints.filter(
    (sprint) => sprint.status === 'EM_ANDAMENTO' && sprintDayRange(sprint).fim < hojeIso
  );
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

const monthOfDay = (iso) => {
  const [ano, mes] = iso.split('-').map(Number);
  return { ano, mes: mes - 1 };
};

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

export function clampMonth(limites, { ano, mes }) {
  if (!limites) return { ano, mes };
  const indice = ano * 12 + mes;
  if (indice < limites.min.ano * 12 + limites.min.mes) return { ...limites.min };
  if (indice > limites.max.ano * 12 + limites.max.mes) return { ...limites.max };
  return { ano, mes };
}
