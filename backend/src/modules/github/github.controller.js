// Controller da integracao GitHub. Apenas delegara sincronizacao e consulta ao service.
// TODO: Preparar RF03, RF04, RF05, RF06 e RF50 sem chamadas externas neste arquivo.
export const githubController = {
  async notImplemented(req, res) {
    return res.status(501).json({ message: 'GitHub endpoint prepared for future development.' });
  }
};
