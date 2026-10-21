# Matriz de autorização da API TRACEFLOW

A matriz descreve a política efetiva vigente e não substitui os testes. `L` = leitura, `E` = escrita
de domínio, `A` = administração. Sem membership ativa, recursos de projeto retornam `404` para
reduzir enumeração; papel insuficiente retorna `403`. Mutations autenticadas exigem CSRF.

| Endpoints                                                                                                      | Anônimo | VIEWER |      MEMBER | MANAGER | OWNER | Regra adicional                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------: | -----: | ----------: | ------: | ----: | -------------------------------------------------------------------------------------------------------------- |
| `GET /health`, `/health/live`, `/health/ready`                                                                 |       L |      L |           L |       L |     L | públicos                                                                                                       |
| `POST /api/auth/register`, `login`, `forgot-password`, `reset-password`, `email-verification/verify`           |       E |      E |           E |       E |     E | públicos, limiter sensível                                                                                     |
| `GET /api/settings/account/email-change/confirm`, `/api/account/reactivation/confirm`                          |       E |      E |           E |       E |     E | públicos; token hashado, expirável e de uso único                                                              |
| `GET /api/auth/me`, `csrf`; `POST logout`, `change-password`, `email-verification/resend`; `PATCH username`    |     401 |      E |           E |       E |     E | própria sessão; mutations exigem CSRF                                                                          |
| `POST /api/projects` e `/projects/from-github`                                                                 |     401 |      E |           E |       E |     E | e-mail verificado; criador vira OWNER                                                                          |
| `GET /api/projects`                                                                                            |     401 |      L |           L |       L |     L | ativos por membership; `deletedProjects` somente para OWNER histórico/atual e antes do purge                   |
| `GET /api/projects/:id`                                                                                        |     401 |      L |           L |       L |     L | membership no projeto                                                                                          |
| `GET /api/projects/:projectId/events`                                                                          |     401 |      L |           L |       L |     L | SSE read-only, membership ativa, query sem credenciais                                                         |
| `PUT /api/projects/:id`                                                                                        |     401 |    403 |         403 |     403 |     A | configuração do projeto                                                                                        |
| `DELETE /api/projects/:id`                                                                                     |     401 |    403 |         403 |     403 |     A | agenda exclusão em 30 dias; sem membership retorna 404; exige CSRF                                             |
| `POST /api/projects/:id/restore`                                                                               |     401 |    403 |         403 |     403 |     A | somente OWNER preservado; antes do prazo; projeto alheio/expirado retorna 404                                  |
| `DELETE /api/projects/:id/permanent`                                                                           |     401 |    403 |         403 |     403 |     A | somente projeto já excluído; nome exato; remove banco e agenda/reconcilia storage                              |
| `GET /api/projects/join/details`; `POST /api/projects/join`                                                    |     401 |      E |           E |       E |     E | conta ACTIVE; identity da sessão; papel MEMBER/VIEWER definido no projeto                                      |
| `GET /api/projects/:projectId/access-code`                                                                     |     401 |    403 |         403 |     403 |     A | código sensível somente no DTO OWNER                                                                           |
| `PATCH /api/projects/:projectId/access-code`; `POST .../regenerate`                                            |     401 |    403 |         403 |     403 |     A | e-mail verificado, CSRF e limiter sensível                                                                     |
| `GET /api/projects/:projectId/members`                                                                         |     401 |      L |           L |       L |     L | e-mail completo somente para OWNER                                                                             |
| `PATCH/DELETE /api/projects/:projectId/members/:membershipId`                                                  |     401 |    403 |         403 |     403 |     A | último OWNER protegido                                                                                         |
| `POST .../members/:membershipId/reactivate`                                                                    |     401 |    403 |         403 |     403 |     A | membership do mesmo projeto                                                                                    |
| `DELETE /api/projects/:projectId/members/me`                                                                   |     401 |      E |           E |       E |     E | somente a própria membership; último OWNER protegido                                                           |
| `POST /api/projects/:projectId/ownership/transfer`                                                             |     401 |    403 |         403 |     403 |     A | alvo ativo do mesmo projeto; solicitante permanece OWNER                                                       |
| `GET /api/projects/:projectId/invitations`                                                                     |     401 |    403 |         403 |     403 |     A | e-mails visíveis apenas ao OWNER                                                                               |
| `POST/DELETE /api/projects/:projectId/invitations...`                                                          |     401 |    403 |         403 |     403 |     A | criação exige e-mail verificado; token bruto não sai em produção                                               |
| `POST /api/projects/invitations/details`, `accept`, `decline`                                                  |     401 |      E |           E |       E |     E | e-mail da sessão deve coincidir; conta deve estar ACTIVE                                                       |
| `GET /api/projects/invitations/mine`                                                                           |     401 |      L |           L |       L |     L | somente PENDING não expirados do e-mail normalizado da sessão                                                  |
| `POST /api/projects/invitations/:invitationId/accept` e `POST /api/projects/invitations/:invitationId/decline` |     401 |      E |           E |       E |     E | invitationId sem correspondência de destinatário retorna 404 opaco                                             |
| Requirements: todos os `GET`                                                                                   |     401 |      L |           L |       L |     L | mesmo projeto                                                                                                  |
| Requirements: `POST`, `PUT`, `PATCH`, `DELETE`                                                                 |     401 |    403 |           E |       E |     E | invariantes no service                                                                                         |
| `PUT /api/requirements/:id/tasks`                                                                              |     401 |    403 |           E |       E |     E | conjunto atômico; todas as tarefas no mesmo projeto                                                            |
| Tasks/vínculos/Kanban/métricas: todos os `GET`                                                                 |     401 |      L |           L |       L |     L | mesmo projeto/recurso                                                                                          |
| Tasks/vínculos/Kanban: `POST`, `PUT`, `PATCH`, `DELETE`                                                        |     401 |    403 |           E |       E |     E | pertencimento e ator canônico                                                                                  |
| `GET /api/projects/:projectId/tasks/history`                                                                   |     401 |      L |           L |       L |     L | paginado; ator e recursos do mesmo projeto                                                                     |
| `GET /api/tasks/:id/comments`                                                                                  |     401 |      L |           L |       L |     L | leitura paginada; mesmo projeto                                                                                |
| `POST /api/tasks/:id/comments`                                                                                 |     401 |    403 |           E |       E |     E | autor sempre da sessão                                                                                         |
| `PATCH /api/tasks/:id/comments/:commentId`                                                                     |     401 |    403 | E (próprio) |     403 |   403 | somente o autor edita; MANAGER/OWNER não editam texto de terceiros                                             |
| `DELETE /api/tasks/:id/comments/:commentId`                                                                    |     401 |    403 | E (próprio) |       E |     E | MANAGER/OWNER moderam qualquer comentário do projeto                                                           |
| `GET /api/tasks/:id/time-entries`                                                                              |     401 |      L |           L |       L |     L | sessões de tempo e resumo de esforço; mesmo projeto                                                            |
| `POST /api/tasks/:id/time-entries/start`, `.../stop`; `POST /api/tasks/:id/time-entries`                       |     401 |    403 |           E |       E |     E | qualquer membro que escreve inicia, para ou lança; atores de início e fim registrados                          |
| `DELETE /api/tasks/:id/time-entries/:entryId`                                                                  |     401 |    403 | E (próprio) |       E |     E | quem iniciou exclui a própria sessão; MANAGER/OWNER moderam qualquer uma                                       |
| Sprints: `GET /api/projects/:projectId/sprints`, `/api/sprints/:id`, `/api/sprints/:id/tasks`                  |     401 |      L |           L |       L |     L | RF10; recurso e membership do mesmo projeto                                                                    |
| Sprints: `POST`, `PUT`, `PATCH /api/sprints/:id/status`, `PUT /api/sprints/:id/tasks`                          |     401 |    403 |           E |       E |     E | invariantes, sobreposição e estados terminais no service sob lock                                              |
| `DELETE /api/sprints/:id` | 401 | 403 | E | E | E | exclusão lógica; preserva histórico e tombstone conforme ADR-011; invariantes verificadas sob lock |
| Milestones: `GET /api/projects/:projectId/milestones`, `/api/milestones/:id`                                   |     401 |      L |           L |       L |     L | RF10; recurso e membership do mesmo projeto                                                                    |
| Milestones: `POST`, `PUT`, `PATCH /api/milestones/:id/status`, `DELETE`                                        |     401 |    403 |           E |       E |     E | invariantes e lifecycle no service                                                                             |
| `GET /api/projects/:projectId/schedule`                                                                        |     401 |      L |           L |       L |     L | RF10; agregado somente-leitura e DTO minimizado                                                                |
| `GET /api/sprints/:id/progress`                                                                                |     401 |      L |           L |       L |     L | RF35; somente-leitura, sem recorte por responsável                                                             |
| `PATCH/DELETE /api/tasks/:id/sprint`                                                                           |     401 |    403 |           E |       E |     E | tarefa e sprint no mesmo projeto; recurso alheio recebe 404 opaco                                              |
| `POST /api/projects/:projectId/reports` | 401 | 403 | E | E | E | S2-06; CSRF e limiter `project-report` por ator/projeto; uma geração ativa por projeto; pedido e conclusão auditados |
| `GET /api/projects/:projectId/reports`, `.../reports/:reportId` | 401 | L | L | L | L | S2-06; relatório de outro projeto ou inexistente recebe o mesmo 404 opaco; nomes congelados na geração |
| `GET /api/projects/:projectId/reports/:reportId/pdf` | 401 | L | L | L | L | S2-07; só relatório SUCCEEDED (409); limiter `project-report-pdf`; download auditado (sem auditoria, sem arquivo) |
| `POST /api/github/app/installations/start`; `GET /github/app/installations...`                                 |     401 |      E |           E |       E |     E | start exige e-mail verificado; lista usa App ACTIVE e Installation Token                                       |
| `GET /api/github-app/callback`                                                                                 |     302 |    302 |         302 |     302 |   302 | state/sessão/conta/instalação; não exige GitHubIdentity; tokens efêmeros                                       |
| `PUT /api/projects/:projectId/github/integration`                                                              |     401 |    403 |         403 |     403 |     A | OWNER; vínculo inicial; ACTIVE repetido e troca retornam 409                                                        |
| `POST /api/webhooks/github-app`                                                                                |       E |      E |           E |       E |     E | público; HMAC/raw body/delivery ID, sem sessão ou CSRF                                                         |
| `POST /api/projects/:projectId/github/sync`                                                                    |     401 |    403 |         403 |       E |     E | MANAGER+, e-mail verificado, integração ACTIVE e trava por projeto                                             |
| `PATCH /api/projects/:projectId/github/sync-settings`                                                          |     401 |    403 |         403 |     403 |     A | OWNER                                                                                                          |
| Commits, PRs, issues e artifacts: `GET`                                                                        |     401 |      L |           L |       L |     L | mesmo projeto                                                                                                  |
| Traceability project-scoped: matriz, requisito, tarefa e artefato                                              |     401 |      L |           L |       L |     L | membership ativa e recurso no mesmo projeto                                                                    |
| S1-09: `GET .../traceability/requirements`, `.../:requirementId/current`, `.../:requirementId/history`         |     401 |      L |           L |       L |     L | membership ativa; mesmo projeto; IDOR 404 opaco; cursor scoped; sem API de escrita de situation                |
| `GET .../traceability/commit-suggestions`                                                                      |     401 |      L |           L |       L |     L | DTO minimizado; mesmo projeto                                                                                  |
| `POST .../commit-suggestions/scan`, `:id/confirm`, `:id/reject`                                                |     401 |    403 |           E |       E |     E | CSRF, membership ativa e relações no mesmo projeto                                                             |
| S2-01: `GET .../traceability/alerts`, `.../alerts/index`, `.../alerts/summary`, `.../alerts/:alertId`, `.../tasks-without-technical-links` |     401 |      L |           L |       L |     L | membership ativa, conferida no middleware e de novo no serviço (TF-REV-001); alerta de outro projeto 404 opaco; DTO mínimo, sem e-mail                                   |
| S2-01: `POST .../traceability/alerts/:alertId/dismiss`, `POST .../traceability/alerts/reconcile`               |     401 |    403 |         403 |       E |     E | MANAGER+, CSRF, revalidação no service; reprocessamento com limitador próprio; auditoria sem texto livre        |
| S2-02: `GET /api/notifications`, `/notifications/unread-count`; `PATCH /notifications/:notificationId`; `POST /notifications/read-all` |     401 |      E |           E |       E |     E | só o destinatário (da sessão), com membership ativa no projeto da notificação; id alheio ou oculto 404 opaco; o cursor da lista só posiciona e não dá acesso; conta restrita não recebe; mutations exigem CSRF; leituras no limitador autenticado |
| S2-02: `GET`, `PUT /api/settings/notifications`                                                              |     401 |      E |           E |       E |     E | titular; `PUT` estrito com as quatro chaves (desde 12/10/2026; antes, duas); auditoria só com os tipos alterados |
| `/api/settings/account`, `/security`, `/privacy`, `/integrations`                                              |     401 |      E |           E |       E |     E | titular; middleware de estado restringe operações e mutations exigem CSRF                                      |
| `POST /api/auth/github/reauth/start`                                                                           |     401 |      E |           E |       E |     E | somente GitHub-only; identidade vinculada, sessão e state; também permite `DELETION_PENDING` para cancelamento |
| `GET /api/account/audit-events`                                                                                |     401 |      L |           L |       L |     L | somente eventos cujo ator é o titular                                                                          |
| `GET /api/projects/:projectId/audit-events`                                                                    |     401 |    403 |         403 |     403 |     A | paginado, metadata minimizada, sem enumeração entre projetos                                                   |

