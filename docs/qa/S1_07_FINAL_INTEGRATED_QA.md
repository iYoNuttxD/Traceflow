# TRACEFLOW S1-07 — FINAL INTEGRATED QA

Date: 2026-09-08 (America/Sao_Paulo)
Branch: `daniel-dev`
HEAD: `13582d644b7df68caa1f945d2a557d5bc974563d`
Database: MySQL `9.7.1`; schema exclusivo `traceflow_s107_final_13582d6_test`
Node: `22.23.2`; `NODE_OPTIONS=--no-experimental-webstorage`
Browser: Google Chrome `152.0.7977.76`, controle nativo; Safari `26.6.2` como tentativa inicial
OS: macOS `26.6.2`, build `25G83`

## Executive summary

Overall: **FINAL FAIL — CORRECTIONS REQUIRED**

| Classificação de findings |                                      Quantidade |
| ------------------------- | ----------------------------------------------: |
| Blocking                  |                                               0 |
| Important                 |                                               1 |
| Suggestions               |                                               0 |
| Environment blocked       | 4 regras do inventário, não findings de produto |

O CRUD persistido, as três classes de resultado, as versões, os snapshots históricos,
o soft delete, a autorização e as corridas determinísticas passaram nas verificações
locais desta revisão. Os dez formatos tiveram upload e download autenticados,
comparação de bytes/hash e preview real no Chrome. A cobertura backend passou cinco
vezes consecutivas **com diretório de evidências explicitamente isolado pela QA**.

O encerramento é impedido por **QA-S107-001**: a execução canônica dos testes de API,
sem `TEST_EVIDENCE_STORAGE_DIR`, falha em seis testes e deixa arquivos artificiais
no armazenamento de desenvolvimento. A configuração adicional da QA permite avaliar
o comportamento funcional, mas não corrige nem valida a configuração padrão do
repositório/CI. Não foi reproduzida perda de evidência real, falha de autorização ou
corrupção histórica.

Houve também uma falha inicial de temporização no frontend durante execução de
vários gates simultâneos. Ela está preservada como **OBS-01**; uma única execução
diagnóstica serial passou sem modificar assertions, timeouts ou implementação.
Isso não prova a causa da falha inicial nem a transforma em PASS retroativo.

**READ-ONLY sobre o produto.** Não houve correção, Code Review, commit, push, merge,
rebase, reset, clean, stash, edição de migration ou início de S1-08/S1-09.
Remote CI: **NOT PART OF THIS QA**. MySQL 8.4.8: **LOCAL DB NOT CI-EQUIVALENT**.

## Baseline, isolamento e preservação

O baseline foi capturado antes dos testes: working tree limpo, branch/HEAD acima,
`git diff --check` sem erro e SHA-256 de todos os arquivos rastreados. A QA usou o
checkout real, preservando os arquivos existentes e os relatórios anteriores.

O helper validou que `TEST_DATABASE_URL` era local e distinto do desenvolvimento,
criou um schema novo com marcador de propriedade e aplicou nele a cadeia completa
de 49 migrations. A aplicação e o Prisma das suítes receberam o alvo de teste antes
dos imports dependentes do banco. Nenhuma suite de cleanup foi direcionada ao banco
de desenvolvimento. O banco de desenvolvimento foi consultado **somente para leitura**
ao conferir duas evidências preexistentes durante a recuperação dos arquivos da QA.

As falhas iniciais de storage produziram dois lotes de 27 arquivos artificiais.
Foram identificados por janela de criação, conteúdo/hash, cardinalidade e ausência
de referência nos dados de desenvolvimento. Somente esses **54 arquivos** (48 PNG e
6 JSON) foram movidos para quarentena no diretório temporário da QA. As **duas
evidências preexistentes** foram conferidas por hash antes/depois e preservadas.
Não houve exclusão permanente desses arquivos nem limpeza genérica do storage.
Evidência: `storage-preservation.json`.

Para as rodadas subsequentes, `TEST_EVIDENCE_STORAGE_DIR` foi configurado apenas no
processo de QA para `/private/tmp/traceflow-s107-final-qa-13582d6/suite-evidence`.
O servidor HTTP independente usou outro diretório privado, `http-evidence`, dentro
do mesmo conjunto temporário. Nenhum arquivo de ambiente do produto foi editado.

O navegador acessou exclusivamente os serviços auxiliares em `127.0.0.1:5174` e
`127.0.0.1:3002`, com cookie de sessão próprio. Os serviços anteriores em 5173/3001
e as credenciais reais do usuário não foram usados nos testes mutáveis. Fixtures:
dois projetos, cinco usuários artificiais (quatro papéis e um usuário de projeto
estrangeiro), requisitos, três tarefas, PR/commit importados artificiais, 31 casos
operacionais e execuções/evidências próprias. Nenhum envio externo de email ou
chamada de escrita ao GitHub foi necessário.

## Evidências e método

Os logs, manifests e resultados estruturados desta execução estão em
[`/private/tmp/traceflow-s107-final-qa-13582d6`](/private/tmp/traceflow-s107-final-qa-13582d6).
São artefatos locais temporários; não representam CI remoto. Não incluir arquivos
de ambiente, cookies, cabeçalhos de sessão ou senhas em publicações deste relatório.

| ID  | Evidência atual e alcance                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E0  | `baseline.json`, `database-created.json`, `storage-preservation.json`, verificação Git final; escopo e preservação                                                                                                 |
| E1  | Schema/migration S1-07, módulos reais `backend/src/modules/testCases` e `frontend/src/features/testCases`; contratos API, matriz de autorização/RF, TEST_CASE_HISTORY e inventário UI                              |
| E2  | `prisma-validate.log`, `prisma-generate.log`, `migration-empty.log`, `migration-status.log`; cadeia em banco vazio e consulta do histórico de migrations                                                           |
| E3  | `backend-focused.log`: 120 casos em `domain.test.js`, `storage.test.js`, `integration/test-cases-s1-07.test.js` e `api/test-cases-s1-07.test.js`; storage exclusivo explícito                                      |
| E4  | `http-results.json`: 69 verificações independentes via HTTP/DB real, sem mocks de persistência; `files-manifest.json`; downloads iguais byte a byte                                                                |
| E5  | `frontend-focused-serial.log`: 130 testes em 6 arquivos; inclui flows, concurrency, payload, foco, formatos, object URLs e UX. Transporte controlado/mocks nos testes frontend; não confundir com browser+API real |
| E6  | Árvores acessíveis e capturas nativas desta sessão no Chrome/Safari; catálogo, histórico, edição, execução, rastreabilidade e viewers. Larguras confirmadas no controle de emulação; limites abaixo                |
| E7  | `http-network.jsonl`: método/path/status/duração, sem credenciais; requests da API real durante a homologação                                                                                                      |
| E8  | Logs de todos os gates, `backend-gates.json`, cinco logs de coverage, audit policy e preservação final                                                                                                             |

Nenhum resultado de execução anterior foi usado como PASS desta QA. Testes
automatizados, HTTP persistido e observação visual são explicitamente distintos.
O inventário contém as **246 seções numeradas do pedido**, incluindo regras de
processo/relatório: 236 PASS, 3 FAIL, 4 ENVIRONMENT BLOCKED, 3 NOT APPLICABLE. Esses totais não são contagens de testes unitários
nem de defeitos independentes. A regra 237 deriva do finding, não constitui outro
finding.

## Scope matrix

