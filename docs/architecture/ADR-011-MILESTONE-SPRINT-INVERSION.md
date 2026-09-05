# ADR-011 — Marco agrupa sprints, e não o contrário

- **Estado:** aceita (RF10 e RF35), revisando a entrega do S1-04
- **Data:** 23/08/2026
- **Responsáveis:** equipe TraceFlow
- **Supersede:** decisões D02 e D11 do [ADR-010](ADR-010-SPRINT-DOMAIN-CORRECTIONS.md), e a parte de D12 que congela o marco junto com a sprint

## Contexto

O ADR-010 D02 fixou `Milestone.sprintId` obrigatório: todo marco pertencia a **uma** sprint, e
D11 exigia que `dueDate` caísse dentro da janela dela. A justificativa era ancorar a conclusão
do marco no período de desenvolvimento que a produziu.

O desenho de produto que motiva esta entrega descreve o oposto, e descreve algo que o modelo
anterior não conseguia representar: **um marco é uma entrega de médio prazo que atravessa
várias sprints**, com prazo próprio, e é dado por concluído quando todas as sprints que o
produzem terminam. "Gestão de sprints" não é um marco da Sprint 4 — é um marco que a Sprint 3,
a Sprint 4 e a Sprint 5 entregam juntas.

Com D02 isso era inexprimível. Para representar um marco que atravessa três sprints era preciso
criar três marcos homônimos, um por sprint, e nenhum deles respondia "a entrega ficou pronta?".
O agrupamento existia na cabeça de quem lia o cronograma e em lugar nenhum no sistema.

## Decisões

### D01 — A cardinalidade inverte

`Milestone.sprintId` sai. Entra `Sprint.milestoneId`, com FK `onDelete: SetNull`. Um marco tem
N sprints; uma sprint pertence a no máximo um marco.

**Quem protege o agrupamento é a aplicação, não a FK.** `DELETE /milestones/:id` recusa com
`409 MILESTONE_HAS_SPRINTS` enquanto houver sprint apontando para o marco, e a contagem que
decide isso é lida **sob o lock do projeto**, na mesma transação da exclusão — não há janela
entre verificar e apagar.

`Restrict` seria a defesa em profundidade óbvia, e foi descartado por um motivo concreto:
`Sprint` e `Milestone` são os **dois** filhos de `Project` em cascata, e o InnoDB não garante em
que ordem processa FKs irmãs. Com `Restrict`, apagar um projeto falharia toda vez que o banco
processasse `Milestone` antes de `Sprint` — quebrando uma operação legítima e sem relação com o
agrupamento. Trocar um risco improvável (alguém apagar marco por fora do serviço) por uma falha
provável em exclusão de projeto seria o negócio errado. A FK responde pelo que só ela pode
responder: não deixar `milestoneId` apontando para uma linha que sumiu.

### D02 — `milestoneId` é nulo no banco e obrigatório na criação

O banco aceita nulo porque **sprints anteriores a esta migration podem não ter marco**, e porque
a migration não deve inventar um vínculo que ninguém declarou. `POST /projects/:id/sprints`
exige `milestoneId`; `PUT /sprints/:id` aceita alterá-lo, inclusive para `null`.

A assimetria é deliberada e é a mesma escolha que D05 do ADR-010 fez com datas: o banco guarda
o que existe, a regra vive onde a regra é aplicada.

### D03 — O prazo do marco é independente da janela de qualquer sprint (supersede D11)

`ensureMilestoneWithinSprint` e `ensureMilestonesStayWithinWindow` deixam de existir. Um marco
que atravessa três sprints não tem uma janela para caber dentro: o prazo dele é do projeto, não
do período.

Consequência direta: alterar a janela de uma sprint não pode mais empurrar marco nenhum para
fora, então `SPRINT_WINDOW_MILESTONE_CONFLICT` sai do vocabulário, junto com
`MILESTONE_DUE_DATE_OUTSIDE_SPRINT`, `MILESTONE_SPRINT_REQUIRED`, `MILESTONE_SPRINT_CHANGED` e
`MILESTONE_SPRINT_PROJECT_MISMATCH`.

### D04 — Marco não congela junto com a sprint (supersede D12 em parte)

D12 tornava um marco imutável assim que a sprint dona encerrava. Com um marco atravessando
várias sprints, "a sprint dona" não existe: encerrar a Sprint 3 travaria a edição de um marco
que a Sprint 5 ainda vai entregar.

Marco passa a ser editável enquanto o projeto existir. O que continua congelado é o que D04 do
ADR-010 congelou: a **composição e o resultado da sprint encerrada**, que é onde mora o registro
histórico do RF35. Um marco é planejamento, não registro de período.

### D05 — Conclusão automática, e o que a sprint cancelada faz nela

Ao concluir uma sprint, o marco dela é concluído **na mesma transação** quando: existe ao menos
uma sprint não cancelada apontando para o marco, e todas as sprints não canceladas estão
`CONCLUIDA`.

