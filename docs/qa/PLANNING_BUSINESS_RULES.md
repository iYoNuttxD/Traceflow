# TRACEFLOW — PLANNING BUSINESS RULES
## Registro canônico para QA integrado de Sprints, Marcos, Cronograma, Kanban e Tasks

Status: BASE DE VALIDAÇÃO PARA QA

Este documento registra as regras de negócio e contratos comportamentais que devem ser validados antes da aprovação da área de Planning.

O QA não deve validar apenas a aparência das telas. Cada regra abaixo deve receber evidência funcional, automatizada, de API ou renderizada conforme aplicável.

---

# BR-GLOBAL — INVARIANTS TRANSVERSAIS

## BR-GLOBAL-001 — Backend é autoridade de autorização

A interface pode esconder ou desabilitar ações, mas a autorização real pertence ao backend.

Acesso direto por API não pode contornar:

- membership;
- papel;
- projectId;
- taskId;
- sprintId;
- milestoneId;
- commentId;
- demais relações project-scoped.

---

## BR-GLOBAL-002 — OWNER não é administrador global

OWNER representa exclusivamente um papel dentro de um projeto.

Nunca interpretar OWNER como administrador da plataforma.

---

## BR-GLOBAL-003 — Isolamento entre projetos

Uma entidade pertencente ao Projeto A não pode:

- ser consultada;
- alterada;
- vinculada;
- removida;
- movimentada

através do contexto do Projeto B.

---

## BR-GLOBAL-004 — Current context wins

Resposta assíncrona de um contexto anterior não pode alterar um contexto mais recente.

Exemplo:

Project A request
→ usuário navega para Project B
→ resposta de A chega
→ resposta deve ser ignorada.

Aplicável também a:

- Tasks;
- Sprints;
- Marcos;
- searches;
- autocomplete;
- histórico;
- rastreabilidade.

---

## BR-GLOBAL-005 — Mutation success != reconciliation success

Quando uma mutation foi confirmada pelo backend:

mutation success
→ operação concluída.

Se um GET/reconciliation posterior falhar:

→ não reclassificar a mutation como falha.

A UI deve refletir o estado realmente persistido.

---

# BR-TASK — TAREFAS

## BR-TASK-001 — Status canônicos do Kanban

O Kanban trabalha somente com os status existentes no domínio:

- A Fazer;
- Em Andamento;
- Concluído.

Nenhum status adicional deve ser inventado pela UI.

---

## BR-TASK-002 — Status no Kanban é controlado pela movimentação do card

No contexto do Kanban, alteração de status ocorre pela movimentação da Task entre as colunas.

Task Details exibe o status como informação read-only.

Não deve existir select de status dentro do Task Details do Kanban.

---

## BR-TASK-003 — Task pode estar sem Sprint

Uma Task pode existir sem associação a Sprint.

A interface deve representar explicitamente:

Sem Sprint

quando necessário.

---

## BR-TASK-004 — Task pertence no máximo a uma Sprint por vez

Quando uma Task é associada a outra Sprint conforme contrato vigente:

Sprint A
→ Task

associar à Sprint B
→ Task passa para Sprint B.

Não manter simultaneamente a mesma Task em múltiplas Sprints.

---

## BR-TASK-005 — Deadline de Task é próprio

Uma Task só possui prazo quando existe seu próprio campo de deadline/prazo.

Não inferir prazo da Task a partir de:

- fim da Sprint;
- prazo do Marco.

---

## BR-TASK-006 — Task atrasada

Uma Task é atrasada somente quando:

deadline próprio existe
AND
deadline já passou
AND
status não é terminal/concluído.

Uma Task sem deadline nunca deve aparecer como atrasada.

---

## BR-TASK-007 — Task concluída não é atrasada

Mesmo que seu deadline esteja no passado:

Task concluída
→ não entra na contagem de atrasos.

---

## BR-TASK-008 — Edição da Task

Task Details possui um único modo:

Editar tarefa

Esse modo reúne:

- campos editáveis da Task;
- edição de rastreabilidade.

Status permanece read-only.

---

## BR-TASK-009 — Estado de edição é efêmero e task-scoped

Estado de edição pertence somente à Task atualmente aberta.

Ao:

- cancelar;
- fechar;
- confirmar descarte;
- trocar taskId;
- reabrir a mesma Task;

o editor deve reinicializar usando os dados canônicos.

Draft da Task A nunca pode aparecer na Task B.

