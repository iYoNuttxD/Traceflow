# Relatório — PR #26: correções da revisão independente

- **Data:** 16/10/2026.
- **Enunciado:** `docs/issues/PR26_PROMPT_CORRECOES_REVISAO.md` (não versionado), com os 18 ⚑
  aprovados pelo João em 15/10/2026 na recomendação.
- **Revisão:** parecer independente publicado na PR #26, com os achados TF-REV-001 a TF-REV-008, sobre
  o head `9c053bf` (base `11eeea3`).
- **Estado:**
  - executadas: Fases 0 a 7, 9, 11 e 12, mais a 16, a 17 e a parte da 18 que não depende de aval;
  - aguardam o portão G1: Fases 8, 13, 14 e 15. O João levou o ADR-023 e o ADR-024 ao revisor em
    16/10/2026;
  - aguardam o João: migrations do zero e upgrade representativo (comandos no banco dele) e a matriz
    visual (portão G3).

## 1. Commits

Todos locais, na `joao-dev-v2`, sem push e sem coautoria.

| Fase | Commit | Conteúdo |
|---|---|---|
| 0 | `840db21` | ADRs 003 e 015 a 018 revistos; ADR-022 novo; ADR-023 e ADR-024 propostos; `NOTIFICATION_METRICS.md`; regras literais em `docs/data` |
| 1 | `970471b` | as quatro leituras de alertas conferem a membership ativa no serviço, com o 404 do middleware |
| 2 | `1a2700c` | caminho canônico na `/api` (o `b4bbdae` reaplicado): `%` no caminho recebe o 404 opaco antes da autorização |
| 3 | `8f1abc7` | contador único no contexto, com bilhete por ordem de início entre a consulta e a lista |
| 4 | `c3b10ea` | a falha gravada pela conexão de recuperação confere a lease e reagenda como o `fail` |
| 5 | `3014e95` | RF13 sem integração obrigatória; RF39 e RF40 sem corte pela criação do projeto |
| 6 | `177a96e` | RF30 com a própria mudança; RF59, RF60 e RF61 sem janela |
| 4 (correção) | `fb26839` | `recoveryTransaction`: a espera de trava da recuperação sem SQL Unsafe fora dos pontos permitidos (ARQ-19) |
| 1 (correção) | `3ba243a` | provas C3 do S2-01 leem o resumo como membro |
| 7 | `864f5c2` | `NotificationDecision` e `npm run notifications:metrics`: cobertura total `E/T`, elegível auxiliar e lacunas declaradas |
| 6 (resíduo) | `a75d404` | o texto da preferência do RF30 diz que a própria mudança também avisa |
| 9 | `2c71d73` | avisos de PR mesclada e issue fechada sem tarefa para todos os membros ativos (UX-D03) |
| 11 | `9595626` | painel lateral de notificações no lugar da página `/notifications` (UX-D01) |
| 12 | `574f247` | índice de alertas, histórico por sujeito e inconsistência nos artefatos (backend) |
| 12 | `0f9358c` | indicações nas tarefas, no Repositório e na Rastreabilidade; saem as páginas de alertas e de tarefas sem vínculo (UX-D02) |
| 18 | `b2b81a2` | L-17 e T-06, que matam os dois mutantes sobreviventes da primeira rodada |
| 17 | commit de registro | este relatório, o backlog, a matriz ASVS e as matrizes |

## 2. Achados

