# OCI — Migrations controladas

> Atualização OCI06.1 (15/10/2026): **B00–B30 PASS informado pelo operador**; schema
> traceflow já criado e vazio, quatro contas bloqueadas, CA pública instalada. Não repetir
> esses lotes. O [pacote diagnóstico](OCI_HEATWAVE_PRISMA_DIAGNOSTIC.md) incorpora o estado
> atual e prepara D01/D02/B40/B41/D03/D04/relock, todos ainda pendentes de autorização.
> As afirmações anteriores sobre ausência de schema/contas são registros da preparação
> anterior, não o estado atual. Nenhuma operação OCI foi executada pelo Codex nesta continuação.


> Continuação OCI06.1: consultar o [bootstrap inicial preparado](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md)
> para o estado atualizado informado pelo operador e os lotes administrativos. Nenhuma execução autorizada.

Status: preparado e testado somente em banco descartável na OCI-DEPLOY-05.
Não executar na OCI nem no DEV com base neste documento. Consulte
[releases](OCI_RELEASE_DEPLOYMENT.md), [compatibilidade](OCI_MYSQL_COMPATIBILITY.md)
e [backup/restore](BACKUP_RESTORE.md).

## 1. Runtime e job administrativo

API e worker usam Prisma Client com usuário runtime sem DDL. O job é um comando administrativo
transitório executado pelo operador, com usuário distinto e artefato admin separado.
Nenhuma unidade systemd executa migrations. O código de negócio e as 67 migrations históricas
permanecem inalterados.

## 2. Prisma CLI 6.12.0

Client e CLI fixados em 6.12.0 pelo lockfile. A CLI vai em admin.tar.gz; runtime.tar.gz não
contém node_modules/prisma. A CLI é invocada pelo caminho absoluto com /usr/bin/node,
sem npx, download ou instalação no servidor. Não usar instruções de uma versão major
diferente: os argumentos foram testados contra 6.12.0.

## 3. migrate deploy

A única operação de alteração SQL implementada é `prisma migrate deploy --schema <admin/prisma/schema.prisma>`.
Não é executada pelo backend, preflight ou worker. O wrapper impõe pré-condições antes dela;
não chamar a CLI diretamente para contornar recusas. O comando não envolve seed/reset/import.
`migrate diff` é usado somente para inspeção sem execução do SQL produzido.

## 4. Permissões

Runtime: SELECT/INSERT/UPDATE/DELETE no próprio schema, sem CREATE/ALTER/DROP/INDEX.
Migration: usuário específico, privilégios necessários no próprio schema e sem escopo global,
GRANT OPTION, SUPER, FILE ou administração de usuários. Root/admin são recusados.
Grants herdados via roles ainda precisam de homologação: o parser conservador recusa formas
não previstas, em vez de aceitar privilégios desconhecidos.

O laboratório cria os usuários e bancos somente no mysqld de sua propriedade e dá SELECT
adicional no schema de ownership. Esse schema de controle não faz parte da aplicação.

## 5. TLS

Produção exige URL explícita com sslaccept=strict e sslcert apontando para CA absoluta,
opções revisadas, sessão Ssl_cipher não vazia e gates de homologação. Não usar skip-verify,
aceitação automática ou certificado sintético fora do laboratório. A interpretação de TLS,
a CA real, o certificado/hostname e o comportamento do HeatWave serão comprovados na OCI-06.

## 6. Isolamento

Testes exigem TEST_DATABASE_URL e TEST_RUNTIME_DATABASE_URL, nunca fallback em DATABASE_URL.
A presença ambígua de DATABASE_URL também recusa o job. O target descartável exige loopback,
porta >=49152, schema tf_oci_<12hex>_test, datadir e UUID exatos e nonce verificado por hash.
O harness cria uma instância própria; não usa 3306 nem o MySQL de desenvolvimento.

Fora do laboratório, variáveis são MIGRATION_DATABASE_URL e RUNTIME_DATABASE_URL.
URLs nunca são argumentos de processo, campos de manifesto ou saídas de log. Carregar os
valores por canal protegido do operador, sem imprimir ou salvar no repositório.

## 7. Identificação do banco

A autorização privada contém target.host, port, schema, serverUuid, version,
runtimeUser e migrationUser; laboratório também datadir e ownerHash.
O bridge confere URL, DATABASE(), @@server_uuid, @@port, VERSION() e privilégios.
Produção futura restringe host a 10.20.2.25, além das outras provas.
Nome de schema ou disponibilidade TCP, isoladamente, não identificam o banco.
Apenas dados públicos de identidade podem ser revisados; não registrar credenciais.

## 8. Pré-condições

Autorização root 0600 com operação migrate, releaseId/digest correspondentes, ambiente,
expiração UTC menor que 24h, writersControlled, backupVerified, restoreRehearsed,
backupReference e beforeFingerprint aprovado. Fora do laboratório, gates de produção
do runbook de releases também são obrigatórios. O servidor deve usar global time_zone +00:00.

