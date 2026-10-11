# GITHUB-04 — Integration UX & Automatic Sync Scheduler

## 1. Baseline

Data da entrega: 2026-10-11. Checkout `/Users/daniel/Coding/Traceflow`.
Branch real `daniel-dev`, HEAD `50cb7af5813e41ddb8a9b1ab0b6d75f3a9684888`.
`git status --short` vazio e `git diff --check` PASS antes de editar. Nenhuma alteração
preexistente. Shell: Node 26.10.0 / npm 11.19.1. Gates/runtime: Node **22.23.3** / npm **10.9.9**.
GITHUB-01/02/03 já estavam no HEAD; números históricos não foram usados como prova atual.

## 2. Escopo

UX de Overview, edição e Repository; automação periódica backend; reserva compartilhada,
capacidade global, leases/fencing; progresso manual/automático. Sem OCI/deploy, webhooks novos,
troca/desvinculação, intervalos individuais, cancelamento de sync, indicadores ou mudança de Health.
Consultados README, CONTRIBUTING, arquitetura e convenções backend/frontend, contratos API,
matriz de autorização, Design System/inventário, relatórios GITHUB-01/02/03 e runbook GitHub.

## 3. Auditoria da sincronização atual

Antes das edições: POST sync já criava/reutilizava GitHubSyncRun; GET status retornava progresso;
activeProjectId unique impedia dois runs ativos. Claim QUEUED→RUNNING, heartbeat por progresso e
expiração existiam. Worker manual usava setImmediate na API. Verificação de lease ocorria antes
das gravações, deixando uma janela entre verificação e transação; ausência de scheduler e polling
somente ativo impediam descoberta de runs externos. O SSE atual usa publisher por processo e não
alcança um worker independente. Todos esses limites foram confrontados com o código vigente.

## 4. Arquitetura do scheduler

`src/github-worker.js` inicia `createGithubSyncScheduler` quando habilitado. Service identifica
candidatos/recuperação, repository confirma reserva/agenda em transação, orchestrator existente
executa a pipeline. Route→Controller→Service→Repository→Prisma preservado; architecture gate PASS.
Detalhes e comandos no [runbook](../runbooks/GITHUB_AUTOMATIC_SYNC.md).

## 5. Reutilização do SyncRun

Mesmos estados QUEUED/RUNNING/SUCCEEDED/FAILED, progress e summary. Origem MANUAL/AUTOMATIC;
ator automático null, auditoria SYSTEM. ID expirado nunca é retomado. Não há segunda importação,
fila de artefatos, algoritmo de deduplicação ou segundo lock independente por projeto.

## 6. Modelo de agendamento

nextSyncAt persistido na integração; seleção ordenada por instante/projeto. Habilitar distribui
um horário futuro; não força sync imediata. Desabilitar remove a agenda. Conclusão confirma run,
reagendamento e liberação de slots na mesma transação. Falha dessa persistência mantém a reserva
recuperável; nenhum terminal parcial libera uma execução concorrente.

## 7. Intervalo-base

30 min, configurável no backend por GITHUB_SYNC_INTERVAL_MS. Nenhum controle individual na UI.
Policy comum de API/workers e limites validados no startup estão documentados no runbook/.env.example.

## 8. Jitter

SHA-256 estável por projectId. Ativação/agenda atrasada distribui fase na janela UTC do intervalo.
Após run: base + jitter entre zero e menos de 20% da base. Amostra determinística de 100 projetos
comprova dispersão e repetibilidade. Não há sorteio por tick nem alinhamento de todos em now+30min.

## 9. Persistência do agendamento

nextSyncAt e consecutiveSyncFailures são novos; timestamps existentes de tentativa, sucesso e
heartbeat são reutilizados. Clock pertence ao backend. Frontend só formata a data persistida.
Restart preserva agenda futura; atraso acima de dois ticks redistribui sem backlog de ciclos.

## 10. Concorrência global

Default dois slots automáticos, configurável. automaticSlot nullable unique no run arbitra
transações de processos distintos. Reserva inclui QUEUED; terminal/expiração libera slot.
automaticInstallationId unique serializa automáticas da mesma instalação. Outra instalação/projeto
pode executar com capacidade disponível. Todas as réplicas devem usar a mesma policy; alterações
operacionais exigem drain e configuração comum. Configurações divergentes não são suportadas.

## 11. Exclusão mútua por projeto

activeProjectId permanece unique e a autoridade única, independentemente da origem. Criação,
claim e escritas revalidam lifecycle sob lock do Project. Collision não confirma run parcial.
Testes usam MySQL real e transações concorrentes, não mocks de locking.

