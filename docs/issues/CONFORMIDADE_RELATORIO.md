# Relatório da campanha v2 — erros e inconsistências do TraceFlow

Campanha de verificação contra o OWASP ASVS 5.0.0 (L1+L2), o `TRACEFLOW_CONTEXTO_ARQUITETURA.md` e o
`TRACEFLOW_ROADMAP_INCREMENTAL.md`, nas versões anexadas pelo João. O enunciado é o arquivo
`docs/issues/CONFORMIDADE_V2_PROMPT_ERROS_E_INCONSISTENCIAS.md`, mantido fora do git a pedido do
João. A campanha só verifica: nenhuma linha de código de produção, schema, migration, CI ou documento
de referência muda.

## 0. Cabeçalho

| Item | Valor |
|---|---|
| Commit verificado | `7952b01fad68da0d91dd3e2f79c759f5745bb1db` (`joao-dev-v2`, 69 commits à frente de `origin/joao-dev-v2`, sem CI) |
| Última fase concluída | 0 |
| Pontos ⚑1–⚑8 | aprovados com as recomendações do enunciado (14/10/2026) |
| Ponto ⚑9 | aprovado só `node scripts/check-npm-audit.mjs`; recusados `gh api`, os validadores `db:test:validate-*` e o worker e o job em processo separado |
| Efeito do ⚑9 | ARQ-04 (drift) e ARQ-31 (proteção da branch) ficam `NÃO VERIFICÁVEL LOCALMENTE` até a CI da PR; H05 e H22 rodam em processo único |

## 1. Referências congeladas

Hashes recalculados em 14/10/2026, iguais aos do enunciado.

| Referência | SHA-256 | Correspondência |
|---|---|---|
| `OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf` | `a2fa1bbe38f12cac86d3a0f0023327e9772201f65a7f741f282f5e785d268fc5` | catálogo de 345 requisitos (70 L1, 183 L2, 92 L3) |
| `TRACEFLOW_CONTEXTO_ARQUITETURA.md` | `e904fd62910f71bea52c11c0978bc024106abfb658bfee48fbfbdd3073d5c702` | blob `589af2b` |
| `TRACEFLOW_ROADMAP_INCREMENTAL.md` | `4c18dbbc7e2a8511fda5a8e2677e1664a3c368fa60f37b7132c35d2a787267f8` | blob `53f4500` |
| Documento oficial do TCC (Somativa 2, PDF) | `05fe0ec93c35d1a65d58f53e520caf7590da83e0e78e842c0c4ece96e02f643a` | texto extraído com `pdftotext -enc UTF-8`; UC01–UC15 nos Quadros 3-69 a 3-83 |

## 2. Divergências anexo × repositório

### 2.1 Anexo de arquitetura: 9 trechos

`git diff 589af2b HEAD:TRACEFLOW_CONTEXTO_ARQUITETURA.md` tem 9 trechos, todos ligados a um
identificador.

| Trecho (anexo → repositório) | Assunto | D-id |
|---|---|---|
| L3 → L3 | público do documento | D-ARQ-01 |
| L7 → L7-11 | nota "Estado executável após a E15" reescrita sem o rótulo | D-ARQ-08 |
| L228 → L232-235 | commits: Conventional Commits e `[TASK-<ID>]` | D-ARQ-02 |
| L701 → L708 | GitHub App por instalação; PAT não suportado | D-ARQ-03 |
| L704 → L711 | não persistir tokens do GitHub | D-ARQ-04 |
| L965 → L973 | PR: documentação canônica ou `Documentação: N/A` | D-ARQ-05 |
| L986 → L994-995 | DoD: documentação canônica ou `N/A` | D-ARQ-05 |
| L992-1014 → L1001-1011 | §18 substituída | D-ARQ-06 |
| L1075 → L1072 | ADR para alteração da estratégia de GitHub App | D-ARQ-07 |

### 2.2 Anexo do roadmap: 48 trechos

`git diff 53f4500 HEAD:TRACEFLOW_ROADMAP_INCREMENTAL.md` tem 48 trechos (+328/−87), todos ligados a
um ou mais identificadores.

