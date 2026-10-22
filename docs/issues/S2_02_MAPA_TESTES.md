# Mapa de testes — S2-02: notificações de tarefa (RF30, RF59)

Fase 1 da campanha de [S2_02_PROMPT_TESTES_NOTIFICACOES.md](S2_02_PROMPT_TESTES_NOTIFICACOES.md).
Liga cada critério, regra e requisito a um caso `NT-*` e a um teste. "Existente" cita o teste que já
prova o caso; "Fase" indica onde o teste novo entra:
- Fase 2: `backend/test/api/s202-bateria.test.js`;
- Fase 3: `backend/test/integration/s202-bateria.test.js`;
- Fase 4: `backend/test/unit/s202-bateria.test.js`;
- Fase 5: `frontend/test/pages/Notifications.bateria.test.jsx`;
- Fase 7: roteiro manual.

**Aval dos ⚑ em 10/10/2026 ("pode seguir"), com as recomendações:**
1. registrar sem corrigir;
2. E2E pelo roteiro manual, com o achado de conformidade;
3. segunda conta de teste criada pelo João;
4. agendador conferido por inspeção;
5. orçamento fixado em ≤ 1 s por 10.000 tarefas para o job e ≤ 300 ms para a lista com 1.000
   notificações;
6. consultas ao contador medidas em desenvolvimento.

## 1. Versões do cartão (seção 0.2 do prompt)

| Ponto | Classe | Decisão da campanha |
|---|---|---|
| C4 sem "em massa" no Kanban | DX (o quadro relaxa o roadmap, sem registro) | vale o texto mais exigente, "em massa e concorrentes" |
| Checklist 4: Azure (anexo) × OCI (repositório e Kanban) | DR (D-RM-01: troca sem ADR) | o job é portátil; o veredito do K4 sai do bloco R |
| Estado do cartão no repositório (`[ ]`) | DE | o roadmap só muda a pedido do João; não é defeito do S2-02 |

## 2. Critérios → casos → testes

| Critério | Casos | Existente | Novo |
|---|---|---|---|
| C1 | NT-S-01..12, NT-C-01..04 | N1–N4, N6 (integração); "mudança real de status chega só ao responsável" (API) | Fases 2 e 3 |
| C2 | NT-P-01..09, NT-J-01 | N7, N9, N10, N12 (integração); política (unidade) | Fases 3 e 4 |
| C3 | NT-L-06, NT-L-08, NT-U-05 | "marca como lida…", "o DTO traz só o necessário…" (API); central (frontend) | Fases 2 e 5 |
| C4 | NT-K-01..07, NT-J-01 | N5, N8 (integração) | Fase 3 |
| C5 | NT-P-01..04, NT-P-08, bloco O | política (16 testes de unidade); `TASK_NOTIFICATIONS.md` | Fases 3 e 4 |
| C6 | NT-Z-01..08 | 404 alheio, membership, projeto excluído, limitador (API) | Fase 2 |
| C7 | NT-M-01..04 | M1, M2 (integração) | Fase 3 |
| K1 | blocos S, F, O | — | Fases 2, 3 e 8 |
| K2 | NT-J-*, bloco A (§11.1) | validador de banco vazio (verificação de 09/10) | Fases 3 e 8 |
| K3 | blocos L, Z, U | API e frontend existentes | Fases 2 e 5 |
| K4 | NT-J-10, bloco R | — | Fase 8 (inspeção) |
| K5 | blocos P, K, Z | — | Fases 2 a 4 |

## 3. Casos por bloco

### Bloco C — documento oficial e UC07

| Caso | Existente | Novo |
|---|---|---|
| NT-C-01 | N4 (falha na notificação desfaz tudo) | Fase 3 (falha antes da notificação) |
| NT-C-02 | — | Fase 2 |
| NT-C-03 | — | Fase 2 |
| NT-C-04, NT-C-05 | — | Fase 8 (inspeção do ADR-016) |

### Bloco S — RF30

