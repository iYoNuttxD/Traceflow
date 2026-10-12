# GITHUB-04.1 — Automatic Sync Reliability & UX Refinement

## 1. Baseline

2026-10-11, `/Users/daniel/Coding/Traceflow`, `daniel-dev`, HEAD
`0b4668de01f10d365d8aee250b9d372dd9643f25`. Working tree limpo e diff check PASS antes de editar.
Shell Node 26.10.0/npm 11.19.1; execução desta rodada em Node 22.23.3/npm 10.9.9.
Consultados README, CONTRIBUTING, arquitetura/convenções, API, autorização, Design System,
inventário e implementação real de Settings, além do relatório/runbook GITHUB-04.

## 2. Problemas observados

Agenda exibida sem executor confirmado; CTA desnecessário no Repository; seção GitHub da edição
com hierarquia e composição inferiores às Configurações do Usuário. Escopo corretivo delimitado.

## 3. Investigação do horário não executado

Inspeção de desenvolvimento **somente leitura**, às 01:24 de 11/10 (04:24Z):

| Evidência | Resultado |
| --- | --- |
| Processos | API iniciada às 01:02:11; nenhum `src/github-worker.js` ativo |
| Configuração local | GitHub App configurada; GITHUB_SCHEDULER_ENABLED=true |
| SyncRun 21, Project 2 | MANUAL; 04:02:24.912Z → 04:02:37.487Z; SUCCEEDED |
| SyncRun 22, Project 2 | MANUAL; 04:15:46.039Z → 04:15:51.953Z; SUCCEEDED |
| Último sucesso/tentativa | 04:15:51.950Z, isto é, 01:15 local |
| Próximo horário persistido | 04:49:01.815Z, isto é, 01:49 local |
| Histórico de SyncRun | 22 registros MANUAL; nenhum AUTOMATIC; nenhuma reserva ativa |

A execução das 01:15 foi manual. O horário 01:49 corresponde ao reagendamento após essa
conclusão. Na inspeção das 01:24 ele ainda era futuro. O horário originalmente visto antes da
manual não possui histórico de agenda recuperável; não se inventa esse instante nem se afirma
que 01:49 já tinha vencido. O snapshot não prova o histórico de processos anteriores à inspeção.

## 4. Causa raiz

**STARTUP / OBSERVABILITY:** no ambiente auditado havia API e SPA, mas nenhum worker separado.
A variável habilita o worker quando executado; não o inicia pela API. A preferência e o horário
continuavam sendo persistidos pelas mutations/manuais. A UI tratava agenda como disponibilidade.
Não foi identificado defeito de comparação UTC, claim ou pipeline que justificasse reescrevê-los.

## 5. Scheduler startup

README e `.env.example` explicitam o terceiro processo:
`cd backend` e `GITHUB_SCHEDULER_ENABLED=true npm run github:worker`.
A API registra essa dependência no startup. Worker desabilitado explica o motivo; sem App,
registra indisponibilidade; shutdown registra encerramento. Exceções não capturadas terminam o
processo pelo comportamento do Node, com recuperação por lease ao reiniciar. Sem OCI/supervisor novo.

## 6. Agendamento persistido

Policy GITHUB-04 preservada: base 30 min, jitter persistido, slots globais e reserva por projeto.
Manual reserva limpando a agenda e, ao concluir, calcula novo horário a partir do término.
Restart preserva horário futuro; atraso superior a dois ticks redistribui sem backlog, agora
registrando explicitamente OVERDUE_RESTART_JITTER e horários anterior/novo. Capacidade e cooldown
também têm motivo observável, sem repetir a mesma decisão a cada tick vazio.

## 7. Fuso horário

Instantes de agenda e heartbeat são Date/UTC; comparação usa instantes, nunca strings locais.
Browser formata no seu fuso. `2026-10-11T04:49:01.815Z` = `01:49:01.815 America/Sao_Paulo`.
MySQL local usa session/global timezone SYSTEM (UTC−3); os campos de agenda gravados via Prisma
seguem UTC. Não foi alterado timezone do banco. Teste compara Z e offset −03:00 equivalentes.

## 8. Correção implementada

`GitHubSchedulerWorker` contém somente UUID do processo e heartbeat; não é fila nem lock.
Necessidade: uma API em outro processo não consegue inferir liveness a partir de nextSyncAt ou
flag de ambiente. Migration incremental `20261011010000_github_scheduler_liveness`, aplicada
somente em teste. O worker confere a tabela antes de reservar e publica após tick bem-sucedido.

