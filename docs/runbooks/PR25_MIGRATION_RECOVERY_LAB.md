# PR25-01 — recuperação controlada de migration parcial (laboratório)

Este procedimento foi executado somente em schemas sintéticos de uma instância MySQL
local descartável. Não autoriza `migrate resolve`, reset, alteração de histórico ou
qualquer acesso à produção/OCI. Escritores devem estar suspensos durante migrations.

## Causa e limites transacionais

A migration `20261013171000_requirement_lifecycle_basis` antiga cria uma tabela
TEMPORARY, mas o contrato produtivo contém apenas SELECT, INSERT, UPDATE, CREATE,
ALTER, INDEX e REFERENCES. A falha P3018/MySQL 1044 ocorre depois do ALTER TABLE.
O ALTER persiste; a transação DML não concluída é revertida quando a conexão encerra.
Não há rollback automático desse DDL. Ver [MySQL: commits implícitos](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html).

A correção usa duas CTEs idênticas: primeiro insere somente transições reais no histórico;
depois insere/atualiza o estado. O status deriva desse estado dentro da mesma transação.
As fontes da projeção não dependem do estado/histórico alterados. `unicode_ci` é
explícita no texto derivado. Nenhuma tabela auxiliar, view ou novo privilégio é exigido.

## Reprodução automatizada

Com Node 22, dependências instaladas e Prisma Client gerado, execute no diretório backend:

```sh
npm run db:test:validate-restricted
```

O comando exige `MIGRATION_LAB_ADMIN_URL` explícita apontando para localhost/127.0.0.1
ou ::1 e um schema com marcador `test`, diferente de `DATABASE_URL`. Não lê `.env`.
O laboratório cria schemas únicos e uma conta sintética; remove somente seus próprios
schemas/conta ao terminar. Credenciais são geradas em memória e não são reportadas.

As 84 migrations da base `6de5ece5e7af3a7edcd1c24f15f78f16d0b6ec0c` são conferidas
por SHA-256 antes da preparação. Essa preparação usa administração: a cadeia histórica
contém DROP/DELETE anteriores ao contrato OCI. Nenhuma das 84 foi editada.
O upgrade de todas as migrations posteriores ao manifesto é executado exclusivamente
pela conta restrita, incluindo futures migrations adicionadas à cadeia. O controle vazio
é uma base 84 sem dados de domínio, seguida pelo mesmo upgrade restrito; não é uma
alegação de que o bootstrap histórico com DROP possa rodar com os sete privilégios.

## Recuperação exercitada

1. Preparar as 84 migrations e fixtures representativas; guardar snapshots completos.
2. Executar o deploy restrito com a migration 85 e a SQL antiga da 86: exigir P3018/1044.
3. Verificar migration 85 concluída, coluna `lifecycleBasis` presente, linha Prisma da 86
   com `finished_at=NULL` e `rolled_back_at=NULL`, bases ainda GITHUB e histórico intacto.
4. Substituir a SQL da 86 pela revisão corrigida. Extrair somente o trecho desde
   `START TRANSACTION;`, porque o ALTER já ocorreu. Não remover/recriar a coluna.
5. Controle de atomicidade: executar esse trecho com erro deliberado após o INSERT de
   histórico. Exigir falha e verificar que histórico, estado e basis voltaram ao snapshot.
6. Executar o trecho corrigido com `prisma db execute` **pela conta restrita**. Conferir
   projeções canônicas, preservação e drift zero antes de registrar a recuperação.
7. Somente nesse laboratório, executar `prisma migrate resolve --applied` para a migration
   reconciliada. Isso registra o checksum corrigido e conserva a tentativa falha na trilha
   do Prisma; não há UPDATE/DELETE manual em `_prisma_migrations`.
8. Executar novamente `migrate deploy` e `migrate status` pela conta restrita; exigir 86
   migrations concluídas, checksums corretos, nenhuma tentativa pendente e drift zero.
   O redeploy não adiciona transições. Os 25 registros históricos antigos permanecem iguais.

Não reaplicar a SQL inteira sobre a coluna existente. Não marcar uma migration como
aplicada antes de verificar a reconciliação. Estados diferentes desse diagnóstico exigem
nova análise; o laboratório não é um utilitário genérico de recuperação produtiva.

## Checksums da migration 86

- Revisão antiga: `3f251ff8a50636960519b25bbcd68205ff1f7f2cd2a78e3b590487ac46d6b839`.
- Revisão corrigida: `4b442367cae65529bf5f96b7ca33735155f6cc0add9158bf4d7e050457f4e758`.
- O manifesto das 84 migrations está em `backend/scripts/fixtures/pr25-migration-baseline.json`.

Resultados locais: [evidência JSON](../deliveries/evidence/pr25-review-20261024/migrations-local.json).
O MySQL instalado localmente se identifica como 26.10.0; a compatibilidade com o MySQL
8.4.8 canônico também deve passar no gate obrigatório `Backend Tests` da nova revisão.
