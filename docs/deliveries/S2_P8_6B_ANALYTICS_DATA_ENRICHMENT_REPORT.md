# S2 P8.6B — Analytics Data Enrichment & Visualization Completeness

> Legacy label: S2 P8.6B. Canonical phase: **IND-P8.6B**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).

## 1. Baseline e escopo

- Pré-requisito confirmado: P8.6A registra **PASS LOCAL** no HEAD.
- Branch: `daniel-dev`; HEAD: `19596bd329142b99c6139e72c67ebbf973e7b9d7`.
- Working tree inicialmente limpo; `git diff --check` sem ocorrências.
- Shell inicialmente Node 26.9.0; execução e gates com **Node 22.23.3**.
- Nenhum commit, push, merge, rebase, reset, clean, stash, schema ou migration.
- O usuário confirmou o uso e as alterações no projeto 2 de desenvolvimento para preservar sua integração GitHub. Não foi criado outro projeto.

## 2. Segurança do banco

Antes da escrita: `NODE_ENV=development`, host `localhost`, porta `3306`, schema
`traceflow`, `@@read_only=0`; banco de testes distinto `traceflow_test`.
`VERSION()` local retornou `26.7.0`. URLs completas e credenciais não foram registradas.
Identidade e descrição do projeto, OWNER ativo, IDs das Sprints e referência GitHub
foram conferidos em dry-run. Primeiro ensaio do seed ocorreu no banco de testes.

O script bloqueia ambiente indefinido/produção, host remoto, schema divergente,
projeto sem identificação artificial, ator sem papel OWNER e plano incompatível.
Não executa reset, delete global, truncate, SQL manual de inserção nem migration.

## 3. Projeto alvo

- ID **2**, nome **TraceFlow**, status ATIVO.
- Descrição: “Projeto artificial para homologação manual de L1, L2 e L1.1.”
- Equipe: QA Homologação. Ator do roteiro: OWNER 1.
- Repositório e dados sincronizados existentes preservados. Nenhuma chamada de sync ou escrita externa.
- Prefixo `[P8.6B]` identifica requisitos, tarefas, Sprints e casos artificiais novos.

## 4. Dataset antes e depois

| Entidade                    | Antes | Depois |
| --------------------------- | ----: | -----: |
| Tasks                       |    15 |     40 |
| Requirements                |     8 |     12 |
| Sprints                     |     5 |      7 |
| TaskMovements               |    27 |     73 |
| TaskTimeEntries             |    17 |     40 |
| TestCases                   |     7 |     15 |
| TestExecutions              |     9 |     30 |
| Defects                     |     4 |      8 |
| Commits sincronizados       |   410 |    410 |
| Pull Requests sincronizadas |    21 |     21 |
| Issues sincronizadas        |     0 |      0 |

As sete Sprints incluem registros legados e planejados preexistentes; somente duas
Sprints adicionais foram necessárias. O roteiro criou 25 Tasks sem excluir as 15 antigas.
Reexecução real retornou `idempotentNoOp: true`, sem aumento de contagens.

## 5. Domínio, relógio e idempotência

Script: `backend/scripts/seed-indicators-homologation.js`; guardas e relógio em
`scripts/lib/indicators-homologation.js`. Utiliza services reais de Tasks, Sprints,
Requirements, TestCases, TestExecutions e Defects, com seus repositories,
transações, reconciliações, snapshots e eventos.

O relógio existe apenas no processo standalone do seed. Chamadas `new Date()` do
domínio e defaults de criação Prisma recebem a data simulada do evento; não há
backfill por UPDATE de timestamps antigos. Os novos fatos são **simulações de
homologação**, não eventos de uso real nem recuperação de passado desconhecido.
A ordem de execução do roteiro acomoda a regra de uma única Sprint ativa; as datas
por entidade refletem o cenário artificial declarado.

Journal local ignorado pelo Git: `backend/.local/indicators-homologation-2.json`.
Contém identidade do plano, baseline, IDs gerados e etapas concluídas. Lock exclusivo
impede execução simultânea no mesmo journal; persistência usa arquivo temporário e
rename. Etapas usam requestIds determinísticos e recuperação por AuditEvent; criação
de Requirement pode ser reconhecida pelo título exclusivo. Operação interrompida
ambígua bloqueia continuação automática. Não apagar o journal para “rodar de novo”.
Se houver lock após encerramento abrupto, verificar o PID e investigar a etapa pendente
antes de remover somente o lock comprovadamente órfão. Não executar planos concorrentes
com journals alternativos para o mesmo projeto.

