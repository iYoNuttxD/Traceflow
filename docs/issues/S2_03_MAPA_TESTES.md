# Mapa de testes — S2-03: notificações de eventos de issues e pull requests (RF60, RF61)

Fase 1 da campanha de [S2_03_PROMPT_TESTES_NOTIFICACOES_GITHUB.md](S2_03_PROMPT_TESTES_NOTIFICACOES_GITHUB.md),
com o terreno em `f4b3b39`. Liga cada critério, regra e requisito a um caso `EV-*` e a um teste.
"Existente" cita o teste que já prova o caso; "Novo" indica onde o teste entra:
- Fase 2: `backend/test/api/s203-bateria.test.js`;
- Fase 3: `backend/test/integration/s203-bateria.test.js`;
- Fase 4: `backend/test/unit/s203-bateria.test.js`;
- Fase 5: `frontend/test/pages/Notifications.s203-bateria.test.jsx`;
- Fase 7: roteiro manual;
- Fase 8: inspeção registrada no relatório.

**Aval dos ⚑ em 12/10/2026 ("pode seguir"), com as recomendações:**
1. registrar sem corrigir;
2. E2E pelo roteiro manual, com o achado de conformidade;
3. repositório GitHub real como `NÃO VERIFICÁVEL LOCALMENTE`;
4. segunda conta e alto contraste conduzidos pelo João na Fase 7;
5. orçamento: página com 100 transições e 5 tarefas por artefato em até 1 s local e abaixo de 2,5 s
   com 2 ms por ida e volta; despacho de um evento com 10 participantes em até 50 ms;
6. latência medida por proxy TCP local, só no banco de teste.

## 1. Versões do cartão (seção 0.2 do prompt)

| Ponto | Classe | Decisão da campanha |
|---|---|---|
| C1: o quadro diz "Issue vinculada", sem "abertura/fechamento" | DE: a issue só tem dois estados, então as duas redações cobrem as mesmas transições | vale o roadmap, que nomeia as transições |
| C5: o quadro não diz "sem perda" | DX: o quadro relaxa o roadmap, sem registro | vale o texto mais exigente, "sem perda" |
| Entregáveis: "links de contexto" × "links para tarefa e artefato" | DX: o quadro é menos específico | vale o roadmap: os dois links |
| Checklist 2: "outbox/job idempotente" × "ou estratégia idempotente equivalente" | DA: o quadro fecha a alternativa | a entrega usa fila e job, o que atende às duas |
| Descrição: PRs "abertas" | DA registrada: o Quadro 3-58 não inclui abertura de PR, e o ADR-018 (D2, D3) e o S203-F04 declaram a precedência | vale o documento oficial |
| "Notificar envolvidos", "tarefa/projeto", "Mapear transições persistidas" | DE | nenhuma |

## 2. Critérios → casos → testes

| Critério | Casos | Existente | Novo |
|---|---|---|---|
| C1 | EV-T-01..13, EV-C-01, EV-C-05, EV-V-01..07 | política (transições), E1–E6, E11 | Fases 2, 3 e 4 |
| C2 | EV-T-02, EV-T-10, EV-C-06 | política (PR), E7, M4 | Fases 2, 3 e 4 |
| C3 | EV-E-01..09, EV-C-04, bloco Z | G1, G2, G3, G10 | Fases 2 e 3 |
| C4 | EV-T-07, EV-T-11, EV-K-01..07, EV-J-03 | E3, E10, E15, G4, G5, R6 | Fase 3 |
| C5 | EV-J-01..13, EV-S-02..05, EV-K-03, EV-Q-03, EV-Q-04 | E9, G6, G7, G8, G9, G12 | Fase 3 |
| C6 | EV-L-01, EV-L-02, EV-S-04, EV-J-08, EV-D-01 | R1, R2, E13, G11 | Fases 2 e 3 |
| C7 | EV-M-01..06 | M3, M4 | Fases 3 e 8 |
| Entregáveis (detecção, destinatários, notificações, dois links) | blocos T, E, L, U | R1, F1, F4 | Fases 2 e 5 |
| K1 mapear transições | bloco T | política, E1–E8 | Fases 3 e 4 |
| K2 fila ou job idempotente | blocos J e K | G4–G8 | Fase 3 |
| K3 central | blocos L e U | R1, R7, F1–F9 | Fases 2 e 5 |
| K4 observabilidade e retentativas | EV-J-07..10, EV-S-08 | G7, G8, G11 | Fase 3 |
| K5 eventos, duplicidade, falha e autorização | blocos T, K, J e Z | os acima | Fases 2 a 4 |

