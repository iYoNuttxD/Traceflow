# S2 P10 — Final code review, QA e release readiness

Data: 04/10/2026. Ambiente local, Node 22. Este relatório registra a revisão
independente do estado final P9.1.1 e as correções realizadas nesta rodada.

## 1. Executive Summary

Foram registrados **11 findings: 0 BLOCKING, 1 HIGH, 8 MEDIUM e 2 LOW**.
**10 corrigidos; 1 MEDIUM de escalabilidade permanece delimitado** (§52).
Não resta HIGH/BLOCKING conhecido. As correções atingem consumo atômico de tokens,
autoridade assíncrona da sessão, workers GitHub expirados, timeout OAuth, histórico
concorrente de Task, dependências, landmarks e apresentação de estados GitHub.

| Evidência final | Resultado |
| --- | --- |
| Backend completo | 1.562 testes passaram; 5 skips legados revisados; 137 arquivos passaram / 2 skipped |
| Frontend completo | 1.366 testes, 112 arquivos, todos passaram |
| Dependências | Audit bruto e gate canônico: **0 vulnerabilidades**, incluindo desenvolvimento, nos dois pacotes |
| Prisma / banco | validate, generate, cadeia vazia, upgrades/recovery e upgrade P9 passaram |
| Local CI | Todos os gates executáveis locais passaram; policy e seus testes passaram |
| Visual | API real; desktop/tablet/mobile; Light/Dark/System; zoom nativo 100/125/150/200%; detalhes em §41 |
| Readiness | Pronto localmente para revisão humana e preparação da entrega, com limites operacionais explícitos |

**S2 P10 FINAL CODE REVIEW & RELEASE READINESS — PASS LOCAL**

**REMOTE CI — NOT EXECUTED.** Deploy/OCI não executado. PASS LOCAL não certifica
operação em produção, conformidade WCAG integral ou conclusão de todos os RFs.

## 2. Baseline

| Item | Valor registrado antes das alterações |
| --- | --- |
| Checkout | `/Users/daniel/Coding/Traceflow` |
| Branch | `daniel-dev` |
| HEAD | `279e17fbeadabb1cfbc3885bb49a4fe1cc746c60` |
| Working tree | Limpa; `git status --short`, diff/stat e diff/check sem alterações |
| Node dos gates | `22.23.3` |
| npm | `10.9.9` |
| Histórico | Últimos 20 commits inspecionados |

Nenhum commit/push/merge/rebase/reset/clean/stash foi realizado. O diff desta rodada
fica disponível para revisão humana. Não houve alteração de schema/migration.

Evidências locais: `/private/tmp/traceflow-p10-20261004/` (`baseline.json`,
`inventory.json`, logs, resultados JSON, auditorias de dados e `visual/`). São
artefatos locais de QA, não artefatos publicados pela CI.

## 3. Scope

Inventário inicial: 283 arquivos em `backend/src`, 347 em `frontend/src`, 57 models
Prisma, 63 diretórios de migrations e 45 scripts backend. O inventário de arquivos
de testes inclui também helpers/fixtures; não equivale ao número de suites.

A revisão cobriu todos os domínios solicitados por contratos, boundaries,
consumidores, testes e amostras reais. A inspeção manual concentrou-se nos caminhos
de autorização, transações, concorrência, histórico e apresentação. Isso não é uma
afirmação de leitura exaustiva de cada linha nem uma prova formal de ausência de bugs.
Não foram implementados novos indicadores, PDF, Health v2, notificações ou deploy.

## 4. Sources reviewed

- `CONTRIBUTING.md`, `docs/engineering/CODE_REVIEW_STANDARD.md`;
- Design System, UI Surface Inventory e Visual Validation Log;
- `SYSTEM_ARCHITECTURE.md`, `MODULE_CONVENTIONS.md`, `FRONTEND_STRUCTURE.md` e ADRs de
  autenticação, autorização, GitHub, modelo canônico, histórico, SSE e exclusão;
- API Contracts, RF Technical Matrix, roadmap, catálogo/fundação/prontidão de
  indicadores, Project Health Model v1 e Personalized Dashboard v1;
- ASVS, threat model, autorização, secrets, risk register e políticas de privacidade;
- relatórios P7/P8/P8.2/P8.3/P8.4/P8.5/P8.6A–F/P9/P9.1 e registro P9.1.1 no log visual;
- `.github/workflows/ci.yml`, scripts de validação/audit, manifests, lockfiles,
  Prisma, migrations e runbooks de manutenção/retenção.

As aprovações anteriores foram contexto, não evidência substituta desta rodada.

## 5. Architecture review

Inventário backend identificou 15 arquivos de routes, 19 controllers, 67 services
e 45 repositories. Gate e revisão manual confirmaram separação de transporte,
domínio e persistência nos caminhos examinados. Os locks/transações pertencem à
persistência; a construção dos eventos/histórico continua no domínio.

## 6. Backend boundaries

Routes aplicam sessão, autorização e validação; controllers delegam operações;
services coordenam invariantes; repositories concentram Prisma/SQL parametrizado.
Os calculadores de indicadores/Sprint permanecem puros. OAuth, GitHub App, email e
storage têm adapters. Não foi encontrado bypass crítico de boundary.
O novo callback de histórico de Task recebe o predecessor lido sob lock, sem
transferir a regra de construção do histórico para o repository.