| Área                    | Resultado                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| Migration/schema        | PASS local — 49 migrations; 8.4.8 ENVIRONMENT BLOCKED                                               |
| Authorization           | PASS — quatro papéis, membership, CSRF e opacidade entre projetos                                   |
| CRUD                    | PASS — HTTP real e integração                                                                       |
| Versioning              | PASS — definição/no-op/status/responsável e snapshots                                               |
| Filters/summary         | PASS — filtros isolados/combinados, summary contra DB, paginação e append                           |
| PASS execution          | PASS — autoridade do servidor e passos persistidos                                                  |
| FAIL execution          | PASS — observação exigida e precedência FAIL                                                        |
| BLOCKED execution       | PASS — motivo exigido, sem FAIL resulta BLOCKED                                                     |
| Evidence persistence    | PASS com storage de QA isolado; configuração canônica de testes FAIL (QA-S107-001)                  |
| Evidence viewer         | PASS no Chrome para fixtures/formatos observados; não universaliza codecs/navegadores               |
| Historical immutability | PASS — definição/owners atuais alterados, histórico e bytes preservados                             |
| Soft delete             | PASS — recurso operacional oculto; filhos históricos preservados                                    |
| History                 | PASS — streams/tabs/cursor e execução por snapshot                                                  |
| Traceability UI         | PASS nas superfícies observadas e testes; dados mínimos reais e navegação canônica                  |
| Async/races             | PASS automatizado — requests controlados e row locks reais                                          |
| Light                   | PASS de smoke visual das superfícies registradas                                                    |
| Dark                    | PASS de smoke visual das superfícies registradas                                                    |
| Responsive              | PASS de smoke em 1440/768/390; não valida todos os estados de erro nessas dimensões                 |
| Accessibility           | PASS técnico e verificação manual parcial; cobertura manual integral/medição independente pendentes |
| Performance             | PASS no conjunto local observado; não é teste de carga nem garantia em escala de produção           |
| Documentation           | PASS no alinhamento observado; RF42 não promovido a encerrado por esta QA                           |
| Gates                   | FAIL na configuração padrão do backend; gates funcionais com ambiente isolado PASS                  |

## Contrato executável e schema

Foram confirmadas as oito entidades S1-07: TestCase, TestCaseStep, TestCaseTask,
TestCaseVersion, TestCaseHistoryEntry, TestExecution, TestExecutionStep e TestEvidence.
Há unicidade de posição por caso/execução, relação caso–tarefa sem duplicatas,
unicidade de versão por caso, storageKey privado único e índices por projeto,
status, responsável, requisito, taskId, histórico/execução e evidência. As constraints
SQL de referência testada XOR e destino de evidência foram exercitadas pela
integração. Não foi inferido um problema de performance apenas pela forma dos índices.

No histórico Git do S1-07, só foi adicionada a migration
`20260907120000_s1_07_test_cases/migration.sql`; migrations anteriores não foram
reescritas. A cadeia de **49 migrations** passou em schema inicialmente vazio e o
status ficou atualizado. Prisma validate e generate passaram.

Diferenças relevantes entre o pedido e o contrato real:

- `description` é opcional. `status` ausente no create assume `ATIVO`; exigir erro
  nesse caso seria testar uma regra inexistente. Os demais obrigatórios foram
  omitidos individualmente e rejeitados. Status inválido continua rejeitado.
- São aceitos de 1 a 100 passos; 0 e 101 foram rejeitados; 10/100 persistiram na
  ordem enviada. Posições e metadados autoritativos não vêm do cliente.
- Status/responsável isolados produzem eventos de histórico, sem nova versão de
  definição. Relações e ordem semântica dos passos produzem versão; ordem do
  conjunto de taskIds e no-op normalizado não produzem versão artificial.
- Histórico de alterações expõe `actorUserId`, sem exigir display name nessa DTO.
  `Usuário #ID` é fallback identificável, não ator inventado. A execução possui
  snapshot de display name: `QA OWNER` foi observado na API e na UI.
- Após soft delete, detalhes/histórico/versões operacionais do caso respondem 404;
  execução histórica por ID e evidência autenticada continuam disponíveis.
- DTOs de Requirement/Task usados nessa rastreabilidade fornecem metadados mínimos
  reais. Não foram exigidos status, descrição ou links não contratados. Os cliques
  navegaram para `/projects/2876/requirements` e `/projects/2876/tasks`.
- TXT com conteúdo ativo é rejeitado pelo backend. O viewer foi exercitado com
  `<b>não interpretar HTML</b>` literal e JSON contendo `<script>` como string;
  o teste frontend específico cobre texto semelhante a HTML sem execução.

## Authorization matrix

Resultados abaixo são da API real, incluindo leitura do corpo e status esperado.
`PASS / 403` significa que a proibição esperada foi respeitada.

| Capability | VIEWER     | MEMBER           | MANAGER          | OWNER            |
| ---------- | ---------- | ---------------- | ---------------- | ---------------- |
| List       | PASS / 200 | PASS / 200       | PASS / 200       | PASS / 200       |
| Details    | PASS / 200 | PASS / 200       | PASS / 200       | PASS / 200       |
| Create     | PASS / 403 | PASS / permitido | PASS / permitido | PASS / permitido |
| Update     | PASS / 403 | PASS / permitido | PASS / permitido | PASS / permitido |
| Status     | PASS / 403 | PASS / permitido | PASS / permitido | PASS / permitido |
| Delete     | PASS / 403 | PASS / permitido | PASS / permitido | PASS / permitido |
| Execute    | PASS / 403 | PASS / permitido | PASS / permitido | PASS / permitido |
| History    | PASS / 200 | PASS / 200       | PASS / 200       | PASS / 200       |
| Evidence   | PASS / 200 | PASS / 200       | PASS / 200       | PASS / 200       |

E4 também cobriu versions, lista de execuções e detalhe de execução para os quatro
papéis. Sem sessão: 401. Sem membership no projeto: resposta opaca 404 para caso,
execução e evidência. Requirement/Task/PR/commit/responsável estrangeiros foram
rejeitados sem persistência parcial. A integração cobre responsável inexistente e
membership inativa. Create/update/delete/execute sem CSRF foram rejeitados antes
da mutation/parser multipart, conforme a matriz vigente.

## CRUD, summary e resultados

Create mínimo e completo, alteração dos campos de definição, troca de responsável,
ativar/inativar e soft delete passaram. O projeto artificial terminou a preparação
com summary **TOTAL 31 / ATIVOS 25 / SEM RASTREABILIDADE 15 / NUNCA EXECUTADOS 25 /
COM FALHA 2**, igual à contagem independente no DB e ao catálogo renderizado.
Sem rastreabilidade exige ausência de Requirement **e** Tasks; falha considera
somente a última execução. A integração cobre caso cujo FAIL anterior foi seguido
de outro resultado, evitando contar qualquer falha histórica.

Busca por identificação/título, status, responsável, requisito, tarefa, resultado
PASS/FAIL/BLOCKED/NEVER_EXECUTED e combinações passaram no backend. No navegador,
`TC-340` e `texto acima` localizaram os casos esperados. `Carregar mais casos`
passou de **20 para 31 containers, com 31 IDs únicos**. Não há pager tradicional.

Todos os passos PASS → PASS; um FAIL com observação → FAIL; BLOCKED sem FAIL →
BLOCKED; FAIL + BLOCKED → FAIL. Observação/motivo ausentes foram rejeitados.
Executor, timestamps e resultado foram conferidos contra a autoridade do servidor;
não foram aceitos campos arbitrários do cliente para substituí-los. Não foi criada
entidade Defect automaticamente. A busca usa PR/commit importado do projeto, com
prioridade dos artefatos das tarefas; referências estrangeiras e XOR inválido falham.

## Version matrix

| Cenário                 | Resultado / evidência                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| Create v1               | PASS — versão 1 com snapshot autossuficiente                                                 |
| Definition update       | PASS — v1→v2 e v2→v3; versões anteriores permanecem                                          |
| Status-only             | PASS — evento, sem incrementar versão                                                        |
| Responsible-only        | PASS — evento, sem incrementar versão                                                        |
| Requirement update      | PASS — nova versão e snapshot do vínculo                                                     |
| Task update             | PASS — nova versão para mudança do conjunto; reordenação do conjunto não é mudança semântica |
| Step reorder            | PASS — nova versão e ordem persistida                                                        |
| No-op                   | PASS — normalização não fabrica versão                                                       |
| Conflict                | PASS — exatamente um update vence; outro recebe conflito                                     |
| Historical immutability | PASS — snapshots e evidências sobrevivem a mudanças dos owners atuais                        |

A fixture `TC-340` teve execução `EXEC-0207` na v1 e depois alteração da definição
atual, requisito, tarefas e PR. O catálogo passou a mostrar a definição v2; a execução
continuou mostrando **Caso v1**, título antigo, pré-condições/passos antigos e
**PR #701 · QA PR importado**, apesar do PR atual renomeado para outro título/status.
Arquivos baixados depois permaneceram idênticos. A integração ainda cobre o cenário
v3 com cinco passos, PNG no passo 3, MP4 no passo 5 e JSON geral.

## Race matrix

