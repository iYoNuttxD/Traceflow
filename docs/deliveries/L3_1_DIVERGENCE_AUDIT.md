# TRACEFLOW — L3.1 — Auditoria e resolução de divergências

Data da auditoria: 2026-08-15
Branch: `daniel-dev`
Baseline Git auditada: `62f3b4e feat: finalize project invitations members and roles`

## 1. Baseline auditada

A auditoria considerou a implementação acumulada de L1, L2, L1.1, L1.2, L1.2.1,
GenericErrorPage, correção do bootstrap de autenticação e L2.1. Não foram incorporados nem
comparados PR #12, `joao-dev-v2`, Sprint, cronograma, marcos, comentários, esforço ou prioridade.

Domínios cobertos:

- identidade local e GitHub, autenticação, sessões, CSRF, `returnTo` e estados de conta;
- conta, segurança, privacidade, exportação, desativação, reativação, exclusão e anonimização;
- GitHub Identity, GitHub App, instalações, autorizações, repositórios e integração com projetos;
- sincronização assíncrona, branches, commits, pull requests e issues;
- projetos, memberships, papéis, convites e autorização por projeto;
- tratamento de erros, loading, feedback, campos de senha e infraestrutura HTTP do frontend;
- schema Prisma, constraints, índices, migrations, contratos, testes e documentação técnica atual.

O documento oficial do TCC, o roadmap e migrations existentes permaneceram intactos.

## 2. Inventário

| Domínio         | Backend canônico                                                                                 | Persistência                                                      | Frontend                                                                | Testes e contratos principais                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Auth            | `auth.routes/controller/service/repository`, `github-auth.*`, middlewares de autenticação e CSRF | `User`, `Session`, tokens, `GitHubIdentity`, `GitHubOAuthState`   | `AuthContext`, `auth.api`, rotas guest/protected, telas de autenticação | `AuthContext.test.jsx`, `auth-authorization.test.js`, `github-auth-l1-1.test.js`, ADR-002, API_CONTRACTS |
| Account         | `settings.routes/controller/service/repository`                                                  | `User`, `EmailChangeRequest`, `AccountReactivationToken`          | Settings Account/Security                                               | testes settings unit/API, ADR-010                                                                        |
| Security        | middlewares, `settings`, rate limit, logger/redaction                                            | `Session`, `AuditEvent`                                           | `http-client`, Settings Security, `PasswordField`                       | testes de segurança, infraestrutura, settings e auth                                                     |
| Privacy         | `privacy.*`, `settings.*`, jobs de retenção/exclusão                                             | `PrivacyRequest`, `PersonalDataExport`, `AuditEvent`              | Settings Privacy, auditoria pessoal/de projeto                          | `privacy-governance`, settings, ADR-005, docs/privacy                                                    |
| GitHub Identity | `github-auth.*`, `identity-policy`                                                               | `GitHubIdentity`, `GitHubOAuthState`                              | login, integrações, primeira senha e reautenticação                     | testes GitHub auth, L1.1, ADR-004/007                                                                    |
| GitHub App      | `github-app.*`, `github-credential.provider`, callbacks/webhook                                  | instalações, autorizações, integration e connection state         | Settings Integrations, APIs GitHub/settings                             | testes GitHub App/cardinalidade, ADR-009                                                                 |
| Projects/GitHub | `project.*`, `github.routes/controller`, serviços de projeto GitHub                              | `Project`, `ProjectGitHubIntegration`                             | Projects e Repository                                                   | testes E9/API, API_CONTRACTS                                                                             |
| Sync            | `githubSync.service`, serviços em `github/services`, repositórios de branch e run                | `GitHubSyncRun`, `GitBranch`, `Commit`, `CommitBranch`, PR, Issue | RepositoryInfo e polling da API GitHub                                  | testes sync/multibranch e L1.2.1                                                                         |
| Members         | `project-membership.*` e serviço de membership                                                   | `ProjectMembership`                                               | `MembersPanel`, `members.api`                                           | testes auth/authorization e L2.1                                                                         |
| Invitations     | `project-invitation.*` e entrega por e-mail                                                      | `ProjectInvitation`, `AuditEvent`                                 | Members/AcceptInvitation                                                | testes API/unitários e L2.1                                                                              |
| Authorization   | middleware e `authorization.service/repository`                                                  | membership ativa e entidades com `projectId`                      | guards de rota e capacidades retornadas                                 | matriz de autorização, E6 e testes BOLA/RBAC                                                             |
| Error handling  | error middleware, `AppError`, códigos e request ID                                               | sem modelo próprio                                                | `GenericErrorPage`, ErrorBoundary, `FeedbackRegion`, page-error         | testes de infraestrutura, página de erro e settings                                                      |

O fluxo backend observado respeita `Route -> Controller -> Service -> Repository -> Prisma`.
O `architecture:check` não encontrou acesso a Prisma fora das camadas permitidas, regras HTTP em
repository ou dependência de `req`/`res` em services.

## 3. Achados

