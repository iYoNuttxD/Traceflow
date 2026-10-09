# S2 P8.1 — Homologação do Dashboard com dados reais

> Legacy label: S2 P8.1. Canonical phase: **IND-P8.1**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).

**Resultado local: PASS LOCAL.** O bloqueio do P8 foi encerrado: sessão autenticada, API P7, dados persistidos, sincronização GitHub externa com atualização do painel e matriz visual real em desktop, tablet e mobile. Uma Sprint de homologação no banco de teste produziu I46 `AVAILABLE` por eventos do domínio; gráfico e tabela foram conferidos no frontend autenticado contra os pontos da API. Este resultado é local, sem equivalência automática a CI remota ou certificação WCAG.

## 1. Baseline

Branch `daniel-dev`, HEAD inicial `29a36d906897ff10d010165ede850cd956defb3e`, worktree limpo e `git diff --check` limpo. Runtime padrão local Node 26.9.0; gates executados com Node 22.23.3. Prisma Client 6.12.0. Não houve migration, alteração de schema, commit ou push.

## 2. Blocker herdado do P8

O registro original do [P8](S2_P8_DASHBOARD_OVERVIEW_RF55_REPORT.md) comprovou renderização com respostas sintéticas e deixou a integração real pendente. Nesta rodada, a evidência principal é o Project persistido no banco de desenvolvimento, aberto por sessão autenticada no frontend real, com Dashboard P7 e sync GitHub reais.

## 3. Ambiente de homologação

Frontend local em `localhost:5173`, backend local em `localhost:3001` e banco de desenvolvimento `localhost:3306/traceflow`. Para testes mutáveis, `NODE_ENV=test`, `localhost:3306/traceflow_test`, `read_only=0` e URL distinta do desenvolvimento foram confirmados antes da execução. As suítes mutáveis rodaram sequencialmente. Para inspecionar I46 `AVAILABLE`, frontend temporário em `localhost:5179` e backend temporário em `localhost:3002` apontaram exclusivamente ao banco de teste; ambos foram encerrados após a inspeção. Nenhum dado de produção foi usado. Processos do usuário não foram interrompidos.

## 4. Dados utilizados

Project de homologação local `2`, com Tasks, movimentos, Sprints, Requirements, commits, PRs, TestCases, TestExecutions, Defects e projeções de rastreabilidade persistidos. Sprint concluída `13` (legada) e Sprint em andamento `14` (cobertura parcial). No banco de teste, uma conta artificial, Project `70812`, Sprint `21828` e duas Tasks foram criados por cadastro/login e endpoints reais para gerar Burnup completo. A fixture foi removida após a validação; contagens finais de usuários, Projects e eventos de Burnup voltaram a zero. O hash de Sprint `13`, suas SprintTasks e eventos de Burnup congelados permaneceu `8276073345713e8b67303df9245b0201c36e033cc37f7d89bdc54c2428cb870a` antes e depois da sync externa.

## 5. Authentication

Uma sessão existente e válida abriu `/projects`, selecionou o Project autorizado e carregou `/projects/2`. Outra sessão foi criada e verificada no banco de teste; a lista real abriu o Project artificial e seu Dashboard. O teste P7 confirma `200` para VIEWER, MEMBER, MANAGER e OWNER, `401` sem sessão, `404` opaco para Project alheio e `404` para Project soft-deleted. Sprint ou responsável de outro Project também recebem `404`. Esses casos de autorização foram automatizados contra o banco de teste; não houve troca manual de papel na sessão do navegador.

## 6. GENERAL

Sete cards reais, sem catálogo inteiro: I01 `46,67%`, I23 WIP `2`, I28 `2` Tasks atrasadas, I61 `100%`, I66 `25%`, I53 quatro Defects (três ativos) e I45 `PARTIAL`. Os valores e estados foram comparados com a leitura do `dashboardService.read` no mesmo banco: I01 `46.67`, I23 `2`, I28 `2`, I61 `100`, I66 `25`, I53 `{ABERTO:1, EM_CORRECAO:1, AGUARDANDO_RETESTE:1, VALIDADO:1, total:4, active:3}`. A UI apenas formata os valores. A chamada HTTP é comprovada pelo carregamento da aplicação; a inspeção direta do JSON autenticado pelo navegador foi bloqueada pelo cliente do navegador.

## 7. GITHUB

As seções de atividade, Pull Requests e Issues exibiram os 15 cards P7 previstos. No período 10/08–25/09, I09 mostrou `298` commits persistidos; I10 mostrou zero `AVAILABLE`, enquanto I17 apresentou `NO_DATA`. Estados parciais e indisponíveis foram preservados conforme a fonte. Após a sync externa, a hora de freshness GitHub avançou sem exigir mudança artificial no total.

