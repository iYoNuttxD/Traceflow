# Relatório final — bateria de testes RF10 (cronograma) e RF35 (evolução por sprint)

> Execução, em 25/08/2026, do enunciado `docs/issues/RF10_RF35_PROMPT_TESTES.md`, sobre a branch
> `joao-dev-v2` com o design de 24/08 aplicado. Mapa de auditoria em
> `docs/issues/RF10_RF35_MAPA_TESTES.md`. As Fases 1 a 8 foram executadas na ordem; a árvore de
> trabalho carrega o resultado (a bateria não commitou — plano de commits na seção 7).

## 1. Resumo

**RF10** — o comportamento entregue corresponde ao especificado (cartão S1-04, ADR-009/010/011 na
precedência vigente, contratos ativos) em **tudo o que foi exercitado**: janela semiaberta sem
sobreposição com cancelada liberando datas, ciclo com estados terminais imutáveis, marco
agrupador com conclusão automática/manual/reabertura, exclusões recusadas nos dois sentidos,
devolução ao backlog preservando a participação congelada e agregado do cronograma com `to`
inclusivo. Nenhum defeito de comportamento foi encontrado.

**RF35** — idem: baseline `STARTED_AT`/`OPEN`, escopo planejado × atual com saldo líquido,
percentual nulo distinto de zero, corte congelado no encerramento, carry-over preservando o
`exitStatus`, burndown com janela semiaberta, linha ideal indiferente ao real e `remaining` nulo
após o corte. Determinismo confirmado com `TZ=UTC` e `TZ=America/Sao_Paulo`.

**Segurança (meta ASVS 5.0.0 L2)** — as 14 declarações da `ASVS_BASELINE.md` para o S1-04 foram
verificadas e resistem à neutralização (Fase 7); 13 controles aplicáveis foram acrescentados à
matriz com evidência de teste. A postura do módulo é consistente com L1/L2 no escopo verificável
em repositório; as lacunas L2 conhecidas (MFA, store distribuído, operação) permanecem as já
registradas na baseline, fora do escopo deste módulo.

O que a bateria de fato encontrou foram **quatro lacunas de cobertura** (regras corretas que
podiam regredir sem nenhum teste ficar vermelho), **uma deriva documental** e **um título de
teste enganoso** — seção 3. Três das lacunas foram fechadas com testes-assassinos na própria
bateria; a quarta virou item de backlog com análise.

## 2. Números

| Medida | Antes | Depois |
|---|---|---|
| Backend — testes | 483 (36 arquivos) | **501 (38 arquivos)** |
| Frontend — testes | 214 (29 arquivos) | **230 (31 arquivos)** |
| Backend — cobertura (stmts/branch/func/lines) | — | **88.22 / 76.79 / 90.24 / 90.47** (limiares 85/70/85/87) |
| Frontend — cobertura | — | **63.52 / 60.96 / 56.36 / 65.00** (limiares 50/45/40/53) |

Nenhum limiar foi alterado. Suítes completas executadas **duas vezes** com resultado idêntico
(backend `501 passed` × 2; frontend `230 passed` × 2). Calculadoras executadas com `TZ=UTC` e
`TZ=America/Sao_Paulo`: 66/66 nas duas. `lint`, `format:check`, `build` (frontend),
`architecture:check` (nenhuma violação) e `security:secrets` (300 arquivos) verdes.

Arquivos novos de teste:

- `backend/test/unit/rf10-rf35-bateria.test.js` — 8 casos (teto de 180 dias, equivalência de
  offset nos dois calculadores, log injection no logger, guardas normativas M05/M10);
- `backend/test/api/rf10-rf35-bateria.test.js` — 10 casos (forma A1, I03 no HTTP, 405 com id
  inexistente, marco editável com sprint terminal, cutoff estável, headers `no-store`/charset,
  assassinos de M13/M17/M33);
- `frontend/test/components/SprintActionsMenu.test.jsx` — 6 casos (ARIA, clique fora, Escape com
  devolução de foco, rolagem, seleção, desabilitado);
- `frontend/test/components/SprintBurndownChart.test.jsx` — 4 casos (acessibilidade do gráfico);
- adições em `MilestonesScreen.test.jsx` (5 casos: erro recuperável, "Nenhuma sprint associada",
  barra cheia no manual, reabrir sem confirmação, botão primário no diálogo) e
  `ScheduleScreen.test.jsx` (1 caso: erro recuperável).

## 3. Achados

Nenhum achado HIGH. Convenção do enunciado: HIGH exigiria dado incorreto persistido, invariante
violável ou controle ASVS ausente/contornável — as lacunas abaixo são de **prova**, não de
comportamento: em todas, o produto faz a coisa certa hoje; o que faltava era o teste que impediria
a regressão silenciosa.

