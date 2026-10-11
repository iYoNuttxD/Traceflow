# Relatório de testes do S2-02 — notificações de tarefa (RF30, RF59)

> **Histórico.** Os vereditos das seções 1, 2, 9, 10 e 12 são de antes das correções de 10/10/2026
> (seção 17). Os vereditos atuais, com o reteste de cada correção, estão em
> [S2_02_RELATORIO_RETESTE.md](S2_02_RELATORIO_RETESTE.md).

Campanha descrita em [S2_02_PROMPT_TESTES_NOTIFICACOES.md](S2_02_PROMPT_TESTES_NOTIFICACOES.md),
com o mapa de casos em [S2_02_MAPA_TESTES.md](S2_02_MAPA_TESTES.md).

| Item | Valor |
|---|---|
| Executada em | 10/10/2026 |
| Branch | `joao-dev-v2` local, sem push |
| Base | `0ca2e54` (último commit do S2-02) |
| Commits | `12cad50` (Fase 1), `93009bc` (2), `f0315be` (3), `846c63b` (4), `18bed1a` (5), `861ab9e`, `ac1894f` e `cc17cd7` (6) e o deste relatório (7 e 8) |
| Aval dos ⚑ (10/10, "pode seguir") | 1 registrar sem corrigir; 2 roteiro manual em vez de E2E; 3 segunda conta de teste criada pelo João; 4 agendador conferido por inspeção; 5 orçamento de desempenho fixado; 6 consultas ao contador medidas em desenvolvimento |
| Anexos | mesmas versões do prompt: ASVS `a2fa1bbe…`; anexo de arquitetura no blob `589af2b`; roadmap no blob `53f4500` |
| Ambiente | Windows 11; Node v22.18.0 (ICU 77.1, tzdata 2025b); MySQL de teste `traceflow_test` |
| Código de produção | intocado: `git diff --exit-code -- backend/src backend/scripts frontend/src` limpo depois de cada fase e de cada mutação |
| Fase 7 (roteiro manual) | executada em 10/10/2026 no ambiente do João (seção 15): 13 casos aprovados e 1 não executado, coberto em jsdom |

## 1. Resumo

**O núcleo do S2-02 se sustenta.** Destinatário, corte em todos os fusos testados, deduplicação,
transação, concorrência, autorização, visibilidade e privacidade resistiram a 172 casos novos e a
59 mutantes:
- 28 mutantes da campanha: 27 mortos (o M22 só depois de um teste matador novo) e 1 equivalente;
- 20 mutantes da implementação, reaplicados: todos mortos;
- 11 mutantes criados na Fase 6 a partir da análise de cobertura: 9 do frontend, mortos pelos testes
  novos, e 2 do backend (M29, M30), que sobreviviam a todas as suítes do S2-02 e morreram com os
  testes `ac1894f` e `cc17cd7`.

**A campanha encontrou 14 achados, nenhum ALTA:**
- 7 MÉDIAS: duas na central e nas preferências (paginação e auditoria), uma regra publicada
  violada (preferência religada), duas de privacidade, uma da métrica oficial e o E2E ausente;
- 7 BAIXAS: job, contrato, fuso, código morto, dia inexistente no fuso e documentação.

**O cartão continua "implementado localmente, aberto em homologação".** O DoD comum do roadmap não se
cumpre enquanto faltarem:
- E2E (S202-A07);
- CI;
- o agendador instalado (S2-09), sem o qual o RF59 só roda à mão;
- a aprovação visual do João.

**O roteiro manual (Fase 7) confirmou o fluxo central na tela real**, com duas contas e nos dois
extremos de dados. Também reproduziu o S202-A01 (paginação) e o S202-A03 (preferência religada) no
ambiente do João.

| Números | Valor |
|---|---|
| Testes do S2-02 antes da campanha | 86 execuções: 61 no backend (API 19, integração 20, unidade 22) e 25 no frontend |
| Testes novos | 172 execuções: API 25; integração 58; unidade 47; frontend 42 |
| Suíte do S2-02 depois da campanha | 191 no backend e 67 no frontend, todos verdes |
| Suíte completa do backend, duas vezes (depois do último commit de teste) | 1874 verdes, 5 ignorados e 1 falha de ambiente, idênticos nas duas rodadas: `storage.test.js` do S1-07, `EPERM` ao criar symlink no Windows, preexistente e sem relação com o S2-02 |
| Gates | `lint`, `format:check`, `architecture:check` e `security:secrets` do backend; `lint`, `format:check` e `build` do frontend; todos verdes |
| Mutação | 59 mutantes: 55 mortos na primeira rodada; M22, M29 e M30 mortos depois de testes novos; o M02 equivalente |
| Cobertura dos arquivos do S2-02 | backend: 7 de 9 arquivos com 100% de ramos; política 84,2% e script 89,3%, justificados linha a linha. Frontend: todos os arquivos da feature acima de 94% de ramos |

## 2. Veredito por critério do cartão

| Critério | Veredito | Sustentação |
|---|---|---|
| C1 mudança de status notifica o responsável correto com contexto da tarefa | **ATENDE COM RESSALVA** | NT-S-01 (15 combinações pela API pública), NT-S-02..12, NT-C-01..03, NT-K-01/03; M05, M06, M15, M22 e S4, S5, S9a mortos. Ressalvas: quem fez a mudança não é avisado (restrição do texto do RF30, aprovada e registrada no ADR-016 D3); contas desativadas continuam recebendo (S202-A04) |
| C2 tarefa vencida gera uma notificação sem repetição indevida | **ATENDE COM RESSALVA** | NT-P-01..09, NT-J-01, NT-K-04/07, oráculo independente em 9 fusos × 365 dias; M01, M03, M04, S1, S2, S3, S6, S14 mortos; job no ambiente do João (M-05). Ressalvas: religar a preferência notifica um vencimento ocorrido enquanto ela estava desligada (S202-A03); sem agendador instalado, a notificação só nasce quando alguém roda o job |
| C3 leitura/não leitura e link para o contexto persistem | **ATENDE COM RESSALVA** | NT-L-06, NT-L-08, NT-S-11, NT-U-05; M08, M09 mortos. Roteiro M-03, M-04, M-10 e M-11. Ressalva: no filtro Não lidas, "Carregar mais" pula notificações depois que o usuário marca algumas como lidas (S202-A01, confirmado na tela) |
| C4 alterações em massa e concorrentes são idempotentes | **ATENDE COM RESSALVA** | NT-K-01..07 com MySQL real, NT-J-01, NT-L-09. Não há rota de status em lote: "em massa" foi provado por 100 movimentos seguidos, pelo `read-all` e pelo `createMany` do job. Ressalva: dois primeiros `PUT` de preferências simultâneos deixam a auditoria incoerente com o estado final (S202-A02) |
| C5 timezone e instante de corte documentados e testados | **ATENDE COM RESSALVA** | NT-P-01..04 e NT-P-08 com ±1 ms em 7 fusos pelo job; oráculo `Intl` em 9 fusos, em todos os dias de 2026 e nas transições de 2018–2019 de São Paulo; NT-P-03 com `TZ` do processo variando. Ressalvas: a diferença entre o "Atrasada" do Kanban e o corte não está na regra executável (S202-A10); prazo com hora e fuso pela API muda de dia (S202-A09) |
| C6 somente destinatários autorizados visualizam a notificação | **ATENDE** | NT-Z-01..08 (404 idêntico ao inexistente, OWNER sem visão alheia, variantes de caminho, ids malformados), bloco X; M12, S7, S8, S10 mortos |
| C7 (documento oficial) métrica com termos definidos e medição reproduzível | **ATENDE COM RESSALVA** | NT-M-01/02 recalcularam 100% a partir do banco, sem usar o código de criação. Ressalvas: a definição não tem período, filtros, interpretação, limitações nem forma de atualização (§10.5 do anexo), e as contagens do job são por execução, o que distorce a soma (S202-A06) |
| K1 contrato de evento e preferências | **ATENDE COM RESSALVA** | ADR-016, `TASK_NOTIFICATIONS.md`, NT-F-01..06, NT-S-04. Ressalvas: S202-A03 ("sem efeito retroativo"), S202-A11 (`PUT` com todas as chaves) e S202-A13 (códigos de estado da conta fora do contrato) |
| K2 migration, job seguro e índices | **ATENDE** | dry-run por padrão e recusa de produção sem `--confirm-production` (NT-J-01..03); o dry-run reconhece as já notificadas (NT-J-01b); falha isolada por projeto, com mensagem genérica (NT-J-04); índice único; orçamento do ⚑5 cumprido sem índice em `Task.deadline` (seção 14). S202-A08 (projeto inexistente sai com 0) é BAIXA |
| K3 API e interface | **ATENDE COM RESSALVA** | blocos L, Z e U em jsdom; roteiro manual M-01..M-13 aprovado nos dois extremos de dados, nas quatro larguras e nos dois temas; S202-A01 |
| K4 scheduler compatível com a nuvem planejada | **NÃO VERIFICÁVEL LOCALMENTE** | o job é um comando portátil, e o runbook traz unidade e timer do `systemd`, a alternativa com `cron` e `flock` e a equivalência na Azure (conferidos por inspeção, ⚑4). Nenhum agendador está instalado: depende do S2-09. A troca Azure → OCI é a divergência D-RM-01, já registrada na campanha de conformidade |
| K5 testes de prazos, fusos, deduplicação e autorização | **ATENDE** | blocos P, K e Z; 59 mutantes |

## 3. Achados

### [MÉDIA] S202-A01 — "Carregar mais" no filtro Não lidas pula notificações depois de marcar como lidas (H1, H3)