## 7. Frontend boundaries

Routes/pages delegam a `features`; API clients reutilizam o HTTP client comum;
`shared` concentra primitives, hooks e formatação transversal. Health/fórmulas não
foram movidos para presenters. A nova tradução de estado GitHub é somente
apresentação: não infere merge nem altera dados do provider.

## 8. Authentication

Sessão persistida, cookie, CSRF, logout, bootstrap, expiração e callbacks foram
revisados. Reset de senha e verificação de email tinham consumo não atômico do
token. P10-01/02 agora serializam no usuário e fazem claim condicional, mutação e
invalidação na mesma transação. Token expirado/revogado entre preflight e commit
não autoriza a ação; falha ao revogar sessões desfaz a alteração.

P10-03 impede refresh antigo de restaurar identidade/CSRF após logout ou mudança
de contexto. P10-05 aplica o prazo configurado à troca OAuth nativa por `fetch`.
Login HTTP é coberto pela suíte real; no browser foi reutilizada a sessão do usuário.
Um novo consentimento/login no provider GitHub não foi forçado.

## 9. Authorization

Backend continua autoridade. Membership e role são contextuais ao Project;
OWNER não é administrador global. Matriz e rotas de planejamento, qualidade,
GitHub, exclusão e preferência foram confrontadas. VIEWER pode modificar a própria
preferência; não ganha permissão de edição de domínio por isso.

## 10. IDOR

Resolvers de escopo e suites de API verificam IDs filhos de Project alheio,
inclusive Requirement, Sprint, Task, TestCase, Execution, Defect e artefatos.
401/403/404 preservam a política de opacidade. `userId` da preferência vem da
sessão. Testes de preferência usam mais de um usuário/projeto; não foi suficiente
apenas inspecionar o índice único. Não há IDOR conhecido remanescente desta revisão.

## 11. Privacy

Fluxos de exclusão/anônimização de conta, memberships, autoria histórica,
identidades, preferências e evidências foram revisados com as suites de retenção.
Tokens/cookies não foram gravados nos artefatos de QA. Medição HTTP registra apenas
método, path, view, status, duração e tamanho; não registra headers/body.
SMTP e execução agendada em produção permanecem homologações operacionais separadas.

## 12. Project deletion / restore / purge

ADR-014: exclusão lógica imediata, carência de **30 × 24h**, reserva de repositório,
bloqueio de sync e restauração por OWNER. Purge usa claim, transação do grafo e
protocolo recuperável de staging/limpeza de evidências; não presume atomicidade
entre filesystem e MySQL. Concorrência e recuperação de falhas passaram nos testes.

Flow H real: Project **13**, `[P10 QA] Recuperação segura de projeto`, criado vazio
pelo service canônico após guards de desenvolvimento, foi excluído pela UI.
A URL passou a responder 404/estado inacessível; `Recuperar` restabeleceu o acesso.
O projeto permanece restaurado e claramente artificial. Nenhum purge foi feito no
banco de desenvolvimento; o Project 2 e sua integração foram preservados.

## 13. Database

Antes das escritas: `NODE_ENV=development`, host `localhost`, schema `traceflow`,
`read_only=0`, `TEST_DATABASE_URL` distinto (`traceflow_test`). Project 2 descreve-se
como artificial para homologação. A versão informada pelo servidor local é
`26.7.0`; a CI usa MySQL `8.4.8`, portanto não há equivalência operacional presumida.

Dataset final do Project 2: 13 Requirements, 42 Tasks, 75 movements, 7 registros de
Sprint (5 não excluídos), 45 SprintTasks, 81 eventos Burnup, 40 registros de esforço,
16 TestCases, 32 execuções, 9 Defects, 446 commits, 23 PRs e 0 Issues.

## 14. Prisma

`prisma validate` e `prisma generate` passaram com Node 22. Relações, índices,
uniqueness, cascades e campos JSON de histórico/preferência foram examinados nos
caminhos críticos. Não houve mudança de schema ou índice especulativo.

## 15. Migrations

As 63 migrations permaneceram inalteradas. Passaram cadeia vazia, status atual,
upgrades LR5/LR9/S2-P1/P3/P5.1, guard/recovery LR2, validação S1-09 e auditoria física.
Execuções que compartilham o schema de teste foram serializadas.

Além dos scripts canônicos, o upgrade P9 foi executado em schema temporário próprio:
cadeia anterior populada com User/Project/Task → migration de preferência → linhas
anteriores preservadas, UNIQUE(projectId,userId), FK e cascades de User/Project
confirmados. Evidência: `p9-upgrade.json`. Somente esse schema temporário de QA foi
descartado ao fim; nenhum reset/drop foi aplicado ao banco de desenvolvimento.

## 16. GitHub integration

OAuth autentica identidade; GitHub App/Installation autoriza acesso ao repositório.
Não há fallback de autoridade para email/nome/login textual. Commit, PR, Issue,
TaskCommit, TaskIssue e Task.pullRequestId são os modelos canônicos. Dedupe possui
constraints no banco. RF16 conserva a branch literal `main`; scan incompleto não
remove relações previamente confirmadas.

## 17. Sync / lifecycle

