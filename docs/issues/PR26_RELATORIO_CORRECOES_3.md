# Relatório — PR #26: correções da terceira revisão independente

- **Data:** 18 e 19/10/2026.
- **Enunciado:** `docs/issues/PR26_PROMPT_CORRECOES_REVISAO_3.md` (não versionado), com os 17 ⚑
  aprovados pelo João na recomendação ("Pode seguir com as recomendações dos 17 ⚑").
- **Revisão:** terceiro parecer independente publicado na PR #26, sobre o head `a2b689c`. Ele abriu
  TF-REV-013 a 016, manteve TF-REV-005 e o restante do TF-REV-002, apontou UX-R3-01 a 03 e a
  descrição da PR desatualizada, e condicionou os ADRs a uma decisão explícita sobre a guarda global
  e a dois ensaios.
- **Estado:**
  - executadas: Fases 0 a 12, a parte da 13 que não depende de aval (com o Q-08c, `aa18eae`), e
    esta 14;
  - com o aval do João, em 19/10/2026, rodaram as cadeias de migrations do zero (82) e composta com
    a OCI (83) e a validação de drift, cada uma num banco temporário apagado no fim (seção 7);
  - aguardam o João: as duas migrations no banco de desenvolvimento e a matriz visual no
    `traceflow_visual_r2` (portão G3), que depende do aval dele;
  - aguarda o Daniel: a aprovação arquitetural do ADR-024, que segue "aceita pelo autor";
  - aguarda o dono da branch OCI: o artefato do diagnóstico (TF-REV-005), a contagem inicial de
    migrations e a composição (seção 6);
  - nada foi enviado: sem push e sem comentário na PR.

## 1. Commits

Todos locais, na `joao-dev-v2`, sem push e sem coautoria (`git log --format=%(trailers)
a2b689c..HEAD` vazio).

| Fase | Commit | Conteúdo |
|---|---|---|
| 0 | `194c136` | regras revistas: ADR-015, 018, 022, 023 e 024; `docs/data`, contratos, runbooks e `.env.example` |
| 1 | `07035d9` | descarte da conexão com prazo de 2 s e prazo duro da transação guardada (TF-REV-013) |
| 2 | `18f3cc0` | API e worker saem no prazo com a desconexão pendente, até 5 s (TF-REV-013) |
| 3 | `5b4e428` | limite do pool só pela URL, teto por função conferido na partida e o `DATABASE_POOL_LIMIT` recusado (TF-REV-016) |
| 4 | `0671742` | nenhuma unidade nova depois do cancelamento, nos três jobs, com relatório parcial (TF-REV-015) |
| 5 | `d684557` | o `closed` só é absorvido pelo merge que o fechou, pela sequência dos eventos (TF-REV-014) |
| 6 | `092238b` | `ISSUE_LINKED`: o vínculo de issue aberta separado da abertura, no texto e na métrica (TF-REV-002) |
| 7 | `00ed1c3` | cobertura presumida e lacunas de aquisição na métrica (TF-REV-002) |
| 8 | `1a47699` | varredura das inconsistências, gatilho `SCHEDULED`, tentativa gravada antes e `reconciliation.state` (UX-R3-03) |
| 9 | `05af18c` | resumo sem o botão de reprocessar, sem zero falso e sem instrução de clique (UX-R3-03) |
| 10 | `1615626` | inconsistências abertas nas células do resumo (UX-R3-02) |
| 11 | `867cf8e` | o painel escurece só a área principal (UX-R3-01) |
| 12 | `e1f1035` | ensaio da leitura completa com 10 mil e 50 mil eventos, fora da suíte |
| 13 | `aa18eae` | Q-08c: a reabertura decide a absorção também pela sincronização real |
| 14 | `d36061e` | este relatório, o backlog e a matriz de RF |
| 13 | commit de registro | as cadeias de migrations e o drift, com o aval do João |

## 2. Achados

