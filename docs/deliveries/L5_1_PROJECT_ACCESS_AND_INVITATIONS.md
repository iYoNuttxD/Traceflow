# L5.1 — Consolidação de ingresso em projetos e convites pessoais

Data de conclusão: 16/08/2026
Branch: `daniel-dev`
Baseline inicial: `c7ec327acc24698a982447ee74fe4037c08614bd`

## 1. Resumo executivo

**L5.1 concluída tecnicamente e pronta para homologação manual focada.**

O ingresso compartilhável passou a usar uma capability criptograficamente forte, com perfil
`MEMBER` ou `VIEWER` definido pelo projeto e identidade derivada exclusivamente da sessão. O UC05
passou a possuir listagem pessoal de convites pendentes e respostas autenticadas por ID, sem
depender do token bruto entregue por e-mail.

Não houve remoção de dados, tabelas ou campos legados. Uma migration nova foi aplicada aos bancos
de desenvolvimento e teste. As 34 migrations estão aplicadas. A homologação visual H-L5-01–12 não
foi executada porque nenhum navegador estava conectado à sessão; os resultados automatizados não
foram usados como substitutos de aceitação manual.

## 2. UC05 — convites pessoais

Foram adicionados os contratos:

- `GET /api/projects/invitations/mine`;
- `POST /api/projects/invitations/:invitationId/accept`;
- `POST /api/projects/invitations/:invitationId/decline`.

A listagem retorna somente convites `PENDING`, não expirados e destinados ao e-mail normalizado do
usuário autenticado. O DTO contém somente ID, projeto, perfil e datas públicas. Não contém token,
hash ou identificadores internos desnecessários.

Aceite e recusa por ID verificam simultaneamente o destinatário, a conta autenticada e o estado do
convite. Um ID pertencente a outro usuário retorna `404` opaco. Os fluxos por ID e por token
reutilizam o mesmo núcleo de domínio. O aceite continua sendo uma transação serializável de claim do
convite e criação/reativação da `ProjectMembership`; a concorrência entre dashboard e token termina
com uma membership e um único claim bem-sucedido.

Na página `/projects`, a área **Meus convites pendentes** permite aceitar e recusar, apresenta estado
vazio e oferece **Abrir projeto** após o aceite. O envio de convites pelo OWNER permanece separado na
área interna do projeto.

## 3. Código e link de acesso

- Cada projeto possui um único `accessCode` não nulo e único.
- A geração canônica usa `node:crypto.randomBytes(16)`, totalizando 128 bits de entropia, no formato
  `TRC-` seguido de 32 dígitos hexadecimais.
- `accessCodeRole` usa o enum canônico `ProjectRole`, default `MEMBER`, com constraint de banco que
  restringe o valor a `MEMBER` ou `VIEWER`.
- Criação comum e criação via GitHub reutilizam `buildProjectAccessData()`; não há geradores
  duplicados.
- O link é reconstruído com o `FRONTEND_URL` atual e o código ativo.
- `POST /api/projects/:projectId/access-code/regenerate` troca atomicamente o único campo ativo. Em
  concorrência, somente o último valor persistido permanece válido.
- `PATCH /api/projects/:projectId/access-code` altera somente ingressos futuros e nunca modifica
  memberships existentes.
- `GET /api/projects/:projectId/access-code` é OWNER-only. DTOs gerais de criação, listagem,
  detalhes e atualização não retornam código, papel do código ou link.

O fluxo `/join/:accessCode` primeiro consulta `GET /api/projects/join/details`, que retorna apenas
nome/ID do projeto e perfil. A confirmação envia somente `{accessCode}` para `POST
/api/projects/join`. Nome, e-mail e papel enviados pelo cliente são rejeitados pelo schema estrito.

Membership ativa retorna conflito amigável sem alterar o papel. Membership inativa não é reativada
pelo código, preservando a política atual em que a reativação depende de OWNER. Novos ingressos
gravam somente `ProjectMembership` associada ao `User.id`.

