# TRACEFLOW S1-08 — FRONTEND INTEGRATION REPORT

Date: 2026-09-08  
Branch: `daniel-dev`  
HEAD: `bd1d098477bb7d162000515de8334840cf17547d`  
Node: `22.23.2`  
Browser: Google Chrome, sessão real local, controle nativo e DevTools responsive.

**Resultado: implementação integrada e gates automatizados aprovados; homologação
visual completa ainda pendente. Não é um PASS global da entrega.**

Atualização após autorização para criar dados: o bloqueio por ausência de
cenários foi removido. Foram persistidos requisitos, marcos, sprints, tarefas,
casos, execuções e defeitos nos quatro estados. Inventário e smoke adicionais em
[Ciclo de dados para homologação](S1_08_QA_DATA_CYCLE.md). As classificações de
ausência de dados abaixo registram a primeira rodada, anterior a essa criação.

## A — Baseline

Checkout `/Users/daniel/Coding/Traceflow`, working tree inicialmente limpa,
915 arquivos rastreados com hashes capturados antes das alterações. O backend
S1-08 já estava no HEAD acima. Não havia alterações prévias para sobrescrever.

## B — Defects Screen

Rota `/projects/:projectId/defects`, aba entre Casos de teste e Repositório.
Resumo de cinco indicadores e oito filtros usam o backend. O painel inicia
fechado. SearchCombobox abre por intenção explícita; busca textual tem debounce.
Paginação de 20 itens acumula sem duplicar IDs. Cards usam primitives de Sprints/
TestCases, status recebido, detecção resumida e contagem do ciclo atual. Enter e
Espaço abrem detalhes; ações do rodapé não propagam a abertura do card.

## C — Defect Create

O mesmo DefectForm atende a aba e o passo FAIL de ExecutionDetails. O endpoint
`detection-candidates` fornece falhas comprovadas. Uma única falha é selecionada
automaticamente; múltiplas exigem escolha. Sugestões de requisito e tarefas vêm
da versão executada e permanecem editáveis. Trocar a fonte exige confirmação
explícita e preserva os demais campos. Defeitos já registrados têm links; outro
defeito na mesma falha é permitido. Título, descrição, severidade explícita,
responsável ativo e requisito OU tarefa são validados.

## D — Details

DefectDetails organiza descrição, informações, motivo do status recebido,
detecção histórica, evidências, rastreabilidade, ciclos de correção, validação e
histórico. Os vínculos abrem o caso, execução, tarefa ou requisito real. O
preview de evidência e as subvisões reutilizam o dialog corrente. ExecutionDetails
mantém seu conteúdo carregado ao abrir DefectFlow; o retorno restaura foco e scroll.
Recibos de múltiplas criações/edições/exclusões são aplicados à execução preservada.

## E — Correction Tasks

CorrectionManager compõe TaskForm e usa o endpoint atômico de criação + vínculo.
O requisito singular do defeito é o default editável. O vínculo exclui origem e
correções já presentes no ciclo atual; tarefa concluída é aceita. O formulário
não altera status de tarefa. Ciclos anteriores permanecem visíveis no histórico.

## F — Kanban

Uma correção tem link DEF; múltiplas têm uma lista expansível. A renderização
usa `correctionDefectCount/correctionDefects` do DTO. Tarefas normais ou apenas
ORIGIN não recebem badge. Não foram alterados DnD nem as três colunas existentes.
Defeito excluído é identificado como histórico, sem link para um recurso removido.

## G — Task Details

Contexto de correção entre informações e rastreabilidade, com navegação para o
defeito. O bloco depende dos metadados reais do DTO. Não são fabricados severidade,
ciclo ou artefatos ausentes nesse contrato.

## H — Retest

Reutiliza TestExecutionWizard, lê o mesmo TestCase na versão atual e consulta
referências com `retestDefectId`. Multipart inclui explicitamente
`retest: {defectId, correctionCycle, expectedRevision}`. PASS, FAIL e BLOCKED são
registrados pelo endpoint existente e reconciliados com o defeito. Execução
normal não inclui esse contexto. Conflito ou resposta incerta preserva o wizard;
um lock impede envio duplicado e fechamento durante persistência. Uma leitura
anterior à revisão esperada após reteste não reabilita ações. Falha de refresh
é separada de sucesso da persistência, com ação de atualização.

## I — TestCase invariant

