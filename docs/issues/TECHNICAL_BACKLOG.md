# Pendências técnicas posteriores à LR.2

Este backlog substitui TODOs soltos. Não representa implementação iniciada nem issue remota criada; a equipe deve transferir cada item para seu sistema oficial quando priorizado.

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| E15-F01 | Exclusão recuperável implementada; ativação operacional pendente | carência de 30 dias, restore, purge, repo reservado e journal de storage implementados; scheduler e política de backup de produção ainda não comprovados | ALTA | [ADR-014](../architecture/ADR-014-EXCLUSAO-RECUPERAVEL-DE-PROJETOS.md), migration/testes e [runbook](../runbooks/PROJECT_DELETION_PURGE.md); configurar job externo monitorado e aprovar backup antes de marcar RESOLVIDO |
| E15-F02 | Decidir eventual retirada do ingresso por `accessCode` | capability adicional ao TCC | BAIXA | decisão de produto; hoje o fluxo é canônico, limitado a MEMBER/VIEWER e sem `ProjectMember` |
| E15-F06 | Adotar GitHub App/secret manager | blast radius, rotação e quota | RESOLVIDA NA L1 / PARCIAL OPERACIONAL | GitHub App por instalação implementada; secret manager e rotação gerenciada continuam dependentes do ambiente |
| E15-F07 | Store distribuído para rate limit e lock de sync | produção horizontal/disponibilidade | MÉDIA | arquitetura de implantação e datastore aprovados |
| E15-F08 | Automatizar backup, restore e retenção de logs | continuidade/LGPD | ALTA | infraestrutura, criptografia, owner e prazos aprovados |
| E15-F09 | SBOM, provenance, action por SHA e gate de licenças | supply chain | MÉDIA | ferramenta/política aprovadas sem duplicar E14 |
| E15-F10 | Testes E2E reais de navegador | login, projetos e jornadas críticas | MÉDIA | ambiente isolado, fixtures não runtime e gate de CI definido |
| E15-F11 | Validação jurídica final de LGPD | base legal, controlador, DPO, fornecedores e transferência | ALTA | responsáveis jurídicos/operacionais definidos |
| E15-F12 | Observabilidade, alertas e SLOs | incidentes e disponibilidade | MÉDIA | plataforma de logs/métricas e política de acesso/retenção |
| E15-F13 | Funcionalidades oficiais ainda fora do produto | RF15–RF18, RF29–RF34, RF36, RF37, RF42–RF46, RF54–RF57, RF62–RF64 (o RF35 saiu da lista: foi entregue no S1-04; RF13, RF39, RF40 e RF58 saíram com o S2-01; RF59 com o S2-02; RF60 e RF61 com o S2-03) | PRODUTO | priorização funcional e incrementos próprios; não são cleanup E15 |

