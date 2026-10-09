# Relatório de testes do S2-01 — alertas de rastreabilidade (RF13, RF39, RF40, RF58)

Campanha descrita em [S2_01_PROMPT_TESTES_ALERTAS.md](S2_01_PROMPT_TESTES_ALERTAS.md), com o mapa
de casos em [S2_01_MAPA_TESTES.md](S2_01_MAPA_TESTES.md).

| Item | Valor |
|---|---|
| Executada em | 08/10/2026 |
| Branch | `joao-dev-v2` local, sem push |
| Base | `a81c93c` |
| Commits | `63ce765` (Fase 1), `5a1b0e0` (2), `2184f4e` (3), `405413c` (4), `2026817` (5), `412590a` (6) e o deste relatório (8) |
| Aval dos ⚑ (08/10, "pode seguir") | 1 registrar sem corrigir; 2 roteiro manual em vez de E2E; 3 GitHub real se houver repositório de teste; 4 esta campanha antes da de conformidade; 5 medir o desempenho sem reprovar |
| Código de produção | intocado: `git diff --exit-code -- backend/src frontend/src` limpo depois de cada fase e da mutação |
| Fase 7 (roteiro manual) | **pendente**: depende do ambiente do João (seção 13) |

## 1. Resumo

**O núcleo do S2-01 se sustenta.** Detecção, resolução, deduplicação, concorrência, autorização e
isolamento resistiram a 242 casos novos e a 26 mutantes:
- 24 mutantes mortos;
- 2 equivalentes, com justificativa na seção 6.

**A campanha encontrou 9 achados:**
- 1 ALTA, numa dependência do cartão: o sync do GitHub;
- 3 MÉDIAS;
- 5 BAIXAS.

**O cartão continua "concluído em implementação, aberto em homologação".** O DoD comum do roadmap não
se cumpre enquanto faltarem:
- E2E;
- CI;
- o roteiro manual;
- a homologação com GitHub real.

| Números | Valor |
|---|---|
| Testes do S2-01 antes da campanha | 122 execuções: 94 no backend, 28 no frontend (93 declarações `it`, porque `it.each` multiplica casos) |
| Testes novos | 242 execuções: API 26; integração 23; unidade 182; frontend 11 |
| Suíte do S2-01 depois da campanha | 325 no backend, 39 no frontend, todos verdes |
| Suíte completa do backend, duas vezes | 1663 verdes e 1 falha de ambiente idêntica nas duas: `storage.test.js` do S1-07, `EPERM` ao criar symlink no Windows, preexistente e sem relação com o S2-01 |
| Gates | `lint`, `format:check`, `architecture:check` e `security:secrets` do backend; `lint`, `format:check` e `build` do frontend; todos verdes |
| Mutação | 26 mutantes: 22 mortos na primeira rodada; 2 mortos depois de testes matadores novos; 2 equivalentes |
| Cobertura dos arquivos do S2-01 | backend 100% de linhas e 97,2% de ramos; frontend 96,6% de linhas e 85,7% de ramos |

## 2. Veredito por critério do cartão

| Critério | Veredito | Sustentação |
|---|---|---|
| C1 tarefa concluída sem commit gera alerta com tarefa, tipo e data | **ATENDE COM RESSALVA** | AT-T-01/02/03/07, I1, tabela de decisão de 40 linhas. Ressalvas: tarefa concluída antes do histórico de status fica sem data (`COMPLETION_TIME_UNAVAILABLE`, limitação documentada na ADR-015); conectar o repositório não gera o alerta até o próximo sync (S201-A01) |
| C2 PR mesclada e issue fechada sem tarefa geram alertas equivalentes | **ATENDE COM RESSALVA** | AT-G-01..10, I7–I11 e DTO idêntico entre tipos. Ressalvas: o alerta só nasce no fim do sync (S201-F02); **uma PR ou issue com título acima de 191 caracteres derruba o sync inteiro e nenhum alerta nasce** (S201-A03) |
| C3 tarefas sem artefato técnico podem ser listadas | **ATENDE** | API RF58, AT-Q-12/13, M10 morto |
| C4 reprocessamento não duplica alertas ativos | **ATENDE** | AT-R-01, AT-C-01/02, I14, M07 e M08 equivalentes, M09 morto |
| C5 correção resolve o alerta conforme a regra documentada | **ATENDE** | todos os motivos e a precedência por estado real (AT-E-04), M04 morto |
| C6 consultas respeitam projeto, perfil e paginação | **ATENDE** | AT-Q-01..13, AT-D-01/08, AT-V-04, M11, M13, M14 e M18 mortos |
| K1 eventos, estados e chave de deduplicação | **ATENDE** | ADR-015, `TRACEABILITY_ALERTS.md`, I16, I18 |
| K2 persistência e migration | **ATENDE** | coluna gerada `STORED` (I18) e FKs com `onDelete` explícito; a migration ainda não passou pela CI |
| K3 processamento idempotente e consultas | **ATENDE** | AT-R-01, AT-S-05, AT-Q |
| K4 interface de alertas | **ATENDE COM RESSALVA** | F1–F16 e a bateria de frontend. Ressalvas: falha só no resumo deixa a tela "carregando" para sempre (S201-A06); roteiro manual e aprovação visual pendentes |
| K5 detecção, concorrência, autorização e resolução testadas | **ATENDE** | blocos T, G, C, D, E e X |