| Trechos | Assunto | D-id |
|---|---|---|
| 01 | nota LR.7 (21/08/2026) no cabeçalho | D-RM-14 |
| 02, 03, 04, 05, 21, 23, 25, 32, 33, 38, 44, 45, 46, 47 | troca Azure → OCI em títulos, objetivos, dependências, fluxogramas e tabelas | D-RM-01 |
| 26, 27, 28, 30, 39 | Azure → OCI com critério acrescentado (Free Tier, VMs, rede privada) | D-RM-01, D-RM-02 |
| 29, 34 | Azure → OCI com critério acrescentado e critério enfraquecido (segredos; credenciais da automação) | D-RM-01, D-RM-02, D-RM-19 |
| 31, 35, 36, 37, 40, 41, 42, 43 | critérios OCI acrescentados (firewall, Nginx, URLs da GitHub App, restore de volumes) | D-RM-02 |
| 06, 11 | UC05 movido do S1-01 para o S1-03 | D-RM-04 |
| 07, 15, 16, 18, 19 | caixas `[x]` e notas de estado da Sprint 1 | D-RM-07 |
| 08 | S1-01: caixas `[x]`; "E2E" trocado por "frontend automatizados"; item novo de homologação externa | D-RM-03, D-RM-07, D-RM-16 |
| 09 | S1-02: nota de estado e "decisão de segurança" da resposta genérica | D-RM-06, D-RM-07 |
| 10 | S1-02: caixas `[x]`; "configurar provider" reescrito; item novo de homologação SMTP | D-RM-05, D-RM-07, D-RM-16 |
| 12 | S1-03: nota de estado e "decisões de produto" sobre `OWNER` e administração global | D-RM-07, D-RM-17 |
| 13, 20 | S1-03 e S1-09: caixas `[x]` e item novo de homologação ou revalidação | D-RM-07, D-RM-16 |
| 14 | S1-04: caixas `[x]` e revisão do modelo (ADR-010, ADR-011) | D-RM-07, D-RM-15 |
| 17 | S1-07: caixas `[x]` com itens reescritos e desdobrados | D-RM-07, D-RM-18 |
| 22 | S2-01: caixas `[x]` e notas de estado e da campanha | D-RM-08 |
| 24 | S2-05: marco incremental P9 | D-RM-09 |
| 48 | seções IND, GITHUB e PR24-FIX acrescentadas ao fim | D-RM-10, D-RM-11, D-RM-12 |

Os cartões S2-02 e S2-03 não aparecem no `diff`: continuam iguais ao anexo, com todas as caixas
abertas e sem nota (D-RM-13).

### 2.3 Classificação final

| D-id | Classe | Registro ou motivo |
|---|---|---|
| D-ARQ-01 | DE | editorial |
| D-ARQ-02 | DA | `CONTRIBUTING.md` acrescenta convenção sem tirar a menção aos RFs |
| D-ARQ-03 | DL | ADR-009 (GitHub App) e ADR-012; confirmação de que o runtime não aceita PAT fica na Parte B (ARQ-23) |
| D-ARQ-04 | DL | ADR-009 e ADR-012; confirmação no schema fica na Parte B (ARQ-23) |
| D-ARQ-05 | DE | o critério continua; só admite registrar `N/A` |
| D-ARQ-06 | DX | as 17 regras para agentes saíram sem registro que as substitua uma a uma; a Parte B verifica as 17 (ARQ-34) |
| D-ARQ-07 | DL | a migração para GitHub App já ocorreu (ADR-009) |
| D-ARQ-08 | DE | editorial |
| D-RM-01 | **DR** | não há ADR de implantação; o ADR-017 só diz que "a implantação pretendida é OCI"; o S2-08 mantém "[ ] criar ADR e diagrama" |
| D-RM-02 | DA | condicionada ao ADR do D-RM-01 |
| D-RM-03 | **DX** | E2E retirado do checklist do S1-01 sem decisão de dispensa (E15-F10 e S104-F02 seguem abertos) |
| D-RM-04 | DE | editorial; o TCC põe o UC05 com o Administrador do Sistema (ver D-RM-17) |
| D-RM-05 | DE | a homologação SMTP continua aberta |
| D-RM-06 | DL | o ADR-002 registra que "erros de credencial e recuperação evitam enumeração"; a afirmação é testada na H14 |
| D-RM-07 | DE | toda marcação é alegação, verificada na Parte C |
| D-RM-08 | DE | alegação; a nota ainda cita "dependência relaxada" entre S1-09 e S2-01, verificada na Parte C |
| D-RM-09 | DE | alegação; o texto diz que não conclui S2-04/S2-05 |
| D-RM-10 | DE | mapa de fases internas, sem equivalência com cartões |
| D-RM-11 | DL | compatível com o TCC: UC03 passo 9 ("quando houver repositório configurado") e exceção E9.2 (salvar sem sincronização); UC04 fluxo A1 (sincronização automática agendada); registro no ADR-017 e nos relatórios GITHUB-01..04.1 |
| D-RM-12 | DE | decisão pendente de retenção de SyncRun (K22) |
| D-RM-13 | DE | omissão: S2-02 e S2-03 implementados sem estado no cartão (K6) |
| D-RM-14 | DE | nota desatualizada: "checklists não promovidos" e "39 migrations", hoje 74 (K18) |
| D-RM-15 | DL | ADR-010 e ADR-011 registram a revisão do modelo de sprint e marco; os critérios do cartão continuam valendo |
| D-RM-16 | DA | itens de homologação externa e de revalidação acrescentados (S1-01, S1-02, S1-03, S1-09) |
| D-RM-17 | **DX contra o TCC** | ver seção 2.4 |
| D-RM-18 | DA | itens do S1-07 desdobrados, com integração, responsividade e inventário visual acrescentados |
| D-RM-19 | **DX** | o S2-08 trocou "segredos ficam em **serviço** seguro" por "em **mecanismo** seguro", e o S2-09 trocou "credenciais federadas ou identidade gerenciada" por "credenciais OCI de menor privilégio", que admite chave estática. O critério do S2-09 contra segredo estático de longa duração continua no texto, sem o meio que o atendia |

