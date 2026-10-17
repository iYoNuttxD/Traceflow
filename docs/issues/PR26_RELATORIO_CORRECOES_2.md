# Relatório — PR #26: correções da segunda revisão independente

- **Data:** 17/10/2026.
- **Enunciado:** `docs/issues/PR26_PROMPT_CORRECOES_REVISAO_2.md` (não versionado), com os 19 ⚑
  aprovados pelo João em 17/10/2026 na recomendação ("Pode seguir com as recomendações dos 19 ⚑").
- **Revisão:** segundo parecer independente publicado na PR #26, sobre o head `08682e9`. Ele
  encerrou TF-REV-001, 003, 004 e 007, manteve TF-REV-002, 005, 006 e 008 e abriu TF-REV-009 a 012.
- **Estado:**
  - executadas: Fases 0 a 14, a parte da 15 e da 16 que não depende de aval, e esta 17;
  - as cadeias de migrations do zero (80) e composta com a OCI (81) rodaram com o aval do João, em
    17/10/2026, cada uma num banco temporário apagado no fim (seção 7);
  - aguardam a liberação do João: o banco `traceflow_visual_r2` e as portas dele, para as capturas
    da matriz visual; depois, a aprovação dele (portão G3, seção 8);
  - aguardam o dono da branch OCI: allowlist do diagnóstico, contagem inicial de migrations e
    conflitos (seção 6, PR26-F03).

## 1. Commits

Todos locais, na `joao-dev-v2`, sem push e sem coautoria.

| Fase | Commit | Conteúdo |
|---|---|---|
| 0 | `9d63b49` | ADR-023 e ADR-024 aceitos; ADR-016, 018 e 022 revistos; regras em `docs/data`, contratos e runbooks, com o novo `SCHEDULED_JOBS.md` |
| 1 | `0e97249` | RF59: notificação e decisão na mesma transação, em unidades de até 1.000 linhas, 4 por vez (TF-REV-009) |
| 2 | `c9690a5` | provas de prazo com `SLEEP` acima do prazo e EV-S-07 com coordenação explícita (TF-REV-012) |
| 3 | `96c0415` | `TaskArtifactLinkPeriod`: período de cada vínculo com issue e PR |
| 4 | `a50e597` | fonte durável: eventos de issue e PR lidos do histórico do repositório, cobertura por projeto |
| 9 | `eca49dc` | histórico de inconsistências da tarefa sem alerta aberto (TF-REV-010) |
| 10 | `945304f` | `Shift+Tab` a partir do título fica no painel (TF-REV-011) |
| 11 | `f46dab0` | modal da inconsistência compacto, sem repetir a identificação e a data (UX-R2-01) |
| 12 | `3240292` | inconsistências abertas no resumo da Rastreabilidade (UX-R2-02) |
| 5 | `c19e442` | `ISSUE_OPENED`: abertura de issue vinculada no RF60 |
| 6 | `cdac782` | recuperação com uma conexão, espera dos `KILL` limitada e saída controlada (decisão 2) |
| 7 | `443e1e2` | logger sem o `env.js`: fechamento do cliente em 9 arquivos (TF-REV-005) |
| 8 | `bf379aa` | jobs no worker com lease e drenagem; comandos em `src/jobs/cli` (TF-REV-006) |
| 13 | `43c1da6` | "Sem vínculo técnico" no resumo de Tarefas e só no filtro (UX-R2-03) |
| 14 | `34c78dc` | painel e preferências pela esquerda; estado vazio com ícone (UX-R2-04) |
| 16 | `1962c49` | U-05 e J-03, que matam os mutantes MR01 e MR15 |
| 16 | `77761aa` | inventário de UI sem a faixa removida e com as contagens |
| 16 | `31d6ff2` | V-06: evento antes, no início, durante, no fim e depois do período |
| 17 | `9ff391f` | este relatório, o backlog, a matriz de RF e os documentos de privacidade |
| 16 | commit de registro | as duas cadeias de migrations aplicadas do zero, com o aval do João |