## Decisões

- `ACTIVE` segue a matriz por papel. `DEACTIVATED` acessa somente estado da conta e reativação. `DELETION_PENDING` acessa somente status/cancelamento/exportação e reautenticação GitHub necessária ao cancelamento de conta GitHub-only. `ANONYMIZED` não autentica nem pode reassociar automaticamente uma identidade GitHub anterior.

- OWNER administra membros, convites e configuração; MANAGER coordena sync e também escreve domínio; MEMBER escreve tarefas/requisitos; VIEWER é read-only sobre dados compartilhados do projeto, com exceção das preferências estritamente pessoais descritas abaixo.
- Respostas a convites são vinculadas ao destinatário, usam token hashado/expirável e recebem limiter de operação sensível; criação combina limiter sensível e de entrega de e-mail.
- O middleware resolve o projeto por rota direta ou pelo recurso filho antes de avaliar a membership.
- O caminho da API é canônico. Qualquer `%` no caminho, fora da query string, recebe `404 RESOURCE_NOT_FOUND` com o corpo do 404 opaco, antes da autenticação e de qualquer consulta. Vale para anônimo, não membro e todos os papéis. Assim, o middleware de projeto decide sempre sobre o mesmo valor que o controller recebe (ADR-003, emenda de 15/10/2026, CONF-F51 e TF-REV-001).
- O mesmo boundary exige `Project.deletedAt = null` para todo acesso normal. Somente as rotas
  explícitas de restore e exclusão definitiva resolvem o projeto excluído e revalidam no service a
  membership ativa preservada e o papel OWNER. Assim, recursos filhos de projeto em carência
  retornam `404` antes de qualquer autorização de domínio.
