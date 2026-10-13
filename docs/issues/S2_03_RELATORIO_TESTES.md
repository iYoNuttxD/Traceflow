# Relatório de testes do S2-03 — notificações de eventos de issues e pull requests (RF60, RF61)

Campanha descrita em [S2_03_PROMPT_TESTES_NOTIFICACOES_GITHUB.md](S2_03_PROMPT_TESTES_NOTIFICACOES_GITHUB.md),
com o mapa de casos em [S2_03_MAPA_TESTES.md](S2_03_MAPA_TESTES.md).

| Item | Valor |
|---|---|
| Executada em | 12/10/2026 |
| Branch | `joao-dev-v2` local, sem push |
| Base | `f4b3b39` (último commit do S2-03) |
| Commits | `08a999c` (Fase 1), `b7994f7` (2), `f80e862` (3), `9f0d589` (4), `4b82e41` (5), `34d7a9b` (6) e o deste relatório (7 e 8) |
| Aval dos ⚑ (12/10, "pode seguir") | 1 registrar sem corrigir; 2 roteiro manual em vez de E2E; 3 repositório GitHub real como não verificável localmente; 4 segunda conta e alto contraste conduzidos pelo João; 5 orçamento de custo fixado; 6 latência medida por proxy local no banco de teste |
| Anexos | mesmas versões do prompt: ASVS `a2fa1bbe…`; anexo de arquitetura no blob `589af2b`; roadmap no blob `53f4500` |
| Ambiente | Windows 11; Node v22.18.0 (ICU 77.1, tzdata 2025b); MySQL de teste `traceflow_test`; Fase 7 no banco de desenvolvimento `traceflow` |
| Código de produção | intocado: `git diff --exit-code -- backend/src backend/scripts frontend/src` limpo depois de cada fase e de cada mutação |
| Fase 7 (roteiro manual) | executada em 12/10/2026 no ambiente do João (seção 14); carga limpa no fim, com aval |
| Correções | 13/10/2026, `be3cf2b`..`87ff81b`, sem push (seção 16) |

## 1. Resumo

**O núcleo do S2-03 se sustenta.** Resistiram a 99 casos novos e a 69 mutantes:
- as tabelas de transição inteiras (30 combinações de issue, 36 de PR);
- o retrato dos vínculos;
- os destinatários e a ordem das exclusões (32 combinações);
- a janela em todos os limites de 1 a 90 dias;
- a idempotência sob concorrência real (três jobs e o gancho sobre 500 eventos);
- as retentativas;
- os invariantes da métrica;
- a autorização, a visibilidade e a privacidade;
- a interface em quatro fusos.

Mutação:
- 38 mutantes da campanha: 35 mortos de primeira e 3 (MT16, MT19, MT21) depois de testes matadores novos;
- 31 mutantes da implementação (MS01–MS25), reaplicados: todos mortos.

**A campanha encontrou 13 achados, 2 deles ALTA:**
- **ALTA:**
  - a página da sincronização que estoura o tempo da transação deixa a execução presa em `RUNNING`, sem registrar a falha (A01);
  - o evento despachado enquanto o projeto está excluído se perde de vez na restauração (A02).
- **MÉDIA:**
  - página que nunca passa a partir de ~8,5 ms de latência (A03);
  - data da reabertura (A04);
  - estoque de `FAILED` invisível (A05).
- **BAIXA:** 8 achados de mensagens, acessibilidade, uso, exportação, contrato, operação e documentação.

**O cartão continua "implementado localmente, aberto em homologação".** O DoD comum do roadmap não se
cumpre enquanto faltarem:
- E2E de navegador (S104-F02);
- a CI, que só roda depois do push;
- a aprovação visual (`VISUALLY APPROVED`) do João.

| Fase | Saída | Resultado |
|---|---|---|
| 1 | `S2_03_MAPA_TESTES.md` | todo critério, regra, decisão e linha de contrato ligados a caso; bloco G sem asserção enfraquecida |
| 2 | `backend/test/api/s203-bateria.test.js` | 28 casos verdes; a asserção do A09 saiu do arquivo, e a mensagem do A10 ficou registrada como observação |
| 3 | `backend/test/integration/s203-bateria.test.js` | 47 casos verdes, também em `TZ=Pacific/Kiritimati`; reproduções de A01, A06 e A13 (a, b) fora do repositório |
| 4 | `backend/test/unit/s203-bateria.test.js` | 16 casos verdes |
| 5 | `frontend/test/pages/Notifications.s203-bateria.test.jsx` | 5 casos verdes em quatro fusos; A07 reproduzido fora do arquivo |
| 6 | 3 testes matadores na integração | 38 de 38 e 31 de 31 mutantes mortos |
| 7 | roteiro no ambiente do João | 11 casos, todos executados (seção 14) |

Suíte completa do backend duas vezes ao fim das Fases 3 e 6: 2.186 verdes, idênticas, e só a falha
de ambiente `EPERM` de symlink (`storage.test.js`). Gates verdes:
- backend: `lint`, `format:check`, `architecture:check` e `security:secrets`;
- frontend: `lint`, `format:check` e `build`.

## 2. Veredito por critério do cartão