### [MEDIUM] Janela `to` do cronograma podia regredir para exclusivo sem nenhum teste vermelho

**Onde:** emenda `sprint.schema.js` (`nextUtcDay`) → `services/schedule.service.js`
**Norma:** I08 (ADR-010 D15)
**Esperado:** filtrar "até 10/08" inclui o dia 10 inteiro.
**Observado:** o comportamento está correto, mas a mutação M13 (remover o `+86400000`) sobreviveu
a **toda** a suíte — unit, contratos e integração. Nenhum teste usava um evento que existisse
apenas no dia `to`.
**Reprodução:** `mutate.py M13 apply && npm test` antes da bateria.
**Consequência da regressão não detectada:** eventos do último dia do filtro sumiriam do
cronograma sem aviso.
**Desfecho:** teste-assassino em `rf10-rf35-bateria.test.js` (sprint que começa e marco que vence
exatamente no dia `to`); mutação agora mata 1 teste.

### [MEDIUM] Congelamento do encerramento podia passar a reescrever a participação removida

**Onde:** `sprint.repository.js` (`freezeParticipations`, filtro `removedAt: null`)
**Norma:** I19 (ADR-011 D07) e I04 (ADR-010 D04)
**Esperado:** quem saiu antes do encerramento mantém o registro da saída (`exitStatus` da saída,
`closedAt` nulo); o congelamento toca só as vivas.
**Observado:** correto em produção, mas a mutação M17 (freeze sem o filtro) sobreviveu a unit,
contratos e integração — o unit mocka o repository, e nenhum teste de API afirmava a participação
removida **depois** do encerramento.
**Consequência da regressão não detectada:** o encerramento sobrescreveria `exitStatus`/`closedAt`
de registros históricos com o status atual da tarefa — exatamente a reescrita que o RF35 existe
para impedir.
**Desfecho:** teste-assassino em `rf10-rf35-bateria.test.js`; mutação agora mata 1 teste.

### [MEDIUM] Auditoria da transição de status fora do contrato de teste (ASVS 16.3.3)

**Onde:** `sprint-status.service.js` (`auditEvent` da transição)
**Norma:** ASVS 5.0.0 16.3.3; CONTEXTO §13.9
**Esperado:** toda mutação do módulo gera `AuditEvent` — e o teste "gera exatamente um AuditEvent
por mutação" deveria cobrir a transição.
**Observado:** o evento é gravado, mas a mutação M33 (auditEvent nulo na transição) sobreviveu aos
72 testes de contrato: o caso de auditoria não incluía `PATCH /status`.
**Consequência da regressão não detectada:** iniciar/concluir/cancelar sprint sem trilha de
auditoria.
**Desfecho:** teste-assassino em `rf10-rf35-bateria.test.js` (`SPRINT_STATUS_CHANGED`, ator da
sessão); mutação agora mata 1 teste.

### [MEDIUM] Lock de projeto do caminho de escopo sem cobertura própria — ABERTO

**Onde:** `sprint.repository.js` (`mutateScopeWithinSprintLock`, `lockProject`)
**Norma:** I09 (ADR-010 D17)
**Esperado:** remover o primeiro lock da ordem global deveria derrubar os testes de concorrência.
**Observado:** a mutação M15 sobreviveu a toda a suíte. Análise: os locks finos que entraram com o
H3 da PR#12 (`Sprint FOR UPDATE` + `Task FOR UPDATE`) serializam todos os cenários hoje
exercitados — dois replaces da mesma sprint disputam a linha da sprint; replaces de sprints
diferentes sobre a mesma tarefa disputam a linha da tarefa; replace × transição disputam a linha
da sprint. O lock do projeto virou defesa em profundidade sem nenhum teste que dependa dele.
**Não corrigido nesta bateria** (não identifiquei, em tempo de bateria, um interleaving concreto
que só ele previna). Proposta registrada em `TECHNICAL_BACKLOG.md` **S104-F07**: ou constrói-se o
teste de interleaving cross-recurso, ou documenta-se no ADR-010 D17 que a camada é
deliberadamente redundante.

### [LOW] Título de teste afirmava o contrário do que o teste prova — corrigido

**Onde:** `schedule-contracts.test.js:602`
**Observado:** "permite esvaziar e excluir uma sprint concluida" — o corpo assert `405` na
exclusão e `409 SPRINT_SCOPE_LOCKED` no esvaziamento. O título era o cenário da regressão antiga;
as asserções inverteram com o ADR-010 D04/D06 e o nome ficou para trás, induzindo a erro quem lê o
relatório da suíte.
**Desfecho:** renomeado para "recusa esvaziar e excluir a sprint concluida, preservando a
participacao", com comentário explicando a inversão.

