# TRACEFLOW Frontend

SPA React/Vite para projetos, GitHub, requisitos, tarefas, Kanban, rastreabilidade, auditoria e privacidade.

## Estrutura

```text
app/routes → pages → features/<domain> → shared + api/http-client
```

- `pages`: adaptadores finos de rota;
- `features`: auth, projects, members, github, requirements, tasks, traceability e privacy;
- `shared`: estados assíncronos, formulários, dialog, feedback, hooks e normalização;
- `api/http-client.js`: única instância Axios, CSRF, timeout, 401 e request ID.

Pages não chamam Axios. O backend continua sendo a autoridade para validação e RBAC. Consulte [FRONTEND_STRUCTURE.md](../docs/architecture/FRONTEND_STRUCTURE.md).

## Instalação e execução

```bash
cd frontend
npm ci
npm run dev
```

Variáveis públicas opcionais:

```env
VITE_API_URL="http://localhost:3001/api"
VITE_API_TIMEOUT_MS=15000
```

Nunca coloque segredo em `VITE_*`.

## Rotas e performance

As páginas públicas e protegidas usam `React.lazy` e um `Suspense` acessível. O grafo e `@xyflow/react` ficam no chunk de rastreabilidade. Sessão, CSRF, `ProtectedRoute`, `ConfirmProvider` e `ErrorBoundary` permanecem globais.

## Qualidade

```bash
npm run lint
npm run format:check
npm run test
npm run test:coverage
npm run build
```

A cobertura mínima global é 50% statements, 45% branches, 40% functions e 53% lines. Testes usam Testing Library; dublês ficam somente em teste e representam contratos reais.

## Segurança, privacidade e acessibilidade

- 401 limpa a sessão; 403 preserva a sessão e apresenta acesso proibido;
- requisições obsoletas são canceladas e não sobrescrevem estado atual;
- loading, vazio, erro e forbidden são mutuamente exclusivos;
- confirmações usam dialog acessível, foco e Escape;
- links externos usam `noopener noreferrer`;
- a UI não interpreta `[TASK-ID]`, não escolhe responsável textual e não calcula rastreabilidade.

O RF41 permanece no fluxo de edição de Task: busca manual, sugestões automáticas e commits vinculados são áreas separadas.
