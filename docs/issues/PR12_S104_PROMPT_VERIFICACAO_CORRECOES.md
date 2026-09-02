# Prompt de verificação — PR #12, correções do parecer final

> **Como usar este documento.** Ele é o enunciado de uma **auditoria independente** das correções
> aplicadas à PR [#12](https://github.com/iYoNuttxD/Traceflow/pull/12) em resposta ao parecer
> **REQUEST CHANGES**. Não é um prompt de implementação: o trabalho aqui é **provar ou derrubar** a
> afirmação de que cada achado do parecer foi resolvido.
>
> Execute as seções na ordem. A §1 é eliminatória: se a base estiver errada, o resto não vale nada.
> Encerre pela §9 (formato do veredito).
>
> **Documentos irmãos.** O parecer original define o que é dívida. O
> [`PR12_S104_PROMPT_CORRECOES_FINAIS.md`](PR12_S104_PROMPT_CORRECOES_FINAIS.md) define o que foi
> prometido. Este define como conferir. Onde os três divergirem, **o parecer vence** — os outros dois
> são interpretação dele.

---

## 0. Regras da verificação (invioláveis)

1. **Não confie em resumo, mensagem de commit ou neste documento.** Todos são a versão do implementador.
   A evidência é o código no HEAD atual, a suíte executando, e o texto do parecer.
2. **Teste verde não prova correção.** Um teste que passaria também com o bug presente não é
   evidência de nada. Por isso a §3 exige, para cada correção, **quebrar deliberadamente o fix e
   confirmar que o teste fica vermelho**. Um fix cujo teste continua verde depois de quebrado é um
   achado — reporte como `TESTE INÓCUO`.
3. **Restaure tudo o que quebrar.** Use `git stash` ou cópia do arquivo; ao fim da §3 o
   `git status` precisa estar limpo. Confirme isso explicitamente antes de emitir veredito.
4. **Não corrija nada.** Esta auditoria não altera código de produção. Se encontrar defeito,
   descreva-o com arquivo, linha, cenário de falha e severidade. Corrigir é outra tarefa.
5. **Ambiente é do João.** Toda operação de banco ou serviço (`migrate dev`, `migrate reset`,
   `db push`, restart de MySQL, seed) deve ser **proposta como comando e aguardar aval**. Rodar a
   suíte de testes e ler arquivos é livre.
6. **Severidade calibrada.** `BLOQUEIA MERGE` só para defeito que produz estado incorreto,
   perda de dado, mentira para o usuário ou falha de autorização. Divergência de estilo, teste
   frágil ou dívida documentada é `IMPORTANTE` ou `SUGESTÃO`.
7. **Achado precisa de cenário concreto.** "Pode dar problema" não é achado. "Com A em X e B em Y,
   nesta ordem, o resultado é Z, e deveria ser W" é.

---

## 1. Eliminatória — a verificação está na árvore certa?

Esta seção existe porque o implementador **já errou exatamente aqui**: a primeira análise rodou sobre
uma base local que tinha divergido do HEAD revisado, e um achado válido do parecer foi declarado
improcedente por causa disso (detalhe em §5, I2). Não repita o erro.

O parecer declara ter revisado `9548a2c8395d5fa948c83ca4e05d75b58937e961`.

```bash
git log --oneline -12
```

Confirme, nesta ordem:

1. **O HEAD revisado é ancestral do HEAD atual.**
   ```bash
   git merge-base --is-ancestor 9548a2c8395d5fa948c83ca4e05d75b58937e961 HEAD && echo "OK: contém o HEAD revisado"
   ```
   Se falhar, **pare**: as correções não estão sobre o código que foi revisado. Reporte e encerre.

2. **O diff da correção contra o HEAD revisado é focado.**
   ```bash
   git diff --stat 9548a2c8395d5fa948c83ca4e05d75b58937e961 HEAD -- backend/src frontend/src
   ```
   Espere ~11 arquivos de código, na ordem de +220/−96 linhas. Um diff muito maior indica escopo
   ampliado — investigue o excedente antes de seguir.

3. **Nada da `main` foi revertido pelo merge de integração.** O merge `eea19d1` teve 5 conflitos.
   Verifique que nenhuma resolução descartou trabalho da `main`:
   ```bash
   git diff 9548a2c8395d5fa948c83ca4e05d75b58937e961 HEAD -- frontend/src/shared/components/FeedbackRegion.jsx
   ```
   **Esperado: diff vazio.** O implementador havia reescrito esse componente na base antiga e
   afirma tê-lo restaurado integralmente. Qualquer linha de diff aqui é `BLOQUEIA MERGE`: a `main`
   traz variantes com ícone, countdown de rate limit e CSS próprio.

   Confira também que a remoção de `projectMemberId` feita pela `main` sobreviveu:
   ```bash
   grep -rn "projectMemberId" backend/src/modules/tasks/
   ```
   **Esperado: nenhuma ocorrência** em `task-movement.repository.js`.

4. **Árvore limpa.**
   ```bash
   git status --porcelain
   ```
   Só `?? .claude/` é aceitável.

---

## 2. Pré-requisitos de ambiente

Duas armadilhas conhecidas, ambas já custaram tempo neste repositório:

- **`backend/.env.test` é gitignored e envelhece calado.** Sem ele, testes de API falham por `429`
  e o sintoma parece bug de código. Pior: ele não acompanha mudanças de `src/config/env.js` vindas
  de outras branches. Se muitas suítes falharem **no import** (`FAIL ... [ arquivo ]`, sem nome de
  teste) com `ConfigurationError`, é isso — compare `.env.test` com o versionado
  `backend/.env.example`, não procure bug de schema.
- **Duas instâncias de MySQL disputando a 3306.** O erro se apresenta como credencial inválida, mas
  é banco errado.

Confirme antes de rodar qualquer coisa:

```bash
ls backend/.env.test && grep -c . backend/.env.example
```

---

## 3. Verificação por achado

Para cada item: **(a)** leia o que o parecer exigiu, **(b)** confirme no código, **(c)** rode o teste,
**(d)** quebre o fix e confirme que o teste fica vermelho, **(e)** restaure.

### 3.1 B1 — corrida entre encerramento de sprint e movimentação Kanban

**O parecer exigiu:** lock/releitura de `Project → Sprint → Task` dentro da mesma transação da
movimentação, com revalidação do estado terminal e da associação atual, mais teste concorrente.

**(b) Confirme no código** — `backend/src/modules/tasks/repositories/task-movement.repository.js`:

- `lockProject(tx, task.projectId)` é a **primeira** instrução da transação;
- a Sprint é travada com `FOR UPDATE` **antes** da Task, e a Task também com `FOR UPDATE`;
- existe a guarda `if (sprintAtual !== sprintId) return { conflict: true }`;
- `TaskMovement.sprintId` vem da releitura (`sprintAtual`), não do parâmetro `task`;
- `fromStatus` e `fromValue`, ao contrário, usam `task.status` — e **isso está certo**. O predicado
  do `updateMany` fixa `status: task.status`, então quando a escrita passa os dois valores são o
  mesmo; trocar por um status relido quebraria a proteção descrita no ponto de atenção abaixo. Não
  reporte como achado;
- `validate` é chamado **depois** dos locks e **antes** do `updateMany`.

Em `backend/src/modules/tasks/services/task-kanban.service.js`, confirme que a regra terminal
continua no service (callback `validate`) e que **não há** consulta de sprint fora da transação.

> **Ponto de atenção — não deixe passar.** O predicado do `updateMany` deve continuar ancorado em
> `task.status` (o status que a **requisição observou**), e **não** no status relido. Isso não é
> descuido: é a proteção otimista contra quadro desatualizado. Se alguém trocou por `atual.status`,
> duas movimentações simultâneas para colunas diferentes passam as duas com `200` em vez de uma
> receber `409`. Prove qual dos dois comportamentos está valendo rodando o teste de contrato:
> ```bash
> cd backend && npx vitest run test/api/mvp-contracts.test.js -t "protege atualização concorrente"
> ```

**(c) Rode:**
```bash
cd backend && npx vitest run test/integration/rf10-sprint-schedule.test.js
```
Espere **22 passando**, incluindo o describe `encerramento de sprint versus movimento de tarefa`
(3 testes, dois deles em laço de 5 rodadas).

**(d) Quebre:** em `task-movement.repository.js`, troque as **duas** ocorrências de
`sprintId: sprintAtual` por `sprintId: task.sprintId ?? null`.
**Esperado:** `movimento posterior ao backlog nao registra a sprint encerrada` fica vermelho.
Se continuar verde, o teste é inócuo — `BLOQUEIA MERGE`.

Faça um segundo corte: remova a linha `await lockProject(tx, task.projectId);`.
**Esperado:** pelo menos um dos testes do describe fica vermelho. Como é corrida, rode 3 vezes antes
de concluir que o teste não pega.

**(e) Restaure e confirme `git status` limpo.**

**Verificação extra — deadlock.** A ordem de lock nova precisa conviver com os quatro caminhos do
cronograma. Rode os cruzamentos existentes algumas vezes e confirme ausência de `P2034`:
```bash
cd backend && npx vitest run test/integration/rf10-sprint-schedule.test.js -t "concorrencia sob lock"
```

### 3.2 B2 — falha de refresh reportada como falha de mutation

**O parecer exigiu:** finalizar a mutation como sucesso, tratar o refresh à parte, informar apenas
que a ação foi concluída mas os dados não puderam ser atualizados, e que o retry recarregue leitura
em vez de repetir a mutation.

**(b) Confirme no código** — `frontend/src/features/schedule/hooks/useScheduleData.js`:

- existe `settle(mensagem, refresh)` que chama `feedback(...)` **antes** do refresh e captura a
  falha do refresh num estado próprio (`staleWarning`), **não** em `error`;
- `feedback`, `handleFailure`, `fail` e `loadAll` limpam `staleWarning`.

> **Por que `staleWarning` não pode ser `error`.** `SprintsScreen` renderiza um `ErrorState` de
> página inteira quando `error` está setado e a lista está vazia. Reusar `error` para o aviso de
> refresh esconderia a tela inteira depois de uma criação bem-sucedida. Confirme que essa separação
> existe e que o `ErrorState` de página continua condicionado só a `error`.

Nas telas, confirme que **o `catch` externo cobre somente a chamada de mutation** — nenhum
`refresh*()` pode estar dentro dele. Sites a conferir, todos os seis:

| Arquivo | Função |
|---|---|
| `SprintsScreen.jsx` | `submitSprint` |
| `SprintsScreen.jsx` | `changeSprintStatus` |
| `SprintsScreen.jsx` | `submitSprintTasks` |
| `MilestonesScreen.jsx` | `submitMilestone` |
| `MilestonesScreen.jsx` | `toggleMilestoneStatus` |
| `MilestonesScreen.jsx` | `removeMilestone` |

> O parecer listou cinco. O sexto (`submitSprintTasks`) foi encontrado durante a implementação.
> Confirme que ele foi de fato corrigido e não apenas mencionado.

Confirme também que o **sucesso parcial que já existia foi preservado**: em `submitSprint` e
`submitMilestone`, quando a reassociação de tarefas/sprints falha, a mensagem específica
(`fail(...)`) precisa continuar vencendo o aviso genérico de refresh.

**(c) Rode:**
```bash
cd frontend && npx vitest run test/features/SprintsScreen.test.jsx test/features/MilestonesScreen.test.jsx
```

**(d) Quebre:** em `useScheduleData.js`, remova o `try/catch` de dentro de `settle`, deixando só
`feedback(message); await refresh();`.
**Esperado:** os 5 testes do describe `sucesso de mutation versus falha de refresh` (2 em Sprints,
3 em Milestones) ficam vermelhos.

**(e) Restaure.**

**Verificação de mérito, não só de teste.** `FeedbackRegion` da `main` é XOR — mostra **uma**
mensagem, com precedência `error > rate-limit > warning > success`. Logo, quando o refresh falha, o
usuário vê o aviso **no lugar** do banner de sucesso, não além dele. Julgue se isso satisfaz o
parecer: a mensagem precisa, sozinha, deixar claro que **a ação foi concluída**. Leia o texto exato
em `useScheduleData.js` e diga se ele cumpre isso. Se você achar que não cumpre, é `IMPORTANTE`.

### 3.3 B3 — contexto antigo sobrescrevendo o projeto atual

**O parecer exigiu:** geração/context token latest-wins, abort/cleanup no switch e unmount, guards
antes de cada `setState`, e testes com respostas A/B fora de ordem.

**(b) Confirme no código** — `useScheduleData.js`:

- `generationRef` + `isCurrent(generation)`;
- `loadAll` captura a geração no início e guarda **as três saídas**: sucesso, `catch` e `finally`
  (o `setLoading(false)` do `finally` era o defeito específico apontado pelo parecer);
- na troca de projeto: os refreshes pendentes são cancelados **e** `project`, `schedule`, `sprints`,
  `milestones`, `currentMembership` e `success` são limpos;
- `refreshSchedule`, `refreshSprints` e `refreshMilestones` propagam `signal` e checam a geração.

> **Ponto de atenção.** Cada refresh precisa de **instância própria** de `useAbortableRequest`.
> Uma instância compartilhada faria um refresh abortar o outro, porque `run` cancela a chamada
> anterior da mesma instância. Confirme que são três instâncias distintas, não uma.

**(c) Rode:**
```bash
cd frontend && npx vitest run test/features/useScheduleData.test.jsx
```
Espere **6 passando**.

**(d) Quebre:** troque `if (isCurrent(generation)) setLoading(false);` por `setLoading(false);`.
**Esperado:** `carga abortada nao derruba o loading da carga corrente` fica vermelho.

Segundo corte: remova o bloco de limpeza da troca de projeto.
**Esperado:** `nao mantem dados do projeto anterior sob a rota nova` fica vermelho.

**(e) Restaure.**

**Verificação de honestidade do conjunto.** Dos 6 testes desse arquivo, **3 passam mesmo sem as
correções da fase** — o `useAbortableRequest` já existente cobria esses casos. Confirme você mesmo
quais são, restaurando o hook anterior:
```bash
git show 55cd6f5:frontend/src/features/schedule/hooks/useScheduleData.js > /tmp/hook-antigo.js
```
Se o número de testes que ficam vermelhos for **diferente de 3**, o inventário de evidência do
implementador está errado — reporte.

### 3.4 I1 — código de erro do contrato × runtime

**O parecer exigiu:** alinhar o emissor ou corrigir explicitamente o contrato, e fortalecer o teste.

**(b) Confirme:** em `backend/src/modules/sprints/sprint.validation.js`, `createSprintBodySchema`
declara `milestoneId` como `.nullable().optional()`, deixando a regra de domínio em
`sprint.schema.js` emitir `SPRINT_MILESTONE_REQUIRED`. Confirme que `updateSprintBodySchema`
**não** mudou (lá `null` é desassociação legítima).

**(c) Rode:**
```bash
cd backend && npx vitest run test/api/rf08-rf10-rf35-caixa-preta.test.js -t "CP-PE-01"
```
Leia o corpo do teste: ele precisa validar `body.code` nas **duas** formas de ausência (campo
ausente e `null`) e ter um caso de `milestoneId` malformado devolvendo `VALIDATION_ERROR`. A
asserção duplicada original (`semCampo` conferido duas vezes) não pode mais existir.

**(d) Quebre:** volte `milestoneId` para `positiveInteger('ID do marco inválido.')`.
**Esperado:** `CP-PE-01` fica vermelho.

**(e) Restaure.**

**Confira a documentação, não só o código:** `docs/api/API_CONTRACTS.md` descreve quando o código é
emitido e o que continua sendo `VALIDATION_ERROR`; `RF08_RF10_RF35_CASOS_CAIXA_PRETA.md` e
`RF10_RF35_RELATORIO_TESTES.md` refletem o fechamento parcial do achado CP-A1; o item `S104-F15` do
backlog mantém aberto **apenas** a parte do lote acima de 100 ids. Se algum desses disser que o
achado foi fechado por inteiro, é `IMPORTANTE` — o lote continua devolvendo `VALIDATION_ERROR`.

### 3.5 I2 — inventário de surfaces

**Trate este item com desconfiança redobrada.** O implementador primeiro declarou o achado
improcedente ("o arquivo e a regra não existem"), porque procurou na base local pré-merge; depois
reconheceu o erro e fez o trabalho. Verifique o **resultado**, não a retratação.

**(b) Confirme que a regra existe e é essa mesma:** `CONTRIBUTING.md`, seção "Rastreabilidade de
superfícies de UI" — exige inventário para página, dialog, confirmação e estado visual de fluxo,
incluindo empty, loading, error, success e permission; e condiciona `VISUALLY APPROVED` a registro
no `docs/design/validation/VISUAL_VALIDATION_LOG.md`.

**(c) Confira o inventário** — `docs/design/UI_SURFACE_INVENTORY.md`, seção
`Planning (Sprints, Milestones, Schedule)`:

1. **Cobertura.** Cada rota nova (`/sprints`, `/milestones`, `/schedule`) tem entrada, e cada estado
   auxiliar exigido pela regra aparece na coluna States. Compare contra o que existe de fato:
   ```bash
   ls frontend/src/features/schedule/components frontend/src/features/schedule/pages
   ```
   Uma surface real ausente do inventário é `IMPORTANTE`. Uma surface inventada que não existe no
   código também.
2. **O filtro de sprint do Kanban** (`KanbanSprintFilter.jsx`), acrescentado por esta PR, está
   catalogado.
3. **O estado novo criado pela correção B2** (aviso de dados desatualizados) está catalogado.
4. **Nenhuma entrada nova está como `VISUALLY APPROVED`** — não houve homologação renderizada.
   Qualquer `VISUALLY APPROVED` sem linha correspondente no Visual Validation Log é
   `BLOQUEIA MERGE`: viola a regra explícita do `CONTRIBUTING.md`.
5. **Os totais fecham.** Entre os marcadores `INVENTORY_COUNTS`, some a coluna Total da tabela de
   domínios e compare com `Total surfaces`; some as colunas C2/Legacy/Hybrid e compare com os
   contadores; some as três linhas de Validation evidence e compare com o total. Conte as linhas
   reais da tabela e confirme que batem com o incremento declarado. Total divergente é `IMPORTANTE`.

### 3.6 I3 — carga inicial do Kanban

**O parecer classificou como lacuna preexistente da `main`**, pedindo que o estado novo de Sprint
entrasse na correção assíncrona.

**(b) Confirme** em `frontend/src/features/tasks/pages/KanbanScreen.jsx`: token de geração, `signal`
propagado às seis chamadas, guards no sucesso/`catch`/`finally`, e limpeza na troca de projeto
incluindo `projectSprints` e `sprintFilter`.

Confirme que **dois comportamentos corretos foram preservados**:
- a falha de `listSprints` continua caindo para lista vazia sem derrubar o quadro;
- as sprints pedidas na URL continuam sendo validadas contra o catálogo carregado.

**(c) Rode:**
```bash
cd frontend && npx vitest run test/pages/KanbanPage.test.jsx
```

**(d) Quebre — atenção, aqui o corte óbvio não funciona.** Remover o guard
`if (!resultado || !atual()) return;` **deixa a suíte verde**, e isso não é falha do teste: nesta
tela `loadRequest` é instância única de `useAbortableRequest`, e `run` já aborta a chamada anterior
a cada reentrada. A carga do projeto antigo resolve como `undefined`, e o `if (!resultado)` sozinho
barra a escrita. O mesmo vale para o guard do `finally`. **Não reporte isso como `TESTE INÓCUO`** —
a auditoria de 01/09/2026 já mediu: cortar `!atual()` no sucesso e no `finally` mantém os 17 testes
verdes.

O corte que prova a correção é voltar a tela ao estado do HEAD revisado, sem abort algum:

```bash
cp frontend/src/features/tasks/pages/KanbanScreen.jsx /tmp/audit-i3.jsx
git show 9548a2c8395d5fa948c83ca4e05d75b58937e961:frontend/src/features/tasks/pages/KanbanScreen.jsx \
  > frontend/src/features/tasks/pages/KanbanScreen.jsx
cd frontend && npx vitest run test/pages/KanbanPage.test.jsx
```

**Esperado:** `resposta do projeto anterior nao sobrescreve quadro, catalogo nem filtro` fica
vermelho — 1 falha em 17.

**(e) Restaure** com `cp /tmp/audit-i3.jsx frontend/src/features/tasks/pages/KanbanScreen.jsx`.

**(f) O que fica sem prova.** O corte de (d) demonstra que a tela deixou de aceitar resposta fora de
contexto, mas **não separa** qual mecanismo entregou isso: o abort ou o token de geração. Como o
abort sozinho já resolve o cenário testado, o token de `KanbanScreen` é defesa em profundidade sem
caminho conhecido que o exercite. Registre isso no veredito como lacuna de cobertura, não como
defeito — o comportamento está correto.

> **Isto não vale para `useScheduleData`.** Lá o token é carga viva e coberto: os três refreshes têm
> instância própria de `useAbortableRequest`, então o `run` do `loadAll` não os cancela, e o
> `setLoading(false)` do `finally` da carga antiga derruba o loading da nova se não for guardado —
> é exatamente o corte da §3.3, que fica vermelho. Não generalize a conclusão desta seção para lá.

---

## 4. O que precisa ter continuado funcionando

O parecer aprovou explicitamente estas áreas. A correção não pode tê-las degradado. Verifique por
leitura e pela suíte:

- **Autorização backend-first.** VIEWER lê e não muta; MEMBER+ muta; acesso fora do projeto usa
  resposta opaca equivalente a 404; IDs filho resolvem para o projeto real. As alterações do B1
  mexeram no caminho de movimentação — confirme que `ensureTaskExists`/`ensureProjectExists`
  continuam **antes** da transação, preservando o 404 opaco.
- **Transação única de movimento.** `TaskMovement`, `TaskHistoryEntry` e `AuditEvent` continuam
  gravados na mesma transação: ou existem os três, ou nenhum.
- **Exclusão de sprint** continua desabilitada com `405`, com autorização aplicada **antes**.
- **Limite de 100 tarefas**, carry-over, congelamento terminal e progresso continuam com cobertura
  positiva e negativa.
- **Arquitetura.** `Route → Controller → Service → Repository → Prisma` preservado; nenhuma regra de
  domínio desceu para o repository (o `validate` injetado é o padrão que mantém a decisão no service).
  ```bash
  cd backend && npm run architecture:check
  ```
- **Sem comentário narrativo novo** em `sprints/`, `schedule/` ou `tasks/`; racional de decisão vive
  em ADR. Confira o diff, não o arquivo inteiro.

---

## 5. Suíte completa e números esperados

```bash
cd backend && npm run lint && npm run format:check && npm run architecture:check && npm run security:secrets && npx prisma validate && npm test
```

```bash
cd frontend && npm run lint && npm run format:check && npm run build && npx vitest run --coverage
```

Referências declaradas — divergência é achado, não ajuste:

| Métrica | Baseline do parecer | Declarado após correção |
|---|---|---|
| Backend testes | 842 aprovados, 5 ignorados | 845 aprovados, 5 ignorados |
| Backend statements | 89,80% | 89,77% |
| Frontend testes | 618 aprovados | 630 aprovados |
| Frontend statements | 76,40% | 76,71% |

O acréscimo backend deve ser exatamente os 3 testes de concorrência; o frontend, os 12 novos
(2 + 3 de refresh, 6 do hook, 1 do Kanban). Se a conta não fechar, descubra o que mais entrou.

**Sobre o flake `S104-F16`** (`protege atualização concorrente do mesmo status`): o backlog afirma
que o lock de projeto provavelmente o encerrou, com 8 execuções verdes registradas. Isso **não** é
conclusivo para um flake que aparecia 1 em 3 rodadas da suíte completa. Se quiser fechar o item,
rode em laço e reporte a taxa medida:
```bash
cd backend && for i in $(seq 1 20); do npx vitest run test/api/mvp-contracts.test.js -t "protege atualização concorrente" --reporter=dot 2>&1 | grep -E "^ *Tests "; done
```

---

## 6. O que sabidamente não foi feito

Confirme que continua não feito e que **nada no repositório afirma o contrário**:

- **Validação visual renderizada (§9 do prompt de correção).** As três páginas novas seguem
  `NOT VISUALLY VALIDATED`. Light/Dark, responsividade e alvos de toque estão cobertos apenas até o
  limite dos testes. Exige login e dados nos dois extremos (projeto zerado e em escala) no ambiente
  do João. Se o inventário ou o Visual Validation Log disserem que houve homologação, é
  `BLOQUEIA MERGE`.
- **Domínio de comentários (Edit/Delete).** `NOT IMPLEMENTED`, pertence ao card S1-05. Se apareceu
  qualquer UI de comentário, rótulo "Editado", tombstone ou distinção por ator sem contrato backend,
  é `CONTRACT GAP`. Em particular, `OWNER` é papel contextual de projeto e não pode ter virado
  "Administrador" em lugar nenhum.
- **Não-bloqueantes no backlog:** endpoint atômico marco↔sprints (`S104-F13`), dialog legado do
  `TaskDetailsPanel` (`S104-F17`), chave duplicada em `SprintList` e no calendário (`S104-F18`),
  lote acima de 100 ids (`S104-F15`). Confirme que estão registrados e que nenhum foi silenciosamente
  fechado.

---

## 7. Mudança de ambiente aplicada

O implementador alterou `backend/.env.test`: `ACCOUNT_DELETION_GRACE_DAYS` de `7` para `30`.

Justificativa declarada: a `main` apertou o mínimo de `1` para `30` em `src/config/env.js`, e o
arquivo local passou a ser inválido, derrubando 18 suítes no import.

**Verifique:** a restrição atual em `src/config/env.js`, que `backend/.env.example` (versionado) usa
`30`, e que nenhum teste dependia do valor `7`:
```bash
grep -rn "accountDeletionGraceDays\|GRACE_DAYS" backend/test backend/src --include=*.js
```
Se algum teste assumir 7, a mudança quebrou semântica em vez de destravar ambiente — `IMPORTANTE`.

---

## 8. Perguntas que o veredito precisa responder

Responda cada uma com evidência, não com impressão:

1. Cada um dos três blockers do parecer está resolvido no código, e há teste que fica **vermelho**
   quando o fix é removido? (I3 é a exceção conhecida: ver §3.6(f) — o corte precisa remover o
   abort, não o token de geração.)
2. A proteção otimista de `409` no movimento concorrente sobreviveu à mudança de lock?
3. O aviso de refresh consegue, sozinho, comunicar que a ação foi concluída — dado que o
   `FeedbackRegion` mostra uma mensagem por vez?
4. Algum comportamento aprovado pelo parecer (autorização, 404 opaco, transação única, 405 da
   exclusão de sprint) foi degradado?
5. O inventário de surfaces cobre o que existe, sem inventar e sem aprovar visualmente o que não foi
   homologado, e seus totais fecham?
6. Os números de teste e cobertura conferem com o declarado, e o delta é explicável?
7. Restou algum arquivo modificado pela auditoria (`git status`)?

---

## 9. Formato do veredito

Abra com a decisão — **APROVAR** ou **REPROVAR** — e a razão em uma frase.

Depois, uma tabela achado a achado:

| Achado do parecer | Status | Evidência |
|---|---|---|
| B1 corrida encerramento × movimento | RESOLVIDO / PARCIAL / NÃO RESOLVIDO | arquivo:linha + teste que fica vermelho ao quebrar |
| B2 refresh vira erro falso | | |
| B3 contexto antigo sobrescreve | | |
| I1 código de erro do contrato | | |
| I2 inventário de surfaces | | |
| I3 carga inicial do Kanban | | |

Depois, os achados **novos** encontrados pela auditoria, cada um com:

```
[SEVERIDADE] título curto
Arquivo: caminho:linha
Cenário: entradas/estado concretos → resultado errado
Esperado: o que deveria acontecer
Origem: introduzido pela correção | preexistente | dívida já registrada
```

Encerre declarando explicitamente:
- os comandos executados e seus resultados;
- que todos os cortes deliberados da §3 foram restaurados e o `git status` está limpo;
- o que **não** foi possível verificar e por quê.

Não altere nenhum arquivo-fonte, documento, estado de PR, comentário, review, commit, branch ou
workflow nesta execução.
