import { taskPriorityLabels, taskStatusLabels } from './schedule-display.js';

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

export const CORES_MARCO = [
  { cor: '#0f766e', tinta: 'rgba(15, 118, 110, 0.09)' },
  { cor: '#b45309', tinta: 'rgba(180, 83, 9, 0.09)' },
  { cor: '#be185d', tinta: 'rgba(190, 24, 93, 0.09)' },
  { cor: '#4338ca', tinta: 'rgba(67, 56, 202, 0.09)' },
  { cor: '#0e7490', tinta: 'rgba(14, 116, 144, 0.09)' },
  { cor: '#a21caf', tinta: 'rgba(162, 28, 175, 0.09)' }
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

export function milestoneColors(milestones) {
  const cores = {};
  milestones.forEach((milestone, indice) => {
    cores[milestone.id] = CORES_MARCO[indice % CORES_MARCO.length];
  });
  return cores;
}

export function milestonePeriods({ milestones = [], sprints = [] }) {
  return milestones
    .map((milestone) => {
      const prazo = toIsoDay(milestone.dueDate);
      if (!prazo) return null;
      const doMarco = sprints.filter((sprint) => sprint.milestoneId === milestone.id);
      const inicios = doMarco
        .map((sprint) => sprintDayRange(sprint).inicio)
        .filter((dia) => Boolean(dia));
      const fins = doMarco
        .map((sprint) => sprintDayRange(sprint).fim)
        .filter((dia) => Boolean(dia));
      const primeiro = inicios.length
        ? inicios.reduce((menor, dia) => (dia < menor ? dia : menor))
        : prazo;
      const menorFim = fins.length
        ? fins.reduce((menor, dia) => (dia < menor ? dia : menor))
        : null;
      const alcance = menorFim && menorFim > prazo ? menorFim : prazo;
      return {
        id: milestone.id,
        title: milestone.title,
        status: milestone.status,
        overdue: milestone.overdue ?? false,
        inicio: primeiro < prazo ? primeiro : prazo,
        fim: primeiro < alcance ? alcance : primeiro,
        prazo,
        nSprints: doMarco.length,
        nConcluidas: doMarco.filter((sprint) => sprint.status === 'CONCLUIDA').length,
        comTrilha: doMarco.length > 0
      };
    })
    .filter((periodo) => periodo !== null)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : a.id - b.id));
}

const pluralSprints = (total) => `${total} ${total === 1 ? 'sprint' : 'sprints'}`;

export function milestoneWeekLayout({ celulas, periodos = [] }) {
  const trilhas = periodos.filter((periodo) => periodo.comTrilha);
  const semanas = [];
  const marcados = new Set();
  for (let semana = 0; semana < 6; semana += 1) {
    const dias = celulas.slice(semana * 7, semana * 7 + 7);
    const segmentos = [];
    const marcadores = [];
    for (const periodo of trilhas) {
      const inicio = periodo.inicio > dias[0].iso ? periodo.inicio : dias[0].iso;
      const fim = periodo.fim < dias[6].iso ? periodo.fim : dias[6].iso;
      if (inicio > fim) continue;
      const c0 = dias.findIndex((dia) => dia.iso === inicio);
      const c1 = dias.findIndex((dia) => dia.iso === fim);
      const prazoNoTitulo =
        periodo.fim !== periodo.prazo ? ` · prazo ${shortDate(periodo.prazo)}` : '';
      const titulo = `Marco ${periodo.title} · ${shortDate(periodo.inicio)} – ${shortDate(periodo.fim)}${prazoNoTitulo} · agrupa ${pluralSprints(periodo.nSprints)}`;
      segmentos.push({
        marcoId: periodo.id,
        c0,
        c1,
        esquerda: (c0 / 7) * 100,
        largura: ((c1 - c0 + 1) / 7) * 100,
        arredondaEsquerda: inicio === periodo.inicio,
        arredondaDireita: fim === periodo.fim,
        titulo
      });
      if (!marcados.has(periodo.id)) {
        marcados.add(periodo.id);
        marcadores.push({
          marcoId: periodo.id,
          esquerda: (c0 / 7) * 100,
          largura: ((7 - c0) / 7) * 100,
          texto: `${periodo.title} · marco · ${shortDate(periodo.inicio)} – ${shortDate(periodo.fim)}`,
          titulo
        });
      }
    }
    const ocupadas = [];
    for (const segmento of segmentos) {
      let linha = 0;
      while (
        ocupadas.some(
          (outro) => outro.linha === linha && segmento.c0 <= outro.c1 && segmento.c1 >= outro.c0
        )
      ) {
        linha += 1;
      }
      ocupadas.push({ linha, c0: segmento.c0, c1: segmento.c1 });
      segmento.linha = linha;
    }
    const espaco = marcadores.length ? 12 : 6;
    for (const segmento of segmentos) segmento.topo = 6 + segmento.linha * espaco;
    for (const marcador of marcadores) {
      const dono = segmentos.find((segmento) => segmento.marcoId === marcador.marcoId);
      marcador.topo = dono.topo - 5;
    }
    const extra = segmentos.length ? Math.max(...segmentos.map((item) => item.linha)) * espaco : 0;
    semanas.push({
      dias,
      segmentos,
      marcadores,
      alturaTopo: segmentos.length ? 16 + extra : 4
    });
  }
  return semanas;
}