### [LOW–doc] Deriva na matriz de rastreabilidade e no contrato — corrigidas

`RF_TECHNICAL_MATRIX.md` afirmava persistência em `Milestone (sprintId)` (invertida pelo ADR-011
D01; a coluna nem existe mais) e citava `ScheduleAgenda`, componente que não existe (substituído
pelo `ScheduleCalendar`); RF35 não citava `SprintBurndownChart`. `API_CONTRACTS.md` não
documentava o teto de 180 dias da série do burndown (ASVS 2.1.3). Tudo corrigido na Fase 8.

### Observação (não é defeito): guardas normativas inalcançáveis no fluxo atual

`ensureSingleActiveSprint` (exclusão do próprio id) e `allMilestoneSprintsConcluded`
(`length > 0`) têm guardas que o fluxo atual do service nunca alcança — M05 e M10 sobreviveram
por equivalência, não por lacuna. Como as duas funções são a codificação do ADR-011 D05/D06 e o
service pode ser reordenado no futuro, ganharam teste direto de contrato na bateria.

## 4. Bateria de mutação (Fase 7)

Cada mutação foi aplicada isolada sobre o `HEAD`, a suíte-alvo reexecutada e o arquivo restaurado
por backup (nunca via git — a árvore tem trabalho não commitado). Suítes-alvo: as citadas na
coluna; "unit" = os 4–5 arquivos de sprint + bateria.

| # | Mutação | Item | Vermelhos |
|---|---|---|---|
| M01 | overlap volta a contar `CANCELADA` | I03 | 1 |
| M02 | emenda vira conflito (`<` → `<=`) | I01 | 1 |
| M03 | aceita `startDate == endDate` | I02 | 1 |
| M04 | overlap deixa de ignorar o próprio id | I01 | 4 |
| M05 | unicidade deixa de excluir o próprio id | I18 | 0 → **1** com o teste da bateria |
| M06 | transição aceita qualquer destino | I20 | 7 |
| M07 | escopo terminal deixa de bloquear | I04 | 4 |
| M08 | edição terminal deixa de bloquear | I04 | 2 |
| M09 | conclusão automática conta `CANCELADA` | I15 | 1 |
| M10 | marco vazio "conclui" (`every([])`) | I15 | 0 → **1** com o teste da bateria |
| M11 | exclusão de marco com sprints deixa de recusar | I11 | 2 |
| M12 | `parseInstant` volta a truncar para meia-noite | I05 | 4 |
| M13 | `to` vira exclusivo (`nextUtcDay` sem +1) | I08 | **0 → 1** (lacuna real; assassino escrito) |
| M14 | 405 passa a consultar a sprint antes | I06 | 2 |
| M15 | escopo perde o lock do projeto | I09 | **0 — SOBREVIVEU** (achado MEDIUM; S104-F07) |
| M16 | conclusão deixa de devolver ao backlog | I19 | 9 |
| M17 | freeze sobrescreve a participação removida | I19/I04 | **0 → 1** (lacuna real; assassino escrito) |
| M18 | `effectiveStatus` ignora o congelado | I24 | 2 |
| M19 | baseline cai para `startDate` | I25 | 2 |
| M20 | planejado perde as removidas | I27 | 1 |
| M21 | saldo líquido conta quem já saiu | I28 | 1 |
| M22 | percentual `0` no denominador zero | I29 | 1 |
| M23 | corte congelado envelhece | I30 | 2 |
| M24 | burndown inventa `0` após o corte | I33 | 2 |
| M25 | série inclui o dia do fim | I32 | 8 |
| M26 | calendário volta a mostrar cancelada | 3.3 | 1 |
| M27 | menu deixa de fechar na rolagem | 3.3 | 1 (teste da bateria) |
| M28 | Excluir marco com sprints habilitado | I11 | 1 |
| M29 | nota do marco sempre "automaticamente" | I16 | 2 |
| M30 | mutação sem CSRF passa | ASVS 3.5.1 | 1 |
| M31 | `/sprints/:id` sem resolução de projeto | ASVS 8.2.2 | 5 |
| M32 | mutação exige só VIEWER | ASVS 8.2.1 | 1 |
| M33 | transição sem AuditEvent | ASVS 16.3.3 | **0 → 1** (lacuna real; assassino escrito) |
| M34 | `/api` sem `no-store` | ASVS 14.3.2 | 2 (testes da bateria) |
| M35 | stack no body do 500 | ASVS 16.5.1 | 1 |
| M36 | validação falha e segue (fail-open) | ASVS 16.5.3 | 4 |
| M37 | logger deixa de emitir JSON-line | ASVS 16.4.1 | 2 (testes da bateria) |