| Critério | Veredito | Casos | Ressalvas |
|---|---|---|---|
| C1 issue vinculada: evento só após transição real (abertura e fechamento) | ATENDE COM RESSALVA | EV-T-01..12, EV-C-01, EV-C-05, P2, E1–E15 | "abertura" é a reabertura (D3, aprovada); a data da reabertura é aproximada (A04) |
| C2 PR vinculada: fechamento e merge | ATENDE | EV-T-02, EV-C-06, E7, M4 | — |
| C3 destinatários pela participação na tarefa e no projeto | ATENDE | EV-E-01..09, EV-C-04, bloco Z | o autor da ação não é excluído (D6, aprovada) |
| C4 sincronizações repetidas não duplicam | ATENDE | EV-T-07, EV-T-11, EV-K-01..07, E3, E10, E15, G4, G5 | — |
| C5 falhas temporárias reprocessadas sem perda | ATENDE COM RESSALVA | EV-C-02, EV-S-05, bloco J, EV-K-03, EV-K-05 | a página que estoura o tempo não registra a falha e trava a próxima sincronização até a expiração (A01); estoque de `FAILED` invisível até a retenção (A05); sem agendador, a retentativa só vem na próxima sincronização (H12) |
| C6 tokens e respostas brutas do GitHub não expostos | ATENDE | EV-L-01, EV-L-02, EV-J-08, E13, R1, G11 | o erro de banco sai com código interno do Prisma, mas não é dado do GitHub (A06) |
| C7 (documento oficial) métrica com termos definidos e medição reproduzível | ATENDE COM RESSALVA | EV-M-01..05, M3, M4 | a regra não diz que "enviada corretamente" soma `created` e `alreadyNotified` (A13 c) |
| Entregáveis: detecção, destinatários, notificações, links para tarefa e artefato | ATENDE COM RESSALVA | blocos T, E, L, U; Fase 7 | nomes acessíveis repetidos (A07) |
| K1 transições persistidas mapeadas | ATENDE | bloco T | — |
| K2 fila ou job idempotente | ATENDE | blocos J e K | — |
| K3 integração com a central | ATENDE COM RESSALVA | blocos L e U; Fase 7 | sem filtro por tipo no extremo em escala (A08) |
| K4 observabilidade e retentativas limitadas | ATENDE COM RESSALVA | EV-J-01..13, EV-S-08 | A05, A11, A12 |
| K5 testes de eventos, duplicidade, falha e autorização | ATENDE | blocos T, K, J, Z | — |
| Achado fora dos critérios | A02 é regra ausente (restauração), não falha temporária | EV-E-06 | ALTA pela calibração (notificação perdida) |

## 3. Achados

### [ALTA] S203-A01 — página que estoura o tempo da transação deixa a execução presa em `RUNNING`, sem registrar a falha

- **Onde:** `github-sync-run.service.js:130–153` (o `catch` chama `githubSyncRunRepository.fail`, `github-sync-run.repository.js:83`); a página roda em `active-project-write.js:14–25`, transação interativa de 5 s.
- **Norma:** UC04, E2 ("falha de comunicação é registrada e informada"); §13.10 do anexo (não ocultar falhas de sincronização); V16.5.3.
- **Esperado:** a página que cai encerra a execução como `FAILED`, com o erro informado, roda os ganchos do caminho de falha e libera a próxima sincronização.
- **Observado:**
  - Com o `Project` travado por outra transação durante 7 s, a página cai com `P2028`.
  - A primeira consulta seguinte pega a conexão que o MySQL fechou. O `fail()` responde `P2025` ("No record was found for an update").
  - A execução fica `RUNNING` na etapa `PULL_REQUESTS`, com `activeProjectId` preenchido. A criação da próxima execução é recusada com `P2002`. Os ganchos de alerta e de despacho do caminho de falha não rodam.
  - No experimento isolado, a consulta seguinte ao `P2028` falha com `P1017` ("Server has closed the connection") e volta 500 ms depois.
  - Numa repetição imediata, a trava do projeto respondeu "Projeto não encontrado" (`RESOURCE_NOT_FOUND`) para um projeto ativo.
- **Reprodução:**
  - `EV-S-04` com o esperado da especificação, em `scratchpad/s203/reproducoes/ev-s-04-trecho.js`: a trava é tomada quando o dublê entrega a página de PRs;
  - `experimento-trava-pagina.mjs`, no banco de teste.
- **Consequência:**
  - A sincronização do projeto fica bloqueada até a execução expirar por inatividade, e quem sincronizou não vê a falha.
  - Somado ao A03, o bloqueio se repete a cada tentativa.
  - O mecanismo da transação interativa é anterior (S202-F29); o S2-03 alonga a página e torna o estouro mais provável.
- **Proposta:**
  - No `catch` de `executeGithubSyncRun`, repetir o `fail()` e os ganchos depois de erro de conexão (`P1017`, ou `P2025` logo depois de `P2028`), ou gravar o resultado numa conexão nova.
  - Limitar a espera de lock da página abaixo do tempo da transação, como na correção do S202-R01.

### [ALTA] S203-A02 — evento despachado enquanto o projeto está excluído fecha como `PROJECT_DELETED` e não volta com a restauração (H5)

- **Onde:** `github-event-notification.service.js:81–84` (`eventExclusion`) e o fechamento `DISPATCHED`.
- **Norma:** C5 ("sem perda"); ADR-016 D9, em que o projeto excluído oculta e a restauração exibe. O ADR-018 D9 só diz que o evento fecha, sem tratar a restauração.
- **Esperado:** a exclusão recuperável não causa perda definitiva. O aviso fica oculto enquanto o projeto está excluído e aparece com a restauração, como no S2-02, ou o despacho espera.
- **Observado (EV-E-06):** o evento foi detectado, o projeto foi excluído antes do despacho, e o evento fechou `DISPATCHED` com `PROJECT_DELETED`. Com o projeto restaurado, o job seguinte varreu 0 eventos e nenhuma notificação nasceu.
- **Reprodução:** EV-E-06, na bateria de integração (observação "depois da restauração").
- **Consequência:** os participantes perdem o aviso de uma transição real. A janela entre detecção e despacho é curta quando o gancho funciona, mas chega a 15 minutos (job) com mais de 100 eventos ou falha do gancho.
- **Proposta:** com o projeto excluído, adiar em vez de fechar (manter `PENDING` sem tentativa até a restauração ou a purga), ou reabrir os eventos `PROJECT_DELETED` na restauração. A decisão vai para o ADR-018.

### [MÉDIA] S203-A03 — com latência a partir de ~8,5 ms, a página com 100 transições vinculadas nunca passa (H1)

- **Onde:** `github-event.repository.js:129–153` (criação um a um), dentro da transação de 5 s de `withActiveProjectWrite`.
- **Norma:** V15.1.3 e V15.2.2 (custo documentado e limitado); orçamento do ⚑5.
- **Esperado:** margem para a latência do ambiente.
- **Observado:**
  - O orçamento aprovado é cumprido (seção 13): com 2,36 ms de latência efetiva, a página leva 1.625 ms.
  - A partir de 8,56 ms, a página com 100 transições cai com `P2028`, nas duas tentativas.
  - Cada transição custa 3 instruções (1 `SELECT` e 2 `INSERT`; o retrato vai num `INSERT` só): a página passa de 305 para 606 instruções.