### 2.4 Divergências com o documento oficial do TCC

O TCC é a fonte de maior precedência (§3 do anexo de arquitetura).

| ID | TCC | Repositório | Classe |
|---|---|---|---|
| D-TCC-01 (= D-RM-17) | Ator **Administrador do Sistema**: vê e gerencia todos os projetos (UC03, Quadro 3-71); cadastra e edita usuários e os vincula a projetos (UC05, Quadro 3-73); define perfil global "Administrador do Sistema" ou "Membro da Equipe", sem remover o único administrador (UC06, Quadro 3-74) | papéis **por projeto** (`OWNER`, `MANAGER`, `MEMBER`, `VIEWER`), cadastro pelo próprio usuário e nenhuma administração global ("decisões de produto" do S1-03 no roadmap). O roadmap anexado já descreve os papéis por projeto | **DX contra o TCC**: pede decisão do João. Ou o texto do TCC muda para o modelo implementado, ou o produto ganha a administração global |
| D-TCC-02 | Quadro 3-72 com título "UC01 – Sincronizar dados do GitHub" e identificador UC04 | — | ambiguidade editorial no próprio TCC (regra 15 da §18): o título deveria ser UC04 |

## 3. Inventário de superfície

Levantado do código em execução no commit verificado. O inventário de rotas sai do roteador do
Express (`backend/test/conformance/helpers/route-inventory.js`, que a Parte D reutiliza na H09). As
justificativas de "não aplicável" da Parte A citam as linhas abaixo.

