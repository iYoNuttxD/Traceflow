# GITHUB-01 — Optional GitHub Project Creation

Data: 2026-10-10. Escopo: RF01/RF02, criação opcional e tratamento mínimo da ausência de integração.

## 1. Baseline

| Verificação anterior às edições | Resultado |
| --- | --- |
| Repositório | `/Users/daniel/Coding/Traceflow` |
| `git status --short` | Limpo |
| `git branch --show-current` | `gt-dev` |
| `git rev-parse HEAD` | `6bc08c2b93468ee6a29e1faefbdcbc88391282bf` |
| `git diff --check` | PASS |
| Node/npm padrão do shell | `v26.10.0` / `11.19.1` |
| Node/npm usados nos gates | `v22.23.3` / `10.9.9`, via `/opt/homebrew/opt/node@22/bin` |

Consulta ao GitHub confirmou [PR #23](https://github.com/iYoNuttxD/Traceflow/pull/23)
`MERGED`, base `main`, head `daniel-dev`, merge no mesmo SHA do checkout.
Não houve alteração preexistente a preservar. Após a validação, o working tree foi transferido
para `daniel-dev` com `git switch daniel-dev`, conforme correção solicitada pelo usuário.
As duas branches apontavam para o mesmo HEAD acima; os 18 arquivos locais foram preservados
integralmente, com hashes conferidos antes e depois da troca. Os gates correspondem ao mesmo
código e commit-base; somente estas referências documentais à branch foram ajustadas depois.
O incremento permanece apenas no working tree de `daniel-dev`. Não foram executados commit,
push, merge, rebase, reset, clean ou stash.

## 2. Documentação/RFs consultados

- `README.md`, `CONTRIBUTING.md`, `TRACEFLOW_ROADMAP_INCREMENTAL.md`.
- `docs/architecture/SYSTEM_ARCHITECTURE.md`, `MODULE_CONVENTIONS.md`, `FRONTEND_STRUCTURE.md`.
- ADRs de autorização, modelo canônico e GitHub App, incluindo ADR-009 e a decisão sucessora ADR-012.
- `docs/api/API_CONTRACTS.md`, `docs/security/AUTHORIZATION_MATRIX.md`.
- `docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_SURFACE_INVENTORY.md`.
- `docs/runbooks/GITHUB_INTEGRATION.md`, histórico E9, matriz técnica de RFs e evidências da PR23.

RF01 permite cadastro básico; RF02 representa integração técnica independente; RF21 continua
condicionado à integração; RF22 preserva edição dos dados básicos. A referência funcional desta
entrega é a missão fornecida e sua correspondência na matriz técnica vigente. Nenhum documento
acadêmico oficial foi alterado. O histórico E9 com PAT foi tratado como histórico; ADR-012 e o
runtime atual, com GitHub App, são a autoridade vigente.

## 3. Fluxo atual auditado

Antes das edições foram inspecionados Projects, NewProjectDialog, ProjectForm, APIs de feature,
catálogo, Overview, edição, Repositório e as camadas backend de criação/autorização/persistência.

| Camada | Obrigatoriedade encontrada no baseline |
| --- | --- |
| NewProjectDialog | Texto apresentava GitHub como condição para cadastrar |
| ProjectForm | Label com `*` e `<select required>` |
| ProjectsScreen | Validação exigia instalação, repository ID, full name e branch; botão bloqueado sem instalação; chamada exclusiva a `createFromGithub` |
| Descoberta GitHub | Lista agregada de repositórios autorizados; cada opção carrega o ID da instalação. Não existe um seletor separado de instalação nessa tela atual |
| API/backend | Dois caminhos já existentes, com contratos diferentes e transações próprias |
| Conclusão | Sucesso fecha dialog e atualiza catálogo; abertura do projeto ocorre pelo card. Não havia redirecionamento automático para Overview |

A conclusão também aguardava a descoberta GitHub após salvar. Essa dependência foi removida da
confirmação: refreshes são leituras posteriores; uma criação confirmada não vira falha nem
permanece bloqueada por essas leituras.

## 4. Backend existente reutilizado

`POST /api/projects` continua usando Route → Controller → project-crud → projectRepository →
Prisma. `POST /api/projects/from-github` continua usando project-github e github-app para validar
instalação, repositório autorizado e disponibilidade. Não há terceiro endpoint.

A única alteração backend de produto foi tornar explícita a ausência da integração no DTO:
create/update carregam a relação, e `publicProject` preserva `githubIntegration: null`. A edição de
projeto integrado retorna sua integração real, sem expor a Installation. Não houve mudança em
validações, permissões, unicidade, transações ou regras da GitHub App.

## 5. Criação sem GitHub

O seletor mostra `Repositório GitHub (opcional)` e `Não vincular repositório agora`. Nome e equipe
continuam obrigatórios; descrição permanece opcional. A submissão sem seleção usa `projectsApi.create`
com somente `name`, `description` e `responsibleTeam`.

Ausência de instalação, lista vazia, erro externo e descoberta pendente não desabilitam o cadastro
local. A descoberta já existente pode ocorrer em segundo plano, mas não é aguardada nem repetida
para salvar localmente. Nenhum ID GitHub vazio/artificial é enviado. Quem selecionou um repositório
pode limpar explicitamente a seleção, inclusive quando a consulta está indisponível.

## 6. Criação com GitHub preservada

Com seleção, o formulário continua usando exclusivamente `/projects/from-github`, com IDs de
instalação/repositório. Não existe fallback local automático se esse POST falha. Autorização da
App, metadados confiáveis, reserva de repositório, unicidade e conflitos permanecem no backend.

Reconexão já existente mantém seleção obrigatória. Os fluxos existentes de recuperação e conflito
com projeto em carência foram cobertos na regressão; nenhuma operação nova de vinculação, troca,
desvinculação ou purge foi implementada. PAT e entrada manual por URL não foram introduzidos.

## 7. Validações

Testes verificam nome ausente, vazio, com espaços, de tipo inválido e acima do limite, equipe
ausente/vazia, status inválido e campos desconhecidos. HTML mantém required para nome/equipe; a
validação React continua protegendo espaços em branco. Repositório selecionado continua exigindo
metadados e instalação válidos. Rate limit continua bloqueando nova submissão durante Retry-After.

Os erros preservam o formulário. Cancelamento/Escape e restauração de foco permanecem no dialog
canônico; não foi criado wizard, novo componente visual ou CSS específico.

## 8. Estado de integração

Ausência legítima: `Project.githubIntegration = null`, apresentada como “Não conectado”. Não existe
linha fictícia `PENDENTE`. O default administrativo permanece `ATIVO`, com os estados anteriores
`ATIVO`, `INATIVO` e `ARQUIVADO`. Nenhum novo Project.status.

**No migration required.** Schema e migrations versionadas permaneceram inalterados.

## 9. Persistência e membership

Project e OWNER permanecem na mesma transação existente. Teste com FK de usuário inexistente força
a falha da membership e comprova rollback completo de Project. No caminho integrado, Project,
OWNER e integração continuam na transação existente.

A suíte local também confirma consulta/listagem/edição, criação de Requirement e Task, exclusão
lógica, recuperação, preservação dos filhos e OWNER ativo. A auditoria física final no schema de
teste retornou `SCHEMA_CONSISTENT`, zero órfãos e zero projetos sem OWNER ativo.

## 10. Indicadores/Health

FIX-03 foi reutilizado. Teste de projeto vazio confirma `freshness.github: null`, nenhum indicador
`STALE` pela ausência de integração, I45 `NO_DATA` com `value: null` e Project Health
`UNASSESSED` com `score: null`. Contagens legitimamente disponíveis continuam seguindo seus contratos.

Não houve edição no motor de indicadores, IndicatorResult, fórmulas, pesos, thresholds ou políticas
de freshness. No Repositório, a apresentação da completude quando não há artefatos passa a “Sem
dados”, sem modificar o contrato/fórmula backend de RF06 nem fabricar um percentual visual.

## 11. Overview sem integração

Overview mostra estado neutro “Não conectado” e “Este projeto ainda não possui um repositório
GitHub vinculado.” Ação e consulta de status de sincronização não são montadas sem integração.
Projeto, equipe, edição e navegação continuam acessíveis. Nenhum CTA de conexão posterior foi
adicionado. O link já existente para configuração da GitHub App permanece funcional no cadastro.

Repositório já aceita a relação ausente e recebe branches/artefatos vazios sem erro; seu estado
vazio existente foi mantido. O gerenciamento completo fica fora desta rodada.

## 12. Autorização

| Cenário | Resultado verificado |
| --- | --- |
| Cadastro anônimo, ambos os endpoints | 401 |
| Cadastro autenticado sem CSRF, ambos os endpoints | 403 |
| E-mail não verificado, ambos os endpoints | 403 `EMAIL_VERIFICATION_REQUIRED` |
| Payload local inválido | 400 `VALIDATION_ERROR`, sem Project/membership |
| Cadastro válido local/integrado | 201, OWNER correto |
| Projeto alheio: detalhe, membros, requisitos, tarefas e artefatos | 404, sem exposição |
| VIEWER editando dados básicos | 403 |
| Sync/configuração GitHub sem integração | 400, sem GitHubSyncRun e sem chamada externa |
| Repositório já usado ou reservado | Rejeição e proteção existentes preservadas |

Os middlewares de sessão, CSRF, verificação e autorização não foram alterados. Auditoria
`PROJECT_CREATED` foi verificada para criação local; não houve ampliação de permissões.

## 13. Banco isolado

Antes dos testes, URLs foram examinadas apenas por destino sanitizado:
`DATABASE_URL → localhost:3306/traceflow`; `TEST_DATABASE_URL → localhost:3306/traceflow_test`.
O helper valida a separação e o nome de teste. O Prisma em `NODE_ENV=test` fixa seu datasource
em TEST_DATABASE_URL; o cleanup confere `SELECT DATABASE()` dentro da mesma transação das exclusões.

Somente `traceflow_test` recebeu migrations, fixtures, testes e runtime. A migration já versionada
`20261009120000_task_responsibility_snapshot_state`, pendente nesse schema, foi aplicada ali;
ao final, as 64 migrations estavam aplicadas. Nenhuma migration nova foi criada.

O harness de navegador repetiu a validação de destino e confirmou a conexão real em `traceflow_test`
antes de importar a aplicação e persistir fixtures. Nenhum teste ou comando de escrita foi dirigido
ao banco de desenvolvimento; não houve seed/reset/cleanup/delete/truncate nele. Credenciais,
cookies e tokens não foram registrados no relatório ou no repositório.

O servidor local retornou `VERSION() = 26.7.0`. Como não reproduz a imagem `mysql:8.4.8` da CI,
esta execução é local e não é denominada CI-equivalent. Não foi produzido snapshot comparativo de
desenvolvimento, nem alegada preservação byte a byte de um banco usado por outros processos.

## 14. Testes focados

| Execução final | Resultado |
| --- | --- |
| Backend: projects-without-github, projects-github-e9, project-access-l5-1, project-deletion, mvp-contracts, indicators-p7, github-app.service, prisma-client-safety | 8 arquivos, 131 testes PASS |
| Frontend: ProjectsPage, ProjectForm, ProjectDetailsPage, RepositoryInfoPage, ProjectAdminPages, ProjectAccessFlows | 6 arquivos, 89 testes PASS |

`projects-without-github.test.js` acrescenta 18 cenários de API/persistência. A regressão integrada
também verifica que editar dados básicos não perde a integração no DTO. No frontend, cenários novos
cobrem ausência/erro/loading de GitHub, limpeza de seleção, validações, confirmação independente de
refresh, Overview sem sync e Repositório sem percentual artificial.

Uma primeira execução identificou fixture incompleta no teste novo de rollback (faltava accessCode).
A fixture foi corrigida para atingir a violação FK da membership, sem mudar código de domínio,
timeout, retry ou assertiva esperada.

## 15. Gates completos

Todos os comandos Node/npm usaram Node 22.23.3. Testes frontend usaram também
`NODE_OPTIONS=--no-experimental-webstorage` e execução serial `--maxWorkers=1 --no-file-parallelism`.
O backend mantém a configuração serial canônica. O gate de cobertura executa a suíte completa;
ela não foi duplicada sem necessidade em outro comando de teste completo.

| Gate | Resultado |
| --- | --- |
| Backend `npm run test:coverage` | 147 arquivos PASS; 1.731 testes PASS; 2 arquivos/5 testes skipped já existentes |
| Frontend `npm run test:coverage -- --maxWorkers=1 --no-file-parallelism` | 117 arquivos, 1.433 testes PASS |
| Backend/frontend `npm run lint` | PASS |
| Backend/frontend `npm run format:check` | PASS |
| Prisma validate / generate | PASS, Prisma 6.12.0 |
| Test migrations / status | PASS, 64 aplicadas |
| `npm run db:lr5:audit -- --test` | PASS, SCHEMA_CONSISTENT |
| `npm run architecture:check` | PASS |
| Frontend `npm run build` | PASS |
| Política local de CI, audit e inventário: `node --test scripts/check-npm-audit.test.mjs scripts/validate-ci.test.mjs scripts/check-ui-inventory.test.mjs` | 86 testes PASS |
| Formatação do workflow, scripts de CI e política de exceções | PASS |
| `npm run security:secrets` | PASS |
| Audit canônico backend/frontend | PASS, 0 HIGH, 0 CRITICAL, sem exceções utilizadas |
| `git diff --check` | PASS |

| Cobertura | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| Backend | 92,56% | 86,79% | 95,67% | 94,85% |
| Frontend | 85,85% | 80,57% | 81,71% | 88,33% |

Os 5 skips são das suítes históricas E6/E11 destinadas a schema pré-LR.2; nenhum skip ou relaxamento
foi introduzido. Build informa avisos de IIFE/ELK e chunks acima de 500 kB, sem falha. Restrições de
rede/MySQL do sandbox foram resolvidas pela execução autorizada fora dele, mantendo os mesmos
gates e destino isolado. CI remoto e Dependency Review de PR não foram executados nesta rodada.

## 16. Validação runtime

Chromium real, React/Vite em `localhost:5178`, Express em `localhost:3018`, sessão/CSRF e persistência
reais em `traceflow_test`. Somente o client externo de descoberta GitHub foi substituído no processo
do harness por repositórios artificiais. Routes, controllers, services, autorização da instalação,
reserva/unicidade e repositories foram exercitados integralmente. Não houve mock de sucesso de
criação no navegador.

| Matriz | Local | GitHub | Cancelar/required/foco | Overview local / Repositório | GitHub 503 → cadastro local |
| --- | --- | --- | --- | --- | --- |
| 1440 × 900, Light | PASS | PASS | PASS | PASS | PASS |
| 1440 × 900, Dark | PASS | PASS | PASS | PASS | PASS |
| 390 × 844, Light | PASS | PASS | PASS | PASS | PASS |
| 390 × 844, Dark | PASS | PASS | PASS | PASS | PASS |

Foram registrados 28 grupos de verificações, incluindo 24 inspeções DOM/layout de estados
renderizados. As quatro combinações confirmaram OWNER, `githubIntegration: null`, criação integrada
ACTIVE, opção ocupada desabilitada, retorno à listagem e acesso correto ao projeto pelo card.
Somente nome/equipe são required no cadastro local. Zero page errors, zero overflow horizontal nos
containers inspecionados e controles do formulário com alvo de pelo menos 44 px.

O harness foi ajustado para respeitar o contexto já expandido no desktop; não houve aumento de
timeout/retry. Ausência de repositórios e descoberta ainda pendente também estão cobertas pelos
testes React com promises controladas.

Nenhum screenshot ou pasta de evidência visual foi gerado. Esta é verificação automatizada no
renderer, DOM e estilos computados, não homologação visual completa por inspeção de imagens,
leitor de tela, dispositivo físico ou outros navegadores. As surfaces afetadas ficaram
`TECHNICALLY VERIFIED` no inventário, preservando a separação das aprovações históricas.

## 17. Limitações desta entrega

- GitHub externo, instalação/OAuth novo e webhook reais não foram homologados; o teste integrado
  local usa fronteira externa controlada e não altera nenhum repositório/instalação real.
- Não há gerenciamento completo nem novo caminho de vinculação posterior exposto.
- Não há troca/desvinculação de repositório, remoção de artefatos ou reconstrução de vínculos novos.
- CI remoto, equivalência com MySQL 8.4.8 e homologação visual completa permanecem separados.
- O pós-cadastro preserva a navegação vigente: fecha o dialog, atualiza a lista e permite abrir o
  card. Não foi adicionado redirecionamento automático novo.

## 18. Dependências de GITHUB-02/GITHUB-03

**GITHUB-02 — PENDENTE:** vinculação segura a projeto existente e sincronização inicial.
O endpoint PUT de reconexão encontrado no baseline foi somente auditado/preservado; sua existência
não foi usada para declarar a próxima entrega concluída.

**GITHUB-03 — PENDENTE:** gerenciamento e UX canônica da integração na configuração do projeto.

GITHUB-01 não deve ser disponibilizado isoladamente. Não houve deploy, publicação, commit ou push;
o working tree local isola esta etapa, sem feature flag complexa. A liberação requer integração das
três entregas. Não foi iniciado GITHUB-02.

## 19. Final verdict

**GITHUB-01 OPTIONAL PROJECT CREATION — PASS LOCAL**

Cadastro local consistente, criação integrada preservada, guards e lifecycle verificados,
gates locais aprovados e matriz runtime concluída dentro dos limites acima. O veredito não é
aprovação de release nem de GitHub externo/CI remoto/homologação visual completa.

Sugestão de commit, sem executá-lo:

```text
feat(projects): allow project creation without github integration
```