| Caso | Existente | Novo |
|---|---|---|
| NT-S-01 | N1, N2, N3, N13 (5 das 15 combinações) | Fase 3 (as 15) |
| NT-S-02 | API (só `/move`) | Fase 2 (`/status` e mesma coluna) |
| NT-S-03 | — | Fase 2 (`status` na criação e na edição) e Fase 3 (inspeção dos escritores) |
| NT-S-04 | N6 (A→B→A) | Fase 3 (A→B→C→A) |
| NT-S-05..NT-S-11 | — (S-11 parcial no DTO da API) | Fase 3 |
| NT-S-12 | N4 | Fase 3 (falha da auditoria, antes da notificação) |

### Bloco P — corte, fuso e janela

| Caso | Existente | Novo |
|---|---|---|
| NT-P-01 | política (3 fusos) | Fase 3 (7 fusos pelo job) e Fase 4 (365 dias × 7 fusos) |
| NT-P-02 | política (São Paulo 2018/2019, Lisboa 2026) | Fases 3 e 4 (Nova York e Lisboa pelo job) |
| NT-P-03 | — | Fase 3 (processos com `TZ` diferente) |
| NT-P-04 | política e env | Fase 3 (pelo job, ±1 ms) |
| NT-P-05 | — | Fase 3 |
| NT-P-06 | N10 | Fase 3 (adiar, antecipar, remover e restaurar) |
| NT-P-07 | N9 | Fase 3 (concluída antes e depois do corte) |
| NT-P-08 | — | Fase 3 |
| NT-P-09 | política (ordem parcial) | Fase 4 (tabela) e Fase 3 (pares pelo job) |

### Bloco J — job

| Caso | Existente | Novo |
|---|---|---|
| NT-J-01 | N7, dry-run (integração) | Fase 3 (contagem de linhas antes e depois) |
| NT-J-02 | script (unidade, parcial) | Fase 4 (tabela de argumentos) |
| NT-J-03 | script (unidade) | — |
| NT-J-04 | N15 (unidade, repository falso) | Fase 3 (repository real com falha injetada) |
| NT-J-05, NT-J-06 | script (unidade, parcial) | Fase 3 (serviço real, logger injetado) |
| NT-J-07 | N14 | Fase 3 (restauração) |
| NT-J-08 | medição de 09/10 (fora da suíte) | Fase 3 (orçamento do ⚑5) |
| NT-J-09 | — | Fase 3 |
| NT-J-10 | — | Fase 8 (inspeção do runbook) |

### Bloco L — leitura, lista e contador

| Caso | Existente | Novo |
|---|---|---|
| NT-L-01, NT-L-02 | "valida a consulta…", "lista só as não lidas…" (API) | Fase 2 (minúsculo, além da última, não numérico) |
| NT-L-03 | — | Fase 2 (empate de `createdAt`) |
| NT-L-04 | — | Fase 2 (percurso e hipótese H1) |
| NT-L-05 | API | Fase 2 (`limit=1`) |
| NT-L-06 | API | Fase 2 (`true → false → true`) |
| NT-L-07 | "listar não marca nada como lido" (API) | Fase 2 (sem auditoria nem criação) |
| NT-L-08 | API (DTO) | Fase 2 (UTC e formato de `dueDate`) |
| NT-L-09 | API | Fase 2 (`updated=0`) |

### Bloco F — preferências

| Caso | Existente | Novo |
|---|---|---|
| NT-F-01, NT-F-02, NT-F-04 | API | Fase 2 (variantes extras) |
| NT-F-03 | N13 | Fase 2 (RF30) e Fase 3 (RF59, hipótese H9) |
| NT-F-05 | — | Fase 2 (hipótese H11) |
| NT-F-06 | — | Fase 2 |

### Bloco Z — autorização e visibilidade

| Caso | Existente | Novo |
|---|---|---|
| NT-Z-01 | API (401, 404 alheio, membership, projeto excluído) | Fase 2 (corpos idênticos e restauração) |
| NT-Z-02 | — | Fase 2 (hipótese H4) |
| NT-Z-03 | API | — |
| NT-Z-04 | API (barra final em GET) | Fase 2 (`PATCH` com variantes) |
| NT-Z-05, NT-Z-06 | API (parcial) | Fase 2 |
| NT-Z-07 | — | Fase 2 |
| NT-Z-08 | API (429 nas leituras) | Fase 2 (por usuário e mutação em massa) |