Criação/edição exigem requisito OU tarefa, com primeiro campo inválido focado.
A mensagem `TEST_CASE_TRACEABILITY_REQUIRED` é traduzida para esse vínculo.
Casos legados órfãos continuam legíveis, mas mostram aviso e precisam de vínculo
para salvar. O indicador existente de casos sem rastreabilidade foi preservado.

## J — Contextual TestCase creation

Task → TestCase reutiliza o formulário no mesmo dialog, com a Task e seu único
requisito preselecionados. Requirement → TestCase preseleciona somente o requisito.
As seleções podem ser alteradas/removidas, mantendo a invariante antes de salvar.
VIEWER não recebe as ações; a autorização continua no backend.

## K — Frozen History

Snapshot correction metadata available: **NO**.  
Current Defect queried from frozen views: **NO**.

**FROZEN CORRECTION CONTEXT CONTRACT GAP:** o snapshot existente não contém os
metadados necessários. Contexto/badge são omitidos em tarefas congeladas. Não
houve tentativa de reconstruir o passado usando o defeito atual, nem migração
ou alteração de snapshot nesta entrega.

## L — Async

Leituras usam AbortSignal, geração de contexto e invalidação por recurso/projeto.
Busca anterior não substitui a atual. Recibos confirmados invalidam GETs pendentes;
exclusões mantêm tombstones e detalhes rejeitam revisão inferior ao recibo.
Falha de reconciliação é um aviso separado. O draft permanece nos erros de escrita.
Os testes cobrem troca de filtro, unmount, exclusão seguida de leitura antiga,
conflito, busy, recibos acumulados e reteste seguido de GET antigo.

## M — Tests

- Novos focados: **44 testes** em `frontend/test/defects`, quatro arquivos de teste.
- Repetibilidade: **10/10 rodadas**, 44 testes por rodada, sem retry de falhas.
- Frontend completo com cobertura: **943 PASS**, 79 arquivos; nenhum skip novo.
- Cobertura: statements **80,19%**, branches **74,86%**, functions **75,20%**,
  lines **82,36%**; todos os thresholds configurados foram satisfeitos.
- Backend afetado + unitários: **744 PASS**, 62 arquivos. Dois testes novos
  verificam as projeções de card e a lista de defeitos ativos no passo executado.

As primeiras execuções localizaram expectativas antigas de navegação/invariante,
um problema de nome acessível quando o formulário exibia erro e expectativas de
teste incompatíveis com os chips canônicos. Foram corrigidos antes dos resultados
acima. Uma chamada S1-07 com cwd da raiz falhou no teste que usa caminhos relativos;
a suíte completa foi executada no cwd correto `frontend`.

Banco exclusivo: `traceflow_s108fe_57cd09c8fd_test`, separado do desenvolvimento,
criado e migrado com a cadeia existente, depois removido e verificado ausente.
MySQL local **9.7.1**; esta execução não equivale ao CI MySQL 8.4.8.

Logs e comprovantes locais: `/private/tmp/traceflow-s108-frontend/`:
`frontend-coverage-final.log`, `final-critical-runs.json`, `final-critical-*.log`,
`backend-tests.log`, `database-cleanup.json`, `preservation.json` e logs dos gates.
São evidências temporárias locais, não artefatos publicados de CI.

## N — Visual Validation

Sessão real no projeto local 2: catálogo de defeitos vazio e busca de candidatos
sem passos FAIL disponíveis. O catálogo canônico de TestCases mostrou um caso e
última execução aprovada. Não foram criados defeitos artificiais nos dados reais
nem substituída a API por fixtures de runtime para declarar homologação.

Legenda: **P** = smoke parcial realmente renderizado, sem aprovação de todos os
estados; **B** = ENVIRONMENT BLOCKED por ausência de registros/candidatos;
**NR** = NOT REVIEWED nessa combinação. Capturas foram inspecionadas na sessão;
não há um pacote de screenshots versionado nesta entrega.

| Surface | Light 1440 | Dark 1440 | Light 768 | Dark 768 | Light 390 | Dark 390 |
|---|---|---|---|---|---|---|
| Defects Main | P: vazio | P: vazio | P: vazio | P: vazio | P: vazio | P: vazio |
| Filters | P: aberto | P: aberto | NR | NR | NR | P: aberto |
| Defect Card | B | B | B | B | B | B |
| Create Defect | B | B | B | B | B | B |
| Defect Details | B | B | B | B | B | B |
| Correction Manager | B | B | B | B | B | B |
| Retest | B | B | B | B | B | B |
| History | B | B | B | B | B | B |
| Kanban Correction Task | B | B | B | B | B | B |
| Task Details Correction | B | B | B | B | B | B |
| Task → TestCase | NR | NR | NR | NR | NR | NR |

