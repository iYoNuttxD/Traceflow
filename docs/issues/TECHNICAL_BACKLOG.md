# Pendências técnicas posteriores à E15

Este backlog substitui TODOs soltos. Não representa implementação iniciada nem issue remota criada; a equipe deve transferir cada item para seu sistema oficial quando priorizado.

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| E15-F01 | Decidir exclusão de projeto e substituir o `501` | retenção, cascatas, auditoria, recovery | ALTA | decisão de produto/jurídica, ADR, backup e migration/testes |
| E15-F02 | Retirar join por `accessCode` e POST legado de membro | convite/enumeração/compatibilidade | ALTA | consumidores migrados para invitation token e zero dados exclusivos |
| E15-F03 | Concluir mapeamento manual dos 8 responsáveis antigos | RF51/histórico | MÉDIA | operador fornece `selectedUserId` com membership ativa; nunca inferir nome |
| E15-F04 | Contract de `ProjectMember` e snapshots de movimento | identidade e retenção | MÉDIA | zero referência necessária, evidência de autoria preservada e migration protegida |
| E15-F05 | Contract dos aliases GitHub em Project | RF01/RF02/RF21/RF22 | MÉDIA | backfill de `githubRepository*`, frontend/API migrados e compatibilidade definida |
| E15-F06 | Adotar GitHub App/secret manager | blast radius, rotação e quota | ALTA | decisão operacional, consentimento, modelo e ADR |
| E15-F07 | Store distribuído para rate limit e lock de sync | produção horizontal/disponibilidade | MÉDIA | arquitetura de implantação e datastore aprovados |
| E15-F08 | Automatizar backup, restore e retenção de logs | continuidade/LGPD | ALTA | infraestrutura, criptografia, owner e prazos aprovados |
| E15-F09 | SBOM, provenance, action por SHA e gate de licenças | supply chain | MÉDIA | ferramenta/política aprovadas sem duplicar E14 |
| E15-F10 | Testes E2E reais de navegador | login, projetos e jornadas críticas | MÉDIA | ambiente isolado, fixtures não runtime e gate de CI definido |
| E15-F11 | Validação jurídica final de LGPD | base legal, controlador, DPO, fornecedores e transferência | ALTA | responsáveis jurídicos/operacionais definidos |
| E15-F12 | Observabilidade, alertas e SLOs | incidentes e disponibilidade | MÉDIA | plataforma de logs/métricas e política de acesso/retenção |
| E15-F13 | Funcionalidades oficiais ainda fora do produto | RF13, RF15–RF18, RF29–RF37, RF39–RF40, RF42–RF46, RF54–RF64 | PRODUTO | priorização funcional e incrementos próprios; não são cleanup E15 |

## Pendências abertas pelo S1-04 / RF10

| ID | Pendência | Requisito/impacto | Prioridade | Critério para iniciar |
|---|---|---|---|---|
| S104-F01 | `TaskMovement.sprintId` legado permanece órfão | coluna existe desde `20260607030000_add_task_movements_for_kanban`, sem FK e sem popular; o RF10 criou o model `Sprint` mas **não** a tocou | MÉDIA | decidir entre criar FK e backfill, ou remover a coluna; exige análise de impacto no Kanban, migration segura e testes de regressão em `formatMovement` |
| S104-F02 | Adotar testes E2E de navegador | o DoD comum do roadmap (§4) e a seção 15.2 da arquitetura pedem E2E; o repositório não tem infraestrutura e o RF10 foi entregue **sem** E2E, apoiado na cobertura de API | MÉDIA | decisão transversal com ADR próprio; escolher ferramenta (dependência nova), ambiente isolado e gate de CI. Consolida com E15-F10 |
| S104-F03 | Reavaliar paginação de coleções de projeto | `tasks`, `requirements` e agora `sprints`/`milestones` retornam `{total, itens}` sem paginar, divergindo da seção 12.1 da arquitetura; o RF10 seguiu o código por precedência documental | BAIXA | decidir em conjunto para os três recursos, nunca isoladamente; exige contrato novo, migração de consumidores e testes |
| ~~S104-F04~~ | ~~Entregar o RF35~~ | **ENCERRADO.** `GET /sprints/:id/progress` entrega planejado, concluído, percentual, instante de corte e mudança de escopo. Cartão S1-04 fechado | — | — |
| S104-F05 | Uniformizar o 404 de recurso alheio e de recurso inexistente | recurso endereçado por ID responde `RESOURCE_NOT_FOUND` quando pertence a projeto alheio (barrado no middleware) e `SPRINT_NOT_FOUND`/`TASK_NOT_FOUND` quando não existe (o middleware deixa passar em `project-authorization.middleware.js:14`). O par de códigos permite confirmar a existência de um ID fora do alcance do ator. Vale para `/sprints/:id`, `/milestones/:id`, `/tasks/:id` e `/requirements/:id` — é anterior ao RF35 | BAIXA | decisão transversal: muda contrato público documentado e testado de vários módulos. Fixado hoje por teste em `schedule-contracts.test.js` para que qualquer mudança seja deliberada |
| S104-F06 | Mover `buildMetric` para `shared/` | o RF35 consome a fórmula canônica via `traceability/index.js`, criando dependência `sprints → traceability` só por causa de um utilitário de 8 linhas que não é de rastreabilidade | BAIXA | mexe em módulo fora do escopo; fazer junto de outra alteração em traceability, com atualização de todos os consumidores |