### Blocos K, D e M

| Caso | Existente | Novo |
|---|---|---|
| NT-K-01, NT-K-02, NT-K-04..NT-K-06 | — | Fase 3 |
| NT-K-03 | N5 | — |
| NT-K-07 | N8 | Fase 3 (três jobs) |
| NT-D-01 | privacidade (integração) | Fase 3 (nome pseudonimizado no DTO) |
| NT-D-02 | exportação (API) | — (hipótese H5 julgada na Fase 8) |
| NT-D-03 | retenção (integração, −181 d e −180 d) | Fase 3 (−180 d −1 ms e auditoria) |
| NT-D-04 | purga (integração) | Fase 3 (restauração) |
| NT-D-05 | — | Fase 8 |
| NT-M-01, NT-M-02 | M1, M2 | Fase 3 (recálculo independente a partir do banco) |
| NT-M-03 | — | Fase 3 (hipótese H2) |
| NT-M-04 | — | Fase 8 (hipótese H8) |

### Bloco U — interface

| Caso | Existente | Novo |
|---|---|---|
| NT-U-01 | contador e `unreadNavLabel` (frontend) | Fase 5 (1 e 99) |
| NT-U-02 | consulta periódica e 429 (frontend) | Fase 5 (desmontagem) |
| NT-U-03 | central (frontend) | — |
| NT-U-04 | — | Fase 5 (hipóteses H1 e H3) |
| NT-U-05 | central (frontend) | Fase 5 (foco e botão inativo) |
| NT-U-06 | título (frontend) | Fase 5 (projeto e ator, hipótese H18) |
| NT-U-07 | armazenamento (frontend) | Fase 5 (desmontagem no logout) |
| NT-U-08 | preferências (frontend) | Fase 5 (`aria-describedby`) |
| NT-U-09 | `formatDueDate` (frontend) | Fase 5, rodada com `TZ` distantes |
| NT-U-10 | verificação visual de 09/10 | Fase 7 |

## 4. Regra executável → casos

| Tabela de `TASK_NOTIFICATIONS.md` | Casos |
|---|---|
| Tipos (quando nasce, contexto, chave) | NT-S-02, NT-S-04, NT-J-01 |
| Destinatário e exclusões, com a ordem | NT-S-01, NT-P-09 |
| Corte (três fusos e exemplos) | NT-P-01, NT-P-08 |
| Horário de verão | NT-P-02 |
| Janela de recuperação | NT-P-04 |
| Repetição (seis situações) | NT-K-07, NT-P-06, NT-P-07, NT-S-04, NT-K-03, N11 |
| Preferências | NT-F-01, NT-F-03, NT-F-06 |
| Visibilidade e leitura | NT-Z-01, NT-L-06, NT-L-09, NT-S-11 |
| Métrica oficial | NT-M-01..04 |
| Job (comando, produção, escopo, escrita, falha, saída, log) | NT-J-01..07 |
| Retenção e privacidade | NT-D-01..04 |

## 5. Contrato e erros → casos

| Linha do `API_CONTRACTS.md` | Casos |
|---|---|
| `GET /api/notifications` | NT-L-01..05, NT-L-08 |
| `GET /api/notifications/unread-count` | NT-L-05, NT-Z-08 |
| `PATCH /api/notifications/:notificationId` | NT-L-06, NT-Z-04, NT-Z-05 |
| `POST /api/notifications/read-all` | NT-L-09, NT-K-05 |
| `GET` e `PUT /api/settings/notifications` | NT-F-01..06 |
| `VALIDATION_ERROR`, `AUTHENTICATION_REQUIRED`, `CSRF_INVALID`, `NOTIFICATION_NOT_FOUND`, `RATE_LIMITED` | NT-Z-01..08 |
| Estado da conta (`ACCOUNT_DEACTIVATED`, `ACCOUNT_DELETION_PENDING`) | NT-Z-02 (o contrato do S2-02 não os lista) |

## 6. ASVS e anexo

As linhas do bloco X e do bloco A estão no prompt (seções 3.13 e 3.14), com os casos que as provam.
O veredito de cada uma sai no relatório da Fase 8.