## Pendências abertas pelo S1-04 / RF10

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| S104-F01 | `TaskMovement.sprintId` legado permanece sem FK e sem backfill | **PARCIALMENTE RESOLVIDO (ADR-011).** A coluna era filtro declarado em `taskHistoryQuerySchema` que nunca era gravado — filtrar o histórico por sprint não podia casar com nada. `taskMovementRepository.transitionStatus` passou a gravá-la com a sprint da tarefa no momento da movimentação, então o filtro vale para os registros novos. Continuam em aberto: a FK e o backfill dos registros antigos | BAIXA | carimbar o passado com o vínculo de hoje reescreveria histórico, então o backfill não é trivial; a FK exige decidir o que fazer com as linhas que ficarem nulas |
| S104-F02 | Adotar testes E2E de navegador | o DoD comum do roadmap (§4) e a seção 15.2 da arquitetura pedem E2E proporcionais ao risco; o repositório não tem infraestrutura. As jornadas críticas do S1-04 (sprints sequenciais, inclusão pós-início, carry-over, encerramento imutável, marco vinculado, papel VIEWER) estão cobertas por teste de API e de interface com API mockada, mas **não** ponta a ponta num navegador | **ALTA** | decisão transversal com ADR próprio; escolher ferramenta (dependência nova), ambiente isolado e gate de CI. Consolida com E15-F10. **Enquanto estiver aberta, o S1-04 não pode ser declarado plenamente homologado** |
| S104-F03 | Reavaliar paginação de coleções de projeto | `tasks`, `requirements` e agora `sprints`/`milestones` retornam `{total, itens}` sem paginar, divergindo da seção 12.1 da arquitetura; o RF10 seguiu o código por precedência documental | BAIXA | decidir em conjunto para os três recursos, nunca isoladamente; exige contrato novo, migração de consumidores e testes |
| ~~S104-F04~~ | ~~Entregar o RF35~~ | **ENCERRADO.** `GET /sprints/:id/progress` entrega planejado, concluído, percentual, instante de corte e mudança de escopo | — | — |
| ~~S104-F05~~ | ~~Uniformizar o 404 de recurso alheio e de recurso inexistente~~ | **ENCERRADO** pelo ADR-010 D16. Middleware e service constroem o 404 pela mesma fábrica (`shared/errors/resource-not-found.js`), e a indistinguibilidade é testada nos cinco recursos endereçados por ID | — | — |
| S104-F06 | Mover `buildMetric` para `shared/` | o RF35 consome a fórmula canônica via `traceability/index.js`, criando dependência `sprints → traceability` só por causa de um utilitário de 8 linhas que não é de rastreabilidade | BAIXA | mexe em módulo fora do escopo; fazer junto de outra alteração em traceability, com atualização de todos os consumidores |
| S104-F07 | Cobertura própria para o lock de projeto do caminho de escopo (D17) | a bateria de mutação RF10/RF35 (25/08/2026) removeu `lockProject` de `mutateScopeWithinSprintLock` e **nenhum teste ficou vermelho**: os locks finos de Sprint e Task serializam todos os cenários hoje exercitados, e o lock do projeto virou defesa em profundidade sem prova. Ou se constrói um teste de interleaving cross-recurso (replace × criação/edição de janela no mesmo projeto) que só o lock do projeto previne, ou se documenta no ADR-010 D17 que a camada é deliberadamente redundante | MÉDIA | identificar um interleaving concreto que os locks finos não serializem; se não existir, registrar a redundância no ADR e encerrar |
| S104-F11 | Definir retenção do snapshot de participação | `SprintTask.taskTitleSnapshot` sobrevive à exclusão da tarefa (ADR-010 D09). É dado de projeto, não pessoal, mas hoje a retenção é indefinida por omissão — o inverso do que a seção de minimização pede | MÉDIA | decidir prazo e política junto da retenção geral; exige varredura/expurgo e teste de que o expurgo não quebra o RF35 de sprints ainda relevantes |
| S104-F08 | Reavaliar a dualidade `Task.sprintId` × `SprintTask` | o ponteiro é derivado da participação e mantido na mesma transação (ADR-010 D01). A coerência depende de disciplina de escrita, hoje protegida por teste de invariante | BAIXA | só se o invariante mostrar deriva na prática, ou se o MySQL passar a oferecer índice único parcial |
| ~~S104-F09~~ | ~~Sanear marcos que o backfill deixou fora da janela da própria sprint~~ | **ENCERRADO pelo [ADR-011](../architecture/ADR-011-MILESTONE-SPRINT-INVERSION.md) D03.** O marco deixou de pertencer a uma sprint e passou a ter prazo próprio: não há mais janela em que ele devesse caber, e o estado que este item pedia sanear virou estado normal | — | — |
| S104-F10 | Deadlock entre a mutação de escopo da sprint e a exclusão de tarefa | Os dois caminhos tocam as mesmas linhas de `SprintTask` por **índices diferentes** — o cronograma entra por `[sprintId, removedAt]`, `deleteTask` por `[taskId, removedAt]` — e o InnoDB fecha ciclo de espera. Medido em `07663ce`, **antes** desta revisão: `P2034` em todas as execuções do par. Não há corrupção (a transição inteira sofre rollback), mas o cliente perdedor recebe `500` em vez de `409`/`503` | MÉDIA | alinhar os caminhos de acesso, ou serializar os dois pelo mesmo lock — a correção mora no módulo de tarefas, fora do escopo do S1-04. Reproduz com `Promise.allSettled([replaceTasks(sprint, [outra]), deleteTask(dentro)])` sobre uma sprint que contém `dentro`. Considerar junto o mapeamento de `P2034`/`P2024` para `409`/`503` no error handler, hoje inexistente |
| S104-F12 | Parâmetros `from`/`to` de `GET /projects/:id/schedule` ficaram sem consumidor na interface | o design de 30/08 removeu o card "Período exibido" do Cronograma — o recorte passou a ser o mês exibido, com navegação presa ao intervalo pintado. O contrato HTTP e a validação do backend permanecem intactos e testados | BAIXA | decidir entre re-expor o filtro em outra forma (atalho de intervalo, deep-link) ou declarar os parâmetros como contrato de API sem UI própria |
| S104-F13 | Mover sprints de marco pelo formulário dispara um `PUT /sprints/:id` por sprint | o formulário de Marcos (design de 30/08) move as sprints marcadas/desmarcadas em requisições sequenciais; falha no meio deixa parte movida (a tela avisa e ressincroniza, sem corromper nada). Um endpoint de lote tornaria a operação atômica | BAIXA | só se a movimentação em massa virar fluxo frequente; exige contrato novo com lock de projeto e testes de concorrência |
| S104-F15 | Código específico do lote acima de 100 ids não cobre a camada de validação de payload | achado CP-A1 da campanha de caixa preta (31/08/2026). **A parte da sprint foi encerrada em 01/09/2026:** `createSprintBodySchema` exigia `milestoneId` e recusava o payload antes de a regra rodar; com o campo aceitando ausente e `null`, a criação sem marco responde `400 SPRINT_MILESTONE_REQUIRED` nas duas formas. **Segue aberto:** substituição com payload acima de 100 ids responde `400 VALIDATION_ERROR`, e não o `SPRINT_TASK_LIMIT_REACHED` do contrato (que só aparece no excedente incremental). A recusa em si está correta | BAIXA | decidir: ou o contrato declara a camada de payload para o lote, ou o serviço emite o código específico também quando o schema recusa; atualizar contrato + teste juntos |
| S104-F16 | Flake no teste de corrida de movimentação concorrente | observado 1× em 31/08 (primeira rodada da suíte completa com a campanha de caixa preta): `'protege atualização concorrente do mesmo status com conflito e sem histórico duplicado'` falhou e passou nas duas rodadas seguintes (550/550). Corrida de dois `PATCH move` paralelos — sensível a timing | BAIXA | **provável encerramento em 01/09/2026:** o movimento passou a tomar o exclusivo do projeto na entrada (ADR-010 D19), o que serializa os dois `PATCH` e torna determinístico o 409 do perdedor. Confirmar em laço antes de fechar |
| S104-F17 | `TaskDetailsPanel` não usa a primitive canônica de dialog | o painel de detalhes da tarefa é legado anterior ao S1-04 e não tem focus trap, fechamento por Escape nem retorno de foco ao acionador. As telas novas usam a primitive compartilhada; esta é a última divergente | MÉDIA | converger para a primitive de dialog junto com um passe de acessibilidade no módulo de tarefas; não é regressão da PR #12 |
| S104-F18 | `SprintList` renderiza lista sem `key` única | React emite `Each child in a list should have a unique "key" prop` ao renderizar a lista de sprints, e o calendário do Cronograma duplica a chave `<data>-Fim — <sprint>` quando duas sprints terminam no mesmo dia. Preexistente; sem efeito observado nos testes | BAIXA | derivar a chave do `id` da sprint em vez do texto exibido; verificar os dois pontos no mesmo passe |
| ~~S104-F14~~ | ~~`PATCH /tasks/:id/move` não aplica a imutabilidade da sprint congelada~~ | **ENCERRADO em 31/08/2026** (`ad71a19`). A guarda proposta foi implementada em `task-kanban.service.moveTask`: sprint `CONCLUIDA`/`CANCELADA` recusa com `409 TASK_SPRINT_LOCKED` (código registrado em `ERROR_CODES`, regra reusada de `isTerminalSprintStatus`). Testes de API em `rf08-terceira-bateria.test.js` provam o 409 nos dois status, o `Task.status` intacto e nenhum movimento/histórico/auditoria registrados. O achado T-A1 permanece descrito no relatório da terceira bateria como registro | — | — |

