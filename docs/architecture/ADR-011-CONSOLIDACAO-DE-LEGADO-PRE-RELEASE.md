# ADR-011 — Consolidação de legado e compatibilidade pré-release

- **Estado:** aceita na LR.2
- **Data:** 20/08/2026
- **Substitui:** ADR-008 para decisões de compatibilidade posteriores à LR.2

## Contexto

O TRACEFLOW continua em desenvolvimento pré-release, sem API pública versionada nem
consumidores externos oficialmente suportados. A política conservadora da E15 preservou
aliases, endpoints e models enquanto a arquitetura canônica ainda era consolidada. Após
LR.1, a auditoria LR.2 demonstrou quais caminhos tinham consumidor ou dado necessário e
quais apenas duplicavam a implementação atual.

## Decisão

A fonte canônica vigente tem precedência. Compatibilidade interna não é mantida apenas por
ter existido: exige requisito atual, consumidor real, dado necessário, recuperação de banco
suportado, integridade técnica ou integração externa comprovada.

O contract LR.2 estabelece:

- `User` + `ProjectMembership` como única participação identificável em projeto;
- `ProjectGitHubIntegration` como única autoridade de identidade, configuração e estado da
  conexão projeto–repositório;
- `GitBranch` + `CommitBranch` como única representação de branches de commit;
- `/api/settings/*` como API de conta e privacidade, preservando somente as rotas específicas
  `/api/account/reactivation/*`;
- `Project.accessCode` como capability atual, com link derivado e não persistido;
- `Task.responsible` e `TaskMovement.movedBy` como snapshots históricos, nunca como prova de
  identidade ou autorização.

Endpoints, DTOs, aliases, facades e models sem justificativa são removidos e passam a
responder pelo comportamento global de rota desconhecida quando aplicável. Não se cria
dual-write ou segunda camada de compatibilidade para substituí-los.

## Dados e migrations

Migrations históricas são imutáveis, mesmo quando contêm estruturas hoje removidas. Toda
contração usa nova migration incremental, precedida por inventário e consultas sanitizadas.
Guards interrompem a migration antes do `DROP` se houver dado sem representação canônica.
Rollback operacional é por roll-forward ou restore validado, nunca por edição de migration
aplicada ou reset de banco.

Ferramentas E6/E8/E11 podem permanecer somente como `RECOVERY_ONLY` ou evidência histórica.
Elas não são runtime e devem declarar o schema/baseline em que podem operar.

## Consequências

O runtime e o schema deixam de sustentar contratos paralelos. Mudança futura que precise
reintroduzir compatibilidade exige requisito explícito, prazo de retirada, teste e nova
decisão arquitetural. O verificador de arquitetura bloqueia os conceitos contraídos no
schema e no runtime atual, mas ignora deliberadamente migrations e documentação histórica.