As fases foram commitadas na ordem em que ficaram prontas: as de interface (9 a 12) entraram antes
da 5, porque não dependiam dela.

## 2. Achados

| Achado | Situação | Correção | Prova |
|---|---|---|---|
| TF-REV-002 RF60/RF61 por comparação de estado; abertura sem contrato | **CORRIGIDO** | `96c0415`, `a50e597` e `c19e442` (ADR-023) | V-01 a V-06, F-01 a F-16, A-01 a A-05 e a política da fonte durável; MR04 a MR09 |
| TF-REV-005 fechamento do cliente fora do allowlist OCI | **CORRIGIDO NO CÓDIGO**; fecha com o artefato da OCI | `443e1e2` (e `cdac782`, que trouxe o `engine-health.js`) | C-01 e C-02; MR13. O allowlist com SHA-256 está na seção 6 |
| TF-REV-006 jobs e comandos fora da OCI | **CORRIGIDO** | `bf379aa` (ADR-024 D7 e D8) | J-01 a J-09; MR14 e MR15; simulação da seleção do artefato (seção 6) |
| TF-REV-008 UX-R2-01 a UX-R2-04 | **CORRIGIDO NO CÓDIGO**; aprovação visual no G3 | `f46dab0`, `3240292`, `43c1da6` e `34c78dc` | M-01 a M-05, R-01 a R-04, T-01 a T-05 e P-04 a P-07; MR17 |
| TF-REV-009 RF59 com `SENT` sem notificação | **CORRIGIDO** | `0e97249` e `1962c49` | U-01 a U-05; MR01 (vivo na primeira rodada, morto pelo U-05) |
| TF-REV-010 histórico da tarefa some sem alerta aberto | **CORRIGIDO** | `eca49dc` | H-01 a H-04; MR02 |
| TF-REV-011 `Shift+Tab` no título sai do diálogo | **CORRIGIDO** | `945304f` | P-01 a P-03; MR03 |
| TF-REV-012 prova de prazo dependente de CTE e EV-S-07 sem coordenação | **CORRIGIDO** | `c9690a5` | as provas da Fase 2 e o EV-S-07; MR16 |
| Decisão 2: guarda global | **CORRIGIDO** | `cdac782` (ADR-024 D2 a D5) | O-01 a O-05; MR10 a MR12 |

## 3. Decisões arquiteturais do parecer

| Decisão | Resposta |
|---|---|
| 1. Aderência literal ao TCC | RF60 com abertura (`ISSUE_OPENED` no vínculo, ADR-023 D6), fechamento e reabertura, cada um com a data do GitHub; RF61 com merge e fechamento; RF59 sem `SENT` sem notificação. A métrica oficial conta a abertura no RF60 |
| 2. Guarda global (ADR-024) | mantida, com uma conexão de recuperação, `KILL` com espera de até 2 s, conexão envenenada e saída controlada com código 1; `DATABASE_POOL_LIMIT` |
| 3. ADR-023 revisto | aceito em 17/10/2026: fonte durável pela listagem de eventos do repositório, identidade pelo id do GitHub, período do vínculo no instante do evento, corte por projeto e lacuna de aquisição na métrica |
| 4. Worker ou timers do systemd | worker, com lease em tabela (ADR-024 D7); timers registrados como alternativa |
| 5. Cadeia composta antes da primeira inicialização | 81 migrations (80 nossas e 1 da OCI); `INITIAL_MIGRATION_COUNT` da OCI passa de 68 para 81. A cadeia composta foi aplicada do zero num banco temporário, com as 81 (seção 7) |
| 6. Conflitos | 5 arquivos, com o que preservar em cada um (seção 6) |
| 7. Escolhas do ADR-022 | confirmadas uma a uma pelo João na recomendação do ⚑16: resumo acima de 10 avisos; `joinedAt` e `enabledAt` até `detectedAt`; alertas anteriores aos avisos ficam `NOT_APPLICABLE` |