P10-04 reproduziu worker expirado retomando resposta externa e sobrescrevendo seu
estado final. Heartbeats/terminal transitions agora exigem o claim ativo, e os
checkpoints precedem escritas após chamadas externas. Falha tardia também não
sobrescreve a integração de uma execução substituta. Os testes de exclusão
concorrente continuaram verificando o guard transacional do Project.

Sync real acionada na UI: run **19 SUCCEEDED**, 8.171 ms; cinco branches, 364 commits
encontrados, 30 criados, 23 PRs encontradas (2 criadas/21 atualizadas), nenhuma Issue.
Nenhuma escrita foi feita no repositório externo. Lifecycle de PR preserva coverage
lower bound; Issues não passam a ter histórico completo por possuírem `closedAt`.
Não se declara fila externa durável nem fencing distribuído universal: o worker
continua no processo da API.

## 18. Planning

Requirements, Sprints, milestones, calendário, assignment, Task e esforço foram
examinados com os contratos canônicos. Transições preservam ordem de locks
Project → Sprint → Task e fatos históricos. O passado terminal não foi
reconstruído a partir da Task viva.

## 19. Requirements

CRUD, associação de Task, projeção de situação e histórico possuem autorização e
escopo. REQ-13 foi criado pela UI como fato artificial de QA e passou a mostrar
1/2 Tasks concluídas, validação presente e implementação ainda ausente: um PASS de
teste não inventou evidência técnica de implementação.

## 20. Sprints

Start/end, terminal/frozen, escopo e carry-over revisados. Amostras independentes
dos snapshots de Sprint 16 e 17 conferem com o agregado. Sprint concluída não teve
seu passado recalculado após o novo fluxo manual de qualidade.

## 21. Tasks / Kanban

Flow B real: Requirement → Task → associação à Sprint ativa; a Task de correção
gerada no Flow D percorreu A Fazer → Em Andamento → Concluído por controles de
teclado. Campos, modais, detalhes longos e retorno de foco foram examinados.
O catálogo completo de Tasks ainda não é paginado no servidor (P10-11).

## 22. Effort/history

`null`, zero, esforço legado e sessões não são somados duas vezes. Snapshots de
responsável/movimento permanecem fatos históricos. P10-07 corrigiu predecessor
obsoleto no histórico de edição: o service constrói o evento com o estado
efetivamente lido depois dos locks, na mesma transação da mutação.

## 23. TestCases

Versionamento, ativação, associações, execução atual e remoção foram revisados.
Execução PASS de uma versão anterior não valida versão nova. P10-09 acrescentou o
landmark `main` ausente à tela de Casos de teste, sem mudar sua composição visual.

## 24. TestExecutions

Flow D criou TC-16 v1, EXEC-31 FAIL e EXEC-32 PASS de reteste em ambiente local.
A FAIL original permanece; a nova execução não reescreve o fato anterior.
Version/reference snapshots, passos, upload privado, validação de MIME/tamanho e
leitura autorizada foram cobertos pelos testes reais de API/storage.

## 25. Defects

DEF-9, severidade média e identificação artificial, nasceu da FAIL; TASK-48 foi
gerada como CORRECTION e não confundida com ORIGIN TASK-47. Após conclusão da
correção e reteste PASS, a UI mostrou **VALIDADO**. Lifecycle/ciclos e concorrência
passaram na regressão. A tela de Defeitos também recebeu o landmark `main`.

## 26. Traceability

Projection S1-09 continua autoridade para situações e precedência. Implementação
e qualidade permanecem dimensões distintas. Flow E inspecionou REQ-4 no grafo real:
4 Tasks, 4 commits, PR #18, TC-4/TC-5, execuções e DEF-3/DEF-4; 16 entidades visíveis.
Também foi conferida a projeção do novo REQ-13 após reteste.
P10-10 removeu enums GitHub brutos da apresentação do grafo/inspector, Task e
repositório. Relações/títulos/hash dos artefatos não foram alterados.

## 27. Indicator engine

Route, validação, services, repositories, calculadores, catálogo, estado, período,
frescor e agregado foram revisados. `NO_DATA/UNAVAILABLE/null` não viram zero.
Intervalos civis IANA são half-open; testes de DST/boundaries passaram.
Fórmulas RF15/16/17/18/36/54 foram confrontadas com as decisões canônicas, inclusive
distinct Task/PR, coorte de fechamento/reabertura e identidade estável.

## 28. Flow

Oracle independente sobre Task/TaskMovement, setembro em America/Sao_Paulo:
Lead Time **6 dias**, Cycle Time **1 dia**, ambos iguais ao backend. Primeira
conclusão válida e mediana; reconclusão não duplica throughput conforme policy.
Séries diárias conservam lacunas sem amostra. WIP atual **4**. Throughput, Aging WIP
e Cumulative Flow foram renderizados; listas e gráficos têm proporções distintas,
sem esticar a lista até a altura do gráfico.

## 29. Sprint analytics

| Sprint congelada | Planejado | Escopo final | Entregue | Tasks planejadas / entregues |
| --- | ---: | ---: | ---: | ---: |
| 16 — A | 20 h | 24 h | 20 h | 5 / 5 |
| 17 — B | 24 h | 28 h | 28 h | 6 / 7 |

