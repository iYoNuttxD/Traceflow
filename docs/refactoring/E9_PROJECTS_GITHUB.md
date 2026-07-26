# E9 — Projetos e integração GitHub

## Estado

**CONCLUÍDA TECNICAMENTE — smoke externo não executado.** A implementação, banco isolado, suítes automatizadas, build, arquitetura e segurança foram validados. A chamada real ao GitHub ficou pendente porque não foi fornecido repositório de teste explicitamente autorizado; nenhum token foi exibido ou enviado durante os testes.

## Baseline

- Branch: `daniel-dev`.
- Commit inicial: `ce87c5547ccb6ce0b1d9b658aa0cfb44105fca6d`.
- Data: 25/07/2026.
- Alterações preexistentes preservadas: os três arquivos não rastreados `BES_TCC_Proposta de Desenvolvimento de Ferramenta_v2023 Somativa 2.pdf`, `OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf` e `TRACEFLOW_MAPEAMENTO_REFATORACAO.md`.
- Divergências de fontes: `ADR-001` não existe no checkout (a série começa em ADR-002); o inventário de endpoints da E0 está em `docs/refactoring/E0_ENDPOINTS.md`, e não em `docs/api/`.

## Objetivo e evidência funcional

A E9 endureceu os fluxos já existentes de Projetos e GitHub, sem tratá-los como implementação nova. Os RF01–RF06, RF21, RF22 e RF50 foram confrontados com documentação, código, contratos e o TCC. Os diagramas do TCC confirmam a fronteira client/service, a consulta paginada e a persistência específica de Commit, PullRequest e Issue.

### Matriz dos RFs

| RF | Estado antes | Implementação existente | Refatoração/aprimoramento | Rota | Código principal | Testes | Estado final |
|---|---|---|---|---|---|---|---|
| RF01 | implementado | cadastro comum | contrato preservado e separado do fluxo GitHub | `POST /projects` | `project-crud.service.js` | API E9 + regressão | PRESERVADO |
| RF02 | implementado/parcial | listagem, seleção, integração e validação externa | provider, DTO, paginação e revalidação canônica | `GET /github/repositories`; `POST /projects/from-github` | `github.client.js`; `project-github.service.js` | boundary + API + frontend | APRIMORADO |
| RF03 | implementado/parcial | importação de até 100 commits | paginação e deduplicação por página/projeto/hash | `POST .../github/sync`; `GET .../commits` | `sync-project-commits.service.js` | unitário + integração | APRIMORADO |
| RF04 | implementado/parcial | importação/upsert de até 100 PRs | paginação e upsert por projeto/ID externo | `POST .../github/sync`; `GET .../pull-requests` | `sync-project-pull-requests.service.js` | unitário + integração | APRIMORADO |
| RF05 | implementado/parcial | importação/upsert de até 100 issues | paginação e exclusão defensiva de itens que são PR | `POST .../github/sync`; `GET .../issues` | `sync-project-issues.service.js` | unitário + integração | APRIMORADO |
| RF06 | implementado | consulta consolidada tipada | filtros homologados; alias 501 redundante removido | `GET /projects/:projectId/artifacts` | `artifact.service.js` | API E9 + frontend | HOMOLOGADO |
| RF21 | implementado/parcial | sync manual e estado básico | falha parcial, último sucesso, reprocessamento, auditoria e concorrência | `POST /projects/:projectId/github/sync` | `sync-project-github.service.js` | API E9 | APRIMORADO |
| RF22 | implementado | edição comum | identidade GitHub integrada não pode ser trocada sem validação | `PUT /projects/:id` | `project-crud.service.js` | API E9 | PRESERVADO |
| RF50 | divergente | PRs sem filtro de base | `base` e filtro defensivo usam a branch principal revalidada | `POST /projects/:projectId/github/sync` | `github.client.js` | boundary + integração | CORRIGIDO |

## Estado herdado, inventário e lacunas