- `ProjectMembership` é a única fonte de participação. `ProjectMember` e `POST /api/projects/:projectId/members` foram removidos; o path antigo retorna `404`. `accessCode` é capability de ingresso e nunca aceita identity/role do cliente.
- Código de acesso nunca concede OWNER/MANAGER. Somente OWNER vê, regenera e configura MEMBER/VIEWER; mudança de configuração não altera memberships existentes.
- A trilha de auditoria e os direitos do titular não concedem administração de dados pessoais a um
  OWNER de projeto.
- O alias não canônico `/api/projects/:projectId/github/artifacts` foi removido e retorna 404; RF06
  usa `/api/projects/:projectId/artifacts`. Sync permanece restrito a MANAGER/OWNER.
- As rotas genéricas dependentes de `TraceLink` e `GithubArtifact` foram removidas. As perspectivas
  canônicas sempre incluem `projectId`, evitando autorização por ID global isolado.
- No fechamento do RF41, VIEWER apenas consulta; MEMBER+ analisa e revisa. Confirmação e rejeição são transacionais e auditadas.
- Alertas de rastreabilidade (S2-01, ADR-015) são do projeto: todo membro ativo os lê. Dispensar um
  alerta esconde uma violação de processo e por isso exige MANAGER+, com justificativa; o mesmo vale
  para o reprocessamento manual, que varre o projeto inteiro. Detecção e resolução não têm rota de
  escrita: acontecem no servidor, na mesma transação das mutações de tarefa e vínculo, e ao fim do
  sync. Vincular uma PR ou issue a partir do alerta usa as rotas de tarefa existentes (MEMBER+).