## 3. Casos por bloco

### Bloco C — documento oficial e casos de uso

| Caso | Existente | Novo |
|---|---|---|
| EV-C-01 | E6 (sem vínculo vira alerta), R6 (sincronização avisa) | Fase 2: as duas na mesma sincronização |
| EV-C-02 | G9 (falha depois da página de PRs) | Fase 2: falha na segunda página de issues, pela rota |
| EV-C-03 | — | Fase 2 |
| EV-C-04 | G1 (os três papéis recebem) | Fase 2: quem não recebe |
| EV-C-05 | E4 (reabertura) | Fase 2: vincular issue aberta não avisa |
| EV-C-06 | E7, M4 | Fase 2: pela rota, com a reabertura de PR |
| EV-C-07 | — | Fase 2 |
| EV-C-08 | — | Fase 8 |

### Bloco T — transições

| Caso | Existente | Novo |
|---|---|---|
| EV-T-01 | política ("fechamento usa closedAtGithub…"), E2, E4, E5 | Fase 4 (as 30 combinações) e Fase 3 (amostra pelo `upsertMany`) |
| EV-T-02 | política (PR, anomalia), E7 | Fases 4 e 3 |
| EV-T-03 | política ("open e closed sem diferença de caixa") | Fase 4 (variantes) |
| EV-T-04 | — | Fase 3 |
| EV-T-05 | E1 | Fase 3 (estado anterior à implantação, hipótese H2) |
| EV-T-06 | E8 | Fase 3 (título novo no snapshot) |
| EV-T-07 | E3 | Fase 3 (valores diferentes, duas páginas) |
| EV-T-08 | — | Fase 3 (hipótese H3) |
| EV-T-09 | política ("sem data do GitHub…") | Fase 3 |
| EV-T-10 | E7 (fechada e depois mesclada) | Fase 4 (carga incoerente) |
| EV-T-11 | E4 (duas etapas) | Fase 3 (três sincronizações) |
| EV-T-12 | E6 | Fase 3 (tarefas excluídas antes) |
| EV-T-13 | — | Fase 3 (inspeção registrada) |

### Bloco V — vínculos e retrato

| Caso | Existente | Novo |
|---|---|---|
| EV-V-01 | E2 (issue com duas tarefas) | Fase 3 (PR com três) |
| EV-V-02 | E11 | — |
| EV-V-03 | E11 (removido antes) | Fase 3 (removido depois, hipótese H19) |
| EV-V-04 | G3 (`NO_TASK`) | — |
| EV-V-05 | E12 | — |
| EV-V-06 | — | Fase 3 |
| EV-V-07 | — | Fase 3 |

### Bloco E — destinatários e exclusões

| Caso | Existente | Novo |
|---|---|---|
| EV-E-01 | G1 | Fase 3 (cronômetro, lançamento manual, quem encerrou, quem moveu, quem vinculou; hipótese H11) |
| EV-E-02 | política ("conta, membership e preferência…", "projeto excluído vem antes da janela") | Fase 4 (2⁸ combinações) e Fase 3 (pares vizinhos) |
| EV-E-03 | G3 (`INACTIVE_ACCOUNT`) | Fase 3 (três estados e reativação) |
| EV-E-04 | G3 (`INACTIVE_MEMBER`), R4 | Fase 3 (reativação antes e depois) |
| EV-E-05 | política (preferência), G3, G10 | Fase 3 (`enabledAt` igual a `detectedAt`; salvar sem mudar) |
| EV-E-06 | G3 (`PROJECT_DELETED`) | Fase 3 (restauração, hipótese H5) |
| EV-E-07 | política (janela), `env.test.js` | Fase 3 (pelo job; retentativa 3 h depois) e Fase 4 (configuração) |
| EV-E-08 | — | Fase 3 |
| EV-E-09 | G1, G2 | Fase 3 (dois eventos na mesma tarefa) |