| Achado | Situação | Correção | Prova |
|---|---|---|---|
| TF-REV-013 descarte e desconexão sem prazo | **CORRIGIDO** | `07035d9` e `18f3cc0` (ADR-024 D4 e D5) | G-01 a G-06, E-01 a E-05 e o F2-03 reescrito para o prazo duro; MR-R3-01 a 05 |
| TF-REV-014 a janela de 5 s absorve um fechamento real | **CORRIGIDO** | `d684557` (ADR-023 D5) e `aa18eae` | Q-01 a Q-09, mais Q-07b, Q-08b, Q-08c e dois casos de política; MR-R3-10 e 10b |
| TF-REV-015 unidades novas depois do cancelamento | **CORRIGIDO**, nos três jobs | `0671742` (ADR-024 D7) | K-01 a K-06; MR-R3-08 e 09 |
| TF-REV-016 o override do pool contorna a validação | **CORRIGIDO** | `5b4e428` (ADR-024 D2) | P-01 a P-06 e S-01 a S-03; MR-R3-06 e 07 |
| TF-REV-005 pacote diagnóstico sem as dependências | **ABERTO**: o código mantém o fechamento em 9 arquivos; fecha com o artefato do dono da branch OCI | — | C-01 e C-02 (`r2-fechamento-prisma`) e a lista com SHA-256 (seção 6) |
| TF-REV-002 vincular e abrir são fatos diferentes | **CORRIGIDO** | `092238b` (ADR-023 D6 e D8) | L-01 a L-06; MR-R3-11 |
| TF-REV-002 a margem de 5 min é hipótese | **CORRIGIDO** | `00ed1c3` (ADR-023 D7 e D8) | C-01 a C-04 |
| UX-R3-03 atualização interna, sem o botão | **CORRIGIDO NO CÓDIGO**; G3 pendente | `1a47699` e `05af18c` (ADR-015 D5) | V-01 a V-09 e R-01 a R-04; MR-R3-12 e 13 |
| UX-R3-02 inconsistências fora do padrão do resumo | **CORRIGIDO NO CÓDIGO**; G3 pendente | `1615626` (ADR-022 D4) | R-05 a R-08 |
| UX-R3-01 o fundo escurece o menu | **CORRIGIDO NO CÓDIGO**; G3 pendente | `867cf8e` (ADR-022 D1) | M-01 a M-06 e o P-04; MR-R3-14 |
| Descrição da PR resume uma versão anterior | rascunho atualizado, que o João posta | `docs/issues/PR_DESCRICAO_JOAO_DEV_V2.md` (não versionado) | — |

## 3. Decisões arquiteturais do parecer

| Ponto | Resposta |
|---|---|
| A guarda global exige decisão explícita do responsável | decisão do autor (João) registrada no ADR-024 D1, com a alternativa de guardas por chamada; o estado diz "aceita pelo autor", e a aprovação arquitetural do Daniel continua pendente, sem que ele apareça como quem aprovou |
| Pool auxiliar condicionado a teste de saturação | S-01 a S-03: API, worker e comando como processos filhos contra o banco de teste, cada um no seu teto (5, 3 e 2), mais a recuperação com 1; o pico conferido no `processlist` ficou dentro do orçamento, e a recuperação funcionou com o pool da aplicação cheio |
| Leitura completa: o custo cresce com o repositório | ensaio local com 10 mil e 50 mil eventos (seção 7); o do Always Free fica para a homologação |
| ADR-023 e a interpretação do RF60 | "issue vinculada aberta" acontece aqui como reabertura (`ISSUE_REOPENED`) ou como o vínculo de uma issue já aberta (`ISSUE_LINKED`, com o instante do vínculo); a métrica conta o ciclo de vida no RF60 e a associação em `RF60_ASSOCIACAO` |
| Cobertura da fonte | declarada `PRESUMIDA`, com a margem e a regra, e conferida pelo retrato dos artefatos vinculados |
| ADR-015 e a atualização das inconsistências | varredura de todo projeto ativo a cada 60 min, gatilho `SCHEDULED`, tentativa gravada antes e estado do resumo; o endpoint manual fica para suporte, sem aparecer na interface |

## 4. Desvios do enunciado

- **Descarte esperado por até 2 s, não solto.** O ⚑1 previa marcar a indisponibilidade sem esperar
  o descarte. O teste do S202-F33 exige o log do descarte antes da rejeição da transação, então o
  descarte é esperado por no máximo 2 s (`RECOVERY_WAIT_MS`) e, sem confirmação nesse prazo, o motor
  é marcado indisponível antes da rejeição.
