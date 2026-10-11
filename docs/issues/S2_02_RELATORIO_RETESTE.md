# Relatório do reteste do S2-02 — notificações de tarefa depois das correções (RF30, RF59)

Campanha descrita em [S2_02_PROMPT_RETESTE_NOTIFICACOES.md](S2_02_PROMPT_RETESTE_NOTIFICACOES.md),
com o mapa de casos em [S2_02_MAPA_RETESTE.md](S2_02_MAPA_RETESTE.md). Este relatório traz os
vereditos atuais do cartão. O [relatório da primeira campanha](S2_02_RELATORIO_TESTES.md) fica como
histórico, com uma nota no topo que aponta para cá.

| Item | Valor |
|---|---|
| Executada em | 10 e 11/10/2026 |
| Branch | `joao-dev-v2` local, sem push |
| Base | `daebc97` (último commit das correções) |
| Commits | `3f7a437` (Fase 1), `e88f81c` (2), `0fc20cc` (3), `eb99cf1` (4), `855b460` (5), `75df853` (6) e o deste relatório (7 e 8) |
| Aval dos ⚑ (10/10, "pode seguir") | 1 registrar sem corrigir, prefixo S202-R; 2 relatório novo e nota no anterior; 3 arquivos `s202-reteste`; 4 conta 9 desativada pelo fluxo do aplicativo; 5 lista ≤ 300 ms por página com 10.000 notificações e exportação ≤ 5 s com 5.000; 6 migration só investigada; 7 roteiro manual em vez de E2E |
| Anexos | os mesmos da primeira campanha (`a2fa1bbe…`, `e904fd62…`, `4c18dbbc…`); as três versões do cartão não mudaram |
| Ambiente | Windows 11; Node v22.18.0 (ICU 77.1, tzdata 2025b); MySQL de teste `traceflow_test`; Prisma 6.12.0 |
| Código de produção | intocado: `git diff --exit-code -- backend/src backend/scripts frontend/src` limpo depois de cada fase e de cada mutação |
| Fase 7 | executada em 10 e 11/10 no ambiente do João (seção 15): 8 casos aprovados, 2 deles com achado BAIXA (S202-R08, S202-R09) |

## 1. Resumo

**As correções da primeira campanha se sustentam.** Cada uma das 14 foi verificada por um caso
independente, com entrada diferente da do teste da correção (bloco V). As do cursor, da preferência
religada, da conta restrita e da exportação passaram também no ambiente do João, com o job rodado e
a saída capturada. Os 6 testes cujo esperado mudou nas correções se apoiam em regra escrita antes do
código. A exceção é a marcação por cartão (S202-R05).

**O reteste encontrou 9 achados, nenhum ALTA:**
- **1 MÉDIA (S202-R01).** Um `PUT` de preferências que espera o bloqueio do usuário além de 5 s
  derruba, por alguns segundos, requisições de outras pessoas, com 401 indevido (que desloga) ou
  500. A causa é o tempo da transação interativa do Prisma, menor que a espera de bloqueio do MySQL.
  Ninguém provoca a espera pela API em uso normal; ela depende de outra transação segurando o
  `User`;
- **8 BAIXAS:**
  - métrica: M1/M2 sem o quinto motivo;
  - documentação: relatório anterior desatualizado, baseline ASVS, marcação por cartão e seis
    comportamentos sem frase;
  - nome da migration;
  - acessibilidade: o ponto do ☰ some em alto contraste;
  - desempenho: "Carregar mais" refaz a lista inteira.

**O cartão continua "implementado localmente, aberto em homologação".** Faltam a CI, o E2E (ou a
dispensa por decisão), o agendador instalado (S2-09), a aprovação visual do João e a decisão sobre o
S202-R01.

| Números | Valor |
|---|---|
| Testes novos do reteste | 87 execuções: API 20, integração 30, unidade 23, frontend 14 |
| Suíte completa do backend, duas vezes (depois do último commit de teste) | 1989 verdes, 5 ignorados e 1 falha de ambiente, iguais nas duas: `storage.test.js` do S1-07, `EPERM` ao criar symlink no Windows |
| Frontend das notificações | 6 arquivos (`Notifications.reteste`, `Notifications.bateria`, `NotificationsPage`, `NotificationPreferencesPage`, `notification-view`, `AppShell`), 97 verdes |
| Gates | `lint`, `format:check`, `architecture:check` e `security:secrets` do backend; `lint`, `format:check` e `build` do frontend; todos verdes |
| Migrations | 63 aplicadas num banco vazio temporário; `SCHEMA_CONSISTENT` no banco de teste |
| Mutação | 89 entradas: 83 mortas, 5 equivalentes justificadas (M02, F7, F9, MR11, MR14) e 1 retirada (S15) |
| Cobertura | política com 100% de linhas; repository, serviço, mapper e validação com 100% de ramos; script com 90,6%; frontend da feature entre 95% e 100% |

## 2. Veredito atual por critério do cartão

| Critério | Primeira campanha | Agora | Sustentação |
|---|---|---|---|
| C1 mudança de status notifica o responsável correto com contexto | ATENDE COM RESSALVA (S202-A04) | **ATENDE**, com a restrição aprovada (quem move não é avisado, ADR-016 D3) | RT-V-04 pela API e no ambiente do João; RT-N-A-01 (48 combinações); RT-N-A-05; M36, MR08a mortos |
| C2 tarefa vencida gera uma notificação sem repetição indevida | ATENDE COM RESSALVA (S202-A03; sem agendador) | **ATENDE COM RESSALVA**: sem agendador instalado, o RF59 só roda à mão (S2-09) | RT-V-03 no banco e no ambiente do João; RT-N-E-01..03 (±1 ms em torno do corte); RT-V-08; M35, MR07, S9b mortos |
| C3 leitura/não leitura e link persistem | ATENDE COM RESSALVA (S202-A01) | **ATENDE COM RESSALVA**: S202-R08 e S202-R09 (BAIXAS de tela) | RT-V-01 na API e na tela (1.120 não lidas), RT-N-C-01..09, RT-V-09; MR01–MR05 mortos |
| C4 alterações em massa e concorrentes são idempotentes | ATENDE COM RESSALVA (S202-A02) | **ATENDE COM RESSALVA**: S202-R01 | RT-V-02, RT-N-L-01..04 (sem deadlock, usuários diferentes em paralelo); M33, MR06 mortos |
| C5 timezone e corte documentados e testados | ATENDE COM RESSALVA (S202-A09, S202-A10) | **ATENDE**, com o item 6 do S202-R06 | RT-N-P-01..03 (oráculo em 9 fusos de 2010 a 2030 e nos quatro dias saltados); varredura de 418 fusos (MR11); A09, A10 e A14 conferidos |
| C6 somente destinatários autorizados visualizam | ATENDE | **ATENDE** | RT-N-C-09 (o cursor só posiciona); RT-V-05 e RT-N-X-01; bloco Z da primeira campanha verde |
| C7 (documento oficial) métrica com termos definidos e medição reproduzível | ATENDE COM RESSALVA (S202-A06) | **ATENDE COM RESSALVA**: S202-R02; instrumento com dados reais no S202-F14 | RT-N-A-04/RT-M-01 com os cinco motivos; oito itens da §10.5 presentes |
| K1 contrato de evento e preferências | ATENDE COM RESSALVA | **ATENDE COM RESSALVA**: S202-R06; S202-A11 aberto por decisão (S202-F17) | contrato e regra conferidos (bloco O) |
| K2 migration, job seguro e índices | ATENDE | **ATENDE**, com o S202-R07 | 63 migrations em banco vazio; código 2 (RT-V-06, MR10); keyset no orçamento (seção 14) |
| K3 API e interface | ATENDE COM RESSALVA (S202-A01) | **ATENDE COM RESSALVA**: S202-R01, S202-R08, S202-R09 | blocos N-C, N-U; roteiro da Fase 7 |
| K4 scheduler compatível com a nuvem planejada | NÃO VERIFICÁVEL LOCALMENTE | **NÃO VERIFICÁVEL LOCALMENTE** | nada mudou; depende do S2-09 |
| K5 testes de prazos, fusos, deduplicação e autorização | ATENDE | **ATENDE** | 89 mutantes; 87 execuções novas |

## 3. Achados

### [MÉDIA] S202-R01 — `PUT` de preferências que espera o bloqueio do usuário além de 5 s derruba requisições de outras pessoas, com 401 indevido (logout) e 500

- Onde: `backend/src/modules/notifications/notification.repository.js:200–:202`
  (`savePreferences`: transação interativa do Prisma, com tempo padrão de 5 s, e `lockUser`, um
  `SELECT … FOR UPDATE` no `User`, de `src/database/locks.js:5`). O efeito aparece em
  `backend/src/modules/auth/auth.service.js:149` (a sessão é lida como inexistente) e em
  `frontend/src/api/http-client.js:90` (todo 401 `AUTHENTICATION_REQUIRED` desloga a pessoa)
- Norma: `API_CONTRACTS.md` (401 só para "requisição sem sessão"); ASVS V16.5.3 (falhar de forma
  segura, sem efeito fora da operação que falhou); §13.10 do anexo (erros tratados)