export function buildMonthGrid({ ano, mes, sprints = [], periodos = [], hojeIso, selecionadoIso }) {
  const janelas = sprints.map((sprint) => ({ sprint, ...sprintDayRange(sprint) }));
  const trilhas = periodos.filter((periodo) => periodo.comTrilha);
  const prazos = new Map(periodos.map((periodo) => [periodo.prazo, periodo]));
  const primeiro = new Date(ano, mes, 1);
  const deslocamento = primeiro.getDay();

  const celulas = [];
  for (let i = 0; i < 42; i += 1) {
    const data = new Date(ano, mes, 1 - deslocamento + i);
    const iso = toIsoDay(data);
    const janela = janelas.find((item) => iso >= item.inicio && iso <= item.fim) || null;
    const cobertos = trilhas.filter((item) => iso >= item.inicio && iso <= item.fim);
    const periodo = cobertos[cobertos.length - 1] || null;
    const prazoDoDia = prazos.get(iso) || null;
    const coluna = i % 7;

    const partes = [longDayLabel(iso)];
    if (janela && iso === janela.inicio) partes.push(`início de ${janela.sprint.name}`);
    else if (janela && iso === janela.fim) partes.push(`fim de ${janela.sprint.name}`);
    else if (janela) partes.push(janela.sprint.name);
    if (periodo && iso === periodo.prazo) {
      partes.push(`prazo do marco ${periodo.title}`);
    } else if (periodo && iso === periodo.inicio && periodo.inicio !== periodo.fim) {
      partes.push(`início do marco ${periodo.title} (agrupa ${pluralSprints(periodo.nSprints)})`);
    } else if (periodo) {
      partes.push(`marco ${periodo.title}`);
    }
    if (prazoDoDia && (!periodo || periodo.id !== prazoDoDia.id)) {
      partes.push(`prazo do marco ${prazoDoDia.title}`);
    }

    celulas.push({
      iso,
      numero: data.getDate(),
      noMes: data.getMonth() === mes,
      hoje: iso === hojeIso && data.getMonth() === mes,
      selecionado: iso === selecionadoIso,
      sprintId: janela?.sprint.id ?? null,
      inicioDaFaixa: janela ? iso === janela.inicio || coluna === 0 : false,
      fimDaFaixa: janela ? iso === janela.fim || coluna === 6 : false,
      inicioDaSprint: janela ? iso === janela.inicio : false,
      fimDaSprint: janela ? iso === janela.fim : false,
      marcoId: periodo?.id ?? null,
      inicioDoMarco: periodo ? iso === periodo.inicio : false,
      fimDoMarco: periodo ? iso === periodo.fim : false,
      temPrazoDeMarco: Boolean(prazoDoDia),
      prazoDoMarcoId: prazoDoDia?.id ?? null,
      prazoAgrupado: prazoDoDia?.comTrilha ?? false,
      descricao: partes.join(' — ')
    });
  }
  return celulas;
}

export function deadlineTasks({ sprints = [], unassignedTasks = [] }) {
  const tarefas = [];
  for (const sprint of sprints) {
    for (const task of sprint.tasks || []) {
      const dia = toIsoDay(task.deadline);
      if (dia) tarefas.push({ ...task, dia, sprintNome: sprint.name });
    }
  }
  for (const task of unassignedTasks) {
    const dia = toIsoDay(task.deadline);
    if (dia) tarefas.push({ ...task, dia, sprintNome: null });
  }
  return tarefas.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.id - b.id));
}