## 4. Desvios do enunciado

- **Fechamento com 9 arquivos, não 8.** A guarda (Fase 6) importa o `engine-health.js` para marcar
  o motor como indisponível no pânico e na conexão envenenada. Ele não importa nada. O ADR-024 D6 e
  o C-01 já dizem 9; a branch OCI ganha 7 arquivos no `SOURCES`.
- **Código do Daniel tocado além do previsto no ⚑8:**
  - `github-sync-scheduler.service.js`: o `reportFailure` chama `noteDatabaseFailure`, para o
    pânico fora de transação também parar o worker;
  - `github-worker.js`: passou a montar o `createWorkerRuntime` com o agendador e os jobs (era
    previsto no ⚑6);
  - `env.js`: a variável `JOBS_ENABLED` (prevista no ⚑6).
- **Reconciliação agendada com o gatilho `SCRIPT`.** O job grava o mesmo gatilho do comando
  manual, sem valor novo no enum.
- **Testes antigos ajustados:**
  - `r2-fonte-duravel.test.js` conta só os eventos de ciclo de vida, sem a abertura do vínculo, que
    tem os seus A-01 a A-05; o fixture da issue ganhou a data de criação;
  - o X-03 de `pr26-indicacoes.test.jsx` foi reescrito para o resumo e o filtro em "Buscar e
    filtrar";
  - o F9 de `Notifications.github-events.test.jsx` usa o botão de preferências do painel;
  - saiu o teste unitário de `technicalLinkSummary`, junto com a função;
  - os testes que chamavam `scripts/` passam a chamar `src/jobs/cli`.
- **Inventário de UI.** A faixa removida saiu da tabela canônica; o validador da CI não aceita um
  status "removido".
- **Conflitos.** São 5, não 4: o `github-worker.js` entrou com a Fase 8.

## 5. Testes nomeados

| Arquivo | Casos |
|---|---|
| `backend/test/integration/r2-rf59-unidade-atomica.test.js` | U-01 a U-03 e U-05; o U-04 é o NT-J-08 da bateria do S2-02 (seção 7) |
| `backend/test/integration/r2-vinculo-periodos.test.js` | V-01 a V-06 |
| `backend/test/integration/r2-fonte-duravel.test.js` | F-01 a F-16 |
| `backend/test/unit/r2-fonte-duravel.policy.test.js` | conversão de eventos, absorção do `closed` do merge, período no instante do evento, chaves, lacunas e mapper |
| `backend/test/integration/r2-abertura-rf60.test.js` | A-01 a A-05 |
| `backend/test/integration/r2-orcamento-conexoes.test.js` | O-01 a O-05 (15 execuções) |
| `backend/test/unit/r2-fechamento-prisma.test.js` | C-01 e C-02 |
| `backend/test/unit/r2-agenda-jobs.test.js` e `backend/test/integration/r2-agenda-jobs.test.js` | J-01 a J-09 (16 execuções) |
| `frontend/test/features/traceability/r2-historico-tarefa.test.jsx` | H-01 a H-04 |
| `frontend/test/features/notifications/r2-painel-esquerda.test.jsx` | P-01 a P-07 |
| `frontend/test/features/traceability/r2-modal-compacto.test.jsx` | M-01 a M-04; o M-05 está no F2 de `pr26-inconsistencias-migradas.test.jsx` |
| `frontend/test/features/traceability/r2-resumo-rastreabilidade.test.jsx` | R-01 a R-04 |
| `frontend/test/features/tasks/r2-filtro-vinculo.test.jsx` | T-01 a T-05 |

## 6. Composição com a branch OCI (Fase 15, só leitura)

Lida em `origin/daniel-dev` no `3f37cfb` (17/10/2026), depois do `git fetch origin daniel-dev`
aprovado no ⚑9. Base comum: `11eeea3`. Nada foi gravado na branch OCI.