## 8. FLOW

I20–I25 foram renderizados com lead/cycle time, throughput, WIP, aging e fluxo cumulativo. I20/I21/I22/I25 permaneceram `PARTIAL` conforme a cobertura real, sem extrapolar o início da série. Sem overflow horizontal observado no desktop.

## 9. SPRINT

I36–I47, I71 e I72 foram renderizados. A seleção da Sprint `13` alterou o contexto; I45 v2 mostrou os dias 06–12/09 e lacunas `null` como `—`; I46 v2 ficou `UNAVAILABLE`, sem gráfico. A Sprint `14` apresentou I45 e I46 `PARTIAL` com um ponto em 25/09. I47 manteve a série de Sprint concluída.

## 10. TASK

I26–I35 foram renderizados com status, atrasos, atribuição, estimativas, esforço realizado e desvios persistidos. Cards de lista e distribuição preservaram o estado P7. Não houve overflow horizontal no desktop.

## 11. QUALITY

I06 e I48–I60 foram renderizados em 14 cards. I48 representa execuções históricas; I52 representa a saúde corrente de TestCases, em cards separados. Defects e concentração foram mostrados com as limitações de associação. Não se somaram linhas de concentração como total de Defects.

## 12. TRACEABILITY

I61–I67 foram renderizados, com valores observados `100`, `62,5`, `62,5`, `25`, `12,5`, `25` e `37,5%`. I68/Funnel não apareceu. A projeção e os percentuais vêm do backend.

## 13. Period filter

Com `startDate=2026-08-10`, `endDate=2026-09-25` e `timeZone=America/Sao_Paulo`, I09 mostrou `298`; para apenas 25/09, mostrou `7`. A seleção ficou na URL e o resultado visível mudou. Outros relógios temporais foram renderizados nas views correspondentes; comparação pontual antes/depois de todos os domínios não foi executada.

## 14. Sprint filter

Sprint real `13` foi selecionada na visão SPRINT. O contexto e I45/I46 mudaram conforme os fatos da Sprint; I47 mostrou filtro não aplicável conforme P7. O teste API cobre rejeição de Sprint de outro Project.

## 15. Responsible filter

Um membro real foi selecionado. GENERAL mostrou aviso explícito de recorte sem suporte seguro, marcas por card e WIP `2` inalterado. A UI não simulou um recorte histórico por responsável; o backend continuou autoridade. O caso de filtro suportado permanece coberto pelos testes P7, sem nova associação histórica nesta rodada.

## 16. Data states

No navegador com dados reais: `AVAILABLE` (inclusive zero), `NO_DATA`, `PARTIAL` e `UNAVAILABLE`. `STALE` foi comprovado na API P7 com commit persistido após falha controlada de sync: valor `1` mantido, timestamp da fonte preservado, estado `STALE`, status GitHub `FALHA`. O componente frontend tem regressão para estado stale; não houve falha forçada no GitHub externo do Project de desenvolvimento.

## 17. Burndown

I45 v2 real da Sprint `13`: pontos diários 06–12/09, com `remaining=null` nos dias sem fato e linha ideal numérica. Sprint `14`: 25/09, restante `18 h`, ideal `22 h`. A tabela e o gráfico exibiram a série da API sem reconstruir valores no navegador.

## 18. Burnup

Sprint `13`: `UNAVAILABLE`, limitação `BURNUP_HISTORY_NOT_CAPTURED` traduzida e nenhum gráfico falso. Sprint `14`: `PARTIAL`, escopo `22 h` e concluído `4 h` no ponto de 25/09. Uma Sprint de teste foi criada por endpoints reais; adição de Tasks, início, mudança de estimativa, conclusão, reabertura e reconclusão geraram seis `SprintBurnupEvent` pelo domínio. A resposta do agregado P7 `view=SPRINT&sprintId=...` devolveu I46 v2 `AVAILABLE`, cobertura completa e os mesmos pontos do endpoint Sprint. O frontend autenticado mostrou gráfico `AVAILABLE` e tabela: 25/09, escopo `7 h`, concluído `5 h`; 26/09–01/10, lacunas `—` para ambos. Isso corresponde à resposta real (`null` nos dias futuros), sem série injetada no frontend. A apresentação foi inspecionada em Dark e Light, inclusive 390 px.

## 19. GitHub synchronization