| ID          | Categoria           | Severidade | Domínio                          | Status                      |
| ----------- | ------------------- | ---------- | -------------------------------- | --------------------------- |
| L3-BUG-001  | BUG                 | MEDIUM     | Privacidade/exportação           | CORRIGIDO                   |
| L3-DIV-002  | DIVERGÊNCIA         | LOW        | GitHub/rate limit                | CORRIGIDO                   |
| L3-DIV-003  | DIVERGÊNCIA         | MEDIUM     | Frontend/settings/error handling | CORRIGIDO                   |
| L3-DIV-004  | DIVERGÊNCIA         | LOW        | Contrato de conta                | CORRIGIDO                   |
| L3-BUG-005  | BUG                 | MEDIUM     | Autenticação/cookies             | CORRIGIDO                   |
| L3-DEBT-006 | DÍVIDA TÉCNICA      | LOW        | Autenticação/middleware          | CORRIGIDO                   |
| L3-BUG-007  | BUG                 | LOW        | Testes concorrentes backend      | CORRIGIDO                   |
| L3-BUG-008  | BUG                 | LOW        | Testes assíncronos frontend      | CORRIGIDO                   |
| L3-LEG-009  | LEGADO REMOVÍVEL    | LOW        | Privacidade backend              | CORRIGIDO                   |
| L3-LEG-010  | LEGADO REMOVÍVEL    | LOW        | GitHub backend                   | CORRIGIDO                   |
| L3-LEG-011  | LEGADO REMOVÍVEL    | LOW        | Privacidade frontend             | CORRIGIDO                   |
| L3-DEBT-012 | DÍVIDA TÉCNICA      | LOW        | APIs frontend                    | ADIADO                      |
| L3-DEBT-013 | DÍVIDA TÉCNICA      | LOW        | Modelo legado                    | MANTIDO POR COMPATIBILIDADE |
| L3-DEBT-014 | DÍVIDA TÉCNICA      | LOW        | Persistência/performance         | ADIADO                      |
| L3-DEBT-015 | DÍVIDA TÉCNICA      | LOW        | Feedback visual                  | ADIADO                      |
| L3-DEC-016  | DECISÃO A CONFIRMAR | INFO       | Convites/estado de conta         | DECISÃO PENDENTE            |
| L3-NP-017   | NÃO É PROBLEMA      | INFO       | Auth/CSRF/sessões                | NÃO É PROBLEMA              |
| L3-NP-018   | NÃO É PROBLEMA      | INFO       | GitHub Identity/App              | NÃO É PROBLEMA              |
| L3-NP-019   | NÃO É PROBLEMA      | INFO       | Sync/multibranch                 | NÃO É PROBLEMA              |
| L3-NP-020   | NÃO É PROBLEMA      | INFO       | Members/invitations/RBAC         | NÃO É PROBLEMA              |
| L3-NP-021   | NÃO É PROBLEMA      | INFO       | Error page/PasswordField         | NÃO É PROBLEMA              |

Não foi encontrada `VIOLAÇÃO ARQUITETURAL`. Não há achado CRITICAL ou HIGH.

### L3-BUG-001

Categoria: BUG
Severidade: MEDIUM
Domínio: Privacidade/exportação
Arquivos: `privacy.controller.js`, `privacy.service.js`, `settings.service.js`

Problema: o download pelo endpoint de compatibilidade validava a exportação existente e depois
chamava `settingsService.exportData`, criando um segundo `PersonalDataExport` para o mesmo download.

Evidência: o controller executava `privacyService.downloadExport` seguido do fluxo que registra uma
nova exportação. O segundo registro não representava uma nova solicitação do titular.

Impacto: histórico e auditoria de exportações com cardinalidade incorreta e evento implícito
duplicado.

Correção: separada a geração pura do ZIP em `buildExportArchive`; a criação registra uma exportação,
e o download validado somente reconstrói o arquivo. `downloadExport` deixou de montar dados que não
eram consumidos.

Teste: API confirma exatamente um `PersonalDataExport` após solicitar e baixar; unitário confirma
que `buildExportArchive` não chama `recordExport`.

Status: CORRIGIDO

### L3-DIV-002

Categoria: DIVERGÊNCIA
Severidade: LOW
Domínio: GitHub/rate limit
Arquivos: `backend/src/app.js`, `backend/test/api/settings-l2.test.js`

Problema: a leitura agregada `GET /api/github/app/repositories` não usava as quotas autenticadas de
leitura, embora as listagens de instalações e repositórios por instalação usassem.

Evidência: ausência do path na lista central protegida por `authenticatedReadBurst` e
`authenticatedReadSustained`.

Impacto: política de rate limit inconsistente entre endpoints equivalentes.

Correção: endpoint agregado incluído na política existente, sem alterar limites.

Teste: duas leituras permitidas e terceira respondendo `429 RATE_LIMITED` no escopo
`authenticated-read-burst` com configuração controlada.

Status: CORRIGIDO

### L3-DIV-003

Categoria: DIVERGÊNCIA
Severidade: MEDIUM
Domínio: Frontend/settings/error handling
Arquivos: Settings Security, Privacy, Integrations e respectivos testes

Problema: falha fatal na carga inicial deixava Security em loading indefinido e permitia que Privacy
ou Integrations renderizassem estado operacional incompleto, divergindo da política já aplicada em
Account e da GenericErrorPage.

Evidência: `load().catch(setError)` não concluía o requisito de dados necessários para renderização;
Security dependia de `account` para sair do loading.

Impacto: repetição do padrão de loading infinito e ações sobre estado incompleto.

Correção: cargas iniciais ganharam estados explícitos de loading/erro e usam
`ContextualErrorPage` embutida com retry exclusivamente acionado pelo usuário. Erros de mutação
continuam inline.

Teste: Security falha uma vez, não fica carregando, faz uma única chamada e recupera após clique;
Privacy e Integrations exibem página contextual em falha fatal.

