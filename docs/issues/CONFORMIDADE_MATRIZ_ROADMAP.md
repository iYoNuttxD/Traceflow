# Matriz de conformidade — `TRACEFLOW_ROADMAP_INCREMENTAL.md` (anexo)

Parte C da campanha v2 de erros e inconsistências (Fase 3, 14/10/2026), sobre o código do commit
`301998e`. O texto que vale é o do anexo (blob `53f4500`); a cópia do repositório entra pelas notas de
estado e pelas caixas marcadas. Os achados (CF-nn) e as reproduções estão em
`docs/issues/CONFORMIDADE_RELATORIO.md`; as hipóteses H-nn são da Parte D (seção 7 do relatório).

**Vereditos:**
- `EVIDENCIADO`: um teste automatizado exercita o comportamento. Os testes rodaram verdes no
  `7952b01`, depois da junção com a `main`.
- `SÓ DOCUMENTADO`: só um documento afirma.
- `PARCIAL`: parte do critério tem prova e parte não.
- `AUSENTE`: nada encontrado, ou o código contradiz o critério.
- `NÃO INICIADO`: cartão sem código nem alegação de entrega.

"Pelo navegador" e "ponta a ponta" ficam `PARCIAL` quando a prova é só API e jsdom, porque o
repositório não tem E2E de navegador (CF-37).

## Resumo

| Bloco | EVIDENCIADO | PARCIAL | AUSENTE | SÓ DOCUMENTADO | NÃO INICIADO | Total |
|---|---:|---:|---:|---:|---:|---:|
| Critérios de aceite, S1-01 a S2-05 | 54 | 25 | 1 | 0 | 0 | 80 |
| Critérios de aceite, S2-06 a S2-10 | 0 | 0 | 0 | 0 | 30 | 30 |
| Critérios de aceite, S3-01 a S3-05 | 0 | 0 | 0 | 0 | 31 | 31 |
| DoD comum (14 cartões × 10 itens) | 39 | 76 | 3 | 22 | 0 | 140 |

- Critérios dos cartões iniciados com prova completa: 54 de 80 (67,5%).
- Nenhum cartão do S1-01 ao S2-05 cumpre o DoD inteiro: todos ficam `PARCIAL` em ponta a ponta e em
  testes, por falta de E2E.
- Caixas `[x]` da cópia: 54. Delas, 37 têm evidência, 14 têm evidência parcial, 1 não tem e 2 são
  contraditas pelo código (seção 4).
- Marcos: nem a Sprint 1 nem a Sprint 2 podem ser declaradas concluídas (seção 3).

## 1. Critérios de aceite

Caminhos de teste relativos a `backend/test/` ou `frontend/test/`, conforme o prefixo.

### S1-01 — cadastro, login e ciclo de sessão

Cópia: "IMPLEMENTAÇÃO TÉCNICA CONCLUÍDA" (L85); 5 `[x]` e 1 `[ ]` (homologação com SMTP e GitHub).

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S101-1 | cadastro, login e logout pelo navegador | PARCIAL | API: `api/auth-authorization.test.js:57`, `:67`, `:238`; jsdom com API simulada: `auth/AuthContext.test.jsx:179`, `pages/AuthForms.test.jsx:135` | nenhum teste integra navegador, SPA e API (CF-37) |
| RM-S101-2 | rota original preservada depois do login | EVIDENCIADO | `auth/ProtectedRoute.test.jsx:59`, `:64`; `pages/AuthForms.test.jsx:214`; login GitHub: `api/github-auth-l1-1.test.js:112-120` | login local só em jsdom |
| RM-S101-3 | inativo, credencial inválida e sessão expirada com tratamento seguro | PARCIAL | inativo: `api/auth-authorization.test.js:202`, `api/lr1-auth-identity-hardening.test.js:71`; credencial inválida: `api/auth-authorization.test.js:202`; sessão expirada só no frontend: `auth/AuthContext.test.jsx:166` | a expiração no backend (`backend/src/modules/auth/auth.service.js:156`) não tem teste; o frontend trata `SESSION_EXPIRED` e `SESSION_INVALID`, que o backend nunca emite (CF-50); sem expiração por inatividade (CF-04) |
| RM-S101-4 | manter sessão ativa implementado ou retirado | EVIDENCIADO | `api/auth-authorization.test.js:106` (prazo maior só com `rememberMe`); `pages/AuthForms.test.jsx:81` | prazos sem justificativa documentada (V7.1.1) |
| RM-S101-5 | sem sessão e entre projetos bloqueados no backend | PARCIAL | sem sessão: `conformance/asvs-http.test.js:56`, `api/auth-authorization.test.js:971`; entre projetos com ID plano: `api/lr1-authorization-hardening.test.js:86`, `:241` | o ID codificado no caminho fura o bloqueio entre projetos (H09) |
| RM-S101-6 | múltiplas abas, submissão duplicada e revogação testadas | EVIDENCIADO | abas: `api/auth-authorization.test.js:245`, `auth/AuthContext.test.jsx:251`, `:267`; duplicada: `pages/AuthForms.test.jsx:267`, `api/lr1-auth-identity-hardening.test.js:262`; revogação: `api/auth-authorization.test.js:238`, `:272`, `api/settings-l2.test.js:435` | abas simuladas por `StorageEvent`; novo login não encerra o cookie anterior (CF-02) |