O botão `Sincronizar` da página autenticada executou uma sync real do repositório integrado. A run `17` terminou `SUCCEEDED`: quatro branches ativas, 328 commits encontrados, um novo e 21 PRs atualizados. O Dashboard atualizou automaticamente: montagem `18:53` → `18:54` e freshness GitHub `17:55` → `18:54`. A persistência confirmou `lastSyncAt=2026-09-25T21:54:35.497Z`, `SINCRONIZADO` e hash do histórico congelado inalterado. Em teste de integração, o endpoint real de sync, service, banco e agregado P7 foram usados com apenas o cliente GitHub externo controlado: I09 passou de `UNAVAILABLE/null` para `AVAILABLE/1`; falha posterior deixou `STALE/1`.

## 20. Async/race validation

Testes frontend existentes confirmam latest-wins para resposta atrasada de visão e filtro, isolamento por Project e retorno pelo histórico da URL. Outro teste confirma que sync concluída permanece sucesso quando um GET posterior de Project falha, e o Dashboard invalida/refaz a consulta. A troca manual rápida das views foi executada, sem erro de console observado.

## 21. Network/request count

O componente chama uma consulta agregada por mudança de visão/filtro; o teste de troca de três visões observa três chamadas de Dashboard e uma de catálogo. Leitura única do `dashboardService` no banco local de desenvolvimento, sem cache/benchmark: GENERAL `10,8 ms`/`5.506 bytes`/7 cards; SPRINT `4,4 ms`/`10.111 bytes`/14 cards; QUALITY `18,0 ms`/`10.383 bytes`/14 cards; TRACEABILITY `4,5 ms`/`4.661 bytes`/7 cards. Tamanhos são `JSON.stringify` do resultado do service, não payload HTTP comprimido. O navegador não expôs inspeção de rede/Resource Timing nesta sessão, portanto não há contagem HTTP medida em runtime nem benchmark de latência ponta a ponta. Lista de Sprints e contexto de Project são requests auxiliares previstas. O build manteve o chunk de gráfico separado e lazy (`IndicatorChart` cerca de 5 kB antes de gzip).

## 22. Accessibility

Com dados reais, foram observados headings, tabs, filtros com rótulos, ajuda por indicador, listas, legenda e tabela textual dos gráficos. Em 390 px Dark, ArrowRight na tab Qualidade moveu seleção e foco visível para Rastreabilidade; a ajuda de I61 abriu e manteve fórmula, fonte, horário e filtros legíveis dentro da viewport. A tabela I46 expôs cabeçalhos, linha `7 h / 5 h` e lacunas. Os testes de teclado, setas, foco, ajuda e URL do P8 passaram. Houve inspeção de contraste visual em Light/Dark, sem auditoria WCAG instrumental completa.

## 23. Responsive/Light/Dark

GENERAL, SPRINT, QUALITY e TRACEABILITY foram abertas com a API real em Light e Dark em 768 e 390 px. O Project artificial apresentou 7/14/14/7 cards nessas visões e I46 `AVAILABLE`; os cards tinham 358 px em 390 e 616 px em 768, sem overflow horizontal do documento. Com o Project de desenvolvimento, QUALITY (14 cards, dados de TestExecutions/Defects) e TRACEABILITY (7 valores não vazios) também foram inspecionadas em 390 px Dark; tab por teclado, ajuda e foco ficaram visíveis. SPRINT com I46 real foi medida ainda em 1440 e 1280 px em Light/Dark; as demais views já tinham revisão funcional em desktop. Uma primeira tentativa de resize atuou sobre outra aba e foi descartada, sem entrar como evidência. O override final foi resetado e o tema original do Project de desenvolvimento foi restaurado. A fixture visual P8 permanece evidência complementar, separada dos dados reais.

## 24. Bugs encontrados

- **P81-FE-01 · FRONTEND.** Cenário: I46 `UNAVAILABLE` em Sprint legada. Esperado: limitação legível em português. Obtido: `burnup history not captured` em inglês. Causa: código P5.1 ausente no mapa de apresentação. Owner: `features/indicators/dashboard-display.js`. Correção: mapear os códigos Burnup v2. Regressão: `DashboardPanel.test.jsx` exige texto traduzido e nenhum gráfico. Estado: **corrigido**.
- **P81-FE-02 · FRONTEND.** Cenário: I53 com distribuição de Defects. Esperado: rótulo legível para o agregado de ativos. Obtido: chave técnica `active`. Causa: campo ausente no mapa de labels. Owner: `features/indicators/dashboard-display.js`. Correção: `active` → `Ativos`. Regressão: `DashboardPanel.test.jsx` exige o novo rótulo. Estado: **corrigido**.
- **P81-FE-03 · FRONTEND.** Cenário: enum de estado futuro/desconhecido na resposta P7. Esperado: degradação neutra sem exibir valor como disponível. Obtido antes da correção: card considerava o valor exibível; estado nulo podia falhar em `toLowerCase()`. Causa: uso direto do enum sem verificar presença no dicionário. Owner: `IndicatorCard.jsx` e `DashboardPanel.jsx`. Correção: estado `UNKNOWN`, mensagem e CSS neutros, com valor/gráfico omitidos. Regressão: `DashboardPanel.test.jsx` injeta `FUTURE_STATE` e verifica ausência de `75%`. Estado: **corrigido**.