| L1-F01 | Configurar e homologar SMTP real | entrega de verificação, recuperação e convite | ALTA | credenciais e ambiente de homologação aprovados; validar falha temporária/permanente sem expor dados |
| L1-F02 | Configurar GitHub App real e validar permissões/webhooks | RF02–RF06, RF21, RF50 | ALTA | App instalada com permissões mínimas, callback e webhook HTTPS; executar smoke test externo |
| L1-F03 | Testes E2E reais da jornada de identidade e instalação | RF23, RF27, RF28 e GitHub App | MÉDIA | ambiente isolado com SMTP/GitHub controlados e gate de CI definido |
| L1-F04 | MFA para perfis administrativos | ASVS/contas privilegiadas | MÉDIA | decisão de produto e modelo de recuperação aprovados |

## Pendências abertas pelo S2-01 (alertas de rastreabilidade)

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| S201-F01 | Notificar alertas a pessoas | o S2-01 entrega alertas do projeto, sem destinatário (ADR-015 D1); avisar responsáveis pertence à central de notificações | MÉDIA | S2-02/S2-03 entregues; decidir quem recebe cada tipo de alerta |
| S201-F02 | Alerta de PR e issue só nasce no fim do sync | webhooks não processam `pull_request`/`issues`, e não há sync automático; o atraso é igual ao intervalo entre syncs manuais | MÉDIA | decisão sobre sync por webhook ou agendado (S2-03 e OCI) |
| S201-F03 | Desfazer dispensa ou reabrir alerta | hoje a dispensa só se desfaz quando a condição cessa e volta; não existe ação para reverter uma dispensa equivocada | BAIXA | pedido de uso real; exige contrato, auditoria e regra para a chave ativa |
| S201-F04 | Persistir `state_reason` da issue | issue fechada como "not planned" também gera alerta; a dispensa cobre o caso | BAIXA | se o volume desses alertas incomodar; exige campo novo no sync e regra na política |
| S201-F05 | Contador de alertas fora de Rastreabilidade | o número de alertas abertos só aparece na sub-navegação de Rastreabilidade, não na navegação principal do projeto nem na aba Repositório | BAIXA | decisão de produto sobre a navegação canônica de 11 abas |
| S201-F06 | Timeouts de 5 s em `KanbanPage.test.jsx`, `TestCases.test.jsx` e `TraceabilityWorkspace.test.jsx` na suíte completa | na máquina de desenvolvimento (Windows), a suíte completa do frontend estoura 5 s em 6 a 8 testes dos dois primeiros arquivos, e em 12 testes dos três quando roda com cobertura; sozinhos, os três passam 115/115. Preexistente ao S2-01, que não toca essas telas, mas cresce com o número de arquivos de teste | MÉDIA | medir na CI; avaliar `testTimeout` maior para esses arquivos ou reduzir o custo de render dos testes integrados |
| S201-F13 | Texto de ajuda do filtro "Com evidência técnica" | no catálogo de requisitos (S1-09), o filtro não explica que issue não conta como evidência técnica, embora conte como vínculo técnico no RF58 (O-10 de `S2_01_RELATORIO_TESTES.md`) | BAIXA | próxima mudança na tela de requisitos |
| S201-F14 | `db:test:validate-empty` não roda no Windows | `scripts/validate-empty-migrations.js` chama `node_modules/.bin/prisma.cmd` com `spawnSync` sem `shell`, o que o Node 20.12+ recusa (`EINVAL`); a validação local falha com "Migration vazia falhou. undefined". A CI, em Linux, não é afetada | BAIXA | quem rodar a validação localmente no Windows; usar `shell: true` ou `npx` |

