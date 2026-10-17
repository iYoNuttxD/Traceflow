# OCI — Migrations controladas

> **Contrato atual OCI-DEPLOY-07.1 (17/10/2026):** a primeira inicialização usa
> `inspect-initial-schema` e `migrate-initial`, conforme a seção ao final deste documento.
> As seções anteriores preservam o histórico OCI05/06; as antigas exigências de backup
> para schema vazio e de `+00:00` literal foram substituídas somente no contrato indicado.
> O operador informou homologação Prisma–HeatWave PASS na execução
> `2a4f2858-b760-493e-be4f-df10173ae993`. Isso não autoriza DDL nem comprova migrations em produção.

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


## OCI-DEPLOY-07.1 — primeira inicialização

Status: implementação e validação **locais**, sem acesso à OCI, VM ou HeatWave. As 68 migrations
foram executadas em MySQL Community 26.7.0 descartável, macOS ARM64, Node 22.23.3, Prisma Client/CLI
6.12.0. A homologação de conexão informada pelo operador não demonstra execução de DDL, grants do
migrator, locks, duração ou recuperação no serviço gerenciado. Não executar os exemplos sem uma
nova autorização humana específica. Nenhum pacote de release foi produzido nesta entrega.

### Operações e critérios distintos

| Operação | Estado do schema | Recuperação exigida | Ativa aplicação? |
| --- | --- | --- | --- |
| `inspect-initial-schema` | Zero objetos; `_prisma_migrations` inexistente | Plano inicial e inspeção administrativa válida | Não |
| `migrate-initial` | Mesma condição, revalidada sob lock; exatamente 68 migrations verificadas | `stop-and-review-empty-initialization` | Não |
| `migrate` | Histórico Prisma existente, íntegro e prefixo da cadeia aprovada | Backup verificado, referência e restore ensaiado | Não |
| `recover-migration` | Execução interrompida da mesma release/digest/cadeia; histórico já completo e diff limpo | Plano inicial correspondente ao journal, ou requisitos de upgrade | Não |
| `activate` / `rollback` / `recover` / `smoke` | Schema compatível e evidências de aplicação | Gates de recuperação, uploads, SMTP, GitHub App e publicação mantidos | Somente pelo fluxo próprio |

Uma tabela `_prisma_migrations` vazia **não** é primeira inicialização. Tabelas, views, routines,
triggers ou events existentes também recusam o caminho inicial, mesmo sem linhas. `migrate` não é
um fallback para esses estados: ausência de histórico exige investigação, nunca baseline fictícia.
A primeira inicialização não executa reset, seed adicional, db push, importação ou criação de schema/usuários.

### Prova independente de ausência e visibilidade

Uma conta com apenas os nove privilégios de migration não enxerga necessariamente todas as routines,
triggers e events. O laboratório demonstrou uma routine existente com contagem zero pelo migrator.
Por isso, o wrapper exige uma inspeção administrativa de leitura independente, além da inspeção
pela sessão Prisma. A inspeção administrativa usa o cliente MySQL textual e um plano SQL fixo,
gerado por `initialInspectionSql()` em `deploy/scripts/lib/migration-contract.mjs`.

A coleta contém quatro instruções, na mesma sessão, sem instruções intermediárias:

1. `SELECT JSON_ARRAY(...)` com identidade, configuração, inventário completo e identidades/roles do migrator.
2. `SHOW COUNT(*) WARNINGS` imediatamente após o SELECT; exige zero.
3. `SHOW GRANTS FOR CURRENT_USER`, com `USING` apenas quando houver **uma** role administrativa
   explicitamente autorizada, existente e ativa, cujos privilégios sejam expandidos.
4. `SHOW COUNT(*) WARNINGS` imediatamente após os grants; exige zero.

Não executar `USING public` para uma role ausente. Nenhum erro 3530, 1141 ou 1295 é aceito como prova
positiva. O contrato permite `mandatory_roles` vazio ou `public`, exige zero contas `public` em todos
os hosts, uma única conta do migrator (host completo), zero edges/default roles para esse nome,
`partial_revokes=1` e `activate_all_roles_on_login=0`. Outros perfis ficam bloqueados.