- **Reprodução:** `scratchpad/s203/medicao-latencia.mjs` (proxy TCP com agendamento preciso), no banco de teste.
- **Consequência:** com o banco a ~8 ms ou mais (outra região, rede congestionada), um projeto com muitas PRs ou issues vinculadas transitando de uma vez trava a sincronização indefinidamente, somado ao A01.
- **Proposta:**
  - gravar eventos e retratos em lote;
  - ou mover a gravação da fila para uma transação curta logo depois da página;
  - documentar o limite de latência no desenho da nuvem (S2-08).

### [MÉDIA] S203-A04 — a data da reabertura é a última atualização da issue (H3)

- **Onde:** `github-event.policy.js:78–79`.
- **Norma:** Quadro 3-57; ADR-018 D8 (janela de 7 dias contra a enxurrada) e D13 (cartão com a data da ocorrência).
- **Esperado:** o cartão diz quando a issue foi reaberta, e a janela compara essa data.
- **Observado (EV-T-08):** a issue foi reaberta em 09/10, comentada em 19/10 e detectada em 20/10.
  - O `occurredAt` gravado foi 19/10, e o cartão diz "reaberta no GitHub em 19/10".
  - O evento passou pela janela 11 dias depois da reabertura real.
- **Consequência:**
  - o cartão afirma uma data falsa;
  - a janela é contornada por atividade sem relação com a reabertura;
  - a tabela da regra diz só `updatedAtGithub`, e as limitações não declaram a aproximação.
- **Proposta:** declarar a aproximação e ajustar o texto ("reaberta; última atualização em …"), ou buscar a data real só para as transições `CLOSED → OPEN`.

### [MÉDIA] S203-A05 — o estoque de `FAILED` some da saída depois da execução em que falhou (H13)

- **Onde:** `github-event-notification.service.js:254–311` (relatório só da execução) e o runbook (alertas).
- **Norma:** ADR-018 D15; runbook ("Alertar quando `failed > 0`"); V16.3.4.
- **Esperado:** o operador vê os eventos que precisam de reprocessamento enquanto eles existirem.
- **Observado (EV-J-09):**
  - a execução em que o evento vira `FAILED` sai com `failed: 1`;
  - as seguintes saem com `failed: 0`, sem campo de estoque;
  - só o `--retry-failed` em dry-run mostra `wouldRequeue: 1`.
- **Consequência:** perdido o único alerta, os `FAILED` ficam invisíveis até a retenção apagá-los, 180 dias depois, com perda definitiva dos avisos.
- **Proposta:** pôr a contagem de `FAILED` na saída e no log de cada execução e alertar enquanto ela for maior que zero.

### [BAIXA] S203-A06 — erro de banco na sincronização sai com código interno do Prisma e mensagem que culpa o GitHub (H4)

- **Onde:** `github-sync-run.service.js:132–133` e `github-error.js:64–68`.
- **Norma:** §10.2 do anexo (diferenciar os erros), §12.3 (código estável), contrato do `GET .../github/sync/status` ("erro sanitizado"), V16.5.1.
- **Observado:** com um `P2034` (deadlock) injetado na gravação da fila, a execução fica `FAILED` com `error: {code: "P2034", message: "Não foi possível sincronizar com o GitHub."}`.
- **Consequência:** o diagnóstico culpa o GitHub, e um código interno chega à tela. O comportamento é anterior ao S2-03 para qualquer erro de banco, mas a fila acrescenta pontos de falha à página.
- **Proposta:** código estável próprio para falha de gravação (por exemplo, `GITHUB_SYNC_STORAGE_FAILED`) e mensagem que não culpe o GitHub.

### [BAIXA] S203-A07 — dois cartões da mesma tarefa e do mesmo tipo têm nomes acessíveis idênticos (H7)

- **Onde:** `NotificationCard.jsx:29`, `:49` e `:66`.
- **Norma:** WCAG 2.4.6 (rótulos descrevem a finalidade); D13.
- **Observado:** reprodução do EV-U-05.
  - O nome "Issue: TASK-100 Tarefa da bateria" aparece duas vezes.
  - "Abrir tarefa TASK-100" e "Marcar como lida: TASK-100 …" também se repetem.
- **Consequência:** quem usa leitor de tela não distingue duas issues da mesma tarefa, nem a sequência fechar, reabrir e fechar.
- **Proposta:** incluir o evento e o número do artefato no nome do cartão e dos botões.

### [BAIXA] S203-A08 — sem filtro por tipo, os avisos de tarefa ficam soterrados pelos do GitHub (H15)

- **Onde:** central (`NotificationsScreen.jsx`).
- **Observado (Fase 7):** com cerca de 300 avisos do GitHub, o primeiro aviso de tarefa apareceu na posição 301, depois de 15 "Carregar mais".
- **Proposta:** filtro por grupo (tarefas e GitHub) ou por tipo na central.

### [BAIXA] S203-A09 — a exportação devolve `artifactUrl` sem revalidar (H10)

- **Onde:** `notification.mapper.js:55–64` (`githubExportFields`).
- **Norma:** regra, seção "Conteúdo e links" ("conferida de novo na saída"); inventário ("URL só do GitHub").
- **Observado (EV-D-01):** uma URL forjada no banco, `javascript:alert(1)`, sai na exportação; o DTO a anula.
- **Consequência:** defesa em profundidade incompleta no arquivo exportado. É dado do próprio titular e nada é executado.
- **Proposta:** aplicar `safeGithubUrl` também na exportação.

### [BAIXA] S203-A10 — cliente desatualizado recebe mensagem enganosa; mudança de contrato sem data (H9)

- **Onde:** `notification.validation.js:73–82`; `API_CONTRACTS.md` (S2-03); backlog S202-F17.
- **Norma:** §6.4 do anexo; critério do S202-F17 ("registrar a mudança de contrato com data").
- **Observado (EV-F-02):**
  - o `PUT` com as duas chaves do S2-02 responde 400 "Cada preferência deve ser verdadeira ou falsa.", com detalhes nas chaves que faltam;
  - o contrato diz "(duas até o S2-03)", sem data;
  - o S202-F17 continua aberto.
- **Proposta:** mensagem própria para chave ausente (pedindo para recarregar a página), data da mudança no contrato e fechamento do S202-F17 com a decisão.

### [BAIXA] S203-A11 — o alerta de pendência do runbook dispara na espera normal de retentativa (H14)

- **Onde:** runbook, seção de alertas; `pendingSummary` (`github-event.repository.js:316–327`).
- **Observado (EV-J-10):** depois de três falhas, a 31 minutos da detecção, `oldestPendingAgeSeconds` estava em 1.860 (acima de 1.800), com a próxima tentativa marcada para 36 minutos.
- **Proposta:** medir só os pendentes já vencidos (`nextAttemptAt <= agora`), ou subir o limite acima da soma das esperas.