---

## BR-TASK-010 — Dirty state

Dirty state deve considerar tanto:

- alterações dos campos da Task;
- alterações de rastreabilidade.

Fechar com mudanças não salvas exige comportamento de descarte coerente.

---

# BR-SPRINT — SPRINTS

## BR-SPRINT-001 — Estados da Sprint

Usar exclusivamente os estados reais:

- Planejada;
- Em andamento;
- Concluída;
- Cancelada.

---

## BR-SPRINT-002 — Nova Sprint começa planejada

Uma Sprint recém-criada entra no estado de planejamento definido pelo domínio.

Não iniciar automaticamente.

---

## BR-SPRINT-003 — Uma única Sprint em andamento

Um projeto não pode possuir duas Sprints simultaneamente em andamento.

Tentar iniciar uma segunda Sprint enquanto outra está em andamento deve ser bloqueado conforme contrato backend.

---

## BR-SPRINT-004 — Intervalos de Sprint não podem se sobrepor

As datas de Sprints do mesmo contexto devem respeitar a regra vigente de não sobreposição.

A regra atual considera o fim como exclusivo quando aplicável, permitindo:

Sprint A termina em T
Sprint B começa exatamente em T.

---

## BR-SPRINT-005 — Sprint é intervalo temporal

Sprint possui:

início
→ fim.

No Cronograma ela deve ser representada como intervalo.

---

## BR-SPRINT-006 — Planejamento é congelado quando a Sprint inicia

Ao iniciar uma Sprint:

→ o planejamento daquele instante é registrado.

Esse snapshot representa o escopo originalmente planejado.

---

## BR-SPRINT-007 — Escopo planejado

As Tasks que estavam associadas à Sprint quando o planejamento foi fechado pertencem ao:

Escopo planejado.

---

## BR-SPRINT-008 — Task adicionada posteriormente

Task adicionada após o fechamento do planejamento deve ser distinguível de uma Task originalmente planejada quando os dados históricos suportarem essa informação.

---

## BR-SPRINT-009 — Task removida não apaga o histórico planejado

Se uma Task fazia parte do planejamento inicial e posteriormente saiu da Sprint:

→ ela continua pertencendo ao registro histórico do planejamento.

Não reescrever retroativamente o escopo inicial.

---

## BR-SPRINT-010 — Sprint terminal congela composição

Sprint Concluída ou Cancelada possui composição histórica congelada conforme regra atual.

Tasks e associações protegidas pelo domínio não podem ser alteradas como se a Sprint ainda estivesse planejada.

---

## BR-SPRINT-011 — Sprint terminal não muda de Marco

Uma Sprint concluída/cancelada não pode ser transferida de Marco quando o domínio a considera congelada.

---

## BR-SPRINT-012 — Progresso da Sprint

O progresso deve utilizar a fórmula canônica já implementada baseada nos pontos/tarefas do domínio.

A QA deve confirmar que:

- zero total não gera NaN;
- progresso parcial é calculado corretamente;
- conclusão chega ao valor esperado.

Não criar uma segunda fórmula somente para a UI.

---

## BR-SPRINT-013 — Evolução histórica

A evolução deve preservar:

- total de Tasks;
- pontos;
- progresso;
- escopo planejado;
- escopo no encerramento;
- burndown;
- mudanças de escopo quando suportadas.

---

## BR-SPRINT-014 — Encerramento congela evolução

Depois que a Sprint é encerrada:

→ os indicadores históricos representam o estado do encerramento.

Não recalcular retroativamente o resultado histórico como se a Sprint ainda estivesse aberta.

---

## BR-SPRINT-015 — Reabertura e exclusão

Sprints podem ser excluídas logicamente em qualquer estado. A exclusão remove a Sprint das
visões atuais, preserva participação, snapshots e histórico, e devolve ao backlog as Tasks cujo
ponteiro atual ainda aponta para ela. Excluir não conclui a Sprint nem executa carry-over.
Reabertura continua não suportada; nenhuma ação de reabrir deve ser inventada pela UI.

Decisão explícita de produto: PLANNING-QA-FIX-03 (04/09/2026), substituindo a restrição de exclusão anterior.

---

## BR-SPRINT-016 — Carry-over automático