| Scenario                                         | Resultado                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Project A → B                                    | PASS — resultado A ignorado mesmo se transport desconsidera AbortSignal                                            |
| TestCase A → B                                   | PASS — identidade do detalhe vigente preservada                                                                    |
| Search old → new                                 | PASS — invalidação durante debounce e latest-wins                                                                  |
| History / Execution A → B                        | PASS — streams e detalhe não aceitam resposta antiga                                                               |
| GET → Create → old GET                           | PASS — recibo confirmado preservado                                                                                |
| GET → Update → old GET                           | PASS — leitura antiga não desfaz update                                                                            |
| GET → Delete → old GET                           | PASS — removido não reaparece                                                                                      |
| GET → Execute → old GET                          | PASS — latestExecution confirmado preservado                                                                       |
| Update v3 vs Update v3                           | PASS do invariant — teste determinístico usa v1 e produz uma v2, com um conflito                                   |
| Execute v3 vs v4                                 | PASS do invariant — versões stale rejeitadas sem execução parcial; testes não dependem do número literal da versão |
| Delete/status/update ganha lock antes de execute | PASS — execução rejeitada 404/409; zero execução persistida                                                        |
| Execute ganha lock antes de delete/status/update | PASS — execução histórica antiga preservada, operação posterior válida                                             |

As sete corridas backend usam barreiras explícitas sobre transações/row locks,
sem sleeps. As corridas frontend usam promises controladas, não latência inferida
de navegação manual. Create/edit/delete/execute confirmados com refresh falho
mantêm sucesso e mostram warning; a falha de reconciliação não é apresentada como
falha da mutation. Draft de edição/executar fica preservado no conflito, sem
reenviar automaticamente uma versão nova.

## Evidence viewer matrix

Todas as fixtures são artificiais: imagens com identificação da QA; vídeos de
dois segundos gerados localmente (MP4/MOV H.264 e WEBM VP9); PDF de uma página;
texto/LOG/JSON seguros. A coluna Preview refere-se às fixtures e ao Chrome desta
rodada, em Light e Dark, não a todo codec possível. Download é HTTP autenticado
com bytes/hash iguais, não dez gravações manuais na pasta Downloads.

| Format | Upload | Persist | Preview                                                       | Download | Resultado                                                  |
| ------ | ------ | ------- | ------------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| JPG    | PASS   | PASS    | PASS — imagem renderizada                                     | PASS     | PASS                                                       |
| PNG    | PASS   | PASS    | PASS — imagem renderizada                                     | PASS     | PASS                                                       |
| WEBP   | PASS   | PASS    | PASS — imagem renderizada                                     | PASS     | PASS                                                       |
| MP4    | PASS   | PASS    | PASS — quadro, controles, pausado inicialmente, play acionado | PASS     | PASS na fixture; sem ensaio completo de codecs             |
| WEBM   | PASS   | PASS    | PASS — quadro, controles, pausado inicialmente, play acionado | PASS     | PASS na fixture; sem ensaio completo de codecs             |
| MOV    | PASS   | PASS    | PASS — quadro, controles e play na fixture suportada          | PASS     | PASS no Chrome observado                                   |
| PDF    | PASS   | PASS    | PASS — documento de uma página no viewer nativo               | PASS     | PASS visual; leitura acessível do PDF tem limitação abaixo |
| TXT    | PASS   | PASS    | PASS — literal, quebra da linha longa                         | PASS     | PASS                                                       |
| LOG    | PASS   | PASS    | PASS — texto literal                                          | PASS     | PASS                                                       |
| JSON   | PASS   | PASS    | PASS — indentação e strings literais                          | PASS     | PASS                                                       |

`EXEC-0207`: JPG/PNG/WEBP no passo 1; MP4/WEBM/MOV no passo 2; passo 3 sem anexo;
PDF/TXT/LOG/JSON gerais. A apresentação preservou essa separação. A evidência
`large.txt`, **2.097.153 bytes**, passou no upload permitido e mostrou em Light
“Este arquivo é grande demais para visualização direta no TRACEFLOW”, com download.

Limites: 10 MiB por arquivo não vídeo, 50 MiB por vídeo, três arquivos por passo,
cinco gerais, vinte por execução e 100 MiB agregados, conforme configuração atual.
Testes exercitam limites inclusivos/excedentes; a API aceita exatamente vinte e
rejeita o vigésimo primeiro sem execução parcial. Extensão inválida, assinatura
falsa, JSON inválido, conteúdo ativo, destino inválido, symlink/traversal e falhas
de staging/persistência foram rejeitados/compensados. DTO/download não expõem
storageKey ou caminho absoluto.

No PDF artificial rasterizado, o leitor nativo exibiu o documento, mas informou
falha ao baixar arquivos de extração de texto para acessibilidade. Isso não é falha
de download/persistência do PDF pelo TRACEFLOW, e não valida leitura por tecnologia
assistiva desse documento. Não foi acionado “Salvar no Google Drive” nem link externo.

No viewer, Voltar restaurou Execution Details; Escape fechou o diálogo e devolveu
foco ao acionador do histórico. Os testes conferem também restauração de scroll,
somente um diálogo, cancelamento de leituras antigas, decode atrasado, descarte e
revogação de object URLs, inclusive na reabertura da mesma evidência.

## Visual matrix e acessibilidade

`PASS*` significa **smoke renderizado**, com conteúdo real, no tema e largura
indicados. Não significa todos os estados de validação/erro, todos os arquivos em
todas as dimensões, touch real ou certificação completa de acessibilidade.
As evidências são as capturas nativas desta sessão (E6), sem reaproveitar imagens
de QA anterior. A matriz de formatos acima foi executada em viewport desktop
nativo; a amostragem responsiva do viewer usou JSON.

| Surface           | Light 1440 | Dark 1440 | Light 768 | Dark 768 | Light 390 | Dark 390 |
| ----------------- | ---------- | --------- | --------- | -------- | --------- | -------- |
| Main              | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| Filters           | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| Card              | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| Create/Edit       | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| Details           | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| Execute           | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| History           | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| Execution Details | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |
| Evidence Viewer   | PASS*      | PASS*     | PASS*     | PASS*    | PASS*     | PASS*    |

O Chrome confirmou Width=1440/768/390 no controle Responsive. A altura variou
entre 894 e 596 CSS px quando a escala de captura mudou de 50% para 75%; não se
confundiu largura da imagem nativa com viewport CSS. Cabeçalho/summary/filtros e
cards foram observados em posições distintas de scroll. O formulário preenchido
de edição representa Create/Edit na matriz; criação vazia foi aberta também em
Light no desktop nativo. Histórico foi observado com execução e com estado vazio.
Dados inferiores de diálogos longos exigem scroll; uma captura do topo não foi
tratada como imagem de todo o formulário.

Observações atuais: altura dos cards Novo caso/caso consistente no desktop;
empilhamento em mobile; ações Execute/Edit/Delete no header (menu compacto em
largura menor); histórico com tabs e retorno compacto; versão testada em bloco
único. As categorias de rastreabilidade usam a linguagem de Task Details, conferido
no Kanban em Light/Dark. Dados ausentes permanecem ausentes. Links de Requirement
e Task saem do diálogo e navegam para o projeto correto.

O wizard abriu com a lista de referências fechada. No desktop nativo, abrir a
busca mostrou candidatos acima dos passos, sem ficar atrás do footer; Down/Up/Enter
selecionaram um commit importado e Escape fechou a lista. O rascunho foi cancelado,
sem execução enviada pela UI. Create, edit e delete reais já estavam cobertos por
API/testes; no navegador não foi necessário repetir mutations para a matriz visual.

| Verificação                          | Resultado e limite                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Foco inicial/Escape/retorno          | PASS automatizado; manual observado em detalhes, forms e viewer; não é percurso integral com leitor de tela                 |
| Teclado em flows principais          | PASS técnico (E5); percurso manual integral sem mouse permanece ENVIRONMENT BLOCKED no alcance desta sessão nativa instável |
| Combobox Down/Up/Enter/Escape        | PASS observado no seletor de referência e automação dos seletores                                                           |
| Rótulos de status                    | PASS — texto/ícone além de cor                                                                                              |
| Ações 44×44                          | Tokens/CSS e testes técnicos conferidos; medição renderizada independente de cada ação não concluída (ENVIRONMENT BLOCKED)  |
| Touch físico                         | ENVIRONMENT BLOCKED — mouse/emulação não contam como touch                                                                  |
| Leitura acessível do PDF rasterizado | ENVIRONMENT BLOCKED no leitor nativo; preview visual e download PASS                                                        |

