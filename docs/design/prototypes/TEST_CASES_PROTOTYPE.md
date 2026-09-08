# TRACEFLOW — TEST CASES PROTOTYPE

STATUS: DESIGN BASELINE IMPLEMENTED  
REGISTRO HISTÓRICO — NÃO É O CONTRATO ATUAL

UX-TESTCASES-PROTOTYPE-01 — S1-07 / RF42. Documento de experimentação, não documento
oficial do TCC. Não promove RF42 a implementado e não altera o roadmap ou diagramas.

## Integração S1-07 — 2026-09-07

O runtime deste protótipo foi migrado para `frontend/src/features/testCases/` e
`TestCasesPage`. Fixtures, estado simulado, reset e banner foram removidos da aplicação.
O texto abaixo preserva o desenho e as hipóteses **do protótipo histórico**; seus
limites, modelos locais e declarações de não persistência não descrevem o runtime atual.
A autoridade vigente está em [API_CONTRACTS](../../api/API_CONTRACTS.md) e
[TEST_CASE_HISTORY](../../data/TEST_CASE_HISTORY.md). Resultado da integração e limites
de homologação: [relatório S1-07](../../deliveries/S1_07_FRONTEND_INTEGRATION_REPORT.md).
Não há aprovação visual completa nem encerramento automático de S1-07.

## Objetivo e acesso

Validar como criar, encontrar, entender, editar, executar e consultar casos de teste.
Acesso autenticado pela tab direta **Casos de teste** do projeto:
`/projects/:projectId/test-cases` (exemplo: `/projects/1/test-cases`).
A navegação preserva esse label completo, entre Cronograma e Repositório.
Não existe agrupador Qualidade, fluxo de Defect ou evolução para S1-08/S1-09.

Referências consultadas: S1-07 em `TRACEFLOW_ROADMAP_INCREMENTAL.md`,
`docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_SURFACE_INVENTORY.md`, tokens do
frontend e `docs/design/traceflow-tokens.css`. RF42 exige dados de cadastro,
responsável, status, acompanhamento e histórico; persistência, autorização,
validações backend e auditabilidade permanecem entregáveis futuros.

## Base original e preservação

Inspeção inicial: branch `daniel-dev`, HEAD
`b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`, working tree limpo e diff check sem erros.
Não havia arquivos do protótipo anterior `quality-prototype` neste checkout.
Não foi feito checkout nem operação de publicação; a branch foi preservada.

## Interface e composição C2

A página usa AppShell, catálogo de projetos e ProjectSectionNav existentes.
O catálogo já carregado pelo shell delimita quais projetos podem abrir o protótipo;
a feature não cria requests. A sessão e o catálogo continuam sob seus owners reais.
O estado mock pertence a uma instância por projectId e é recriado ao trocar de projeto,
sair da rota, recarregar ou reiniciar. Nenhum estado do cenário vai a localStorage.
As preferências existentes do AppShell/ThemeProvider continuam sob seus owners.

Composição baseada em Sprints: header, resumo, filtros recolhidos, grid com primeiro
card de criação, cards compactos, CTA Executar, Histórico e menu de ações.
Reutilizados pela API pública de schedule: SprintDialog, SprintActionsMenu e
CollapsibleFilterPanel. SearchCombobox pertence a shared desde o Addendum 1.
O Addendum 2 troca somente o glifo do SprintActionsMenu por `…`; sua lógica é preservada.
Styles de Sprints e tokens C2 mantêm identidade; complementos locais ficam em
`test-cases-prototype/styles/test-cases.css`.

Apenas um SprintDialog é montado. Criar, Editar, Detalhes, Executar, Histórico e
Execution Details substituem seu conteúdo; não há modal sobre modal. Informações,
rastreabilidade, pré-condições e passos seguem a hierarquia do Task Details,
sem modificar o componente real. O modal reutiliza focus trap, Escape e retorno ao
trigger; ações de card não propagam para detalhes. Enter/Space abrem detalhes.

A grade mostra todos os casos filtrados, precedidos por Novo caso de teste. A
paginação visual foi removida no Addendum 2. Resumo usa todo o cenário; filtros se
combinam e preservam valores ao recolher. Criar e salvar edição limpam filtros para
mostrar o registro atualizado. A implementação real de S1-07 continua exigindo
paginação no backend; esta simplificação não elimina esse requisito.

## Cenário inicial