| Achado | Situação | Correção | Prova |
|---|---|---|---|
| TF-REV-001 leituras de alertas furadas por ID codificado | **CORRIGIDO** | `970471b`, `1a2700c` e `b2b81a2` | L-01 a L-17, S-01 a S-04, `pr26-caminho-canonico.test.js` e a varredura `autorizacao-varredura.test.js`; MP01 a MP07 |
| TF-REV-002 restrições e métricas fora do TCC | **PARCIAL** | regras: `3014e95`, `177a96e` e `a75d404`; métrica: `864f5c2` | T-01 a T-06, N-01 a N-05, M-01 a M-08 e M-P01 a M-P08; MP15 a MP22. A fonte durável do RF60/RF61 (Fase 8) aguarda o G1; até lá, a cobertura total desses dois sai "indisponível" com o motivo `FONTE_POR_COMPARACAO_DE_ESTADO` |
| TF-REV-003 falha na conexão de recuperação | **CORRIGIDO** | `c3b10ea` e `fb26839` | R-01 a R-07; MP11 a MP14 |
| TF-REV-004 "Marcar todas" depois de marcar como não lida | **CORRIGIDO** | `8f1abc7`; o painel do `9595626` lê o mesmo contador | C-01 e C-02; MP08 |
| TF-REV-005 fechamento do cliente Prisma | **AGUARDA G1** (Fase 13, ADR-024 D6) | — | fechamento medido na Fase 16 (seção 7) |
| TF-REV-006 jobs fora dos artefatos | **AGUARDA G1** (Fase 14, ADR-024 D7 e D8) | — | entrypoints e receita levantados na Fase 16 (seção 7) |
| TF-REV-007 consulta antiga sobrescreve o contador | **CORRIGIDO** | `8f1abc7` | C-03 a C-06; MP09 e MP10 |
| TF-REV-008 interface pesada e fragmentada | **CORRIGIDO NO CÓDIGO** | `2c71d73`, `9595626`, `574f247` e `0f9358c` | I-01 a I-10, A-01, A-02, A-P01 a A-P06, A-F01 a A-F03, P-01 a P-12, IND-01 a IND-03, X-01 a X-14; MP23 a MP27. A aprovação visual (G3) é a matriz da seção 10 |
| Condição A01: mecanismo de transações | **PROPOSTA ENTREGUE** | ADR-024 (proposto) | o endurecimento (Fase 15) aguarda o G1 |
| Condição: composição com a branch OCI | **LEVANTADA** | Fase 16, só leitura | seção 7 |

## 3. Aderência literal ao TCC (tabela da seção 2, reexecutada)

Os quadros citados são os do PDF local (ver seção 9). "PASS" quer dizer que o código faz o que o texto
do quadro manda, com teste e mutante.

| RF (quadro) | Texto do TCC | Situação em `b2b81a2` | Veredito | Evidência |
|---|---|---|---|---|
| RF13 (3-51) | alerta quando a tarefa é marcada "Concluído" sem ao menos um commit vinculado | alerta com ou sem integração; desconectar não resolve | PASS | T-01, T-04 e T-06; MP15 |
| RF39 (3-52) | alerta quando a PR é mesclada sem tarefa vinculada | sem corte pela criação do projeto | PASS | T-02; MP16 |
| RF40 (3-53) | alerta quando a issue é fechada sem tarefa vinculada | sem corte; issue sem data de fechamento alerta com `CLOSE_TIME_UNAVAILABLE` | PASS | T-03 e T-05; MP17 |
| RF30 (3-56) | notificar o responsável quando a tarefa muda de status | a mudança feita pelo próprio responsável também avisa | PASS | N-01; MP18 |
| RF59 (3-55) | notificar quando a tarefa ultrapassa o prazo | sem janela: vencida há 8 ou 400 dias também avisa | PASS | N-02, N-03 e N-05; MP19 |
| RF60 (3-57) | notificar os envolvidos quando a issue vinculada é aberta ou fechada | sem janela; a transição ainda nasce da comparação de estado | PARCIAL | N-04; MP20. Transições intermediárias dependem da Fase 8 (ADR-023) |
| RF61 (3-58) | notificar os envolvidos quando a PR vinculada é mesclada ou fechada | igual ao RF60 | PARCIAL | igual ao RF60 |
| Métrica (3-55 a 3-58) | (notificações enviadas corretamente / total de eventos ocorridos) × 100 | cobertura total `E/T`; a elegível sai rotulada como auxiliar; lacuna dá "indisponível", nunca 0 nem 100 | PASS | M-01 a M-08, M-P01 a M-P08; MP21 e MP22 |

## 4. Testes nomeados