### S1-02 — recuperação e alteração de senha

Cópia: "IMPLEMENTAÇÃO TÉCNICA CONCLUÍDA; HOMOLOGAÇÃO SMTP PENDENTE" (L113); 5 `[x]` e 1 `[ ]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S102-1 | token de uso único; inválido, expirado ou reutilizado falham | EVIDENCIADO | `api/auth-authorization.test.js:884`; `api/auth-token-concurrency.test.js:86`, `:102`, `:159-162` | token já vencido na chegada (`auth.service.js:196`) sem teste próprio |
| RM-S102-2 | resposta da solicitação sem enumeração | PARCIAL | mesma mensagem para e-mail existente e inexistente: `api/auth-authorization.test.js:884`; `pages/AuthForms.test.jsx:156` | o status não é comparado; o e-mail existente grava token e envia mensagem, o inexistente volta antes (`auth.service.js:182-191`): tempo medido na H14 |
| RM-S102-3 | troca de senha revoga sessões conforme a política | PARCIAL | configurações: `api/settings-l2.test.js:201`; redefinição revoga todas: `api/auth-token-concurrency.test.js:86` | `POST /api/auth/change-password` revoga também a sessão atual, contra o ADR-002:22, e não tem teste de revogação (H16) |
| RM-S102-4 | e-mail real em homologação; capturadores só em testes | AUSENTE | adapter testado sem rede: `unit/e6-continuation.test.js:39`, `unit/nodemailer-real-smoke.test.js:27` | sem homologação com SMTP real; o capturador é o padrão fora de produção, inclusive em desenvolvimento (CF-44) |
| RM-S102-5 | nenhum token, senha ou cookie em log ou interface | PARCIAL | redaction: `unit/shared-infrastructure.test.js:233`; cookie só no `Set-Cookie`: `conformance/asvs-sessao-senha.test.js:56` | o token de redefinição vai na URL (CF-06) |

### S1-03 — membros, convites e perfis

Cópia: "IMPLEMENTAÇÃO TÉCNICA CONCLUÍDA; HOMOLOGAÇÃO EXTERNA PENDENTE" (L143); 5 `[x]` e 1 `[ ]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S103-1 | convite aceito ou recusado; expiração, revogação, duplicidade e reutilização | EVIDENCIADO | `api/auth-authorization.test.js:366`, `:508`, `:577`, `:607`, `:640`; `api/lr1-auth-identity-hardening.test.js:364` | revogação pela rota testada só para projeto alheio |
| RM-S103-2 | cadastrados e não cadastrados com fluxo coerente | EVIDENCIADO | `api/auth-authorization.test.js:366` (convite antes do cadastro); `api/project-access-l5-1.test.js:266`; retorno ao convite: `pages/AuthForms.test.jsx:239` | nenhum teste encadeia link, cadastro, verificação e aceite |
| RM-S103-3 | equipe e perfis visíveis só a membros autorizados | PARCIAL | `api/auth-authorization.test.js:409` (e-mail completo só para OWNER), `:348`; `api/projects-without-github.test.js:253` | com ID codificado, um não membro lê a lista de convites (H09) |
| RM-S103-4 | alterações sem permissão bloqueadas no backend | PARCIAL | `api/lr1-authorization-hardening.test.js:86`, `:241`; `api/auth-authorization.test.js:409` | com ID codificado, um não membro remove e reativa membro e revoga convite (H09) |
| RM-S103-5 | último OWNER protegido | EVIDENCIADO | `api/auth-authorization.test.js:468`, `:752` | rebaixamento não concorrente do único OWNER sem teste |

### S1-04 — sprints, cronograma e marcos