Intercorrências do ambiente: Safari passou a retornar `timeoutReached` ao abrir
preferências; Chrome também apresentou árvore/imagem temporariamente fora de
sincronia quando a janela não estava ativa. O usuário informou que colocaria a
tela no Chrome; a sessão voltou a renderizar. Algumas capturas logo após resize
mostravam layout em transição; os campos Ambiente/Responsável foram conferidos
novamente com layout estabilizado, sem reproduzir ausência funcional. Houve ainda
erro nativo ScreenCaptureKit `-3812` em tentativa de clique por coordenadas. Não
foram classificados como bugs do produto apenas pela árvore/imagem desatualizada.

## Performance, network e console

Os logs HTTP locais mostram listagem com summary agregado e leituras de caso,
histórico e execução sob demanda. Não houve request de detalhe por card para
montar o catálogo. A lista de 20/31 casos não desencadeou download de todos os
anexos: os GETs de conteúdo apareceram após abrir cada viewer. Algumas leituras
foram duplicadas pelo ciclo de desenvolvimento/abertura; não houve loop crescente
ou tempestade durante as interações observadas. Não é um benchmark de produção.

O servidor registrou **279 requests**, com 50 respostas 201, 183 respostas 200,
10 respostas 403, 6 respostas 204, 6 respostas 401, 9 respostas 404 e 15 respostas
400; **nenhum 5xx**. Erros registrados correspondem às verificações negativas de
autorização, sessão, CSRF, validação e recurso opaco.

O console nativo foi lido: 401 de `/auth/me` antes do login; 404 de favicon;
`Unchecked runtime.lastError: The message port closed before a response was received`
repetido, sem stack que demonstre origem no produto. Avisos/Issues do navegador
também apareceram. Não se declara “console zero errors” nem se atribui o erro de
message port ao S1-07 sem reprodução/atribuição. Não houve navegação para GitHub
durante as buscas de referências. Os logs da API não são prova completa de egress
de todo o navegador.

## Test counts e gates

Todos os valores abaixo pertencem ao HEAD deste relatório. Nenhum teste do produto
foi editado, nenhuma assertion relaxada e nenhum retry adicionado.

| Execução                                 | Resultado atual                                                       |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Frontend focused inicial                 | **129 PASS / 1 FAIL**, 6 arquivos; OBS-01                             |
| Frontend focused serial diagnóstico      | **130 PASS**, 6 arquivos; 10,78 s                                     |
| Frontend full                            | **898 PASS**, 75 arquivos                                             |
| Frontend coverage                        | **898 PASS**, thresholds PASS                                         |
| Backend focused padrão inicial           | **114 PASS / 6 FAIL**, 4 arquivos; QA-S107-001                        |
| Backend focused storage isolado          | **120 PASS**, 4 arquivos                                              |
| Backend unit                             | **634 PASS**, 56 arquivos                                             |
| Backend integration inicial              | Interrompido após reproduzir falhas de storage; não contado como PASS |
| Backend integration storage isolado      | **434 PASS / 5 skips**, 29 arquivos pass + 2 skipped                  |
| Backend coverage, cada uma das 5 rodadas | **1068 PASS / 5 skips**, 85 arquivos pass + 2 skipped                 |
| Supply-chain policy unit                 | **5 PASS**                                                            |
| HTTP independente                        | **69 PASS / 0 FAIL**; não somado às contagens Vitest                  |

Coverage backend idêntica nas cinco rodadas: statements **90,71%** (5763/6353),
branches **80,43%** (3396/4222), functions **94,49%** (1510/1598), lines **93,15%**
(5345/5738). Frontend: statements **82,22%** (6835/8313), branches **76,43%**
(5452/7133), functions **78,24%** (1842/2354), lines **84,40%** (6191/7335).

| Run | Resultado                               |
| --- | --------------------------------------- |
| 1   | PASS — 1068 + 5 skips, 57 s de processo |
| 2   | PASS — 1068 + 5 skips, 57 s de processo |
| 3   | PASS — 1068 + 5 skips, 57 s de processo |
| 4   | PASS — 1068 + 5 skips, 57 s de processo |
| 5   | PASS — 1068 + 5 skips, 57 s de processo |

As cinco rodadas foram consecutivas, sequenciais e no mesmo schema exclusivo,
usando o cleanup canônico entre testes e diretório privado de QA. Não houve falha
entre elas nem execução extra para substituir uma rodada vermelha de coverage.
Os cinco skips são os legados canônicos em
`test/integration/e6-backfill.test.js` e
`test/integration/e11-legacy-responsibility.test.js`, anteriores ao S1-07/LR.2.
**Zero skip S1-07**. Eles não contam como PASS.

| Gate                       | Resultado                                                                        |
| -------------------------- | -------------------------------------------------------------------------------- |
| Frontend lint              | PASS                                                                             |
| Frontend format            | PASS                                                                             |
| Frontend full tests        | PASS — 898                                                                       |
| Frontend coverage          | PASS — thresholds e 898 testes                                                   |
| Frontend build             | PASS                                                                             |
| Backend lint               | PASS                                                                             |
| Backend format             | PASS                                                                             |
| Backend unit               | PASS — 634                                                                       |
| Backend integration        | FAIL no padrão por QA-S107-001; PASS com storage de QA explícito — 434 + 5 skips |
| Backend coverage           | PASS em 5 rodadas com storage de QA explícito; não valida configuração padrão    |
| Prisma validate / generate | PASS / PASS                                                                      |
| Migration empty DB         | PASS — 49 migrations                                                             |
| Migration status           | PASS — atualizado                                                                |
| Architecture               | PASS                                                                             |
| Secrets                    | PASS — scanner canônico, 454 arquivos                                            |
| Supply chain               | PASS — backend/frontend 0 high, 0 critical, 0 exceções usadas                    |
| git diff --check           | PASS — baseline e conferência final                                              |

Comandos canônicos executados (cwd do pacote correspondente):

```text
frontend: npx vitest run test/testCases --reporter=verbose
frontend: npm test
frontend: npm run test:coverage
frontend: npm run lint
frontend: npm run format:check
frontend: npm run build
backend: npx vitest run test/unit/test-cases test/integration/test-cases-s1-07.test.js test/api/test-cases-s1-07.test.js
backend: npm run test:unit
backend: npm run test:integration
backend: npm run test:coverage  (5 rodadas sequenciais)
backend: npm run lint
backend: npm run format:check
backend: npm run architecture:check
backend: npm run security:secrets
backend: prisma validate / prisma generate / cadeia e status pelo fluxo canônico de migrations
```

As URLs/credenciais do banco foram carregadas no processo, validadas e sanitizadas;
não são reproduzidas aqui. O runner temporário não altera os scripts do repositório.
A policy de supply chain foi executada nos dois pacotes e seus próprios cinco
testes passaram; não houve nova exceção, alteração de lockfile ou dependência do
produto. Ferramentas de geração dos arquivos artificiais ficaram somente em `/tmp`.

## Findings reproduzidos

### QA-S107-001 — Testes de evidência dependem de storage não configurado e escrevem no diretório de desenvolvimento

**Severity:** IMPORTANT.

**Scenario:** executar os testes S1-07 de API/integration no ambiente canônico com
TEST DB válido, mas sem variável opcional `TEST_EVIDENCE_STORAGE_DIR` definida.

**Precondition:** HEAD `13582d6`, Node 22.23.2, schema exclusivo migrado; configuração
de banco de teste válida e distinta do desenvolvimento. Não executar a reprodução
em checkout que contenha evidências importantes no fallback sem isolá-lo previamente.

**Steps:**

1. Preparar TEST DB exclusivo pela validação canônica, sem configurar o diretório
   de evidências no processo de teste.
2. Rodar o comando focado backend indicado acima, preservando os testes originais.
3. Observar testes de upload/download dos papéis, VIEWER, rejeição/cleanup e quota
   de vinte arquivos; conferir os erros de filesystem e arquivos artificiais.
4. A execução inicial de `npm run test:integration` encontra as mesmas falhas.
   Essa rodada foi interrompida após identificar o risco de mais artefatos no
   diretório compartilhado.