### [BAIXA] S203-A12 — o fechamento perdido não deixa log e conta a tentativa duas vezes (H20)

- **Onde:** `github-event-notification.service.js:158` e `:213`.
- **Observado (EV-K-03):** a reserva venceu durante o processamento.
  - O despachante lento terminou sem log (`claimed: 1`, `dispatched: 0`).
  - O evento fechou com `attempts: 2`.
- **Proposta:** registrar um log da reserva perdida e não contar a retomada como tentativa falha.

### [BAIXA] S203-A13 — documentação diverge do comportamento

| Item | Documento | Divergência | Evidência |
|---|---|---|---|
| a (H2) | `GITHUB_EVENT_NOTIFICATIONS.md` ("Linha de base") e o prompt de implementação | dizem que a primeira sincronização depois da implantação não gera evento; gera para as transições desde a última sincronização, dentro da janela | reprodução R-T05 |
| b | ADR-018, consequências | "até três consultas a mais quando há transição"; são +3 instruções por transição (+301 numa página de 100) | reprodução R-Q01; EV-Q-01 |
| c (H6) | regra, métrica | não define "enviada corretamente" em termos do `outcome`; depois de uma retomada, `created / eligible` dá 0%, e o teste M3 usa `created + alreadyNotified` | EV-M-03 |
| d (H8) | `ASVS_BASELINE.md`, delta S2-03 | cita E1–E14, G1–G14 e F1–F8; a suíte tem E15, G15, F9 e a bateria | inspeção |
| e (H16) | `PRIVACY_NOTICE_DRAFT.md` | não menciona as notificações (S2-02 e S2-03) nem a fila com títulos vindos do GitHub | inspeção |
| f | runbook, seção "Saída" | o stdout traz a linha de log JSON junto com o relatório; ler a saída inteira como um JSON só falha | Fase 7 |

**Proposta:** corrigir cada documento. Para o item f, mandar o log para `stderr` ou documentar a leitura linha a linha.

### Observações (sem achado)

- **H11:** o esforço conta o cronômetro em andamento (`startedById`) e não conta quem só encerrou. É coerente com "quem registrou esforço".
- **H12:** sem agendador instalado, a retentativa só vem na próxima sincronização do mesmo projeto, depois de vencida, ou pelo job manual (EV-J-13). Fecha com o S2-08 e o S2-09.
- **H17:** as notificações aparecem cerca de 300 ms depois de a execução mostrar `SUCCEEDED` (EV-S-01). Intervalo desprezível.
- **H18:** localmente, o vínculo criado durante a página esperou 150 ms, sem deadlock (EV-K-04). O risco sob latência está no A03.
- **H19:** desvincular depois da detecção ainda avisa, como diz a regra. O cartão leva à tarefa, que não mostra mais o vínculo; não há defeito.
- **Chave da ocorrência:** a violação do índice único (`P2002`) não é alcançável. A consulta prévia roda sob a trava do projeto.
- **Título:** o corte em 256 pontos de código pode partir um emoji composto com ZWJ (EV-U-04). É cosmético.
- **Configuração:** `GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS` aceita `""`, `" 7 "`, `"07"` e `"+7"` como 7.
- **Alto contraste:** as pílulas "Pull request" e "Não lida" perdem o formato de etiqueta, mas o texto continua. O estilo vem do S2-02.
- **Índice:** a consulta de eventos vencidos usa `(status, nextAttemptAt)`, lê 11 linhas e leva cerca de 1 ms com 50.000 eventos despachados.
- **Fase 7:** o aviso "Verifique seu e-mail" da conta 9 é anterior ao S2-03 (e-mail não verificado).

## 4. Hipóteses H1–H20

| ID | Resultado | Onde |
|---|---|---|
| H1 | confirmada fora do orçamento | A03 |
| H2 | confirmada (documental) | A13 a |
| H3 | confirmada | A04 |
| H4 | confirmada no caso geral: `P2034` sai como erro do GitHub. O `P2002` não é alcançável, e o `P2028` leva ao A01 | A06, A01 |
| H5 | confirmada | A02 |
| H6 | confirmada (documental) | A13 c |
| H7 | confirmada | A07 |
| H8 | confirmada | A13 d |
| H9 | confirmada | A10 |
| H10 | confirmada | A09 |
| H11 | refutada como defeito | observações |
| H12 | confirmada como limitação | observações; bloco R |
| H13 | confirmada | A05 |
| H14 | confirmada | A11 |
| H15 | confirmada | A08 |
| H16 | confirmada | A13 e |
| H17 | refutada (cerca de 300 ms) | observações |
| H18 | refutada em escala local | observações; A03 |
| H19 | refutada (é a regra) | observações |
| H20 | confirmada | A12 |

## 5. Casos executados

| Fase | Arquivo | Casos |
|---|---|---:|
| 2 | `backend/test/api/s203-bateria.test.js` | 28 |
| 3 | `backend/test/integration/s203-bateria.test.js` | 50 (47 + 3 matadores) |
| 4 | `backend/test/unit/s203-bateria.test.js` | 16 |
| 5 | `frontend/test/pages/Notifications.s203-bateria.test.jsx` | 5 |
| **Total** | | **99** |

**Fora do repositório** (casos com o esperado da especificação que falharam, guardados no scratchpad):
- EV-S-04 (A01);
- R-T05 (A13 a);
- R-Q01 (A13 b);
- EV-U-05 (A07);
- R-H4 (A06);
- a parte da URL do EV-D-01 (A09).

## 6. Bateria de mutação

**Campanha (MT01–MT38):** 38 de 38 mortos.

