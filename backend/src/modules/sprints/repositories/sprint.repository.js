// Repository de sprints. Todo acesso ao banco passa pelo Prisma parametrizado.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../database/prismaClient.js';
import { auditRepository } from '../../audit/audit.repository.js';

export const sprintSelect = {
  id: true,
  projectId: true,
  name: true,
  objective: true,
  startDate: true,
  endDate: true,
  status: true,
  startedAt: true,
  completedAt: true,
  milestoneId: true,
  createdAt: true,
  updatedAt: true
};

// DTO minimizado de tarefa no cronograma: sem e-mail, sem descricao.
//
// `estimatedEffort` entrou com o painel de andamento: a sprint passou a se
// descrever tambem em pontos, e derivar isso de outra chamada obrigaria a tela a
// baixar a lista completa de tarefas so para somar um numero. Nao e dado pessoal.
const scheduleTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  deadline: true,
  estimatedEffort: true,
  responsibleUserId: true,
  sprintId: true
};

export const sprintTaskSelect = {
  id: true,
  projectId: true,
  sprintId: true,
  taskId: true,
  taskTitleSnapshot: true,
  addedAt: true,
  addedAfterStart: true,
  carriedFromSprintId: true,
  removedAt: true,
  removalReason: true,
  exitStatus: true,
  closedAt: true
};

// DTO da tarefa dentro da sprint: o minimizado de sempre, mais o contexto da
// participacao que a interface precisa para sinalizar inclusao posterior e
// continuidade. Nenhum dado pessoal novo.
function toParticipatingTask(participation) {
  return {
    ...participation.task,
    addedAt: participation.addedAt,
    addedAfterStart: participation.addedAfterStart,
    carriedFromSprintId: participation.carriedFromSprintId,
    exitStatus: participation.exitStatus
  };
}

// Congela o ultimo status observado em cada participacao ainda ativa. Roda na
// mesma transacao do encerramento: se o congelamento falhar, a sprint nao muda
// de status, e nunca existe uma sprint fechada sem registro do que havia nela.
async function freezeParticipations(tx, sprintId, closedAt) {
  const ativas = await tx.sprintTask.findMany({
    where: { sprintId, removedAt: null },
    select: { id: true, taskId: true }
  });
  const taskIds = ativas.map((participacao) => participacao.taskId).filter(Boolean);
  const statusById = new Map(
    taskIds.length
      ? (
          await tx.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, status: true }
          })
        ).map((task) => [task.id, task.status])
      : []
  );
  // Agrupado por status de saida, e nao um UPDATE por participacao: o
  // encerramento roda segurando o lock do projeto, e uma sprint no limite de 100
  // tarefas custaria 100 idas ao banco com todo o cronograma parado atras — perto
  // demais do timeout de transacao do Prisma. Os status distintos de um quadro
  // sao poucos, entao o laco fica em um punhado de escritas.
  const idsPorStatus = new Map();
  for (const participacao of ativas) {
    const exitStatus = statusById.get(participacao.taskId) ?? null;
    if (!idsPorStatus.has(exitStatus)) idsPorStatus.set(exitStatus, []);
    idsPorStatus.get(exitStatus).push(participacao.id);
  }
  for (const [exitStatus, ids] of idsPorStatus) {
    await tx.sprintTask.updateMany({ where: { id: { in: ids } }, data: { closedAt, exitStatus } });
  }
}

// Serializa as escritas de cronograma de UM projeto — e apenas daquele.
//
// A linha de `Project` e o unico ponto que serve de mutex aqui. Travar as linhas
// de `Sprint` do projeto parece mais contido, mas nao serializa a CRIACAO: num
// projeto ainda sem sprint a leitura travada nao casa com registro nenhum, os
// locks de intervalo que ela toma sao compativeis entre si, e as duas insercoes
// seguintes se bloqueiam mutuamente — medido, nenhuma das duas criacoes passa.
//
// O preco e conhecido: toda mutacao de qualquer modulo grava um `AuditEvent` com
// `projectId`, e a FK dessa coluna pede o lock COMPARTILHADO da mesma linha no fim
// da transacao. Por isso todo caminho de cronograma toma o exclusivo na ENTRADA:
// meia adocao e pior que nenhuma — enquanto um caminho pedir o projeto por
// ultimo, ele fecha ciclo de espera com os que o pedem primeiro. Medido: com a
// transicao de status travando o projeto e a mutacao de escopo nao, o par deu
// deadlock em 25 de 25 execucoes.
function lockProject(tx, projectId) {
  return tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
}