| Caso | Status | Responsável simulado | Cobertura | Última execução |
| --- | --- | --- | --- | --- |
| TC-15 · Recuperar senha com e-mail válido | ATIVO | Daniel Ganz Musse | REQ-12; 3 tarefas | PASS |
| TC-16 · Bloquear link de recuperação expirado | ATIVO | João Vitor | REQ-12; 2 tarefas | FAIL |
| TC-17 · Impedir recuperação para usuário inexistente | ATIVO | Gabriel Trevisan | REQ-12; 1 tarefa | Nunca executado |
| TC-18 · Validar mensagem informativa da tela | INATIVO | Daniel Ganz Musse | Sem rastreabilidade | BLOCKED |

Resumo: total 4, ativos 3, sem rastreabilidade 1, nunca executados 1, com falha 1.
TC-15 apresenta EXEC-0038 PASS v3, EXEC-0032 FAIL v3 e EXEC-0021 PASS v2.
PRs/commits, evidências históricas e nomes são apenas dados de demonstração.
O comportamento do TC-17 usa resposta genérica sem revelar existência de conta.

## PROTOTYPE HYPOTHESIS

- TestCase pertence ao Project e pode existir sem Requirement/Task.
- Requirement verificado e múltiplas Tasks relacionadas são vínculos opcionais.
- Cadastro exige título, status, responsável, pré-condições, ao menos um passo com
  ação/esperado e resultado esperado geral. Descrição é opcional.
- ATIVO/INATIVO são valores provisórios, separados do resultado de execução.
  INATIVO continua consultável/editável, com execução desabilitada até reativação.
- TestCase != TestExecution. PASS/FAIL/BLOCKED pertencem exclusivamente à execução.
- TestCaseVersion é snapshot local. Editar definição cria outro snapshot em memória;
  alterar apenas responsável/status/vínculos não altera a definição. Isto não
  implementa versionamento real, API ou audit log. A UX informa sua provisoriedade.
- Execução referencia a versão executada; definição histórica não é reconstruída
  pelo cadastro atual. Resultado esperado, passos e pré-condições são preservados.
- Uma versão do software testada (PR/commit simulado) e ambiente são obrigatórios.
- Wizard mostra um passo por vez. Sem resultado não avança; FAIL/BLOCKED exigem texto.
  Voltar aos passos preserva escolhas/observações. Resumo deriva FAIL antes de BLOCKED;
  todos PASS resultam em PASS. Não há resultado geral selecionável manualmente.
- Evidências são opcionais e locais. Registrar fecha o modal e atualiza card/histórico
  sem reload e sem iniciar fluxo de defeito.
- Executor vem do nome da sessão (fallback explicitamente simulado); timestamp é
  `new Date()` ao registrar. Na implementação real `executedAt` deve vir do backend.
- Execuções e audit trail são conceitos distintos. O protótipo mostra histórico de
  execuções; auditoria de alterações do cadastro será definida na solução real.

Decisões canônicas preservadas: autenticação existente, navegação do projeto, AppShell,
ThemeProvider Light/Dark/System, tokens HYBRID C2 e arquitetura routes → pages → features.
Não foram introduzidos contratos reais de autorização ou relacionamento.

## Evidências locais

Por passo: PNG, JPG/JPEG, WEBP, MP4, WEBM e MOV. Evidências gerais: PNG, JPG/JPEG,
WEBP, PDF, TXT, LOG e JSON. Hipótese de limites: 10 MB por arquivo, 5 arquivos e
25 MB somando todos os passos e anexos gerais da execução; MB calculado como
1024² bytes. Os limites finais para vídeo continuam abertos. Lote inválido é rejeitado
por inteiro, com erro associado ao campo. Arquivos mostram nome, tipo, tamanho e
remoção acessível; nomes longos truncam. PNG/JPEG/WEBP podem mostrar preview por
object URL, revogada ao remover/sair do conteúdo ou fechar o modal. O File permanece
apenas no estado local, sem upload, storage, download remoto ou persistência.

As evidências históricas são metadados simulados, não arquivos reais disfarçados.
A futura solução precisará definir MIME/conteúdo, segurança de nomes, autorização
de acesso, quotas, storage, prevenção de conteúdo ativo e scanning quando aplicável.
A allowlist local deste protótipo não é uma política completa de upload seguro.

## Estados e roteiro de apresentação

Os controles recolhidos do protótipo permitem escolher Normal, Loading simulado,
Empty simulado ou Erro conceitual, sem timers/API artificiais. O empty filtrado é
obtido por filtros reais em memória. Reiniciar restaura fixtures e filtros.
SearchCombobox conserva seu comportamento existente de busca local; não há busca remota.