**Expected:** ambiente de testes funcional e isolado de storage de desenvolvimento;
root consistente entre a implementação sob teste e o cleanup; ausência de variável
não produz upload no storage de desenvolvimento seguido de cleanup inválido.

**Observed:** **seis falhas** com
`TypeError: The "path" argument must be of type string or an instance of Buffer or URL. Received undefined`.
O runtime usa fallback `backend/.data/test-evidence`, enquanto o teste passa
`process.env.TEST_EVIDENCE_STORAGE_DIR` diretamente a `realpath`/`readdir`.
Assim, uploads podem persistir antes do erro de cleanup. As duas execuções iniciais
deixaram 54 arquivos próprios no diretório de desenvolvimento, posteriormente
quarentenados e conferidos conforme E0. Nenhum arquivo real foi perdido.

**Evidence:**

- `initial-backend-focused.log`: 1 arquivo failed / 3 passed; **6 failed / 114 passed**.
- `initial-backend-integration.log`: repetição das mesmas falhas, rodada interrompida.
- `backend/test/api/test-cases-s1-07.test.js`: operações sobre env em linhas
  **143, 177, 231 e 289**; três casos parametrizados MEMBER/MANAGER/OWNER compõem
  parte das seis falhas.
- `backend/src/modules/testCases/storage/local-test-evidence.storage.js`: root
  de fallback não produtivo na inicialização do storage.
- `.github/workflows/ci.yml`: job backend configura DB/TEST DB, sem estabelecer
  `TEST_EVIDENCE_STORAGE_DIR`. Isso identifica o alcance da configuração;
  **não é afirmação de que CI remoto foi executado ou falhou nesta rodada**.
- `storage-preservation.json`: 54 artefatos próprios em quarentena; 2 evidências
  preexistentes verificadas e preservadas.
- `backend-focused.log` e cinco coverage verdes após configurar somente storage
  privado no processo de QA: diagnóstico da dependência de configuração.

**Likely scope:** bootstrap/configuração e cleanup de evidências das suites de
teste, consistência do ambiente canônico local/CI e verificação de isolamento antes
dos imports. Não foi demonstrada necessidade de alterar regras de negócio, schema,
migrations, autorização, UX ou storage de produção.

**Impacto no encerramento:** compromete repetibilidade dos gates canônicos e
isolamento do filesystem durante testes S1-07. A exigência de segurança do DB não
basta quando arquivos escapam para armazenamento compartilhado. É IMPORTANT para
o fechamento, sem classificar como BLOCKING de integridade de dados reais, porque
esse dano não ocorreu nem foi demonstrado.

**Correção nesta QA:** nenhuma. Ver
[prompt cirúrgico](S1_07_TARGETED_CORRECTIONS_PROMPT.md).

### OBS-01 — Falha inicial de temporização frontend, sem causa de produto estabelecida

Esta é uma observação de execução, **não um segundo finding de produto** e não
origina escopo de correção no prompt.

Scenario: primeira suíte focada frontend iniciada simultaneamente com full tests,
outros gates frontend e testes backend. Expected: 130 PASS. Observed: 129 PASS e
uma falha em `uses the project route, real API, server summary and no prototype controls`:
`Unable to find role="article" and name /^TC-15/`. O DOM ainda mostrava
“Carregando contexto do projeto…”, no setup do cenário (`TestCases.test.jsx:134`).

Evidence: `frontend-focused.log`, `frontend-initial-failure.txt` e
`frontend-focused-serial.log`. Full e coverage passaram com 898 testes. Uma única
execução diagnóstica serial dos mesmos 130 passou, mantendo timeouts/assertions.
Concorrência de carga é hipótese, não causa demonstrada. Nenhum retry permanente,
espera arbitrária ou teste relaxado foi introduzido. O log vermelho permanece.

## Documentação e limites do encerramento

API_CONTRACTS, AUTHORIZATION_MATRIX e TEST_CASE_HISTORY correspondem aos resultados
de runtime exercitados, incluindo snapshots, defaults, membership e soft delete.
RF42 já está documentado como **IMPLEMENTADO LOCALMENTE — testes e smoke; CI e
homologação visual completa pendentes**. Este relatório não altera a matriz e
**não declara RF42 encerrado/VALIDATED LOCALLY** em razão de QA-S107-001 e dos
limites registrados. RF43/RF62 continuam parciais; RF44 não implementado; seleção
de PR/commit não completa a rastreabilidade consolidada de S1-09. A varredura de
runtime do teste `final-ux` passou sem protótipo ativo nos dois runtimes.

Os bloqueios ambientais não são contados como defects. MySQL 8.4.8 e touch físico
não foram executados. Acessibilidade manual integral e leitura acessível do PDF
artificial não foram certificadas. O smoke visual atual amplia a evidência anterior,
mas não equivale a validação de todos os estados/formatos em cada viewport ou a
teste cross-browser completo. Nenhuma dessas limitações é escondida por coverage.

## Resultado por regra