| ID | Superfície | Fato |
|---|---|---|
| INV-01 | API HTTP | 208 rotas (98 GET, 55 POST, 19 PATCH, 24 DELETE, 12 PUT), todas sob `/api` exceto `/health*`; lista no Apêndice A |
| INV-02 | Rotas públicas | 14: cadastro, login, recuperação e redefinição de senha, verificação de e-mail, início e callback do OAuth do GitHub, callback da GitHub App, confirmação de troca de e-mail, confirmação de reativação, webhook da GitHub App e os três `/health*` |
| INV-03 | Proteção das rotas autenticadas | `authenticate` e `csrf` montados globalmente em `/api` antes das rotas de módulo; nenhuma rota mutável autenticada fica sem CSRF; o CSRF ignora GET, HEAD e OPTIONS |
| INV-04 | Autorização de projeto | middleware `authorize` global depois da autenticação; o escopo de projeto é decidido por regex de caminho dentro dele |
| INV-05 | Validação | 187 de 208 rotas com `validateRequest`; as 21 sem ele estão no Apêndice A (coluna "Validação") |
| INV-06 | Sessão | cookie `traceflow_session` com token opaco de 32 bytes, guardado como hash SHA-256; `httpOnly`, `Secure` só em produção, `SameSite` configurável (padrão `lax`), `path=/`; TTL de 8 h ou 30 dias com "manter conectado" |
| INV-07 | Cookie auxiliar do OAuth | `traceflow_github_oauth` (state e verificador PKCE), `httpOnly`, `Lax`, `path=/api/auth/github/callback`, 10 min |
| INV-08 | Cabeçalhos | Helmet com CSP `default-src 'none'` e `frame-ancestors 'none'`, `frameguard` DENY, `Referrer-Policy: no-referrer`, `nosniff`, HSTS só em produção, sem `X-Powered-By`; `Cache-Control: no-store` sob `/api` |
| INV-09 | Corpo da requisição | só JSON (415 para outros tipos), limite de 100 kb; webhook com corpo cru de até 1 MB; multipart só no registro de execução de caso de teste |
| INV-10 | Saída para o GitHub | Octokit (`@octokit/rest` 21) para a REST API, com JWT RS256 da App emitido pelo backend e token de instalação por cliente; troca de código OAuth por `fetch` em `github.com/login/oauth/access_token` |
| INV-11 | Entrada do GitHub | webhook com HMAC SHA-256 e deduplicação por `X-GitHub-Delivery` |
| INV-12 | E-mail | nodemailer com SMTP em produção; provider `capture` fora de produção |
| INV-13 | Banco | MySQL por Prisma 6.12.0, 74 migrations; cliente de recuperação separado para `KILL QUERY`/`KILL` (ADR-020) |
| INV-14 | Arquivos | evidências de teste no diretório `TEST_EVIDENCE_STORAGE_DIR`, fora de `public/`, `frontend/` e `dist/` |
| INV-15 | Navegador | `localStorage` com `traceflow.theme`, `traceflow.sidebar.collapsed`, `traceflow.projects.pinned:<id>`, `traceflow.projects.recent:<id>` e `traceflow:auth-session-event`; token CSRF só em memória; sem `sessionStorage` |
| INV-16 | Estado em memória | limitador de taxa (`MemoryStore`) e publicador de SSE; uma instância |
| INV-17 | Stream | SSE em `GET /api/projects/:projectId/events`, até 15 min, heartbeat de 25 s |
| INV-18 | Processos | API (`src/server.js`), worker de sincronização (`src/github-worker.js`, ADR-017) e jobs por `npm run` (`notifications:due`, `notifications:github-events`, `traceability:alerts`, `privacy:retention`, `privacy:deletions`, `projects:purge`, `e6:cleanup` e os de manutenção E8, E11, LR.2, S1-04 e ADR-011) |
| INV-19 | Dependências de runtime do backend | `@octokit/rest`, `@prisma/client` 6.12.0, `argon2`, `cors`, `dotenv`, `express` 4.22, `express-rate-limit` 8, `file-type` 22.0.2, `helmet` 8, `multer` 2.4.0, `nodemailer` 10.0.9, `zod` 4 |
| INV-20 | Dependências de runtime do frontend | `react` 19, `react-dom` 19, `react-router` 8.3.0, `axios`, `@xyflow/react`, `elkjs`; `vite` e `@vitejs/plugin-react` também estão em `dependencies`, embora sejam de build (indício para ARQ-05) |
| INV-21 | Superfícies ausentes | sem GraphQL, WebSocket, WebRTC, SSR, OIDC (o OAuth do GitHub não emite ID Token) e sem consumo de token autocontido; o único token autocontido é o JWT que o backend **emite** para o GitHub |
| INV-22 | HTML do SPA | `frontend/index.html` com script inline, servido pelo host de implantação, sem cabeçalhos versionados no repositório |

## Apêndice A — Rotas registradas

Gerado do roteador do Express no commit verificado. "Sessão" indica se `authenticate` vem antes da
rota. "CSRF" vale só para métodos que mudam estado. "Validação" indica `validateRequest` na própria
rota.