1. Abra Casos de teste, confira resumo, filtros e os quatro casos sem paginação.
2. Crie um caso sem vínculos, preenchendo os dados RF42. Confira o card e detalhes.
3. Edite e relacione REQ-12 e múltiplas Tasks; adicione/remova passos.
4. Execute sobre uma referência e ambiente: percorra passos, revise e registre PASS.
5. Abra Histórico → Ver execução; volte dentro do mesmo modal.
6. Repita com FAIL e BLOCKED, observações e anexos locais. Não há fluxo de Defect.
7. Consulte EXEC-0021 v2 do TC-15 antes/depois de editar a definição atual.
8. Reinicie a demonstração para restaurar os quatro casos originais.

## Validação original e limites da evidência — registro histórico

O registro abaixo descreve a rodada original. A homologação parcial mais recente e
os gates atuais estão no **FINAL C2 ALIGNMENT REPORT**, ao final deste documento.

Testes comportamentais montam AppRoutes/AppShell reais, simulando somente sessão e
resposta de catálogo. Cobrem TC-P01–TC-P28, edição versus histórico, prioridade de
resultado, wizard, teclado/foco, preview/cleanup, filtro de requisito e autenticação.
Não há sleeps, skips ou instalação de dependências de browser.

A homologação renderizada está ENVIRONMENT BLOCKED: o inventário retornou nenhum
browser conectado e o Computer Use recusou Safari com
`Computer Use was not approved to use Safari`. Não foi contornada essa permissão.
DOM/coverage/HTTP não são homologação visual. Console real, reflow e inspeção de temas
continuam pendentes; testes verificam zero console.error/console.warn.

| Theme | 1440 | 1280 | 768 | 390 |
| --- | --- | --- | --- | --- |
| Light | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Dark | BLOCKED | BLOCKED | BLOCKED | BLOCKED |

## Questões abertas para S1-07 real

Enums e transições finais; versionamento real; modelo de auditoria; soft delete/archive;
cardinalidades Requirement/TestCase/Task; storage; limites finais de upload;
autorização de QA; backend/API/schema; integração futura com S1-08 Defeitos.
A revisão visual por Daniel deve preceder a preparação da implementação persistida.

Backend, Prisma, migrations, banco, Kanban, Task Details e Requirement Details não
foram alterados. Nenhum Defect foi implementado. Sem commit, push, merge, rebase ou reset.

## Gates locais originais — 07/09/2026

Node 22.23.2. HEAD preservado. A suíte completa foi executada pelo comando canônico
`npm run test:coverage`, incluindo todos os testes frontend.

| Gate | Resultado |
| --- | --- |
| `npm run lint` — frontend | PASS |
| `npm run format:check` — frontend | PASS |
| `npx vitest run test/test-cases-prototype` | PASS — 38 testes |
| `npm run test:coverage` — frontend | PASS — 800 testes, 70 arquivos |
| Coverage | PASS — statements 81,83%; branches 75,81%; functions 78,25%; lines 83,94% |
| `npm run build` — frontend | PASS |
| `npm run architecture:check` — script existente em backend | PASS |
| `npm run security:secrets` — script existente em backend | PASS — 432 arquivos no escopo do scanner |
| `node --test scripts/check-npm-audit.test.mjs` | PASS — 5 testes |
| Audit frontend/backend pela política `scripts/check-npm-audit.mjs` | PASS — 0 high, 0 critical; nenhuma exceção utilizada |
| `git diff --check` | PASS |
| HTTP da rota local em `127.0.0.1:5173` | 200 — não comprova renderização autenticada |
| Console nos testes focados | Zero console.error, console.warn ou duplicate-key warnings |
| Console real e homologação visual | NOT RUN — ENVIRONMENT BLOCKED |
| CI remoto | NOT RUN — não houve publicação |

Não há PASS global enquanto faltar a matriz visual. Os scripts de arquitetura,
secret scan e audit não executaram testes de banco nem alterações no backend.

## TEST CASES PROTOTYPE — C2 REFINEMENT REPORT

### Addendum 1 — baseline e escopo

Refinamento sobre o protótipo já presente, sem reconstrução. Baseline: branch
`daniel-dev`, HEAD `b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`. Antes do addendum,
AppRoutes, ProjectSectionNav, schedule/index e ProjectDetailsPage.test já tinham
alterações; página, feature, testes e este documento já eram arquivos não rastreados.
A cópia local `/tmp/traceflow-testcases-addendum-baseline` registra hashes de 321
arquivos para comparar o refinamento com esse estado, não apenas com HEAD.

