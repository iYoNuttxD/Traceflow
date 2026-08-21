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

`db:test:migrate` executa `prisma migrate deploy` no datasource protegido. A cadeia atual possui 35 migrations. `db:test:validate-empty` aplica a cadeia em banco temporário vazio; `db:test:validate-lr2-legacy` valida os guards e aliases da LR.2; `db:test:validate-lr2-recovery` prova o recovery completo sobre bancos temporários imediatamente pré-LR.2. Não use `prisma migrate reset` em desenvolvimento.

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
