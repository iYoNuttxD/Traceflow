# E2 — Estrutura de pastas e fronteiras arquiteturais

## Identificação e estado

- **Branch:** `daniel-dev`
- **Commit inicial:** `ba1de5526676e19237104064e79e598782dbc154`
- **Data:** 24/07/2026
- **Estado inicial:** árvore limpa e sincronizada com `origin/daniel-dev` (`+0/-0`).
- **Resultado:** **PARCIAL**. E2.1, E2.2, E2.3, E2.5, E2.7 e E2.8 foram concluídas com validação. Requirements e, principalmente, Tasks permanecem para uma continuação da E2.

O estado parcial é intencional: dividir `task.service.js` e `task.repository.js` na mesma entrega produziria uma alteração ampla sobre Kanban, vínculos e métricas. A implementação existente foi preservada em um único local, com seu entry point público, sem criar serviços concorrentes.

## Objetivo e baseline

A E2 torna explícita a direção:

```text
Route → Controller → Service → Repository → Prisma/MySQL
                              ↓
                        external client
```

Os contratos HTTP, mensagens, códigos, fórmulas e sete endpoints `501` caracterizados na E1 permanecem como baseline. Nenhuma alteração de schema, migration, autenticação, autorização ou segurança foi introduzida.

## Estrutura anterior e estrutura resultante

Antes, Projects e Traceability concentravam casos de uso, validações, cálculos e mapeamento em um único service; o frontend mantinha `ProjectForm` e `Card` em `src/components` e a página chamava o Axios genérico diretamente.

Estrutura nova relevante:

```text
backend/
├── scripts/check-architecture.js
├── src/
│   ├── modules/
│   │   ├── github/index.js
│   │   ├── projects/
│   │   │   ├── index.js
│   │   │   ├── project.schema.js
│   │   │   ├── project.service.js
│   │   │   └── services/
│   │   │       ├── project-crud.service.js
│   │   │       ├── project-github.service.js
│   │   │       ├── project-invite.service.js
│   │   │       └── project-members.service.js
│   │   ├── requirements/index.js
│   │   ├── tasks/index.js
│   │   └── traceability/
│   │       ├── index.js
│   │       ├── traceability.calculator.js
│   │       ├── traceability.mapper.js
│   │       └── traceability.service.js
│   └── shared/README.md
└── test/
    ├── fixtures/architecture/invalid/
    └── unit/
        ├── architecture-check.test.js
        └── traceability.calculator.test.js

frontend/src/
├── features/projects/
│   ├── api/projects.api.js
│   ├── components/ProjectForm.jsx
│   └── index.js
├── shared/
│   ├── components/Card.jsx
│   └── index.js
├── pages/ProjectsPage.jsx
└── components/                 # reexports temporários compatíveis
```

## Convenções e regras de dependência

As responsabilidades, nomes, entry points, prevenção de ciclos e política de compatibilidade estão em:

- `docs/architecture/MODULE_CONVENTIONS.md`;
- `docs/architecture/FRONTEND_STRUCTURE.md`.

Regras verificadas automaticamente:

- route não importa repository ou Prisma/database;
- controller não importa repository ou Prisma/database;
- repository não importa controller, route ou Express;
- frontend não importa internals do backend;
- não há ciclo evidente entre arquivos do mesmo módulo.

Services permanecem responsáveis por regras e coordenação; repositories mantêm persistência; `github.client.js` continua sem Prisma e substituível nos testes.

## Ferramenta de verificação

Foi criado um script Node sem dependência adicional:

```bash
cd backend
npm run architecture:check
```

O script percorre imports/reexports estáticos `.js`/`.jsx`, resolve caminhos relativos e retorna código 1 com arquivo, regra e import quando encontra uma violação.

Resultados:

- código real: aprovado, zero violações;
- fixture controlada: falhou com código 1 e quatro achados (`route-no-repository`, `controller-no-repository`, `repository-no-controller` e `module-no-cycle`);
- teste automatizado: três casos aprovados.

O workflow de CI não foi alterado; sua integração obrigatória permanece para a E14.

## Módulos migrados

### GitHub — E2.2 concluída

A auditoria confirmou que `github.client.js` encapsula Octokit sem persistência, `githubSync.service.js` orquestra a sincronização e commits/PRs/issues persistem nos repositories próprios. Foi adicionado apenas `github/index.js` como API pública. Paginação, timeout, retry, rate limit, token e filtros atuais foram preservados.

### Projects — E2.3 concluída internamente

`project.service.js` passou a ser uma fachada compatível sobre casos de uso únicos:

- CRUD;
- membros e entrada no projeto;
- convite/código de acesso;
- integração e configurações GitHub.

Validação/normalização específicas ficaram em `project.schema.js`. `Math.random()`, formato `TRC-*`, convite, token global, mensagens e status não mudaram.

### Requirements — E2.4 pendente

Foi criado o entry point explícito `requirements/index.js`, mas o service não foi dividido. CRUD, status, confirmação e cobertura continuam na implementação original e protegidos pelos testes E1. Nenhuma migração parcial concorrente foi iniciada.

### Traceability — E2.5 concluída

