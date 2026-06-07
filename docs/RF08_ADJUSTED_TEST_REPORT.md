# Relatório de Teste - RF08 Ajustado

## 1. Ambiente testado

- Sistema operacional: Windows
- Node.js: v22.18.0
- NPM: 10.9.3
- MySQL: 8.1.0
- Backend: `http://localhost:3001`, iniciado com `npm start`
- Frontend: `http://127.0.0.1:5174`, servidor Vite ativo

Observação: o arquivo `.env` foi usado pelo backend, mas nenhum valor sensível foi exposto neste relatório.

## 2. Projeto usado no teste

- ID do projeto: 6
- Nome do projeto: RF01 GitHub Select Editado 1780794392898
- Código de acesso: TRC-000006
- Link rápido: `http://localhost:5173/join/TRC-000006`

## 3. Membros internos usados no teste

| ID | Nome | Email | Papel | Ativo |
|---|---|---|---|---|
| 4 | Joao Interno RF08 1780852139721 | joao-rf08-1780852139721@traceflow.test | DESENVOLVEDOR | true |
| 5 | Daniel Interno RF08 1780852139721 | daniel-rf08-1780852139721@traceflow.test | DESENVOLVEDOR | true |
| 6 | Gabriel Join RF08 1780852139721 | gabriel-rf08-1780852139721@traceflow.test | MEMBRO | true |

## 4. Tarefas usadas no teste

| ID | Título | Status inicial | Status final |
|---|---|---|---|
| 15 | RF08 Ajustado A Fazer 1780852139721 | A_FAZER | CONCLUIDO |
| 16 | RF08 Ajustado Em Andamento 1780852139721 | EM_ANDAMENTO | EM_ANDAMENTO |
| 17 | RF08 Ajustado Concluido 1780852139721 | CONCLUIDO | CONCLUIDO |

## 5. Comandos executados

```powershell
node -v
npm.cmd -v
netstat -ano | findstr :3001
netstat -ano | findstr :5174
Stop-Process -Id 25120
npx.cmd prisma validate
npx.cmd prisma generate
npx.cmd prisma migrate dev --skip-generate
node -e "consulta SELECT VERSION() via Prisma"
npm.cmd start --prefix backend
curl.exe -s http://localhost:3001/health
npm.cmd run build
curl.exe -i http://127.0.0.1:5174/projects/6/kanban
curl.exe -i http://127.0.0.1:5174/projects/6
curl.exe -i http://127.0.0.1:5174/join/TRC-000006
rg "githubApi|github/members|collaborator|Collaborator|listCollaborators|contributors" backend frontend
curl.exe -s http://localhost:3001/api/projects/5/members
```

Também foi executado um script Node com `fetch` e Prisma para criar membros internos, criar tarefas, mover tarefa, consultar histórico/métricas, testar erros e conferir dados persistidos no banco.

## 6. Rotas testadas

| Rota | Método | Resultado | Observação |
|---|---|---|---|
| `/api/projects/:projectId/members` | GET | OK | Retornou membros internos ativos do projeto 6. |
| `/api/projects/:projectId/members` | POST | OK | Cadastrou membros internos Joao/Daniel. |
| `/api/projects/join` | POST | OK | Criou membro Gabriel via `accessCode`. |
| `/api/projects/:projectId/kanban` | GET | OK | Retornou quadro com `A_FAZER`, `EM_ANDAMENTO`, `CONCLUIDO`. |
| `/api/tasks/:id/move` | PATCH | OK | Moveu tarefa usando `projectMemberId`. |
| `/api/projects/:projectId/kanban/movements` | GET | OK | Retornou histórico com `projectMemberId` e `movedBy`. |
| `/api/projects/:projectId/kanban/metrics` | GET | OK | Retornou indicador, métrica e contagem atualizada. |

## 7. Testes do backend