Status: CORRIGIDO

### L3-DIV-004

Categoria: DIVERGÊNCIA
Severidade: LOW
Domínio: Contrato de conta
Arquivos: `docs/api/API_CONTRACTS.md`, `settings.service.js`

Problema: o contrato de desativação da conta documentava `LAST_PROJECT_OWNER`, mas o fluxo atual
retorna `SOLE_PROJECT_OWNER`, distinguindo corretamente a política global da conta da administração
de membership dentro de um projeto.

Evidência: service, error code e testes concordavam em `SOLE_PROJECT_OWNER`; apenas a tabela atual de
API divergia.

Impacto: consumidor ou homologador poderia implementar/tratar o código errado.

Correção: contrato técnico atual alinhado ao comportamento comprovado. Documentos históricos não
foram reescritos.

Teste: suíte settings/API existente cobre a resposta; revisão estática do contrato.

Status: CORRIGIDO

### L3-BUG-005

Categoria: BUG
Severidade: MEDIUM
Domínio: Autenticação/cookies
Arquivos: `authentication.middleware.js`, `shared-infrastructure.test.js`

Problema: `decodeURIComponent` de um cookie malformado podia lançar `URIError`, transformando uma
sessão ausente/inválida em erro interno 500.

Evidência: o parser decodificava todas as partes sem validar `=` nem isolar falha de percent-encoding.

Impacto: um header controlado pelo cliente podia indisponibilizar o fluxo daquela requisição de
autenticação.

Correção: parser ignora pares inválidos individualmente, preserva cookies válidos e deixa o fluxo
normal tratar sessão ausente.

Teste: cookie válido codificado, fragmento sem separador e valor `%` inválido no mesmo header.

Status: CORRIGIDO

### L3-DEBT-006

Categoria: DÍVIDA TÉCNICA
Severidade: LOW
Domínio: Autenticação/middleware
Arquivos: `authentication.middleware.js`, `shared-infrastructure.test.js`

Problema: rotas protegidas tanto em `app.js` quanto no router de auth podiam autenticar a mesma
requisição duas vezes e repetir a consulta de sessão.

Evidência: a aplicação e `auth.routes.js` aplicam o middleware em rotas sensíveis; o segundo não
reutilizava `req.auth`.

Impacto: leitura redundante de banco em endpoints de sessão e mutação, sem ganho de segurança.

Correção: middleware tornou-se idempotente na mesma requisição e só reaproveita estado quando user e
session já estão completamente resolvidos. A proteção de rota continua presente.

Teste: middleware seguinte chama `next` e não chama `service.authenticate` quando `req.auth` é
completo.

Status: CORRIGIDO

### L3-BUG-007

Categoria: BUG
Severidade: LOW
Domínio: Testes concorrentes backend
Arquivos: `backend/test/api/settings-l2.test.js`

Problema: o teste de navegação concorrente usava `request.agent(app)` com servidor implícito. O
Supertest podia fechar esse servidor quando a primeira resposta terminava e causar `ECONNRESET` nas
demais requisições ainda ativas.

Evidência: a falha foi reproduzida isoladamente em `GET /api/github/app/installations`; a implementação
do Test do Supertest fecha o servidor que ele próprio iniciou após a resposta.

Impacto: falso negativo intermitente no gate, sem resposta HTTP disponível para avaliar.

Correção: o teste sobe explicitamente um servidor efêmero para o bloco concorrente e o fecha em
`finally`. Volume, paralelismo e expectativas foram preservados; mensagens agora identificam o path
em falha.

Teste: cenário isolado e suítes backend completa e integração/API.

Status: CORRIGIDO

### L3-BUG-008

Categoria: BUG
Severidade: LOW
Domínio: Testes assíncronos frontend
Arquivos: `frontend/test/auth/AuthContext.test.jsx`

Problema: `findByTestId` encontrava imediatamente o elemento já montado com texto `Carregando`, antes
da conclusão do bootstrap, tornando expectativas de estado final dependentes de timing.

Evidência: falha reproduzida em `/me` bem-sucedido seguido de `/csrf` 503; o elemento existia, mas a
transição ainda não havia ocorrido.

Impacto: falso negativo intermitente no gate do frontend.

Correção: expectativas de transição aguardam explicitamente o conteúdo final com `waitFor`.

Teste: AuthContext 10/10 e suíte frontend 174/174.

Status: CORRIGIDO

### L3-LEG-009

Categoria: LEGADO REMOVÍVEL
Severidade: LOW
Domínio: Privacidade backend
Arquivos: `privacy.service.js`, `privacy.repository.js`

Problema: implementações antigas de desativar, solicitar exclusão e cancelar exclusão coexistiam com
o fluxo canônico de Settings.

Evidência: zero routes/controllers/produção consumiam esses métodos; os endpoints de compatibilidade
já delegavam a `settingsService`. Testes legítimos validam o contrato pelo fluxo canônico.

Impacto: duas implementações da mesma política de senha, OWNER e lifecycle poderiam divergir.

Correção: removidos somente métodos e helpers sem consumidor. Consultas, exportação, retenção,
anonimização e endpoints de compatibilidade foram preservados.

Teste: suites unitárias, API de privacidade e settings.

Status: CORRIGIDO

### L3-LEG-010

Categoria: LEGADO REMOVÍVEL
Severidade: LOW
Domínio: GitHub backend
Arquivos: `github.service.js`, `github.repository.js`, `github/index.js`