| Regra | Cenário                         | Resultado           | Evidência / limite                                                                                                                              |
| ----- | ------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 001   | CONTEXTO                        | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 002   | ESTADO REPORTADO ANTES DESTA QA | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 003   | REGRA DE QA                     | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 004   | GIT — BASELINE                  | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 005   | GIT — PROIBIDO                  | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 006   | DATABASE SAFETY                 | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 007   | NUNCA RESETAR DB REAL           | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 008   | FIXTURES                        | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 009   | NÃO CORRIGIR FINDINGS           | PASS                | E0 — escopo e registro desta QA.                                                                                                                |
| 010   | AUDITAR CONTRATOS REAIS         | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 011   | NÃO TESTAR O PROMPT             | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 012   | TESTCASE                        | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 013   | TRACEABILITY                    | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 014   | MULTIPLE TASKS                  | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 015   | EXECUTION                       | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 016   | STATUS                          | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 017   | RESULT                          | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 018   | HISTÓRICO                       | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 019   | EVIDÊNCIA                       | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 020   | SOFT DELETE                     | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 021   | BACKEND AUTHORITY               | PASS                | E1, E3, E4 — contrato/schema atuais e invariantes executados em TEST DB.                                                                        |
| 022   | ASYNC                           | PASS                | E5 — respostas controladas e recibos de mutation; automação frontend.                                                                           |
| 023   | RECONCILIATION                  | PASS                | E5 — respostas controladas e recibos de mutation; automação frontend.                                                                           |
| 024   | PRISMA VALIDATION               | PASS                | E2 — Prisma, 49 migrations, constraints/índices e histórico Git.                                                                                |
| 025   | EMPTY DATABASE                  | PASS                | E2 — Prisma, 49 migrations, constraints/índices e histórico Git.                                                                                |
| 026   | MIGRATION STATUS                | PASS                | E2 — Prisma, 49 migrations, constraints/índices e histórico Git.                                                                                |
| 027   | SEM EDIÇÃO HISTÓRICA            | PASS                | E2 — Prisma, 49 migrations, constraints/índices e histórico Git.                                                                                |
| 028   | MYSQL 8.4.8                     | ENVIRONMENT BLOCKED | EB-DB — MySQL local 9.7.1; 8.4.8 não executado.                                                                                                 |
| 029   | SCHEMA                          | PASS                | E2 — Prisma, 49 migrations, constraints/índices e histórico Git.                                                                                |
| 030   | INDEXES                         | PASS                | E2 — Prisma, 49 migrations, constraints/índices e histórico Git.                                                                                |
| 031   | PERFIS                          | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 032   | READ                            | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 033   | WRITE                           | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 034   | MEMBER+                         | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 035   | ANONYMOUS                       | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 036   | CROSS-PROJECT TESTCASE          | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 037   | CROSS-PROJECT REQUIREMENT       | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 038   | CROSS-PROJECT TASK              | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 039   | CROSS-PROJECT PR                | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 040   | CROSS-PROJECT COMMIT            | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 041   | EVIDENCE IDOR                   | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 042   | RESPONSÁVEL                     | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 043   | CSRF                            | PASS                | E3 + E4 AUTH/HTTP-02/03/05 — quatro papéis, isolamento e CSRF.                                                                                  |
| 044   | CREATE MINIMAL VALID            | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 045   | CREATE FULL                     | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 046   | REQUIRED FIELDS                 | PASS                | E4 HTTP-04: obrigatórios rejeitados; status ausente aceita ATIVO por contrato. Rejeição de status ausente: NOT APPLICABLE.                      |
| 047   | DESCRIPTION                     | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 048   | EMPTY STEPS                     | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 049   | MULTIPLE STEPS                  | PASS                | E4 HTTP-04: 0 rejeitado; 1/10/100 aceitos; 101 rejeitado.                                                                                       |
| 050   | ORDER                           | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 051   | UPDATE                          | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 052   | STATUS                          | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 053   | RESPONSIBLE                     | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 054   | DELETE                          | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 055   | AFTER DELETE LIST               | PASS                | E3 persisted definitions/HTTP CRUD + E4 HTTP-04/05/10.                                                                                          |
| 056   | AFTER DELETE DETAILS            | PASS                | E3/E4 HTTP-10: detalhes/versões/histórico operacional 404 após delete; execução por ID preservada.                                              |
| 057   | CREATE VERSION                  | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 058   | DEFINITION UPDATE               | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 059   | SECOND UPDATE                   | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 060   | STATUS-ONLY                     | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 061   | RESPONSIBLE-ONLY                | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 062   | REQUIREMENT CHANGE              | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 063   | TASK CHANGE                     | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 064   | STEP ORDER CHANGE               | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 065   | NO-OP                           | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 066   | SNAPSHOT                        | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 067   | REQUIREMENT RENAMED             | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 068   | TASK RENAMED                    | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 069   | TWO UPDATES                     | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 070   | NÃO TWO SAME VERSIONS           | PASS                | E3 persisted definitions + deterministic row-lock races; E4 HTTP-09.                                                                            |
| 071   | UI CONFLICT                     | PASS                | E5 TestCases: draft preservado no 409; sem fechamento ou retry automático.                                                                      |
| 072   | SUMMARY                         | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 073   | SEM RASTREABILIDADE             | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 074   | COM FALHA                       | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 075   | NEVER EXECUTED                  | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 076   | SEARCH                          | PASS                | E3 filtros TC-ID/título; E6 busca TC-340 retornou 1 de 31 casos.                                                                                |
| 077   | STATUS FILTER                   | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 078   | RESPONSIBLE FILTER              | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 079   | REQUIREMENT FILTER              | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 080   | TASK FILTER                     | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 081   | RESULT FILTER                   | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 082   | COMBINED FILTERS                | PASS                | E3 filters independently and in combination; E4 HTTP-11 (summary/DB e páginas).                                                                 |
| 083   | CATALOG UX                      | PASS                | E5 final-ux; E6 catálogo real sem pager tradicional.                                                                                            |
| 084   | LOAD MORE                       | PASS                | E6: Carregar mais passou de 20 para 31 containers/31 IDs únicos; E4/E5 deduplicação.                                                            |
| 085   | ACTIVE TESTCASE                 | PASS                | E5 wizard abre caso ativo e mantém seletor fechado; comprovação automatizada.                                                                   |
| 086   | DROPDOWN INITIAL STATE          | PASS                | E5 wizard abre caso ativo e mantém seletor fechado; comprovação automatizada.                                                                   |
| 087   | NO OVERLAP                      | PASS                | E6: seletor fechado nas três larguras; aberto no desktop acima dos passos/sem clipping observado; E5 regressão.                                 |
| 088   | TESTED REFERENCE                | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 089   | RELATED TASK ARTIFACT FIRST     | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 090   | FALLBACK PROJECT                | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 091   | NO GITHUB CALL                  | PASS                | E3 busca sobre artefatos importados; E5 model-api bounded search. Nenhuma chamada GitHub na interação observada; não é auditoria de egress.     |
| 092   | ENVIRONMENT                     | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 093   | ALL PASS                        | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 094   | EXECUTED BY                     | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 095   | EXECUTED AT                     | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 096   | ONE FAIL                        | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 097   | FAIL OBSERVED                   | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 098   | FAIL WITH OBSERVED              | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 099   | NÃO CRIAR DEFECT                | PASS                | E3/E4 execution FAIL; schema/serviço sem criação automática de Defect; S1-08 não iniciado.                                                      |
| 100   | BLOCKED                         | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 101   | REASON                          | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 102   | FAIL + BLOCKED                  | PASS                | E3 immutable execution/candidatos + E4 HTTP-06; E5 validação do wizard.                                                                         |
| 103   | OPEN V3                         | PASS                | E3 stale execution e races com barreira de row lock, ambas as ordens; E5 conflito; E4 HTTP-10.                                                  |
| 104   | CREATE V4 ELSEWHERE             | PASS                | E3 stale execution e races com barreira de row lock, ambas as ordens; E5 conflito; E4 HTTP-10.                                                  |
| 105   | SUBMIT V3                       | PASS                | E3 stale execution e races com barreira de row lock, ambas as ordens; E5 conflito; E4 HTTP-10.                                                  |
| 106   | FRONTEND                        | PASS                | E3 stale execution e races com barreira de row lock, ambas as ordens; E5 conflito; E4 HTTP-10.                                                  |
| 107   | DELETE VS EXECUTE               | PASS                | E3 stale execution e races com barreira de row lock, ambas as ordens; E5 conflito; E4 HTTP-10.                                                  |
| 108   | DELETE AFTER EXISTING EXECUTION | PASS                | E3 stale execution e races com barreira de row lock, ambas as ordens; E5 conflito; E4 HTTP-10.                                                  |
| 109   | IMAGE                           | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 110   | VIDEO                           | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 111   | MULTIPLE STEPS                  | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 112   | GENERAL VS STEP                 | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 113   | JSON                            | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 114   | PDF                             | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 115   | TXT                             | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 116   | LOG                             | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 117   | VALID TYPES                     | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 118   | INVALID EXTENSION               | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 119   | FAKE EXTENSION                  | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 120   | INVALID JSON                    | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 121   | OVERSIZE                        | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 122   | TOO MANY                        | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 123   | PATH TRAVERSAL                  | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 124   | STORAGE PRIVACY                 | PASS                | E3 storage/signature/quota/compensation + E4 HTTP-01/07 e FILE-* (bytes/hash).                                                                  |
| 125   | JPG                             | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 126   | PNG                             | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 127   | WEBP                            | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 128   | MP4                             | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 129   | WEBM                            | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 130   | MOV                             | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 131   | PDF                             | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 132   | TXT                             | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 133   | LOG                             | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 134   | JSON                            | PASS                | E6 — viewer real Light; E4 FILE-*; E5 evidence-viewer. Limites visuais detalhados na matriz.                                                    |
| 135   | HTML-LIKE TEXT                  | PASS                | E5 texto literal; E6 TXT com <b> e JSON com <script> literais. TXT ativo rejeitado em E4 HTTP-07 conforme contrato; não contornado.             |
| 136   | LARGE TEXT                      | PASS                | E6 EXEC-0215/large.txt: fallback explícito e download em Light; E4 HTTP-08; E5 limite de Blob.                                                  |
| 137   | DOWNLOAD                        | PASS                | E4 FILE-* — os dez downloads HTTP autenticados iguais byte a byte; botão de download presente no viewer.                                        |
| 138   | VIEWER BACK                     | PASS                | E6 viewer → Execution Details no mesmo diálogo; E5 navegação/foco/scroll.                                                                       |
| 139   | NO MODAL STACK                  | PASS                | E6 viewer → Execution Details no mesmo diálogo; E5 navegação/foco/scroll.                                                                       |
| 140   | OBJECT URL CLEANUP              | PASS                | E5 evidence-focus/evidence-viewer: create/revoke, reabertura, fechamento, leitura atrasada e unmount.                                           |
| 141   | BASE EXECUTION                  | PASS                | E3 snapshots v3 + E4 HTTP-09 (v1→v2 e owners renomeados); E6 EXEC-0207 mantém v1, título e PR antigos.                                          |
| 142   | MUTATE CURRENT                  | PASS                | E3 snapshots v3 + E4 HTTP-09 (v1→v2 e owners renomeados); E6 EXEC-0207 mantém v1, título e PR antigos.                                          |
| 143   | OLD EXECUTION                   | PASS                | E3 snapshots v3 + E4 HTTP-09 (v1→v2 e owners renomeados); E6 EXEC-0207 mantém v1, título e PR antigos.                                          |
| 144   | PR CHANGES                      | PASS                | E3 snapshots v3 + E4 HTTP-09 (v1→v2 e owners renomeados); E6 EXEC-0207 mantém v1, título e PR antigos.                                          |
| 145   | TABS                            | PASS                | E3 histórico/cursor; E5 TestCases; E6 abas e execução histórica observadas em Light.                                                            |
| 146   | EXECUÇÕES                       | PASS                | E3 histórico/cursor; E5 TestCases; E6 abas e execução histórica observadas em Light.                                                            |
| 147   | ALTERAÇÕES DO CASO              | PASS                | E3 histórico/cursor; E5 TestCases; E6 abas e execução histórica observadas em Light.                                                            |
| 148   | ATOR                            | PASS                | E1 presenter: alterações expõem actorUserId; Usuário #ID é fallback real, sem promessa de display name. Execução usa snapshot QA OWNER (E4/E6). |
| 149   | NO TECHNICAL MICROCOPY          | PASS                | E5 copy e E6 histórico/Execution Details: sem explicação técnica audit trail vs execution history.                                              |
| 150   | REQUIREMENT CARD                | PASS                | E6: Task Details real via Kanban em Light/Dark comparado a TestCase Details; categorias canônicas, densidade/metadados coerentes; E5.           |
| 151   | TASKS CARD                      | PASS                | E6: Task Details real via Kanban em Light/Dark comparado a TestCase Details; categorias canônicas, densidade/metadados coerentes; E5.           |
| 152   | DATA                            | PASS                | E1 DTO real id/title; E5 canonical traceability sem metadados fabricados.                                                                       |
| 153   | REQUIREMENT CLICK               | PASS                | E6: REQ-405 navega para requirements; TASK-3794 para tasks do Project 2876; sem diálogo empilhado; E5.                                          |
| 154   | TASK CLICK                      | PASS                | E6: REQ-405 navega para requirements; TASK-3794 para tasks do Project 2876; sem diálogo empilhado; E5.                                          |
| 155   | NO MODAL STACK                  | PASS                | E6: REQ-405 navega para requirements; TASK-3794 para tasks do Project 2876; sem diálogo empilhado; E5.                                          |
| 156   | PROJECT A → B                   | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 157   | TESTCASE A → B                  | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 158   | SEARCH                          | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 159   | HISTORY                         | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 160   | EXECUTION DETAIL                | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 161   | CREATE                          | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 162   | UPDATE                          | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 163   | DELETE                          | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 164   | EXECUTION                       | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 165   | CREATE                          | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 166   | UPDATE                          | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 167   | DELETE                          | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 168   | EXECUTION                       | PASS                | E5 concurrency/useCaseRead/search e fluxos parametrizados de create/edit/delete/execute; promises controladas.                                  |
| 169   | MAIN                            | PASS                | E6 Main/summary/filtros observados em Light; matriz de dimensões delimita cobertura visual.                                                     |
| 170   | CARD HEIGHT                     | PASS                | E6 captura Light do card TC-340 ao lado de Novo caso: altura consistente no desktop observado.                                                  |
| 171   | TASK CARD PARITY                | PASS                | E6: Task Details real via Kanban em Light/Dark comparado a TestCase Details; categorias canônicas, densidade/metadados coerentes; E5.           |
| 172   | DETAILS                         | PASS                | E6: Task Details real via Kanban em Light/Dark comparado a TestCase Details; categorias canônicas, densidade/metadados coerentes; E5.           |
| 173   | HEADER ACTIONS                  | PASS                | E5 TestCases/final-ux: ações de definição no header e permissões VIEWER.                                                                        |
| 174   | TRACEABILITY                    | PASS                | E6: Task Details real via Kanban em Light/Dark comparado a TestCase Details; categorias canônicas, densidade/metadados coerentes; E5.           |
| 175   | EXECUTION                       | PASS                | E6: seletor fechado nas três larguras; aberto no desktop acima dos passos/sem clipping observado; E5 regressão.                                 |
| 176   | HISTORY                         | PASS                | E6 histórico com tabs, retorno compacto e bloco único de versão testada; E5 regressões.                                                         |
| 177   | EXECUTION DETAIL                | PASS                | E6 histórico com tabs, retorno compacto e bloco único de versão testada; E5 regressões.                                                         |
| 178   | LIGHT                           | PASS                | E6: smoke das superfícies nas larguras exatas 1440/768/390 em Light/Dark; alcance/estados delimitados na matriz.                                |
| 179   | DARK                            | PASS                | E6: smoke das superfícies nas larguras exatas 1440/768/390 em Light/Dark; alcance/estados delimitados na matriz.                                |
| 180   | NÃO APROVAR SOMENTE UM TEMA     | PASS                | E6 — resultados restritos ao tema e largura efetivamente observados; sem transferir PASS.                                                       |
| 181   | DESKTOP                         | PASS                | E6: smoke das superfícies nas larguras exatas 1440/768/390 em Light/Dark; alcance/estados delimitados na matriz.                                |
| 182   | TABLET                          | PASS                | E6: smoke das superfícies nas larguras exatas 1440/768/390 em Light/Dark; alcance/estados delimitados na matriz.                                |
| 183   | MOBILE                          | PASS                | E6: smoke das superfícies nas larguras exatas 1440/768/390 em Light/Dark; alcance/estados delimitados na matriz.                                |
| 184   | OPTIONAL                        | NOT APPLICABLE      | Viewport 1280 opcional não executado.                                                                                                           |
| 185   | TOUCH                           | ENVIRONMENT BLOCKED | EB-TOUCH — sem dispositivo touch físico; mouse/emulação não equivalem a touch.                                                                  |
| 186   | KEYBOARD                        | ENVIRONMENT BLOCKED | EB-UI — sequência completa de teclado, foco, dimensões 44×44 e combobox não homologada; E5 técnico PASS.                                        |
| 187   | FOCUS                           | PASS                | E5: foco, trap, Escape, draft e retorno; E6: viewer retorna ao Histórico e cancelamento restaura Details; manual parcial.                       |
| 188   | STATUS                          | PASS                | E5 + E6: PASS/Ativo e demais status têm rótulos/ícones, não dependem apenas da cor.                                                             |
| 189   | 44X44                           | ENVIRONMENT BLOCKED | EB-UI — sequência completa de teclado, foco, dimensões 44×44 e combobox não homologada; E5 técnico PASS.                                        |
| 190   | COMBOBOX                        | PASS                | E6: Down/Up/Enter selecionam commit importado; Escape fecha lista; E5 seletores.                                                                |
| 191   | LIST                            | PASS                | E7 requests HTTP reais observados + E5 lifecycle: lista/summary agregados; conteúdo buscado por viewer, sem pré-carga dos dez anexos.           |
| 192   | SUMMARY                         | PASS                | E7 requests HTTP reais observados + E5 lifecycle: lista/summary agregados; conteúdo buscado por viewer, sem pré-carga dos dez anexos.           |
| 193   | TESTED REFERENCE                | PASS                | E5 latest-wins/debounce dos seletores; E3 related candidates com fallback importado.                                                            |
| 194   | NO REQUEST STORM                | PASS                | E7 requests HTTP reais observados + E5 lifecycle: lista/summary agregados; conteúdo buscado por viewer, sem pré-carga dos dez anexos.           |
| 195   | EVIDENCE                        | PASS                | E7 requests HTTP reais observados + E5 lifecycle: lista/summary agregados; conteúdo buscado por viewer, sem pré-carga dos dez anexos.           |
| 196   | FRONTEND FOCUSED                | PASS                | E5: inicial 129 PASS/1 FAIL (OBS-01); uma execução diagnóstica serial, sem mudança, 130 PASS.                                                   |
| 197   | FRONTEND FULL                   | PASS                | E8 — gates frontend atuais; contagens e logs na tabela de gates.                                                                                |
| 198   | FRONTEND COVERAGE               | PASS                | E8 — gates frontend atuais; contagens e logs na tabela de gates.                                                                                |
| 199   | LINT                            | PASS                | E8 — gates frontend atuais; contagens e logs na tabela de gates.                                                                                |
| 200   | FORMAT                          | PASS                | E8 — gates frontend atuais; contagens e logs na tabela de gates.                                                                                |
| 201   | BUILD                           | PASS                | E8 — gates frontend atuais; contagens e logs na tabela de gates.                                                                                |
| 202   | BACKEND FOCUSED                 | FAIL                | QA-S107-001 — padrão: 114 PASS/6 FAIL; storage isolado explícito: 120 PASS.                                                                     |
| 203   | BACKEND UNIT                    | PASS                | E8 — 634 PASS, 56 arquivos; unidade sem acesso ao DB real.                                                                                      |
| 204   | BACKEND INTEGRATION             | FAIL                | QA-S107-001 — rodada inicial interrompida após mesmas falhas; storage isolado: 434 PASS/5 skips.                                                |
| 205   | BACKEND COVERAGE                | PASS                | E8 — cinco coverage consecutivos com storage isolado: 1068 PASS/5 skips cada.                                                                   |
| 206   | REPEATABILITY                   | PASS                | E8 — cinco coverage consecutivos com storage isolado: 1068 PASS/5 skips cada.                                                                   |
| 207   | SKIPS                           | PASS                | E8 — cinco skips canônicos anteriores ao S1-07 em e6-backfill/e11-legacy-responsibility; nenhum skip S1-07.                                     |
| 208   | ARCHITECTURE                    | PASS                | E8 — architecture/secrets/Prisma/supply-chain atuais PASS; zero novas exceções.                                                                 |
| 209   | SECRETS                         | PASS                | E8 — architecture/secrets/Prisma/supply-chain atuais PASS; zero novas exceções.                                                                 |
| 210   | PRISMA                          | PASS                | E8 — architecture/secrets/Prisma/supply-chain atuais PASS; zero novas exceções.                                                                 |
| 211   | SUPPLY CHAIN                    | PASS                | E8 — architecture/secrets/Prisma/supply-chain atuais PASS; zero novas exceções.                                                                 |
| 212   | NPM AUDIT POLICY                | PASS                | E8 — architecture/secrets/Prisma/supply-chain atuais PASS; zero novas exceções.                                                                 |
| 213   | API CONTRACT                    | PASS                | E1 × E3/E4 — contratos atuais de API/authz coerentes nos cenários exercitados.                                                                  |
| 214   | AUTHORIZATION MATRIX            | PASS                | E1 × E3/E4 — contratos atuais de API/authz coerentes nos cenários exercitados.                                                                  |
| 215   | RF MATRIX                       | PASS                | RF42 permanece IMPLEMENTADO LOCALMENTE com homologação/CI pendentes; não promovido a VALIDATED LOCALLY nem fechado.                             |
| 216   | RF43 / RF44 / RF62              | PASS                | E1 RF matrix: RF43/RF62 PARCIAL; RF44 NÃO IMPLEMENTADO; S1-09 pendente.                                                                         |
| 217   | PROTOTYPE                       | PASS                | E5 final-ux: varredura dos runtimes frontend/backend e feature retirada; zero prototype runtime.                                                |
| 218   | BLOCKING                        | PASS                | Classificação aplicada neste relatório: um IMPORTANT reproduzido; nenhum BLOCKING demonstrado.                                                  |
| 219   | IMPORTANT                       | PASS                | Classificação aplicada neste relatório: um IMPORTANT reproduzido; nenhum BLOCKING demonstrado.                                                  |
| 220   | SUGGESTION                      | PASS                | Classificação aplicada neste relatório: um IMPORTANT reproduzido; nenhum BLOCKING demonstrado.                                                  |
| 221   | CLASSIFICAÇÃO                   | PASS                | Classificação aplicada neste relatório: um IMPORTANT reproduzido; nenhum BLOCKING demonstrado.                                                  |
| 222   | FAIL FORMAT                     | PASS                | Classificação aplicada neste relatório: um IMPORTANT reproduzido; nenhum BLOCKING demonstrado.                                                  |
| 223   | NÃO DAR PASS SEM EVIDÊNCIA      | PASS                | Classificação aplicada neste relatório: um IMPORTANT reproduzido; nenhum BLOCKING demonstrado.                                                  |
| 224   | CRIAR                           | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 225   | NÃO ALTERAR RELATÓRIOS ANTIGOS  | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 226   | HEADER                          | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 227   | EXECUTIVE SUMMARY               | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 228   | SCOPE MATRIX                    | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 229   | EVIDENCE VIEWER MATRIX          | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 230   | AUTH MATRIX                     | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 231   | VERSION MATRIX                  | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 232   | RACE MATRIX                     | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 233   | VISUAL MATRIX                   | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 234   | TEST COUNTS                     | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 235   | COVERAGE RUNS                   | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 236   | GATES                           | PASS                | Relatório atual, matrizes, logs e inventário de 246 regras; arquivos anteriores preservados.                                                    |
| 237   | FINAL PASS                      | FAIL                | QA-S107-001 impede encerramento; gates padrão não verdes apesar do ambiente isolado PASS.                                                       |
| 238   | ENVIRONMENT BLOCKED             | PASS                | MySQL/touch/acessibilidade pendentes separados de findings; nenhum bug visual inferido de captura nativa fora de sincronia.                     |
| 239   | FINAL FAIL                      | PASS                | FINAL FAIL pelo finding IMPORTANT QA-S107-001; não por estética opcional.                                                                       |
| 240   | ENCERRAMENTO                    | NOT APPLICABLE      | Ramo condicional FINAL PASS não aplicável; S1-08 não autorizado por esta QA.                                                                    |
| 241   | NÃO COMMITAR                    | PASS                | Sem correções/commit/push; prompt cirúrgico e decisão final; preservação final registrada.                                                      |
| 242   | PRÓXIMO PASSO                   | NOT APPLICABLE      | Ramo condicional FINAL PASS não aplicável; S1-08 não autorizado por esta QA.                                                                    |
| 243   | NÃO CORRIGIR                    | PASS                | Sem correções/commit/push; prompt cirúrgico e decisão final; preservação final registrada.                                                      |
| 244   | PRÓXIMO PASSO                   | PASS                | Sem correções/commit/push; prompt cirúrgico e decisão final; preservação final registrada.                                                      |
| 245   | FINAL                           | PASS                | Sem correções/commit/push; prompt cirúrgico e decisão final; preservação final registrada.                                                      |
| 246   | DECISÃO FINAL OBRIGATÓRIA       | PASS                | Sem correções/commit/push; prompt cirúrgico e decisão final; preservação final registrada.                                                      |