| Mutante | Alteração | Morto por |
|---|---|---|
| MT01 | estado sem `toLowerCase` | EV-T-03 |
| MT02 | data anterior nula conta como fechamento novo | EV-T-01 (unidade) |
| MT03 | reabertura usa `closedAtGithub` | EV-T-01 (unidade) |
| MT04 | sem a guarda do merge terminal | EV-T-02 (unidade) |
| MT05 | `CLOSED → MERGED` ignorado | EV-T-02 (unidade) |
| MT06 | janela com `>` | EV-E-07 (unidade) |
| MT07 | janela recusa `occurredAt` nulo | EV-E-07 (unidade) |
| MT08 | participantes sem remover repetidos | participantes (unidade) |
| MT09 | membership antes da conta | EV-E-02 (unidade) |
| MT10 | janela antes do projeto excluído | EV-E-02 (unidade) |
| MT11 | preferência com `<` | EV-E-05 (unidade) |
| MT12 | índice das esperas sem o `-1` | EV-J-02 (unidade) |
| MT13 | título cortado por UTF-16 | EV-U-04 (unidade) |
| MT14 | prefixo da URL sem a barra | EV-L-02 (unidade) |
| MT15 | chave da ocorrência sempre com `detectedAt` | chaves (unidade) |
| MT16 | retrato de PR aceita tarefa de outro projeto | **EV-V-05 (matador novo)** |
| MT17 | item repetido: vale o primeiro | EV-T-07 |
| MT18 | reserva de `PROCESSING` sem prazo vencido | G5 |
| MT19 | reserva de `PROCESSING` sem limite de tentativas | **EV-J-03, dry-run com `PROCESSING` esgotado (matador novo)** |
| MT20 | esforço só com cronômetro encerrado | EV-E-01 |
| MT21 | fechamento sem a condição do token | **EV-K-03, só quem detém a reserva fecha (matador novo)** |
| MT22 | reprocessamento sem zerar tentativas | G8 |
| MT23 | `NO_TASK` sem descontar tarefas vivas | G1 |
| MT24 | sem a conferência `NOTIFICATION_NOT_PERSISTED` | G12 |
| MT25 | preferência contra o instante do despacho | EV-E-05 |
| MT26 | `failInterrupted` não soma em `failed` | EV-J-01 |
| MT27 | gancho relança o erro | G9 |
| MT28 | código de erro cru | EV-J-08 |
| MT29 | `--retry-failed` reprocessa em dry-run | EV-J-03 |
| MT30 | código 0 com só `retryScheduled` | EV-J-06 (unidade) |
| MT31 | DTO sem revalidar a URL | EV-L-02 (API) |
| MT32 | chaves do GitHub opcionais no `PUT` | EV-F-02 |
| MT33 | retenção apaga pendentes | EV-D-02 |
| MT34 | retenção por `occurredAt` | EV-D-02 |
| MT35 | janela aceita 0 e 91 | EV-E-07 (configuração) |
| MT36 | merge exibido como "fechada sem merge" | `notification-view` |
| MT37 | preferências enviam só duas chaves | `NotificationPreferencesPage` |
| MT38 | despacho fora do caminho de falha | EV-C-02 |

**Implementação (MS01–MS25, 31 com variantes):** reaplicados com `mutation_runner_s203.py`, todos
mortos. Os matadores estão nas suítes da implementação (E2, E5, E7, E12, E13, E15, G1, G3, G5, G7, G8,
G9, G12, R2, F1, script e textos).

## 7. Cobertura dos arquivos do S2-03

| Arquivo | Linhas | Ramos | Meta | Linhas descobertas |
|---|---:|---:|---|---|
| `github-event.policy.js` | 100% | 100% | 100% de linhas e ramos | — |
| `github-event.repository.js` | 98,05% | 96,42% | ≥ 90% de ramos | `:330–334` (`isActiveProject`, usado pelo script em processo separado) |
| `github-event-notification.service.js` | 99,23% | 95,94% | ≥ 90% de ramos | `:332` (idem) |
| `scripts/dispatch-github-event-notifications.js` | 80% | 91,17% | ≥ 90% de ramos | `:33–34` (escritores padrão) e `:63–70` (bloco de execução direta, coberto pelo EV-J-12 em processo filho, que a cobertura não acompanha) |
| `privacy-retention.js` | 100% | 100% | linhas novas cobertas | — |
| `notification.mapper.js`, `notification.validation.js` | 100% / 93% | 93,75% / 80% | linhas novas cobertas | as descobertas são do S2-02 (prazo nulo e cursor inválido) e cobertas pelas suítes dele |
| `issue.repository.js`, `pullRequest.repository.js` | 70% | 27,77% | linhas novas cobertas | o `upsertMany` está coberto; as descobertas são consultas de listagem fora do S2-03 |
| `sync-project-*.service.js` | 100% | 66–80% | linhas novas cobertas | `:8` (parâmetro padrão `assertActive`) |
| `frontend/src/features/notifications/**` | 100% | 97,15% | ≥ 85% de ramos | `notification-view.js:101–102` e `:112–113` (rótulos de reserva para tipo de artefato desconhecido) |

## 8. Bloco M — métrica oficial recalculada

| Caso | Resultado |
|---|---|
| EV-M-01 | por RF, 7 eventos: 2 elegíveis, 2 entregues (100%), `NO_TASK` 1, `NO_PARTICIPANT` 1, `OUTSIDE_WINDOW` 1, `INACTIVE_ACCOUNT` 1, `INACTIVE_MEMBER` 1, `PREFERENCE_OFF` 1, recalculado a partir das linhas e igual ao `outcome` |
| EV-M-02 | em todo evento `DISPATCHED`: `created + alreadyNotified = eligible`; `participants = eligible + exclusões por par`; `NO_TASK = linkedTaskCount − tarefas vivas` |
| EV-M-03 | depois de uma retomada, o `outcome` dá `created: 0` e `alreadyNotified: 1`; cobertura de 0% por `created` e de 100% pela soma (A13 c) |
| EV-M-04 | sequência com falha do gancho e job: `created` somado das saídas = 6, `outcome` = 6, linhas = 6 |
| EV-M-05 | "quantidade de notificações emitidas" por tipo e período: consulta reproduzível (6 `ISSUE_EVENT`) |
| Fase 7 | carga no desenvolvimento: 336 elegíveis, 336 criadas, `OUTSIDE_WINDOW` 1; cobertura de 100% |

## 9. Bloco X — ASVS 5.0.0 L1+L2 na superfície do S2-03