## Pendências abertas pelo S2-02 (notificações de tarefa)

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| S202-F01 | Canal de e-mail e push para notificações | o S2-02 entrega só a central na aplicação (ADR-016 D7); quem não abre o TraceFlow não vê o aviso | MÉDIA | SMTP real homologado (S1-02); decisão de frequência e de opt-in por canal |
| S202-F02 | Lembrete antes do vencimento ("prazo próximo") | o RF59 avisa só depois do corte; não há aviso preventivo | BAIXA | pedido de uso real; definir antecedência e fuso por usuário |
| S202-F03 | Vencimento de marcos e sprints | o job do S2-02 cobre só tarefas; marcos e sprints vencidos não notificam | BAIXA | decisão de quem recebe (gestor do projeto? membros da sprint?) |
| S202-F04 | Agregação e SSE por usuário | cada evento é uma notificação, e o contador é consultado a cada 60 s; não há resumo agrupado nem atualização em tempo real | BAIXA | volume real de notificações; ADR sobre SSE por usuário (o ADR-013 é por projeto) |
| S202-F05 | Indicador de cobertura de notificações no produto | a métrica oficial do RF30/RF59 é medida pelos testes M1/M2 e pela saída do job, sem tela (ADR-016 D16) | MÉDIA | S2-04/S2-05 (painel de indicadores) ou instrumento do S3-01 |
| S202-F06 | `__proto__` descartado em silêncio pelo Zod 4 em toda a API | `strictObject` não acusa uma chave própria `__proto__`; não há poluição, mas a tentativa não vira erro de validação nem chega ao log. O S2-02 recusa a chave nos seus corpos | MÉDIA | ajuste no helper `strictObject` compartilhado, com teste de regressão nas rotas existentes |
| S202-F07 | Fuso por usuário | o corte do vencimento usa um fuso único (`APP_TIMEZONE`), como a ADR-010 D15 já aceita para datas | BAIXA | preferência de fuso no perfil e decisão sobre o efeito na tela do Kanban |
| S202-F08 | Barra de abas internas com 1 px de rolagem vertical | anterior ao S2-02: em `internal-tabs.css`, o indicador da aba ativa (`::after`, `bottom: -1px`) passa 1 px da borda de um contêiner com `overflow: auto`, e aparece uma barra de rolagem vertical na barra de abas das Configurações (visto em `/settings/account` e `/settings/notifications`) | BAIXA | ajuste no CSS compartilhado das abas, conferindo as outras telas que o usam |
| S202-F14 | Medição do RF30/RF59 por eventos distintos | a definição com os oito itens da §10.5 entrou em `TASK_NOTIFICATIONS.md` (`e3da602`); falta o instrumento que conta pares (tarefa, data do prazo) e movimentos distintos num período, porque a saída do job é um retrato por execução e não se soma (S202-A06) | MÉDIA | antes do S3-01 (Capítulo 4), junto com o S202-F05 |
| S202-F19 | Ator homônimo no cartão de notificação | o cartão do RF30 mostra só o nome do ator; com duas contas de mesmo nome, não se sabe quem moveu (O-8 de `S2_02_RELATORIO_TESTES.md`). O DTO tem o id, a tela não | BAIXA | decisão sobre levar o nome de usuário no DTO (`actor.username`) e mostrá-lo no cartão |
| S202-F20 | Seletor de responsável com homônimos | fora do S2-02: o formulário de tarefa lista duas pessoas de mesmo nome sem nome de usuário nem e-mail (O-9) | BAIXA | próxima mudança no formulário de tarefa (S1) |
| S202-F27 | Índice para o filtro "Todas" | o keyset do "Todas" usa só o prefixo `recipientUserId` e ordena por *filesort*; com 10.000 notificações a página leva 98 ms, dentro do orçamento (O-R1) | BAIXA | página acima de 150 ms com volume real: índice `(recipientUserId, createdAt, id)` em migration nova |
| S202-F28 | Lista de membros com `user.isActive` legado | fora do S2-02: `/api/projects/:id/members` mostrou `user.isActive: true` para uma conta `DEACTIVATED`; o estado vigente é `User.accountStatus`, que a lista não traz (O-R4 de `S2_02_RELATORIO_RETESTE.md`) | BAIXA | próxima mudança na tela de membros: trazer `accountStatus` ou deixar de expor `isActive` |
| S202-F30 | Trabalho pesado em transação de 5 s | o `confirm` de sugestão de commit roda a reconciliação inteira, e a transição de sprint faz a captura do planejamento, ambos no prazo padrão de 5 s (inventário do S202-F29, linhas 34 e 68). Sob carga ou com o banco distante, podem passar do prazo; desde o ADR-020, falham limpas com 503 `OPERATION_TIMEOUT`, sem contaminar a conexão | BAIXA | medir sob carga; alinhar ao prazo de 15 s da `traceabilityTransaction` ou dividir o trabalho |
| S202-F31 | Arquivos dentro da transação da purga | `prepareStorageCleanup`, `stageStorageItem`, `restoreStorageItem` e `cleanupReadyStorageItem` movem ou apagam arquivos de evidência com o projeto travado (linhas 20 a 23) | BAIXA | preparar os arquivos fora da transação e registrar só o resultado |
| S202-F32 | Ordem de trava invertida na anonimização | `privacy.repository.js:44` atualiza tarefas, commits, PRs, issues e memberships de vários projetos sem travar o projeto antes, ao contrário do resto do sistema (projeto, depois tarefa); risco de deadlock com escritas concorrentes (linha 104) | BAIXA | travar os projetos afetados em ordem antes das atualizações, ou dividir por projeto |
| S202-F34 | Código morto encontrado no inventário | `task-link.repository.js:32` (`setSprint`) e `requirement-status.service.js:16` (`recalculateRequirementStatus`) não têm chamadores | BAIXA | remover, com os testes que os citam |
| S202-F35 | Transações `Serializable` diretas sem nova tentativa | as transações `Serializable` de configurações, autenticação pelo GitHub e privacidade chamam o `$transaction` direto, sem repetir o `P2034` como o `serializableTransaction` faz (linhas 83 a 104) | BAIXA | migrar para o `serializableTransaction` |
| S202-F36 | Reavaliar o Prisma 7 com `@prisma/adapter-mariadb` | o ADR-020 fixou o Prisma em 6.12.0: nenhuma versão 6.x muda o abandono da instrução no prazo, e a 7.10.0 tem o `prisma/orm#29762` aberto (instrução que chega depois do `ROLLBACK` do prazo é confirmada sozinha, reproduzido com MySQL 8 e `adapter-mariadb`). A migração muda o `P2010` (`meta.driverAdapterError` em vez de `meta.code`, usado por `isLockBusy` e `isLockWaitTimeout`), transforma o 1205 em `P2039` nas consultas de modelo, remove `datasourceUrl` e exige pinagem exata (a etiqueta `latest` do pacote `prisma` aponta para a 8.0.0-rc). Origem: Anexo C de `docs/issues/S202_F33_PROMPT_CORRECAO_CONEXAO_DESSINCRONIZADA.md` | BAIXA | correção do #29762 publicada; então medir o abandono no prazo com o adaptador e decidir em ADR próprio |