### Execução documentada

Na pasta `backend`, com Node 22 e `.env` local configurado:

```bash
node scripts/seed-indicators-homologation.js \
  --project 2 --actor 1 --complete-sprint 14 --activate-sprint 15 \
  --database traceflow --project-name TraceFlow --anchor 2026-09-28
```

Sem `--apply`, apenas preflight/dry-run. Acrescentar `--apply` executa ou retoma o
mesmo roteiro. Após conclusão, os mesmos argumentos produzem no-op. Não mudar anchor
ou IDs em um journal existente. O script é deliberadamente específico para esta
baseline; não é um gerador genérico para qualquer projeto.

## 6. Sprints e preservação

| Sprint                           | Situação final                 | Uso                                        |
| -------------------------------- | ------------------------------ | ------------------------------------------ |
| 1 — Teste01                      | Concluída legada, preservada   | Histórico preexistente                     |
| 13 — Base funcional              | Concluída, preservada          | Velocity                                   |
| 14 — Qualidade e rastreabilidade | Concluída pelo domínio         | Snapshot e carry-over para 15              |
| 15 — Preparação para a banca     | Iniciada pelo domínio em 28/09 | Sprint ativa; 6 carry-overs de entrada     |
| 16 — `[P8.6B] Sprint A`          | Concluída; 16–23/08            | 8 pontos de Burndown/Burnup; 20h entregues |
| 17 — `[P8.6B] Sprint B`          | Concluída; 24–31/08            | 8 pontos de Burndown/Burnup; 28h entregues |

Sprint 2 — Teste02 permanece planejada. As datas de agosto foram escolhidas porque
não colidem com os intervalos existentes. A e B têm oito buckets observáveis cada.
Velocity tem **4 Sprints elegíveis**, com 20h, 28h, 5h e 32h entregues.

Snapshots congelados preexistentes `SprintTask` IDs `[1,16]` permaneceram com SHA-256
`d808541a6e6749df063b5743c2afdc7a683d4faa243f07338e95be87b5b3a304`.
Novos snapshots de conclusão foram produzidos normalmente pelo domínio.

## 7. Tasks

Estado final: 8 A Fazer, 4 Em andamento, 28 Concluídas. Cenários novos incluem prazo
vencido e futuro, ausência de responsável/estimativa, conclusão, reabertura e
reconclusão, entrada após início, saída da Sprint, carry-over e correções de defeitos.
Títulos longos intencionais exercitam tabelas e quebra de texto.

## 8. Movimentos e Flow

73 movimentos persistidos, distribuídos entre 17/08 e 26/09. Lead Time usa a primeira
conclusão; Cycle Time usa a primeira entrada em andamento até essa conclusão.
Throughput conserva sua regra de conclusão válida no corte. Aging usa a entrada atual.
CFD mantém a coorte parcial de Tasks sobreviventes com cadeia consistente.
Nenhum ponto derivado foi inserido diretamente.

## 9. Esforço

40 apontamentos. Novas amostras de 2h, 4h, 6h/7h frente a estimativas de 4h, além de
realizado ausente, estimativa ausente e mudança de estimativa. Estado agregado
observado: estimativa conhecida 163h, realizado conhecido 117,03h; desvio comparável
−0,97h. Os totais parciais e a base comparável são diferentes por contrato.
8 Tasks acima da estimativa e 11 concluídas abaixo; rankings mantêm o limite backend.

## 10. TestCases

8 novos, um desativado, um nunca executado e um com versão 2 e execução da versão
atual. As versões e os vínculos a Requirements/Tasks são criados pelos services.
O estado atual continua independente da distribuição histórica de execuções.

## 11. TestExecutions

30 no total: 11 PASS, 13 FAIL, 6 BLOCKED. Novas execuções distribuídas por cerca de
25 dias, com referência a commit real previamente sincronizado e resultado por etapa.
Há retestes BLOCKED, FAIL e PASS, incluindo segundo ciclo de correção.