**36 de 37 mutações mortas. Uma sobrevivente: M15**, registrada como achado MEDIUM com item de
backlog S104-F07. Cinco mutações (M05, M10, M13, M17, M33) só morrem por testes escritos nesta
bateria — foram re-executadas após os assassinos e cada uma derruba exatamente o teste esperado.

## 5. Deriva documental (Fase 8)

Corrigido: linhas RF10/RF35 da `RF_TECHNICAL_MATRIX.md`; teto de 180 dias no `API_CONTRACTS.md`;
`ASVS_BASELINE.md` com a seção "Controles acrescentados pela bateria" (13 controles + NÃO
APLICÁVEIS justificados) e evidência de 4.1.1 atualizada. Conferido sem correção necessária:
nota do refinamento de 24/08 no ADR-010 D03 (presente); `AUTHORIZATION_MATRIX.md` (papéis e
resolução de projeto batem com o código). Acrescentado: `TECHNICAL_BACKLOG.md` S104-F07 (M15).
Higiene de suíte: título de `schedule-contracts.test.js:602` corrigido. A única mudança em
`src/` de produção foi formatação Prettier pré-existente pendente em `sprint.schema.js`
(comprovadamente só quebra de linha; o conteúdo ignorando whitespace é idêntico).

## 6. O que não foi testado e por quê

- **Jornada E2E de navegador** — sem infraestrutura no repositório; decisão registrada de não
  bloquear (`S104-F02`, prioridade ALTA no backlog: enquanto aberta, o S1-04 não se declara
  plenamente homologado). As jornadas estão cobertas por API real + interface com API mockada.
- **ASVS L3** — fora da meta declarada (L2).
- **O que só o ambiente real prova** — TLS de borda, headers do host da SPA, retenção operacional
  de logs, backup: responsabilidade da implantação (Sprint 2 do roadmap), já listada como lacuna
  na `ASVS_BASELINE.md`.
- **Interleaving que exija o lock de projeto do escopo** — não construído (análise em S104-F07).
- **Rate limit sob carga real** — o teste existente prova o contrato do limiter em app isolado;
  comportamento sob carga é operação, não suíte.

## 7. Plano de commits proposto (a árvore não foi commitada)

A árvore carrega junto o trabalho do design de 24/08 (anterior à bateria). Sugestão em dois
commits, na ordem:

1. `feat(schedule): aplica o design de sprints e marcos de 24/08` — os componentes/telas/CSS já
   modificados na árvore antes da bateria (inclui `SprintActionsMenu.jsx`).
2. `test(schedule): bateria RF10/RF35 — mapa, 34 casos novos, mutação e docs` — os dois arquivos
   `rf10-rf35-bateria.test.js`, os dois testes de componente novos, as adições nas suítes de
   tela, o título corrigido em `schedule-contracts.test.js`, o Prettier de `sprint.schema.js` e
   os documentos (`RF10_RF35_{PROMPT,MAPA,RELATORIO}_TESTES.md`, `ASVS_BASELINE.md`,
   `RF_TECHNICAL_MATRIX.md`, `API_CONTRACTS.md`, `TECHNICAL_BACKLOG.md`).

## 8. Checklist de DoD do enunciado

- [x] Mapa item ↔ teste publicado, A1–A6 e I01–I36 classificados — nenhum AUSENTE restante
- [x] Fase 2: calculadoras puras (fronteiras, zero-vs-nulo, determinismo com `TZ` variado)
- [x] Fase 3: rotas com feliz, recusa de domínio, papel, isolamento e validação (pré-existente
      verificado + lacunas fechadas)
- [x] Fase 4: concorrência com `Promise.all` + rollback transacional (pré-existente verificado
      pela mutação M16/M36; estado impossível coberto por `schedule-contracts:1393`)
- [x] Fase 5: menu, ausência-com-menu-aberto, VIEWER, marcos, calendário, diálogo, 4 estados por
      tela, extremos, burndown acessível
- [x] Fase 6: 14 declarações verificadas; 13 controles acrescentados; LGPD conferida; matriz
      atualizada
- [x] Fase 7: tabela M01–M37 preenchida — **uma sobrevivente (M15), nominal e com backlog**
- [x] Fase 8: matriz, contratos, baseline, backlog e higiene de suíte
- [x] Cobertura acima dos limiares, sem tê-los baixado
- [x] `lint`, `format:check`, `architecture:check`, `security:secrets`, `build` verdes
- [x] Suíte completa 2× com o mesmo resultado (501/501 e 230/230)

