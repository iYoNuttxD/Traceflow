# TRACEFLOW S1-07 — FRONTEND FINAL UX FIX REPORT

Data: 2026-09-08. Implementação real refinada localmente. **TECHNICALLY VERIFIED**;
smoke desktop Light/Dark executado, matriz visual exata **ENVIRONMENT BLOCKED**.
Nenhum commit/push. Próximo passo: **S1-07 FINAL INTEGRATED QA + CODE REVIEW**.

## A. Git baseline

- Checkout: `/Users/daniel/Coding/Traceflow`.
- Branch: `daniel-dev`.
- HEAD: `b5e6b83c1c632aa566ec8cfc8d4e23acdab2edc2`.
- Working tree: limpo; `git status --short` sem saída.
- `git diff --check`: PASS antes das edições.
- Snapshot local: 886 arquivos com SHA-256, status, branch, HEAD e diff em
  `/tmp/traceflow-s107-final-ux-baseline`.

## B. Prototype cleanup audit

| Item | Resultado |
| --- | --- |
| Prototype runtime references relevantes a Casos de Teste | NONE |
| Runtime fixtures/fake TestCase/TestExecution/Requirement/Task/PR/Commit | NONE |
| Feature folders duplicadas | NONE; somente `features/testCases` |
| Prototype controls/reset scenario | NONE |
| Prototype banners | NONE |
| Prototype fallback | NONE |
| Prototype docs temporárias de Casos de Teste | `docs/design/prototypes/TEST_CASES_PROTOTYPE.md` removido |

Busca no repositório: variantes de prototype/protótipo, nomes da feature retirada,
prototypeState, prototypeFixtures, mockScenario, resetScenario e IDs exemplificados
no pedido. Evidência bruta local: `/tmp/traceflow-s107-final-ux-prototype-audit.log`.
Relatórios de entregas anteriores conservam seus registros históricos; documentos
gerais do Design System e experimentos C2 de outros domínios não são runtime de Casos
de Teste. A referência `[TASK-42]` em CommitSuggestionsCard é uma explicação do formato
de mensagem de commit, não uma entidade simulada nem fallback; foi preservada.
Fixtures de teste permanecem exclusivamente em diretórios de teste.

O teste estrutural em `frontend/test/testCases/final-ux.test.jsx` percorre ambos os
runtimes e impede o retorno de cenários fake, nomenclatura de protótipo e feature
paralela. O inventário identifica implementação real, sem promoção visual indevida.

## C. Main screen spacing

O catálogo agora tem o heading **Casos de teste do projeto** dentro de
`sprint-grid-section`, consumindo a mesma separação `--space-8` de Sprints; o heading
usa `--space-4` até o grid. A regra independe do estado aberto/fechado dos filtros.
Feedback continua condicional e não reserva uma área fixa quando vazio.

Filtros usam três colunas proporcionais quando há largura útil suficiente, duas na
faixa intermediária e uma abaixo de 34rem do container. Busca, Status, Responsável,
Requisito, Tarefa e Resultado não disputam seis colunas estreitas. A altura dos
controles usa `--size-touch-target`. O smoke desktop mostrou labels e controles alinhados
nos dois temas, com spacing equivalente à tela de Sprints.

## D. Card sizing

- Uma variável do domínio, `--tc-card-height: 30rem`, define a altura de todos os
  cards e do action card no desktop.
- Grid intrínseco `auto-fill` conserva a largura das células mesmo com poucos casos.
- Títulos limitados a duas linhas; metadata usa ellipsis e título auxiliar quando
  necessário. A definição integral permanece nos detalhes.
- Corpo flexível e footer com `margin-top: auto` alinham as ações na base.
- Abaixo de 34rem de largura útil: altura automática, título e metadata podem quebrar
  linhas, preservando informação em mobile.
- New TestCase e TC-1 PASS foram observados com bordas superior/inferior alinhadas.
  Nunca executado, FAIL, título longo e dez tarefas têm cobertura de render; a
  comparação visual simultânea dessas variantes ficou pendente pela ausência desses
  dados no catálogo inspecionado. Nenhum dado foi criado para fabricar evidência.

## E. TestCase Card

Reutiliza a linguagem auditada em Kanban: ID/badge no topo, título compacto, avatar
circular com inicial e nome do responsável, metadata com ícones e texto, separadores
e ações no footer. Última execução reúne resultado, data, ambiente e referência.
A iconografia vem de TraceFlowIcon; o ícone de calendário foi acrescentado à família
existente. O menu continua o SprintActionsMenu canônico, com ellipsis horizontal e
nome **Mais ações do caso TC-1**.

Comparação renderizada com Task Card realizada em Light; o card de Casos de Teste
mantém mais espaço para o contexto operacional da execução. Sem redesenhar Kanban.