O MVP já possuía rotas, controllers, services e repositories funcionais, campos canônicos de repositório/sync no `Project`, models específicos, RBAC, rate limit, timeout/retry, auditoria e telas. As lacunas encontradas foram: Octokit exposto como objeto bruto ao service; token resolvido no próprio client; paginação limitada à primeira página; mapeamento misturado à orquestração; PRs sem filtro da branch alvo; queries de deduplicação abrangendo toda a coleção; limpeza prematura do erro ao iniciar sync; frontend cadastrando seleção GitHub pela rota comum; e um placeholder 501 redundante ao RF06.

Antes, `githubSync.service.js` concentrava client, mapeamento, paginação incompleta, regras de fluxo e coordenação de quatro repositories. Depois, a fachada preserva o import interno anterior e delega a services coesos; o client só fala com GitHub e devolve DTOs, e repositories só persistem.

## Arquitetura resultante

O fluxo externo ficou explícito:

```text
controller → orchestration service → github client → GitHub API
                              ↓
                     domain repositories → Prisma
```

- `github-credential.provider.js`: único fornecedor do PAT sistêmico.
- `github.client.js`: factory injetável, timeout/retry, paginação e operações pequenas.
- `github.mapper.js`: DTOs de repositório, commit, pull request e issue.
- `github-pagination.js`: iteração página a página sem carregar a resposta externa integral antes do processamento.
- `services/sync-project-*.service.js`: orquestração principal e processamento por coleção.
- repositories: persistência por página, sempre limitada por `projectId` e identificador externo.

O verificador passou a proibir client externo acessando database e repository chamando client externo. A fronteira de testes continua substituível sem mock de runtime.

## Cadastro e edição de projetos

O cadastro comum permanece disponível. O cadastro integrado usa `POST /api/projects/from-github`, reconsulta owner/repository no GitHub e persiste somente metadados devolvidos pela fronteira confiável. A branch principal é obrigatória e vem do repositório; não existe fallback silencioso para `main` ou `master`.

A edição comum não pode trocar a identidade de um repositório já integrado. Campos idênticos ainda são aceitos para compatibilidade; alteração exige futuro fluxo especializado. `githubIntegratedAt` é criado na integração e preservado nas sincronizações seguintes.

## Sincronização

Para cada projeto, o backend impede sincronizações concorrentes na mesma instância. Cada tentativa:

1. valida projeto e vínculo GitHub;
2. registra início e mantém o último erro até haver sucesso integral;
3. revalida o repositório e atualiza metadados canônicos;
4. processa commits, pull requests e issues página a página;
5. deduplica commits por `projectId + hash`;
6. faz upsert de PRs e issues por identificador externo, preservando relações de rastreabilidade;
7. marca sucesso somente depois das três coleções.

Se uma coleção posterior falha, lotes já persistidos são mantidos, o último sucesso não é apagado e o projeto fica em `FALHA` com mensagem sanitizada. A nova execução é idempotente. O lock em memória não coordena múltiplas instâncias; esse risco permanece documentado.

## Contratos e frontend

- respostas de sucesso e erros públicos existentes foram preservados;
- `ProjectsPage` envia o cadastro GitHub pela operação especializada;
- `ProjectForm` mantém o estado visual e pode ocultar status nesse fluxo;
- `ProjectDetailsPage` mantém o projeto visível diante de 403, 409 e 429, e só OWNER/MANAGER vê e aciona sync;
- `RepositoryInfoPage` mantém loading, vazio, erro e filtros combinados;
- a rota canônica RF06 continua `GET /api/projects/:projectId/artifacts`;
- o alias legado redundante `GET /api/projects/:projectId/github/artifacts` foi removido após busca de consumidores e agora segue o 404 global;
- os seis demais endpoints de legado continuam retornando 501 quando autenticados.

`GithubArtifactsPage.jsx`, removida na E8, não foi recriada; `RepositoryInfoPage` continua sendo a única tela de artifacts. Não havia consumer frontend ou requisito exclusivo para o alias removido.