- **Onde:**
  - `GET /api/notifications` com paginação por deslocamento (`notification.repository.js`,
    `listPage`);
  - `useNotifications.js:84` (`more` pede `page + 1`) e `NotificationsScreen.jsx`, que mantém o
    item marcado na lista (H3).
- **Norma:** cartão S2-02, C3; `TASK_NOTIFICATIONS.md` ("`readAt` nulo é não lida"); DoD §4 do
  roadmap ("funciona de ponta a ponta").
- **Esperado:** percorrer o filtro Não lidas com "Carregar mais" mostra todas as não lidas, mesmo que
  o usuário marque algumas como lidas no caminho.
- **Observado:** com 5 não lidas (n1 a n5, n5 a mais recente) e `limit=2`, marcar n5 e n4 e pedir a
  página 2:

  ```text
  {"page1":["n5","n4"],"page2AfterMarking":["n1"],
   "page2Pagination":{"page":2,"limit":2,"total":3,"totalPages":2},
   "unreadCount":3,"page1AfterReload":["n3","n2"]}
  ```

  n3 e n2 não aparecem; como `page == totalPages`, o botão some. Na tela, o mesmo efeito com 20 por
  página foi reproduzido em jsdom (bloco preservado fora da suíte).
- **Reprodução:** o bloco NT-L-04/H1, fora do commit; ou, na tela, 25 não lidas, marcar 5 da
  primeira página e clicar "Carregar mais".
- **Consequência:** o contador diz 3, e a lista mostra 1 até recarregar. A notificação não se perde
  no banco, mas some da sessão, justamente no filtro que serve para tratar pendências.
- **Proposta:**
  - paginação por cursor (`createdAt`, `id`) no lugar do deslocamento; ou
  - no frontend, pedir a página seguinte descontando os itens marcados na sessão, e mesclar por id
    (o `mergeById` já existe).
  - Documentar na `UI_SURFACE_INVENTORY.md` que o item marcado continua no filtro Não lidas até
    recarregar (H3, hoje intencional e sem registro).

### [MÉDIA] S202-A02 — dois primeiros `PUT` simultâneos deixam a auditoria incoerente com o estado final (H11)

- **Onde:** `PUT /api/settings/notifications` (`notification.repository.js`, `savePreferences`),
  que calcula `changedTypes` sobre o estado lido fora de bloqueio.