- **Prazo duro com o `maxWait`.** O prazo é `maxWait + timeout + 5 s`, e não `timeout + 5 s`: a
  espera pela conexão (2 s no padrão do Prisma, 5 s em alguns repositórios) vem antes do `timeout`.
  Com as opções padrão, são `timeout + 7 s`. O ADR-024 e o runbook dizem isso.
- **Id do GitHub que não é número.** O ⚑3 compara o id como número. Sem id numérico (em testes
  antigos e, em tese, no banco), a ordem no mesmo segundo fica desconhecida, e um `reopened` nesse
  segundo impede a absorção. O ADR-023 D5 ganhou essa linha.
- **Arquivos de teste.** Para reaproveitar os auxiliares que já sincronizam pelo dublê e montam o
  shell, os testes ficaram em arquivos existentes:
  - Q-07 a Q-09 (com Q-07b, Q-08b e Q-08c) em `r2-fonte-duravel.test.js`, não em
    `r3-absorcao-sequencia.test.js`;
  - M-01 a M-06 em `r2-painel-esquerda.test.jsx`, não em `r3-painel-menu-visivel.test.jsx`.
- **`coberturaDaFonte` com a regra.** O ⚑8 pede a margem e a regra no relatório; o campo ganhou
  `regra`, além de `tipo` e `margemMinutos`, e o `NOTIFICATION_METRICS.md` diz isso.
- **Varredura:**
  - a tentativa sem resultado há 15 minutos ou menos fica fora: pode estar em andamento, e a
    reconciliação dela esperaria a trava do projeto;
  - a falha sem nenhum sucesso registrado entra no grupo 1;
  - se a gravação da tentativa falha, a reconciliação segue, com log (`traceability_alerts_attempt_record_failed`);
  - um projeto excluído logicamente pode ganhar a linha da tentativa, sem efeito: a varredura e o
    resumo não o alcançam, e a purga apaga a linha.
- **Código morto removido no front.** Com o botão, saíram `reconcileTraceabilityAlerts` e
  `traceabilityApi.reconcileAlerts`, e a linha que os simulava em quatro testes (um da campanha de
  conformidade).
- **Testes antigos ajustados:**
  - `r2-abertura-rf60.test.js` deu lugar a `r3-associacao-issue.test.js` (L-01 a L-06 e o caso da
    mesma issue em duas tarefas);
  - `ISSUE_OPENED` virou `ISSUE_LINKED` em `r2-fonte-duravel`, `r2-agenda-jobs`, `s203-bateria`
    (integração, API e unidade), `github-event.policy` e `notification-view`;
  - os dublês de `registryStarts` ganharam `issueLinks`, e o M-05 de `pr26-metricas` exige
    `coberturaDaFonte`;
  - os casos C3 de `s201-correcoes`, o AT-S-03 da bateria de API do S2-01 e o C2-02 das correções
    passam a conferir `state`; o J-07 confere `SCHEDULED`;
  - no front, o R-04 do resumo saiu, o X-12, o F14 e a orientação por papel foram reescritos sem o
    botão, e o aviso do `alert-view` segue o estado;
  - o P-04 confere o deslocamento na camada.
- **Código do Daniel tocado:** o previsto nos ⚑2 e ⚑5 (`graceful-shutdown.js`, `server.js`,
  `github-worker.js`, `prismaClient.js` e `database-safety.js`). O resumo usa as classes dele sem
  mudar o CSS.

## 5. Testes nomeados