Cópia: "concluído em implementação, aberto em homologação" (L192-210); 5 `[x]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S104-1 | sprint com projeto, nome, objetivo, início, fim e status | EVIDENCIADO | `api/rf10-rf35-bateria.test.js:79`; `api/schedule-contracts.test.js:126` | — |
| RM-S104-2 | tarefa só em sprint do mesmo projeto | EVIDENCIADO | `api/schedule-contracts.test.js:644`; `api/rf08-rf10-rf35-caixa-preta.test.js:531` | regra só no serviço, sem restrição no banco |
| RM-S104-3 | cronograma com tarefas, sprints, prazos e marcos | EVIDENCIADO | `api/schedule-contracts.test.js:916`; `features/ScheduleScreen.test.jsx:419`, `:493` | — |
| RM-S104-4 | evolução com planejado, concluído, percentual e corte | EVIDENCIADO | `api/schedule-contracts.test.js:991`, `:1083`; `unit/sprint.progress.calculator.test.js:181`, `:224` | a frase do corte na tela não tem teste |
| RM-S104-5 | tarefa incluída ou retirada depois do planejamento identificável | EVIDENCIADO | `api/schedule-contracts.test.js:991`; `api/rf08-rf10-rf35-caixa-preta.test.js:614`, `:637`; `integration/planning-history.test.js:139` | — |
| RM-S104-6 | permissões, fórmulas, fusos e limites de data testados | EVIDENCIADO | permissões: `api/schedule-contracts.test.js:1176`, `:1201`; fórmulas: `unit/sprint.progress.calculator.test.js:81`; fusos: `api/schedule-contracts.test.js:356`, `:372`; limites: `api/rf08-rf10-rf35-caixa-preta.test.js:396`, `:420`, `:431` | — |

### S1-05 — comentários e histórico nas tarefas

Cópia: sem nota de estado; 5 `[x]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S105-1 | comentário de tarefa e projeto válidos, com o autor da sessão | EVIDENCIADO | `api/task-comments-s1-05.test.js:61`, `:355` | — |
| RM-S105-2 | conteúdo vazio recusado e limites aplicados | EVIDENCIADO | `api/task-comments-s1-05.test.js:61` (vazio, 2001 e 2000 caracteres), `:115` (`limit` e cursor) | — |
| RM-S105-3 | histórico com autor, data, ordem estável e indicação de edição | EVIDENCIADO | `api/task-comments-s1-05.test.js:115` (65 comentários com o mesmo `createdAt`), `:229` (`editedAt`); `components/TaskComments.test.jsx:268` | o nome do autor e a data na tela não têm asserção |
| RM-S105-4 | paginação sem perda nem duplicação | EVIDENCIADO | `api/task-comments-s1-05.test.js:115`; `features/useTaskComments.test.jsx:150` | inserção entre páginas sem teste |
| RM-S105-5 | regra de edição e preservação histórica documentadas | PARCIAL | `docs/api/API_CONTRACTS.md:361`, `:363`; `docs/qa/PLANNING_BUSINESS_RULES.md` (BR-COMMENTS-005) | a edição sobrescreve o texto, e nenhum documento diz se o anterior se preserva; o comentário da migration diz que a listagem mostra só ativos (CF-50) |
| RM-S105-6 | acesso entre projetos e ações sem permissão bloqueados | PARCIAL | `api/task-comments-s1-05.test.js:191`, `:229`, `:259`, `:355`; `api/project-events-sse.test.js:218` | com ID codificado, um não membro lê os comentários (H09); edição e exclusão resistem |

### S1-06 — prioridade, estimativa e esforço

Cópia: sem nota de estado; 5 `[x]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S106-1 | prioridade igual em lista, detalhes e Kanban, sem depender só de cor | PARCIAL | rótulo de texto único (`frontend/src/features/tasks/components/kanban-display.js:26-31`); `components/FrozenTaskDetails.test.jsx:153`; `pages/KanbanPage.test.jsx:404` | nenhum teste compara a mesma tarefa nas três telas; os valores de reserva divergem entre elas |
| RM-S106-2 | unidade de esforço única em criação, edição e consulta | PARCIAL | horas no contrato (`docs/api/API_CONTRACTS.md:387`), no formulário (`components/TaskForm.test.jsx:89`) e no rastreador (`components/TaskEffortTracker.test.jsx:143`) | sprints, marcos, cronograma e Kanban mostram a mesma soma de horas como "pts" e "pontos" (CF-41) |
| RM-S106-3 | negativos e inválidos recusados | EVIDENCIADO | `api/task-time-entries-s1-06.test.js:166`, `:298`; `api/mvp-contracts.test.js:1443` | — |
| RM-S106-4 | diferença absoluta e percentual com estimativa zero e ausente | EVIDENCIADO | `unit/task-time-entry.presenter.test.js:11`, `:87`; `api/task-time-entries-s1-06.test.js:201` | — |
| RM-S106-5 | comparação por tarefa e por sprint | EVIDENCIADO | por tarefa: `api/task-time-entries-s1-06.test.js:201`; por sprint: `unit/sprint.effort.calculator.test.js:5`, `api/indicators-p5.test.js:141` (I44) | a tela de sprints não mostra a comparação; ela aparece no painel de indicadores |
| RM-S106-6 | responsável não confundido com autor de comentário | PARCIAL | campos distintos no schema; destinatários distintos em `integration/s203-github-event-dispatch.test.js:232` | nenhum teste do S1-05 ou do S1-06 usa responsável diferente do autor |

### S1-07 — casos de teste

Cópia: "Estado atual (2026-09-12): CONCLUÍDO" (L287-293); 6 `[x]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S107-1 | título, descrição, pré-condições, passos, resultado esperado, status e responsável | EVIDENCIADO | `integration/test-cases-s1-07.test.js:182`; `api/test-cases-s1-07.test.js:76` | descrição opcional |
| RM-S107-2 | obrigatórios e transições validados no backend | EVIDENCIADO | `unit/test-cases/domain.test.js:42-43`, `:50`; `integration/test-cases-s1-07.test.js:349`, `:409` | o status só tem dois valores, sem transição proibida |
| RM-S107-3 | responsável do projeto e isolamento preservado | EVIDENCIADO | `integration/test-cases-s1-07.test.js:243`; `api/test-cases-s1-07.test.js:182`; resistiu ao ID codificado da H09 | responsável de outro projeto testado só com ID inexistente |
| RM-S107-4 | listas com paginação, filtros e estados de interface | PARCIAL | `integration/test-cases-s1-07.test.js:570`, `:624`; `testCases/TestCases.test.jsx:209`; `testCases/concurrency.test.jsx:38`, `:104` | erro, carregamento, vazio sem filtro e página de 403/404 da lista sem teste |
| RM-S107-5 | alterações relevantes auditáveis | EVIDENCIADO | `integration/test-cases-s1-07.test.js:182`, `:262`, `:300`, `:922` | só `TEST_CASE_CREATED` e `TEST_EXECUTION_RECORDED` têm asserção de auditoria |