- Esperado: o `PUT` que não consegue o bloqueio a tempo falha sozinho, com erro genérico, e as
  outras requisições seguem normais
- Observado:
  - o `PUT` responde 500 genérico depois de cerca de 6,7 s. O Prisma encerra a transação em 5 s
    (`P2028`), mas o `SELECT … FOR UPDATE` continua esperando no MySQL;
  - **a requisição seguinte de outra conta**, sem relação com o bloqueio, respondeu 401
    `AUTHENTICATION_REQUIRED` ou 500 em todas as execuções: 3 de 3 no RT-N-L-05 (campo `other` do
    registro) e 4 de 4 no experimento de alcance. Com 401, a central desloga essa pessoa, embora a
    sessão continue válida (`revokedAt` nulo nas duas contas);
  - enquanto o bloqueio não é liberado, as requisições seguintes das duas contas respondem 500. Uma
    vez liberado, tudo volta: numa sondagem a cada 3 s por 60 s, `/health/ready` e a rota da outra
    conta responderam 200 desde o primeiro segundo;
  - numa das execuções, o motor do Prisma entrou em pânico (`thread 'tokio-runtime-worker' panicked
    … Could not figure out an ID in create`), e as três rodadas seguintes falharam já no cadastro;
  - reprodução mínima, só com o Prisma: depois do `P2028` com consulta em voo (`SELECT SLEEP(7)` ou
    espera de bloqueio), a consulta seguinte falha com `Server has closed the connection` e as
    outras voltam. Com `SET SESSION innodb_lock_wait_timeout = 3` dentro da transação, o MySQL
    devolve o erro 1205 em 3 s, antes do Prisma, e nada falha depois (duas execuções de cada
    cenário)
- Reprodução: `cd backend && npx vitest run test/integration/s202-reteste.test.js -t "RT-N-L-05"`;
  o registro `RT-N-L-05 {…}` traz `other`, a resposta da outra conta. Experimento de alcance e
  reprodução mínima ficaram fora do repositório, no scratchpad da campanha
- Consequência: uma única espera longa por um `User` derruba por alguns segundos requisições de
  pessoas sem relação com ela, e algumas são deslogadas. Ninguém consegue causar uma espera de mais
  de 5 s pela API em uso normal, porque o bloqueio do `PUT` dura milissegundos. Ela aparece quando
  outra transação segura o `User`: anonimização longa, `ALTER TABLE` numa migration, backup com
  trava ou banco sobrecarregado. Não houve dado trocado entre pessoas, mas o pânico mostra o
  resultado de uma consulta chegando à operação errada dentro do motor, então isso não pode ser
  descartado
- Origem: introduzido pela correção `da4df65` (`lockUser` no `PUT`), sobre um comportamento do Prisma
  6.12 com MySQL que vale para qualquer transação interativa que estoura o tempo com consulta em voo.
  Os outros bloqueios (`lockProject`, `lockMilestone`) têm o mesmo risco e não foram medidos aqui
- Proposta:
  - no `PUT`, limitar a espera abaixo do tempo da transação (`SET SESSION innodb_lock_wait_timeout
    = 3` antes do `lockUser`, ou `FOR UPDATE NOWAIT` com nova tentativa curta) e responder 409 ou 503
    com `Retry-After` ao erro 1205;
  - auditar as outras transações com `FOR UPDATE` pela mesma regra: espera do banco menor que o
    tempo da transação;
  - regressão: o RT-N-L-05 com a outra conta respondendo 200

### [BAIXA] S202-R02 — a regra executável diz que M1 e M2 medem "um de cada exclusão", mas os dois cenários têm quatro motivos, sem `INACTIVE_ACCOUNT` (R1)

- Onde: `docs/data/TASK_NOTIFICATIONS.md`, "Medição" e "Resultado em 09/10/2026";
  `backend/test/integration/s202-notifications.test.js:343` (M1) e `:397` (M2)
- Norma: `TASK_NOTIFICATIONS.md`, tabela da métrica (`INACTIVE_ACCOUNT` entre as exclusões por regra
  dos dois RFs); §10.5 do anexo (forma de atualização reproduzível); critério C7
- Esperado: o cenário reproduzível entregue ao S3-01 cobre cada motivo publicado
- Observado: M1 conta `NO_RESPONSIBLE`, `SELF_CHANGE`, `INACTIVE_MEMBER` e `PREFERENCE_OFF`; M2 conta
  `OUTSIDE_WINDOW`, `NO_RESPONSIBLE`, `INACTIVE_MEMBER` e `PREFERENCE_OFF`. A tabela de 09/10 repete
  os quatro, sem dizer que é anterior ao motivo novo (`2111706`). O cenário com os cinco motivos só
  existe neste reteste (RT-N-A-04/RT-M-01)
- Reprodução: `grep -n "INACTIVE_ACCOUNT" backend/test/integration/s202-notifications.test.js` não
  acha nada
- Consequência: quem usar M1/M2 como instrumento no S3-01 não exercita o quinto motivo; a frase
  publicada é falsa desde `2111706`
- Origem: documental, deixada pela correção `2111706`. O motivo entrou no código e na tabela, mas não
  nos cenários M1/M2 nem no resultado publicado
- Proposta: acrescentar a conta restrita a M1 e M2, ou apontar o RT-N-A-04 como cenário oficial, e
  republicar o resultado com data, marcando o de 09/10 como histórico

### [BAIXA] S202-R03 — o relatório da primeira campanha mostra vereditos de antes das correções (R2)

- Onde: `docs/issues/S2_02_RELATORIO_TESTES.md`, seções 1, 2, 9, 10 e 12
- Norma: regra 17 da §18 do anexo (registrar o estado real); ⚑2 deste reteste
- Esperado: quem abre o relatório sabe qual veredito vale
- Observado: a seção 2 ainda diz, em C1, "contas desativadas continuam recebendo (S202-A04)"; em C2,
  "religar a preferência notifica…"; em C3, "Carregar mais pula…". A seção 9 tem V14.x e V16.3.3
  PARCIAIS; a 10, §14 PARCIAL; a 12, "PARCIAL: S202-A01". A seção 17, no fim, diz que tudo foi
  corrigido, sem rever as anteriores
- Reprodução: ler as seções citadas e a 17
- Consequência: leitura errada do estado do cartão por quem não chega ao fim do documento
- Origem: documental, das correções (`a15e44b` acrescentou a seção 17)
- Proposta: **aplicada nesta campanha pelo ⚑2.** Nota no topo do relatório anterior apontando para
  este; o texto antigo fica como histórico

### [BAIXA] S202-R04 — o delta do S2-02 na `ASVS_BASELINE.md` não acompanha o cursor, o código 2 e as medições novas

- Onde: `docs/security/ASVS_BASELINE.md`, linhas V14.2.1, V15.1.3/V15.2.2, V2.3.4 e V16.5.2/V16.5.3
  do delta S2-02
- Norma: ASVS 5.0.0 (requisitos citados); §17.4 do anexo (evidência atualizada)
- Esperado: cada linha descreve a superfície atual e aponta a evidência atual
- Observado:
  - V14.2.1 diz que a query "só leva `status`, `page` e `limit`". Agora também leva `cursor`, opaco,
    com instante e id, sem dado pessoal;
  - V15.1.3/V15.2.2 só citam o job; a lista por cursor e a exportação não estavam medidas;
  - V2.3.4 só cita o índice único, não o `PUT` serializado;
  - V16.5.2/V16.5.3 dizem "sai com código 1", sem o 2;
  - o parágrafo "Correções de 10/10/2026" não cobre essas linhas
- Reprodução: ler as linhas citadas
- Consequência: a baseline descreve uma superfície menor que a real
- Origem: documental, das correções (`e3da602`, `a15e44b`)
- Proposta: atualizar as quatro linhas com a superfície e as evidências deste relatório (seções 11 e
  14). V16.5.x passa a PARCIAL enquanto o S202-R01 estiver aberto

### [BAIXA] S202-R05 — a marcação por cartão chegou ao código antes de uma regra versionada (RT-G-06)

- Onde: `frontend/src/features/notifications/pages/NotificationsScreen.jsx:33–:61` (`busyIds`);
  esperado alterado em `frontend/test/pages/Notifications.bateria.test.jsx` (`d9ea88a`)
- Norma: regra de trabalho das correções (teste alterado se apoia em regra escrita antes do código)
- Esperado: a regra nova num documento do repositório antes do commit que muda o teste
- Observado: o cursor está no ADR-016 D8 (`e3da602`, antes do código). A marcação por cartão só
  existia no ⚑2 do prompt de correções, que não é versionado; o inventário de UI recebeu "marcação
  por cartão" em `a15e44b` (19:20), depois de `d9ea88a` (18:46)
- Reprodução: `git log --format="%h %ad" --date=iso -S "por cartão" -- docs/design/UI_SURFACE_INVENTORY.md`
- Consequência: a reauditoria não acha, no repositório, a regra que justificava trocar o esperado no
  momento da troca. O comportamento está correto e documentado agora
- Origem: processo, nas correções (`d9ea88a`)
- Proposta: uma frase no ADR-016 D8 sobre a marcação por cartão