export function buildEvents({
  sprints = [],
  periodos = [],
  milestoneNames = {},
  tarefas = [],
  hojeIso
}) {
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

  for (const periodo of periodos) {
    if (periodo.nSprints > 0 && periodo.inicio !== periodo.fim) {
      eventos.push({
        dia: periodo.inicio,
        tipo: 'MARCO',
        kind: 'Marco',
        titulo: `Início — ${periodo.title}`,
        meta: `Agrupa ${pluralSprints(periodo.nSprints)} · começa com a primeira delas`,
        aviso: ''
      });
    }
    const concluido = periodo.status === 'CONCLUIDO';
    const atrasado = periodo.overdue ?? (!concluido && periodo.prazo < hojeIso);
    eventos.push({
      dia: periodo.prazo,
      tipo: 'MARCO',
      kind: 'Marco',
      titulo: periodo.title,
      meta: `Prazo do marco · ${concluido ? 'Concluído' : atrasado ? 'Atrasado' : 'Pendente'}`,
      aviso: atrasado ? 'Marco vencido com sprints pendentes.' : ''
    });
  }

  for (const tarefa of tarefas) {
    eventos.push({
      dia: tarefa.dia,
      tipo: 'TAREFA',
      kind: 'Tarefa',
      titulo: `#${tarefa.id} ${tarefa.title}`,
      meta: `Deadline · ${taskStatusLabels[tarefa.status] || tarefa.status} · ${taskPriorityLabels[tarefa.priority] || tarefa.priority} · ${tarefa.sprintNome || 'Sem sprint'}`,
      aviso: ''
    });
  }

  return eventos
    .filter((evento) => evento.dia)
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
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

export function nowTiles({ sprints = [], periodos = [], tarefas = [], hojeIso }) {
  const ativa = sprints.find((sprint) => sprint.status === 'EM_ANDAMENTO') || null;
  const atrasadas = sprints.filter(
    (sprint) => sprint.status === 'EM_ANDAMENTO' && sprintDayRange(sprint).fim < hojeIso
  );

  const tiles = [];

  if (ativa) {
    const janela = sprintDayRange(ativa);
    const doSprint = ativa.tasks || [];
    const concluidas = doSprint.filter((task) => task.status === 'CONCLUIDO').length;
    const progresso = doSprint.length
      ? ` · ${concluidas} de ${doSprint.length} ${doSprint.length === 1 ? 'tarefa concluída' : 'tarefas concluídas'}`
      : '';
    tiles.push({
      label: 'Sprint atual',
      value: ativa.name,
      note: `${shortDate(janela.inicio)} – ${shortDate(janela.fim)}${progresso}`
    });
  } else {
    tiles.push({ label: 'Sprint atual', value: 'Nenhuma', note: 'Inicie uma sprint planejada' });
  }

  const pendentes = [...periodos]
    .filter((periodo) => periodo.status !== 'CONCLUIDO')
    .sort((a, b) => (a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : a.id - b.id));
  const marcoAtual =
    pendentes.find((periodo) => periodo.inicio <= hojeIso && hojeIso <= periodo.fim) ||
    pendentes.find((periodo) => periodo.prazo >= hojeIso) ||
    pendentes[pendentes.length - 1] ||
    null;
  tiles.push({
    label: 'Marco atual',
    value: marcoAtual ? marcoAtual.title : '—',
    note: marcoAtual
      ? `Prazo ${shortDate(marcoAtual.prazo)} · agrupa ${pluralSprints(marcoAtual.nSprints)} · ${marcoAtual.nConcluidas} ${marcoAtual.nConcluidas === 1 ? 'concluída' : 'concluídas'}`
      : periodos.length
        ? 'Todos os marcos concluídos'
        : 'Nenhum marco cadastrado'
  });

  if (ativa) {
    const doSprint = ativa.tasks || [];
    const abertas = doSprint.filter((task) => task.status !== 'CONCLUIDO');
    tiles.push({
      label: 'Tarefas em aberto na sprint atual',
      value: `${abertas.length} de ${doSprint.length} em aberto`,
      note:
        abertas
          .slice(0, 3)
          .map((task) => `#${task.id} ${task.title}`)
          .join(' · ') ||
        (doSprint.length
          ? 'Todas as tarefas da sprint foram concluídas'
          : 'Nenhuma tarefa associada à sprint')
    });
  }

  const proximaTarefa = tarefas.find(
    (tarefa) => tarefa.dia >= hojeIso && tarefa.status !== 'CONCLUIDO'
  );
  tiles.push({
    label: 'Atenção',
    value: atrasadas.length
      ? `${atrasadas.length} ${atrasadas.length === 1 ? 'sprint atrasada' : 'sprints atrasadas'}`
      : 'Nada atrasado',
    note: atrasadas.length
      ? 'Conclua para liberar a próxima'
      : proximaTarefa
        ? `Próximo deadline: ${shortDate(proximaTarefa.dia)} · #${proximaTarefa.id} ${proximaTarefa.title}`
        : 'Tudo dentro do prazo'
  });

  return tiles;
}

const monthRange = (ano, mes) => ({
  inicio: `${ano}-${pad(mes + 1)}-01`,
  fim: toIsoDay(new Date(ano, mes + 1, 0))
});

export function monthBlocks({
  ano,
  mes,
  sprints = [],
  periodos = [],
  milestoneNames = {},
  tarefas = []
}) {
  const { inicio: mesInicio, fim: mesFim } = monthRange(ano, mes);
  const intersecta = (inicio, fim) => inicio <= mesFim && fim >= mesInicio;

  const marcosDoMes = periodos.filter((periodo) => intersecta(periodo.inicio, periodo.fim));
  const sprintsDoMes = sprints
    .map((sprint) => ({ sprint, ...sprintDayRange(sprint) }))
    .filter((janela) => janela.inicio && intersecta(janela.inicio, janela.fim));
  const tarefasDoMes = tarefas.filter((tarefa) => tarefa.dia >= mesInicio && tarefa.dia <= mesFim);

  const blocos = [
    {
      chave: 'marcos',
      rotulo: 'Marcos',
      vazio: 'Nenhum marco neste mês.',
      itens: marcosDoMes.map((periodo) => ({
        chave: `marco-${periodo.id}`,
        marcoId: periodo.id,
        nome: periodo.title,
        meta: `${
          periodo.comTrilha
            ? `${shortDate(periodo.inicio)} – ${shortDate(periodo.fim)}${
                periodo.fim !== periodo.prazo ? ` · prazo ${shortDate(periodo.prazo)}` : ''
              }`
            : `Prazo ${shortDate(periodo.prazo)}`
        } · ${
          periodo.status === 'CONCLUIDO' ? 'Concluído' : periodo.overdue ? 'Atrasado' : 'Pendente'
        } · agrupa ${pluralSprints(periodo.nSprints)}`
      }))
    },
    {
      chave: 'sprints',
      rotulo: 'Sprints',
      vazio: 'Nenhuma sprint neste mês.',
      itens: sprintsDoMes.map(({ sprint, inicio, fim }) => ({
        chave: `sprint-${sprint.id}`,
        sprintId: sprint.id,
        nome: sprint.name,
        meta: `${shortDate(inicio)} – ${shortDate(fim)} · ${statusTexto(sprint.status)} · ${
          milestoneNames[sprint.milestoneId]
            ? `marco ${milestoneNames[sprint.milestoneId]}`
            : 'sem marco'
        }`
      }))
    },
    {
      chave: 'tarefas',
      rotulo: 'Tarefas',
      descricao: 'Somente tarefas com deadline dentro do mês exibido.',
      vazio: 'Nenhuma tarefa com deadline neste mês.',
      itens: tarefasDoMes.map((tarefa) => ({
        chave: `tarefa-${tarefa.id}`,
        nome: `#${tarefa.id} ${tarefa.title}`,
        meta: `${shortDate(tarefa.dia)} · ${taskStatusLabels[tarefa.status] || tarefa.status} · ${
          taskPriorityLabels[tarefa.priority] || tarefa.priority
        } · ${tarefa.sprintNome || 'Sem sprint'}`
      }))
    }
  ];

  const total = marcosDoMes.length + sprintsDoMes.length + tarefasDoMes.length;
  const resumo =
    total === 0
      ? 'nada no calendário'
      : `${marcosDoMes.length} ${marcosDoMes.length === 1 ? 'marco' : 'marcos'} · ${pluralSprints(
          sprintsDoMes.length
        )} · ${tarefasDoMes.length} ${tarefasDoMes.length === 1 ? 'tarefa' : 'tarefas'}`;

  return { blocos, resumo };
}

export function monthLegend({ ano, mes, sprints = [], periodos = [] }) {
  const { inicio: mesInicio, fim: mesFim } = monthRange(ano, mes);
  const intersecta = (inicio, fim) => inicio <= mesFim && fim >= mesInicio;
  return {
    sprints: sprints
      .map((sprint) => ({ sprint, ...sprintDayRange(sprint) }))
      .filter((janela) => janela.inicio && intersecta(janela.inicio, janela.fim)),
    marcos: periodos.filter(
      (periodo) => periodo.comTrilha && intersecta(periodo.inicio, periodo.fim)
    ),
    temPrazoNoMes: periodos.some((periodo) => periodo.prazo >= mesInicio && periodo.prazo <= mesFim)
  };
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
