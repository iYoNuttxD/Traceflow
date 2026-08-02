# ADR-010 — Identidade e ciclo de vida da conta

**Status:** aceito na L2  
**Data:** 2026-08-02

## Contexto

Nome, username e e-mail precisam mudar sem quebrar projetos ou autoria. Desativação, exclusão e revogação de integrações não podem apagar rastreabilidade compartilhada.

## Decisão

`User.id` é a identidade permanente de todos os relacionamentos canônicos. A conta segue `ACTIVE → DEACTIVATED → ACTIVE`, `ACTIVE → DELETION_PENDING → ACTIVE` e `DELETION_PENDING → ANONYMIZED`. O backend centraliza essa matriz em `requireAccountState`.

Troca de e-mail usa solicitação transacional, token temporário somente em hash e confirmação antes de atualizar `User.email`. Exclusão possui 30 dias de carência. Um comando idempotente com lease processa pedidos vencidos; ele anonimiza a pessoa, remove credenciais e acessos, mas preserva projetos, artefatos e autoria histórica ligada ao usuário anonimizado.

`GitHubInstallationAuthorization` é consentimento pessoal e pode ser removida sem remover `GitHubInstallation`, integrações de projeto ou autorizações de terceiros. O processor segue a mesma separação.

## Alternativas rejeitadas

- relacionar por e-mail/username, pois a mutabilidade quebraria integridade;
- trocar e-mail imediatamente, pois não provaria o endereço novo;
- hard delete, pois destruiria histórico e rastreabilidade;
- reativar apenas com senha, confundindo autenticação com consentimento;
- scheduler dentro do servidor web, por duplicar jobs;
- remover instalação GitHub junto da autorização pessoal, por afetar projetos e terceiros.

## Consequências

O sistema mantém registros anonimizados para integridade. O processor precisa de cron/runner externo e monitoramento. Confirmações dependem da entrega de e-mail. O ZIP sob demanda deverá migrar para streaming se o volume crescer.