Oracle de persistência e agregado concordaram. Burndown e Burnup: oito buckets em
cada amostra. Velocity: quatro Sprints elegíveis. Shared historical projection,
reopen/recomplete, estimativa, adição/remoção e `remaining + completed = scope`
passaram nas suites. One-point/empty permanecem compactos, cobertos pela regressão.

## 30. Quality analytics

Pass Rate de setembro **36,67%**, conferido diretamente com execuções persistidas.
PASS/FAIL/BLOCKED do reteste são contagens quando distribuídos, e o denominator da
taxa inclui BLOCKED. Estado atual do TestCase é separado da distribuição histórica.
Severidades, estados e concentração foram renderizados com amostra não uniforme.

## 31. Traceability analytics

I61 **92,31%**, I62 **53,85%** e I66 **23,08%** conferidos por cálculo independente
das relações persistidas. I61–I67 permanecem disponíveis segundo seus contratos;
I68 permanece NOT_RECOMMENDED. Ausência de relação não foi substituída por vínculo
fictício para melhorar a demonstração.

## 32. Dashboard aggregate

GENERAL/PLANNING/GITHUB/FLOW/SPRINT/TASK/QUALITY/TRACEABILITY/CUSTOM reutilizam
services; não há HTTP interno ou cálculo de fórmula duplicado no frontend.
Falha parcial conhecida é isolada; erro inesperado não vira indisponibilidade
silenciosa. Leituras/projeções caras são reutilizadas dentro do request.
CUSTOM recebe os widgets solicitados; a avaliação global de saúde permanece
independente da seleção. Sem request por widget observado.

## 33. Health Model

Registro com decisão explícita para os 74 IDs; elegibilidade não equivale a sinal
pontuado. Thresholds 80/60, cobertura mínima 60% e mínimo de quatro dimensões avaliadas permanecem
inalterados. Falta de dado reduz cobertura, sem nota artificial zero. Drivers usam
contribuição ponderada. Métricas por pessoa não criam score/ranking humano.
HEALTHY/ATTENTION/CRITICAL/UNASSESSED e referências possuem regressão automatizada.

## 34. Project Health

Mesma consulta de setembro/Sprint 16 produziu **69,4 · ATTENTION · cobertura 81,47%**
nas nove views. A UI arredonda para 69/100 e 81%. Janela atual e anterior comparável
vieram do backend. Selecionar widgets não mudou essa nota.
Overview conserva coração/cabeçalho/nota/status/barra dentro do container original,
conforme decisão final P8.6C; não reintroduz CTA/cobertura/drivers antigos.

## 35. Indicators workspace

Summary e filtros reutilizam primitives canônicas. Metadata está no resumo.
De/Até/Sprint preservam contexto entre categorias e reload; draft parcial/invertido
não vai para a URL. Não existe Responsável inoperante. Tooltips e referências são
comerciais e acessíveis textualmente. Gráficos/tabelas foram inspecionados com API
real, inclusive teclado, seleção e disclosure de dados.

## 36. Personalized dashboard

Catálogo atual: **66 widgets elegíveis**, configuração de **1–12**, sem duplicatas.
GET/PUT/reset, versionamento, UNIQUE por User+Project, escopo, purge e conta foram
revalidados nas suites. Testes não dependem apenas da constraint.

Flow G: adicionar/remover/reordenar draft, cancelar, salvar e reload foram exercidos;
a ordem inicial do usuário foi restabelecida. Salvar dispara um PUT e um agregado,
não um PUT por movimento. Toast é transitório, `role=status`, sem deslocar widgets;
mesma geometria do painel antes/depois do toast. PUT confirmado com GET falho não
é apresentado como falha de persistência; draft é preservado quando PUT falha.

Reordenação por teclado/foco foi verificada pelo agente. O usuário confirmou nesta
rodada: **marcador e reordenação por arraste corretos, sem sobreposição**. Touch
físico não foi executado; os botões de mover preservam a alternativa sem drag.

## 37. Async/races

Foram examinadas gerações/contextos de Project, view, filtros, widgets, versão,
modal e mutations confirmadas. Abort é otimização, não autoridade. Regressões
controladas provaram/fixaram sessão antiga, token concorrente, worker expirado e
predecessor obsoleto de Task. Tests de planning/catalog/SSE/dashboard/qualidade
cobrem respostas fora de ordem e reconciliação pós-mutação.

Observação HTTP final: **635,09 segundos ocioso, zero novos requests** (133 antes
e depois). Alternância nativa Chrome → outra aba → TraceFlow, sem reload, também
não gerou requests; período/Sprint e painel foram preservados. Esse ensaio valida
retorno de aba/foco, não é uma alegação de novo gesto Cmd+Tab entre aplicativos.
Evidências: `idle-result.json`, `focus-result.json` e `http-observed.jsonl`.

## 38. Performance backend

Project 2 enriquecido; três amostras sequenciais do service por view, mesmas opções
temporais e `includeProjectHealth=true`. Prisma middleware contou **operações de
client, não SQL queries**. Medição local não é SLA nem benchmark de produção.

| View | Mediana service | Payload | Operações Prisma |
| --- | ---: | ---: | ---: |
| GENERAL | 9,40 ms | 27.824 B | 34 |
| FLOW | 7,04 ms | 31.597 B | 38 |
| SPRINT | 6,35 ms | 32.485 B | 34 |
| QUALITY | 9,30 ms | 33.920 B | 48 |
| TRACEABILITY | 5,39 ms | 25.357 B | 34 |
| CUSTOM (6 widgets) | 9,00 ms | 27.028 B | 46 |