## Segurança, autorização, auditoria e privacidade

Listagem, cadastro integrado e sincronização continuam autenticados. Artifacts privados exigem membership; sync é permitido somente a MANAGER/OWNER e permanece sujeito a rate limit. O client herda timeout, retry limitado e normalização de rate limit da E5. Erros persistidos e públicos são sanitizados; logs e eventos não recebem token ou payload externo. Os eventos `GITHUB_SYNC_REQUESTED`, `GITHUB_SYNC_SUCCEEDED` e `GITHUB_SYNC_FAILED` foram preservados, com sucesso somente após as três coleções. O PAT não chega ao frontend, Prisma, auditoria ou responses. Dados GitHub continuam persistidos conforme a política de retenção, mas os DTOs externos descartam campos não utilizados antes da camada de domínio.

## Testes adicionados

- provider de credencial, ausência de token e sanitização;
- DTOs e descarte de payload externo desnecessário;
- paginação, branch alvo, estado de PR e filtragem de issues;
- timeout/retry pela fronteira injetável, sem rede real;
- cadastro comum e GitHub, duplicidade e edição protegida;
- OWNER, MANAGER, MEMBER, VIEWER, sem sessão e sem membership;
- duas páginas de cada coleção, reprocessamento, deduplicação e upsert;
- preservação de `Task.pullRequestId`, `TaskIssue` e data de integração;
- falha parcial, último sucesso, erro sanitizado e auditoria;
- telas de projetos, detalhes e artifacts com loading, vazio, erro e permissões.

## Cobertura e validações

Baseline reproduzida antes da E9:

| Suíte | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Backend | 77,93% | 63,53% | 79,19% | 80,09% |
| Frontend | 15,92% | 16,08% | 15,78% | 15,56% |

Resultado final:

| Suíte | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Backend | 84,25% | 70,46% | 86,28% | 86,91% |
| Frontend | 22,59% | 22,85% | 20,20% | 22,81% |

O backend executou 163 testes em 23 arquivos (90 unitários e 73 de integração/API). O frontend executou 32 testes em 12 arquivos e o build Vite passou, mantendo apenas o aviso preexistente de chunk maior que 500 kB. `architecture:check` e `security:secrets` passaram; 23 migrations estavam aplicadas e sem pendências no banco de teste.

O `npm audit` do backend retornou zero vulnerabilidades. O frontend manteve duas entradas altas, direta/transitiva, do mesmo advisory de React Router RSC; o projeto usa SPA com `BrowserRouter`, sem RSC/actions, e o npm propõe mudança incompatível. Nenhum `audit fix` foi executado.

Não foram adicionadas dependências. O schema Prisma e as migrations permaneceram inalterados. Os testes automatizados não fizeram chamadas reais ao GitHub e usaram apenas o MySQL isolado `traceflow_test`. O smoke local confirmou `/health`, `/health/live` e `/health/ready` em 200; rotas `/api` sem sessão continuaram protegidas por 401. O 404 do alias removido e os 501 autenticados estão cobertos na suíte HTTP.

Arquivos novos concentram provider, paginação, mappers, quatro services de sync, testes E9, ADR-007 e este relatório. Arquivos existentes de GitHub/Projects/repositories, frontend Projects e documentação transversal foram alterados. Nenhum arquivo funcional foi removido; somente o handler/registro do endpoint redundante deixou de existir dentro dos arquivos mantidos.

## Riscos residuais e bloqueios para E10

- PAT sistêmico compartilha quota, escopo e raio de impacto; GitHub App permanece evolução futura.
- lock de sincronização é local à instância; produção horizontal precisa coordenação distribuída.
- lotes já persistidos não são revertidos em falha posterior; o status deixa essa condição explícita.
- paginação é sequencial e segura, mas não há checkpoint persistente entre páginas.
- smoke real exige token válido e repositório de teste expressamente autorizado.
- nenhuma atividade da E10 foi iniciada.
