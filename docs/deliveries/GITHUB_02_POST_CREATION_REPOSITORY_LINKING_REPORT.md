# GITHUB-02 — Post-creation GitHub Repository Linking

Data: 2026-10-10. Entrega backend de RF02, com RF01/RF21/RF22 preservados.

## 1. Baseline

| Verificação anterior às edições | Resultado |
| --- | --- |
| Checkout | `/Users/daniel/Coding/Traceflow` |
| `git status --short` | Limpo |
| `git branch --show-current` | `daniel-dev` |
| `git rev-parse HEAD` | `997e98793ce306f32ca1f91665427d1bdeaa8969` |
| Último commit já presente | `feat: implement optional GitHub repository integration for project creation` |
| `git diff --check` | PASS |
| Node/npm padrão do shell | `v26.10.0` / `11.19.1` |
| Node/npm usados nesta entrega | `v22.23.3` / `10.9.9`, via `/opt/homebrew/opt/node@22/bin` |

GITHUB-01 já estava incorporado ao HEAD pelo usuário. Não havia alterações locais a preservar;
seu código e suas evidências históricas foram mantidos. Branch/HEAD continuam os mesmos.
Nenhum commit, push, merge, rebase, reset, clean, stash ou deploy foi executado nesta rodada.

Antes de implementar foram consultados README, CONTRIBUTING, roadmap, arquitetura/convenções,
ADRs de autorização, GitHub App/OAuth e exclusão recuperável, API contracts, authorization matrix,
RF technical matrix, runbooks GitHub e purge e o relatório GITHUB-01. RF01/RF02/RF21/RF22 seguem
a missão funcional e a matriz técnica; nenhum documento acadêmico oficial foi alterado.

## 2. Fluxo atual auditado

| Operação no baseline | Implementação e conclusão |
| --- | --- |
| `POST /api/projects` | project-crud → projectRepository: Project + OWNER atômicos, sem integração |
| `POST /api/projects/from-github` | project-github → `resolveAuthorizedRepository` / `assertRepositoryAvailable` → Project + OWNER + Integration na transação |
| `PUT /api/projects/:projectId/github/integration` | github.routes → githubAppController → githubAppService → githubRepository; já aceitava primeira vinculação e reconexão |
| `POST .../github/sync` | githubController → githubSyncService → run persistido + worker no processo |
| Repetição da conexão | Baseline sobrescrevia configuração/estado de sync da integração; não havia política explícita sem escrita |
| Auditoria | Baseline registrava conexão fora da transação, pelo controller |

Foram lidos o client Octokit/factory por instalação, credential provider/ADR, validation schemas,
autorização central, schema Prisma, reservas e lifecycle, repositories de conexão, sync e exclusão,
worker, presenter e os clients frontend. A auditoria precedeu todas as alterações de código.

## 3. Reutilização da GitHub App

`resolveAuthorizedRepository` permanece compartilhado com a criação integrada. Ele exige
`GitHubInstallationAuthorization`, instalação ACTIVE e consulta paginada ao escopo vivo com
Installation Token. Não foi criada outra implementação de descoberta/autorização.

OAuth continua identidade de login; GitHubIdentity não é pré-requisito. Tokens, secrets e chaves
não são persistidos ou retornados. Nos testes/runtime apenas a fronteira externa é controlada;
as validações locais da App são reais. Nenhuma instalação ou repositório GitHub real foi alterado.

## 4. Novo endpoint

**Reutilizado o endpoint existente:** `PUT /api/projects/:projectId/github/integration`.
Não foi criada uma rota duplicada `POST .../github/connect`. A operação agora completa a primeira
vinculação, com auditoria transacional, revalidação local e solicitação de sincronização inicial.

A reconexão já existente permanece para RECONNECT_REQUIRED e a mesma identidade de repositório.
Não permite substituir instalação já associada. Legado sem repository ID exige correspondência
com o full name persistido; o ID canônico pode então ser preenchido pela fonte autorizada.

## 5. Contrato da API