HTTP real, incluindo auth/controller/serialização e consultas da UI (amostra
consolidada às 22:19 UTC):

| Endpoint/view | Amostras | Mediana | Faixa observada |
| --- | ---: | ---: | ---: |
| Dashboard GENERAL | 8 | 21,80 ms | 15,81–200,02 ms |
| Dashboard FLOW | 2 | 19,72 ms | 12,92–26,52 ms |
| Dashboard SPRINT | 2 | 17,83 ms | 15,95–19,71 ms |
| Dashboard QUALITY | 2 | 21,70 ms | 18,42–24,97 ms |
| Dashboard CUSTOM | 8 | 25,62 ms | 15,75–43,37 ms |
| Overview, GET Project | 4 | 5,72 ms | 5,21–301,29 ms |

A Overview também solicita o agregado para Health; o GET Project sozinho não é o
tempo da tela inteira. Amostras HTTP incluem navegação/carga fria e parâmetros
distintos; os maiores tempos não foram descartados. Sync real: 8.171 ms.

Queries analíticas são por grupo, não uma por Task/widget. Listas de Aging/PRs/
concentração/estimativa têm limites determinísticos; séries Flow até 366 dias,
Burndown até 180 e Velocity limitada. Reconstrução Flow ainda cresce com fatos
históricos lidos em lote. P10-11 limita a conclusão para projetos muito maiores.

## 39. Performance frontend

Observação de ação → DOM pronto: Geral 172 ms, Fluxo 159 ms, Sprint 165 ms,
Qualidade 169 ms; inclui overhead da automação. Nenhum freeze perceptível nas
amostras. Não equivale a FCP/INP instrumental ou medição em hardware móvel real.

Build final: entry **398,65 kB / gzip 115,35 kB**; chart lazy **8,11 / 3,11 kB**;
TraceabilityFlow **205,22 / 66,44 kB**. ELK preexistente é o maior artefato
(**1.433,73 / 441,98 kB**, mais worker 1.426,50 kB), carregado no fluxo de
rastreabilidade; não foi incorporado ao login/entry por esta rodada.
Sem nova biblioteca frontend de runtime. Escala e rede lenta continuam limites.

Na sessão final, após os reloads das correções e a inspeção nativa de zoom/foco,
o console capturado contém **zero warnings/errors** (`console-final.json`).
Não foram observados loops de render, promises rejeitadas ou exceções de chart.
Falhas da conexão de automação/setup anteriores não foram atribuídas à aplicação.

## 40. Accessibility

P10-09 foi provado por dois testes vermelhos de landmark e corrigido com `main`.
Foram examinados headings, labels, nomes de ícones, foco visível, retorno de foco,
dialog trap/Escape, filtros, botões de mover, charts/setas/tabela e status/toast.
Health, severidade e estados possuem texto, sem depender só de cor. Referência
visual tem valor/descrição acessível. Alvos das ações de reorder/ajuda mantêm 44 px.
Não foi feita certificação WCAG, sessão dedicada de leitor de tela ou touch físico.

## 41. Responsive / visual

Inspeção real pós-correções, Chrome autenticado, API e MySQL reais. Servidores de QA
isolados em 5174/3002 com Node 22, para não depender do watcher preexistente em Node
26 na porta 3001. Configuração temporária via ambiente; nenhum `.env` foi alterado.

| Largura | Amostra inspecionada | Tema / evidência |
| ---: | --- | --- |
| 1440 | Projects, Overview, Requirements, Sprints, Marcos, Cronograma, Tasks/Kanban, TestCases, Defects, Repository, Traceability; todas as categorias de Indicadores e Meu painel | Dark; Overview/Geral/toast também Light |
| 1280 | Fluxo, séries e tabelas | Light |
| 1024 | Fluxo e composição em uma coluna | Dark |
| 768 | Sprint, Burndown/Burnup/Velocity | Light e Dark |
| 430 | Tasks e detalhe de título longo | Light |
| 390 | TestCases/Defects após landmark; editor/toast; drawer e foco | Dark; amostra Light de navegação |
| 360 | Indicadores e Requirements | Dark / Light |

Sem overflow horizontal global nas amostras medidas. Tabelas e grafo podem ter
rolagem interna intencional. System foi alternado e acompanhou o tema do sistema.
Zoom **nativo** confirmado no Chrome: 100%/1710 CSS px/DPR2,
125%/1368/DPR2,5, 150%/1140/DPR3, 200%/855/DPR4. Editor, filtros e ações continuaram
acessíveis; a 200% footer entre y=324,95 e 369,95 numa viewport de 411 px.
Zoom voltou a 100%, tema a Dark, viewport override removido.

O controle nativo falhou durante drag; essa parte foi confirmada pelo usuário.
A conexão Chrome foi perdida durante a preparação de zoom, recuperada em nova
aba, e a verificação nativa foi concluída. Não se atribui a falha da ferramenta à SPA.

Capturas representativas em `visual/`: `custom-toast-1440-light.png`,
`testcases-390-dark.png`, `defects-390-dark.png`, `flow-1280-light.png`,
`sprint-768-dark.png`, `requirements-360-light.png`, `editor-native-200-light.png`,
`traceability-chain-final-dark.png`, `project-restored-1440-dark.png`.
Registro consolidado no [Visual Validation Log](../design/validation/VISUAL_VALIDATION_LOG.md).