Ao concluir uma Sprint, Tasks não concluídas atualmente associadas a ela seguem automaticamente
para a próxima Sprint PLANEJADA válida do mesmo projeto. Próxima significa menor início válido
posterior ou contíguo ao fim da origem, respeitando a fronteira semiaberta vigente; empate usa
menor ID. Fechamento, snapshot, transferência e histórico formam uma operação consistente.

---

## BR-SPRINT-017 — Fallback sem próxima Sprint

Se nenhuma próxima Sprint PLANEJADA válida existir, Tasks pendentes retornam ao backlog.
O sistema não cria Sprint automaticamente.

---

## BR-SPRINT-018 — Tasks concluídas não entram no carry-over

Task concluída no encerramento permanece na Sprint encerrada e não é transferida como
pendência para a próxima Sprint.

---

## BR-SPRINT-019 — Carry-over preserva histórico

Transferir a associação atual não altera nem apaga escopo planejado, escopo no encerramento,
participação histórica, pontos, burndown, cutoff ou scopeChange da Sprint encerrada.

---

## BR-SPRINT-020 — Marco opcional

Sprint pode ser criada sem Marco, com `milestoneId` omitido ou nulo. Associar ou desvincular
Marco é permitido enquanto a Sprint está aberta; composição terminal continua protegida.
Início, encerramento, carry-over e Cronograma independem da existência de Marco.

---

# BR-MILESTONE — MARCOS

## BR-MILESTONE-001 — Marco é ponto temporal

Marco não representa período.

O campo temporal canônico é:

dueDate / prazo.

Não adicionar startDate.

---

## BR-MILESTONE-002 — Período coberto é derivado

Quando houver Sprints vinculadas, a UI pode derivar:

menor início das Sprints
→ maior término das Sprints.

Isso é somente:

Período coberto.

Não é início/fim persistido do Marco.

---

## BR-MILESTONE-003 — Marco não possui evento de início

Cronograma não deve criar:

Início do Marco.

O único evento temporal do Marco é seu prazo/dueDate.

---

## BR-MILESTONE-004 — Progresso do Marco

Progresso representa:

Sprints concluídas
÷
Sprints vinculadas consideradas válidas pelo domínio.

Sprints canceladas devem seguir a regra canônica implementada e não distorcer a porcentagem.

---

## BR-MILESTONE-005 — Marco sem Sprint

Marco com zero Sprints:

→ progresso neutro.

Nunca:

NaN
ou
100% artificial.

---

## BR-MILESTONE-006 — Conclusão automática

Quando a regra vigente determina que todas as Sprints necessárias foram concluídas:

→ o Marco é concluído automaticamente.

Não adicionar botão manual “Concluir Marco” se o domínio não possui essa ação.

---

## BR-MILESTONE-007 — Marco atrasado

Marco é atrasado quando:

dueDate passou
AND
Marco não está concluído.

---

## BR-MILESTONE-008 — Atenção não é regra de domínio

Não existe threshold canônico do tipo:

“faltam X dias → atenção”.

Não inventar esse estado.

---

## BR-MILESTONE-009 — Sprint aberta pode mudar de Marco

Quando permitido pelo contrato atual:

Sprint aberta associada ao Marco A
→ selecionar no Marco B
→ associação é movida.

---

## BR-MILESTONE-010 — Sprint terminal congelada

Sprint Concluída/Cancelada que não pode mudar de Marco deve aparecer desabilitada no selector.

---

## BR-MILESTONE-011 — Reabrir Marco

Reabrir Marco somente deve existir se o contrato atual suportar.

---

## BR-MILESTONE-012 — Associação múltipla não é atomicamente garantida

A API atual de Marco + múltiplas Sprints não possui mutation atômica única.

Se algumas associações forem salvas e outra falhar:

→ UI deve refletir partial success real.

Nunca afirmar que nada foi salvo.

---

## BR-MILESTONE-013 — Exclusão segura de Marco

Excluir Marco é exclusão lógica, inclusive quando concluído. Não exclui nem desvincula Sprints,
Tasks ou histórico. O Marco sai das visões e seletores atuais; referências existentes mantêm
sua identidade e indicam “Excluído”.

---

# BR-SCHEDULE — CRONOGRAMA

## BR-SCHEDULE-001 — Modelo temporal

Cronograma usa:

Sprint
→ intervalo.

Marco
→ ponto no dueDate.

Task
→ deadline próprio.

---

## BR-SCHEDULE-002 — Evento do dia != contexto do dia

Evento do dia é algo que ocorre exatamente naquela data.

Contexto do dia representa entidades ativas naquele período.