Problema: um facade sem consumidores e helpers pré-atômicos de autorização permaneciam ao lado do
fluxo `authorizeInstallationFromState`.

Evidência: busca de imports, rotas, services, testes legítimos e documentação atual encontrou zero
consumidores. O callback atual consome a operação atômica que valida e usa state dentro da transação.

Impacto: risco de uma futura chamada contornar o consumo atômico do state.

Correção: facade, teste exclusivo da facade e helpers não usados removidos; integração, callback,
webhook, instalações e autorização atômica permanecem.

Teste: testes de GitHub App, repository, cardinalidade, auth e suíte completa.

Status: CORRIGIDO

### L3-LEG-011

Categoria: LEGADO REMOVÍVEL
Severidade: LOW
Domínio: Privacidade frontend
Arquivos: `features/privacy/PrivacyPage.jsx`, wrapper em `pages`, `privacy.api.js`

Problema: página antiga de privacidade e métodos de API duplicavam as telas atuais de Settings.

Evidência: `/account/privacy` redireciona para `/settings/privacy`; não havia import/rota de produção
para a página antiga. Os únicos consumidores restantes de `privacy.api` são auditoria pessoal e de
projeto.

Impacto: dois componentes representando o mesmo produto e possibilidade de manutenção divergente.

Correção: página, wrapper, teste exclusivo do código morto e métodos sem consumidor removidos. Os
endpoints backend de compatibilidade foram mantidos.

Teste: rotas, Settings, privacidade, build e suíte frontend completa.

Status: CORRIGIDO

### L3-DEBT-012

Categoria: DÍVIDA TÉCNICA
Severidade: LOW
Domínio: APIs frontend
Arquivos: facades `projectsApi`/`githubApi` e aliases de listagem de members

Problema: há aliases ativos que representam contratos próximos ou equivalentes.

Evidência: todos possuem consumidores de produção atuais; portanto não atendem o critério de legado
removível.

Impacto: superfície de manutenção maior, sem quebra funcional comprovada.

Correção: nenhuma nesta entrega; requer migração coordenada dos consumidores.

Teste: contratos atuais permanecem cobertos.

Status: ADIADO

### L3-DEBT-013

Categoria: DÍVIDA TÉCNICA
Severidade: LOW
Domínio: Modelo legado
Arquivos: `schema.prisma`, repositories/services consumidores

Problema: `Commit.branch`, aliases GitHub em `Project`, `ProjectMember` e `accessCode` coexistem com
modelos canônicos mais novos.

Evidência: ainda existem fallbacks, endpoints ou consumers de produção/documentação. A relação
canônica multibranch é `CommitBranch`, mas remoção física exige backfill e migration próprios.

Impacto: modelo maior e risco de confundir compatibilidade com fonte canônica.

Correção: nenhuma; campos e dados preservados. A fonte canônica foi registrada no inventário.

Teste: suites E6/E8/E9/GitHub preservadas.

Status: MANTIDO POR COMPATIBILIDADE

### L3-DEBT-014

Categoria: DÍVIDA TÉCNICA
Severidade: LOW
Domínio: Persistência/performance
Arquivos: operações de settings/privacy para validação de projetos com único OWNER

Problema: há contagens de OWNER dentro de loops em operações raras de conta e anonimização.

Evidência: queries por projeto são escopadas e executadas em transações serializáveis, mas podem
crescer linearmente com o número de projetos possuídos.

Impacto: custo potencial em contas proprietárias de muitos projetos; sem incidente ou quebra atual.

Correção: adiada. Uma agregação deve preservar locks e semântica serializável antes de substituir o
fluxo atual.

Teste: concorrência de OWNER e lifecycle de conta permanecem verdes.

Status: ADIADO

### L3-DEBT-015

Categoria: DÍVIDA TÉCNICA
Severidade: LOW
Domínio: Feedback visual
Arquivos: telas frontend fora dos fluxos fatais corrigidos

Problema: ainda existem mensagens/classes históricas em paralelo a `FeedbackRegion` e botões com
estilos herdados.

Evidência: os padrões têm consumidores visíveis e não geram estado impossível comprovado.

Impacto: inconsistência de manutenção e visual de baixa severidade.

Correção: adiada por não ser uma entrega de facelift. Erros fatais comprovados foram corrigidos; erros
de formulário, rate limit e sync continuam inline conforme contrato.

Teste: suíte frontend e build.

Status: ADIADO

### L3-DEC-016

Categoria: DECISÃO A CONFIRMAR
Severidade: INFO
Domínio: Convites/estado de conta
Arquivos: invitation services, account-state middleware e entrega L2.1

Problema: não há evidência suficiente para escolher se um convite deve ser criado quando o endereço
já pertence a conta `DEACTIVATED` ou `DELETION_PENDING`.

Evidência: o comportamento vigente permite criar/enviar, mas bloqueia details/accept/decline até a
conta retornar a `ACTIVE`. A própria especificação L3.1 determina preservar e classificar.

Impacto: eventual e-mail sem ação imediata versus bloqueio antecipado na criação.

Correção: nenhuma; decisão de produto não foi inventada.

Teste: fluxo atual permanece coberto por testes L2.1.

Status: DECISÃO PENDENTE

### L3-NP-017

Categoria: NÃO É PROBLEMA
Severidade: INFO
Domínio: Auth/CSRF/sessões

Problema avaliado: risco de regressão no bootstrap, 401 global, multiaba e estado parcial.