## 12. Manual × automática

POST manual durante automática retorna o mesmo run com alreadyRunning=true e origin AUTOMATIC.
Nenhuma importação adicional. UI bloqueia a ação após observar o run; backend cobre também a
janela entre as consultas. Contrato HTTP 202 preservado.

## 13. Automática × manual

Manual ocupa a mesma reserva. Scheduler não inicia outro run; conclusão manual reagenda se a
preferência segue habilitada. Não acumula tentativas automáticas de cada tick perdido.

## 14. Leases e fencing

Lease default 30 min, configurável; heartbeat em min(30s, lease/3). Contexto AsyncLocalStorage
associa run.id à pipeline; withActiveProjectWrite verifica a propriedade da lease dentro da
transação, após lock de Project e sob lock do run. Abrange commits, branches/reconciliação,
PRs/eventos, issues, sugestões e metadata de integração. Expiração toma os mesmos locks, formando
uma ordem única de commit. Teste pausa o worker entre progresso e escrita, substitui a reserva e
comprova rejeição do escritor antigo, sem sobrescrever o resultado novo.

## 15. Recuperação após crash

QUEUED persistido é reivindicado uma vez. RUNNING só expira quando stale; expiração condicional
registra FAILED e reagenda/libera slots atomicamente. Dois recuperadores produzem uma expiração.
Worker sem conexão pode terminar requests externos, mas perdeu a autoridade de escrita após
fencing. Shutdown impede novos launches locais e aguarda trabalhos iniciados; SIGKILL depende da
lease. Validação com processos reais está registrada na seção Runtime.

## 16. Rate limit / backoff

Retry-After e X-RateLimit-Reset não são truncados para permitir tentativa prematura. Espera acima
do orçamento do request sai para cooldown persistido por instalação; outras automáticas dessa
instalação aguardam. Sem header, rate limit espera pelo menos um minuto. Backoff de falhas cresce
exponencialmente até 6h + jitter, respeitando headers maiores. 5xx/timeout preservam vínculo e
histórico; 401/403 sem rate limit/404 externo levam a RECONNECT_REQUIRED. Credenciais globais
indisponíveis não disparam o scheduler. Tests cobrem 429, Retry-After, 503, timeout e autorização.

## 17. Project lifecycle

Sem integração, disabled, soft delete, purge, instalação suspensa/removida e integração bloqueada
não iniciam. Exclusão lógica termina o run/fence e limpa agenda na própria transação. Restore
reavalia agenda distribuída, sem executar ciclos atrasados. Estados administrativos ATIVO,
INATIVO e ARQUIVADO mantêm a semântica anterior; nenhum status novo ou mudança de Health.

## 18. Overview

CTA Conectar repositório removido; mantém Não conectado e frase curta. Colunas usam minmax(0,...),
metadata pode quebrar linha e marcador não comprime o texto. Progresso existente é compartilhado.
Saúde do Projeto e seus cálculos não foram alterados.

## 19. Project Edit UX

Uma surface, com Repositório, Sincronização e Automação em grupos compactos/separadores. Status e
metadata próximos; botão secundário canônico junto do progresso. Ausência da integração permanece
compacta com ação OWNER funcional. Mesma rota/hash, sem wizard, dialog adicional, cores ou gradientes.

## 20. Repository UX

Header, navegação, resumo, filtros e catálogo permanecem. Sem integração: metadados Não disponível,
critério desabilitado e estado vazio no catálogo, com CTA autorizado existente. Sem zeros/percentuais
inventados. Com integração: tabelas e artefatos preservados, inclusive após falha de sync.

## 21. Switch automático

O HEAD não continha switch canônico em Settings/shared. Criada primitive shared mínima com tokens
C2 e input nativo role switch, label clicável, foco e target 44px. Valor só muda após confirmação.
Desligar durante RUNNING informa continuidade da execução atual; não cancela trabalho. Próxima
execução vem de nextSyncAt; null é apresentado como indisponível ou após execução, conforme o run.

## 22. Progresso unificado

GitHubSyncProgress extraído da Overview e reutilizado na edição. Origem automática textual, etapa,
branches observadas, branch atual e início; nenhum percentual estimado. Polling REST ativo 2,5s /
ocioso 15s, suspenso em aba oculta. Reload recupera estado ativo e bloqueio; job curto já finalizado
entre polls também reconcilia metadata/agenda. Não há publisher SSE paralelo.

## 23. Consistência assíncrona