## 3. Achados

### [ALTA] S201-A03 — título de PR ou issue acima de 191 caracteres derruba o sync inteiro

- **Onde:**
  - `backend/src/modules/github/github.mapper.js:41` e `:71` (`title: item.title`, sem limite);
  - colunas `PullRequest.title` e `Issue.title` `VARCHAR(191)`
    (`20260606120000_create_pull_request_model`, `20260606130000_create_issue_model`).
- **Norma:**
  - cartão S2-01, C2;
  - dependência "sincronização GitHub" (RF04, RF05);
  - §10.2 do anexo de arquitetura ("validar respostas… antes de persistir").
- **Esperado:** toda PR mesclada sem tarefa gera alerta. O GitHub aceita títulos de até 256 caracteres.
- **Observado:** um sync com uma PR de título de 200 caracteres, uma PR normal e uma issue de título
  de 256 caracteres terminou `FAILED`:
  - etapa `PULL_REQUESTS`, `error.code` `P2000`;
  - 0 PRs e 0 issues gravadas;
  - 0 alertas.
- **Reprodução:** sync com o cliente GitHub simulado (o mesmo de
  `s201-traceability-alerts-sync.test.js`), com `{ ...mergedPullRequest(1, AFTER_CUTOFF), title: 'x'.repeat(200) }`.
  A saída foi capturada durante a campanha.
- **Consequência:** enquanto existir uma PR ou issue com título longo no repositório, todo sync
  falha. Nenhuma PR nem issue nova é importada, e nenhum alerta RF39/RF40 nasce.
- **Proposta:**
  - truncar o título no mapper, por caractere, como `truncateTitle` já faz no snapshot, ou alargar a
    coluna para 256 por migration;
  - regressão com título de 192 e 256 caracteres no sync.

### [MÉDIA] S201-A01 — conectar o repositório ativa a regra do RF13 sem gerar o alerta (H2)

- **Onde:**
  - `PUT /api/projects/:projectId/github/integration` (`github.repository.js:185`), que não
    reconcilia;
  - a tela usa essa rota em `reconnectProject` (`ProjectsScreen.jsx:503`), sem sync em seguida.