| Arquivo | Casos |
|---|---|
| `backend/test/unit/r3-prazo-recuperacao.test.js` | G-01 a G-06 |
| `backend/test/unit/r3-encerramento-com-prazo.test.js` | E-01 a E-05 |
| `backend/test/unit/r3-orcamento-por-funcao.test.js` | P-01 a P-06 e a partida |
| `backend/test/integration/r3-saturacao-tres-processos.test.js` | S-01 a S-03 |
| `backend/test/unit/r3-cancelamento-jobs.test.js` | K-01 a K-06 |
| `backend/test/unit/r3-absorcao-sequencia.policy.test.js` | Q-01 a Q-06, o id que não é número, o retrato sem duplicar o merge e os tipos fora do RF61 |
| `backend/test/integration/r2-fonte-duravel.test.js` | Q-07, Q-07b, Q-08, Q-08b, Q-08c e Q-09, num bloco próprio |
| `backend/test/integration/r3-associacao-issue.test.js` | L-01 a L-06 e a issue em duas tarefas |
| `backend/test/integration/r3-cobertura-presumida.test.js` | C-01 a C-04 |
| `backend/test/integration/r3-varredura-reconciliacao.test.js` | V-01 a V-09 |
| `backend/test/unit/s201-correcoes.service.test.js` | C3-09 e C3-10: a tentativa antes, numa escrita própria, e a falha dela |
| `frontend/test/features/traceability/r3-resumo-padrao.test.jsx` | R-01 (quatro papéis) a R-08 |
| `frontend/test/features/notifications/r2-painel-esquerda.test.jsx` | M-01 a M-06, num bloco próprio |
| `frontend/test/features/notification-view.test.js` | a frase da associação, com tarefa, título e tarefa removida |
| `backend/test/ensaios/r3-leitura-completa-volume.ensaio.js` | o ensaio, fora da suíte (`npm run test:ensaio`) |

Vermelho antes da correção:
- as sondas do parecer (A1 a A5) ficaram vermelhas no `a2b689c`, e os testes das Fases 1 a 4 as
  refazem;
- os das Fases 5, 7, 10 e 11 rodaram contra o código anterior e falharam;
- os das Fases 6, 8 e 9 dependem de tipos, funções e textos que só existem depois da correção;
- guardam comportamento que já existia, e passam nos dois: K-06, C-04, R-04, R-06, M-03 e M-05.

## 6. Composição com a branch OCI (só leitura)

Lido pela API do GitHub, sem `fetch`, no `9bc3dad`: `deploy/lib/diagnostic_contract.py` e
`deploy/scripts/validate-service-environment.mjs`.

**Fechamento do cliente (TF-REV-005).** Continua em 9 arquivos; nenhuma fase importou módulo novo a
partir do `prismaClient.js`. O `connection-budget.js` e o `disconnect-within.js` ficam fora dele. No
head deste relatório:

| Arquivo | SHA-256 |
|---|---|
| `backend/src/database/database-safety.js` | `e7d91add24624e8e5f7e6d55a5af33de65cabbad62eb316f62998d5737523483` |
| `backend/src/database/engine-health.js` | `5298c69fa633105b310d0bd6a7d8f0c5e5cfc9bb7190cd7115798259ac53b71b` |
| `backend/src/database/lock-wait.js` | `65828c34385226d1116c5bfd0b578cccddcc699292d047d2ba6bc0fed5176e47` |
| `backend/src/database/prismaClient.js` | `92dafc5cee474df4cb9a410e6f77cf9ae805805332b28058030d44db4a96b980` |
| `backend/src/database/recovery-prisma.js` | `551b88d3be3c7c8c5160756d1e46fa5e65437cf17ed08648db38fcd2e82ad156` |
| `backend/src/database/transaction-guard.js` | `856dffca8082e49fdd5f83e86c2b2cc10dcd9c5760b23e95c923804869e5048c` |
| `backend/src/shared/logger/index.js` | `5644f6c02b9f704e8a30f57c5663ef9122ef69ee2d24200c6ad78c17853a2995` |
| `backend/src/shared/logger/logger.js` | `46b0d3ee8aa88d7873614a0a4ac2b2e9a06b41b7b321778c598971f1438a2a62` |
| `backend/src/shared/logger/redaction.js` | `08ffd0e81a57e56ed2cc4444e8de4b96fff1063f14b85ecc92aaf9a0b16a0dfe` |

Pacotes alcançados: `@prisma/client` e `dotenv`, os dois já em `DEPENDENCIES`.

**Proposta para `SOURCES`.** O `prismaClient.js` e o `database-safety.js` já estão lá; faltam os
outros 7:

```python
SOURCES = (*LEGACY_SOURCES,
    'backend/scripts/lib/heatwave-role-attestation.js',
    'backend/scripts/lib/heatwave-admin-audit.js',
    'backend/scripts/lib/heatwave-audit-evidence.js',
    'backend/scripts/lib/heatwave-prisma-audit.js',
    'backend/scripts/lib/heatwave-manual-custody.js',
    'backend/scripts/lib/heatwave-administrative-runtime.js',
    'backend/src/database/engine-health.js',
    'backend/src/database/lock-wait.js',
    'backend/src/database/recovery-prisma.js',
    'backend/src/database/transaction-guard.js',
    'backend/src/shared/logger/index.js',
    'backend/src/shared/logger/logger.js',
    'backend/src/shared/logger/redaction.js',
)
```

O `schema.prisma`, que já está em `LEGACY_SOURCES`, mudou nesta rodada (o `ISSUE_LINKED` e o
`SCHEDULED`): o manifesto precisa ser regenerado também por ele. O achado continua **aberto** até o
dono da branch gerar o artefato: manifesto regenerado, dois builds idênticos, extração e imports
conferidos, execução em Linux ARM64 e o hash do pacote anterior preservado.

**Pool (TF-REV-016).** A validação da OCI aceita `connection_limit` de 1 a 5 na API e de 1 a 3 no
worker, os mesmos tetos do `CONNECTION_BUDGET`. Com o override removido, o que ela valida é o que o
processo usa. O comando manual não passa por ela; o teto de 2 é conferido aqui, na partida.

**Migrations.** Duas novas: `20261018100000_issue_linked_event` e
`20261018110000_traceability_alert_scheduled_trigger`. A cadeia vai de 80 para 82, e a composta com
a OCI, de 81 para 83; a proposta para o `INITIAL_MIGRATION_COUNT` da OCI é 83.

**Encerramento.** O ciclo de vida da OCI substitui o encerramento atual: a composição precisa levar o
`disconnectWithin` (5 s) para a API e para o worker, senão o TF-REV-013 volta.

## 7. Verificação (Fase 13)

No Windows, em 19/10/2026, no head `aa18eae` (a primeira passada do backend rodou no `e1f1035`,
antes do Q-08c).

**Portões.**

| Portão | Resultado |
|---|---|
| backend: `npm run lint`, `npm run format:check`, `npm run architecture:check` e `npm run security:secrets` | verdes; 706 arquivos no scan de segredos |
| backend: `npx prisma validate` | válido |
| backend: `npm run db:test:status` | "82 migrations found in prisma/migrations"; "Database schema is up to date!" |
| backend: `npm run db:lr5:audit -- --test` | `SCHEMA_CONSISTENT` |
| política da CI: `npx prettier --check .github/workflows`, `node --test scripts/validate-ci.test.mjs` (59) e `node --test scripts/check-ui-inventory.test.mjs` (3) | verdes |
| frontend: `npm run lint`, `npm run format:check` e `npm run build` | verdes; o build repete o aviso do bloco acima de 500 kB, que já existia |

**Suítes.**
- **Backend, primeira passada** (`npm test`, 749 s): 3.042 testes verdes e 5 pulados, fixos no
  código. As duas falhas são as de ambiente Windows, que a CI em Linux não tem: `storage.test.js`
  (symlink, `EPERM`) e `e11-mapping-writer.test.js` (permissões POSIX `0o700`/`0o600`).
- **Backend, segunda passada, com cobertura** (`npx vitest run --coverage --coverage.reportOnFailure`,
  no `aa18eae`): 3.043 verdes, 5 pulados e as mesmas duas falhas de ambiente. Cobertura 93,55 /
  88,62 / 96,06 / 95,56 (instruções, ramos, funções e linhas), com os limiares em 85 / 70 / 85 / 87.
- **Frontend, primeira passada** (`npx vitest run`): 1.715 verdes. Das 14 falhas, 13 são timeouts
  de 5 s sob carga, em `PersonalizedDashboard`, `KanbanPage`, `RequirementsPage` e `TestCases`, que
  passam sozinhos (140 de 140), e uma é o teste de imports dinâmicos, que falha no Windows pelo separador de
  caminho (`barrel\index.js` contra `barrel/index.js`). Nenhum dos cinco arquivos foi tocado nesta
  rodada.
- **Frontend, segunda passada, com cobertura** (`--coverage.reportOnFailure`): 1.709 verdes e
  cobertura 86,46 / 81,26 / 82,21 / 88,78, com os limiares em 50 / 45 / 40 / 53. As 20 falhas estão
  em 6 arquivos (os cinco acima e `TraceabilityWorkspace`); rodados sozinhos, dão 173 de 174, e a
  única falha é a do separador de caminho.