## 42. Security

Helmet/CORS, body/upload limits, rate limiting, CSRF, cookies, Zod, erros públicos,
redaction e downloads privados revisados. Os testes cobrem traversal, autorização
de evidência, tokens, OAuth state, escopo e concorrência. Secret scan passou.
Nenhuma redução de proteção foi aplicada para obter PASS.

## 43. Dependencies

Baseline: 8 entradas moderate backend e 3 frontend. Correções limitadas às cadeias
afetadas: Vitest/coverage 4.1.11; Multer 2.4.0; Express 4.22.3/body-parser 1.20.8/
qs 6.16.0; ip-address 10.7.3. Cinco transitivas exclusivas antigas do Multer saíram.
Detalhes/advisories no [risk register](../security/DEPENDENCY_RISK_REGISTER.md).

O resolvedor npm 10 falhou ao atualizar a família Vitest (`edgesOut` nulo). A
resolução dessa família foi feita isoladamente com npm 11 e Node 22, preservando
as demais entradas; `npm ci` com npm 10.9.9 reproduziu os dois lockfiles finais.
Não houve override, downgrade, waiver, `audit fix --force` ou omissão de dev.
Audit final bruto e canônico: **zero em todas as severidades**. Nodemon não voltou.

## 44. Test quality review

Novos testes de concorrência usam barreiras/pontos controlados, não sleeps longos
para provocar races. Reset inclui rollback real, claim expirado e uso concorrente;
GitHub inclui sucesso e erro tardios; histórico testa o predecessor concorrente.
Testes de UI exercem estado, foco, resposta obsoleta e feedback, com mocks nas
fronteiras. O teste antigo que esperava `MERGED` bruto passou a esperar `Mesclado`.

Os cinco skips preexistentes pertencem a duas suites E6/E11 para schema anterior
ao LR2. Os validadores canônicos de legado/recovery substitutos passaram. Nenhum
novo skip, timeout relaxado, retry para esconder falha ou threshold reduzido.

## 45. Test performance

Backend full coverage: **84,11 s**. Frontend test **30,43 s**, coverage **39,07 s**.
Suites backend mais lentas: schedule-contracts ~6,91 s, bateria RF08/RF10/RF35
~4,05 s, S1-09 ~3,89 s. Frontend: TestCases ~23 s, Kanban ~22 s e personalizado
~15 s nas amostras; executam em paralelo, portanto tempos não devem ser somados.
Não foi reescrita a infraestrutura de testes sem necessidade. A policy da CI usa
uma única execução backend completa com cobertura, evitando repetir unit/API.

## 46. CI

Quality, Backend Tests, Frontend Tests, Supply Chain e Dependency Review possuem
policy validada. Gates locais equivalentes foram executados, incluindo testes do
próprio validador e formatação da configuração. Dependency Review remoto depende
do evento de PR. Não houve publicação para dispará-lo.
**REMOTE CI — NOT EXECUTED.** MySQL local diferente da imagem da CI está registrado.

## 47. Code quality

Nenhum TODO/FIXME/HACK/@ts-ignore foi encontrado no runtime no scan desta revisão.
Os dois `eslint-disable` examinados têm propósito concreto (dependências do hook
de membros e loop paginado de sugestões). Arquivos grandes de UI permanecem
refactor futuro; não houve divisão cosmética em massa. Catch/fallbacks críticos
foram examinados para distinguir resultado de domínio de falha operacional.

## 48. Dead code

Foram removidos `updateSessionCsrf` e `revokeUserSessions` do repository de auth
após verificar ausência de consumidores. O helper genérico de paginação GitHub
continua com consumidores; apenas o import sem uso no sync de branches saiu.
Models legados não foram reintroduzidos no runtime. Não se presume que exports de
API pública sem consumo nesta SPA sejam automaticamente código morto.

## 49. Documentation

Corrigidos README (DELETE 501, inventário e sync), ADR-003, matriz de autorização,
ASVS, catálogo/Health/API, risk register, matriz RF e referência no roadmap.
Relatórios anteriores permanecem históricos, com apontamento para a evidência
vigente. Design System não recebeu regra visual nova: foram corrigidos semântica
e texto, sem redesign. O Visual Validation Log recebeu evidência P10 própria.

## 50. RF alignment

**Retificação PR23-FIX-02 (2026-10-05), limitada a RF55/evidência:** o help comercial
revalidado no P10 não oferecia fórmula/fonte/horário individual sob demanda; esse critério
RF55 é corrigido e validado na FIX-02, sem herdar a aprovação genérica abaixo.
A P8.4 permanece contexto histórico com status canônico `TECHNICALLY VERIFIED`, pois seu
pacote binário não está versionado nem foi recuperado com origem comprovável. A evidência
P10 no log é própria daquela rodada, não substitui a evidência original P8.4. As demais
conclusões deste relatório não são modificadas por esta nota.