- Notificações de tarefa (S2-02, ADR-016) são do destinatário, não do projeto: as rotas não têm
  `projectId` e o papel no projeto não altera o que se vê. A visibilidade depende da membership
  ativa no projeto de origem e do projeto não estar excluído; perder o acesso oculta sem apagar.
  Não há rota que crie notificação.
- Notificações de eventos de issue e PR (S2-03, ADR-018) usam as mesmas rotas e a mesma regra de
  visibilidade. Os destinatários são calculados no servidor, a partir da participação registrada na
  tarefa (responsável, comentário não excluído, esforço) e da membership ativa no projeto; nada vem
  do cliente. A fila de eventos e o job `notifications:github-events` não têm rota: o despacho é
  operação do servidor, e o reprocessamento manual é auditado como ação do sistema. O filtro
  `group` da lista (13/10/2026) só escolhe a origem dentro das notificações visíveis do
  destinatário: não muda papel, visibilidade nem o contador.
- `responsibleUserId` exige membership ativa; a autoria de movimento vem exclusivamente da sessão e
  não pode ser controlada pelo body.
- A resolução project-scoped também cobre `/sprints/:id` e `/milestones/:id`; ausência de recurso e
  recurso de projeto alheio continuam indistinguíveis por resposta `404` genérica.
