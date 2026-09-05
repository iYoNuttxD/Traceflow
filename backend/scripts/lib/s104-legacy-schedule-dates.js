// Correção pontual dos registros de cronograma criados ANTES do ADR-010 D05.
//
// Enquanto `Sprint.startDate`, `Sprint.endDate` e `Milestone.dueDate` eram
// `@db.Date`, a escrita truncava para a meia-noite UTC. Depois que a leitura
// passou a exibir o instante no fuso do usuário, esses registros aparecem
// deslocados: `2026-08-09T00:00:00Z` é 08/08 às 21:00 em Brasília, ou seja um
// dia antes do que a pessoa escolheu.
//
// A correção move cada valor para a meia-noite LOCAL do mesmo dia civil, que é o
// que a pessoa quis dizer ao informar apenas a data.
//
// Só são tocados os valores em meia-noite UTC exata. Qualquer outro instante foi
// informado com hora — por um formulário `datetime-local` ou por um cliente que
// mandou offset — e mexer nele destruiria justamente o dado que o D05 preserva.

const ehMeiaNoiteUtc = (data) =>
  data instanceof Date &&
  data.getUTCHours() === 0 &&
  data.getUTCMinutes() === 0 &&
  data.getUTCSeconds() === 0 &&
  data.getUTCMilliseconds() === 0;

// Mesmo dia CIVIL, agora à meia-noite local. `new Date(ano, mês, dia)` usa o fuso
// do processo — este script roda na máquina de quem opera, e é esse o fuso certo.
export function paraMeiaNoiteLocal(data) {
  return new Date(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate());
}

const descrever = (antes, depois) => ({
  de: antes.toISOString(),
  para: depois.toISOString(),
  diaCivil: antes.toISOString().slice(0, 10)
});

export async function runS104LegacyScheduleDates({ client, apply = false }) {
  const sprints = await client.sprint.findMany({
    select: { id: true, name: true, projectId: true, startDate: true, endDate: true },
    orderBy: { id: 'asc' }
  });
  const milestones = await client.milestone.findMany({
    select: { id: true, title: true, projectId: true, dueDate: true },
    orderBy: { id: 'asc' }
  });

  const planoSprints = [];
  for (const sprint of sprints) {
    const mudancas = {};
    if (ehMeiaNoiteUtc(sprint.startDate)) mudancas.startDate = paraMeiaNoiteLocal(sprint.startDate);
    if (ehMeiaNoiteUtc(sprint.endDate)) mudancas.endDate = paraMeiaNoiteLocal(sprint.endDate);
    if (!Object.keys(mudancas).length) continue;
    planoSprints.push({
      id: sprint.id,
      nome: sprint.name,
      projectId: sprint.projectId,
      ...(mudancas.startDate ? { inicio: descrever(sprint.startDate, mudancas.startDate) } : {}),
      ...(mudancas.endDate ? { fim: descrever(sprint.endDate, mudancas.endDate) } : {}),
      mudancas
    });
  }

  const planoMarcos = [];
  for (const marco of milestones) {
    if (!ehMeiaNoiteUtc(marco.dueDate)) continue;
    const novo = paraMeiaNoiteLocal(marco.dueDate);
    planoMarcos.push({
      id: marco.id,
      titulo: marco.title,
      projectId: marco.projectId,
      prazo: descrever(marco.dueDate, novo),
      mudancas: { dueDate: novo }
    });
  }

  // Todos os valores deslocam pelo mesmo offset, então a ordem relativa não muda
  // e nenhuma sobreposição nova pode nascer. A verificação fica assim mesmo: é
  // barata, e o invariante importa mais que a suposição.
  const conflitos = detectarSobreposicao(sprints, planoSprints);

  if (apply && !conflitos.length) {
    await client.$transaction(async (tx) => {
      for (const item of planoSprints) {
        await tx.sprint.update({ where: { id: item.id }, data: item.mudancas });
      }
      for (const item of planoMarcos) {
        await tx.milestone.update({ where: { id: item.id }, data: item.mudancas });
      }
    });
  }

  return {
    aplicado: apply && !conflitos.length,
    sprintsAnalisadas: sprints.length,
    marcosAnalisados: milestones.length,
    sprintsAfetadas: planoSprints.length,
    marcosAfetados: planoMarcos.length,
    conflitos,
    // O relatorio mostra o de/para legivel; `mudancas` e o payload do update e
    // nao acrescenta nada para quem le a saida.
    sprints: planoSprints.map((item) => semPayload(item)),
    marcos: planoMarcos.map((item) => semPayload(item))
  };
}

const semPayload = (item) =>
  Object.fromEntries(Object.entries(item).filter(([chave]) => chave !== 'mudancas'));

function detectarSobreposicao(sprints, plano) {
  const porId = new Map(plano.map((item) => [item.id, item.mudancas]));
  const depois = sprints.map((sprint) => ({
    id: sprint.id,
    nome: sprint.name,
    projectId: sprint.projectId,
    startDate: porId.get(sprint.id)?.startDate ?? sprint.startDate,
    endDate: porId.get(sprint.id)?.endDate ?? sprint.endDate
  }));

  const conflitos = [];
  for (let i = 0; i < depois.length; i += 1) {
    for (let j = i + 1; j < depois.length; j += 1) {
      const a = depois[i];
      const b = depois[j];
      if (a.projectId !== b.projectId) continue;
      if (a.startDate < b.endDate && b.startDate < a.endDate) {
        conflitos.push({ projectId: a.projectId, entre: [a.nome, b.nome] });
      }
    }
  }
  return conflitos;
}