## 25. Classificação dos bugs

Os três são `FRONTEND`, owner `features/indicators`. P81-FE-01 e P81-FE-02 foram encontrados no dataset real. P81-FE-03 foi encontrado na revisão do boundary da resposta e reproduzido por teste de regressão. Não há mudança de contrato P7 ou cálculo de indicador.

## 26. Correções

O dicionário de limitações agora cobre os códigos Burnup v2 observados; a distribuição usa `Ativos`. Estado de card ou visão não reconhecido vira rótulo neutro, omite valor e gráfico, e não finge `AVAILABLE`. CSS neutro acompanha o fallback. Os três bugs estão corrigidos localmente.

## 27. Regression tests

`DashboardPanel.test.jsx`: Burnup legado traduzido, rótulo `Ativos` e estado desconhecido seguro; 12 testes no arquivo. `indicators-p5-1.test.js`: I46 `AVAILABLE` criado por fluxos de domínio e devolvido pelo agregado P7 com os mesmos pontos. `indicators-p7.test.js`: leitura de dashboard/catálogo para todos os quatro papéis. `projects-github-e9.test.js`: sync real interna, persistência, refresh do agregado e estado stale após falha de sync. Testes P8 existentes cobrem troca rápida de visão/filtro e sync confirmada com GET posterior falho.

## 28. Full gates

| Gate local, Node 22 | Resultado |
| --- | --- |
| Frontend full / coverage | 1.247 testes PASS; cobertura 83,87% statements, 78,02% branches, 79,32% functions, 86,35% lines |
| Frontend lint / format / build | PASS; gráfico permanece em chunk lazy |
| Backend unit | 827 testes PASS |
| Backend integration/API | 607 testes PASS, 5 skips existentes |
| Backend full coverage | 1.434 testes PASS, 5 skips existentes; 91,61% statements, 84,17% branches, 95,08% functions, 94,15% lines |
| Backend lint / format / architecture | PASS |
| Prisma validate / generate | PASS, Prisma Client 6.12.0 |
| CI policy local / secret scan | 8 testes PASS / 578 arquivos verificados |
| Dependências de produção | `npm audit --audit-level=high` PASS em ambos; frontend 0 avisos; backend 3 avisos moderados existentes em `qs`/`body-parser`/`express` |
| `git diff --check` | PASS |

CI remota não foi executada. Auditoria de dependências consultou o registry; nenhum pacote foi alterado.

## 29. External GitHub homologation status

**EXECUTED, LOCAL DEVELOPMENT.** A instalação GitHub já ligada ao Project `2` foi usada em uma sync externa real de leitura. Run `17` `SUCCEEDED`; o painel refletiu novo horário da fonte. Não houve escrita em repositório externo ou criação deliberada de evento remoto.

## 30. Remaining limitations

Sem bloqueio local restante para P8.1. `IMPORTANT · TEST_INFRA`: a contagem HTTP real e a latência de resposta não foram capturadas pelo DevTools; a contagem por mudança de visão está coberta por teste do cliente e não é benchmark de produção. A inspeção visual foi em Chrome local; não há validação cross-browser ou certificação WCAG. Limitações de domínio aprovadas continuam: I19 fora do catálogo implementável, I25 parcial quando falta histórico, I46 parcial/indisponível para Sprint legada e filtro por responsável sem recorte seguro em parte dos cards.

## 31. RF55 decision

RF55 possui evidência de sessão real, sete views, dados persistidos, filtros, estados, sync/refetch externos, Burnup `AVAILABLE` e matriz visual real em desktop/tablet/mobile. **P8.1 = PASS LOCAL; P8 = PASS LOCAL; RF55 = IMPLEMENTADO LOCALMENTE.** RF56 mantém o contrato backend P7 e ganha evidência de consumo visual real, sem fingir filtros `UNSAFE`. S2-04/S2-05 ainda exigem avaliação de todos os requisitos e cartões; P9 não foi iniciado.

Mensagem de commit sugerida, sem executar: `fix: complete real dashboard integration`.