| Teste | Resultado | Observação |
|---|---|---|
| Projeto possui código de acesso | OK | Projeto 6 possui `TRC-000006`. |
| Projeto possui link rápido | OK | Link contém o código de acesso. |
| Listar membros internos | OK | `GET /api/projects/6/members` retornou membros internos. |
| Adicionar membro interno | OK | `POST /api/projects/6/members` retornou 201. |
| Entrar por código | OK | `POST /api/projects/join` retornou 201 e criou `ProjectMember`. |
| Consultar quadro Kanban | OK | Tarefas criadas apareceram nas colunas corretas. |
| Mover tarefa com projectMemberId | OK | Tarefa 15 foi movida com membros 4 e 5. |
| Registrar movimentação com membro interno | OK | `TaskMovement` registrou `projectMemberId` e `movedBy` derivado do membro. |
| Consultar histórico | OK | Histórico retornou movements da tarefa 15 em ordem decrescente. |
| Consultar métrica | OK | Total foi de 5 para 7 após duas movimentações válidas. |
| Membro obrigatório | OK | Sem `projectMemberId`, retornou 400. |
| Membro inexistente | OK | `projectMemberId=999999` retornou 404. |
| Membro de outro projeto | OK | Membro do projeto 1 foi recusado para tarefa do projeto 6. |
| Status inválido | OK | `FINALIZADO` retornou 400. |
| Mesma coluna | OK | Movimento duplicado para `CONCLUIDO` retornou 400. |
| Projeto inexistente | OK | Kanban de projeto inexistente retornou 404. |
| Tarefa inexistente | OK | Tarefa inexistente retornou 404. |
| Histórico por período | OK | Filtro `2026-06-01` a `2026-06-30` retornou movimentos do período. |
| Histórico por responsável | OK | Filtro por nome de membro interno retornou o movimento esperado. |
| Histórico por tarefa | OK | Filtro `taskId=15` retornou somente a tarefa testada. |
| Métrica por período | OK | Retornou total de movimentos no período. |
| Período inválido | OK | Histórico e métrica retornaram 400. |
| Movimentações inválidas não registram histórico | OK | Total permaneceu 7 após testes inválidos. |

## 8. Testes do frontend

| Teste | Resultado | Observação |
|---|---|---|
| Abrir tela Kanban | OK parcial | Rota SPA `/projects/6/kanban` respondeu 200 no Vite. Browser interno falhou por sandbox. |
| Exibir coluna A Fazer | OK parcial | Código usa coluna obrigatória `A_FAZER`; não validado visualmente por Browser. |
| Exibir coluna Em Andamento | OK parcial | Código usa coluna obrigatória `EM_ANDAMENTO`; não validado visualmente por Browser. |
| Exibir coluna Concluído | OK parcial | Código usa coluna obrigatória `CONCLUIDO`; não validado visualmente por Browser. |
| Exibir tarefas nas colunas corretas | OK parcial | Backend e integração API foram validados; não validado visualmente por Browser. |
| Carregar membros internos | OK | `KanbanPage.jsx` chama `projectMembersApi.listProjectMembers(projectId)`. |
| Não carregar colaboradores GitHub | OK | Busca por `githubApi`, `github/members`, `collaborator`, `listCollaborators` não encontrou ocorrências. |
| Mover tarefa pela tela usando membro interno | NÃO TESTADO | Browser interno indisponível por sandbox. Backend do fluxo passou. |
| Enviar projectMemberId no PATCH | OK parcial | Código envia `projectMemberId: Number(selectedProjectMemberId)`; não validado em DevTools por Browser. |
| Exigir membro responsável | OK parcial | Código bloqueia sem `selectedProjectMemberId`; backend também bloqueia. |
| Atualizar quadro após movimentação | OK parcial | Código chama `refreshKanban()` após mover; não validado visualmente. |
| Exibir histórico | OK parcial | Código consome `/kanban/movements`; backend testado. |
| Exibir métrica | OK parcial | Código consome `/kanban/metrics`; backend testado. |
| Exibir código de acesso no projeto | OK parcial | `ProjectDetailsPage.jsx` renderiza `project.accessCode`; rota SPA respondeu 200. |
| Exibir link rápido no projeto | OK parcial | `ProjectDetailsPage.jsx` renderiza `project.inviteLink`; rota SPA respondeu 200. |
| Tela `/join/:accessCode` | OK parcial | Rota SPA `/join/TRC-000006` respondeu 200; backend `POST /projects/join` passou. |
| Build do frontend | OK | `npm.cmd run build` finalizou sem erro. |

## 9. Conferência no banco

Dados persistidos corretamente no MySQL via Prisma.

Campos verificados em `ProjectMember`:

- id: 4, 5, 6
- projectId: 6
- name: Joao Interno RF08, Daniel Interno RF08, Gabriel Join RF08
- email: emails únicos de teste
- role: DESENVOLVEDOR ou MEMBRO
- isActive: true

Campos verificados em `TaskMovement`:

- id: 6 e 7
- projectId: 6
- taskId: 15
- fromStatus: `A_FAZER`, depois `EM_ANDAMENTO`
- toStatus: `EM_ANDAMENTO`, depois `CONCLUIDO`
- projectMemberId: 4, depois 5
- movedBy: nomes dos membros internos
- movedAt: preenchido automaticamente
- createdAt: preenchido automaticamente

Campos verificados em `Task`:

- id: 15
- projectId: 6
- title: RF08 Ajustado A Fazer 1780852139721
- status: `CONCLUIDO`
- updatedAt: atualizado após movimentações válidas

## 10. Verificação contra uso indevido do GitHub