## Pendências abertas pelo S2-03 (notificações de issues e pull requests)

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| S203-F01 | Webhooks `issues` e `pull_request` da GitHub App | a transição só é vista na sincronização seguinte; mudanças intermediárias entre duas sincronizações se fundem (ADR-018 D1) | MÉDIA | assinatura dos eventos na App, tratamento de entrega repetida e fora de ordem e reconciliação com a sincronização |
| S203-F02 | Excluir o autor do fechamento ou do merge | quem fechou ou mesclou também recebe o aviso: a listagem do GitHub não traz `closed_by` nem `merged_by` (ADR-018 D6) | BAIXA | leitura individual do artefato transicionado e vínculo confiável com `GitHubIdentity` |
| S203-F03 | Vínculo automático de issue e PR por referência (UC11, A5) | só existe para commits (RF41); com ele, a criação de uma issue vinculada passaria a ser observável (ADR-018 D3) | MÉDIA | decisão de produto sobre a regra de referência e a confirmação humana |
| S203-F04 | Abertura e reabertura de PR | fora do RF61 (Quadro 3-58); a descrição do cartão as cita | BAIXA | decisão do grupo sobre o texto do RF61 |
| S203-F05 | E-mail, push e resumo agrupado | o canal é só a aplicação, como no S2-02 | BAIXA | SMTP homologado (S1-02) e preferência por canal |
| S203-F06 | Indicador de cobertura no produto | a métrica oficial é medida pelos testes M3 e M4 e pelo `outcome` dos eventos, sem tela | BAIXA | painel do S2-04 e do S2-05 |
| S203-F07 | Motivo do fechamento da issue | o GitHub distingue concluída e não planejada (`state_reason`), e o aviso não diz qual | BAIXA | mapear `state_reason` na sincronização |
| S203-F08 | Link direto para o artefato na Rastreabilidade | o cartão abre a tarefa e o GitHub; a Rastreabilidade não tem endereço próprio por artefato (RF53) | BAIXA | parâmetro de URL na tela de Rastreabilidade |
| S203-F22 | Custo da página de upsert da sincronização | a página de 100 itens faz cerca de 305 instruções (um upsert por item, anterior ao S2-03). Com latência até o banco de cerca de 15 ms ou mais, ela passa dos 5 s da transação, com ou sem transição (medição de 13/10/2026). Desde o ADR-020, a página falha limpa pelo prazo próprio (`GITHUB_SYNC_STORAGE_FAILED`, `causeCode: TRANSACTION_DEADLINE`), sem contaminar a conexão, mas continua sem caber no prazo | MÉDIA | desenho da nuvem (S2-08): banco perto da API, abaixo de cerca de 10 ms; ou upsert em lote por página |