### Bloco J — despacho, retentativas e job

| Caso | Existente | Novo |
|---|---|---|
| EV-J-01 | G7, G8 | Fase 3 (reserva de `PROCESSING` vencido; `DISPATCH_INTERRUPTED`) |
| EV-J-02 | política ("espera 1, 5, 30 e 120…"), G7 | Fase 3 (limite de 1 ms) |
| EV-J-03 | "o dry-run não grava nada…" | Fase 3 (`--retry-failed` em dry-run) |
| EV-J-04 | script ("interpreta os argumentos…") | Fase 4 (variantes) |
| EV-J-05 | script ("exige --confirm-production…") | — |
| EV-J-06 | script (códigos 0, 1 e 2) | Fase 4 (precedência) |
| EV-J-07 | G11 | Fase 3 (conjunto exato de campos) |
| EV-J-08 | G11 | Fase 3 (código com quebra de linha; nível do log) |
| EV-J-09 | — | Fase 3 (hipótese H13) |
| EV-J-10 | — | Fase 3 (hipótese H14) |
| EV-J-11 | política (reserva e lote) | Fase 3 (teto de 1.000; gancho só do projeto) |
| EV-J-12 | — | Fase 3 (comandos no banco de teste) e Fase 8 (unidade e timer) |
| EV-J-13 | — | Fase 3 (hipótese H12) |

### Bloco S — sincronização e gancho

| Caso | Existente | Novo |
|---|---|---|
| EV-S-01 | G9 | Fase 2 (intervalo até as notificações, hipótese H17) |
| EV-S-02 | G9 | Fase 2 |
| EV-S-03 | G9 | — |
| EV-S-04 | — | Fase 3 (hipótese H4) |
| EV-S-05 | E9 | Fase 3 |
| EV-S-06 | — | Fase 2 |
| EV-S-07 | — | Fase 2 |
| EV-S-08 | — | Fase 3 |

### Blocos K e Q — concorrência e custo

| Caso | Existente | Novo |
|---|---|---|
| EV-K-01 | E10 (issue) | Fase 3 (PR e sem `occurredAt`) |
| EV-K-02 | G5 (dois despachos) | Fase 3 (gancho e job) |
| EV-K-03 | G6 | Fase 3 (hipótese H20) |
| EV-K-04 | — | Fase 3 (hipótese H18) |
| EV-K-05..07 | — | Fase 3 |
| EV-Q-01, EV-Q-02 | E14 (só F = 1) | Fase 3 |
| EV-Q-03..06 | — | Fase 3, com o proxy de latência |

### Bloco L — leitura e DTO

| Caso | Existente | Novo |
|---|---|---|
| EV-L-01 | R1 | Fase 2 (os quatro eventos, chaves exatas) |
| EV-L-02 | R2 | Fase 2 (variantes de URL) |
| EV-L-03 | F8 (frontend) | Fase 2 (cursor com tipos misturados) |
| EV-L-04 | R7 | — |
| EV-L-05 | R2 (tarefa excluída) | Fase 2 (artefato apagado) |
| EV-L-06 | R8 | — |

### Bloco F — preferências

| Caso | Existente | Novo |
|---|---|---|
| EV-F-01 | R3 | — |
| EV-F-02 | R3 (duas chaves → 400) | Fase 2 (mensagem) e Fase 8 (contrato e S202-F17, hipótese H9) |
| EV-F-03 | `s202-bateria` e `s202-notifications` (variantes com quatro chaves) | Fase 2 (valores inválidos nas chaves do GitHub) |
| EV-F-04 | R3 (auditoria só dos alterados) | Fase 2 (`enabledAt` preservado) |
| EV-F-05 | `s202-correcoes-reteste` (`NOWAIT`) | Fase 2 (com as chaves do GitHub) |

