// Controller de requisitos. Requisitos sao cards simples ligados a um projeto.
// TODO: Delegar ao service os fluxos de RF48 e RF49.
export const requirementController = {
  async notImplemented(req, res) {
    return res.status(501).json({ message: 'Requirement endpoint prepared for future development.' });
  }
};