GET de sync/status mantém `run` e acrescenta `automation` com status, motivo e instantes, sem
identidade do worker. Disponibilidade exige heartbeat até max(60s, três ticks). Shutdown remove
somente a própria entrada; crash expira; registros efêmeros de mais de um dia são descartados.
Tabela pendente retorna SCHEMA_NOT_READY sem quebrar acesso/sync manual. Sem heartbeat recente,
a UI mantém a preferência e informa indisponibilidade, em vez de anunciar execução garantida.

## 9. Execução automática real

**PASS**, por `src/github-worker.js` em processos Node separados, sem chamada direta ao service
para iniciar a automática. Prova adicional com automação mantida ligada:

| Campo | Persistido em traceflow_test |
| --- | --- |
| Project / SyncRun | 117493 / 6508 |
| Horário elegível | 2026-10-11T04:49:10.896Z |
| Origem | AUTOMATIC |
| Início | 2026-10-11T04:49:11.524Z |
| Fim / estado | 2026-10-11T04:49:11.652Z / SUCCEEDED |
| Automação após conclusão | true |
| Próxima execução | 2026-10-11T04:50:13.632Z |

A execução começou após o instante devido; o novo horário ficou 61,980s após o término.
Base de teste 60s, tick 1s e lease 60s por env, com jitter intacto; default de produto continua
30 min. A pipeline percorreu repositório, branches, commits, PRs, issues e persistência.
As fixtures são descartáveis e a suíte completa posterior as removeu apenas do banco de teste.

## 10. SyncRun e logs

Logs estruturados canônicos: startup, elegibilidade, adiamento/motivo, reserva, início, conclusão,
falha, recuperação e shutdown. Sem tokens, chaves, cookies, payloads externos ou log por tick vazio.
Na prova acima: started às 04:49:09.475Z; claimed às 04:49:11.524Z;
run_started às 04:49:11.533Z com origin AUTOMATIC; run_completed às 04:49:11.658Z;
stopped às 04:49:11.696Z. Registros emitidos pelo logger real do worker, com saída habilitada
no harness de teste. A matriz anterior registrou mais 20 inícios AUTOMATIC em processos reais.

## 11. Exclusão mútua

activeProjectId, slots, lease/heartbeat e fencing transacional permanecem como no GITHUB-04.
Liveness operacional não participa da reserva. Testes reais de persistência continuam cobrindo
as duas ordens manual/automática, múltiplos workers, capacidade e escrita de worker expirado.

## 12. Recuperação e retry

Backoff e Retry-After preservados. Falha transitória mantém vínculo, artefatos e último sucesso.
Restart não reativa run expirado. Dois workers podem publicar liveness; parar um não invalida o
outro. Testes cobrem expiração de heartbeat e fallback seguro durante upgrade de schema.

## 13. Overview

Sem mudança de produto nesta página. Estado sem integração, ausência de CTA e acompanhamento
existente são incluídos na regressão e na matriz runtime. Nenhuma alteração de Health/indicadores.

## 14. Repository

Removido o link Configurar integração para todos os papéis. Header/nav, resumo, filtros e
catálogo permanecem; ausência de GitHub apresenta cinco valores Não disponível e o texto do
estado vazio. Projetos integrados mantêm as ações e tabelas existentes.

## 15. Project Edit

Repositório e badge juntos; branch como metadata secundária. Estado e ação de sync compartilham
a row, com último sucesso/tentativa próximos. Automação reúne label, descrição e switch;
agenda fica no mesmo grupo, mostrando Não agendada quando desabilitada. Polling também reconcilia
agenda/disponibilidade sem exigir novo run ou refresh. Feedback de consulta desconhecida não
fabrica disponibilidade. Fluxos de vínculo, confirmação de preferência e proteção async preservados.

## 16. Design System

Referência: SettingsLayout, settings-shared.css e IntegrationsSettingsPage reais. Equivalentes
canônicos usados: Switch, FeedbackRegion, TraceFlowIcon e buttons globais. Não existem components
SettingsSection/SettingsRow/StatusBadge genéricos no HEAD; a composição segue suas classes/tokens
reais sem importar internals da feature Settings. Sem novos cards, tokens ou linguagem visual.
Desktop usa contexto/conteúdo; tablet empilha contextos; mobile reorganiza datas/ações.
Inventário permanece TECHNICALLY VERIFIED, sem herdar homologação visual completa.

## 17. Testes backend

Focados: 9 arquivos, 144 testes PASS; proteção de banco adicional: 12 testes PASS.
Completo: **150 arquivos / 1.811 testes PASS**, dois arquivos/cinco skips históricos preexistentes.
Coverage statements 92,43%, branches 86,85%, functions 95,34%, lines 94,79%.
A primeira execução encontrou uma contagem fixa de 49 tabelas no teste da limpeza isolada;
agora são 50 com liveness. Expectativa ajustada e suíte completa reexecutada sem reduzir as
proteções de conexão/ambiente, skips, thresholds ou adicionar retries/timeouts.