## 12. Defects

8 no total, dois por estado: ABERTO, EM_CORRECAO, AGUARDANDO_RETESTE, VALIDADO.
Cada severidade canônica tem dois: BAIXA, MEDIA, ALTA, CRITICA.
Os quatro novos surgem de execuções FAIL e percorrem criação, associação de Task de
correção, conclusão e reteste conforme o cenário. Histórico de lifecycle é canônico.

## 13. Traceability

Requirements novos cobrem entrega com evidência, fluxo/correção, WIP sem evidência e
item sem implementação/Task. Estado observado: Tasks 91,67%; evidência técnica
58,33%; TestCases 75%; defeitos ativos 25%; implementação 25%; concluídos/validados
16,67%; progresso médio 40,83%. Não se forçou tudo a zero ou a 100%.

## 14. GitHub

Somente dados já sincronizados. O commit 258, anterior ao início do roteiro, serve
como referência persistida de homologação; não é apresentado como um novo commit
produzido pelo seed. Hashes de **todos** os registros ordenados de Commit, PullRequest
e Issue do projeto foram idênticos antes e depois, além das contagens.

- Commits: `df05127573e27166c483f3c9adb5a67f2ca79954332a0ce910da1addcdc56a9d`.
- PRs: `5c32859b71a10f7e66f64813dca63310e1e37791bfdc2b4013f5c5d4e88b3f6b`.
- Sem Issues coletadas. Limitações históricas de PRs/Issues permanecem explícitas.

## 15. Auditoria de séries e visualizações

| Candidato                 | Fatos disponíveis                            | Resultado desta rodada                                                                                |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Lead Time                 | criação e primeira conclusão verificável     | Nova mediana diária com amostra e lacunas                                                             |
| Cycle Time                | entrada em andamento e primeira conclusão    | Nova mediana diária com amostra e lacunas                                                             |
| Throughput                | movimentos elegíveis                         | Série existente validada com volume                                                                   |
| Cumulative Flow           | cadeias consistentes de sobreviventes        | Série existente validada; parcialidade preservada                                                     |
| Burndown / Burnup         | Sprint history, escopo, status e esforço     | A/B: 8 pontos cada, linhas reais de tendência                                                         |
| Velocity                  | snapshots de conclusão elegíveis             | Bar chart com 4 Sprints                                                                               |
| Execuções no tempo        | executedAt e resultado persistidos           | Reconstrução possível; esta rodada mantém distribuição/rates; extensão diária não implementada        |
| Defeitos criados no tempo | createdAt e lifecycle                        | Reconstrução possível para coorte observável; extensão diária não implementada                        |
| Merge Time trend          | createdAtGithub/mergedAtGithub sincronizados | Mediana/média existentes preservadas; amostra recente insuficiente para baseline útil; sem série nova |

Não se inferem históricos de estado atual de TestCase, vínculos antigos, Issues não
coletadas ou Tasks apagadas. As duas novas séries reutilizam a consulta bulk existente;
não adicionam query por Task. Nenhuma biblioteca nova.

## 16. Referências e Health

I20/I21 expõem `kind: SERIES` e `points` adicionais, preservando o valor agregado e a
fórmula. O frontend utiliza exclusivamente `assessment.reference` do servidor,
`PROJECT_BASELINE`, em DAYS. Linha tracejada entra no domínio vertical; a mesma
referência permanece textual. Dias sem amostra são `null`, nunca duração zero.

Janela encerrada 22–27/09, comparada à anterior:

- Lead Time **7,5 dias**, referência **10 dias**, delta **−25%**, Saudável.
- Cycle Time **5 dias**, referência **1 dia**, delta **+400%**, Crítico.
- Ambas têm 6 amostras atuais e 4 anteriores; valores calculados, não hardcoded.

Com Sprint ativa 15: cobertura de Health 85,75% (7 dias), 65,75% (14 dias), 76,75%
(30 dias); scores 64,22 / 71,82 / 69,69. Com Sprint histórica selecionada, a dimensão
Sprint deixa de se aplicar; na janela de 7 dias a cobertura observada foi 92,06%,
score 63,57. Na Visão Geral padrão: cerca de 70/100, cobertura 77%.
Há sinais Saudável/Atenção/Crítico/Não avaliado. O agregado fica em Atenção nestas
janelas; não se manipulou política ou dados para forçar todos os status do agregado.