| Arquivo | Casos | Situação |
|---|---|---|
| `backend/test/api/pr26-alertas-leitura.test.js` | L-01 a L-17 | verdes; o L-17 entrou na Fase 18 (MP05) |
| `backend/test/unit/pr26-alertas-servico.test.js` | S-01 a S-04 | verdes |
| `backend/test/unit/pr26-caminho-canonico.test.js` e `backend/test/conformance/autorizacao-varredura.test.js` | caminho canônico em todas as posições, para não membro e os quatro papéis | verdes |
| `backend/test/integration/pr26-falha-recuperacao.test.js` | R-01 a R-07 | verdes |
| `frontend/test/features/pr26-contador.test.jsx` | C-01 a C-06 | verdes |
| `backend/test/integration/pr26-alertas-tcc.test.js` | T-01 a T-06 | verdes; o T-06 entrou na Fase 18 (MP15) |
| `backend/test/integration/pr26-notificacoes-tcc.test.js` | N-01 a N-05 | verdes |
| `backend/test/integration/pr26-metricas.test.js` e `backend/test/unit/pr26-metricas.policy.test.js` | M-01 a M-08 e M-P01 a M-P08 | verdes |
| `backend/test/integration/pr26-avisos-inconsistencia.test.js`, `backend/test/api/pr26-avisos-api.test.js` e `backend/test/unit/pr26-avisos.policy.test.js` | I-01 a I-10, A-01, A-02 e A-P01 a A-P06 | verdes |
| `frontend/test/features/pr26-avisos.test.jsx` | A-F01 a A-F03 | verdes |
| `frontend/test/features/notifications/pr26-painel.test.jsx` | P-01 a P-12 | verdes |
| `backend/test/api/pr26-indicacoes-api.test.js` | IND-01 a IND-03 | verdes |
| `frontend/test/features/traceability/pr26-indicacoes.test.jsx` | X-01 a X-14 | verdes |
| `frontend/test/features/traceability/pr26-inconsistencias-migradas.test.jsx` | casos das páginas retiradas: F2, F6 a F13, F14, F16, AT-U-04 a AT-U-06, AT-U-09, C4 e C5 | verdes |
| `backend/test/integration/pr26-fonte-duravel.test.js` | D-01 a D-06 | não escrito: Fase 8, aguarda o G1 |
| `backend/test/unit/pr26-fechamento-prisma.test.js` | F-01 | não escrito: Fase 13, aguarda o G1 |
| `backend/test/unit/pr26-agenda-jobs.test.js` | J-01 a J-04 | não escrito: Fase 14, aguarda o G1 |
| `backend/test/integration/pr26-orcamento-conexoes.test.js` | O-01 a O-04 | não escrito: Fase 15, aguarda o G1 |

Os testes do Anexo B do prompt foram reescritos nas fases indicadas, com a justificativa no commit
de cada uma. Os das páginas retiradas (`TraceabilityAlertsPage`, `TraceabilityAlerts.bateria` e
`UnlinkedTasksPage`) saíram no `0f9358c`, depois que os casos que valiam passaram para
`pr26-inconsistencias-migradas.test.jsx`.

## 5. Mutantes

Cada mutante foi aplicado sozinho, com os testes da área, e o arquivo restaurado em seguida
(`git status` limpo depois de cada rodada).