### Bloco Z — autorização e visibilidade

| Caso | Existente | Novo |
|---|---|---|
| EV-Z-01 | R4 | Fase 2 (tabela inteira) |
| EV-Z-02 | R5 | Fase 2 (inventário de rotas contra `14e00be`) |
| EV-Z-03 | — | Fase 2 |
| EV-Z-04 | R3 (CSRF no `PUT`) | Fase 2 (`PATCH` e `POST`) |
| EV-Z-05, EV-Z-06 | — | Fase 2 |

### Blocos D e M — privacidade e métrica

| Caso | Existente | Novo |
|---|---|---|
| EV-D-01 | PV1 | Fase 2 (`visible: false` e URL forjada, hipótese H10) |
| EV-D-02 | PV2 | Fase 3 (fronteiras exatas e soma da auditoria) |
| EV-D-03 | PV3 | Fase 3 (autor anonimizado nos eventos seguintes) |
| EV-D-04 | PV4 | — |
| EV-D-05, EV-D-06 | — | Fase 8 (hipótese H16) |
| EV-M-01, EV-M-02 | M3, M4 | Fase 3 (recálculo independente e invariantes) |
| EV-M-03 | G6 | Fase 3 (hipótese H6) |
| EV-M-04, EV-M-05 | — | Fase 3 |
| EV-M-06 | — | Fase 8 |

### Bloco U — interface

| Caso | Existente | Novo |
|---|---|---|
| EV-U-01 | F1, F2 | Fase 5 (fusos extremos) |
| EV-U-02 | F2, F4, `notification-view` ("sem data omite o instante…") | — |
| EV-U-03 | F3 | Fase 5 (título da tarefa, nome do projeto, controle bidirecional) |
| EV-U-04 | política ("sem cortar emoji ao meio") | Fase 5 (ZWJ) e Fase 7 (390 px) |
| EV-U-05 | — | Fase 5 (hipótese H7) |
| EV-U-06 | F9 | — |
| EV-U-07 | F5 | — |
| EV-U-08 | F7/F8 | Fase 5 ("99+" e filtro com os tipos novos) |
| EV-U-09 | F7 | Fase 5 (título do GitHub) |
| EV-U-10 | — | Fase 7 (hipótese H15) |

## 4. Bloco G — reauditoria dos testes alterados

Comparação das asserções de `14e00be` com as de `f4b3b39`.

| Arquivo | O que mudou | Veredito |
|---|---|---|
| `api/s202-bateria` | corpos de `PUT` com quatro chaves; os casos `null`, `0`/`1`, `__proto__` e `constructor` mantidos | igual |
| `api/s202-correcoes-reteste` | constante `OFF` com quatro chaves | igual |
| `api/s202-notifications` | corpos com quatro chaves; o caso de chave desconhecida passou de `ISSUE_EVENT` a `UNKNOWN_EVENT`; `'false'`, `userId`, `__proto__` e `constructor` mantidos; resposta esperada com quatro chaves | igual |
| `api/s202-reteste` | corpos e resposta esperada com quatro chaves | igual |
| `integration/project-deletion-concurrency` | retorno do `upsertMany` com `transitions`, `linkedTasks` e `anomalies` | mais forte |
| `integration/s202-correcoes-reteste`, `s202-correcoes`, `s202-reteste` | preferências com quatro chaves; a alternância `index % 3` mantida | igual |
| `unit/e7-privacy-audit` | a fila entra no dry-run, na soma (15) e na exclusão por estado e `detectedAt` | mais forte |
| `unit/github-sync-run.alerts` | o despacho é dublado; ordem "alertas antes do despacho" e duas chamadas no caminho de falha | mais forte. O dublê esconde o despacho real, que só o G9 (integração) prova (EV-G-03) |
| `unit/githubSync.service` | resumo com `transitions` | mais forte |
| `unit/notification.policy` | lista com os quatro tipos | igual |
| `frontend/NotificationPreferencesPage` | preferências com quatro chaves; F5 novo | mais forte |
| `frontend/Notifications.bateria` | quatro caixas em vez de duas | igual |

