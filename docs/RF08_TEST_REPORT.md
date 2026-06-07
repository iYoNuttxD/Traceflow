# Relatório de Teste - RF08

## 1. Ambiente testado

- Sistema operacional: Windows
- Node.js: v22.18.0
- NPM: 10.9.3
- MySQL: 8.1.0
- Backend: `http://localhost:3001`, iniciado com `npm start`
- Frontend: `http://127.0.0.1:5174`, servidor Vite já ativo

Observação: não foram expostos valores do `.env`.

## 2. Projeto usado no teste

- ID do projeto: 6
- Nome do projeto: RF01 GitHub Select Editado 1780794392898

## 3. Tarefas usadas no teste

| ID | Título | Status inicial | Status final |
|---|---|---|---|
| 10 | RF08 Teste A Fazer 1780849606458 | A_FAZER | CONCLUIDO |
| 11 | RF08 Teste Em Andamento 1780849606458 | EM_ANDAMENTO | EM_ANDAMENTO |
| 12 | RF08 Teste Concluido 1780849606458 | CONCLUIDO | CONCLUIDO |

## 4. Comandos executados

```powershell
node -v
npm.cmd -v
netstat -ano | findstr :3001
netstat -ano | findstr :5174
npx.cmd prisma generate
npx.cmd prisma migrate dev
Stop-Process -Id 13476
npx.cmd prisma generate
npx.cmd prisma migrate dev --skip-generate
Start-Process -WindowStyle Hidden -FilePath npm.cmd -ArgumentList 'start' -WorkingDirectory '...\backend'
curl.exe -s http://localhost:3001/health
curl.exe -s http://localhost:3001/api/projects
npm.cmd run build
rg "kanban|Ver Kanban|Abrir Kanban" frontend\src\pages frontend\src\routes frontend\src\components
node -e "consulta SELECT VERSION() via Prisma"
```

Também foi executado um script Node com `fetch` e Prisma para criar dados, mover tarefa, consultar rotas, testar erros e conferir o banco.

## 5. Rotas testadas

| Rota | Método | Resultado | Observação |
|---|---|---|---|
| `/api/projects/:projectId/kanban` | GET | OK | Retornou colunas `A_FAZER`, `EM_ANDAMENTO`, `CONCLUIDO` e totais. |
| `/api/tasks/:id/move` | PATCH | OK | Moveu tarefa e registrou `TaskMovement`. |
| `/api/projects/:projectId/kanban/movements` | GET | OK | Retornou histórico ordenado por `movedAt` decrescente. |
| `/api/projects/:projectId/kanban/metrics` | GET | OK | Retornou indicador, métrica e total de movimentações. |

## 6. Testes do backend

| Teste | Resultado | Observação |
|---|---|---|
| Consultar quadro Kanban | OK | Projeto 6 retornou quadro agrupado por status. |
| Mover tarefa para Em Andamento | OK | Tarefa 10: `A_FAZER` -> `EM_ANDAMENTO`, movement id 3. |
| Mover tarefa para Concluído | OK | Tarefa 10: `EM_ANDAMENTO` -> `CONCLUIDO`, movement id 4. |
| Registrar movimentação | OK | Persistiu `fromStatus`, `toStatus`, `movedBy`, `movedAt`, `projectId`, `taskId`. |
| Consultar histórico | OK | Histórico da tarefa 10 retornou duas movimentações em ordem decrescente. |
| Consultar histórico por período | OK | Filtro `2026-06-01` a `2026-06-30` retornou as movimentações do período. |
| Consultar histórico por responsável | OK | Filtro `movedBy=Joao RF08 Teste` retornou somente registros desse responsável. |
| Consultar histórico por tarefa | OK | Filtro `taskId=10` retornou somente movimentações da tarefa 10. |
| Consultar métrica | OK | `totalMovements` foi de 2 para 4 após duas movimentações. |
| Consultar métrica por período | OK | Retornou `startDate`, `endDate` e `totalMovements=4`. |
| Status inválido | OK | Retornou 400 e mensagem em português. |
| Responsável obrigatório | OK | Retornou 400 e não registrou movimentação. |
| Mesma coluna | OK | Retornou 400 e não criou histórico duplicado. |
| Tarefa inexistente | OK | Retornou 404. |
| Projeto inexistente | OK | Kanban, histórico e métrica retornaram 404. |
| Período inválido | OK | Métrica e histórico retornaram 400. |

## 7. Testes do frontend

| Teste | Resultado | Observação |
|---|---|---|
| Abrir tela Kanban | OK parcial | Rota SPA `/projects/6/kanban` respondeu 200 via Vite. Browser interno falhou por sandbox. |
| Exibir coluna A Fazer | OK parcial | Componente usa coluna obrigatória `A_FAZER` / `A Fazer`; não validado visualmente por Browser. |
| Exibir coluna Em Andamento | OK parcial | Componente usa coluna obrigatória `EM_ANDAMENTO` / `Em Andamento`; não validado visualmente por Browser. |
| Exibir coluna Concluído | OK parcial | Componente usa coluna obrigatória `CONCLUIDO` / `Concluído`; não validado visualmente por Browser. |
| Exibir tarefas nas colunas corretas | OK parcial | Backend retornou colunas corretas e frontend consome `/kanban`; não validado visualmente por Browser. |
| Mover tarefa pela tela | NÃO TESTADO | Browser interno não abriu por falha de sandbox. Backend do fluxo foi testado. |
| Exigir responsável | OK parcial | Frontend valida responsável antes do `PATCH`; backend também retorna 400. |
| Atualizar quadro após movimentação | OK parcial | Código chama `refreshKanban()` após mover; não validado visualmente por Browser. |
| Exibir histórico | OK parcial | Código consome `/kanban/movements`; backend testado. |
| Exibir métrica | OK parcial | Código consome `/kanban/metrics`; backend testado. |
| Navegar para Kanban | OK | Links existem em `ProjectDetailsPage.jsx` e `TasksPage.jsx`; rota existe em `AppRoutes.jsx`. |

