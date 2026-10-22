# OCI — arquitetura, IaC e entrega contínua da instalação limpa

Data: 21/10/2026. Escopo exclusivo: instalação limpa `traceflow_live`,
`traceflow-live-api` e `traceflow-live-worker`. Legado preservado.

**Resultado da entrega: PARTIAL — CD instalada, build/homologação reproduzíveis e coleta automática do resultado comprovados; promoção adicional BLOCKED em `LIVE_MIGRATION_CHAIN`, antes do startup/cutover. Produção 9bc3dad preservada e online.**

## Identidades e segregação

- Baseline efetiva: `9bc3dad199566afc6fa43d67abba400665d843ea`.
  Inspeção OCI: 2.252 arquivos iguais ao manifesto runtime
  `b85faa1f6bcad859d201ec8fb125897c71e8f520dfd71b126499ac29ae7ce795`;
  378 arquivos de `backend/src` e `backend/prisma` correspondem ao Git.
- Revisão de segurança autorizada: `b9c1beb9f6ded49ce9257d346c086a8893f700c9`.
  Derivada da baseline, sem incorporar PRs #26/#27. Só lockfiles e configuração CI
  mudaram. `backend/src`, `frontend/src`, schema e migrations são byte-idênticos.
- Vite 8.0.16 → 8.3.5 (frontend e toolchain de testes backend);
  follow-redirects 1.16.0 → 1.16.1. Transitivas do Vite atualizadas pelo npm.
  Auditorias dos dois projetos: zero high/critical, nenhuma exceção adicionada.
  Permanecem três ocorrências moderate de ferramentas de teste em cada árvore;
  a política existente permite esse nível e essas ferramentas não entram no runtime.