- **Norma:** `TRACEABILITY_ALERTS.md` ("um alerta está ativo enquanto a condição do seu tipo for
  verdadeira"); C1.
- **Esperado:** tarefa concluída sem commit num projeto que passa a ter integração tem alerta.
- **Observado:** `rules.taskWithoutCommitActive=true` e `open.total=0` até o próximo sync ou
  reprocessamento.
- **Reprodução:** AT-T-09, cujo bloco foi preservado fora da suíte:
  1. projeto sem integração;
  2. tarefa concluída pela API;
  3. `PUT …/github/integration`;
  4. `GET …/alerts/summary`.
- **Consequência:** a tela diz que a regra está ativa e mostra zero alertas, embora existam tarefas
  na condição.
- **Proposta:** reconciliar o projeto, em transação própria, ao conectar a integração. É o mesmo
  gatilho do fim do sync.

### [MÉDIA] S201-A06 — falha só no resumo deixa "Carregando resumo dos alertas..." para sempre

- **Onde:** `TraceabilityAlertsScreen.jsx`, que usa `useAlertSummary(projectId)` sem ler `error`.
  Ele mostra `summary ? … : 'Carregando resumo dos alertas...'`.
- **Norma:** DoD comum do roadmap §4 ("estados de carregamento, vazio, erro e acesso negado são
  tratados").
- **Esperado:** erro com nova tentativa quando o resumo falha.
- **Observado:** a lista carrega, e o resumo fica eternamente "Carregando…", sem contador na
  sub-navegação nem nova tentativa.
- **Reprodução:** `getTraceabilityAlertSummary` rejeitado e `getTraceabilityAlerts` resolvido.
  O caso de frontend da campanha falha, e o bloco foi preservado.
- **Consequência:** estado enganoso. O usuário não sabe que precisa recarregar.
- **Proposta:** expor `error` e `retry` do hook e renderizar `ErrorState` no lugar da frase de carga.

### [MÉDIA] S201-A07 — sem E2E de navegador (H6)

- **Norma:** §15.2 do anexo de arquitetura ("testes end-to-end para fluxos críticos"); DoD §4 do
  roadmap. O §15.3 inclui "vínculo e remoção de rastreabilidade".
- **Observado:** não há Playwright, Cypress nem job na CI. A falta já está registrada em S104-F02,
  E15-F10 e L1-F03.
- **Classe:** **DX**. O roadmap do repositório trocou "E2E" por "frontend automatizados" no S1-01 sem
  decisão de dispensa.
- **Proposta:** decisão de arquitetura (§20, "framework de testes") que vale para todos os cartões.
  Até lá, o cartão não pode ser marcado concluído pelo DoD (⚑2).

### [BAIXA] S201-A02 — "10 a 500 caracteres" é medido em unidades UTF-16 (H3)

- **Onde:**
  - `traceability.validation.js:97–103` (`z.string().trim().min(10).max(500)`);
  - `alert-view.js:100–105` (`.trim().length`);
  - `AlertDismissForm.jsx` (contador e `maxLength=500`).
- **Norma:**
  - contrato e `TRACEABILITY_ALERTS.md` ("10 a 500 caracteres");
  - coluna `dismissalReason VARCHAR(500)`, que conta caracteres;
  - ASVS V2.1.3.
- **Esperado:** 5 emojis recusados (5 caracteres) e 500 emojis aceitos.
- **Observado:**
  - servidor: 5 emojis → 200, 8 emojis + 1 letra → 200, 500 emojis → 400, 501 → 400;
  - tela: 5 emojis exibem "10 de 500 caracteres · mínimo 10" e o envio é aceito.
- **Reprodução:** AT-D-04 (bloco preservado) e um teste temporário do formulário.
- **Consequência:** limite inconsistente para texto com emoji ou outros caracteres fora do BMP. O
  servidor e a tela concordam entre si, mas não com a especificação.
- **Proposta:**
  - contar por caractere (`Array.from`) nos dois lados e trocar o `maxLength` do campo por validação
    própria;
  - ou documentar a unidade como "unidades UTF-16".

### [BAIXA] S201-A04 — documentação do S2-01 diverge do contrato e do código (H1)

- **ADR-015, impactos de segurança:** diz que "o reprocessamento usa o mesmo limitador do sync
  manual". O contrato e o código (`rate-limit.js:140`) usam limitador **próprio**
  (`traceability-alerts-reconcile`), com a mesma janela e o mesmo teto.
- **ADR-015, "papel insuficiente recebe 403" na leitura:** é inalcançável, porque VIEWER é o papel
  mínimo e toda membership ativa lê.
- **Tabela de erros do S2-01 em `API_CONTRACTS.md`:** lista só `TRACEABILITY_ALERT_NOT_FOUND`,
  `TRACEABILITY_ALERT_NOT_OPEN` e `FORBIDDEN`. As rotas também devolvem `RESOURCE_NOT_FOUND` (não
  membro), `AUTHENTICATION_REQUIRED`, `CSRF_INVALID`, `VALIDATION_ERROR` e `RATE_LIMITED`, conforme
  os corpos capturados na campanha.
- **Proposta:** corrigir a ADR-015 e completar a tabela.

### [BAIXA] S201-A05 — falha da reconciliação pós-sync é invisível ao usuário (H5)

- **Norma:** o §13.10 do anexo diz para não ocultar falha de persistência como sucesso. A ADR-015 D5
  decide que a falha só vai para o log.
- **Observado (AT-S-03):**
  - o sync termina `SUCCEEDED`;
  - o resumo não tem campo que indique alertas desatualizados;
  - só o reprocessamento manual recupera.
- **Classe:** DL, porque a ADR posterior e implementada prevalece sobre o anexo pela §3 deste. Mesmo
  assim, o risco aceito não está visível na interface.
- **Proposta:** registrar no resumo o instante e o resultado da última reconciliação, ou sinalizar a
  falha no sync.

### [BAIXA] S201-A08 — o cartão do Kanban relaxa a dependência (H7)

O quadro diz "Dependências: Sprint 1". O roadmap diz "Sprint 1 **concluída**".

A Sprint 1 não está formalmente concluída:
- o S1-04 está "aberto em homologação";
- o S1-09 aguarda revalidação independente.

**Classe DX.** Cabe ao João decidir se ajusta o cartão do quadro ou registra a antecipação.

### [BAIXA] S201-A09 — módulo de alertas fora da organização do §9 do anexo (H10)

- **Observado:** o anexo prevê `backend/src/modules/alerts/`, e o S2-01 vive em
  `modules/traceability/traceability-alert.*`. A ADR-015 decide a UI (D7), não o módulo.
- **Classe:** DR. A escolha não tem registro.
- **Proposta:** uma linha na ADR-015, ou na próxima ADR de notificações (S2-02), registrando onde
  vivem alertas e notificações.

### Observações (sem achado)

| ID | Observação |
|---|---|
| O-1 | O truncamento do snapshot é defensivo e nunca ocorre: todas as fontes de título já têm no máximo 191 caracteres. O teste existente "sem partir caracteres compostos" só prova pares substitutos; sequências com ZWJ ou acento combinante podem ser cortadas (a bateria prova o que a especificação pede: até 191 caracteres e nenhum substituto partido) |
| O-2 | A regra MANAGER do middleware é ancorada em `$`, e a regra do sync aceita barra final (`(?:\/|$)`). `…/dismiss/` e `…/reconcile/` passam pelo middleware como MEMBER e são recusadas pela revalidação do serviço. H4 refutada, com uma camada a menos nessas variantes |
| O-3 | O reprocessamento informa `created`, `resolved` e `kept`, sem ignorados nem erros (§13.10 do anexo). Na prática, ignorados são sempre 0, porque o lock serializa (M07 equivalente) |
| O-4 | A paginação por deslocamento pode repetir alertas quando outros nascem entre duas páginas. Nenhum se perde (AT-Q-05), e a tela já mescla por id (F3) |
| O-5 | `00<id>` responde o mesmo alerta, conforme o contrato ("inteiro decimal positivo") |
| O-6 | A regra do RF13 considera a existência de `ProjectGitHubIntegration`, qualquer que seja o status da integração, como documentado |
| O-7 | A justificativa da dispensa é preservada na anonimização de quem dispensou e não entra na exportação do titular. Está documentado no inventário de dados pessoais, com o risco de PII de terceiros: decisão a validar com o responsável jurídico (§14 do anexo) |
| O-8 | Todo erro HTTP é registrado com `requestId`, método, rota e código, mas no nível `error`, inclusive 4xx, e sem o ator na linha |
| O-9 | `githubUrl` vem do GitHub e é exibido sem validação de esquema. Um `javascript:` é neutralizado pelo React 19 (AT-U-09), não pelo TraceFlow; o §13.2 do anexo pede validar o que vem do GitHub antes de persistir ou exibir |

## 4. Hipóteses H1–H10

| ID | Resultado | Onde |
|---|---|---|
| H1 limitador descrito diferente | **confirmada** | S201-A04 |
| H2 conectar o repositório não gera o alerta | **confirmada** | S201-A01 |
| H3 justificativa em unidades UTF-16 | **confirmada** | S201-A02 |
| H4 variante de caminho burla MANAGER | **refutada**: o serviço segura (AT-D-08, AT-R-03, M13, M14, M18) | O-2 |
| H5 falha pós-sync invisível | **confirmada** como risco aceito | S201-A05 |
| H6 sem E2E | **confirmada** | S201-A07 |
| H7 versões do cartão divergem | **confirmada** | S201-A08 |
| H8 C1 sem data para tarefa antiga | **confirmada** como ressalva documentada (ADR-015), sem achado | C1 |
| H9 "vínculo técnico" ambíguo | **refutada**: a tela RF58 define o termo ("sem commit, pull request ou issue"), e o catálogo de requisitos usa outro nome ("evidência técnica"). A Fase 7 confere se a diferença é perceptível | — |
| H10 módulo fora do §9 | **confirmada** | S201-A09 |

## 5. Casos executados

| Bloco | Arquivo | Casos novos | Resultado |
|---|---|---:|---|
| T, G, E, D, Q, R e S na API | `backend/test/api/s201-bateria.test.js` | 26 | verdes; AT-T-09 e AT-D-04 falharam (A01, A02) e ficaram fora do commit, com o bloco preservado |
| T, G, E, Q, C, V, R, logs | `backend/test/integration/s201-bateria.test.js` | 23 | verdes; a primeira versão do AT-T-11 revelou o S201-A03 |
| Tabelas de decisão, DTO, papel no middleware | `backend/test/unit/s201-bateria.test.js` | 182 | verdes |
| U | `frontend/test/pages/TraceabilityAlerts.bateria.test.jsx` | 11 | verdes; o caso do resumo (A06) ficou fora do commit, com o bloco preservado |

**Casos que confirmam o comportamento esperado em pontos de risco:**
- **Isolamento e papéis:**
  - um alerta de outro projeto e um id inexistente devolvem 404 idênticos (AT-Q-10);
  - um papel rebaixado entre a leitura e a dispensa recebe 403 (AT-V-04).
- **Leituras sem efeito:** leituras não criam, não resolvem e não auditam alertas (AT-Q-11).
- **Validação:**
  - ids `0`, `-1`, `1e2`, `1.5`, `abc`, `2147483648` e `99999999999999999999` nunca geram 500;
  - query repetida (`status=OPEN&status=RESOLVED`) responde 400.
- **Concorrência:**
  - a dispensa disputando com a resolução nunca termina em `DISMISSED` com a condição falsa (8
    rodadas);
  - duas dispensas simultâneas produzem uma vencedora e uma auditoria;
  - uma falha no meio de uma mutação desfaz tudo (AT-C-05).
- **Ciclo de vida:**
  - projeto em exclusão esconde os alertas, e a restauração os devolve intactos;
  - a anonimização pseudonimiza o autor da dispensa;
  - o script recusa aplicar em banco de produção sem `--confirm-production`.
- **Logs e auditoria:** nem os logs nem a auditoria levam justificativa ou título; uma quebra de
  linha forjada no título não vira linha nova de log.

## 6. Bateria de mutação

Cada mutante foi aplicado por substituição exata, rodado contra as dez suítes do S2-01 no backend ou
as quatro do frontend, e restaurado byte a byte, com verificação. Ao fim, `git diff` estava limpo.

| Mutante | Alteração | Resultado | Morto por |
|---|---|---|---|
| M01 | corte `>=` vira `>` | morto | AT-G-01/02 |
| M02 | PR vinculada silencia o RF13 | morto | API "detalha alerta de tarefa com PR vinculada" |
| M03 | RF13 ignora a integração | morto | AT-T-01/02 |
| M04 | commit antes de exclusão na precedência | morto | tabela de decisão do RF13 |
| M05 | `occurredAt` cai para `updatedAt` | morto | "o fato… da tarefa vem só do histórico" |
| M06 | truncamento por unidade UTF-16 | morto | snapshot do título |
| M07 | `skipDuplicates: false` | **equivalente** | toda criação ocorre sob `lockActiveProject` (`FOR UPDATE` no projeto); a transação seguinte lê o ativo já criado e não tenta inserir. Nenhum escritor do produto insere alerta sem o lock |
| M08 | resolução sem a guarda `status IN ('OPEN','DISMISSED')` | **equivalente** | os ids a resolver são lidos como ativos dentro da mesma transação travada; a dispensa também trava o projeto; nenhum escritor muda o status sem o lock |
| M09 | sem `lockActiveProject` | morto | AT-C-01 |
| M10 | RF58 ignora `TaskIssue` | morto | API RF58 |
| M11 | resumo sem filtro de projeto | morto na 2ª rodada | AT-Q-06 "não conta alertas de outro" (novo) |
| M12 | listagem `detectedAt asc` | morto | AT-Q-04 |
| M13 | sem revalidação MANAGER na dispensa | morto | AT-D-08 |
| M14 | sem revalidação MANAGER no reprocessamento | morto | AT-R-03 |
| M15 | `reconcileAfterSync` relança | morto | AT-S-03 |
| M16 | dispensa repetida sobrescreve | morto | API "é idempotente…" |
| M17 | sync com falha não reconcilia | morto | I12 |
| M18 | sem regra MANAGER no middleware | morto na 2ª rodada | "papel exigido no middleware" (novo) |
| M19 | justificativa sem `trim` | morto | AT-D-03 |
| M20 | máximo 501 | morto | API "valida a justificativa…" |
| M21 | sem limitador | morto | AT-R-04 |
| M22 | DTO expõe `dedupeKey` | morto | AT-G-10 |
| M23 | `GET` reconcilia | morto | AT-Q-11 |
| M24 | dispensar com `canLink` | morto | F7 |
| M25 | formulário sem `trim` | morto | VIEW "valida a justificativa…" |
| M26 | título como HTML | morto | AT-U-09 |

## 7. Cobertura dos arquivos do S2-01

**Backend** (suítes do S2-01, `--coverage.include` nos arquivos `traceability-alert*`):

| Arquivo | Linhas | Ramos | Meta | Situação |
|---|---:|---:|---|---|
| `traceability-alert.policy.js` | 100% | 100% | 100% | atingida |
| `traceability-alert.mapper.js` | 100% | 100% | ≥ 90% de ramos | atingida |
| `traceability-alert.repository.js` | 100% | 92% | ≥ 90% | atingida |
| `traceability-alert.service.js` | 100% | 97,9% | ≥ 90% | atingida |

**Frontend:** 96,6% de linhas e 85,7% de ramos no conjunto do S2-01. Abaixo de 85% de ramos, por
arquivo:

| Arquivo | Ramos | Justificativa |
|---|---:|---|
| `AlertDetails.jsx` | 76,7% | linha 57: contexto de issue sem sujeito, coberto no mapper; linhas 89–90: falha ao reler um detalhe já carregado; linhas 168–174: retorno do passo de vínculo para o detalhe. Todos são caminhos de UI sem regra de domínio |
| `AlertLinkTask.jsx` | 78,6% | linha 37: retorno após cancelar a confirmação, coberto como fluxo em F11 (o ramo é contado em outra expressão); linha 62: limpar a seleção |
| `useAlertSummary.js`, `useUnlinkedTasks.js`, `useTraceabilityAlerts.js` | 50–82% | guardas `scope.accepts(...)`, que descartam respostas obsoletas de requisições sobrepostas; F5 cobre a guarda da lista. A falha do resumo é o S201-A06 |
| `alert-view.js` | 84,8% | rótulos de reserva para valores fora do contrato (`'Situação indisponível'`, `'Motivo indisponível'`) e `formatInstant('')` |

## 8. Bloco X — ASVS 5.0.0 L1+L2 na superfície do S2-01

| Requisito | Veredito | Evidência |
|---|---|---|
| V1.2.1, V3.2.2 | ATENDIDO | AT-U-09; M26 morto (ver O-9) |
| V2.1.3 | **PARCIAL** | os limites estão documentados, mas a unidade de "caracteres" não é definida e diverge da implementação (S201-A02) |
| V2.3.2 | **PARCIAL** | 100 e 191 implementados como documentado; os 500 "caracteres" não (S201-A02) |
| V2.2.1, V2.2.2 | ATENDIDO | `strictObject`; AT-D-03/05, AT-Q-01/02; validação no servidor |
| V2.3.1 | ATENDIDO | só `OPEN` é dispensável (409 `TRACEABILITY_ALERT_NOT_OPEN`) |
| V2.3.3 | ATENDIDO | AT-C-05 |
| V2.3.4 | ATENDIDO | AT-C-01..04, I14, I16 |
| V2.4.1 | ATENDIDO | AT-R-04; M21 morto |
| V3.5.1, V3.5.3 | ATENDIDO | CSRF (`CSRF_INVALID`); AT-Q-11; M23 morto |
| V4.1.1 | ATENDIDO | headers das seis rotas e dos erros |
| V8.2.1, V8.3.1 | ATENDIDO | middleware e serviço; M13, M14 e M18 mortos; AT-V-04 |
| V8.2.2, V8.4.1 | ATENDIDO | AT-Q-10, AT-Q-06 (M11) e AT-Q-13 |
| V8.2.3 | ATENDIDO | DTO sem campos internos; M22 morto |
| V14.2.1 | ATENDIDO | a query só carrega situação, tipo e paginação |
| V14.3.2 | ATENDIDO | `Cache-Control: no-store` em sucesso e erro |
| V15.1.3 | **PARCIAL** | custo medido e baixo (seção 12), mas a reconciliação não está documentada como operação custosa nem tem orçamento |
| V15.2.2 | ATENDIDO | limitador, lock e medição |
| V15.3.1, V15.3.3, V15.3.5, V15.3.7 | ATENDIDO | AT-Q-09, AT-D-05, AT-D-09, AT-Q-02 |
| V16.2.1 | **PARCIAL** | a linha de erro tem quando, onde e o quê, mas não quem; a correlação depende do `requestId` (O-8) |
| V16.3.2 | ATENDIDO | todo 403 e 404 é registrado pelo tratador de erros |
| V16.3.3 | ATENDIDO | auditoria da dispensa e do reprocessamento |
| V16.4.1 | ATENDIDO | AT-S-02 (quebra de linha forjada não vira linha) |
| V16.5.1 | ATENDIDO | mensagens genéricas, sem eco (AT-D-03) |
| V16.5.2, V16.5.3 | **PARCIAL** | falha segura, sem estado corrompido, mas silenciosa (S201-A05) |
| V14.1.1, V14.2.4 | ATENDIDO | inventário de dados pessoais (linha S2-01), com a O-7 a validar |

## 9. Bloco A — anexo de arquitetura

| Regra | Veredito | Evidência |
|---|---|---|
| §6.1 fluxo vertical | CONFORME | banco, API, UI, autorização, testes, documentação e matriz RF |
| §6.2 sem mocks em produção | CONFORME | nenhum dado simulado no caminho dos alertas |
| §6.3 RF nos commits | CONFORME | 7 de 9 commits do S2-01 citam RFs; os outros dois são registro de backlog e log visual |
| §8.1 camadas | CONFORME | `architecture:check` verde |
| §9 organização por domínio | NÃO CONFORME (DR) | S201-A09 |
| §11.1 enums e FKs | CONFORME | enums do Prisma nos estados; FKs com `onDelete` explícito (projeto `CASCADE`; tarefa, PR, issue e usuário `SET NULL`) |
| §12.1–12.4 contrato | NÃO CONFORME com o anexo (DR) | `/api` em vez de `/api/v1`, `limit` em vez de `pageSize`, sem envelope `{data, meta}`, erro plano `{message, code, requestId}`. O formato está documentado no `API_CONTRACTS.md` e é aplicado de forma consistente pelo S2-01, mas nenhuma ADR o registra (§20). A divergência é transversal e segue para a campanha de conformidade |
| §13.9 auditoria | CONFORME | dispensa e reprocessamento auditados; detecção e resolução automáticas só em log, com contagens |
| §13.10 erros e lotes | PARCIAL | S201-A05, O-3 |
| §14 LGPD | CONFORME, com a O-7 | inventário atualizado no S2-01 |
| §15 testes | NÃO CONFORME (DX) | S201-A07 |
| §17.4 DoD | PARCIAL | CI não executada (sem push), E2E ausente, roteiro manual pendente |

## 10. Bloco M — roadmap

| Item do DoD comum (§4) aplicado ao S2-01 | Status |
|---|---|
| funciona de ponta a ponta | **PARCIAL**: alertas de GitHub só no fim do sync (S201-F02); S201-A03; GitHub real pendente |
| regras e autorização no backend | EVIDENCIADO |
| banco, API e interface no mesmo contrato | EVIDENCIADO (DTO idêntico entre tipos; contexto por tipo) |
| migrations novas, versionadas e testadas | EVIDENCIADO localmente (I18); a CI não rodou |
| estados de carregamento, vazio, erro e acesso negado | **PARCIAL**: S201-A06 |
| testes de unidade, integração, frontend e E2E | **PARCIAL**: sem E2E (S201-A07) |
| CI verde | **AUSENTE**: commits não publicados |
| ASVS e LGPD avaliados | EVIDENCIADO (este relatório; delta da baseline; inventário) |
| documentação e matriz RF atualizadas | **PARCIAL**: S201-A04 |
| sem mocks, segredos ou regressões conhecidas | EVIDENCIADO; `security:secrets` verde |

**Dependência "Sprint 1 concluída":** não satisfeita formalmente (S201-A08).

**Estado do cartão:** a nota "implementado localmente; aberto em homologação" do roadmap do
repositório (`a81c93c`) corresponde ao que a campanha observou.

## 11. Bloco O — documentação × comportamento

| Documento | Resultado |
|---|---|
| `TRACEABILITY_ALERTS.md` | todas as tabelas (condição, borda, estado, motivo, deduplicação, gatilho, dispensa) têm caso que as prova; a frase "ativo enquanto a condição for verdadeira" é violada no intervalo do S201-A01 |
| ADR-015 | limitador e "403 na leitura" divergem (S201-A04) |
| `API_CONTRACTS.md` (S2-01) | rotas, DTOs, ordens e paginação conferem; tabela de erros incompleta (S201-A04); "10 a 500 caracteres" sem unidade (S201-A02) |
| `AUTHORIZATION_MATRIX.md` | as linhas do S2-01 conferem com a matriz de papéis observada |
| `RF_TECHNICAL_MATRIX.md` | "IMPLEMENTADO LOCALMENTE; CI e homologação visual pendentes" confere |
| `UI_SURFACE_INVENTORY.md` | as superfícies continuam NOT REVIEWED / TECHNICALLY VERIFIED, coerente com a Fase 7 pendente |
| `ASVS_BASELINE.md` (delta S2-01) | confere; a seção 8 deste relatório detalha os PARCIAIS |
| `PERSONAL_DATA_INVENTORY.md` | confere com a anonimização observada (AT-V-03) |
| `TECHNICAL_BACKLOG.md` | S201-F01..F06 continuam válidos; os itens novos estão abaixo |

**Itens novos de backlog** (registrados em `TECHNICAL_BACKLOG.md`):

| ID | Item | Origem |
|---|---|---|
| S201-F07 | truncar ou alargar o título de PR e issue no sync | S201-A03 |
| S201-F08 | reconciliar ao conectar a integração | S201-A01 |
| S201-F09 | estado de erro do resumo de alertas | S201-A06 |
| S201-F10 | unidade da justificativa da dispensa | S201-A02 |
| S201-F11 | sinal de falha da última reconciliação | S201-A05 |
| S201-F12 | corrigir ADR-015 e a tabela de erros do contrato | S201-A04 |

## 12. Desempenho (⚑5)

Medido em teste temporário, não versionado, no MySQL de teste. O projeto tinha 600 tarefas
concluídas sem commit, 200 tarefas abertas, 200 PRs mescladas e 200 issues fechadas.

| Operação | Tempo |
|---|---:|
| reconciliação completa em dry-run (1000 alertas a criar) | 42 ms |
| reconciliação completa criando 1000 alertas | 128 ms |
| reconciliação completa sem mudança (1000 mantidos) | 30 ms |
| uma movimentação de tarefa com 1000 alertas ativos | 26 ms |
| exclusão de requisito com 100 tarefas (`traceabilityMutation` com 100 ids) | 19 ms |

**Orçamento proposto, para registro na documentação e para fechar o V15.1.3:**
- reconciliação completa de até 5 000 sujeitos em até 2 s;
- sobrecarga de reconciliação numa mutação de até 100 tarefas em até 200 ms.

Nada foi reprovado (⚑5).

## 13. Fase 7 — roteiro manual (pendente)

O roteiro depende do ambiente do João: backend na 3001, frontend na 5173 e o banco de
desenvolvimento com os projetos `[S2-01]` 3 (Mínimo), 4 (Escala) e 5 (Sem integração). Os comandos
são propostos, e o aval é aguardado.

A homologação com GitHub real (⚑3) precisa de um repositório de teste com a GitHub App instalada,
com uma PR mesclada e uma issue fechada depois da criação do projeto.

Casos, no formato do RF42 (título; pré-condições; passos; resultado esperado; status):

| Caso | Status |
|---|---|
| M-01 conclusão sem commit → alerta → vincular pelo alerta → resolve (MEMBER) | PENDENTE |
| M-02 PR mesclada sem tarefa → vincular a uma tarefa já com PR (confirmação de substituição) | PENDENTE |
| M-03 issue fechada → dispensa por MANAGER, com justificativa de 9, 10 e 500 caracteres e com emoji (S201-A02) | PENDENTE |
| M-04 reprocessar duas vezes: contagens e mensagem | PENDENTE |
| M-05 tela RF58: filtro, "Carregar mais" e atalho para o Kanban | PENDENTE |
| M-06 VIEWER, MEMBER e MANAGER: botões visíveis por papel | PENDENTE |
| M-07 projeto Sem integração: aviso de regra inativa | PENDENTE |
| M-08 teclado do início ao fim, temas claro e escuro, larguras de 390, 768, 1024 e 1440 px, nos três projetos | PENDENTE |
| M-09 "vínculo técnico" (RF58) × "evidência técnica" (catálogo de requisitos): a diferença é perceptível? (H9) | PENDENTE |
| M-10 GitHub real: sync, alertas de PR e issue, vínculo e resolução (⚑3) | PENDENTE, sem repositório de teste |

## 14. O que não pôde ser validado

- **Roteiro manual e aprovação visual (Fase 7):** dependem do ambiente do João.
- **Homologação com GitHub real (⚑3):** não há repositório de teste disponível.
- **CI:** os commits do S2-01 e da campanha não foram publicados. O risco S201-F06 (timeouts de
  cobertura no frontend) continua sem prova na CI.
- **E2E de navegador:** não existe (S201-A07).
- **Limitador sob carga real e em mais de uma instância:** o contador fica em memória local.
- **Headers do documento HTML da SPA:** pertencem ao host de implantação (S2-09), não à API.