Os grants administrativos precisam demonstrar visibilidade efetiva de SELECT, EVENT e TRIGGER no
schema (ou global), e visibilidade de routines por SELECT global, SHOW_ROUTINE global ou privilégios
adequados de rotina no schema. Uma atribuição de role sem expansão não fornece essa prova. Roles
ativas adicionais, forma não reconhecida ou revogação parcial sobre o schema recusam a coleta.
A conta administrativa é usada **somente na leitura independente**; nunca recebe a URL do job Prisma.
Não conceder novos privilégios para contornar uma recusa. Confirmar direitos existentes e sua
visibilidade com o responsável. `catalogVisibilityReview` referencia essa revisão, sem substituir
os grants capturados e validados.

Referências oficiais MySQL 26.7: [ROUTINES](https://dev.mysql.com/doc/refman/26.7/en/information-schema-routines-table.html),
[TRIGGERS](https://dev.mysql.com/doc/refman/26.7/en/information-schema-triggers-table.html) e
[EVENTS](https://dev.mysql.com/doc/refman/26.7/en/information-schema-events-table.html).

### Formato da evidência e custódia

O transcript é UTF-8 estrito, até 16 KiB, com um array de 33 escalares na primeira linha,
`0` na segunda, uma ou mais linhas de grants, `0` ao final e newline final. Cabeçalhos,
linhas extras, erros, warnings, NULLs e valores incompletos são recusados. Índices do array:

| Índices | Conteúdo |
| --- | --- |
| 0–4 | `traceflow-initial-schema-v1`, authorizationId, releaseId, descriptorSha256, chainSha256 |
| 5–11 | Coleta epoch-ms UTC, UUID, versão exata, porta, schema, CURRENT_USER administrativo, connection ID |
| 12–19 | Charset/collation, mandatory_roles, contas public, nome migrator, contas por nome, edges, default roles |
| 20–24 | Contagens TABLES (inclui views), ROUTINES, TRIGGERS, EVENTS e `_prisma_migrations` |
| 25–29 | sql_notes, require_secure_transport, cipher TLS, versão TLS, conta migrator completa |
| 30–32 | partial_revokes, activate_all_roles_on_login, CURRENT_ROLE administrativo textual |

O CAST textual de CURRENT_ROLE é necessário: no MySQL 26.7, sua inclusão direta em JSON_ARRAY foi
observada como valor JSON binário opaco. Esse formato é recusado; o plano converte o valor em CHAR,
sem alterar a semântica da role. Não editar manualmente a saída para fazê-la passar.

O arquivo fica fora de Git/releases, em caminho absoluto real, root:root, 0400 ou 0600, link count 1,
sem symlinks e com ancestrais root não graváveis por grupo/outros. A abertura usa O_NOFOLLOW,
revalidação de inode/owner/mode/tamanho/mtime/ctime e ancestrais antes/depois da leitura. SHA-256,
identidade, autorização, release e cadeia devem corresponder. Hash não autentica a origem sozinho:
a custódia root e a coleta administrada são a raiz de confiança. O transcript contém metadata de
segurança, não senhas; manter privado e não anexar sua saída bruta a logs públicos.

Coleta no futuro ou com idade igual/superior a dez minutos é recusada. A prova é relida antes da
conexão e nos preflights da migration. A autorização expira em menos de 24 h pelo contrato de releases;
para esta operação, preparar uma janela de **no máximo dez minutos**, com tempo suficiente para
inspecionar e iniciar a execução. Expiração da autorização durante a CLI interrompe a operação.

A coleta administrativa e as sessões Prisma/CLI não são um snapshot atômico. O operador deve impedir
DDL, alterações de usuários/grants/roles/configuração e outros escritores nessa janela. GET_LOCK,
flock e o lock Prisma coordenam participantes; não impedem um administrador externo. Evidência
antiga não prova ausência atual: qualquer mudança ou dúvida exige parar e fazer nova coleta/aprovação.

### Autorização inicial

Preparar dois documentos privados, com `operation` respectivamente `inspect-initial-schema` e
`migrate-initial`. Usar o mesmo authorizationId da execução, release, digest, target, inspeção e plano;
o segundo recebe `beforeFingerprint` exatamente da inspeção revisada. Não reutilizar o ID em outra
janela. O esqueleto abaixo é deliberadamente inválido até preencher as referências reais aprovadas.
Não contém segredos nem gates de backup fictícios.

```json
{
  "formatVersion": 1,
  "authorizationId": "<UUID-v4-NOVO-DA-EXECUCAO>",
  "environment": "production",
  "operation": "inspect-initial-schema",
  "releaseId": "<RELEASE-ID-APROVADO>",
  "descriptorSha256": "<SHA256-APROVADO-DE-release.json>",
  "expiresAt": "<UTC-DA-JANELA-AUTORIZADA>",
  "target": {
    "host": "traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com",
    "expectedAddress": "10.20.2.25",
    "port": 3306,
    "schema": "traceflow",
    "serverUuid": "6e94bb7f-c601-11f1-9b91-02001704771f",
    "version": "26.7.0-cloud",
    "migrationUser": "traceflow_migrator",
    "migrationAccount": "traceflow_migrator@10.20.1.184",
    "runtimeUser": "traceflow_api",
    "runtimeAccount": "traceflow_api@10.20.1.184"
  },
  "gates": {
    "writersControlled": false,
    "heatwaveTlsHomologated": false,
    "deploymentAuthorized": false
  },
  "initialization": {
    "formatVersion": 1,
    "chainSha256": "<SHA256-DA-CADEIA-NO-MANIFESTO>",
    "schemaSha256": "<SHA256-DO-SCHEMA-NO-MANIFESTO>",
    "inspection": {
      "path": "<CAMINHO-ABSOLUTO-ROOT-DO-TRANSCRIPT>",
      "sha256": "<SHA256-DO-TRANSCRIPT-CONCLUIDO>",
      "inspectorAccount": "<CURRENT_USER-ADMINISTRATIVO-COMPLETO>",
      "inspectorRoles": [],
      "catalogVisibilityReview": "<REFERENCIA-DA-REVISAO-DE-VISIBILIDADE>"
    },
    "recovery": {
      "strategy": "stop-and-review-empty-initialization",
      "planReference": "<REFERENCIA-DO-PLANO-INICIAL-APROVADO>",
      "operatorId": "<IDENTIFICACAO-DO-RESPONSAVEL>"
    }
  }
}
```

Revalidar os identificadores públicos acima contra a autorização futura. `inspectorRoles: []` exige
CURRENT_ROLE=NONE. Se a conta autorizada depender de uma role administrativa ativa, informar um único
objeto `{"user":"NOME_REAL","host":"HOST_REAL"}` após revisão; não inventar a identidade nem usar public.
Os três gates só passam a true com evidências/aprovação correspondentes. `backupVerified`,
`backupReference` e `restoreRehearsed` são **proibidos** na autorização inicial, inclusive como false.
A política de recuperação inicial substitui esses campos exclusivamente neste caminho.

### Sequência manual futura — não executada nesta entrega

1. Obter autorização específica para DDL e janela controlada. Preservar os demais usuários bloqueados.
   O acesso temporário do migrator é responsabilidade administrativa separada; o wrapper não desbloqueia,
   cria contas, modifica grants, cria schema ou altera TLS. Não executar como root/admin MySQL.
2. Preparar uma release **completa** runtime/admin, commitada, revisada, com CLI e Client 6.12.0 e engine
   linux-arm64-openssl-3.0.x. O pacote de diagnóstico instalado não contém este fluxo de release.
   Verificar/stage conforme [releases](OCI_RELEASE_DEPLOYMENT.md), sem ativar current nem serviços.
   O manifesto do admin deve corresponder aos arquivos Prisma reais e ao manifesto runtime.
3. Parar/controlar API, worker, manutenção de uploads e escritores externos. Revisar estado/journal;
   não apagar locks nem registros de falha. O comando exige MainPID=0 e ausência de entry points locais.
4. Em shell root protegido, sem tracing, definir somente caminhos/IDs públicos abaixo. Nenhum valor
   desconhecido deve ser adivinhado. Preparar os documentos em diretório root 0700 externo às releases.
   Disponibilizar **somente MIGRATION_DATABASE_URL** por canal protegido ao job; não carregar .env,
   DATABASE_URL, credencial API ou worker. A URL exige sslaccept=strict e sslcert com caminho absoluto da
   CA pública já homologada. O job valida DNS/IP, UUID, versão, schema, conta completa, TLS e grants.
5. Gerar o plano sem conectar ao banco; `AUTH_DRAFT` já contém os vínculos aprovados. O hash do transcript
   é preenchido depois da coleta, antes de usar `AUTH_INSPECT`. Os arquivos de saída não podem existir:

```bash
# Variáveis de caminho/ID preenchidas pelo operador; nenhuma senha em argv.
RELEASE="/opt/traceflow/releases/$RELEASE_ID"
(
  umask 077
  set -C
  /usr/bin/node --input-type=module - "$RELEASE" "$AUTH_DRAFT" > "$SQL_PLAN" <<'NODE'
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [release, file] = process.argv.slice(2);
const { initialInspectionSql } = await import(pathToFileURL(release + '/deploy/scripts/lib/migration-contract.mjs'));
const authorization = JSON.parse(readFileSync(file, 'utf8'));
const manifest = JSON.parse(readFileSync(release + '/manifest.json', 'utf8'));
process.stdout.write(initialInspectionSql(authorization, manifest));
NODE
)
```

6. Revisar o SQL fixo e a custódia dos arquivos. Executar **manualmente**, pelo cliente previamente
   validado, com arquivo de opções root 0600 já preparado por canal protegido contendo somente a conta
   administrativa autorizada e sua senha. Esse arquivo não integra evidências, Git ou pacote. Não usar
   `--password=...`, MYSQL_PWD, shell tracing ou pipeline que esconda o exit code. Manter o mesmo cliente
   para todas as quatro instruções, sem reconnect, `--force`, comandos adicionais ou cabeçalhos:

```bash
(
  umask 077
  set -C
  env -i PATH=/usr/bin:/bin HOME=/nonexistent LANG=C.UTF-8 \
/usr/bin/mysql --defaults-file=/proc/self/fd/3 --no-login-paths \
--protocol=TCP --host=traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com \
--port=3306 --database=traceflow --ssl-mode=VERIFY_IDENTITY \
--ssl-ca=/etc/pki/traceflow/mysql-ca.pem --tls-version=TLSv1.2,TLSv1.3 \
--batch --raw --skip-column-names --skip-reconnect --connect-timeout=5 \
--local-infile=0 3<"$ADMIN_CLIENT_OPTIONS" \
< "$SQL_PLAN" > "$INITIAL_TRANSCRIPT" 2> "$PRIVATE_CLIENT_ERROR"
)
# Só continuar após exit code zero; em erro, preservar os arquivos privados e parar.
```

Não publicar stderr bruto. Não reaproveitar transcript parcial. Registrar SHA-256 do transcript por
canal de aprovação e preencher `initialization.inspection.sha256`/path. Confirmar ausência de stderr,
root/0600/ancestrais protegidos e TTL. Os parâmetros do cliente e a origem autenticada são obrigações
operacionais da coleta; o arquivo não é prova criptográfica da origem por si só.

7. Invocar separadamente a inspeção Prisma; ela usa a conta **migrator**, sem necessidade de desbloquear
   API/worker. Não executa DDL. A inspeção administrativa e os grants de migração são revalidados:

```bash
/usr/bin/python3 "$RELEASE/deploy/scripts/release.py" inspect-initial-schema \
--release-id "$RELEASE_ID" --digest "$DIGEST_APROVADO" \
--authorization "$AUTH_INSPECT"
```

Exigir saída schema_snapshot, historyTablePresent=false, applied=[], tableCount=0 e todos os
objectCounts=0, processo exit 0 e desconexão. Revisar fingerprint; criar a autorização `migrate-initial`
com `beforeFingerprint` exato, preservando o vínculo à mesma evidência vigente. Não copiar fingerprint
histórico: o novo cálculo inclui defaults, tipo de tabela, presença do histórico e objetos adicionais.

8. Invocar **uma vez**, em comando separado autorizado:

```bash
/usr/bin/python3 "$RELEASE/deploy/scripts/release.py" migrate-initial \
--release-id "$RELEASE_ID" --digest "$DIGEST_APROVADO" \
--authorization "$AUTH_MIGRATE_INITIAL"
```

O wrapper valida novamente arquivos/hashes dos dois artefatos, vazio/histórico, identidade completa,
grants diretos, CURRENT_ROLE=NONE, configuração, UTC, fingerprint e locks. O migrator precisa somente
SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX e REFERENCES em traceflow.*, sem ALL PRIVILEGES,
privilégios globais, outros schemas, roles, GRANT OPTION ou ADMIN OPTION. O nome da coluna de SHOW GRANTS
aceita o formato Prisma comprovado `f0` ou o cabeçalho textual exato, nunca campos arbitrários.

Sucesso exige 68 registros concluídos/checksums exatos, `migrate diff --exit-code` sem diferença,
encerramento do processo e desconexão antes do recibo. O resultado migration_complete registra tipo
initial, cadeia, hash da inspeção, digest, autorização e plano. Não inicia API, worker ou frontend.

9. Conferir recibo privado, estado migration-complete, ausência de processos/sessões remanescentes;
   encerrar o acesso temporário do migrator e remover credenciais transitórias pelo procedimento
   administrativo autorizado. Qualquer divergência implica parada e investigação.
10. Antes de ativar a aplicação, cumprir sua autorização independente, backup/recuperação e demais gates.
    A migration de upload já insere a linha inicial de EvidenceUploadBudget; após a cadeia não tratar o
    banco como vazio. Migrations posteriores usam `migrate` com backup real e restore ensaiado.

### UTC efetivo

A comparação não exige mais a string literal +00:00. Aceita global/session time_zone em `UTC` ou
`+00:00`, e exige TIMESTAMPDIFF entre UTC_TIMESTAMP e NOW igual a zero. SYSTEM, outras zonas, offset
não zero ou resultado ambíguo são recusados. O teste é repetido antes da CLI. A CLI abre conexões que
herdam o global; alterações concorrentes de configuração estão proibidas na janela. Não executar SET
GLOBAL para fazer passar. UTC por nome exige as tabelas de timezone disponíveis no servidor; no
laboratório elas foram carregadas **somente no datadir descartável**. [MySQL 26.7 time zones](https://dev.mysql.com/doc/refman/26.7/en/time-zone-support.html).

### Recuperação inicial e falhas parciais

Não existe dado anterior a restaurar quando a ausência foi comprovada. O plano inicial deve identificar
responsável e procedimento: interromper, manter escritores parados, preservar schema/histórico/logs
sanitizados/journal e investigar. Não existe rollback transacional das 68 migrations nem descarte
automático do schema. Depois de qualquer DDL, a condição inicial deixou de existir.

Depois da abertura do journal, falha SQL, autorização vencida, lock perdido, diff divergente, timeout,
falha de desconexão ou perda de confirmação mantém migration-failed/intervention-required. Recusas
anteriores ao DDL deixam o estado idle, sem anunciar sucesso. A via de recuperação da aplicação não pode
contornar essa quarentena. Não usar migrate reset/dev/resolve, db push, apagar `_prisma_migrations`,
reaplicar a cadeia ou recriar o schema sem um plano e uma autorização separados.

`recover-migration` somente reconhece um banco já completo: autorização migrationKind=initial,
initialRecovery idêntico ao journal, mesma release/digest/cadeia, novo expectedSchemaFingerprint,
histórico integral e diff zero. Usa credencial somente leitura explicitamente identificada; não executa
DDL e não inicia aplicação. Caso parcial, continua FAIL. Com dados existentes, restauração depende de
backup consistente e restore comprovado; a exceção inicial não pode ser reaproveitada.

### Evidência e limites desta entrega

- 26 verificações reais no laboratório, incluindo 68 migrations oficiais + diff zero, rotina invisível
  ao migrator, inspeção insuficiente, tabela/view/routine/trigger/event, histórico vazio, privilégio INDEX
  ausente, concorrência e erro deliberado na cópia da última migration (67 completas, uma falha).
- 703 testes Node e 132 Python de contratos, releases, recuperação, custódia e regressões passaram.
  Mocks não comprovam o comportamento do HeatWave ou systemd/SELinux.
- Primeiro comando Node sem --experimental-vm-modules não carregou três suítes existentes; repetido com
  a opção exigida, sem alterações nessas suítes. Ensaios intermediários recusaram a serialização binária
  de CURRENT_ROLE; o CAST corrigiu o plano e o ensaio final passou. Evidências anteriores preservadas.
- As 68 migrations, schema.prisma, Prisma compartilhado, lockfiles e pacotes anteriores não foram alterados.
  Servidores/clientes, listeners, credenciais, certificados e datadirs temporários foram removidos.
- O harness Linux histórico OCI05 usa a política anterior (ALL PRIVILEGES e migrate em schema vazio).
  Não foi executado nem apresentado como validação deste contrato. Atualizá-lo em entrega autorizada
  antes de repetir validação operacional Linux; não relaxar os controles atuais para acomodá-lo.
- O teste em Community/macOS não demonstra DDL em HeatWave, runtime Oracle Linux da nova release,
  observabilidade operacional ou recuperação de produção. Os gates de ativação e o build aprovado
  continuam pendentes. Esta entrega não autoriza commit, empacotamento, transferência ou execução remota.