RF15/I01, RF16/I02, RF18/I04, RF54/I06, RF55/RF56 foram revalidados. RF17/I03 e
RF36/I05 têm backend testado e presenter standalone ainda pendente; não foram
promovidos a completos. RF54 conserva a distinção merge/review. I19, I69 e I70 não
foram implementados; I68 continua excluído. P10 não conclui S2-04/S2-05, PDF ou OCI
por inferência. Fluxos de planejamento/qualidade/rastreabilidade sustentam os RFs
correspondentes sem reescrever seu texto oficial.

## 51. TCC alignment

A aplicação mantém integração e rastreabilidade como base do acompanhamento de
progresso, implementação, qualidade e evolução. Health/personalização são leituras
derivadas, não substitutos da cadeia de evidências nem medida de desempenho pessoal.
A comparação foi feita com objetivo/pergunta e RFs transcritos no catálogo/roadmap;
o PDF/DOCX oficial não está presente no checkout e não foi relido diretamente
nesta rodada. Nenhum documento oficial foi alterado.

## 52. Findings

| ID | Severidade | Categoria | Arquivo/área | Problema e evidência | Correção/decisão | Regression Test | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P10-01 | HIGH | AUTH / SECURITY / ASYNC | auth.repository/service | Reset concorrente confirmava duas vezes; token invalidado após leitura ainda mudava senha. `auth-token-before.log` | Claim + senha + invalidação + revogação numa transação sob lock | `auth-token-concurrency.test.js`: concorrência, revogação, expiração e rollback | CORRIGIDO |
| P10-02 | MEDIUM | AUTH / SECURITY / ASYNC | auth.repository/service | Verificação de email reutilizava token sob race | Claim condicional e verificação atômicos | Mesma suite, replay/revogação/expiry | CORRIGIDO |
| P10-03 | MEDIUM | ASYNC / SECURITY | AuthContext / http-client | Refresh/erro antigo recuperava sessão ou invalidava contexto novo. `auth-context-before.log` | Geração e lifecycle guardam identidade/CSRF/eventos | AuthContext e http-client, promises controladas | CORRIGIDO |
| P10-04 | MEDIUM | GITHUB / ASYNC / DATA | sync-run repository/services | Worker expirado retomava e publicava artefatos/status. `sync-worker-before.log` | Guard de claim nos heartbeats/finais/checkpoints; erro tardio protegido | `projects-github-e9.test.js`, exclusão concorrente | CORRIGIDO |
| P10-05 | MEDIUM | GITHUB / SECURITY | github-credential.provider | Troca OAuth via fetch não tinha prazo | AbortSignal com timeout configurado | `github-boundary.test.js`, login e instalação sem resposta | CORRIGIDO |
| P10-06 | LOW | DOCUMENTATION | README, ADR, API, Health, RF, security | Docs vigentes ainda diziam DELETE 501, Health só GENERAL e superfícies antigas | Atualização factual, preservando cronologia | Diff e links revisados; fontes runtime/testes | CORRIGIDO |
| P10-07 | MEDIUM | HISTORY / ASYNC | task-crud.service / task.repository | Edição construía histórico com estado anterior ao lock. `task-history-before.log` | Predecessor relido na transação; callback do domínio | `planning-history.test.js`, dois estados concorrentes | CORRIGIDO |
| P10-08 | MEDIUM | DEPENDENCY / SECURITY | package.json / lockfiles | 8 moderates backend, 3 frontend | Atualizações delimitadas; npm ci + regressão | Audit bruto/canônico zero, full gates | CORRIGIDO |
| P10-09 | MEDIUM | ACCESSIBILITY | TestCasesScreen / DefectsScreen | Landmark main ausente no DOM real. `quality-landmarks-before.log` | Wrapper semântico main; layout preservado | `QualityLandmarks.test.jsx`, 2 cenários red/green + mobile real | CORRIGIDO |
| P10-10 | LOW | UX | GraphNode, TaskTraceability, RepositoryInfo | `closed/open/MERGED` brutos na experiência PT-BR | Formatter compartilhado, sem inferência de estado | `GithubArtifactStatus`, RepositoryInfo e TraceabilityWorkspace + render real | CORRIGIDO |
| P10-11 | MEDIUM | PERFORMANCE | task.repository.findTasksByProject / catálogo e Kanban | Consulta de Tasks sem paginação carrega todas as Tasks do Project; custo cresce com volume. Evidência estrutural: findMany/include sem take | Mantido: truncar resposta quebraria catálogo/Kanban; paginação exige contrato/UX próprios. 42 Tasks reais funcionam; não homologado para 10 mil | Suites atuais + medição local; ensaio de grande volume não executado | LIMITAÇÃO ACEITA PARA BASELINE LOCAL; FUTURE ENHANCEMENT |

P10-11: responsável pela próxima decisão, mantenedor do backend/frontend. Antes de
adoção em projetos de grande volume, medir dataset representativo e definir
paginação/consulta de quadro sem perda de cards. Risco residual: memória/payload e
latência proporcionais ao tamanho do projeto. Não há evidência de freeze no
dataset local nem exposição de dados; não se concede prontidão de escala em produção.

## 53. Corrections applied

Mudanças limitadas aos dez findings resolvidos. Nenhum endpoint/modelo/fórmula novo;
nenhuma migration alterada. A aplicação de domínio só mudou onde races provadas
produziam efeitos incorretos. As alterações de UI são landmarks e labels; não
redesenham dashboard nem editor. O diff dos lockfiles foi revisado por pacote.

## 54. Regression tests added