export const sprintRepository = {
  findProjectById(projectId) {
    return prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  },

  findById(id) {
    return prisma.sprint.findUnique({ where: { id }, select: sprintSelect });
  },

  // Filtro por projeto no where, nao apenas por id: defesa em profundidade contra IDOR.
  findByIdInProject(id, projectId) {
    return prisma.sprint.findFirst({ where: { id, projectId }, select: sprintSelect });
  },

  findByProject(projectId, filters = {}) {
    return prisma.sprint.findMany({
      where: {
        projectId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.search ? { name: { contains: filters.search } } : {})
      },
      select: sprintSelect,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
    });
  },

  // A validacao de sobreposicao so vale se as sprints do projeto ficarem
  // estaveis entre a leitura e a escrita. Em MySQL/REPEATABLE READ, "consultar e
  // depois inserir" continua sendo corrida: duas criacoes simultaneas leem o
  // mesmo conjunto e ambas passam. O lock na linha do projeto serializa as
  // escritas de cronograma daquele projeto — e apenas daquele.
  //
  // `validate` e a regra de dominio, entregue pelo service: recebe o retrato
  // travado — `{ sprints, sprint, milestones }` — e lanca erro de dominio. Prisma
  // nao sai do repository, regra nao sai do service, e as duas rodam na mesma
  // transacao.
  //
  // Locks primeiro, leituras depois (ADR-010 D17). Em REPEATABLE READ o read view
  // nasce na PRIMEIRA leitura comum da transacao, e `SELECT ... FOR UPDATE` nao o
  // cria: ler antes de esperar pelo lock congela um retrato anterior a espera, e a
  // validacao passa a julgar um passado. A ordem e sempre Project -> Sprint ->
  // Milestone, para que duas transacoes nunca esperem uma pela outra invertidas.
  async createWithinProjectLock(projectId, data, auditEvent, validate) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      // Marcos do projeto pelo id: a sprint aponta para um deles, e a exclusao do
      // marco tambem passa pelo lock do projeto. Ler aqui — depois do lock — e o
      // que faz a validacao decidir sobre o estado que a escrita vai encontrar,
      // em vez de estourar uma violacao de FK que a interface nao sabe traduzir.
      const milestones = await tx.milestone.findMany({
        where: { projectId },
        select: { id: true }
      });
      await validate({ sprints, sprint: null, milestones });
      const sprint = await tx.sprint.create({
        data: { ...data, projectId },
        select: sprintSelect
      });
      if (auditEvent) {
        await auditRepository.create({ ...auditEvent, resourceId: String(sprint.id) }, tx);
      }
      return sprint;
    });
  },

  async updateWithinProjectLock(id, projectId, data, auditEvent, validate) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      // A propria sprint travada: o lock do projeto serializa as escritas de
      // cronograma, mas quem decide a janela final e o registro desta linha, e ele
      // precisa estar estavel entre a releitura e a escrita.
      const travada = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${id} FOR UPDATE`;
      if (!travada.length) return null;

      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      const sprint = sprints.find((item) => item.id === id) ?? null;
      // Marcos do projeto pelo id. Nao ha mais janela de marco a preservar
      // (ADR-011 D03): a leitura serve so para confirmar que o marco escolhido
      // ainda existe no instante da escrita.
      const milestones = await tx.milestone.findMany({
        where: { projectId },
        select: { id: true }
      });

      await validate({ sprints, sprint, milestones });

      const atualizada = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return atualizada;
    });
  },

  // A transicao e decidida DEPOIS do lock, sobre o status relido. Validar antes
  // da transacao deixava duas requisicoes partirem do mesmo estado: cancelar e
  // iniciar simultaneamente uma sprint PLANEJADA passava nas duas checagens, e a
  // segunda escrita gravava EM_ANDAMENTO sobre uma sprint ja encerrada — status
  // aberto convivendo com participacoes congeladas.
  //
  // `buildChange` e a regra, entregue pelo service: recebe o retrato travado e
  // devolve `{ data, auditEvent, freezeAt, backlog, milestone }`, ou lanca erro de
  // dominio.
  //
  // Ordem de locks Project -> Sprint -> Task -> Milestone (ADR-010 D17 Regra 2).
  // As tarefas entram porque o encerramento devolve ao backlog o que nao foi
  // concluido (ADR-011 D07), e o marco porque pode ser concluido junto (D05).
  async transitionWithinSprintLock(id, projectId, buildChange) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      // `milestoneId` vem junto da propria linha travada: e o unico dado que
      // decide qual marco travar, e ler por uma consulta comum aqui abriria o
      // read view antes dos locks seguintes.
      const travada = await tx.$queryRaw`
        SELECT id, milestoneId FROM Sprint WHERE id = ${id} FOR UPDATE`;
      if (!travada.length) return null;
      // `Number` porque o driver devolve o inteiro do SQL cru sem passar pelo
      // mapeamento do Prisma, e a comparacao com `sprint.milestoneId` abaixo e
      // estrita.
      const milestoneId = travada[0].milestoneId == null ? null : Number(travada[0].milestoneId);

      // Leitura TRAVADA — nao cria read view — so para descobrir quem esta dentro.
      // Sem isto, uma mutacao de escopo simultanea poderia acrescentar uma tarefa
      // depois desta leitura e ela terminaria presa numa sprint ja encerrada.
      const dentro = await tx.$queryRaw`
        SELECT taskId FROM SprintTask
        WHERE sprintId = ${id} AND removedAt IS NULL AND taskId IS NOT NULL
        FOR UPDATE`;
      // Ordem crescente de id, pela mesma razao de `mutateScopeWithinSprintLock`:
      // e o que impede que duas transacoes com conjuntos sobrepostos se esperem em
      // ordens opostas.
      const taskIds = [...new Set(dentro.map((linha) => Number(linha.taskId)))].sort(
        (a, b) => a - b
      );
      if (taskIds.length) {
        await tx.$queryRaw`SELECT id FROM Task WHERE id IN (${Prisma.join(taskIds)}) FOR UPDATE`;
      }

      // Marco por ultimo, fechando a ordem global de D17 Regra 2.
      if (milestoneId) {
        await tx.$queryRaw`SELECT id FROM Milestone WHERE id = ${milestoneId} FOR UPDATE`;
      }

      // Todos os locks tomados: so agora as leituras comuns (ADR-010 D17 Regra 1).
      const atual = await tx.sprint.findUnique({ where: { id }, select: sprintSelect });
      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      const tasks = taskIds.length
        ? await tx.task.findMany({
            where: { id: { in: taskIds } },
            select: { id: true, title: true, status: true, sprintId: true }
          })
        : [];
      // Irmas do mesmo marco, para decidir a conclusao automatica. Ja estao em
      // `sprints` quando pertencem a este projeto — e um marco nunca cruza
      // projetos, entao filtrar aqui basta.
      const milestoneSprints = milestoneId
        ? sprints.filter((sprint) => sprint.milestoneId === milestoneId)
        : [];

      const { data, auditEvent, freezeAt, backlog, milestone } = await buildChange({
        sprint: atual,
        sprints,
        tasks,
        milestoneSprints
      });

      const sprint = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (freezeAt) await freezeParticipations(tx, id, freezeAt);

      // Devolucao ao backlog DEPOIS do congelamento: `freezeParticipations` le o
      // status atual da tarefa para gravar `exitStatus`, e zerar o ponteiro antes
      // nao mudaria o status, mas inverter a ordem aqui e o tipo de coisa que uma
      // refatoracao futura quebra em silencio.
      let returnedToBacklog = 0;
      if (backlog?.taskIds?.length) {
        // `sprintId: id` no where e defesa em profundidade: o lock ja garante que
        // ninguem moveu a tarefa, e ainda assim a escrita se recusa a limpar o
        // ponteiro de uma tarefa que ja pertence a outra sprint.
        const alterados = await tx.task.updateMany({
          where: { id: { in: backlog.taskIds }, sprintId: id },
          data: { sprintId: null }
        });
        returnedToBacklog = alterados.count;
        if (backlog.historyEntries?.length) {
          await tx.taskHistoryEntry.createMany({ data: backlog.historyEntries });
        }
      }

      let milestoneCompleted = null;
      if (milestone) {
        milestoneCompleted = await tx.milestone.update({
          where: { id: milestone.id },
          data: { status: milestone.status },
          select: { id: true, title: true, status: true }
        });
      }

      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return { sprint, returnedToBacklog, milestoneCompleted };
    });
  },

  // Mutacao do escopo com a sprint travada: leitura, validacao, calculo do delta
  // e escrita na MESMA transacao. Calcular o delta fora dela permitia que dois
  // PUT simultaneos partissem do mesmo retrato e aplicassem conjuntos
  // incompativeis — atomicidade por item nao e semantica de substituicao.
  async mutateScopeWithinSprintLock(sprintId, projectId, requestedTaskIds, buildPlan) {
    return prisma.$transaction(async (tx) => {
      await lockProject(tx, projectId);
      const locked = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${sprintId} FOR UPDATE`;
      if (!locked.length) return null;

      // Leitura TRAVADA — nao cria read view — so para descobrir quem ja esta
      // dentro. A saida de uma tarefa mexe na participacao dela tanto quanto a
      // entrada: sem travar as duas pontas, um `replace` que remove X e outro que
      // leva X para outra sprint se atropelam, e X termina aberta nas duas.
      const dentro = await tx.$queryRaw`
        SELECT taskId FROM SprintTask
        WHERE sprintId = ${sprintId} AND removedAt IS NULL AND taskId IS NOT NULL
        FOR UPDATE`;

      // Ordem crescente de id: e o que impede que duas transacoes com conjuntos
      // sobrepostos esperem uma pela outra em ordens opostas.
      const taskIdsParaTravar = [
        ...new Set([...requestedTaskIds, ...dentro.map((linha) => Number(linha.taskId))])
      ].sort((a, b) => a - b);
      if (taskIdsParaTravar.length) {
        await tx.$queryRaw`SELECT id FROM Task WHERE id IN (${Prisma.join(taskIdsParaTravar)}) FOR UPDATE`;
      }

      // Todos os locks tomados: so agora as leituras comuns. O read view nasce
      // aqui, depois de toda espera, e enxerga o que os vizinhos confirmaram
      // (ADR-010 D17). Planejar sobre leituras feitas antes do lock deixava duas
      // transacoes moverem a mesma tarefa para sprints diferentes sem se verem.
      const sprint = await tx.sprint.findUnique({ where: { id: sprintId }, select: sprintSelect });
      const participations = await tx.sprintTask.findMany({
        where: { sprintId },
        select: sprintTaskSelect
      });

      // Status e titulo de todo mundo que o plano pode tocar: as tarefas pedidas
      // e as que ja estao dentro. Sem as de dentro, uma saida nao teria de onde
      // tirar o status de saida a congelar.
      const tasks = taskIdsParaTravar.length
        ? await tx.task.findMany({
            where: { id: { in: taskIdsParaTravar } },
            select: { id: true, projectId: true, sprintId: true, status: true, title: true }
          })
        : [];

      // Participacoes das tarefas pedidas em OUTRAS sprints, ainda nao removidas.
      // Inclui as de sprint ja encerrada de proposito: e delas que sai o vinculo
      // de continuidade. Quem decide fechar ou preservar e o plano.
      //
      // A ordem e deterministica porque o plano precisa distinguir a participacao
      // VIVA da congelada: sem `orderBy`, a mesma consulta podia entregar as duas
      // em qualquer ordem, e a escolha virava sorteio. Entre congeladas, a ordem
      // crescente de `closedAt` faz a ULTIMA do conjunto ser a mais recente, que e
      // a origem certa do vinculo de continuidade.
      const activeElsewhere = requestedTaskIds.length
        ? await tx.sprintTask.findMany({
            where: {
              taskId: { in: requestedTaskIds },
              removedAt: null,
              sprintId: { not: sprintId }
            },
            select: sprintTaskSelect,
            orderBy: [{ taskId: 'asc' }, { closedAt: 'asc' }, { sprintId: 'asc' }]
          })
        : [];

      const plan = await buildPlan({ sprint, participations, tasks, activeElsewhere });

      for (const saida of plan.close) {
        await tx.sprintTask.update({
          where: { id: saida.id },
          data: { removedAt: saida.at, removalReason: saida.reason, exitStatus: saida.exitStatus }
        });
      }
      for (const entrada of plan.open) {
        // Reentrada reabre a participacao em vez de criar outra: preserva
        // `addedAt` e `addedAfterStart`, coerente com "saiu e voltou nao entrou".
        if (entrada.id) {
          await tx.sprintTask.update({
            where: { id: entrada.id },
            data: {
              removedAt: null,
              removalReason: null,
              exitStatus: null,
              closedAt: null,
              taskTitleSnapshot: entrada.taskTitleSnapshot,
              carriedFromSprintId: entrada.carriedFromSprintId
            }
          });
        } else {
          await tx.sprintTask.create({
            data: {
              projectId: sprint.projectId,
              sprintId,
              taskId: entrada.taskId,
              taskTitleSnapshot: entrada.taskTitleSnapshot,
              addedAt: entrada.addedAt,
              addedAfterStart: entrada.addedAfterStart,
              carriedFromSprintId: entrada.carriedFromSprintId
            }
          });
        }
      }
      if (plan.detachTaskIds.length) {
        await tx.task.updateMany({
          where: { id: { in: plan.detachTaskIds } },
          data: { sprintId: null }
        });
      }
      if (plan.attachTaskIds.length) {
        await tx.task.updateMany({
          where: { id: { in: plan.attachTaskIds } },
          data: { sprintId }
        });
      }
      if (plan.historyEntries.length) {
        await tx.taskHistoryEntry.createMany({ data: plan.historyEntries });
      }
      if (plan.auditEvent) await auditRepository.create(plan.auditEvent, tx);

      return tx.task.findMany({
        where: { sprintId },
        select: scheduleTaskSelect,
        orderBy: [{ id: 'asc' }]
      });
    });
  },

  // Retrato da sprint para o RF35: participacoes com o status congelado, o
  // status atual da tarefa e para onde ela seguiu depois.
  //
  // Duas consultas indexadas ([sprintId, removedAt] e [carriedFromSprintId]) em
  // vez da varredura de TaskHistoryEntry que o calculo antigo exigia; a
  // continuidade sai de um join, e nao de comparacao de strings em memoria.
  async findParticipationsBySprint(sprintId) {
    const [participations, continuations] = await prisma.$transaction([
      prisma.sprintTask.findMany({
        where: { sprintId },
        select: { ...sprintTaskSelect, task: { select: { status: true } } },
        orderBy: [{ taskId: 'asc' }]
      }),
      prisma.sprintTask.findMany({
        where: { carriedFromSprintId: sprintId },
        select: { taskId: true, sprintId: true }
      })
    ]);

    const movedTo = new Map(
      continuations.map((continuation) => [continuation.taskId, continuation.sprintId])
    );
    return participations.map((participation) => ({
      taskId: participation.taskId,
      taskTitleSnapshot: participation.taskTitleSnapshot,
      addedAt: participation.addedAt,
      addedAfterStart: participation.addedAfterStart,
      carriedFromSprintId: participation.carriedFromSprintId,
      removedAt: participation.removedAt,
      removalReason: participation.removalReason,
      exitStatus: participation.exitStatus,
      // Null quando a tarefa foi excluida: o snapshot e o que resta dela.
      currentStatus: participation.task?.status ?? null,
      movedToSprintId: movedTo.get(participation.taskId) ?? null
    }));
  },

  // Dados do burndown (RF35): participacao, esforco estimado e o instante em que
  // cada tarefa foi concluida DENTRO desta sprint.
  //
  // O instante nao existe em `SprintTask` — a participacao guarda o resultado, nao
  // a data em que ele aconteceu — entao vem de `TaskHistoryEntry`. E a unica
  // serie temporal de status que o sistema tem; `TaskMovement` cobriria o mesmo
  // caso, mas o historico funcional e o registro canonico do RF38.
  //
  // O recorte pelo intervalo da participacao e o que impede contaminacao: uma
  // tarefa que passou pela Sprint 3 e foi concluida na Sprint 4 nao queimou
  // escopo da 3, e sem o recorte a conclusao apareceria nas duas.
  async findBurndownDataBySprint(sprint) {
    const participations = await prisma.sprintTask.findMany({
      where: { sprintId: sprint.id },
      select: {
        taskId: true,
        addedAt: true,
        removedAt: true,
        exitStatus: true,
        closedAt: true,
        task: { select: { status: true, estimatedEffort: true } }
      },
      orderBy: [{ taskId: 'asc' }]
    });

    const taskIds = participations.map((participation) => participation.taskId).filter(Boolean);
    const conclusoes = taskIds.length
      ? await prisma.taskHistoryEntry.findMany({
          where: {
            projectId: sprint.projectId,
            taskId: { in: taskIds },
            field: 'STATUS',
            toValue: 'CONCLUIDO'
          },
          select: { taskId: true, occurredAt: true },
          orderBy: [{ occurredAt: 'asc' }]
        })
      : [];

    const porTarefa = new Map();
    for (const entrada of conclusoes) {
      if (!porTarefa.has(entrada.taskId)) porTarefa.set(entrada.taskId, []);
      porTarefa.get(entrada.taskId).push(entrada.occurredAt);
    }

    return participations.map((participation) => {
      // Fim da participacao: a saida, ou o encerramento da sprint, ou o presente.
      const fim = participation.removedAt ?? participation.closedAt ?? null;
      const primeira = (porTarefa.get(participation.taskId) || []).find(
        (instante) => instante >= participation.addedAt && (!fim || instante <= fim)
      );
      return {
        taskId: participation.taskId,
        // Tarefa sem estimativa nao pesa no grafico. Assumir um valor padrao
        // inventaria escopo; contar zero apenas diz que ela nao foi medida.
        points: participation.task?.estimatedEffort ?? 0,
        addedAt: participation.addedAt,
        removedAt: participation.removedAt,
        closedAt: participation.closedAt,
        exitStatus: participation.exitStatus,
        currentStatus: participation.task?.status ?? null,
        completedAt: primeira ?? null
      };
    });
  },

  // Tarefas da sprint COM o contexto da participacao: quem entrou depois do
  // inicio, de onde veio e com que status saiu.
  //
  // A fonte e a participacao, e nao `Task.sprintId`. Numa sprint encerrada os
  // dois divergem de proposito: a tarefa pode ter seguido para a sprint
  // seguinte, e o ponteiro dela aponta para la — mas a composicao registrada
  // aqui continua sendo a que existia no encerramento.
  async findTasksBySprint(sprintId) {
    const participations = await prisma.sprintTask.findMany({
      where: { sprintId, removedAt: null },
      select: {
        addedAt: true,
        addedAfterStart: true,
        carriedFromSprintId: true,
        exitStatus: true,
        task: { select: scheduleTaskSelect }
      },
      orderBy: [{ taskId: 'asc' }]
    });
    return participations.filter((participation) => participation.task).map(toParticipatingTask);
  },

  // Carrega tarefas do projeto para validacao de pertencimento em lote.
  findTasksByIds(taskIds) {
    return prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, projectId: true, sprintId: true }
    });
  },

  // Agregado do cronograma em duas consultas com select explicito, sem N+1.
  // A composicao de cada sprint vem da participacao pelo mesmo motivo de
  // findTasksBySprint: numa sprint encerrada, `Task.sprintId` ja pode apontar
  // para a sprint seguinte, e o cronograma passaria a mostrar um passado
  // diferente do que aconteceu.
  scheduleData(projectId) {
    return prisma.$transaction([
      prisma.sprint.findMany({
        where: { projectId },
        select: {
          ...sprintSelect,
          sprintTasks: {
            where: { removedAt: null },
            select: {
              addedAt: true,
              addedAfterStart: true,
              carriedFromSprintId: true,
              exitStatus: true,
              task: { select: scheduleTaskSelect }
            },
            orderBy: [{ taskId: 'asc' }]
          }
        },
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }]
      }),
      // "Sem sprint" e uma pergunta sobre o presente: aqui o ponteiro e a fonte certa.
      prisma.task.findMany({
        where: { projectId, sprintId: null },
        select: scheduleTaskSelect,
        orderBy: [{ id: 'asc' }]
      })
    ]);
  }
};