## F. TestCase Details

SprintDialog ganhou slots opcionais de ações e retorno, seguindo a hierarquia do
KanbanDialog/Task Details: identidade e subtítulo à esquerda; ações próximas ao X.

- Subtítulo: **Detalhes do caso de teste**.
- Executar primary, Editar secondary e Excluir caso danger, todos no header.
- Em até 720px, Excluir caso migra para o overflow horizontal; ações e X se adaptam
  em uma linha própria. O menu preserva teclado e nome acessível canônicos.
- VIEWER não recebe ações mutáveis. MEMBER+ também depende das capabilities atuais.
- O header recebe o DTO da leitura corrente, identificado pela chave do diálogo;
  dados de outro caso/execução não fornecem identidade nem permissões.
- Requisito e cada Task são links individuais com ícone, hover, foco e alvo mínimo.

A auditoria encontrou TaskDetailsPanel acoplado ao fluxo de seleção/edição do Kanban
e Requirements sem um painel de leitura público ou deep-link de entidade existente.
Foi adotado o fallback permitido: fechar o diálogo e navegar para
`/projects/:projectId/requirements` ou `/projects/:projectId/tasks`. Não foi inventado
um parâmetro de seleção, nem aberto outro modal por cima. Navegações observadas no
Safari e testadas por teclado; a entidade não é aberta automaticamente no destino.

## G. Tested Reference bug

**Causa:** `minQueryLength={0}` tornava a consulta vazia elegível e `dismissed=false`
abria a lista já no mount. Não dependia de foco nem de intenção do usuário. A lista
absoluta dentro do body rolável também ficava sujeita aos limites de overflow.

**Correção:** somente o seletor de referência usa `openOnFocus={false}` e
`popoverPlacement="fixed"`. Clique, digitação ou ArrowDown abrem a lista; foco
programático não abre. Fechar/reabrir a execução começa novamente fechado. A política
padrão de consulta e posicionamento dos demais consumidores foi preservada.

A própria lista canônica é portalled para dentro do diálogo, fora do body rolável,
com posição calculada pelo anchor, limite de largura/altura do viewport e abertura
acima quando necessário. Usa `--z-popover` dentro da camada `--z-modal`; não cria uma
camada acima dos overlays globais. Scroll do body, resize, clique externo e perda de
foco fecham a lista; scroll interno da lista não fecha. Os listeners são removidos
no cleanup. A busca mantém debounce, AbortSignal e descarte de resposta antiga.

O teste de resize identificou um evento cujo target era Window; a checagem de Node
foi corrigida e a regressão passou. No smoke, uma referência selecionada longa
expunha outro overflow intrínseco: `min-width: 0` no item flex do SearchCombobox
corrigiu a truncagem sem invadir Ambiente. Revalidado em Light e Dark.

A contenção do mousedown aplica-se somente às opções do popover fixo; os consumidores
padrão e o scrollbar da lista mantêm o comportamento nativo.

Observado no Safari: fechado ao abrir/reabrir, lista aberta por clique, seleção por
clique e teclado, Tab seguindo para Ambiente após a seleção, sobreposição correta acima dos Steps e fechamento ao rolar por PageDown.

## H. History UX

Tabs finais: **Execuções** e **Alterações do caso**.

- Execuções: “Registros das execuções realizadas para este caso.”
- Alterações do caso: “Mudanças feitas na definição, responsável e status do caso.”

O histórico funcional continua usando os eventos reais CREATED, VERSION_CREATED,
RESPONSIBLE_CHANGED, STATUS_CHANGED e DELETED. A explicação técnica anterior foi
removida. As duas streams continuam separadas, com cursor, erros, loading e proteção
contra respostas antigas. Não há modal empilhado.

## I. Execution Details

- Breadcrumb de linha inteira removido.
- Retorno discreto por ícone antes do ID, `aria-label="Voltar para execuções"`.
- Header: ID real da execução; subtítulo com identidade do caso e título do snapshot.
- Information grid: resultado, executor, ambiente, horário e versão do caso.
- Referência testada aparece uma única vez em sua surface dedicada.
- Ação externa reutiliza **GithubExternalAction**, o mesmo componente de Task Details,
  exposto pelo barrel público de tasks. É um `<a>` com `_blank` e `noopener noreferrer`.
- URL ausente: nenhuma ação fictícia. PR e commit usam dados do snapshot histórico.
- Steps históricos conservam resultado no topo, ação em largura integral, esperado e
  observado lado a lado no desktop e empilhados no container estreito. Evidências
  continuam vinculadas pelo ID do passo histórico, e gerais pelo destino geral.

