// Montagem da agenda do cronograma (RF10). Modulo puro: sem React, sem I/O.
// A agenda substitui o grafico de barras: nada aqui calcula geometria, so
// agrupa eventos por data. Toda comparacao de dia e feita em UTC, a mesma
// convencao que o backend usa para `overdue` e para as datas de calendario.
import {
  formatCalendarDate,
  formatDuration,
  formatSprintPeriod,
  isTerminalSprint,
  milestoneStatusLabels,
  sprintStatusLabels,
  taskPriorityLabels,
  taskStatusLabels
} from './schedule-display.js';

// Nome por extenso: "dom" solto numa coluna estreita se le como fragmento, nao
// como dia da semana. A coluna comporta a palavra inteira.
export const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// Acima deste numero de datas com eventos — E com pelo menos tres meses — a
// agenda agrupa os meses em <details> colapsaveis. Abaixo, nenhum chrome de
// colapso existe: o projeto pequeno nao paga pelo grande, e um unico mes denso
// nao ganha nada sendo dobrado atras de um clique.
export const LIMITE_AGENDA_ABERTA = 24;

// Ordem dentro de um dia: cartoes de contexto primeiro, compromissos pontuais
// depois, remates por ultimo — o remate e o unico que nao e cartao.
const PESO_POR_TIPO = {
  SPRINT: 0,
  SPRINT_DIA_UNICO: 0,
  SPRINT_EM_CURSO: 0,
  MARCO: 1,
  PRAZO: 2,
  SPRINT_FIM: 3
};

const ROTULO_POR_TIPO = {
  SPRINT: 'Sprint',
  SPRINT_DIA_UNICO: 'Sprint de 1 dia',
  SPRINT_EM_CURSO: 'Sprint em curso',
  SPRINT_FIM: 'Encerramento',
  MARCO: 'Marco',
  PRAZO: 'Prazo de tarefa'
};

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

export function toIsoDay(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return match ? match[0] : null;
}