**Conflitos** (`git merge-tree --write-tree HEAD origin/daniel-dev`, sem tocar a árvore de
trabalho):

| Arquivo | O que preservar |
|---|---|
| `backend/src/github-worker.js` | o `assertWorkerEnvironment(env)` da OCI e o `createWorkerRuntime` com o agendador, os jobs e o `disconnectDatabase`; o lado da OCI usa `prisma`, que não é mais importado |
| `backend/src/server.js` | o ciclo de vida da OCI (`createLifecycle`, `beginDrain`, `closeStreams`, `waitForBackground`, `timeoutMs` e os `process.on`) e, desta branch, `disconnect: disconnectDatabase`, `exit` com `exitCodeFor` e `stopWhenEngineUnavailable(shutdown, { logger })`; o `shutdownWithStreams` fica dispensável com o `closeStreams` |
| `backend/src/shared/http/health.js` | o `createReadinessCheck` da OCI e, desta branch, o `engineHealthy` no `live` e no `ready` |
| `backend/test/integration/test-database-guard.test.js` | contagem composta de 62 (base 50, mais 11 desta branch e 1 da OCI, o `evidenceUpload`) |
| `docs/api/API_CONTRACTS.md` | as duas seções inteiras, a desta branch (S2-01 em diante) e a da OCI |

**Cadeia de migrations.**
- Esta branch tem 80; a OCI, 68; a união tem 81. A única exclusiva da OCI é
  `20261014090000_resumable_evidence_uploads`.
- O `INITIAL_MIGRATION_COUNT` da OCI (`deploy/scripts/lib/migration-contract.mjs`) passa de 68 para
  81 na composição.
- As 4 migrations desta rodada (SHA-256 do `migration.sql`):

| Migration | SHA-256 |
|---|---|
| `20261017100000_task_artifact_link_periods` | `82e2987eaa08759b150752f8d5e4d546fd7b5c2a6d05c2a0cf18736c0ba7167a` |
| `20261017110000_durable_github_events` | `5dcca0d1619d848d53734602dbfaba0a0d8f97d76c3eaed00a12c1773f4d5c48` |
| `20261017120000_issue_opened_event` | `40c1231806f15d06c5e696cc798e8955faec37b6191ad2203e09b9c902997b85` |
| `20261017130000_scheduled_job_leases` | `dafc39e31d6816040caffbef4148723e9fbac39ecc3123c6fe3934542a274c69` |

**Allowlist do diagnóstico.** O `SOURCES` de `deploy/lib/diagnostic_contract.py` tem, de
`backend/src`, o `prismaClient.js` e o `database-safety.js`. O fechamento pede mais 7. Proposta
(SHA-256 no `34c78dc`):

| Arquivo | SHA-256 |
|---|---|
| `backend/src/database/prismaClient.js` | `e29017daf85423ca8da50b1f4d9103b4cf4761d9002663b590dda3adca78b5f7` |
| `backend/src/database/database-safety.js` | `a8e9b3aac20be8b8f96a591caa0b697c309b57bf9dd4f37bd72d72ea65c3ed5f` |
| `backend/src/database/transaction-guard.js` | `520a1256ad4478d4711bae14ab280cc14e838925c629fccc497936c1e90b419b` |
| `backend/src/database/lock-wait.js` | `65828c34385226d1116c5bfd0b578cccddcc699292d047d2ba6bc0fed5176e47` |
| `backend/src/database/recovery-prisma.js` | `551b88d3be3c7c8c5160756d1e46fa5e65437cf17ed08648db38fcd2e82ad156` |
| `backend/src/database/engine-health.js` | `5298c69fa633105b310d0bd6a7d8f0c5e5cfc9bb7190cd7115798259ac53b71b` |
| `backend/src/shared/logger/index.js` | `5644f6c02b9f704e8a30f57c5663ef9122ef69ee2d24200c6ad78c17853a2995` |
| `backend/src/shared/logger/logger.js` | `46b0d3ee8aa88d7873614a0a4ac2b2e9a06b41b7b321778c598971f1438a2a62` |
| `backend/src/shared/logger/redaction.js` | `08ffd0e81a57e56ed2cc4444e8de4b96fff1063f14b85ecc92aaf9a0b16a0dfe` |

