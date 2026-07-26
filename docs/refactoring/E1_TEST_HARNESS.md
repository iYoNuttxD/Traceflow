# E1 — Harness e testes de caracterização do MVP

## Identificação e objetivo

- **Branch analisada:** `daniel-dev`
- **Commit inicial:** `4cdcb941452dc1da0a97d24b1b3ca3f1e07aaacd`
- **Data da execução:** 24/07/2026
- **Objetivo:** criar uma rede inicial de proteção para os contratos e comportamentos atuais do MVP, sem iniciar refatorações ou corrigir comportamentos funcionais.
- **Estado inicial do Git:** árvore limpa, branch sincronizada com `origin/daniel-dev` (`+0/-0`). Não havia alterações locais preexistentes a preservar.

## Ferramentas escolhidas

| Área | Ferramenta | Versão adicionada | Justificativa |
|---|---|---:|---|
| Backend e frontend | Vitest | `4.1.10` | Runner compatível com os módulos ES e com o Vite já utilizado. |
| HTTP backend | Supertest | `7.2.2` | Exercita o Express em memória, mantendo o contrato HTTP real sem abrir porta. |
| Cobertura | `@vitest/coverage-v8` | `4.1.10` | Relatórios textuais, JSON e HTML com o mesmo runner. |
| Frontend | React Testing Library | `16.3.2` | Caracterização pelo comportamento observável e pela acessibilidade. |
| Frontend | jest-dom | `7.0.0` | Asserções de DOM integradas ao Vitest. |
| Frontend | user-event | `14.6.1` | Interações de formulário próximas ao uso real. |
| Frontend | jsdom | `29.1.1` | Ambiente DOM sem navegador e sem backend real. |

Todas foram adicionadas como dependências de desenvolvimento. Nenhuma biblioteca de runtime foi adicionada. Os lockfiles foram atualizados exclusivamente pelo npm para registrar essas dependências. A instalação informou 2 vulnerabilidades no grafo do backend (1 baixa e 1 alta) e 5 no frontend (1 moderada e 4 altas); não foi executado `npm audit fix`, pois uma atualização automática extrapolaria a E1.

## Estrutura criada

```text
backend/
├── .env.test.example
├── test/
│   ├── api/mvp-contracts.test.js
│   ├── fixtures/factories.js
│   ├── helpers/test-database.js
│   ├── integration/test-database-guard.test.js
│   └── unit/
│       ├── github.service.test.js
│       └── githubSync.service.test.js
└── vitest.config.js

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── ...
├── test/
│   ├── components/
│   │   ├── Card.test.jsx
│   │   ├── ProjectForm.test.jsx
│   │   └── TaskForm.test.jsx
│   ├── pages/
│   │   ├── ProjectsPage.test.jsx
│   │   └── TraceabilityPage.test.jsx
│   └── setup.js
└── vitest.config.js
```

Também foram atualizados `.gitignore`, `backend/.env.example`, os dois `package.json` e seus lockfiles. Não houve alteração em arquivos de produção sob `backend/src` ou em componentes/páginas funcionais do frontend.

## Scripts disponíveis

### Backend

| Script | Comando |
|---|---|
| `npm test` | Executa toda a suíte uma vez. |
| `npm run test:watch` | Executa Vitest em modo interativo. |
| `npm run test:unit` | Executa apenas `test/unit`. |
| `npm run test:integration` | Executa `test/integration` e `test/api`. |
| `npm run test:coverage` | Executa a suíte e gera cobertura V8. |

### Frontend

| Script | Comando |
|---|---|
| `npm test` | Executa toda a suíte uma vez. |
| `npm run test:watch` | Executa Vitest em modo interativo. |
| `npm run test:coverage` | Executa a suíte e gera cobertura V8. |

## Banco MySQL exclusivo para testes

Os testes HTTP usam Prisma real e um banco MySQL separado. Nesta execução foi criado e utilizado apenas o banco local `traceflow_test`; o banco de desenvolvimento não foi usado pelos testes.

O helper de teste:

1. exige `TEST_DATABASE_URL`;
2. exige protocolo `mysql:`;
3. exige nome de banco que contenha `test` como segmento;
4. rejeita nomes com `prod` ou `production`;
5. rejeita igualdade entre `TEST_DATABASE_URL` e `DATABASE_URL`;
6. substitui `DATABASE_URL` pela URL validada antes de importar a aplicação e o Prisma;
7. executa apenas `prisma migrate deploy` no banco validado;
8. limpa todas as tabelas em ordem compatível com as chaves estrangeiras entre testes.

Essa proteção possui sete casos de teste. Não é utilizado `prisma migrate reset`. Nenhuma credencial real foi registrada nos arquivos versionados; `.env.test` permanece ignorado, e os arquivos de exemplo contêm somente placeholders.

Exemplo de execução local, sem reutilizar o banco de desenvolvimento:

```bash
cd backend
cp .env.test.example .env.test
# Preencher TEST_DATABASE_URL com um MySQL isolado cujo nome contenha "test".
npm ci
npx prisma validate
npx prisma generate
npm test
```

## Testes backend implementados

### HTTP e persistência real

- `GET /health`: status `200`, `status: "ok"`, mensagem e formato atuais.
- Projetos: criação válida e inválida, lista, detalhe, inexistente e atualização.
- Requisitos: criação, listagem, edição, exclusão, vínculo e desvínculo com tarefa; rejeição entre projetos.
- Tarefas: criação mínima e com requisito, lista, detalhe, edição e exclusão; preservação dos artefatos importados.
- Vínculos técnicos: PR, commit e issue; vínculo, duplicidade quando aplicável, rejeição entre projetos e desvínculo.
- Kanban: quadro, movimento, atualização do status, persistência de `TaskMovement`, histórico com filtros, métricas e movimento inválido sem histórico.
- Rastreabilidade: requisito sem tarefa, tarefa sem evidência, PR, commit e somente issue; percentuais, `implementationStatus`, `hasTechnicalEvidence`, matriz e detalhe atuais.
- Baseline dos sete endpoints não implementados, todos ainda respondendo `501`:
  - `DELETE /api/projects/:id`
  - `GET /api/projects/:id/github/artifacts`
  - `POST /api/projects/:id/trace-links`
  - `GET /api/requirements/:id/traceability`
  - `GET /api/tasks/:id/traceability`
  - `GET /api/github-artifacts/:id/traceability`
  - `DELETE /api/trace-links/:id`

### Fronteira GitHub

Os testes substituem as funções exportadas pelo client e pelos repositories somente dentro do processo de teste. Não foi criado mock ou fallback no runtime.

Foram caracterizados: autenticação simulada, primeira página da listagem de repositórios, propagação de erro do client, sincronização de commits/PRs/issues, não duplicação de commit por hash, upsert de PRs/issues e registro sanitizado de falha. Nenhum token real foi fornecido e nenhuma chamada de rede/GitHub real ocorreu.

## Testes frontend implementados

- `Card`: título, conteúdo e ausência opcional do heading.
- `ProjectForm`: preenchimento, submissão, validação visual corrente, loading e estado desabilitado.
- `TaskForm`: renderização, preenchimento, submissão e estado desabilitado em edição.
- `ProjectsPage`: loading, lista vazia, lista preenchida, erro e submissão do formulário com cliente HTTP substituído.
- `TraceabilityPage`: estado vazio e formato atual de requisito, tarefa e artefato, com cliente HTTP substituído.

O setup usa jsdom, jest-dom, `cleanup` automático e dublês mínimos para `matchMedia`, `ResizeObserver` e `scrollTo`. Os testes frontend não dependem do backend real e não usam snapshots amplos.

## Contratos e comportamentos preservados

- Envelopes, nomes de campos, mensagens e códigos HTTP atuais foram assertados diretamente; nenhum contrato foi padronizado.
- Exclusões implementadas continuam retornando seus status e corpos atuais.
- Artefatos importados permanecem persistidos quando a tarefa é excluída; apenas os vínculos são removidos.
- Issue isolada continua não contando como evidência técnica nas fórmulas atuais de rastreabilidade.
- O ator do movimento Kanban continua aceitando o comportamento textual/membro atual, sem autenticação.
- A listagem GitHub continua caracterizando apenas a paginação atualmente implementada.
- Os sete placeholders continuam retornando `501`.

Esses comportamentos podem ser discutíveis, mas foram preservados deliberadamente. A E1 não os corrige.