Generation/abort, fresh GET e telas keyed por projectId preservados. Mutation confirmada não é
rejeitada por refresh falho. Overview invalida probe anterior ao POST; alterações de contexto não
recebem respostas atrasadas. Testes incluem troca de projeto, reads anteriores, settings e status.
Feedback de sucesso anterior é removido ao descobrir uma nova execução ou falha automática;
regressão reproduzida antes da correção e validada em teste e na matriz runtime.

## 24. Acessibilidade

Switch com Space e nome acessível; botões e links canônicos; headings/labels, feedback textual,
regiões status e foco preservados. Escape/cancelar no vínculo devolve foco. Disabled real bloqueia
manual enquanto run conhecido está ativo; não depende só de opacity/cor.

## 25. Responsividade

Matriz **PASS**: 1440×900, 768×1024 e 390×844, Light/Dark, via aplicação real/Chromium, DOM e CSS
computado. Verificados overflow, bounds de seções/controles, separação entre dt/dd, targets e
temas. Sem screenshots, capturas ou pastas de evidência. Resultado detalhado na seção 29.
Inventário mantém TECHNICALLY VERIFIED; não declara homologação visual completa da aplicação.

## 26. Testes backend

Focados: **9 arquivos / 140 testes PASS**. Novos: 28 casos com persistência e quatro de policy;
regressão de App, sync, rate limit, vinculação, autorização, lifecycle e branches preservada.
Completo: **150 arquivos PASS, 1.807 testes PASS**, dois arquivos/cinco skips históricos preexistentes.
Coverage: statements **92,41%**, branches **86,86%**, functions **95,37%**, lines **94,78%**.

## 27. Testes frontend

Focados: **6 arquivos / 119 testes PASS**. Completo: **119 arquivos / 1.475 testes PASS**.
Coverage: statements **86,02%**, branches **80,87%**, functions **81,88%**, lines **88,50%**.
Execução serial canônica com Node 22, sem novos retries/timeouts ou redução de thresholds.

## 28. Testes de concorrência

MySQL real: manual/manual (regressão), manual/automática nas duas ordens e corrida simultânea,
automática/automática, dois schedulers, slots entre projetos, instalação compartilhada, duas
expirações, queued após restart, antiga escrita após nova lease, rollback de terminal/agenda,
shutdown idempotente, disable durante run e lifecycle delete/restore. Fault injection controla
uma gravação de agenda dentro de transação real; rollback é conferido por leitura no banco.

## 29. Runtime

**PASS — 55 verificações**, com Express e Prisma reais, build frontend servido localmente e
Chromium. A única fronteira externa controlada foi o cliente GitHub/disponibilidade de credenciais;
sessão, CSRF, autorização, persistência, pipeline, scheduler e UI executaram a implementação real.

| Viewport | Light | Dark |
| --- | --- | --- |
| Desktop 1440×900 | PASS | PASS |
| Tablet 768×1024 | PASS | PASS |
| Mobile 390×844 | PASS | PASS |

Em cada combinação: projeto A/B com automação ligada e agendas distintas; C com automação
desligada; D sem integração. Criação local, Overview sem CTA, Repository preservado, edição
compacta, Escape/cancelamento/foco e switch via Space passaram. A UI descobriu execução automática,
mostrou etapas do mesmo componente, bloqueou manual e manteve acompanhamento após reload.
POST manual durante automática devolveu o mesmo run; reserva automática durante manual foi
rejeitada. Desligar durante execução preservou sua conclusão e removeu a agenda futura.
Falha automática preservou último sucesso, vínculo e artefatos; retry manual concluiu sem
duplicar artefatos. Zero erros de página e nenhuma sobreposição/overflow nas medições delimitadas.

As 55 verificações compreendem 48 checagens de layout/estados, seis grupos funcionais A/B/C/D e
um cenário com processos independentes. Dois processos reais `src/github-worker.js` disputaram
um job: houve um único claim. Ambos foram encerrados por SIGKILL; um novo processo recuperou a
lease abandonada e concluiu outro run sem duplicar escritas. Somente o heartbeat da fixture
isolada foi retrodatado após a morte dos processos para acelerar a expiração; não se aguardou
o intervalo de produção. O encerramento posterior por SIGTERM concluiu normalmente.

Node 22 e `traceflow_test` confirmados antes das fixtures. Nenhuma captura foi produzida.
Logs/harness temporários ficaram em `/tmp`; o backend runtime encerrou antes da suíte completa.

## 30. Banco isolado

