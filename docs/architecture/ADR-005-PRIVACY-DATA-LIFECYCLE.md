# ADR-005 — Ciclo de vida de dados pessoais

- Estado: aceita e consolidada na L2
- Data: 02/08/2026

## Decisão

Desativação é reversível por confirmação de e-mail e permite somente login restrito. Exclusão é uma solicitação com senha, carência de 30 dias e cancelamento. Ao vencer a carência, o comando controlado adquire lease e aplica anonimização seletiva: mantém o `User.id` e relações históricas, neutraliza snapshots conhecidos, troca o e-mail por identificador opaco não entregável, remove credenciais e desativa memberships. Hard delete foi rejeitado por quebrar autoria, movimentos e auditoria.

Auditoria é retida separadamente e mantém `actorUserId` apontando para a identidade já anonimizada enquanto necessário. Conteúdo GitHub permanece como histórico externo; correlação automática por e-mail/login não prova identidade. Exportação é ZIP com JSONs e manifesto, gerado sob demanda, autenticado e sem arquivo público.

Último OWNER deve transferir propriedade antes de desativação/anonimização. Sessões, resets e convites seguem retenção técnica própria. Obrigações conflitantes devem suspender apenas o expurgo necessário, com decisão documentada fora da aplicação; nenhuma “legal hold” automática foi inventada.

## Alternativas

- hard delete: rejeitado por integridade referencial/histórica;
- soft delete apenas: insuficiente para reduzir PII após solicitação elegível;
- pseudonimização reversível: rejeitada como resultado final;
- anonimização seletiva com retenção: adotada;
- apagar artifacts GitHub: rejeitado por autoria de terceiros e fonte externa.

## Consequências

Backups e revisão jurídica continuam operacionais. A anonimização é um comando idempotente, não roda no startup e depende de cron/runner externo documentado.