| Requisito | Veredito | Evidência |
|---|---|---|
| V1.2.1, V3.2.2 | ATENDIDO | EV-U-03, F3 |
| V1.3.3 | ATENDIDO | EV-L-02 (a coluna recusa URL com mais de 512 caracteres), EV-U-04 |
| V2.1.3, V2.3.2 | ATENDIDO | EV-E-07, EV-J-02, EV-J-11, EV-D-02 |
| V2.3.3 | ATENDIDO | página tudo ou nada no experimento de trava e no EV-S-05 |
| V2.3.4 | ATENDIDO | bloco K, E10, G5 |
| V3.5.1 | ATENDIDO | EV-Z-04 |
| V4.1.1 | ATENDIDO | R8 |
| V8.1.1, V8.2.2, V8.3.1, V8.4.1 | ATENDIDO | bloco Z, EV-V-05, Fase 7 (isolamento) |
| V8.2.3, V15.3.1 | ATENDIDO | EV-L-01 |
| V13.2.4 | ATENDIDO | G14 |
| V14.1.1, V14.1.2, V14.2.4 | PARCIAL | A02 (perda na restauração), A09 (exportação), A13 e (aviso de privacidade) |
| V14.2.1, V14.3.2, V14.3.3 | ATENDIDO | EV-L-01, R8, EV-U-09 |
| V15.1.3, V15.2.2 | PARCIAL | orçamento do ⚑5 cumprido; custo declarado subestimado (A13 b) e página que nunca passa acima de ~8,5 ms (A03) |
| V15.3.3, V15.3.5, V15.3.6 | ATENDIDO | EV-F-03, EV-T-03 |
| V16.1.1, V16.2.1, V16.2.2, V16.2.5, V16.4.1 | ATENDIDO | EV-J-08, G11, EV-S-08 |
| V16.3.4 | PARCIAL | A01 (falha da página não registrada), A05 (estoque invisível) |
| V16.5.1 | PARCIAL | A06 (código interno e diagnóstico errado) |
| V16.5.2 | ATENDIDO | EV-C-02 (GitHub fora do ar não perde evento) |
| V16.5.3 | PARCIAL | A01 (execução presa em `RUNNING`) |
| V16.4.2, V16.4.3 | NÃO VERIFICÁVEL LOCALMENTE | S2-10 |

As justificativas de não aplicabilidade do delta (V1.3.x salvo V1.3.3, V1.5, V2.4, V3.x, V4.x, V5–V7,
V9–V12, V13.x salvo V13.2.4, V17) continuam válidas: nenhuma superfície nova as toca.

## 10. Bloco A — anexo de arquitetura

| Regra | Status | Evidência |
|---|---|---|
| §6.1 fluxo vertical | ATENDE | detecção, fila, despacho, job, API, UI, privacidade, testes e documentação |
| §6.2 sem mocks em produção | ATENDE | a carga fica no scratchpad |
| §6.3 RF nos commits | ATENDE | todos os commits `14e00be..34d7a9b` citam RF60 e RF61 |
| §6.4 contrato | PARCIAL | mudança declarada, sem data (A10) |
| §8.1 e §9 | ATENDE | `architecture:check`; `notifications` não importa `github`, `issues` nem `pullRequests` |
| §10.2 GitHub | PARCIAL | sincronização idempotente; erro de banco apresentado como do GitHub (A06) |
| §10.3 rastreabilidade | ATENDE | o evento não cria nem remove vínculo |
| §10.5 indicador | PARCIAL | oito itens presentes; termo "enviada" ambíguo (A13 c) |
| §11.1 banco | ATENDE | enum com os valores novos no fim; `onDelete` explícito; índice usado pela consulta de vencidos |
| §12 contrato | ATENDE | DR declarado; nenhuma divergência nova |
| §13.2 entrada de terceiros | ATENDE | título e URL limitados e exibidos como texto |
| §13.8 configuração | ATENDE | janela validada; `.env.example` com a variável |
| §13.9 auditoria | ATENDE | só o reprocessamento é auditado, coerente com a decisão do S2-02 |
| §13.10 erros e lotes | NÃO ATENDE | a falha da página não é registrada (A01) |
| §14 LGPD | PARCIAL | A02, A09, A13 e |
| §15 testes | PARCIAL | sem E2E de navegador (⚑2; S104-F02) |
| §16 CI | NÃO VERIFICÁVEL LOCALMENTE | sem push |
| §17.4 DoD | PARCIAL | E2E, CI e aprovação visual pendentes |
| §18 regra 17 | ATENDE | seção 15 |
| §20 ADR | ATENDE | ADR-018 com a estrutura mínima |

## 11. Bloco C — documento oficial e casos de uso

