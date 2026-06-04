// Service GitHub: coordena casos de uso do modulo sem acessar HTTP diretamente.
// TODO: Implementar importacao de commits, pull requests e issues em tarefas futuras.
import { checkGithubAuthentication } from './github.client.js';

export const githubService = {
  async checkAuthentication() {
    return checkGithubAuthentication();
  }
};