**Mutantes.** Um por vez, com o teste da área, e o arquivo restaurado pelo `git` depois de cada um.
Todos morrem:

| Mutante | Mudança | Morre em |
|---|---|---|
| MR-R3-01 | descarte sem prazo | G-01 |
| MR-R3-02 | descarte sem marcar indisponibilidade | G-01 e G-02 |
| MR-R3-03 | sem prazo duro | G-04 |
| MR-R3-04 | desconexão sem prazo na API | E-02 |
| MR-R3-05 | desconexão sem prazo no worker | E-01 |
| MR-R3-06 | `DATABASE_POOL_LIMIT` volta a valer | P-01 |
| MR-R3-07 | teto por função ignorado | P-03 |
| MR-R3-08 | sinal só entre projetos | K-01 |
| MR-R3-09 | sinal só entre lotes do despacho | K-02 |
| MR-R3-10 | absorção só pela janela: todo `closed` a até 5 s do merge | Q-01 |
| MR-R3-10b | sem a conferência da reabertura entre o fechamento e o merge | Q-04 (política) e Q-08c (sincronização) |
| MR-R3-11 | associação com a data de criação da issue | L-01 |
| MR-R3-12 | seleção só por falha depois do sucesso | V-01 e V-02 |
| MR-R3-13 | zero no lugar de "—" | R-02 |
| MR-R3-14 | fundo sobre o menu | M-01 |

A primeira versão do MR-R3-10 desligava só a conferência da reabertura e sobreviveu ao Q-01: a
regra de um fechamento por merge, sozinha, já salva a sequência do parecer. Ela virou o MR-R3-10b,
e o MR-R3-10 passou a ser a janela pura, como o enunciado descreve. A conferência da reabertura só
era provada na política (Q-04); o Q-08c (`aa18eae`) a prova pela sincronização.

**Saturação (S-01 a S-03).** API, worker e comando como processos filhos contra o banco de teste,
cada um no seu teto. O teste exige, no `processlist`, no máximo 5, 3 e 2 conexões, 1 de
recuperação e 13 no total, e a recuperação em menos de 1,5 s com o pool da aplicação cheio. O
comando com `connection_limit=3` sai com 1; com 2, roda.

**Ensaio da leitura completa** (`npm run test:ensaio`, fora da suíte, banco de teste). Repositório
sintético pelo dublê do GitHub, com um quarto dos eventos em cada tipo e 10% dos artefatos
vinculados; páginas de 100:

| Eventos | Páginas | Primeira leitura | Sob a trava | Releitura | Sob a trava | Linhas gravadas |
|---|---|---|---|---|---|---|
| 10.000 | 100 | 1,0 s | 1,0 s | 0,19 s | 0,19 s | 5.000 + 5.000 de histórico, 750 eventos e 750 alvos |
| 50.000 | 500 | 5,8 s | 5,8 s | 1,0 s | 1,0 s | 25.000 + 25.000 de histórico, 3.750 eventos e 3.750 alvos |

O custo cresce quase linear, quase todo na transação de `record`, sob a trava do projeto, e fica
muito abaixo do limite de 120 s dela. A releitura não grava nada. O ensaio local não substitui o do
Always Free.

**Migrations.**
- As 80 anteriores não mudaram: `git diff --name-only a2b689c HEAD -- backend/prisma/migrations`
  lista só as 2 novas.
- O L-04 aplica a `20261018100000_issue_linked_event` sobre linhas no formato antigo e confere a
  conversão e os dois enums.