### S1-08 — defeitos

Cópia: "Estado atual (2026-09-12): CONCLUÍDO" (L319-323); 5 `[x]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S108-1 | título, descrição, severidade, status, responsável e data de abertura | EVIDENCIADO | `backend/prisma/schema.prisma:1604-1632`; `api/defects-s1-08.test.js:82-83`; `integration/defects-s1-08.test.js:159` | nenhum teste confere a descrição gravada nem a data de abertura |
| RM-S108-2 | enums, obrigatórios e transições no backend | EVIDENCIADO | `unit/defects/domain.test.js:50-51`, `:61`, `:64`; `integration/defects-s1-08.test.js:359`, `:379`, `:403`, `:426` | — |
| RM-S108-3 | responsável membro elegível | PARCIAL | não membro recusado: `integration/defects-s1-08.test.js:642` | membro inativo, VIEWER e troca de responsável no `PUT` sem teste |
| RM-S108-4 | paginação e filtros úteis | EVIDENCIADO | `integration/defects-s1-08.test.js:438`; `defects/contracts.test.js:32` | — |
| RM-S108-5 | histórico preserva as alterações relevantes | PARCIAL | `api/defects-s1-08.test.js:82-94` (contagem); `integration/defects-s1-08.test.js:541` | nenhum teste confere o conteúdo `from`/`to` nem o autor das entradas; a auditoria descarta `from`/`to` |

### S1-09 — rastreabilidade entre requisitos, testes e defeitos

Cópia: "implementação concluída; … aguardando revalidação final" (L327-355); 5 `[x]` e 1 `[ ]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S109-1 | casos de teste ligados a tarefas e requisitos | EVIDENCIADO | `integration/test-cases-s1-07.test.js:182`, `:224`, `:333`; `integration/s109-traceability.test.js:274`, `:294` | — |
| RM-S109-2 | defeitos ligados a tarefas, requisitos e casos de teste | EVIDENCIADO | `integration/defects-s1-08.test.js:159`, `:211`, `:236`; `integration/s109-traceability.test.js:363` | ligação ao caso de teste só pelo passo de detecção |
| RM-S109-3 | consulta do caso de teste com tarefa e artefatos técnicos | PARCIAL | tarefas no detalhe; `tested-references` com PRs e commits das tarefas (`integration/test-cases-s1-07.test.js:473`) | o detalhe do caso não mostra PR, commit nem issue; `tested-references` exclui issues |
| RM-S109-4 | navegação direta e reversa consistente | EVIDENCIADO | `api/mvp-contracts.test.js:1263`; `integration/s109-traceability.test.js:689`, `:752`; `components/ExpandedTraceabilityFlow.test.jsx:6` | nenhum teste compara os dois sentidos para todo par |
| RM-S109-5 | vínculos entre projetos impossíveis | EVIDENCIADO | `integration/test-cases-s1-07.test.js:243`; `integration/defects-s1-08.test.js:211`, `:642`; H10 refutada (21 tentativas pelo corpo) | sem restrição de projeto no banco |
| RM-S109-6 | criação e remoção com origem, autor, data e evidência | PARCIAL | autor e data nas tabelas de histórico (`TestCaseVersion`, `DefectHistoryEntry`) | nenhuma relação guarda a origem; nenhum teste confere o autor de um vínculo (CF-30) |

