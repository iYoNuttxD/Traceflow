# OCI — arquitetura, IaC e entrega contínua da instalação limpa

Data: 21/10/2026. Escopo exclusivo: instalação limpa `traceflow_live`,
`traceflow-live-api` e `traceflow-live-worker`. Legado preservado.

**Resultado da entrega: PARTIAL — receptor instalado e candidato íntegro; promoção recusada antes do cutover. Produção 9bc3dad preservada e online.**

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
| Identidade efêmera/menor privilégio | DONE | Ambiente production com iYoNuttxD revisor, main somente, sem bypass administrativo; token/OIDC somente após aprovação. VM pull-only verifica repo/workflow/ref/digest e bundle Sigstore |
| Migrations de produção controladas | PARTIAL | Cadeia de 68 conferida; `prisma migrate deploy` real no MySQL isolado. A V1 recusa qualquer mudança de schema/cadeia antes do cutover. Migrações novas em produção ainda exigem compatibilidade dos contratos de backup e custódia/autorização do migrador; não estão automatizadas nesta entrega |
| Variáveis/URLs corretas | CONFIGURADO | Frontend `/api`; configurações da produção ficam fora do pacote e não são sobrescritas |
| Promoção coordenada Nginx/frontend/API/worker | BLOCKED | Execução 39686258330 recusada em `valid_window()` por prazo de 1200,000021 s; nenhum startup/cutover. Correção revisável na PR #29, sem segunda tentativa automática |
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

## Execução real e estado final

- [PR #28](https://github.com/iYoNuttxD/Traceflow/pull/28) aprovada no head `ca56a6c3` e integrada sem bypass; merge `0619482a360df2233c335e8373447f7b92b468ee`.
- Bootstrap `d2bee297edba42c5a8351b008a5407dd5fe7b68e9250df80474fa4fff824ac44`; GH CLI 2.103.0 ARM64, arquivo oficial `7f322df34e624d14f5ec0c4acb121fd6dfa14392fdbbd1066aa8e0a05ac3721e`. Uma instalação, 13 arquivos de bootstrap conferidos; syntax/systemd/ACL/SELinux por política aprovados; timer habilitado a cada cinco minutos. Nenhuma porta pública nova.
- [Execução de produção 39686258330](https://github.com/iYoNuttxD/Traceflow/actions/runs/39686258330): build duplo/homologação PASS; aprovação production efetiva de iYoNuttxD; [release com pedido assinado e auditoria](https://github.com/iYoNuttxD/Traceflow/releases/tag/oci-cd-39686258330-1).
- Request: issuedAt `2026-10-21T22:30:02.848595+00:00`, expiresAt `2026-10-21T22:50:02.848616+00:00`. Duas leituras do relógio geraram **1200,000021 s**; o receptor recusou `DEPLOYMENT_DURATION`, corretamente, às `22:33:48.075130Z`. A validação da assinatura e do pacote ocorreu antes dessa recusa; a função de preflight recusou antes de escrever seus arquivos transacionais ou criar a candidata.
- Nenhum `current.json` da CD, unidade candidata, listener 3002 ou configuração transacional foi criado. Nginx/proxy ficaram nos hashes pós-instalação. API/worker mantiveram os mesmos PIDs e zero reinícios. A aplicação segue **9bc3dad**; a revisão de dependências b9c1beb9 ainda não foi promovida. Não foi necessário rollback da aplicação.
- O cliente Python do job recebe HTTP403 do endpoint público; curl HTTPS normal recebe HTTP200, com TLS normal e sem cookies. O recibo FAILED foi recuperado pelo operador e arquivado sem alteração na release (SHA-256 `fc2719f4ff79b0541b48bf1029fd53d45b0c07b6ace649c6f8e91dc2b7ad322f`). Isso é recuperação manual da auditoria, não prova de coleta automática pelo workflow. O job que apenas aguardava esse resultado foi cancelado após a recusa terminal, sem cancelar operação ativa na VM.
- [PR #29](https://github.com/iYoNuttxD/Traceflow/pull/29), commit `815e158c50ae3af02855a030af7faa4cfb265a1e`: usa um único instante UTC e curl HTTPS normal na consulta; registra HTTP/transport sem corpos/credenciais, para imediatamente em FAILED. O novo teste executa o gerador real do YAML, reproduziu a falha anterior e agora passa no contrato real do receptor. **21 testes CD PASS**; blocos shell válidos. Não relaxa o limite de 1200s, não altera receiver, aplicação, schema, segredo, Cloudflare ou recibo antigo.
- A revisão corretiva necessita checks/revisão atuais, atualização restrita da trust policy root para o workflow aprovado e **autorização explícita de uma nova tentativa**. Nenhuma segunda promoção foi disparada. Não reutilizar o request/marker anterior.

Estado observado em 21/10/2026 22:44:45Z: HTTPS200, readiness API200, MySQL=true, um worker/heartbeat7s, zero5xx, monitor sem falhas; timers backup/monitor/retenção ativos. Legado, backups, dados e 68 migrations preservados. A CD não executou migrations, SQL operacional de escrita, restore ou captura; a aplicação continuou em funcionamento normal.

S2-08 permanece **PARTIAL** pela adoção/reconstrução IaC não demonstradas. S2-09 permanece **PARTIAL**, com a promoção real **BLOCKED** pela recusa documentada, migrations novas não automatizadas e limitação do ensaio do adapter de rollback descrita acima. Não declarar CD integralmente operacional ou esses dois itens encerrados enquanto esses gates estiverem pendentes. S2-10 permanece preservada.

Nenhum recurso OCI foi criado pelo plano; zero apply. Runners padrão ARM64 para
repositório público são gratuitos segundo o
[GitHub](https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/).
Retenção planejada: candidato Actions 14 dias, resultado Actions 30 dias e release
GitHub com pacote/request/resultado; observar franquias de armazenamento. Não foi
criado recurso pago adicional ou runner permanente na VM.