- A interface esconde mutações de cronograma para VIEWER apenas como UX; o backend permanece
  autoritativo e aplica a matriz independentemente do que a tela renderiza.
- `/api/settings/*` é canônico para conta/privacidade. `/api/account/reactivation/*` e
  `/api/account/audit-events` permanecem por responsabilidade própria; paths duplicados removidos
  retornam `404 ROUTE_NOT_FOUND`.
- GitHub OAuth pertence à autenticação/identidade. A GitHub App é autoridade de repositórios,
  artefatos, sync e webhooks; conta local sem `GitHubIdentity` pode conectar a App, criar projeto e
  sincronizar. O callback comprova state, sessão, ator da instalação e Installation sem transformar
  token efêmero em identidade TraceFlow.
- Snapshot pessoal `OWNER`/`ADMIN`, `REAUTH_REQUIRED` e TTL OAuth de repositório não pertencem ao
  contrato vigente. O ADR-009 preserva o histórico e o ADR-012 formaliza a decisão atual.
- Participação histórica/inativa não autoriza exportar conteúdo atual de projeto. Operações
  sensíveis usam senha local ou reautenticação GitHub recente na mesma sessão; último OWNER bloqueia
  a anonimização no vencimento e provoca retorno auditado para `ACTIVE`.
- Comentários de tarefa (`TaskComment`) usam autoria exclusiva da sessão. VIEWER só lê; MEMBER cria
  e edita/exclui apenas o próprio comentário; MANAGER e OWNER excluem qualquer comentário do projeto
  por moderação, mas não editam texto de terceiros. Exclusão é lógica (`deletedAt`/`deletedById`) e
  toda operação é auditada. O comentário excluído continua na listagem apenas como marcador sem
  conteúdo; nenhum papel, inclusive quem moderou, recupera o texto pela API.