function diaUtc(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function diffEmDias(isoA, isoB) {
  const a = diaUtc(isoA);
  const b = diaUtc(isoB);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

// Tabela fixa em vez de Intl: dia de calendario nao pode passar pelo fuso local
// (2026-08-08 é sábado e viraria "sex" no Brasil), e Node sem full-ICU cairia
// em inglês, tornando o teste dependente do ambiente.
export function weekdayLabel(iso) {
  const dia = diaUtc(toIsoDay(iso));
  if (dia === null) return '';
  return DIAS_SEMANA[new Date(dia).getUTCDay()];
}

export function relativeDayLabel(iso, hojeIso) {
  const distancia = diffEmDias(hojeIso, iso);
  if (distancia === null) return '';
  if (distancia === 0) return 'Hoje';
  if (distancia === 1) return 'Amanhã';
  if (distancia === -1) return 'Ontem';
  return distancia > 0 ? `em ${distancia} dias` : `há ${Math.abs(distancia)} dias`;
}

export function monthLabel(iso) {
  const match = /^(\d{4})-(\d{2})/.exec(iso || '');
  if (!match) return '';
  return `${MESES[Number(match[2]) - 1]} de ${match[1]}`;
}

function proximoMes(chave) {
  const [ano, mes] = chave.split('-').map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`;
}

// Meses sem eventos nao geram secao nenhuma (meses derivam de dias): sem esta
// linha, a agenda saltaria de setembro para dezembro em silencio e a pausa do
// projeto pareceria bug. A lacuna vira texto entre os meses, visivel mesmo com
// tudo colapsado.
export function lacunaEntreMeses(chaveAnterior, chaveAtual) {
  const pulados = [];
  let cursor = proximoMes(chaveAnterior);
  while (cursor < chaveAtual && pulados.length <= 600) {
    pulados.push(cursor);
    cursor = proximoMes(cursor);
  }
  if (!pulados.length) return null;
  if (pulados.length === 1) return `${monthLabel(pulados[0])} — sem eventos`;
  if (pulados.length === 2) {
    const [a, b] = pulados;
    const mesmoAno = a.slice(0, 4) === b.slice(0, 4);
    const nomeA = mesmoAno ? MESES[Number(a.slice(5)) - 1] : monthLabel(a);
    return `${nomeA} e ${monthLabel(b)} — sem eventos`;
  }
  return `${monthLabel(pulados[0])} a ${monthLabel(pulados[pulados.length - 1])} — sem eventos`;
}

// Mes focal do modo colapsado: o mes de hoje, se ele ainda tiver dias por vir
// (abrir um mes so de passado esconderia o "proximo evento" anunciado na faixa
// de situacao); senao o proximo mes com eventos; senao o mais recente.
export function calcularMesFocal(meses, hojeIso) {
  if (!meses.length) return null;
  const chaveHoje = hojeIso ? hojeIso.slice(0, 7) : null;
  const doHoje = chaveHoje ? meses.find((mes) => mes.chave === chaveHoje) : null;
  if (doHoje && doHoje.dias.some((dia) => dia.iso >= hojeIso)) return doHoje.chave;
  const proximo = chaveHoje ? meses.find((mes) => mes.chave > chaveHoje) : null;
  if (proximo) return proximo.chave;
  return meses[meses.length - 1].chave;
}

const dentroDaJanela = (iso, janela) => {
  if (!iso) return false;
  if (janela.from && iso < janela.from) return false;
  if (janela.to && iso > janela.to) return false;
  return true;
};

function statusClass(status) {
  return status ? `status-${String(status).toLowerCase()}` : '';
}

function descreverTarefa(task) {
  const partes = [taskStatusLabels[task.status] || task.status];
  if (task.priority)
    partes.push(`Prioridade ${(taskPriorityLabels[task.priority] || '').toLowerCase()}`);
  if (task.deadline) partes.push(`prazo ${formatCalendarDate(task.deadline)}`);
  else partes.push('sem prazo');
  return partes.join(' · ');
}

// Invariante: toda sprint do payload gera ao menos UMA entrada. Sem isso,
// filtrar um periodo no meio de uma sprint a faria desaparecer da agenda.
export function sprintEntries(sprint, janela, hojeIso) {
  const inicio = toIsoDay(sprint.startDate);
  const fim = toIsoDay(sprint.endDate);
  if (!inicio || !fim) return [];

  const duracao = sprint.durationInDays;
  const decorridos = diffEmDias(inicio, hojeIso);
  const progresso =
    decorridos !== null && decorridos >= 0 && duracao && decorridos < duracao
      ? `dia ${decorridos + 1} de ${duracao}`
      : null;

  const meta = [formatSprintPeriod(sprint)];
  if (duracao) meta.push(formatDuration(duracao));
  if (progresso) meta.push(progresso);
  meta.push(`${sprint.taskCount} ${sprint.taskCount === 1 ? 'tarefa' : 'tarefas'}`);

  const base = {
    id: sprint.id,
    title: sprint.name,
    statusLabel: sprintStatusLabels[sprint.status] || sprint.status,
    statusClass: statusClass(sprint.status),
    atenuada: sprint.status === 'CANCELADA',
    objetivo: sprint.objective || null,
    tarefas: (sprint.tasks || []).map((task) => ({
      id: task.id,
      texto: `${task.title} — ${descreverTarefa(task)}`
    })),
    avisos: []
  };

  // Sprint de um dia so: um evento, nao dois.
  if (inicio === fim) {
    return [
      {
        ...base,
        key: `sprint-${sprint.id}`,
        kind: 'SPRINT_DIA_UNICO',
        dia: inicio,
        meta: [`começa e encerra em ${formatCalendarDate(inicio)}`, ...meta.slice(1)]
      }
    ];
  }

  const inicioVisivel = dentroDaJanela(inicio, janela);
  const fimVisivel = dentroDaJanela(fim, janela);
  const entradas = [];

  if (inicioVisivel) {
    entradas.push({ ...base, key: `sprint-${sprint.id}`, kind: 'SPRINT', dia: inicio, meta });
  } else {
    // Atravessa a borda: ancora no primeiro dia da janela para nao sumir.
    const ancora = janela.from || inicio;
    entradas.push({
      ...base,
      key: `sprint-${sprint.id}`,
      kind: 'SPRINT_EM_CURSO',
      dia: ancora,
      meta: [`começou em ${formatCalendarDate(inicio)}, antes do período`, ...meta]
    });
  }

  if (!fimVisivel && janela.to) {
    entradas[0].meta.push(`termina em ${formatCalendarDate(fim)}, depois do período`);
  }

  // Remate: linha subordinada, sem badge — a sprint ja tem um cartao canonico.
  if (fimVisivel && fim !== entradas[0].dia) {
    entradas.push({
      key: `sprint-fim-${sprint.id}`,
      kind: 'SPRINT_FIM',
      dia: fim,
      // Sem o id, o dedup de "em curso neste dia" nao reconhece o remate e o
      // ultimo dia menciona a sprint duas vezes.
      id: sprint.id,
      title: sprint.name,
      subordinada: true,
      texto: `${sprint.name} — último dia previsto${duracao ? ` · ${formatDuration(duracao)} no total` : ''}`
    });
  }

  return entradas;
}

function milestoneEntry(milestone) {
  const dia = toIsoDay(milestone.dueDate);
  if (!dia) return null;
  const meta = [];
  if (milestone.description) meta.push(milestone.description);
  return {
    key: `marco-${milestone.id}`,
    kind: 'MARCO',
    dia,
    id: milestone.id,
    title: milestone.title,
    statusLabel: milestoneStatusLabels[milestone.status] || milestone.status,
    statusClass: statusClass(milestone.status),
    atrasada: Boolean(milestone.overdue),
    meta,
    avisos: []
  };
}

function deadlineEntry(task, origem) {
  const dia = toIsoDay(task.deadline);
  if (!dia) return null;
  const meta = [origem, taskStatusLabels[task.status] || task.status];
  if (task.priority) {
    meta.push(`Prioridade ${(taskPriorityLabels[task.priority] || '').toLowerCase()}`);
  }
  return {
    key: `prazo-${task.id}`,
    kind: 'PRAZO',
    dia,
    id: task.id,
    title: task.title,
    meta,
    avisos: [],
    atrasada: false
  };
}

export function buildAgenda(schedule, today) {
  const sprints = schedule?.sprints || [];
  const milestones = schedule?.milestones || [];
  const unassignedTasks = schedule?.unassignedTasks || [];

  // "Hoje" vem de generatedAt para casar com o `overdue` calculado no servidor;
  // `today` existe apenas para tornar o teste deterministico.
  const referencia = today ?? (schedule?.generatedAt ? new Date(schedule.generatedAt) : new Date());
  const hojeIso = toIsoDay(referencia);

  const from = schedule?.range?.from || null;
  const to = schedule?.range?.to || null;
  const janela = {
    from,
    to,
    filtrada: Boolean(from || to),
    hojeForaDaJanela: Boolean((from && hojeIso < from) || (to && hojeIso > to))
  };

  const entradas = [];
  sprints.forEach((sprint) => entradas.push(...sprintEntries(sprint, janela, hojeIso)));
  milestones.forEach((marco) => {
    const entrada = milestoneEntry(marco);
    if (entrada) entradas.push(entrada);
  });

  let ocultosForaDoPeriodo = 0;
  const semPrazo = [];

  sprints.forEach((sprint) => {
    (sprint.tasks || []).forEach((task) => {
      if (!task.deadline) {
        semPrazo.push({
          id: task.id,
          title: task.title,
          statusLabel: taskStatusLabels[task.status] || task.status,
          origem: sprint.name
        });
        return;
      }
      const dia = toIsoDay(task.deadline);
      // Tarefa de sprint nao e filtrada pelo backend: o prazo pode cair fora da
      // janela. Nesse caso ela nao cria no de dia, mas e contabilizada.
      if (!dentroDaJanela(dia, janela)) {
        ocultosForaDoPeriodo += 1;
        return;
      }
      const entrada = deadlineEntry(task, sprint.name);
      if (!entrada) return;
      if (task.deadlineOutsideWindow) {
        entrada.avisos.push(
          `Prazo fora da janela da sprint — ${sprint.name} vai de ${formatSprintPeriod(sprint)}.`
        );
      }
      entrada.atrasada = Boolean(hojeIso && dia < hojeIso && task.status !== 'CONCLUIDO');
      entradas.push(entrada);
    });
  });

  unassignedTasks.forEach((task) => {
    if (!task.deadline) {
      semPrazo.push({
        id: task.id,
        title: task.title,
        statusLabel: taskStatusLabels[task.status] || task.status,
        origem: 'Sem sprint'
      });
      return;
    }
    const entrada = deadlineEntry(task, 'Sem sprint');
    if (!entrada) return;
    entrada.atrasada = Boolean(hojeIso && entrada.dia < hojeIso && task.status !== 'CONCLUIDO');
    entradas.push(entrada);
  });

  entradas.sort((a, b) => {
    if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
    const peso = PESO_POR_TIPO[a.kind] - PESO_POR_TIPO[b.kind];
    if (peso !== 0) return peso;
    return String(a.title).localeCompare(String(b.title), 'pt-BR');
  });

  // Agrupa por dia e depois por mes, preservando a ordem cronologica.
  const dias = [];
  entradas.forEach((entrada) => {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.iso === entrada.dia) {
      ultimo.entradas.push({ ...entrada, kindLabel: ROTULO_POR_TIPO[entrada.kind] });
      return;
    }
    dias.push({
      iso: entrada.dia,
      weekday: weekdayLabel(entrada.dia),
      relativo: relativeDayLabel(entrada.dia, hojeIso),
      isHoje: entrada.dia === hojeIso,
      // Gap so dentro do mesmo mes: entre meses, a lacuna vira texto no nivel
      // da lista de meses (lacunaAntes), visivel mesmo com o mes colapsado.
      gapAnterior:
        ultimo && ultimo.iso.slice(0, 7) === entrada.dia.slice(0, 7)
          ? diffEmDias(ultimo.iso, entrada.dia)
          : null,
      emCurso: [],
      entradas: [{ ...entrada, kindLabel: ROTULO_POR_TIPO[entrada.kind] }]
    });
  });

  // Sprint que cobre o dia mas nao tem entrada propria nele: metadado no
  // cabecalho, nunca outro cartao — repetir a sprint faria contar errado.
  dias.forEach((dia) => {
    sprints.forEach((sprint) => {
      // Uma sprint CANCELADA nunca aconteceu: nao esteve em curso em dia nenhum,
      // nem retroativamente. Uma CONCLUIDA de fato correu durante sua janela,
      // entao continua correta na leitura historica dos dias passados — por isso
      // aqui o corte e so CANCELADA, e no cartao de HOJE e mais estrito.
      if (sprint.status === 'CANCELADA') return;
      const inicio = toIsoDay(sprint.startDate);
      const fim = toIsoDay(sprint.endDate);
      if (!inicio || !fim) return;
      if (dia.iso <= inicio || dia.iso > fim) return;
      if (dia.entradas.some((entrada) => entrada.id === sprint.id && entrada.kind !== 'PRAZO')) {
        return;
      }
      const decorridos = diffEmDias(inicio, dia.iso);
      dia.emCurso.push(
        `${sprint.name}${sprint.durationInDays ? ` (dia ${decorridos + 1} de ${sprint.durationInDays})` : ''}`
      );
    });
  });

  const meses = [];
  dias.forEach((dia) => {
    const chave = dia.iso.slice(0, 7);
    const ultimo = meses[meses.length - 1];
    if (ultimo && ultimo.chave === chave) {
      ultimo.dias.push(dia);
      return;
    }
    meses.push({ chave, titulo: monthLabel(dia.iso), dias: [dia] });
  });

  // O resumo do mes conta COISAS, com o mesmo criterio da linha de recorte:
  // cada sprint tem exatamente UMA entrada canonica (o invariante garante),
  // entao a soma dos meses reconcilia com a contagem do topo. Remates nao
  // contam — sao referencia, nao compromisso.
  const CANONICAS = new Set(['SPRINT', 'SPRINT_DIA_UNICO', 'SPRINT_EM_CURSO']);
  const chaveHoje = hojeIso ? hojeIso.slice(0, 7) : null;
  meses.forEach((mes, indice) => {
    const entradasDoMes = mes.dias.flatMap((dia) => dia.entradas);
    mes.resumo = {
      sprints: entradasDoMes.filter((entrada) => CANONICAS.has(entrada.kind)).length,
      marcos: entradasDoMes.filter((entrada) => entrada.kind === 'MARCO').length,
      prazos: entradasDoMes.filter((entrada) => entrada.kind === 'PRAZO').length,
      encerramentos: entradasDoMes.filter((entrada) => entrada.kind === 'SPRINT_FIM').length,
      atrasados: entradasDoMes.filter((entrada) => entrada.atrasada).length
    };
    mes.contemHoje = mes.chave === chaveHoje;
    mes.lacunaAntes = indice > 0 ? lacunaEntreMeses(meses[indice - 1].chave, mes.chave) : null;
  });

  const mesFocal = calcularMesFocal(meses, hojeIso);

  const prazos = entradas.filter((entrada) => entrada.kind === 'PRAZO');
  const atrasados = prazos.filter((entrada) => entrada.atrasada);
  const marcosAtrasados = entradas.filter((e) => e.kind === 'MARCO' && e.atrasada);

  const emCursoAgora = sprints
    .filter((sprint) => {
      // "Agora" e mais estrito que a leitura historica: uma sprint ja concluida
      // nao esta em curso hoje, ainda que sua janela alcance a data de hoje.
      if (isTerminalSprint(sprint.status)) return false;
      const inicio = toIsoDay(sprint.startDate);
      const fim = toIsoDay(sprint.endDate);
      return inicio && fim && hojeIso >= inicio && hojeIso <= fim;
    })
    .map((sprint) => {
      const decorridos = diffEmDias(toIsoDay(sprint.startDate), hojeIso);
      return {
        name: sprint.name,
        nota: sprint.durationInDays ? `dia ${decorridos + 1} de ${sprint.durationInDays}` : null,
        statusLabel: sprintStatusLabels[sprint.status] || sprint.status,
        statusClass: statusClass(sprint.status)
      };
    });

  const proximo = entradas.find((entrada) => entrada.dia > hojeIso) || null;

  return {
    hojeIso,
    janela,
    modo: dias.length > LIMITE_AGENDA_ABERTA && meses.length >= 3 ? 'MESES_COLAPSADOS' : 'ABERTA',
    mesFocal,
    // Alvo do atalho "Ir para agora": hoje raramente tem evento, entao o alvo
    // e o primeiro dia com algo por vir; num projeto todo no passado, o ultimo.
    diaAgora: dias.find((dia) => dia.iso >= hojeIso)?.iso ?? dias[dias.length - 1]?.iso ?? null,
    contagem: {
      sprints: sprints.length,
      marcos: milestones.length,
      prazos: prazos.length,
      tarefasSemPrazo: semPrazo.length,
      dias: dias.length,
      ocultosForaDoPeriodo
    },
    situacao: {
      emCurso: emCursoAgora,
      proximo: proximo
        ? {
            dia: proximo.dia,
            relativo: relativeDayLabel(proximo.dia, hojeIso),
            titulo: proximo.title,
            tipo: ROTULO_POR_TIPO[proximo.kind]
          }
        : null,
      atencao: {
        total: atrasados.length + marcosAtrasados.length,
        itens: [...atrasados, ...marcosAtrasados].map((entrada) => entrada.title)
      }
    },
    meses,
    semPrazo,
    vazio: entradas.length ? null : janela.filtrada ? 'FILTRO_VAZIO' : 'SEM_DADOS'
  };
}