O seletor vazio de criação foi renderizado no desktop nativo Dark, com registro
desabilitado e retorno da busca explicando a necessidade de falha anterior.
A comparação com TestCases Main e Task Details foi renderizada em Light 1280.
Task → TestCase também foi renderizado nessa largura: mesmo dialog, TASK-2 e
REQ-1 selecionados, sem persistir dados. A entrada passou a focar o título; o
retorno tem foco no botão de criação contextual. Resumo, navegação,
primitives e composição geral são compartilhados; não há evidência visual de
paridade dos detalhes/correções sem dados. A matriz não é promovida a PASS.

## O — Console

Foi observado `ERR_CONNECTION_REFUSED` em `/api/auth/me` durante um reinício do
servidor local. Após o servidor voltar, “Tentar novamente” restaurou a sessão;
GETs de membros e defeitos responderam 200. Não foi tratado como falha de domínio.
Após a recuperação não foram observadas exceções React, warnings de renderização
ou unhandled rejections nas superfícies percorridas. A mensagem informativa do
React DevTools permaneceu. A cobertura de console das superfícies sem dados é B.

Ao abrir filtros, o Chrome indicou três Issues de melhorias. A inspeção do código
identificou os três controles nativos de filtro sem id/name; foram adicionados
identificadores sem alterar seu contrato. O painel Issues foi aberto e classificou os avisos como “A form field element
should have an id or name attribute”, sem page errors ou breaking changes. Na
superfície canônica de tarefa, dois apontamentos dessa família permaneceram;
a atribuição de cada nó e a revalidação completa ficam pendentes. A tentativa
de acessar o comando do DevTools por clipboard também produziu o aviso nativo
de proteção contra colagem no console; nenhum código foi executado no console.
Não se declara ausência global de Issues ou warnings do navegador.

## P — Gates

| Gate | Resultado |
|---|---|
| focused | PASS — 44 |
| focused repeatability | PASS — 10/10 |
| frontend full | PASS — 943 |
| frontend coverage | PASS — quatro thresholds |
| frontend lint | PASS |
| frontend format | PASS |
| frontend build | PASS |
| backend affected tests + unit | PASS — 744 |
| backend lint / format | PASS |
| architecture / security:secrets | PASS |
| git diff --check | PASS |
| matriz visual completa | ENVIRONMENT BLOCKED / NOT REVIEWED conforme N |
| CI remoto | NÃO EXECUTADO; nenhuma publicação autorizada |

## Q — Backend impact

Schema: **UNCHANGED**. Migration: **UNCHANGED**. Defect domain: **UNCHANGED**.
Authorization: **UNCHANGED**.

Somente três arquivos de produção backend foram estendidos:

1. `defects/repositories/defect.repository.js`: leitura de identidade da detecção
   e vínculos CORRECTION para contagem do ciclo atual na lista.
2. `defects/defect.presenter.js`: `correctionTaskCount` e `detectionSummary`
   coerentes entre lista, detalhe e recibos; remoção das relações internas do card.
3. `testCases/repositories/test-execution.repository.js`: passos incluem
   `detectedDefects` ativos com id, título, severidade e status.

Nenhum endpoint ou fluxo de escrita novo. Extensões documentadas em API_CONTRACTS.

## R — RF

RF45: backend + interface integrados, homologação completa pendente.  
RF46: histórico/ciclos navegáveis, não declarado RF completo.  
RF63: relações navegáveis e herança histórica, S1-09 não entregue.  
RF64: correção/reteste integrados, gap frozen e homologação pendentes.

Os quatro permanecem **PARCIAIS** em RF_TECHNICAL_MATRIX; não houve promoção
indevida a rastreabilidade consolidada.

## S — Git final

HEAD e branch preservados. Alterações estão no working tree para revisão.
`git diff --check` sem erros. Hashes de schema/migrations/domain/auth preservados.
O comprovante `preservation.json` relaciona os arquivos rastreados alterados.
Novos arquivos concentram-se em `frontend/src/features/defects`, componentes
contextuais/TaskCorrection, página, testes e este relatório.

## T — Git operations

Não executados commit, push, merge, rebase, reset, force-push, clean ou stash.
Não iniciada S1-09. Próximo gate: homologação visual completa com dataset local
exclusivo que contenha detecção FAIL, correções, ciclos e retestes persistidos.