Payload estrito: `githubInstallationId` como string numérica e `githubRepositoryId` como string
numérica ou inteiro. Nome, URL, branch, privacidade, actorUserId e metadados redundantes do cliente
são rejeitados. O backend usa somente o repositório retornado pela App.

Sucesso preserva HTTP 200 e retorna `{message, project, integration, initialSync}`. Project usa
`publicProject`; Integration utiliza os mesmos campos públicos, mais id/projectId, sem a relação
Installation ou seu ID interno. `initialSync` contém `{status, run, error}` na primeira conexão,
com run canônico correlacionável; é null na reconexão legada. Consulte o contrato completo em
[API_CONTRACTS](../api/API_CONTRACTS.md#github-02--vinculação-posterior).

## 6. Autorização

| Cenário executado | Resultado |
| --- | --- |
| Anônimo | 401 |
| Sem CSRF | 403 CSRF_INVALID |
| E-mail não verificado | 403 EMAIL_VERIFICATION_REQUIRED |
| Conta DELETION_PENDING | 403 ACCOUNT_DELETION_PENDING |
| VIEWER / MEMBER / MANAGER | 403 antes de GitHub |
| Sem membership / inexistente / soft-deleted | Mesmo 404 opaco, antes de GitHub |
| OWNER válido | 200 |

OWNER e membership ativa são revalidados dentro da transação, depois da consulta externa.
Perda do papel retorna 403; perda da membership retorna 404. Nenhuma permissão de sync foi
alterada: retry manual continua MANAGER+, protegido por sessão, conta, verificação e CSRF.

## 7. Validação de instalação/repositório

Testes cobrem instalação inexistente, não autorizada, suspensa/removida; repositório ausente do
escopo informado; erros externos 403/404/429/503; payloads inválidos e tentativa de fornecer
metadados. Nenhuma integração/auditoria de sucesso/run é persistida nesses casos.
Erros ExternalServiceError já normalizados pelo client recebem mensagens públicas constantes;
falhas temporárias que antes chegavam como 500 genérico tornam-se 503 EXTERNAL_SERVICE_ERROR.
Acesso negado, recurso ausente e rate limit preservam 403/404/429 e seus códigos próprios.

Após validação externa, locks compartilhados revalidam instalação ACTIVE e autorização local.
Revogação/suspensão durante a consulta externa impede a escrita. Os locks não englobam GitHub.

## 8. Repository reservation

`assertRepositoryAvailable` e `ProjectGitHubIntegration.githubRepositoryId @unique` permanecem
canônicos. A linha de integração conserva a reserva em soft delete, inclusive antes de purge.
OWNER recebe apenas o DTO mínimo de recuperação; usuário sem acesso ao projeto reservado não
recebe identidade/nome desse projeto. A reserva só é liberada após purge confirmado.

Precheck orienta a mensagem; a constraint continua decidindo exclusividade em concorrência.
P2002 é traduzido para conflito, reconsultando o estado autorizado da reserva; contenção P2034
retorna 409, sem retry artificial. Não há liberação implícita nem nova tabela de reservas.

## 9. Concurrency

MySQL isolado real, usando a barreira existente de chegada de transações. Nenhum resultado de
query/lock foi simulado para estabelecer exclusividade.

| Disputa | Resultado |
| --- | --- |
| Projetos A/B → mesmo repo | Uma confirmação; outra 409; uma integração/auditoria/run |
| Mesmo projeto → mesmo repo | Uma confirmação; outra 409; nenhum sync adicional |
| Mesmo projeto → repos distintos | Uma confirmação; outra 409; sem substituição |
| Criação integrada × vinculação posterior → mesmo repo | Uma confirmação; outra 409; Project/OWNER do perdedor criador sofrem rollback |
| Exclusão enquanto GitHub aguarda | Exclusão confirma sem aguardar GitHub; conexão retomada recebe 404 |
| Papel/membership/instalação/autorização revogados enquanto GitHub aguarda | Revalidação nega 403/404; nenhuma integração |

Locks seguem Project → ProjectMembership → instalação/autorização compartilhadas. As leituras
de lifecycle são atuais e compatíveis com a exclusão. `INATIVO` e `ARQUIVADO` não bloqueiam writes
na política central vigente; permanecem inalterados. Não foi inventada uma restrição administrativa.

## 10. Persistência

Sem integração, a transação cria somente ProjectGitHubIntegration e AuditEvent. Não recria
Project, projectId, OWNER ou membership. Constraint única de projectId impede duplicidade.
Falha da auditoria após INSERT da integração provoca rollback completo; teste comprova que
Project/membership/grafo permanecem iguais e uma tentativa posterior consegue vincular.

## 11. Preservação dos dados locais

Fixture com Requirement, Task, Sprint, SprintTask, Milestone, TaskMovement, TaskHistoryEntry,
Comment, TimeEntry, TestCase/Steps/Version/History, TestExecution/Steps, Defect/History e relações
de rastreabilidade. Comparação integral antes/depois da vinculação inclui Project, memberships,
histórico de auditoria preexistente, vínculos TestCase–Task/Defect–Task e evidência técnica legada.

Todos os registros locais permanecem iguais antes de liberar o sync. A sincronização subsequente
usa os upserts técnicos existentes, preservando evidências ausentes na resposta externa. A
presença de evidência legada na fixture não fabrica integração para um projeto local novo.

## 12. Estados da integração

- Ausência: `githubIntegration: null`.
- Primeira vinculação confirmada: integração ACTIVE, `lastSyncStatus: PENDENTE`.
- Run: QUEUED/RUNNING/SUCCEEDED/FAILED, sem novo enum persistido.
- Falha de sync: integração preservada, `lastSyncStatus: FALHA`, erro público seguro.
- Reconexão legada: RECONNECT_REQUIRED → ACTIVE, mesma identidade; sem novo sync automático.

GET de projeto já expõe repositório, branch, status, integratedAt, autoSyncEnabled, lastSyncAt,
lastSyncStatus, lastSyncError e lastSyncAttemptAt. Status/progresso/run continuam no GET existente
de sync. Não foi criado endpoint adicional de consulta nem alterado Project.status.

## 13. Sincronização inicial

Só o vencedor de uma primeira vinculação chama `githubSyncService.requestProjectGithubSync`,
depois do commit da integração/auditoria. Reutiliza claim persistido, worker, paginação e ingestão
de branches, commits, PRs, eventos de lifecycle e issues. O DTO QUEUED não afirma sucesso de sync.

Testes usam a seam de scheduler já existente para liberar deterministicamente o worker. A
validação runtime separada usa o scheduler padrão `setImmediate` e HTTP real, sem mock do service.

## 14. Falha de sincronização

Erro ao solicitar o run retorna conexão HTTP 200 com `initialSync.status: FAILED`, run null e
mensagem sanitizada. O serviço tenta registrar FALHA na integração; falha dessa gravação também
não converte o vínculo confirmado em erro HTTP. Nesse caso excepcional o DTO initialSync relata
a falha, mas o estado persistido pode continuar PENDENTE até novo sync.

Erro posterior do worker registra o run FAILED e a integração FALHA, mantendo o último sucesso
quando houver, lotes já persistidos, Project e reserva. Teste interrompe especificamente a etapa
ISSUES depois de commits, PR e evento de lifecycle persistidos. Mensagem externa bruta não vaza.

## 15. Retry/idempotência

Retry usa POST de sync existente. Após falha parcial, duas sincronizações bem-sucedidas deixam
exatamente um Commit, PullRequest, Issue, GitBranch, CommitBranch e PullRequestLifecycleEvent por
identidade da fixture. Integração e evento de conexão permanecem únicos.

PUT repetido sobre ACTIVE retorna 409 GITHUB_PROJECT_ALREADY_CONNECTED. Outro repo retorna
409 GITHUB_REPOSITORY_SWAP_FORBIDDEN. Não sobrescreve configuração, integratedAt ou estado de sync,
não registra sucesso e não agenda trabalho extra. Reconexão preserva integratedAt conhecido.

## 16. Auditoria

GITHUB_PROJECT_CONNECTED usa buildAuditEvent/auditRepository existentes, dentro da transação.
Registra actorUserId, projectId, resourceId da integração, requestId, occurredAt e metadado
minimizado githubRepositoryId. Esse identificador técnico foi adicionado à allowlist central.
Nenhum token, key, payload externo ou dado privado de outro projeto entra no evento.
Tentativa concorrente rejeitada e rollback não criam auditoria de sucesso duplicada.

## 17. Banco isolado

URLs verificadas apenas por destino sanitizado: desenvolvimento `localhost:3306/traceflow`;
TEST_DATABASE_URL `localhost:3306/traceflow_test`. Helper exige URL de teste explícita/distinta;
Prisma em NODE_ENV=test fixa datasource de teste. Cleanup confere SELECT DATABASE() na mesma
transação das exclusões. Runtime também validou o nome da conexão real antes das fixtures.

Somente traceflow_test recebeu fixtures, migrations já versionadas e mutações. Nenhum seed,
reset, cleanup, truncate, delete, benchmark ou migration foi dirigido ao banco de desenvolvimento.
Credenciais/cookies/CSRF não foram impressos no relatório. Nenhum novo fallback de banco foi criado.

## 18. Testes focados

| Bateria | Resultado |
| --- | --- |
| Backend: conexão, ambos os cadastros, acesso, autorização, exclusão, cardinalidade, corridas de lifecycle, App/controller/repository/sync e guarda Prisma | 14 arquivos / 204 testes PASS |
| Complemento final de legado: github-project-connect, github.repository, github-app.service, github-cardinality | 4 arquivos / 87 testes PASS |
| Complemento final de erros externos: github-project-connect, github-app.service, github-app.controller | 3 arquivos / 76 testes PASS |
| Frontend: github-api, ProjectsPage, ProjectDetailsPage, RepositoryInfoPage, ProjectAdminPages | 5 arquivos / 79 testes PASS |

Nova suíte HTTP contém 44 cenários de conexão. A primeira execução identificou fixtures externas
com nomes de campos diferentes do mapper canônico e uma expectativa incorreta de sync para repo
sem branches. Fixtures/expectativas foram alinhadas ao contrato existente; o sync não foi alterado.
Um assert de privacidade também foi refinado para não confundir repositoryPrivate com erro bruto.
Não houve aumento de timeout, retries de testes, skips novos ou redução de thresholds.

## 19. Full backend

`npm run test:coverage`: **148 arquivos PASS; 1.775 testes PASS; 2 arquivos / 5 testes skipped
preexistentes**. Cobertura final: statements 92,63%, branches 86,95%, functions 95,68%, lines 94,90%.
O gate completo foi repetido após os ajustes de proteção do legado e classificação pública
das falhas externas. O runtime HTTP também passou novamente no código final.

O comando canônico `npm run test:coverage` executa unitários, API e integração. Os cinco skips
preexistentes pertencem às suítes históricas E6/E11 destinadas a schema pré-LR.2 e não foram
alterados. Execução serial conforme vitest.config. Lint e format:check passaram no código final.

## 20. Full frontend

`npm run test:coverage -- --maxWorkers=1 --no-file-parallelism`: **118 arquivos / 1.435 testes PASS**.
Node 22, com NODE_OPTIONS=--no-experimental-webstorage. Coverage: statements 85,86%, branches
80,57%, functions 81,74%, lines 88,34%. Lint, format:check e build PASS.

A única alteração frontend corrige shadowing no wrapper existente githubApi.connectProject,
para que ele retorne o DTO em vez de tentar chamar o payload como função. Dois testes verificam
vínculo confirmado com sync falho e propagação de conflito. Nenhuma surface, CTA, layout ou
navegação foi alterada. Build mantém os avisos existentes de IIFE/ELK e chunks acima de 500 kB.

## 21. Prisma/migrations

**NO MIGRATION REQUIRED.** Project.githubIntegration opcional e unique de projectId/repositoryId
já atendem à operação. Schema e migrations versionadas inalterados. Prisma validate e generate
PASS (6.12.0); db:test:migrate/status PASS, 64 migrations aplicadas no schema de teste.
Auditoria física: SCHEMA_CONSISTENT, zero órfãos, zero Projects sem OWNER ativo.

## 22. Arquitetura

Architecture check PASS. Route → Controller → Service → Repository → Prisma preservado.
Controller adapta o resultado por publicProject; service coordena autorização/GitHub/transação/
sync; repository contém queries/locks e usa o adapter central de auditoria. Sem nova camada,
serviço paralelo de sincronização, refatoração ampla ou dependência.

## 23. Segurança

| Gate | Resultado |
| --- | --- |
| Scanner de segredos | PASS |
| npm audit canônico backend | 0 HIGH / 0 CRITICAL; nenhuma exceção usada |
| npm audit canônico frontend | 0 HIGH / 0 CRITICAL; nenhuma exceção usada |
| Política local CI/audit/inventário | 86 testes PASS |
| Formatação de workflow/scripts/política de audit | PASS |
| git diff --check | PASS |

Runtime isolado separado: Express em listener TCP real, fetch, sessão/CSRF, Prisma e scheduler
padrão. Cinco grupos PASS: vínculo pendente + dados locais + repetição; GET + sync concluído;
falha GitHub antes da vinculação; falha inicial preservando reserva; retry/deduplicação. O processo
encerrou listener e conexão. Nenhuma screenshot, captura ou evidência visual binária foi produzida.

## 24. Documentação

Atualizados API_CONTRACTS, AUTHORIZATION_MATRIX, SYSTEM_ARCHITECTURE, runbook GitHub, matriz RF,
roadmap e este relatório. Evidência técnica RF02 ampliada; texto acadêmico preservado. Contrato
documenta a reutilização do PUT, permissões, payload/DTO, conflitos, estados e limites de sync.

## 25. Dependências de GITHUB-03

GITHUB-01 permanece PASS LOCAL. GITHUB-02 fornece o backend para a futura seção de integração.
**GITHUB-03 — PENDENTE:** seleção, confirmação, status e gerenciamento de sync na configuração
do projeto, usando componentes canônicos. Nenhuma interface incompleta ou CTA novo foi exposto.
Não foi iniciado GITHUB-03. Liberação continua bloqueada até sua integração e validação final.

## 26. Limitações

- GitHub externo/OAuth/instalação/webhooks reais não foram homologados; doubles existem somente
  na fronteira externa de testes/runtime, sem fallback no produto.
- Servidor local informa VERSION() = 26.7.0; não é a imagem mysql:8.4.8 da CI. PASS LOCAL não
  significa CI-equivalent. CI remoto, Dependency Review de PR e upgrades históricos em schemas
  descartáveis não foram reexecutados nesta entrega sem mudança estrutural.
- Worker continua no processo da API, sem fila/outbox durável. Interrupção entre commit e
  solicitação de sync pode deixar integração pendente; recuperação usa sync canônico. Não há
  alegação de execução garantida em produção horizontal.
- Repo sem branches continua vinculado, mas sync conserva a falha canônica de branches ausentes.
- Falha simultânea do agendamento e da gravação de seu erro pode manter PENDENTE no banco;
  resposta da vinculação ainda comunica corretamente initialSync FAILED e permite retry.
- Troca, desvinculação, substituição de instalação e exclusão de artefatos não foram implementadas.

## 27. Final verdict

**GITHUB-02 POST-CREATION REPOSITORY LINKING — PASS LOCAL**

Vinculação posterior segura pela rota existente, dados locais preservados, OWNER/CSRF e reserva
revalidados, concorrência protegida, auditoria atômica e sync/retry canônicos confirmados.
Backend/frontend completos e gates locais passaram no código final, com runtime HTTP isolado.
Os limites acima permanecem explícitos. Não há pendência de implementação desta entrega;
liberação ao usuário final permanece bloqueada por GITHUB-03.

Sugestão de commit, sem executá-lo:

```text
feat(github): support linking repositories to existing projects
```