Esses conceitos não devem ser misturados.

---

## BR-SCHEDULE-003 — Eventos de Sprint

Eventos exatos:

- início da Sprint;
- encerramento da Sprint.

A Sprint também pode aparecer como contexto ativo nos dias entre início e fim.

---

## BR-SCHEDULE-004 — Evento de Marco

Somente:

prazo do Marco.

Nunca:

início derivado do Marco.

---

## BR-SCHEDULE-005 — Evento de Task

Uma Task aparece como evento somente em seu próprio deadline.

Task pertencente à Sprint ativa não deve aparecer como evento em todos os dias da Sprint.

---

## BR-SCHEDULE-006 — Resumo mensal conta entidades

Exemplo:

1 Sprint
1 Marco
3 Tasks.

Não contar:

início + fim da Sprint
como duas Sprints.

---

## BR-SCHEDULE-007 — Sprint atual

Resumo atual deve utilizar a regra canônica de Sprint em andamento.

Não inventar uma Sprint “atual” apenas porque a data está dentro de seu intervalo se o domínio possui status explícito.

---

## BR-SCHEDULE-008 — Próximo Marco

Representa o Marco relevante não concluído com próximo prazo de acordo com a regra temporal atual.

---

## BR-SCHEDULE-009 — Prazos atrasados

Contagem de atraso utiliza somente entidades realmente vencidas.

Task sem deadline próprio não entra.

---

## BR-SCHEDULE-010 — Próximos prazos

Inclui:

- deadlines futuros de Tasks;
- dueDates futuros de Marcos;
- encerramentos futuros de Sprints.

Não inclui:

- início de Marco;
- Sprint start como “prazo”;
- itens já atrasados.

---

## BR-SCHEDULE-011 — Ordenação

Próximos prazos devem estar em ordem cronológica crescente.

---

## BR-SCHEDULE-012 — Navegação mensal latest-wins

Se usuário navegar rapidamente:

Setembro
→ Outubro

e Setembro responder depois:

→ Outubro continua sendo autoridade.

---

## BR-SCHEDULE-013 — Sprint atual da Task

Quando a UI apresenta a Sprint atual de uma Task, a associação canônica é `Task.sprintId`.
Membership histórico não pode ser apresentado como associação atual. `null` representa
Task sem Sprint; o nome da Sprint atual é resolvido pelo ID, independentemente da ordem histórica.

---

# BR-KANBAN — QUADRO

## BR-KANBAN-001 — Três etapas

O Kanban possui exclusivamente:

A Fazer
→ Em Andamento
→ Concluído.

---

## BR-KANBAN-002 — Status pelo movimento

No contexto Kanban, status é alterado ao mover o card entre colunas.

Task Details não possui select de status.

---

## BR-KANBAN-003 — DnD persistente

Movimentação visual precisa executar a mutation correspondente no backend.

Não é apenas alteração local.

---

## BR-KANBAN-004 — Mutation falhou

Se mudança de status falhar:

→ card precisa retornar para estado coerente com backend.

---

## BR-KANBAN-005 — Conflict/reconciliation

Conflito de estado, incluindo resposta equivalente a 409:

→ deve reconciliar o board com o estado canônico.

---

## BR-KANBAN-006 — Kanban não possui polling

Nenhum GET periódico baseado em tempo.

---

## BR-KANBAN-007 — Kanban não utiliza SSE nesta etapa

Realtime do Kanban está explicitamente fora do escopo atual.

---

## BR-KANBAN-008 — Recorte por Sprint

Selecionar Sprint altera o universo de Tasks exibidas.

Projeto inteiro:

→ todas as Tasks acessíveis ao recorte.

Sprint X:

→ Tasks pertencentes à Sprint X.

---

## BR-KANBAN-009 — Summary segue o recorte de Sprint

As métricas gerais representam o universo da Sprint selecionada / projeto inteiro.

---

## BR-KANBAN-010 — Filtros secundários não reescrevem o summary

Pesquisa, responsável, prioridade e prazo refinam o board visível.

O resumo geral continua representando o recorte de Sprint.

---

## BR-KANBAN-011 — Contagens das colunas

As contagens de:

- A Fazer;
- Em Andamento;
- Concluído

representam as Tasks atualmente visíveis depois dos filtros secundários.

---

## BR-KANBAN-012 — Métricas transversais

Resumo pode apresentar:

- Total;
- Alta prioridade;
- Atrasadas;
- Sem rastreabilidade;
- Sprint visualizada.

Não duplicar necessariamente as métricas já presentes nas colunas.

---

## BR-KANBAN-013 — Card abre Task Details

Clique normal no corpo:

→ Task Details.

Drag:

→ movimentação.

Um drop não pode abrir Task Details acidentalmente.

---

## BR-KANBAN-014 — Histórico é individual

Histórico global foi removido do Kanban.

Cada Task possui seu próprio histórico.

---

## BR-KANBAN-015 — Quadro congelado no encerramento

O recorte de Sprint terminal contém todas as Tasks associadas no encerramento, nas colunas
dos status observados naquele instante. Exclui removidas antes do fechamento e inclui adições
posteriores ao planejamento ainda presentes. Cards e detalhes usam somente campos históricos
conhecidos, sem edição ou DnD. Snapshot legado ausente deve ser sinalizado explicitamente.

---

## BR-KANBAN-016 — Continuidade não reescreve o quadro histórico

Carry-over e alterações atuais de status, esforço ou demais campos da Task não alteram o
Kanban congelado da Sprint anterior. Projeto inteiro e Sprint aberta continuam operacionais,
sem duplicar participações históricas como Tasks atuais.

---

# BR-HISTORY — HISTÓRICO DA TASK

## BR-HISTORY-001 — Histórico pertence à Task

Abrir histórico a partir do card:

→ mostrar apenas eventos daquela Task.

---

## BR-HISTORY-002 — Histórico registra mudanças reais

Usar os tipos de alteração suportados pelo domínio, como:

- status;
- Sprint;
- responsável;
- demais campos auditados.

---

## BR-HISTORY-003 — Ordem temporal

Eventos devem ser apresentados de forma consistente com a ordenação definida pela API.

---

## BR-HISTORY-004 — Actor

Exibir somente identificação realmente fornecida pelo contrato.

Não inventar ator.

---

## BR-HISTORY-005 — Filtros

Filtros de data/campo devem restringir apenas o histórico da Task corrente.

---

# BR-TRACE — RASTREABILIDADE

## BR-TRACE-001 — Tipos de vínculo

Task suporta os vínculos reais atuais:

- Requisito;
- Pull Request;
- Commits;
- Issues.

---

## BR-TRACE-002 — Requirement

Preservar cardinalidade vigente definida pelo domínio.

Não permitir múltiplos vínculos se o contrato for singular.

---

## BR-TRACE-003 — Pull Request

Preservar cardinalidade vigente:

Task
→ no máximo um PR quando esse for o contrato atual.

Um PR pode estar relacionado a múltiplas Tasks conforme modelo existente.

---

## BR-TRACE-004 — Commits

Task pode possuir múltiplos commits vinculados.

---

## BR-TRACE-005 — Issues

Task pode possuir múltiplas issues vinculadas quando suportado pelo contrato.

---

## BR-TRACE-006 — Editar tarefa inclui rastreabilidade

No Task Details:

Editar tarefa

engloba:

- dados editáveis da Task;
- vínculos de rastreabilidade.

Não existe uma ação separada “Editar rastreabilidade”.

---

## BR-TRACE-007 — Edição independente não implica transação única

Se atualizar Task e vínculos utiliza múltiplas mutations:

→ cada sucesso permanece sucesso.

Partial failure precisa ser refletido honestamente.

---

## BR-TRACE-008 — Busca dinâmica

Associações de Requirement, PR, Commit e Issue utilizam os mecanismos de busca atuais.

Resposta stale não pode substituir resultado de uma busca mais recente.

---

## BR-TRACE-009 — Rastreabilidade é project-scoped

Não pode vincular artefato pertencente a outro projeto/repositório não autorizado.

---

# BR-COMMIT-SUG — SUGESTÕES DE COMMITS

## BR-COMMIT-SUG-001 — Task precisa existir

Sugestão automática depende de Task persistida e identificador disponível.

Antes de salvar uma nova Task:

→ sugestões não são executáveis.

---

## BR-COMMIT-SUG-002 — Fonte das sugestões

Somente commits já importados/sincronizados para o projeto são analisados.

Não buscar diretamente novos commits no GitHub nessa operação.

---

## BR-COMMIT-SUG-003 — Regra de referência

O mecanismo analisa a mensagem do commit procurando a referência canônica da Task.

Exemplo vigente:

[TASK-42]

A QA deve confirmar o parser real implementado.

