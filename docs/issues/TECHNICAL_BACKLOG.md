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
| S104-F02 | Adotar testes E2E de navegador | o DoD comum do roadmap (§4) e a seção 15.2 da arquitetura pedem E2E proporcionais ao risco; o repositório não tem infraestrutura. As jornadas críticas do S1-04 (sprints sequenciais, inclusão pós-início, carry-over, encerramento imutável, marco vinculado, papel VIEWER) estão cobertas por teste de API e de interface com API mockada, mas **não** ponta a ponta num navegador | **ALTA** | decisão transversal com ADR próprio; escolher ferramenta (dependência nova), ambiente isolado e gate de CI. Consolida com E15-F10. **Enquanto estiver aberta, o S1-04 não pode ser declarado plenamente homologado** |
| S104-F03 | Reavaliar paginação de coleções de projeto | `tasks`, `requirements` e agora `sprints`/`milestones` retornam `{total, itens}` sem paginar, divergindo da seção 12.1 da arquitetura; o RF10 seguiu o código por precedência documental | BAIXA | decidir em conjunto para os três recursos, nunca isoladamente; exige contrato novo, migração de consumidores e testes |
| ~~S104-F04~~ | ~~Entregar o RF35~~ | **ENCERRADO.** `GET /sprints/:id/progress` entrega planejado, concluído, percentual, instante de corte e mudança de escopo | — | — |
| ~~S104-F05~~ | ~~Uniformizar o 404 de recurso alheio e de recurso inexistente~~ | **ENCERRADO** pelo ADR-010 D16. Middleware e service constroem o 404 pela mesma fábrica (`shared/errors/resource-not-found.js`), e a indistinguibilidade é testada nos cinco recursos endereçados por ID | — | — |
| S104-F06 | Mover `buildMetric` para `shared/` | o RF35 consome a fórmula canônica via `traceability/index.js`, criando dependência `sprints → traceability` só por causa de um utilitário de 8 linhas que não é de rastreabilidade | BAIXA | mexe em módulo fora do escopo; fazer junto de outra alteração em traceability, com atualização de todos os consumidores |
| S104-F07 | Definir retenção do snapshot de participação | `SprintTask.taskTitleSnapshot` sobrevive à exclusão da tarefa (ADR-010 D09). É dado de projeto, não pessoal, mas hoje a retenção é indefinida por omissão — o inverso do que a seção de minimização pede | MÉDIA | decidir prazo e política junto da retenção geral; exige varredura/expurgo e teste de que o expurgo não quebra o RF35 de sprints ainda relevantes |
| S104-F08 | Reavaliar a dualidade `Task.sprintId` × `SprintTask` | o ponteiro é derivado da participação e mantido na mesma transação (ADR-010 D01). A coerência depende de disciplina de escrita, hoje protegida por teste de invariante | BAIXA | só se o invariante mostrar deriva na prática, ou se o MySQL passar a oferecer índice único parcial |