## Fechada pela correção do S202-F33 (13/10/2026)

Origem: C2-04 de `docs/issues/S2_03_RELATORIO_TESTES.md` e o Anexo B de `docs/issues/S202_F33_PROMPT_CORRECAO_CONEXAO_DESSINCRONIZADA.md`; resultado em `docs/issues/S202_F33_RELATORIO.md`.

| ID | Pendência | Correção |
|---|---|---|
| S202-F33 | conexão do pool fora de sincronia depois de um `P2028` com instrução lenta em andamento: `P2025` falso e leitura vazia para quem vinha depois e, no segundo `P2028`, cliente envenenado com pânico do motor | `dffc2ab` ([ADR-020](../architecture/ADR-020-PRAZO-DAS-TRANSACOES.md), contrato, runbook, delta ASVS e S202-F36); `d08c0fc`: prazo próprio em toda transação interativa (`KILL QUERY` no prazo pedido, repetido enquanto o callback roda, Prisma com o prazo + 1 s, transação que nunca confirma depois do disparo); `a58a075`: 503 `OPERATION_TIMEOUT` com `Retry-After: 5`, `KILL` da conexão no `P2028` residual, sinal de pânico em `/health/live` e `/health/ready` e o prazo próprio como falha de gravação na sincronização |

## Fechada pela correção do S202-F29 (13/10/2026)