Mantidos: AppShell, rota, navegação direta, resumo, card de criação, banner,
paginação, quatro casos simulados, snapshots históricos e separação entre execução
e auditoria. Nenhuma promoção de RF42 a implementado/persistido.

### Componente compartilhado

SearchCombobox passou de schedule/components para shared/components, exportado por
shared/index. Seu CSS agora acompanha o componente; as classes existentes foram
preservadas. Os cinco consumidores de Sprints/Marcos e o teste original usam o novo
owner, sem reexport de compatibilidade em schedule. Comparação mecânica com a cópia
anterior confirmou lógica idêntica e as mesmas declarações para os 17 seletores
transferidos. Somente regras de posicionamento específicas do formulário permanecem
em schedule. Busca mínima de dois caracteres, teclado, loading/empty, cancelamento,
latest-query-wins, seleção/limpeza e ARIA continuam no único componente original.

Referências auditadas: SprintFilters, CollapsibleFilterPanel, SprintForm,
SprintTaskSelector, SprintDialog, SprintActionsMenu, KanbanFilters, KanbanDialog,
TaskDetailsPanel e ConfirmProvider; regras BR-UX de Planning e arquitetura frontend.
TaskDetails/Kanban serviram apenas de referência de apresentação, sem alteração.

### Fluxos refinados

- Filtros: surface `sprint-filters`, Pesquisar incremental com ícone, selects
  canônicos, Requisito e Tarefa relacionada por SearchCombobox; contagem total ou
  filtrada, quantidade de filtros ativos, limpar contextual e valores preservados
  ao recolher. O painel continua fechado inicialmente.
- Cards: Executar/Histórico preservados; menu Editar/Excluir caso, sem Ver detalhes
  redundante. Clique e teclado no card continuam abrindo Details.
- Exclusão: ConfirmProvider/useConfirm real, com ID/título e aviso de cenário
  simulado. Details fecha antes de abrir a confirmação; cancelar restaura Details
  e foco em Excluir ou devolve foco ao menu do card. Confirmar remove o caso do
  catálogo em memória, recalcula métricas/filtros/paginação e foca a lista.
- Formulário: tarefas selecionadas com contagem e estrutura visual do
  SprintTaskSelector. Cada passo tem número, ação, esperado e remover; duas áreas
  equivalentes no desktop e empilhamento no mobile. Inclusão/remoção preserva ordem,
  sem drag-and-drop.
- Details: Executar/Editar/Excluir, descrição primeiro, informações em células
  delimitadas, superfícies separadas para requisito/tarefas, pré-condições e
  resultado esperado; passos compactos; última execução com ID, data/hora,
  executor, ambiente, referência, versão e acesso ao histórico.
- Execução: contexto em surface; uma referência PR ou commit por SearchCombobox.
  TASK-40/TASK-41 sugerem PR #91 e TASK-40 também commit 91acd22 antes dos demais
  artefatos. Resultados identificam origem; casos sem vínculos mantêm o catálogo
  do projeto. Não há consulta GitHub nem associação persistida.
- Wizard: progresso numerado com ícone/estado, passos em surface e validações de
  resultado/observação preservadas. Resumo com métricas Passos/Aprovados/Falhas/
  Bloqueados e rótulo Resultado dos passos. Registrar execução fica desabilitado
  até referência, ambiente e todos os resultados/observações estarem válidos;
  contexto incompleto é explícito e pode ser preenchido no próprio resumo.
- Evidências: botão Selecionar arquivos aciona input nativo oculto; formatos e
  limites provisórios, remoção, preview local e liberação de object URLs mantidos.
- Histórico: preservado. Execution Details apresenta informações estruturadas,
  referência e commit complementar de PR, pré-condições históricas, passos com
  resultado observado, esperado e evidências. Vazios: Não informado e Nenhuma
  evidência anexada. Edições atuais não reescrevem versões executadas.

### Verificação local do addendum

Node 22.23.2. Logs em `/tmp/tc-addendum-*.log`. A execução completa com coverage é
também o gate de todos os testes frontend, incluindo regressões de Sprints/Marcos.

| Gate | Resultado |
| --- | --- |
| Focado: protótipo + SearchCombobox | PASS — 52 testes (45 do protótipo + 7 do SearchCombobox) |
| Suíte completa com coverage | PASS — 807 testes, 70 arquivos; 45 do protótipo e 7 do SearchCombobox |
| Coverage statements / branches / functions / lines | 81,90% / 76,02% / 78,47% / 84,00% |
| Lint / format:check / build frontend | PASS |
| Architecture check | PASS |
| Secret scan canônico | PASS — 432 arquivos no escopo do script |
| Testes da política de audit | PASS — 5 testes |
| Audit frontend e backend | PASS — 0 high, 0 critical, sem exceções utilizadas |
| Diff whitespace | PASS |
| Console dos testes do protótipo | Zero console.error/console.warn, incluindo duplicate-key warnings |
| CI remoto | NOT RUN — sem publicação |

