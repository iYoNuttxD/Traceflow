# Runbook — banco e migrations

## Preparação

- Use MySQL 8.4 compatível e credencial de menor privilégio.
- Confirme host, porta e nome do schema sem imprimir senha.
- Em testes, `TEST_DATABASE_URL` deve conter `test` e ser diferente de `DATABASE_URL`.
- Faça backup verificado antes de alteração destrutiva.

## Desenvolvimento e teste

```bash
cd backend
npm ci
npx prisma validate
npx prisma generate
npm run db:test:migrate
npm run db:test:status
```

`db:test:migrate` executa `prisma migrate deploy` no datasource protegido. A cadeia atual possui 39 migrations. `db:test:validate-empty` aplica a cadeia em banco temporário vazio; `db:test:validate-lr2-legacy` valida os guards e aliases da LR.2; `db:test:validate-lr2-recovery` prova o recovery completo sobre bancos temporários imediatamente pré-LR.2; `db:test:validate-lr5` prova o upgrade de collation sobre bancos temporários populado e histórico. Não use `prisma migrate reset` em desenvolvimento.

## LR.3.1 — evidência de autorização pessoal GitHub

A migration incremental
`20260821180000_lr3_1_github_repository_authorization_migration` adiciona o purpose OAuth
`REPOSITORY_AUTHORIZATION` e timestamps nullable de verificação/expiração em
`GitHubInstallationAuthorization`. Não há backfill: `NULL` significa que a permissão pessoal não
foi comprovada depois da LR.3 e o usuário deve concluir o OAuth dedicado. A Installation não pode
ser usada para preencher esses campos.

## LR.5 — preflight, collation e evolução representativa

`GitBranch.name` usa `utf8mb4_bin` para preservar a caixa original dos nomes recebidos do Git.
O schema Prisma documenta o tipo `VARCHAR(191)`, mas a collation por coluna continua sendo uma
propriedade física aplicada pela migration incremental
`20260821120000_lr5_gitbranch_case_sensitive`.

Antes do deploy, faça o inventário sanitizado, sem nomes de branches ou dados pessoais:

```bash
cd backend
npm run db:lr5:preflight
```

O relatório informa quantidade total, cardinalidade exata, cardinalidade ignorando caixa,
grupos duplicados exatos, grupos com variantes de caixa, collation, FKs, órfãos, projetos sem
OWNER ativo e definições de índices duplicadas. `BLOCKED_EXACT_DUPLICATES` exige correção e nova
análise; `MIGRATION_REQUIRED` é o estado esperado antes da LR.5; `SCHEMA_CONSISTENT` é o estado
esperado depois dela. Variantes como `Feature/Login` e `feature/login` são válidas e não são um
blocker.

Valide os três estados sem resetar banco existente:

```bash
npm run db:test:validate-empty
npm run db:test:validate-lr5
npm run db:test:validate-lr2-legacy
```

- vazio: aplica toda a cadeia em banco temporário;
- populado: aplica a baseline pré-LR.5, semeia entidades canônicas, executa o upgrade e compara
  contagens antes/depois;
- histórico: preserva branch inativa/reativada, `CommitBranch`, convite, privacy request e
  integração em transição;
- contract: dados incompatíveis continuam bloqueados pelos guards LR.2 antes dos `DROP`s.

Depois do deploy, confira a propriedade física e o alinhamento Prisma/MySQL:

```bash
npm run db:lr5:audit
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

O diff esperado é uma migration vazia. `prisma validate` e `prisma generate`, isoladamente, não
substituem `migrate status`, a auditoria física ou os validadores de evolução.

## Recovery de pessoa antes do contract LR.2

Execute este procedimento com os writes da aplicação suspensos e backup verificado. O guard da
migration `20260820120000_lr2_contract_legacy_consolidation` é uma proteção contra perda de dados,
não um erro a contornar. Nunca o remova, enfraqueça ou marque a migration como resolvida sem
comparar o SQL e o estado real.

Antes do deploy da LR.2, ou quando o preflight apontar legado, execute no checkout que contém o
recovery LR.2.1:

```bash
cd backend
npm run lr2:recovery:dry-run
```

O dry-run consulta o schema histórico por SQL, não escreve dados e emite somente destino
sanitizado, contagens e categorias de bloqueio. Ele resolve `ProjectMember` por e-mail normalizado
para exatamente um `User`, exige papel/estado equivalentes quando a `ProjectMembership` já existe
e planeja a criação da associação quando ela estiver ausente. Conflito de associação, identidade
ausente/ambígua, papel desconhecido ou ator canônico divergente resulta em `BLOCKED` e
`UNRESOLVED` maior que zero; nada é apagado.

Somente com `unresolved = 0`, aplique explicitamente:

```bash
# banco de desenvolvimento
npm run lr2:recovery -- --confirm-development

# banco cujo nome contenha prod/production
npm run lr2:recovery -- --confirm-production
```

O apply ocorre em uma transação: cria associações ausentes, materializa `movedByUserId`, nulifica
`TaskMovement.projectMemberId` e só então remove cada `ProjectMember` cuja equivalência foi
provada. Se qualquer item for irresolúvel, toda a execução é abortada sem alteração. Em seguida,
o próprio script repete os checks conceituais dos quatro guards LR.2: pessoa, movimento,
`Commit.branch` sem link canônico e aliases GitHub que não possam resultar em integração completa.
Só emite `SAFE_TO_CONTRACT` quando todas as contagens bloqueantes forem zero.
O script LR.2.1 corrige apenas pessoa/movimento; se os contadores de branch ou GitHub forem
positivos, ele aborta e o operador deve executar a reconciliação LR.2 correspondente antes de
repetir o recovery.

Repita o dry-run e só então aplique o contract:

```bash
npm run lr2:recovery:dry-run
npx prisma migrate deploy
npx prisma migrate status
```

Se `migrate deploy` já tiver falhado no guard, preserve banco e logs. Como DDL MySQL pode ter sido
aplicado parcialmente antes do guard, primeiro siga a seção “Migration com falha”; não tente
contornar o registro da migration nem repetir o deploy às cegas. O recovery não substitui a
análise do estado parcial.

## Produção

1. Revise SQL, lock esperado, volume e compatibilidade.
2. Execute dry-run/reconciliação em cópia representativa quando houver contract.
3. Gere e verifique backup conforme o runbook de backup.
4. Aplique durante janela aprovada:

```bash
cd backend
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

5. Verifique `/health/ready`, logs sanitizados e smoke funcional.

## Migration com falha

1. Pare novos deploys e preserve banco/logs sem PII.
2. Execute `npx prisma migrate status` e identifique a migration exata.
3. Não edite SQL já aplicado e não marque resolução sem verificar o banco.
4. Para falha sem alteração aplicada, corrija por migration nova.
5. Para alteração parcial, restaure backup ou aplique roll-forward revisado; registre contagens antes/depois.
6. `prisma migrate resolve` só pode ser usado por operador após comparar SQL e estado real.
7. Rode novamente status, testes de integração e smoke.

Scripts E8 são dry-run/auditoria ou exigem confirmação explícita. As fontes E6/E11 continuam como
etapas históricas de backfill/reconciliação; isoladamente elas não removem todo o legado bloqueante
da LR.2. O fechamento operacional suportado é `lr2:recovery:*`. Nenhum script substitui backup nem
autoriza associação de dados por nome.
