// Centraliza as variaveis de ambiente do backend.
// TODO: Adicionar validacoes de configuracao antes da integracao com banco e GitHub.
import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: process.env.PORT || 3001,
  databaseUrl: process.env.DATABASE_URL,
  githubToken: process.env.GITHUB_TOKEN
};