A suíte cobre filtros inteligentes, valores recolhidos, inclusão/remoção e ordem
nos passos, contagem de tarefas selecionadas, exclusão cancelada/confirmada por card
e Details, diálogo único, foco, atualização de paginação, prioridade/fallback dos
artefatos e cinco PASS sem contexto mantendo Registrar desabilitado. Coberturas
anteriores de validação, snapshots, evidências, autenticação e wizard permanecem.

### Homologação visual

ENVIRONMENT BLOCKED. Nesta tentativa, o inventário do Computer Use falhou com
`Sky Computer Use native pipe startup failed`. Não houve acesso ao navegador para
inspecionar pixels, reflow, scroll, foco visível, contraste ou console real.
A falha atual se soma ao bloqueio de permissão registrado no baseline; não foi
contornada. CSS responsivo e tokens não constituem aprovação renderizada.

Cada célula cobre Light **e** Dark:

| Fluxo | 1440 | 1280 | 768 | 390 |
| --- | --- | --- | --- | --- |
| Principal e filtros | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Criar/editar | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| TestCase Details | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Executar | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Resumo | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Histórico | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Execution Details | BLOCKED | BLOCKED | BLOCKED | BLOCKED |
| Confirmar exclusão | BLOCKED | BLOCKED | BLOCKED | BLOCKED |

### Limites e entrega

Exclusão apenas retira o caso do catálogo local; versões/execuções permanecem no
estado efêmero e deixam de ser acessíveis pela lista. Reiniciar restaura fixtures.
Isso não define hard delete, soft delete, archive, retenção ou consulta do histórico
após exclusão na implementação real. Também seguem abertas as decisões de domínio
já listadas: versões, enums, auditoria, cardinalidades, autorização e storage.

Não houve alteração de backend, Prisma, migrations, banco, API, Kanban real,
Task Details, Requirement Details ou matriz RF. Não foi iniciado S1-08/Defeitos.
AppRoutes, ProjectSectionNav, página e teste de ProjectDetails preservam exatamente
os conteúdos anteriores ao addendum. O working tree permanece com alterações locais,
branch e HEAD originais. Sem commit, push, merge, rebase, reset, checkout ou stash.
Entrega funcional local disponível para validação visual humana; sem PASS global
antes da homologação renderizada.

## TEST CASES PROTOTYPE — FINAL C2 ALIGNMENT REPORT

### Addendum 2 — Git baseline e preservação

Rodada de 07/09/2026 sobre a implementação existente. Branch `daniel-dev`, HEAD
`b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`. Working tree já continha o protótipo e o
Addendum 1; não estava limpo. `git diff --check` inicial passou.

Baseline desta rodada em `/tmp/traceflow-testcases-addendum2-baseline`: status,
diff, cópias do protótipo/testes/documento e hashes de 854 caminhos. A comparação
final identifica 12 arquivos alterados nesta rodada, nenhum caminho novo e 842
caminhos preservados byte a byte, incluindo as alterações anteriores fora do escopo.
A exclusão anterior de `schedule/components/SearchCombobox.jsx` permanece preservada.

Arquivos desta rodada: este documento; `schedule/components/SprintActionsMenu.jsx`;
na feature `test-cases-prototype`, a screen, Parts, TestCaseList, TestCaseForm,
TestCaseDetails, TestExecutionWizard, scenario, model/test-cases e styles/test-cases;
e `test/test-cases-prototype/TestCasesPrototype.test.jsx`.

### Main screen e cards

- **Pagination removed:** estado, slice e controles de paginação removidos. Os
  quatro casos aparecem no mesmo grid; filtros continuam combináveis. Paginação
  backend segue obrigatória no S1-07 real.
- **Filter layout fixed:** quatro colunas quando o painel dispõe de 60rem; dois
  controles ocupam duas colunas na segunda linha. Abaixo disso, duas colunas; em
  painéis de até 34rem, uma. Labels e controles têm largura mínima zero e alturas
  consistentes. A observação no Safari encontrou selects nativos mais baixos;
  a composição local SelectControl conserva o select semântico, fixa 44px e usa
  o ícone canônico, sem alterar controles compartilhados.
