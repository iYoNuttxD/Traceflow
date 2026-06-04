// Controller da integracao GitHub. Recebe HTTP e delega a comunicacao ao service.
// TODO: Preparar RF03, RF04, RF05, RF06 e RF50 sem implementar importacao completa aqui.
import { githubService } from './github.service.js';

export const githubController = {
  async checkAuthentication(req, res) {
    try {
      const githubUser = await githubService.checkAuthentication();

      return res.json({
        message: 'Autenticacao com GitHub realizada com sucesso.',
        githubUser
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao autenticar com GitHub.',
        error: error.message
      });
    }
  },

  async notImplemented(req, res) {
    return res.status(501).json({ message: 'GitHub endpoint prepared for future development.' });
  }
};