- Sessões de tempo (`TaskTimeEntry`, S1-06) não restringem o cronômetro ao responsável: qualquer
  MEMBER+ inicia, para ou lança manualmente, e a API registra quem iniciou e quem parou. Só existe
  uma sessão em andamento por tarefa (trava de linha; `409` em concorrência). Exclusão segue a
  política dos comentários: quem iniciou a sessão ou MANAGER/OWNER. `Task.actualEffort` é derivado
  das sessões e recusa escrita direta (`400`); toda operação é auditada com origem e duração.
- Relatórios (S2-06/S2-07): gerar exige MEMBER+, porque cada geração percorre todas as visões do
  painel; consultar e baixar o PDF ficam abertos a qualquer membro ativo, inclusive VIEWER, pois o
  relatório só reúne dados que esse papel já lê nas abas de origem. O snapshot não recebe nomes de
  pessoas (só `userId`); o nome exibido é o congelado na geração. O PDF é montado sob demanda,
  sem arquivo persistido, e cada download fica registrado em `REPORT_PDF_EXPORTED`.

## S1-07 — Casos de teste

| Operação                                           | VIEWER | MEMBER | MANAGER | OWNER |
| -------------------------------------------------- | ------ | ------ | ------- | ----- |
| Listar/detalhar casos                              | L      | L      | L       | L     |
| Criar/editar definição                             | 403    | E      | E       | E     |
| Alterar status                                     | 403    | E      | E       | E     |
| Excluir logicamente                                | 403    | E      | E       | E     |
| Executar/upload multipart                          | 403    | E      | E       | E     |
| Versões/histórico/execuções/referências importadas | L      | L      | L       | L     |
| Detalhe de execução/download privado               | L      | L      | L       | L     |

Anônimo: 401. Sem membership ativa no projeto dono: 404 opaco. Toda escrita exige
CSRF antes do parser multipart. A resolução central inclui TestCase (não excluído),
TestExecution e TestEvidence; o service revalida membership e papel, inclusive na
transação. Ator vem da sessão, não do payload. Ser responsável não concede nem
restringe o direito de executar de MEMBER+. Responsável precisa de membership ativa.

Caso excluído fica indisponível em rotas operacionais, inclusive criação de execução.
Execução histórica e seu download continuam autorizados por projeto, sem recuperar
permissão a partir de um ID ou de um caminho de storage. Arquivos não são públicos.
Evidências: `backend/test/api/test-cases-s1-07.test.js` e bateria de integração S1-07.

## GITHUB-02 — Vinculação de projeto existente

Reutiliza `PUT /api/projects/:projectId/github/integration`; não adiciona rota equivalente
`POST .../github/connect`. Somente OWNER ativo do projeto, com sessão válida, conta ativa,
e-mail verificado e CSRF, pode vincular. VIEWER/MEMBER/MANAGER recebem `403`; sem membership,
projeto inexistente ou excluído recebe `404` opaco, antes de qualquer consulta externa.

A transação revalida lifecycle e papel sob locks `Project → ProjectMembership` e mantém locks
compartilhados na instalação/autorizações locais até o commit. Revogação da membership ou da
autorização da instalação durante a consulta externa impede a escrita. A validação ao vivo da
GitHub App acontece antes da transação. GitHubIdentity não concede acesso a repositórios.

Repetição de integração ACTIVE retorna `409 GITHUB_PROJECT_ALREADY_CONNECTED`. Reconexão
RECONNECT_REQUIRED permanece restrita ao mesmo repositório, sem substituição de instalação
já associada. O sync inicial da primeira vinculação reutiliza a operação canônica após commit;
retry manual permanece MANAGER+. Nenhuma permissão de sincronização foi ampliada.

`INATIVO`/`ARQUIVADO` são estados administrativos, não bloqueios de escrita na política central
vigente. GITHUB-02 preserva essa distinção; `deletedAt` bloqueia vinculação, inclusive em corrida
com exclusão/purge. Evidência: `backend/test/api/github-project-connect.test.js`.

## S1-08 — Defeitos e retestes