`CANCELADA` não bloqueia e não conclui sozinha. Bloquear seria trancar o marco para sempre por
causa de uma sprint que o projeto decidiu não fazer; deixar concluir sozinha diria "entregue"
sobre um marco cujo trabalho inteiro foi cancelado.

A conclusão manual (`PATCH /milestones/:id/status`) permanece: um marco pode ser dado por
entregue por decisão de quem gerencia, e pode ser reaberto. A automação antecipa o caso comum,
não retira a decisão.

**Nota derivada, não persistida.** A interface exibe "concluído automaticamente" quando o marco
está `CONCLUIDO` **e** a regra acima se satisfaz. Não há coluna para distinguir automático de
manual: ela só poderia divergir do fato que já está no banco.

### D06 — Só uma sprint `EM_ANDAMENTO` por projeto

`PLANEJADA → EM_ANDAMENTO` recusa com `409 SPRINT_ALREADY_ACTIVE` quando já existe outra sprint
`EM_ANDAMENTO` no projeto.

A verificação lê as sprints do projeto **depois** do `lockProject`, pela Regra 1 de D17: ler
antes de travar deixaria duas requisições partirem do mesmo retrato e ambas passarem.

Isso não é redundante com a não sobreposição de datas (D03 do ADR-010). Datas descrevem o
planejado; `EM_ANDAMENTO` descreve o que a equipe está fazendo agora, e nada impedia iniciar uma
sprint cujo período ainda não chegou enquanto a anterior seguia aberta.

### D07 — Conclusão transfere pendências à próxima Sprint planejada

> **Revisada por decisão explícita de produto em PLANNING-QA-FIX-02, 04/09/2026.**
> O retorno incondicional ao backlog foi substituído pelo carry-over automático na conclusão.

Ao entrar em `CONCLUIDA`, Tasks atualmente associadas à origem e diferentes de `CONCLUIDO`
seguem para a Sprint `PLANEJADA` válida do mesmo projeto com menor início posterior ao período
da origem (inclusive início igual ao fim semiaberto); empate usa menor ID. Sem destino, retornam
ao backlog. O sistema não cria Sprint. Tasks concluídas permanecem associadas à origem e
participações já removidas não retornam. `CANCELADA` mantém o retorno ao backlog.

A origem congela antes da transferência, na mesma transação. Seu `SprintTask`, baseline,
pontos, status, conclusão e corte permanecem intactos. O plano canônico de associação cria ou
reativa o membership do destino e atualiza `Task.sprintId`; a Task será planejada normalmente
quando o destino iniciar. Histórico `SPRINT` registra origem → destino, com o ator do fechamento.
O limite existente de 100 Tasks continua válido: destino sem capacidade causa rollback integral,
sem escolher silenciosamente outra Sprint. Fechamento concorrente/repetido não duplica eventos.

O caminho de status trava `Project → Sprints do projeto em ordem de ID → Tasks atuais da origem
em ordem de ID → Marco`, antes das leituras que decidem a escrita. O lock do projeto continua
serializando criações, alterações de janela, escopo e status. A persistência do plano de escopo
é compartilhada; seleção de destino e orquestração pertencem ao service.

Cards, evolução e painel de Sprints do Marco consomem a mesma projeção `historicalSummary` do
backend para terminais; campos Task correntes continuam disponíveis para o contexto operacional.
A distinção está documentada no [modelo histórico](../data/PLANNING_HISTORY.md).

## Migration e perda de informação

`20260823120000_adr011_invert_milestone_sprint` cria a coluna, faz o backfill e derruba o lado
antigo. O backfill dá a cada sprint o marco de **menor `dueDate`** entre os seus, com empate
decidido pelo menor `id` — a ordem não pode depender da ordem física das linhas.

**Uma sprint podia ter vários marcos, e no novo modelo aponta para um.** Os demais não são
apagados: viram marcos sem sprint, estado válido aqui. Isso é perda de vínculo, e é irreversível.

`npm run adr011:audit` (somente leitura) lista nominalmente cada sprint afetada e qual marco será
escolhido, e sai com código 1 quando há perda — para que encadear com `&&` pare antes da
migration de quem não leu o relatório.

## Consequências

- O Kanban passa a exibir "Marco" no cartão e no painel de andamento sem uma junção artificial.
- A aba Marcos ganha progresso real (`X de Y sprints concluídas`) e os badges de cada sprint.
- `schedule.service` deixa de expor `milestones[].sprintId` e passa a expor `sprints[].milestoneId`.
- `updateWithinProjectLock` perde a revalidação de janela de marco; a ordem de locks
  `Project → Sprint → Task → Milestone` de D17 Regra 2 permanece válida sem alteração.
- Excluir um marco por fora do serviço (SQL direto) desvincula as sprints em vez de falhar. É o
  preço declarado de D01, e a única forma de perceber é o cronograma passar a mostrar
  "Sem marco" nas sprints afetadas.
- Voltar atrás exige decidir, para cada marco com várias sprints, qual sprint fica com ele — o
  que a migration inversa não tem como saber.
