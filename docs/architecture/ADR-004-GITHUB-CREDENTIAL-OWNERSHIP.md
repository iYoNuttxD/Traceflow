# ADR-004 — Titularidade da credencial GitHub

- **Estado:** transição aceita na E6
- **Data:** 24/07/2026

> A fronteira técnica e o provider adotados na E9 são detalhados no [ADR-007](ADR-007-GITHUB-CREDENTIAL-STRATEGY.md). Esta decisão histórica permanece válida quanto à titularidade sistêmica da credencial.

## Decisão

O `GITHUB_TOKEN` global permanece temporariamente como credencial técnica do sistema. Ele não representa o usuário autenticado, não concede papel de projeto e não é exposto ao frontend, banco, respostas ou logs. Autorização TRACEFLOW é verificada antes de listagem, importação ou sincronização.

OAuth/GitHub App por usuário/instalação não é introduzido nesta etapa porque exigiria novo fluxo de consentimento, armazenamento/rotação de credenciais e decisões de produto. A migração futura deve preferir GitHub App por instalação, com secret manager, escopos mínimos e trilha de auditoria.

## Risco residual

A API ainda compartilha quota e alcance do PAT entre usuários autorizados. Comprometimento do token tem blast radius sistêmico. Rotação, revogação e monitoramento seguem `SECRETS_POLICY.md`; a substituição é bloqueio operacional futuro, não razão para tratar o PAT como identidade.