- **Card alignment:** títulos menores, padding de 16px, raio e densidade baseados
  em Task Card, metadados operacionais e altura natural. Executar é primário,
  Histórico secundário; clique/teclado no card abrem detalhes.
- **New action card alignment:** reutiliza `new-milestone-card` e seu bloco de ícone,
  borda tracejada, hierarquia centralizada e tokens. Não foi criado outro padrão.
- **Overflow:** glifo horizontal `…`, rótulo acessível por caso e menu Editar/Excluir.
  A única alteração compartilhada desta rodada é o glifo em SprintActionsMenu;
  teclado, foco, posicionamento e fechamento permanecem sob seu owner original.

### Traceability e Details

Criar/Editar usam fieldset e legend de rastreabilidade na surface do
SprintTaskSelector. Requisito e tarefa usam o SearchCombobox compartilhado; o
requisito selecionado aparece em uma única linha com remoção, e tarefas em linhas
individuais com contagem. Há vazios explícitos para ambos. Vínculos continuam
opcionais. A última revisão removeu a seleção redundante interna do combobox de
requisito, mantendo a linha selecionada como apresentação única. Essa apresentação
final foi revalidada em Light e Dark nas quatro larguras, além dos testes finais.

Details usa intervalos de 24px entre seções, 16px nas superfícies e cabeçalhos com
contagem para requisito/tarefas. Descrição, informações, rastreabilidade,
pré-condições, passos e última execução continuam separados. Ao trocar o conteúdo
do único diálogo, foco é aplicado sem deslocamento automático e o scroll interno
volta ao início; isso preserva o respiro abaixo do cabeçalho.

### Test Steps

Cards de passo em duas colunas no desktop, uma em containers de até 38rem. Dentro
de cada card, ação e esperado ficam verticais, com textareas compactas de duas
linhas. Remover é um controle de 44px no canto superior direito, com ícone
centralizado e nome por passo. Adicionar passo usa o controle C2 com símbolo `+`.

Smoke renderizado de dez passos em Light e Dark: 1440×900, 1280×900, 768×1024 e
390×844. Foram observados a região inferior do formulário, reflow dos cards,
remoção centralizada, adicionar e footer. A interação automatizada adiciona dez,
remove o quarto, confirma a ordem e salva os nove restantes. Esse smoke não
substitui a revisão de todos os demais estados do formulário.

### Execution, evidências e Summary

O título do caso permanece no cabeçalho do diálogo, sem linha duplicada no wizard.
O contexto mostra discretamente a versão do caso, referência testada e ambiente.
A validação de cada resultado, observações de FAIL/BLOCKED, prioridade do resultado
geral e preservação ao voltar continuam iguais.

Cada passo pode manter fotos/vídeos locais. PNG/JPG/JPEG/WEBP têm preview quando o
File informa MIME de imagem suportado; MP4/WEBM/MOV mostram nome, formato e tamanho,
sem player obrigatório. URLs de imagem são revogadas na remoção e desmontagem.
Os limites provisórios existentes são aplicados ao conjunto da execução:
10MB/arquivo, cinco arquivos e 25MB somando passos e evidências gerais. O estado
permanece em memória, sem upload, storage ou persistência. Limites finais para
vídeo ainda não foram definidos.

O resumo agrupa métricas, resultado derivado, evidências de cada passo e anexos
gerais. Adicionar evidência usa ação C2, com input nativo oculto, ajuda,
erro associado e estado vazio. Espaços entre contexto, progresso, passo, métricas,
resultado geral e footer foram regularizados. Contexto incompleto continua visível
e impede registrar, mesmo com todos os passos PASS.

### History e Execution Details

Histórico e detalhe continuam substituindo o conteúdo do mesmo SprintDialog.
O retorno grande foi removido; o cabeçalho de EXEC-ID contém a ação pequena
**Histórico**, com nome acessível **Voltar ao histórico**, seguida do contexto do
caso. Não foi acrescentada uma API paralela ao diálogo compartilhado.

Passos históricos usam cards em surface semântica: número à esquerda e badge
PASS/FAIL/BLOCKED à direita; ação e esperado empilhados na coluna esquerda,
observado à direita. No mobile, o observado vem abaixo. Evidências do passo ficam
dentro de seu card; as gerais permanecem em seção própria. Fixtures v3 incluem
metadados de uma imagem e um vídeo marcados **Simulado**; não representam anexos
reais. A versão histórica v2 e seus quatro passos permanecem intactos.

### Spacing audit e comparação canônica