As dependências externas continuam `@prisma/client` e `dotenv`. O dono da branch regenera o
manifesto, faz os dois builds idênticos, confere a extração e roda o smoke ARM64 (ADR-024 D6). O
TF-REV-005 fecha com esse artefato.

**Seleção do artefato.** Simulação com as regras `ALLOW` e `FILES` do `scripts/package_release.py`
da OCI sobre o `34c78dc`, sem executar o script:
- entram os 9 arquivos de `backend/src/jobs`, inclusive os 4 comandos de `src/jobs/cli`;
- os 7 nomes do `package.json` (`notifications:*` e `traceability:alerts*`) apontam para
  `src/jobs/cli`, dentro do artefato;
- nenhum import relativo do backend sai do que é selecionado;
- os 3 arquivos fixos que faltam (`frontend/vite.config.js`, `frontend/production-contract.js` e
  `deploy/scripts/validate-service-environment.mjs`) só existem na branch OCI e chegam na
  composição.

**Variáveis novas para as unidades do systemd:** `DATABASE_POOL_LIMIT` (API 5, worker 3, comando
2) e `JOBS_ENABLED` (padrão `true`). As antigas `NOTIFICATIONS_DUE_LOOKBACK_DAYS` e
`GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS` continuam fora.

## 7. Verificação (Fase 16)

**Gates** no `77761aa`, todos com saída 0:

| Gate | Resultado |
|---|---|
| backend: `npm run lint`, `npm run format:check`, `npm run architecture:check` e `npm run security:secrets` | verdes; 703 arquivos no scan de segredos |
| backend: `npx prisma validate` | verde |
| backend: `npm run db:test:status` | "80 migrations found in prisma/migrations"; "Database schema is up to date!" |
| backend: `npm run db:lr5:audit -- --test` | `SCHEMA_CONSISTENT` |
| política da CI: `npx prettier --check .github/workflows`, `node --test scripts/validate-ci.test.mjs` (59) e `node --test scripts/check-ui-inventory.test.mjs` (3) | verdes; o inventário só passou depois do `77761aa` |
| frontend: `npm run lint`, `npm run format:check` e `npm run build` | verdes; o build repete os três avisos de antes (`MISSING_NAME_OPTION_FOR_IIFE_EXPORT`, `INEFFECTIVE_DYNAMIC_IMPORT` da página de preferências e o bloco acima de 500 kB) |

**Suítes** (em sequência, porque o banco de teste é compartilhado):

| Suíte | Resultado |
|---|---|
| backend, rodada 1 (`77761aa`, com o V-06 que entrou no `31d6ff2`) | 2.976 passaram, 5 pulados (fixos no código) e 2 falharam, as duas conhecidas do ambiente Windows: `storage.test.js` (symlink, `EPERM`) e `e11-mapping-writer.test.js` (permissões POSIX que o NTFS não guarda) |
| backend, rodada 2, com cobertura | o mesmo: 2.976 passaram, 5 pulados e as mesmas 2 falhas de ambiente |
| frontend, com cobertura | 1.696 passaram e 16 falharam: 15 em `TestCases` (12), `KanbanPage` (2) e `RequirementsPage` (1), timeouts de 5 s (S201-F06) e falhas em cascata depois deles, e o teste de imports dinâmicos, que falha no Windows pelo separador de caminho. Sozinhos e com a cobertura ligada, os três primeiros passam inteiros (103 de 103) |

**Mutantes.** Cada um aplicado sozinho, com os testes da área, e o arquivo restaurado em seguida
(`git status` limpo depois da rodada).