| Mutante | Mudança | Morto por |
|---|---|---|
| MP01 | `list` sem `requireMember` | L-01 a L-04, S-01 e S-02 |
| MP02 | `summary` sem `requireMember` | L-01 a L-04, S-01 e S-02 |
| MP03 | `get` sem `requireMember` | L-01 a L-04, S-01 e S-02 |
| MP04 | `listUnlinkedTasks` sem `requireMember` | S-01 e S-02 |
| MP05 | membership inativa aceita em `findMembershipRole` | L-17 (sobreviveu na primeira rodada; ver abaixo) |
| MP06 | corpo do 404 diferente do middleware | S-01 nas três leituras |
| MP07 | caminho canônico só para `%3` | 6 casos de `pr26-caminho-canonico.test.js` (`%2F`, `%2f`, `%ZZ`) |
| MP08 | o painel volta a ler o contador da lista | C-01 e C-02 |
| MP09 | `report` sem invalidar | C-03 e C-06 |
| MP10 | `refresh` aceita geração antiga | C-03 e C-06 |
| MP11 | recuperação sem `ownsLease` | R-01, R-05 e R-07 |
| MP12 | recuperação sem `reschedule` | R-02, R-03 e R-04 |
| MP13 | recuperação sem `retryAt` | R-02 |
| MP14 | recuperação sem `permanent` | R-03 |
| MP15 | RF13 exige integração | T-06; na variante que também filtra a avaliação da tarefa movida, T-01, T-04 e T-06 (sobreviveu na primeira rodada; ver abaixo) |
| MP16 | corte no RF39 | T-02 |
| MP17 | corte no RF40 | T-03 e T-05 |
| MP18 | `SELF_CHANGE` no RF30 | N-01 |
| MP19 | janela de 7 dias no RF59 | N-02, N-03 e N-05 |
| MP20 | janela de 7 dias no RF60/RF61 | N-04 |
| MP21 | cobertura total com o denominador elegível | M-01, M-03 e M-04 |
| MP22 | lacuna vira 0 ou 100 | M-02, M-03 e M-05 |
| MP23 | aviso para membership inativa | I-02 |
| MP24 | aviso para quem entrou depois da detecção | I-03 |
| MP25 | a leitura resolve o alerta | I-04 |
| MP26 | a dispensa marca o aviso como lido para todos | I-05 |
| MP27 | lote acima de 10 gera avisos individuais | I-07 e I-08 |
| MP28 | transição intermediária descartada | não rodado: o código é da Fase 8 |
| MP29 | fechamento com `env.js` | não rodado: o teste é da Fase 13 |
| MP30 | job sem `GET_LOCK` | não rodado: o código é da Fase 14 |

**Os dois sobreviventes da primeira rodada.**
- **MP05.** Os testes de API passam pelo middleware de projeto, que já recusa a membership inativa,
  e o teste de unidade do serviço simula o repositório. Faltava um teste que chamasse o serviço com o
  banco. O L-17 chama as cinco leituras (lista, índice, resumo, detalhe e tarefas sem vínculo) e
  confere o 404 `RESOURCE_NOT_FOUND` para a membership inativa e para o projeto excluído.
- **MP15.** A primeira versão do mutante filtrava só a lista de candidatos da reconciliação
  completa. O T-01 cria o alerta pela movimentação da tarefa, que avalia a tarefa movida sem passar
  por essa lista. O T-06 cria a tarefa já concluída num projeto sem integração e confere o alerta
  depois da reconciliação completa. A variante mais fiel ao comportamento antigo (filtrar também a
  avaliação) morre por T-01, T-04 e T-06.

## 6. Verificação

**Gates**, todos com saída 0 em `0f9358c` (os do backend repetidos depois do `b2b81a2`):

| Gate | Resultado |
|---|---|
| backend: `npm run lint`, `npm run format:check`, `npm run architecture:check` e `npm run security:secrets` | verdes |
| backend: `npx prisma validate` | verde |
| backend: `npm run db:test:status` | "76 migrations found in prisma/migrations"; "Database schema is up to date!" |
| backend: `npm run db:lr5:audit -- --test` | verde |
| política da CI: `npx prettier --check` nos arquivos da CI, `node --test scripts/check-ui-inventory.test.mjs` e `node --test scripts/validate-ci.test.mjs` | verdes |
| frontend: `npm run lint`, `npm run format:check` e `npm run build` | verdes; o build repete três avisos que já existiam: `MISSING_NAME_OPTION_FOR_IIFE_EXPORT`, `INEFFECTIVE_DYNAMIC_IMPORT` da página de preferências (exportada no `index.js` desde antes da PR) e o bloco acima de 500 kB |

**Suítes no SHA final** (`b2b81a2`), em sequência, porque o banco de teste é compartilhado:

| Suíte | Resultado |
|---|---|
| backend, rodada 1 | 2.947 passaram, 5 pulados (fixos no código) e 2 falharam, as duas conhecidas do ambiente Windows: `storage.test.js` (symlink, `EPERM`) e `e11-mapping-writer.test.js` (permissões POSIX que o NTFS não guarda) |
| backend, rodada 2 | o mesmo: 2.947 passaram, 5 pulados e as mesmas 2 falhas de ambiente |
| frontend | 1.678 passaram e 10 falharam: 9 timeouts de 5 s (S201-F06) em `TraceabilityWorkspace`, `PersonalizedDashboard`, `KanbanPage`, `RequirementsPage` e `TestCases`, que passam isolados (171 de 171), e o teste de imports dinâmicos, que falha no Windows pelo separador de caminho |
| `asvs-matrix.test.js`, depois da atualização da matriz | 5 de 5 |

**Migrations.**
- As 74 antigas não mudaram: `git diff --name-only 9c053bf HEAD -- backend/prisma/migrations` lista só
  `20261015120000_notification_decisions` e `20261015130000_traceability_inconsistency_notices`.
- O banco de teste está com as 76 aplicadas (`db:test:status`).
- **Pendentes de aval do João**, porque criam bancos no MySQL dele:
  - a cadeia do zero num banco vazio (`npm run db:test:validate-empty`, que cria e apaga
    `traceflow_test_lr2_empty_validation`; no Windows o script tem o S201-F14, e a alternativa é o
    mesmo roteiro com `shell: true`);
  - o upgrade representativo, numa cópia do banco de dev em `traceflow_upgrade_test`.

**Auditoria de trailers.** `git log --format=%(trailers) 9c053bf..HEAD` não traz nenhum trailer. As
mensagens não citam Claude.

## 7. Composição com a branch OCI (Fase 16, só leitura)

Lida em `origin/daniel-dev` no `cf15522` (15/10/2026), sem `fetch` novo. Nada foi gravado na branch
OCI nem no produto.

**Diagnóstico.** O allowlist exato de `deploy/lib/diagnostic_contract.py` tem, de `backend/src`, só
`database/prismaClient.js` e `database/database-safety.js`. O fechamento estático do
`prismaClient.js` no HEAD tem 14 arquivos:
- `src/database`: `prismaClient`, `database-safety`, `transaction-guard`, `lock-wait` e
  `recovery-prisma`;
- `src/shared/logger`: `index`, `logger` e `redaction`;
- `src/config/env.js`;
- `src/shared/errors`: `index`, `app-error`, `error-codes`, `resource-not-found` e `domain-error`.

Hoje o allowlist precisaria de mais 12 arquivos, e mesmo assim o `env.js` lançaria
`ConfigurationError` no diagnóstico, que só define `NODE_ENV` e `DATABASE_URL`. Com a Fase 13
(ADR-024 D6), o fechamento cai para 8 arquivos e o allowlist precisa de mais 6.

**Receita de release.** `scripts/package_release.py` monta dois artefatos:
- o de runtime, com `backend/src`, `backend/prisma`, o `package.json` e o lock, os módulos de
  produção e o `frontend/dist`;
- o de administração, com os módulos completos, o `package.json`, o lock e `backend/prisma`.

`backend/scripts` não entra em nenhum dos dois. Consequências até a Fase 14:
- o vencimento do RF59 (`notifications:due`) só roda por script e fica sem agendador em produção;
- o despacho dos eventos do GitHub roda depois de cada sincronização dentro do worker
  (`dispatchAfterSync`), mas a nova tentativa manual (`--retry-failed`) depende do script;
- os avisos de inconsistência saem depois da reconciliação e das mutações, dentro do processo;
- o dry-run e a métrica (`notifications:metrics`) precisam do artefato de administração.

**Migrations.** No HEAD são 76; na branch OCI, 68; na composição, 77. A única que só a OCI tem é
`20261014090000_resumable_evidence_uploads`, que fica entre as do HEAD na ordem por nome. Um banco
que já aplicou as do HEAD recebe essa migration como pendente no `migrate deploy`. Isso precisa de
confirmação na homologação.

