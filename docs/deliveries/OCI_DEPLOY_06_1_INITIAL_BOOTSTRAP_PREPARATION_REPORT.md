# OCI-DEPLOY-06.1 — Initial Bootstrap Preparation

Data: 15/10/2026. **PREPARATION COMPLETE — EXECUTION PENDING HUMAN AUTHORIZATION.**
Homologação gerenciada continua **PARTIAL**; OCI-DEPLOY-07 **NÃO INICIADA**.

O [runbook completo](../runbooks/OCI_HEATWAVE_INITIAL_BOOTSTRAP.md) contém os 12 itens solicitados,
SQL completo por lote, comandos manuais, critérios de aceite e interrupção.
[Evidência estática](evidence/oci-deploy-06-1-bootstrap/preparation.json).
Nenhum SQL deste procedimento foi executado, nem mesmo em banco local.

## Baseline e escopo

| Item | Evidência desta preparação |
| --- | --- |
| Repositório | `/Users/daniel/Coding/Traceflow` |
| Branch / HEAD | `daniel-dev` / `b5572bd16af35722fec21da6190b7b4f360bbb27` |
| Working tree inicial | limpo; diff --check aprovado |
| Alterações | somente documentação operacional e evidência estática desta preparação |
| Código, migrations, Prisma, documentação acadêmica e relatórios históricos | preservados |
| Ações remotas / DB / credenciais | nenhuma |
| Git staging / commit / push / merge | nenhum |

Foram consultados os relatórios OCI06 e OCI06.1, os quatro runbooks exigidos, schema Prisma,
todos os 68 SQLs, diagnóstico e sua biblioteca, bridge e wrapper de releases, contrato de backup,
units e validação de ambiente. As afirmações de infraestrutura vêm do operador, sem consulta
OCI/SSH/DNS remoto nesta execução. Documentação pública Oracle/MySQL foi consultada para
sintaxe, autenticação, escopos de privilégios e comportamento do cliente.

## Estado atualizado e decisões

O operador confirma schema ausente, nenhuma migration/aplicação, somente admin MySQL,
TLS personalizado/hostname/TLS 1.3 aprovados e CA pública já instalada e acessível ao usuário
Linux traceflow. Origem privada da VM confirmada nesta continuação: **10.20.1.184**.
Destino permanece `traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com` / `10.20.2.25:3306`.
SQL VERSION(), UUID, parâmetros e grants reais continuam pendentes.

| Decisão preparada | Justificativa / limite |
| --- | --- |
| `traceflow` com `utf8mb4 / utf8mb4_unicode_ci` | preserva defaults das migrations; exceção GitBranch.name utf8mb4_bin mantida |
| Contas API/worker separadas; diagnóstico; migrator | DML / SELECT / nove privilégios DDL+DML, sempre só traceflow.* |
| Host exato 10.20.1.184 | não usar %, endpoint do DB como origem ou IP público |
| caching_sha2_password + REQUIRE SSL | autenticação atual; TLS também estrito no cliente |
| Contas nascem ACCOUNT LOCK | somente diag tem desbloqueio preparado para fase própria |
| BY RANDOM PASSWORD, comprimento de sessão 32 | nenhuma senha versionada; resultsets privados e custódia antes do desbloqueio |
| PASSWORD EXPIRE NEVER | proposta para contas não interativas; depende de política de rotação aceita |
| Conta backup adiada | não há dados de aplicação nem job gerenciado aprovado que a exija |
| Bootstrap administrativo separado de migrations | não cria tabelas/histórico, não chama Prisma CLI |
| Prisma pode diagnosticar schema vazio | consultas de identidade/TLS/grants/parâmetros/SELECT 1; não homologa DDL gerenciado |

A cadeia possui 68 migrations, 66 ocorrências de CHARACTER SET utf8mb4, 65 de
COLLATE utf8mb4_unicode_ci e uma de COLLATE utf8mb4_bin. O inventário inclui SHA-256 de cada
migration e digest da lista ordenada no JSON de evidência. Não confundir contagens textuais
com quantidades finais de objetos; 61 tabelas/116 FKs são resultados históricos do laboratório.