| Caso | Resultado |
|---|---|
| EV-C-01 UC04, passos 4 a 6 | ATENDE: a issue vinculada notifica, e a sem vínculo vira alerta, na mesma sincronização |
| EV-C-02 UC04, E2 | ATENDE para falha do GitHub (mensagem segura, o já gravado avisa, o resto vem depois); a falha de banco não é registrada (A01) |
| EV-C-03 UC04, E3 | ATENDE: com 403, o estado não muda e nada é avisado |
| EV-C-04 Quadro 3-57, "envolvidos" | ATENDE: recebem responsável, comentário e esforço; não recebem quem moveu, quem vinculou, o gestor nem quem não participa |
| EV-C-05 Quadro 3-57, "aberta" | ATENDE COM RESSALVA: vincular não avisa e reabrir avisa (D3); data aproximada (A04) |
| EV-C-06 Quadro 3-58 | ATENDE: merge e fechamento sem merge avisam; reabertura e PR nova não |
| EV-C-07 §3.2.8 | ATENDE: ações no TraceFlow não geram aviso do GitHub |
| EV-C-08 UC04, A1 | NÃO VERIFICÁVEL LOCALMENTE (PR #24) |

## 12. Bloco R — roadmap

| Item | Status |
|---|---|
| C1–C7, entregáveis, K1–K5 | seção 2 |
| Dependências | sincronização só manual até a PR #24; rastreabilidade disponível; S2-02 sem `VISUALLY APPROVED` |
| DoD §4, itens 5–6 | estados herdados do S2-02 e conferidos; **sem E2E** (S104-F02) |
| DoD §4, item 7 | CI não rodou (sem push) |
| Marco da Sprint 2 | o S2-03 só conta como homologado depois de: correção dos ALTA (A01, A02), aprovação visual, CI verde e agendador do job instalado (S2-08 e S2-09) |

## 13. Custo e orçamento (⚑5, ⚑6)

**Página de 100 PRs, no MySQL local** (EV-Q-01 e EV-Q-02):

| Transições | Tarefas por artefato | Instruções | Duração |
|---:|---:|---:|---:|
| 0 | — | 305 | 164 ms |
| 1 | 1, 5, 20 | 309 | 169–177 ms |
| 10 | 1, 5, 20 | 336 | 173–181 ms |
| 100 | 1 | 606 | 267 ms |
| 100 | 5 | 606 | 283 ms |
| 100 | 20 | 606 | 315 ms |

O número de tarefas por artefato não muda o número de instruções: o retrato de cada evento vai num
`INSERT` só.

**Com latência**, pelo proxy local com agendamento preciso:

| Latência efetiva | Sem transição | 100 transições |
|---:|---:|---:|
| 0,26 ms | 188 ms | 284 ms |
| 1,37 ms | 526 ms | 972 ms |
| 2,36 ms | 865 ms | 1.625 ms |
| 4,43 ms | 1.518 ms | 2.967 ms |
| 6,46 ms | 2.170 ms | 4.228 ms |
| 8,56 ms | 2.844 ms | `P2028` |
| 10,74 ms | 3.477 ms | `P2028` (duas vezes) |

A primeira tentativa usou `setTimeout`, que no Windows tem resolução de cerca de 15 ms; ela foi
descartada.

**Despacho** (EV-Q-05):

| Participantes | Tarefas | Notificações criadas | Duração |
|---:|---:|---:|---:|
| 1 | 1 | 1 | 17 ms |
| 10 | 1 | 10 | 16 ms |
| 100 | 1 | 100 | 29 ms |
| 1 | 50 | 50 | 23 ms |

**Job** (EV-Q-06): 1.000 eventos por execução em cerca de 9,1 s; 5.000 pendentes precisam de 5
execuções, cerca de 75 minutos com o timer de 15 minutos.

**Veredito do orçamento:**

| Item do orçamento | Limite | Medido | Resultado |
|---|---|---|---|
| Página com 100 transições e 5 tarefas por artefato, MySQL local | até 1 s | 283 ms | dentro |
| Mesma página com cerca de 2 ms de latência | abaixo de 2,5 s | 1.625 ms (2,36 ms efetivos) | dentro |
| Despacho de um evento com 10 participantes | até 50 ms | 16 ms | dentro |

Acima do orçamento fica o A03.

## 14. Fase 7 — roteiro manual (ambiente do João, 12/10/2026)

| Caso | Pré-condições | Resultado | Evidência |
|---|---|---|---|
| P7-01 extremo mínimo | conta 1, antes da carga | APROVADO: "Não lidas" vazio; "Todas" com os 6 avisos do S2-02 e nenhum do GitHub | DOM |
| P7-02 carga | aval do João | APROVADO: simulação e depois aplicação; 301 tarefas, 301 eventos | saída colada no registro da campanha |
| P7-03 job | aval do João | APROVADO: simulação com `wouldCreate` 336 e `OUTSIDE_WINDOW` 1; aplicação com 301 despachados, 336 criadas e 0 falhas; segunda execução com 0 varridos | saídas |
| P7-04 extremo em escala | conta 1 | APROVADO: contador "99+", cartões de PR e de issue; captura em 1536 px, tema escuro | captura |
| P7-05 Abrir tarefa e Abrir no GitHub | conta 1 | APROVADO: `/projects/4/kanban?task=2785` com o detalhe aberto; link do GitHub com `target="_blank"`, `rel="noopener noreferrer"` e nome com o número | DOM |
| P7-06 tipos soterrados (H15) | conta 1, "Todas" | ACHADO A08: primeiro aviso de tarefa na posição 301, depois de 15 "Carregar mais" | DOM |
| P7-07 isolamento | conta 9 | APROVADO: 36 avisos (18 de issue e 18 de PR), contador 36, todos de tarefas em que ela comentou ou registrou esforço; "[S2-03] Carga 002" ausente | DOM |
| P7-08 perda de acesso | membership da conta 9 desativada pela tela de equipe | APROVADO: na janela anônima, a conta 9 vê "0 projetos" e o menu sem contador | captura do João |
| P7-09 volta do acesso | membership reativada | APROVADO: contador 36 e os avisos do `[S2-01] Escala` de volta, no tema claro | captura do João |
| P7-10 alto contraste | `forced-colors: active` emulado no DevTools pelo João | APROVADO COM OBSERVAÇÃO: cartões, botões e menu com contorno e legíveis; as pílulas perdem o formato | captura do João |
| P7-11 limpeza | aval do João | APROVADO: 336 notificações, 301 eventos, 30 comentários, 12 esforços, 301 tarefas, 152 issues e 150 PRs removidos; nada restante nas tabelas ligadas; contas no estado anterior | saídas |

**O que veio da verificação técnica do mesmo dia:** larguras de 390, 768 e 1024 px por iframe, os dois
temas e a ordem de foco com o anel visível. O código de produção não mudou desde então.

**O que não foi capturado:** o anel de foco em alto contraste. O João optou por pular a captura
opcional.

## 15. O que não pôde ser validado

| Ponto | Motivo | Onde fecha |
|---|---|---|
| transição vinda de um repositório GitHub real | ⚑3: dublê nos testes e carga pelo `upsertMany` | homologação com repositório de teste |
| sincronização automática (UC04, A1) | PR #24 não integrada | merge da PR #24 |
| agendador real do job | nuvem não provisionada | S2-08 e S2-09 |
| CI remota | sem push | push pedido pelo João |
| E2E de navegador | ⚑2; sem infraestrutura | S104-F02 |
| várias instâncias da API e do job sob carga real | uma instância local | S2-10 |
| proteção e envio dos logs (V16.4.2, V16.4.3) | dependem do ambiente | S2-10 |
| latência real da nuvem | medida com proxy local | S2-08 |
| métrica com dados reais | só cenário controlado e carga sintética | S3-01 |
| anel de foco em alto contraste | captura opcional não feita | homologação visual do João |
| consulta periódica no Chrome automatizado | a aba oculta não roda o temporizador | verificação manual |

## 16. Correções (13/10/2026)

O enunciado está em [S2_03_PROMPT_CORRECOES.md](S2_03_PROMPT_CORRECOES.md), com os 13 pontos de decisão
aprovados pelo João em 13/10/2026. Cada correção nasceu de um teste vermelho pelo motivo do achado,
salvo as correções só documentais (A13 a e c). Nesse caso, o teste fixa o comportamento real que a
regra passou a descrever.

| Achado | Commit | Testes | Resultado |
|---|---|---|---|
| A13 a, c, d, e (documentos) | `be3cf2b` | C0-01 (R-T05 reescrito), C0-02 (EV-M-03) | regra, ADR-018, contrato, runbooks, delta ASVS e aviso de privacidade revistos |
| A06 | `5c53685` | C1-01 (R-H4), C1-02, C1-03 | erro de banco sai com `GITHUB_SYNC_STORAGE_FAILED`; o código do Prisma só no log (`causeCode`) |
| A01 | `b41727a` | C2-01 (EV-S-04), C2-02 a C2-05 | trava esperada por no máximo 5 s (`GITHUB_SYNC_PROJECT_BUSY`); falha sempre gravada; ganchos sempre |
| A03, A13 b | `1c9ff37` | C3-01 (R-Q01), C3-02, C3-03 | 100 transições custam o mesmo que 1 (309 instruções; antes, 606) |
| A02 | `bb09a9b` | C4-01 a C4-03; EV-E-06 reescrito | evento de projeto excluído despachado, oculto até a restauração |
| A05, A11, A12 | `8e40f22` | C5-01 (EV-J-09), C5-02 (EV-J-10), C5-03 (EV-K-03), C5-04 | `failedStock`, `dueAfter`, `oldestDueAgeSeconds` e `claimLost` |
| A13 f | `3051997`, `87ff81b` | C6-01 | `stdout` dos dois jobs só com o relatório |
| A09, A10 | `532c466` | C7-01 (EV-D-01), C7-02 (EV-F-02) | URL revalidada na exportação; mensagem para recarregar a página |
| A08 (API) | `5590547` | C8-01 a C8-03 | filtro `group` |
| A04, A07, A08 (central) | `e7fb492` | C9-01 (EV-U-05) a C9-04 | texto da reabertura, nomes acessíveis com o contexto, grupo "Origem" |

**Desvios em relação ao prompt:**

1. **A01, gravação da falha.**
   - O prompt previa novas tentativas no mesmo pool. Elas não bastaram: depois de um `P2028` com consulta em andamento, a conexão devolvida ao pool fica dessincronizada.
   - No C2-04, a mesma conexão respondeu `P2025` às três tentativas, leu vazio por mais de 750 ms e, numa inserção de auditoria, derrubou uma thread do motor do Prisma ("Could not figure out an ID in create"), capturada como erro.
   - A gravação passou a usar, depois de erro de conexão, um cliente de recuperação com pool próprio (`src/database/recovery-prisma.js`), que era a alternativa do próprio relatório.
   - O efeito sobre outras requisições é do S202-F29, que subiu para MÉDIA com essa evidência.
2. **Rótulo da origem.** O prompt dizia "Todas"; ficou "Todas as origens", porque dois rádios chamados "Todas" na mesma tela confundiam leitor de tela e testes.
3. **C7-01.** Saiu a URL de 513 caracteres, que a coluna não aceita. Entrou a de 512, que continua válida.
4. **C9-01.** "Abrir tarefa" mantém o mesmo nome nos dois cartões, como decidido no ponto 7 (destino igual). A reprodução EV-U-05 exigia nomes distintos também ali.
5. **Testes reescritos.** Além dos listados no prompt, o F2 de `Notifications.github-events.test.jsx` fixava o texto antigo da reabertura e foi reescrito antes da correção.
6. **Sincronização sem `NOWAIT`.** As sugestões de commit continuam esperando a trava, porque servem também a uma ação de usuário (S202-F29). O gancho de alertas do S2-01, que roda depois da sincronização, também.

**Medição de latência depois do A03** (proxy da campanha, banco de teste):

| Latência efetiva | Sem transição | 100 transições |
|---:|---:|---:|
| 2,37 ms | 931 ms | 884 ms |
| 8,67 ms | 2.847 ms | 2.885 ms |
| 10,66 ms | 3.479 ms | 3.495 ms |
| 14,71 ms | 4.812 ms | 4.939 ms |
| 17,58 ms | `P2028` | `P2028` |

A página-base, anterior ao S2-03, passa dos 5 s por volta de 15 ms (S203-F22, para o S2-08).

**Verificação:**

| Item | Resultado |
|---|---|
| Suíte completa do backend, duas vezes | 2.228 verdes, idênticas nas duas rodadas; só a falha de ambiente `EPERM` de symlink (`storage.test.js`) |
| Gates do backend | `lint`, `format:check`, `architecture:check` e `security:secrets` verdes |
| Frontend | os nove arquivos da central e das preferências verdes isolados; bateria e modelo de exibição verdes em `America/Sao_Paulo`, `Pacific/Kiritimati`, `Pacific/Pago_Pago` e `UTC`; `lint`, `format:check` e `build` verdes |
| Mutantes das correções (MC01–MC17) | 17 de 17 mortos, cada um pelo teste da correção |
| Mutantes da campanha (MT01–MT38) | 37 de 37 aplicáveis mortos; MT10 ("janela antes do projeto excluído") obsoleto com a saída de `PROJECT_DELETED`; MT32 e MT38 com o trecho atualizado |
| Mutantes da implementação (MS01–MS25, 31 com variantes) | 31 de 31 mortos; MS04, MS05, MS06 e MS12a com o trecho atualizado para o código em lote e a exclusão nova |
| Código de produção depois das mutações | intacto (`git diff` vazio em `backend/src`, `backend/scripts` e `frontend/src`) |
| EXPLAIN com 50.000 eventos despachados | a busca dos vencidos e a pendência vencida mais antiga usam o índice `(status, nextAttemptAt)`; `findDueEventIds` em cerca de 1 ms e `queueSummary` em 1 a 3 ms |
| Coautoria | `git log --format='%h [%(trailers)]' fd62f97..HEAD` sem nenhum trailer nos commits das correções |

**Vereditos depois das correções:**
- **C1:** atende, com a data da reabertura declarada como aproximação e o texto do cartão honesto.
- **C5:** atende: a página que falha é registrada e libera a próxima sincronização, o estoque de `FAILED` aparece em toda execução, e o evento de projeto excluído não se perde.
- **C7:** atende: "enviada corretamente" está definida pelo `outcome`.
- **K3 e K4:** atendem.

**O que continua pendente:**
- a verificação visual das mudanças da central no ambiente do João (Fase 11 do prompt) e o `VISUALLY APPROVED`;
- E2E (S104-F02), CI remota e agendador do job;
- o S202-F29, agora MÉDIA com a evidência do C2-04.
