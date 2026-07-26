# E2 — Estrutura de pastas e fronteiras arquiteturais

## Identificação e estado

- **Branch:** `daniel-dev`
- **Commit inicial da E2:** `ba1de5526676e19237104064e79e598782dbc154`
- **Commit inicial desta continuação:** `28da221fd7ba6900c62a4a5d3e6237df47572d8d`
- **Data:** 24/07/2026
- **Estado inicial desta continuação:** árvore limpa e sincronizada com `origin/daniel-dev` (`+0/-0`).
- **Resultado:** **CONCLUÍDA**. E2.1 a E2.10 foram executadas e validadas.

## Objetivo e arquitetura adotada

A E2 tornou explícita a direção:

```text
Route → Controller → Service → Repository → Prisma/MySQL
                              ↓
                        external client
```

Routes apenas registram HTTP; controllers preservam os contratos; services executam e coordenam casos de uso; repositories concentram persistência; clients externos não persistem. As convenções completas estão em `docs/architecture/MODULE_CONVENTIONS.md` e `docs/architecture/FRONTEND_STRUCTURE.md`.

Os contratos, mensagens, códigos, fórmulas e sete endpoints `501` caracterizados na E1 permaneceram como baseline. Não houve alteração de schema, migration, autenticação, autorização, segurança ou layout.

## Estrutura final relevante

```text
backend/src/modules/
├── github/
│   ├── github.client.js
│   ├── githubSync.service.js
│   └── index.js
├── projects/
│   ├── project.schema.js
│   ├── project.service.js
│   └── services/
│       ├── project-crud.service.js
│       ├── project-github.service.js
│       ├── project-invite.service.js
│       └── project-members.service.js
├── requirements/
│   ├── requirement.schema.js
│   ├── requirement.service.js
│   ├── requirement.repository.js
│   └── services/
│       ├── requirement-crud.service.js
│       ├── requirement-status.service.js
│       └── requirement-coverage.service.js
├── tasks/
│   ├── task.schema.js
│   ├── task.service-support.js
│   ├── task.service.js
│   ├── task.repository.js
│   └── services/
│       ├── task-crud.service.js
│       ├── task-requirement.service.js
│       ├── task-pull-request.service.js
│       ├── task-commit.service.js
│       ├── task-issue.service.js
│       ├── task-kanban.service.js
│       ├── task-movement.service.js
│       └── task-metrics.service.js
└── traceability/
    ├── traceability.calculator.js
    ├── traceability.mapper.js
    └── traceability.service.js

frontend/src/
├── features/projects/
│   ├── api/projects.api.js
│   ├── components/ProjectForm.jsx
│   └── index.js
├── shared/
│   ├── components/Card.jsx
│   └── index.js
└── pages/ProjectsPage.jsx
```

## Verificação automática de fronteiras

`backend/scripts/check-architecture.js` verifica imports e reexports estáticos sem dependência adicional. O comando é:

```bash
cd backend
npm run architecture:check
```

Ele reprova route importando repository/Prisma, controller importando repository/Prisma, repository importando controller/route/Express, frontend importando backend e ciclos internos evidentes. O código real passou com zero violações. A fixture controlada continua provando o caminho de falha com código diferente de zero.

## Módulos concluídos

### GitHub

`github.client.js` encapsula Octokit sem persistência; `githubSync.service.js` orquestra; repositories de commits, pull requests e issues persistem. Paginação, timeout, retry, rate limit, token e filtros atuais não foram corrigidos nesta etapa.

### Projects

CRUD, membros, convite e integração GitHub permanecem em casos de uso separados. `project.service.js` é a API pública interna agregadora, sem regra duplicada. `Math.random()`, convite `TRC-*`, token global, mensagens e status foram preservados.

### Requirements

O antigo service monolítico foi dividido em:

- CRUD, consultas e exclusão com desvinculação;
- status, recálculo e confirmação de conclusão;
- cobertura Requirement–Task;
- validações e cálculos puros em `requirement.schema.js`.

O repository permaneceu único: suas operações são coesas e a divisão criaria gateways artificiais sem benefício. `requirement.service.js` ficou como API interna agregadora, sem duplicar implementação.

### Traceability

O service coordena repository e saída; fórmulas estão em `traceability.calculator.js` e DTOs em `traceability.mapper.js`. Issue isolada, percentuais, propriedades e estados atuais foram preservados.

### Tasks

O service de 941 linhas foi substituído por casos de uso coesos, na ordem protegida pelos testes:

1. CRUD e atualização direta de status;
2. vínculo Requirement;
3. vínculo singular de Pull Request;
4. vínculos TaskCommit;
5. vínculos TaskIssue;
6. quadro e movimentação transacional;
7. histórico e métricas de movimentos;
8. métricas de tarefas e coberturas PR/commit/issue;
9. fachada final de exports.

`task.schema.js` contém parsing, validações e cálculos puros. `task.service-support.js` concentra apenas garantias e mapeamentos compartilhados. O repository permaneceu único para preservar selects/includes compartilhados, a exclusão transacional e a atomicidade Task + TaskMovement sem duplicar queries.

## Frontend e limpeza E2.9

A direção `pages → features → shared` foi mantida. Projects é a feature representativa; não houve reorganização de Kanban, Tasks, Requirements, ProjectDetails ou Traceability.

Após busca de todos os consumidores, os wrappers temporários foram removidos:

- `frontend/src/components/Card.jsx`;
- `frontend/src/components/ProjectForm.jsx`.

Páginas e testes agora importam `Card` pela API `shared/index.js` e `ProjectForm` por `features/projects/index.js`. As fachadas backend `project.service.js`, `requirement.service.js` e `task.service.js` foram mantidas deliberadamente como APIs públicas internas agregadoras, e não como compatibilidades temporárias. Nenhuma delas contém regra duplicada.

## Testes adicionados e contratos preservados

Foram adicionados nove testes nesta continuação:

- cinco testes HTTP de caracterização para detalhe/status/conclusão/cobertura de requisitos, status direto, listagens técnicas e métricas/coberturas de Tasks;
- quatro testes unitários para status, datas e percentuais extraídos.

Resultado final: 49 testes backend (15 unitários e 34 integração/API) e 12 testes frontend; 61 no total. Permaneceram cobertos health, Projects, Requirements, Tasks, vínculos, GitHub com dublês, Kanban, rastreabilidade e os sete endpoints `501`.

## Cobertura antes e depois desta continuação

| Área | Momento | Statements | Branches | Functions | Lines |
|---|---|---:|---:|---:|---:|
| Backend | Antes | 56,58% | 39,88% | 59,72% | 56,32% |
| Backend | Depois | 66,06% | 44,61% | 70,11% | 66,66% |
| Frontend | Antes | 10,67% | 12,58% | 9,74% | 10,96% |
| Frontend | Depois | 10,93% | 12,74% | 9,74% | 11,24% |

O aumento backend vem da caracterização dos contratos já existentes e dos testes das funções puras. A pequena alta frontend decorre da resolução dos imports pelos entry points canônicos; nenhum arquivo de produção foi excluído da coleta.

## Validações

| Comando | Resultado final |
|---|---|
| Backend `npm ci` | Aprovado; nenhuma dependência ou lockfile alterado. |
| `npx prisma validate` | Aprovado; schema válido e inalterado. |
| `npx prisma generate` | Aprovado. |
| `npm run architecture:check` | Aprovado, zero violações no código real. |
| Backend `npm test` | 7 arquivos, 49 testes aprovados. |
| Backend `npm run test:unit` | 5 arquivos, 15 testes aprovados. |
| Backend `npm run test:integration` | 2 arquivos, 34 testes aprovados em `traceflow_test`. |
| Backend `npm run test:coverage` | Aprovado; cobertura registrada acima. |
| Frontend `npm ci` | Aprovado; nenhuma dependência ou lockfile alterado. |
| Frontend `npm test` | 5 arquivos, 12 testes aprovados. |
| Frontend `npm run test:coverage` | Aprovado; cobertura registrada acima. |
| Frontend `npm run build` | Aprovado; permanece aviso não bloqueante de chunk de aproximadamente 546 kB. |

## Limitações restantes e bloqueios para E3

- O verificador usa análise estática simples e não substitui parser/linter completo.
- `task.repository.js` permanece grande, por decisão de coesão transacional e compartilhamento de selects; futura divisão exige benefício comprovado e testes adicionais.
- A cobertura frontend e de alguns casos Projects/GitHub ainda é baixa.
- O bundle frontend mantém o aviso conhecido acima de 500 kB.

Não há bloqueio arquitetural remanescente da E2 para iniciar a E3. As limitações acima devem permanecer registradas e tratadas apenas nas etapas apropriadas.

## Confirmações de escopo

A análise permaneceu na branch `daniel-dev`. Nenhuma migration foi criada. `schema.prisma` não foi alterado. Nenhum endpoint `501` foi implementado ou removido. Nenhum contrato HTTP, mensagem ou status foi alterado. Nenhum mock foi incluído no runtime. Nenhuma dependência de runtime foi adicionada. Nenhum commit, push ou pull request foi realizado nesta execução.