### S2-01 — alertas de rastreabilidade

Cópia: "implementado localmente; aberto em homologação" (L422-438); 5 `[x]`.

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S201-1 | tarefa concluída sem commit gera alerta com tarefa, tipo e data | EVIDENCIADO | `integration/s201-traceability-alerts.test.js:102`; `api/s201-bateria.test.js:190` | só em projeto integrado ao GitHub (ADR-015) |
| RM-S201-2 | PR mesclada e issue fechada sem tarefa geram alertas | EVIDENCIADO | `api/s201-traceability-alerts-sync.test.js:173`; `integration/s201-traceability-alerts.test.js:227`; `integration/s201-bateria.test.js:257` | só no fim de uma sincronização; sem GitHub real |
| RM-S201-3 | tarefas sem commit, PR ou issue listáveis | EVIDENCIADO | `api/s201-traceability-alerts.test.js:433`; `api/s201-bateria.test.js:716` | a lista traz só tarefas sem nenhum dos três vínculos |
| RM-S201-4 | reprocessamento sem duplicar alertas ativos | EVIDENCIADO | `api/s201-traceability-alerts.test.js:319`; `integration/s201-traceability-alerts.test.js:373`, `:402`, `:432`; `integration/s201-bateria.test.js:404` | — |
| RM-S201-5 | correção resolve o alerta pela regra documentada | EVIDENCIADO | regra em `docs/data/TRACEABILITY_ALERTS.md:37-68`; `integration/s201-traceability-alerts.test.js:131` a `:468`, um teste por motivo | — |
| RM-S201-6 | consultas respeitam projeto, perfil e paginação | PARCIAL | `api/s201-traceability-alerts.test.js:84`, `:152`, `:173`; `api/s201-bateria.test.js:649` | com ID codificado, um não membro lê os alertas (H09) |

### S2-02 — notificações de status e vencimento

Cópia: sem nota de estado; as 5 caixas `[ ]` (K6).

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S202-1 | mudança de status notifica o responsável com o contexto | EVIDENCIADO | `integration/s202-notifications.test.js:82`; `api/s202-notifications.test.js:379`; `api/s202-bateria.test.js:113` | quem muda a própria tarefa não é avisado (ADR-016) |
| RM-S202-2 | tarefa vencida gera uma notificação sem repetição | EVIDENCIADO | `integration/s202-notifications.test.js:183`, `:211`, `:224`; `integration/s202-bateria.test.js:864` | o job roda só à mão, sem agendador (S2-09) |
| RM-S202-3 | leitura, não leitura e link persistem | EVIDENCIADO | `api/s202-notifications.test.js:159`, `:252`, `:288`; `pages/NotificationsPage.test.jsx:174`, `:217` | — |
| RM-S202-4 | alterações em massa e concorrentes idempotentes | EVIDENCIADO | `integration/s202-notifications.test.js:149`; `integration/s202-bateria.test.js:761`, `:778`, `:823`, `:840` | não há rota de mudança em massa |
| RM-S202-5 | fuso e corte documentados e testados | EVIDENCIADO | `docs/data/TASK_NOTIFICATIONS.md:39-81`; `unit/notification.policy.test.js:35`, `:42`, `:54`; `integration/s202-bateria.test.js:377`, `:395` | — |
| RM-S202-6 | só destinatários autorizados veem a notificação | EVIDENCIADO | `api/s202-notifications.test.js:317`, `:348`, `:369`; H11 refutada | — |

### S2-03 — notificações de issues e pull requests

Cópia: sem nota de estado; as 5 caixas `[ ]` (K6).

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S203-1 | abertura e fechamento de issue vinculada geram evento só depois de transição real | PARCIAL | fechamento e reabertura: `integration/s203-github-event-detection.test.js:200`, `:253`, `:358`; `integration/s203-bateria.test.js:319` | a abertura nunca gera evento; o ADR-018 D3 lê "aberta" como reabertura de issue já vinculada, sobre o mesmo texto do Quadro 3-57 do TCC (interpretação registrada, DL) |
| RM-S203-2 | fechamento e merge de PR vinculada geram evento | EVIDENCIADO | `integration/s203-github-event-detection.test.js:313`; `integration/s203-bateria.test.js:384`; `api/s203-bateria.test.js:432` | abertura de PR fora do RF61 (S203-F04) |
| RM-S203-3 | destinatários pela participação na tarefa e no projeto | EVIDENCIADO | `integration/s203-github-event-dispatch.test.js:232`; `api/s203-bateria.test.js:375` | quem fechou no GitHub também é avisado (S203-F02) |
| RM-S203-4 | sincronizações repetidas sem duplicar | EVIDENCIADO | `api/s203-github-event-notifications.test.js:324`; `integration/s203-github-event-detection.test.js:409`; `integration/s203-github-event-dispatch.test.js:395` | — |
| RM-S203-5 | falha temporária reprocessável sem perda | EVIDENCIADO | `integration/s203-github-event-dispatch.test.js:436`, `:458`, `:486`; `integration/s203-github-event-detection.test.js:388` | o job de recuperação não tem agendador |
| RM-S203-6 | tokens e respostas brutas do GitHub não expostos | EVIDENCIADO | `integration/s203-github-event-detection.test.js:464`; `api/s203-github-event-notifications.test.js:95`, `:261`; `integration/s203-github-event-dispatch.test.js:758` | — |