EXEC-0001 v1 foi consultada no browser. Os testes existentes preservam a execução v3
quando a definição atual é v4; esse cenário não foi reproduzido mediante escrita no
banco nesta rodada.

## J. Spacing audit

Revisadas: catálogo, filtros abertos/fechados, action card, TestCase Card, create/edit,
detalhes, contexto, progressão, Step, resultado observado, evidência por passo,
resumo/evidência geral, footer, ambas as tabs do histórico, detalhes históricos e
confirmação de exclusão. Tokens de spacing, surface, border, radius, typography,
shadow, foco e touch target existentes foram reutilizados. Sem nova paleta ou dependência.

## K. Focused tests

**230 PASS, 11 arquivos** na regressão final:

```bash
npx vitest run test/testCases test/components/SearchCombobox.test.jsx \
  test/features/SprintsScreen.test.jsx test/features/MilestonesScreen.test.jsx \
  test/pages/KanbanPage.test.jsx test/components/FrozenTaskDetails.test.jsx \
  test/components/SprintActionsMenu.test.jsx
```

Os três testes iniciais de UX falharam antes das correções e passaram depois.
Foram acrescentados 21 testes à suíte, incluindo contratos de render/interação,
links, histórico funcional, referência ausente/presente, permissões e proteção
estrutural. A checagem final adicional do arquivo de UX passou com 11 testes.

## L. Full frontend tests

`npm test`: **864 PASS, 74 arquivos**, sem skips. A suíte completa foi repetida com
coverage após a última alteração de implementação, também com **864 PASS**.
Runtime: Node 22 e `NODE_OPTIONS=--no-experimental-webstorage`.

## M. Coverage

| Métrica | Frontend global | Feature TestCases |
| --- | --- | --- |
| Statements | 81,95% | 88,70% |
| Branches | 76,15% | 84,92% |
| Functions | 78,02% | 86,59% |
| Lines | 84,17% | 90,95% |

**PASS**, sem baixar thresholds. A cobertura da feature foi agregada por arquivos
em `src/features/testCases` a partir do coverage-summary.json.

## N. Shared regression

| Consumidor | Resultado |
| --- | --- |
| SearchCombobox | PASS; padrão existente e opt-in de referência |
| Sprints / SprintForm / SprintTaskSelector | PASS; fluxos da tela de Sprints |
| Marcos | PASS |
| Kanban / Task Details / detalhes congelados | PASS |
| SprintActionsMenu / confirmação / foco | PASS |

As proteções A→B, busca mais recente e GET antigo após create/update/delete/execute
continuam cobertas e passaram. APIs, hooks de contexto/leitura/mutação, modelos,
payloads, cliente HTTP e limites de evidência permaneceram byte a byte preservados.

## O. Visual matrix

**EB = ENVIRONMENT BLOCKED.** Dimensões abaixo são CSS viewports solicitados, não o
tamanho da imagem retornada pelo controle nativo. Não há browser provider disponível;
Safari forneceu AX/screenshot, mas não controle verificável dessas dimensões. O
atalho de modo responsivo não disponibilizou os controles necessários. Não inferir
1440/1280/768/390 a partir da captura desktop.

| Surface | Light 1440 | Dark 1440 | Light 1280 | Dark 1280 | Light 768 | Dark 768 | Light 390 | Dark 390 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Main | EB | EB | EB | EB | EB | EB | EB | EB |
| Filters open/closed | EB | EB | EB | EB | EB | EB | EB | EB |
| Card / New TestCase | EB | EB | EB | EB | EB | EB | EB | EB |
| Create / Edit | EB | EB | EB | EB | EB | EB | EB | EB |
| Details | EB | EB | EB | EB | EB | EB | EB | EB |
| Execute / dropdown / Step | EB | EB | EB | EB | EB | EB | EB | EB |
| Execution Summary | EB | EB | EB | EB | EB | EB | EB | EB |
| History / ambas tabs | EB | EB | EB | EB | EB | EB | EB | EB |
| Execution Details | EB | EB | EB | EB | EB | EB | EB | EB |
| Delete confirm | EB | EB | EB | EB | EB | EB | EB | EB |

**Evidência desktop parcial efetivamente observada:** todas as superfícies acima em
Light/Dark, com TC-1, seu PR real importado e EXEC-0001; dropdown fechado/aberto,
referência longa selecionada, retorno de execução, navegação Requirement/Task e
confirmação cancelada. Recarregamento precedeu a conferência Dark final. Comparação
sequencial renderizada em Light com Task Card, Task Details e Sprint Filters; não
foi uma comparação simultânea em todos os viewports/temas.

