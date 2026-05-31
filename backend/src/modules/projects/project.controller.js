// Controller de projetos. Recebera HTTP e delegara regras ao service.
// TODO: Implementar RF01 e RF22 sem colocar regras de negocio neste arquivo.
export const projectController = {
  async notImplemented(req, res) {
    return res.status(501).json({ message: 'Project endpoint prepared for future development.' });
  }
};
