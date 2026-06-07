# Relatorio de Teste - RF15

## 1. Ambiente testado

- Sistema operacional: Microsoft Windows NT 10.0.26200.0
- Node.js: v22.18.0
- NPM: 10.9.3 (`npm.cmd`; o shim `npm.ps1` foi bloqueado pela politica de execucao do PowerShell)
- MySQL: 8.1.0
- Backend: Express em `http://localhost:3001`
- Frontend: Vite em `http://127.0.0.1:5173`

## 2. Projeto usado no teste

- ID do projeto: 6
- Nome do projeto: RF01 GitHub Select Editado 1780794392898

Projeto secundario usado para isolamento:

- ID do projeto: 5
- Nome do projeto: Teste-Reposit-rio-Projeto-Traceflow

## 3. Requisitos usados no teste

| ID | Titulo | Tipo | Status inicial | Status final |
|---|---|---|---|---|
| 3 | RF15 - Gerenciar requisitos funcionais 1780869733384 | FUNCIONAL | PENDENTE | CONCLUIDO |
| 4 | RF01 - Cadastrar projeto de software 1780869733384 | FUNCIONAL | PENDENTE | PENDENTE |
| 5 | RF Projeto secundario 1780869733384 | FUNCIONAL | PENDENTE | PENDENTE |

Tarefa vinculada criada via Prisma para validar a consulta simples de tarefas:

| ID | ProjectId | RequirementId | Titulo | Status |
|---|---:|---:|---|---|
| 18 | 6 | 3 | Implementar RF15 1780869733384 | A_FAZER |

## 4. Comandos executados

```powershell
Get-Content -Path backend\prisma\schema.prisma
Get-Content -Path backend\src\modules\requirements\requirement.routes.js
Get-Content -Path backend\src\routes\index.js
Get-Content -Path frontend\src\routes\AppRoutes.jsx
Get-Content -Path frontend\src\api\api.js
node -v
npm.cmd -v
npx.cmd prisma validate
npm run prisma:generate
npx.cmd prisma migrate dev --skip-generate
curl.exe -s http://localhost:3001/health
curl.exe -s http://localhost:3001/api/projects
node -e "<script de testes RF15 via fetch + Prisma>"
npm run build
curl.exe -s -I http://127.0.0.1:5173/projects/6/requirements
curl.exe -s -I http://127.0.0.1:5173/projects/6
rg "Ver requisitos do projeto|requirementsApi|Requisitos do projeto|Cadastrar requisito|Tarefas vinculadas" frontend\src\pages frontend\src\api frontend\src\routes
```

## 5. Rotas testadas

| Rota | Metodo | Resultado | Observacao |
|---|---|---|---|
| `/api/projects/:projectId/requirements` | POST | OK | Cadastrou requisito completo e requisito com defaults. |
| `/api/projects/:projectId/requirements` | GET | OK | Listou somente requisitos do projeto informado. |
| `/api/requirements/:id` | GET | OK | Retornou requisito, projeto e `tasks`. |
| `/api/requirements/:id` | PUT | OK | Atualizou dados basicos e preservou `projectId`. |
| `/api/requirements/:id/status` | PATCH | OK | Alterou status para `CONCLUIDO`. |
| `/api/requirements/:id/tasks` | GET | OK | Retornou array vazio e depois tarefa vinculada existente. |

## 6. Testes do backend

| Teste | Resultado | Observacao |
|---|---|---|
| Criar requisito | OK | Status 201, `projectId=6`, `type=FUNCIONAL`, `status=PENDENTE`. |
| Criar requisito com valores padrao | OK | `type=FUNCIONAL` e `status=PENDENTE` aplicados automaticamente. |
| Listar requisitos por projeto | OK | Listagem filtrada por `projectId`. |
| Consultar requisito por ID | OK | Retornou requisito correto com dados do projeto e `tasks`. |
| Editar requisito | OK | Titulo, descricao, tipo e status atualizados. |
| Alterar status | OK | Status final salvo como `CONCLUIDO`. |
| Consultar tarefas vinculadas | OK | Retornou vazio antes do vinculo e a tarefa ID 18 depois do vinculo direto via Prisma. |
| Titulo obrigatorio | OK | Status 400 e mensagem esperada. |
| Tipo invalido | OK | Status 400 e mensagem esperada. |
| Status invalido | OK | Status 400 no cadastro e no PATCH. |
| Projeto inexistente | OK | Status 404 e nenhum requisito salvo. |
| Requisito inexistente | OK | Status 404 na consulta e edicao. |
| Isolamento entre projetos | OK | Requisito do projeto 5 nao apareceu na listagem do projeto 6 e vice-versa. |