Janela aberta pode tornar o assessment do widget parcial, mesmo quando o Health
consolidado usa sua janela efetiva com amostra elegível. Essa regra existente foi
preservada. A referência não é chamada de meta.

## 17. Performance e N+1

Medições locais: uma leitura de aquecimento e três amostras por visão, serviço
`dashboardService.read`, includeProjectHealth, período 22–28/09 e Sprint 14.
Tempo inclui leitura/cálculo do serviço Aggregate; não inclui transporte HTTP,
autenticação ou navegador. Payload medido por bytes de JSON serializado.
Middleware Prisma conta operações lógicas, não todos os comandos SQL internos de
uma transação. Não é benchmark de produção.

| View         | Mediana antes (ms) | Mediana final (ms) | Operações antes → depois | Payload final (bytes) |
| ------------ | -----------------: | -----------------: | -----------------------: | --------------------: |
| GENERAL      |               6.68 |               9.67 |                  34 → 34 |                 26612 |
| PLANNING     |               8.49 |               9.21 |                  38 → 38 |                 27984 |
| GITHUB       |               7.63 |               8.30 |                  47 → 47 |                 33713 |
| FLOW         |               6.96 |               7.46 |                  38 → 38 |                 26741 |
| SPRINT       |               6.45 |               6.65 |                  34 → 34 |                 32695 |
| TASK         |               5.75 |               7.31 |                  38 → 38 |                 32250 |
| QUALITY      |               8.93 |               9.73 |                  54 → 54 |                 33618 |
| TRACEABILITY |               6.92 |               5.77 |                  34 → 34 |                 25106 |

A medição final foi feita sem os testes concorrentes. Uma coleta durante os gates
registrou maior variabilidade (até 193,6ms), mantida em `final-performance.json`;
a tabela usa `final-idle-performance.json`. Amostra pequena, sem inferência estatística.

A passagem de 15 para 40 Tasks conservou o número de operações em todas as visões.
Leitura de código confirma queries bulk/aggregates, sem loop de consulta por Task
nas novas séries. O volume de linhas e o custo de cálculo continuam crescendo com
o dataset; contagem constante não prova custo constante.

No Chrome real, clique até card visível mediu 1.281ms (Tarefas), 1.108ms (Sprint),
1.720ms (Fluxo), incluindo ponte de automação, navegação e carregamento de dados.
São observações locais com ferramentas ativas, não tempo puro do React nem FPS.
Gráficos SVG, teclado e tabelas responderam na inspeção; não houve travamento observado.

## 18. Inspeção visual e problemas encontrados

Frontend local 5173, API real 3001, Chrome autenticado, sem mocks de indicadores.
O navegador foi operado pela interface disponível; a autorização anterior de CDP
não exigiu outro acesso nesta rodada.

- Oito categorias completas: Geral, Planejamento, GitHub, Fluxo, Sprint, Tarefas,
  Qualidade e Rastreabilidade em 1440px/dark; Visão Geral em 1440px/light.
- Amostras: Tarefas 1280/light e 390/dark; Qualidade 1024/light; Fluxo 768/light e
  360/light; Sprint 430/light. Não é uma matriz de todas as views em todas as larguras.
- Filtros preservados ao navegar; referência de duração e marker percentual visíveis.
- Velocity com quatro barras e nomes extensos legíveis; CFD com SVG de 352px;
  Burndown/Burnup em A com oito dias; tabelas acessíveis via região focalizável.
- Sem overflow horizontal do documento nas amostras; tabelas possuem rolagem interna.
- Fluxo também conferido em 30/08–28/09: 30 buckets, lacunas preservadas e tabela
  com 30 linhas de dados. PageDown deslocou a lista longa em 428px, mantendo o header
  visível; exploração do gráfico por setas atualizou data e valor observáveis.
- Rankings com títulos extensos alongavam demais a seção e deixavam áreas vizinhas
  vazias. Séries com lacuna no primeiro dia abriam o detalhe no valor ausente.

## 19. Correções e regressões

1. Tendências de Lead/Cycle reutilizam a primitive de gráfico, com referência do
   backend, tabela de amostras e gaps preservados.