- **Cadeias do zero, com o aval do João (19/10/2026).** O roteiro é o da rodada anterior. Ele
  confere que a conexão de origem é o `traceflow_test` e cria o banco temporário. Lá, aplica as
  migrations com `migrate deploy`, confere a `_prisma_migrations` contra as pastas, as tabelas novas
  e os enums, e apaga o banco no fim. A composta junta as nossas pastas à migration exclusiva da
  OCI, lida com `git show origin/daniel-dev`. Nesta rodada, ele confere também o enum da notificação
  e o do gatilho:

  ```json
  {"mode":"zero","database":"traceflow_test_r3_empty_validation","migrations":82,"expected":82,"missing":[],"last":"20261018110000_traceability_alert_scheduled_trigger","ociOnlyApplied":false,"tables":["githubeventcoverage","issuelifecycleevent","scheduledjoblease","taskartifactlinkperiod"],"artifactEventTypes":"enum('ISSUE_CLOSED','ISSUE_REOPENED','PULL_REQUEST_MERGED','PULL_REQUEST_CLOSED','ISSUE_LINKED')","notificationGithubEvent":"enum('ISSUE_CLOSED','ISSUE_REOPENED','PULL_REQUEST_MERGED','PULL_REQUEST_CLOSED','ISSUE_LINKED')","reconciliationTrigger":"enum('GITHUB_SYNC','GITHUB_INTEGRATION','MANUAL','SCRIPT','SCHEDULED')","seconds":11}
  {"mode":"composta","database":"traceflow_test_r3_composed_validation","migrations":83,"expected":83,"missing":[],"last":"20261018110000_traceability_alert_scheduled_trigger","ociOnlyApplied":true,"tables":["evidenceupload","githubeventcoverage","issuelifecycleevent","scheduledjoblease","taskartifactlinkperiod"],"artifactEventTypes":"enum('ISSUE_CLOSED','ISSUE_REOPENED','PULL_REQUEST_MERGED','PULL_REQUEST_CLOSED','ISSUE_LINKED')","notificationGithubEvent":"enum('ISSUE_CLOSED','ISSUE_REOPENED','PULL_REQUEST_MERGED','PULL_REQUEST_CLOSED','ISSUE_LINKED')","reconciliationTrigger":"enum('GITHUB_SYNC','GITHUB_INTEGRATION','MANUAL','SCRIPT','SCHEDULED')","seconds":11}
  ```

- **Drift do schema** (`npm run db:test:validate-schema-drift`, com o mesmo aval): a cadeia inteira,
  aplicada num banco descartável, não tem drift contra o `schema.prisma`, e o controle negativo (uma
  FK trocada de propósito) é detectado com a saída 2. Levou 14 s:

  ```json
  {"database":"traceflow_test_schema_drift_validation","fullSqlChain":"PASS","schemaDrift":"NONE","negativeControlExit":2}
  ```

- Depois, só o `traceflow_test` restava entre os bancos `traceflow_test*`, com as 82 migrations
  aplicadas (`db:test:status`).

**Auditoria de trailers.** `git log --format=%(trailers) a2b689c..HEAD` não traz nenhum trailer, e
nenhuma mensagem tem coautoria. Autor e committer de todos os commits: JoaoVitorSHernandes.

## 8. Matriz visual (portão G3)

Não capturada nesta rodada: depende do aval do João para recriar o `traceflow_visual_r2` e usar as
portas 3001 e 5173. A matriz é a da seção 7 do enunciado:

| Superfície | Mínimo | Escala |
|---|---|---|
| Resumo da Rastreabilidade, `CURRENT` | 0 de cada tipo | 20, 20 e 20 |
| Resumo, `PENDING_FIRST` | projeto novo | — |
| Resumo, `STALE` | — | falha depois do sucesso |
| Painel com o menu expandido e recolhido | 0 notificações | 200 notificações |

Em 1366×900 e 390×844, nos temas claro e escuro, com o teclado (`Tab` até os números do resumo;
`Escape` e devolução do foco no painel; `Shift+Tab` no título do painel) e a regressão rápida das
superfícies da rodada anterior que tocam o painel e o resumo. O inventário só passa a VISUALLY
APPROVED com a aprovação do João.

## 9. Pendências

- **Do João:** as duas migrations no banco de desenvolvimento e o aval para o G3; o push, quando
  pedir; postar a descrição e a resposta.
- **Do Daniel:** a aprovação arquitetural do ADR-024.
- **Do dono da branch OCI:** o artefato do diagnóstico com o `SOURCES` acima, o
  `INITIAL_MIGRATION_COUNT` 83 e a composição do encerramento (PR26-F03).
- **Homologação:** o ensaio da leitura completa no Always Free e o `max_connections` do shape
  (PR26-F04).