**Conflitos textuais** (`git merge-tree --write-tree --name-only HEAD origin/daniel-dev`, sem tocar
na árvore de trabalho): `backend/src/server.js`, `backend/src/shared/http/health.js`,
`backend/test/integration/test-database-guard.test.js` e `docs/api/API_CONTRACTS.md`. São os
mesmos quatro de 15/10.

**Serviços.** `traceflow-api.service` e `traceflow-github-worker.service` usam `Restart=on-failure`,
`RestartSec=10s` e no máximo 3 partidas em 300 s. O `TimeoutStopSec` é de 45 s na API e de 90 s no
worker; o ADR-024 diz 90 s para os dois e deve ser corrigido na próxima revisão dele.

**Variáveis.** A Fase 6 retirou `NOTIFICATIONS_DUE_LOOKBACK_DAYS` e
`GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS`. O validador de ambiente da OCI não as cita. Se os
arquivos de `/etc/traceflow` as definem, elas passam a ser ignoradas.

**O que muda na branch OCI (com o dono dela, item PR26-F03 do backlog):**
1. o allowlist do diagnóstico, com o manifesto e os hashes regenerados, dois builds reproduzíveis e
   o smoke ARM64 (depois da Fase 13);
2. o artefato de administração com os quatro entrypoints de `backend/scripts` e
   `scripts/lib/database-safety.js` (ADR-024 D8);
3. a resolução dos quatro conflitos, com o ciclo de vida da OCI (`createLifecycle`) recebendo a
   desconexão do cliente de recuperação e a saída controlada do ADR-024 D5;
4. a retirada das duas variáveis de janela dos arquivos de ambiente, se estiverem lá.

## 8. Desvios em relação ao prompt

- **Fase 7.**
  - O despacho do GitHub não grava `NotificationDecision`: o ⚑9 aprovado manda usar o `outcome` dos
    eventos, e o texto da Fase 7 dizia o contrário.
  - A decisão não tem `taskId`.
  - O job do RF59 grava as decisões em paralelo com as notificações e desfaz o envio da notificação
    que não ficou gravada. Assim, o NT-J-08 ficou em 0,78 s por 10 mil tarefas, contra 1,26 s.
  - A anonimização zera o destinatário (`recipientKey = -id`), em vez de apagar a decisão, para a
    métrica continuar contando o evento.
  - "Não enviadas sem motivo autorizado" virou um termo próprio, com os antigos `OUTSIDE_WINDOW` e
    `PROJECT_DELETED`; `NO_TASK` entra em N.
- **Fase 10 (esboço).** "Marcar todas como lidas" fica na linha do filtro Origem, e não no
  cabeçalho, por falta de largura em 400 px.
- **Fase 11.**
  - O item mostra o horário de criação do aviso; a data do evento no GitHub e o título do artefato
    saíram do item.
  - O aviso do GitHub cuja tarefa foi excluída abre o artefato no GitHub em nova aba e continua no
    painel, porque não tem outro destino.
  - O nome do botão de leitura traz o projeto, para dois avisos iguais em projetos diferentes não
    terem o mesmo nome.
- **Fase 12.**
  - O backend e o frontend saíram em dois commits (`574f247` e `0f9358c`), para o contrato entrar
    antes de quem o consome.
  - O bloco "Sem rastreabilidade" do resumo do Kanban virou "Sem vínculo técnico" e conta pelo RF58.
    Antes ele contava o requisito como vínculo e mostraria um número diferente da linha nova.
  - A lista de tarefas ganhou a linha "Rastreabilidade". O `tasks-facelift.test.js` do Daniel proibia
    a palavra no card; a asserção passou a exigir só a linha compacta, sem a lista de artefatos nem
    ações de vínculo.
  - A coluna de estado do Repositório mantém o rótulo atual ("#42 · Mesclado") e acrescenta a linha
    "sem tarefa vinculada"; o prompt dizia "Mesclada · sem tarefa".
  - `/traceability/alerts` leva à Rastreabilidade, onde está o resumo, e `/traceability/unlinked-tasks`
    leva a `/tasks?rastreabilidade=SEM_VINCULO`.
  - O `AlertDetails` carrega sob demanda no Repositório, para cortar o ciclo de imports entre
    `github`, `traceability` e `tasks`, que quebrava o mock do GitHub no `TasksPage.test.jsx`. A
    importação continua pelo `index.js`, como exige o `architecture-check`.
  - O H38 (`estados-sprint2.test.jsx`) achou o `Retry-After` ausente no erro do `AlertDetails`, e a
    correção entrou no mesmo commit.