Evidência: bootstrap é sequencial (`/me`, depois `/csrf` somente em 200); probes usam
`skipGlobalAuthHandling`; 401 de visitante não chama CSRF; rede/5xx gera indisponibilidade sem retry
automático; CSRF falho não mantém user parcial. O interceptor global limpa somente códigos canônicos
de sessão 401, nunca `CURRENT_PASSWORD_INVALID`.

Impacto: contratos coerentes com os patches anteriores.

Correção: nenhuma funcional; apenas robustez de cookie e idempotência tratadas em achados próprios.

Teste: AuthContext, http-client, auth API e integração.

Status: NÃO É PROBLEMA

### L3-NP-018

Categoria: NÃO É PROBLEMA
Severidade: INFO
Domínio: GitHub Identity/App

Problema avaliado: identidade por e-mail, confusão Identity/App, state reutilizável, cardinalidade de
instalação e repositório duplicado.

Evidência: login resolve somente `githubUserId`; colisão de e-mail bloqueia takeover; OAuth state é
hashed, expira, é ligado ao propósito/sessão, usa PKCE e tem consumo único. Identity é separada de
instalação/autorização. Há múltiplas instalações/autorizações, e repository ID/full name têm
constraints de exclusividade por integração/projeto. Repositório já ligado continua listável e o
backend responde conflito.

Impacto: desenho atual é coerente e não deve ser simplificado.

Correção: nenhuma além da remoção dos helpers mortos não atômicos.

Teste: GitHub auth/App/cardinality/E9.

Status: NÃO É PROBLEMA

### L3-NP-019

Categoria: NÃO É PROBLEMA
Severidade: INFO
Domínio: Sync/multibranch

Problema avaliado: branch única, perda de lifecycle, sync HTTP longo, duplicação e corrida.

Evidência: commit é canônico por `(projectId, hash)` e branches usam N:N `CommitBranch`; branches só
inativam após listagem completa, reaparecimento incrementa lifecycle e ausência não observada não é
inventada. Head inalterado usa checkpoint; head alterado faz leitura segura e checkpoint avança após
persistência. `GitHubSyncRun.activeProjectId @unique` garante um run ativo por projeto; stale é tratado
após 30 minutos e a proteção em memória é apenas adicional. Frontend faz polling moderado somente
para run ativo, para em status final/unmount e restaura após reload. PR armazena source/target e issues
são repository-wide.

Impacto: contratos de L1.2.1 permanecem consistentes. Queda de processo continua sujeita à janela de
stale; worker distribuído fica fora do escopo.

Correção: nenhuma funcional.

Teste: sync service, branches, multibranch, cardinalidade e páginas de repositório.

Status: NÃO É PROBLEMA

### L3-NP-020

Categoria: NÃO É PROBLEMA
Severidade: INFO
Domínio: Members/invitations/RBAC

Problema avaliado: BOLA/IDOR, papéis divergentes, convite duplicado, membro ativo e último OWNER.

Evidência: enum é `OWNER > MANAGER > MEMBER > VIEWER`; queries sensíveis são escopadas por projeto;
usuário sem membership recebe 404 quando o projeto existe; OWNER administra membros/convites e vê
e-mail completo, demais recebem minimização. Convite duplicado e aceite concorrente são serializáveis,
preservam token/membership única e usam códigos canônicos. Membro ativo bloqueia novo convite. Regra
do último OWNER é serializável e testada sob despromoções concorrentes.

Impacto: sem divergência funcional ou de autorização encontrada.

Correção: nenhuma.

Teste: API de auth/authorization, project invitation/membership e L2.1.

Status: NÃO É PROBLEMA

### L3-NP-021

Categoria: NÃO É PROBLEMA
Severidade: INFO
Domínio: Error page/PasswordField

Problema avaliado: uso indiscriminado da página fatal, ação específica de projetos e senha não
obrigatória marcada como obrigatória.

Evidência: ErrorBoundary e router reutilizam GenericErrorPage contextual; login offline permanece
montado com retry explícito; 401 visitante e 429 não viram erro fatal. `PasswordField` compartilha
toggle, atributo `required` e asterisco inline condicionado a `required`, com CSS centralizado.

Impacto: infraestrutura compartilhada permanece coerente. As três Settings que não podiam funcionar
sem dados iniciais foram alinhadas em L3-DIV-003.

Correção: nenhuma adicional.

Teste: error page, AuthContext, PasswordField e Settings.

Status: NÃO É PROBLEMA

## 4. Decisões a confirmar

### D01 — Convites para conta conhecida não ativa

Comportamento atual: convite pode ser criado para e-mail associado a conta `DEACTIVATED` ou
`DELETION_PENDING`; details, aceite e recusa exigem conta `ACTIVE`.

Evidência: services de convite e middleware de estado de conta, testes L2.1 e instrução explícita da
L3.1.

Pergunta: o produto deve impedir o envio na criação ou preservar a possibilidade de o convite ser
aceito após reativação/cancelamento da exclusão?

Alternativas:

1. manter o comportamento vigente;
2. bloquear criação com um código específico e não enviar e-mail;
3. criar sem entregar e notificar somente após a conta retornar a `ACTIVE`.

Impacto: muda contrato, experiência de convite e política de lifecycle de conta; pode exigir novo
error code, frontend, e-mail e testes.

Recomendação técnica: manter até decisão funcional formal, porque não há risco crítico nem evidência
de violação de autorização no comportamento atual.

## 5. Matriz arquitetural

