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
  createdAt: true,
  updatedAt: true
};

// DTO minimizado de tarefa no cronograma: sem e-mail, sem descricao, sem esforco.
const scheduleTaskSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  deadline: true,
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
  for (const participacao of ativas) {
    await tx.sprintTask.update({
      where: { id: participacao.id },
      data: { closedAt, exitStatus: statusById.get(participacao.taskId) ?? null }
    });
  }
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
  // travado e lanca erro de dominio. Prisma nao sai do repository, regra nao sai
  // do service, e as duas rodam na mesma transacao.
  async createWithinProjectLock(projectId, data, auditEvent, validate) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      await validate(sprints);
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
      await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
      const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
      await validate(sprints);
      const sprint = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return sprint;
    });
  },

  async updateStatus(id, data, auditEvent, { freezeAt = null } = {}) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${id} FOR UPDATE`;
      const sprint = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
      if (freezeAt) await freezeParticipations(tx, id, freezeAt);
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return sprint;
    });
  },

  // Mutacao do escopo com a sprint travada: leitura, validacao, calculo do delta
  // e escrita na MESMA transacao. Calcular o delta fora dela permitia que dois
  // PUT simultaneos partissem do mesmo retrato e aplicassem conjuntos
  // incompativeis — atomicidade por item nao e semantica de substituicao.
  async mutateScopeWithinSprintLock(sprintId, requestedTaskIds, buildPlan) {
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${sprintId} FOR UPDATE`;
      if (!locked.length) return null;

      const sprint = await tx.sprint.findUnique({ where: { id: sprintId }, select: sprintSelect });
      const participations = await tx.sprintTask.findMany({
        where: { sprintId },
        select: sprintTaskSelect
      });

      // Status e titulo de todo mundo que o plano pode tocar: as tarefas pedidas
      // e as que ja estao dentro. Sem as de dentro, uma saida nao teria de onde
      // tirar o status de saida a congelar.
      const involvedIds = [
        ...new Set([
          ...requestedTaskIds,
          ...participations
            .filter((participacao) => participacao.removedAt === null && participacao.taskId)
            .map((participacao) => participacao.taskId)
        ])
      ];
      const tasks = involvedIds.length
        ? await tx.task.findMany({
            where: { id: { in: involvedIds } },
            select: { id: true, projectId: true, sprintId: true, status: true, title: true }
          })
        : [];

      // Trava tambem as tarefas pedidas: o plano mexe em participacoes de OUTRAS
      // sprints, que o lock da sprint alvo nao cobre. Sem isto, dois movimentos
      // simultaneos da mesma tarefa para sprints diferentes se atropelariam.
      // A ordem sprint -> tarefa e a mesma em todos os caminhos, o que evita
      // ciclo de espera.
      if (requestedTaskIds.length) {
        await tx.$queryRaw`SELECT id FROM Task WHERE id IN (${Prisma.join(requestedTaskIds)}) FOR UPDATE`;
      }

      // Participacoes das tarefas pedidas em OUTRAS sprints, ainda nao removidas.
      // Inclui as de sprint ja encerrada de proposito: e delas que sai o vinculo
      // de continuidade. Quem decide fechar ou preservar e o plano.
      const activeElsewhere = requestedTaskIds.length
        ? await tx.sprintTask.findMany({
            where: {
              taskId: { in: requestedTaskIds },
              removedAt: null,
              sprintId: { not: sprintId }
            },
            select: sprintTaskSelect
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