### [BAIXA] S202-R06 — a regra executável, o contrato e o runbook não dizem seis comportamentos observados (R4, R5, R7, R10)

- Onde: `docs/data/TASK_NOTIFICATIONS.md` ("Corte do vencimento", "Preferências", "Visibilidade e
  leitura", "Métrica oficial"); `docs/api/API_CONTRACTS.md` ("Cursor");
  `docs/runbooks/TASK_NOTIFICATIONS.md` ("Código de saída")
- Norma: `TASK_NOTIFICATIONS.md` ("o código e os testes seguem exatamente estas tabelas"); ASVS
  V2.1.1 (regras documentadas)
- Esperado: o comportamento observável está escrito
- Observado:
  1. **R4, forma não canônica do cursor.** Um cursor com bits de sobra diferentes, que decodifica
     para o mesmo texto, responde 200 e dá a mesma posição (RT-N-C-02). O contrato diz "base64url,
     até 128 caracteres" e "cursor malformado responde 400";
  2. **R5, item desmarcado acima do cursor.** Marcado como não lido durante o percurso, ele não volta
     na continuação e aparece numa leitura do início (RT-N-C-08). A regra só fala de notificação
     nova entre páginas. Na central não há perda: o cartão continua na tela;
  3. **R7, relógio da API.** `enabledAt` vem do relógio do processo da API (`clock()` em
     `notification.service.js`) e é comparado com o corte, que é calendário. O `now` do job não
     entra na comparação; a premissa da hipótese foi corrigida. Com o relógio da API desviado `s`,
     uma religação a menos de `s` do corte cai do lado errado. A regra não registra a dependência;
  4. **R10, precedência 1 × 2.** Em apply num banco de produção sem `--confirm-production` e com
     `--project-id` inexistente, sai 1, porque a recusa vem antes da varredura; em dry-run, 2
     (RT-N-J-01). O runbook lista os dois códigos sem dizer qual vence;
  5. **exclusões contam pares já notificados.** Na Fase 7, depois da religação, a TASK-2102 e a
     TASK-2103, notificadas em 09/10, passaram a contar em `PREFERENCE_OFF`. A limitação (1) da
     métrica só avisa isso para o `OUTSIDE_WINDOW`; vale também para `PREFERENCE_OFF` e
     `INACTIVE_*`;
  6. **lista de dias saltados.** A tabela "Dia inexistente" tem Apia, Fakaofo, Kwajalein e
     Kiritimati. A varredura de 418 fusos achou também `Pacific/Enderbury` (hoje `Pacific/Kanton`)
     em 31/12/1994, corte em `1994-12-31T11:00:00.000Z`. O código trata esse caso corretamente; a
     tabela não diz se é exaustiva
- Reprodução: RT-N-C-02, RT-N-C-08, RT-N-J-01; saída do dry-run da seção 15; varredura do MR11
  (seção 8)
- Consequência: nenhuma para o usuário; operação e manutenção sem a regra escrita
- Origem: documental, das correções (`e3da602`)
- Proposta: uma frase em cada ponto. Para o item 1, a alternativa é validar a forma canônica no
  servidor

### [BAIXA] S202-R07 — a migration do `enabledAt` tem a data do dia seguinte ao da criação (R9)

- Onde: `backend/prisma/migrations/20261011010000_notification_preference_enabled_at`
- Norma: §11.1 do anexo (migrations versionadas e ordenadas); convenção do repositório (data e
  sequência no nome: `…010000`, `…010100`, `…020000`)
- Esperado: o nome ordena a migration pela data de criação
- Observado: criada no commit `3aab6cd` em 10/10/2026 18:51 −03:00 (21:51 UTC), com a data 11/10. A
  anterior, `20261010010000_task_notifications`, nasceu em 10/10 01:29 UTC, coerente com o nome. Hoje
  a ordem lexical coincide com a de criação; só uma migration criada noutra branch com data 10/10 e
  sequência maior ficaria antes dela sem ter sido criada antes. Já existe prefixo repetido no
  repositório (`20260910120000_s109_requirement_traceability` e
  `20260910120000_s1_06_preserve_legacy_effort`)
- Reprodução: `git log --format="%h %ad" --date=iso -- backend/prisma/migrations/20261011010000_notification_preference_enabled_at`
- Consequência: risco baixo de ordem trocada ao juntar branches; nenhum efeito hoje
- Origem: correção `3aab6cd`
- Proposta: não renomear, porque a migration já foi aplicada no desenvolvimento (⚑6); escrever a
  convenção de nome (data UTC da criação) junto das instruções de migration

### [BAIXA] S202-R08 — o ponto do ☰ some em alto contraste (R11)

- Onde: `frontend/src/app/layout/AppShell.css:126` (`.trace-shell__menu-dot`, só `background`);
  nenhuma regra `@media (forced-colors: active)` em `frontend/src`
- Norma: WCAG 2.2, 1.4.11 (contraste não textual); ADR-016 D10 ("o botão que abre a navegação
  mostra um ponto quando há não lidas")
- Esperado: o indicador continua perceptível em alto contraste
- Observado: no Chrome do João, com a emulação `forced-colors: active` e o layout de celular (347 px),
  o ponto continua no DOM, mas com fundo `rgb(0, 0, 0)` sobre o cabeçalho `rgb(0, 0, 0)`: invisível.
  O rótulo acessível continua dizendo "Abrir navegação, 1 notificação não lida". Fora do alto
  contraste, o contraste do ponto é 6,04:1 no tema claro e 7,37:1 no escuro
- Reprodução: DevTools → Ctrl+Shift+P → "Emulate CSS forced-colors: active", largura menor que
  768 px, com uma notificação não lida
- Consequência: quem usa alto contraste e enxerga a tela perde o indicador; o leitor de tela continua
  com a contagem
- Origem: introduzido pela correção `d9ea88a` (ponto no ☰, O-7)
- Proposta: em `forced-colors: active`, desenhar o ponto com `forced-color-adjust: none` e
  `background: Highlight`, ou com borda (`border-color` vira `CanvasText`)

### [BAIXA] S202-R09 — cada "Carregar mais" refaz a lista inteira e fica mais lento conforme as páginas se acumulam (R18)

- Onde: `frontend/src/features/notifications/pages/NotificationsScreen.jsx` (lista sem memorização
  por cartão) e `hooks/useNotifications.js:34–:39` (o append cria um array novo)
- Norma: ASVS V15.1.3 (custo de operação documentado e limitado); ⚑5 (orçamento de tempo, aqui só
  registrado)
- Esperado: o custo de cada página não depende de quantas já estão na tela
- Observado: no painel Browser, com 1.120 não lidas, 55 cliques levaram 21,7 s no total. O clique
  sobe de cerca de 160 ms nas primeiras páginas para 500 a 750 ms nas últimas, e o heap vai de 11 MB
  para 106 MB. Nenhum cartão se repetiu. Em jsdom, 300 cartões levam 18 s (RT-N-U-09). O painel
  estava oculto, então os números não incluem pintura
- Reprodução: carga de 1.000 notificações; clicar "Carregar mais" até o fim e medir o tempo até o
  número de cartões aumentar
- Consequência: a tela não trava, mas fica perceptivelmente lenta para quem acumula centenas de
  notificações
- Origem: anterior às correções (a lista já crescia por páginas); o cursor não mudou o custo
- Proposta: memorizar o cartão (`React.memo` com a notificação como chave) ou virtualizar a lista;
  medir de novo com o painel visível

### Observações (sem achado)

- **O-R1, R3 em parte.** No filtro "Todas", o keyset usa só o prefixo `recipientUserId` do índice
  `(recipientUserId, readAt, createdAt)`, com *filesort* sobre cerca de 5.000 linhas estimadas, mas a
  pior página com 10.000 notificações ficou em 98 ms. No "Não lidas", varredura de faixa no índice,
  sem *filesort*. Um índice `(recipientUserId, createdAt, id)` resolveria o "Todas" se o volume
  crescer (S202-F27).
- **O-R2, `Retry-After` fora do 429.** O contador só pausa no 429. Um intermediário que devolva 503 com
  `Retry-After` não pausa a consulta; nenhuma regra diz qual dos dois vale (seção 8, F7).
- **O-R3, validação de banco vazio no Windows.** `db:test:validate-empty` falha antes de aplicar as
  migrations (`spawnSync` de `prisma.cmd` sem shell, `EINVAL`). Já registrado no S201-F14; a
  validação desta campanha usou o validador do scratchpad.
- **O-R4, lista de membros.** `/api/projects/4/members` mostrou `user.isActive: true` para a conta 9
  desativada; o estado vigente é o `accountStatus`, que a lista não traz. Fora do S2-02.
- **O-R5, `cron` sem alerta.** O comando agendado não usa `--project-id`, então o código 2 só aparece
  em execução manual. O `systemd` marca qualquer código diferente de zero como falha; o `cron` do
  runbook não tem alerta descrito para nenhum código, como já era na primeira campanha.
- **O-R6, cursor com anos fora da faixa do MySQL.** `createdAt` em 0000 e 0999 responde 200 com
  lista vazia (RT-N-C-05); nunca 500.
- **O-R7, limitador da exportação.** A terceira exportação da conta 9 na Fase 7 recebeu 429
  (`RATE_LIMIT_EXPORT_MAX=3` por hora), como configurado.
- **O-R8, efeito residual no desenvolvimento.** O `enabledAt` da preferência de prazo vencido da
  conta 1 ficou em `2026-10-11T02:11:51Z`. Prazos dela com corte anterior que ainda não tinham aviso
  não terão.

## 4. Bloco V — cada correção verificada por caso independente

| Caso | Correção | Entrada nova | Resultado |
|---|---|---|---|
| RT-V-01 | A01 (`52100ec`, `d9ea88a`) | 47 não lidas, `limit=10`; marca 3 da página 1 e 1 da 2, desmarca uma lida no caminho; percorre até `nextCursor: null` | **VERIFICADA**: cada não lida aparece uma vez; o total visto é o `unreadCount` do início. Na tela, com 1.120: seção 15 |
| RT-V-02 | A02 (`da4df65`) | 20 rodadas de três `PUT` distintos e um igual ao inicial, pela API | **VERIFICADA**: reaplicar as auditorias leva ao estado final nas 20; nenhum 500 |
| RT-V-03 | A03 (`3aab6cd`) | `enabledAt` gravado pelo `PUT` da API; dois prazos na mesma execução | **VERIFICADA**: o corte anterior à religação não notifica, o posterior notifica. No ambiente do João: seção 15 |
| RT-V-04 | A04 (`2111706`) | `ACTIVE`, `DEACTIVATED`, `DELETION_PENDING`, `ANONYMIZED` × RF30 (API) e RF59 (job) | **VERIFICADA**: só `ACTIVE` recebe; o job conta `INACTIVE_ACCOUNT` nos três estados restritos. No ambiente do João: seção 15 |
| RT-V-05 | A05 (`d20d90a`) | projeto ativo, deixado, excluído e restaurado | **VERIFICADA**: as quatro notificações exportadas, com `visible` igual à central no mesmo instante. No ambiente do João: seção 15 |
| RT-V-06 | A08 (`6fb4968`) | `--project-id` inexistente, excluído e em purga, em dry-run e apply; projeto válido sem vencida | **VERIFICADA**: 2 com aviso em `stderr` nos seis; 0 no válido |
| RT-V-07 | A12 (`6fb4968`) | busca de `isValidTimeZone` em `src`, `scripts` e `test`; `APP_TIMEZONE` com `-03:00`, `+14:00`, `GMT-3`, `UTC-3` | **VERIFICADA**: nome ausente; os quatro recusados |
| RT-V-08 | A14 (`52076a4`) | Apia, Fakaofo, Kwajalein e Kiritimati **pelo job**, `now` no corte e 1 ms antes | **VERIFICADA**: nasce no corte publicado, não 1 ms antes |
| RT-V-09 | O-2 (`d9ea88a`) | três cartões marcados em sequência rápida | **VERIFICADA** em jsdom e na tela: três `PATCH`, três estados finais, contador coerente |
| RT-V-10 | O-7 (`d9ea88a`) | ☰ com 0, 1, 99 e 150 não lidas | **VERIFICADA** em jsdom e na tela (1.120): sem ponto em 0; singular em 1; plural acima |
| RT-V-11 | A06, A09, A10, A13 (`e3da602`) | leitura dirigida | **VERIFICADA**, com o S202-R02: oito itens da métrica (A06); `deadline` com hora no contrato e na regra (A09); diferença com a tela na regra e no ADR (A10); códigos de conta, faixa de commits e inventário de UI (A13) |

## 5. Bloco N — casos novos

| Grupo | Casos | Resultado |
|---|---|---|
| N-C cursor | RT-N-C-01..09 (API), RT-N-C-10 (integração) | 128 caracteres sem conteúdo válido → 400, 129 → 400, válido → 200; `=`, `+` e `/` → 400; forma não canônica → 200 na mesma posição (S202-R06, item 1); cursor de `UNREAD` em `ALL` posiciona pela mesma ordem; cursor de notificação apagada, oculta ou de tarefa excluída continua posicionando; `createdAt` no futuro, em 1970, em 9999, em 0999 e em 0000 → 200, nunca 500; `limit` restantes → `nextCursor: null`, `limit + 1` → página seguinte com 1; `page=1` traz `nextCursor`, página além da última traz `null`; item desmarcado acima do cursor não volta (S202-R06, item 2); cursor de outra pessoa, de outro projeto ou de conta restrita nunca revela notificação alheia. O servidor não consulta a notificação do cursor, só usa os valores; então não há oráculo de existência pelo tempo de resposta (inspeção de `listPage`) |
| N-L `PUT` serializado | RT-N-L-01..05 | 20 `PUT` simultâneos sem erro e com trilha coerente; `PUT` concorrente à desativação e à anonimização sem deadlock (R6 refutada); usuários diferentes não se serializam (6–7 ms sozinho, 15–16 ms com 11 em paralelo); primeiro `PUT` sem mudança não grava nada. **RT-N-L-05: S202-R01** |
| N-E `enabledAt` | RT-N-E-01..05, 07 (06 por leitura) | religar 1 ms antes do corte e no corte notifica, 1 ms depois não; vale a última religação; antecipar o prazo para corte anterior à religação não notifica, adiar notifica; `enabledAt` não sai em DTO nem na exportação; a anonimização o apaga; o RF30 ignora `enabledAt`. RT-N-E-06: S202-R06, item 3 |
| N-A contas restritas | RT-N-A-01..05 | as 48 combinações de conta × membership × preferência × RF seguem a ordem publicada; conta reativada dentro da janela notifica na varredura seguinte, fora dela vira `OUTSIDE_WINDOW`; mudança de estado concorrente ao movimento termina sem erro e com no máximo uma notificação; métrica com os cinco motivos (bloco M); ator `DEACTIVATED` ou `DELETION_PENDING` recebe 403 ao mover e nada nasce (R17 refutada) |
| N-X exportação | RT-N-X-01..04 | `visible` igual à central em todas as combinações de membership, estado do projeto e leitura (R13 refutada); 5.000 notificações em 50 projetos com 24 SELECTs (R14 refutada, seção 14); `visible` descrito no contrato, na regra e no inventário; o manifesto só lista arquivos, como em todas as seções (R16 refutada); RT-N-X-04: o título copiado de projeto deixado continua com o titular, risco já declarado no inventário ("título pode conter dado pessoal") |
| N-J job | RT-N-J-01..04 | a recusa de produção vence o 2 em apply, e o 2 vale em dry-run (S202-R06, item 4); cinco chaves de `excluded` em dry-run e apply, iguais às do runbook e da regra; RT-N-J-03 por inspeção (O-R5); `OUTSIDE_WINDOW` conta toda tarefa aberta com corte antes da janela, notificada ou não, como a regra avisa (S202-R06, item 5, para os outros motivos) |
| N-P corte | RT-N-P-01..04 | `dueDateRange` a cada 15 min nos 10 dias em torno dos quatro dias saltados: nenhuma divergência do oráculo (R8 refutada); prazo no próprio dia saltado vence junto com o da véspera, no início do dia local seguinte; 9 fusos × todos os dias de 2010 a 2030: nenhuma divergência; custo do recurso: seção 14 |
| N-U frontend | RT-N-U-01..04, 06..09 (05 na Fase 7) | trocar de filtro durante "Carregar mais" não mistura listas nem reusa o cursor; 404 num cartão com outro ocupado recarrega e libera o ocupado; marcações fora de ordem deixam cartões e contador coerentes (R12 refutada); falha num cartão o libera e mantém o outro ocupado; o rótulo do ☰ acompanha a contagem sem região viva; nenhum código usa `pagination.page` ou `totalPages`; "Carregar mais" aparece com 21 e não com 20; 300 não lidas sem cartão repetido (S202-R09) |

## 6. Bloco G — regressão e reauditoria dos testes alterados

| Caso | Resultado |
|---|---|
| RT-G-01 | baterias da primeira campanha e das correções verdes, sem alteração de esperado nesta campanha (suíte completa duas vezes) |
| RT-G-02 | NT-Z-02/H4: "não recebe" apoiado no ADR-016 D3 revisto (`e3da602`), anterior ao código (`2111706`) |
| RT-G-03 | NT-J-09/H16: código 0 → 2 apoiado no runbook e na regra (`e3da602`) |
| RT-G-04 | NT-J-05 e NT-P-09: quinta chave apoiada na tabela de exclusões revista |
| RT-G-05 | contrato da exportação: `visible` e as ocultas apoiados no ADR-016, "Impactos" (`e3da602`) |
| RT-G-06 | cursor apoiado no ADR-016 D8 (`e3da602`); **marcação por cartão sem regra versionada antes do código: S202-R05** |
| RT-G-07 | tabelas de 16 → 32 combinações: a ordem nova é a publicada |
| RT-G-08 | nenhum documento repete "reativar não recupera" sem separar RF30 e RF59 (R15 refutada): ADR-016 D3 e consequências, regra executável e seção 17 do relatório anterior conferem |

## 7. Hipóteses R1–R18

| Hipótese | Veredito | Evidência |
|---|---|---|
| R1 M1/M2 com quatro motivos | **confirmada** | S202-R02 |
| R2 relatório anterior com vereditos antigos | **confirmada** | S202-R03 |
| R3 keyset sem índice adequado | **confirmada em parte**: *filesort* no "Todas", dentro do orçamento | O-R1; RT-N-C-10 |
| R4 base64url não canônico | **confirmada** | S202-R06, item 1 |
| R5 item desmarcado acima do cursor | **confirmada** | S202-R06, item 2 |
| R6 deadlock do `lockUser` | refutada | RT-N-L-02, MR06 morto |
| R7 relógios da API e do job | **confirmada**, com a premissa corrigida (só o relógio da API conta) | S202-R06, item 3 |
| R8 `dueDateRange` perto de dia saltado | refutada | RT-N-P-01, RT-N-P-02 |
| R9 nome da migration | **confirmada** (investigada, sem renomear) | S202-R07 |
| R10 precedência 1 × 2 | **confirmada** | S202-R06, item 4 |
| R11 ponto do ☰ em alto contraste | **confirmada em parte**: o ponto some; o contraste nos dois temas passa de 3:1 | S202-R08; RT-V-10 |
| R12 marcações fora de ordem | refutada | RT-N-U-03, RT-N-U-04, RT-V-09 na tela |
| R13 `visible` × central | refutada | RT-N-X-01, RT-V-05 no ambiente do João |
| R14 N+1 na exportação | refutada | 24 SELECTs para 5.000 notificações |
| R15 frase de recuperação repetida | refutada | RT-G-08 |
| R16 `visible` sem descrição | refutada | contrato, regra e inventário |
| R17 ator com exclusão pendente move tarefa | refutada | RT-N-A-05 |
| R18 tela com 1.000 notificações | **confirmada em parte**: lenta, não trava | S202-R09 |

## 8. Bateria de mutação

Runner `mutation_runner_s202_reteste.py` (scratchpad, não versionado). Cada mutante foi aplicado no
disco e rodou a suíte do S2-02 com `--bail=1`; depois, o arquivo foi restaurado byte a byte. A suíte
do backend tem 15 arquivos: política, script, `env`, e `s202-notifications`, `s202-privacy`,
`s202-bateria`, `s202-correcoes` e `s202-reteste` em unidade, integração e API, sem os casos de
desempenho. A do frontend tem os 6 arquivos do §0.3.

**Resultado: 89 entradas, 83 mortas, 5 equivalentes justificadas e 1 retirada.** Nenhum
sobrevivente pediu teste matador; o commit da Fase 6 completou registros e pôs um teto de consultas
na exportação.

| Conjunto | Mutantes | Mortos | Sobreviventes |
|---|---:|---:|---|
| Campanha (M01–M30) | 30 | 29 | M02 (equivalente, como na primeira campanha) |
| Implementação (S1–S19, com S9a e S9b) | 20 | 19 | — (S15 retirado) |
| Frontend (F1–F9) | 9 | 7 | F7 e F9 (equivalentes) |
| Correções (M31–M43, com M34b) | 14 | 14 | — |
| Reteste (MR01–MR14, com MR08a/b e MR11b) | 16 | 14 | MR11 e MR14 (equivalentes) |

**Trechos reescritos.** O código mudou nas correções, mas a semântica do mutante é a mesma:
- M10: `unreadCount` da página passa a ser calculado de `pageRows`;
- M16: o teto do `limit` sai antes do `.refine` da exclusividade;
- M26: a linha do `Retry-After` agora é uma só, sem o `|| 60`;
- S9b: a preferência do RF59 passa por `preferenceAllowsOverdue`;
- F4: a guarda é `busyIds.has`;
- F7: o `429` está na mesma linha do bloqueio;
- F8: a nova tentativa usa `failedCursor`.

**Retirado:** S15 ("exportação sem filtro de acesso") virou a regra na correção A05 (`d20d90a`). O
inverso, a exportação voltando a filtrar, é o M38, morto.

**Mutantes novos e quem os matou:**

| Mutante | Alteração | Morto por |
|---|---|---|
| M42 | cursor sem a checagem da data | C2-03 (data que não existe → 400) |
| M43 | cursor sem o teto do id | C2-03 (id acima do INT → 400) |
| MR01 | `nextCursor` do item `limit + 1` | C2-01 |
| MR02 | `take: limit` | C2-01 |
| MR03 | keyset com `lte` no id | C2-01 |
| MR04 | cursor ignorado no `ALL` | C2-02 |
| MR05 | `pagination.page` com cursor vira 1 | C2-01 |
| MR06 | `lockUser` depois da leitura | RT-V-02 |
| MR07 | `<` em vez de `<=` no `enabledAt` | RT-N-E-01 (religar no instante do corte) |
| MR08a | `INACTIVE_ACCOUNT` só para `DEACTIVATED` no gatilho | RT-N-A-01 |
| MR08b | idem no job | RT-V-04 (job) |
| MR09 | `visible` ignora `deletedAt` | RT-V-05 |
| MR10 | código 2 só no apply | RT-V-06 |
| MR11 | `firstInstantOnOrAfter` com faixa de ±12 h | **equivalente** (abaixo) |
| MR11b | faixa de ±6 h | RT-V-08 (Apia) |
| MR12 | rótulo do ☰ sem o singular | RT-V-10 |
| MR13 | cartão continua ocupado depois de falha | RT-N-U-02 |
| MR14 | `mergeById` removido | **equivalente** (abaixo) |

**Equivalências:**
- **M02** (o maior candidato do início do dia): dois candidatos válidos distintos nunca ocorrem,
  porque o início do dia é único. O RT-N-P-03 (9 fusos de 2010 a 2030) não acusou divergência.
- **MR11** (faixa de ±12 h):
  - o recurso só roda quando um dia local inteiro foi pulado. Isso exige um salto de 24 h no
    deslocamento; como o menor deslocamento é −12 h, o novo é de pelo menos +12 h, e o corte cai no
    máximo 12 h depois da meia-noite UTC do dia, dentro da faixa;
  - conferido no tzdata 2025b: 418 fusos de 1900 a 2037, 287 dias em torno dos 7 saltos de 12 h ou
    mais e 200.000 pares (fuso, dia) sorteados, sem divergência. O maior afastamento achado é de
    12 h exatas (Kwajalein), que cai na borda e continua certo;
  - o MR11b (±6 h) morre em Apia: os testes discriminam a faixa.
- **F9 e MR14** (deduplicação no "Carregar mais"):
  - com o keyset, a página seguinte só traz itens com `(createdAt, id)` estritamente abaixo do
    cursor, que é o último item exibido;
  - tudo o que já está na tela fica acima do cursor ou nele; `createdAt` e `id` não mudam; a recarga
    substitui a lista;
  - não há sequência que repita um item, então a deduplicação é defensiva. Na primeira campanha o F9
    morria porque a paginação era por página.
- **F7** (qualquer erro pausa o contador):
  - sem o `|| 60` (O-4), um erro que não é 429 não traz `retryAfterSeconds`
    (`http-error.js:49`) e não pausa nada. O backend só envia `Retry-After` no 429
    (`rate-limit.js:56`);
  - o mutante só difere se um intermediário devolver outro status com `Retry-After`; aí ele pausa a
    consulta, o que o RFC 9110 até recomenda;
  - equivalente no contrato atual. Nenhuma regra diz qual dos dois comportamentos vale, então não foi
    escrito teste para cristalizar um deles (O-R2).

## 9. Cobertura

Comandos do §0.3 do prompt, com `--coverage.reportOnFailure`. A suíte do backend rodou inteira
(unidade, integração e API).

| Arquivo | Linhas | Ramos | Meta | Linha a linha |
|---|---:|---:|---|---|
| `notification.policy.js` | 100% | 97,7% (43/44) | 100% de linhas; ramos justificados | `:153`, `responsibleUserId ? null : 'NO_RESPONSIBLE'`: o lado falso é inalcançável, porque os dois chamadores testam o responsável antes |
| `notification.repository.js` | 100% | 100% | ≥ 90% de ramos | — |
| `notification.service.js` | 100% | 100% | ≥ 90% | — |
| `notification.mapper.js` | 100% | 100% | ≥ 90% | — |
| `notification.validation.js` | 100% | 100% | ≥ 90% | — |
| `notification.controller.js`, `.routes.js` | 100% | sem ramos | ≥ 90% | — |
| `scripts/notify-overdue-tasks.js` | 80% | 90,6% (29/32) | ≥ 90% | `:33–:34` (padrões de `stdout` e `stderr`) e `:57–:65` (entrada de linha de comando) só rodam como processo, coberto pelo NT-J-10 em subprocesso, fora da instrumentação |
| seção de notificações de `settings.repository.js` | um único `select` sem ramos | — | ≥ 90% | o `visible` está no mapper (100%) |
| `frontend/src/features/notifications/**` | 100% | 95% a 100% | ≥ 85% de ramos | `useNotifications.js:37`, `previous?.notifications \|\| []` dentro do `mergeById`: o lado vazio é o caso do F9/MR14 equivalente |
| `AppShell.jsx`, trecho do ☰ (`:455–:490`) | 100% | 100% | ≥ 85% | — |

## 10. Bloco M — métrica oficial

| Caso | Resultado |
|---|---|
| RT-M-01 | recalculada do banco, sem usar o código de criação, num cenário com um evento de cada um dos **cinco** motivos (RT-N-A-04): RF30 com 6 movimentos, 1 elegível e 1 notificação com a chave do movimento elegível (100%), uma exclusão de cada motivo; RF59 com `eligible` 1, `created` 1 (100%) e `excluded` 1 em cada um dos cinco |
| RT-M-02 | os oito itens da §10.5 estão em `TASK_NOTIFICATIONS.md`. As cinco limitações batem com o código; a primeira vale também para `PREFERENCE_OFF` e `INACTIVE_*` (S202-R06, item 5). Período e filtros têm efeito descrito, mas nenhum instrumento os aplica ainda (S202-F14, aberto e coerente) |
| RT-M-03 | o resultado de 09/10 não é reproduzível com os motivos atuais nem está marcado como histórico: S202-R02 |

## 11. Bloco X — ASVS 5.0.0 L1+L2

Reveredito de todas as linhas da seção 9 do relatório anterior.

| Requisito | Antes | Agora | Evidência |
|---|---|---|---|
| V1.2.1, V3.2.2 | ATENDIDO | ATENDIDO | M27 morto de novo |
| V1.2.2 | ATENDIDO | ATENDIDO | M08 morto |
| V1.2.4 | ATENDIDO | ATENDIDO | nenhum SQL bruto em `modules/notifications`; o `lockUser` usa `$queryRaw` com parâmetro, em `src/database/locks.js` |
| V2.1.1, V2.1.3 | ATENDIDO | ATENDIDO, com o S202-R06 | limites documentados; seis comportamentos sem frase |
| V2.2.1, V2.2.2 | ATENDIDO | ATENDIDO | RT-N-C-01..05 e 07: formato, data, faixa e exclusividade, nunca 500; M16, M17, M42, M43 mortos |
| V2.3.2 | ATENDIDO | ATENDIDO | RT-N-E-01 (±1 ms em torno do corte), RT-V-08 |
| V2.3.3 | ATENDIDO | ATENDIDO | S5 morto |
| V2.3.4 | ATENDIDO | ATENDIDO, com o S202-R01 | RT-V-02, RT-N-L-01..03; S6, M33, MR06 mortos. A espera do bloqueio além do tempo da transação não é tratada |
| V2.4.1 | ATENDIDO | ATENDIDO | M24 morto; limitador da exportação visto na Fase 7 (O-R7) |
| V3.5.1, V3.5.3 | ATENDIDO | ATENDIDO | rotas sem mudança de middleware; testes de CSRF das baterias verdes (RT-G-01) |
| V4.1.1 | ATENDIDO | ATENDIDO | JSON com charset e `nosniff` na lista com cursor e no erro de cursor (Fase 2) |
| V8.1.1 | ATENDIDO | ATENDIDO | `AUTHORIZATION_MATRIX.md` com cursor e conta restrita |
| V8.2.1, V8.2.2, V8.3.1 | ATENDIDO | ATENDIDO | RT-N-C-09: o cursor só posiciona; M12 morto |
| V8.2.3, V15.3.1 | ATENDIDO | ATENDIDO | `enabledAt` fora de todo DTO e da exportação (RT-N-E-04); M14 morto |
| V8.4.1 | ATENDIDO | ATENDIDO | RT-V-05, RT-N-X-01; central da conta 9 na Fase 7 |
| V14.1.1, V14.1.2, V14.2.4 | **PARCIAL** | **ATENDIDO** | RT-V-04 (conta restrita não recebe), RT-V-05 e RT-N-X-01 (ocultas exportadas com `visible`), RT-N-E-05; inventário com `enabledAt`; RT-N-X-04 |
| V14.2.1 | ATENDIDO | ATENDIDO, com o S202-R04 | o cursor leva instante e id, sem dado pessoal |
| V14.3.1, V14.3.2, V14.3.3 | ATENDIDO | ATENDIDO | `no-store` nas respostas com cursor; nada em armazenamento do navegador |
| V15.1.3, V15.2.2 | ATENDIDO | ATENDIDO, com o S202-R04 e o S202-R09 | seção 14 |
| V15.3.3, V15.3.5, V15.3.6, V15.3.7 | ATENDIDO | ATENDIDO | cursor repetido → 400 (C2-03); M18 morto |
| V16.2.1, V16.2.2, V16.2.5, V16.4.1 | ATENDIDO | ATENDIDO | sem mudança nas correções |
| V16.3.2 | ATENDIDO | ATENDIDO | sem mudança |
| V16.3.3 | **PARCIAL** | **ATENDIDO** | RT-V-02 e RT-N-L-01: trilha reaplicável ao estado final sob concorrência; M13, M34, M34b mortos |
| V16.5.1, V16.5.2, V16.5.3 | ATENDIDO | **PARCIAL** | o erro da RT-N-L-05 é genérico, mas a falha não fica contida na requisição (S202-R01); código 2 testado (RT-V-06, M39, MR10) |
| V16.4.2, V16.4.3 | NÃO VERIFICÁVEL LOCALMENTE | NÃO VERIFICÁVEL LOCALMENTE | S2-10 |

## 12. Bloco A — anexo de arquitetura

| Regra | Antes | Agora | Evidência |
|---|---|---|---|
| §6.4 contrato | — | CONFORME | cursor, `page` nulo com cursor, `nextCursor` também com `page` e `visible` estão no `API_CONTRACTS.md` desde `e3da602`; a central é o único cliente e usa o cursor; nenhum consumidor usa `pagination.page` ou `totalPages` (RT-N-U-07) |
| §10.5 indicador | PARCIAL | CONFORME, com o S202-R02 | oito itens; M1/M2 desatualizados |
| §11.1 migrations e índices | CONFORME | CONFORME, com o S202-R07 | 63 migrations em banco vazio, com `enabledAt` e os índices conferidos; aplicada no desenvolvimento (`daebc97`); keyset no índice `(recipientUserId, readAt, createdAt)` no "Não lidas", *filesort* no "Todas" dentro do orçamento (O-R1) |
| §13.9 auditoria | CONFORME, com ressalva (A02) | CONFORME | trilha coerente sob concorrência; `enabledAt` muda junto com a preferência auditada |
| §13.10 erros e lotes | CONFORME | CONFORME, com o S202-R01 | o job informa criados, já notificados, excluídos e falhos; o código 2 só aparece sem projeto e não esconde falha (projeto existente que falha sai 1); a falha de espera do `PUT` contamina as requisições seguintes |
| §14 LGPD | PARCIAL | CONFORME | inventário com `enabledAt` e com as ocultas exportadas; retenção e anonimização cobrem os dois |
| §15 testes | NÃO CONFORME (DX) | NÃO CONFORME (DX) | testes por camada completos; E2E continua ausente (S104-F02), roteiro manual no lugar (⚑7) |
| §16 CI | AUSENTE | AUSENTE | commits não publicados |
| §17.4 DoD | PARCIAL | PARCIAL | bloco R |
| §20 ADR | CONFORME | CONFORME | a revisão de 10/10 tem data, contexto, decisões por achado e consequências revistas no corpo |
| §6.1, §6.2, §6.3, §8.1, §9, §12.1–12.4, §13.2, §13.5, §13.8, §18 | como na primeira campanha | como na primeira campanha | as correções não mexeram nessas regras; os commits do reteste citam RF30 e RF59 |

## 13. Bloco R — roadmap

| Item do DoD comum (§4) aplicado ao S2-02 | Antes | Agora |
|---|---|---|
| funciona de ponta a ponta | PARCIAL (S202-A01; RF59 à mão) | **PARCIAL**: o RF59 só roda à mão até o S2-09; A01 corrigido e verificado na tela |
| regras e autorização no backend | EVIDENCIADO | EVIDENCIADO |
| banco, API e interface no mesmo contrato | EVIDENCIADO | EVIDENCIADO (RT-N-U-07) |
| migrations novas, versionadas e testadas | EVIDENCIADO localmente | EVIDENCIADO localmente, com o S202-R07; a CI não rodou |
| estados de carregamento, vazio, erro e acesso negado | EVIDENCIADO | EVIDENCIADO; acrescenta o "Carregar mais" que falha e repete o cursor e o cartão que falha e sai do estado ocupado |
| testes de unidade, integração, frontend e E2E | PARCIAL (sem E2E) | **PARCIAL**: sem E2E (S104-F02, ⚑7) |
| CI verde | AUSENTE | **AUSENTE** |
| ASVS e LGPD avaliados | EVIDENCIADO, com PARCIAIS | EVIDENCIADO: V14.x e V16.3.3 passam a ATENDIDO; V16.5.x cai para PARCIAL (S202-R01) |
| documentação e matriz RF atualizadas | PARCIAL (A13) | **PARCIAL**: S202-R02, R04, R05, R06 |
| sem mocks, segredos ou regressões conhecidas | EVIDENCIADO | EVIDENCIADO: baterias anteriores verdes sem mudança de esperado; `security:secrets` verde |

**Dependências:** sem mudança desde a primeira campanha. A RF51 está satisfeita; o S1-04 depende do
S104-F02; a infraestrutura de notificação é o próprio ADR-016.

**Marco da Sprint 2 (§10):** para o S2-02 contar como homologado faltam a CI verde, o E2E (ou a
dispensa por decisão), o agendador instalado na OCI (S2-09), a aprovação visual do João e a decisão
sobre o S202-R01.

**Estado do cartão:** "implementado localmente; aberto em homologação". O checklist do roadmap do
repositório não foi alterado.

## 14. Desempenho (⚑5)

Medido no MySQL de teste, com os casos de desempenho da Fase 3 e da Fase 4, e no ambiente do João.

| Medição | Resultado | Orçamento |
|---|---|---|
| lista por cursor, 10.000 notificações de um usuário (metade lida), `limit=100` (RT-N-C-10) | "Não lidas": 50 páginas, pior 84–99 ms; "Todas": 100 páginas, pior 97–98 ms | ≤ 300 ms por página: **cumprido** |
| `EXPLAIN` do keyset | "Não lidas": `range` no índice `(recipientUserId, readAt, createdAt)`, *Backward index scan*, sem *filesort*. "Todas": `ref` só no prefixo `recipientUserId`, cerca de 5.000 linhas estimadas, *Using filesort* (O-R1) | — |
| exportação, 5.000 notificações em 50 projetos (RT-N-X-02) | 122–173 ms; 24 SELECTs (R14 refutada; teto de 500 no teste) | ≤ 5 s: **cumprido** |
| `PUT` de usuários diferentes (RT-N-L-03) | 6–7 ms sozinho; 15–16 ms com 11 em paralelo | — |
| 10.000 cortes (RT-N-P-04) | 3.320 ms num prazo vizinho de dia saltado (busca binária); 660 ms num prazo comum. Só um prazo por fuso, em toda a história, cai no recurso | — |
| job no ambiente do João, projeto 4 (seção 15) | 52–55 ms | ≤ 1 s: **cumprido** |
| "Carregar mais" até 1.120 cartões, painel Browser oculto | 55 cliques, 21,7 s; de cerca de 160 ms a 750 ms por clique; heap de 11 MB para 106 MB (S202-R09) | só registrado |
| jsdom, 300 cartões (RT-N-U-09) | 18,3 s | só registrado |

## 15. Fase 7 — roteiro manual

Executada em 10 e 11/10/2026 no ambiente do João:
- backend na 3001 e frontend na 5173, subidos por ele;
- a conta 1 (João, OWNER do `[S2-01] Escala`, id 4) rodou no painel Browser do aplicativo;
- a conta 9 (`@jvhernandes`, MEMBER) rodou no Chrome dele. O Claude in Chrome estava desconectado,
  então a conta 9 foi lida por trechos de console só de leitura, rodados e colados pelo João;
- as duas contas têm o mesmo nome de exibição; a evidência separa pelos ids;
- cargas rodadas por ele, com aval: `s202-seed-escala-dev.mjs` (120 tarefas e 120 notificações de
  mudança de status) e `s202-seed-mil-dev.mjs` (1.000 notificações de vencimento sem tarefa), num
  total de 1.120 não lidas.

| Caso | Status | Observado |
|---|---|---|
| RT-V-01 na tela | **APROVADO** | com 1.120 não lidas: marcados 3 cartões da página 1 e 1 da página 2, desmarcado 1 no caminho; 55 cliques em "Carregar mais" até o fim. As 1.120 da lista da API apareceram uma vez cada, nenhuma pulada nem repetida; os 3 lidos ficaram na tela; API e menu em "Notificações, 1117 não lidas", selo "99+" |
| RT-V-09 na tela | **APROVADO** | 3 cartões marcados no mesmo instante: 3 `PATCH` (`/386`, `/385`, `/383`), todos 200; os 3 lidos; API e menu em 1.111 |
| RT-V-10 na tela | **APROVADO** | 390 px: "Abrir navegação, 1120 notificações não lidas"; ponto `rgb(40, 89, 197)` sobre `rgb(248, 250, 253)` (6,04:1) no claro e `rgb(101, 168, 255)` sobre `rgb(16, 23, 33)` (7,37:1) no escuro; sem rolagem horizontal |
| RT-N-U-05 (alto contraste) | **APROVADO com o S202-R08** | como o caso previa, o ponto some com `forced-colors: active` e o rótulo mantém a contagem; contraste ≥ 3:1 nos dois temas (RT-V-10). O sumiço contraria o ADR-016 D10 para quem enxerga a tela |
| RT-N-U-09 (1.120 cartões) | **APROVADO com o S202-R09** | nenhum cartão repetido; a tela não trava, mas fica mais lenta a cada página |
| RT-V-03 no ambiente | **APROVADO** | TASK-2344 com prazo 08/10 e TASK-2343 com prazo 10/10, pela tela; preferência de prazo vencido desligada às 02:11:45 UTC e religada às 02:11:51 UTC. Um apply do João antes do corte das 03:00:00 UTC não notificou a TASK-2343 (às 03:00:28 a API ainda não tinha a notificação); o apply das 03:11:00 notificou (`dueDate` 2026-10-10). A TASK-2344 nunca notificou. Saída do dry-run abaixo |
| RT-V-04 no ambiente | **APROVADO** | TASK-2342 com a conta 9 como responsável e prazo 08/10; a conta 9 se desativou pelo aplicativo, com a senha digitada pelo João; a TASK-2342 foi movida pela conta 1 às 02:26:59 UTC. Dry-run: `INACTIVE_ACCOUNT` 1. Conta reativada pelo link do e-mail; apply: 1 criada (o vencimento da TASK-2342, id 1396). Central da conta 9: só a 1396, nenhuma `TASK_STATUS_CHANGED` (o RF30 não volta) |
| RT-V-05 no ambiente | **APROVADO** | exportação da conta 9 lida na página: 1396 `visivel` com a membership ativa; com a membership desativada pela conta 1, central vazia, contador 0 e 1396 `oculta`; reativada, a 1396 voltou à central, não lida, contador 1. A terceira exportação foi recusada pelo limitador (429, O-R7) |

**Saída do dry-run, rodado com autorização do João em 11/10/2026 03:11:59 UTC, a partir de `backend`:**

```text
npm run notifications:due:dry-run -- --project-id=4
{
  "dryRun": true,
  "timeZone": "America/Sao_Paulo",
  "lookbackDays": 7,
  "projects": 1,
  "scanned": 5,
  "eligible": 1,
  "created": 0,
  "alreadyNotified": 1,
  "excluded": {
    "OUTSIDE_WINDOW": 1,
    "NO_RESPONSIBLE": 0,
    "INACTIVE_ACCOUNT": 1,
    "INACTIVE_MEMBER": 0,
    "PREFERENCE_OFF": 3
  },
  "wouldCreate": 0,
  "updated": "NOT_APPLICABLE",
  "failed": 0,
  "durationMs": 52,
  "database": { "host": "localhost", "port": "3306", "database": "traceflow" }
}
```

O elegível é a TASK-2343, já notificada; `INACTIVE_ACCOUNT` é a TASK-2342 da conta 9 desativada;
`PREFERENCE_OFF` são a TASK-2344 e, além dela, a TASK-2102 e a TASK-2103 (S202-R06, item 5).

**Saída do apply, rodado com autorização do João em 11/10/2026 03:19:50 UTC, depois da reativação
da conta 9:**

```text
npm run notifications:due -- --project-id=4
{
  "dryRun": false,
  "timeZone": "America/Sao_Paulo",
  "lookbackDays": 7,
  "projects": 1,
  "scanned": 5,
  "eligible": 2,
  "created": 1,
  "alreadyNotified": 1,
  "excluded": {
    "OUTSIDE_WINDOW": 1,
    "NO_RESPONSIBLE": 0,
    "INACTIVE_ACCOUNT": 0,
    "INACTIVE_MEMBER": 0,
    "PREFERENCE_OFF": 3
  },
  "updated": "NOT_APPLICABLE",
  "failed": 0,
  "durationMs": 55,
  "database": { "host": "localhost", "port": "3306", "database": "traceflow" }
}
```

**Limpeza:** `s202-cleanup-escala-dev.mjs --apply`, rodado com autorização do João, excluiu as 120
tarefas da carga e 1.122 notificações (1.121 da conta 1 e 1 da conta 9). A conta 1 voltou às 6
notificações de antes. As preferências estão ligadas; o tema e a sidebar do painel não foram
alterados; a conta 9 está ativa e MEMBER do `[S2-01] Escala`. Fica o `enabledAt` da conta 1 (O-R8).

## 16. O que não pôde ser validado

- **Agendador real:** nenhum está instalado (S2-09).
- **Aprovação visual (VISUALLY APPROVED):** é decisão do João.
- **CI:** os commits não foram publicados.
- **E2E de navegador:** não existe (S104-F02); o roteiro manual o substitui (⚑7).
- **Pintura no "Carregar mais":** o painel Browser estava oculto, então a medição do S202-R09 não
  inclui layout e pintura.
- **Alto contraste real do Windows:** só a emulação do Chrome.
- **Saídas dos jobs rodados pelo próprio João (às 23:29, antes do corte e às 03:11):** não ficaram
  num lugar legível pela campanha. As saídas da seção 15 são do dry-run e do apply rodados a pedido dele.
- **Terceira exportação do RT-V-05:** recusada pelo limitador; a volta do `visible` foi conferida pela
  central e pelo RT-V-05 automatizado.
- **Tempo de resposta do cursor alheio (RT-N-C-09):** não medido; a ausência de oráculo foi mostrada
  por inspeção.
- **`lockProject` e `lockMilestone` sob espera longa:** fora do escopo; ficam no S202-F21.
- **Logs em sistema separado (V16.4.2, V16.4.3):** pertencem ao ambiente (S2-10).

## 17. Desvios do enunciado

- **Mensagem do commit da Fase 6.** O prompt previa "testes que matam os mutantes do reteste". Nenhum
  sobrevivente pediu teste matador, e o commit (`75df853`) completou registros (EXPLAIN nos dois
  filtros, contagem de SELECTs da exportação, cursor não canônico, datas extremas, resposta de outra
  conta no RT-N-L-05) e corrigiu dois títulos (`%i` e `%s` consumindo o instante). A mensagem diz
  isso.
- **RT-N-C-10 incompleto na Fase 3.** O `EXPLAIN` saiu só para "Não lidas"; o do "Todas" entrou na
  Fase 6.
- **Saídas do job.** Rodadas por mim, a pedido do João, porque o terminal dele não era legível pela
  campanha.
- **Claude in Chrome desconectado.** A conta 9 foi lida por trechos de console, a pedido do João.

## 18. Backlog

Itens novos em `TECHNICAL_BACKLOG.md`:

| ID | Item | Origem |
|---|---|---|
| S202-F21 | espera de bloqueio menor que o tempo da transação no `PUT` de preferências e nas outras transações com `FOR UPDATE` | S202-R01 |
| S202-F22 | M1/M2 com os cinco motivos e resultado republicado | S202-R02 |
| S202-F23 | documentação do reteste: baseline ASVS, marcação por cartão no ADR-016 D8, seis comportamentos sem frase | S202-R04, S202-R05, S202-R06 |
| S202-F24 | convenção de nome de migration | S202-R07 |
| S202-F25 | ponto do ☰ em alto contraste | S202-R08 |
| S202-F26 | "Carregar mais" sem refazer a lista inteira | S202-R09 |
| S202-F27 | índice para o filtro "Todas" | O-R1 |

O S202-R03 foi resolvido nesta campanha, com a nota no topo do relatório anterior.

## 19. Correções (11/10/2026)

O enunciado está em [S2_02_PROMPT_CORRECOES_RETESTE.md](S2_02_PROMPT_CORRECOES_RETESTE.md). O João
aprovou os nove ⚑ com as recomendações ("pode seguir"). Cada correção de código nasceu com o teste de
regressão vermelho pelo motivo do achado.

| Achado | Correção | Commit | Testes |
|---|---|---|---|
| — | ADR-016 revisto (D7, D8, D10, consequências); regra executável, contrato, runbooks e inventário de UI | `901a9cf` | — |
| S202-R01 | `FOR UPDATE NOWAIT`, cada tentativa numa transação curta, nova tentativa de 20 a 40 ms até 2 s; esgotado, 409 `NOTIFICATION_PREFERENCES_BUSY` sem gravar | `6c7365c` | RT-N-L-05 endurecido; CR-01..04 |
| S202-R02 | M1 e M2 com um evento de cada um dos cinco motivos; resultado republicado | `4219b19` | M1, M2 |
| S202-R06 (item 1) | cursor só na forma canônica | `50d4905` | CR-05, CR-06 |
| S202-R08 | `forced-color-adjust: none` com `CanvasText` no ponto do ☰ | `cadb897` | CR-07 |
| S202-R09 | cartão com `memo`; `toggleRead` e `open` estáveis | `0eba0e0` | CR-08 |
| S202-R04, S202-R05, S202-R06 (itens 2 a 6), S202-R07 | baseline ASVS, D8, frases e convenção de migrations | `901a9cf` e o commit deste registro | — |

**Testes vermelhos antes da correção:**
- RT-N-L-05: `{"status":500,"code":"INTERNAL_ERROR","elapsedMs":6715,"other":[401,"AUTHENTICATION_REQUIRED"],"next":[500,"INTERNAL_ERROR"],"second":500,"otherAfterRelease":500}`;
  CR-01 e CR-04 com 500, CR-03 com 200. Depois: `{"status":409,"code":"NOTIFICATION_PREFERENCES_BUSY","elapsedMs":1988,"other":[200,null],"next":[200,null],"second":200,"otherAfterRelease":200}`,
  em três rodadas;
- CR-05 e CR-06: 200 nas variantes não canônicas; depois, 400;
- CR-07: nenhum bloco `forced-colors` no `AppShell.css`;
- CR-08: razão `actualDuration / baseDuration` de 1,04 a 1,08 nas últimas páginas, em cinco rodadas;
  depois, 0,13 a 0,17.

**Medição do ⚑3.** Uma mudança de status com o projeto seguro por 7 s esperou 6,7 s e terminou com 200,
sem afetar outra conta, nas três rodadas: a `traceabilityTransaction` usa `timeout: 15000`. A cascata
só voltaria com o bloqueio seguro por mais de 15 s, porque o MySQL espera até 50 s. O S202-F21 foi
fechado para o `PUT`; o resto ficou no S202-F29.

**Desvios do enunciado:**
- **Nova tentativa fora da transação.** O prompt previa as tentativas dentro de uma mesma transação. Cada
  tentativa passou a ser uma transação curta: assim nenhuma conexão fica presa esperando, e a
  correção não depende de o MySQL manter a transação usável depois do erro 3572.
- **20 a 40 ms entre tentativas, não 100 ms.** Com 100 ms, 20 `PUT` simultâneos da mesma conta
  esgotavam os 2 s e alguns recebiam 409 (RT-N-L-01 e CR-02 vermelhos). Com 20 a 40 ms, com variação
  aleatória, os dois ficaram verdes em três rodadas.
- **`lockUser` removido.** Só o `PUT` o usava; ficou `lockUserNoWait`.
- **Critério do CR-08.** A razão entre o custo das últimas e das primeiras páginas, prevista no
  prompt, deu 1,97 a 2,81 antes da correção, abaixo do limite de 3, por causa do JIT. O critério
  passou a ser a razão `actualDuration / baseDuration` do `Profiler` (limite 0,5), que separa os dois
  estados com folga.

**Mutação dirigida:** 17 mutantes.
- 15 mortos:
  - MC01 a MC04, M33 e MR06 (bloqueio e 409);
  - MC05, M42 e M43 (cursor);
  - MC06 (alto contraste);
  - MC07 e MC08 (memorização);
  - M41, F4 e MR13 (marcação por cartão).
- 2 equivalentes já justificados na seção 8: F9 e MR14, a deduplicação defensiva no append.

**Verificação:**
- **Suíte completa do backend, duas vezes:** 1995 verdes, 5 ignorados e a falha `EPERM` de
  ambiente, iguais nas duas;
- **as 15 baterias do S2-02 no backend:** verdes, só com as mudanças de esperado previstas
  (RT-N-L-05, M1, M2);
- **frontend das notificações:** 7 arquivos, 99 verdes. O RT-N-U-09 caiu de 18,3 s para 8,1 s;
- **gates do backend e do frontend, e `build`:** verdes;
- **sem migration nesta rodada.**

**Ambiente do João:**
- servidores reiniciados por ele;
- carga de 1.000 notificações para a conta 1 e para a conta 9, rodada com o aval dele;
- **"Carregar mais" (S202-R09)** no painel Browser, com o mesmo método do reteste (painel oculto
  para a página, sem pintura): 49 cliques até 1.000 cartões em 3,55 s, de 47 ms a 154 ms por clique
  (mediana 62 ms), heap de 11 MB para 38 MB, nenhum cartão repetido. Antes: 55 cliques, 21,7 s, de
  cerca de 160 ms a 750 ms por clique, heap até 106 MB;
- **alto contraste (S202-R08)** no Chrome da conta 9, com `forced-colors: active` e 347 px:
  - o CSS novo carregado;
  - ponto `rgb(255, 255, 255)` sobre o cabeçalho `rgb(0, 0, 0)`; antes, preto sobre preto;
  - rótulo "Abrir navegação, 1000 notificações não lidas";
- **limpeza** (`s202-cleanup-escala-dev.mjs --apply`, com aval): 2.000 notificações excluídas. A
  conta 1 voltou às 6 notificações de antes, com as preferências ligadas; o tema do painel não foi
  alterado.

**Backlog:** S202-F21 a F26 fechados; S202-F27 aberto; S202-F28 (lista de membros com
`user.isActive` legado) e S202-F29 (espera de bloqueio nas outras transações) novos.