### S2-04 — indicadores de progresso e produtividade

Cópia: as 5 caixas `[ ]`; fases IND sem promoção automática a concluído (L931).

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S204-1 | progresso por concluídas sobre total, atualizado depois da mudança de status | EVIDENCIADO | `unit/indicators.test.js:12`; `api/indicators-p2.test.js:131` | o teste muda o status direto no banco, não pela rota do Kanban |
| RM-S204-2 | commits por usuário e período, só na `main` | EVIDENCIADO | `api/indicators-p2.test.js:162`, `:368`; `main` literal em `backend/src/modules/indicators/indicators.repository.js:42` | — |
| RM-S204-3 | tarefas concluídas por responsável e período | EVIDENCIADO | `api/indicators-p2.test.js:245`, `:287`; `integration/indicator-data-foundation.test.js:358` | o I03 não aparece em nenhuma visão do painel |
| RM-S204-4 | retrabalho por PR reaberta depois de fechada no período | EVIDENCIADO | `api/indicators-p3.test.js:126`, `:187`; `api/metric-semantics.test.js:254` | — |
| RM-S204-5 | métrica por responsável sem avaliação humana absoluta | PARCIAL | sem nota nem ranking: `api/indicators-p2.test.js:311`; `unit/project-health.test.js:213` | o I05 (RF36) não aparece na interface |
| RM-S204-6 | fórmulas com conjunto vazio, fuso e filtro de projeto | EVIDENCIADO | `unit/indicators.test.js:12`, `:25`; `api/indicators-p3.test.js:175`, `:285`; `api/indicators-p7.test.js:569` | — |

### S2-05 — qualidade, filtros e painel consolidado

Cópia: as 5 caixas `[ ]` e o "Marco incremental P9" com 3 `[x]` (L540-555).

| ID | Critério (anexo) | Veredito | Evidência | Lacuna |
|---|---|---|---|---|
| RM-S205-1 | taxa de retrabalho e taxa de aprovação em revisões | PARCIAL | retrabalho: `api/indicators-p3.test.js:126`; `api/indicators-p7.test.js:456` | não há fonte de dados de revisão de PR; a "aprovação" exibida é mescladas sobre fechadas (CF-49) |
| RM-S205-2 | painel integra planejamento, artefatos e indicadores sem dado simulado | EVIDENCIADO | `api/indicators-p7.test.js:133`, `:456`; `conformance/architecture-rules.test.js` (ARQ-02) | a interface só é testada com a API simulada |
| RM-S205-3 | filtro de período consistente nos indicadores compatíveis | PARCIAL | `api/indicators-p7.test.js:368`, `:667`, `:687`; `api/indicators-p9.test.js:315` | nenhum teste confere o filtro aplicado em todo indicador compatível; os avisos `PERIOD_FILTER_UNSAFE_NOT_APPLIED` e `SPRINT_FILTER_NOT_APPLIED_TO_VIEW` não têm teste (H28) |
| RM-S205-4 | cada número com fórmula, fonte e horário de atualização | PARCIAL | indicadores: `api/indicators-p7.test.js:535-541`; `features/DashboardPanel.test.jsx:1496` | a nota da saúde do projeto não mostra fórmula, fonte nem horário (CF-48) |
| RM-S205-5 | vazio, parcial e indisponível não aparecem como zero | EVIDENCIADO | `api/indicators-p7.test.js:90`, `:420`; `api/indicators-p3.test.js:268`; `features/DashboardPanel.test.jsx:1063` | — |
| RM-S205-6 | consultas respeitam projeto e têm desempenho aceitável | PARCIAL | isolamento: `api/indicators-p7.test.js:569`, `:616`; leituras limitadas: `api/indicators-p9.test.js:342` | sem meta nem teste de tempo; com ID codificado, um não membro lê o painel (H09) |

### S2-06 a S2-10 e Sprint 3

`NÃO INICIADO` nos 61 critérios (30 do S2-06 ao S2-10 e 31 do S3-01 ao S3-05). Verificado:

