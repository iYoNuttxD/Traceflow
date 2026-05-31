// Controller de tarefas. A tarefa sera o elo entre planejamento e implementacao.
// TODO: Delegar ao service os fluxos de RF07, RF08, RF33, RF38 e RF52.
export const taskController = {
  async notImplemented(req, res) {
    return res.status(501).json({ message: 'Task endpoint prepared for future development.' });
  }
};