---

# Segunda bateria (30/08/2026, design v4)

> Execução do enunciado `docs/issues/RF10_RF35_PROMPT_SEGUNDA_BATERIA.md` sobre a branch
> `joao-dev-v2` com a quarta iteração do design aplicada. Mapa atualizado na seção "Segunda
> bateria" de `RF10_RF35_MAPA_TESTES.md`.

## S1. Resumo

**RF10** — os comportamentos novos do design v4 correspondem ao especificado nos artboards e às
regras vigentes (ADR-011 > 010 > 009, intocadas): trilhas apenas para marcos que agrupam sprints,
marcador acessível que abre o nome, "hoje" restrito ao mês exibido, legenda e painel recortados
pelo mês, tarefas no cronograma, formulários com composição movendo vínculos pelo contrato
existente (`PUT` parcial). **RF35** — burndown na tela de Sprints com a variante ampla
matematicamente idêntica à compacta; fallback correto sem tarefas pontuadas. Nenhum defeito de
comportamento encontrado. **Segurança** — superfície HTTP inalterada; declarações da baseline
reexecutadas e adendo com a verificação dos fluxos compostos (falha parcial avisada e
ressincronizada, VIEWER sem catálogo nem mutação, nenhum dado pessoal novo na tela).

**Fase 0 (gate de zero comentários)** — as três varreduras devolvem **vazio** em produção, CSS e
nos 16 arquivos de teste do escopo. Duas diretivas `eslint-disable no-control-regex` da primeira
bateria foram eliminadas trocando a asserção por verificação de `charCodeAt` (equivalente, sem
regex de controle); a diretiva `exhaustive-deps` de `useScheduleData.js` já havia sido resolvida
em 30/08 trocando a dependência do efeito para `[loadAll]` (comportamento idêntico — `loadAll` só
muda com `projectId`). **Nenhum comentário no código de RF10/RF35.**

## S2. Números

| Medida | Largada | Fechamento |
|---|---|---|
| Backend — testes | 501 (38 arquivos) | **501 (38)** — delta sem backend; suíte 2× idêntica |
| Frontend — testes | 295 (31 arquivos) | **304 (31)** — 9 casos novos; suíte 2× idêntica |
| Frontend — cobertura | 66.94 / 64.96 / 59.87 / 68.13 | **67.10 / 65.48 / 60.14 / 68.25** (limiares 50/45/40/53) |

`lint`, `format:check`, `build` verdes nos dois projetos; `prisma validate` verde; banco de teste
com as 28 migrations em dia. Casos novos: normalização de prazo anterior à primeira sprint; marco
sem `dueDate` descartado; desempate por id em `deadlineTasks`; marco atual com todos vencidos;
ordem de emissão em volume (30 empates); Escape no marcador; dez marcos só-prazo em escala;
edição sem mudança de tarefas não chama replace; sprint congelada e sprint imóvel sem requisição
no formulário de marcos. Ajuste de fixture: a tarefa concluída dos cartões ganhou deadline para
provar que deadline de concluída não vira "Atenção".

## S3. Achados

Nenhum achado HIGH ou MEDIUM. O produto faz a coisa certa em tudo o que foi exercitado.

### [LOW — observação] M43 e M47 são mutantes equivalentes, não lacunas

O comparator de eventos com empate inconsistente (M43) é indistinguível no motor do projeto
(Node/V8) mesmo com 30 eventos empatados — o teste de volume foi escrito e mantido como contrato
da ordem de emissão, mas não diferencia o mutante; a forma total (`0` no empate) permanece por ser
a única com estabilidade garantida por especificação. O fim de mês fixado em "31" (M47) é
lexicograficamente equivalente para qualquer dia ISO real, como o próprio enunciado antecipava.
Mesma categoria dos M05/M10 da primeira bateria: equivalência documentada, não sobrevivência.

## S4. Bateria de mutação (M38–M56)

Protocolo idêntico ao da primeira: uma por vez sobre o `HEAD`, suíte-alvo reexecutada, reversão
por edição exata (a árvore segue sem commit).