- **Sem código:** nenhuma biblioteca de PDF, módulo de relatórios, IaC, Dockerfile, workflow de
  deploy nem código de questionário ou TAM em `backend/src`, `frontend/src`, nos manifestos e na CI.
  O único "PDF" é a evidência de teste do S1-07, e a única exportação é a do titular (LGPD).
- **Sem alegação de entrega:** toda menção a esses cartões em `docs/`, README, CONTRIBUTING, roadmap
  e matriz RF é negativa ou futura. Exemplos: "Deploy/OCI não executado" no relatório P10, "Nenhum
  deploy foi realizado" no runbook da sincronização automática e "agendador real (OCI) pendente do
  S2-09" na matriz RF.
- **Dependências:** nenhum predecessor está concluído. No próprio anexo, o texto de dependências do
  S2-09 omite o S2-07, que o grafo da §15 exige.

## 2. DoD comum (§4 do anexo) por cartão

Legenda: `E` evidenciado, `D` só documentado, `P` parcial, `A` ausente.

| Cartão | 1 ponta a ponta | 2 regras e autorização no backend | 3 mesmo contrato | 4 migrations testadas | 5 estados de tela | 6 testes e E2E | 7 CI verde | 8 ASVS e LGPD | 9 docs e matriz | 10 sem mock, segredo ou regressão |
|---|---|---|---|---|---|---|---|---|---|---|
| S1-01 | P | P | P | E | E | P | D | P | E | E |
| S1-02 | P | E | D | E | P | P | D | P | P | E |
| S1-03 | P | P | D | E | P | P | D | P | E | E |
| S1-04 | P | P | P | E | E | P | D | E | P | E |
| S1-05 | P | P | D | E | P | P | D | P | P | E |
| S1-06 | P | P | P | E | P | P | D | P | P | E |
| S1-07 | P | E | D | E | P | P | D | E | P | E |
| S1-08 | P | E | D | E | P | P | D | P | P | E |
| S1-09 | P | P | D | E | P | P | D | P | P | E |
| S2-01 | P | P | D | P | P | P | A | E | P | E |
| S2-02 | P | E | D | P | P | P | A | E | P | E |
| S2-03 | P | E | D | P | P | P | A | E | P | E |
| S2-04 | P | P | D | E | P | P | D | P | P | E |
| S2-05 | P | P | D | E | P | P | D | P | P | E |

**Como cada item foi julgado:**
1. **Ponta a ponta:** sem E2E de navegador, nenhum cartão passa de `P` (CF-37).
2. **Regras e autorização no backend:** `P` onde o ID codificado da H09 abre rota do cartão. As
   rotas do S1-07 e do S1-08 resistiram, porque o serviço reconfere. S1-02 e as notificações do
   S2-02 e do S2-03 não dependem do escopo de projeto.
3. **Mesmo contrato:** `D` enquanto a H35 (Parte D) não cruza rotas, contrato e frontend. `P` onde
   já há divergência conhecida:
   - S1-01: códigos de sessão que o backend não emite;
   - S1-04: códigos do contrato diferentes dos devolvidos;
   - S1-06: horas exibidas como pontos.
4. **Migrations testadas:** a suíte aplica a cadeia inteira no banco de teste a cada execução
   (`backend/test/helpers/test-database.js:47`).
   - A cadeia num banco vazio e o drift rodam só na CI.
   - As migrations do S2-01 ao S2-03 nunca passaram pela CI, então ficam `P`.
5. **Estados de tela:** `E` só onde carregamento, vazio, erro e acesso negado têm teste na tela
   principal do cartão.