| Área                  | Resultado          | Evidência/ressalva                                                                                                                     |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Backend architecture  | PASS               | Route/controller/service/repository/Prisma preservados; `architecture:check` verde; legado duplicado removido                          |
| Frontend architecture | PASS COM RESSALVAS | routes/pages/features/shared coerentes; Settings fatais alinhadas; aliases ativos e feedback histórico permanecem como dívida LOW      |
| Persistence           | PASS COM RESSALVAS | constraints, escopo por projeto e transações coerentes; campos legados ativos e queries lineares raras preservados                     |
| External integrations | PASS COM RESSALVAS | contratos GitHub/SMTP e segurança auditados por código/test doubles; nenhuma operação real externa ou homologação manual foi executada |

## 6. Matriz resumida de contratos

| Fluxo                | Endpoint                                       | Service                                  | Persistência                               | Frontend                    | Teste                    | Documento atual       |
| -------------------- | ---------------------------------------------- | ---------------------------------------- | ------------------------------------------ | --------------------------- | ------------------------ | --------------------- |
| Bootstrap de sessão  | `GET /api/auth/me`, depois `/csrf`             | `authService`                            | `Session`, `User`                          | `AuthContext`               | AuthContext + auth API   | ADR-002/API_CONTRACTS |
| Login GitHub         | `/api/auth/github/start/callback`              | `githubAuthService`                      | Identity/OAuthState/Session                | Login/AuthShell             | github-auth L1.1         | L1.1/ADR-004/007      |
| Vincular identidade  | settings GitHub Identity start/callback        | github auth/settings                     | Identity/OAuthState                        | Integrations                | GitHub auth/settings     | API_CONTRACTS         |
| Autorizar GitHub App | installations start/callback                   | `githubAppService`                       | Installation/Authorization/ConnectionState | Integrations/project form   | GitHub App/cardinality   | ADR-009               |
| Conectar repositório | `PUT /projects/:id/github/integration`         | GitHub App/project GitHub                | ProjectGitHubIntegration                   | Project/Repository          | E9/API                   | API_CONTRACTS         |
| Sincronizar          | `POST .../sync`, `GET .../sync/status`         | `githubSyncService` + serviços por etapa | SyncRun/Branch/CommitBranch/artefatos      | RepositoryInfo/polling      | sync + multibranch       | L1.2.1                |
| Listar membros       | `GET /projects/:id/members`                    | membership                               | ProjectMembership/User                     | MembersPanel                | auth-authorization       | L2.1/API_CONTRACTS    |
| Aceitar convite      | `POST /projects/invitations/accept`            | invitation                               | Invitation + Membership + Audit            | AcceptInvitation            | API concorrente/frontend | L2.1/API_CONTRACTS    |
| Alterar papel/OWNER  | PATCH/DELETE/reactivate/transfer               | membership                               | Membership em transação serializável       | MembersPanel                | autorização/concorrência | ADR-003/L2.1          |
| Lifecycle da conta   | settings deactivate/deletion/reactivation      | settings                                 | User/Session/PrivacyRequest/Audit          | Settings/Restricted         | settings/privacy         | ADR-010               |
| Exportar dados       | settings export e endpoints de compatibilidade | settings/privacy                         | PersonalDataExport/Audit                   | Privacy Settings            | unit/API                 | ADR-005/API_CONTRACTS |
| Erro fatal           | ErrorBoundary/router/carregamento essencial    | contrato HTTP sanitizado                 | requestId quando disponível                | GenericErrorPage contextual | error page/settings      | FRONTEND_STRUCTURE    |

Não foram encontrados endpoints de compatibilidade seguros de remover além do código interno listado
como legado. `POST /api/projects/:projectId/members`, access code e endpoints antigos de conta ainda
possuem consumers/contratos e foram mantidos.

## 7. HTTP status e error codes

| Código/grupo                                                    | HTTP                            | Consumer frontend                                          | Resultado da auditoria                                                       |
| --------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `AUTHENTICATION_REQUIRED`, `SESSION_INVALID`, `SESSION_EXPIRED` | 401                             | interceptor global e AuthContext; probes tratam localmente | somente estes podem limpar sessão global                                     |
| `CURRENT_PASSWORD_INVALID`                                      | 403                             | formulários/settings                                       | permanece inline e não encerra sessão                                        |
| `FORBIDDEN`                                                     | 403                             | contexto de página ou feedback conforme recurso            | autorização de projeto usa 404 para não membro e 403 para papel insuficiente |
| `RESOURCE_NOT_FOUND`/`PROJECT_NOT_FOUND`                        | 404                             | página contextual quando fatal                             | não vaza existência para usuário sem membership                              |
| `LAST_PROJECT_OWNER`                                            | 409                             | MembersPanel/ações de projeto                              | membership/transferência/saída                                               |
| `SOLE_PROJECT_OWNER`                                            | 409                             | Settings Account/Privacy                                   | operação global de conta; documentação corrigida                             |
| códigos `INVITATION_*`/`PROJECT_MEMBER_ALREADY_EXISTS`          | 400/403/409/410 conforme estado | convite/Members                                            | estados finais e duplicação são distinguidos por código                      |
| `RATE_LIMITED`                                                  | 429 + `Retry-After`             | feedback/cooldown inline                                   | não vira página fatal; endpoint agregado GitHub alinhado                     |
| `GITHUB_RATE_LIMITED`/`EXTERNAL_SERVICE_ERROR`                  | 429/502-504 conforme mapeamento | sync/integração                                            | mensagens sanitizadas, sem token/payload bruto                               |
| `INTERNAL_ERROR`                                                | 500                             | GenericErrorPage somente se página não prossegue           | resposta sanitizada com requestId; stack não exposta                         |