2. Seleção inicial aponta à primeira amostra válida; teclado ainda permite explorar
   dias sem amostra. Não se preenche a lacuna com valor fictício.
3. Tabelas têm altura máxima de 28rem, rolagem interna, header fixo e contagem da
   parcela exibida quando o ranking backend é limitado. Sem altura mínima forçada.
4. Gate de cobertura revelou corrida de foco preexistente em `TaskMoveMenu`: a Promise
   podia encerrar antes do commit que habilita o botão. Restauração agora usa efeito
   de layout condicionado à conclusão e ao botão habilitado. Regressão determinística
   falhou contra o código do HEAD e passou com a correção; sem sleeps, retries ou
   aumento de timeout. Testes de Kanban completos exercitados.

## 20. Gates e evidências

| Gate                           | Resultado local                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| Backend unit                   | PASS — 849 testes                                                                          |
| Backend integration/API        | PASS — 610 testes; 5 skips legados                                                         |
| Backend coverage               | PASS — 1.459 testes; 91,81% statements / 84,43% branches / 95,28% functions / 94,27% lines |
| Backend lint / format          | PASS                                                                                       |
| Frontend test / coverage       | PASS — 1.279 testes; 84,04% statements / 78,36% branches / 79,66% functions / 86,45% lines |
| Frontend lint / format / build | PASS                                                                                       |
| Prisma validate / generate     | PASS                                                                                       |
| Architecture                   | PASS                                                                                       |
| Local CI policy                | PASS — validateRepositoryCi() = true e testes da política                                  |
| Dependency/security            | PASS — gate oficial npm nos dois pacotes, 0 high/critical; secrets check                   |
| git diff --check               | PASS                                                                                       |

Os cinco skips são os dois arquivos legados pré-LR.2 (`e6-backfill` e
`e11-legacy-responsibility`), mantidos como encontrados. Não foram criados novos
skips. A primeira cobertura final de frontend falhou no foco do Kanban; após
reprodução e correção, toda a suíte foi executada novamente com cobertura e passou.
A execução isolada de diagnóstico de Kanban não atinge thresholds globais por
abranger apenas um arquivo e não foi usada como gate de cobertura. A validação
final completa atingiu todos os thresholds. O teste de contrato do seed foi
reexecutado após acrescentar a asserção da referência, também com PASS.

Novas verificações: guardas do seed, integração com lifecycle completo, reexecução
sem duplicação, hash de movimentos/journal, séries de oito dias, Velocity, contrato
I21 + baseline calculado, bucket civil/mediana/lacunas/reconclusão, referência visual,
seleção inicial, ranking parcial e foco após reabilitação do controle.

Evidência transitória local: `/private/tmp/traceflow-p86b-evidence/`: preflight,
seed-apply/rerun, before/after/final-performance, validation, DTOs por visão/Sprint,
logs de gates, capturas por view/viewport e browser-timing. Capturas integrais podem
representar elementos fixed no offset da captura; a composição foi também conferida
em viewport normal. Evidências não equivalem a CI remoto, dispositivo físico ou
leitor de tela. Nenhum segredo foi incluído no relatório ou capturas selecionadas.

## 21. Limitações e resultado

- Históricos antigos não foram reparados: Sprint 14 continua com um ponto parcial;
  Sprint 15 iniciou hoje e tem um ponto com esforço desconhecido em parte do escopo.
  Use as Sprints A/B para homologar tendências completas.
- Datas artificiais são declaradas como simulação local. Não representam atividade
  real anterior do usuário. O script não serve para enriquecer produção.
- Source coverage de GitHub e Issues continua limitada; sem sync externo nesta rodada.
- Execuções/defeitos no tempo são candidatos viáveis, porém não receberam nova série
  nesta entrega; suas distribuições e indicadores existentes foram validados.
- O seed não automatiza reversão: preservar dados é prioritário. Guardar o journal.
- Medições locais e amostras responsivas têm os limites descritos acima.

**S2 P8.6B ANALYTICS DATA ENRICHMENT & VISUALIZATION COMPLETENESS — PASS LOCAL**

P8.6C não iniciada. Sugestão de commit, sem executá-lo:
`test: enrich indicators homologation dataset`.