## 4. Segurança e autorização

| Operação                               |                  OWNER |                MANAGER |                 MEMBER |                 VIEWER | Proteções adicionais                           |
| -------------------------------------- | ---------------------: | ---------------------: | ---------------------: | ---------------------: | ---------------------------------------------- |
| Ver código/configuração                |                    Sim |                    Não |                    Não |                    Não | sessão, conta ACTIVE, limiter de leitura       |
| Regenerar código                       |                    Sim |                    Não |                    Não |                    Não | e-mail verificado, CSRF, limiter sensível      |
| Alterar perfil do código               |                    Sim |                    Não |                    Não |                    Não | e-mail verificado, CSRF, limiter sensível      |
| Consultar detalhes e entrar por código | Se ainda não participa | Se ainda não participa | Se ainda não participa | Se ainda não participa | sessão, conta ACTIVE, limiter de join          |
| Listar meus convites                   |                    Sim |                    Sim |                    Sim |                    Sim | destinatário derivado da sessão                |
| Aceitar/recusar meu convite            |                    Sim |                    Sim |                    Sim |                    Sim | CSRF, conta ACTIVE, limiter sensível, ID opaco |

Confirmações explícitas:

- o cliente não escolhe o papel da membership;
- `OWNER` e `MANAGER` não podem ser obtidos por código;
- a identidade vem exclusivamente de `req.auth.user.id`;
- o código não é incluído em logs, auditoria, erros ou metadados;
- a auditoria registra somente os eventos `PROJECT_ACCESS_CODE_REGENERATED`,
  `PROJECT_ACCESS_CODE_ROLE_CHANGED` e `PROJECT_JOINED_BY_ACCESS_CODE`, com IDs e papel não
  sensível;
- código inválido não revela projeto, histórico do código ou momento de regeneração;
- parsing de links no frontend aceita somente a origem atual e o caminho `/join/<código>`, sem
  navegação ou redirect para URL arbitrária.

O join segue a política colaborativa já existente: aceitar convite por token não exigia e-mail
verificado, portanto o ingresso por código também não inventa essa diferença. Mutations OWNER-only
da configuração continuam exigindo verificação de e-mail.

## 5. Banco, migration e backfill

Foi criada somente a migration nova:

`20260815230000_l5_1_project_access_invitations`

Ela:

1. adiciona `accessCodeRole` com default `MEMBER`;
2. gera códigos de 128 bits no próprio MySQL com `RANDOM_BYTES(16)`;
3. torna `accessCode` obrigatório;
4. adiciona constraint para `MEMBER`/`VIEWER`;
5. limpa links materializados antigos para que sejam reconstruídos com a origem e o código atuais.

Todos os códigos anteriores foram rotacionados uma vez. A rotação foi necessária porque a baseline
legada admitia valores nulos e geração previsível com `Math.random()`, incompatível com o tratamento
do código como capability secret. Como consequência intencional, links antigos deixam de funcionar.

Snapshot read-only após o backfill no banco de desenvolvimento:

| Métrica                  | Resultado |
| ------------------------ | --------: |
| Projetos                 |        11 |
| Códigos únicos           |        11 |
| Códigos no formato forte |        11 |
| Papéis inválidos         |         0 |
| Memberships órfãs        |         0 |
| Convites órfãos          |         0 |

Prisma encontrou 34 migrations e declarou os bancos de desenvolvimento e teste atualizados. A
aplicação integral das migrations em banco vazio também passou. Nenhuma migration histórica foi
editada.

## 6. UX

### `/projects`

- card de entrada rápida por código ou link interno;
- navegação para a confirmação em `/join/:accessCode`;
- área de convites pessoais com aceite, recusa, estado vazio e abertura do projeto aceito.

### Overview do projeto

- OWNER vê o código inicialmente, pode mostrar/ocultar, copiar o link, regenerar após confirmação e
  escolher `Membro` ou `Visualizador`;