- **Fase 16.** A leitura usou o `cf15522` já buscado em 15/10, sem `fetch` novo.
- **Fase 17.** A matriz ASVS também passa o V8.4.1 a atendido, além dos três do prompt (V8.2.1,
  V8.2.2 e V8.3.1): a causa do "não atendido" era a mesma sonda H09.
- **Fase 18.** Os testes L-17 e T-06 entraram para matar o MP05 e o MP15 (`b2b81a2`).

## 9. Divergência do PDF (⚑1)

O PDF citado pelo revisor não é o local:

| PDF | Hash | Páginas |
|---|---|---|
| do revisor | `b06bc1be…` | 132 |
| local (Somativa 2) | `05fe0ec9…` | 118 |

O texto dos quadros 3-51 a 3-58 confere entre os dois. Por isso a documentação e a resposta citam
o requisito pelo quadro, e não pela página.

## 10. Matriz visual (seção 7 do prompt)

Pendente. Não foi possível rodar a aplicação real sem migrar o banco de dev do João, o que pede aval,
e sem o login dele. O comportamento está coberto pelos testes de componente e de página (seção 4).
A matriz cobre:
- as cinco superfícies: painel, Kanban e lista, detalhes, Repositório e Rastreabilidade;
- dados mínimos e em escala;
- 1536, 1280, 768 e 390 px;
- temas claro e escuro, mais `forced-colors`;
- os estados de vazio, erro, carregamento e limite de taxa.

O aceite é do João (VISUALLY APPROVED). O inventário de UI marca as superfícies novas como
"TECHNICALLY VERIFIED", com a verificação visual pendente.

## 11. Critérios de aceite (seção 8 do prompt)

| Critério | Situação |
|---|---|
| Oito achados corrigidos com regressão | cinco corrigidos e TF-REV-008 corrigido no código; TF-REV-005 e TF-REV-006 aguardam o G1 |
| Migrations existentes preservadas | atendido (seção 6) |
| Aderência literal ao TCC | atendida em seis linhas; RF60 e RF61 parciais até a Fase 8 (seção 3) |
| Lacunas explicadas, sem zero nem 100% inventados | atendido: `NOTIFICATION_METRICS.md`, `notifications:metrics`, M-02, M-05 a M-07 e MP22 |
| Decisões abertas aprovadas antes de contrato novo | atendido: as Fases 8, 13, 14 e 15 esperam o G1 |
| Direção visual implementada e aprovada | G2 aprovado em 16/10/2026; G3 pendente |
| Composição com a OCI revisada | atendido (seção 7); a mudança na branch OCI fica com o dono dela |
| Testes no SHA resultante | suítes no `b2b81a2` (seção 6); migrations do zero e upgrade aguardam o aval do João |

## 12. O que fica

- **Portão G1** (ADR-023 e ADR-024 com o revisor): Fases 8, 13, 14 e 15, com D-01 a D-06, F-01,
  J-01 a J-04, O-01 a O-04 e os mutantes MP28 a MP30. Itens PR26-F01 e PR26-F02 do backlog.
- **Aval do João:** migrations do zero, upgrade representativo e matriz visual (G3).
- **Branch OCI:** item PR26-F03.
- **Homologação:** item PR26-F04 (ARM64, HeatWave, TLS e a saída controlada).
- **Fora do escopo (⚑18):** E2E de navegador (S104-F02), os CONF-F que não o CONF-F51, o S202-F36 e o
  indicador de cobertura na interface (S202-F05 e S203-F06, agora com o instrumento entregue).