| ID | Método | Caminho | Sessão | CSRF | Validação |
|---|---|---|---|---|---|
| INV-R001 | GET | `/api/account/audit-events` | sim | — | sim |
| INV-R002 | GET | `/api/account/reactivation/confirm` | **pública** | — | sim |
| INV-R003 | POST | `/api/account/reactivation/start` | sim | sim | sim |
| INV-R004 | POST | `/api/auth/change-password` | sim | sim | sim |
| INV-R005 | GET | `/api/auth/csrf` | sim | — | não |
| INV-R006 | POST | `/api/auth/email-verification/resend` | sim | sim | sim |
| INV-R007 | POST | `/api/auth/email-verification/verify` | **pública** | não | sim |
| INV-R008 | POST | `/api/auth/forgot-password` | **pública** | não | sim |
| INV-R009 | GET | `/api/auth/github/callback` | **pública** | — | não |
| INV-R010 | POST | `/api/auth/github/reauth/start` | sim | sim | sim |
| INV-R011 | POST | `/api/auth/github/start` | **pública** | não | sim |
| INV-R012 | POST | `/api/auth/login` | **pública** | não | sim |
| INV-R013 | POST | `/api/auth/logout` | sim | sim | não |
| INV-R014 | GET | `/api/auth/me` | sim | — | não |
| INV-R015 | POST | `/api/auth/register` | **pública** | não | sim |
| INV-R016 | POST | `/api/auth/reset-password` | **pública** | não | sim |
| INV-R017 | PATCH | `/api/auth/username` | sim | sim | sim |
| INV-R018 | DELETE | `/api/defects/:id` | sim | sim | sim |
| INV-R019 | GET | `/api/defects/:id` | sim | — | sim |
| INV-R020 | PUT | `/api/defects/:id` | sim | sim | sim |
| INV-R021 | POST | `/api/defects/:id/correction-tasks` | sim | sim | sim |
| INV-R022 | GET | `/api/defects/:id/history` | sim | — | sim |
| INV-R023 | GET | `/api/defects/:id/retests` | sim | — | sim |
| INV-R024 | GET | `/api/github-app/callback` | **pública** | — | não |
| INV-R025 | GET | `/api/github/app/installations` | sim | — | não |
| INV-R026 | GET | `/api/github/app/installations/:installationId/repositories` | sim | — | sim |
| INV-R027 | POST | `/api/github/app/installations/start` | sim | sim | sim |
| INV-R028 | GET | `/api/github/app/repositories` | sim | — | sim |
| INV-R029 | DELETE | `/api/milestones/:id` | sim | sim | sim |
| INV-R030 | GET | `/api/milestones/:id` | sim | — | sim |
| INV-R031 | PUT | `/api/milestones/:id` | sim | sim | sim |
| INV-R032 | PATCH | `/api/milestones/:id/status` | sim | sim | sim |
| INV-R033 | GET | `/api/notifications` | sim | — | sim |
| INV-R034 | PATCH | `/api/notifications/:notificationId` | sim | sim | sim |
| INV-R035 | POST | `/api/notifications/read-all` | sim | sim | sim |
| INV-R036 | GET | `/api/notifications/unread-count` | sim | — | sim |
| INV-R037 | GET | `/api/projects` | sim | — | não |
| INV-R038 | POST | `/api/projects` | sim | sim | sim |
| INV-R039 | DELETE | `/api/projects/:id` | sim | sim | sim |
| INV-R040 | GET | `/api/projects/:id` | sim | — | sim |
| INV-R041 | PUT | `/api/projects/:id` | sim | sim | sim |
| INV-R042 | DELETE | `/api/projects/:id/permanent` | sim | sim | sim |
| INV-R043 | POST | `/api/projects/:id/restore` | sim | sim | sim |
| INV-R044 | GET | `/api/projects/:projectId/access-code` | sim | — | sim |
| INV-R045 | PATCH | `/api/projects/:projectId/access-code` | sim | sim | sim |
| INV-R046 | POST | `/api/projects/:projectId/access-code/regenerate` | sim | sim | sim |
| INV-R047 | GET | `/api/projects/:projectId/artifacts` | sim | — | sim |
| INV-R048 | GET | `/api/projects/:projectId/audit-events` | sim | — | sim |
| INV-R049 | GET | `/api/projects/:projectId/commits` | sim | — | sim |
| INV-R050 | GET | `/api/projects/:projectId/defects` | sim | — | sim |
| INV-R051 | POST | `/api/projects/:projectId/defects` | sim | sim | sim |
| INV-R052 | GET | `/api/projects/:projectId/defects/detection-candidates` | sim | — | sim |
| INV-R053 | GET | `/api/projects/:projectId/events` | sim | — | sim |
| INV-R054 | PUT | `/api/projects/:projectId/github/integration` | sim | sim | sim |
| INV-R055 | POST | `/api/projects/:projectId/github/sync` | sim | sim | sim |
| INV-R056 | PATCH | `/api/projects/:projectId/github/sync-settings` | sim | sim | sim |
| INV-R057 | GET | `/api/projects/:projectId/github/sync/status` | sim | — | sim |
| INV-R058 | DELETE | `/api/projects/:projectId/indicator-preference` | sim | sim | sim |
| INV-R059 | GET | `/api/projects/:projectId/indicator-preference` | sim | — | sim |
| INV-R060 | PUT | `/api/projects/:projectId/indicator-preference` | sim | sim | sim |
| INV-R061 | GET | `/api/projects/:projectId/indicators/activity` | sim | — | sim |
| INV-R062 | GET | `/api/projects/:projectId/indicators/catalog` | sim | — | sim |
| INV-R063 | GET | `/api/projects/:projectId/indicators/dashboard` | sim | — | sim |
| INV-R064 | GET | `/api/projects/:projectId/indicators/github` | sim | — | sim |
| INV-R065 | GET | `/api/projects/:projectId/indicators/progress` | sim | — | sim |
| INV-R066 | GET | `/api/projects/:projectId/indicators/quality` | sim | — | sim |
| INV-R067 | GET | `/api/projects/:projectId/indicators/sprints` | sim | — | sim |
| INV-R068 | GET | `/api/projects/:projectId/indicators/tasks` | sim | — | sim |
| INV-R069 | GET | `/api/projects/:projectId/indicators/traceability` | sim | — | sim |
| INV-R070 | GET | `/api/projects/:projectId/invitations` | sim | — | sim |
| INV-R071 | POST | `/api/projects/:projectId/invitations` | sim | sim | sim |
| INV-R072 | DELETE | `/api/projects/:projectId/invitations/:invitationId` | sim | sim | sim |
| INV-R073 | GET | `/api/projects/:projectId/issues` | sim | — | sim |
| INV-R074 | GET | `/api/projects/:projectId/kanban` | sim | — | sim |
| INV-R075 | GET | `/api/projects/:projectId/kanban/metrics` | sim | — | sim |
| INV-R076 | GET | `/api/projects/:projectId/kanban/movements` | sim | — | sim |
| INV-R077 | GET | `/api/projects/:projectId/members` | sim | — | sim |
| INV-R078 | DELETE | `/api/projects/:projectId/members/:membershipId` | sim | sim | sim |
| INV-R079 | PATCH | `/api/projects/:projectId/members/:membershipId` | sim | sim | sim |
| INV-R080 | POST | `/api/projects/:projectId/members/:membershipId/reactivate` | sim | sim | sim |
| INV-R081 | DELETE | `/api/projects/:projectId/members/me` | sim | sim | sim |
| INV-R082 | GET | `/api/projects/:projectId/milestones` | sim | — | sim |
| INV-R083 | POST | `/api/projects/:projectId/milestones` | sim | sim | sim |
| INV-R084 | POST | `/api/projects/:projectId/ownership/transfer` | sim | sim | sim |
| INV-R085 | GET | `/api/projects/:projectId/pull-requests` | sim | — | sim |
| INV-R086 | GET | `/api/projects/:projectId/requirements` | sim | — | sim |
| INV-R087 | POST | `/api/projects/:projectId/requirements` | sim | sim | sim |
| INV-R088 | GET | `/api/projects/:projectId/schedule` | sim | — | sim |
| INV-R089 | GET | `/api/projects/:projectId/sprints` | sim | — | sim |
| INV-R090 | POST | `/api/projects/:projectId/sprints` | sim | sim | sim |
| INV-R091 | GET | `/api/projects/:projectId/tasks` | sim | — | sim |
| INV-R092 | POST | `/api/projects/:projectId/tasks` | sim | sim | sim |
| INV-R093 | GET | `/api/projects/:projectId/tasks/history` | sim | — | sim |
| INV-R094 | GET | `/api/projects/:projectId/tasks/metrics` | sim | — | sim |
| INV-R095 | GET | `/api/projects/:projectId/test-cases` | sim | — | sim |
| INV-R096 | POST | `/api/projects/:projectId/test-cases` | sim | sim | sim |
| INV-R097 | GET | `/api/projects/:projectId/traceability/alerts` | sim | — | sim |
| INV-R098 | GET | `/api/projects/:projectId/traceability/alerts/:alertId` | sim | — | sim |
| INV-R099 | POST | `/api/projects/:projectId/traceability/alerts/:alertId/dismiss` | sim | sim | sim |
| INV-R100 | POST | `/api/projects/:projectId/traceability/alerts/reconcile` | sim | sim | sim |
| INV-R101 | GET | `/api/projects/:projectId/traceability/alerts/summary` | sim | — | sim |
| INV-R102 | GET | `/api/projects/:projectId/traceability/artifacts/:artifactType/:artifactId` | sim | — | sim |
| INV-R103 | GET | `/api/projects/:projectId/traceability/commit-coverage` | sim | — | sim |
| INV-R104 | GET | `/api/projects/:projectId/traceability/commit-suggestions` | sim | — | sim |
| INV-R105 | POST | `/api/projects/:projectId/traceability/commit-suggestions/:suggestionId/confirm` | sim | sim | sim |
| INV-R106 | POST | `/api/projects/:projectId/traceability/commit-suggestions/:suggestionId/reject` | sim | sim | sim |
| INV-R107 | POST | `/api/projects/:projectId/traceability/commit-suggestions/scan` | sim | sim | sim |
| INV-R108 | GET | `/api/projects/:projectId/traceability/issue-coverage` | sim | — | sim |
| INV-R109 | GET | `/api/projects/:projectId/traceability/pull-request-coverage` | sim | — | sim |
| INV-R110 | GET | `/api/projects/:projectId/traceability/requirement-task-coverage` | sim | — | sim |
| INV-R111 | GET | `/api/projects/:projectId/traceability/requirements` | sim | — | sim |
| INV-R112 | GET | `/api/projects/:projectId/traceability/requirements-matrix` | sim | — | sim |
| INV-R113 | GET | `/api/projects/:projectId/traceability/requirements/:requirementId` | sim | — | sim |
| INV-R114 | GET | `/api/projects/:projectId/traceability/requirements/:requirementId/current` | sim | — | sim |
| INV-R115 | GET | `/api/projects/:projectId/traceability/requirements/:requirementId/history` | sim | — | sim |
| INV-R116 | GET | `/api/projects/:projectId/traceability/tasks-without-technical-links` | sim | — | sim |
| INV-R117 | GET | `/api/projects/:projectId/traceability/tasks/:taskId` | sim | — | sim |
| INV-R118 | POST | `/api/projects/from-github` | sim | sim | sim |
| INV-R119 | POST | `/api/projects/invitations/:invitationId/accept` | sim | sim | sim |
| INV-R120 | POST | `/api/projects/invitations/:invitationId/decline` | sim | sim | sim |
| INV-R121 | POST | `/api/projects/invitations/accept` | sim | sim | sim |
| INV-R122 | POST | `/api/projects/invitations/decline` | sim | sim | sim |
| INV-R123 | POST | `/api/projects/invitations/details` | sim | sim | sim |
| INV-R124 | GET | `/api/projects/invitations/mine` | sim | — | não |
| INV-R125 | POST | `/api/projects/join` | sim | sim | sim |
| INV-R126 | GET | `/api/projects/join/details` | sim | — | sim |
| INV-R127 | DELETE | `/api/requirements/:id` | sim | sim | sim |
| INV-R128 | GET | `/api/requirements/:id` | sim | — | sim |
| INV-R129 | PUT | `/api/requirements/:id` | sim | sim | sim |
| INV-R130 | PATCH | `/api/requirements/:id/confirm-completion` | sim | sim | sim |
| INV-R131 | PATCH | `/api/requirements/:id/status` | sim | sim | sim |
| INV-R132 | GET | `/api/requirements/:id/tasks` | sim | — | sim |
| INV-R133 | PUT | `/api/requirements/:id/tasks` | sim | sim | sim |
| INV-R134 | GET | `/api/settings/account` | sim | — | não |
| INV-R135 | POST | `/api/settings/account/deactivate` | sim | sim | sim |
| INV-R136 | DELETE | `/api/settings/account/email-change` | sim | sim | não |
| INV-R137 | POST | `/api/settings/account/email-change` | sim | sim | sim |
| INV-R138 | GET | `/api/settings/account/email-change/confirm` | **pública** | — | sim |
| INV-R139 | GET | `/api/settings/account/email-change/status` | sim | — | não |
| INV-R140 | PATCH | `/api/settings/account/profile` | sim | sim | sim |
| INV-R141 | PATCH | `/api/settings/account/username` | sim | sim | sim |
| INV-R142 | GET | `/api/settings/integrations/github` | sim | — | não |
| INV-R143 | DELETE | `/api/settings/integrations/github-identity` | sim | sim | sim |
| INV-R144 | GET | `/api/settings/integrations/github-identity` | sim | — | não |
| INV-R145 | POST | `/api/settings/integrations/github-identity/link/start` | sim | sim | sim |
| INV-R146 | DELETE | `/api/settings/integrations/github/authorizations/:authorizationId` | sim | sim | sim |
| INV-R147 | GET | `/api/settings/notifications` | sim | — | sim |
| INV-R148 | PUT | `/api/settings/notifications` | sim | sim | sim |
| INV-R149 | DELETE | `/api/settings/privacy/deletion` | sim | sim | sim |
| INV-R150 | GET | `/api/settings/privacy/deletion` | sim | — | não |
| INV-R151 | POST | `/api/settings/privacy/deletion` | sim | sim | sim |
| INV-R152 | POST | `/api/settings/privacy/export` | sim | sim | não |
| INV-R153 | POST | `/api/settings/security/password` | sim | sim | sim |
| INV-R154 | POST | `/api/settings/security/password/initialize` | sim | sim | sim |
| INV-R155 | GET | `/api/settings/security/sessions` | sim | — | não |
| INV-R156 | DELETE | `/api/settings/security/sessions/:sessionId` | sim | sim | sim |
| INV-R157 | POST | `/api/settings/security/sessions/revoke-others` | sim | sim | não |
| INV-R158 | DELETE | `/api/sprints/:id` | sim | sim | sim |
| INV-R159 | GET | `/api/sprints/:id` | sim | — | sim |
| INV-R160 | PUT | `/api/sprints/:id` | sim | sim | sim |
| INV-R161 | GET | `/api/sprints/:id/impact` | sim | — | sim |
| INV-R162 | GET | `/api/sprints/:id/progress` | sim | — | sim |
| INV-R163 | PATCH | `/api/sprints/:id/status` | sim | sim | sim |
| INV-R164 | GET | `/api/sprints/:id/tasks` | sim | — | sim |
| INV-R165 | PUT | `/api/sprints/:id/tasks` | sim | sim | sim |
| INV-R166 | DELETE | `/api/tasks/:id` | sim | sim | sim |
| INV-R167 | GET | `/api/tasks/:id` | sim | — | sim |
| INV-R168 | PUT | `/api/tasks/:id` | sim | sim | sim |
| INV-R169 | GET | `/api/tasks/:id/comments` | sim | — | sim |
| INV-R170 | POST | `/api/tasks/:id/comments` | sim | sim | sim |
| INV-R171 | DELETE | `/api/tasks/:id/comments/:commentId` | sim | sim | sim |
| INV-R172 | PATCH | `/api/tasks/:id/comments/:commentId` | sim | sim | sim |
| INV-R173 | GET | `/api/tasks/:id/commits` | sim | — | sim |
| INV-R174 | POST | `/api/tasks/:id/commits` | sim | sim | sim |
| INV-R175 | DELETE | `/api/tasks/:id/commits/:commitId` | sim | sim | sim |
| INV-R176 | GET | `/api/tasks/:id/issues` | sim | — | sim |
| INV-R177 | POST | `/api/tasks/:id/issues` | sim | sim | sim |
| INV-R178 | DELETE | `/api/tasks/:id/issues/:issueId` | sim | sim | sim |
| INV-R179 | PATCH | `/api/tasks/:id/move` | sim | sim | sim |
| INV-R180 | DELETE | `/api/tasks/:id/pull-request` | sim | sim | sim |
| INV-R181 | PATCH | `/api/tasks/:id/pull-request` | sim | sim | sim |
| INV-R182 | DELETE | `/api/tasks/:id/requirement` | sim | sim | sim |
| INV-R183 | PATCH | `/api/tasks/:id/requirement` | sim | sim | sim |
| INV-R184 | DELETE | `/api/tasks/:id/sprint` | sim | sim | sim |
| INV-R185 | PATCH | `/api/tasks/:id/sprint` | sim | sim | sim |
| INV-R186 | PATCH | `/api/tasks/:id/status` | sim | sim | sim |
| INV-R187 | GET | `/api/tasks/:id/time-entries` | sim | — | sim |
| INV-R188 | POST | `/api/tasks/:id/time-entries` | sim | sim | sim |
| INV-R189 | DELETE | `/api/tasks/:id/time-entries/:entryId` | sim | sim | sim |
| INV-R190 | PATCH | `/api/tasks/:id/time-entries/:entryId` | sim | sim | sim |
| INV-R191 | GET | `/api/tasks/:id/time-entries/history` | sim | — | sim |
| INV-R192 | POST | `/api/tasks/:id/time-entries/start` | sim | sim | sim |
| INV-R193 | POST | `/api/tasks/:id/time-entries/stop` | sim | sim | sim |
| INV-R194 | DELETE | `/api/test-cases/:id` | sim | sim | sim |
| INV-R195 | GET | `/api/test-cases/:id` | sim | — | sim |
| INV-R196 | PUT | `/api/test-cases/:id` | sim | sim | sim |
| INV-R197 | GET | `/api/test-cases/:id/executions` | sim | — | sim |
| INV-R198 | POST | `/api/test-cases/:id/executions` | sim | sim | sim |
| INV-R199 | GET | `/api/test-cases/:id/history` | sim | — | sim |
| INV-R200 | PATCH | `/api/test-cases/:id/status` | sim | sim | sim |
| INV-R201 | GET | `/api/test-cases/:id/tested-references` | sim | — | sim |
| INV-R202 | GET | `/api/test-cases/:id/versions` | sim | — | sim |
| INV-R203 | GET | `/api/test-evidence/:id/content` | sim | — | sim |
| INV-R204 | GET | `/api/test-executions/:id` | sim | — | sim |
| INV-R205 | POST | `/api/webhooks/github-app` | **pública** | não | não |
| INV-R206 | GET | `/health` | **pública** | — | não |
| INV-R207 | GET | `/health/live` | **pública** | — | não |
| INV-R208 | GET | `/health/ready` | **pública** | — | não |