Build do frontend: OK.

## 8. Conferência no banco

Dados persistidos corretamente no MySQL via Prisma.

Campos verificados em `TaskMovement`:

- id: 3 e 4
- projectId: 6
- taskId: 10
- fromStatus: `A_FAZER`, depois `EM_ANDAMENTO`
- toStatus: `EM_ANDAMENTO`, depois `CONCLUIDO`
- movedBy: `Joao RF08 Teste`
- movedAt: preenchido automaticamente
- createdAt: preenchido automaticamente

Campos verificados em `Task`:

- id: 10
- projectId: 6
- title: RF08 Teste A Fazer 1780849606458
- status: `CONCLUIDO`
- updatedAt: atualizado após movimentações válidas

Movimentações inválidas não aumentaram a métrica: total permaneceu 4 após testes de erro.

## 9. Bugs encontrados

Nenhum bug funcional bloqueante do RF08 foi encontrado.

### Ressalva 1

- Arquivo provável: ambiente local, processo backend usando Prisma Client
- Comportamento esperado: `npx.cmd prisma generate` executar sem erro
- Comportamento atual: primeira execução falhou com `EPERM` ao renomear `query_engine-windows.dll.node`
- Como reproduzir: rodar `prisma generate` enquanto o backend está em execução usando Prisma
- Sugestão de correção: parar o backend antes de regenerar o Prisma Client; após parar o processo, o comando passou

### Ressalva 2

- Arquivo provável: Browser interno do Codex no Windows sandbox
- Comportamento esperado: abrir `http://127.0.0.1:5174/projects/6/kanban` para inspeção visual
- Comportamento atual: Browser interno falhou com erro de sandbox ao inicializar
- Como reproduzir: tentar conectar ao Browser interno via plugin
- Sugestão de correção: testar visualmente no navegador local do usuário ou corrigir a permissão do Browser interno

## 10. Conclusão

RF08 aprovado com ressalvas.

Motivo: o backend, Prisma, MySQL, rotas, regras de validação, histórico e métricas passaram nos testes automatizados e na conferência direta do banco. O frontend compilou, a rota SPA respondeu e os links/integração de API existem, mas a interação visual automatizada no Browser interno não pôde ser executada por limitação do ambiente.

## 11. Checklist final do RF08

| Item | Resultado |
|---|---|
| Backend inicia sem erro | OK |
| MySQL está rodando | OK |
| Prisma conecta no banco | OK |
| Model Task existe no schema.prisma | OK |
| Model TaskMovement existe no schema.prisma | OK |
| Task possui relação com TaskMovement | OK |
| Project possui relação com TaskMovement | OK |
| Migration roda sem erro | OK |
| Prisma Client é gerado sem erro | OK |
| Existe pelo menos um projeto para teste | OK |
| Existem tarefas cadastradas no projeto | OK |
| GET `/api/projects/:projectId/kanban` retorna quadro | OK |
| Kanban retorna A_FAZER | OK |
| Kanban retorna EM_ANDAMENTO | OK |
| Kanban retorna CONCLUIDO | OK |
| PATCH `/api/tasks/:id/move` move tarefa | OK |
| Movimentação atualiza status da tarefa | OK |
| Movimentação registra TaskMovement | OK |
| TaskMovement registra fromStatus | OK |
| TaskMovement registra toStatus | OK |
| TaskMovement registra movedBy | OK |
| TaskMovement registra movedAt | OK |
| Backend impede status inválido | OK |
| Backend impede movimentação sem responsável | OK |
| Backend impede movimentação para mesma coluna | OK |
| Backend retorna 404 para tarefa inexistente | OK |
| Backend retorna 404 para projeto inexistente | OK |
| Histórico retorna movimentos | OK |
| Histórico aceita filtro por período | OK |
| Histórico aceita filtro por responsável | OK |
| Histórico aceita filtro por tarefa | OK |
| Métrica retorna fluxo de trabalho | OK |
| Métrica aceita filtro por período | OK |
| Filtro por sprint | NÃO TESTADO - MVP não possui módulo Sprint |
| Repository acessa banco usando Prisma | OK |
| Service concentra regras de negócio | OK |
| Controller recebe requisição e retorna resposta | OK |
| Frontend abre tela de Kanban | OK parcial |
| Frontend mostra três colunas | OK parcial |
| Frontend permite mover tarefa | NÃO TESTADO visualmente |
| Frontend exige responsável | OK parcial |
| Frontend mostra histórico | OK parcial |
| Frontend mostra métrica | OK parcial |
| Build do frontend funciona | OK |
| Nenhum outro requisito foi implementado indevidamente | OK |