## Mudanças mínimas de produção para testabilidade

Nenhuma mudança foi necessária no código funcional. A fronteira já existente em `github.client.js` pôde ser substituída pelo Vitest. As únicas mudanças fora dos testes e da documentação são configurações de runner, scripts npm, exemplos de ambiente, ignore e dependências de desenvolvimento.

## Execuções e resultados

| Comando | Resultado |
|---|---|
| Backend `npm ci` | Sucesso; instalação limpa pelo lockfile. |
| Backend `npx prisma validate` | Sucesso; schema válido. A primeira tentativa no sandbox falhou por bloqueio de acesso ao cache Prisma e passou com acesso autorizado. |
| Backend `npx prisma generate` | Sucesso; Prisma Client 6.19.3 gerado. A primeira tentativa teve o mesmo bloqueio de cache. |
| Backend `npx prisma migrate deploy` em `traceflow_test` | Sucesso; 15 migrations reconhecidas e nenhuma pendente após a preparação automática da suíte. |
| Backend `npm test` | Sucesso; 4 arquivos e 34 testes aprovados. |
| Backend `npm run test:unit` | Sucesso; 2 arquivos e 5 testes aprovados. |
| Backend `npm run test:integration` | Sucesso; 2 arquivos e 29 testes aprovados. |
| Backend `npm run test:coverage` | Sucesso; 34 testes e cobertura gerada. |
| Frontend `npm ci` | Sucesso; instalação limpa pelo lockfile. |
| Frontend `npm run build` | Sucesso; aviso não bloqueante de chunk acima de 500 kB. |
| Frontend `npm test` | Sucesso; 5 arquivos e 12 testes aprovados. |
| Frontend `npm run test:coverage` | Sucesso; 12 testes e cobertura gerada. |
| Asserção deliberadamente inválida em `Card.test.jsx` | Falha esperada: 1 teste falhou e o processo encerrou com código 1. A asserção correta foi restaurada e a suíte voltou a passar. |

## Cobertura inicial

| Área | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Backend | 56,30% (817/1451) | 40,22% (358/890) | 59,72% (218/365) | 55,92% (798/1427) |
| Frontend | 10,43% (155/1486) | 12,58% (156/1240) | 9,16% (43/469) | 10,71% (153/1428) |

No backend, a cobertura inicial concentra-se em projetos, requisitos, tarefas, rastreabilidade e sincronização GitHub. Artifacts, commits, issues e pull requests ainda têm baixa cobertura direta. No frontend, `ProjectForm`, `ProjectsPage` e `TraceabilityPage` são os focos; as páginas grandes de Kanban, tarefas, requisitos, detalhes e o fluxo visual permanecem como lacunas prioritárias para a E13.

Os limiares são deliberadamente iniciais e não excluem artificialmente páginas grandes: backend 20/15/20/20 e frontend 10/10/9/10 para statements/branches/functions/lines.

## Limitações e bloqueios para E2

- A suíte de integração depende de uma instância MySQL acessível e de `TEST_DATABASE_URL` configurada; ela aborta de forma segura quando isso não ocorre.
- A execução local precisa de permissão para acessar o MySQL e o cache do Prisma.
- O build frontend mantém um chunk de aproximadamente 546 kB e emite aviso de tamanho.
- A paginação GitHub incompleta, os endpoints `501`, a ausência de autenticação/autorização e as fórmulas atuais não foram corrigidos.
- A cobertura frontend ainda é pequena em razão do escopo representativo da E1; a ampliação pertence à E13.
- As vulnerabilidades reportadas pelo npm devem ser avaliadas em etapa apropriada, sem atualização automática nesta execução.

Não há bloqueio técnico do harness para iniciar a E2 após revisão manual. A E1 foi concluída com todas as suítes executáveis e verdes.

## Confirmações de escopo

A análise e a implementação foram realizadas na branch `daniel-dev`. Nenhum arquivo funcional foi removido. Nenhuma migration de produção foi criada. Nenhum schema funcional foi alterado. Nenhum contrato de API foi alterado. Nenhuma chamada real ao GitHub ocorreu nos testes. O banco de desenvolvimento não foi utilizado. Nenhuma nova branch foi criada. Nenhum commit foi criado. Nenhum push foi realizado. Nenhum pull request foi aberto.
