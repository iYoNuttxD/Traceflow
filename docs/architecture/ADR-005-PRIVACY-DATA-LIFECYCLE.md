# ADR-005 — Ciclo de vida de dados pessoais

- Estado: aceita tecnicamente na E7
- Data: 24/07/2026

## Decisão

Desativação é reversível por processo operacional e bloqueia login/memberships. Exclusão é uma solicitação com senha, carência e cancelamento. Ao vencer a carência, o job controlado aplica anonimização seletiva: mantém o `User.id` e relações históricas, neutraliza nome/textos vinculados, troca e-mail por identificador aleatório `anonymous.invalid`, remove credenciais e desativa memberships. Hard delete foi rejeitado por quebrar autoria, movimentos e auditoria.

Auditoria é retida separadamente e mantém `actorUserId` apontando para a identidade já anonimizada enquanto necessário. Conteúdo GitHub permanece como histórico externo; correlação automática por e-mail/login não prova identidade. Exportação é JSON gerado sob demanda, autenticado, sem arquivo público, com autorização registrada em metadata de curta duração.

Último OWNER deve transferir propriedade antes de desativação/anonimização. Sessões, resets e convites seguem retenção técnica própria. Obrigações conflitantes devem suspender apenas o expurgo necessário, com decisão documentada fora da aplicação; nenhuma “legal hold” automática foi inventada.

## Alternativas

- hard delete: rejeitado por integridade referencial/histórica;
- soft delete apenas: insuficiente para reduzir PII após solicitação elegível;
- pseudonimização reversível: rejeitada como resultado final;
- anonimização seletiva com retenção: adotada;
- apagar artifacts GitHub: rejeitado por autoria de terceiros e fonte externa.

## Consequências

Backups, reativação manual, confirmação de e-mail e revisão jurídica continuam operacionais. A anonimização é manual/job idempotente, protegida contra banco de produção e não roda no startup.
