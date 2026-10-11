# PR24-FIX-01 — Code Review & CI Corrections

## 1. Baseline

Em 11/10/2026, checkout `/Users/daniel/Coding/Traceflow`, branch `daniel-dev`, HEAD
`6b739433da663b8d7f7eee93275b94d08d425989`. `git status --short` vazio e
`git diff --check` sem erros antes das alterações. Nenhuma alteração preexistente a transportar.
Shell: Node `v26.10.0`, npm `11.19.1`; toda execução desta entrega usou Node `v22.23.3`,
npm `10.9.9`, via `/opt/homebrew/opt/node@22/bin`. Frontend com
`NODE_OPTIONS=--no-experimental-webstorage`. Nenhum AGENTS.md aplicável encontrado.

Consultados README, CONTRIBUTING, SYSTEM_ARCHITECTURE, MODULE_CONVENTIONS, API_CONTRACTS,
AUTHORIZATION_MATRIX, GITHUB_AUTOMATIC_SYNC, GITHUB_INTEGRATION e os cinco relatórios
GITHUB-01/02/03/04/04.1. Relatórios históricos não substituíram a inspeção do HEAD.

## 2. PR #24 and reviewed HEAD

[PR #24](https://github.com/iYoNuttxD/Traceflow/pull/24) aberta, `daniel-dev` → `main`.
HEAD remoto igual ao local/revisado; base remota `6bc08c2b93468ee6a29e1faefbdcbc88391282bf`.
Comentários consultados pela API do GitHub; nenhum dos oito já estava resolvido neste HEAD.
Somente leitura remota: não houve comentário, resolução de thread, publicação ou rerun.

## 3. Copilot findings

G01: requisição de memberships e metadata a cada filtro do Repository; `role` sem consumidor.
G02: duas afirmações incorretas de GITHUB-03 pendente no contrato.
G03: tabela de status ainda descrevia somente `{run}`.
G04: RF21 ainda declarava ausência de scheduler. Links individuais na seção 21.

## 4. Codex findings

C01: `take:100` sem avanço após prefixo de instalação ocupada.
C02: corte overdue recalculado em cada reserva retirava elegibilidade de capacity waiters.
C03: 403 de secondary rate limit sem headers virava falha permanente de autorização.
C04: catch do probe ocioso encerrava o acompanhamento após erro transitório.

## 5. CI #138 failure

[Run 38114344651](https://github.com/iYoNuttxD/Traceflow/actions/runs/38114344651), evento
`pull_request`, HEAD `6b739433da663b8d7f7eee93275b94d08d425989`, concluído com `failure`.
Quality, Frontend Tests, Supply Chain e Dependency Review passaram; Backend Tests falhou em
`Validate destructive migration contract guards`, antes do gate de cobertura.

Erro reproduzido localmente antes da correção: `P3018`, migration
`20261011000000_github_automatic_sync`, MySQL `1072`, coluna `autoSyncEnabled` inexistente.
Log local: `/tmp/traceflow-pr24-lr2-before.log`.

## 6. Root-cause analysis

As consultas e transações confirmaram as quatro falhas funcionais, sem mudança em autorização.
O validador copiava todas as migrations exceto LR.2; assim, uma migration moderna dependente de
coluna criada pela própria LR.2 era executada sobre schema anterior à consolidação. A cadeia
definitiva estava correta; o cenário temporário era historicamente inválido.

## 7. Scheduler fairness correction

`github-sync-run.repository.js`: paginação por valores `(nextSyncAt, projectId)`, incluindo NULL,
sem offset nem dependência da permanência da linha usada como cursor. Cada consulta traz no
máximo 100 candidatos. `github-sync-scheduler.service.js`: até dez páginas por tick; ao atingir
o orçamento, continua do cursor no tick seguinte. Capacidade global cheia ou fim da lista
reinicia a busca no próximo tick. Não carrega todos os projetos na memória.

Teste com 150 candidatos de A atrás de um run que ocupa A e com B/C livres comprovou progresso
das duas instalações, inclusive com dois schedulers concorrentes. Variante com C em cooldown
comprovou progresso de B e adiamento de C. Slots globais, installation unique e activeProjectId
permanecem as autoridades transacionais. Teste adicional percorre mais de 1.000 candidatos
entre ticks sem reiniciar o prefixo; outro cobre empates, NULL e cursor reagendado.

## 8. Capacity waiting semantics

O corte de recuperação é fixado no primeiro tick configurado, em início menos dois ticks,
somente se não houver heartbeat recente de outro executor. Réplica que ingressa durante
operação não redistribui a espera de outro worker. O corte não avança com o relógio nos ticks
seguintes; capacidade ocupada conserva `nextSyncAt` vencido até poder reservar.

Teste mantém capacidade cheia por quatro ticks, inicia outra réplica, libera um slot e
comprova reserva imediata do projeto ainda devido. Testes existentes preservam distribuição
de startup, agenda futura, lease recovery, crash/fencing e exclusão mútua manual/automática.
Sem nova migration, enum, lock em memória ou enfraquecimento de constraints.

## 9. Secondary rate-limit classification

`github-error.js` reconhece mensagens estruturadas do provedor com `secondary rate limit`,
`rate limit exceeded` ou `abuse detection`, somente para 403; não usa a palavra genérica
`limit`. Headers vazios/negativos não provam rate limit. Retry-After inválido/ausente usa o
fallback existente de 60s, seguido pela mesma policy de backoff e cooldown persistido.
Essa distinção está alinhada à [documentação do GitHub](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#rate-limit-errors).

Unitários cobrem mensagem, sanitização, falso positivo e prazo inválido. Integração percorre
`executeGithubRequest` → pipeline → `executeGithubSyncRun` → `fail`, com 403 transitório
com/sem header, 403 permanente, 401, 404, 429, 500, 503 e timeout. Conexão, preferência,
último sucesso e commits persistidos sobrevivem aos erros transitórios. Erros permanentes
mantêm RECONNECT_REQUIRED e agenda nula, preservando a preferência cadastrada.

## 10. Frontend polling recovery

`ProjectDetailsScreen.jsx` reagenda falhas de rede, 408, 429 e 5xx em pelo menos 15s, respeitando
Retry-After. Deadline por projeto sobrevive a ocultar/reabrir a aba. 401/403/404 são terminais
para retry automático. Timer único, cancelamento, geração e identidade de rota impedem
concorrência e atualização por resposta obsoleta.

Testes: erros repetidos → automática RUNNING → SUCCEEDED, botão manual bloqueado, 429 com
Retry-After, aba oculta, unmount e resposta do retry de A chegando depois da navegação para B.
Layouts, componentes e frequência normal do progresso ativo foram preservados.

## 11. Repository request optimization

`RepositoryInfoScreen.jsx` remove import/call de members e `role` sem consumidor. A promise de
metadata pertence ao contexto montado do projeto e usa cancelamento independente. Filtros
renovam apenas artefatos; erro da metadata libera o cache para retry. A chave por projeto
descarta o contexto anterior. Cleanup também descarta a promise cancelada quando o StrictMode
da aplicação repete os effects, e rejeição antiga não limpa uma nova promise.

Testes: cinco alterações de filtro = seis chamadas de artifacts, uma de project e zero de
members; troca A → B aborta ambos os requests e ignora respostas antigas; retry de metadata
após 503 funciona. Um teste adicional reproduziu a reutilização incorreta da promise cancelada
em StrictMode antes do ajuste e passou depois. Estados existentes e autorização backend intactos.

## 12. API documentation corrections

As duas ocorrências de GITHUB-03 pendente foram corrigidas, distinguindo implementação local,
CI remota e deploy. Tabela de GET sync/status agora exige `{run,automation}`; descrição usa
somente os campos reais: run nullable com origin/status/progresso/summary/erro e automation
com status/reason/lastHeartbeatAt/checkedAt/nextSyncAt. Controller inalterado.
Testes HTTP reforçam o shape exato de automation tanto sem run quanto durante run MANUAL.

## 13. RF21 documentation correction

RF_TECHNICAL_MATRIX reconhece worker independente, periodicidade, jitter, agenda persistida,
limites, recovery/fencing, heartbeat/logs e testes. Operar o worker no ambiente de implantação
continua sendo uma responsabilidade separada. Texto acadêmico do RF21 não foi modificado.

## 14. LR.2 migration validator correction

`validate-lr2-legacy-migration.js` aplica 36 migrations pré-LR.2 e confere histórico/schema
antes de inserir fixtures. Depois adiciona somente LR.2: o cenário negativo precisa falhar
com 1062 no guard ProjectMember da migration esperada e preservar tabela/coluna/registro.
Não basta qualquer exit code não zero. Identificação do guard aceita a capitalização do MySQL.

Após consolidação válida, adiciona as migrations posteriores e aplica a cadeia completa de
66. Nomes são comparados na mesma ordenação lexical, sem depender da collation do servidor.
Verifica integração reconciliada, relações Project–Commit–Branch, remoção das estruturas
obsoletas e tabelas/campos modernos. Snapshot antes/depois da reaplicação prova estado inalterado.
Nenhuma migration aplicada ou schema Prisma foi editado.

## 15. Database safety

TEST_DATABASE_URL obrigatória e distinta de DATABASE_URL antes de qualquer fixture. Testes
reutilizam o helper canônico e cleanup com verificação da conexão real na mesma transação.
O validador reforça validação dos dois destinos derivados e `SELECT DATABASE()` no admin e
clientes temporários; preserva preflight de inexistência e ownership antes de cleanup.
Somente schemas de teste foram modificados. Nenhuma consulta ou escrita no banco de
desenvolvimento foi necessária nesta rodada.

## 16. Focused tests

Backend: **12 arquivos / 177 testes PASS**. Scheduler, repository, normalização/retry,
App boundary, client security, pipeline, cardinalidade, criação/vínculo, autorização e DB guard.
Frontend: **3 arquivos / 87 testes PASS** — ProjectDetailsPage, RepositoryInfoPage e
ProjectGitHubIntegration. LR.2 corrigido PASS com fixtures reais isoladas.
Logs: `/tmp/traceflow-pr24-backend-focused-final.log`,
`/tmp/traceflow-pr24-frontend-focused-final.log`, `/tmp/traceflow-pr24-lr2-after.log`.

## 17. Full backend

`npm ci`, lint, format:check, arquitetura e security PASS. `npm run test:coverage` executou
a suíte completa: **151 arquivos / 1.831 testes PASS**, com dois arquivos/cinco testes
históricos já pulados em E6/E11 pré-LR.2. Nenhum skip novo, timeout aumentado ou threshold reduzido.
Coverage: statements **92,50%**, branches **87,05%**, functions **95,34%**, lines **94,84%**.
Log `/tmp/traceflow-pr24-backend-coverage.log`.

## 18. Full frontend

`npm ci`, lint, format:check e build PASS. `npm run test:coverage`: **119 arquivos /
1.487 testes PASS**. Coverage: statements **86,13%**, branches **80,98%**, functions **81,97%**,
lines **88,62%**. Build mantém avisos de IIFE/ELK e chunks grandes, sem falha do gate.
Log `/tmp/traceflow-pr24-frontend-coverage.log`. Nenhum arquivo de dependência/lockfile alterado.
Após reproduzir e corrigir o cancelamento em StrictMode, os gates completos de frontend,
security e CI local foram repetidos e passaram com o código final.

## 19. Migration validation

LR.2 PASS: 36 prévias → guard negativo → LR.2 válido → 66 finais → reaplicação inalterada.
Prisma validate/generate, deploy/status isolados e todos os validators abaixo PASS:

| Validador | Evidência |
| --- | --- |
| db:test:validate-empty | Cadeia completa do zero |
| db:test:validate-lr2-legacy | Três fases históricas, guard 1062, relações preservadas e reapply |
| db:test:validate-lr5 / validate-lr9 | Upgrades legados da CI |
| db:test:validate-s2-p1 / s2-p3 / s2-p5-1 | Fundação/lifecycle/burnup históricos |
| db:test:validate-dashboard-preference | Upgrade de preferência |
| db:test:validate-task-responsibility | Upgrade de snapshot de responsabilidade |
| db:test:validate-github-sync | Upgrade da agenda automática com histórico |
| db:test:validate-github-sync -- --liveness | Upgrade de liveness e reaplicação |
| db:lr5:audit -- --test | SCHEMA_CONSISTENT |

Destino real do preflight: `localhost:3306/traceflow_test`; VERSION() `26.7.0`,
lower_case_table_names `2`, modo estrito. Não é mysql:8.4.8 da CI: não se declara CI-equivalent.
Nenhuma migration nova necessária. As migrations de sync automática e liveness continuam na cadeia.

## 20. Security and CI gates

| Gate | Resultado |
| --- | --- |
| Backend/frontend completos, coverage, lint, format | PASS |
| Frontend build | PASS |
| Prisma, migrations e architecture | PASS |
| Security/secrets | PASS |
| Local CI / audit policy / inventory tests | 86 testes PASS |
| validate-ci e formatação da policy/workflow/scripts | PASS |
| Dependency audit backend | 0 HIGH / 0 CRITICAL; zero exceções utilizadas |
| Dependency audit frontend | 0 HIGH / 0 CRITICAL; zero exceções utilizadas |
| git diff --check | PASS |

Gates executados em série; resultados e logs individuais em `/tmp/traceflow-pr24-gates.json`
e `/tmp/traceflow-pr24-*.log`. A primeira tentativa restrita de conexão ao MySQL não alcançou
o serviço; a execução autorizada fora do sandbox usou os mesmos destinos validados de teste.
Erros de preparação de fixtures/asserções foram corrigidos antes das execuções finais acima;
nenhum gate foi desabilitado ou resultado inicial falho tratado como PASS.

## 21. Complete findings closure matrix

| ID | Origem / comentário | Arquivos principais | Evidência específica | Estado |
| --- | --- | --- | --- | --- |
| C01 | [Codex: fairness](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4240379517) | github-sync-run.repository; github-sync-scheduler.service | 150 waiters A + B/C; cooldown; réplicas; cursor NULL/empates; orçamento de 1.000 | RESOLVED |
| C02 | [Codex: capacity wait](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4242255776) | github-sync-run.repository; github-sync-scheduler.service | Quatro ticks sem slot, nova réplica, liberação e reserva; restart com jitter | RESOLVED |
| C03 | [Codex: secondary 403](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4242255779) | github-error | Unitários + erro normalizado até fail persistido, histórico e conexão preservados | RESOLVED |
| C04 | [Codex: idle polling](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4240379520) | ProjectDetailsScreen | Erro/retry/automática; terminais; Retry-After; hidden; troca de rota; unmount | RESOLVED |
| G01 | [Copilot: requests redundantes](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4240376430) | RepositoryInfoScreen | Cinco filtros, members=0/project=1/artifacts=6; troca de projeto, retry e StrictMode | RESOLVED |
| G02 | [Copilot: GITHUB-03](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4240376441) | API_CONTRACTS | Duas ocorrências corrigidas; CI/deploy separados da implementação local | RESOLVED |
| G03 | [Copilot: automation](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4240376446) | API_CONTRACTS; testes projects-github-e9 / projects-without-github | Shape HTTP exato sem run e com MANUAL; controller preservado | RESOLVED |
| G04 | [Copilot: RF21](https://github.com/iYoNuttxD/Traceflow/pull/24#discussion_r4240376454) | RF_TECHNICAL_MATRIX | Worker/policy/observabilidade/testes rastreados; requisito oficial intacto | RESOLVED |
| CI01 | [Actions: LR.2](https://github.com/iYoNuttxD/Traceflow/actions/runs/38114344651) | validate-lr2-legacy-migration | Mesmo P3018/1072 reproduzido antes; três fases + guard + integridade + reapply PASS | RESOLVED |

RESOLVED significa correção e teste locais; não significa thread resolvida no GitHub nem CI remota verde.

## 22. Remaining limitations

Não houve novo teste visual em navegador, screenshot ou
homologação externa GitHub/OCI. Testes frontend são renderizados em JSDOM; testes de backend
usam Prisma/MySQL reais e fronteira GitHub controlada. Nenhuma alegação de produção homologada.
Heartbeat continua sendo observação com janela limitada, não garantia de disponibilidade
instantânea. Grandes conjuntos podem exigir múltiplos ticks, com cursor que avança.

## 23. Remote CI pending validation

A CI #138 permanece falha no HEAD publicado. Sem commit/push autorizado, as correções ficam
somente no working tree. Publicação futura precisa executar novamente todos os checks da PR
e receber nova revisão. PASS LOCAL não equivale a CI remota aprovada ou deploy concluído.

## 24. Final verdict

**PR24-FIX-01 CODE REVIEW & CI CORRECTIONS — PASS LOCAL**

Oito comentários e a falha de CI corrigidos localmente com evidência individual. Gates finais
passaram; estado remoto permanece o descrito na seção 23. Modelo de autorização, OWNER,
CSRF, repository reservation, OAuth, Health/indicadores e documentos oficiais preservados.
Sem commit/push/merge/rebase/reset/clean/stash, deploy ou alteração do banco de desenvolvimento.
Após esta entrega, parar; nenhuma funcionalidade adicional ou tarefa OCI iniciada.

Sugestão de commit futuro: `fix: address PR24 review findings and legacy migration validation`.
