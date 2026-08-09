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
      const sprint = await sprintService.updateSprintStatus(
        req.params.id,
        req.body.status,
        actorContext(req)
      );
      return res.json({ message: 'Status da sprint atualizado com sucesso.', sprint });
    },
    { fallbackMessage: sprintFallback }
  ),

  delete: asyncHandler(
    async (req, res) => {
      await sprintService.deleteSprint(req.params.id, actorContext(req));
      return res.json({ message: 'Sprint excluída com sucesso.' });
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