API e worker devem estar parados, com MainPID=0. Entry points locais não supervisionados
também bloqueiam. A lista de escritores remotos continua responsabilidade explícita do operador.
Não basta colocar uma variável ENABLE_MIGRATIONS=true.

## 9. Exclusão mútua

Flock cobre stage/activate/rollback/recover/migrate/prune e mantém o mesmo inode.
GET_LOCK usa nome derivado do schema e permanece em uma transação Prisma na mesma conexão,
ReadCommitted, com timeout de 900s. IS_USED_LOCK deve continuar apontando àquela connection ID.
A CLI roda em processo separado sob esse lock; ownership é monitorado a cada 500 ms.
A CLI tem timeout de 300s, SIGTERM e limite de 5s para SIGKILL por timeout.

O lock cooperativo não impede DDL manual por outro administrador nem escrita de uma aplicação
remota não participante. O advisory lock nativo do Prisma também permanece habilitado.
Não excluir lockfiles ou desabilitar advisory locks para forçar execução.

## 10. Backups

backupReference deve identificar evidência de backup consistente, retenção, responsável e
restore ensaiado, externos ao pacote. Os gates não criam nem verificam o backup por conta própria.
No laboratório sem dados reais a referência é sintética e limitada àquele ambiente.
A rotina HeatWave, RPO/RTO, consistência com storage e restore real continuam bloqueadores;
não declarar que o teste de migration equivale a um teste de restauração.

## 11. Verificação do schema

`inspect-schema` usa a credencial runtime, lê metadata e histórico sem alterar dados.
A autorização tem operation=inspect-schema; o retorno inclui fingerprint, contagem de tabelas
e nomes/checksums aplicados. Revisar a referência antes de aprovar a migration.

```bash
python3 deploy/scripts/release.py inspect-schema --release-id "$RELEASE_ID" \
  --digest "$DIGEST_APROVADO" --authorization "$AUTORIZACAO_INSPECAO"
```

O histórico deve ser prefixo exato da cadeia; registros falhos/rolled-back são recusados.
Ordenação binária preserva a ordem exata dos nomes, inclusive timestamps iguais.
Schema não vazio sem baseline Prisma é recusado. O beforeFingerprint é revalidado imediatamente
antes da CLI. Ao terminar, toda a cadeia deve estar aplicada, sem drift em migrate diff.

## 12. Execução autorizada

Preparar release, parar escritores numa janela aprovada, obter snapshot e conferir backup.
Somente depois, com as credenciais protegidas já disponibilizadas ao processo:

```bash
python3 deploy/scripts/release.py migrate --release-id "$RELEASE_ID" \
  --digest "$DIGEST_APROVADO" --authorization "$AUTORIZACAO_MIGRATION"
```

Nenhum comando deste runbook foi executado no HeatWave. Após sucesso o serviço continua parado;
o guard exige ativação explícita. Nova execução é idempotente somente com nova autorização
cujo beforeFingerprint corresponda ao estado atual.

## 13. Logs e auditoria

Registrar release, descriptorSha256, versão CLI, referência de backup, aprovação, resultado,
nomes aplicados, fingerprint e horário. O script guarda recibo em shared/release-state e emite
eventos JSON limitados. Descarta stdout/stderr bruto da CLI para não divulgar SQL/dados.
Não ligar shell tracing ou copiar .env para evidência. Se necessário, diagnóstico detalhado
de banco requer acesso protegido separado e revisão humana.

## 14. Falha parcial

DDL MySQL não é uma transação reversível do deploy. Se a CLI falha, gravar migration-failed/
intervention-required e manter API/worker parados. Bloquear nova migration, activate e prune
normais. Não seguir para migrations posteriores, não alterar checksums, não apagar histórico.
O laboratório provocou falha real de ALTER após migrations iniciais, preservando o histórico
de falha e a quarentena.

## 15. Recuperação

`recover-migration` só pode reconhecer uma execução que já terminou completamente, com histórico
exato, fingerprint aprovado e diff limpo. Usa credencial readonly de runtime, não executa DDL
nem inicia serviços. É útil quando o processo perde a confirmação após conclusão do banco.

```bash
python3 deploy/scripts/release.py recover-migration --release-id "$RELEASE_ID" \
  --digest "$DIGEST_APROVADO" --authorization "$AUTORIZACAO_RECUPERACAO"
```

Histórico parcial/falho continua bloqueado. Reparação SQL, migrate resolve ou restauração
exigem investigação, plano específico, backup e autorização separada; não são automatizados.
Após reconhecimento, ativar explicitamente a aplicação compatível.

## 16. Proibição de reset

Nenhum caminho de operação chama migrate reset, migrate dev, db push, seed ou import.
A inicialização de um datadir vazio pelo harness pertence exclusivamente à instância nova
descartável. Não aplicar o harness ou seu marcador sobre banco existente.

## 17. Compatibilidade de rollback