6. **Testes e E2E:** unitário, API e frontend existem e passam; falta o E2E.
7. **CI verde:** a CI roda em push na `main` e em PR (`.github/workflows/ci.yml:3-7`).
   - Os cartões que chegaram pela `main` têm execução registrada (CI #135 da PR #23 e CI #139 da
     PR #24), que não pôde ser lida pelo `gh` (⚑9).
   - O S2-01, o S2-02 e o S2-03 nunca passaram pela CI.
8. **ASVS e LGPD:** `E` onde há delta na `ASVS_BASELINE.md` e cobertura no inventário de dados
   pessoais. O modelo de ameaças não cita nenhum cartão (K21).
9. **Docs e matriz:** `P` onde algum documento do cartão contradiz o código ou outro documento
   (CF-40, CF-42, CF-47, CF-50).
10. **Sem mock, segredo ou regressão:** a ARQ-02 trava o mock. A varredura de segredos roda na
    Fase 5, e nenhum item aberto do backlog é regressão.

## 3. Marcos

| Marco | Condição do anexo | Situação |
|---|---|---|
| Sprint 1 (§7) | os 21 RFs homologados | AUSENTE: RF43–RF46 e RF62–RF64 `PARCIAL` na matriz RF, RF42 com homologação visual pendente, RF23–RF28 com SMTP e GitHub reais pendentes |
| Sprint 1 (§7) | migrações aplicam em banco limpo e atualizado | PARCIAL: banco atualizado a cada execução da suíte; banco limpo só na CI (CI #139 registrada, não lida) |
| Sprint 1 (§7) | fluxos críticos passam em E2E | AUSENTE (CF-37) |
| Sprint 1 (§7) | cadeia ampliada navegável nos dois sentidos | PARCIAL: RM-S109-4 evidenciado; RM-S109-3 parcial |
| Sprint 1 (§7) | documentação reflete o comportamento real | PARCIAL (CF-40, CF-42, CF-47, CF-50) |
| Sprint 2 (§10) | os 18 RFs homologados | AUSENTE: RF37 e RF57 não iniciados; os demais só locais |
| Sprint 2 (§10) | relatórios e PDFs reproduzíveis | NÃO INICIADO |
| Sprint 2 (§10) | alertas e indicadores com dados reais | PARCIAL: banco local e GitHub simulado; sem repositório real |
| Sprint 2 (§10) | implantação na nuvem por pipeline, com TLS, segredos, monitoramento e backup | NÃO INICIADO; nuvem trocada sem ADR (CF-45) |

Nenhum documento afirma que a Sprint 1 ou a Sprint 2 terminou. O relatório do S2-01 já registrava a
dependência "Sprint 1 concluída" como não satisfeita (S201-A08).

## 4. Caixas `[x]` da cópia do repositório

| Cartão | `[x]` | Com evidência | Parcial | Sem evidência | Contradita |
|---|---:|---:|---:|---:|---:|
| S1-01 | 5 | 4 | 0 | 1 | 0 |
| S1-02 | 5 | 3 | 2 | 0 | 0 |
| S1-03 | 5 | 2 | 2 | 0 | 1 |
| S1-04 | 5 | 5 | 0 | 0 | 0 |
| S1-05 | 5 | 5 | 0 | 0 | 0 |
| S1-06 | 5 | 1 | 3 | 0 | 1 |
| S1-07 | 6 | 5 | 1 | 0 | 0 |
| S1-08 | 5 | 2 | 3 | 0 | 0 |
| S1-09 | 5 | 3 | 2 | 0 | 0 |
| S2-01 | 5 | 5 | 0 | 0 | 0 |
| S2-05 (marco P9) | 3 | 2 | 1 | 0 | 0 |
| **Total** | **54** | **37** | **14** | **1** | **2** |

**Marcações que não se sustentam (CF-43):**

| Cartão | Caixa | Situação |
|---|---|---|
| S1-01 | registrar eventos de autenticação sem dados sensíveis | sem evidência: os eventos `AUTH_*` existem só no código (`backend/src/modules/auth/auth.controller.js:24-78`), sem teste |
| S1-02 | testar solicitação, link, troca, revogação e abuso | parcial: sem teste de 429 em `forgot-password` e `reset-password` |
| S1-02 | atualizar documentação operacional e matriz RF | parcial: sem runbook de SMTP; `backend/README.md` ainda cita `GITHUB_TOKEN` |
| S1-03 | aplicar autorização por projeto e perfil | contradita pela H09 |
| S1-03 | testar matriz permitir/negar e isolamento | parcial: sem negativa para convite, transferência e reativação na `HEAD` |
| S1-03 | atualizar documentação, auditoria e matriz RF | parcial: cinco ações de auditoria de membros e convites sem asserção |
| S1-06 | definir unidade e fórmula em decisão documentada | contradita: sem ADR, e as telas de sprint usam pontos (CF-41) |
| S1-06 | completar API, formulários e visualização | parcial: mesma causa |
| S1-06 | integrar Sprint, Task e RF51 | parcial: RF51 só em documento |
| S1-06 | testar casos extremos, acessibilidade e regressão | parcial: prioridade sem depender de cor, sem teste |
| S1-07 | implementar interface acessível e validar integração e responsividade | parcial: responsividade sem teste; inventário de UI "ENVIRONMENT BLOCKED" |
| S1-08 | implementar interface e estados | parcial: estados da tela sem teste |
| S1-08 | adicionar testes e auditoria | parcial: nenhum evento `DEFECT_*` com asserção |
| S1-08 | atualizar documentação e matriz RF | parcial: `docs/data/DEFECT_HISTORY.md:5-8` desatualizado |
| S1-09 | implementar vínculo, remoção e consultas reversas | parcial: o vínculo de correção não tem rota de remoção |
| S1-09 | testar integridade, autorização e regressão ponta a ponta | parcial: sem E2E |
| S2-05 | marco P9: gates locais e inspeção visual com API real | parcial: a inspeção visual existe só no relatório P9 |

As notas "CONCLUÍDO" do S1-07 e do S1-08 contradizem a própria evidência que citam (CF-42). As do
S2-02 e do S2-03 faltam, embora a implementação local exista (K6).