- não OWNER não solicita nem recebe a configuração sensível;
- feedback de cópia: `Link de acesso copiado.`;
- controles responsivos dentro do grid existente.

### Membros e convites enviados

- cards apresentam identidade, username, e-mail conforme autorização, data de entrada, perfil
  localizado e badge de estado;
- select de perfil possui label próprio e não fica espremido na identidade;
- ações de desativação e saída usam confirmação e hierarquia danger compacta;
- a restrição do último OWNER permanece visível e impede alteração, desativação ou saída;
- formulário de convite usa campos E-mail/Perfil e empilha em viewport pequena.

## 7. Compatibilidade legada

- `ProjectMember`, `Project.accessCode` e `Project.inviteLink` foram preservados.
- O alias interno antigo de geração de convite aponta para o builder canônico.
- Endpoints antigos de convite por token permanecem funcionais.
- A rota legada de administração de `ProjectMember` não foi removida.
- Novos ingressos não fazem dual-write: `ProjectMembership` é a autoridade canônica.
- Membership inativa não é reativada por código e continua sob o fluxo OWNER existente.

## 8. Testes e gates

Ambiente suportado: Node `22.23.2`, alinhado ao workflow de CI.

### Backend

| Gate                                      | Resultado                                                          |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Testes focados L5.1 + regressões críticas | 7 arquivos, 111 testes, PASS                                       |
| `npm test`                                | 49 arquivos, 356 testes, PASS                                      |
| `test:unit`                               | 35 arquivos, 207 testes, PASS                                      |
| `test:integration`                        | 14 arquivos, 149 testes, PASS                                      |
| `test:coverage`                           | 356 testes, PASS                                                   |
| Coverage                                  | 88,13% statements; 74,47% branches; 90,79% functions; 90,53% lines |
| Prisma format/validate/generate/status    | PASS; 34 migrations                                                |
| Banco vazio / migrations                  | PASS                                                               |
| Lint / Prettier / arquitetura             | PASS                                                               |
| Secret scan                               | PASS; 308 arquivos                                                 |
| E8 audit/reconcile/contract read-only     | PASS                                                               |
| E11 legado e E6 backfill dry-run          | PASS                                                               |
| Política de CI e dependency audit         | PASS                                                               |
| `npm audit`                               | 0 vulnerabilidades                                                 |

### Frontend

| Gate                         | Resultado                                                          |
| ---------------------------- | ------------------------------------------------------------------ |
| Testes focados               | 4 arquivos, 32 testes, PASS                                        |
| `npm test`                   | 33 arquivos, 184 testes, PASS                                      |
| `test:coverage`              | 184 testes, PASS                                                   |
| Coverage                     | 61,02% statements; 58,63% branches; 51,68% functions; 62,27% lines |
| Lint / Prettier              | PASS                                                               |
| Build Vite                   | PASS; 380 módulos transformados                                    |
| Política de dependency audit | PASS                                                               |
| `npm audit`                  | 0 vulnerabilidades                                                 |

As regressões novas cobrem geração comum/GitHub, backfill, unicidade, regeneração concorrente,
papéis `MEMBER`/`VIEWER`, bloqueio de `OWNER`/`MANAGER`, identity spoofing, memberships ativa e
inativa, conta restrita, personal invitations, opacidade cross-user, estados não pendentes,
concorrência token/ID, parsing seguro, UI OWNER/não OWNER, confirmação, cópia e UX de membros.

### Flakiness observada

Duas execuções completas no Node local `26.7.0`, fora da versão suportada pela CI, apresentaram
falhas transitórias distintas: uma criação antiga de projeto sem resposta útil e um sync GitHub
artificial em estado `FAILED`. Ambos os arquivos passaram isoladamente. O MySQL registrava zero
conexões abortadas. Na versão oficial Node 22, a suíte completa, unitária, de integração e coverage
passou integralmente. A ocorrência foi classificada como divergência do runtime local, sem
reprodução na baseline suportada; nenhum retry foi adicionado aos testes.