O scroll nativo retornou `noWindowsAvailable` em tentativas; PageDown permitiu
verificar o fechamento do dropdown durante scroll real. A matriz exata, as medidas
DOM de overflow/44px e a comparação visual de vários tipos de card permanecem
pendentes. Nenhum **VISUALLY APPROVED / C2 COMPLETE** foi atribuído.

Nenhum create/update/delete/record foi confirmado no navegador. Rascunhos foram
fechados, confirmação de exclusão foi cancelada e tema Sistema foi restaurado.

## P. Console

| Sinal | Browser real | Automação local |
| --- | --- | --- |
| errors | ENVIRONMENT BLOCKED | 0 chamadas nas spies dos fluxos S1-07 |
| warnings | ENVIRONMENT BLOCKED | 0 chamadas nas spies dos fluxos S1-07 |
| duplicate keys | ENVIRONMENT BLOCKED | nenhum warning nesses fluxos |
| unhandled rejections | ENVIRONMENT BLOCKED | nenhuma reportada nas execuções finais |

O controle nativo não disponibilizou coletor de console; AX/screenshot não provam
console limpo. Não substituir esse gate por jsdom.

## Q. Gates

| Gate | Resultado |
| --- | --- |
| focused tests | PASS — 230 / 11 arquivos |
| lint | PASS |
| format | PASS |
| full tests | PASS — 864 / 74 arquivos |
| coverage | PASS |
| build | PASS |
| architecture | PASS |
| secrets | PASS — 451 arquivos |
| shared regression | PASS |
| git diff --check | PASS |

Comandos canônicos: scripts frontend `lint`, `format:check`, `test`, `test:coverage`,
`build`; scripts backend `architecture:check` e `security:secrets`. Logs locais em
`/tmp/traceflow-s107-final-ux-*.log`. Dependências não mudaram; nenhum audit novo por
alteração de dependency foi necessário. CI remoto não executado nesta rodada local.

## R. Backend impact

```text
Backend domain: UNCHANGED
Prisma: UNCHANGED
Migrations: UNCHANGED
Database: UNCHANGED por esta rodada (nenhuma mutação de domínio executada)
```

Comparação dos hashes do baseline confirmou zero alteração em backend, schema,
migrações, APIs, hooks, modelos e dependências. Não houve comando de migração,
seed, reset ou suite backend com escrita. Nenhum **BACKEND CONTRACT GAP** identificado.

## S. S1-08

**NOT IMPLEMENTED.** Defeitos não iniciados.

## T. S1-09

**NOT IMPLEMENTED.** Rastreabilidade global não alterada.

## U. Git final

Branch/HEAD preservados. Sem commit, push, merge, rebase, reset, force-push, clean ou
stash. Somente os ajustes solicitados e os defeitos reproduzidos na regressão e no
navegador foram tratados; nenhum refinamento preventivo iniciado.

Status e conferência final abaixo.

```text
$ git status --short
 M docs/design/UI_SURFACE_INVENTORY.md
 D docs/design/prototypes/TEST_CASES_PROTOTYPE.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M frontend/src/features/schedule/components/SprintDialog.jsx
 M frontend/src/features/schedule/pages/SprintsScreen.css
 M frontend/src/features/tasks/index.js
 M frontend/src/features/testCases/TestCasesScreen.jsx
 M frontend/src/features/testCases/components/Parts.jsx
 M frontend/src/features/testCases/components/TestCaseDetails.jsx
 M frontend/src/features/testCases/components/TestCaseDialogContent.jsx
 M frontend/src/features/testCases/components/TestCaseHistory.jsx
 M frontend/src/features/testCases/components/TestCaseList.jsx
 M frontend/src/features/testCases/components/TestExecutionWizard.jsx
 M frontend/src/features/testCases/styles/test-cases.css
 M frontend/src/shared/components/SearchCombobox.css
 M frontend/src/shared/components/SearchCombobox.jsx
 M frontend/src/shared/components/TraceFlowIcon.jsx
 M frontend/test/components/SearchCombobox.test.jsx
 M frontend/test/testCases/TestCases.test.jsx
?? docs/deliveries/S1_07_FRONTEND_FINAL_UX_FIX_REPORT.md
?? frontend/src/features/testCases/components/TestCaseHeaderActions.jsx
?? frontend/test/testCases/final-ux.test.jsx

$ git diff --check
(sem saída; exit 0)

$ git rev-parse HEAD
b5e6b83c1c632aa566ec8cfc8d4e23acdab2edc2
```

Comparação final: 886 arquivos do baseline verificados, 19 alterações autorizadas em arquivos existentes e 3 arquivos novos previstos. **Zero alterações backend e zero mudanças fora do escopo.**

```text
NO COMMIT
NO PUSH
NO MERGE
NO REBASE
NO RESET
```
