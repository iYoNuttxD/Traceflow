# Runbook — backup e restore MySQL

## Escopo e segurança

Use credenciais próprias, diretório restrito e armazenamento criptografado. Dumps contêm dados pessoais, hashes e conteúdo de projeto; não versione, anexe à CI ou envie por canais não aprovados. Defina retenção e destruição segura com o controlador.

## Backup lógico

Com variáveis operacionais fora do histórico do shell:

```bash
mysqldump \
  --host="$MYSQL_HOST" \
  --port="$MYSQL_PORT" \
  --user="$MYSQL_USER" \
  --single-transaction \
  --skip-lock-tables \
  --no-tablespaces \
  --set-gtid-purged=OFF \
  --result-file="$BACKUP_PATH" \
  "$MYSQL_DATABASE"
```

Forneça a senha por mecanismo seguro do cliente (`mysql_config_editor`, secret injection ou `MYSQL_PWD` apenas no processo controlado), nunca como argumento/log. `--no-tablespaces` e `--skip-lock-tables` permitem backup com usuário de aplicação sem privilégios `PROCESS`/`LOCK TABLES`; confirme consistência para tabelas InnoDB.

Verifique:

```bash
test -s "$BACKUP_PATH"
sha256sum "$BACKUP_PATH"
```

Registre checksum, data, origem, versão MySQL, criptografia e responsável, sem dados do dump.

## Restore seguro

Restaure primeiro em schema isolado e vazio:

```bash
mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" \
  -e "CREATE DATABASE traceflow_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" \
  traceflow_restore_test < "$BACKUP_PATH"
```

Depois:

1. compare contagens de tabelas e registros críticos;
2. use `DATABASE_URL` apontando somente para o restore isolado e rode `npx prisma migrate status`;
3. valide autenticação, projetos, vínculos, auditoria e privacidade sem expor dados;
4. destrua o schema de teste e o dump conforme a retenção aprovada.

## Evidência E15

Foi testado um dump **somente de schema artificial**, após aplicar as 25 migrations em `traceflow_e15_backup_test`. O restore em `traceflow_e15_restore_test` preservou 21 tabelas e os dois schemas temporários e o arquivo foram removidos. Nenhum dado real foi exportado.

O primeiro comando sem opções de menor privilégio falhou por ausência de `PROCESS`/`LOCK TABLES`; essa é a razão técnica das opções documentadas acima.