## 7. Testes do frontend

| Teste | Resultado | Observacao |
|---|---|---|
| Abrir tela de requisitos | OK parcial | Rota Vite `/projects/6/requirements` retornou 200 HTML. Browser visual nao abriu por erro de sandbox. |
| Cadastrar requisito pela tela | OK parcial | Codigo da tela chama `requirementsApi.create`; fluxo visual nao testado por falha do browser interno. |
| Listar requisito cadastrado | OK parcial | Codigo chama `requirementsApi.listByProject`; API validada. |
| Editar requisito pela tela | OK parcial | Codigo chama `requirementsApi.update`; API validada. |
| Alterar status pela tela | OK parcial | Codigo chama `requirementsApi.updateStatus`; API validada. |
| Exibir tarefas vinculadas | OK parcial | Codigo chama `requirementsApi.listTasks`; API validada com tarefa vinculada. |
| Exibir mensagens de erro | OK parcial | Codigo renderiza `message-error`; API validada. |
| Exibir mensagens de sucesso | OK parcial | Codigo renderiza `message-success`; API validada. |
| Navegar a partir do detalhe do projeto | OK parcial | Link `Ver requisitos do projeto` encontrado em `ProjectDetailsPage.jsx`; rota do projeto retornou 200 HTML. |

## 8. Conferencia no banco

Os dados foram persistidos corretamente no MySQL via Prisma.

Campos verificados em `Requirement`:

- id: 3, 4, 5
- projectId: 6, 6, 5
- title: requisitos criados e atualizados nos testes
- description: descricoes dos cenarios de cadastro/edicao
- type: FUNCIONAL
- status: CONCLUIDO para ID 3, PENDENTE para IDs 4 e 5
- createdAt: preenchido automaticamente
- updatedAt: atualizado apos PUT/PATCH

Campos verificados em `Task`:

- id: 18
- projectId: 6
- requirementId: 3
- title: Implementar RF15 1780869733384
- status: A_FAZER

Requisitos invalidos nao foram persistidos: a contagem antes e depois dos testes invalidos permaneceu igual (`5`).

## 9. Bugs encontrados

Nenhum bug funcional bloqueante foi encontrado no RF15.

### Ressalva 1

- Arquivo provavel: historico de migrations em `backend/prisma/migrations`
- Comportamento esperado: `npx prisma migrate dev --skip-generate` aplicar migrations sem drift.
- Comportamento atual: Prisma detectou drift e migrations antigas modificadas apos aplicacao (`20260607021903_add_task_module`, `20260607024213_use_integer_task_effort`, `20260607170000_adjust_kanban_project_members`). Tambem indicou diferenca na coluna `Requirement.type`, ja sincronizada no banco por `db push`.
- Como reproduzir: executar `npx.cmd prisma migrate dev --skip-generate` dentro de `backend`.
- Sugestao de correcao: reconciliar o historico de migrations antes de usar `migrate dev` novamente ou resetar apenas um banco local descartavel. Nao foi executado reset para evitar perda de dados.

### Ressalva 2

- Arquivo provavel: ambiente do browser interno do Codex, nao codigo do RF15.
- Comportamento esperado: abrir a tela e testar interacao visual.
- Comportamento atual: o browser interno falhou com `windows sandbox failed: spawn setup refresh`.
- Como reproduzir: tentar conectar ao browser interno pela ferramenta Browser do Codex.
- Sugestao de correcao: validar manualmente no navegador local em `http://127.0.0.1:5173/projects/6/requirements`.

## 10. Conclusao

RF15 aprovado com ressalvas.

Motivo: o backend, Prisma, MySQL e as rotas do RF15 passaram nos testes obrigatorios de cadastro, defaults, listagem, consulta, edicao, alteracao de status, validacoes, isolamento entre projetos e consulta de tarefas vinculadas. O frontend compila, a rota responde no Vite e o codigo aponta para os endpoints corretos.

As ressalvas sao ambientais: `migrate dev` detectou drift de migrations antigas no banco local, e o browser interno do Codex nao permitiu teste visual interativo. Nenhuma dessas ressalvas indica falha funcional do RF15 nas APIs ou na persistencia.
