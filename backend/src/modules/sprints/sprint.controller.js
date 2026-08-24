// Controller do modulo de sprints. Apenas extrai entrada ja validada,
// chama o service e formata a resposta HTTP.
import { asyncHandler } from '../../shared/http/index.js';
import { sprintService } from './sprint.service.js';

const sprintFallback = 'Erro interno ao processar sprint.';
const milestoneFallback = 'Erro interno ao processar marco.';

const actorContext = (req) => ({
  actorUserId: req.auth.user.id,
  requestId: req.requestId
});

// A transicao pode ter tres efeitos, e quem clicou precisa saber de todos: a
// sprint mudou de estado, tarefas voltaram ao backlog (ADR-011 D07) e o marco
// pode ter sido concluido automaticamente (D05). Silenciar os dois ultimos faria
// a tela mudar sozinha em lugares que ninguem tocou.
function statusMessage(sprint, returnedToBacklog, milestoneCompleted) {
  const partes = ['Status da sprint atualizado com sucesso.'];
  if (returnedToBacklog > 0) {
    partes.push(
      returnedToBacklog === 1
        ? '1 tarefa não concluída voltou ao backlog.'
        : `${returnedToBacklog} tarefas não concluídas voltaram ao backlog.`
    );
  }
  if (milestoneCompleted) {
    partes.push(`O marco "${milestoneCompleted.title}" foi concluído automaticamente.`);
  }
  return partes.join(' ');
}

export const sprintController = {
  create: asyncHandler(
    async (req, res) => {
      const sprint = await sprintService.createSprint(
        req.params.projectId,
        req.body,
        actorContext(req)
      );
      return res.status(201).json({ message: 'Sprint cadastrada com sucesso.', sprint });
    },
    { fallbackMessage: sprintFallback }
  ),

  findByProject: asyncHandler(
    async (req, res) => {
      const sprints = await sprintService.findSprintsByProject(req.params.projectId, req.query);
      return res.json({ total: sprints.length, sprints });
    },
    { fallbackMessage: sprintFallback }
  ),

  findById: asyncHandler(
    async (req, res) => {
      const sprint = await sprintService.getSprintById(req.params.id);
      return res.json({ sprint });
    },
    { fallbackMessage: sprintFallback }
  ),

  update: asyncHandler(
    async (req, res) => {
      const sprint = await sprintService.updateSprint(req.params.id, req.body, actorContext(req));
      return res.json({ message: 'Sprint atualizada com sucesso.', sprint });
    },
    { fallbackMessage: sprintFallback }
  ),

  updateStatus: asyncHandler(
    async (req, res) => {
      const { sprint, returnedToBacklog, milestoneCompleted } =
        await sprintService.updateSprintStatus(req.params.id, req.body.status, actorContext(req));
      return res.json({
        message: statusMessage(sprint, returnedToBacklog, milestoneCompleted),
        sprint,
        // Efeitos colaterais explicitos no corpo, e nao apenas embutidos na
        // frase: a interface precisa reagir a eles (recarregar o quadro, marcar o
        // marco) sem interpretar texto.
        returnedToBacklog,
        milestoneCompleted
      });
    },
    { fallbackMessage: sprintFallback }
  ),

  // A rota continua registrada de proposito: removida, ela devolveria 404, que
  // se confunde com "sprint nao existe". O service recusa antes de qualquer
  // leitura ou mutacao (ADR-010 D06/D13).
  delete: asyncHandler(
    async () => {
      await sprintService.deleteSprint();
    },
    { fallbackMessage: 'Erro interno ao excluir sprint.' }
  ),

  findTasksBySprint: asyncHandler(
    async (req, res) => {
      const tasks = await sprintService.findTasksBySprint(req.params.id);
      return res.json({ sprintId: req.params.id, total: tasks.length, tasks });
    },
    { fallbackMessage: sprintFallback }
  ),

  replaceTasks: asyncHandler(
    async (req, res) => {
      const result = await sprintService.replaceTasks(
        req.params.id,
        req.body.taskIds,
        actorContext(req)
      );
      return res.json({
        message: 'Tarefas da sprint atualizadas com sucesso.',
        sprintId: result.sprintId,
        total: result.tasks.length,
        tasks: result.tasks
      });
    },
    { fallbackMessage: 'Erro interno ao atualizar tarefas da sprint.' }
  ),

  progress: asyncHandler(
    async (req, res) => {
      const progress = await sprintService.getSprintProgress(req.params.id);
      return res.json(progress);
    },
    { fallbackMessage: 'Erro interno ao calcular a evolução da sprint.' }
  ),

  createMilestone: asyncHandler(
    async (req, res) => {
      const milestone = await sprintService.createMilestone(
        req.params.projectId,
        req.body,
        actorContext(req)
      );
      return res.status(201).json({ message: 'Marco cadastrado com sucesso.', milestone });
    },
    { fallbackMessage: milestoneFallback }
  ),

  findMilestonesByProject: asyncHandler(
    async (req, res) => {
      const milestones = await sprintService.findMilestonesByProject(
        req.params.projectId,
        req.query
      );
      return res.json({ total: milestones.length, milestones });
    },
    { fallbackMessage: milestoneFallback }
  ),

  findMilestoneById: asyncHandler(
    async (req, res) => {
      const milestone = await sprintService.getMilestoneById(req.params.id);
      return res.json({ milestone });
    },
    { fallbackMessage: milestoneFallback }
  ),

  updateMilestone: asyncHandler(
    async (req, res) => {
      const milestone = await sprintService.updateMilestone(
        req.params.id,
        req.body,
        actorContext(req)
      );
      return res.json({ message: 'Marco atualizado com sucesso.', milestone });
    },
    { fallbackMessage: milestoneFallback }
  ),

  updateMilestoneStatus: asyncHandler(
    async (req, res) => {
      const milestone = await sprintService.updateMilestoneStatus(
        req.params.id,
        req.body.status,
        actorContext(req)
      );
      return res.json({ message: 'Status do marco atualizado com sucesso.', milestone });
    },
    { fallbackMessage: milestoneFallback }
  ),

  deleteMilestone: asyncHandler(
    async (req, res) => {
      await sprintService.deleteMilestone(req.params.id, actorContext(req));
      return res.json({ message: 'Marco excluído com sucesso.' });
    },
    { fallbackMessage: 'Erro interno ao excluir marco.' }
  ),

  getSchedule: asyncHandler(
    async (req, res) => {
      const schedule = await sprintService.getSchedule(req.params.projectId, req.query);
      return res.json(schedule);
    },
    { fallbackMessage: 'Erro interno ao montar o cronograma.' }
  )
};