## 18. Testes frontend

Focados: 6 arquivos, 120 testes PASS. Completo: 119 arquivos / **1.476 testes PASS**.
Coverage statements 86,02%, branches 80,88%, functions 81,88%, lines 88,51%.
Cobertura adicional: executor indisponível, descoberta via polling, agenda alterada sem novo
run, confirmação de preferência preservada e Repository sem CTA mesmo para OWNER.

## 19. Runtime

**55 verificações PASS**, mais a prova de reagendamento da seção 9. Matriz 1440×900, 768×1024
e 390×844, Light/Dark: sem GitHub, integrado, manual, automática, falha e automação ligada/desligada.
Build real, Express/Prisma reais, workers em processos separados; somente cliente GitHub e
disponibilidade de credenciais controlados. Banco, sessão, CSRF, pipeline, claim e UI reais.

UI passou de serviço indisponível para acompanhamento automático por polling, mostrou etapas,
bloqueou manual, preservou progresso após reload e liberou a ação ao terminar. Desligar durante
run preservou sua conclusão. Na ordem inversa, automática respeitou a manual. Falha preservou
vínculo, último sucesso e artefatos; retry não duplicou dados. Zero erros de página.
Dois processos disputaram um job sem duplicidade; SIGKILL e restart recuperaram a lease e
concluíram novo run, seguidos de SIGTERM normal. Apenas o heartbeat da fixture do run foi
retrodatado após matar os processos para acelerar a expiração; não se esperou a lease de produção.

Inspeção delimitada por DOM, CSS computado e bounds, sem screenshots, capturas ou pastas de
evidência. Logs e harness ficaram em `/tmp/traceflow-github041-*`. Servidores/workers temporários
foram encerrados antes da suíte final; processos de desenvolvimento foram preservados.

## 20. Banco isolado

TEST_DATABASE_URL obrigatória, distinta do desenvolvimento e validada antes de imports/fixtures.
Destino real conferido: `localhost:3306/traceflow_test`; desenvolvimento `traceflow` somente SELECT.
Nenhum teste/migration/cleanup alterou desenvolvimento. Liveness cleanup também passa pela
verificação transacional de conexão real. Upgrade com histórico, reaplicação, banco vazio e
schema audit passaram; 66 migrations no schema de teste, zero órfãos/projetos sem OWNER.

## 21. Gates completos

| Gate | Resultado final |
| --- | --- |
| Backend completo + coverage | PASS; 1.811 testes, cinco skips preexistentes |
| Frontend completo + coverage | PASS; 1.476 testes |
| Lint / format:check, ambos | PASS |
| Frontend build | PASS; avisos existentes de ELK/eval e chunks grandes |
| Prisma validate / generate / test deploy / status | PASS |
| Migration empty / upgrade GITHUB-04 / upgrade liveness / reapply | PASS |
| Schema audit / architecture | PASS; SCHEMA_CONSISTENT |
| Security/secrets | PASS |
| Local CI / audit / inventory policy | PASS; 86 testes |
| Workflow/scripts policy format / inventário | PASS |
| Dependency audit, ambos | 0 HIGH / 0 CRITICAL, zero exceções usadas |
| git diff --check | PASS |

O audit restrito não obteve relatório válido do registry; a execução com acesso de rede autorizado
passou nos dois projetos. Nenhuma dependência ou lockfile foi alterado. Resultados locais,
sem execução de CI remota ou Dependency Review de PR.

## 22. Limitações restantes

Heartbeat é observação recente, com janela de até 60s no padrão, acrescida do polling de 15s;
não promete pontualidade absoluta. GitHub real/OCI não foram homologados. MySQL local 26.7.0
difere de mysql:8.4.8 da CI; não se declara CI-equivalent. Sem auditoria visual completa,
leitor de tela ou dispositivos físicos. A migration de liveness não foi aplicada em desenvolvimento;
operação nesse ambiente requer aplicação autorizada das migrations e início explícito do worker.

## 23. Veredito final

**GITHUB-04.1 AUTOMATIC SYNC RELIABILITY & UX REFINEMENT — PASS LOCAL**

Causa comprovada no ambiente auditado; worker real executou automática, persistiu resultado e
próxima agenda. Runtime e gates finais passaram. Desenvolvimento permaneceu somente leitura;
a aplicação da migration nesse ambiente e a operação contínua do worker não foram realizadas
por esta rodada. Comandos e diagnóstico estão no [runbook](../runbooks/GITHUB_AUTOMATIC_SYNC.md).

Sem commit, push, merge, rebase, reset, clean, stash ou deploy. Nenhum trabalho OCI iniciado.
