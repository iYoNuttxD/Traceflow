# ADR-003 — Modelo de autorização

- **Estado:** aceita na E6; consolidada pelas LR.1 e LR.2
- **Data:** 24/07/2026

## Decisão

`ProjectMembership` vincula `User` e `Project` com `OWNER`, `MANAGER`, `MEMBER` ou `VIEWER`. A política é deny-by-default e resolve o projeto antes de acessar recursos filhos (`Requirement`, `Task`, `Commit`, `PullRequest`, `Issue` e sugestões). Ausência de membership retorna `404` para reduzir enumeração; membership existente sem papel suficiente retorna `403`.

| Operação | VIEWER | MEMBER | MANAGER | OWNER |
|---|---:|---:|---:|---:|
| leitura do projeto e artefatos | sim | sim | sim | sim |
| requisitos, tarefas, vínculos e Kanban | não | sim | sim | sim |
| sincronização GitHub | não | não | sim | sim |
| membros, convites e configuração GitHub | não | não | não | sim |

Criação de projeto e membership OWNER são uma transação. Listagem de projetos é filtrada por membership. O ator de `TaskMovement` vem do usuário da sessão. A LR.2 removeu `ProjectMember` e `TaskMovement.projectMemberId` do schema/runtime; `TaskMovement.movedBy` permanece somente como snapshot histórico e nunca é prova de identidade.

A restrição histórica `501` de `DELETE /api/projects/:id` foi substituída pelo ADR-014: OWNER pode excluir logicamente e restaurar durante a carência. O middleware exige sessão e papel contextual; projeto indisponível/alheio mantém `404` opaco. Consulte [ADR-014](ADR-014-EXCLUSAO-RECUPERAVEL-DE-PROJETOS.md) e a matriz vigente de autorização.

## Consequências e lacunas

As políticas são código central testado, não ABAC. Transferência e proteção do último OWNER, administração de memberships e auditoria persistente foram concluídas nas E6/E7. Rate limit continua por IP/projeto e precisa de store distribuído em implantação horizontal.

## Emenda de 15/10/2026 — caminho canônico e defesa local (CONF-F51, TF-REV-001)

### Contexto

O middleware de projeto decide pelo `req.path` cru, com regexes `\d+`. O Express casa a rota pelo
caminho cru, mas entrega ao controller cada parâmetro já decodificado. Um ID escrito com escape
percentual (`/api/projects/%34%32`) não era reconhecido como rota de projeto: passava sem membership
nem papel e chegava ao controller como `42`.

- A campanha de conformidade de 14/10/2026 (H09, CF-51) mediu o efeito: um não membro leu 53 rotas e
  escreveu em 17, e um VIEWER fez 18 escritas.
- A revisão independente da PR #26 (TF-REV-001) reproduziu o desvio nas quatro leituras de alertas
  do S2-01 (lista, resumo, detalhe e tarefas sem vínculo técnico), que não conferiam a membership no
  serviço.

### Decisão

- **Nenhuma rota da `/api` aceita escape percentual no caminho.** A query string não conta.
- **A recusa é `404 RESOURCE_NOT_FOUND`**, com o mesmo corpo do 404 opaco do não membro, antes de
  qualquer consulta ao banco.
- **Um middleware próprio aplica a regra**, montado logo depois do limitador global da `/api` e antes
  de qualquer rota, inclusive as públicas. A tentativa conta no limitador. Anônimo também recebe
  404, e não 401.
- **Cada recusa gera um `warn` `api_path_not_canonical`**, com `requestId`, método e caminho cru,
  cortado em 200 caracteres.
- **Defesa local nas leituras de alertas.** O serviço dos alertas confere a membership ativa nas
  quatro leituras, além do middleware.
  - Sem membership, responde o mesmo 404 opaco.
  - As `permissions` da resposta saem do papel lido pelo serviço.

### Consequências

- O middleware de projeto decide sempre sobre o mesmo valor que o controller recebe, e a API tem uma
  só grafia por recurso.
- ID malformado sem escape (`x`, `1.5`) continua recebendo `400 VALIDATION_ERROR` da validação.
- O middleware de projeto continua deixando seguir a rota que não reconhece. As varreduras geradas do
  roteador, com ID plano e com ID codificado em cada posição, travam a regra.
- Nenhum parâmetro da API precisa de escape: todos são IDs numéricos, UUID ou palavra fixa. Um
  parâmetro novo que precise de escape exige revisar esta emenda.
- As leituras dos alertas fazem uma consulta a mais, pela chave única `(projectId, userId)`.

### Alternativas rejeitadas

- **Decodificar o caminho como o Express e classificar o resultado:** fecha o desvio, mas aceita
  duas grafias do mesmo recurso, e toda regra futura baseada em `req.path` teria de decodificar.
- **Autorização por rota com `req.params`, depois do roteamento:** elimina a classe de divergência,
  mas reescreve todos os roteadores. Fica no backlog, com a reconferência da membership nos serviços
  que hoje confiam só no middleware.
- **Só a defesa local:** fecharia as leituras de alertas, mas deixaria as outras rotas do CONF-F51
  abertas.