A auditoria ajustou: altura dos selects; intervalos entre seções e grupos; padding
dos cards; rastreabilidade agrupada; distância entre passo e evidência; alinhamento
dos controles de remoção; respiro inicial do diálogo e footer. Nenhuma alteração
foi feita em Task Details, Kanban ou nas regras de layout compartilhadas de Planning.

Além da inspeção do código, foram abertos na sessão autenticada, em Dark desktop,
Create Sprint, Task Card no Kanban, Task Details e a tela de Marcos com Novo Marco.
As capturas permitiram comparar diretamente superfícies, contagens, tipografia,
ações e densidade com as capturas do protótipo. Não foram salvos formulários nem
alterados dados reais nessas referências. A comparação renderizada equivalente
dessas referências em Light continua pendente.

### Tests e gates finais

Node **22.23.2**, com `NODE_OPTIONS=--no-experimental-webstorage`. Logs desta rodada
em `/tmp/tc-addendum2-*.log`. Os gates abaixo foram repetidos após as últimas
mudanças de foco e seleção de requisito.

| Gate | Resultado |
| --- | --- |
| `npm run lint` — frontend | PASS |
| `npm run format:check` — frontend | PASS |
| Prettier check adicional do CSS do protótipo | PASS |
| Focused — protótipo, SearchCombobox, SprintActionsMenu, Sprints, Marcos, Cronograma e Kanban | PASS — 237 testes, 7 arquivos |
| `npm test` — frontend | PASS — 827 testes, 70 arquivos |
| `npm run test:coverage` — frontend | PASS — 827 testes, 70 arquivos |
| Coverage statements / branches / functions / lines | 82,04% / 76,31% / 78,63% / 84,18% |
| `npm run build` — frontend | PASS |
| `npm run architecture:check` — script em backend | PASS |
| `git diff --check` | PASS |
| CI remoto | NOT RUN — sem publicação |

O protótipo possui **65 testes**, vinte a mais que o Addendum 1. Cobrem vínculos
opcionais, ordem após remover passo, dez passos, ausência de paginação e título
duplicado, menu por teclado, diálogo único, snapshots PASS/FAIL/BLOCKED e navegação
de retorno. Evidências cobrem as quatro extensões de imagem e três de vídeo,
preview/cleanup de URLs, remoção, rejeição integral de lote inválido, limites
globais entre passos e resumo, preservação durante navegação e associação ao
registro histórico. Os testes de consumidores protegem o menu compartilhado.

### Visual matrix — evidência observada e pendências

Safari autenticado em `/projects/2/test-cases`. Viewports conferidos no modo de
design responsivo: 1440×900, 1280×900, 768×1024 e 390×844. As capturas foram
inspecionadas durante a sessão; não há pacote de screenshots exportado.

**PASS** significa que o recorte descrito foi renderizado e inspecionado.
**PARCIAL** identifica conteúdo observado com estados ou regiões ainda pendentes.
O cenário com arquivo local permanece ENVIRONMENT BLOCKED nesta sessão, sem PASS
inferido de DOM, CSS ou testes. As linhas de formulário descrevem o recorte
responsivo observado; não significam que toda combinação de dados foi repetida
em cada largura.

| Surface / recorte | Light 1440 | Dark 1440 | Light 1280 | Dark 1280 | Light 768 | Dark 768 | Light 390 | Dark 390 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Main e filtros | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Criar — região de dez passos e footer | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Editar — rastreabilidade final | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Details — hierarquia, rastreabilidade e conteúdo histórico | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Execute | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL |
| Summary | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL | PARCIAL |
| History | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Execution Details PASS/FAIL — cards, observado e evidências simuladas | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Confirmar exclusão | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Criar também foi observado com um e quatro passos em 1440 nos dois temas e com
um passo em 390; o smoke de dez passos cobriu todas as larguras. Em Details, foram
inspecionadas as regiões de cabeçalho, informações, rastreabilidade, passos e
última execução, variando o scroll conforme a largura. Histórico foi aberto pelos
cards e por Details; retorno e resultados PASS/FAIL foram vistos no mesmo diálogo.
As confirmações foram canceladas, inclusive com retorno a Details.

Recortes parciais: Execute e Summary foram vistos nos dois temas e quatro viewports
com um passo PASS e contexto incompleto; falta concluir na UI real o cenário
válido com anexo local, incluindo preview e remoção. O preenchimento por automação
nativa não se confirmou no campo de busca e a tentativa por coordenadas retornou
`noWindowsAvailable`. O fluxo válido está coberto pela automação de componentes,
mas essa cobertura não substitui a homologação renderizada restante.

