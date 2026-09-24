# ADR-014 — Exclusão recuperável e purge definitivo de projetos

- **Estado:** aceita para a implementação da PR #21; operação em produção condicionada ao agendamento externo e à política de backup
- **Data:** 23/09/2026

## Contexto

Excluir um projeto afeta todo o seu grafo relacional, artefatos GitHub, membros, convites, histórico e evidências privadas. A remoção imediata impede recuperação de enganos; manter o projeto acessível durante a carência viola a expectativa de exclusão. Banco e filesystem não participam da mesma transação.

## Decisão

Somente um `OWNER` com membership ativa pode solicitar a exclusão. O instante de confirmação é gravado em `Project.deletedAt`; `deletionScheduledFor` é exatamente `deletedAt + 30 × 24 horas`, em UTC. O projeto deixa imediatamente de aparecer nas listas e de autorizar leituras, writes, sincronização ou webhooks project-scoped. Recursos ordinários respondem com `404` opaco. Convites pendentes são revogados e não revivem no restore.

Durante a carência, preservam-se o grafo do projeto, memberships e papéis, históricos, artefatos GitHub e bytes privados. O repositório permanece reservado. Um `OWNER` ainda ativo pode restaurar antes do prazo, limpando os campos de exclusão sem reconstruir dados. O mesmo `OWNER` pode antecipar a exclusão definitiva mediante confirmação forte com o nome do projeto para começar do zero com o repositório; ele só fica disponível depois do purge confirmado.

Depois do prazo, um executor externo recorrente chama `npm run projects:purge`. O script faz claim persistido/fenced por projeto, move evidências para staging privado, registra journal durável, remove o grafo sob o claim e conclui a remoção física. Falha física após o commit mantém journal `READY` para retry. Um purge abandonado só pode ser assumido após o limite de stale configurado; o worker anterior não pode finalizar o claim novo. A remoção da metadata exige cobertura de todas as evidências pelo journal do claim atual. O job é idempotente e não roda no startup da API. Frequência, monitoramento e recuperação estão no [runbook de purge](../runbooks/PROJECT_DELETION_PURGE.md).

`AuditEvent` permanece conforme sua retenção própria e minimização de metadata. A FK de projeto pode ser neutralizada no purge; o registro não preserva o grafo excluído nem bytes de evidência. A política de backup é separada: a remoção do banco primário não apaga cópias ainda dentro da janela de rotação. Produção exige aprovação e operação conforme [política de retenção](../privacy/DATA_RETENTION_POLICY.md) e [runbook de backup](../runbooks/BACKUP_RESTORE.md).

Uma conta pode ser desativada ou anonimizada enquanto seu único projeto está pendente de exclusão. Se nenhum `OWNER` elegível restar, não há recuperação pela UI; o projeto continua indisponível até o purge programado. A carência não deve reter a conta ativa artificialmente.

## Alternativas rejeitadas

- Exclusão relacional imediata: elimina a recuperação por erro humano.
- Marcar apenas `status = EXCLUIDO`: status legado não é autoridade de lifecycle e deixaria caminhos de autorização ativos.
- Apagar arquivos antes de journal/claim: uma falha entre filesystem e banco pode produzir órfãos irrecuperáveis.
- Timer no processo da API: reinício ou múltiplas instâncias não garantem execução nem exclusão mútua.

## Consequências e limites

A API e o storage precisam validar o estado atual do `Project` na fronteira de cada write, preservando ordem de lock `Project → Membership`. A operação permanente pode ser custosa e requer medição de volume e timeout explícito. O repositório fornece script e runbook, mas não prova que um scheduler de produção esteja instalado; sem ele, o prazo é uma obrigação operacional ainda pendente. A decisão não estabelece prazo jurídico para backups.