| Mutante | Mudança | Morto por |
|---|---|---|
| MR01 | decisão gravada fora da transação do lote | U-05 (sobreviveu na primeira rodada; ver abaixo) |
| MR02 | histórico só com `openAlertId` | H-01, H-03 e H-04 |
| MR03 | `Shift+Tab` só a partir do primeiro controle | P-01 |
| MR04 | evento atribuído pelos vínculos da detecção | F-06 |
| MR05 | chave de ocorrência pela data | F-05 e F-16 |
| MR06 | cobertura avança com leitura incompleta | F-04 |
| MR07 | `closed` do merge não absorvido | F-02 |
| MR08 | `ISSUE_OPENED` com a data do vínculo | A-01 |
| MR09 | corte ignorado | F-07 |
| MR10 | recuperação sem `connection_limit` | O-01 |
| MR11 | espera dos `KILL` sem limite | O-02 |
| MR12 | pânico sem saída | O-03 (API e worker) |
| MR13 | logger importando o `env.js` | C-01 e C-02 |
| MR14 | lease não conferida | J-01, J-02 e J-08 |
| MR15 | `stop()` sem esperar | J-03 (sobreviveu na primeira rodada; ver abaixo) |
| MR16 | `SLEEP` menor que o prazo | 6 provas da Fase 2, em `s202-f33` (integração e API) e `s203-correcoes` |
| MR17 | faixa "Sem vínculo técnico: X de Y" de volta | T-02 |
| MR18 | período não fechado ao excluir a tarefa | V-04 |

**Os dois sobreviventes da primeira rodada.**
- **MR01.** Os U-01 a U-03 injetam a falha na gravação da notificação, que vem antes da decisão.
  Gravar a decisão fora da transação não mudava nada neles. O U-05 faz a unidade falhar depois da
  primeira decisão: a atualização de uma decisão anterior espera a trava de outra conexão e estoura
  o prazo. Com o mutante, a decisão `SENT` fica sem notificação.
- **MR15.** O J-03 conferia a lease depois de uma pausa de 50 ms, quando o job já tinha terminado de
  qualquer jeito. Agora confere logo depois do `stop()`.

**Cobertura (17/10/2026).** No Windows, o relatório só sai com `--coverage.reportOnFailure`, por
causa das falhas de ambiente conhecidas:

| Projeto | Statements | Branches | Functions | Lines | Na primeira rodada (17/10, `d07747d`) | Limiares |
|---|---:|---:|---:|---:|---|---|
| backend | 93,49 | 88,46 | 96,01 | 95,55 | 93,57 / 88,44 / 96,24 / 95,66 | 85 / 70 / 85 / 87 |
| frontend | 86,54 | 81,28 | 82,46 | 88,84 | 86,37 / 81,13 / 82,09 / 88,68 | 50 / 45 / 40 / 53 |

O backend oscila menos de 0,3 ponto com os testes e o código novos desta rodada; o frontend sobe nas
quatro medidas.

**NT-J-08 (U-04).** O teste do NT-J-08 da bateria do S2-02 (até 1 s para 10 mil tarefas e
5 s para 50 mil) passou nas duas rodadas, com as unidades atômicas de 1.000 linhas, 4 por vez. O
teste afirma o orçamento e não registra o tempo medido.

**Migrations.**
- As 76 anteriores não mudaram: `git diff --name-only 08682e9 HEAD -- backend/prisma/migrations`
  lista só as 4 novas.