Origem: `docs/issues/S2_02_RELATORIO_RETESTE.md` (S202-R01) e `docs/issues/S2_03_RELATORIO_TESTES.md` (C2-04); enunciado em `docs/issues/S202_F29_PROMPT_CORRECAO_ESPERA_DE_TRAVA.md`; resultado em `docs/issues/S202_F29_RELATORIO.md`.

| ID | Pendência | Correção |
|---|---|---|
| S202-F29 | espera de trava maior que o prazo da transação em todas as transações interativas, com a conexão do pool dessincronizada depois do `P2028` e respostas erradas para outras pessoas | `f5e7c27` ([ADR-019](../architecture/ADR-019-ESPERA-DE-TRAVA.md), contrato, runbook e delta ASVS); `9dd8b6c`: `SET SESSION innodb_lock_wait_timeout` no começo de toda transação interativa do cliente compartilhado (2 s nas de 5 s, 5 s nas de 15 s) e regra de arquitetura contra `new PrismaClient(` fora de `src/database`; `375a0fd`: 409 `RESOURCE_BUSY` com `Retry-After: 2`, evento `database_lock_wait_timeout`, `causeCode` no log de todo erro do Prisma, 1205 como `GITHUB_SYNC_PROJECT_BUSY` e expiração no `GET` do estado sem derrubar a leitura. O `P2028` por trabalho lento segue no S202-F33 |

## Fechadas pelas correções do S2-03 (13/10/2026)

Origem: `docs/issues/S2_03_RELATORIO_TESTES.md`; enunciado em `docs/issues/S2_03_PROMPT_CORRECOES.md`.

| ID | Pendência | Correção |
|---|---|---|
| S203-F09 | página que estoura o tempo deixava a execução em `RUNNING` (S203-A01) | `b41727a`: escritas da sincronização com `FOR UPDATE NOWAIT` e nova tentativa até 5 s (`GITHUB_SYNC_PROJECT_BUSY`); falha gravada pelo pool e, depois de erro de conexão, por um cliente de recuperação; ganchos sempre |
| S203-F10 | evento de projeto excluído se perdia na restauração (S203-A02) | `bb09a9b`: despacho normal com a visibilidade do S2-02; `PROJECT_DELETED` deixou de existir |
| S203-F11 | custo da gravação da fila na página (S203-A03) | `1c9ff37`: eventos e retratos em lote; 100 transições custam o mesmo que 1 |
| S203-F12 | data da reabertura (S203-A04) | `be3cf2b` (aproximação declarada) e `e7fb492` ("reaberta no GitHub; última atualização em …") |
| S203-F13 | estoque de `FAILED` invisível (S203-A05) | `8e40f22`: `failedStock` em toda execução, com log em `warn` |
| S203-F14 | erro de banco com código do Prisma (S203-A06) | `5c53685`: `GITHUB_SYNC_STORAGE_FAILED` e mensagem própria; o código interno só no log |
| S203-F15 | nomes acessíveis repetidos (S203-A07) | `e7fb492`: contexto do evento no nome do cartão e do botão de leitura, em todos os tipos |
| S203-F16 | avisos de tarefa soterrados (S203-A08) | `5590547` (`group` na API) e `e7fb492` (grupo "Origem" na central) |
| S203-F17 | exportação sem revalidar a URL (S203-A09) | `532c466`: `safeGithubUrl` na exportação |
| S203-F18 | cliente desatualizado das preferências (S203-A10) | `be3cf2b` (data da mudança no contrato) e `532c466` (mensagem para recarregar a página) |
| S203-F19 | alerta de pendência na espera normal (S203-A11) | `8e40f22`: `dueAfter` e `oldestDueAgeSeconds` só com eventos vencidos |
| S203-F20 | reserva perdida sem log (S203-A12) | `8e40f22`: `github_event_notification_claim_lost` e `claimLost`; `attempts` documentado |
| S203-F21 | correções documentais do S2-03 (S203-A13) | `be3cf2b` (linha de base, "enviada corretamente", faixas do delta ASVS, aviso de privacidade), `1c9ff37` (custo medido) e `3051997`/`87ff81b` (log dos jobs em `stderr`) |
| S202-F17 | `PUT` de preferências com tipos novos | `532c466`: as quatro chaves continuam obrigatórias, e a chave ausente responde com a mensagem para recarregar; a mudança está datada no contrato (`be3cf2b`) |

## Fechadas pelas correções do reteste do S2-02 (11/10/2026)

Origem: `docs/issues/S2_02_RELATORIO_RETESTE.md`; enunciado em `docs/issues/S2_02_PROMPT_CORRECOES_RETESTE.md`.