## Cleanup e Git final

Os servidores auxiliares 3002/5174 foram encerrados; a ausência de listeners foi
conferida. A aba de QA do Chrome foi fechada, retornando a uma nova guia. A opção
“Mostrar recursos para desenvolvedores da web” do Safari foi restaurada para o
valor original **0**, confirmado pela árvore acessível. O controle do Safari
voltou a dar timeout ao fechar preferências/aba; o fechamento da aba auxiliar não
pôde ser confirmado. Não se encerrou o Safari nem se alteraram outras abas.

O schema exclusivo `traceflow_s107_final_13582d6_test` foi removido após validar
marcador de propriedade, hostname local, nome exato, cinco usuários exclusivamente
artificiais e dois projetos da QA. Sua ausência foi confirmada no catálogo do
MySQL. Contagens preservadas antes do cleanup: **35 casos (31 operacionais),
39 versões, 43 eventos de histórico, 10 execuções, 30 resultados de passos e
12 evidências**. Não foi removido banco de desenvolvimento, staging ou produção.
Evidências: `database-final-counts.json` e `cleanup-result.json`.

Arquivos artificiais, logs e quarentena próprios permanecem apenas no diretório
temporário indicado para auditoria. Não há usuários/projetos/sessões da QA em banco
real. As duas evidências preexistentes de desenvolvimento permanecem preservadas.

A comparação final confirmou **893 arquivos rastreados sem alteração de hash**;
branch e HEAD idênticos ao baseline. `git diff --check` passou. Somente dois
arquivos novos de QA aparecem no working tree:

```text
?? docs/qa/S1_07_FINAL_INTEGRATED_QA.md
?? docs/qa/S1_07_TARGETED_CORRECTIONS_PROMPT.md
```

**NO COMMIT · NO PUSH · NO MERGE · NO REBASE · NO RESET.**
A QA não implementou o prompt de correção. Próximo trabalho limitado ao finding
reproduzido; S1-08/S1-09 não foram iniciados.

## Decisão final

FINAL FAIL — CORRECTIONS REQUIRED

Next allowed scope:
S1-07 targeted corrections only