| # | Mutação | Item | Vermelhos |
|---|---|---|---|
| M38 | marco sem sprint ganha `comTrilha` | I37 | 7 |
| M39 | `milestoneWeekLayout` desenha marco sem trilha | I37 | 3 |
| M40 | `hoje` sem a trava do mês exibido | I40 | 1 |
| M41 | abrir outro marcador fecha tudo em vez de trocar | I39 | 1 |
| M42 | marcador perde `aria-expanded` | I39 | 1 |
| M43 | comparator de eventos inconsistente no empate | I42 | **0 — equivalente no motor** (S3) |
| M44 | `deadlineTasks` mantém tarefa sem deadline | I42 | 1 |
| M45 | próximo deadline conta tarefa concluída | I43 | 1 |
| M46 | cartão de tarefas em aberto sem sprint ativa | I43 | 1 |
| M47 | fim do mês fixado em "31" | I44 | **0 — equivalente** (previsto no enunciado) |
| M48 | legenda sem o filtro do mês | I41 | 2 |
| M49 | replace disparado sem mudança na seleção | I45/I49 | 1 |
| M50 | falha do replace engolida sem aviso | I45 | 1 |
| M51 | formulário de marco emite PUT para congelada | I46 | 1 |
| M52 | desmarcadas deixam de ser soltas | I46 | 1 |
| M53 | VIEWER passa a buscar o catálogo de tarefas | I47 | 1 |
| M54 | variante ampla altera a nota calculada | I48 | 1 |
| M55 | expansor da agenda perde o teto de 6 | design v4 | 1 |
| M56 | todo ponto de prazo colorido | I37 | 1 |

**17 de 19 mutações mortas; duas equivalentes (M43, M47), nenhuma sobrevivente real.** Três só
morrem por assassinos escritos nesta bateria antes da rodada (M45 via fixture com deadline em
concluída; M49 via "editar sem mexer"; M51 via congelada no fixture de não-requisição).

## S5. Deriva documental

- `RF_TECHNICAL_MATRIX.md` (linhas RF10/RF35): **conferidas, nada falso** — não citam o filtro
  removido nem componente inexistente; `SprintProgressPanel`/`SprintBurndownChart` seguem
  corretos e agora mais verdadeiros (burndown na tela de Sprints).
- `TECHNICAL_BACKLOG.md`: S104-F12 (parâmetros `from`/`to` sem consumidor de UI) e S104-F13
  (PUTs sequenciais do formulário de marcos) já registrados; nenhum achado novo a acrescentar.
- `ASVS_BASELINE.md`: adendo da segunda bateria acrescentado (composição, falha parcial,
  minimização; nenhum capítulo novo aplicável).
- `API_CONTRACTS.md` e `AUTHORIZATION_MATRIX.md`: sem mudança — o delta não tocou contrato nem
  papel. Nenhum ADR novo: o design v4 não altera regra de domínio.

## S6. O que não foi testado e por quê

- **Verificação visual da seção 9 do enunciado** — depende do dev server no ambiente do João
  (regra 13); matriz de capturas proposta e aguardando execução. Os comportamentos têm prova
  funcional; o que fica pendente é o julgamento visual dos extremos.
- **Sobreposição de rótulos herdada do design** quando dois marcos com trilha estreiam na mesma
  semana — mitigada pelo empilhamento de marcadores (I39); julgamento final é visual.
- **E2E de navegador** — segue em `S104-F02`; **ASVS L3** — fora da meta; **ambiente real** —
  Sprint 2 do roadmap.

## S7. Checklist de DoD do enunciado

- [x] Fase 0 fechada: nenhum comentário no código de RF10/RF35 (diretivas remanescentes eliminadas)
- [x] Mapa atualizado: I37–I49 classificados (todos PROVADA); regressão reclassificada
- [x] Frontend 304/304 e backend 501/501, duas vezes, com `lint`/`format`/`build`/`prisma validate` verdes
- [x] Cobertura acima dos limiares, sem tê-los baixado
- [x] Mutação M38–M56 preenchida e fechada: 17 mortas, 2 equivalentes, 0 sobreviventes
- [ ] Matriz visual da seção 9 — **aguardando o dev server do João**
- [x] Nenhum teste novo alterou código de produção (exceção única da Fase 0: remoção de diretivas em teste)
- [x] Documentos da Fase 8 conferidos; baseline com adendo

---

# Terceira bateria (31/08/2026, quinta iteração — inclui RF08)

> Execução do enunciado `docs/issues/RF10_RF08_PROMPT_TERCEIRA_BATERIA.md` sobre a branch
> `joao-dev-v2` com a quinta iteração aplicada (`f4f4796`, `d538505`, `da04918`, `58e49b7`). Mapa
> atualizado na seção "Terceira bateria" de `RF10_RF35_MAPA_TESTES.md`.

## T1. Resumo