| ID | Pendência | Correção |
|---|---|---|
| S202-F21 | o `PUT` de preferências esperando o bloqueio além do tempo da transação derrubava requisições de outras pessoas | `6c7365c`: `FOR UPDATE NOWAIT` com nova tentativa de 20 a 40 ms até 2 s; esgotado, 409 `NOTIFICATION_PREFERENCES_BUSY`. As outras transações seguem no S202-F29 |
| S202-F22 | M1 e M2 sem `INACTIVE_ACCOUNT` | `4219b19`: os dois cenários com os cinco motivos; resultado republicado na regra |
| S202-F23 | documentação depois do reteste | `901a9cf` (ADR-016 D7, D8, D10; regra, contrato e runbooks), `50d4905` (cursor só na forma canônica) e o commit de registro desta rodada (baseline ASVS) |
| S202-F24 | convenção de nome de migration | `901a9cf`: `docs/runbooks/DATABASE_MIGRATIONS.md` |
| S202-F25 | ponto do ☰ em alto contraste | `cadb897`: `forced-color-adjust: none` com `CanvasText` |
| S202-F26 | "Carregar mais" refazia a lista inteira | `0eba0e0`: cartão com `memo` e manipuladores estáveis |

## Fechadas pelas correções do S2-02 (10/10/2026)

Origem: `docs/issues/S2_02_RELATORIO_TESTES.md`; enunciado em `docs/issues/S2_02_PROMPT_CORRECOES.md`.

| ID | Pendência | Correção |
|---|---|---|
| S202-F09 | "Carregar mais" pulava não lidas depois de marcar como lidas | `52100ec` e `d9ea88a`: cursor estável na API (`cursor`, `nextCursor`) e na central |
| S202-F10 | auditoria das preferências incoerente sob `PUT` simultâneos | `da4df65`: `PUT` serializado por usuário (`lockUser`), gravando só os tipos que mudam |
| S202-F11 | religar a preferência do RF59 era retroativo | `3aab6cd`: `enabledAt` (migration `20261011010000_notification_preference_enabled_at`); vencimento com corte anterior não é notificado |
| S202-F12 | contas restritas continuavam recebendo | `2111706`: motivo `INACTIVE_ACCOUNT` no RF30 e no RF59 |
| S202-F13 | exportação omitia as notificações ocultas | `d20d90a`: `notifications.json` com todas as do titular e `visible` |
| S202-F15 | `--project-id` sem projeto terminava com 0 | `6fb4968`: aviso em `stderr` e código 2 |
| S202-F16 | `deadline` com hora mudava a data do prazo sem aviso | `e3da602`: regra documentada no contrato e em `TASK_NOTIFICATIONS.md`, com o exemplo |
| S202-F18 | corte um dia antes quando o dia seguinte não existe no fuso | `52076a4`: busca do primeiro instante do dia local que existe |

## Fechadas pelas correções do S2-01 (09/10/2026)

Origem: `docs/issues/S2_01_RELATORIO_TESTES.md`; enunciado em `docs/issues/S2_01_PROMPT_CORRECOES.md`.

| ID | Pendência | Correção |
|---|---|---|
| S201-F07 | título de PR ou issue acima de 191 caracteres derrubava o sync | `3f42f0e`: colunas do GitHub alargadas (títulos 256, branches 512, URLs 512, autor 255) em duas migrations; mapper corta por caractere e valida a URL |
| S201-F08 | conectar a integração não reconciliava os alertas | `be79ee1`: gatilho `GITHUB_INTEGRATION` depois da conexão, sem desfazê-la em caso de falha |
| S201-F09 | resumo de alertas sem estado de erro | `5ff2d8a`: `ErrorState` com nova tentativa no lugar da carga eterna |
| S201-F10 | justificativa medida em unidades UTF-16 | `058ada9`: servidor, formulário e contador contam caracteres Unicode; sem `maxLength` nativo |
| S201-F11 | falha da reconciliação só no log | `d6cfefe` e `5ff2d8a`: registro `TraceabilityAlertReconciliation` e aviso de alertas desatualizados |
| S201-F12 | ADR-015 e tabela de erros divergentes | `5a90459` e o commit de documentação das correções: ADR-015 revisada; tabela de erros completa no contrato |

## Fechadas pela LR.2

- E15-F03: a base auditada atual não contém Task com responsabilidade textual pendente;
- E15-F04: `ProjectMember` e `TaskMovement.projectMemberId` foram contraídos com guards;
- E15-F05: aliases GitHub foram reconciliados em `ProjectGitHubIntegration` e removidos;
- o POST legado de membro, que fazia parte de E15-F02, foi removido; `accessCode` foi
  reclassificado como capability canônica vigente.