Compatibilidade dos privilégios é **documental e contratual**, não um teste no HeatWave:
[privilégios disponíveis](https://docs.oracle.com/en-us/iaas/mysql-database/doc/default-mysql-privileges.html),
[restrições HeatWave](https://docs.oracle.com/en-us/iaas/mysql-database/doc/unsupported-features.html),
[CREATE USER 26.7](https://dev.mysql.com/doc/refman/26.7/en/create-user.html).
Não conceder ALL, direitos globais, GRANT OPTION ou role administrator às novas contas.

## Bloqueio identificado no primeiro migration job

`deploy/scripts/release-database.mjs` exige backupVerified, backupReference e restoreRehearsed
antes de migrar, mesmo quando snapshot.tableCount é zero. `deploy/scripts/release.py` acrescenta
gates de produção para suas operações administrativas, incluindo deploy, SMTP, GitHub e uploads.
Usar esses wrappers para o bootstrap inicial ou marcar gates sem evidência violaria o contrato.

**Não há exigência de backup lógico de dados inexistentes neste bootstrap.** O recibo de estado
inicial não será chamado de backup. A primeira migration permanece bloqueada até decisão e
implementação posterior de um caso estrito para banco inicialmente vazio, sem bypass de TLS,
identidade, locks, histórico, quarentena e autorização. Nenhum código foi alterado para isso.

A adequação proposta deve provar ausência de objetos/histórico sob visibilidade adequada,
revalidar estado e fingerprint sob lock, vincular UUID/schema/versão/cadeia/release, recusar
writers e qualquer estado não vazio, e dispensar somente a pré-condição de backup inaplicável.
Restore/DR antes de receber dados reais continua necessário; sua política/gates exigem decisão
humana explícita. Não executar migrate deploy diretamente como alternativa.

## Rastreabilidade e aceite

| Arquivo atual envolvido | Arquivo novo / alteração documental | Justificativa e impacto | Risco / aceite / validação |
| --- | --- | --- | --- |
| `backend/prisma/schema.prisma` e `backend/prisma/migrations/` | novo `docs/runbooks/OCI_HEATWAVE_INITIAL_BOOTSTRAP.md`, seções 3–5 | charset e grants derivados da cadeia; nenhum SQL histórico editado | sem execução SQL; aceitar somente com 68 hashes preservados e revisão administrativa |
| `backend/scripts/validate-oci-heatwave-connection.js` e `lib/heatwave-connection.js` | runbook novo, seção 9 | homologar identidade/TLS/autenticação em schema vazio | modelo sem aprovação/UUID/version deve recusar; grants propostos verificados pelo parser puro |
| `deploy/scripts/release-database.mjs` / `release.py` | runbook novo, seção 12; adendo em `OCI_MIGRATIONS.md` | documentar gate incompatível com primeiro banco vazio | nenhuma flag/bypass criado; futura implementação/testes isolados em entrega própria |
| `deploy/systemd/traceflow-api.service` / `traceflow-github-worker.service` | adendo em `OCI_ENVIRONMENT.md` e seção 6 nova | alinhar contas e arquivos de ambiente; nenhuma unit editada | segredos fora do Git; nomes/caminhos compatíveis com units atuais |
| `deploy/lib/backup_contract.py`; `OCI_BACKUP_RECOVERY.md` | adendo no runbook de backup; seções 4/12 novas | adiar conta/job sem dados de aplicação; manter DR pendente | não declarar CLI local como operacional nem fabricar backupReference |
| `OCI_HEATWAVE_HOMOLOGATION.md` | referência ao novo procedimento e atualização factual | CA já instalada/schema ausente/IP confirmado pelo operador | preservar evidência anterior; separar relato de execução e autorização |
| Relatórios históricos OCI06/OCI06.1 | este relatório e `evidence/oci-deploy-06-1-bootstrap/preparation.json` | rastrear continuação sem reescrever conclusão histórica | somente documentos operacionais alterados; nenhum segredo/resultado remoto inventado |

Verificações desta entrega são estáticas: preservação de fontes/migrations, grant parser sem
conexão, sintaxe Bash sem executar comandos, JSON, links locais, scan de segredos dos arquivos
alterados e git diff --check. O JSON registra os resultados efetivamente observados.
Não foram executados testes persistentes, CREATE USER em laboratório, migrations, Prisma
generate, instalação de dependências, chamadas OCI/SSH/HeatWave, screenshots ou deploy.

Os SQLs foram revisados contra a documentação e o código, **não executados nem validados por
um servidor MySQL**. Esse limite não deve ser apresentado como PASS operacional.

## Dependências, ordem e decisões humanas

1. Aprovar nomes/grants/origem, política de rotação, custodiante e mecanismo protegido; fechar
   caminho do cliente/bundle/launcher, identidade SSH/Unix/admin e cartão de autorização.
2. Autorizar somente B00 e obter SQL version/UUID/metadata/grants sem senhas; confirmar ausência
   de schema/contas, InnoDB, collations, origem e transporte.
3. Autorizar B10 e B20–B23, um lote por vez; conferir B30, guardar senhas em custódia e manter
   contas bloqueadas. B90 fica fora da operação inicial.
4. Autorizar B40/B41 e depois diagnóstico Prisma read-only com contrato completo e prazo curto.
5. Resolver separadamente primeiro migration job e gates de DR; observar time_zone +00:00,
   pools/capacidade real e demais condições de produção antes da primeira migration.
6. Homologar o caminho gerenciado e recuperação; só depois solicitar autorização específica
   de OCI-DEPLOY-07. Não iniciar essa etapa automaticamente.

Bloqueadores de execução: autorização, identidades/caminhos ainda desconhecidos, custódia,
identidade/parâmetros/grants SQL ainda não coletados e gates operacionais não comprovados.
O IP de origem deixou de ser uma pendência. Nenhuma decisão permite ignorar divergência TLS,
usar %, credencial administrativa no runtime ou alterar as 68 migrations.

Próxima ação recomendada: revisão humana deste procedimento e, quando forem fornecidos os
identificadores operacionais não secretos, aprovação do lote **B00 somente leitura**.
Até lá, permanecer sem conexão ao HeatWave. Preparação encerrada; aguardar autorização.
