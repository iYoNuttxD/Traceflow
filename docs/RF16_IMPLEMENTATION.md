# RF16 — Relacionar requisitos a tarefas

## Objetivo

Permitir relacionar requisitos às tarefas do projeto, fechando o elo inicial da rastreabilidade.

## Decisão de escopo

No MVP, um requisito pode possuir várias tarefas, e uma tarefa pode estar vinculada a no máximo um requisito.

## Modelo

Foi reaproveitado o campo `Task.requirementId` já existente no schema. Nenhuma nova tabela foi criada para este requisito.

## Status do requisito

- Sem tarefas: `CADASTRADO`.
- Tarefas vinculadas todas em `A_FAZER`: `APROVADO`.
- Tarefas em andamento ou fluxo misto: `EM_IMPLEMENTACAO`.
- Todas as tarefas vinculadas concluídas: `VALIDADO`.
- Confirmação manual pelo usuário: `CONCLUIDO`.

Requisitos em `CONCLUIDO` não são recalculados automaticamente por movimentações de tarefas.

## Interface

- Requisitos exibem tarefas vinculadas em seção de rastreabilidade.
- O formulário de requisito permite pesquisar e vincular tarefas do projeto.
- Tarefas exibem o requisito vinculado na seção de rastreabilidade.
- O formulário de tarefa permite pesquisar e vincular um requisito.
- O Kanban exibe requisito no resumo de rastreabilidade do card e no detalhe da tarefa.
- Requisito validado mostra a ação `Confirmar conclusão`.

## Métrica

Cobertura de requisitos com tarefas:

`(Requisitos com pelo menos uma tarefa vinculada / total de requisitos) x 100`.

## Limitações

- Não há relação muitos-para-muitos entre requisito e tarefa.
- Não há coluna Review no Kanban.
- Não há tela central de rastreabilidade nesta etapa.
- Não há vínculo automático por texto, branch ou artefato GitHub.
