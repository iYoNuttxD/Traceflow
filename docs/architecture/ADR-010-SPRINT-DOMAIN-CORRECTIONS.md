# ADR-010 — Correção do modelo de sprint, marco e evolução

- **Estado:** aceita no S1-04 (RF10 e RF35)
- **Data:** 16/08/2026
- **Responsáveis:** equipe TraceFlow
- **Supersede:** decisões 1, 2, 3, 4, 7 e 9 do [ADR-009](ADR-009-SPRINT-SCHEDULE-MODEL.md)
- **Parcialmente superado por:** [ADR-011](ADR-011-MILESTONE-SPRINT-INVERSION.md) — D02 e D11
  deixaram de valer, e D12 vale só para a sprint

> **Aviso de leitura.** As decisões **D02** (marco pertence a uma sprint), **D11** (prazo do marco
> dentro da janela) e a parte de **D12** que congela o marco junto com a sprint foram revertidas
> pelo ADR-011: o marco passou a **agrupar** sprints. O restante deste ADR continua em vigor.
> Ler D02/D11/D12 isoladamente leva à conclusão oposta à do modelo atual.

## Contexto

O ADR-009 registrou o modelo entregue na PR #12. A revisão de código daquela PR e o
alinhamento de domínio que se seguiu mostraram que várias daquelas decisões não
representavam o domínio pretendido — e que o modelo persistente não conseguia sustentar o
critério de aceite do RF35 ("evolução reproduzível", "tarefas adicionadas ou removidas após
o planejamento são identificáveis").

O problema central: o ADR-009 tratou a sprint como um **estado presente** (quais tarefas
estão nela agora) quando o RF35 precisa dela como um **período com registro** (o que
aconteceu ali). Todas as correções abaixo derivam disso.

Este ADR não reescreve o ADR-009. Ele registra o que mudou e por quê, para que a leitura do
histórico continue possível.

## Decisões

### D01 — Participação histórica substitui a FK singular (supersede ADR-009 §1)

Uma tarefa participa de **várias sprints ao longo do tempo**. Cada participação é um registro
próprio em `SprintTask`, com entrada, saída, motivo da saída e o **último status observado
naquela sprint**.

`Task.sprintId` permanece, mudando de papel: passa a ser o **ponteiro da participação ativa**,
escrito na mesma transação. Ele garante no banco o invariante "no máximo uma sprint ativa por
tarefa" e preserva as consultas e o contrato de tarefas existentes.

**Dualidade assumida.** `SprintTask` é a fonte de verdade do histórico; `Task.sprintId` é
derivado. Isso é duplicação deliberada, e o risco é a deriva entre os dois. Mitigação: os
dois só são escritos pelo mesmo plano, dentro da mesma transação, e há teste de invariante
que compara participação ativa com ponteiro.

**Alternativa rejeitada.** Eliminar `Task.sprintId` e derivar tudo de `SprintTask` seria mais
puro, mas custaria o invariante no banco (o MySQL não tem índice único parcial, então "uma
ativa por tarefa" viraria regra apenas de aplicação) e quebraria o payload de todos os
endpoints de tarefa.

### D02 — Marco pertence a uma sprint (supersede ADR-009 §7)

> **Revertida pelo [ADR-011](ADR-011-MILESTONE-SPRINT-INVERSION.md) D01.** O marco agrupa
> sprints; o vínculo é declarado por `Sprint.milestoneId`.


`Milestone.sprintId` é obrigatório, com FK `onDelete: Restrict`. A conclusão de um marco fica
ancorada no período de desenvolvimento que a produziu; sem esse vínculo o cronograma não
consegue dizer em qual sprint o marco foi planejado nem validar consistência temporal.

### D03 — Sprints do mesmo projeto não se sobrepõem (supersede ADR-009 §4)

Sprints são sequenciais. A janela é **semiaberta `[startDate, endDate)`**: a sprint seguinte
pode começar exatamente no instante em que a anterior termina, e nunca antes.

Consequência: duração zero deixa de ser aceita, e `durationInDays` passa a contar os dias
abrangidos pela janela — de 01/08 00:00 a 14/08 00:00 são 13 dias, não 14, porque o dia 14
pertence à sprint seguinte.

### D04 — Sprint encerrada é registro imutável (supersede ADR-009 §3)

`CONCLUIDA` e `CANCELADA` congelam status, composição e resultado. O escopo não muda em
nenhuma direção — nem acrescenta, nem remove.

O ADR-009 §3 permitia remover para evitar um impasse: `DELETE` exigia sprint vazia e estados
terminais não voltam atrás. O impasse existia porque havia exclusão física. Com a D06 ele
desaparece.

**Como o congelamento funciona.** Ao entrar em estado terminal, cada participação ativa grava
o status que a tarefa tinha ali (`exitStatus`) e o instante do encerramento (`closedAt`), na
mesma transação da transição. Mover a tarefa depois para outra sprint **não toca** a
participação congelada: o vínculo de origem é preservado, mas o registro não é reescrito.

**Limitação conhecida.** Sprints encerradas antes desta migration têm `exitStatus` nulo e
caem no status atual da tarefa. Preencher o snapshot retroativamente carimbaria o passado com
o presente, que é justamente o defeito corrigido.

### D05 — Datas de cronograma preservam o instante exato (supersede ADR-009 §2)

`Sprint.startDate`, `Sprint.endDate` e `Milestone.dueDate` são `DateTime`. `@db.Date` truncava
para a meia-noite UTC, e isso não era arredondamento: era descarte de hora, minuto, segundo e
fuso. `2026-08-14T23:59:59-03:00` era gravado como `2026-08-15T00:00:00Z`, mudando até o dia
percebido pelo usuário.

Armazenamento em UTC; conversão apenas na apresentação. `YYYY-MM-DD` continua aceito na
escrita e significa o início daquele dia em UTC — atalho documentado para quem só tem data,
não normalização de quem informou hora.

### D06 — Sprint não é excluída

Em nenhum estado, e sem soft-delete nesta entrega. O cronograma é registro histórico do
projeto.

A rota `DELETE /sprints/:id` **permanece registrada** e responde `405
SPRINT_DELETE_NOT_SUPPORTED` antes de qualquer leitura ou mutação. Removê-la devolveria `404`,
indistinguível de "sprint não existe". Isso também elimina, por construção, a corrida entre
contar tarefas e apagar a sprint.

### D07 — Iniciar não fecha o escopo (supersede ADR-009 §9 em parte)

`startedAt` é **linha de base**, não trava. Tarefas podem entrar depois do início; o que muda
é que passam a ser sinalizadas (`SprintTask.addedAfterStart`). O ADR-009 chamava isso de
"fechamento do planejamento", termo que se confundia com o encerramento — quem congela é o
estado terminal.

Três conceitos distintos, que o ADR-009 misturava:

| Conceito | Marco | Efeito |
|---|---|---|
| Início da execução | `startedAt` | passa a distinguir inclusão posterior |
| Escopo mutável | — | continua alterável enquanto a sprint não encerra |
| Fechamento imutável | `CONCLUIDA`/`CANCELADA` | congela composição e resultado |

### D08 — Mutação de escopo e de janela é serializada

Leitura, validação, cálculo do delta e escrita acontecem na mesma transação, com as linhas
travadas por `SELECT ... FOR UPDATE`: a do projeto em todo caminho de cronograma, a da sprint para
escopo e status, e a da tarefa quando o plano toca participações de outras sprints. Por que a linha
do projeto entra em todos, e sempre na entrada, é assunto de D17 Regra 3.

**Por que o lock é necessário.** Em MySQL sob REPEATABLE READ, "consultar e depois inserir"
continua sendo corrida: duas criações simultâneas leem o mesmo conjunto e ambas passam, e dois
`PUT` concorrentes calculam deltas sobre o mesmo retrato e aplicam conjuntos incompatíveis.
Atomicidade por item não é semântica de substituição.

**Exceção ao "sem SQL bruto".** O `FOR UPDATE` usa `$queryRaw` com template parametrizado —
não há concatenação de entrada do usuário. É a única forma de tomar lock de linha pelo Prisma.
Registrado aqui para que a exceção seja deliberada.

**Como as camadas convivem.** O repository expõe métodos que travam a linha e chamam uma
função de planejamento entregue pelo service. Prisma não sai do repository, regra de negócio
não sai do service, e as duas rodam na mesma transação.

### D09 — O histórico sobrevive à exclusão da tarefa

`SprintTask.taskId` é opcional com `onDelete: SetNull`, e a participação guarda
`taskTitleSnapshot`. Excluir a tarefa fecha suas participações ativas com
`removalReason: TAREFA_EXCLUIDA` e o status que ela tinha, em vez de apagar o passado das
sprints que a contiveram.

### D10 / D14 — Limite único de 100 tarefas por sprint

Aplicado no `PUT` em lote **e** na associação individual. Dois limites diferentes para a mesma
capacidade deixavam a sprint chegar a um estado que o editor em lote não conseguia representar:
com 101 tarefas, nenhum salvamento do painel passava.

### D11 — A data prevista do marco cai dentro da janela da sprint

> **Revertida pelo [ADR-011](ADR-011-MILESTONE-SPRINT-INVERSION.md) D03.** Um marco que
> atravessa várias sprints não tem uma janela para caber dentro.


Mesma convenção semiaberta: vencer no instante final já pertence à sprint seguinte.

### D12 — Marco de sprint encerrada acompanha a imutabilidade dela

> **Restringida pelo [ADR-011](ADR-011-MILESTONE-SPRINT-INVERSION.md) D04.** Congelado
> continua o que é da sprint: composição e resultado. O marco permanece editável.


Não pode ser editado, concluído, reaberto nem excluído. O período virou registro.

### D13 — `DELETE /sprints/:id` responde 405, e não 404

Ver D06.

### D15 — A janela do cronograma continua sendo dia de calendário, em UTC

`from` é o início do dia pedido; `to` vira o início do dia **seguinte**, exclusivo, para que
filtrar "até 14/08" inclua o dia 14 inteiro.

**Limitação aceita.** A interpretação é UTC, não local. Para UTC−3, um filtro "até 14/08"
recorta em `15/08T00:00Z`, ou seja `14/08 21:00` em Brasília. Aceito explicitamente para não
introduzir fuso por usuário nesta entrega.

### D16 — Vocabulário do 404 unificado entre middleware e service

Recurso endereçado por ID respondia de dois jeitos: o middleware barrava o que pertence a
projeto alheio, o service recusava o ID inexistente, e as duas respostas diferiam em código,
mensagem e até na presença de `code`. O par permitia iterar o ID e mapear o que existe fora do
alcance do ator.

Os dois caminhos passam a construir o 404 pela mesma fábrica
(`shared/errors/resource-not-found.js`), que carrega mensagem, código e exposição por tipo de
recurso.

A **exposição** segue o contrato já publicado de cada recurso: o RF10 promete código estável em
sprint e marco; o contrato do MVP devolve apenas `{ message }` em projeto, requisito e tarefa.
A propriedade de segurança não exige que todos exponham o mesmo — exige que os dois caminhos
do **mesmo recurso** exponham exatamente igual.

### D17 — Locks antes das leituras, em ordem global (completa D08)

D08 exigiu que leitura, validação e escrita rodassem na mesma transação com a linha travada.
Faltava dizer **em que ordem**, e sem isso o `FOR UPDATE` não entregava o que prometia.

**Por que a ordem importa.** Em MySQL/InnoDB sob `REPEATABLE READ`, o *read view* da transação
nasce na **primeira leitura comum** (`SELECT` sem `FOR UPDATE`). Dali em diante toda leitura comum
enxerga aquele retrato — inclusive depois de a transação ter esperado por um lock. A leitura
travada é *current read*: enxerga o último commit e **não** cria read view. Logo, quem lê antes de
travar espera pelo lock e então valida um passado.

**Regra 1.** Dentro de uma transação de cronograma, todos os `FOR UPDATE` vêm **antes** de
qualquer leitura comum. Nenhum dado lido fora da transação decide a escrita: a leitura
pré-transação serve apenas para responder `404` cedo e para descobrir **qual linha travar**.

**Regra 2.** A ordem de aquisição é sempre `Project → Sprint → Task → SprintTask/Milestone`, e
dentro de cada nível em ordem crescente de `id`. É o que impede que duas transações com conjuntos
sobrepostos esperem uma pela outra em ordens opostas.

**O que a regra corrigiu.** A atualização de janela completava o lado não informado com o registro
lido antes da transação: duas atualizações parciais complementares — uma só do início, outra só do
fim — validavam contra o mesmo retrato antigo, e a janela persistida podia terminar invertida. A
transição de status validava a transição antes da transação e escrevia sem reler: cancelar e
iniciar simultaneamente uma sprint `PLANEJADA` passava nas duas checagens, e a segunda escrita
deixava status aberto convivendo com participações já congeladas.

**Regra 3 — todo caminho de cronograma toma o exclusivo do projeto na entrada.** A serialização por
projeto que a checagem de sobreposição exige é feita travando a linha de `Project`, e os quatro
caminhos de escrita — `createWithinProjectLock`, `updateWithinProjectLock`,
`transitionWithinSprintLock` e `mutateScopeWithinSprintLock` — a tomam antes de qualquer outro lock.

**Por que a linha do projeto, e não as sprints dele.** Travar as linhas de `Sprint` do projeto parece
mais contido e evitaria o custo descrito abaixo, mas não serializa a **criação**: num projeto ainda
sem sprint a leitura travada não casa com registro nenhum, os locks de intervalo que ela toma são
compatíveis entre si, e as duas inserções seguintes se bloqueiam mutuamente. Medido: nesse arranjo,
duas criações simultâneas de sprints sobrepostas falham as duas, em vez de uma passar e a outra
receber `409`.

**Por que na entrada, e por que em todos.** Toda mutação de qualquer módulo grava um `AuditEvent` com
`projectId`, e a chave estrangeira dessa coluna pede lock **compartilhado** na linha do projeto no
fim da transação. O projeto entra na ordem de aquisição de todo caminho, queira ele ou não — a única
escolha é se entra no começo ou no fim. Meia adoção é pior que nenhuma: enquanto um caminho pedir o
projeto por último, ele fecha ciclo de espera com os que o pedem primeiro. Medido: com a transição
de status travando o projeto na entrada e a mutação de escopo não, o par deu `ER_LOCK_DEADLOCK` em
25 de 25 execuções. Com os quatro alinhados, os três cruzamentos internos do cronograma — escopo ×
status, escopo × janela e janela × status — rodam limpos, cobertos por teste.

**Consequência sobre o tempo de posse.** O que roda dentro da transação bloqueia o cronograma
daquele projeto. Por isso o congelamento de participações escreve agrupado por status de saída, em
vez de um `UPDATE` por participação: uma sprint no limite de 100 tarefas custaria 100 idas ao banco
com o cronograma parado atrás, perto demais do tempo limite de transação do Prisma.

**Limite conhecido.** A mutação de escopo e a exclusão de tarefa alcançam as mesmas linhas de
`SprintTask` por índices diferentes (`[sprintId, removedAt]` de um lado, `[taskId, removedAt]` do
outro) e fecham ciclo entre si. O comportamento é anterior a esta revisão — medido em `07663ce`,
antes de qualquer lock de projeto existir no caminho de escopo — e a correção mora no módulo de
tarefas. Registrado como `S104-F10`, junto do mapeamento ausente de `P2034`/`P2024` para `409`/`503`.

**Adoção.** Completa: os caminhos de janela, de status, de escopo e de marco tomam os locks antes
das leituras que decidem a escrita, todos começando pela linha do projeto.

### D18 — Mover a janela não empurra para fora um marco que estava dentro

D11 exigia que a data prevista do marco caísse na janela da sprint, mas só na escrita do marco.
A regra valia por um instante: bastava encolher a sprint depois para o marco passar a vencer fora
do período que ele deveria ancorar.

Atualizar a sprint passa a comparar, **dentro da mesma transação e com os marcos travados**, a
janela travada com a janela resultante. Um marco que estava dentro da primeira e ficaria fora da
segunda provoca `409 SPRINT_WINDOW_MILESTONE_CONFLICT`, com o marco nomeado na mensagem.

**Por que o critério é "estava dentro", e não "a janela mudou".** Duas razões, e a segunda é
decisiva.

A primeira é o legado: o backfill da migration `20260816120000_s104_domain_fixes` vinculou à última
sprint do projeto justamente os marcos cuja data **não** caía em nenhuma janela. Por construção,
todo marco atingido por aquele fallback já nasce fora da janela da sprint que o recebeu. Ele nunca
foi invariante dessa sprint, e cobrá-lo agora não conserta nada — só impede qualquer edição.

A segunda é o cliente: `ScheduleScreen.submitSprint` monta o payload com as quatro chaves a cada
salvamento, inclusive num rename. "A janela veio no corpo" não distingue renomear de mudar o
período, e uma condição baseada na presença dos campos nunca seria falsa no uso real — a exceção
existiria só no papel. Comparar valores também não basta: o formulário tem precisão de minuto e a
coluna é `DATETIME(3)`, então um round-trip pode devolver um instante diferente sem que o usuário
tenha mexido na data.

O critério de conjunto — quem estava dentro continua dentro — é imune ao formato do payload e diz
exatamente o que a invariante é.

**A outra ponta.** `create`, `update`, `updateMilestoneStatus` e `delete` de marco travam a sprint —
as duas, quando a atualização move o marco de uma para outra, em ordem crescente de `id` — e
revalidam estado e janela sobre o registro relido. Uma mutação de marco não confirma mais depois que
outra requisição encerrou a sprint, e uma redução de janela não deixa passar o marco que a criação
concorrente estava gravando.

A guarda anti-oráculo de `ensureMilestoneSprint` continua **fora** da transação: ela faz I/O de
autorização, e prolongar o lock do cronograma por isso trocaria um defeito por outro. Dentro do lock
ficam apenas as invariantes de domínio.

Se o marco mudar de sprint entre a leitura que escolhe qual linha travar e o lock, a operação é
recusada com `409 MILESTONE_SPRINT_CHANGED`: travamos a sprint errada, e decidir sobre uma sprint
que já não é a dele seria pior do que pedir nova tentativa.

## Consequências

### Positivas

- O RF35 deixa de depender de registros mutáveis: o resultado de uma sprint encerrada não muda
  quando a tarefa é concluída, movida ou excluída depois.
- A consulta de evolução troca a varredura de `TaskHistoryEntry` por duas leituras indexadas.
- Um caminho único de escrita para painel, `PATCH /tasks/:id/sprint` e `DELETE /tasks/:id/sprint`
  impede que os três divirjam no histórico.
- A trilha de auditoria continua distinguindo qual operação o usuário pediu.

### Negativas

- `Task.sprintId` e `SprintTask` guardam a mesma informação sob pontos de vista diferentes, e
  a coerência depende de disciplina de escrita (mitigada por transação única e teste de
  invariante).
- O lock por linha serializa as escritas de cronograma de um projeto. É o preço da
  consistência; o escopo do lock é o projeto, não a instalação.
- Sprints encerradas antes da migration não têm snapshot (ver D04).
- `durationInDays` mudou de valor para as mesmas datas (ver D03), o que altera um número já
  exibido.

## Impactos de segurança e privacidade

**Segurança.** O ganho principal é a D16: o par de 404 deixou de ser oráculo de enumeração. A
disciplina anti-oráculo já existente nos endpoints que recebem ID no corpo foi mantida — quem
não enxerga o outro projeto recebe exatamente a resposta de um ID inexistente. O `FOR UPDATE`
via `$queryRaw` é parametrizado e não recebe entrada do usuário.

**Privacidade.** `SprintTask` não introduz categoria nova de dado pessoal: guarda `taskId`,
título da tarefa e status. O snapshot de título **sobrevive à exclusão da tarefa**, e isso é
retenção de dado de projeto — não de dado pessoal —, mas precisa entrar na política de
retenção com prazo definido, em vez de retenção indefinida por omissão. Registrado no backlog
técnico. O DTO do cronograma continua expondo `responsibleUserId` e nunca e-mail, e a métrica
segue sem recorte por responsável (seção 14.3 do documento de arquitetura).

## Rastreabilidade

- Cartão: S1-04 (RF10 e RF35).
- Supersede: ADR-009, decisões 1, 2, 3, 4, 7 e 9.
- Contratos: `docs/api/API_CONTRACTS.md`.
- Autorização: `docs/security/AUTHORIZATION_MATRIX.md`.
- Plano de correção: `docs/issues/PR12_S104_PROMPT_CORRECOES.md`.
- Pendências: `S104-F01`, `S104-F02`, `S104-F03`, `S104-F06` e `S104-F07` em
  `docs/issues/TECHNICAL_BACKLOG.md`.