- Kanban usa GitHub collaborators? Não.
- Arquivos verificados:
  - `frontend/src/pages/KanbanPage.jsx`
  - `frontend/src/api/api.js`
  - `backend/src/modules/tasks/task.controller.js`
  - `backend/src/modules/tasks/task.service.js`
  - `backend/src/modules/tasks/task.repository.js`
  - `backend/src/modules/github/github.service.js`
  - `backend/src/modules/github/github.controller.js`
  - `backend/src/modules/github/github.client.js`
- Resultado: `rg` não encontrou `githubApi`, `github/members`, `collaborator`, `Collaborator`, `listCollaborators` ou `contributors` em `backend`/`frontend`.

## 11. Bugs encontrados

Nenhum bug funcional bloqueante do RF08 ajustado foi encontrado.

### Ressalva 1

- Arquivo provável: Browser interno do Codex no Windows sandbox
- Comportamento esperado: abrir e interagir visualmente com `/projects/6/kanban`
- Comportamento atual: inicialização do Browser interno falhou com erro de sandbox
- Como reproduzir: tentar conectar ao Browser interno via plugin nesta sessão
- Sugestão de correção: testar visualmente no navegador local do usuário ou ajustar permissões do Browser interno

### Ressalva 2

- Arquivo provável: compatibilidade temporária em `backend/src/modules/tasks/task.service.js`
- Comportamento esperado: frontend usar sempre `projectMemberId`
- Comportamento atual: backend ainda aceita `movedBy` manual como fallback temporário
- Como reproduzir: enviar `PATCH /api/tasks/:id/move` com `movedBy` e sem `projectMemberId`
- Sugestão de correção: remover fallback quando o frontend antigo não precisar mais ser suportado

## 12. Conclusão

RF08 ajustado aprovado com ressalvas.

Motivo: backend, Prisma, MySQL, rotas, validações, persistência, histórico, métricas e uso de membros internos passaram. O Kanban não depende mais de colaboradores GitHub. O frontend passou no build e as rotas SPA responderam, mas a interação visual automatizada não pôde ser executada por limitação do Browser interno no ambiente.

## 13. Checklist final

| Item | Resultado |
|---|---|
| Backend inicia sem erro | OK |
| MySQL está rodando | OK |
| Prisma conecta no banco | OK |
| Model Task existe | OK |
| Model TaskMovement existe | OK |
| Estrutura ProjectMember existe | OK |
| Project possui código único de acesso | OK |
| Project possui link rápido de convite | OK |
| Migration roda sem erro | OK |
| Prisma Client é gerado sem erro | OK |
| Existe pelo menos um projeto para teste | OK |
| Existem membros internos no projeto | OK |
| Existem tarefas cadastradas no projeto | OK |
| GET `/api/projects/:projectId/members` retorna membros internos | OK |
| GET `/api/projects/:projectId/members` não retorna colaboradores GitHub | OK |
| GET `/api/projects/:projectId/kanban` retorna quadro | OK |
| Kanban retorna A_FAZER | OK |
| Kanban retorna EM_ANDAMENTO | OK |
| Kanban retorna CONCLUIDO | OK |
| PATCH `/api/tasks/:id/move` move usando projectMemberId | OK |
| Movimentação atualiza status da tarefa | OK |
| Movimentação registra TaskMovement | OK |
| TaskMovement registra fromStatus | OK |
| TaskMovement registra toStatus | OK |
| TaskMovement registra projectMemberId | OK |
| TaskMovement registra movedBy com nome do membro interno | OK |
| TaskMovement registra movedAt | OK |
| Backend impede movimentação sem membro | OK |
| Backend impede membro inexistente | OK |
| Backend impede membro de outro projeto | OK |
| Backend impede status inválido | OK |
| Backend impede movimentação para mesma coluna | OK |
| Backend retorna 404 para tarefa inexistente | OK |
| Backend retorna 404 para projeto inexistente | OK |
| Histórico de movimentações funciona | OK |
| Histórico aceita filtro por período | OK |
| Histórico aceita filtro por responsável | OK |
| Histórico aceita filtro por tarefa | OK |
| Métrica de movimentações funciona | OK |
| Métrica aceita filtro por período | OK |
| Filtro por sprint | NÃO TESTADO - MVP não possui módulo Sprint |
| KanbanPage usa membros internos | OK |
| KanbanPage não chama colaboradores GitHub | OK |
| Frontend exibe select de membros internos | OK parcial |
| Frontend envia projectMemberId | OK parcial |
| Frontend exibe histórico | OK parcial |
| Frontend exibe métrica | OK parcial |
| ProjectDetailsPage exibe código de acesso | OK parcial |
| ProjectDetailsPage exibe link rápido | OK parcial |
| Build do frontend funciona | OK |
| Nenhum outro requisito foi implementado indevidamente | OK |