---

## BR-COMMIT-SUG-004 — Sugestão não cria vínculo

Encontrar uma referência:

→ cria/apresenta sugestão.

Não vincular commit automaticamente à Task.

---

## BR-COMMIT-SUG-005 — Usuário decide

Sugestão pode ser:

- confirmada;
- rejeitada;

de acordo com capabilities/autorização.

---

## BR-COMMIT-SUG-006 — Single-flight

Clicar repetidamente em:

Sugerir commits

durante processamento não pode criar múltiplas execuções simultâneas.

---

## BR-COMMIT-SUG-007 — Resultado stale

Resultado de uma análise antiga não pode sobrescrever contexto mais recente ou outra Task.

---

## BR-COMMIT-SUG-008 — Feedback é funcional, não técnico

Interface comunica:

- sugestões encontradas;
- nenhuma sugestão;
- referências que não geraram nova sugestão quando relevante.

Não precisa expor ao usuário estatísticas internas como:

187 commits analisados
1 referência detectada
0 sugestões criadas
1 ignorada.

---

# BR-COMMENTS — INTEGRAÇÃO COM COMMENTS

Estas regras não nasceram no redesign de Planning, mas são dependência crítica do Task Details e não podem regredir.

## BR-COMMENTS-001 — Histórico completo

Todos os comentários continuam acessíveis.

Paginação não pode limitar funcionalmente a conversa.

---

## BR-COMMENTS-002 — Cursor pagination

Histórico utiliza cursor estável e mantém:

- sem gaps;
- sem duplicates;
- tombstones.

---

## BR-COMMENTS-003 — SSE Comments

Comments continuam recebendo:

- created;
- updated;
- deleted

via SSE.

Kanban não utiliza esses eventos para status.

---

## BR-COMMENTS-004 — Tombstones

AUTHOR
→ Comentário excluído pelo autor.

MODERATION
→ Comentário excluído por moderação.

UNKNOWN
→ Comentário excluído.

Nunca inferir AUTHOR quando não houver prova.

---

## BR-COMMENTS-005 — Edição

`Editado` somente quando existe `editedAt` real.

---

## BR-COMMENTS-006 — Capabilities

`canEdit` e `canDelete` são projeções da autorização da sessão.

REST reconciliation é autoridade das capabilities.

SSE não pode reintroduzir capability stale.

---

## BR-COMMENTS-007 — Painel limitado

Muitos comentários:

→ lista rola internamente.

Não expandir indefinidamente o Task Details.

Composer permanece disponível.

---

# BR-UX-INTEGRATION — CONTRATOS COMPORTAMENTAIS QUE O QA DEVE TRATAR COMO FUNCIONAIS

## BR-UX-001 — Filtros de Sprints e Marcos

Filtros são retráteis.

Fechar:

→ não limpa os valores.

---

## BR-UX-002 — SearchCombobox

Autocomplete precisa respeitar:

latest query wins.

---

## BR-UX-003 — Empty states

Card de criação permanece acessível mesmo sem entidades.

Filtered empty não pode ser confundido com ausência total de dados.

---

## BR-UX-004 — Light/Dark não altera regra

Theme só altera apresentação.

Nenhuma regra de negócio depende do Theme.

---

## BR-UX-005 — Responsividade não remove funcionalidade

Mobile/tablet pode reorganizar UI, mas não pode esconder:

- mutations necessárias;
- histórico;
- comentários;
- rastreabilidade;
- prazos;
- filtros essenciais.

---

# REGRA DE QA

Cada regra deste documento deve receber um resultado:

PASS
FAIL
ENVIRONMENT BLOCKED
NOT APPLICABLE

O Work não deve declarar Planning aprovado apenas porque os testes automatizados estão verdes.

Para cada FAIL deve registrar:

BR-ID
cenário
pré-condição
passos
resultado esperado
resultado observado
evidência
severidade.

Critérios bloqueantes incluem especialmente:

- perda de dados;
- escopo histórico de Sprint incorreto;
- duas Sprints em andamento;
- sobreposição inválida de datas;
- Marco tratado como intervalo;
- Task atrasada sem deadline próprio;
- status Kanban não persistido;
- cross-project leak;
- partial success apresentado como failure total;
- edição da Task vazando para outra Task;
- rastreabilidade incorreta;
- sugestão criando vínculo automático;
- Comments incompletos ou SSE regredido;
- autorização backend inconsistente.