O seletor nativo abriu, mas **Enviar** permaneceu desabilitado ao selecionar o PNG
de teste e a fixture de metadados MP4. A confirmação do anexo local não ocorreu;
preview e vídeo na UI real continuam pendentes. A fixture MP4 não é uma gravação
reproduzível, e não foi utilizada como prova de reprodução de vídeo.

Posteriormente, o Safari forneceu capturas vazias apesar de identificar controles
na árvore acessível. Daniel informou que o notebook possivelmente havia desligado.
A captura voltou a funcionar em outra aba da mesma sessão. Ocorreram também
`timeoutReached` durante a retomada, superados por reconexão; as comparações e
os recortes marcados PASS acima foram efetivamente concluídos depois disso.
Em 768/390, a página e os filtros foram revalidados após recarregar o viewport,
eliminando uma apresentação intermediária da sidebar na emulação. Essas
interrupções não estabelecem defeito do protótipo. Tema Sistema e opção de
desenvolvedor do Safari foram restaurados aos valores iniciais; o modo responsivo
e o inspetor foram encerrados.

### Console

Nos testes finais do protótipo: **zero console.error, zero console.warn e zero
duplicate-key warnings**, verificados pelos spies da suíte. O console real do
Safari foi aberto durante a investigação e novamente ao final dos fluxos: sem
erros, avisos ou duplicate-key warnings visíveis. Isso não cobre os cenários com
anexo que não puderam ser concluídos. O gate completo de console real permanece
**PARCIAL**, restrito aos fluxos observados.

### Backend impact e decisões abertas

**Backend unchanged. Prisma unchanged. Migrations unchanged. Database unchanged.**
Nenhum teste de banco, mutação real, endpoint, schema ou armazenamento foi criado.
As referências reais foram consultadas sem salvar. RF42 não foi promovido a
implementado. Defects e S1-09 não foram iniciados.

Permanecem abertas: limites finais de vídeo, persistência/storage/autorização das
evidências, enums, versionamento real, auditoria, cardinalidades e comportamento
do histórico após exclusão. A remoção mock não decide hard delete/soft delete ou
archive para S1-07. A paginação backend continua requisito da implementação real.

### Git final e encerramento da rodada

Branch e HEAD permanecem os do baseline. Working tree continua local e sujo, com
o trabalho anterior preservado. O status final acrescenta somente a modificação de
SprintActionsMenu à lista de caminhos já modificados/não rastreados no início;
os demais arquivos desta rodada já pertenciam aos diretórios não rastreados do
protótipo. Comparação dos hashes: 12 alterações autorizadas, nenhum caminho novo.
`git diff --check`: PASS. `git rev-parse HEAD`:
`b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`.

Saída final de `git status --short` (inclui o trabalho anterior; não representa
somente o delta desta rodada):

```text
 M frontend/src/app/routes/AppRoutes.jsx
 M frontend/src/features/projects/components/ProjectSectionNav.jsx
 M frontend/src/features/schedule/components/MilestoneFilters.jsx
 M frontend/src/features/schedule/components/MilestoneSprintSelector.jsx
 D frontend/src/features/schedule/components/SearchCombobox.jsx
 M frontend/src/features/schedule/components/SprintActionsMenu.jsx
 M frontend/src/features/schedule/components/SprintFilters.jsx
 M frontend/src/features/schedule/components/SprintForm.jsx
 M frontend/src/features/schedule/components/SprintTaskSelector.jsx
 M frontend/src/features/schedule/index.js
 M frontend/src/features/schedule/pages/MilestonesScreen.css
 M frontend/src/features/schedule/pages/SprintsScreen.css
 M frontend/src/shared/index.js
 M frontend/test/components/SearchCombobox.test.jsx
 M frontend/test/pages/ProjectDetailsPage.test.jsx
?? docs/design/prototypes/
?? frontend/src/features/test-cases-prototype/
?? frontend/src/pages/TestCasesPrototypePage.jsx
?? frontend/src/shared/components/SearchCombobox.css
?? frontend/src/shared/components/SearchCombobox.jsx
?? frontend/test/test-cases-prototype/
```

O status inicial tinha a mesma lista, exceto SprintActionsMenu, que estava intacto.

**NO COMMIT. NO PUSH. NO MERGE. NO REBASE. NO RESET.** Também não houve clean,
stash ou checkout. A rodada termina aqui, com implementação e gates locais prontos,
mas homologação renderizada parcial. **Não há aprovação global nem congelamento
da UX.** Os recortes pendentes devem ser concluídos para Daniel decidir entre
**APROVADO PARA CONGELAR UX DO S1-07** e **NOVO AJUSTE VISUAL NECESSÁRIO**.