- **Norma:** `API_CONTRACTS.md` ("a auditoria só é gravada quando algo muda e guarda apenas
  `changedTypes`"); ASVS V16.3.3; §13.9 do anexo.
- **Esperado:** reaplicar as auditorias, em ordem, a partir do estado padrão chega ao estado final.
- **Observado:** dez rodadas de dois `PUT` simultâneos, `{false,true}` e `{true,false}`, a partir
  do padrão `{true,true}`. As dez terminaram iguais:

  ```text
  {"statuses":[200,200],"final":{"TASK_STATUS_CHANGED":true,"TASK_OVERDUE":false},
   "audits":["TASK_STATUS_CHANGED","TASK_OVERDUE"]}
  ```

  A primeira auditoria registra `TASK_STATUS_CHANGED` (para `false`). A segunda só registra
  `TASK_OVERDUE`, mas o estado final tem `TASK_STATUS_CHANGED` de volta a `true`. Essa volta não
  tem auditoria.
- **Reprodução:** NT-F-05/H11, fora do commit.
- **Consequência:** a trilha diz que o aviso de mudança de status foi desligado, e ele está ligado.
  Sem 500 e sem perda de dado.
- **Proposta:** ler o estado anterior com `SELECT … FOR UPDATE` (ou travar a linha do usuário)
  dentro da transação do `PUT`; regressão com os dois `PUT` simultâneos.

### [MÉDIA] S202-A03 — religar a preferência do RF59 notifica um vencimento ocorrido enquanto ela estava desligada (H9)

- **Onde:** `notifyOverdueTasks` (`notification.service.js`), que avalia a preferência no instante
  de cada execução, sobre todos os cortes da janela.
- **Norma:** ADR-016 D7 ("valem no instante da criação, sem efeito retroativo");
  `TASK_NOTIFICATIONS.md` ("ligar de novo não recupera o que foi excluído").
- **Esperado:** tarefa vencida e excluída por `PREFERENCE_OFF` não é notificada depois que a
  preferência volta.
- **Observado:** prazo 15/10, job em 16/10 com a preferência desligada (`PREFERENCE_OFF: 1`),
  preferência religada, job em 17/10:

  ```text
  AssertionError: expected 1 to be +0
    expect(afterOn.created).toBe(0);
  ```

  A segunda execução criou a notificação.
- **Reprodução:** `s202-reproducao-h9.test.js` (fora do commit), com o serviço real e a janela de 7
  dias.
- **Consequência:** a regra publicada não vale para o RF59 durante os 7 dias da janela. O RF30 segue
  a regra (NT-F-03).
- **Proposta:** decidir qual das duas é a regra:
  - manter o código e corrigir o ADR-016 e o `TASK_NOTIFICATIONS.md` ("religar dentro da janela
    recupera o vencimento ainda não notificado"); ou
  - comparar o corte com o instante em que a preferência foi religada (exige guardar `updatedAt`
    da preferência).

### [MÉDIA] S202-A04 — contas desativadas ou com exclusão pendente continuam recebendo notificações que não conseguem ler (H4)

- **Onde:** `recipientExclusion` (`notification.policy.js`), que olha só a membership; o gatilho do
  RF30 em `transitionStatus` e o job do RF59 usam a mesma regra.
- **Norma:** ADR-016 D16 e `TASK_NOTIFICATIONS.md` ("enviada corretamente: … visível só a ele");
  §14 do anexo (necessidade, LGPD art. 6º, III).
- **Esperado:** decisão registrada sobre contas `DEACTIVATED` e `DELETION_PENDING`.
- **Observado:** as duas contas recebem 403 (`ACCOUNT_DEACTIVATED`, `ACCOUNT_DELETION_PENDING`) ao
  ler a central, e um movimento de tarefa delas cria uma notificação para cada uma (NT-Z-02/H4, no
  commit, que fixa o comportamento atual).
- **Reprodução:** NT-Z-02/H4.
- **Consequência:**
  - a métrica conta como "enviada corretamente" uma notificação que ninguém pode ver;
  - dado pessoal novo é gravado para uma conta que pediu exclusão.
- **Proposta:** excluir essas contas com um motivo próprio (por exemplo, `INACTIVE_ACCOUNT`),
  contado nas exclusões por regra; ou registrar no ADR-016 que a notificação fica guardada para a
  reativação, e tirar essas linhas do numerador da métrica.

### [MÉDIA] S202-A05 — a exportação omite notificações ocultas que continuam guardadas (H5)

- **Onde:** `settings.repository.js:641` (filtro `project.deletedAt: null` e membership ativa na
  seção `notifications` da exportação).
- **Norma:** ADR-016, "Impactos" ("a notificação e a preferência são dados do titular");
  ASVS V14.2.4; LGPD art. 18, II.
- **Esperado:** a exportação do titular traz todos os dados dele que o sistema guarda.
- **Observado:** a notificação de um projeto do qual o titular saiu, ou de um projeto em exclusão
  recuperável, fica no banco por até 180 dias e não aparece nem na central nem na exportação.
  `TASK_NOTIFICATIONS.md` documenta o filtro "como as demais seções da exportação". O S2-02 seguiu
  a convenção existente, mas a convenção contradiz a própria frase do ADR.
- **Reprodução:** NT-D-02 e o teste de exportação da API (M23 e S15 mortos provam o filtro).
- **Consequência:** o titular não recebe parte dos dados que o sistema guarda sobre ele.
- **Proposta:** decisão transversal de privacidade, na campanha de conformidade: exportar também os
  ocultos (com o título copiado, que o titular já recebeu) e um campo `visible`; ou registrar a base
  da exclusão no inventário de dados pessoais.

### [MÉDIA] S202-A06 — a métrica oficial não define período, filtros, interpretação, limitações nem forma de atualização, e as contagens do job somadas distorcem o indicador (H2, H8)

- **Onde:** `TASK_NOTIFICATIONS.md`, seção "Métrica oficial"; saída do job
  (`notification.service.js`).
- **Norma:** documento oficial, Quadros 3-55 e 3-56 (métrica e critério); §10.5 do anexo de
  arquitetura (objetivo, fórmula, dados de origem, período, filtros, interpretação, limitações e
  forma de atualização); cartão C7.
- **Esperado:** os oito itens da §10.5, com o aviso de que a saída do job é um retrato da execução.
- **Observado:**
  - a seção tem fórmula, termos e dados de origem, e cita o S3-01 como destino; faltam período,
    filtros, interpretação, limitações e forma de atualização;
  - uma única tarefa vencida, com o job a cada 6 horas por 10 dias (41 execuções):

    ```text
    soma de created = 1; soma de eligible = 29; soma de excluded.OUTSIDE_WINDOW = 12
    ```

    O mesmo evento aparece como elegível em 29 execuções e como excluído em 12 (NT-M-03/H2).
- **Reprodução:** NT-M-03/H2 e a leitura da seção.
- **Consequência:** quem somar as saídas do job (o caminho natural para o S3-01) calcula um
  indicador sem sentido. Somado a uma frequência de 15 minutos, o erro cresce 24 vezes.
- **Proposta:**
  - completar a definição com os cinco itens;
  - declarar que `eligible` e `excluded` são retratos por execução e que a medição do RF59 se faz
    sobre os pares (tarefa, data do prazo), não sobre a soma das saídas;
  - para o S3-01, uma consulta de medição que conte eventos distintos.

### [MÉDIA] S202-A07 — sem E2E de navegador (H13)

- **Norma:** §15.2 do anexo de arquitetura ("testes end-to-end para fluxos críticos"); DoD §4 do
  roadmap, item 6.
- **Observado:** não há Playwright, Cypress nem job na CI. A falta já está registrada em S104-F02,
  E15-F10 e S201-A07. O roteiro manual da Fase 7 cobre o fluxo central, mas não é regressão.
- **Classe:** **DX**, como no S2-01.
- **Proposta:** a decisão de arquitetura do S104-F02 (§20, "framework de testes"), que vale para
  todos os cartões. Até lá, o cartão não pode ser marcado concluído pelo DoD (⚑2).

### [BAIXA] S202-A08 — `--project-id` inexistente termina com código 0 e sem aviso (H16)

- **Onde:** `scripts/notify-overdue-tasks.js` e `notifyOverdueTasks`.
- **Norma:** `runbooks/TASK_NOTIFICATIONS.md` (escopo `--project-id=<id>`); ASVS V16.5.3.
- **Esperado:** projeto inexistente ou excluído avisa que nada foi avaliado.
- **Observado:** `--apply --project-id=2147483000` devolve `{"projects":0,"failed":0,…}` e código 0
  (NT-J-09/H16).
- **Consequência:** um id digitado errado no agendador ou numa recuperação manual passa por execução
  bem-sucedida.
- **Proposta:** com `--project-id` e `projects: 0`, escrever um aviso em `stderr` e sair com código
  2 (uso), sem mudar o caso sem filtro.

### [BAIXA] S202-A09 — prazo com hora e fuso enviado pela API muda de dia no vencimento (H6)

- **Onde:** `deadline` em `POST`/`PATCH /api/projects/:projectId/tasks…`, que aceita datetime
  ISO-8601 completo (`API_CONTRACTS.md`); `dueDateOf` (`notification.policy.js`).
- **Norma:** `TASK_NOTIFICATIONS.md` ("data do prazo é a data UTC de `Task.deadline`").
- **Observado:** `deadline: "2026-10-10T22:30:00-03:00"` é gravado como `2026-10-11T01:30:00.000Z`;
  a notificação traz `dueDate` `2026-10-11`, e o corte é `2026-10-12T03:00:00.000Z` (NT-P-05/H6).
  O cliente quis dizer 10/10 no próprio fuso.
- **Consequência:** só afeta clientes da API que enviam hora com fuso negativo; a tela envia só a
  data. A regra publicada é cumprida, mas a combinação dela com o contrato surpreende.
- **Proposta:** aceitar só `YYYY-MM-DD` em `deadline`, ou documentar no contrato que a data do prazo
  é a data UTC do instante enviado, com este exemplo.

### [BAIXA] S202-A10 — a diferença entre o "Atrasada" do Kanban e o corte do vencimento não está na regra executável (H7)

- **Onde:** `TASK_NOTIFICATIONS.md` (corte em `APP_TIMEZONE`); a tela marca "atrasada" pelo fuso do
  navegador (ADR-016, "Contexto").
- **Norma:** cartão C5 ("timezone e instante de corte documentados").
- **Observado:** o ADR-016 registra o comportamento da tela e o fuso único como consequência
  negativa, e o S202-F07 trata o fuso por usuário. A regra executável e a central não dizem que,
  fora do fuso de referência, o Kanban e a notificação discordam por algumas horas (até 17 h em
  `Pacific/Kiritimati`, +14, em relação a `America/Sao_Paulo`, −03).
- **Proposta:** uma frase em `TASK_NOTIFICATIONS.md`, na seção do corte, com o exemplo de um fuso
  distante.

### [BAIXA] S202-A11 — o `PUT` de preferências exige todas as chaves; um tipo novo no S2-03 quebra o cliente desatualizado (H10)

- **Onde:** `notificationPreferencesBodySchema` (`notification.validation.js`).
- **Norma:** §6.4 do anexo ("não alterar contrato em silêncio").
- **Observado:** chave ausente responde 400 (NT-F-02). O contrato e a matriz de autorização dizem
  "as duas chaves obrigatórias".
- **Consequência:** hoje, nenhuma: o único cliente é a SPA, publicada junto. Quando o S2-03
  acrescentar tipos, uma aba aberta durante a publicação recebe 400 ao salvar.
- **Proposta:** no S2-03, aceitar chaves ausentes como "manter", ou registrar a mudança de contrato
  no `API_CONTRACTS.md` com a data.

### [BAIXA] S202-A12 — `isValidTimeZone` exportado e sem uso aceita deslocamento que a configuração recusa

- **Onde:** `notification.policy.js:61` (sem chamador em `backend/src` nem em `backend/scripts`);
  `env.js:40` (`parseTimeZone`, que exige o formato de nome IANA antes do `Intl`).
- **Observado:** `isValidTimeZone("-03:00")` e `isValidTimeZone("+14:00")` devolvem `true` no
  Node 22, que aceita fusos por deslocamento; `parseTimeZone` recusa os dois (M21 morto).
- **Consequência:** código morto, que deixa as linhas 62–67 sem cobertura. Se for reaproveitado,
  enfraquece a validação de `APP_TIMEZONE`.
- **Proposta:** remover a função, ou fazer `parseTimeZone` usá-la depois de incluir o teste de
  nome IANA.

### [BAIXA] S202-A13 — documentação do S2-02 diverge do comportamento

- **Classe:** **DE** (editorial).
- **Observado:**
  - `API_CONTRACTS.md`, "Códigos de erro do S2-02": faltam `ACCOUNT_DEACTIVATED` e
    `ACCOUNT_DELETION_PENDING` (403), devolvidos pelas seis rotas a contas restritas (NT-Z-02);
  - `RF_TECHNICAL_MATRIX.md`, linha do RF30: "commits `afb38ef`..`1b35604`"; o S2-02 vai até
    `0ca2e54` (faltam `194e68e`, `c173ed7`, `0404ebe` e `0ca2e54`);
  - `UI_SURFACE_INVENTORY.md`, "Global / Auxiliary Surfaces": "O runtime atual não possui … notification
    center", ao lado da linha `NOTIFICATIONS-CENTER` do próprio inventário.
- **Proposta:** corrigir as três frases no prompt de correções.

### [BAIXA] S202-A14 — o corte cai um dia antes quando o dia seguinte ao prazo não existe no fuso

- **Onde:** `startOfLocalDay` (`notification.policy.js:89`), no recurso para quando nenhum candidato
  inicia o dia (`valid.length ? … : second`).
- **Norma:** `TASK_NOTIFICATIONS.md`, "Corte do vencimento" ("o corte é o início do dia seguinte à
  data do prazo"; "quando a meia-noite local não existe, o corte é o primeiro instante do dia
  local").
- **Esperado:** se o dia seguinte não existe no fuso, o corte é o fim do dia do prazo, isto é, o
  início do primeiro dia local que existe depois dele.
- **Observado:** Samoa pulou 30/12/2011. Com `Pacific/Apia`:

  ```text
  startOfLocalDay('2011-12-29') = 2011-12-29T10:00:00.000Z (00:00 de 29/12, −10)
  startOfLocalDay('2011-12-30') = 2011-12-29T10:00:00.000Z (00:00 de 29/12, −10)
  startOfLocalDay('2011-12-31') = 2011-12-30T10:00:00.000Z (00:00 de 31/12, +14)
  ```

  O prazo 29/12 venceria no início do próprio dia 29, 24 horas antes.
- **Reprodução:** `startOfLocalDay('2011-12-30', 'Pacific/Apia')` no Node 22 (ICU 77.1).
- **Consequência:** hoje, nenhuma: nenhum fuso IANA pula um dia em datas futuras, e a janela de 7
  dias exclui 2011. É a única linha da política sem cobertura que não é código morto, e o resultado
  está errado.
- **Proposta:** devolver o início do primeiro dia local seguinte que existe (ou o instante em que o
  dia do prazo termina), com o teste de `Pacific/Apia` em 2011.

### Observações (sem achado)

| ID | Observação |
|---|---|
| O-1 | No filtro Não lidas, o item marcado continua na lista, com o estado de lida, até recarregar (H3). Permite desfazer, mas não está documentado (proposta no S202-A01) |
| O-2 | Com uma marcação em andamento, o clique em "Marcar como lida" de outro cartão é ignorado em silêncio (`NotificationsScreen.jsx:40`); o botão do outro cartão não fica `aria-disabled`. A janela dura uma requisição |
| O-3 | Notificação que chega entre duas páginas não aparece até recarregar, embora o contador já a conte. "Carregar mais" mescla por id, e nada se repete (teste novo) |
| O-4 | `UnreadNotificationsContext.jsx:35` (`retryAfterSeconds \|\| 60`) é redundante: `normalizeApiError` já devolve 60 para 429 sem `Retry-After` (`http-error.js:49`) |
| O-5 | As mutações das notificações só passam pelo limitador global; não há teto por usuário para `PATCH` (NT-Z-08). Com o teto global baixo, o `read-all` recebe 429 |
| O-7 | No celular, o botão ☰ não tem indicador de não lidas: o "99+" só aparece com a gaveta aberta (M-01) |
| O-8 | O cartão do RF30 mostra só o nome do ator. Com duas contas de mesmo nome, "João Vitor Hernandes moveu…" não diz qual delas moveu (M-07); o DTO tem o id, a tela não |
| O-9 | Fora do S2-02: o seletor de responsável do formulário de tarefa lista dois "João Vitor Hernandes" idênticos, sem nome de usuário nem e-mail (M-07) |
| O-10 | Dado de teste, não defeito: a carga do S2-01 gravou o código de acesso do `[S2-01] Escala` como `S201-…` em minúsculas, que a tela recusa ("Código de acesso inválido."); os códigos gerados pelo produto são `TRC-…`. O código foi regenerado pela tela para o roteiro |

## 4. Hipóteses H1–H18

| ID | Resultado | Onde |
|---|---|---|
| H1 paginação por deslocamento perde itens | **confirmada** | S202-A01 |
| H2 contagens do job são retratos por execução | **confirmada** | S202-A06 |
| H3 item marcado continua no filtro Não lidas | **confirmada** como comportamento intencional, sem registro | O-1, S202-A01 |
| H4 contas restritas continuam recebendo | **confirmada** | S202-A04 |
| H5 exportação omite as ocultas | **confirmada** | S202-A05 |
| H6 prazo com hora vira data UTC | **confirmada** | S202-A09 |
| H7 Kanban e notificação divergem fora do fuso | **confirmada** na documentação | S202-A10 |
| H8 métrica sem os oito itens da §10.5 | **confirmada** | S202-A06 |
| H9 religar a preferência do RF59 é retroativo | **confirmada** | S202-A03 |
| H10 `PUT` com todas as chaves | **confirmada** como risco do S2-03 | S202-A11 |
| H11 auditoria de `PUT` simultâneos | **confirmada** | S202-A02 |
| H12 criação e leitura sem auditoria | **refutada** como defeito: a decisão está no ADR-016 ("só a mudança de preferências é auditada"). A criação do RF30 nasce na transação que grava `TaskHistoryEntry`; a do RF59, com a linha da notificação e a contagem no log do job. A leitura é estado do próprio usuário, não artefato do projeto (§13.9) | bloco A |
| H13 sem E2E | **confirmada** | S202-A07 |
| H14 nenhum agendador instalado | **confirmada** como limitação declarada (ADR-016, "Consequências negativas"; matriz RF), sem achado novo: depende do S2-09 | K4, bloco R |
| H15 Azure → OCI sem ADR | **confirmada**; já é a divergência D-RM-01 da campanha de conformidade, e o runbook traz a equivalência na Azure | K4 |
| H16 `--project-id` inexistente sai com 0 | **confirmada** | S202-A08 |
| H17 três consultas ao contador na primeira carga | **refutada** como defeito: em desenvolvimento são 3, duas do `StrictMode` (a primeira cancelada) e uma depois do redirecionamento de `/` para `/projects`; sem `StrictMode`, a inspeção dá 2 (montagem e navegação) | M-02 |
| H18 nome do projeto e do ator sem teste de XSS | **refutada** como defeito: o React exibe os dois como texto (NT-U-06 novo, com `<img onerror>` nos dois nomes); a lacuna de teste foi fechada na Fase 5 | bloco X |

## 5. Casos executados

| Bloco | Arquivo | Casos novos | Resultado |
|---|---|---:|---|
| C, S, L, F, Z e D na API; cabeçalhos do bloco X | `backend/test/api/s202-bateria.test.js` | 25 | verdes; NT-L-04/H1 e NT-F-05/H11 falharam (A01, A02) e ficaram fora do commit, com o bloco preservado |
| S, P, J, K, D e M com MySQL real; orçamento do ⚑5 | `backend/test/integration/s202-bateria.test.js` | 58 | verdes; a reprodução de H9 (A03) ficou fora do commit |
| corte por oráculo, `dueDateRange`, exclusões, título, argumentos e erros do script, `APP_TIMEZONE` | `backend/test/unit/s202-bateria.test.js` | 47 | verdes |
| U em jsdom; contrato do módulo de API | `frontend/test/pages/Notifications.bateria.test.jsx` | 42 | verdes; a reprodução de H1 na tela ficou fora do commit |

**Casos que confirmam o comportamento esperado em pontos de risco:**
- **Corte e fuso:**
  - o corte calculado pelo código coincide com um oráculo independente (busca binária sobre
    `Intl.DateTimeFormat`) em todos os dias de 2026, em 9 fusos, incluindo +14, −11, +05:45 e o
    horário de verão de meia hora de `Australia/Lord_Howe`;
  - o mesmo job rodado com `TZ=UTC`, `TZ=Asia/Tokyo` e `TZ=America/Sao_Paulo` no processo dá saídas
    e linhas idênticas (NT-P-03);
  - prazo de hoje às 23:59:59,999 locais ainda não vence (NT-P-08).
- **Transação e concorrência:**
  - falha da auditoria antes da notificação desfaz movimento, histórico e status (NT-S-12);
  - tarefa lida antes do lock com o responsável antigo notifica o responsável vigente (NT-S-07b,
    que matou o M22);
  - três jobs simultâneos, ou um job disputando com movimentos e troca de responsável, não duplicam
    (NT-K-04, NT-K-07);
  - `read-all` simultâneo à criação nunca marca uma notificação criada depois dele (NT-K-05).
- **Autorização:**
  - notificação alheia, inexistente, oculta e de projeto excluído respondem o mesmo 404, com o mesmo
    corpo, exceto `requestId` (NT-Z-01);
  - o OWNER do projeto não vê nem marca a notificação de outro membro (NT-Z-07);
  - `%31`, barra final, barra dupla e maiúsculas no `PATCH` nunca alteram notificação alheia
    (NT-Z-04).
- **Entrada:** `__proto__`, `constructor` e `prototype` em qualquer nível do corpo, enviados como
  JSON cru, respondem 400 (NT-F-02). O superagent descarta `__proto__` de primeiro nível ao montar o
  corpo; por isso a bateria envia o texto JSON.
- **Interface:**
  - nomes de projeto e de ator com HTML aparecem como texto (NT-U-06);
  - resposta atrasada do filtro anterior não sobrescreve a lista nem o contador do filtro novo;
  - desmontar o provider no logout encerra a consulta periódica (NT-U-07);
  - o módulo de API chama as seis rotas com o método e o corpo que o backend declara.

## 6. Bateria de mutação

Cada mutante foi aplicado por substituição exata, rodado contra as suítes do S2-02 (backend ou
frontend) e restaurado byte a byte, com verificação por SHA-256. Ao fim de cada rodada, `git diff`
estava limpo.

**Mutantes da campanha (seção 5.1 do prompt):**

| Mutante | Alteração | Resultado | Morto por |
|---|---|---|---|
| M01 | `dueDateOf` pela data local da máquina | morto | NT-P-01/02 |
| M02 | `startOfLocalDay` escolhe o maior candidato | **equivalente** | dois candidatos válidos distintos para o início do dia nunca ocorrem: o início do dia é único mesmo quando a meia-noite não existe ou se repete, e o oráculo independente da Fase 4 não acusou divergência em nenhum dia dos 9 fusos |
| M03 | laço do máximo de `dueDateRange` com `>=` | morto | NT-P-01/02 |
| M04 | `lookbackStart` em horas | morto | NT-P-04 |
| M05 | `overdueExclusion` testa responsável antes da janela | morto | tabela de 16 combinações do RF59 |
| M06 | `recipientExclusion` testa preferência antes da membership | morto | tabela de 16 combinações do RF30 |
| M07 | `snapshotTitle` por unidade UTF-16 | morto | NT-S-08 |
| M08 | `notificationLink` sem a guarda de tarefa nula | morto | NT-S-11 |
| M09 | `setRead` sobrescreve o primeiro instante | morto | API "marca como lida, preserva o primeiro instante…" |
| M10 | `unreadCount` só da página | morto | NT-L-05 |
| M11 | ordem `createdAt ASC` | morto | NT-L-03 |
| M12 | `visibleWhere` sem `deletedAt: null` | morto | NT-Z-01 |
| M13 | `savePreferences` audita sem mudança | morto | API "audita só a mudança…" |
| M14 | DTO expõe `recipientUserId` | morto | API "o DTO traz só o necessário…" |
| M15 | `actor` sem guarda de nulo | morto | NT-S-10 |
| M16 | `limit` aceita 101 | morto | API "valida a consulta…" |
| M17 | `status` com padrão `ALL` | morto | API "lista só as não lidas por padrão…" |
| M18 | guarda de `__proto__` só no primeiro nível | morto | API "o PUT é estrito…" |
| M19 | `failed` não incrementa | morto | NT-J-04 |
| M20 | aceita `--apply` com `--dry-run` | morto | tabela de argumentos (unidade) |
| M21 | `APP_TIMEZONE` aceita `-03:00` | morto | tabela de `APP_TIMEZONE` (unidade) |
| M22 | a notificação usa a tarefa lida antes da mudança | morto na 2ª rodada | NT-S-07b (novo): o objeto `task` recebido estava desatualizado, e o responsável mudou no banco antes do lock |
| M23 | exportação sem `notification-preferences.json` | morto | API de exportação |
| M24 | rotas fora do limitador de leitura | morto | API "as leituras novas entram no limitador…" |
| M25 | `unreadBadge` com teto 999 | morto | frontend "limita em 99+" |
| M26 | contador ignora o `Retry-After` | morto | frontend "respeita o Retry-After…" |
| M27 | título como HTML | morto | frontend "título vindo do usuário…" |
| M28 | "Salvar preferências" sem o bloqueio | morto | frontend "carrega os dois tipos…" |

**Mutantes da implementação, reaplicados contra a suíte nova:** os 20 (S1 a S19, com S9 em dois)
morreram de novo:
- fuso e valor-limite do corte (S1, S2, S14);
- guarda de concluída (S3) e de ator (S4);
- transação (S5) e deduplicação (S6);
- visibilidade, `read-all` e contador (S7, S8, S10, S13);
- preferências nos dois tipos (S9a, S9b);
- código de saída e contagens do job (S11, S12);
- privacidade (S15, S16, S17);
- consulta periódica e teto 99+ no frontend (S18, S19).

**Mutantes do frontend da Fase 6** (para provar que os testes de cobertura detectam regressão):

| Mutante | Alteração | Morto por |
|---|---|---|
| F1 | resposta obsoleta da lista não é descartada | "resposta atrasada do filtro anterior…" |
| F2 | falha obsoleta da lista não é descartada | "falha atrasada do filtro anterior…" |
| F3 | `changeStatus` sem a guarda do mesmo filtro | "changeStatus para o filtro atual…" |
| F4 | `toggleRead` sem a guarda de marcação em andamento | "com uma marcação em andamento…" |
| F5 | abrir tarefa lida marca de novo | "abrir uma tarefa já lida…" |
| F6 | `report` aceita contagem não inteira | "a central informar 1.5 / '3' / null…" |
| F7 | qualquer erro suspende o contador | "erro diferente de 429…" |
| F8 | nova tentativa sempre pede a página 1 | "falha ao carregar mais…" |
| F9 | `mergeById` sem deduplicar | "Carregar mais acrescenta a página 2…" |

**Mutantes do backend criados a partir da cobertura.** Os dois sobreviviam a todas as suítes do
S2-02 antes dos testes novos:

| Mutante | Alteração | Morto por |
|---|---|---|
| M29 | `existingOverdueKeys` monta a chave como `dedupeKey\|destinatário` | NT-J-01b (novo): dry-run depois do apply, com o repository real. Antes, o dry-run só era testado sem notificação existente ou com repository falso |
| M30 | o script repete a mensagem de qualquer `Error`, mesmo com `code` | "erro do banco com código vira a mensagem genérica…" (novo, unidade): a mensagem crua do banco não sai em `stderr` (V16.5.1) |

## 7. Cobertura dos arquivos do S2-02

**Backend** (comando da seção 0.3 do prompt: `test/unit`, `test/integration` e `test/api` inteiros,
com `--coverage.include` no módulo e no script):

| Arquivo | Linhas | Ramos | Meta | Situação |
|---|---:|---:|---|---|
| `notification.policy.js` | 91,8% | 84,2% | 100% | justificada abaixo |
| `notification.repository.js` | 100% | 100% | ≥ 90% de ramos | atingida (era 95,7% antes do NT-J-01b) |
| `notification.service.js` | 100% | 100% | ≥ 90% | atingida |
| `notification.mapper.js` | 100% | 100% | ≥ 90% | atingida |
| `notification.validation.js` | 100% | 100% | ≥ 90% | atingida |
| `notification.controller.js`, `notification.routes.js`, `index.js` | 100% | 100% | ≥ 90% | atingida |
| `scripts/notify-overdue-tasks.js` | 76,2% | 89,3% | ≥ 90% | justificada abaixo |

| Arquivo e linha | Justificativa |
|---|---|
| `notification.policy.js:61–67` (`isValidTimeZone`) | código morto: nenhum chamador no backend; a configuração usa `parseTimeZone` (S202-A12) |
| `notification.policy.js:89` (`… : second`) | só é alcançada num dia que não existe no fuso (Samoa, 30/12/2011), e ali o resultado está errado (S202-A14) |
| `notification.policy.js:137` (`'NO_RESPONSIBLE'` em `recipientExclusion`) | inalcançável: `statusChangeExclusion` e `overdueExclusion` devolvem `NO_RESPONSIBLE` antes de chamar a função |
| `scripts/notify-overdue-tasks.js:33–34` (escritores padrão) e `:53–61` (entrada de linha de comando) | rodam só quando o arquivo é o processo principal. O NT-J-10 executa o script como processo filho, no banco de teste (dry-run com código 0 e uso inválido com código 1), mas a cobertura do V8 só mede o processo do vitest |

**Frontend** (os quatro arquivos de notificações e `AppShell.test.jsx`, 79 testes):

| Arquivo | Linhas | Ramos | Situação |
|---|---:|---:|---|
| `notifications.api.js` | 100% | 100% | era 0%: o módulo era sempre substituído por mock; o contrato novo usa o módulo real com o `httpClient` espionado |
| `NotificationsScreen.jsx` | 100% | 100% | era 83,7% |
| `notification-view.js` | 100% | 100% | era 77,1% |
| `NotificationCard.jsx`, `NotificationPreferencesPage.jsx` | 100% | 100% | — |
| `useNotifications.js` | 100% | 94,4% | era 55,6%; resta a linha 39 |
| `UnreadNotificationsContext.jsx` | 100% | 94,4% | era 77,8%; resta a linha 35 |
| trecho do `AppShell.jsx` (linhas 171–173 e 315–328) | 100% | 100% | contador oculto em 0, número, 99+ e nome acessível; as linhas não cobertas do arquivo são da gaveta e dos projetos rápidos, fora do S2-02 |

| Arquivo e linha | Justificativa |
|---|---|
| `useNotifications.js:39` (`previous?.notifications \|\| []`) | inalcançável: a página 2 só é pedida por "Carregar mais", que só aparece com a lista carregada; trocar o filtro limpa a lista e troca o controlador no mesmo commit do React, e a resposta atrasada é descartada pela guarda da linha 33 (F1 morto) |
| `UnreadNotificationsContext.jsx:35` (`\|\| 60`) | redundante: `normalizeApiError` já devolve 60 para 429 sem `Retry-After` (O-4); o comportamento é provado pelo teste "429 sem Retry-After suspende a consulta por 60 s" |

Cobertura é indicador; o gate é a mutação (§15.4 do anexo).

## 8. Bloco M — métrica oficial recalculada

| Caso | Cenário | Recálculo independente | Resultado |
|---|---|---|---|
| NT-M-01 (RF30) | 7 movimentos: 3 elegíveis e um de cada exclusão (`NO_RESPONSIBLE`, `SELF_CHANGE`, `INACTIVE_MEMBER`, `PREFERENCE_OFF`) | elegíveis contados a partir de `TaskMovement`, memberships e preferências; entregues casados por chave, destinatário e ator | 3 de 3 = **100%**; 3 linhas no total, nenhuma a mais |
| NT-M-02 (RF59) | 4 tarefas vencidas na janela, uma sem responsável | saída do job comparada com as linhas gravadas | `eligible = created + alreadyNotified`; `created` = linhas `TASK_OVERDUE`; `scanned = eligible + NO_RESPONSIBLE`: **100%** |
| NT-M-03 (H2) | 1 tarefa vencida, job a cada 6 h por 10 dias (41 execuções) | soma das saídas | `created` 1; `eligible` somado 29; `OUTSIDE_WINDOW` somado 12 (S202-A06) |
| NT-M-04 (H8) | leitura da definição contra a §10.5 | — | presentes: objetivo (implícito no critério), fórmula e dados de origem; ausentes: período, filtros, interpretação, limitações e forma de atualização (S202-A06) |

Os números de 09/10 em `TASK_NOTIFICATIONS.md` (RF30 9/5/5 e RF59 7/3/3) continuam reproduzíveis
pelos testes M1 e M2. O recálculo independente chega à mesma cobertura.

## 9. Bloco X — ASVS 5.0.0 L1+L2 na superfície do S2-02

| Requisito | Veredito | Evidência |
|---|---|---|
| V1.2.1, V3.2.2 | ATENDIDO | NT-U-06 (título, projeto e ator); M27 morto. A baseline declarava os três com teste só do título |
| V1.2.2 | ATENDIDO | NT-L-08; link montado com ids inteiros; M08 morto |
| V1.2.4 | ATENDIDO | inspeção: nenhum `$queryRaw` ou `$executeRaw` em `modules/notifications`; `architecture:check` |
| V2.1.1, V2.1.3 | ATENDIDO | 100, 7 dias (1 a 90), 15 min, 180 dias e 191 documentados (bloco O) |
| V2.2.1, V2.2.2 | ATENDIDO | NT-L-01, NT-F-02, NT-Z-05, NT-Z-06; M16, M17 mortos |
| V2.3.2 | ATENDIDO | NT-L-02, NT-P-04 (±1 ms), NT-D-03 (−180 d e −180 d −1 ms) |
| V2.3.3 | ATENDIDO | NT-S-12, NT-C-01; S5 morto |
| V2.3.4 | ATENDIDO | NT-K-03, NT-K-04, NT-K-07; S6 morto |
| V2.4.1 | ATENDIDO | NT-Z-08: leituras por usuário; mutações no limitador global (O-5); M24 morto |
| V3.5.1, V3.5.3 | ATENDIDO | `CSRF_INVALID` sem efeito; NT-L-07 (nenhuma `GET` cria, marca ou audita) |
| V4.1.1 | ATENDIDO | `application/json; charset=utf-8` em sucesso e erro das rotas novas |
| V8.1.1 | ATENDIDO | ADR-016 D9, `AUTHORIZATION_MATRIX.md` |
| V8.2.1, V8.2.2, V8.3.1 | ATENDIDO | NT-Z-01, NT-Z-06; M12 morto |
| V8.2.3, V15.3.1 | ATENDIDO | DTO com chaves exatas por tipo; M14 morto |
| V8.4.1 | ATENDIDO | NT-Z-01 (membership, projeto excluído e restaurado), NT-Z-07 |
| V14.1.1, V14.1.2, V14.2.4 | **PARCIAL** | inventário, retenção de 180 dias e anonimização conferem (NT-D-01, NT-D-03); a exportação omite as ocultas (S202-A05); contas restritas continuam recebendo dado novo (S202-A04) |
| V14.2.1 | ATENDIDO | a query só leva `status`, `page` e `limit`; o link só ids |
| V14.3.1 | ATENDIDO | NT-U-07: o logout desmonta o provider, a consulta para e nada fica na tela |
| V14.3.2 | ATENDIDO | `Cache-Control: no-store` em sucesso e erro |
| V14.3.3 | ATENDIDO | nada em `localStorage` nem `sessionStorage` (NT-U-07) |
| V15.1.3, V15.2.2 | ATENDIDO | orçamento do ⚑5 fixado e cumprido (seção 14) |
| V15.3.3, V15.3.5, V15.3.6, V15.3.7 | ATENDIDO | NT-F-02 (protótipo em qualquer nível, `"false"`, `null`, array), NT-L-01 (parâmetro repetido); M18 morto |
| V16.2.1, V16.2.2, V16.2.5, V16.4.1 | ATENDIDO | NT-J-06: eventos, fuso e instante em UTC; sem título, nome ou e-mail; `\r\n` no título não forja linha |
| V16.3.2 | ATENDIDO | 404 por id alheio registrado pelo tratador global (teste de API com logger injetado) |
| V16.3.3 | **PARCIAL** | auditoria só com `changedTypes`, mas incoerente sob concorrência (S202-A02) |
| V16.5.1, V16.5.2, V16.5.3 | ATENDIDO | NT-S-12; NT-J-04 (falha isolada, código 1, `NOTIFICATIONS_DUE_FAILED` para erro sem código); S202-A08 é BAIXA |
| V16.4.2, V16.4.3 | NÃO VERIFICÁVEL LOCALMENTE | proteção e envio dos logs pertencem ao ambiente (S2-10) |

## 10. Bloco A — anexo de arquitetura

| Regra | Veredito | Evidência |
|---|---|---|
| §6.1 fluxo vertical | CONFORME, com ressalva | banco, job, API, UI, autorização, testes, documentação e matriz RF; o job ainda não roda sozinho (S2-09) |
| §6.2 sem mocks em produção | CONFORME | nenhum dado simulado no caminho; as cargas de verificação ficam no scratchpad, fora do repositório |
| §6.3 RF nos commits | CONFORME | os 10 commits do S2-02 (`afb38ef`..`0ca2e54`) e os 6 da campanha citam RF30 e RF59 |
| §8.1 camadas | CONFORME | `architecture:check` verde; Prisma só nos repositories |
| §9 organização por domínio | CONFORME | `backend/src/modules/notifications/` e `frontend/src/features/notifications/` |
| §10.5 indicador | PARCIAL | S202-A06 |
| §11.1 enums, FKs, índices e transações | CONFORME | enum `NotificationType`; `onDelete` explícito nas cinco FKs (destinatário e projeto `Cascade`, ator e tarefa `SetNull`, preferência `Cascade`); índices de lista, projeto, tarefa, ator e retenção. A falta de índice em `Task.deadline` não pesa: 10.000 tarefas num projeto ficam no orçamento (seção 14) |
| §12.1–12.4 contrato | NÃO CONFORME com o anexo (DR declarada) | a divergência está no `API_CONTRACTS.md` e no ADR-016 D17; nenhum ponto novo além dos declarados. O ADR de versão e contrato é da campanha de conformidade |
| §13.2 entrada | CONFORME | guarda local de protótipo nos corpos do S2-02; o restante da API é o S202-F06 |
| §13.5 autorização | CONFORME | bloco Z |
| §13.8 configuração | CONFORME | `APP_TIMEZONE`, janela e retenção validados na inicialização (tabelas da Fase 4); `.env.example` com as três variáveis. S202-A12 é código morto |
| §13.9 auditoria | CONFORME | decisão declarada (H12 refutada); preferência auditada, com a ressalva do S202-A02 |
| §13.10 erros e lotes | CONFORME | job com criados, já notificados, excluídos por motivo e falhos; `read-all` tudo ou nada |
| §14 LGPD | PARCIAL | S202-A04, S202-A05 |
| §15 testes | NÃO CONFORME (DX) | S202-A07 |
| §16 CI | AUSENTE | commits não publicados |
| §17.4 DoD | PARCIAL | bloco R |
| §18 regra 17 | CONFORME | seção 16 deste relatório |
| §20 ADR | CONFORME | o ADR-016 tem título, estado, data, responsáveis, contexto, decisão, alternativas, consequências positivas e negativas e impactos de segurança e privacidade |

## 11. Bloco C — documento oficial e UC07

| Caso | Veredito | Evidência |
|---|---|---|
| NT-C-01 UC07 A5 (status, histórico e notificação juntos) | CONFORME | NT-S-12 e N4: falha antes ou na notificação desfaz os três |
| NT-C-02 pré-condição "membro autenticado e vinculado" | CONFORME | sem sessão 401; não membro 404 ao mover; nada nasce |
| NT-C-03 E7 "operação não permitida para o perfil" | CONFORME | VIEWER recebe 403 ao mover; status intacto; nenhuma notificação |
| NT-C-04 Quadro 3-56: destinatário do RF30 | CONFORME, com a restrição aprovada | o responsável recebe; quem fez a mudança não é avisado (ADR-016 D3, aval do João) |
| NT-C-05 Quadro 3-55: destinatário do RF59 | CONFORME | o quadro não nomeia destinatário; o ADR-016 D3 declara a origem (descrição do cartão e "partes envolvidas" da §3.2.8) |

## 12. Bloco R — roadmap

| Item do DoD comum (§4) aplicado ao S2-02 | Status |
|---|---|
| funciona de ponta a ponta | **PARCIAL**: o RF59 só roda à mão até o S2-09; S202-A01 |
| regras e autorização no backend | EVIDENCIADO |
| banco, API e interface no mesmo contrato | EVIDENCIADO; o teste novo confere as seis rotas do módulo de API contra o arquivo de rotas |
| migrations novas, versionadas e testadas | EVIDENCIADO localmente (validador de banco vazio em 09/10); a CI não rodou |
| estados de carregamento, vazio, erro e acesso negado | EVIDENCIADO: carregamento, vazio por filtro, erro com nova tentativa, 429 com espera, acesso perdido (404) e conta restrita |
| testes de unidade, integração, frontend e E2E | **PARCIAL**: sem E2E (S202-A07) |
| CI verde | **AUSENTE**: commits não publicados |
| ASVS e LGPD avaliados | EVIDENCIADO (este relatório; delta da baseline; inventário), com os PARCIAIS da seção 9 |
| documentação e matriz RF atualizadas | **PARCIAL**: S202-A13 |
| sem mocks, segredos ou regressões conhecidas | EVIDENCIADO; `security:secrets` verde |

**C4 "em massa":** o produto não tem rota de status em lote. O que "em massa" cobre de fato:
- 100 movimentos seguidos pela API, com 100 notificações (NT-K-02);
- o `read-all`, um único `UPDATE`;
- o `createMany` com `skipDuplicates` do job.

**K4 e a nuvem:** o cartão anexado pede Azure; o do repositório e o do Kanban, OCI. A troca é a
D-RM-01, sem ADR. O job serve aos dois: o runbook traz o timer do `systemd`, o `cron` com `flock` e
a equivalência na Azure. Nenhum agendador está instalado (H14).

**Dependências:**
- "responsáveis RF51": satisfeita (NT-S-09, VIEWER responsável recebe);
- "cronograma e datas da Sprint 1": o S1-04 está implementado, mas não pode ser declarado plenamente
  homologado enquanto o S104-F02 (E2E) estiver aberto;
- "infraestrutura de notificação definida": o próprio S2-02 a define (ADR-016).

**Marco da Sprint 2 (§10):** para o S2-02 contar como homologado faltam a CI verde, o E2E (ou a sua
dispensa por decisão), o agendador instalado na OCI (S2-09), a aprovação visual do João e a decisão
sobre os achados MÉDIOS.

**Estado do cartão:** o checklist do roadmap do repositório continua `[ ]`, porque o roadmap só muda a
pedido do João. A situação observada é "implementado localmente; aberto em homologação".

## 13. Bloco O — documentação × comportamento

| Documento | Resultado |
|---|---|
| ADR-016 | as decisões 1 a 13 têm caso que as prova (D1 NT-L-08, NT-Z-07; D2 NT-S-04, NT-J-01; D3 NT-S-01, NT-P-09, NT-S-09; D4 NT-S-12, NT-S-07b; D5 NT-P-01..08 e Fase 4; D6 NT-J-01..10; D7 NT-F-01..06; D8 NT-S-11; D9 NT-Z-01, NT-D-04; D10 NT-U-01..09; D11 NT-M-01..04; D12 contrato; D13 §9). Divergem: D7 "sem efeito retroativo" (S202-A03); "a notificação é dado do titular" × exportação (S202-A05) |
| `TASK_NOTIFICATIONS.md` | todas as tabelas (tipos, exclusões e ordem, corte nos três fusos, horário de verão, janela, repetição, preferências, visibilidade, métrica, job, retenção) têm caso. Divergem: "ligar de novo não recupera" (S202-A03); métrica incompleta (S202-A06); a diferença de fuso com a tela (S202-A10) |
| `API_CONTRACTS.md` (S2-02) | as seis rotas, o DTO, a ordem, o `read-all` tudo ou nada e a divergência declarada conferem; faltam os códigos de conta restrita (S202-A13); `deadline` com hora (S202-A09) |
| `AUTHORIZATION_MATRIX.md` | as duas linhas do S2-02 conferem com o bloco Z |
| `runbooks/TASK_NOTIFICATIONS.md` | o comando roda como escrito, em processo separado, no banco de teste (NT-J-10); a saída tem exatamente os campos documentados (NT-J-05); código de saída (NT-J-04) e eventos de log (NT-J-06) conferem; a recuperação de parada longa é a janela (NT-P-04). Projeto inexistente (S202-A08) |
| `ASVS_BASELINE.md` (delta S2-02) | confere, exceto V14.1.1/V14.2.4 e V16.3.3, que a seção 9 rebaixa para PARCIAL; a evidência declarada para V1.2.1 cobria só o título |
| `PERSONAL_DATA_INVENTORY.md`, `DATA_RETENTION_POLICY.md` | conferem com a retenção, a anonimização e a exportação observadas (NT-D-01..04); S202-A04 e S202-A05 |
| `RF_TECHNICAL_MATRIX.md` | "IMPLEMENTADO LOCALMENTE; homologação visual, CI e agendador pendentes" confere; faixa de commits incompleta (S202-A13) |
| `UI_SURFACE_INVENTORY.md` | as três superfícies continuam NOT REVIEWED / TECHNICALLY VERIFIED, coerente com a aprovação visual pendente; frase desatualizada sobre a central (S202-A13) |
| `TECHNICAL_BACKLOG.md` | S202-F01..F08 continuam válidos; os itens novos estão abaixo |

**Itens novos de backlog** (registrados em `TECHNICAL_BACKLOG.md`):

| ID | Item | Origem |
|---|---|---|
| S202-F09 | paginação estável no filtro Não lidas | S202-A01 |
| S202-F10 | auditoria das preferências sob concorrência | S202-A02 |
| S202-F11 | regra do RF59 ao religar a preferência | S202-A03 |
| S202-F12 | contas restritas como destinatárias | S202-A04 |
| S202-F13 | notificações ocultas na exportação | S202-A05 |
| S202-F14 | completar a definição da métrica e a medição por eventos distintos | S202-A06 |
| S202-F15 | aviso e código de saída para `--project-id` sem projeto | S202-A08 |
| S202-F16 | formato de `deadline` na API | S202-A09 |
| S202-F17 | documentação: fuso da tela, códigos de conta, matriz RF, inventário de UI e `isValidTimeZone` | S202-A10, S202-A12, S202-A13 |
| S202-F18 | corte do vencimento quando o dia seguinte não existe no fuso | S202-A14 |

O S202-A07 já está no S104-F02, e o S202-A11 entra como critério do S2-03 (registrado no S202-F17).

## 14. Desempenho (⚑5)

Medido em 10/10/2026 com scripts temporários, não versionados, no MySQL de teste (os scripts
abortam se `SELECT DATABASE()` não terminar em `_test`). Os dados foram apagados ao fim de cada
medição.

**Job, num projeto com 5 membros** (prazos espalhados por 60 dias, um terço concluídas, um sétimo
sem responsável, `now` = 20/10/2026 12:00 UTC):

| Tarefas no projeto | Avaliadas (`scanned`) | Dry-run | Primeiro apply | Segundo apply (nada novo) | Orçamento |
|---:|---:|---:|---:|---:|---|
| 10.000 | 830 | 125 ms | 169 ms (712 criadas) | 161 ms | ≤ 1 s: **cumprido** |
| 50.000 | 4.165 | 776 ms | 1.044 ms (3.570 criadas) | 978 ms | ≤ 5 s: **cumprido** |

A faixa de prazos (`dueDateRange`) limita a leitura às tarefas com corte na janela: o custo cresce
com as avaliadas, não com o tamanho do projeto.

**Leitura, com 1.000 notificações do usuário** (metade lida; 10 medições depois do aquecimento):

| Chamada | Mediana | Máximo | Orçamento |
|---|---:|---:|---|
| lista `ALL`, página 1 | 8 ms | 9 ms | ≤ 300 ms: **cumprido** |
| lista `UNREAD`, página 25 | 8 ms | 12 ms | ≤ 300 ms: **cumprido** |
| contador | 2 ms | 3 ms | ≤ 300 ms: **cumprido** |

Os mesmos orçamentos estão na suíte (NT-J-08), com folga para a CI.

## 15. Fase 7 — roteiro manual

Executada em 10/10/2026 no ambiente do João:
- backend na 3001 e frontend na 5173, subidos por ele;
- conta 1 (João, OWNER do `[S2-01] Escala`, id 4) e conta 9, criada por ele para o ⚑3, que entrou no
  projeto como MEMBER. As duas têm o mesmo nome de exibição; a evidência separa pelos ids;
- a conta 1 rodou no Chrome dele e depois no painel Browser do aplicativo; a conta 9, no Chrome. As
  senhas foram digitadas pelo João;
- carga `s202-seed-escala-dev.mjs`, rodada por ele: 120 tarefas do João no `[S2-01] Escala`, movidas
  pela pessoa de verificação, com 120 notificações não lidas.

Os cliques foram disparados por eventos no DOM; as teclas (Tab, Shift+Tab, Enter) foram físicas. A
aba estava `visibilityState: visible`. A evidência é o texto da página e da API, lido depois de cada
passo, mais capturas.

| Caso | Status | Observado |
|---|---|---|
| M-01 contador no extremo de escala (NT-U-01) | **APROVADO** | "99+" e "Notificações, 120 não lidas" no menu. Sidebar recolhida: o selo fica dentro do ícone de 52 px, e o nome completo está no rótulo acessível e na dica. Gaveta em 390 px: selo "99+" e foco em "Fechar navegação" ao abrir (O-7). A preferência da sidebar foi devolvida a expandida |
| M-02 primeira carga e consulta periódica (NT-U-02, H17) | **APROVADO** | primeira carga em `/`: consultas em 418 ms (duas, `StrictMode`) e 507 ms (depois do redirecionamento para `/projects`). Na central: consultas em 1 s (duas), 61 s e 121 s, mais uma provocada pela marcação por teclado. Depois do logout, 153 s sem consulta nova |
| M-03 central no extremo de escala e H1 na tela (NT-U-04) | **APROVADO**, com o S202-A01 confirmado | 20 de 120 na primeira página, filtro Não lidas por padrão, "Carregar mais" visível. Marcadas 4 como lidas (TASK-2224, 2222, 2221 e 2220), "Carregar mais" trouxe TASK-2200 a 2181: **TASK-2204 a 2201, não lidas, nunca apareceram**. Um quinto clique, 150 ms depois do anterior, foi descartado sem aviso (O-2) |
| M-04 marcar, desmarcar, Todas e abrir tarefa (NT-U-05) | **APROVADO** | "Marcar como não lida" volta o contador de 116 para 117. "Todas" mostra lidas e não lidas (126 no total). "Abrir tarefa TASK-2219" leva a `/projects/4/kanban?task=2219` com o detalhe aberto e baixa o contador para 116 |
| M-05 RF59 e H9 no ambiente (seção 5.3) | **APROVADO**, com o S202-A03 confirmado | o prazo da TASK-2219 foi mudado pela tela para 08/10/2026 ("Atrasada" no cartão do Kanban). Preferência de prazo vencido desligada → `notifications:due:dry-run` e `notifications:due` com `--project-id=4` → nenhuma notificação de prazo para a TASK-2219. Preferência religada → `notifications:due` → **a notificação nasce** ("Prazo vencido · Prazo venceu em 08/10/2026", criada em 20:46:37 UTC). As saídas do job não foram coladas; o efeito foi conferido pela API depois de cada execução |
| M-06 preferências (NT-U-08) | **APROVADO** | os dois interruptores com descrição ligada por `aria-describedby`; "Salvar preferências" inativo sem mudança; "Preferências salvas." e foco devolvido ao botão; o servidor guarda o valor. Estado final igual ao inicial (as duas ligadas) |
| M-07 RF30 feito por outra pessoa (⚑3) | **APROVADO**, com a O-8 | a conta 9 moveu a TASK-2218 (responsável João) de Em andamento para Concluído pelo menu "Mover tarefa". Na central do João: "João Vitor Hernandes moveu de Em andamento para Concluído", com `actor.id` 9. A conta 9 não recebeu aviso do próprio movimento |
| M-08 isolamento e extremo mínimo | **APROVADO** | a conta 9, sem projeto: "Nenhuma notificação não lida." e "Nenhuma notificação recebida.", sem contador, "Marcar todas" inativo. O João tornou a conta 9 responsável pela TASK-2217 e a moveu: a conta 9 passou a ter exatamente 1 notificação (selo "1", "Notificações, 1 não lida", sem "Carregar mais"); a API da conta 9 devolve só ela, nenhuma das 127 do João |
| M-09 acesso perdido e restaurado | **APROVADO** | com o cartão aberto na conta 9, o João desativou a membership ("Membro desativado."). "Marcar como lida" na conta 9: "Esta notificação não está mais disponível.", lista recarregada vazia, contador some, foco no título da lista. Membership reativada ("Membro reativado."): a notificação volta, ainda não lida |
| M-10 tarefa excluída (NT-U-05) | **APROVADO** | TASK-2216 excluída pela tela, com aval do João. O cartão mantém "[S2-02] Carga de escala 112", mostra "Tarefa excluída" e não tem link; o DTO traz `available: false`, `code` e `link` nulos |
| M-11 marcar todas (NT-U-05) | **APROVADO** | com aval do João: "117 notificações marcadas como lidas.", foco no título "Não lidas", botão inativo e contador oculto. A notificação da conta 9 continuou não lida |
| M-12 larguras, temas e teclado (NT-U-10) | **APROVADO** | central e preferências em 390, 768, 1024 e 1440 px (iframe da mesma origem) e 1536 px (janela), nos temas claro e escuro: sem rolagem horizontal da página em nenhuma das 16 combinações; em 390 e 768 px só a faixa de abas das Configurações rola, como projetado. Teclado: "Marcar todas" → filtro (uma parada) → em cada cartão "Abrir tarefa" e "Marcar como lida"; contorno de foco visível (2,4 px); Enter marca e mantém o foco no botão, que passa a "Marcar como não lida" |
| M-13 logout (NT-U-07) | **APROVADO** | "Sair" leva ao login, sem nada da central na tela; nenhuma chave de notificação em `localStorage` ou `sessionStorage`; a consulta periódica para |
| M-14 HTML no nome do projeto e do ator, na tela real (NT-U-06) | **NÃO EXECUTADO** | exigiria renomear o projeto e a conta; coberto em jsdom (NT-U-06, M27 morto) |

**Alterações feitas nos dados de verificação pelo roteiro:**
- código de acesso do `[S2-01] Escala` regenerado (O-10);
- conta 9 incluída no projeto como MEMBER;
- TASK-2219 com prazo 08/10/2026; TASK-2217 com a conta 9 como responsável;
- TASK-2217 e TASK-2218 movidas para Concluído; TASK-2216 excluída;
- as 117 notificações não lidas do João marcadas como lidas.

As preferências, o tema (escuro) e a sidebar (expandida) do João ficaram como estavam. A remoção da
carga de escala é proposta ao João (`s202-cleanup-escala-dev.mjs`, fora do repositório).

## 16. O que não pôde ser validado

- **Agendador real (⚑4):** nenhum está instalado; a unidade e o timer foram conferidos por inspeção.
- **Aprovação visual (VISUALLY APPROVED):** é decisão do João.
- **CI:** os commits do S2-02 e da campanha não foram publicados. O risco S201-F06 (timeouts do
  frontend na suíte completa) continua sem prova na CI; os arquivos da campanha rodam verdes
  isolados.
- **E2E de navegador:** não existe (S202-A07).
- **Limitador sob carga real e em mais de uma instância:** o contador fica em memória local.
- **Consultas ao contador em produção (H17, ⚑6):** medidas só em desenvolvimento, com o efeito do
  `StrictMode` explicado por inspeção.
- **Saídas do job no ambiente do João (M-05):** não foram coladas; o efeito de cada execução foi
  conferido pela API.
- **HTML em nomes na tela real (M-14):** não executado; coberto em jsdom.
- **Logs em sistema separado (V16.4.2, V16.4.3):** pertencem ao ambiente (S2-10).

## 17. Correções (10/10/2026)

O enunciado está em [S2_02_PROMPT_CORRECOES.md](S2_02_PROMPT_CORRECOES.md). O João aprovou os dez
⚑ com as recomendações ("pode seguir"). Cada correção nasceu com o teste de regressão vermelho pelo
motivo do achado. As reproduções vermelhas da campanha (H1 na API e na tela, H9 e H11) são agora
C2-01, C3-01, C5-01 e C4-01, verdes.

| Achado | Correção | Commit | Testes de regressão |
|---|---|---|---|
| — | ADR-016 revisto; `TASK_NOTIFICATIONS.md` (exclusões, corte, prazo com hora, preferências, leitura, métrica com os oito itens, job, exportação); contrato; runbook; matriz RF; inventário de UI | `e3da602` | — |
| S202-A14 | `startOfLocalDay` busca o primeiro instante do dia local que existe quando o dia pedido foi pulado | `52076a4` | C1-01 (Apia, Fakaofo, Kwajalein, Kiritimati), C1-02 (oráculo nos anos das transições) |
| S202-A01 | `cursor` opaco e `nextCursor` na API; `cursor` e `page` exclusivos | `52100ec` | C2-01 (H1), C2-02 (empate e chegada nova), C2-03 (cursor inválido, com `page`, repetido, alheio) |
| S202-A01, O-2, O-7, O-4 | "Carregar mais" pelo cursor; ocupado por cartão; ponto e rótulo no botão ☰; sem o `\|\| 60` | `d9ea88a` | C3-01 (H1 na tela), C3-02, C3-03; dois testes da bateria reescritos para o cursor |
| S202-A02 | `lockUser` no `PUT` de preferências; só os tipos que mudam são gravados | `da4df65` | C4-01 (H11 em dez rodadas, `PUT` iguais, `PUT` sem mudança) |
| S202-A03 | `enabledAt` (migration `20261011010000_notification_preference_enabled_at`); `preferenceAllowsOverdue` no job | `3aab6cd` | C5-01 (H9), C5-02 (antes do corte, no instante do corte, nunca desligada, prazo novo, quando `enabledAt` muda, tabela da política) |
| S202-A04 | motivo `INACTIVE_ACCOUNT` no gatilho do RF30 e no job | `2111706` | C6-01 (NT-Z-02/H4 reescrito), C6-02 (tabela do RF30 com o estado da conta, reativação, ordem no job); tabelas de 32 combinações |
| S202-A05 | `notifications.json` com todas as notificações do titular e `visible` | `d20d90a` | C7-01; teste de contrato da exportação atualizado |
| S202-A08, S202-A12 | código 2 e aviso em `stderr` para `--project-id` sem projeto; sai `isValidTimeZone` | `6fb4968` | C8-01 (NT-J-09/H16 reescrito) e o caso sem `--project-id` |
| S202-A06, A09, A10, A13 | documentação | `e3da602` e o commit deste registro | — |

**Desvios do enunciado, todos sem mudança de decisão:**

- **Regra de recuperação corrigida no meio da rodada.** A Fase 0 escreveu que reativar a conta ou
  voltar ao projeto não recupera o que foi excluído. Isso vale só para o RF30. No RF59 o job avalia
  conta e membership a cada varredura (ADR-016 D3), e só a preferência religada não recupera. Os
  testes C6-02 provam os dois lados; ADR-016 e `TASK_NOTIFICATIONS.md` foram corrigidos em
  `2111706`.
- **Primeira página com `page=1`.** A central só usa o cursor no "Carregar mais"; a resposta da
  primeira página já traz `nextCursor`. Com cursor, `pagination.page` vem `null` (contrato).
- **Casos de cursor inválido nasceram verdes**, porque o parâmetro ainda não existia e o schema
  estrito já devolvia 400. Eles protegem a validação nova: os mutantes M42 (sem a checagem da data)
  e M43 (sem o teto do id) morreram com eles.
- **M34 redefinido.** Depois da Fase 4, o `PUT` grava só os tipos que mudam; "regravar `enabledAt`
  em todo `PUT`" virou "percorrer todos os tipos". Entrou também o M34b (religar sem gravar
  `enabledAt`).
- **`prisma format` reformatou um modelo fora do escopo** (`ProjectPurgeStorageCleanup`). O schema
  foi restaurado e só o campo novo entrou.
- **`prisma generate` falhou com `EPERM` no Windows**, porque o servidor de desenvolvimento do João
  segurava a DLL do motor. O cliente JS foi gerado (o `enabledAt` está nele) e a DLL é a mesma.
- **Contrato do repositório do job:** `disabledRecipientIds` virou `overduePreferences`, e entrou
  `activeAccountIds`. Os dois repositories falsos dos testes ganharam os métodos novos.
- **Testes que fixavam o contrato antigo**, atualizados no commit da correção: NT-J-05, NT-P-09, o
  teste da política, o do script e o de contrato da exportação.

**Verificação (Fase 10):**

| Item | Resultado |
|---|---|
| Suíte completa do backend, duas vezes | 1916 verdes, 5 ignorados e a mesma falha de ambiente nas duas (`storage.test.js`, `EPERM` de symlink no Windows) |
| Suítes do S2-02 | 233 no backend (191 antes das correções) e 71 no frontend, todas verdes, inclusive as baterias da campanha |
| Gates do backend | `lint`, `format:check`, `architecture:check` e `security:secrets` verdes |
| Cadeia de migrations em banco vazio | 63 de 63 aplicadas num banco temporário do servidor de teste, removido depois; `NotificationPreference.enabledAt datetime(3) null` (validador equivalente ao `db:test:validate-empty`, por causa do S201-F14) |
| Auditoria de schema (`db:lr5:audit -- --test`) | `SCHEMA_CONSISTENT` |
| Gates do frontend | arquivos das notificações e `AppShell.test.jsx` isolados (83 verdes); `lint`, `format:check` e `build` verdes |
| Mutação dirigida | 22 de 22 mortos: M31 (cursor sem desempate), M32 ("Carregar mais" por página), M33 (`PUT` sem bloqueio), M34 (todos os tipos regravados), M34b (religar sem `enabledAt`), M35 (job ignora `enabledAt`), M36 e M37 (estado da conta ignorado no RF30 e no job), M38 (exportação filtrada), M39 (código 0), M40 (recurso `second`), M41 (guarda global), M42 e M43 (validação do cursor); M10, M11, M12, M13, M17, M23, M29 e M30 da campanha continuam mortos |
| Tela, na conta do João (painel Browser) | botão ☰ com o ponto e "Abrir navegação, 1 notificação não lida" em 390 px, nos temas claro e escuro, sem rolagem horizontal; o cursor percorre as 6 notificações em páginas de 4 e 2 contra o backend real. A notificação marcada como não lida para a prova voltou a lida |

**Conferência no ambiente do João (10/10/2026):** o João aplicou a migration
`20261011010000_notification_preference_enabled_at` no banco de desenvolvimento
(`npx prisma migrate deploy` em `backend`). Entre o commit `3aab6cd` e a migration, a tela de
preferências e o job falhariam no ambiente de desenvolvimento, porque o código já esperava a coluna.
Depois dela, na conta do João:
- `GET /api/settings/notifications` responde 200, com as duas preferências ligadas;
- `GET /api/notifications?status=ALL&limit=2` responde 200, com `nextCursor` e as 6 notificações no
  total.

O roteiro com a carga de escala (H1 na tela e H9 com a saída do job colada) fica opcional, com aval
para cada carga.
