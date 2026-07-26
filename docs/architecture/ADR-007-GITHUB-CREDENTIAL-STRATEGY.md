# ADR-007 — Estratégia de credencial e fronteira GitHub

- **Estado:** aceita na E9
- **Data:** 25/07/2026
- **Relacionada:** [ADR-004](ADR-004-GITHUB-CREDENTIAL-OWNERSHIP.md)

## Contexto

O TRACEFLOW usa hoje um PAT técnico do servidor para consultar a API do GitHub. Esse segredo é sistêmico: não identifica o usuário autenticado no TRACEFLOW nem substitui a autorização por projeto. A E9 precisava tornar essa decisão explícita e impedir que módulos de domínio lessem o token ou construíssem clientes Octokit diretamente.

## Decisão

Enquanto não houver GitHub App ou OAuth, `GITHUB_TOKEN` permanece uma credencial técnica única do backend. Somente `github-credential.provider.js` lê a configuração validada e entrega a credencial ao factory de `github.client.js`. Controllers, services, repositories, frontend e persistência não recebem o token.

O client externo:

- fixa `https://api.github.com` como origem;
- aplica timeout e retry centralizados da E5;
- pagina explicitamente as coleções;
- converte respostas externas em DTOs mínimos antes de retorná-las ao domínio;
- não persiste dados e não conhece Prisma;
- produz erros normalizados e sanitizados.

Testes substituem somente a fronteira exportada; não existe resposta falsa no runtime. Falta de credencial gera erro público sanitizado, sem revelar nome, valor ou headers do segredo.

## Consequências

A quota, os escopos e o raio de impacto continuam compartilhados por todos os projetos. A autorização TRACEFLOW limita quem pode disparar operações, mas não reduz os privilégios do PAT no GitHub. Rotação e revogação seguem a política de segredos.

A evolução recomendada é GitHub App por instalação, com escopos mínimos, credenciais por organização/repositório, armazenamento em secret manager e trilha de auditoria. Essa mudança exige novo ADR, fluxo de consentimento, modelo de persistência e migração; não faz parte da E9.