- Backend: consumo atômico de reset/verificação, rollback, expiração sob lock;
  retomada GitHub com sucesso/erro tardio; timeout OAuth; predecessor de Task.
- Frontend: refresh/logout/crosstab/unmount e respostas HTTP antigas;
  landmarks de qualidade; estados GitHub traduzidos.
- Regressões existentes: preferência, races, reteste, histórico congelado,
  acessibilidade do editor/charts, exclusão/purge e uploads continuaram passando.

Os logs `*-before.log` provam falhas antes das correções; `*-after.log` e os gates
finais registram os resultados posteriores. Não foi mantida expectativa de bug só
porque existia em um teste antigo.

## 55. Full gates

| Gate final em Node 22 | Resultado |
| --- | --- |
| Backend unit | 902 passed, incluídos no full coverage |
| Backend API | 431 passed, incluídos no full coverage |
| Backend integration | 229 passed / 5 skips legados, incluídos no full coverage |
| Backend coverage | Statements 92,38%; branches 85,87%; functions 95,75%; lines 94,78% |
| Backend lint / format:check | PASS / PASS |
| Frontend test / coverage | 1.366 passed em cada execução; 112 arquivos |
| Frontend coverage | Statements 85,77%; branches 80,20%; functions 81,57%; lines 88,24% |
| Frontend lint / format:check / build | PASS / PASS / PASS |
| Prisma validate / generate | PASS / PASS |
| Banco: migrate/status/empty/upgrades/recovery/schema audit | PASS |
| Upgrade P9 populado / constraints / cascades | PASS |
| Architecture / secret scan | PASS / PASS |
| CI policy / testes de CI e audit / formatação CI | PASS |
| Security gate backend/frontend | PASS, sem exceções |
| npm audit completo backend/frontend | 0 vulnerabilidades; exit 0 |
| npm ci backend/frontend | PASS com npm 10.9.9 |
| Dev workflow Node watch | Startup, restart por mudança em módulo e Ctrl+C PASS |
| npm start | `node src/server.js`, readiness com DB PASS; sem watcher |
| git diff --check | PASS |

Coverage backend é a execução integral exigida pela policy local: não foi
substituída por seleção de testes nem repetida artificialmente para inflar contagens.

## 56. Remaining limitations

1. P10-11: catálogo/quadros de Tasks e reconstrução histórica precisam de ensaio de
   grande volume antes de promessa de escala. Bundle ELK preexistente é pesado.
2. CI remota não executada; versão MySQL local difere da imagem canônica.
3. OAuth novo, SMTP externo, webhook em ambiente publicado e schedulers operacionais
   não foram homologados; sync real de leitura foi executada.
4. Touch físico, leitor de tela dedicado, outros browsers e auditoria WCAG formal
   não executados. Zoom nativo e teclado críticos foram efetivamente inspecionados.
5. Fatos físicos excluídos/legado sem captura continuam PARTIAL/UNAVAILABLE;
   nenhuma série ou baseline foi fabricada.
6. RFs ainda parciais e PDF/DOCX oficial indisponível nesta revisão não foram
   promovidos por associação com Health ou personalização.
7. Implantação exige HTTPS/proxy/CORS/cookies/callbacks, segredos, MySQL suportado,
   storage persistente privado com backup, jobs externos de purge/conta e monitoração.
   Não há evidência de operação multirrégion/múltiplas réplicas.

## 57. Release readiness

| Categoria | Estado | Limite prático |
| --- | --- | --- |
| FUNCTIONAL | READY | Fluxos locais críticos e regressão passaram |
| SECURITY | READY | Findings fechados; audit zero; homologação operacional continua separada |
| DATA | READY_WITH_LIMITATIONS | Fórmulas/amostras conferem; cobertura histórica declarada |
| DATABASE | READY_WITH_LIMITATIONS | Migrations/constraints passam; falta CI na versão MySQL canônica |
| ARCHITECTURE | READY | Boundaries/gate/review preservados |
| TESTS | READY | Full suites, cobertura e skips revisados |
| PERFORMANCE | READY_WITH_LIMITATIONS | Dataset local responsivo; P10-11 e ELK/escala documentados |
| UX | READY | Fluxos, toast, filtros, gráfico, editor e zoom reais inspecionados |
| ACCESSIBILITY | READY_WITH_LIMITATIONS | Correção de landmarks; teclado/semântica; sem certificação formal |
| DOCUMENTATION | READY_WITH_LIMITATIONS | Docs técnicos atualizados; RFs/TCC com limites explícitos |
| DEPLOYMENT READINESS | READY_WITH_LIMITATIONS | Preparação técnica; infraestrutura e operação ainda não implantadas |

## 58. Final verdict

**S2 P10 FINAL CODE REVIEW & RELEASE READINESS — PASS LOCAL**

Dez findings corrigidos e revalidados; nenhum HIGH/BLOCKING remanescente conhecido.
O MEDIUM P10-11 fica explicitamente restrito à prontidão de escala. Esta baseline
local está pronta para revisão humana do diff/relatório e decisão da próxima etapa.

**REMOTE CI — NOT EXECUTED. DEPLOYMENT — NOT EXECUTED.**
Não iniciar automaticamente PDF, relatórios ou OCI. Sem commit/push.
Sugestão: `fix: harden TraceFlow for release readiness`.