TEST_DATABASE_URL obrigatória e validada distinta de DATABASE_URL antes de imports. Alvos
sanitizados: desenvolvimento `localhost:3306/traceflow`; teste `localhost:3306/traceflow_test`.
Prisma de teste fixa datasource; cleanTestDatabase confere DATABASE() na transação. Harness
confere conexão real antes de fixtures; processos filhos também usam NODE_ENV=test e TEST URL.
Nenhum teste, migration, cleanup, seed ou benchmark alterou o banco de desenvolvimento.

## 31. Migrations, se aplicável

`20261011000000_github_automatic_sync` incremental; nenhuma migration aplicada foi editada.
Campos mínimos de agenda/origem/slots/cooldown; usuário do run aceita null sem inventar ator.
Prisma validate/generate, deploy/status, aplicação do zero e upgrade/reaplicação PASS.
Upgrade em `traceflow_test_github_sync_upgrade_validation` preservou valores de User, Project,
ProjectMembership, GitHubInstallation, ProjectGitHubIntegration, GitHubSyncRun e Commit.
Reaplicação não alterou dados. Schema descartável criado pela validação foi removido por ela.
Schema audit: SCHEMA_CONSISTENT, zero órfãos e zero projetos sem OWNER ativo. 65 migrations.

## 32. Segurança

Matriz de sessão/e-mail/CSRF/ownership mantida; nenhum novo endpoint. Run público não expõe
usuário/slots/instalação. Tokens permanecem efêmeros. Scanner de segredos PASS; npm audit backend
/frontend **0 HIGH / 0 CRITICAL, zero exceções utilizadas**. Campos do cliente não controlam origem,
capacidade, intervalo ou próxima execução.

## 33. Gates completos

| Gate | Resultado |
| --- | --- |
| Backend tests + coverage | PASS; 1.807 testes; cinco skips históricos |
| Frontend tests + coverage | PASS; 1.475 testes |
| Backend/frontend lint e format:check | PASS |
| Frontend build | PASS; avisos existentes ELK/eval e chunks grandes |
| Prisma validate/generate/deploy/status | PASS |
| Migrations empty / upgrade / reapply | PASS em schemas de teste |
| Schema audit | SCHEMA_CONSISTENT |
| Architecture | PASS |
| Security/secrets | PASS |
| Local CI/audit/inventory policy | PASS; 86 testes |
| Workflow/scripts/audit policy format | PASS |
| Dependency audits | PASS; 0 HIGH / 0 CRITICAL |
| git diff --check | PASS |

Cobertura executa as suítes completas, conforme CONTRIBUTING. Logs desta rodada em
`/tmp/traceflow-github04-*.log`. Banco local informa versão 26.7.0, diferente da imagem mysql:8.4.8
da CI; esta execução não é declarada CI-equivalent. CI remoto/Dependency Review não executados.

## 34. Preparação para OCI

Worker independente, env validado, shutdown, logs sem segredos, recuperação persistente e
coordenação entre processos. Runbook contém startup/stop/diagnóstico/alteração de policy e requisitos
de configuração comum, relógio UTC, supervisor e banco. Sem provisionamento, publicação ou deploy.

## 35. Limitações restantes

- GitHub externo/credenciais controlados na fronteira dos testes/runtime; sem homologação de App
  real, OAuth ou webhooks reais nesta entrega.
- Polling descobre novas execuções em até uma janela de 15s enquanto visível; backend impede
  duplicidade mesmo antes da atualização visual. Erro de consulta na edição oferece retry.
- Sem garantia de cancelamento de request externo já em voo após crash/perda de lease; escritas
  são fenceadas. Policy divergente entre réplicas não é suportada.
- Configuração real OCI, capacidade/pools, secret manager, rate limiter HTTP distribuído e supervisão
  permanecem operacionais. Não há alegação de readiness de produção.
- Inspeção runtime delimitada, sem captura, leitor de tela, dispositivos físicos ou auditoria
  visual completa. Sem mudança de Health, RFs acadêmicos, troca/desvinculação ou novos indicadores.

## 36. Final verdict

**GITHUB-04 INTEGRATION UX & AUTOMATIC SYNC SCHEDULER — PASS LOCAL**

UX refinada e worker periódico implementados na `daniel-dev`, com agenda persistida,
concorrência global, mesma autoridade manual/automática, fencing e recuperação validados.
Gates completos e matriz runtime passaram no estado final; limites operacionais e de
homologação externa permanecem explícitos acima. Esta conclusão não autoriza deploy.

Nenhum commit, push, merge, rebase, reset, clean ou stash. Sem deploy. Sugestão de commit:
`feat: implement distributed GitHub auto-sync scheduler and refine integration UX`.