- O banco de teste está com as 80 aplicadas (`db:test:status`).
- **Cadeias do zero, com o aval do João (17/10/2026).** O roteiro confere que a conexão de origem é
  o `traceflow_test` e cria o banco temporário. Lá, aplica as migrations com `migrate deploy`,
  confere a `_prisma_migrations` contra as pastas, as tabelas novas e o enum dos eventos, e apaga o
  banco no fim. A composta junta as nossas pastas à migration exclusiva da OCI, lida com
  `git show origin/daniel-dev`:

  ```json
  {"mode":"zero","database":"traceflow_test_lr2_empty_validation","migrations":80,"expected":80,"missing":[],"last":"20261017130000_scheduled_job_leases","ociOnlyApplied":false,"tables":["githubeventcoverage","issuelifecycleevent","scheduledjoblease","taskartifactlinkperiod"],"artifactEventTypes":"enum('ISSUE_CLOSED','ISSUE_REOPENED','PULL_REQUEST_MERGED','PULL_REQUEST_CLOSED','ISSUE_OPENED')","seconds":11}
  {"mode":"composta","database":"traceflow_test_r2_composed_validation","migrations":81,"expected":81,"missing":[],"last":"20261017130000_scheduled_job_leases","ociOnlyApplied":true,"tables":["evidenceupload","githubeventcoverage","issuelifecycleevent","scheduledjoblease","taskartifactlinkperiod"],"artifactEventTypes":"enum('ISSUE_CLOSED','ISSUE_REOPENED','PULL_REQUEST_MERGED','PULL_REQUEST_CLOSED','ISSUE_OPENED')","seconds":11}
  ```

  Os nomes das tabelas saem em minúsculas porque o MySQL no Windows usa
  `lower_case_table_names=1`. Depois, só o `traceflow_test` restava entre os bancos
  `traceflow_test*`.

**Auditoria de trailers.** `git log --format=%(trailers) 08682e9..HEAD` não traz nenhum trailer, e
nenhuma mensagem tem coautoria. Autor e committer de todos os commits: JoaoVitorSHernandes.

## 8. Matriz visual (portão G3)

Pelo ⚑17, com a liberação do João: um banco local `traceflow_visual_r2` com dados fictícios nos
dois extremos (um projeto mínimo e um em escala, com 1.000 tarefas, 60 inconsistências e 200
notificações), e o backend apontando para ele nas portas do João, com os servidores dele parados. A
carga desse banco ainda não foi escrita. As capturas entram neste relatório, e o João revalida
(G3). A matriz é a da seção 7 do enunciado:

| Superfície | Mínimo | Escala |
|---|---|---|
| Modal da inconsistência (PR, issue e tarefa), pela notificação e pelo Repositório | 1 alerta | histórico com 20 |
| Resumo da Rastreabilidade | 0 inconsistências | 60 abertas, dados desatualizados |
| Tarefas: resumo (7 métricas) e "Buscar e filtrar" | 1 tarefa | 1.000 tarefas |
| Kanban: resumo e filtros | 1 tarefa | 1.000 tarefas |
| Painel à esquerda, preferências e vazio | 0 notificações | 200 notificações |
| Detalhes da tarefa: inconsistência e histórico | alerta aberto | só dispensados, depois de recarregar |

Larguras 1366×900 e 390×844, temas claro e escuro, e o teclado de cada linha (`Shift+Tab` no
título do painel, `Escape`, foco na seção da tarefa). O resumo de Tarefas voltou a TECHNICALLY
VERIFIED no inventário até essa aprovação.

## 9. Pendências

- **G3:** a carga do banco visual, as capturas e a aprovação do João (seção 8).
- **Branch OCI (PR26-F03):** `SOURCES` do diagnóstico, `INITIAL_MIGRATION_COUNT` 81, os 5
  conflitos, as variáveis novas nas unidades e a pausa coordenada do worker nos runbooks.
- **Homologação (PR26-F04):** `KILL QUERY` entre conexões do mesmo usuário no HeatWave, latência,
  corte de rede, saturação do pool, saída controlada com o `Restart=on-failure` e TLS.
- **Banco de dev do João:** as 4 migrations desta rodada ainda não foram aplicadas nele.
- **Push:** só com o pedido do João, depois da auditoria de trailers contra o `@{u}`.
