# E12 — Frontend por domínio, estado e acessibilidade

## Estado

**CONCLUÍDA em 26/07/2026.** A etapa reorganizou o frontend por domínio, separou o cliente HTTP dos contratos de cada feature, introduziu cancelamento de consultas obsoletas e componentes compartilhados de estado/acessibilidade, sem alterar regras de negócio, contratos HTTP, schema ou migrations.

## Baseline operacional

- Branch: `daniel-dev`.
- Commit inicial: `b3014c4` (`fix(tasks): reconcile legacy responsibility data before E12`).
- Alterações preexistentes preservadas: os PDFs do TCC/ASVS e `TRACEFLOW_MAPEAMENTO_REFATORACAO.md`, não rastreados.
- Frontend antes da E12: 52 testes em 16 arquivos; 42,55% statements, 40,30% branches, 35,20% functions e 44,29% lines; build aprovado com o aviso preexistente de chunk acima de 500 kB.
- Backend herdado: 198 testes; nenhuma alteração de regra ou contrato foi autorizada pela E12.

## Arquitetura anterior e final

Antes, `src/api/api.js` reunia contratos de todos os domínios e as páginas principais continham simultaneamente HTTP, estado, mutação e apresentação. Componentes específicos de projeto, tarefa e rastreabilidade ainda estavam no diretório genérico `components`.

A direção final é:

```text
app/routes
   ↓
pages (adaptadores finos de rota)
   ↓
features/<domain>/{api,hooks,components,pages}
   ↓
shared + api/http-client
```

Foram consolidadas as features `auth`, `projects`, `github`, `requirements`, `tasks`, `traceability`, `members` e `privacy`. As implementações de Projects, Project Details, Repository, Requirements, Tasks, Kanban e Traceability foram movidas para screens de domínio; os arquivos em `src/pages` apenas compõem a rota. `ProjectSectionNav`, `TaskForm`, `CommitSuggestionsCard`, `KanbanColumn` e `TraceabilityFlow` passaram a pertencer às respectivas features. Os reexports antigos desses componentes e de `routes/AppRoutes` foram removidos após migração dos consumers e regressão verde.

O `architecture:check` agora também impede shared importando features, feature acessando internals de outro domínio e page importando Axios/client HTTP. Integração entre features usa o `index.js` público; internals não importam o próprio índice.

## Cliente HTTP e APIs de domínio

`src/api/http-client.js` contém a única instância Axios e configura:

- `baseURL` por `VITE_API_URL`;
- `withCredentials` para preservar sessão opaca;
- timeout explícito de 15 segundos, configurável por `VITE_API_TIMEOUT_MS`;
- header CSRF somente em POST/PUT/PATCH/DELETE;
- evento global de sessão expirada somente para 401;
- preservação de 403 sem logout;
- suporte nativo a `AbortController`.

`normalizeApiError` entrega à UI `status`, `code`, `message`, `fieldErrors`, `requestId`, classificação de rede e cancelamento. O erro original permanece como propriedade não enumerável para diagnóstico interno. Detalhes de validação são reduzidos a nome de campo e mensagem segura.

Os contratos foram distribuídos em `features/<domain>/api/*.api.js`. As queries usam `params` do Axios e aceitam `signal`. Após a migração de todos os consumers, `src/api/api.js` foi removido; `http-client.js` é exclusivamente infraestrutura e não catálogo de domínio.

## Hooks, cancelamento e estado

`useAbortableRequest` cancela a operação anterior, ignora cancelamentos na UI, evita resposta obsoleta e aborta no unmount. Ele foi aplicado às buscas de commits, Pull Requests, issues e requisitos, aos filtros de repositório, à matriz/detalhe de rastreabilidade e ao carregamento das sugestões RF41.

`useCommitSuggestions` passou a controlar consulta, revisão, permissões, loading e erro do RF41; o componente apenas apresenta a seção. O parser `[TASK-ID]` continua exclusivamente no backend.

Estados reutilizáveis distinguem loading, sucesso vazio, erro e forbidden. `FeedbackRegion` anuncia sucesso por `aria-live` e erro por `role=alert`; erro tem precedência sobre vazio. O estado forbidden preserva a sessão, enquanto 401 limpa o contexto e a rota protegida redireciona ao login.

## Formulários e acessibilidade

`FormInput` associa `label`, `id`, obrigatoriedade, `aria-invalid`, `aria-describedby` e mensagem por campo. Login e registro validam presença antes do request, mapeiam `fieldErrors` seguros do backend, desabilitam submit durante a mutação e movem foco ao primeiro erro. O backend permanece a autoridade final.

`ConfirmProvider` substituiu todos os usos de `window.confirm`. O dialog possui título/descrição, foco inicial no cancelamento, contenção de Tab, Escape, retorno ao acionador e distinção visual da ação destrutiva. `ErrorBoundary` global fornece fallback seguro sem stack e ação de retry/retorno.

Foco visível foi reforçado sem alterar a identidade visual. Todos os links externos encontrados usam `target="_blank"` junto a `rel="noopener noreferrer"`. Tabelas, headings, labels e controles reais existentes foram preservados.

## Capacidades preservadas

- sessão, CSRF e recuperação da sessão;
- RBAC, cuja autoridade permanece no backend;
- sincronização e artefatos GitHub;
- Requirement–Task atômico e DTO canônico de rastreabilidade;
- `responsibleUserId`, histórico paginado e rollback do Kanban em 409;
- busca manual, sugestões automáticas e commits vinculados do RF41;
- snapshots legados pré-identidade da E11.

Não foram adicionados state manager, biblioteca visual ou regra de domínio no frontend. Nenhum schema, migration ou contrato HTTP foi modificado.

## Testes e cobertura

Foram adicionados testes do client HTTP (timeout, credentials, CSRF, 401 e 403), normalização e field errors, cancelamento/resposta obsoleta, estados semânticos, feedback acessível, labels/descrições, dialog por teclado/Escape/restauração de foco e formulários com foco no primeiro erro. Testes existentes foram migrados para as APIs de domínio.

Resultado final frontend:

| Métrica | Antes | Depois |
|---|---:|---:|
| Testes | 52 | 62 |
| Arquivos de teste | 16 | 20 |
| Statements | 42,55% | 47,75% |
| Branches | 40,30% | 42,06% |
| Functions | 35,20% | 37,93% |
| Lines | 44,29% | 50,34% |

O build Vite passa. O aviso de bundle principal superior a 500 kB permanece conhecido; code splitting de rota é candidato da E13, não uma mudança funcional desta etapa.

Na regressão final, os 198 testes backend passaram em 27 arquivos usando exclusivamente `traceflow_test`. `prisma validate`, `architecture:check` e `security:secrets` passaram; o scanner verificou 234 arquivos. O audit backend encontrou zero vulnerabilidades.

O audit frontend mantém duas vulnerabilidades altas direta/transitiva do React Router relacionadas ao modo RSC. O TRACEFLOW utiliza SPA com `BrowserRouter`; a correção automática proposta força versão incompatível. O risco conhecido foi mantido para atualização controlada e nenhum `npm audit fix` foi executado.

## Riscos para E13

- O bundle inicial continua acima de 500 kB e merece lazy loading por rota com medição.
- Screens de Tasks e Kanban ainda são extensas, embora isoladas no domínio; novas decomposições devem seguir fluxos reais e não criar hooks genéricos.
- A cobertura de AuthContext e das rotas globais ainda é menor que a dos novos módulos de infraestrutura.

E13 não foi iniciada.