**RF10** — os três comportamentos novos conferem com a especificação e com o ADR-011 intocado: a
barra do marco alcança o fim da sprint agrupada que termina primeiro (`max(prazo, menor fim)`),
com o ponto e o evento de prazo firmes no `dueDate` e o sufixo `· prazo DD/MM` exatamente onde e
quando a barra passa dele; o painel do mês opera como tablist de quatro abas com "Todos" padrão,
seleção no foco, sobrevivência à navegação e vazios nomeados. **RF08** — o cartão está limpo de
combobox e o caminho sem mouse vive no diálogo de detalhes com o mesmo nome acessível, regras de
congelada/em-voo e sincronização quadro↔diálogo; arrasto e histórico intactos. **Segurança** — um
achado real (T-A1, abaixo): a imutabilidade do quadro congelado existe só no cliente.

**Fase 0** — as três varreduras devolvem **vazio** (sem sequer falso-positivo de URL): **nenhum
comentário no código de RF10/RF35**. No Kanban (fora do gate, registro próprio): `git show
da04918` confirma que todo comentário adicionado é reedição de comentário existente e o do
seletor saiu com o seletor — **nenhum comentário novo no Kanban**.

**Fase 6 (visual)** — executada em navegador real, sem backend: o cronograma pelo harness de
props e o Kanban montando a **tela real** (`KanbanScreen` completa) com o HTTP interceptado no
adapter do axios e estado em memória — as interações rodam o código de produção de ponta a ponta,
só a rede é sintética. Matriz completa: extremos 0/1/escala nas duas telas; marco 12/08–21/08 com
ponto em 17/08 e legenda `· prazo 17/08`; filtro por clique medido no DOM (Marcos → 6 itens sem
grupos; Tarefas → 14; Todos → 3 grupos/23); trilho de 4 segmentos sem sobra em desktop e 375px;
mover pelo diálogo derrubou "A Fazer" de 10 para 9 com o seletor refletindo sem reabrir;
congelada com seletor desabilitado e `title` conferidos por inspeção.

## T2. Números

| Medida | Largada | Fechamento |
|---|---|---|
| Backend — testes | 501 (38 arquivos) | **502 (39)** — arquivo novo `rf08-terceira-bateria.test.js`; suíte 2× idêntica |
| Backend — cobertura | — | **88.22 / 76.79 / 90.24 / 90.47** (limiares 85/70/85/87) |
| Frontend — testes | 316 (31 arquivos) | **322 (31)** — 6 casos novos; suíte 2× idêntica; 103/103 do cronograma sob TZ padrão, UTC e Pacific/Kiritimati |
| Frontend — cobertura | 67.03 / 65.53 / 60.03 / 68.11 | **67.25 / 65.80 / 60.21 / 68.25** (limiares 50/45/40/53) |

`lint`, `format:check`, `build`, `prisma validate`, `architecture:check` e `security:secrets`
verdes. Casos novos: T-F1 data inválida degrada para o colapso; T-F2 Tab sai da aba para o
tabpanel sem mudar seleção; T-F3 mês vazio no meio do intervalo mantém a aba filtrada; T-F4
Espaço abre o diálogo; T-F5 409 reabilita o seletor com a mensagem do quadro; T-F6 status atual
não dispara requisição; e o teste de API do shape completo do move.

## T3. Achados

### [MEDIUM] T-A1 — A imutabilidade do quadro congelado existe só no cliente

- **Onde:** `backend/src/modules/tasks/services/task-kanban.service.js::moveTask` (nenhuma
  leitura do status da sprint da tarefa).
- **Norma violada:** CONTEXTO §13.5 ("não confiar em ocultação de botões no frontend"); ASVS 5.0
  V2 (lógica de negócio no servidor); ADR-010 D04 como o Kanban o aplica; o comentário de
  `KanbanBoard.jsx` promete "o backend recusaria a movimentação com 409".
- **Esperado:** `PATCH /tasks/:id/move` de tarefa cuja sprint está `CONCLUIDA`/`CANCELADA`
  recusado com `409` de código estável.
- **Observado:** `200` com o status mutado (sonda da Fase 4, 31/08).
- **Reprodução:** criar sprint `CONCLUIDA`, tarefa `CONCLUIDO` com `sprintId` apontando para ela,
  `PATCH /api/tasks/:id/move {toStatus: 'A_FAZER'}` autenticado com escrita no projeto.
- **Consequência:** a composição visível de uma sprint encerrada muda por chamada direta; a
  participação congelada do RF35 (`SprintTask`) não é tocada — o registro histórico permanece
  íntegro, o que limita a severidade a MEDIUM.
- **Proposta:** guarda no service com `409` + teste de API (registrada em `TECHNICAL_BACKLOG.md`
  **S104-F14**; declarada como pendência ativa de L2 no adendo da baseline). **Não corrigida na
  bateria**, por regra.