| Operação                                             | VIEWER ativo | MEMBER ativo | MANAGER ativo | OWNER ativo |
| ---------------------------------------------------- | ------------ | ------------ | ------------- | ----------- |
| Lista, detalhe, candidatos FAIL, histórico, retestes | Sim          | Sim          | Sim           | Sim         |
| Criar, editar, excluir Defect                        | Não (403)    | Sim          | Sim           | Sim         |
| Vincular/criar CORRECTION Task                       | Não (403)    | Sim          | Sim           | Sim         |
| Registrar execução contextual de reteste/evidência   | Não (403)    | Sim          | Sim           | Sim         |
| Ler evidência autenticada                            | Sim          | Sim          | Sim           | Sim         |

Rotas de Defect são project-scoped no resolvedor compartilhado. Ausência de
membership ativa e recursos de outro projeto resultam em 404 opaco; ausência de
sessão resulta em 401. Não há exclusividade do criador ou responsável. Responsável
selecionado precisa ser membro ativo do projeto, inclusive se for VIEWER.

A validação de detecção, origem, requisito e correção confere o mesmo Project.
Reteste confere também TestCase, versão atual, ciclo e revisão dentro da transação.
CSRF precede o parser multipart existente. Nenhuma rota permite escolher status
manualmente. Defect excluído não fica acessível pelas rotas operacionais, mas sua
identidade permanece nos metadados das Tasks e nos registros históricos persistidos.

## Indicadores e preferência pessoal — PR23-FIX-06

Todas as rotas abaixo têm prefixo `/api/projects/:projectId`. A fronteira é sessão autenticada,
conta ativa e membership ativa em projeto acessível. Ausência de sessão retorna `401`;
projeto inacessível, membership ausente/inativa ou recurso fora do escopo retornam `404` opaco.
`OWNER` continua sendo papel do projeto, não administrador global.

| Método | Sufixo da rota | Papel mínimo | Escopo | Operação |
| --- | --- | --- | --- | --- |
| GET | `/indicators/progress` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/activity` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/github` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/tasks` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/sprints` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/quality` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/traceability` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/dashboard` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicators/catalog` | VIEWER | Projeto autorizado | Leitura |
| GET | `/indicator-preference` | VIEWER | Próprio usuário + projeto | Leitura sem escrita implícita |
| PUT | `/indicator-preference` | VIEWER | Próprio usuário + projeto | Salvar personalização; CSRF obrigatório |
| DELETE | `/indicator-preference` | VIEWER | Próprio usuário + projeto | Remover preferência / restaurar padrão; CSRF obrigatório |

Project Health usa o aggregate existente (`view=GENERAL&healthOnly=true`), sem endpoint separado.
A exceção de escrita para VIEWER não permite modificar tarefas, requisitos ou outro domínio
compartilhado. O controller obtém `userId` exclusivamente da sessão; o corpo não escolhe titular.
O repository revalida projeto/membership na transação da mutação. Desativação/saída remove apenas
sua preferência naquele projeto, na mesma transação; reativação começa com o padrão canônico.

Autoridades: [rotas](../../backend/src/modules/indicators/indicators.routes.js),
[policy](../../backend/src/modules/authorization/authorization.service.js),
[controller](../../backend/src/modules/indicators/indicators.controller.js),
[repository de preferência](../../backend/src/modules/indicators/dashboard-preference.repository.js)
e [testes HTTP](../../backend/test/api/indicators-p9.test.js).

## GITHUB-04 — execução periódica

Preferência/agendamento continua OWNER-only no PATCH existente. MANAGER/OWNER solicitam sync;
VIEWER+ consulta run/origem e nextSyncAt apenas no seu projeto. Sessão, verificação de e-mail,
CSRF e respostas opacas permanecem. O worker é processo de sistema, sem sessão/usuário fictício:
executa uma preferência previamente autorizada com Project ativo no lifecycle e GitHub App /
instalação / integração elegíveis. Runs automáticos usam requestedByUserId null e auditoria SYSTEM.
Não existe novo endpoint público de agendamento nem parâmetros de origem/slots aceitos do cliente.

GITHUB-04.1 acrescenta disponibilidade operacional minimizada ao GET de status já protegido por
membership: status, motivo e instantes, sem identidade dos processos. Não há endpoint de gestão
do worker. Liveness não altera papel, CSRF, autorização da App ou reserva de repositório.