## 9. Homologação manual focada

| Cenário           | Resultado     | Evidência                                       |
| ----------------- | ------------- | ----------------------------------------------- |
| H-L5-01 a H-L5-12 | NÃO EXECUTADO | nenhum navegador disponível/conectado na sessão |

Esta seção permanece pendente de um Work QA com navegador real. Testes DOM/API não equivalem a
homologação visual ou exploratória.

## 10. Git

Nenhum commit, push, branch, PR, merge, rebase ou reset foi executado. Os dois PDFs não rastreados
que já existiam no início da entrega permaneceram intocados.

`git diff --check`: PASS.

```text
 M backend/prisma/schema.prisma
 M backend/src/app.js
 M backend/src/modules/authorization/authorization.service.js
 M backend/src/modules/projects/project-invitation.controller.js
 M backend/src/modules/projects/project-invitation.repository.js
 M backend/src/modules/projects/project-invitation.validation.js
 M backend/src/modules/projects/project.controller.js
 M backend/src/modules/projects/project.repository.js
 M backend/src/modules/projects/project.routes.js
 M backend/src/modules/projects/project.schema.js
 M backend/src/modules/projects/project.service.js
 M backend/src/modules/projects/project.validation.js
 M backend/src/modules/projects/services/project-crud.service.js
 M backend/src/modules/projects/services/project-github.service.js
 M backend/src/modules/projects/services/project-invitation.service.js
 M backend/src/modules/projects/services/project-invite.service.js
 M backend/src/modules/projects/services/project-members.service.js
 M backend/src/shared/errors/error-codes.js
 M backend/src/shared/validation/common.schemas.js
 M backend/test/api/mvp-contracts.test.js
 M backend/test/api/privacy-governance.test.js
 M backend/test/api/projects-github-e9.test.js
 M backend/test/integration/e11-legacy-responsibility.test.js
 M backend/test/integration/e6-backfill.test.js
 M backend/test/integration/e8-reconciliation.test.js
 M backend/test/integration/github-cardinality.test.js
 M backend/test/integration/github-multibranch.test.js
 M backend/test/unit/e6-continuation.test.js
 M docs/api/API_CONTRACTS.md
 M docs/security/AUTHORIZATION_MATRIX.md
 M frontend/src/features/members/ProjectMembersPanel.jsx
 M frontend/src/features/members/members.api.js
 M frontend/src/features/projects/api/projects.api.js
 M frontend/src/features/projects/pages/ProjectDetailsScreen.jsx
 M frontend/src/features/projects/pages/ProjectsScreen.jsx
 M frontend/src/pages/JoinProjectPage.jsx
 M frontend/src/styles/global.css
 M frontend/test/features/ProjectMembersPanel.test.jsx
 M frontend/test/pages/ProjectDetailsPage.test.jsx
 M frontend/test/pages/ProjectsPage.test.jsx
?? "BES_TCC_Proposta de Desenvolvimento de Ferramenta_v2023 Somativa 2.pdf"
?? OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf
?? backend/prisma/migrations/20260815230000_l5_1_project_access_invitations/
?? backend/src/modules/projects/project-access-code.controller.js
?? backend/src/modules/projects/project-access-code.repository.js
?? backend/src/modules/projects/services/project-access-code.service.js
?? backend/src/shared/identity/
?? backend/test/api/project-access-l5-1.test.js
?? backend/test/unit/l5-project-access-schema.test.js
?? docs/deliveries/L5_1_PROJECT_ACCESS_AND_INVITATIONS.md
?? frontend/src/features/invitations/
?? frontend/src/features/projects/components/ProjectAccessCodePanel.jsx
?? frontend/src/features/projects/components/ProjectJoinCard.jsx
?? frontend/src/features/projects/services/
?? frontend/test/pages/ProjectAccessFlows.test.jsx
```

Mensagem de commit sugerida:

```text
feat: consolidate project access codes and personal invitations
```