Nenhum outro achado. A primeira aplicação do M64 foi **nula** (padrão com `\n` dentro de `\Q` não
casa) e detectada pela contagem de ocorrências antes do veredito — refeita e morta; registrado
como armadilha de protocolo, não como sobrevivência.

## T4. Bateria de mutação (M57–M72)

Uma por vez sobre o `HEAD`, suíte completa do frontend reexecutada, reversão por `git checkout`
dentro da mesma operação.

| # | Mutação | Item | Vermelhos |
|---|---|---|---|
| M57 | extensão pelo **maior** fim | I50 | 1 (o assassino da Fase 2) |
| M58 | `alcance` estende sempre para `menorFim` | I50 | 9 |
| M59 | sufixo de prazo emitido sempre (legenda) | I51 | 1 |
| M60 | ponto de prazo apontando o fim estendido | I51 | 1 |
| M61 | evento de início por `inicio !== prazo` | I53 | 1 |
| M62 | início vence o prazo no dia degenerado | I53 | 1 |
| M63 | aba padrão volta a `'marcos'` | I55 | 6 |
| M64 | `ativarAba` move o foco sem selecionar | I54 | 1 |
| M65 | navegar de mês reseta a aba | I54 | 2 |
| M66 | visão Todos omite grupo vazio | I55 | 1 |
| M67 | badge da aba fixado em `0` | I55 | 9 |
| M68 | `<select>` de volta ao cartão | I56 | 1 |
| M69 | diálogo ignora `frozen` | I57 | 1 |
| M70 | diálogo ignora `moving` | I57 | 1 |
| M71 | move sem sincronizar `selectedTask` | I58 | 1 |
| M72 | Enter/Espaço deixam de abrir o diálogo | I56 | 3 |

**16 de 16 mortas. Nenhuma mutação sobreviveu.** Quatro morrem por assassinos escritos nesta
bateria (M57 pelo caso do menor fim; M65 pelo T-F3 além do caso de sobrevivência; M66 pelos
vazios juntos; M70/M72 em parte pelos T-F4/T-F5).

## T5. Deriva documental

- `RF_TECHNICAL_MATRIX.md`: linha do RF08 já citava `TaskDetailsPanel` (commit `11587a9`);
  linha do RF10 nada afirma do painel de blocos nem do desenho antigo da barra — **nada falso**.
- `TECHNICAL_BACKLOG.md`: **S104-F14** (achado T-A1) acrescentado; o segundo `S104-F07`
  renumerado para o **S104-F11** vago (dois itens dividiam o mesmo ID).
- `ASVS_BASELINE.md`: adendo da terceira bateria acrescentado, com o T-A1 declarado como
  pendência ativa de L2.
- `API_CONTRACTS.md` e `AUTHORIZATION_MATRIX.md`: sem mudança — delta sem backend; a autorização
  do move segue provada em `auth-authorization.test.js`. Nenhum ADR novo: a quinta iteração não
  altera regra de domínio (ADR-011 D03 preservado).

## T6. O que não foi testado e por quê

- **Smoke no ambiente completo** (backend + MySQL + seed reais): a verificação visual usou a tela
  real com HTTP interceptado no adapter — cobre o código de produção do frontend, não o
  integração viva com o servidor; o smoke ponta a ponta permanece com o João (o mesmo recorte que
  `S104-F02` já registra como pendência de E2E).
- **A largura igual dos segmentos e o alinhamento do seletor no `dl`** foram julgados por captura
  (Fase 6), não por asserção — por regra do enunciado.
- **ASVS L3** — fora da meta; **ambiente real** — Sprint 2 do roadmap.

## T7. Checklist de DoD do enunciado

- [x] Fase 0 fechada nos dois escopos (zero em RF10/RF35; nenhum comentário novo no Kanban)
- [x] Mapa atualizado: I50–I58 classificados (todos PROVADA); I38/I44 reescritos; RF08 no mapa; Fase 4 com a linha CONTRADITA do T-A1
- [x] Frontend 322/322 e backend 502/502, duas vezes, com todos os gates verdes
- [x] Cobertura acima dos limiares e acima dos números de partida
- [x] Mutação M57–M72 preenchida e fechada: 16 mortas, 0 sobreviventes
- [x] Matriz visual da seção 9 completa em navegador real (harness sem backend); capturas no registro da sessão; harness apagado antes dos commits
- [x] Nenhum teste novo alterou código de produção (o achado T-A1 ficou registrado, não corrigido)
- [x] Documentos da Fase 8 conferidos ou corrigidos; relatório escrito