Rollback de aplicação não reverte banco. A política atual exige schema.prisma e cadeia
idênticos entre candidata/anterior, mais histórico físico e fingerprint aprovados sem drift.
Não inferir compatibilidade pelo número de migrations, por uma mudança parecer aditiva ou
pelo comando ter retornado zero. Mudanças de contrato entre releases precisam de plano
de upgrade/recuperação separado. O mecanismo atual recusa essas promoções automaticamente.

## 18. HeatWave

A versão apresentada 26.7.0 não é homologação do serviço gerenciado. OCI-02 tem evidência de
MySQL 26.7 isolado; OCI-05 usa MySQL 8.4.8 isolado. Faltam confirmação de versão real/identidade,
TLS/CA, grants, autenticação, time_zone, locks, comportamento das migrations e restore no
ambiente autorizado. Não reutilizar UUID, porta ou CA do laboratório.

## 19. Testes em homologação

32 testes de filesystem/falhas e harness Linux ARM64: 67 migrations oficiais de schema vazio,
reexecução sem alterações, lock de sessão concorrente, flock, alvo incorreto, URL obrigatória,
drift físico, falha parcial real, DDL negado ao runtime, ativação/rollback API+worker e reboot.
Não representam execução no HeatWave. A suíte backend completa e os 14 validadores históricos
usam outro mysqld descartável próprio; nenhum usa DEV.

## 20. Checklist de produção

- HeatWave/TLS/CA/grants/identidade e fuso homologados; target explicitamente revisado.
- Artefato commitado, CLI 6.12.0 e hashes verificados; histórico imutável.
- Runtime sem DDL; migration com escopo mínimo; segredos fora do pacote/log/argv.
- Backup e restauração comprovados, RPO/RTO definidos, storage consistente.
- Escritores parados/controlados; lock local e de sessão disponíveis.
- BeforeFingerprint revisado; histórico sem falhas/divergência; aprovação específica vigente.
- Job aprovado; schema final/diff verificados; ativação e smoke explícitos.
- Em falha: quarentena, investigação e recuperação assistida; nunca reset automático.

Referências: [Prisma 6.12.0](https://github.com/prisma/orm/releases/tag/6.12.0) e
[MySQL 8.4 GET_LOCK/RELEASE_LOCK](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html).

## OCI06.1 — primeiro schema vazio e limite do job atual

O operador confirmou que traceflow ainda não existe e não há dados de aplicação. O
[bootstrap inicial preparado](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md) cria futuramente apenas
schema/contas, mediante autorização própria, sem migrations e sem exigir dump de dados inexistentes.
A cadeia atual continua em 68 migrations; Prisma Client/CLI 6.12.0.

O job atual exige backupVerified/backupReference/restoreRehearsed também para tableCount zero;
release.py acrescenta seus gates de produção. Não falsificar evidência nem chamar a CLI para
contornar esses gates. A seção 12 do novo runbook propõe uma entrega posterior para o caso
inicial vazio, com prova/revalidação de ausência de objetos, identidade, locks e autorização.
Isso não é flag implementada e não libera a primeira migration agora. global time_zone literal
+00:00 continua obrigatório no bridge; nenhuma configuração global é alterada pelo bootstrap.

## Continuação OCI06.1 — após bootstrap informado pelo operador

Em 15/10/2026 o operador informou B00, B10, B20, B21, B22, B23 e B30 PASS.
Schema traceflow: utf8mb4/utf8mb4_unicode_ci, zero tabelas/views/routines/triggers/events.
Contas traceflow_diag/API/worker/migrator @10.20.1.184 foram criadas com caching_sha2_password,
REQUIRE SSL, PASSWORD EXPIRE NEVER e ACCOUNT LOCK; backup continua adiado. Não recriar
schema, contas ou senhas. O bootstrap permanece separado das 68 migrations.

VERSION()=26.7.0-cloud; UUID=6e94bb7f-c601-11f1-9b91-02001704771f.
CA pública definitiva /etc/pki/traceflow/mysql-ca.pem, root:root 0644/cert_t;
fingerprint DER SHA-256 2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295.
TLS SERVER PASS é evidência do operador. PRISMA MANAGED PENDING, HEATWAVE MANAGED PARTIAL
e DR PRODUCTION PENDING permanecem. Nenhuma reconfirmação remota nesta entrega.

O novo [runbook do pacote Prisma](OCI_HEATWAVE_PRISMA_DIAGNOSTIC.md) descreve artefato mínimo,
launcher com credencial externa 0600, ambiente limpo, template de autorização inválido,
manifesto/checksums, instalação futura, execução somente leitura e relock.
O diagnóstico agora expande a role obrigatória public de forma limitada e mantém a recusa
de privilégios excessivos. Sua composição real no HeatWave ainda exige homologação.

Pendências distintas: time_zone UTC versus literal +00:00 exigido no migration job;
gates de backup/restore no primeiro schema vazio; DR real. O job não foi alterado e
nenhum backup lógico de dados inexistentes foi exigido. D01/D02/B40/B41/D03/D04 e relock
não foram executados nem autorizados por esta documentação. OCI-DEPLOY-07 não iniciada.