- A primeira cobertura dessa revisão recusou um teste existente de retomada de
  arquivo de 8 MiB por timeout de 5 s. A CI passou a usar um worker, sem mudar
  timeout, asserções, testes ou thresholds. Nenhum teste foi suprimido/repetido
  automaticamente para converter falha em sucesso. O CI completo do novo SHA passou em [39680721855](https://github.com/iYoNuttxD/Traceflow/actions/runs/39680721855); testes locais não o substituem.
- Nenhum merge `main` → `daniel-dev`. A integração operacional é a
  [PR #28](https://github.com/iYoNuttxD/Traceflow/pull/28); o código funcional
  da main não é fonte do pacote promovido.

## S2-08 — critérios oficiais

| Critério | Estado | Evidência e limite |
| --- | --- | --- |
| Serviços OCI definidos e justificados | DONE | [ADR-018](https://github.com/iYoNuttxD/Traceflow/blob/0619482a360df2233c335e8373447f7b92b468ee/docs/architecture/ADR-018-OCI-LIVE-ARCHITECTURE-CD.md): A1 ARM64 + HeatWave gerenciado privado, sem segunda VM de banco |
| Topologia e diagrama reais | DONE | ADR com VM 2 OCPUs/12 GiB, OL9.8, Nginx/React/API/worker, VCN, MySQL.Free, Object Storage e alertas |
| IaC reproduzível e separação | PARTIAL | [IaC](https://github.com/iYoNuttxD/Traceflow/blob/0619482a360df2233c335e8373447f7b92b468ee/deploy/iac/oci/README.md) parametrizada; validate e dois testes de plano passaram. Cloud Shell Terraform 1.5.7: inventário real sem mudanças; modelo gerenciado planejou 20 criações/zero exclusões, sem apply. Homologação usa runner/DB/storage descartáveis. Associação/importação e reconstrução integral não executadas; bootstrap de credenciais/TLS permanece externo ao state compartilhado |
| MySQL privado | DONE | Subnet 10.20.2.0/24 sem IP público; TCP3306 pelo NSG da aplicação e TLS VERIFY_IDENTITY |
| HTTPS/CORS/env/firewall explícitos | DONE | Configuração efetiva da instalação limpa conferida; API loopback; SSH administrativo restrito; ingress Cloudflare preservado |
| GitHub URLs e callbacks | DONE | URLs de produção conferidas por leitura; OAuth/App/webhook existentes preservados, sem reinstalação ou mudanças de permissões |
| Segredos sob custódia segura | DONE | Env root 0600 e encrypted credential systemd existentes; nenhum segredo OCI/SSH/MySQL adicionado à CD |
| Custos/região/capacidade | DONE | sa-saopaulo-1; shape MySQL.Free observada. Limite A1 público vigente: 1.500 OCPU-h/9.000 GiB-h mensais, equivalente a 2 OCPUs/12 GiB contínuos. Sem promessa de capacidade regional ou custo futuro garantido |

Não aplicar o plano de criação sobre os recursos existentes. Importação futura
exige state privado e plano revisado sem substituições; não houve adoção por IaC.

## S2-09 — critérios oficiais

| Critério | Estado | Evidência e limite |
| --- | --- | --- |
| CI, lint, testes, build e segurança na revisão exata | DONE PARA O CANDIDATO | [CI fonte](https://github.com/iYoNuttxD/Traceflow/actions/runs/39680721855), [CI operacional](https://github.com/iYoNuttxD/Traceflow/actions/runs/39683645246), [CD ARM64](https://github.com/iYoNuttxD/Traceflow/actions/runs/39683645226) |
| Identidade efêmera/menor privilégio | DONE | Ambiente production com iYoNuttxD revisor, main somente, sem bypass administrativo; token/OIDC somente após aprovação. VM pull-only verifica repo/workflow/ref/digest e bundle Sigstore. A proteção de revisão da main tem ressalva própria abaixo |
| Revisão dos componentes privilegiados | PARTIAL | PR #28 teve revisão exigida; PR #29 foi integrada diretamente pelo operador, com Protect main desabilitada. Exceção explícita e restrita autorizada para a única execução adicional; não há revisão independente registrada da PR #29. Approval de production continuou obrigatório e foi comprovado |
| Migrations de produção controladas | PARTIAL | Schema/cadeia de 68 do pacote e runtime conferidos; confronto SELECT real recusado na execução adicional. `prisma migrate deploy` real no MySQL isolado. A V1 recusa qualquer mudança de schema/cadeia antes do cutover. Migrações novas em produção ainda exigem compatibilidade dos contratos de backup e custódia/autorização do migrador; não estão automatizadas nesta entrega |
| Variáveis/URLs corretas | CONFIGURADO | Frontend `/api`; configurações da produção ficam fora do pacote e não são sobrescritas |
| Promoção coordenada Nginx/frontend/API/worker | BLOCKED | Primeira execução recusada por prazo; correção integrada na PR #29. Execução adicional autorizada 39691643874 passou prazo/assinatura/pacote, mas recusou `LIVE_MIGRATION_CHAIN` antes de startup/cutover. Nenhum retry |
| Smoke automático/MySQL/worker | PARTIAL | Homologação nativa isolada aprovada; instalação/revisão final da baseline HTTPS/API/MySQL/worker/timers saudável. Smoke pós-promoção não ocorreu porque não houve promoção |
| Rollback e recuperação | PARTIAL | 17 testes direcionados da CD exercitam a mesma transação `promote()` com HTTP loopback e um adapter de laboratório: falhas de startup/readiness/worker/artefato/schema/interrupção/commit. As trocas de unidades/ingress são simuladas nesse adapter; isso não comprova rollback integrado de systemd/Nginx. Nenhum incidente foi provocado na OCI. Restore isolado S2-10 preservado, sem repetição |

Candidato ARM64 verificado integralmente: 3.228 arquivos; pacote SHA-256
`4a7dbc5f522331aa242ed9300cbdddc7a1d1f0903fb1a80d58fff40a2dafd02a`;
manifesto `3ed3b0f04d68ba1ad5ae76731b436fd53f657de7d97324222148b685ecac9892`.
Dois builds independentes produziram bytes idênticos. Node 22.23.2, npm 10.9.8,
Prisma 6.12.0, Oracle Linux 9.8 ARM64. A verificação local do download confrontou
todos os arquivos/links com o manifesto; nenhum cache de teste é distribuído.
Os lockfiles comprometidos são vinculados por hash separadamente do lock gerado
na cópia de runtime pelo prune; o checkout de entrada permanece íntegro.

Pipeline: commit imutável → CI exato → dois builds independentes Oracle Linux 9.8
ARM64/Node 22.23.2/Prisma 6.12.0 → inventário/checksums → homologação descartável →
aprovação production → request assinado → pull verificado na OCI → smoke → resultado
ou rollback de aplicação. Dispatch manual; push main não promove. Concurrency e
locks impedem promoções/capturas simultâneas; falhas de promoção não são repetidas.

[Runbook de promoção, rollback e matriz de segredos](https://github.com/iYoNuttxD/Traceflow/blob/0619482a360df2233c335e8373447f7b92b468ee/docs/runbooks/OCI_CONTINUOUS_DEPLOYMENT.md).
Rollback não reverte migrations nem restaura banco sobre produção.

## S2-10 — ressalvas e preservação

| Verificação | Estado | Evidência |
| --- | --- | --- |
| Primeiro disparo automático comprovado | DONE | Timer 21/10/2026 06:00:33Z (03:00 BRT), backup `20261021T060033Z-b97cffa3669b4a739e59c44759eb05b1`, SUCCESS às 06:00:39.800323Z, 6,156 s, readback externo true |
| Integridade do backup | DONE | Cipher SHA-256 `cccd336f79d710964b24c2e0d2f04707deeb48319b9baf113a6d28c3ad4805a7`; 61 tabelas/68 migrations/116 FKs; bucket privado/prefixo production-live-v1 existentes |
| Timers e alertas existentes | DONE | Backup, monitor e retenção ativos/habilitados; monitor sem falhas. Entrega SMTP/ONS e restore anteriores preservados |
| RPO/RTO | DONE COM LIMITE | RPO alvo 24 h condicionado ao sucesso diário; RTO planejado 4 h. RTO integral de indisponibilidade não medido |
| Custódia operacional | DONE | 17 arquivos de configurações/unidades/ferramentas byte-idênticos após instalação/recusa; mesmas permissões e proprietários; API PID 413284/worker PID 413285, zero reinícios |

O código/agenda/configuração do backup S2-10 não são substituídos. Os backups
existentes não devem ser presumidos como contendo os novos drop-ins/estado CD.
Pacote, request assinado e resultado ficam na release GitHub; reconstrução da CD
usa código versionado e esses metadados verificados, conforme o runbook.

Referência histórica de operação e restore:
[S2-10 em f36dff3](https://github.com/iYoNuttxD/Traceflow/blob/f36dff3f4208ff58722630f069d414129a8cebb0/docs/deliveries/S2_10_OCI_OPERATIONS_REPORT.md).
Nenhum novo backup ou restore foi executado para testar a CD.

## Histórico da primeira execução real

- [PR #28](https://github.com/iYoNuttxD/Traceflow/pull/28) aprovada no head `ca56a6c3` e integrada sem bypass; merge `0619482a360df2233c335e8373447f7b92b468ee`.
- Bootstrap `d2bee297edba42c5a8351b008a5407dd5fe7b68e9250df80474fa4fff824ac44`; GH CLI 2.103.0 ARM64, arquivo oficial `7f322df34e624d14f5ec0c4acb121fd6dfa14392fdbbd1066aa8e0a05ac3721e`. Uma instalação, 13 arquivos de bootstrap conferidos; syntax/systemd/ACL/SELinux por política aprovados; timer habilitado a cada cinco minutos. Nenhuma porta pública nova.
- [Execução de produção 39686258330](https://github.com/iYoNuttxD/Traceflow/actions/runs/39686258330): build duplo/homologação PASS; aprovação production efetiva de iYoNuttxD; [release com pedido assinado e auditoria](https://github.com/iYoNuttxD/Traceflow/releases/tag/oci-cd-39686258330-1).
- Request: issuedAt `2026-10-21T22:30:02.848595+00:00`, expiresAt `2026-10-21T22:50:02.848616+00:00`. Duas leituras do relógio geraram **1200,000021 s**; o receptor recusou `DEPLOYMENT_DURATION`, corretamente, às `22:33:48.075130Z`. A validação da assinatura e do pacote ocorreu antes dessa recusa; a função de preflight recusou antes de escrever seus arquivos transacionais ou criar a candidata.
- Nenhum `current.json` da CD, unidade candidata, listener 3002 ou configuração transacional foi criado. Nginx/proxy ficaram nos hashes pós-instalação. API/worker mantiveram os mesmos PIDs e zero reinícios. A aplicação segue **9bc3dad**; a revisão de dependências b9c1beb9 ainda não foi promovida. Não foi necessário rollback da aplicação.
- O cliente Python do job recebe HTTP403 do endpoint público; curl HTTPS normal recebe HTTP200, com TLS normal e sem cookies. O recibo FAILED foi recuperado pelo operador e arquivado sem alteração na release (SHA-256 `fc2719f4ff79b0541b48bf1029fd53d45b0c07b6ace649c6f8e91dc2b7ad322f`). Isso é recuperação manual da auditoria, não prova de coleta automática pelo workflow. O job que apenas aguardava esse resultado foi cancelado após a recusa terminal, sem cancelar operação ativa na VM.
- [PR #29](https://github.com/iYoNuttxD/Traceflow/pull/29), commit `815e158c50ae3af02855a030af7faa4cfb265a1e`: usa um único instante UTC e curl HTTPS normal na consulta; registra HTTP/transport sem corpos/credenciais, para imediatamente em FAILED. O novo teste executa o gerador real do YAML, reproduziu a falha anterior e agora passa no contrato real do receptor. **21 testes CD PASS**; blocos shell válidos. Não relaxa o limite de 1200s, não altera receiver, aplicação, schema, segredo, Cloudflare ou recibo antigo.
- A revisão corretiva necessita checks/revisão atuais, atualização restrita da trust policy root para o workflow aprovado e **autorização explícita de uma nova tentativa**. Nenhuma segunda promoção foi disparada. Não reutilizar o request/marker anterior.

Estado observado em 21/10/2026 22:44:45Z: HTTPS200, readiness API200, MySQL=true, um worker/heartbeat7s, zero5xx, monitor sem falhas; timers backup/monitor/retenção ativos. Legado, backups, dados e 68 migrations preservados. A CD não executou migrations, SQL operacional de escrita, restore ou captura; a aplicação continuou em funcionamento normal.

S2-08 permanece **PARTIAL** pela adoção/reconstrução IaC não demonstradas. S2-09 permanece **PARTIAL**: promoção real bloqueada, migrations novas não automatizadas, ensaio integrado dos adapters de rollback não comprovado e proteção de revisão da main desabilitada pelo operador. S2-10 permanece preservada. O resultado adicional abaixo substitui somente a situação pendente da primeira tentativa; seus registros históricos permanecem preservados.

Nenhum recurso OCI foi criado pelo plano; zero apply. Runners padrão ARM64 para
repositório público são gratuitos segundo o
[GitHub](https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/).
Retenção planejada: candidato Actions 14 dias, resultado Actions 30 dias e release
GitHub com pacote/request/resultado; observar franquias de armazenamento. Não foi
criado recurso pago adicional ou runner permanente na VM.

## Execução adicional autorizada e encerramento

- [PR #29](https://github.com/iYoNuttxD/Traceflow/pull/29), head `815e158c50ae3af02855a030af7faa4cfb265a1e`, integrada pelo operador no merge `86e6fe4bdff0b82300af17cb8b93008071febc97`. O GitHub registra zero reviews e Protect main desabilitada; o operador confirmou a desativação e depois autorizou explicitamente a exceção à revisão independente **somente para esta execução adicional**. Não se registra aprovação do João ou bypass realizado pelo agente. A revisão automática inicialmente recusou a alteração root; a ação só foi executada após essa exceção explícita.
- [CI da PR](https://github.com/iYoNuttxD/Traceflow/actions/runs/39688116886), [CI do merge](https://github.com/iYoNuttxD/Traceflow/actions/runs/39689355831) e [homologação ARM64/21 testes CD](https://github.com/iYoNuttxD/Traceflow/actions/runs/39688116871): PASS. Árvore do merge idêntica ao head testado. Nenhuma nova regressão geral foi disparada manualmente.
- Trust policy root: alterado exclusivamente `authorityFiles[.github/workflows/oci-cd.yml]`, de `bb86815917ab442365cdbd4035302f9cc9e398b93ba43d495d1c94c4e42b063a` para `e7520ee562fb6673e972aa1f785e66c795f7d2670d47434281f6b1feab8b94cd`. SHA do arquivo: `40cfaea195583f5ba24962f80c1c3460a611d06b76628469e9a4a4cdbda3a57a` → `e1a013d0302d8f8743791731b982a06aa256823cedbf5f926aae8ef56b8bd64a`. `installedAt`, lista anterior de SHAs e demais campos preservados; receptor não reinstalado.
- A extração **inativa** da primeira tentativa foi integralmente conferida e renomeada, no mesmo filesystem, para `/opt/traceflow-live/releases/b9c1beb9f6ded49ce9257d346c086a8893f700c9-4a7dbc5f5223.preserved-failed-39686258330-1`. Mesmo inode 51746491, 3.228 arquivos, conteúdo/modos/proprietários preservados; nenhum diretório ativo ou legado alterado. Snapshot da policy e novo registro root em `/var/lib/traceflow-live-cd/approved-workflow-update-815e158c/`; recibos anteriores inalterados.
- [Execução adicional única 39691643874](https://github.com/iYoNuttxD/Traceflow/actions/runs/39691643874): build/homologação PASS em 171 s; pacote novamente byte-idêntico (`4a7dbc5f…dafd02a`). Aprovação de production por iYoNuttxD efetivamente registrada. Job de produção: 305 s, incluindo espera pelo timer; resultado **FAIL**. Nenhuma outra execução foi iniciada.
- Request assinado: emitido `2026-10-21T23:15:22.238811Z`, expira `23:35:22.238811Z`, duração **1200 s exatos**. O receptor iniciou pelo timer às `23:19:56Z`; recusou às `23:20:11.963293Z` (20h20min11s de São Paulo) em `Host.preflight()`, comparação `LIVE_MIGRATION_CHAIN`.
- O schema/cadeia do pacote passou na comparação com o runtime anterior. Em seguida, a lista SELECT de `migration_name/checksum`, ordenada pelo MySQL, não igualou a lista ordenada do manifesto. O recibo não conserva as linhas observadas; portanto **não comprova alteração de checksum, nome, ordem ou schema**. A causa comprovada é essa recusa de igualdade, ainda sem diferenciação dos componentes. Não foram alterados o gate, a cadeia ou o banco para obter PASS.
- Falha anterior à cópia do frontend e aos arquivos transacionais: nenhum `current.json`, candidata, listener 3002, drop-in de promoção ou cutover. A extração nova fica inativa e preservada. Nginx/proxy continuam byte-idênticos à baseline instalada. O campo genérico `rollback=inspect-preserved-transaction` do recibo não significa que houve troca ou rollback; a ausência de alterações foi conferida diretamente.
- O transporte corrigido coletou o FAILED e encerrou o job, **sem timeout nem retry**; [asset permanente](https://github.com/iYoNuttxD/Traceflow/releases/tag/oci-cd-39691643874-1) e artefato Actions arquivados automaticamente. Recibo root/público SHA-256 `c359b06155c212d3c3a02a79ff621a5e016fda22990a034c5b075c1632ce0f21`; asset GitHub `e6a9657bde55480727e0b548e9e583a83790e27412e5194659b2929269d620ff`. Conteúdo JSON exatamente igual; o workflow reformata com indentação, por isso os bytes/hashes diferem. Nenhum recibo foi sobrescrito para igualar hashes.

Verificação final **21/10/2026 20h22min19s America/Sao_Paulo**: HTTPS200 com índice SHA `58d9f744ae95f8f58eade7b1c23ab1b9b5e1090d5c40ffb4ba28a16b540da4f9`; readiness200/MySQL=true; um worker/heartbeat5s; zero5xx e monitor sem falhas. API PID413284 e worker PID413285, zero reinícios; 17 arquivos operacionais com hashes/modos/proprietários preservados; 2.252 arquivos do runtime 9bc3dad novamente verificados. SELinux Enforcing, nginx válido, timers backup/monitor/retenção/CD ativos e habilitados. Credencial temporária do serviço CD removida; backup diário original/readback preservados. Sem migrations, SQL administrativo de escrita, captura, restore ou recurso OCI pago novo.

Evidências locais complementares, sem segredos: `build/oci-cd-final/EXPLICIT_REVIEW_EXCEPTION.json`, `ADDITIONAL_TRUST_AND_PRESERVATION_APPLIED.json`, `ADDITIONAL_PRODUCTION_CANDIDATE.json`, `ADDITIONAL_PRODUCTION_APPROVAL.json`, `ADDITIONAL_REQUEST_IDENTITY.json`, `ADDITIONAL_TERMINAL_RESULT.json` e `ADDITIONAL_FINAL_PRESERVATION.json`. Permanecem locais; os links GitHub acima conservam código, checks, pacote, request e resultado públicos verificáveis.

**Encerramento: BLOCKED para promoção por `LIVE_MIGRATION_CHAIN`; TraceFlow permanece online na versão 9bc3dad.** A revisão b9c1beb9 não foi promovida. Não há autorização remanescente para nova tentativa nesta entrega. Não declarar S2-08/S2-09 integralmente concluídas ou a promoção bem-sucedida.
