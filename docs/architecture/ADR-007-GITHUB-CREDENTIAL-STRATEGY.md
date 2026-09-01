# ADR-007 — Estratégia de credencial e fronteira GitHub

- **Estado:** histórica; substituída operacionalmente pelo ADR-009 na L1
- **Data:** 25/07/2026
- **Relacionada:** [ADR-004](ADR-004-GITHUB-CREDENTIAL-OWNERSHIP.md)

## Contexto histórico

Na E9, o TRACEFLOW usava um PAT técnico do servidor para consultar a API do GitHub. Esse segredo sistêmico não identificava o usuário autenticado nem substituía a autorização por projeto. A E9 tornou essa fronteira explícita e impediu que módulos de domínio lessem o token ou construíssem clientes Octokit diretamente.

## Decisão

Enquanto ainda não havia GitHub App ou OAuth, `GITHUB_TOKEN` era a credencial técnica única do backend. Controllers, repositories, frontend e persistência não recebiam o token.

O client externo:

- fixa `https://api.github.com` como origem;
- aplica timeout e retry centralizados da E5;
- pagina explicitamente as coleções;
- converte respostas externas em DTOs mínimos antes de retorná-las ao domínio;
- não persiste dados e não conhece Prisma;
- produz erros normalizados e sanitizados.

Testes substituem somente a fronteira exportada; não existe resposta falsa no runtime. Falta de credencial gera erro público sanitizado, sem revelar nome, valor ou headers do segredo.

## Evolução vigente

A evolução recomendada foi implementada na L1 e consolidada pela LR.9. O provider atual assina JWT da GitHub App e cria Installation Tokens sob demanda; User Tokens são efêmeros e restritos aos callbacks de autenticação ou à prova do install flow. Não existe PAT operacional ou fallback `GITHUB_TOKEN`. Permanecem válidas as decisões E9 de base externa fixa, timeout/retry, paginação, DTO mínimo e isolamento do client, agora aplicadas à GitHub App conforme o ADR-012.
