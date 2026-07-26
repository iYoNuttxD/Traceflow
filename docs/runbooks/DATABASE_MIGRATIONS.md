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

`db:test:migrate` executa `prisma migrate deploy` no datasource protegido. A CI aplica as 25 migrations em banco vazio e repete o deploy para comprovar ausência de pendências. Não use `prisma migrate reset` em desenvolvimento.

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

Scripts E8/E11 são dry-run/auditoria ou exigem confirmação explícita. Eles não substituem backup nem autorizam associação de dados por nome.