Nenhuma asserção do comportamento do S2-02 foi enfraquecida (EV-G-01, EV-G-02, EV-G-04).

## 5. Regra executável → casos

| Seção de `GITHUB_EVENT_NOTIFICATIONS.md` | Casos |
|---|---|
| Tipos e eventos | EV-C-05, EV-C-06, EV-L-01 |
| Estados | EV-T-01..03, EV-T-10 |
| Transições (tabela, linha de base, data ausente, data anterior ausente, título, item repetido, limitação) | EV-T-01..12 |
| Exemplos da issue #45 | EV-T-04 |
| Vínculos (retrato) | EV-V-01..07 |
| Fila (campos, tudo ou nada, índice único) | EV-S-04, EV-S-05, EV-K-01 |
| Destinatários e exclusões, com a ordem | EV-E-01..09 |
| Janela e exemplos | EV-E-07 |
| Chave da notificação (cinco situações) | EV-T-11, EV-K-02, EV-E-09, EV-J-03 |
| Ciclo de vida, despacho, retentativas e reprocessamento | EV-J-01..03, EV-K-03 |
| Onde o despacho roda | EV-S-01..03, EV-J-11 |
| Conteúdo e links | EV-L-01, EV-L-02, EV-L-05, EV-U-01 |
| Métrica oficial | EV-M-01..06 |
| Job | EV-J-03..12 |
| Retenção e privacidade | EV-D-01..04 |

## 6. ADR-018 → casos

| Decisão | Casos |
|---|---|
| 1 fonte | EV-T-13, EV-C-01 |
| 2 estados e transições | EV-T-01..12 |
| 3 abertura no RF60 | EV-C-05 |
| 4 vínculo | EV-V-01..07 |
| 5 fila transacional e módulo dono | EV-S-05, EV-K-01, bloco A (§8.1, §9) |
| 6 destinatários | EV-E-01..09 |
| 7 tipos e deduplicação | EV-E-05, EV-E-09, bloco F |
| 8 janela | EV-E-07 |
| 9 despacho | bloco J, EV-K-02..06, EV-S-01..03 |
| 10 conteúdo | EV-L-01, EV-L-02, EV-J-08, G14 |
| 11 visibilidade | bloco Z |
| 12 contrato | EV-L-01, EV-F-02 |
| 13 interface | bloco U |
| 14 métrica | bloco M |
| 15 observabilidade | EV-J-07..10, EV-S-08 |
| 16 privacidade | bloco D |
| 17 coordenação com a PR #24 | Fase 8 (inspeção) |
| 18 fora da entrega | Fase 8 (backlog S203-F01..F08) |

## 7. Contrato e erros → casos

| Linha do `API_CONTRACTS.md` | Casos |
|---|---|
| S2-03: contexto do DTO e campos que não entram | EV-L-01, EV-L-02, EV-L-05 |
| S2-03: sem rota nova, fila não exposta | EV-Z-02 |
| `:1334–1335` e a mudança de contrato das preferências | EV-F-01..05 |
| S2-03: exportação | EV-D-01 |
| Erros do S2-02 (`VALIDATION_ERROR`, `AUTHENTICATION_REQUIRED`, `CSRF_INVALID`, `NOTIFICATION_NOT_FOUND`, `NOTIFICATION_PREFERENCES_BUSY`, `RATE_LIMITED`) | EV-Z-01..05, EV-F-03, EV-F-05 |
| Erro da execução da sincronização | EV-S-04, EV-S-06, EV-S-07 (o contrato do S2-03 não lista códigos de execução; a Fase 2 registra os observados) |

## 8. ASVS e anexo

As linhas do bloco X e do bloco A estão no prompt (seções 3.16 e 3.17), com os casos que as provam.
O veredito de cada uma sai no relatório da Fase 8.