Não foi encontrado o mesmo código canônico produzido com statuses conflitantes nos fluxos em escopo.

## 8. Matriz de rotas e RBAC por projeto

| Operação                                                     | Papel mínimo/condição                               |
| ------------------------------------------------------------ | --------------------------------------------------- |
| leitura comum de projeto, requisitos, tarefas e artefatos    | VIEWER ativo                                        |
| mutação comum do domínio                                     | MEMBER ativo                                        |
| sync GitHub manual                                           | MANAGER ativo + e-mail verificado                   |
| listar/criar/revogar convite                                 | OWNER ativo; criação exige e-mail verificado        |
| alterar/desativar/reativar membership e transferir ownership | OWNER ativo                                         |
| conectar GitHub e alterar sync settings                      | OWNER ativo + e-mail verificado quando aplicável    |
| atualizar projeto                                            | OWNER ativo                                         |
| sair do projeto                                              | qualquer membership ativa, preservando último OWNER |

Papéis canônicos em Prisma, backend, frontend e docs: `OWNER`, `MANAGER`, `MEMBER`, `VIEWER`.
Membership inativa não autoriza. Identificadores de membership/invitation são novamente escopados ao
`projectId` no repository/service; os testes cobrem BOLA entre projetos.

## 9. Banco, cardinalidades, constraints e migrations

| Relação/regra                | Implementação auditada                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| User ↔ GitHubIdentity        | 1:0..1, `userId` e `githubUserId` únicos                                                |
| User ↔ Session               | 1:N, token/public ID únicos; índices de user e expiração                                |
| User ↔ Project               | N:N por `ProjectMembership`, unique `(projectId,userId)`                                |
| Project ↔ Invitation         | 1:N; índices por project/e-mail/expiração; duplicação ativa protegida transacionalmente |
| Installation ↔ User          | N:N por `GitHubInstallationAuthorization`, unique `(installationId,userId)`             |
| Project ↔ GitHub integration | 1:0..1; repository ID/full name exclusivos                                              |
| Project ↔ GitBranch          | 1:N, unique `(projectId,name)`; lifecycle preservado                                    |
| Commit ↔ GitBranch           | N:N por `CommitBranch`, PK composta `(commitId,branchId)`                               |
| Project ↔ sync ativo         | `activeProjectId @unique` somente para QUEUED/RUNNING; concluído libera chave           |
| Commit canônico              | unique `(projectId,hash)`                                                               |

- Schema alterado: não.
- Migration nova: não necessária.
- Migrations existentes: 33, todas aplicadas; nenhuma migration histórica foi editada.
- `prisma format`, `validate`, `generate` e `migrate status`: PASS.
- Banco de desenvolvimento: não resetado nem limpo.
- Banco de teste isolado: validado como `traceflow_test`; limpezas ocorreram somente por fixtures de
  teste. Auditoria E8 após os testes reportou zero registros residuais e zero inconsistências.
- Dados persistidos da baseline: preservados.

## 10. Segurança

Resultado: **PASS COM RESSALVAS**.

Controles confirmados:

- autenticação server-side, cookie HttpOnly, expiração/revogação/sessionVersion e `rememberMe`;
- CSRF ligado à sessão, estável entre abas e exigido em mutações;
- OAuth state hashed, PKCE, purpose, expiração, sessão e consumo único;
- GitHub Identity resolvida por ID externo, nunca por coincidência de e-mail;
- autorização por membership ativa e escopo de projeto, com BOLA/IDOR cobertos;
- último OWNER e convites concorrentes protegidos por transação serializável;
- validação de input, mass-assignment limitado por schemas e respostas de erro sanitizadas;
- tokens, secrets, payload bruto e stack não são registrados/expostos;
- rate limits por categoria com `Retry-After` e chaves autenticadas apropriadas;
- `npm audit`: zero vulnerabilidades em backend e frontend;
- scanner de secrets: 297 arquivos, PASS.

Ressalvas: integrações reais GitHub/SMTP não foram acionadas nesta auditoria e rate limiting/worker
continuam com a topologia atualmente documentada do processo. Isso não representa divergência nova,
mas deve ser validado operacionalmente na homologação completa.

## 11. Código legado

### Removido com prova de consumidores zerados

- métodos antigos de mutação de conta em `privacy.service/repository`; endpoints compatíveis continuam
  delegando ao settings canônico;
- facade `github.service`, export e teste exclusivo sem consumer;
- helpers GitHub não atômicos anteriores a `authorizeInstallationFromState`;
- PrivacyPage antiga, wrapper, teste exclusivo e métodos frontend de API sem consumer.

### Mantido por compatibilidade ativa

- `Commit.branch` enquanto fallbacks e migration de retirada não forem definidos;
- aliases GitHub persistidos em `Project`;
- `ProjectMember`, `accessCode`, join e `POST /projects/:projectId/members`;
- endpoints de conta/privacidade anteriores ainda documentados e testados;
- APIs antigas de instalação/repositório ainda consumidas.

### Candidatos futuros

- migrar consumers para uma única facade frontend por domínio;
- planejar backfill/retirada incremental de `Commit.branch` e demais aliases somente em entrega de
  schema específica;