O service passou a coordenar repository e saída. Fórmulas puras foram extraídas para `traceability.calculator.js` e DTOs para `traceability.mapper.js`. Testes unitários preservam arredondamento, estados e a regra atual em que issue isolada não é evidência técnica.

### Tasks — E2.6 pendente

Foi criado apenas `tasks/index.js`. `task.service.js`, controller e repository permanecem intactos. A divisão por CRUD, vínculos, Kanban, movimentos e métricas fica bloqueando a conclusão da E2 e deve ocorrer em mudanças menores, cada uma executando a suíte HTTP correspondente.

## Frontend — E2.7 e E2.8 concluídas

A convenção `pages → features → shared` foi documentada. A feature representativa `projects` contém o formulário, chamadas HTTP da página e API pública explícita. `ProjectsPage` continua na pasta de pages e preserva loading, vazio, erro, submissão, mensagens e aparência.

`Card` migrou para `shared/components`. Nenhuma página de Kanban, Tasks, Requirements, Traceability ou detalhes foi reorganizada.

## Arquivos movidos, divididos e compatibilidade

Movidos:

- `src/components/ProjectForm.jsx` → `src/features/projects/components/ProjectForm.jsx`;
- `src/components/Card.jsx` → `src/shared/components/Card.jsx`.

Divididos:

- `project.service.js` em fachada + schema + quatro casos de uso;
- `traceability.service.js` em service + calculator + mapper.

Compatibilidade temporária:

- `backend/src/modules/projects/project.service.js` mantém o export `projectService` e possui `TODO(E2.9)`;
- `frontend/src/components/ProjectForm.jsx` e `Card.jsx` são apenas reexports com `TODO(E2.9)`.

Não existe implementação duplicada.

## Testes adicionados e contratos preservados

Foram adicionados seis testes unitários:

- três do verificador arquitetural;
- três dos cálculos de rastreabilidade.

Os 29 testes HTTP/API da E1 continuaram aprovados após Projects e Traceability. Os testes GitHub continuam usando dublês apenas no ambiente de teste. Os 12 testes frontend continuaram aprovados após a migração da feature.

Foram preservados: rotas, corpos, mensagens, status HTTP, exclusões, vínculos, transações, ator Kanban, cardinalidade da PR, fórmulas, issue isolada, paginação atual e os sete endpoints `501`.

## Cobertura antes e depois

| Área | Momento | Statements | Branches | Functions | Lines |
|---|---|---:|---:|---:|---:|
| Backend | Antes | 56,30% | 40,22% | 59,72% | 55,92% |
| Backend | Depois | 56,58% | 39,88% | 59,72% | 56,32% |
| Frontend | Antes | 10,43% | 12,58% | 9,16% | 10,71% |
| Frontend | Depois | 10,67% | 12,58% | 9,74% | 10,96% |

A pequena variação de branches backend decorre da redistribuição das mesmas regras em novos arquivos e denominadores; statements e lines não caíram. Nenhum arquivo de produção foi excluído da coleta.

## Validação final

| Comando | Resultado |
|---|---|
| Backend `npm ci` | Aprovado, sem mudança de dependências ou lockfile. |
| `npx prisma validate` | Aprovado; schema válido e inalterado. |
| `npx prisma generate` | Aprovado; Prisma Client 6.19.3. |
| Backend `npm test` | 6 arquivos e 40 testes aprovados. |
| Backend `npm run test:unit` | 4 arquivos e 11 testes aprovados. |
| Backend `npm run test:integration` | 2 arquivos e 29 testes aprovados no `traceflow_test`. |
| Backend `npm run test:coverage` | Aprovado com os percentuais registrados acima. |
| Backend `npm run architecture:check` | Aprovado no código real; fixture controlada falhou com código 1. |
| Frontend `npm ci` | Aprovado, sem mudança de dependências ou lockfile. |
| Frontend `npm test` | 5 arquivos e 12 testes aprovados. |
| Frontend `npm run test:coverage` | Aprovado com os percentuais registrados acima. |
| Frontend `npm run build` | Aprovado; permanece aviso não bloqueante de chunk de aproximadamente 546 kB. |

## Limitações, itens não realizados e bloqueios para E3

- Requirements ainda precisa ser dividido por CRUD, status/confirmação e cobertura.
- Tasks ainda precisa ser dividido incrementalmente por CRUD, vínculos, Kanban, movimentos e métricas.
- Reexports/fachada temporários precisam ser removidos na E2.9 após migração de consumidores.
- A verificação usa análise estática simples por regex e não substitui parser/linter completo; imports dinâmicos exigem revisão manual.
- A cobertura direta de `project-github.service.js` e `project-members.service.js` ainda é baixa.
- O bundle frontend mantém o aviso conhecido acima de 500 kB.

**E3 permanece bloqueada** até Requirements e Tasks serem reorganizados com compatibilidade, todas as validações permanecerem verdes e a E2 ser marcada como concluída.

## Confirmações de escopo

Nenhuma migration foi criada. `schema.prisma` não foi alterado. Nenhum endpoint `501` foi implementado ou removido. Nenhuma dependência foi adicionada ou removida. Nenhum mock foi incluído no runtime. Nenhuma regra, contrato HTTP, mensagem, status ou comportamento visual foi intencionalmente alterado. Nenhuma branch, commit, push ou pull request foi criado nesta execução.