- agregar consultas de sole-owner sem perder os locks e a atomicidade existentes;
- consolidar feedback visual restante sem facelift acoplado a correções funcionais.

## 12. Performance e concorrência

- Nenhum loop/retry automático foi encontrado no AuthContext; refreshes concorrentes são coalescidos.
- GET dedupe continua escopado à sessão HTTP e não mascara mutações.
- Polling de sync usa intervalo moderado, restaura run ativo e é cancelado em estado final/unmount.
- Sync evita reler branch com head inalterado, deduplica commits canônicos e preserva todos os links de
  branch; mudança de head não presume fast-forward.
- Exclusão mútua do sync é persistida no banco; Set em memória não é a única proteção.
- Convite duplicado, aceite e último OWNER permanecem serializáveis e cobertos por concorrência.
- A única otimização adiada é a contagem por projeto em fluxos raros de conta, por exigir prova de
  equivalência de locking.
- O teste de navegação concorrente foi estabilizado sem reduzir concorrência, conforme L3-BUG-007.

## 13. Testes

### Alterações de proteção

Adicionados/atualizados:

- exportação compatível cria exatamente um registro e geração do ZIP não persiste outro;
- listagem agregada de repositórios recebe rate limit autenticado;
- cookies malformados não causam erro interno;
- autenticação já resolvida não repete consulta na mesma requisição;
- falhas fatais iniciais de Settings usam estado contextual e retry explícito;
- harness concorrente usa servidor explícito e diagnóstico por endpoint;
- testes AuthContext aguardam a transição observável, não apenas a existência do nó.

Removidos:

- teste exclusivo de `github.service` removido junto com a facade sem consumer;
- teste exclusivo da PrivacyPage inacessível removido junto com o componente. A cobertura dos fluxos
  vigentes permanece em Settings, privacidade, rotas e APIs.

Resultados finais com Node `v22.23.2`:

| Suite                   | Resultado                     |
| ----------------------- | ----------------------------- |
| Backend completa        | 47 arquivos, 330 testes, PASS |
| Backend unit            | 34 arquivos, 192 testes, PASS |
| Backend integration/API | 13 arquivos, 138 testes, PASS |
| Frontend completa       | 32 arquivos, 174 testes, PASS |

Cobertura backend:

- Statements: 87,47% (3792/4335)
- Branches: 73,76% (2024/2744)
- Functions: 90,12% (1013/1124)
- Lines: 89,78% (3541/3944)

Cobertura frontend:

- Statements: 58,69% (1704/2903)
- Branches: 57,50% (1280/2226)
- Functions: 49,35% (462/936)
- Lines: 60,05% (1601/2666)

O backend mantém todos os thresholds configurados. O frontend não define thresholds no gate atual; a
cobertura não foi reduzida artificialmente nem foram adicionados testes sem valor para elevar números.

Nota de execução: o ambiente do host usa Node 26, enquanto o projeto é validado com Node 22. Os gates
finais foram executados com Node `v22.23.2`. Um timeout transitório apareceu uma vez no gate separado
de integração, o cenário isolado concluiu em 118 ms e o gate integral repetido passou 138/138. O
`ECONNRESET` determinístico do harness concorrente foi reproduzido, explicado e corrigido no achado
L3-BUG-007.

## 14. Gates

| Gate                                         | Resultado                        |
| -------------------------------------------- | -------------------------------- |
| Prisma format/validate/generate              | PASS                             |
| Prisma migrate status (dev e teste)          | PASS — 33 migrations aplicadas   |
| Backend lint                                 | PASS                             |
| Backend format:check                         | PASS                             |
| Backend architecture:check                   | PASS                             |
| Backend test / unit / integration / coverage | PASS                             |
| Backend security:secrets                     | PASS — 297 arquivos              |
| Auditoria E8 read-only no DB de teste        | PASS                             |
| Backend npm audit                            | PASS — 0 vulnerabilidades        |
| Frontend lint                                | PASS                             |
| Frontend format:check                        | PASS                             |
| Frontend test / coverage                     | PASS                             |
| Frontend build                               | PASS — 373 módulos transformados |
| Frontend npm audit                           | PASS — 0 vulnerabilidades        |
| `git diff --check`                           | PASS                             |

Testes de browser, homologação visual responsiva, GitHub/SMTP reais e Work QA manual não fazem parte da
evidência desta execução. Gates automatizados não substituem essa homologação futura.

## 15. Conclusão e prontidão

Resumo quantitativo:

- 21 achados classificados;
- 4 BUG, 3 DIVERGÊNCIA, 5 DÍVIDA TÉCNICA, 3 LEGADO REMOVÍVEL, 1 DECISÃO A
  CONFIRMAR e 5 NÃO É PROBLEMA;
- severidades: 3 MEDIUM, 12 LOW e 6 INFO; nenhuma HIGH/CRITICAL;
- 11 achados corrigidos;
- 3 dívidas adiadas, 1 item mantido por compatibilidade e 1 decisão pendente;
- nenhuma violação arquitetural e nenhum bug bloqueador conhecido remanescente.

**BASELINE PRONTA PARA L4.1.**

A decisão D01 não bloqueia a consolidação porque o comportamento vigente é consistente, testado e foi
explicitamente preservado. L4.1 deve preparar a operação/homologação sem incorporar silenciosamente a
decisão de produto pendente. A Work QA posterior ainda deve executar validação manual e integrações
reais antes de aprovar a entrega funcional completa.
